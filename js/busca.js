import { carregarResumo, pesquisarProdutos, pesquisarTodasOfertas, normalizar, analisarDescricao, MIN_CARACTERES_BUSCA, tempoRelativo, converterData, facetas, marcaDaOferta } from "./banco.js";
import { carregarCategorias } from "./json.js";
import { card, el, inicializarLista } from "./cards.js";
import { criarAnuncio, formatoAtual, intercalarAnuncios } from "./anuncios.js";
import { lerPosicaoSalva, lerBairroSalvo, guardar, recuperar } from "./localizacao.js";

const $ = s => document.querySelector(s);
const campo = $("#q"), caixaSugestoes = $("#sugestoes");
const salvoBairro = lerBairroSalvo();
const bairro = salvoBairro?.chave || "";
const posicao = lerPosicaoSalva();
const CHAVE_RECENTES = "precoai:buscas";
const MAX_SUGESTOES = 8;

let tt;
function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(tt);
    tt = setTimeout(() => t.classList.remove("show"), 1800);
}
inicializarLista(toast);
const atualizarBadge = () => { $("#badge").textContent = window.listaIds.size || ""; };
atualizarBadge();
document.addEventListener("click", e => { if (e.target.closest(".btn-add")) atualizarBadge(); });

$(".bottom-nav").addEventListener("click", e => {
    const b = e.target.closest(".nav-item");
    if (!b) return;
    const k = b.dataset.nav;
    if (k === "inicio") location.href = "index.html";
    else if (k === "buscar") campo.focus();
    else if (k === "cesta") location.href = "cesta.html";
    else if (k === "favoritos") location.href = "cesta.html?tipo=favoritos";
    else toast("Em breve");
});

// Filtros que valem na busca: bairro escolhido na Home ou, se não houver, a posição do celular.
const opcoes = () => ({ latitude: posicao?.latitude, longitude: posicao?.longitude, raioKm: bairro ? null : (posicao?.raioKm ?? null), bairro: bairro || null });
if (bairro) $("#local").append(el("span", "chip-local", `Bairro: ${salvoBairro.nome}`));
else if (posicao?.raioKm) $("#local").append(el("span", "chip-local", `Até ${posicao.raioKm} km de você`));

// ---- Buscas recentes (guardadas no aparelho)
function lerRecentes() { try { return JSON.parse(recuperar(CHAVE_RECENTES) || "[]").filter(t => typeof t === "string"); } catch { return []; } }
function lembrar(texto) {
    const lista = [texto, ...lerRecentes().filter(t => normalizar(t) !== normalizar(texto))].slice(0, 8);
    guardar(CHAVE_RECENTES, JSON.stringify(lista));
}
function chip(texto, aoTocar) {
    const b = el("button", "chip", texto);
    b.type = "button";
    b.addEventListener("click", () => aoTocar(texto));
    return b;
}
function desenharRecentes() {
    const lista = lerRecentes();
    $("#recentes").hidden = !lista.length;
    $("#recentes-lista").replaceChildren(...lista.map(t => chip(t, pesquisar)));
}
$("#limpar-recentes").addEventListener("click", () => { guardar(CHAVE_RECENTES, null); desenharRecentes(); });

// ---- Índice de sugestões: produto, marca (extraída das notas), categoria, mercado e bairro.
// Cada sugestão traz o texto que será pesquisado, que a busca por palavras já entende.
let indice = [];
let nomesCategorias = {};
function montarIndice(resumo, categorias) {
    const vistos = new Set();
    const itens = [];
    const adicionar = (tipo, texto, extra = 0) => {
        const chave = tipo + "|" + normalizar(texto);
        if (!texto || vistos.has(chave)) return;
        vistos.add(chave);
        itens.push({ tipo, texto, norm: normalizar(texto), extra });
    };
    categorias.forEach(c => { nomesCategorias[c.id] = c.nome; adicionar("Categoria", c.nome); });
    for (const p of resumo) {
        adicionar("Produto", p.nome, p.popular ? -1 : 0);
        for (const o of p.ofertas || []) {
            const { marca } = analisarDescricao(o.nomeEncontrado, p.nome, p.unidadeComparacao || "kg", o.quantidade);
            if (marca) adicionar("Marca", `${p.nome} ${marca}`);
            const marcaPura = marcaDaOferta(o);
            if (marcaPura) adicionar("Marca", marcaPura);
            if (o.mercado) adicionar("Mercado", o.mercado);
            if (o.bairro) adicionar("Bairro", o.bairro);
        }
    }
    indice = itens;
}

