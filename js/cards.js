// Cards de produto compartilhados por Home, Categoria e Busca.
// Layout do card:  [ícone]
//                  Nome do produto + marca   (ex.: "Arroz Branco Manaus")
//                  Tamanho da embalagem      (ex.: "500 g")
//                  mercado · bairro · distância · quando
//                  R$ por kg/L                              [+]
import { iconeCategoria } from "./icones.js";
import { formatarPreco, tempoRelativo, UNIDADES } from "./banco.js";

export function el(tag, classe, texto) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined) e.textContent = texto;
    return e;
}

// ---- Lista/cesta (mesma chave da Home). Fora da Home, este módulo assume o clique no "+".
const CHAVE_LISTA = "precoai:lista";
export function inicializarLista(avisar = () => {}) {
    if (window.listaIds) return;   // a Home (script.js) já cuida disso
    try { window.listaIds = new Set(JSON.parse(localStorage.getItem(CHAVE_LISTA) || "[]")); } catch { window.listaIds = new Set(); }
    document.addEventListener("click", e => {
        const btn = e.target.closest(".btn-add");
        if (!btn) return;
        const id = btn.dataset.produtoId, nome = btn.dataset.nome || "Produto";
        const on = !window.listaIds.has(id);
        on ? window.listaIds.add(id) : window.listaIds.delete(id);
        try { localStorage.setItem(CHAVE_LISTA, JSON.stringify([...window.listaIds])); } catch { /* modo privado */ }
        document.querySelectorAll(".btn-add").forEach(b => {
            if (b.dataset.produtoId !== id) return;
            b.classList.toggle("on", on);
            b.textContent = on ? "✓" : "+";
            b.setAttribute("aria-label", `${on ? "Remover" : "Adicionar"} ${nome} ${on ? "da" : "à"} lista`);
        });
        avisar(on ? `${nome} adicionado à lista` : `${nome} removido da lista`);
    });
}

function meta(item) {
    const km = Number.isFinite(item.distanciaKm) ? `${item.distanciaKm.toFixed(1).replace(".", ",")} km` : "";
    return [item.mercado, item.bairro, km, tempoRelativo(item.dataConsulta)].filter(Boolean).join(" · ");
}

export const preco = item => `${formatarPreco(item.valor)} ${UNIDADES[item.unidade] || ""}`.trim();

// "Arroz Branco Manaus": nome do produto + variação + marca. Sem marca identificada, fica só "Arroz Branco".
export const tituloProduto = item => [item.nome, item.variacao, item.marca].filter(Boolean).join(" ");

function botaoAdicionar(item) {
    const na = !!window.listaIds?.has(item.id);
    const b = el("button", "btn-add" + (na ? " on" : ""), na ? "✓" : "+");
    b.type = "button";
    b.dataset.produtoId = item.id;
    b.dataset.nome = item.nome;
    b.setAttribute("aria-label", `${na ? "Remover" : "Adicionar"} ${item.nome} ${na ? "da" : "à"} lista`);
    return b;
}

// Toque no card abre a página do produto com todas as ofertas (marcas, mercados, bairros).
function tornarClicavel(elemento, item, bairro) {
    elemento.style.cursor = "pointer";
    elemento.addEventListener("click", e => {
        if (e.target.closest(".btn-add")) return;
        const params = new URLSearchParams({ id: item.id });
        if (bairro) params.set("bairro", bairro);
        location.href = `produto.html?${params}`;
    });
}

export function card(item, { bairro = "", tag = "Menor preço" } = {}) {
    const c = el("article", "card");
    const img = el("div", "img");
    img.append(iconeCategoria(item.categoriaId));
    if (tag) img.append(el("span", "tag", tag));
    const linha = el("div", "price-row");
    linha.append(el("strong", "price", preco(item)), botaoAdicionar(item));
    c.append(img, el("h3", "card-titulo", tituloProduto(item)));
    if (item.tamanho) c.append(el("p", "card-tamanho", item.tamanho));
    c.append(el("p", "meta", meta(item)), linha);
    tornarClicavel(c, item, bairro);
    return c;
}

export function linha(item, { bairro = "" } = {}) {
    const a = el("article", "row");
    const info = el("div", "row-info");
    info.append(el("h3", "card-titulo", tituloProduto(item)));
    if (item.tamanho) info.append(el("p", "card-tamanho", item.tamanho));
    info.append(el("p", "meta", meta(item)), el("strong", "price", preco(item)));
    const fig = el("div", "img");
    fig.append(iconeCategoria(item.categoriaId));
    a.append(fig, info, botaoAdicionar(item));
    tornarClicavel(a, item, bairro);
    return a;
}
