import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { lerCredencial } from "./credencial.js";
import { normalizar, tempoParaData, extrairBairro, extrairTamanho, nomeExcluido, mediana } from "./enriquecer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const DIR_COLETAS = path.join(__dirname, "dados", "coletas");
const CATALOGO_PATH = path.join(ROOT_DIR, "dados", "catalogo-sefaz.json");
const CHAVE_PATH = path.join(__dirname, "serviceAccountKey.json");
const PROJETO_ESPERADO = "precoai-sistema";
const TAMANHO_LOTE = 450;

function argumentos() {
  return Object.fromEntries(process.argv.slice(2).map((arg) => {
    const [chave, ...valor] = arg.replace(/^--/, "").split("=");
    return [chave, valor.join("=") || true];
  }));
}

function hashId(valor) {
  return crypto.createHash("sha256").update(String(valor)).digest("hex").slice(0, 32);
}

function dataValida(valor, fallback) {
  const data = valor ? new Date(valor) : new Date(fallback || Date.now());
  return Number.isNaN(data.getTime()) ? new Date() : data;
}

function coordenadasValidas(latitude, longitude) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { latitude: lat, longitude: lon };
}

function extrairMunicipio(endereco = "") {
  const texto = String(endereco);
  const match = texto.match(/\b(MANAUS|IRANDUBA|MANACAPURU|ITACOATIARA|PRESIDENTE FIGUEIREDO|RIO PRETO DA EVA|CAREIRO|AUTAZES|PARINTINS)\s*-\s*AM\b/i);
  return match ? match[1].toLowerCase().replace(/\b\w/g, (letra) => letra.toUpperCase()) : "Manaus";
}

function carregarColetas(filtroProduto) {
  if (!fs.existsSync(DIR_COLETAS)) {
    throw new Error(`Pasta de coletas não encontrada: ${DIR_COLETAS}`);
  }

  const arquivos = fs.readdirSync(DIR_COLETAS)
    .filter((nome) => nome.toLowerCase().endsWith(".json"))
    .filter((nome) => nome.toLowerCase() !== "resumo-ultima-coleta.json")
    .filter((nome) => !filtroProduto || path.basename(nome, ".json") === filtroProduto);

  if (!arquivos.length) {
    throw new Error(filtroProduto
      ? `Não existe JSON de coleta para o produto "${filtroProduto}". Execute a coleta antes.`
      : "Nenhum JSON de produto encontrado. Execute o coletor SEFAZ-AM antes.");
  }

  return arquivos.map((arquivo) => {
    const caminho = path.join(DIR_COLETAS, arquivo);
    const dados = JSON.parse(fs.readFileSync(caminho, "utf8"));
    if (!dados.produtoId || !Array.isArray(dados.resultados)) {
      throw new Error(`Formato inválido no arquivo ${arquivo}.`);
    }
    return dados;
  });
}

function carregarCatalogo() {
  const catalogo = JSON.parse(fs.readFileSync(CATALOGO_PATH, "utf8"));
  return new Map(catalogo.produtos.map((p) => [p.id, p]));
}

const arredondar = (n) => Math.round(n * 100) / 100;

// Enriquece cada item: data real da nota, bairro, tamanho da embalagem e preço por kg/litro.
// Descarta descrições que não são produto (ADICIONAL, PORÇÃO...) e preços fora da faixa (outliers).
function prepararItens(coleta, meta, maxDias) {
  const unidade = meta.unidadeComparacao || "un";
  const base = dataValida(coleta.consultadoEm);
  const itens = [];
  const descartes = { nome: 0, outlier: 0, antigo: 0 };

  for (const item of coleta.resultados) {
    const preco = Number(item.preco);
    if (!Number.isFinite(preco) || preco <= 0) continue;
    if (nomeExcluido(item.nomeEncontrado || "")) { descartes.nome++; continue; }
    const coletadoEm = dataValida(item.consultadoEm, base);
    const emitidoEm = tempoParaData(item.tempoDesdeEmissao, coletadoEm) || coletadoEm;
    // Só entram notas dos últimos N dias (o que passa disso é apagado do Firestore pelo limpar-antigos.js).
    if (Date.now() - emitidoEm.getTime() > maxDias * 864e5) { descartes.antigo++; continue; }
    const quantidade = extrairTamanho(item.nomeEncontrado || "", unidade);
    itens.push({
      ...item, preco, coletadoEm, emitidoEm, quantidade,
      precoReferencia: quantidade ? arredondar(preco / quantidade) : null
    });
  }

  const med = mediana(itens.filter((i) => i.precoReferencia).map((i) => i.precoReferencia));
  const confirmados = itens.filter((i) => i.precoReferencia).length;
  if (med && confirmados >= 5) {
    return {
      itens: itens.filter((i) => {
        const ok = !i.precoReferencia || (i.precoReferencia >= med * 0.4 && i.precoReferencia <= med * 2.5);
        if (!ok) descartes.outlier++;
        return ok;
      }),
      descartes, unidade
    };
  }
  return { itens, descartes, unidade };
}

