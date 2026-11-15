import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extrairResultados, converterPreco } from "./index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, "dados", "resposta-arroz.html");
const catalogoPath = path.resolve(__dirname, "..", "dados", "catalogo-sefaz.json");

if (!fs.existsSync(htmlPath)) {
  console.error("Amostra HTML não encontrada:", htmlPath);
  process.exit(1);
}

const catalogo = JSON.parse(fs.readFileSync(catalogoPath, "utf8"));
const arroz = catalogo.produtos.find((p) => p.id === "arroz");
const html = fs.readFileSync(htmlPath, "utf8");
const resultado = extrairResultados(html, arroz, 1);

console.log("TESTE OFFLINE DO EXTRATOR");
console.log("Cartões encontrados:", resultado.totalCards);
console.log("Resultados aceitos:", resultado.resultados.length);
console.log("Rejeitados:", resultado.rejeitados);
console.log("Amostra:");
console.table(resultado.resultados.slice(0, 10).map((item) => ({
  produto: item.nomeEncontrado,
  preco: item.precoOriginal,
  estabelecimento: item.estabelecimento,
  latitude: item.latitude,
  longitude: item.longitude
})));

if (resultado.totalCards === 0) throw new Error("Nenhum cartão foi reconhecido no HTML de amostra.");
if (resultado.resultados.some((item) => item.preco <= 0.01)) throw new Error("O filtro deixou passar preço suspeito.");
if (converterPreco("R$ 1.234,56") !== 1234.56) throw new Error("Conversão de preço falhou.");
console.log("Teste offline concluído. Isso valida o parser, não uma conexão atual com a SEFAZ.");
