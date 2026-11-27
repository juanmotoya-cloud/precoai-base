import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { analisarDescricao } from "../js/precos.js";
import { lerCredencial, PROJETO_ESPERADO } from "./credencial.js";
import { normalizar, tempoParaData, extrairBairro, extrairTamanho, extrairUnidades, nomeExcluido, mediana, corrigirCoordenadas } from "./enriquecer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const DIR_COLETAS = path.join(__dirname, "dados", "coletas");
const CATALOGO_PATH = path.join(ROOT_DIR, "dados", "catalogo-sefaz.json");

export const COLECOES = ["produtos", "estabelecimentos", "precos", "resumo"];
const TAMANHO_LOTE = 450;          // limite do Firestore é 500 operações por lote
const MAX_OFERTAS = 500;
const MAX_BYTES_DOC = 800_000;     // margem de segurança sobre o limite de 1 MiB por documento
const COBERTURA_MINIMA = 0.8;      // fração mínima do catálogo que precisa ter preços válidos
const AMOSTRA_PRECOS = 200;
const AMOSTRA_ESTABELECIMENTOS = 100;

// ---------------------------------------------------------------- argumentos

export function lerArgumentos(argv = process.argv.slice(2)) {
  const permitidos = new Set(["executar", "produto", "limite", "dias"]);
  const bruto = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) throw new Error(`Argumento inválido: "${arg}".`);
    const [chave, ...resto] = arg.slice(2).split("=");
    if (!permitidos.has(chave)) throw new Error(`Argumento desconhecido: --${chave}.`);
    bruto[chave] = resto.length ? resto.join("=") : true;
  }

  const inteiro = (nome, min, max, padrao) => {
    if (bruto[nome] === undefined) return padrao;
    const texto = bruto[nome];
    if (typeof texto !== "string" || !/^\d+$/.test(texto)) {
      throw new Error(`--${nome} precisa ser um número inteiro (recebido: ${texto === true ? "vazio" : `"${texto}"`}).`);
    }
    const n = Number(texto);
    if (n < min || n > max) throw new Error(`--${nome} precisa estar entre ${min} e ${max}.`);
    return n;
  };

  if (bruto.executar !== undefined && bruto.executar !== true) throw new Error("--executar não aceita valor.");
  let produto = null;
  if (bruto.produto !== undefined) {
    if (typeof bruto.produto !== "string" || !/^[\p{Ll}\p{N}-]+$/u.test(bruto.produto)) {
      throw new Error("--produto precisa ser um id do catálogo (letras minúsculas, com ou sem acento, números e hífen).");
    }
    produto = bruto.produto;
  }
  const limite = inteiro("limite", 0, 100000, 0);
  const dias = inteiro("dias", 1, 365, 7);
  const executar = bruto.executar === true;
  if (executar && limite > 0) {
    throw new Error("--limite só pode ser usado na simulação: ele corta preços e deixaria o resumo inconsistente.");
  }
  return { executar, produto, limite, dias };
}

// ---------------------------------------------------------------- utilidades

function hashId(valor) {
  return crypto.createHash("sha256").update(String(valor)).digest("hex").slice(0, 32);
}

function dataValida(valor, fallback) {
  const data = valor ? new Date(valor) : new Date(fallback || Date.now());
  return Number.isNaN(data.getTime()) ? new Date() : data;
}

function coordenadasValidas(latitude, longitude) {
  return corrigirCoordenadas(latitude, longitude);   // também desfaz o par invertido (longitude, latitude)
}

function extrairMunicipio(endereco = "") {
  const texto = String(endereco);
  const match = texto.match(/\b(MANAUS|IRANDUBA|MANACAPURU|ITACOATIARA|PRESIDENTE FIGUEIREDO|RIO PRETO DA EVA|CAREIRO|AUTAZES|PARINTINS)\s*-\s*AM\b/i);
  return match ? match[1].toLowerCase().replace(/\b\w/g, (letra) => letra.toUpperCase()) : "Manaus";
}

const arredondar = (n) => Math.round(n * 100) / 100;
const tamanhoBytes = (obj) => Buffer.byteLength(JSON.stringify(obj), "utf8");

// ---------------------------------------------------------------- leitura

