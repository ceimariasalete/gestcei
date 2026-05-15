import { fileToBase64 } from "../lib/helpers";

/**
 * Envia documento para a Vercel Serverless Function
 * que chama a API da Claude com segurança (chave no servidor)
 */
export async function processarDocumentoIA(file, categorias, regras) {
  const base64 = await fileToBase64(file);

  const response = await fetch("/api/processar-documento", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileBase64: base64,
      mimeType: file.type,
      categorias,
      regras,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Erro ao processar documento");
  }

  return data;
}
