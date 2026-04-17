export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });

  const { fileBase64, mimeType, categorias, regras } = req.body;
  if (!fileBase64 || !mimeType) return res.status(400).json({ error: "Arquivo obrigatório" });

  const regrasTxt = Object.entries(regras || {})
    .map(([k, v]) => `  • "${k}" → ${v}`)
    .join("\n") || "  (nenhuma regra aprendida ainda)";

  const catsTxt = (categorias || []).join(" | ");
  const isPDF = mimeType === "application/pdf";

  const fileContent = isPDF
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: fileBase64 } }
    : { type: "image",    source: { type: "base64", media_type: mimeType, data: fileBase64 } };

  const hoje = new Date().toISOString().split("T")[0];

  const systemPrompt = `Você é o assistente financeiro do GestCEI — Centro de Educação Infantil em Joinville/SC.
Sua especialidade é extrair lançamentos financeiros de documentos com máxima precisão.

REGRAS ABSOLUTAS:
1. Retorne APENAS JSON válido — zero texto antes ou depois.
2. INCLUA todos os lançamentos do extrato bancário — inclusive pagamentos de fatura de cartão.
   → No extrato bancário, o pagamento da fatura É uma saída real de caixa (dinheiro que saiu da conta).
   → Inclua: DÉB.PGTO.BOLETO, DÉB.CONV.DEM.EMPRES MASTERCARD, COMP VISA ELECTRO, etc.
   → Categorize pagamentos de fatura como "Cartão de Crédito".
   → Categorize compras individuais (COMP VISA ELECTRO) pela natureza da compra (ex: Alimentacao).
   → NÃO invente lançamentos — extraia apenas o que está explicitamente no documento.
3. NUNCA invente lançamentos — só extraia o que está no documento.
4. Use as regras aprendidas como memória permanente de categorização.
5. ATENÇÃO ÀS DATAS: O extrato está no formato brasileiro DD/MM. Sempre converta para YYYY-MM-DD no JSON. Se o dia for maior que 12, não confunda com mês.`;

  const prompt = `Hoje é ${hoje}. Analise o documento financeiro e extraia todos os lançamentos.

══════════════════════════════════════════
📋 LEITURA DE EXTRATO SICOOB
══════════════════════════════════════════
Colunas: DATA | HISTÓRICO | VALOR
• Datas: DD/MM (DIA/MÊS) — o ANO está no cabeçalho (campo PERÍODO)
• D = débito = "saida" | C = crédito = "entrada"
• IGNORAR: SALDO DO DIA, SALDO ANTERIOR, SALDO BLOQ, linhas com só CPF/CNPJ, linhas "DOC.:" e "FAV.:"
• Cada lançamento tem sua própria data na coluna esquerda
• Extraia a data de CADA lançamento individualmente — não use a data do cabeçalho para todos
• ATENÇÃO: Se a sequência de datas pular de 28/02 para 01/03, o mês mudou para MARÇO. Não confunda 02/03 (2 de Março) com 03/02 (3 de Fevereiro).

══════════════════════════════════════════
🧠 MEMÓRIA DE CATEGORIAS (regras aprendidas)
══════════════════════════════════════════
Estas regras são baseadas no histórico real desta instituição — priorize-as:
${regrasTxt}

══════════════════════════════════════════
📂 CATEGORIAS DISPONÍVEIS
══════════════════════════════════════════
${catsTxt}

══════════════════════════════════════════
🗂️ GUIA DE CATEGORIZAÇÃO PARA CEI
══════════════════════════════════════════
ALIMENTAÇÃO:
  → Supermercado, atacado, açougue, mercearia, hortifruti, laticínios, grãos, frios
  → KOMPRAO, ATACADAO, ANGELONI, BISTEK, COMPER, BIG, EXTRA, CARREFOUR, SAO BRAZ

LIMPEZA:
  → Produtos de limpeza, higiene, descartáveis, sabão, desinfetante, detergente
  → SUPERCLEAN, LIMPEZA, HIGIENE

MATERIAL DE ESCRITORIO:
  → Papel, caneta, toner, cartucho, papel A4, grampeador, pasta, arquivo
  → KALUNGA, LEROY, PAPELARIA

MATERIAL PEDAGOGICO:
  → Brinquedo, livro didático, tinta guache, cola, EVA, massinha, lápis de cor
  → PEDAGÓGICO, DIDÁTICO, ESCOLAR

SALARIOS:
  → Holerite, folha de pagamento, pagamento funcionário, adiantamento salário
  → SALARIO, HOLERITE, FOLHA, ADIANTAMENTO

ENCARGOS TRABALHISTAS:
  → INSS, FGTS, PIS, contribuição previdenciária, DARF, GPS, SIMPLES NACIONAL
  → INSS, FGTS, RECEITA FEDERAL, DARF

DEMISSAO:
  → Rescisão contratual, aviso prévio indenizado, multa FGTS 40%, férias indenizadas
  → RESCISÃO, AVISO PRÉVIO, INDENIZAÇÃO, RESCISAO

AGUA/ENERGIA:
  → Conta de água, energia elétrica, CELESC, SAMAE, CASAN
  → CELESC, SAMAE, CASAN, COPEL, SABESP

TELEFONE/INTERNET:
  → Internet, telefone fixo/celular, banda larga, chip, plano
  → TIM, CLARO, VIVO, OI, NET, ALGAR, COPEL TELECOM, INTELBRAS

NUTRICIONISTA:
  → Honorários nutricionista, cardápio, consultoria nutricional
  → NUTRICIONISTA, NUTRI, CARDÁPIO

CONTABILIDADE:
  → Contador, escritório contábil, honorários contábeis, DP, RH terceirizado
  → CONTABILIDADE, CONTADOR, CONTABIL, ASSESSORIA CONTÁBIL

MENSALIDADE / MATRICULA:
  → Mensalidade de aluno, pagamento de matrícula
  → MENSALIDADE, MATRÍCULA, ANUIDADE

REPASSE/CONVENIO:
  → Repasse prefeitura, convênio municipal/estadual, subsídio governamental
  → PREFEITURA, PMJ, PMC, CONVÊNIO, REPASSE, FAS, FUNDACAO

MANUTENCAO:
  → Conserto, manutenção predial, pintura, reforma, dedetização, jardinagem
  → MANUTENÇÃO, CONSERTO, REFORMA, PINTURA, DEDETIZ

TRANSPORTE:
  → Uber, 99, táxi, frete, combustível, passagem, ticket transporte
  → UBER, 99POP, FRETE, PASSAGEM, GASOLINA

SEGURO:
  → Seguro predial, seguro de vida, plano de saúde funcionário
  → SEGURO, BRADESCO SAÚDE, UNIMED, PORTO SEGURO

OUTROS:
  → Não se encaixa em nenhuma das categorias acima

══════════════════════════════════════════
🔑 REGRA: fornecedor_chave
══════════════════════════════════════════
• Extraia 2-4 palavras que identificam unicamente o fornecedor/empresa
• Remova: datas, valores, números de documento, CPF/CNPJ, cidade/estado
• Ex: "COMP VISA ELEKTRO MATERIAIS JOINVILLE 15/02" → "ELEKTRO MATERIAIS"
• Ex: "PIX RECEBIDO MARIA OLIVEIRA SANTOS CPF 123" → "MARIA OLIVEIRA"
• Ex: "DEB AUTOM CELESC 02/2026" → "CELESC"
• Deixe "" se o fornecedor for uma pessoa física não identificável

══════════════════════════════════════════
📊 CONFIANÇA DA CATEGORIZAÇÃO
══════════════════════════════════════════
• "alta": nome do fornecedor está nas regras aprendidas OU é inequívoco (CELESC→energia)
• "media": nome sugere categoria mas há ambiguidade
• "baixa": suposição — categoria mais provável mas incerta

══════════════════════════════════════════
📤 FORMATO DE SAÍDA (JSON APENAS)
══════════════════════════════════════════
{
  "lancamentos": [
    {
      "descricao": "COMP VISA KOMPRAO JOINVILLE",
      "valor": 384.50,
      "tipo": "saida",
      "data": "2026-03-02",
      "categoria_sugerida": "Alimentacao",
      "subcategoria_sugerida": "Compras supermercado",
      "confianca": "alta",
      "fornecedor_chave": "KOMPRAO JOINVILLE"
    }
  ]
}
REPETINDO: O formato da data no JSON deve ser YYYY-MM-DD. Verifique se o dia e o mês não foram invertidos (Brasil usa DD/MM).`;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 8000,
        system: systemPrompt,
        messages: [{ role: "user", content: [fileContent, { type: "text", text: prompt }] }],
      }),
    });

    const data = await resp.json();
    if (data.error) return res.status(500).json({ error: data.error.message });

    const text = data.content?.map((c) => c.text || "").join("") || "";
    const clean = text.replace(/```json|```/g, "").trim();
    const s = clean.indexOf("{");
    if (s === -1) return res.status(500).json({ error: "IA nao retornou formato valido" });

    // Tentar parse normal; se truncado, recuperar lancamentos completos
    let parsed;
    const e = clean.lastIndexOf("}");
    try {
      parsed = JSON.parse(clean.slice(s, e + 1));
    } catch (_) {
      // JSON truncado: salvar tudo que foi extraido ate o ultimo objeto completo
      const arrStart = clean.indexOf("[", s);
      if (arrStart === -1) return res.status(500).json({ error: "IA nao retornou formato valido" });
      const chunk = clean.slice(arrStart);
      const lastComplete = chunk.lastIndexOf("},");
      const arrRecuperada = lastComplete > 0 ? chunk.slice(0, lastComplete + 1) + "]" : "[]";
      try {
        const lancamentos = JSON.parse(arrRecuperada);
        parsed = { lancamentos, _truncado: true };
      } catch (_2) {
        return res.status(500).json({ error: "Resposta incompleta — tente um extrato menor ou em partes" });
      }
    }

    // Pos-processamento: aplicar regras aprendidas nos lancamentos com baixa confianca
    if (parsed.lancamentos && regras) {
      parsed.lancamentos = parsed.lancamentos.map((l) => {
        if (l.confianca !== "baixa") return l;
        const chave = Object.keys(regras).find((k) =>
          l.descricao.toUpperCase().includes(k.toUpperCase()) ||
          (l.fornecedor_chave && l.fornecedor_chave.toUpperCase().includes(k.toUpperCase()))
        );
        if (chave) {
          return { ...l, categoria_sugerida: regras[chave], confianca: "alta" };
        }
        return l;
      });
    }

    return res.status(200).json(parsed);
  } catch (err) {
    console.error("Erro:", err);
    return res.status(500).json({ error: err.message });
  }
}