export function carregarColetas(filtroProduto) {
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

  const vistos = new Set();
  return arquivos.map((arquivo) => {
    let dados;
    try { dados = JSON.parse(fs.readFileSync(path.join(DIR_COLETAS, arquivo), "utf8")); }
    catch { throw new Error(`JSON inválido no arquivo ${arquivo}.`); }
    if (!dados || !dados.produtoId || !Array.isArray(dados.resultados)) {
      throw new Error(`Formato inválido no arquivo ${arquivo}.`);
    }
    if (dados.produtoId !== path.basename(arquivo, ".json")) {
      throw new Error(`O produtoId "${dados.produtoId}" não corresponde ao nome do arquivo ${arquivo}.`);
    }
    if (vistos.has(dados.produtoId)) throw new Error(`Produto repetido nas coletas: ${dados.produtoId}.`);
    vistos.add(dados.produtoId);
    return dados;
  });
}

export function carregarCatalogo(caminho = CATALOGO_PATH) {
  if (!fs.existsSync(caminho)) throw new Error(`Catálogo não encontrado: ${caminho}`);
  let catalogo;
  try { catalogo = JSON.parse(fs.readFileSync(caminho, "utf8")); }
  catch { throw new Error("O catálogo não é um JSON válido."); }
  if (!catalogo || !Array.isArray(catalogo.produtos) || !catalogo.produtos.length) {
    throw new Error("Catálogo inválido: esperado { produtos: [ ... ] } com pelo menos um produto.");
  }
  const mapa = new Map();
  for (const p of catalogo.produtos) {
    if (!p || typeof p.id !== "string" || !p.id) throw new Error("Catálogo inválido: produto sem id.");
    if (mapa.has(p.id)) throw new Error(`Catálogo inválido: id repetido (${p.id}).`);
    mapa.set(p.id, p);
  }
  return mapa;
}

// ---------------------------------------------------------------- preparação

// Marca (só do dicionário), variação (tipo 1, integral...) e tamanho legível — gravados na oferta para a busca por marca.
function detalhesOferta(item, meta, unidade) {
  const d = analisarDescricao(item.nomeEncontrado || "", meta.nomeExibicao || "", unidade, meta.contarUnidades ? null : item.quantidade);
  return {
    ...(d.marcaConhecida && d.marca ? { marca: d.marca } : {}),
    ...(d.variacao ? { variacao: d.variacao } : {}),
    ...(d.tamanho ? { tamanhoTexto: d.tamanho } : {})
  };
}

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
    // Só entram notas dos últimos N dias.
    if (Date.now() - emitidoEm.getTime() > maxDias * 864e5) { descartes.antigo++; continue; }
    // Produtos vendidos em cartela (ovos): preço por unidade; sem a quantidade não dá para comparar, então descarta.
    const quantidade = meta.contarUnidades
      ? extrairUnidades(item.nomeEncontrado || "")
      : extrairTamanho(item.nomeEncontrado || "", unidade, { volumeComoMassa: meta.volumeComoMassa === true });
    if (meta.contarUnidades && !quantidade) { descartes.nome++; continue; }
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

