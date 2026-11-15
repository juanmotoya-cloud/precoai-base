import { iconeCategoria } from "./icones.js";
import { descricaoLegivel, buscarMenoresPrecos, pesquisarProdutos, bairrosDisponiveis, formatarPreco, tempoRelativo, UNIDADES } from "./banco.js";

const $ = (s, r = document) => r.querySelector(s);
const cesta = $("#cesta-produtos");
const maisBuscados = $("#mais-buscados");
const secaoResultados = $("#resultados");
const gridResultados = $("#resultados-lista");
const tituloResultados = $("#resultados-titulo");
const campoBusca = $("#search");
const botaoLocalizacao = $("#location-btn");
const textoLocalizacao = $("#location-label");
const RAIO_KM = 3;

const seletorBairro = $("#bairro-select");
const rotuloOriginal = textoLocalizacao.innerHTML;
const estado = { posicao: null, raioKm: null, bairro: "", categoria: "todos", texto: "" };
const nomesCategorias = {};
document.querySelectorAll("#categorias .cat").forEach(b => {
    nomesCategorias[b.dataset.cat] = b.textContent.trim();
});

function el(tag, classe, texto) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined) e.textContent = texto;
    return e;
}

function opcoes() {
    return { latitude: estado.posicao?.latitude, longitude: estado.posicao?.longitude, raioKm: estado.raioKm, bairro: estado.bairro || null };
}

function meta(item) {
    const km = Number.isFinite(item.distanciaKm) ? `${item.distanciaKm.toFixed(1).replace(".", ",")} km` : "";
    return [item.mercado, item.bairro, km, tempoRelativo(item.dataConsulta)].filter(Boolean).join(" · ");
}

function botaoAdicionar(item) {
    const b = el("button", "btn-add", window.listaIds?.has(item.id) ? "✓" : "+");
    b.type = "button";
    b.dataset.produtoId = item.id;
    b.dataset.nome = item.nome;
    b.classList.toggle("on", !!window.listaIds?.has(item.id));
    b.setAttribute("aria-label", `${window.listaIds?.has(item.id) ? "Remover" : "Adicionar"} ${item.nome} ${window.listaIds?.has(item.id) ? "da" : "à"} lista`);
    return b;
}

function preco(item) {
    return `${formatarPreco(item.valor)} ${UNIDADES[item.unidade] || ""}`.trim();
}

// Toque no card abre a página do produto com todas as ofertas (marcas, mercados, bairros).
function tornarClicavel(elemento, item) {
    elemento.style.cursor = "pointer";
    elemento.addEventListener("click", e => {
        if (e.target.closest(".btn-add")) return;
        const params = new URLSearchParams({ id: item.id });
        if (estado.bairro) params.set("bairro", estado.bairro);
        location.href = `produto.html?${params}`;
    });
}

function card(item) {
    const c = el("article", "card");
    const img = el("div", "img");
    img.append(iconeCategoria(item.categoriaId), el("span", "tag", "Menor preço"));
    const linha = el("div", "price-row");
    linha.append(el("strong", "price", preco(item)), botaoAdicionar(item));
    c.append(img, el("h3", "", item.nome), el("p", "marca", descricaoLegivel(item.nomeEncontrado)), el("p", "meta", meta(item)), linha);
    tornarClicavel(c, item);
    return c;
}

function linha(item) {
    const a = el("article", "row");
    const info = el("div", "row-info");
    info.append(el("h3", "", item.nome), el("p", "marca", descricaoLegivel(item.nomeEncontrado)), el("p", "meta", meta(item)), el("strong", "price", preco(item)));
    const fig = el("div", "img");
    fig.append(iconeCategoria(item.categoriaId));
    a.append(fig, info, botaoAdicionar(item));
    tornarClicavel(a, item);
    return a;
}

function mensagem(texto, comBotao) {
    const p = el("p", "estado", texto);
    if (comBotao) {
        const b = el("button", "btn-amarelo", "Ver Manaus inteira");
        b.type = "button";
        b.addEventListener("click", () => { estado.raioKm = null; atualizar(); });
        p.append(document.createElement("br"), b);
    }
    return p;
}

function vazio() {
    if (estado.bairro) return mensagem("Não encontramos preços recentes neste bairro. Escolha outro bairro ou veja Manaus inteira.");
    return estado.raioKm
        ? mensagem(`Não encontramos preços recentes em mercados a até ${RAIO_KM} km.`, true)
        : mensagem("Ainda não há preços recentes para estes itens.");
}

