// Funções puras usadas pelo sincronizador: data real, bairro, tamanho e preço por kg/litro.

export function semAcento(texto = "") {
  return String(texto).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizar(texto = "") {
  return semAcento(texto).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

// "Há 1 dia(s) 4 hora(s) 15 minuto(s)" -> Date da emissão da nota (base - tempo).
// Funciona mesmo com o "á" corrompido ("H�") dos JSON antigos.
export function tempoParaData(texto, baseIso) {
  const t = String(texto || "");
  const n = (re) => { const m = t.match(re); return m ? Number(m[1]) : 0; };
  const ms = n(/(\d+)\s*ano/i) * 365 * 864e5 + n(/(\d+)\s*m.s\b/i) * 30 * 864e5 + n(/(\d+)\s*dia/i) * 864e5 +
    n(/(\d+)\s*hora/i) * 36e5 + n(/(\d+)\s*minuto/i) * 6e4 + n(/(\d+)\s*segundo/i) * 1e3;
  if (!ms) return null;
  const base = new Date(baseIso || Date.now());
  if (Number.isNaN(base.getTime())) return null;
  return new Date(base.getTime() - ms);
}

function titulo(texto) {
  return texto.toLowerCase().replace(/(^|\s)\S/g, (l) => l.toUpperCase()).replace(/ (De|Da|Do|Das|Dos|E)(?= )/g, (m) => m.toLowerCase());
}

// "URUCUM, NRO 91, COROADO, IV MONTE SIAO, MANAUS-AM, CEP 69082-690" -> "Coroado"
export function extrairBairro(endereco = "") {
  const partes = String(endereco).split(",").map((p) => p.trim()).filter(Boolean);
  const ehCidade = (p) => /-\s*AM$/i.test(p) || /^CEP\b/i.test(p);
  const iNro = partes.findIndex((p) => /^(NRO|N[º°O]?|S\/N|SN)\b/i.test(p));
  // Complementos que aparecem entre o número e o bairro (CASA 724, QD 5, LOJA 2...) não são bairro.
  const complemento = (p) => /^(CASA|APTO?|APARTAMENTO|LOTE|LT|QD|QUADRA|BL|BLOCO|SALA|SL|LJ|LOJA|ANDAR|KM|TERREO|FUNDOS|ESQUINA|PROX|BOX)\b/i.test(p) || /^\d/.test(p);
  let bairro = null;
  if (iNro >= 0) {
    for (let i = iNro + 1; i < partes.length; i++) {
      if (ehCidade(partes[i])) break;
      if (!complemento(partes[i])) { bairro = partes[i]; break; }
    }
  }
  if (!bairro) {
    const iCidade = partes.findIndex((p) => /-\s*AM$/i.test(p));
    for (let i = iCidade - 1; i > 0; i--) {
      if (!complemento(partes[i]) && !/^(NRO|N[º°O]?|S\/N|SN)\b/i.test(partes[i])) { bairro = partes[i]; break; }
    }
  }
  if (!bairro || ehCidade(bairro)) return null;
  return titulo(bairro);
}

// Extrai a quantidade da embalagem em kg ou litros, conforme a unidade de comparação do produto.
// opcoes.volumeComoMassa: laticínios e chás vendidos em g ou ml (1 ml ≈ 1 g) — aceita as duas medidas.
export function extrairTamanho(nome, unidade, opcoes = {}) {
  if (unidade !== "kg" && unidade !== "l") return null;
  const t = semAcento(nome).toUpperCase();
  const massa = { KG: 1, KGS: 1, K: 1, G: 0.001, GR: 0.001, GRS: 0.001 };
  const volume = { L: 1, LT: 1, LTS: 1, ML: 0.001 };
  const tabela = opcoes.volumeComoMassa ? { ...massa, ...volume } : (unidade === "kg" ? massa : volume);
  // Fardo/multipack: "30X1KG" = 30 kg, "12X200ML" = 2,4 L.
  const multi = t.match(/(?<![A-Z0-9])(\d+)\s*X\s*(\d+(?:[.,]\d+)?)\s*(KGS?|K|GRS?|G|ML|LTS?|L)(?![A-Z])/);
  if (multi && tabela[multi[3]]) {
    const total = Number(multi[1]) * Number(multi[2].replace(",", ".")) * tabela[multi[3]];
    return total >= 0.005 && total <= 30 ? total : null;
  }
  const re = /(?<![A-Z0-9])(\d+(?:[.,]\d+)?)\s*(KGS?|K|GRS?|G|ML|LTS?|L)(?![A-Z])/g;
  let m;
  let quantidade = null;
  while ((m = re.exec(t))) {
    const fator = tabela[m[2]];
    if (fator) { quantidade = Number(m[1].replace(",", ".")) * fator; break; }
  }
  if (quantidade === null) {
    const solta = unidade === "kg" ? /(?<![A-Z0-9])KGS?(?![A-Z])/ : /(?<![A-Z0-9])(LTS?|L)(?![A-Z])/;
    if (solta.test(t)) quantidade = 1; // "ARROZ ... KG" = 1 kg
  }
  return quantidade && quantidade >= 0.005 && quantidade <= 30 ? quantidade : null;
}

// Quantidade de itens da embalagem (ovos: "C/30", "12 UN", "DUZIA"). Devolve null quando não dá para saber.
export function extrairUnidades(nome) {
  const t = semAcento(nome).toUpperCase();
  if (/(?<![A-Z0-9])(MEIA|1\/2)\s*(DUZIA|DZ)(?![A-Z])/.test(t)) return 6;
  if (/(?<![A-Z0-9])(DUZIA|DZ)(?![A-Z])/.test(t)) return 12;
  const m = t.match(/(?<![A-Z0-9])(?:C\s*\/|C|COM|CX\s*C\s*\/?|BANDEJA|CARTELA(?:\s*C)?|CRT|BDJ)\s*(\d{1,3})(?![0-9])/) ||
    t.match(/(?<![A-Z0-9.,])(\d{1,3})\s*(?:UN|UND|UNID|UNIDS|UNIDADES|OVOS?)(?![A-Z])/);
  if (m) { const n = Number(m[1]); return n >= 2 && n <= 180 ? n : (n === 1 ? 1 : null); }
  return /(?<![A-Z0-9])(UN|UND|UNID)(?![A-Z])/.test(t) ? 1 : null;
}

export const NOME_EXCLUIDO = /(?<![A-Z])(ADICIONAL|ADICI|ADIC|PORCAO|COMBO|MARMITA|BUFFET|REFEICAO|ALMOCO|LANCHE|SEMENTES?|PAPEL|FORMA)(?![A-Z])/;

export function nomeExcluido(nome) {
  return NOME_EXCLUIDO.test(semAcento(nome).toUpperCase());
}

export function mediana(valores) {
  const v = [...valores].sort((a, b) => a - b);
  if (!v.length) return null;
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

// A SEFAZ às vezes entrega o par invertido (longitude, latitude). Em Manaus a latitude é ≈ -3 e a longitude ≈ -60:
// se a "latitude" sai fora da faixa do Brasil (|valor| > 34) e a "longitude" cabe como latitude, os valores são trocados.
// Valores ausentes viram null (Number(null) seria 0 e criaria lojas falsas em 0,0).
export function corrigirCoordenadas(latitude, longitude) {
  const vazio = (v) => v === null || v === undefined || v === "";
  if (vazio(latitude) || vazio(longitude)) return null;
  let lat = Number(latitude);
  let lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 34 && Math.abs(lon) <= 34) [lat, lon] = [lon, lat];
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { latitude: lat, longitude: lon };
}
