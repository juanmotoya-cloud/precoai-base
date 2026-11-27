// Funções puras (sem Firebase): fáceis de testar e usadas pelo banco.js e pelo app.js.
import { acharMarca } from "./marcas.js";

export function normalizar(texto = "") {
    return String(texto).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export function paraNumero(valor) {
    if (typeof valor === "number") return valor;
    if (typeof valor !== "string") return NaN;
    let numero = valor.replace(/[^\d,.-]/g, "");
    if (numero.includes(",")) numero = numero.replace(/\./g, "").replace(",", ".");
    return Number(numero);
}

export function formatarPreco(valor) {
    return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function converterData(data) {
    if (!data) return null;
    let d;
    if (typeof data.toDate === "function") d = data.toDate();
    else if (typeof data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data)) d = new Date(data + "T12:00:00");
    else d = new Date(data);
    return Number.isNaN(d.getTime()) ? null : d;
}

export function tempoRelativo(data) {
    const d = converterData(data);
    if (!d) return "";
    const dias = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (dias <= 0) return "hoje";
    if (dias === 1) return "há 1 dia";
    if (dias < 30) return `há ${dias} dias`;
    const meses = Math.floor(dias / 30);
    return meses === 1 ? "há 1 mês" : `há ${meses} meses`;
}

export function distanciaKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const rad = g => g * Math.PI / 180;
    const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 +
        Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const UNIDADES = { kg: "/kg", l: "/L", un: "/un" };

// A SEFAZ às vezes entrega o par invertido (longitude, latitude). Em Manaus a latitude é ≈ -3 e a
// longitude ≈ -60: se a "latitude" sai fora da faixa do Brasil (|valor| > 34) e a "longitude" cabe como
// latitude, os valores são trocados. Valores ausentes ("", null) viram null, nunca 0.
export function corrigirCoordenadas(latitude, longitude) {
    const vazio = v => v === null || v === undefined || v === "";
    if (vazio(latitude) || vazio(longitude)) return null;
    let lat = Number(latitude), lon = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (Math.abs(lat) > 34 && Math.abs(lon) <= 34) [lat, lon] = [lon, lat];
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return { latitude: lat, longitude: lon };
}

// ---- Marca, variação e tamanho a partir da descrição da nota ("ARROZ BCO MANAUS 500G")
const ABREVIACOES = { bco: "Branco", parb: "Parboilizado", parboil: "Parboilizado", int: "Integral", integ: "Integral", desn: "Desnatado", semi: "Semidesnatado" };
const VARIACOES = new Set(["branco", "integral", "parboilizado", "agulhinha", "tipo", "carioca", "preto", "fradinho", "tradicional", "extra",
    "fino", "grosso", "longo", "desnatado", "semidesnatado", "refinado", "cristal", "organico", "fresco", "natural"]);
const RUIDO = new Set(["de", "da", "do", "das", "dos", "e", "em", "com", "para", "pct", "pacote", "pc", "sc", "saco", "fd", "fardo",
    "cx", "caixa", "un", "und", "unid", "kg", "kgs", "g", "gr", "l", "lt", "ml", "emb", "tp",
    "hidrop", "hidro", "hid", "hort", "maco", "saquin", "saquinho", "bdj", "bandeja", "cong", "congelado", "congelada", "resf", "resfriado", "fat", "fatiado",
    "iod", "ref", "moido", "moida", "peso", "liq", "liquido", "cartela", "granel", "unidade", "unidades", "bov", "bovino", "bovina", "mole", "hf", "hc", "env",
    "pet", "lata", "sache", "sch", "especial", "trad", "reg", "regional", "ind", "enc", "prom", "promo", "oferta", "vol", "sab", "mc", "ad", "adic", "temp"]);
const titulo = t => t.charAt(0).toUpperCase() + t.slice(1);

export function formatarTamanho(quantidade, unidade) {
    if (!(quantidade > 0) || (unidade !== "kg" && unidade !== "l")) return "";
    const num = n => String(+n.toFixed(2)).replace(".", ",");
    if (quantidade < 1) return `${Math.round(quantidade * 1000)} ${unidade === "kg" ? "g" : "ml"}`;
    return `${num(quantidade)} ${unidade === "kg" ? "kg" : "L"}`;
}

function tamanhoDoTexto(texto, unidade) {
    const m = String(texto).toLowerCase().match(/(?<![a-z0-9])(\d+(?:[.,]\d+)?)\s*(kg|g|gr|ml|l|lt)(?![a-z])/);
    if (!m) return null;
    const n = Number(m[1].replace(",", "."));
    const fator = { kg: 1, g: .001, gr: .001, ml: .001, l: 1, lt: 1 }[m[2]];
    const ehMassa = ["kg", "g", "gr"].includes(m[2]);
    if ((unidade === "kg") !== ehMassa) return null;
    return n * fator;
}

// Separa a descrição em marca, variação (branco, tipo 1...) e tamanho. Heurística: o que sobra depois de tirar
// o nome do produto, as variações conhecidas, o tamanho e palavras soltas é a marca (siglas de 1-2 letras, cortadas pela nota, são ignoradas).
export function analisarDescricao(descricao = "", nomeProduto = "", unidade = "kg", quantidade = null) {
    const tamanhoNum = quantidade > 0 ? quantidade : tamanhoDoTexto(descricao, unidade);
    const doProduto = new Set(normalizar(nomeProduto).split(" ").filter(Boolean));
    const limpo = normalizar(String(descricao)
        .replace(/\d+\s*x\s*\d+(?:[.,]\d+)?\s*(?:kg|g|gr|ml|l|lt)\b/gi, " ")
        .replace(/\d+(?:[.,]\d+)?\s*(?:kg|kgs|g|gr|ml|l|lt)\b/gi, " "));
    const variacao = [], marca = [];
    // Marca do dicionário (ex.: "Tio João") tem prioridade; as palavras dela saem da leitura abaixo.
    const conhecida = acharMarca(descricao);
    const apelido = conhecida ? new Set(conhecida.apelido.split(" ")) : new Set();
    for (const bruto of limpo.split(" ").filter(Boolean)) {
        if (apelido.has(bruto)) continue;
        const t = ABREVIACOES[bruto] ? normalizar(ABREVIACOES[bruto]) : bruto;
        if (doProduto.has(t) || doProduto.has(bruto) || RUIDO.has(t)) continue;
        const tipo = t.match(/^t(?:p)?(\d)$/);
        if (tipo) { variacao.push(`Tipo ${tipo[1]}`); continue; }
        if (VARIACOES.has(t)) { variacao.push(titulo(t)); continue; }
        if (/\d/.test(t) || t.length <= 2) continue;
        marca.push(titulo(t));
    }
    return {
        // Só marcas do dicionário viram "marca" (evita lixo como "Coxa" ou "Goma"); o palpite fica para a auditoria.
        marca: conhecida ? conhecida.marca : "",
        marcaProvavel: marca.slice(0, 2).join(" "),
        marcaConhecida: !!conhecida,
        variacao: [...new Set(variacao)].join(" "),
        tamanho: formatarTamanho(tamanhoNum, unidade)
    };
}

// "Cesta rápida" e "Mais buscados" são escolhas do catálogo (campos cesta, popular e ordem).
// O catálogo que vai junto com o site é a fonte dessas marcas; assim a tela inicial não depende de o
// Firestore ter sido gravado com o catálogo mais recente.
export function marcarComCatalogo(resumo, produtosCatalogo = []) {
    const porId = new Map(produtosCatalogo.map(p => [p.id, p]));
    return resumo.map(doc => {
        const meta = porId.get(doc.id);
        if (!meta) return doc;
        return { ...doc, cesta: meta.cesta === true, popular: meta.popular === true, ordem: meta.ordem ?? doc.ordem ?? 99 };
    });
}

// Valor usado para comparar ofertas: kg/litro quando o tamanho foi identificado;
// em produtos vendidos por unidade (ovos, alface, iogurte...) é o próprio preço do item.
export function valorComparavel(produto, oferta) {
    const ref = Number(oferta.precoReferencia);
    // Por unidade: usa o preço por item (ex.: por ovo) quando existe; senão, o preço da embalagem.
    if ((produto.unidadeComparacao || "kg") === "un") return ref > 0 ? ref : Number(oferta.preco);
    return ref;
}

export const marcaDaOferta = o => o.marca || acharMarca(o.nomeEncontrado || "")?.marca || "";

// Todas as ofertas válidas de um produto (já filtradas e da mais barata para a mais cara).
// Filtros: raio/posição, bairro, idade da nota, marca, mercado e filtroOferta (texto da busca).
function ofertasValidas(produto, { latitude, longitude, raioKm = null, maxIdadeDias = 7, filtroOferta = null, bairro = null, marca = null, mercado = null } = {}) {
    const temPosicao = Number.isFinite(latitude) && Number.isFinite(longitude);
    const limite = Date.now() - maxIdadeDias * 86400000;
    const marcaAlvo = marca ? normalizar(marca) : "", mercadoAlvo = mercado ? normalizar(mercado) : "";
    return (produto.ofertas || []).map(o => {
        const preco = valorComparavel(produto, o);
        if (!(preco > 0)) return null;
        // Não converter null/"" para 0 (criaria lojas falsas em 0,0) e corrigir o par invertido da SEFAZ.
        const coord = corrigirCoordenadas(o.latitude, o.longitude);
        const coordOk = !!coord;
        // Sem coordenada válida a loja continua aparecendo, mas não entra em filtro por raio.
        if (raioKm && temPosicao && !bairro && !coordOk) return null;
        const data = converterData(o.dataConsulta);
        if (data && data.getTime() < limite) return null;
        const marcaOferta = marcaDaOferta(o);
        if (marcaAlvo && normalizar(marcaOferta) !== marcaAlvo) return null;
        if (mercadoAlvo && normalizar(o.mercado || "") !== mercadoAlvo) return null;
        if (filtroOferta && !filtroOferta(o)) return null;
        const dist = temPosicao && coordOk ? distanciaKm(latitude, longitude, coord.latitude, coord.longitude) : null;
        if (bairro) { if (normalizar(o.bairro || "") !== bairro) return null; }
        else if (raioKm && temPosicao && dist > raioKm) return null;
        return { ...o, marca: marcaOferta, latitude: coord?.latitude ?? null, longitude: coord?.longitude ?? null, precoReferencia: preco, distanciaKm: dist };
    }).filter(Boolean).sort((a, b) => a.precoReferencia - b.precoReferencia);
}

// Monta o item exibido nos cards a partir de uma oferta.
function itemDaOferta(produto, melhor, qtdOfertas) {
    const unidade = produto.unidadeComparacao || "kg";
    const detalhe = analisarDescricao(melhor.nomeEncontrado, produto.nome, unidade, melhor.quantidade);
    return {
        id: produto.id,
        nome: produto.nome,
        marca: melhor.marca || detalhe.marca,
        marcaConhecida: detalhe.marcaConhecida === true || !!melhor.marca,
        variacao: melhor.variacao || detalhe.variacao,
        tamanho: melhor.tamanhoTexto || detalhe.tamanho,
        categoriaId: produto.categoriaId,
        unidade,
        cesta: produto.cesta === true,
        popular: produto.popular === true,
        ordem: produto.ordem ?? 99,
        valor: melhor.precoReferencia,
        precoEmbalagem: melhor.preco,
        nomeEncontrado: melhor.nomeEncontrado,
        mercado: melhor.mercado || "Mercado não identificado",
        bairro: melhor.bairro || "",
        distanciaKm: melhor.distanciaKm,
        dataConsulta: melhor.dataConsulta,
        qtdOfertas
    };
}

// Para cada produto, escolhe a oferta de menor preço por kg/litro (veja ofertasValidas para os filtros).
export function menoresPrecos(resumo, opcoes = {}) {
    return resumo.map(produto => {
        const validas = ofertasValidas(produto, opcoes);
        return validas.length ? itemDaOferta(produto, validas[0], validas.length) : null;
    }).filter(Boolean);
}

// Todas as ofertas (uma linha por mercado/marca), não só a mais barata de cada produto.
export function todasOfertas(resumo, opcoes = {}) {
    return resumo.flatMap(produto => ofertasValidas(produto, opcoes).map(o => itemDaOferta(produto, o, 1)));
}

// ---- Pesquisa
// Palavras que significam o mesmo na nota fiscal e na fala do usuário (já sem acento).
const SINONIMOS = {
    macaxeira: ["aipim", "mandioca"], aipim: ["macaxeira", "mandioca"], mandioca: ["macaxeira", "aipim"],
    carioca: ["carioquinha"], carioquinha: ["carioca"], mussarela: ["muçarela", "mucarela", "mozarela", "mozzarella"],
    mucarela: ["mussarela"], mozarela: ["mussarela"], mozzarella: ["mussarela"], frango: ["galinha"], galinha: ["frango"],
    boi: ["bovina", "bovino"], bovino: ["bovina"], carne: ["bovina"], ovo: ["ovos"], ovos: ["ovo"],
    leite: ["uht"], cafe: ["cafe"], bco: ["branco"], branco: ["bco"], acucar: ["acucar"], tp1: ["tipo 1"]
};

const semPlural = w => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w);

