// Vercel Serverless Function — proxy seguro para Claude API
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
  const isPDF = mimeType === "application/pdf";

  const fileContent = isPDF
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: fileBase64 } }
    : { type: "image", source: { type: "base64", media_type: mimeType, data: fileBase64 } };

  // PASSO 1: Extrair texto bruto com datas exatas
  const promptExtracao = `Voce e um leitor de extratos bancarios. Leia este documento e liste CADA lancamento financeiro no formato exato abaixo, um por linha:

DD/MM/AAAA | DESCRICAO | VALOR | D ou C

Regras de leitura:
- No extrato Sicoob, cada lancamento comeca com a data DD/MM na coluna esquerda
- A linha "SALDO DO DIA" NAO e um lancamento, ignore completamente
- A linha "SALDO ANTERIOR" NAO e um lancamento, ignore completamente  
- O ano fica no cabecalho do extrato no campo PERIODO
- D = debito = saida, C = credito = entrada
- Valor sem simbolo de moeda, use ponto como decimal (ex: 1234.56)
- Liste TODOS os lancamentos sem pular nenhum
- Retorne APENAS as linhas no formato pedido, sem cabecalho, sem explicacao`;

  try {
    // Chamada 1: extrair lancamentos brutos
    const resp1 = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        max_tokens: 4000,
        messages: [{ role: "user", content: [fileContent, { type: "text", text: promptExtracao }] }],
      }),
    });

    const data1 = await resp1.json();
    if (data1.error) return res.status(500).json({ error: data1.error.message });

    const textoExtraido = data1.content?.map((c) => c.text || "").join("") || "";

    // PASSO 2: Categorizar com base no texto já extraído
    const promptCategorizacao = `Voce e um assistente financeiro de um CEI (Centro de Educacao Infantil) em Joinville-SC.

Abaixo estao os lancamentos financeiros ja extraidos de um extrato bancario, no formato:
DD/MM/AAAA | DESCRICAO | VALOR | D ou C

${textoExtraido}

Categorias disponiveis: ${catsTxt}

Regras de categorizacao ja aprendidas (USE SEMPRE que o fornecedor/descricao bater):
${regrasTxt || "Nenhuma regra ainda"}

Para cada linha acima, retorne um JSON com este formato EXATO:
{
  "lancamentos": [
    {
      "descricao": "descricao limpa do lancamento",
      "valor": 123.45,
      "tipo": "saida",
      "data": "2026-02-23",
      "categoria_sugerida": "Alimentacao",
      "subcategoria_sugerida": "",
      "confianca": "alta",
      "fornecedor_chave": "SUPERMERCADO XYZ"
    }
  ]
}

Regras:
- tipo: "saida" se D (debito), "entrada" se C (credito)
- valor: numero positivo sem simbolo
- data: converta DD/MM/AAAA para YYYY-MM-DD exatamente como esta na linha
- confianca: "alta" se categoria obvia, "media" se provavel, "baixa" se incerto
- fornecedor_chave: nome padronizado do fornecedor
- subcategoria_sugerida: so preencha se conseguir inferir
- Retorne APENAS o JSON valido, sem texto adicional, sem markdown`;

    const resp2 = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        max_tokens: 8000,
        messages: [{ role: "user", content: promptCategorizacao }],
      }),
    });

    const data2 = await resp2.json();
    if (data2.error) return res.status(500).json({ error: data2.error.message });

    const text = data2.content?.map((c) => c.text || "").join("") || "";
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
