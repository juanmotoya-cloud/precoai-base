import { db, collection, getDocs } from "./firebase.js";
import { menoresPrecos, pesquisar, listarBairros } from "./precos.js";

export * from "./precos.js";

// O sincronizador grava um documento por produto na coleção "resumo" (≈30 leituras no total),
// com as ofertas já calculadas por kg/litro. O app não precisa ler "precos" nem "estabelecimentos".
let cache = null;

export async function carregarResumo(forcar = false) {
    if (cache && !forcar) return cache;
    const snap = await getDocs(collection(db, "resumo"));
    cache = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return cache;
}

export async function buscarMenoresPrecos(opcoes = {}) {
    return menoresPrecos(await carregarResumo(), opcoes);
}

export async function pesquisarProdutos(texto, opcoes = {}, nomesCategorias = {}) {
    return pesquisar(await carregarResumo(), texto, opcoes, nomesCategorias);
}

export async function bairrosDisponiveis() {
    return listarBairros(await carregarResumo());
}

export async function buscarProdutos() {
    const snap = await getDocs(collection(db, "produtos"));
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}
