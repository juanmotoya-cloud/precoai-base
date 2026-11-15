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
let falhas = 0;
for (const [nome, esperado] of casos) {
  const obtido = correspondeAoProduto(nome, arroz).aceito;
  const ok = obtido === esperado;
  console.log(`${ok ? "OK" : "FALHOU"} | ${nome} | esperado=${esperado} obtido=${obtido}`);
  if (!ok) falhas++;
}
if (converterPreco("R$ 1.234,56") !== 1234.56) falhas++;
if (falhas) process.exit(1);
console.log(`\n${casos.length + 1} verificações aprovadas.`);
