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

  // PASSO 1: Extrair lancamentos com datas corretas
  const promptExtracao = `Leia este extrato bancario do Sicoob e extraia todos os lancamentos.

REGRAS CRITICAS DE LEITURA:
1. O extrato tem 3 colunas: DATA | HISTORICO | VALOR
2. A data fica na coluna esquerda no formato DD/MM
3. O ano esta no cabecalho: campo PERIODO (ex: 01/02/2026 = ano 2026)
4. Quando um lancamento ocupa multiplas linhas (descricao longa), a data so aparece na primeira linha — as linhas seguintes como "Pagamento Pix", "DOC.:", "FAV.:" sao continuacao do mesmo lancamento, NAO tem data propria
5. "SALDO DO DIA", "SALDO ANTERIOR", "SALDO BLOQ.ANTERIOR" NAO sao lancamentos — IGNORE completamente
6. Quando o PDF quebra de pagina, o lancamento pode continuar na proxima pagina — use a data da primeira linha desse lancamento
7. D = debito = saida, C = credito = entrada

Retorne APENAS uma lista assim, um lancamento por linha:
DD/MM/AAAA|DESCRICAO|VALOR|TIPO
Exemplo:
23/02/2026|COMP VISA ELECTRO KOMPRAO JOINVILLE|142.47|D
23/02/2026|PIX EMIT.OUTRA IF 550,00|550.00|D
25/02/2026|PIX RECEB.OUTRA IF GUILHERME LUIS BRAZ|650.00|C

Valor com ponto decimal, sem simbolo de moeda. Sem cabecalho, sem explicacao, apenas as linhas.`;

  try {
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

    // PASSO 2: Categorizar
    const promptCategorizacao = `Voce e um assistente financeiro de um CEI (Centro de Educacao Infantil) em Joinville-SC.

Abaixo estao os lancamentos financeiros extraidos de um extrato bancario, no formato:
DD/MM/AAAA|DESCRICAO|VALOR|TIPO

${textoExtraido}

Categorias disponiveis: ${catsTxt}

Regras de categorizacao ja aprendidas:
${regrasTxt || "Nenhuma regra ainda"}

Converta cada linha para o JSON abaixo. Use a data EXATAMENTE como esta na linha, convertendo para YYYY-MM-DD.

{
  "lancamentos": [
    {
      "descricao": "descricao limpa",
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
- tipo: "saida" se D, "entrada" se C
- data: converta DD/MM/AAAA → YYYY-MM-DD exatamente como esta
- confianca: "alta" obvia, "media" provavel, "baixa" incerto
- Retorne APENAS JSON valido, sem markdown`;

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
