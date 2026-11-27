import { menoresPrecos, pesquisar, pesquisarOfertas, listarBairros, marcarComCatalogo } from "./precos.js";

export * from "./precos.js";

// O sincronizador grava um documento por produto na coleção "resumo" (≈30 leituras), com as ofertas
// já calculadas. Para não gastar leituras a cada tela aberta, o resultado fica guardado no aparelho por
// 20 minutos. Se a internet cair, o último resumo guardado continua valendo.
const CHAVE_CACHE = "precoai:resumo:v2";   // v2: coordenadas corrigidas (o cache v1 tinha latitude/longitude trocadas)
const VALIDADE_MS = 20 * 60 * 1000;
let memoria = null;

// Timestamps do Firestore viram texto ISO (para poder guardar em JSON); o app já lê datas em texto.
function simplificar(valor) {
    if (valor && typeof valor.toDate === "function") return valor.toDate().toISOString();
    if (Array.isArray(valor)) return valor.map(simplificar);
    if (valor && typeof valor === "object") return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, simplificar(v)]));
    return valor;
}

function lerCache() {
    try {
        const c = JSON.parse(localStorage.getItem(CHAVE_CACHE) || "null");
        return c && Array.isArray(c.dados) && Number.isFinite(c.em) ? c : null;
    } catch { return null; }
}

function salvarCache(dados) {
    try { localStorage.setItem(CHAVE_CACHE, JSON.stringify({ em: Date.now(), dados })); }
    catch { /* sem espaço ou modo privado: segue sem cache */ }
}

// O SDK do Firebase (pesado) só é baixado quando realmente é preciso ir à rede.
const firebase = () => import("./firebase.js");

async function baixarResumo() {
    const { db, collection, getDocs } = await firebase();
    const snap = await getDocs(collection(db, "resumo"));
    const dados = snap.docs.map(doc => simplificar({ id: doc.id, ...doc.data() }));
    if (dados.length) salvarCache(dados);
    return dados;
}

// Rápido: usa o resumo da memória ou do aparelho na hora, mesmo que já tenha passado dos 20 min
// (os preços só mudam a cada coleta); nesse caso, atualiza em segundo plano para a próxima tela.
// Só espera a internet quando não há nada guardado ou quando forçado.
let atualizando = null;
async function carregarResumoBruto(forcar = false) {
    if (memoria && !forcar) return memoria;
    const salvo = lerCache();
    if (salvo && !forcar) {
        memoria = salvo.dados;
        if (Date.now() - salvo.em >= VALIDADE_MS && !atualizando) {
            atualizando = baixarResumo().then(d => { if (d.length) memoria = d; }).catch(() => {}).finally(() => { atualizando = null; });
        }
        return memoria;
    }
    try {
        memoria = await baixarResumo();
        return memoria;
    } catch (erro) {
        if (salvo) { memoria = salvo.dados; return memoria; }   // sem internet: usa o último resumo
        throw erro;
    }
}

// Catálogo do site (dados/catalogo-sefaz.json): de lá vêm as marcas cesta/popular/ordem.
// Se não carregar, o app segue com o que veio do Firestore.
let catalogoSite = null;
async function lerCatalogoSite() {
    if (catalogoSite) return catalogoSite;
    try {
        const r = await fetch("./dados/catalogo-sefaz.json");
        if (!r.ok) throw new Error(String(r.status));
        catalogoSite = (await r.json()).produtos || [];
    } catch (erro) {
        console.warn("Catálogo do site indisponível:", erro);
        return [];
    }
    return catalogoSite;
}

export async function carregarResumo(forcar = false) {
    const [dados, catalogo] = await Promise.all([carregarResumoBruto(forcar), lerCatalogoSite()]);
    return catalogo.length ? marcarComCatalogo(dados, catalogo) : dados;
}

export async function buscarMenoresPrecos(opcoes = {}) {
    return menoresPrecos(await carregarResumo(), opcoes);
}

export async function pesquisarProdutos(texto, opcoes = {}, nomesCategorias = {}) {
    return pesquisar(await carregarResumo(), texto, opcoes, nomesCategorias);
}

export async function pesquisarTodasOfertas(texto, opcoes = {}, nomesCategorias = {}) {
    return pesquisarOfertas(await carregarResumo(), texto, opcoes, nomesCategorias);
}

export async function bairrosDisponiveis() {
    return listarBairros(await carregarResumo());
}

export async function buscarProdutos() {
    const { db, collection, getDocs } = await firebase();
    const snap = await getDocs(collection(db, "produtos"));
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}