function distanciaEdicao(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 3;
    let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const atual = [i];
        for (let j = 1; j <= b.length; j++)
            atual[j] = Math.min(anterior[j] + 1, atual[j - 1] + 1, anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        anterior = atual;
    }
    return anterior[b.length];
}

// Uma palavra digitada casa quando é início de alguma palavra do alvo ("arr" → "arroz"), nunca no meio
// ("sal" não casa com "salsicha" nem "casal"). Com `tolerante`, aceita 1 letra errada em palavras de 5+ letras.
function palavraCasa(palavra, palavrasAlvo, tolerante) {
    const opcoes = [palavra, semPlural(palavra), ...(SINONIMOS[palavra] || []).map(normalizar)];
    for (const o of opcoes) if (palavrasAlvo.some(p => p.startsWith(o))) return true;
    if (tolerante && palavra.length >= 4) {
        const max = palavra.length >= 7 ? 2 : 1;
        return palavrasAlvo.some(p => distanciaEdicao(palavra, p.slice(0, palavra.length + 1)) <= max || distanciaEdicao(palavra, p) <= max);
    }
    return false;
}

export const MIN_CARACTERES_BUSCA = 2;

// Todas as ofertas que casam com a busca, uma por mercado/marca, ordenadas por relevância e preço.
export function pesquisarOfertas(resumo, texto, opcoes = {}, nomesCategorias = {}) {
    return pesquisar(resumo, texto, opcoes, nomesCategorias, true);
}

