/**
 * POST /api/aprender-merchant
 * Salva/atualiza um merchant no histórico após correção manual do usuário.
 * Body: { normalized_name, category, origem? }
 */
import { validarCategoria } from './categorizar-transacao.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const { normalized_name, category, origem = 'usuario' } = req.body || {};

  if (!normalized_name || !category) {
    return res.status(400).json({ error: 'normalized_name e category são obrigatórios' });
  }

  const catValida = validarCategoria(category);
  const nome = normalized_name.toUpperCase().trim();

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Supabase não configurado' });
  }

  try {
    // Tentar atualizar se já existe (upsert via POST + Prefer)
    const upsertUrl = `${SUPABASE_URL}/rest/v1/fin_merchant_memory`;
    const upsertRes = await fetch(upsertUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        normalized_name: nome,
        category: catValida,
        confidence: origem === 'usuario' ? 0.98 : 0.85,
        times_used: 1,
        origem,
        updated_at: new Date().toISOString(),
      }),
    });

    if (!upsertRes.ok) {
      const err = await upsertRes.text();
      console.error('Supabase upsert error:', err);
      return res.status(500).json({ error: 'Erro ao salvar merchant' });
    }

    return res.status(200).json({ ok: true, normalized_name: nome, category: catValida });
  } catch (err) {
    console.error('aprender-merchant error:', err);
    return res.status(500).json({ error: err.message });
  }
}
