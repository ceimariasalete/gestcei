// Vercel Serverless Function — proxy seguro para Claude API
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

  // ETAPA 1: Extrair lancamentos com datas corretas
  const promptExtracao = `Voce e um leitor especialista de extratos bancarios do Sicoob.

Este extrato tem 3 colunas: DATA (esquerda) | HISTORICO (centro) | VALOR (direita)

Sua tarefa: liste cada lancamento no formato abaixo, um por linha:
DD/MM/AAAA|DESCRICAO|VALOR|D

Regras CRITICAS:
1. O ano esta no cabecalho do extrato no campo PERIODO (ex: 01/02/2026 = ano 2026)
2. Cada lancamento tem sua data na coluna esquerda no formato DD/MM
3. IGNORE estas linhas — elas NAO sao lancamentos:
   - SALDO DO DIA
   - SALDO ANTERIOR
   - SALDO BLOQ.ANTERIOR
   - Linhas de "Pagamento Pix", "Recebimento Pix", "DOC.:", "FAV.:", CNPJ, CPF
4. D = debito = saida de dinheiro
5. C = credito = entrada de dinheiro
6. Valor com ponto decimal (ex: 142.47), sem R$ ou outros simbolos

EXEMPLO de saida esperada:
02/02/2026|PIX EMIT.OUTRA IF|163.00|D
02/02/2026|DEB.PARC.SUBS/INTEG|50.00|D
06/02/2026|PIX RECEB.OUTRA IF LUZINETE SIQUEIRA BAHR|350.00|C
18/02/2026|COMP VISA ELECTRO KOMPRAO JOINVILLE BR|82.10|D
23/02/2026|COMP VISA ELECTRO KOMPRAO JOINVILLE BR|206.36|D
23/02/2026|PIX EMIT.OUTRA IF|550.00|D
24/02/2026|PIX EMIT.OUTRA IF|220.00|D

Retorne APENAS as linhas no formato DD/MM/AAAA|DESCRICAO|VALOR|D_ou_C, nada mais.`;

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

    const linhasTexto = data1.content?.map((c) => c.text || "").join("") || "";

    // Parsear linhas — conversão de data feita pelo código, não pela IA
    const lancamentos = [];
    for (const linha of linhasTexto.trim().split("\n")) {
      const partes = linha.trim().split("|");
      if (partes.length < 4) continue;
      const [dataStr, descricao, valorStr, tipoStr] = partes;
      const dataPartes = dataStr.trim().split("/");
      if (dataPartes.length !== 3) continue;
      const [dd, mm, aaaa] = dataPartes;
      if (!dd || !mm || !aaaa || aaaa.length !== 4) continue;
      const data = `${aaaa}-${mm.padStart(2,"0")}-${dd.padStart(2,"0")}`;
      const valor = parseFloat(valorStr.trim().replace(",", "."));
      if (isNaN(valor) || valor <= 0) continue;
      const tipo = tipoStr.trim().toUpperCase() === "C" ? "entrada" : "saida";
      lancamentos.push({
        descricao: descricao.trim(),
        valor,
        tipo,
        data,
        categoria_sugerida: "Outros",
        subcategoria_sugerida: "",
        confianca: "baixa",
        fornecedor_chave: descricao.trim().toUpperCase(),
      });
    }

    if (lancamentos.length === 0) {
      return res.status(500).json({ error: "Nenhum lancamento encontrado no documento" });
    }

    // ETAPA 2: Categorizar
    const promptCat = `CEI em Joinville-SC. Categorize os lancamentos abaixo.

${lancamentos.map((l, i) => `${i}|${l.descricao}|${l.valor}|${l.tipo}`).join("\n")}

Categorias disponíveis: ${catsTxt}
Regras aprendidas: ${regrasTxt || "Nenhuma"}

Retorne APENAS um JSON array na mesma ordem dos lancamentos:
[{"categoria":"Alimentacao","subcategoria":"","confianca":"alta","fornecedor_chave":"KOMPRAO JOINVILLE"},...]

Sem markdown, apenas o array JSON.`;

    const resp2 = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        max_tokens: 4000,
        messages: [{ role: "user", content: promptCat }],
      }),
    });

    const data2 = await resp2.json();
    if (!data2.error) {
      const txtCat = data2.content?.map((c) => c.text || "").join("") || "";
      const clean = txtCat.replace(/```json|```/g, "").trim();
      const s = clean.indexOf("[");
      const e = clean.lastIndexOf("]");
      if (s !== -1 && e !== -1) {
        const cats = JSON.parse(clean.slice(s, e + 1));
        cats.forEach((cat, i) => {
          if (lancamentos[i]) {
            lancamentos[i].categoria_sugerida = cat.categoria || "Outros";
            lancamentos[i].subcategoria_sugerida = cat.subcategoria || "";
            lancamentos[i].confianca = cat.confianca || "baixa";
            lancamentos[i].fornecedor_chave = cat.fornecedor_chave || lancamentos[i].fornecedor_chave;
          }
        });
      }
    }

    return res.status(200).json({ lancamentos });
  } catch (err) {
    console.error("Erro:", err);
    return res.status(500).json({ error: err.message });
  }
}
