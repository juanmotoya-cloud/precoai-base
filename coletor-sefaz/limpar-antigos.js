import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PROJETO_ESPERADO } from "./credencial.js";
import { COLECOES, conectarFirestore, montarPlanoLocal } from "./sincronizar-firestore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Dois modos. Em qualquer um, SEM --executar só simula e não apaga nada.
//
//   node limpar-antigos.js                     -> simula a reconciliação
//   node limpar-antigos.js --executar          -> apaga do Firestore o que NÃO faz parte da nova coleta
//   node limpar-antigos.js --modo=idade --dias=30            -> simula limpeza por idade (manutenção)
//   node limpar-antigos.js --modo=idade --dias=30 --executar -> apaga preços/lojas parados há mais de N dias
//
// --forcar libera a execução quando mais de 60% de uma coleção seria apagada.
// Antes de apagar, os documentos são salvos em dados/backup-<data>/ (fora do Git).

const LIMITE_APAGAR = 0.6;
const TAMANHO_LOTE = 400;
const ORDEM_APAGAR = ["precos", "estabelecimentos", "produtos", "resumo"];
// modo idade: coleção -> campo de data da COLETA (não a data da nota)
const ALVOS_IDADE = [["precos", "coletadoEm"], ["estabelecimentos", "atualizadoEm"]];

export function lerArgumentos(argv = process.argv.slice(2)) {
  const permitidos = new Set(["executar", "forcar", "modo", "dias"]);
  const bruto = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) throw new Error(`Argumento inválido: "${arg}".`);
    const [chave, ...resto] = arg.slice(2).split("=");
    if (!permitidos.has(chave)) throw new Error(`Argumento desconhecido: --${chave}.`);
    bruto[chave] = resto.length ? resto.join("=") : true;
  }
  for (const flag of ["executar", "forcar"]) {
    if (bruto[flag] !== undefined && bruto[flag] !== true) throw new Error(`--${flag} não aceita valor.`);
  }
  const modo = bruto.modo === undefined ? "reconciliar" : bruto.modo;
  if (!["reconciliar", "idade"].includes(modo)) throw new Error('--modo precisa ser "reconciliar" ou "idade".');

  let dias;
  if (bruto.dias !== undefined) {
    if (typeof bruto.dias !== "string" || !/^\d+$/.test(bruto.dias) || Number(bruto.dias) < 1 || Number(bruto.dias) > 365) {
      throw new Error("--dias precisa ser um número inteiro entre 1 e 365.");
    }
    dias = Number(bruto.dias);
  }
  if (modo === "idade" && dias === undefined) throw new Error("No modo idade, informe --dias=N (por exemplo --dias=30).");
  return { modo, dias: dias ?? 7, executar: bruto.executar === true, forcar: bruto.forcar === true };
}

export function calcularDiferencas(novos, existentes) {
  const faltando = [...novos].filter((id) => !existentes.has(id));
  const extras = [...existentes].filter((id) => !novos.has(id));
  return { faltando, extras };
}

