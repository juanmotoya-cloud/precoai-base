import * as cheerio from "cheerio";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const CATALOGO_PATH = path.join(ROOT_DIR, "dados", "catalogo-sefaz.json");
const BASE_URL = "https://buscapreco.sefaz.am.gov.br";
const URL_CONSULTA = `${BASE_URL}/item/grupo/page/1`;
const USER_AGENT = "Mozilla/5.0 (compatible; PrecoAiPesquisa/1.0)";

const CONFIG = {
  maxPaginas: Number(process.env.MAX_PAGINAS || 3),
  pausaMs: Number(process.env.PAUSA_MS || 1200),
  timeoutMs: Number(process.env.TIMEOUT_MS || 30000),
  limiteProdutos: Number(process.env.LIMITE_PRODUTOS || 0),
  maxTermos: Number(process.env.MAX_TERMOS || 0),
  salvarHtml: process.env.SALVAR_HTML === "1"
};

function argumentosCli() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [chave, ...valor] = arg.replace(/^--/, "").split("=");
      return [chave, valor.join("=") || true];
    })
  );
  return args;
}

function normalizar(texto = "") {
  return String(texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function idSemAcento(id = "") {
  return String(id).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function escaparRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function contemExpressao(texto, expressao) {
  const base = normalizar(texto);
  const alvo = normalizar(expressao);
  if (!base || !alvo) return false;
  // Procura palavras/expressões completas, evitando "sal" dentro de "salgadinho".
  return new RegExp(`(?:^| )${escaparRegex(alvo)}(?:$| )`).test(base);
}

function converterPreco(texto = "") {
  const limpo = String(texto).replace(/[^\d,.-]/g, "");
  if (!limpo) return null;
  const normalizado = limpo.includes(",")
    ? limpo.replace(/\./g, "").replace(",", ".")
    : limpo;
  const valor = Number(normalizado);
  return Number.isFinite(valor) ? valor : null;
}

function correspondeAoProduto(nome, produto) {
  const descricao = normalizar(nome);
  if (!descricao) return { aceito: false, motivo: "descricao_vazia" };

  const exclusoes = produto.criteriosExclusao || [];
  const exclusao = exclusoes.find((termo) => contemExpressao(descricao, termo));
  if (exclusao) {
    return { aceito: false, motivo: "termo_excluido", termo: exclusao };
  }

  const termosPesquisa = produto.termosPesquisa || [];
  const encontrouTermo = termosPesquisa.some((termo) => contemExpressao(descricao, termo));

  const inclusoes = produto.criteriosInclusao || [];
  const modo = String(produto.modoInclusao || "TODOS").toUpperCase();
  const encontrouInclusao = inclusoes.length
    ? (modo === "ALGUM"
        ? inclusoes.some((termo) => contemExpressao(descricao, termo))
        : inclusoes.every((termo) => contemExpressao(descricao, termo)))
    : false;

  if (!encontrouTermo && !encontrouInclusao) {
    return { aceito: false, motivo: "nao_corresponde" };
  }

  return { aceito: true, motivo: encontrouTermo ? "termo_pesquisa" : "criterios_inclusao" };
}

function extrairCoordenadas(card) {
  const onclick = card.find('a[onclick*="refreshMap"]').attr("onclick") || "";
  const match = onclick.match(/refreshMap\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/i);
  if (!match) return { latitude: null, longitude: null };
  // A página chama refreshMap(longitude, latitude).
  return { longitude: Number(match[1]), latitude: Number(match[2]) };
}

function extrairResultados(html, produto, pagina = 1) {
  const $ = cheerio.load(html);
  const resultados = [];
  const rejeitados = { descricao_vazia: 0, termo_excluido: 0, nao_corresponde: 0, preco_invalido: 0, preco_suspeito: 0 };

  $(".card.small.p").each((_, elemento) => {
    const card = $(elemento);
    const nome = (
      card.find(".card-title b").first().text().trim() ||
      card.find(".card-title").first().attr("data-tooltip") || ""
    ).trim();
    const precoTexto = card.find(".card-content p.tb-valor-25 b").first().text().trim();
    const tempo = card.find(".card-content p.tb-valor-10").first().text().trim();
    const estabelecimento = card.find("p.truncate b").first().text().trim();
    const endereco = (
      card.find(".valign-wrapper span[data-tooltip]").first().attr("data-tooltip") ||
      card.find(".valign-wrapper span").first().text().trim()
    );
    const preco = converterPreco(precoTexto);

    const validacao = correspondeAoProduto(nome, produto);
    if (!validacao.aceito) {
      rejeitados[validacao.motivo] = (rejeitados[validacao.motivo] || 0) + 1;
      return;
    }
    if (!nome || !estabelecimento || preco === null || preco <= 0) {
      rejeitados.preco_invalido++;
      return;
    }
    if (preco <= 0.01) {
      rejeitados.preco_suspeito++;
      return;
    }

    const coordenadas = extrairCoordenadas(card);
    resultados.push({
      produtoId: produto.id,
      produtoCatalogo: produto.nomeExibicao,
      nomeEncontrado: nome,
      preco,
      precoOriginal: precoTexto,
      unidadeReferencia: produto.unidadeReferencia || null,
      unidadeConfirmada: false,
      tempoDesdeEmissao: tempo || null,
      estabelecimento,
      endereco: String(endereco || "").trim() || null,
      latitude: coordenadas.latitude,
      longitude: coordenadas.longitude,
      pagina,
      termoCorrespondencia: validacao.motivo,
      consultadoEm: new Date().toISOString(),
      fonte: "Busca Preço SEFAZ-AM"
    });
  });

  return { resultados, rejeitados, totalCards: $(".card.small.p").length };
}

function paginasDisponiveis(html) {
  const $ = cheerio.load(html);
  const paginas = $(".pagination a[href]")
    .map((_, el) => {
      const href = $(el).attr("href") || "";
      const match = href.match(/\/item\/grupo\/page\/(\d+)/);
      return match ? Number(match[1]) : null;
    })
    .get()
    .filter(Number.isFinite);
  return paginas.length ? Math.max(...paginas) : 1;
}

function atualizarCookies(atuais, resposta) {
  const setCookie = resposta.headers.get("set-cookie");
  if (!setCookie) return atuais;
  const novos = setCookie.split(/,(?=\s*[^;,\s]+=)/).map((parte) => parte.split(";")[0].trim()).filter(Boolean);
  const mapa = new Map(atuais.split("; ").filter(Boolean).map((item) => [item.split("=")[0], item]));
  for (const cookie of novos) mapa.set(cookie.split("=")[0], cookie);
  return [...mapa.values()].join("; ");
}

async function requisitar(url, opcoes = {}, cookies = "") {
  const headers = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": `${BASE_URL}/home`,
    "Origin": BASE_URL,
    ...(cookies ? { Cookie: cookies } : {}),
    ...(opcoes.headers || {})
  };
  const resposta = await fetch(url, {
    ...opcoes,
    headers,
    signal: AbortSignal.timeout(CONFIG.timeoutMs),
    redirect: "follow"
  });
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status} em ${url}`);
  const buffer = Buffer.from(await resposta.arrayBuffer());
  // A SEFAZ responde em ISO-8859-1; decodificar como UTF-8 gerava "H�" e acentos quebrados.
  return { html: buffer.toString("latin1"), cookies: atualizarCookies(cookies, resposta), urlFinal: resposta.url };
}

async function consultarTermo(termo, produto) {
  const formulario = new URLSearchParams({ descricaoProd: termo, termoCdGtin: "" });
  const primeira = await requisitar(URL_CONSULTA, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formulario
  });

  const maxPaginaEncontrada = paginasDisponiveis(primeira.html);
  const limite = Math.max(1, Math.min(CONFIG.maxPaginas, maxPaginaEncontrada));
  const paginas = [{ numero: 1, html: primeira.html }];
  let cookies = primeira.cookies;

  for (let numero = 2; numero <= limite; numero++) {
    await esperar(CONFIG.pausaMs);
    const pagina = await requisitar(`${BASE_URL}/item/grupo/page/${numero}`, { method: "GET" }, cookies);
    cookies = pagina.cookies;
    paginas.push({ numero, html: pagina.html });
  }

  const resultados = [];
  const rejeitados = {};
  let cardsAnalisados = 0;
  for (const pagina of paginas) {
    const extraido = extrairResultados(pagina.html, produto, pagina.numero);
    resultados.push(...extraido.resultados);
    cardsAnalisados += extraido.totalCards;
    for (const [motivo, quantidade] of Object.entries(extraido.rejeitados)) {
      rejeitados[motivo] = (rejeitados[motivo] || 0) + quantidade;
    }
    if (CONFIG.salvarHtml) {
      const dir = path.join(__dirname, "dados", "html");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${produto.id}-${normalizar(termo).replace(/ /g, "-")}-p${pagina.numero}.html`), pagina.html);
    }
  }

  return { termo, paginasConsultadas: paginas.length, paginasDisponiveis: maxPaginaEncontrada, cardsAnalisados, resultados, rejeitados };
}

