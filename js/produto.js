import { carregarResumo, marcaDaOferta, corrigirCoordenadas, distanciaKm, valorComparavel, formatarPreco, tempoRelativo, converterData, descricaoLegivel, normalizar, UNIDADES } from "./banco.js";
import { carregarCategorias } from "./json.js";
import { icone, iconeCategoria } from "./icones.js";
import { lerPosicaoSalva, lerBairroSalvo } from "./localizacao.js";

const params = new URLSearchParams(location.search);
const id = params.get("id");
const bairro = params.get("bairro") || lerBairroSalvo()?.chave || "";
const MAX_DIAS = 7;
const posicao = lerPosicaoSalva();
const salvoBairro = lerBairroSalvo();
const nomeBairro = salvoBairro?.chave === bairro ? salvoBairro.nome : bairro;
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

const kmTexto = o => Number.isFinite(o.distanciaKm) ? `${o.distanciaKm.toFixed(1).replace(".", ",")} km` : "";
const rotaUrl = o => {
    const c = corrigirCoordenadas(o.latitude, o.longitude);   // desfaz latitude/longitude trocadas
    return c ? `https://www.google.com/maps/dir/?api=1&destination=${c.latitude},${c.longitude}&travelmode=driving` : "";
};

function linha(o, unidade, primeira, semTamanho) {
    const a = el("article", "cmp" + (primeira ? " first" : ""));
    const ic = el("span", "cmp-ic");
    ic.append(icone("store"));
    const info = el("div", "cmp-info");
    const detalhe = [o.bairro, kmTexto(o), "SEFAZ/AM", dia(converterData(o.dataConsulta)) || tempoRelativo(o.dataConsulta)].filter(Boolean).join(" · ");
    info.append(el("h3", "", o.mercado || "Mercado não identificado"), el("p", "meta", detalhe), el("p", "marca", descricaoLegivel(o.nomeEncontrado)));
    const marcaOf = marcaDaOferta(o);
    if (marcaOf) info.querySelector("h3").after(Object.assign(el("span", "selo-marca", marcaOf), {}));
    const rota = rotaUrl(o);
    if (rota) {
        const a2 = el("a", "rota", "Como chegar");
        a2.href = rota; a2.target = "_blank"; a2.rel = "noopener";
        info.append(a2);
    }
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
        $("#subtitulo").textContent = [nomeCat, unidade === "un" ? "Preço por unidade/embalagem" : `Unidade: ${unidade === "l" ? "L" : "kg"}`].filter(Boolean).join(" · ");
        $("#comp-sub").textContent = `Do menor para o maior · Manaus${bairro ? ` · bairro ${nomeBairro}` : ""}${posicao ? " · distâncias a partir de você" : ""}`;

        const limite = Date.now() - MAX_DIAS * 86400000;
        const ofertas = (produto.ofertas || []).filter(o => {
            const d = converterData(o.dataConsulta);
            return (!d || d.getTime() >= limite) && (!bairro || normalizar(o.bairro || "") === bairro);
        }).map(o => {
            // distância a partir da localização do celular (quando ela foi ativada na Home)
            const c = corrigirCoordenadas(o.latitude, o.longitude);
            const valor = valorComparavel(produto, o);
            return { ...o, latitude: c?.latitude ?? null, longitude: c?.longitude ?? null, precoReferencia: valor > 0 ? valor : null, distanciaKm: posicao && c ? distanciaKm(posicao.latitude, posicao.longitude, c.latitude, c.longitude) : null };
        });
        let marcaEscolhida = "";
        const todasComTamanho = ofertas.filter(o => o.precoReferencia > 0).sort((a, b) => a.precoReferencia - b.precoReferencia);
        const todasSemTamanho = ofertas.filter(o => !(o.precoReferencia > 0)).sort((a, b) => a.preco - b.preco);
        const doFiltro = o => !marcaEscolhida || marcaDaOferta(o) === marcaEscolhida;
        let comTamanho = todasComTamanho, semTamanho = todasSemTamanho;

        // Menor preço por marca: toque numa marca para ver só as ofertas dela.
        const porMarca = new Map();
        for (const o of todasComTamanho) { const m = marcaDaOferta(o); if (m && !porMarca.has(m)) porMarca.set(m, { marca: m, menor: o.precoReferencia, total: 0 }); if (m) porMarca.get(m).total++; }
        const caixaMarcas = $("#marcas");
        const desenharMarcas = () => {
            if (porMarca.size < 2) { caixaMarcas.hidden = true; return; }
            caixaMarcas.hidden = false;
            const chip = (rotulo, marca) => { const b = el("button", "chip" + (marca === marcaEscolhida ? " on" : ""), rotulo); b.type = "button"; b.setAttribute("aria-pressed", marca === marcaEscolhida); b.addEventListener("click", () => { marcaEscolhida = marca; aplicar(); }); return b; };
            caixaMarcas.replaceChildren(chip("Todas as marcas", ""), ...[...porMarca.values()].sort((a, b) => a.menor - b.menor).map(m => chip(`${m.marca} · ${formatarPreco(m.menor)}`, m.marca)));
        };
        const aplicar = () => { comTamanho = todasComTamanho.filter(doFiltro); semTamanho = todasSemTamanho.filter(doFiltro); desenharMarcas(); desenharLista(); desenharGrafico(comTamanho); };

        const melhor = comTamanho[0];
        if (melhor) {
            const box = $("#melhor");
            box.hidden = false;
            box.append(el("span", "tag", "Menor preço"), el("strong", "big", `${formatarPreco(melhor.precoReferencia)} ${UNIDADES[unidade] || ""}`),
                el("p", "", [melhor.mercado, melhor.bairro].filter(Boolean).join(" · ")),
                el("p", "meta", `Fonte: SEFAZ/AM · registrado em ${dia(converterData(melhor.dataConsulta)) || tempoRelativo(melhor.dataConsulta)}`));
            const rota = rotaUrl(melhor);
            if (rota) $("#mapa").href = rota;
            if (Number.isFinite(melhor.distanciaKm)) box.append(el("p", "meta", `A ${kmTexto(melhor)} de você`));
        }
        if (!$("#mapa").href) $("#mapa").addEventListener("click", e => { e.preventDefault(); toast("Localização do mercado indisponível"); });

        // Botão de ordem: menor preço → mais perto (se a localização estiver ativa) → mais recentes
        const ordens = posicao ? ["preco", "perto", "recente"] : ["preco", "recente"];
        const rotulos = { preco: "Menor preço", perto: "Mais perto", recente: "Mais recentes" };
        let ordem = "preco";
        const desenharLista = () => {
            const base = ordem === "preco" ? comTamanho
                : ordem === "perto" ? [...comTamanho].sort((a, b) => (a.distanciaKm ?? Infinity) - (b.distanciaKm ?? Infinity) || a.precoReferencia - b.precoReferencia)
                : [...comTamanho].sort((a, b) => (converterData(b.dataConsulta) || 0) - (converterData(a.dataConsulta) || 0));
            const filhos = base.map((o, i) => linha(o, unidade, i === 0, false));
            if (semTamanho.length) {
                filhos.push(el("p", "aviso-tam", "Sem tamanho informado: preço da embalagem, fora do cálculo de menor preço."));
                filhos.push(...semTamanho.map(o => linha(o, unidade, false, true)));
            }
            lista.replaceChildren(...(filhos.length ? filhos : [el("p", "estado", "Sem ofertas recentes.")]));
        };
        $("#filtro").textContent = "Ordem: " + rotulos[ordem];
        $("#filtro").addEventListener("click", e => {
            ordem = ordens[(ordens.indexOf(ordem) + 1) % ordens.length];
            e.currentTarget.textContent = "Ordem: " + rotulos[ordem];
            desenharLista();
        });
        desenharMarcas();
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
