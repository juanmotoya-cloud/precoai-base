// Dicionário de marcas vendidas em Manaus + leitor de descrição de nota fiscal.
// Fonte única: usado pelo site (busca, cards) e pelo coletor/sincronizador (grava a marca em cada oferta).
// Sem DOM e sem Firebase. Chave = como aparece na nota (sem acento); valor = nome para exibir.
// Para incluir uma marca nova, basta acrescentar uma linha aqui e rodar a coleta de novo.

const norm = (t = "") => String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");

// [nome exibido, ...apelidos que aparecem nas notas (abreviações incluídas)]
const LISTA = [
  ["Tio João", "tio joao", "tio j"], ["Camil", "camil"], ["Prato Fino", "prato fino"], ["Caçarola", "cacarola"],
  ["Catarinão", "catarinao"], ["Faccio", "faccio"], ["Biju", "biju"], ["Grandino", "grandino"], ["Célia", "celia"],
  ["Panelaço", "panelaco"], ["Somar", "somar"], ["Urbano", "urbano"], ["Namorado", "namorado"], ["Pop", "arroz pop"],
  ["Kicaldo", "kicaldo", "kica"], ["Dona de Casa", "dona de casa", "dona de", "dona"], ["Granbon", "granbon"], ["Soberana", "soberana"], ["Bonare", "bonare"],
  ["Quaker", "quaker"], ["Nestlé", "nestle"], ["Qualimax", "qualimax"], ["Yoki", "yoki"], ["Allnutri", "allnutri", "all nutri"], ["Nutry", "nutry"],
  ["Sadia", "sadia"], ["Aurora", "aurora"], ["Seara", "seara"], ["Perdigão", "perdigao"], ["Bertin", "bertin"], ["Friboi", "friboi"], ["Swift", "swift"], ["Oderich", "oderich"],
  ["Predilecta", "predilecta"], ["Quero", "quero"], ["Fugini", "fugini"], ["Elefante", "elefante"], ["Cica", "cica"], ["Heinz", "heinz"], ["Knorr", "knorr"],
  ["Italac", "italac"], ["Piracanjuba", "piracanjuba", "pira"], ["Itambé", "itambe"], ["Tirol", "tirol"], ["Mococa", "mococa"], ["Parmalat", "parmalat"], ["Elegê", "elege"],
  ["Ninho", "ninho"], ["Molico", "molico"], ["Danone", "danone"], ["Toya", "toya"], ["Vigor", "vigor"], ["Batavo", "batavo"], ["Líder", "lider"], ["Duleite", "duleite", "duleit"],
  ["Natumilk", "natumilk"], ["Puribon", "puribon"], ["Nilza", "nilza"], ["CCGL", "ccgl"], ["Fatiare", "fatiare"], ["Polenghi", "polenghi"], ["Tirolez", "tirolez"], ["Président", "president"],
  ["Lebre", "lebre"], ["Caiçara", "caicara", "caic"], ["Potiguar", "potiguar"], ["Mimosal", "mimosal"], ["Dorilu", "dorilu"], ["Milmares", "milmares"], ["Almirante", "almirante"],
  ["Beija-Flor", "beija flor", "beija f"], ["Cisne", "cisne"], ["Ciasal", "ciasal"], ["Sosal", "sosal"], ["Cristalino", "cristalino"], ["Pluma", "pluma"], ["Bethe", "bethe"],
  ["Dubom", "dubom"], ["Maratá", "marata"], ["Kitano", "kitano"], ["Hikari", "hikari"], ["Sazón", "sazon"], ["Ajinomoto", "ajinomoto"], ["Maggi", "maggi"], ["Arisco", "arisco"],
  ["Itamarati", "itamarati", "itamaraty", "itama"], ["União", "uniao"], ["Doce Doce", "doce doce"], ["Doce Dia", "doce dia"], ["Sonora", "sonora"], ["Barralcool", "barralcool"], ["Caeté", "caete"], ["Guarani", "guarani"],
  ["Soya", "soya"], ["Liza", "liza"], ["Sinha", "sinha"], ["Concórdia", "concordia", "concord"], ["Coamo", "coamo"], ["Cocamar", "cocamar"], ["Camera", "camera"], ["Cargill", "cargill"], ["Gomes da Costa", "gomes da costa"],
  ["Pilão", "pilao"], ["Três Corações", "tres coracoes", "3 coracoes"], ["Santa Clara", "santa clara"], ["Melitta", "melitta"], ["Pelé", "pele cafe"], ["Kimimo", "kimimo"], ["Café do Ponto", "cafe do ponto"],
  ["Mate Leão", "mate leao", "leao"], ["Dr. Oetker", "oetker", "dr oetker"], ["Barão", "barao"], ["Lipton", "lipton"], ["Leão Júnior", "leao junior"],
  ["Elma Chips", "elma"], ["Dori", "dori"], ["Santa Helena", "santa helena"], ["Amazônia", "amazonia"], ["Nutts", "nutts"], ["Brasil Nuts", "brasil nuts"],
  ["São Pedro", "sao pedro", "sao ped", "s pedro"], ["Ovos de Ouro", "ovos de ouro"], ["Mantiqueira", "mantiqueira"],
  ["Fazenda", "fazenda"], ["Itaipu", "itaipu"], ["Maria Isabel", "maria isabel"], ["Pif Paf", "pif paf"], ["JBS", "jbs"], ["Minerva", "minerva"], ["Marfrig", "marfrig"]
];

const porAlias = new Map();           // apelido normalizado → nome exibido
for (const [nome, ...apelidos] of LISTA) for (const a of [...apelidos, norm(nome)]) if (a) porAlias.set(norm(a), nome);
// Apelidos mais longos primeiro: "dona de casa" ganha de "dona".
const ORDEM = [...porAlias.keys()].sort((a, b) => b.length - a.length);

// Palavras genéricas que seriam marca "falsa" (não entram sozinhas).
const AMBIGUAS = new Set(["regional", "amazonas", "fazenda", "real", "pop", "salada", "lider"]);

export const MARCAS_CONHECIDAS = [...new Set(LISTA.map(l => l[0]))].sort((a, b) => a.localeCompare(b, "pt-BR"));

// Procura a marca numa descrição de nota ("ARROZ BRANCO TIO JOAO TP1 5KG" → "Tio João").
// Devolve { marca, apelido } ou null. Marcas ambíguas só valem se vierem junto de contexto (2+ palavras).
export function acharMarca(descricao = "") {
    const texto = ` ${norm(descricao)} `;
    if (texto.trim() === "") return null;
    for (const apelido of ORDEM) {
        if (texto.includes(` ${apelido} `)) {
            if (AMBIGUAS.has(apelido)) continue;
            return { marca: porAlias.get(apelido), apelido };
        }
    }
    return null;
}

// Sugestões de marca para a busca: começa com o que foi digitado.
export function sugerirMarcas(prefixo, limite = 5) {
    const p = norm(prefixo);
    if (p.length < 2) return [];
    return MARCAS_CONHECIDAS.filter(m => norm(m).split(" ").some(w => w.startsWith(p))).slice(0, limite);
}
