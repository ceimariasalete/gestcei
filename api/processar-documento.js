export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });

  const { fileBase64, mimeType, categorias, regras } = req.body;
  if (!fileBase64 || !mimeType) return res.status(400).json({ error: "Arquivo obrigatório" });

  const regrasTxt = Object.entries(regras || {}).map(([k, v]) => `"${k}" -> ${v}`).join("\n");
  const catsTxt = (categorias || []).join(", ");
  const isPDF = mimeType === "application/pdf";

  const fileContent = isPDF
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: fileBase64 } }
    : { type: "image", source: { type: "base64", media_type: mimeType, data: fileBase64 } };

  const prompt = `Voce e um assistente financeiro de um CEI (Centro de Educacao Infantil) em Joinville-SC.

Analise este extrato bancario do Sicoob e retorne um JSON com todos os lancamentos.

REGRAS DE LEITURA DO EXTRATO SICOOB:
- O extrato tem colunas: DATA | HISTORICO | VALOR
- Datas no formato DD/MM — o ano esta no cabecalho campo PERIODO
- Cada lancamento tem sua propria data na coluna esquerda
- IGNORE: "SALDO DO DIA", "SALDO ANTERIOR", "SALDO BLOQ.ANTERIOR", linhas de "Pagamento Pix", "DOC.:", "FAV.:", CNPJ/CPF
- D = debito = saida, C = credito = entrada

Categorias disponiveis: ${catsTxt}
Regras aprendidas: ${regrasTxt || "Nenhuma"}

Retorne APENAS este JSON valido, sem markdown:
{
  "lancamentos": [
    {
      "descricao": "COMP VISA ELECTRO KOMPRAO JOINVILLE BR",
      "valor": 142.47,
      "tipo": "saida",
      "data": "2026-02-23",
      "categoria_sugerida": "Alimentacao",
      "subcategoria_sugerida": "",
      "confianca": "alta",
      "fornecedor_chave": "KOMPRAO JOINVILLE"
    }
  ]
}`;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        max_tokens: 8000,
        messages: [{ role: "user", content: [fileContent, { type: "text", text: prompt }] }],
      }),
    });

    const data = await resp.json();
    if (data.error) return res.status(500).json({ error: data.error.message });

    const text = data.content?.map((c) => c.text || "").join("") || "";
    const clean = text.replace(/```json|```/g, "").trim();
    const s = clean.indexOf("{");
    const e = clean.lastIndexOf("}");
    if (s === -1) return res.status(500).json({ error: "IA nao retornou formato valido" });

    const parsed = JSON.parse(clean.slice(s, e + 1));
    return res.status(200).json(parsed);
  } catch (err) {
    console.error("Erro:", err);
    return res.status(500).json({ error: err.message });
  }
}
