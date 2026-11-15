// Funções puras (sem Firebase): fáceis de testar e usadas pelo banco.js e pelo app.js.

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

export const UNIDADES = { kg: "/kg", l: "/L" };

// Para cada produto, escolhe a oferta de menor preço por kg/litro.
// - latitude/longitude + raioKm: só lojas dentro do raio (raioKm = null → Manaus inteira)
// - bairro: chave normalizada do bairro (ex.: "compensa"); quando informado, o raio é ignorado
// - maxIdadeDias: ignora notas antigas
// - filtroOferta: usado na busca por marca (ex.: "tio joao")
export function menoresPrecos(resumo, { latitude, longitude, raioKm = null, maxIdadeDias = 7, filtroOferta = null, bairro = null } = {}) {
    const temPosicao = Number.isFinite(latitude) && Number.isFinite(longitude);
    const limite = Date.now() - maxIdadeDias * 86400000;

    return resumo.map(produto => {
        const validas = (produto.ofertas || []).map(o => {
            const preco = Number(o.precoReferencia);
            const lat = Number(o.latitude), lon = Number(o.longitude);
            if (!(preco > 0) || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
            const data = converterData(o.dataConsulta);
            if (data && data.getTime() < limite) return null;
            if (filtroOferta && !filtroOferta(o)) return null;
            const dist = temPosicao ? distanciaKm(latitude, longitude, lat, lon) : null;
            if (bairro) { if (normalizar(o.bairro || "") !== bairro) return null; }
            else if (raioKm && temPosicao && dist > raioKm) return null;
            return { ...o, precoReferencia: preco, distanciaKm: dist };
        }).filter(Boolean).sort((a, b) => a.precoReferencia - b.precoReferencia);

        const melhor = validas[0];
        if (!melhor) return null;
        return {
            id: produto.id,
            nome: produto.nome,
            categoriaId: produto.categoriaId,
            unidade: produto.unidadeComparacao || "kg",
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
            qtdOfertas: validas.length
        };
    }).filter(Boolean);
}

// Pesquisa por nome do alimento, categoria, marca/descrição da nota, bairro ou mercado.
// Todas as palavras digitadas precisam aparecer (ex.: "arroz compensa", "tio joao", "carrefour").
export function pesquisar(resumo, texto, opcoes = {}, nomesCategorias = {}) {
    const palavras = normalizar(texto).split(" ").filter(Boolean);
    if (!palavras.length) return [];
    const resultado = [];
    for (const produto of resumo) {
        const base = `${produto.nome} ${nomesCategorias[produto.categoriaId] || ""}`;
        resultado.push(...menoresPrecos([produto], {
            ...opcoes,
            filtroOferta: o => {
                const alvo = normalizar(`${base} ${o.nomeEncontrado || ""} ${o.bairro || ""} ${o.mercado || ""}`);
                return palavras.every(w => alvo.includes(w));
            }
        }));
    }
    return resultado.sort((a, b) => a.ordem - b.ordem || a.valor - b.valor);
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
    return String(texto).toLowerCase().replace(/(^|\s)\S/g, l => l.toUpperCase()).replace(/(\d)([A-Z]{1,3})\b/g, (m, n, u) => n + u.toLowerCase());
}
