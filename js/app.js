import { el, card as cardBase, linha as linhaBase } from "./cards.js";
import { RAIOS_KM, lerPosicaoSalva, salvarPosicao, limparPosicao, dentroDeManaus, posicaoAproximada, estadoPermissao, obterPosicao, mensagemErro, lerBairroSalvo, salvarBairro, nomesDoBairroNoMapa } from "./localizacao.js";
import { criarAnuncio, formatoAtual } from "./anuncios.js";
import { buscarMenoresPrecos, pesquisarProdutos, bairrosDisponiveis, carregarResumo, combinarBairro, bairroMaisProximo } from "./banco.js";

const $ = (s, r = document) => r.querySelector(s);
const cesta = $("#cesta-produtos");
const maisBuscados = $("#mais-buscados");
const secaoResultados = $("#resultados");
const gridResultados = $("#resultados-lista");
const tituloResultados = $("#resultados-titulo");
const campoBusca = $("#search");
const botaoLocalizacao = $("#location-btn");
const textoLocalizacao = $("#location-label");
const MIN_ITENS_NO_RAIO = 5;   // se o menor raio tiver menos produtos que isso, abre para o próximo

const seletorBairro = $("#bairro-select");
const rotuloOriginal = textoLocalizacao.innerHTML;
const estado = { posicao: null, raioKm: null, manausInteira: false, aproximada: false, bairro: "", bairroNome: "", detectado: false, bairroForaDaBase: "", categoria: "todos", texto: "" };
const nomesCategorias = {};
document.querySelectorAll("#categorias .cat").forEach(b => {
    nomesCategorias[b.dataset.cat] = b.textContent.trim();
});

function opcoes() {
    return { latitude: estado.posicao?.latitude, longitude: estado.posicao?.longitude, raioKm: estado.raioKm, bairro: estado.bairro || null };
}

const card = item => cardBase(item, { bairro: estado.bairro });
const linha = item => linhaBase(item, { bairro: estado.bairro });

function mensagem(texto, comBotao) {
    const p = el("p", "estado", texto);
    if (comBotao) {
        const b = el("button", "btn-amarelo", "Ver Manaus inteira");
        b.type = "button";
        b.addEventListener("click", () => { estado.manausInteira = true; atualizar(); });
        p.append(document.createElement("br"), b);
    }
    return p;
}

function vazio() {
    if (estado.bairro) return mensagem("Não encontramos preços recentes neste bairro. Escolha outro bairro ou veja Manaus inteira.");
    return estado.raioKm
        ? mensagem(`Não encontramos preços recentes em mercados a até ${estado.raioKm} km.`, true)
        : mensagem("Ainda não há preços recentes para estes itens.");
}

// Texto do botão de localização, conforme o que está valendo agora.
function atualizarRotulo() {
    if (estado.bairro) {
        textoLocalizacao.textContent = `Preços no bairro ${estado.bairroNome}${estado.detectado ? " · detectado pela sua localização · toque para atualizar" : ""}`;
    } else if (estado.posicao && estado.bairroForaDaBase) {
        textoLocalizacao.textContent = `Você está em ${estado.bairroForaDaBase}, sem preços recentes aqui: mostrando mercados perto de você · toque para atualizar`;
    } else if (estado.posicao && estado.raioKm) {
        textoLocalizacao.textContent = `Preços em até ${estado.raioKm} km da sua localização${estado.aproximada ? " (aproximada)" : ""} · toque para atualizar`;
    } else if (estado.posicao) {
        textoLocalizacao.textContent = "Poucos mercados perto de você: mostrando Manaus inteira, do mais perto ao mais longe · toque para atualizar";
    } else {
        textoLocalizacao.innerHTML = rotuloOriginal;
    }
}

// Menor raio (3, 5 ou 10 km) que já traz produtos suficientes; se nenhum, Manaus inteira.
async function escolherRaio() {
    if (estado.manausInteira) return null;
    for (const r of RAIOS_KM) {
        const itens = await buscarMenoresPrecos({ ...opcoes(), raioKm: r });
        if (itens.length >= MIN_ITENS_NO_RAIO) return r;
    }
    return null;
}

function desenharResultados(titulo, itens) {
    secaoResultados.hidden = false;
    tituloResultados.textContent = titulo;
    gridResultados.replaceChildren(...(itens.length ? itens.map(card) : [vazio()]));
}

// Opção do <select> para um bairro (usada na lista completa e para mostrar o bairro salvo antes da lista chegar).
function opcaoBairro(chave, nome) {
    const o = document.createElement("option");
    o.value = chave;
    o.textContent = nome;
    return o;
}

// O bairro salvo aparece no seletor já na primeira tela, sem esperar o banco responder.
function mostrarBairroSalvo() {
    if (!estado.bairro || !seletorBairro) return;
    seletorBairro.appendChild(opcaoBairro(estado.bairro, estado.bairroNome));
    seletorBairro.value = estado.bairro;
}

let bairrosPreenchidos = false;
async function preencherBairros() {
    if (bairrosPreenchidos) return;
    const lista = await bairrosDisponiveis();
    if (!lista.length) return;
    bairrosPreenchidos = true;
    const escolhido = estado.bairro;
    seletorBairro.replaceChildren(opcaoBairro("", "Todos os bairros de Manaus"), ...lista.map(b => opcaoBairro(b.chave, b.nome)));
    if (escolhido) {
        // Nunca apaga a escolha do usuário: se o bairro não tem ofertas agora, ele continua selecionado
        // (a tela avisa que não há preços recentes e ele pode trocar quando quiser).
        if (![...seletorBairro.options].some(o => o.value === escolhido)) seletorBairro.appendChild(opcaoBairro(escolhido, estado.bairroNome));
        seletorBairro.value = escolhido;
    }
}

