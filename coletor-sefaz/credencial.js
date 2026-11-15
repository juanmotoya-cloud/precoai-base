import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJETO_ESPERADO = "precoai-sistema";

// Na automação (GitHub Actions) a chave vem da variável FIREBASE_SERVICE_ACCOUNT;
// no seu computador, do arquivo serviceAccountKey.json.
export function lerCredencial() {
  const doAmbiente = process.env.FIREBASE_SERVICE_ACCOUNT;
  let credencial;
  if (doAmbiente) {
    try { credencial = JSON.parse(doAmbiente); }
    catch { throw new Error("O segredo FIREBASE_SERVICE_ACCOUNT não é um JSON válido (cole o conteúdo inteiro do arquivo)."); }
  } else {
    const caminho = path.join(__dirname, "serviceAccountKey.json");
    if (!fs.existsSync(caminho)) throw new Error("serviceAccountKey.json não encontrado dentro de coletor-sefaz.");
    credencial = JSON.parse(fs.readFileSync(caminho, "utf8"));
  }
  if (credencial.project_id !== PROJETO_ESPERADO) {
    throw new Error(`A credencial pertence a outro projeto. Esperado: ${PROJETO_ESPERADO}.`);
  }
  return credencial;
}