async function salvarBackup(db, extrasPorColecao) {
  const pasta = path.join(__dirname, "dados", `backup-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  fs.mkdirSync(pasta, { recursive: true });
  for (const [colecao, refs] of Object.entries(extrasPorColecao)) {
    if (!refs.length) continue;
    const docs = [];
    for (let i = 0; i < refs.length; i += 300) {
      const snaps = await db.getAll(...refs.slice(i, i + 300));
      snaps.forEach((s) => { if (s.exists) docs.push({ id: s.id, dados: s.data() }); });
    }
    fs.writeFileSync(path.join(pasta, `${colecao}.json`), JSON.stringify(docs));
  }
  return pasta;
}

async function apagarRefs(db, refs) {
  let total = 0;
  for (let i = 0; i < refs.length; i += TAMANHO_LOTE) {
    const lote = db.batch();
    refs.slice(i, i + TAMANHO_LOTE).forEach((ref) => lote.delete(ref));
    await lote.commit();
    total += Math.min(TAMANHO_LOTE, refs.length - i);
  }
  return total;
}

// Remove do Firestore o que não pertence à coleta atual. Só roda se a nova base estiver completa no Firestore.
async function reconciliar({ executar, forcar, dias }, { db }) {
  const { plano } = montarPlanoLocal({ dias }); // valida catálogo, coletas e cobertura mínima
  const novos = Object.fromEntries(COLECOES.map((c) => [c, new Set(plano[c].map((d) => d.id))]));

  const existentes = {};
  for (const c of COLECOES) {
    const refs = await db.collection(c).listDocuments();
    existentes[c] = new Map(refs.map((r) => [r.id, r]));
  }

  const extrasPorColecao = {};
  const problemas = [];
  console.log(`Reconciliação (${executar ? "APAGANDO" : "SIMULAÇÃO"}) — projeto ${PROJETO_ESPERADO}`);
  for (const c of COLECOES) {
    const { faltando, extras } = calcularDiferencas(novos[c], new Set(existentes[c].keys()));
    extrasPorColecao[c] = extras.map((id) => existentes[c].get(id));
    console.log(`  ${c}: ${existentes[c].size} no Firestore | ${novos[c].size} na nova coleta | ${extras.length} a remover`);
    if (faltando.length) problemas.push(`${c}: ${faltando.length} documento(s) da nova coleta ainda não estão no Firestore.`);
    if (existentes[c].size && extras.length / existentes[c].size > LIMITE_APAGAR && !forcar) {
      problemas.push(`${c}: a limpeza removeria ${extras.length} de ${existentes[c].size} documentos (mais de ${LIMITE_APAGAR * 100}%). Se for isso mesmo, use --forcar.`);
    }
  }
  if (problemas.length) {
    throw new Error(`Limpeza bloqueada, nada foi apagado:\n - ${problemas.join("\n - ")}${problemas.some((p) => p.includes("ainda não estão")) ? "\n - Rode antes: node sincronizar-firestore.js --executar" : ""}`);
  }

  if (!executar) { console.log("\nSimulação concluída. Use --executar para apagar."); return; }

  const pasta = await salvarBackup(db, extrasPorColecao);
  console.log(`\nBackup dos documentos a remover salvo em: ${pasta}`);
  for (const c of ORDEM_APAGAR) {
    const apagados = await apagarRefs(db, extrasPorColecao[c]);
    console.log(`  ${c}: ${apagados} documento(s) apagado(s)`);
  }
  console.log("Limpeza concluída.");
}

// Manutenção por idade: só preços e estabelecimentos (produtos e resumo nunca são apagados por data).
async function limparPorIdade({ executar, forcar, dias }, { db, Timestamp }) {
  const corte = Timestamp.fromDate(new Date(Date.now() - dias * 864e5));
  console.log(`Limpeza por idade (${executar ? "APAGANDO" : "SIMULAÇÃO"}): coletas anteriores a ${corte.toDate().toISOString()} (${dias} dias)`);

  const planos = [];
  for (const [colecao, campo] of ALVOS_IDADE) {
    const total = (await db.collection(colecao).count().get()).data().count;
    const consulta = db.collection(colecao).where(campo, "<", corte);
    const antigos = (await consulta.count().get()).data().count;
    console.log(`  ${colecao}: ${antigos} de ${total} documento(s) com mais de ${dias} dias`);
    if (total && antigos / total > LIMITE_APAGAR && !forcar) {
      throw new Error(`Limpeza bloqueada: ${colecao} perderia ${antigos} de ${total} documentos. Se for isso mesmo, use --forcar.`);
    }
    planos.push([colecao, consulta]);
  }
  if (!executar) { console.log("\nSimulação concluída. Use --executar para apagar."); return; }

  for (const [colecao, consulta] of planos) {
    let total = 0;
    for (;;) {
      const snap = await consulta.limit(TAMANHO_LOTE).get();
      if (snap.empty) break;
      const lote = db.batch();
      snap.docs.forEach((d) => lote.delete(d.ref));
      await lote.commit();
      total += snap.size;
    }
    console.log(`  ${colecao}: ${total} documento(s) apagado(s)`);
  }
  console.log("Limpeza concluída.");
}

async function main() {
  const args = lerArgumentos();
  const conexao = await conectarFirestore();
  try {
    if (args.modo === "idade") await limparPorIdade(args, conexao);
    else await reconciliar(args, conexao);
  } finally {
    await conexao.encerrar();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((e) => { console.error("ERRO NA LIMPEZA:", e.message); process.exitCode = 1; });
}