// Contagem de marcas e mercados de uma lista de ofertas (para os filtros da busca).
export function facetas(ofertas) {
    const conta = (lista, chave) => {
        const m = new Map();
        for (const o of lista) { const v = chave(o); if (v) m.set(v, (m.get(v) || 0) + 1); }
        return [...m.entries()].map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR"));
    };
    return { marcas: conta(ofertas, o => o.marca), mercados: conta(ofertas, o => o.mercado) };
}

// Pesquisa por nome do alimento, categoria, marca/descrição da nota, bairro ou mercado.
// Todas as palavras digitadas precisam casar (ex.: "arroz compensa", "tio joao", "carrefour").
// Resultado: produtos mais parecidos primeiro (nome > categoria > marca/mercado), depois menor preço.
// Se nada casa exatamente, tenta de novo tolerando erros de digitação ("fejao", "arros").
export function pesquisar(resumo, texto, opcoes = {}, nomesCategorias = {}, achatar = false) {
    const palavras = normalizar(texto).split(" ").filter(Boolean);
    if (!palavras.length || normalizar(texto).length < MIN_CARACTERES_BUSCA) return [];
    const rodar = tolerante => {
        const saida = [];
        for (const produto of resumo) {
            const nomeP = normalizar(produto.nome).split(" ");
            const catP = normalizar(nomesCategorias[produto.categoriaId] || "").split(" ").filter(Boolean);
            const noNome = palavras.filter(w => palavraCasa(w, nomeP, tolerante)).length;
            const naCat = palavras.filter(w => !palavraCasa(w, nomeP, tolerante) && palavraCasa(w, catP, tolerante)).length;
            const relevancia = noNome * 10 + naCat * 3;
            const buscar = achatar ? todasOfertas : menoresPrecos;
            for (const item of buscar([produto], {
                ...opcoes,
                filtroOferta: o => {
                    const alvo = [...nomeP, ...catP, ...normalizar(`${o.nomeEncontrado || ""} ${o.bairro || ""} ${o.mercado || ""}`).split(" ").filter(Boolean)];
                    return palavras.every(w => palavraCasa(w, alvo, tolerante));
                }
            })) saida.push({ ...item, relevancia });
        }
        return saida.sort((a, b) => b.relevancia - a.relevancia || a.ordem - b.ordem || a.valor - b.valor);
    };
    const exato = rodar(false);
    return exato.length ? exato : rodar(true);
}

