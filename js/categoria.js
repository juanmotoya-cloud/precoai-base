import { buscarMenoresPrecos } from "./banco.js";
import { carregarCategorias } from "./json.js";
import { card, el, inicializarLista } from "./cards.js";
import { lerPosicaoSalva, lerBairroSalvo } from "./localizacao.js";
import { intercalarAnuncios } from "./anuncios.js";

const params = new URLSearchParams(location.search);
const id = params.get("id");
const salvo = lerBairroSalvo();
const bairro = params.get("bairro") || salvo?.chave || "";
const bairroNome = salvo && salvo.chave === bairro ? salvo.nome : bairro.replace(/\b\w/g, l => l.toUpperCase());
const posicao = lerPosicaoSalva();   // gravada pela Home quando o usuário ativa a localização
const $ = s => document.querySelector(s);

let tt;
function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(tt);
    tt = setTimeout(() => t.classList.remove("show"), 1800);
}
inicializarLista(toast);

let cards = [];
const grade = $("#lista");
function desenhar() {
    grade.replaceChildren(...(cards.length ? intercalarAnuncios(cards) : [el("p", "estado", "Ainda não há preços recentes nesta categoria.")]));
}

async function iniciar() {
    // A tela aparece na hora: título pelo JSON local (pequeno) e cartões de espera enquanto os preços chegam.
    grade.replaceChildren(...Array.from({ length: 4 }, () => el("div", "card esqueleto")));
    carregarCategorias().then(cs => {
        const nome = cs.find(c => c.id === id)?.nome;
        if (nome) { $("#titulo").textContent = nome; document.title = `PreçoAí — ${nome}`; }
    }).catch(() => {});
    try {
        const [categorias, todos] = await Promise.all([carregarCategorias().catch(() => []), buscarMenoresPrecos({ bairro: bairro || null, latitude: posicao?.latitude, longitude: posicao?.longitude, raioKm: bairro ? null : (posicao?.raioKm ?? null) })]);
        const cat = categorias.find(c => c.id === id);
        const nome = cat?.nome || "Categoria";
        $("#titulo").textContent = nome;
        document.title = `PreçoAí — ${nome}`;
        const itens = todos.filter(i => i.categoriaId === id).sort((a, b) => a.ordem - b.ordem || a.valor - b.valor);
        $("#subtitulo").textContent = (itens.length ? `${itens.length} produto(s) com o menor preço` : "") + (bairro ? "" : posicao?.raioKm ? ` · até ${posicao.raioKm} km de você` : " · Manaus");
        if (bairro) $("#subtitulo").after(Object.assign(el("span", "chip-local", `Bairro: ${bairroNome}`), { id: "chip-bairro" }));
        cards = itens.map(i => card(i, { bairro }));
        desenhar();
    } catch (erro) {
        console.error(erro);
        grade.replaceChildren(el("p", "estado", "Não foi possível carregar os preços. Tente novamente."));
    }
}
iniciar();
