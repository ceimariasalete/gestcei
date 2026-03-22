// Vercel Serverless Function
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

const IGNORAR = ['SALDO DO DIA', 'SALDO ANTERIOR', 'SALDO BLOQ.ANTERIOR', 'HISTORICO DE MOVIMENTACAO', 'VALOR', 'DATA HISTORICO'];

async function extrairLancamentosPDF(buffer) {
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;

  let ano = new Date().getFullYear().toString();
  const lancamentos = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();

    // Agrupar items por linha (Y próximo)
    const linhas = {};
    for (const item of content.items) {
      if (!item.str.trim()) continue;
      const y = Math.round(item.transform[5] / 4) * 4;
      if (!linhas[y]) linhas[y] = [];
      linhas[y].push({ text: item.str.trim(), x: item.transform[4] });
    }

    // Ordenar linhas de cima para baixo (Y decrescente em PDF)
    const ysOrdenados = Object.keys(linhas).map(Number).sort((a, b) => b - a);

    for (const y of ysOrdenados) {
      const words = linhas[y].sort((a, b) => a.x - b.x);
      const linha = words.map(w => w.text).join(' ');

      // Capturar ano do período
      const mAno = linha.match(/PERÍODO[:\s]+\d{2}\/\d{2}\/(\d{4})/i);
      if (mAno) { ano = mAno[1]; continue; }

      // Linha com data DD/MM + historico + valor
      const m = linha.match(/^(\d{2}\/\d{2})\s+(.+?)\s+([\d.]+,\d{2}[DC])$/);
      if (!m) continue;

      const dataStr = m[1];
      const hist = m[2].trim();
      const valorStr = m[3];

      const ignorar = IGNORAR.some(ig => hist.toUpperCase().includes(ig));
      if (ignorar) continue;

      const [dd, mm] = dataStr.split('/');
      const data = `${ano}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
      const valor = parseFloat(valorStr.replace(/[DC]/,'').replace(/\./g,'').replace(',','.'));
      const tipo = valorStr.endsWith('D') ? 'saida' : 'entrada';

      lancamentos.push({ data, descricao: hist, valor, tipo });
    }
  }

  return { lancamentos, ano };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });

  const { fileBase64, mimeType, categorias, regras } = req.body;
  if (!fileBase64 || !mimeType) return res.status(400).json({ error: "Arquivo obrigatório" });

  const regrasTxt = Object.entries(regras || {}).map(([k, v]) => `"${k}" -> ${v}`).join("\n");
  const catsTxt = (categorias || []).join(", ");
  const isPDF = mimeType === "application/pdf";

  try {
    let lancamentos = [];

    if (isPDF) {
      const buffer = Buffer.from(fileBase64, "base64");
      const resultado = await extrairLancamentosPDF(buffer);
      lancamentos = resultado.lancamentos;
    }

    if (!isPDF || lancamentos.length === 0) {
      // Fallback para imagens ou se PDF falhou
      const fileContent = isPDF
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: fileBase64 } }
        : { type: "image", source: { type: "base64", media_type: mimeType, data: fileBase64 } };

      const prompt = `Extraia lancamentos financeiros deste documento. Para cada um retorne:
DATA|DESCRICAO|VALOR|TIPO (D=saida, C=entrada)
Ex: 23/02/2026|COMP VISA ELECTRO|142.47|D
Ignore: SALDO DO DIA, SALDO ANTERIOR. Retorne apenas as linhas.`;

      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-opus-4-5", max_tokens: 4000, messages: [{ role: "user", content: [fileContent, { type: "text", text: prompt }] }] }),
      });
      const d = await r.json();
      const txt = d.content?.map(c => c.text || "").join("") || "";
      for (const linha of txt.trim().split("\n").filter(l => l.includes("|"))) {
        const [dataStr, descricao, valorStr, tipo] = linha.split("|");
        const [dd, mm, aaaa] = (dataStr || "").trim().split("/");
        if (!dd || !mm || !aaaa) continue;
        const valor = parseFloat((valorStr || "0").trim());
        if (isNaN(valor)) continue;
        lancamentos.push({ data: `${aaaa}-${mm}-${dd}`, descricao: (descricao || "").trim(), valor, tipo: (tipo || "D").trim().toUpperCase() === "C" ? "entrada" : "saida" });
      }
    }

    if (lancamentos.length === 0) return res.status(500).json({ error: "Nenhum lancamento encontrado" });

    // Categorizar com IA
    lancamentos.forEach(l => { l.categoria_sugerida = "Outros"; l.subcategoria_sugerida = ""; l.confianca = "baixa"; l.fornecedor_chave = l.descricao.toUpperCase(); });

    const promptCat = `CEI Joinville-SC. Categorize:
${lancamentos.map((l, i) => `${i}|${l.descricao}|${l.valor}|${l.tipo}`).join("\n")}
Categorias: ${catsTxt}
Regras: ${regrasTxt || "Nenhuma"}
Retorne JSON array: [{"categoria":"X","subcategoria":"","confianca":"alta","fornecedor_chave":"Y"},...]`;

    const r2 = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-opus-4-5", max_tokens: 4000, messages: [{ role: "user", content: promptCat }] }),
    });
    const d2 = await r2.json();
    if (!d2.error) {
      const txt2 = d2.content?.map(c => c.text || "").join("") || "";
      const clean = txt2.replace(/```json|```/g, "").trim();
      const s = clean.indexOf("["), e = clean.lastIndexOf("]");
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