function montarPlano(coletas, catalogo, limitePrecos = 0, maxDias = 7) {
  const produtos = new Map();
  const estabelecimentos = new Map();
  const resumo = new Map();
  const precos = [];
  const vistos = new Set();
  const descartes = { nome: 0, outlier: 0, antigo: 0 };

  for (const coleta of coletas) {
    if (!coleta.resultados.length) continue;
    const meta = catalogo.get(coleta.produtoId) || {};
    const consultadoEm = dataValida(coleta.consultadoEm);
    const { itens, descartes: d, unidade } = prepararItens(coleta, meta, maxDias);
    descartes.nome += d.nome; descartes.outlier += d.outlier; descartes.antigo += d.antigo;

    const produto = {
      id: coleta.produtoId,
      nome: coleta.nomeExibicao || coleta.produtoId,
      categoriaId: coleta.categoriaId || null,
      unidadeReferencia: coleta.unidadeReferencia || null,
      unidadeComparacao: unidade,
      cesta: meta.cesta === true,
      popular: meta.popular === true,
      ordem: meta.ordem ?? 99,
      fonte: "Busca Preço SEFAZ-AM",
      atualizadoEm: consultadoEm
    };
    produtos.set(produto.id, produto);
    const ofertas = [];

    for (const item of itens) {
      const nomeEstabelecimento = String(item.estabelecimento || "").trim();
      if (!nomeEstabelecimento) continue;

      const endereco = String(item.endereco || "").trim();
      const estabelecimentoId = hashId(`${normalizar(nomeEstabelecimento)}|${normalizar(endereco)}`);
      const coordenadas = coordenadasValidas(item.latitude, item.longitude);
      const bairro = extrairBairro(endereco);

      if (!estabelecimentos.has(estabelecimentoId)) {
        estabelecimentos.set(estabelecimentoId, {
          id: estabelecimentoId, nome: nomeEstabelecimento, endereco: endereco || null, bairro,
          municipio: extrairMunicipio(endereco),
          latitude: coordenadas?.latitude ?? null, longitude: coordenadas?.longitude ?? null,
          fonte: "Busca Preço SEFAZ-AM", atualizadoEm: item.coletadoEm
        });
      }

      // Um registro por produto/loja/descrição/preço/dia da nota.
      const chavePreco = [coleta.produtoId, estabelecimentoId, normalizar(item.nomeEncontrado || coleta.nomeExibicao),
        item.preco.toFixed(2), item.emitidoEm.toISOString().slice(0, 10)].join("|");
      if (vistos.has(chavePreco)) continue;
      vistos.add(chavePreco);

      precos.push({
        id: hashId(chavePreco), produtoId: coleta.produtoId, estabelecimentoId,
        preco: item.preco,
        dataConsulta: item.emitidoEm,          // data real da nota (antes era a hora da coleta)
        coletadoEm: item.coletadoEm,
        nomeEncontrado: item.nomeEncontrado || coleta.nomeExibicao || null,
        unidadeReferencia: unidade,
        quantidadeEmbalagem: item.quantidade,
        precoReferencia: item.precoReferencia,
        unidadeConfirmada: item.precoReferencia !== null,
        fonte: item.fonte || "Busca Preço SEFAZ-AM",
        endereco: endereco || null
      });

      // Ofertas com tamanho identificado entram no "menor preço" (precisam de coordenadas).
      // As sem tamanho (precoReferencia null) só aparecem na página do produto, sem ranking por kg.
      if (item.precoReferencia !== null ? coordenadas : true) {
        ofertas.push({
          estabelecimentoId, mercado: nomeEstabelecimento, bairro, endereco: endereco || null,
          latitude: coordenadas?.latitude ?? null, longitude: coordenadas?.longitude ?? null,
          nomeEncontrado: item.nomeEncontrado, preco: item.preco, quantidade: item.quantidade,
          precoReferencia: item.precoReferencia, dataConsulta: item.emitidoEm
        });
      }
    }

    // Documento único por produto: o app lê só estes 30 documentos (em vez de milhares de preços).
    ofertas.sort((a, b) => (a.precoReferencia ?? Infinity) - (b.precoReferencia ?? Infinity) || a.preco - b.preco);
    resumo.set(produto.id, { ...produto, ofertas: ofertas.slice(0, 500), totalOfertas: ofertas.length });
  }

  return {
    produtos: [...produtos.values()],
    estabelecimentos: [...estabelecimentos.values()],
    precos: limitePrecos > 0 ? precos.slice(0, limitePrecos) : precos,
    resumo: [...resumo.values()],
    descartes
  };
}

