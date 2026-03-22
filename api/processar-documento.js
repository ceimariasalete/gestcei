// Vercel Serverless Function — proxy seguro para Claude API
// A chave ANTHROPIC_API_KEY fica apenas no servidor (variável de ambiente da Vercel)
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const { fileBase64, mimeType, categorias, regras } = req.body;

  if (!fileBase64 || !mimeType) {
    return res.status(400).json({ error: "Arquivo obrigatório" });
  }

  const regrasTxt = Object.entries(regras || {})
    .map(([k, v]) => `"${k}" -> ${v}`)
    .join("\n");

  const catsTxt = (categorias || []).join(", ");

  const prompt = `Voce e um assistente financeiro de um CEI (Centro de Educacao Infantil) conveniado em Joinville-SC que usa o banco Sicoob/Sicredi.

Analise este documento financeiro (pode ser extrato bancario, nota fiscal, comprovante de Pix ou cupom fiscal) e extraia TODOS os lancamentos financeiros encontrados.

Categorias disponiveis: ${catsTxt}

Regras de categorizacao ja aprendidas (USE SEMPRE que o fornecedor/descricao bater):
${regrasTxt || "Nenhuma regra ainda"}

Para cada lancamento encontrado, retorne um JSON com este formato EXATO:
{
  "lancamentos": [
    {
      "descricao": "descricao limpa do lancamento",
      "valor": 123.45,
      "tipo": "saida",
      "data": "2026-03-15",
      "categoria_sugerida": "Alimentacao",
      "subcategoria_sugerida": "",
      "confianca": "alta",
      "fornecedor_chave": "SUPERMERCADO XYZ"
    }
  ]
}

Regras:
- tipo deve ser "entrada" ou "saida"
- valor deve ser numero positivo sem simbolo de moeda
- data no formato YYYY-MM-DD. ATENCAO: extratos bancarios do Sicoob mostram datas apenas como DD/MM (ex: 23/02). Use o ano do periodo informado no cabecalho do extrato. Leia com muito cuidado o dia exato de cada lancamento — nao repita a data do lancamento anterior se a data mudar. Se nao encontrar data alguma, use hoje
- confianca: "alta" se categoria obvia, "media" se provavel, "baixa" se incerto
- fornecedor_chave: nome padronizado do fornecedor para aprendizado futuro
- subcategoria_sugerida: so preencha se conseguir inferir (ex: "Repasse convenio", "Vaga particular")
- Retorne APENAS o JSON valido, sem texto adicional, sem markdown`;

  const isPDF = mimeType === "application/pdf";

  const content = isPDF
    ? [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: fileBase64 } },
        { type: "text", text: prompt },
      ]
    : [
        { type: "image", source: { type: "base64", media_type: mimeType, data: fileBase64 } },
        { type: "text", text: prompt },
      ];

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        max_tokens: 8000,
        messages: [{ role: "user", content }],
      }),
    });

    const data = await response.json();

    if (data.error) {
      return res.status(500).json({ error: data.error.message });
    }

    const text = data.content?.map((c) => c.text || "").join("") || "";
    const clean = text.replace(/```json|```/g, "").trim();
    const jsonStart = clean.indexOf("{");
    const jsonEnd = clean.lastIndexOf("}");

    if (jsonStart === -1) {
      return res.status(500).json({ error: "IA nao retornou formato valido" });
    }

    const parsed = JSON.parse(clean.slice(jsonStart, jsonEnd + 1));
    return res.status(200).json(parsed);
  } catch (err) {
    console.error("Erro Claude API:", err);
    return res.status(500).json({ error: err.message });
  }
}