export function montarPlano(coletas, catalogo, limitePrecos = 0, maxDias = 7) {
  const sincronizadoEm = new Date();
  const produtos = new Map();
  const estabelecimentos = new Map();
  const resumo = new Map();
  const precos = [];
  const vistos = new Set();
  const semOfertas = [];
  const descartes = { nome: 0, outlier: 0, antigo: 0 };

  for (const coleta of coletas) {
    const meta = catalogo.get(coleta.produtoId);
    if (!meta) throw new Error(`Produto não encontrado no catálogo: ${coleta.produtoId}`);

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

    // Tudo do produto fica em listas locais: só entra na base se sobrar ao menos um preço válido.
    const estLocais = new Map();
    const precosLocais = [];
    const ofertas = [];

    for (const item of itens) {
      const nomeEstabelecimento = String(item.estabelecimento || "").trim();
      if (!nomeEstabelecimento) continue;

      const endereco = String(item.endereco || "").trim();
      const estabelecimentoId = hashId(`${normalizar(nomeEstabelecimento)}|${normalizar(endereco)}`);
      const coordenadas = coordenadasValidas(item.latitude, item.longitude);
      const bairro = extrairBairro(endereco);

      if (!estabelecimentos.has(estabelecimentoId) && !estLocais.has(estabelecimentoId)) {
        estLocais.set(estabelecimentoId, {
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

      precosLocais.push({
        id: hashId(chavePreco), produtoId: coleta.produtoId, estabelecimentoId,
        preco: item.preco,
        dataConsulta: item.emitidoEm,          // data da nota fiscal (campo mantido por compatibilidade com o app)
        emitidoEm: item.emitidoEm,             // idem, com nome explícito
        coletadoEm: item.coletadoEm,           // quando o coletor viu o preço
        sincronizadoEm,                        // quando esta rodada gravou o registro
        nomeEncontrado: item.nomeEncontrado || coleta.nomeExibicao || null,
        unidadeReferencia: unidade,
        quantidadeEmbalagem: item.quantidade,
        precoReferencia: item.precoReferencia,
        unidadeConfirmada: item.precoReferencia !== null,
        fonte: item.fonte || "Busca Preço SEFAZ-AM",
        endereco: endereco || null
      });

      // Ofertas com tamanho identificado entram no ranking por kg/litro (precisam de coordenadas).
      // As sem tamanho (precoReferencia null) aparecem só como preço de embalagem.
      // Loja sem coordenada continua valendo: o site só a esconde quando o filtro é por distância.
      {
        ofertas.push({
          estabelecimentoId, mercado: nomeEstabelecimento, bairro, endereco: endereco || null,
          latitude: coordenadas?.latitude ?? null, longitude: coordenadas?.longitude ?? null,
          nomeEncontrado: item.nomeEncontrado, preco: item.preco, quantidade: item.quantidade,
          precoReferencia: item.precoReferencia, dataConsulta: item.emitidoEm,
          ...detalhesOferta(item, meta, unidade)
        });
      }
    }

    if (!precosLocais.length || !ofertas.length) { semOfertas.push(coleta.produtoId); continue; }

    ofertas.sort((a, b) => (a.precoReferencia ?? Infinity) - (b.precoReferencia ?? Infinity) || a.preco - b.preco);
    const melhorReferencia = ofertas.find((o) => o.precoReferencia !== null);
    const menorEmbalagem = Math.min(...ofertas.map((o) => o.preco));

    // Documento único por produto: o app lê só estes documentos em vez de milhares de preços.
    let lista = ofertas.slice(0, MAX_OFERTAS);
    const doc = {
      ...produto,
      ofertas: lista,
      totalOfertas: ofertas.length,
      menorPrecoEmbalagem: menorEmbalagem,
      ...(melhorReferencia ? { menorPrecoReferencia: melhorReferencia.precoReferencia } : {})
    };
    while (lista.length > 1 && tamanhoBytes(doc) > MAX_BYTES_DOC) {
      lista = lista.slice(0, Math.floor(lista.length * 0.8));
      doc.ofertas = lista;
    }

    produtos.set(produto.id, produto);
    resumo.set(produto.id, doc);
    for (const [id, est] of estLocais) estabelecimentos.set(id, est);
    precos.push(...precosLocais);
  }

  return {
    produtos: [...produtos.values()],
    estabelecimentos: [...estabelecimentos.values()],
    precos: limitePrecos > 0 ? precos.slice(0, limitePrecos) : precos,
    resumo: [...resumo.values()],
    descartes,
    semOfertas
  };
}

// Confere a nova base ANTES de qualquer gravação. Lança erro com todos os problemas encontrados.
export function validarPlano(plano, catalogo, { parcial = false } = {}) {
  const problemas = [];
  const idsProdutos = new Set(plano.produtos.map((p) => p.id));
  const idsEstab = new Set(plano.estabelecimentos.map((e) => e.id));

  if (!plano.produtos.length) problemas.push("Nenhum produto com preço válido.");
  if (!plano.precos.length) problemas.push("Nenhum preço válido.");

  if (!parcial && catalogo.size) {
    const minimo = Math.ceil(catalogo.size * COBERTURA_MINIMA);
    if (plano.produtos.length < minimo) {
      problemas.push(`Cobertura insuficiente: ${plano.produtos.length} de ${catalogo.size} produtos do catálogo (mínimo ${minimo}). A coleta parece incompleta.`);
    }
  }

  for (const [colecao, docs] of [["produtos", plano.produtos], ["estabelecimentos", plano.estabelecimentos], ["precos", plano.precos], ["resumo", plano.resumo]]) {
    const ids = new Set();
    for (const doc of docs) {
      if (!doc.id) problemas.push(`Documento sem id em ${colecao}.`);
      else if (ids.has(doc.id)) problemas.push(`ID repetido em ${colecao}: ${doc.id}.`);
      ids.add(doc.id);
    }
  }

  for (const p of plano.produtos) if (!catalogo.has(p.id)) problemas.push(`Produto fora do catálogo: ${p.id}.`);
  for (const r of plano.resumo) {
    if (!idsProdutos.has(r.id)) problemas.push(`Resumo sem produto correspondente: ${r.id}.`);
    if (!Array.isArray(r.ofertas) || !r.ofertas.length) problemas.push(`Resumo sem ofertas: ${r.id}.`);
    if (tamanhoBytes(r) > MAX_BYTES_DOC) problemas.push(`Resumo grande demais para o Firestore: ${r.id}.`);
  }
  if (plano.resumo.length !== plano.produtos.length) problemas.push("Quantidade de resumos diferente da quantidade de produtos.");

  let precosInvalidos = 0;
  for (const preco of plano.precos) {
    if (!Number.isFinite(preco.preco) || preco.preco <= 0) precosInvalidos++;
    else if (!idsProdutos.has(preco.produtoId) || !idsEstab.has(preco.estabelecimentoId)) precosInvalidos++;
  }
  if (precosInvalidos) problemas.push(`${precosInvalidos} preço(s) inválido(s) ou apontando para produto/estabelecimento inexistente.`);

  if (problemas.length) {
    throw new Error(`A nova base não passou na validação:\n - ${problemas.slice(0, 15).join("\n - ")}${problemas.length > 15 ? `\n - ... e mais ${problemas.length - 15}` : ""}`);
  }
}

function imprimirPlano(plano, executar) {
  const confirmados = plano.precos.filter((p) => p.unidadeConfirmada).length;
  console.log("\n==============================================");
  console.log("PREÇO AÍ — SINCRONIZAÇÃO COM FIRESTORE");
  console.log("==============================================");
  console.log("Modo:", executar ? "GRAVAÇÃO REAL" : "SIMULAÇÃO (nenhum dado será gravado)");
  console.log("Projeto esperado:", PROJETO_ESPERADO);
  console.log("Produtos:", plano.produtos.length);
  console.log("Estabelecimentos:", plano.estabelecimentos.length);
  console.log("Preços:", plano.precos.length,
    `(${confirmados} com preço por kg/litro confirmado, ${plano.precos.length - confirmados} só com preço de embalagem)`);
  console.log("Resumos por produto:", plano.resumo.length, "| descartados:", plano.descartes);
  if (plano.semOfertas.length) console.log("Produtos SEM preço válido (não serão publicados):", plano.semOfertas.join(", "));

  const r = plano.resumo[0];
  if (r) {
    const o = r.ofertas[0];
    if (r.menorPrecoReferencia !== undefined) {
      console.log(`Menor preço de ${r.nome}: R$ ${r.menorPrecoReferencia}/${r.unidadeComparacao} (${o.mercado}${o.bairro ? " - " + o.bairro : ""})`);
    } else {
      console.log(`Menor preço de ${r.nome} (embalagem, sem kg/litro): R$ ${r.menorPrecoEmbalagem}`);
    }
  }
  console.log("Estabelecimentos com coordenadas:", plano.estabelecimentos.filter((e) => e.latitude !== null && e.longitude !== null).length);

  if (!executar) console.log("\nSIMULAÇÃO CONCLUÍDA. Para gravar, execute novamente com --executar.");
}

// ---------------------------------------------------------------- Firestore

function paraFirestore(valor, Timestamp) {
  if (valor instanceof Date) return Timestamp.fromDate(valor);
  if (Array.isArray(valor)) return valor.map((v) => paraFirestore(v, Timestamp));
  if (valor && typeof valor === "object") {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, paraFirestore(v, Timestamp)]));
  }
  return valor;
}