const PRIORIDADE = { Produto: 0, Marca: 1, Categoria: 2, Mercado: 3, Bairro: 4 };
function sugerir(texto) {
    const palavras = normalizar(texto).split(" ").filter(Boolean);
    if (!palavras.length) return [];
    const pontuar = i => {
        if (!palavras.every(w => i.norm.includes(w))) return null;
        const ini = i.norm.startsWith(palavras[0]) ? 0 : i.norm.split(" ").some(p => p.startsWith(palavras[0])) ? 1 : 2;
        return ini * 10 + PRIORIDADE[i.tipo] + i.extra;
    };
    return indice.map(i => [pontuar(i), i]).filter(([p]) => p !== null)
        .sort((a, b) => a[0] - b[0] || a[1].texto.localeCompare(b[1].texto, "pt-BR")).slice(0, MAX_SUGESTOES).map(([, i]) => i);
}

let ativa = -1;
function fecharSugestoes() {
    caixaSugestoes.hidden = true;
    caixaSugestoes.replaceChildren();
    campo.setAttribute("aria-expanded", "false");
    campo.removeAttribute("aria-activedescendant");
    ativa = -1;
}
function destacar(n) {
    const itens = [...caixaSugestoes.children];
    itens.forEach((li, i) => { li.classList.toggle("ativa", i === n); li.setAttribute("aria-selected", i === n); });
    ativa = n;
    if (n >= 0) campo.setAttribute("aria-activedescendant", itens[n].id);
    else campo.removeAttribute("aria-activedescendant");
}
function mostrarSugestoes(texto) {
    const lista = sugerir(texto);
    if (!lista.length) { fecharSugestoes(); return; }
    caixaSugestoes.replaceChildren(...lista.map((s, i) => {
        const li = el("li", "sugestao");
        li.id = `sug-${i}`;
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", "false");
        li.append(el("span", "sug-texto", s.texto), el("span", "sug-tipo", s.tipo));
        // pointerdown (e não click) para o campo não perder o foco antes da escolha
        li.addEventListener("pointerdown", e => { e.preventDefault(); pesquisar(s.texto); });
        return li;
    }));
    caixaSugestoes.hidden = false;
    campo.setAttribute("aria-expanded", "true");
    ativa = -1;
}

// ---- Pesquisa
// Filtros e ordem valem para a busca atual; mudar um deles refaz a lista sem digitar de novo.
const filtro = { marca: "", mercado: "", ordem: "relevancia", modo: "produtos" };
let buscaAtual = "";

const comparar = {
    relevancia: () => 0,
    preco: (a, b) => a.valor - b.valor,
    perto: (a, b) => (a.distanciaKm ?? Infinity) - (b.distanciaKm ?? Infinity) || a.valor - b.valor,
    recente: (a, b) => (converterData(b.dataConsulta) || 0) - (converterData(a.dataConsulta) || 0)
};

