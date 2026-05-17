import {
  categorizarTransacao,
  validarCategoria,
  CATEGORIAS_VALIDAS,
  normalizarDescricao,
} from './categorizar-transacao.js';

export const config = { maxDuration: 60 };

// ─── Categorizar via IA (fallback final, barato) ──────────────────────────
async function categorizarComIA(descricao, apiKey) {
  const prompt = `Você é um sistema de categorização financeira para um Centro de Educação Infantil.

Classifique esta transação bancária em UMA das categorias abaixo. Retorne APENAS JSON válido.

CATEGORIAS:
- SALÁRIOS & PRÓ-LABORE
- FORNECEDORES & SERVIÇOS
- UTILIDADES PÚBLICAS
- EDUCAÇÃO & DESENVOLVIMENTO
- PESSOAL & MANUTENÇÃO
- PAGAMENTOS DE CARTÃO
- INVESTIMENTOS
- TRANSFERÊNCIAS INTERNAS
- RECEITAS & TRANSFERÊNCIAS RECEBIDAS
- OUTROS

Transação: "${descricao}"

Retorne APENAS:
{"categoria": "NOME_DA_CATEGORIA", "confianca": 0.85, "merchant": "nome_estabelecimento"}`;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await resp.json();
  if (data.error) return null;

  const text = (data.content || []).map(c => c.text || '').join('');
  try {
    const match = text.match(/\{[\s\S]*?\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return {
        categoria: validarCategoria(parsed.categoria),
        merchant: parsed.merchant || '',
        confianca: parsed.confianca || 0.6,
        origem: 'ia',
      };
    }
  } catch (_) {}
  return null;
}

// ─── Consultar histórico de merchants no Supabase ────────────────────────
async function consultarHistoricoMerchant(descLimpa, supabaseUrl, supabaseKey) {
  if (!descLimpa) return null;
  try {
    const palavrasChave = descLimpa.split(' ').filter(p => p.length > 3).slice(0, 2);
    if (palavrasChave.length === 0) return null;

    for (const palavra of palavrasChave) {
      const url = `${supabaseUrl}/rest/v1/fin_merchant_memory?normalized_name=ilike.*${encodeURIComponent(palavra)}*&order=confidence.desc&limit=1`;
      const res = await fetch(url, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      });
      if (!res.ok) continue;
      const rows = await res.json();
      if (rows && rows.length > 0) {
        return {
          categoria: validarCategoria(rows[0].category),
          merchant: rows[0].normalized_name,
          confianca: parseFloat(rows[0].confidence) || 0.9,
          origem: 'historico_db',
        };
      }
    }
  } catch (_) {}
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const { fileBase64, mimeType, fileName } = req.body;
  if (!fileBase64) return res.status(400).json({ error: 'Arquivo obrigatório' });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  const SUPABASE_URL  = process.env.VITE_SUPABASE_URL;
  const SUPABASE_KEY  = process.env.VITE_SUPABASE_ANON_KEY;

  // Detecção robusta de PDF (útil no Windows onde mimeType pode vir em branco ou incorreto)
  const ext = fileName ? fileName.split('.').pop().toLowerCase() : '';
  const isPDF = mimeType === 'application/pdf' || 
                mimeType?.toLowerCase().includes('pdf') || 
                ext === 'pdf';

  let fileContent;
  if (isPDF) {
    fileContent = {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 }
    };
  } else {
    // Normalizar tipo de imagem para os estritamente aceitos pela Claude API
    let mediaType = mimeType || '';
    if (ext === 'png' || mediaType.toLowerCase().includes('png')) {
      mediaType = 'image/png';
    } else if (ext === 'webp' || mediaType.toLowerCase().includes('webp')) {
      mediaType = 'image/webp';
    } else if (ext === 'gif' || mediaType.toLowerCase().includes('gif')) {
      mediaType = 'image/gif';
    } else {
      mediaType = 'image/jpeg'; // Padrão seguro para jpg/jpeg e outros
    }

    fileContent = {
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data: fileBase64 }
    };
  }

  const hoje = new Date().toISOString().split('T')[0];

  const systemPrompt = `Você é o assistente financeiro do GestCEI — Centro de Educação Infantil Maria Salete LTDA em Joinville/SC.
Conta bancária: SICOOB São Miguel.
Sua função: extrair TODOS os lançamentos financeiros do documento com máxima precisão.

REGRAS ABSOLUTAS:
1. Retorne APENAS JSON válido — zero texto antes ou depois.
2. INCLUA todos os lançamentos — inclusive pagamentos de fatura, débitos automáticos, RDC, etc.
3. NUNCA invente lançamentos — extraia apenas o que está no documento.
4. Datas: formato brasileiro DD/MM no extrato → converta para YYYY-MM-DD no JSON.
5. D = débito = "saida" | C = crédito = "entrada".
6. IGNORE linhas de saldo (SALDO DO DIA, SALDO ANTERIOR, SALDO BLOQ).`;

  const catsTxt = CATEGORIAS_VALIDAS.join(' | ');

  const prompt = `Hoje é ${hoje}. Analise o extrato SICOOB e extraia todos os lançamentos.

COLUNAS DO EXTRATO: DATA | HISTÓRICO | VALOR
- Datas: DD/MM (converta para YYYY-MM-DD usando o ano do cabeçalho/período)
- D = débito = "saida" | C = crédito = "entrada"
- IGNORE: SALDO DO DIA, SALDO ANTERIOR, SALDO BLOQ

CATEGORIAS DISPONÍVEIS: ${catsTxt}

REGRA fornecedor_chave:
- Extraia 2-4 palavras que identificam o estabelecimento/pessoa
- Remova: datas, valores, números, CPF/CNPJ, cidade/estado
- Ex: "PIX EMIT INES APARECIDA FOSS ROCHA CPF 123" → "INES APARECIDA FOSS ROCHA"
- Ex: "DEB.CONV.SANEAMENTO 02/2026" → "SAMAE"
- Deixe "" se não identificável

FORMATO JSON (responda APENAS com este JSON):
{
  "lancamentos": [
    {
      "descricao": "texto original do histórico",
      "valor": 384.50,
      "tipo": "saida",
      "data": "2026-03-02",
      "categoria_sugerida": "FORNECEDORES & SERVIÇOS",
      "confianca": "alta",
      "fornecedor_chave": "KOMPRAO"
    }
  ]
}`;

  try {
    // ── ETAPA 1: Extrair lançamentos via IA ─────────────────────────────
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8000,
        system: systemPrompt,
        messages: [{ role: 'user', content: [fileContent, { type: 'text', text: prompt }] }],
      }),
    });

    const data = await resp.json();
    if (data.error) return res.status(500).json({ error: data.error.message });

    const text = (data.content || []).map(c => c.text || '').join('');
    const clean = text.replace(/```json|```/g, '').trim();
    const s = clean.indexOf('{');
    if (s === -1) return res.status(500).json({ error: 'IA não retornou formato válido' });

    let parsed;
    const e = clean.lastIndexOf('}');
    try {
      parsed = JSON.parse(clean.slice(s, e + 1));
    } catch (_) {
      // JSON truncado: recuperar lançamentos completos
      const arrStart = clean.indexOf('[', s);
      if (arrStart === -1) return res.status(500).json({ error: 'IA não retornou formato válido' });
      const chunk = clean.slice(arrStart);
      const lastComplete = chunk.lastIndexOf('},');
      const arrRecuperada = lastComplete > 0 ? chunk.slice(0, lastComplete + 1) + ']' : '[]';
      try {
        parsed = { lancamentos: JSON.parse(arrRecuperada), _truncado: true };
      } catch (_2) {
        return res.status(500).json({ error: 'Resposta incompleta — tente um extrato menor' });
      }
    }

    if (!Array.isArray(parsed.lancamentos)) {
      return res.status(500).json({ error: 'Formato inválido retornado pela IA' });
    }

    // ── ETAPA 2: Categorização inteligente pós-extração ─────────────────
    const lancamentosProcessados = await Promise.all(
      parsed.lancamentos.map(async (l) => {
        const descricaoOriginal = l.descricao || '';

        // 2a. Motor de regras local (mais rápido, sem custo)
        const resultRegra = categorizarTransacao({
          descricao: descricaoOriginal,
          tipo: l.tipo,
          valor: l.valor,
        });

        // 2b. Se confiança alta (>= 0.75), usa direto
        if (resultRegra.confianca >= 0.75) {
          return {
            ...l,
            categoria_sugerida: resultRegra.categoria,
            fornecedor_chave: l.fornecedor_chave || resultRegra.merchant || '',
            confianca: resultRegra.confianca >= 0.9 ? 'alta' : 'media',
            // campos de debug
            _descricao_original: resultRegra.descricao_original,
            _descricao_limpa: resultRegra.descricao_limpa,
            _merchant_detectado: resultRegra.merchant,
            _origem_categorizacao: resultRegra.origem,
            _score_confianca: resultRegra.confianca,
          };
        }

        // 2c. Consultar histórico no Supabase
        if (SUPABASE_URL && SUPABASE_KEY) {
          const descLimpa = normalizarDescricao(descricaoOriginal);
          const hist = await consultarHistoricoMerchant(descLimpa, SUPABASE_URL, SUPABASE_KEY);
          if (hist && hist.confianca >= 0.75) {
            return {
              ...l,
              categoria_sugerida: hist.categoria,
              fornecedor_chave: l.fornecedor_chave || hist.merchant || '',
              confianca: 'alta',
              _descricao_original: descricaoOriginal,
              _descricao_limpa: descLimpa,
              _merchant_detectado: hist.merchant,
              _origem_categorizacao: hist.origem,
              _score_confianca: hist.confianca,
            };
          }
        }

        // 2d. IA fallback (categorização separada, barata)
        const iaResult = await categorizarComIA(descricaoOriginal, ANTHROPIC_KEY);
        if (iaResult) {
          return {
            ...l,
            categoria_sugerida: iaResult.categoria,
            fornecedor_chave: l.fornecedor_chave || iaResult.merchant || '',
            confianca: iaResult.confianca >= 0.8 ? 'alta' : 'media',
            _descricao_original: descricaoOriginal,
            _descricao_limpa: normalizarDescricao(descricaoOriginal),
            _merchant_detectado: iaResult.merchant,
            _origem_categorizacao: 'ia',
            _score_confianca: iaResult.confianca,
          };
        }

        // 2e. Usar resultado do motor de regras (mesmo com baixa confiança) + validar
        const catFinal = validarCategoria(resultRegra.categoria || l.categoria_sugerida);
        return {
          ...l,
          categoria_sugerida: catFinal,
          confianca: 'baixa',
          _descricao_original: descricaoOriginal,
          _descricao_limpa: resultRegra.descricao_limpa || '',
          _merchant_detectado: resultRegra.merchant || l.fornecedor_chave || '',
          _origem_categorizacao: resultRegra.origem || 'fallback',
          _score_confianca: resultRegra.confianca || 0.3,
        };
      })
    );

    // ── ETAPA 3: Validação final da whitelist ────────────────────────────
    const lancamentosValidados = lancamentosProcessados.map(l => ({
      ...l,
      categoria_sugerida: validarCategoria(l.categoria_sugerida),
    }));

    return res.status(200).json({ ...parsed, lancamentos: lancamentosValidados });

  } catch (err) {
    console.error('Erro processar-documento:', err);
    return res.status(500).json({ error: err.message });
  }
}
