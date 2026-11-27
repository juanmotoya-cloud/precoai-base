// Cesta e Favoritos: lista salva no aparelho + onde sai mais barato levar tudo.
import { carregarResumo, menoresPrecos, todasOfertas, formatarPreco } from "./banco.js";
import { el, linha, inicializarLista } from "./cards.js";
import { lerPosicaoSalva, lerBairroSalvo } from "./localizacao.js";

const $ = s => document.querySelector(s);
const params = new URLSearchParams(location.search);
const favoritos = params.get("tipo") === "favoritos";
const CHAVE = favoritos ? "precoai:favoritos" : "precoai:lista";
const bairro = lerBairroSalvo()?.chave || "";
const posicao = lerPosicaoSalva();
const opcoes = { bairro: bairro || null, latitude: posicao?.latitude, longitude: posicao?.longitude, raioKm: bairro ? null : (posicao?.raioKm ?? null) };

let tt;
function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(tt); tt = setTimeout(() => t.classList.remove("show"), 1800);
}
const lerIds = () => { try { return new Set(JSON.parse(localStorage.getItem(CHAVE) || "[]")); } catch { return new Set(); } };
const salvarIds = ids => { try { localStorage.setItem(CHAVE, JSON.stringify([...ids])); } catch { /* modo privado */ } };

// Para cada mercado: o item mais barato (por kg/L) de cada produto da lista; total = soma dos preços das embalagens.
export function cestaPorMercado(ofertas, totalProdutos) {
    const mercados = new Map();
    for (const o of ofertas) {
        const m = mercados.get(o.mercado) || { mercado: o.mercado, bairro: o.bairro, distanciaKm: o.distanciaKm, itens: new Map() };
        const atual = m.itens.get(o.id);
        if (!atual || o.valor < atual.valor) m.itens.set(o.id, o);
        mercados.set(o.mercado, m);
    }
    return [...mercados.values()].map(m => ({
        ...m, quantidade: m.itens.size, faltam: totalProdutos - m.itens.size,
        total: [...m.itens.values()].reduce((s, i) => s + i.precoEmbalagem, 0)
    })).sort((a, b) => b.quantidade - a.quantidade || a.total - b.total);
}

function desenharResumo(produtos, itens) {
    const box = $("#resumo");
    box.replaceChildren();
    if (favoritos || !itens.length) { box.hidden = true; return; }
    const melhores = cestaPorMercado(todasOfertas(produtos, opcoes), produtos.length).slice(0, 3);
    const soma = itens.reduce((s, i) => s + i.precoEmbalagem, 0);
    box.hidden = false;
    box.append(el("h2", "", "Onde levar tudo mais barato"));
    if (melhores.length) {
        melhores.forEach((m, i) => {
            const c = el("article", "cmp" + (i === 0 ? " first" : ""));
            const info = el("div", "cmp-info");
            const detalhe = [m.bairro, Number.isFinite(m.distanciaKm) ? `${m.distanciaKm.toFixed(1).replace(".", ",")} km` : ""].filter(Boolean).join(" · ");
            info.append(el("h3", "", m.mercado), el("p", "meta", `${m.quantidade} de ${produtos.length} itens${m.faltam ? ` · faltam ${m.faltam}` : " · todos os itens"}${detalhe ? " · " + detalhe : ""}`));
            c.append(info, el("strong", "price", formatarPreco(m.total)));
            box.append(c);
        });
    }
    box.append(el("p", "aviso-tam", `Comprando o menor preço de cada item em lojas diferentes: ${formatarPreco(soma)}. Valores são o preço da embalagem na última nota registrada; podem variar na loja.`));
}

async function iniciar() {
    inicializarLista(toast);
    $("#titulo").textContent = favoritos ? "Favoritos" : "Minha cesta";
    document.title = `PreçoAí — ${favoritos ? "Favoritos" : "Cesta"}`;
    document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.nav === (favoritos ? "favoritos" : "cesta")));
    const ids = lerIds();
    const lista = $("#lista");
    if (!ids.size) { lista.replaceChildren(vazio()); return; }
    try {
        const resumo = await carregarResumo();
        const produtos = resumo.filter(p => ids.has(p.id));
        const itens = menoresPrecos(produtos, opcoes).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
        const semPreco = produtos.length - itens.length;
        const redesenhar = () => {
            const atuais = lerIds();
            const visiveis = itens.filter(i => atuais.has(i.id));
            lista.replaceChildren(...(visiveis.length ? visiveis.map(i => linha(i, { bairro })) : [vazio()]));
            if (semPreco && visiveis.length) lista.append(el("p", "aviso-tam", `${semPreco} item(ns) sem preço recente${bairro ? " neste bairro" : ""}.`));
            desenharResumo(produtos.filter(p => atuais.has(p.id)), visiveis);
            $("#limpar").hidden = !atuais.size;
        };
        document.addEventListener("click", e => { if (e.target.closest(".btn-add")) setTimeout(redesenhar, 0); });
        $("#limpar").addEventListener("click", () => { salvarIds(new Set()); window.listaIds?.clear?.(); redesenhar(); toast("Lista limpa"); });
        redesenhar();
    } catch (erro) {
        console.error(erro);
        lista.replaceChildren(el("p", "estado", "Não foi possível carregar os preços agora. Tente de novo."));
    }
}

function vazio() {
    const p = el("p", "estado", favoritos ? "Você ainda não favoritou nenhum produto. Toque no coração na página do produto." : "Sua cesta está vazia. Toque no + de um produto para montar sua lista.");
    const a = el("a", "btn-amarelo", "Buscar produtos");
    a.href = "busca.html";
    p.append(document.createElement("br"), a);
    return p;
}

// A navegação inferior é a mesma das outras telas.
$(".bottom-nav").addEventListener("click", e => {
    const b = e.target.closest(".nav-item");
    if (!b) return;
    const k = b.dataset.nav;
    if (k === "inicio") location.href = "index.html";
    else if (k === "buscar") location.href = "busca.html";
    else if (k === "cesta") location.href = "cesta.html";
    else if (k === "favoritos") location.href = "cesta.html?tipo=favoritos";
    else toast("Em breve");
});
iniciar();