function desenharFiltros(todas) {
    const f = facetas(todas);
    $("#filtros").hidden = !todas.length;
    // Marcas: "Todas" + as mais frequentes; a marca escolhida sempre aparece.
    const marcas = f.marcas.slice(0, 10);
    if (filtro.marca && !marcas.some(m => m.nome === filtro.marca)) marcas.unshift({ nome: filtro.marca, total: 0 });
    const chipsMarca = [{ nome: "", total: todas.length }, ...marcas].map(m => {
        const b = el("button", "chip" + (m.nome === filtro.marca ? " on" : ""), m.nome ? (m.total ? `${m.nome} · ${m.total}` : m.nome) : "Todas as marcas");
        b.type = "button"; b.setAttribute("aria-pressed", m.nome === filtro.marca);
        b.addEventListener("click", () => { filtro.marca = m.nome; pesquisar(buscaAtual, true); });
        return b;
    });
    $("#marcas-chips").replaceChildren(...(f.marcas.length || filtro.marca ? chipsMarca : []));
    const sel = $("#mercado");
    sel.replaceChildren(new Option("Todos os mercados", ""), ...f.mercados.slice(0, 40).map(m => new Option(`${m.nome} (${m.total})`, m.nome)));
    sel.value = filtro.mercado;
    $("#ordem").value = filtro.ordem;
    document.querySelectorAll(".seg-b").forEach(b => { const on = b.dataset.modo === filtro.modo; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
}

function textoVazio() {
    if (filtro.marca || filtro.mercado) return "Nenhum resultado com esses filtros. Remova a marca ou o mercado para ver mais.";
    return bairro ? "Não encontramos preços recentes neste bairro. Tente outro termo ou escolha “Todos os bairros” na Início." : "Não encontramos preços recentes para essa busca. Tente outro termo, só o nome do alimento ou a marca.";
}

async function pesquisar(texto, mantemFiltros = false) {
    texto = String(texto).trim();
    campo.value = texto;
    fecharSugestoes();
    if (!texto) { limparResultados(); return; }
    if (normalizar(texto).length < MIN_CARACTERES_BUSCA) { toast("Digite pelo menos 2 letras"); return; }
    if (!mantemFiltros) { filtro.marca = ""; filtro.mercado = ""; }
    buscaAtual = texto;
    lembrar(texto);
    history.replaceState(null, "", `?${new URLSearchParams({ q: texto })}`);
    $("#inicio-busca").hidden = true;
    $("#resultados").hidden = false;
    $("#resultados-titulo").textContent = `Resultados para “${texto}”`;
    $("#resultados-lista").replaceChildren(...Array.from({ length: 4 }, () => el("div", "card esqueleto")));
    try {
        const base = opcoes();
        // Sem marca/mercado: serve para montar os filtros. Com eles: é o que aparece na tela.
        const todas = await pesquisarTodasOfertas(texto, base, nomesCategorias);
        const filtradas = { ...base, marca: filtro.marca || null, mercado: filtro.mercado || null };
        let itens = filtro.modo === "ofertas" ? await pesquisarTodasOfertas(texto, filtradas, nomesCategorias) : await pesquisarProdutos(texto, filtradas, nomesCategorias);
        if (campo.value.trim() !== texto) return;   // o usuário já digitou outra coisa
        if (filtro.ordem !== "relevancia") itens = [...itens].sort(comparar[filtro.ordem]);
        desenharFiltros(todas);
        const rotulo = filtro.modo === "ofertas" ? "oferta" : "produto";
        $("#resultados-titulo").textContent = `${itens.length} ${rotulo}${itens.length === 1 ? "" : "s"} para “${texto}”`;
        $("#resultados-lista").replaceChildren(...(itens.length ? intercalarAnuncios(itens.map(i => card(i, { bairro, tag: filtro.modo === "ofertas" ? "" : "Menor preço" }))) : [el("p", "estado", textoVazio())]));
    } catch (erro) {
        console.error(erro);
        const b = el("button", "btn-amarelo", "Tentar de novo");
        b.type = "button"; b.addEventListener("click", () => pesquisar(texto, true));
        const p = el("p", "estado", "Sem conexão com os preços agora. Verifique a internet e tente de novo.");
        p.append(document.createElement("br"), b);
        $("#resultados-lista").replaceChildren(p);
    }
}
$("#ordem").addEventListener("change", e => { filtro.ordem = e.target.value; pesquisar(buscaAtual, true); });
$("#mercado").addEventListener("change", e => { filtro.mercado = e.target.value; pesquisar(buscaAtual, true); });
document.querySelector(".filtros").addEventListener("click", e => { const b = e.target.closest(".seg-b"); if (b) { filtro.modo = b.dataset.modo; pesquisar(buscaAtual, true); } });
function limparResultados() {
    $("#resultados").hidden = true;
    $("#resultados-lista").replaceChildren();
    $("#inicio-busca").hidden = false;
    desenharRecentes();
    history.replaceState(null, "", location.pathname);
}

campo.addEventListener("input", () => {
    const t = campo.value.trim();
    if (!t) { fecharSugestoes(); limparResultados(); return; }
    mostrarSugestoes(t);
});
campo.addEventListener("focus", () => { if (campo.value.trim()) mostrarSugestoes(campo.value); });
campo.addEventListener("blur", () => setTimeout(fecharSugestoes, 100));
campo.addEventListener("keydown", e => {
    const n = caixaSugestoes.children.length;
    if (e.key === "ArrowDown" && n) { e.preventDefault(); destacar((ativa + 1) % n); }
    else if (e.key === "ArrowUp" && n) { e.preventDefault(); destacar((ativa - 1 + n) % n); }
    else if (e.key === "Escape") fecharSugestoes();
    else if (e.key === "Enter") {
        e.preventDefault();
        pesquisar(ativa >= 0 ? caixaSugestoes.children[ativa].querySelector(".sug-texto").textContent : campo.value);
        campo.blur();
    }
});

async function iniciar() {
    const fmt = formatoAtual();
    if (fmt) $("#anuncio-busca").append(criarAnuncio(fmt));
    desenharRecentes();
    try {
        const [resumo, categorias] = await Promise.all([carregarResumo(), carregarCategorias().catch(() => [])]);
        montarIndice(resumo, categorias);
        // Transparência: mostra a data da nota mais recente que está no ar.
        const datas = resumo.flatMap(p => (p.ofertas || []).map(o => converterData(o.dataConsulta)?.getTime() || 0));
        const recente = Math.max(0, ...datas);
        if (recente) $("#local").append(el("span", "chip-local", `Preços da SEFAZ/AM · nota mais recente ${tempoRelativo(new Date(recente))}`));
        const populares = resumo.filter(p => p.popular || p.cesta).sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99)).slice(0, 8);
        $("#populares").replaceChildren(...(populares.length ? populares : resumo.slice(0, 8)).map(p => chip(p.nome, pesquisar)));
    } catch (erro) {
        console.error(erro);
        $("#populares").replaceChildren(el("p", "estado", "Não foi possível carregar as sugestões."));
    }
    const q = new URLSearchParams(location.search).get("q");
    if (q) pesquisar(q); else campo.focus();
}
iniciar();