export async function conectarFirestore() {
  const credencial = lerCredencial();
  const { initializeApp, cert, getApps } = await import("firebase-admin/app");
  const { getFirestore, Timestamp } = await import("firebase-admin/firestore");
  const app = getApps().length
    ? getApps()[0]
    : initializeApp({ credential: cert(credencial), projectId: PROJETO_ESPERADO });
  return { db: getFirestore(app), Timestamp, encerrar: () => app.delete() };
}

function amostra(lista, quantidade) {
  if (lista.length <= quantidade) return lista;
  const passo = lista.length / quantidade;
  return Array.from({ length: quantidade }, (_, i) => lista[Math.floor(i * passo)]);
}

export async function gravarFirestore(plano, { db, Timestamp }) {
  // "resumo" por último: é o que o app lê, então só passa a apontar para dados novos depois que os preços já existem.
  const grupos = [
    ["precos", plano.precos],
    ["estabelecimentos", plano.estabelecimentos],
    ["produtos", plano.produtos],
    ["resumo", plano.resumo]
  ];

  let totalGravado = 0;
  for (const [nomeColecao, documentos] of grupos) {
    for (let inicio = 0; inicio < documentos.length; inicio += TAMANHO_LOTE) {
      const lote = db.batch();
      const parte = documentos.slice(inicio, inicio + TAMANHO_LOTE);
      for (const documento of parte) {
        const { id, ...dados } = documento;
        // Sem merge: cada documento publicado substitui o anterior por inteiro, sem sobrar campo antigo.
        lote.set(db.collection(nomeColecao).doc(id), paraFirestore(dados, Timestamp));
      }
      await lote.commit();
      totalGravado += parte.length;
      console.log(`Gravados ${parte.length} documento(s) em ${nomeColecao}.`);
    }
  }

  // Conferência: produtos e resumos inteiros; amostra de preços e estabelecimentos (para poupar leituras).
  const conferir = [
    ["produtos", plano.produtos], ["resumo", plano.resumo],
    ["precos", amostra(plano.precos, AMOSTRA_PRECOS)],
    ["estabelecimentos", amostra(plano.estabelecimentos, AMOSTRA_ESTABELECIMENTOS)]
  ];
  const ausentes = [];
  for (const [nomeColecao, docs] of conferir) {
    for (let i = 0; i < docs.length; i += 300) {
      const refs = docs.slice(i, i + 300).map((d) => db.collection(nomeColecao).doc(d.id));
      const snaps = await db.getAll(...refs, { fieldMask: ["fonte"] });
      snaps.forEach((s) => { if (!s.exists) ausentes.push(`${nomeColecao}/${s.id}`); });
    }
  }
  if (ausentes.length) {
    throw new Error(`Conferência falhou: ${ausentes.length} documento(s) não foram encontrados após a gravação (ex.: ${ausentes.slice(0, 3).join(", ")}). Nada foi apagado.`);
  }

  console.log(`\nSINCRONIZAÇÃO CONCLUÍDA: ${totalGravado} documento(s) gravados e conferidos.`);
  console.log("Nenhum documento existente foi apagado. A remoção de registros antigos é feita à parte, com limpar-antigos.js.");
}

// ---------------------------------------------------------------- execução

export function montarPlanoLocal({ produto = null, dias = 7, limite = 0 } = {}) {
  const catalogo = carregarCatalogo();
  const plano = montarPlano(carregarColetas(produto), catalogo, limite, dias);
  validarPlano(plano, catalogo, { parcial: Boolean(produto) || limite > 0 });
  return { plano, catalogo };
}

async function main() {
  const args = lerArgumentos();
  const { plano } = montarPlanoLocal(args);
  imprimirPlano(plano, args.executar);
  if (!args.executar) return;

  const conexao = await conectarFirestore();
  try {
    await gravarFirestore(plano, conexao);
  } finally {
    await conexao.encerrar();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((erro) => {
    console.error("\nERRO NA SINCRONIZAÇÃO:", erro.message);
    process.exitCode = 1;
  });
}
