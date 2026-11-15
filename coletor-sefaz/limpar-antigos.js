import { lerCredencial, PROJETO_ESPERADO } from "./credencial.js";

// Apaga do Firestore os dados com mais de N dias (padrão: 7).
//   node limpar-antigos.js              -> simulação (só conta)
//   node limpar-antigos.js --executar   -> apaga de verdade
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, ...v] = a.replace(/^--/, "").split("=");
  return [k, v.join("=") || true];
}));
const dias = args.dias ? Number(args.dias) : 7;
const executar = args.executar === true;

// coleção -> campo de data usado como critério
const ALVOS = [
  ["precos", "dataConsulta"],          // data da nota fiscal
  ["resumo", "atualizadoEm"],          // resumo de produto que não é atualizado há N dias
  ["estabelecimentos", "atualizadoEm"] // loja que não aparece em nenhuma coleta há N dias
];

async function main() {
  if (!Number.isFinite(dias) || dias < 1) throw new Error("--dias precisa ser um número maior que 0.");
  const { initializeApp, cert, getApps } = await import("firebase-admin/app");
  const { getFirestore, Timestamp } = await import("firebase-admin/firestore");
  const app = getApps().length ? getApps()[0] : initializeApp({ credential: cert(lerCredencial()), projectId: PROJETO_ESPERADO });
  const db = getFirestore(app);

  const corte = Timestamp.fromDate(new Date(Date.now() - dias * 864e5));
  console.log(`Limpeza (${executar ? "APAGANDO" : "SIMULAÇÃO"}): dados anteriores a ${corte.toDate().toISOString()} (${dias} dias)`);

  for (const [colecao, campo] of ALVOS) {
    const consulta = db.collection(colecao).where(campo, "<", corte);
    if (!executar) {
      const { count } = (await consulta.count().get()).data();
      console.log(`  ${colecao}: ${count} documento(s) seriam apagados`);
      continue;
    }
    let total = 0;
    for (;;) {
      const snap = await consulta.limit(400).get();
      if (snap.empty) break;
      const lote = db.batch();
      snap.docs.forEach((d) => lote.delete(d.ref));
      await lote.commit();
      total += snap.size;
    }
    console.log(`  ${colecao}: ${total} documento(s) apagado(s)`);
  }
  await app.delete();
  console.log(executar ? "Limpeza concluída." : "Simulação concluída. Use --executar para apagar.");
}

main().catch((e) => { console.error("ERRO NA LIMPEZA:", e.message); process.exitCode = 1; });
