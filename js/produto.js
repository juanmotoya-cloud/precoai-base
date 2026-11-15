import { carregarResumo, formatarPreco, tempoRelativo, converterData, descricaoLegivel, normalizar, UNIDADES } from "./banco.js";
import { carregarCategorias } from "./json.js";
import { icone, iconeCategoria } from "./icones.js";

const params = new URLSearchParams(location.search);
const id = params.get("id");
const bairro = params.get("bairro") || "";
const MAX_DIAS = 7;
const $ = s => document.querySelector(s);

function el(tag, classe, texto) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined) e.textContent = texto;
    return e;
}
const lerSet = chave => { try { return new Set(JSON.parse(localStorage.getItem(chave) || "[]")); } catch { return new Set(); } };
const salvarSet = (chave, s) => { try { localStorage.setItem(chave, JSON.stringify([...s])); } catch { /* modo privado */ } };
const dia = d => d ? d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "";

let tt;
function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(tt);
    tt = setTimeout(() => t.classList.remove("show"), 1800);
}

function linha(o, unidade, primeira, semTamanho) {
    const a = el("article", "cmp" + (primeira ? " first" : ""));
    const ic = el("span", "cmp-ic");
    ic.append(icone("store"));
    const info = el("div", "cmp-info");
    const detalhe = [o.bairro, "SEFAZ/AM", dia(converterData(o.dataConsulta)) || tempoRelativo(o.dataConsulta)].filter(Boolean).join(" · ");
    info.append(el("h3", "", o.mercado || "Mercado não identificado"), el("p", "meta", detalhe), el("p", "marca", descricaoLegivel(o.nomeEncontrado)));
    const preco = el("strong", "price", semTamanho ? formatarPreco(o.preco) : `${formatarPreco(o.precoReferencia)} ${UNIDADES[unidade] || ""}`);
    a.append(ic, info, preco);
    return a;
}

function desenharGrafico(ofertas) {
    const porDia = new Map();
    ofertas.forEach(o => {
        const d = converterData(o.dataConsulta);
        if (!d) return;
        const k = d.toISOString().slice(0, 10);
        const x = porDia.get(k) || { soma: 0, n: 0 };
        x.soma += o.precoReferencia; x.n++;
        porDia.set(k, x);
    });
    const pontos = [...porDia.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({ k, y: v.soma / v.n }));
    const box = $("#chart");
    if (pontos.length < 2) { box.replaceChildren(el("p", "estado", "O histórico aparece depois de alguns dias de coleta.")); return; }
    const min = Math.min(...pontos.map(p => p.y)), max = Math.max(...pontos.map(p => p.y)), span = max - min || 1;
    const xy = pontos.map((p, i) => [20 + i * (260 / (pontos.length - 1)), 80 - ((p.y - min) / span) * 60]);
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 300 110");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Preço médio por dia");
    const linhaSvg = document.createElementNS(NS, "polyline");
    linhaSvg.setAttribute("points", xy.map(p => p.join(",")).join(" "));
    linhaSvg.setAttribute("fill", "none"); linhaSvg.setAttribute("stroke", "#F20D18");
    linhaSvg.setAttribute("stroke-width", "3"); linhaSvg.setAttribute("stroke-linecap", "round"); linhaSvg.setAttribute("stroke-linejoin", "round");
    svg.append(linhaSvg);
    xy.forEach(([x, y], i) => {
        const c = document.createElementNS(NS, "circle");
        c.setAttribute("cx", x); c.setAttribute("cy", y); c.setAttribute("r", 4); c.setAttribute("fill", "#FFD21C"); c.setAttribute("stroke", "#292929"); c.setAttribute("stroke-width", "1.5");
        svg.append(c);
        const t = document.createElementNS(NS, "text");
        t.setAttribute("x", x); t.setAttribute("y", 102); t.setAttribute("text-anchor", "middle"); t.setAttribute("font-size", "10"); t.setAttribute("fill", "#777");
        t.textContent = dia(new Date(pontos[i].k + "T12:00:00"));
        svg.append(t);
    });
    box.replaceChildren(svg);
}