// Lista de bairros que têm ofertas, com a quantidade de ofertas de cada um.
export function listarBairros(resumo) {
    const mapa = new Map();
    for (const produto of resumo) {
        for (const o of produto.ofertas || []) {
            if (!o.bairro) continue;
            const chave = normalizar(o.bairro);
            const atual = mapa.get(chave) || { chave, nome: o.bairro, total: 0 };
            atual.total++;
            mapa.set(chave, atual);
        }
    }
    return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

// "ARROZ BRANCO COPACABANA TP3 1KG" -> "Arroz Branco Copacabana Tp3 1kg"
export function descricaoLegivel(texto = "") {
    return String(texto).toLowerCase()
        .replace(/(^|\s)\S/g, l => l.toUpperCase())
        .replace(/(\d)([a-z]{1,3})\b/g, (m, n, u) => n + u.toLowerCase());
}

// ---- Descobrir o bairro do usuário
// Compara os nomes devolvidos pelo mapa (ex.: "Compensa", "Bairro Parque 10 de Novembro") com os bairros que têm ofertas.
export function combinarBairro(nomes, lista) {
    const alvos = nomes.map(n => normalizar(n)).filter(Boolean);
    for (const a of alvos) {
        const exato = lista.find(b => b.chave === a);
        if (exato) return exato;
    }
    for (const a of alvos) {   // "bairro compensa" x "compensa", "conjunto x" etc.
        const parcial = lista.find(b => b.chave.length >= 4 && (a.includes(b.chave) || b.chave.includes(a)));
        if (parcial) return parcial;
    }
    return null;
}

// Reserva quando o mapa não responde: bairro do mercado mais próximo (até maxKm) que tenha ofertas.
export function bairroMaisProximo(resumo, latitude, longitude, maxKm = 2) {
    let melhor = null;
    for (const p of resumo) for (const o of p.ofertas || []) {
        const c = o.bairro ? corrigirCoordenadas(o.latitude, o.longitude) : null;
        if (!c) continue;
        const d = distanciaKm(latitude, longitude, c.latitude, c.longitude);
        if (d <= maxKm && (!melhor || d < melhor.km)) melhor = { chave: normalizar(o.bairro), nome: o.bairro, km: d };
    }
    return melhor;
}
