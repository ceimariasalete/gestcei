-- ============================================================
-- GestCEI v2 — Execute este SQL no Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Tabela de memória institucional de merchants
CREATE TABLE IF NOT EXISTS fin_merchant_memory (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  normalized_name text UNIQUE NOT NULL,
  category        text NOT NULL,
  confidence      numeric DEFAULT 0.85,
  times_used      int DEFAULT 1,
  origem          text DEFAULT 'regra',
  updated_at      timestamptz DEFAULT now()
);

-- Desabilitar RLS para evitar problemas de permissões no lookup global de merchants
ALTER TABLE fin_merchant_memory DISABLE ROW LEVEL SECURITY;

-- Garantir todas as permissões de leitura/escrita para as roles do Supabase
GRANT ALL ON TABLE fin_merchant_memory TO anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_merchant_memory_name ON fin_merchant_memory (normalized_name);

-- 2. Merchants conhecidos do CEI Maria Salete
INSERT INTO fin_merchant_memory (normalized_name, category, confidence, origem) VALUES
  ('CASA MIL',                    'FORNECEDORES & SERVIÇOS',               0.98, 'seed'),
  ('CASA MIL MATERIAIS',          'FORNECEDORES & SERVIÇOS',               0.98, 'seed'),
  ('KOMPRAO',                     'FORNECEDORES & SERVIÇOS',               0.97, 'seed'),
  ('KOMPRAO JOINVILLE',           'FORNECEDORES & SERVIÇOS',               0.97, 'seed'),
  ('ECOXAXIM',                    'PESSOAL & MANUTENÇÃO',                  0.97, 'seed'),
  ('LUZINETE SIQUEIRA',           'SALÁRIOS & PRÓ-LABORE',                 0.98, 'seed'),
  ('LUZINETE SIQUEIRA BAHR',      'SALÁRIOS & PRÓ-LABORE',                 0.98, 'seed'),
  ('VILMAR DA SILVA',             'SALÁRIOS & PRÓ-LABORE',                 0.98, 'seed'),
  ('INES APARECIDA FOSS',         'SALÁRIOS & PRÓ-LABORE',                 0.95, 'seed'),
  ('INES APARECIDA FOSS ROCHA',   'SALÁRIOS & PRÓ-LABORE',                 0.95, 'seed'),
  ('MUNICIPIO DE JOINVILLE',      'RECEITAS & TRANSFERÊNCIAS RECEBIDAS',   0.99, 'seed'),
  ('MUNICIPIO JOINVILLE',         'RECEITAS & TRANSFERÊNCIAS RECEBIDAS',   0.99, 'seed'),
  ('PREFEITURA JOINVILLE',        'RECEITAS & TRANSFERÊNCIAS RECEBIDAS',   0.98, 'seed'),
  ('CELESC',                      'UTILIDADES PÚBLICAS',                   0.99, 'seed'),
  ('SAMAE',                       'UTILIDADES PÚBLICAS',                   0.99, 'seed'),
  ('CASAN',                       'UTILIDADES PÚBLICAS',                   0.99, 'seed'),
  ('SICOOB',                      'INVESTIMENTOS',                         0.90, 'seed'),
  ('SICOOB SAO MIGUEL',           'INVESTIMENTOS',                         0.90, 'seed')
ON CONFLICT (normalized_name) DO UPDATE
  SET category   = EXCLUDED.category,
      confidence = EXCLUDED.confidence,
      updated_at = now();

-- 3. Novas 10 categorias institucionais
INSERT INTO fin_categorias (nome, tipo, cor) VALUES
  ('SALÁRIOS & PRÓ-LABORE',                  'despesa', '#7c3aed'),
  ('FORNECEDORES & SERVIÇOS',                'despesa', '#d97706'),
  ('UTILIDADES PÚBLICAS',                    'despesa', '#2563eb'),
  ('EDUCAÇÃO & DESENVOLVIMENTO',             'despesa', '#059669'),
  ('PESSOAL & MANUTENÇÃO',                   'despesa', '#0891b2'),
  ('PAGAMENTOS DE CARTÃO',                   'despesa', '#dc2626'),
  ('INVESTIMENTOS',                          'ambos',   '#4f46e5'),
  ('TRANSFERÊNCIAS INTERNAS',                'ambos',   '#6b7280'),
  ('RECEITAS & TRANSFERÊNCIAS RECEBIDAS',    'receita', '#16a34a'),
  ('OUTROS',                                 'ambos',   '#9ca3af')
ON CONFLICT DO NOTHING;
