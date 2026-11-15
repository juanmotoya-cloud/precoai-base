import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJETO_ESPERADO = "precoai-sistema";

const CAMPOS_OBRIGATORIOS = ["project_id", "client_email", "private_key"];

// Na automação (GitHub Actions) a chave vem da variável FIREBASE_SERVICE_ACCOUNT;
// no seu computador, do arquivo serviceAccountKey.json.
// Nenhuma mensagem de erro daqui imprime o conteúdo da chave.
export function lerCredencial() {
  const doAmbiente = process.env.FIREBASE_SERVICE_ACCOUNT;
  let credencial;
  if (doAmbiente && doAmbiente.trim()) {
    try { credencial = JSON.parse(doAmbiente); }
    catch { throw new Error("O segredo FIREBASE_SERVICE_ACCOUNT não é um JSON válido (cole o conteúdo inteiro do arquivo)."); }
  } else {
    const caminho = path.join(__dirname, "serviceAccountKey.json");
    if (!fs.existsSync(caminho)) throw new Error("serviceAccountKey.json não encontrado dentro de coletor-sefaz e FIREBASE_SERVICE_ACCOUNT não definido.");
    try { credencial = JSON.parse(fs.readFileSync(caminho, "utf8")); }
    catch { throw new Error("serviceAccountKey.json não é um JSON válido."); }
  }
  if (!credencial || typeof credencial !== "object") {
    throw new Error("A credencial do Firebase está vazia ou em formato inesperado.");
  }
  const faltando = CAMPOS_OBRIGATORIOS.filter((c) => typeof credencial[c] !== "string" || !credencial[c].trim());
  if (faltando.length) {
    throw new Error(`A credencial do Firebase está incompleta. Campos ausentes: ${faltando.join(", ")}.`);
  }
  if (credencial.project_id !== PROJETO_ESPERADO) {
    throw new Error(`A credencial pertence a outro projeto. Esperado: ${PROJETO_ESPERADO}.`);
  }
  // Alguns coladores de segredo trazem "\n" literal na chave; normaliza.
  credencial.private_key = credencial.private_key.replace(/\\n/g, "\n");
  return credencial;
}
