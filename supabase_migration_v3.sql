-- ============================================================
-- GestCEI v3 — Novas Categorias Simplificadas
-- ============================================================

INSERT INTO fin_categorias (nome, tipo, cor) VALUES
  ('Mercado', 'despesa', '#f59e0b'),
  ('Água', 'despesa', '#3b82f6'),
  ('Luz', 'despesa', '#eab308'),
  ('Internet & Telefone', 'despesa', '#8b5cf6'),
  ('Alimentação', 'despesa', '#ef4444'),
  ('Limpeza & Higiene', 'despesa', '#06b6d4'),
  ('Manutenção', 'despesa', '#64748b'),
  ('Salário & Pró-Labore', 'despesa', '#10b981'),
  ('Educação & Material', 'despesa', '#14b8a6'),
  ('Impostos & Taxas', 'despesa', '#f43f5e'),
  ('Cartão de Crédito', 'despesa', '#d946ef'),
  ('Investimentos', 'ambos', '#0ea5e9'),
  ('Transferência Própria', 'ambos', '#8b5cf6'),
  ('Receitas', 'receita', '#22c55e')
ON CONFLICT DO NOTHING;

-- Atualiza a memória base para refletir as novas categorias
UPDATE fin_merchant_memory SET category = 'Manutenção' WHERE normalized_name IN ('CASA MIL', 'CASA MIL MATERIAIS');
UPDATE fin_merchant_memory SET category = 'Mercado' WHERE normalized_name IN ('KOMPRAO', 'KOMPRAO JOINVILLE');
UPDATE fin_merchant_memory SET category = 'Limpeza & Higiene' WHERE normalized_name = 'ECOXAXIM';
UPDATE fin_merchant_memory SET category = 'Salário & Pró-Labore' WHERE normalized_name IN ('LUZINETE SIQUEIRA', 'LUZINETE SIQUEIRA BAHR', 'VILMAR DA SILVA', 'INES APARECIDA FOSS', 'INES APARECIDA FOSS ROCHA');
UPDATE fin_merchant_memory SET category = 'Receitas' WHERE normalized_name IN ('MUNICIPIO DE JOINVILLE', 'MUNICIPIO JOINVILLE', 'PREFEITURA JOINVILLE');
UPDATE fin_merchant_memory SET category = 'Luz' WHERE normalized_name = 'CELESC';
UPDATE fin_merchant_memory SET category = 'Água' WHERE normalized_name IN ('SAMAE', 'CASAN');
UPDATE fin_merchant_memory SET category = 'Taxas Bancárias' WHERE normalized_name IN ('SICOOB', 'SICOOB SAO MIGUEL');
