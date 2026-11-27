// Auditoria da qualidade da coleta: mostra, por produto, quantas notas passam no filtro, quantas têm marca e tamanho
// identificados e as marcas mais comuns. Não grava nada. Uso:
//   node auditar-coleta.js                  (lê dados/coletas)
//   node auditar-coleta.js --pasta=/caminho --produto=arroz --listar     (lista aceitos e rejeitados)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { correspondeAoProduto } from "./index.js";
import { extrairTamanho, extrairUnidades, nomeExcluido } from "./enriquecer.js";
import { analisarDescricao } from "../js/precos.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, "").split("="); return [k, v.join("=") || true]; }));
const pasta = args.pasta && args.pasta !== true ? args.pasta : path.join(__dirname, "dados", "coletas");
const catalogo = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "dados", "catalogo-sefaz.json"), "utf8")).produtos;

let total = 0, aceitos = 0;
const desconhecidas = {};   // palpites de marca que ainda não estão no dicionário (js/marcas.js)
for (const meta of catalogo) {
  if (args.produto && args.produto !== meta.id) continue;
  const arquivo = path.join(pasta, `${meta.id}.json`);
  if (!fs.existsSync(arquivo)) { console.log(`${meta.id.padEnd(18)} (sem arquivo de coleta)`); continue; }
  const nomes = [...new Set(JSON.parse(fs.readFileSync(arquivo, "utf8")).resultados.map((r) => r.nomeEncontrado))];
  const ok = nomes.filter((n) => correspondeAoProduto(n, meta).aceito && !nomeExcluido(n));
  const unidade = meta.unidadeComparacao || "kg";
  const tamanho = (n) => meta.contarUnidades ? extrairUnidades(n) : extrairTamanho(n, unidade, { volumeComoMassa: meta.volumeComoMassa === true });
  const comTamanho = ok.filter((n) => tamanho(n)).length;
  const marcas = {};
  for (const n of ok) { const d = analisarDescricao(n, meta.nomeExibicao, unidade, tamanho(n)); if (d.marcaConhecida) marcas[d.marca] = (marcas[d.marca] || 0) + 1; else if (d.marcaProvavel) desconhecidas[d.marcaProvavel] = (desconhecidas[d.marcaProvavel] || 0) + 1; }
  const comMarca = Object.values(marcas).reduce((a, b) => a + b, 0);
  total += nomes.length; aceitos += ok.length;
  const top = Object.entries(marcas).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([m, n]) => `${m}(${n})`).join(" ");
  console.log(`${meta.id.padEnd(18)} aceitos ${String(ok.length).padStart(3)}/${String(nomes.length).padEnd(3)} tamanho ${String(comTamanho).padStart(3)} marca ${String(comMarca).padStart(3)}  ${top}`);
  if (args.listar) {
    console.log("  ACEITOS:\n   " + ok.join("\n   "));
    console.log("  REJEITADOS:\n   " + nomes.filter((n) => !ok.includes(n)).join("\n   "));
  }
}
console.log(`\nTotal: ${aceitos} de ${total} descrições aceitas.`);
const top = Object.entries(desconhecidas).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([m, n]) => `${m}(${n})`).join("  ");
if (top) console.log(`\nPossíveis marcas que faltam no dicionário (js/marcas.js): ${top}`);
