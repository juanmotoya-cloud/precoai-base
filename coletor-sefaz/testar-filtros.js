import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { correspondeAoProduto, converterPreco } from "./index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const catalogo = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "dados", "catalogo-sefaz.json"), "utf8"));
const arroz = catalogo.produtos.find((p) => p.id === "arroz");
const casos = [
  ["ARROZ BRANCO 500G", true],
  ["ARROZ BCO MANAUS 500G", true],
  ["ARROZ DE BROCOLIS", false],
  ["TEMP ARROZ FRANGO20G", false],
  ["TEMPERO PARA ARROZ E FRANGO 20G - UN", false],
  ["MINGAU ALCA FOODS 200G ARROZ", false],
  ["ALIM.P/CAES AD.DOG SHOW FGO/ARROZ - 1X85G", false],
  ["CF PORCAO DE ARROZ", false]
];
const por = (id) => catalogo.produtos.find((p) => p.id === id);
const extras = [
  ["leite", "LEITE UHT INTEGRAL PIRACANJUBA 1L", true], ["leite", "LEITE DE COCO 200ML", false], ["leite", "CREME DE LEITE 200G", false],
  ["leite", "LEITE INTEGRAL EM PO 400G", false], ["leite", "LEITE COND MOCA 395G", false],
  ["leite-po-integral", "LEITE EM PO INTEGRAL ITALAC 400G", true], ["leite-po-integral", "LEITE EM PO DESNATADO 400G", false],
  ["ovos", "OVOS BRANCOS C/30", true], ["ovos", "OVOS VERMELHOS 20 UN", true], ["ovos", "OVO DE PASCOA 150G", false],
  ["carne-bovina", "ACEM BOVINO KG", true], ["carne-bovina", "FILE MIGNON KG", true], ["carne-bovina", "CALDO DE CARNE KNORR", false], ["carne-bovina", "CARNE SUINA KG", false],
  ["macaxeira", "MANDIOCA DESCASCADA KG", true], ["macaxeira", "FARINHA DE MANDIOCA 1KG", false],
  ["batata", "BATATA INGLESA KG", true], ["batata", "BATATA PALHA 100G", false], ["batata", "BATATA DOCE KG", false],
  ["banana", "BANANA PRATA KG", true], ["banana", "IOGURTE SABOR BANANA", false],
  ["laranja", "LARANJA PERA KG", true], ["laranja", "DESINFETANTE LARANJA 2L", false],
  ["maca", "MACA FUJI KG", true], ["maca", "MACA PERUANA PO", false],
  ["feijao-fradinho", "FEIJAO FRADINHO 500G", true], ["feijao-fradinho", "FEIJAO BRANCO 500G", false],
  ["castanha-brasil", "CASTANHA DO BRASIL 100G", true], ["castanha-brasil", "CASTANHA DE CAJU 100G", false],
  ["oleo", "OLEO DE SOJA LIZA 900ML", true], ["oleo", "OLEO SOJA COAMO 900ML", true], ["oleo", "OLEO LUBRIFICANTE 1L", false],
  ["acucar", "ACUCAR CRISTAL 5KG", true], ["acucar", "BISCOITO SEM ACUCAR", false],
  ["sal", "SAL REFINADO 1KG", true], ["sal", "SALGADINHO 100G", false], ["sal", "MANTEIGA COM SAL 200G", false],
  ["frango", "FRANGO INTEIRO RESFRIADO KG", true], ["frango", "CALDO DE FRANGO KNORR", false],
  ["queijo", "QUEIJO MUSSARELA FATIADO 150G", true], ["queijo", "PAO DE QUEIJO 400G", false]
];
let falhas = 0;
for (const [id, nome, esperado] of extras) {
  const obtido = correspondeAoProduto(nome, por(id)).aceito;
  if (obtido !== esperado) { console.log(`FALHOU | ${id} | ${nome} | esperado=${esperado} obtido=${obtido}`); falhas++; }
}
console.log(`${extras.length} casos extras de catálogo conferidos.`);
for (const [nome, esperado] of casos) {
  const obtido = correspondeAoProduto(nome, arroz).aceito;
  const ok = obtido === esperado;
  console.log(`${ok ? "OK" : "FALHOU"} | ${nome} | esperado=${esperado} obtido=${obtido}`);
  if (!ok) falhas++;
}
if (converterPreco("R$ 1.234,56") !== 1234.56) falhas++;
if (falhas) process.exit(1);
console.log(`\n${casos.length + 1 + extras.length} verificações aprovadas.`);