seletorBairro?.addEventListener("change", () => {
    estado.bairro = seletorBairro.value;
    estado.bairroNome = estado.bairro ? seletorBairro.selectedOptions[0].textContent : "";
    estado.detectado = false; estado.bairroForaDaBase = "";
    salvarBairro(estado.bairro, estado.bairroNome);   // lembra a escolha nas próximas visitas
    atualizar();
});

async function atualizar() {
    cesta.replaceChildren(mensagem("Carregando menores preços..."));
    try {
        estado.raioKm = estado.posicao && !estado.bairro ? await escolherRaio() : null;
        if (estado.posicao) salvarPosicao(estado.posicao, estado.bairro ? null : estado.raioKm);
        atualizarRotulo();
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

// ---- Localização do celular
// O navegador só pede permissão depois de um toque do usuário. Se a permissão já foi dada antes
// (ou a posição ainda está guardada, 30 min), o app usa a localização sozinho ao abrir.
function receberPosicao(posicao, { manterBairro = false } = {}) {
    if (!dentroDeManaus(posicao)) {
        estado.posicao = null;
        limparPosicao();
        textoLocalizacao.textContent = "Você parece estar fora de Manaus. O PreçoAí mostra os preços de Manaus inteira.";
        return false;
    }
    estado.posicao = posicao;
    estado.aproximada = posicaoAproximada(posicao);
    estado.manausInteira = false;
    // Tocar em "Usar minha localização" troca o bairro pela posição do celular. Já a localização automática
    // (silenciosa) nunca desfaz o bairro que o usuário escolheu: só guarda a posição para mostrar distâncias.
    if (!manterBairro) {
        estado.bairro = ""; estado.bairroNome = "";
        salvarBairro(null);
        if (seletorBairro) seletorBairro.value = "";
    }
    return true;
}

// Descobre o bairro de quem está com a localização ligada e seleciona (e guarda) esse bairro.
// Se o bairro não tem preços recentes, volta para "mercados perto de você" e avisa onde a pessoa está.
async function detectarBairro(posicao) {
    estado.detectado = false; estado.bairroForaDaBase = "";
    try {
        const [lista, nomes] = await Promise.all([bairrosDisponiveis(), nomesDoBairroNoMapa(posicao)]);
        let achado = combinarBairro(nomes, lista);
        if (!achado && !nomes.length) achado = bairroMaisProximo(await carregarResumo(), posicao.latitude, posicao.longitude);
        if (!achado) { estado.bairroForaDaBase = nomes[0] || ""; return; }
        const itens = await buscarMenoresPrecos({ bairro: achado.chave });
        if (!itens.length) { estado.bairroForaDaBase = achado.nome; return; }
        estado.bairro = achado.chave; estado.bairroNome = achado.nome; estado.detectado = true;
        salvarBairro(achado.chave, achado.nome);
        if (![...seletorBairro.options].some(o => o.value === achado.chave)) seletorBairro.appendChild(opcaoBairro(achado.chave, achado.nome));
        seletorBairro.value = achado.chave;
    } catch (erro) { console.warn("Bairro:", erro); }
}

async function ativarLocalizacao({ silencioso = false } = {}) {
    textoLocalizacao.textContent = "Obtendo sua localização...";
    botaoLocalizacao.disabled = true;
    try {
        const posicao = await obterPosicao();
        // Se o usuário escolheu um bairro enquanto a posição chegava, a escolha dele vale.
        if (receberPosicao(posicao, { manterBairro: silencioso })) {
            textoLocalizacao.textContent = "Descobrindo o seu bairro...";
            // se o usuário escolheu um bairro enquanto a posição chegava, a escolha dele vale
            if (!(silencioso && estado.bairro)) await detectarBairro(posicao);
            await atualizar();
        }
    } catch (erro) {
        console.warn("Localização:", erro);
        if (silencioso) textoLocalizacao.innerHTML = rotuloOriginal;
        else textoLocalizacao.textContent = mensagemErro(erro);
    } finally {
        botaoLocalizacao.disabled = false;
    }
}
botaoLocalizacao?.addEventListener("click", () => ativarLocalizacao());

async function iniciar() {
    // Bairro escolhido numa visita anterior (se houver) vale já na primeira tela.
    const bairroSalvo = lerBairroSalvo();
    if (bairroSalvo) { estado.bairro = bairroSalvo.chave; estado.bairroNome = bairroSalvo.nome; mostrarBairroSalvo(); }
    const salva = lerPosicaoSalva();
    if (salva && dentroDeManaus(salva)) {
        // mantém o bairro escolhido; a posição só serve para mostrar as distâncias
        estado.posicao = salva;
        estado.aproximada = posicaoAproximada(salva);
    }
    atualizar();
    if (!estado.posicao && !estado.bairro && await estadoPermissao() === "granted") ativarLocalizacao({ silencioso: true });
}
// Espaço de anúncio abaixo das categorias (segue o filtro 300×100 / 970×90 escolhido na página de categoria).
const formatoAnuncio = formatoAtual();
if (formatoAnuncio) $("#anuncio-categorias")?.append(criarAnuncio(formatoAnuncio));
iniciar();
