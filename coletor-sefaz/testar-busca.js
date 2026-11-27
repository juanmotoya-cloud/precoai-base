// Testes da pesquisa do site e da quantidade por unidade (sem rede e sem Firebase).
import { pesquisar, menoresPrecos, pesquisarOfertas, facetas, analisarDescricao } from "../js/precos.js";
import { acharMarca, sugerirMarcas } from "../js/marcas.js";
import { extrairUnidades, extrairTamanho } from "./enriquecer.js";

const hoje = new Date().toISOString();
const of = (nomeEncontrado, preco, extra = {}) => ({ mercado: "Mercado X", bairro: "Compensa", latitude: -3.1, longitude: -60, nomeEncontrado, preco, quantidade: 1, precoReferencia: preco, dataConsulta: hoje, ...extra });
const resumo = [
  { id: "arroz", nome: "Arroz", categoriaId: "cereais", unidadeComparacao: "kg", ordem: 1, ofertas: [of("ARROZ BRANCO TIO JOAO 1KG", 6)] },
  { id: "feijao-carioca", nome: "Feijão carioca", categoriaId: "feijoes", unidadeComparacao: "kg", ordem: 2, ofertas: [of("FEIJAO CARIOCA CAMIL 1KG", 8)] },
  { id: "sal", nome: "Sal", categoriaId: "acucares", unidadeComparacao: "kg", ordem: 3, ofertas: [of("SAL REFINADO 1KG", 3)] },
  { id: "ovos", nome: "Ovos", categoriaId: "carnes-ovos", unidadeComparacao: "un", ordem: 4, ofertas: [of("OVOS BRANCOS C/30", 24, { precoReferencia: 0.8 }), of("OVOS DUZIA", 12, { precoReferencia: 1 })] },
  { id: "macaxeira", nome: "Macaxeira", categoriaId: "raizes", unidadeComparacao: "kg", ordem: 5, ofertas: [of("MANDIOCA KG", 5)] }
];
const cats = { cereais: "Cereais", feijoes: "Feijões", acucares: "Açúcares, sal, óleos e gorduras", raizes: "Raízes e tubérculos" };
const ids = t => pesquisar(resumo, t, {}, cats).map(i => i.id).join(",");

const casos = [
  ["arroz", () => ids("arroz") === "arroz"],
  ["prefixo 'arr'", () => ids("arr") === "arroz"],
  ["sem acento 'feijao'", () => ids("feijao") === "feijao-carioca"],
  ["plural 'ovo' e 'ovos'", () => ids("ovo") === "ovos" && ids("ovos") === "ovos"],
  ["'sal' NÃO acha 'salsicha'/'casal'", () => ids("sal") === "sal"],
  ["marca 'tio joao'", () => ids("tio joao") === "arroz"],
  ["bairro 'arroz compensa'", () => ids("arroz compensa") === "arroz"],
  ["sinônimo 'aipim' acha macaxeira", () => ids("aipim") === "macaxeira"],
  ["erro de digitação 'fejao'", () => ids("fejao") === "feijao-carioca"],
  ["erro de digitação 'arros'", () => ids("arros") === "arroz"],
  ["texto sem resultado", () => ids("xyzxyz") === ""],
  ["1 letra não pesquisa", () => ids("a") === ""],
  ["ovos: menor preço por ovo (0,80)", () => menoresPrecos([resumo[3]])[0].valor === 0.8],
  ["extrairUnidades C/30", () => extrairUnidades("OVOS BRANCOS C/30") === 30],
  ["extrairUnidades dúzia", () => extrairUnidades("OVOS DUZIA") === 12],
  ["extrairUnidades 20 UN", () => extrairUnidades("OVO VERMELHO 20 UN") === 20],
  ["extrairUnidades sem número", () => extrairUnidades("OVOS GRANDES") === null],
  ["marca: Tio João", () => acharMarca("ARROZ BRANCO TIO JOAO TP1 5KG")?.marca === "Tio João"],
  ["marca abreviada: Beija-Flor", () => acharMarca("SAL REFINADO BEIJA F")?.marca === "Beija-Flor"],
  ["marca mais longa vence (Dona de Casa)", () => acharMarca("FEIJAO PRETO DONA DE 500G")?.marca === "Dona de Casa"],
  ["sem marca conhecida não inventa", () => analisarDescricao("COXA SOBRECOXA FRANGO DORSAL KG", "Frango", "kg").marca === ""],
  ["sugerir marcas por prefixo", () => sugerirMarcas("tio").includes("Tio João")],
  ["busca por marca 'tio joao'", () => ids("tio joao") === "arroz"],
  ["filtro de marca em todas as ofertas", () => pesquisarOfertas(resumo, "arroz", { marca: "Camil" }, cats).length === 0 && pesquisarOfertas(resumo, "arroz", { marca: "Tio João" }, cats).length === 1],
  ["facetas contam marcas e mercados", () => { const f = facetas(pesquisarOfertas(resumo, "arroz", {}, cats)); return f.marcas[0].nome === "Tio João" && f.mercados[0].nome === "Mercado X"; }],
  ["iogurte 170g/ml como kg", () => Math.abs(extrairTamanho("IOGURTE 170ML", "kg", { volumeComoMassa: true }) - 0.17) < 1e-9]
];
let falhas = 0;
for (const [nome, fn] of casos) {
  let ok = false; try { ok = fn(); } catch (e) { console.error(e.message); }
  console.log(`${ok ? "OK" : "FALHOU"} | ${nome}`);
  if (!ok) falhas++;
}
if (falhas) process.exit(1);
console.log(`\n${casos.length} verificações de busca aprovadas.`);