function imprimirPlano(plano, executar) {
  console.log("\n==============================================");
  console.log("PREÇO AÍ — SINCRONIZAÇÃO COM FIRESTORE");
  console.log("==============================================");
  console.log("Modo:", executar ? "GRAVAÇÃO REAL" : "SIMULAÇÃO (nenhum dado será gravado)");
  console.log("Projeto esperado:", PROJETO_ESPERADO);
  console.log("Produtos:", plano.produtos.length);
  console.log("Estabelecimentos:", plano.estabelecimentos.length);
  console.log("Preços:", plano.precos.length, `(${plano.precos.filter((p) => p.unidadeConfirmada).length} com preço por kg/litro confirmado)`);
  console.log("Resumos por produto:", plano.resumo.length, "| descartados:", plano.descartes);
  const r = plano.resumo[0];
  if (r?.ofertas?.length) console.log("Menor oferta de", r.nome + ":", r.ofertas[0].mercado, "-", r.ofertas[0].bairro, "-", r.ofertas[0].nomeEncontrado, "→ R$", r.ofertas[0].precoReferencia, "/" + r.unidadeComparacao);
  console.log("Estabelecimentos com coordenadas:", plano.estabelecimentos.filter((e) => e.latitude !== null && e.longitude !== null).length);

  console.log("\nExemplo de produto:", plano.produtos[0] || "Nenhum");
  console.log("Exemplo de estabelecimento:", plano.estabelecimentos[0] || "Nenhum");
  console.log("Exemplo de preço:", plano.precos[0] || "Nenhum");

  if (!executar) {
    console.log("\nSIMULAÇÃO CONCLUÍDA. Para gravar, execute novamente com --executar.");
  }
}

function paraFirestore(valor, Timestamp) {
  if (valor instanceof Date) return Timestamp.fromDate(valor);
  if (Array.isArray(valor)) return valor.map((v) => paraFirestore(v, Timestamp));
  if (valor && typeof valor === "object") {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, paraFirestore(v, Timestamp)]));
  }
  return valor;
}

async function gravarFirestore(plano) {
  const credencial = lerCredencial();

  const { initializeApp, cert, getApps } = await import("firebase-admin/app");
  const { getFirestore, Timestamp } = await import("firebase-admin/firestore");

  const app = getApps().length
    ? getApps()[0]
    : initializeApp({ credential: cert(credencial), projectId: PROJETO_ESPERADO });
  const db = getFirestore(app);

  const grupos = [
    ["produtos", plano.produtos],
    ["estabelecimentos", plano.estabelecimentos],
    ["precos", plano.precos],
    ["resumo", plano.resumo]
  ];

  let totalGravado = 0;
  for (const [nomeColecao, documentos] of grupos) {
    for (let inicio = 0; inicio < documentos.length; inicio += TAMANHO_LOTE) {
      const lote = db.batch();
      const parte = documentos.slice(inicio, inicio + TAMANHO_LOTE);

      for (const documento of parte) {
        const { id, ...dados } = documento;
        const dadosFirestore = paraFirestore(dados, Timestamp);

        // "resumo" é recriado por inteiro a cada coleta; as demais coleções usam merge.
        if (nomeColecao === "resumo") lote.set(db.collection(nomeColecao).doc(id), dadosFirestore);
        else lote.set(db.collection(nomeColecao).doc(id), dadosFirestore, { merge: true });
      }

      await lote.commit();
      totalGravado += parte.length;
      console.log(`Gravados ${parte.length} documento(s) em ${nomeColecao}.`);
    }
  }

  console.log(`\nSINCRONIZAÇÃO CONCLUÍDA: ${totalGravado} gravações/upserts.`);
  console.log("Nenhum documento existente foi apagado.");
  await app.delete();
}

async function main() {
  const args = argumentos();
  const filtroProduto = args.produto ? String(args.produto).trim() : null;
  const limite = args.limite ? Math.max(0, Number(args.limite)) : 0;
  const executar = args.executar === true;

  if (!fs.existsSync(CATALOGO_PATH)) {
    throw new Error(`Catálogo não encontrado: ${CATALOGO_PATH}`);
  }

  const coletas = carregarColetas(filtroProduto);
  const plano = montarPlano(coletas, carregarCatalogo(), limite, args.dias ? Number(args.dias) : 7);

  if (!plano.precos.length) {
    throw new Error("Nenhum preço válido encontrado para sincronizar.");
  }

  imprimirPlano(plano, executar);
  if (executar) await gravarFirestore(plano);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((erro) => {
    console.error("\nERRO NA SINCRONIZAÇÃO:", erro.message);
    process.exitCode = 1;
  });
}

export { montarPlano, carregarColetas, carregarCatalogo };
