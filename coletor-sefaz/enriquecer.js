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
export function extrairTamanho(nome, unidade) {
  if (unidade !== "kg" && unidade !== "l") return null;
  const t = semAcento(nome).toUpperCase();
  const massa = { KG: 1, KGS: 1, K: 1, G: 0.001, GR: 0.001, GRS: 0.001 };
  const volume = { L: 1, LT: 1, LTS: 1, ML: 0.001 };
  const tabela = unidade === "kg" ? massa : volume;
  // Fardo/multipack: "30X1KG" = 30 kg, "12X200ML" = 2,4 L.
  const multi = t.match(/(?<![A-Z0-9])(\d+)\s*X\s*(\d+(?:[.,]\d+)?)\s*(KGS?|K|GRS?|G|ML|LTS?|L)(?![A-Z])/);
  if (multi && tabela[multi[3]]) {
    const total = Number(multi[1]) * Number(multi[2].replace(",", ".")) * tabela[multi[3]];
    return total >= 0.05 && total <= 30 ? total : null;
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
  return quantidade && quantidade >= 0.05 && quantidade <= 30 ? quantidade : null;
}

export const NOME_EXCLUIDO = /(?<![A-Z])(ADICIONAL|PORCAO|COMBO|MARMITA|BUFFET|REFEICAO|ALMOCO|LANCHE)(?![A-Z])/;

export function nomeExcluido(nome) {
  return NOME_EXCLUIDO.test(semAcento(nome).toUpperCase());
}

export function mediana(valores) {
  const v = [...valores].sort((a, b) => a - b);
  if (!v.length) return null;
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}