function chaveUnica(item) {
  return [normalizar(item.nomeEncontrado), normalizar(item.estabelecimento), normalizar(item.endereco || ""), item.preco].join("|");
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function carregarCatalogo() {
  if (!fs.existsSync(CATALOGO_PATH)) throw new Error(`Catálogo não encontrado: ${CATALOGO_PATH}`);
  const catalogo = JSON.parse(fs.readFileSync(CATALOGO_PATH, "utf8"));
  if (!Array.isArray(catalogo.produtos)) throw new Error("Formato inválido: catalogo.produtos precisa ser uma lista.");
  // Garante ids sem acento (ex.: "feijão-carioca" vira "feijao-carioca"), igual aos nomes dos arquivos de coleta.
  return catalogo.produtos.map((p) => ({ ...p, id: idSemAcento(p.id) }));
}

async function coletarProduto(produto) {
  const termos = Array.isArray(produto.termosPesquisa) ? produto.termosPesquisa : [];
  const listaTermos = CONFIG.maxTermos > 0 ? termos.slice(0, CONFIG.maxTermos) : termos;
  const todos = [];
  const consultas = [];
  const falhas = [];

  console.log(`\n[${produto.id}] ${produto.nomeExibicao} — ${listaTermos.length} termo(s)`);
  for (let i = 0; i < listaTermos.length; i++) {
    const termo = listaTermos[i];
    try {
      console.log(`  Pesquisando "${termo}" (${i + 1}/${listaTermos.length})...`);
      const consulta = await consultarTermo(termo, produto);
      consultas.push({ termo: consulta.termo, paginasConsultadas: consulta.paginasConsultadas, paginasDisponiveis: consulta.paginasDisponiveis, cardsAnalisados: consulta.cardsAnalisados, resultadosAceitos: consulta.resultados.length, rejeitados: consulta.rejeitados });
      todos.push(...consulta.resultados);
      console.log(`  ${consulta.resultados.length} resultado(s) aceito(s) em ${consulta.cardsAnalisados} cartão(ões).`);
    } catch (erro) {
      falhas.push({ termo, erro: erro.message });
      console.error(`  Falha em "${termo}": ${erro.message}`);
    }
    if (i < listaTermos.length - 1) await esperar(CONFIG.pausaMs);
  }

  const unicos = [...new Map(todos.map((item) => [chaveUnica(item), item])).values()]
    .sort((a, b) => a.preco - b.preco);

  return {
    produtoId: produto.id,
    nomeExibicao: produto.nomeExibicao,
    categoriaId: produto.categoriaId,
    unidadeReferencia: produto.unidadeReferencia || null,
    consultadoEm: new Date().toISOString(),
    quantidade: unicos.length,
    consultas,
    falhas,
    resultados: unicos
  };
}

async function main() {
  const args = argumentosCli();
  const produtosCatalogo = carregarCatalogo();
  const filtro = args.produto ? normalizar(args.produto) : null;
  let produtos = filtro
    ? produtosCatalogo.filter((p) => normalizar(p.id) === filtro || normalizar(p.nomeExibicao) === filtro)
    : produtosCatalogo;

  if (args["limite-produtos"] || CONFIG.limiteProdutos > 0) {
    const limite = Number(args["limite-produtos"] || CONFIG.limiteProdutos);
    produtos = produtos.slice(0, Math.max(1, limite));
  }
  if (!produtos.length) throw new Error(`Nenhum produto encontrado para: ${args.produto}`);

  if (args["max-paginas"]) CONFIG.maxPaginas = Number(args["max-paginas"]);
  if (args["pausa-ms"]) CONFIG.pausaMs = Number(args["pausa-ms"]);
  if (args["max-termos"]) CONFIG.maxTermos = Number(args["max-termos"]);

  console.log("============================================");
  console.log("PREÇO AÍ — COLETOR GENÉRICO SEFAZ-AM");
  console.log(`Produtos selecionados: ${produtos.length}`);
  console.log(`Máximo de páginas por termo: ${CONFIG.maxPaginas}`);
  console.log(`Pausa entre requisições: ${CONFIG.pausaMs} ms`);
  console.log("============================================");

  const pastaSaida = path.join(__dirname, "dados", "coletas");
  fs.mkdirSync(pastaSaida, { recursive: true });
  const resumo = {
    fonte: "Busca Preço SEFAZ-AM",
    iniciadoEm: new Date().toISOString(),
    configuracao: { maxPaginas: CONFIG.maxPaginas, pausaMs: CONFIG.pausaMs },
    totalProdutosSolicitados: produtos.length,
    produtosProcessados: []
  };

  for (let i = 0; i < produtos.length; i++) {
    const resultado = await coletarProduto(produtos[i]);
    resumo.produtosProcessados.push({ produtoId: resultado.produtoId, nomeExibicao: resultado.nomeExibicao, quantidade: resultado.quantidade, falhas: resultado.falhas.length });
    const arquivoProduto = path.join(pastaSaida, `${resultado.produtoId}.json`);
    fs.writeFileSync(arquivoProduto, JSON.stringify(resultado, null, 2), "utf8");
    console.log(`  Salvo: ${path.relative(ROOT_DIR, arquivoProduto)}`);
    if (i < produtos.length - 1) await esperar(CONFIG.pausaMs);
  }

  resumo.concluidoEm = new Date().toISOString();
  resumo.totalResultados = resumo.produtosProcessados.reduce((total, p) => total + p.quantidade, 0);
  resumo.arquivosPorProduto = resumo.produtosProcessados.map((p) => `dados/coletas/${p.produtoId}.json`);
  fs.writeFileSync(path.join(pastaSaida, "resumo-ultima-coleta.json"), JSON.stringify(resumo, null, 2), "utf8");

  console.log("\n============================================");
  console.log("COLETA FINALIZADA");
  console.log(`Produtos processados: ${resumo.produtosProcessados.length}`);
  console.log(`Resultados únicos: ${resumo.totalResultados}`);
  console.log(`Resumo: ${path.relative(ROOT_DIR, path.join(pastaSaida, "resumo-ultima-coleta.json"))}`);
  console.log("============================================");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((erro) => {
    console.error("\nERRO NA COLETA:", erro.message);
    process.exitCode = 1;
  });
}

export { normalizar, converterPreco, correspondeAoProduto, extrairResultados, paginasDisponiveis };
