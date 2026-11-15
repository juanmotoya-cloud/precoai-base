import { buscarMenoresPrecos, descricaoLegivel, formatarPreco, tempoRelativo, normalizar, UNIDADES } from "./banco.js";
import { carregarCategorias } from "./json.js";
import { iconeCategoria } from "./icones.js";

const params = new URLSearchParams(location.search);
const id = params.get("id");
const bairro = params.get("bairro") || "";
const CHAVE = "precoai:lista";
const $ = s => document.querySelector(s);

function el(tag, classe, texto) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined) e.textContent = texto;
    return e;
}
const lerLista = () => { try { return new Set(JSON.parse(localStorage.getItem(CHAVE) || "[]")); } catch { return new Set(); } };
const lista = lerLista();
const salvar = () => { try { localStorage.setItem(CHAVE, JSON.stringify([...lista])); } catch { /* modo privado */ } };

let tt;
function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(tt);
    tt = setTimeout(() => t.classList.remove("show"), 1800);
}

function card(item) {
    const c = el("article", "card");
    c.style.cursor = "pointer";
    const img = el("div", "img");
    img.append(iconeCategoria(item.categoriaId));
    const km = [item.mercado, item.bairro, tempoRelativo(item.dataConsulta)].filter(Boolean).join(" · ");
    const add = el("button", "btn-add" + (lista.has(item.id) ? " on" : ""), lista.has(item.id) ? "✓" : "+");
    add.type = "button";
    add.setAttribute("aria-label", `Adicionar ${item.nome} à cesta`);
    add.addEventListener("click", e => {
        e.stopPropagation();
        lista.has(item.id) ? lista.delete(item.id) : lista.add(item.id);
        salvar();
        add.classList.toggle("on", lista.has(item.id));
        add.textContent = lista.has(item.id) ? "✓" : "+";
        toast(lista.has(item.id) ? `${item.nome} adicionado à cesta` : `${item.nome} removido da cesta`);
    });
    const linha = el("div", "price-row");
    linha.append(el("strong", "price", `${formatarPreco(item.valor)} ${UNIDADES[item.unidade] || ""}`.trim()), add);
    c.append(img, el("h3", "", item.nome), el("p", "marca", descricaoLegivel(item.nomeEncontrado)), el("p", "meta", km), linha);
    c.addEventListener("click", () => {
        const p = new URLSearchParams({ id: item.id });
        if (bairro) p.set("bairro", bairro);
        location.href = `produto.html?${p}`;
    });
    return c;
}

async function iniciar() {
    const grade = $("#lista");
    try {
        const [categorias, todos] = await Promise.all([carregarCategorias().catch(() => []), buscarMenoresPrecos({ bairro: bairro || null })]);
        const cat = categorias.find(c => c.id === id);
        const nome = cat?.nome || "Categoria";
        $("#titulo").textContent = nome;
        document.title = `PreçoAí — ${nome}`;
        const itens = todos.filter(i => i.categoriaId === id).sort((a, b) => a.ordem - b.ordem || a.valor - b.valor);
        $("#subtitulo").textContent = (itens.length ? `${itens.length} produto(s) com o menor preço` : "") + (bairro ? " · bairro filtrado" : " · Manaus");
        grade.replaceChildren(...(itens.length ? itens.map(card) : [el("p", "estado", "Ainda não há preços recentes nesta categoria.")]));
    } catch (erro) {
        console.error(erro);
        grade.replaceChildren(el("p", "estado", "Não foi possível carregar os preços. Tente novamente."));
    }
}
iniciar();
