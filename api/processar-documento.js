// Vercel Serverless Function — proxy seguro para Claude API
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const { fileBase64, mimeType, categorias, regras, debug } = req.body;

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

  // Prompt unico e muito direto
  const prompt = `Voce e um leitor preciso de extratos bancarios do Sicoob.

Analise este extrato e para cada lancamento real, retorne EXATAMENTE no formato abaixo:
DATA|DESCRICAO|VALOR|TIPO

Onde:
- DATA = a data DD/MM que aparece na coluna esquerda do lancamento + o ano do campo PERIODO do cabecalho, formato final DD/MM/AAAA
- DESCRICAO = primeira linha do historico (ex: "PIX EMIT.OUTRA IF", "COMP VISA ELECTRO KOMPRAO JOINVILLE BR")
- VALOR = numero com ponto decimal, sem moeda (ex: 550.00)
- TIPO = D para debito/saida ou C para credito/entrada

IGNORE estas linhas completamente (nao sao lancamentos):
- SALDO DO DIA
- SALDO ANTERIOR  
- SALDO BLOQ.ANTERIOR
- RESUMO
- Linhas que comecam com "Pagamento Pix", "Recebimento Pix", "Transferencia Pix", "DOC.:", "FAV.:", numeros de CNPJ/CPF

EXEMPLO do que voce deve retornar:
02/02/2026|PIX EMIT.OUTRA IF|163.00|D
02/02/2026|PIX EMIT.OUTRA IF|296.93|D
06/02/2026|PIX RECEB.OUTRA IF LUZINETE SIQUEIRA BAHR|350.00|C
23/02/2026|COMP VISA ELECTRO KOMPRAO JOINVILLE BR|206.36|D
23/02/2026|PIX EMIT.OUTRA IF|550.00|D

Retorne APENAS as linhas no formato DATA|DESCRICAO|VALOR|TIPO, sem mais nada.`;

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
        messages: [{ role: "user", content: [fileContent, { type: "text", text: prompt }] }],
      }),
    });

    const data1 = await resp1.json();
    if (data1.error) return res.status(500).json({ error: data1.error.message });

    const linhasTexto = data1.content?.map((c) => c.text || "").join("") || "";

    // Parsear as linhas diretamente sem segunda chamada de IA
    const lancamentos = [];
    const linhas = linhasTexto.trim().split("\n").filter(l => l.includes("|"));

    for (const linha of linhas) {
      const partes = linha.split("|");
      if (partes.length < 4) continue;

      const [dataStr, descricao, valorStr, tipo] = partes;

      // Converter DD/MM/AAAA para YYYY-MM-DD
      const parteData = dataStr.trim().split("/");
      if (parteData.length !== 3) continue;
      const [dia, mes, ano] = parteData;
      const data = `${ano}-${mes.padStart(2,"0")}-${dia.padStart(2,"0")}`;

      const valor = parseFloat(valorStr.trim().replace(",", "."));
      if (isNaN(valor) || valor <= 0) continue;

      const tipoLanc = tipo.trim().toUpperCase() === "C" ? "entrada" : "saida";

      lancamentos.push({
        descricao: descricao.trim(),
        valor,
        tipo: tipoLanc,
        data,
        categoria_sugerida: "",
        subcategoria_sugerida: "",
        confianca: "baixa",
        fornecedor_chave: descricao.trim().toUpperCase(),
      });
    }

    // PASSO 2: Categorizar com IA
    if (lancamentos.length === 0) {
      return res.status(500).json({ error: "Nenhum lancamento encontrado" });
    }

    const promptCat = `Voce e um assistente financeiro de um CEI em Joinville-SC.

Para cada lancamento abaixo, sugira a categoria e fornecedor_chave padronizado.

Lancamentos:
${lancamentos.map((l, i) => `${i}|${l.descricao}|${l.valor}|${l.tipo}`).join("\n")}

Categorias disponiveis: ${catsTxt}

Regras aprendidas:
${regrasTxt || "Nenhuma"}

Retorne APENAS um JSON array com objetos na mesma ordem:
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
    if (data2.error) return res.status(500).json({ error: data2.error.message });

    const textCat = data2.content?.map((c) => c.text || "").join("") || "";
    const cleanCat = textCat.replace(/```json|```/g, "").trim();
    const arrStart = cleanCat.indexOf("[");
    const arrEnd = cleanCat.lastIndexOf("]");

    if (arrStart !== -1 && arrEnd !== -1) {
      const categorias2 = JSON.parse(cleanCat.slice(arrStart, arrEnd + 1));
      categorias2.forEach((cat, i) => {
        if (lancamentos[i]) {
          lancamentos[i].categoria_sugerida = cat.categoria || "Outros";
          lancamentos[i].subcategoria_sugerida = cat.subcategoria || "";
          lancamentos[i].confianca = cat.confianca || "baixa";
          lancamentos[i].fornecedor_chave = cat.fornecedor_chave || lancamentos[i].fornecedor_chave;
        }
      });
    }

    return res.status(200).json({ lancamentos });
  } catch (err) {
    console.error("Erro Claude API:", err);
    return res.status(500).json({ error: err.message });
  }
}
