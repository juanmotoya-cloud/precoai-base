
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";

async function testarFirebase() {
  try {
    const caminhoChave = new URL(
      "./serviceAccountKey.json",
      import.meta.url
    );

    const credencial = JSON.parse(
      readFileSync(caminhoChave, "utf8")
    );

    if (credencial.project_id !== "precoai-sistema") {
      throw new Error("A chave não pertence ao projeto precoai-sistema.");
    }

    const app = getApps().length
      ? getApps()[0]
      : initializeApp({
          credential: cert(credencial)
        });

    const db = getFirestore(app);

    console.log("Conexão inicializada.");
    console.log("Projeto:", credencial.project_id);
    console.log("Verificando acesso ao Firestore...");

    const colecoes = await db.listCollections();

    console.log("\nACESSO AO FIRESTORE CONFIRMADO!");
    console.log("Coleções encontradas:");

    if (colecoes.length === 0) {
      console.log("Nenhuma coleção encontrada na raiz.");
    } else {
      colecoes.forEach((colecao) => {
        console.log("-", colecao.id);
      });
    }

  } catch (erro) {
    console.error("\nERRO NA CONEXÃO:");
    console.error(erro.message);
    process.exitCode = 1;
  }
}

testarFirebase();