function desenharResultados(titulo, itens) {
    secaoResultados.hidden = false;
    tituloResultados.textContent = titulo;
    gridResultados.replaceChildren(...(itens.length ? itens.map(card) : [vazio()]));
}

let bairrosPreenchidos = false;
async function preencherBairros() {
    if (bairrosPreenchidos) return;
    const lista = await bairrosDisponiveis();
    if (!lista.length) return;
    bairrosPreenchidos = true;
    lista.forEach(b => {
        const o = document.createElement("option");
        o.value = b.chave;
        o.textContent = b.nome;
        seletorBairro.appendChild(o);
    });
}

seletorBairro?.addEventListener("change", () => {
    estado.bairro = seletorBairro.value;
    if (estado.bairro) {
        estado.raioKm = null; // o bairro escolhido substitui o raio de 3 km
        textoLocalizacao.textContent = `Preços no bairro ${seletorBairro.selectedOptions[0].textContent}`;
    } else if (estado.posicao) {
        estado.raioKm = RAIO_KM;
        textoLocalizacao.textContent = `Preços em até ${RAIO_KM} km da sua localização`;
    } else {
        textoLocalizacao.innerHTML = rotuloOriginal;
    }
    atualizar();
});

async function atualizar() {
    cesta.replaceChildren(mensagem("Carregando menores preços..."));
    try {
        const todos = await buscarMenoresPrecos(opcoes());
        preencherBairros().catch(console.error);

        const itensCesta = todos.filter(i => i.cesta).sort((a, b) => a.ordem - b.ordem);
        cesta.replaceChildren(...(itensCesta.length ? itensCesta.map(card) : [vazio()]));

        const populares = todos.filter(i => i.popular).sort((a, b) => a.ordem - b.ordem);
        maisBuscados.replaceChildren(...(populares.length ? populares.map(linha) : [vazio()]));

        await atualizarResultados();
    } catch (erro) {
        console.error("Erro ao buscar preços:", erro);
        const msg = erro.code === "permission-denied"
            ? "Sem permissão para ler os preços. Confira as regras do Firestore."
            : "Não foi possível carregar os preços. Tente novamente.";
        cesta.replaceChildren(mensagem(msg));
    }
}

async function atualizarResultados() {
    const texto = estado.texto.trim();
    if (texto) {
        const itens = await pesquisarProdutos(texto, opcoes(), nomesCategorias);
        desenharResultados(`Resultados para “${texto}”`, itens);
    } else {
        secaoResultados.hidden = true;
        gridResultados.replaceChildren();
    }
}

// ---- Busca (com pequena espera enquanto digita)
let espera;
campoBusca?.addEventListener("input", () => {
    clearTimeout(espera);
    espera = setTimeout(() => { estado.texto = campoBusca.value; atualizarResultados().catch(console.error); }, 250);
});
campoBusca?.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); clearTimeout(espera); estado.texto = campoBusca.value; atualizarResultados().catch(console.error); }
});

// ---- Categorias: cada uma abre a sua própria página (a Home não é poluída com a lista)
$("#categorias")?.addEventListener("click", e => {
    const b = e.target.closest(".cat");
    if (!b || b.dataset.cat === "todos") return;
    const params = new URLSearchParams({ id: b.dataset.cat });
    if (estado.bairro) params.set("bairro", estado.bairro);
    location.href = `categoria.html?${params}`;
});

// ---- Localização (só depois do toque do usuário)
function ativarLocalizacao() {
    if (!navigator.geolocation) {
        textoLocalizacao.textContent = "Seu navegador não oferece suporte à localização.";
        return;
    }
    textoLocalizacao.textContent = "Obtendo sua localização...";
    botaoLocalizacao.disabled = true;
    navigator.geolocation.getCurrentPosition(
        async pos => {
            estado.posicao = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
            estado.raioKm = RAIO_KM;
            estado.bairro = "";
            if (seletorBairro) seletorBairro.value = "";
            textoLocalizacao.textContent = `Preços em até ${RAIO_KM} km da sua localização`;
            botaoLocalizacao.disabled = false;
            await atualizar();
        },
        erro => {
            const msgs = { 1: "Localização negada. Mostrando preços de Manaus inteira.", 2: "Não foi possível identificar sua localização.", 3: "A localização demorou demais. Tente novamente." };
            textoLocalizacao.textContent = msgs[erro.code] || "Não foi possível obter a localização.";
            botaoLocalizacao.disabled = false;
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
}
botaoLocalizacao?.addEventListener("click", ativarLocalizacao);

// Ao abrir, já mostra os menores preços de Manaus; o raio de 3 km entra quando o usuário ativar a localização.
atualizar();
