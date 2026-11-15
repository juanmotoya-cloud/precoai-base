
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";

async function inspecionar() {
  try {
    const chave = JSON.parse(
      readFileSync(
        new URL("./serviceAccountKey.json", import.meta.url),
        "utf8"
      )
    );

    const app = initializeApp({
      credential: cert(chave)
    });

    const db = getFirestore(app);

    const colecoes = [
      "produtos",
      "precos",
      "estabelecimentos"
    ];

    const camposRelevantes =
      /nome|produto|categoria|preco|valor|estabelecimento|bairro|municipio|cidade|endereco|latitude|longitude|data|unidade|marca/i;

    for (const nomeColecao of colecoes) {
      console.log("\n================================");
      console.log("COLEÇÃO:", nomeColecao);
      console.log("================================");

      const snapshot = await db
        .collection(nomeColecao)
        .limit(3)
        .get();

      console.log("Documentos encontrados:", snapshot.size);

      if (snapshot.empty) {
        console.log("Coleção vazia.");
        continue;
      }

      snapshot.forEach((documento) => {
        const dados = documento.data();

        console.log("\nID:", documento.id);
        console.log("Campos:");

        for (const [campo, valor] of Object.entries(dados)) {
          if (camposRelevantes.test(campo)) {
            console.log(
              `${campo}:`,
              valor instanceof Date
                ? valor.toISOString()
                : valor?.toDate
                  ? valor.toDate().toISOString()
                  : valor
            );
          }
        }
      });
    }

    console.log("\nInspeção concluída. Nenhum dado foi alterado.");

  } catch (erro) {
    console.error("Erro:", erro.message);
    process.exitCode = 1;
  }
}

inspecionar();