async function iniciar() {
    const lista = $("#lista");
    try {
        const [resumo, categorias] = await Promise.all([carregarResumo(), carregarCategorias().catch(() => [])]);
        const produto = resumo.find(p => p.id === id);
        if (!produto) { lista.replaceChildren(el("p", "estado", "Produto não encontrado.")); return; }
        const unidade = produto.unidadeComparacao || "kg";
        const nomeCat = categorias.find(c => c.id === produto.categoriaId)?.nome || "";
        $("#titulo").textContent = $("#nome").textContent = produto.nome;
        document.title = `PreçoAí — ${produto.nome}`;
        $("#hero").append(iconeCategoria(produto.categoriaId));
        $("#subtitulo").textContent = [nomeCat, `Unidade: ${unidade === "l" ? "L" : "kg"}`].filter(Boolean).join(" · ");
        $("#comp-sub").textContent = `Do menor para o maior · Manaus${bairro ? " · bairro filtrado" : ""}`;

        const limite = Date.now() - MAX_DIAS * 86400000;
        const ofertas = (produto.ofertas || []).filter(o => {
            const d = converterData(o.dataConsulta);
            return (!d || d.getTime() >= limite) && (!bairro || normalizar(o.bairro || "") === bairro);
        });
        const comTamanho = ofertas.filter(o => o.precoReferencia > 0).sort((a, b) => a.precoReferencia - b.precoReferencia);
        const semTamanho = ofertas.filter(o => !(o.precoReferencia > 0)).sort((a, b) => a.preco - b.preco);

        const melhor = comTamanho[0];
        if (melhor) {
            const box = $("#melhor");
            box.hidden = false;
            box.append(el("span", "tag", "Menor preço"), el("strong", "big", `${formatarPreco(melhor.precoReferencia)} ${UNIDADES[unidade] || ""}`),
                el("p", "", [melhor.mercado, melhor.bairro].filter(Boolean).join(" · ")),
                el("p", "meta", `Fonte: SEFAZ/AM · registrado em ${dia(converterData(melhor.dataConsulta)) || tempoRelativo(melhor.dataConsulta)}`));
            const [lat, lon] = [Number(melhor.latitude), Number(melhor.longitude)];
            if (Number.isFinite(lat) && Number.isFinite(lon)) $("#mapa").href = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
        }
        if (!$("#mapa").href) $("#mapa").addEventListener("click", e => { e.preventDefault(); toast("Localização do mercado indisponível"); });

        // Filtrar: alterna entre "menor preço" e "mais recente"
        let ordem = "preco";
        const desenharLista = () => {
            const base = ordem === "preco" ? comTamanho : [...comTamanho].sort((a, b) => (converterData(b.dataConsulta) || 0) - (converterData(a.dataConsulta) || 0));
            const filhos = base.map((o, i) => linha(o, unidade, i === 0, false));
            if (semTamanho.length) {
                filhos.push(el("p", "aviso-tam", "Sem tamanho informado: preço da embalagem, fora do cálculo de menor preço."));
                filhos.push(...semTamanho.map(o => linha(o, unidade, false, true)));
            }
            lista.replaceChildren(...(filhos.length ? filhos : [el("p", "estado", "Sem ofertas recentes.")]));
        };
        $("#filtro").addEventListener("click", e => {
            ordem = ordem === "preco" ? "recente" : "preco";
            e.currentTarget.textContent = ordem === "preco" ? "Filtrar" : "Mais recentes";
            desenharLista();
        });
        desenharLista();
        desenharGrafico(comTamanho);

        // Favoritos e cesta (mesma chave do app da Home)
        const favs = lerSet("precoai:favoritos"), cesta = lerSet("precoai:lista");
        const fav = $("#fav"), add = $("#add");
        const pintar = () => {
            fav.classList.toggle("on", favs.has(id)); fav.setAttribute("aria-pressed", favs.has(id));
            add.classList.toggle("on", cesta.has(id)); add.textContent = cesta.has(id) ? "✓ Na cesta" : "Adicionar à cesta";
        };
        fav.addEventListener("click", () => { favs.has(id) ? favs.delete(id) : favs.add(id); salvarSet("precoai:favoritos", favs); pintar(); toast(favs.has(id) ? "Adicionado aos favoritos" : "Removido dos favoritos"); });
        add.addEventListener("click", () => { cesta.has(id) ? cesta.delete(id) : cesta.add(id); salvarSet("precoai:lista", cesta); pintar(); toast(cesta.has(id) ? "Adicionado à cesta" : "Removido da cesta"); });
        pintar();
    } catch (erro) {
        console.error(erro);
        lista.replaceChildren(el("p", "estado", "Não foi possível carregar as ofertas."));
    }
}
iniciar();
