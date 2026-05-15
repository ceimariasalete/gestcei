-- ============================================================
-- GestCEI — Script de criação de tabelas no Supabase
-- Execute este SQL inteiro no Supabase Dashboard → SQL Editor
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. USUARIOS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome       text NOT NULL,
  email      text UNIQUE NOT NULL,
  perfil     text NOT NULL DEFAULT 'cozinheira',
  ativo      boolean NOT NULL DEFAULT true,
  permissoes jsonb DEFAULT '{}',
  criado_em  timestamptz DEFAULT now()
);

-- RLS (Row Level Security)
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir leitura publica" ON usuarios FOR SELECT USING (true);
CREATE POLICY "Permitir insert autenticado" ON usuarios FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir update autenticado" ON usuarios FOR UPDATE USING (true);

-- ────────────────────────────────────────────────────────────
-- 2. AUDITORIA
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auditoria (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tabela           text,
  operacao         text,
  registro_id      text,
  descricao        text,
  usuario_id       bigint,
  usuario_nome     text,
  dados_anteriores jsonb,
  dados_novos      jsonb,
  criado_em        timestamptz DEFAULT now()
);

ALTER TABLE auditoria ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir tudo auditoria" ON auditoria FOR ALL USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- 3. ITENS_ESTOQUE (Cozinha, Limpeza, Pedagógico, Escritório)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS itens_estoque (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome            text NOT NULL,
  tipo            text NOT NULL,              -- cozinha, limpeza, pedagogico, escritorio
  categoria       text,
  quantidade      numeric DEFAULT 0,
  em_uso          numeric DEFAULT 0,
  unidade         text,
  validade        date,
  estoque_minimo  numeric DEFAULT 1,
  observacao      text,
  atualizado_em   timestamptz DEFAULT now(),
  criado_em       timestamptz DEFAULT now()
);

ALTER TABLE itens_estoque ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir tudo itens_estoque" ON itens_estoque FOR ALL USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- 4. MOVIMENTACOES (Entradas/Saídas de Estoque)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS movimentacoes (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id        bigint REFERENCES itens_estoque(id) ON DELETE CASCADE,
  item_nome      text,
  tipo           text NOT NULL,               -- entrada, saida, em_uso, retorno_uso, consumo_uso
  quantidade     numeric NOT NULL,
  usuario_id     bigint,
  usuario_nome   text,
  observacao     text,
  data           timestamptz DEFAULT now()
);

ALTER TABLE movimentacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir tudo movimentacoes" ON movimentacoes FOR ALL USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- 5. FIN_CATEGORIAS (Categorias financeiras)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fin_categorias (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome      text NOT NULL,
  tipo      text NOT NULL DEFAULT 'ambos',   -- receita, despesa, ambos
  cor       text DEFAULT '#888888',
  ativo     boolean DEFAULT true,
  criado_em timestamptz DEFAULT now()
);

ALTER TABLE fin_categorias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir tudo fin_categorias" ON fin_categorias FOR ALL USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- 6. FIN_CONTAS (Contas bancárias/caixa)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fin_contas (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome           text NOT NULL,
  tipo           text DEFAULT 'banco',        -- banco, caixa, pix, investimento
  saldo_inicial  numeric DEFAULT 0,
  ativo          boolean DEFAULT true,
  criado_em      timestamptz DEFAULT now()
);

ALTER TABLE fin_contas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir tudo fin_contas" ON fin_contas FOR ALL USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- 7. FIN_RECEITAS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fin_receitas (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  descricao       text NOT NULL,
  valor           numeric NOT NULL,
  data            date NOT NULL,
  tipo            text DEFAULT 'mensalidade',  -- mensalidade, matricula, convenio, doacao, outros
  conta_id        bigint REFERENCES fin_contas(id),
  categoria_id    bigint REFERENCES fin_categorias(id),
  pessoa          text,
  status          text DEFAULT 'concluido',
  referencia      text,
  observacao      text,
  is_saldo_inicial boolean DEFAULT false,
  usuario_id      bigint,
  usuario_nome    text,
  criado_em       timestamptz DEFAULT now()
);

ALTER TABLE fin_receitas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir tudo fin_receitas" ON fin_receitas FOR ALL USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- 8. FIN_DESPESAS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fin_despesas (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  descricao       text NOT NULL,
  valor           numeric NOT NULL,
  data            date NOT NULL,
  tipo            text DEFAULT 'variavel',     -- variavel, fixa
  conta_id        bigint REFERENCES fin_contas(id),
  categoria_id    bigint REFERENCES fin_categorias(id),
  recorrencia_id  bigint,
  pessoa          text,
  status          text DEFAULT 'concluido',
  observacao      text,
  usuario_id      bigint,
  usuario_nome    text,
  criado_em       timestamptz DEFAULT now()
);

ALTER TABLE fin_despesas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir tudo fin_despesas" ON fin_despesas FOR ALL USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- 9. FIN_RECORRENCIAS (Despesas fixas mensais)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fin_recorrencias (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  descricao        text NOT NULL,
  valor            numeric NOT NULL,
  dia_vencimento   int DEFAULT 5,
  categoria_id     bigint REFERENCES fin_categorias(id),
  conta_id         bigint REFERENCES fin_contas(id),
  ativo            boolean DEFAULT true,
  ultima_geracao   date,
  criado_em        timestamptz DEFAULT now()
);

ALTER TABLE fin_recorrencias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir tudo fin_recorrencias" ON fin_recorrencias FOR ALL USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- 10. FIN_REGRAS_IA (Categorização automática por IA)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fin_regras_ia (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chave        text UNIQUE NOT NULL,
  categoria_id bigint REFERENCES fin_categorias(id),
  usos         int DEFAULT 1,
  criado_em    timestamptz DEFAULT now()
);

ALTER TABLE fin_regras_ia ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir tudo fin_regras_ia" ON fin_regras_ia FOR ALL USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- 11. FUNÇÃO: Gerar recorrências do mês
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION gerar_recorrencias_mes()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  rec RECORD;
  data_venc date;
  mes_atual text;
BEGIN
  mes_atual := to_char(now(), 'YYYY-MM');

  FOR rec IN
    SELECT * FROM fin_recorrencias WHERE ativo = true
  LOOP
    -- Verifica se já gerou neste mês
    IF rec.ultima_geracao IS NOT NULL
       AND to_char(rec.ultima_geracao, 'YYYY-MM') = mes_atual THEN
      CONTINUE;
    END IF;

    -- Data de vencimento no mês atual
    data_venc := (mes_atual || '-' || LPAD(rec.dia_vencimento::text, 2, '0'))::date;

    -- Insere a despesa
    INSERT INTO fin_despesas (descricao, valor, data, tipo, conta_id, categoria_id, recorrencia_id, observacao)
    VALUES (rec.descricao, rec.valor, data_venc, 'fixa', rec.conta_id, rec.categoria_id, rec.id, 'Gerado automaticamente');

    -- Atualiza última geração
    UPDATE fin_recorrencias SET ultima_geracao = now() WHERE id = rec.id;
  END LOOP;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 12. DADOS INICIAIS: Categorias padrão
-- ────────────────────────────────────────────────────────────
INSERT INTO fin_categorias (nome, tipo, cor) VALUES
  ('Alimentacao',           'despesa', '#E67E22'),
  ('Limpeza',               'despesa', '#3498DB'),
  ('Salarios',              'despesa', '#9B59B6'),
  ('Encargos Trabalhistas', 'despesa', '#8E44AD'),
  ('Demissao',              'despesa', '#E74C3C'),
  ('Material Pedagogico',   'despesa', '#1ABC9C'),
  ('Material de Escritorio','despesa', '#2C3E50'),
  ('Manutencao',            'despesa', '#F39C12'),
  ('Agua/Energia',          'despesa', '#2980B9'),
  ('Telefone/Internet',     'despesa', '#16A085'),
  ('Contabilidade',         'despesa', '#7F8C8D'),
  ('Nutricionista',         'despesa', '#27AE60'),
  ('Transporte',            'despesa', '#D35400'),
  ('Seguro',                'despesa', '#C0392B'),
  ('Mensalidade',           'receita', '#1D9E75'),
  ('Repasse/Convenio',      'receita', '#2980B9'),
  ('Matricula',             'receita', '#27AE60'),
  ('Outros',                'ambos',   '#7F8C8D')
ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 13. DADOS INICIAIS: Contas padrão
-- ────────────────────────────────────────────────────────────
INSERT INTO fin_contas (nome, tipo, saldo_inicial) VALUES
  ('Conta Corrente',  'banco', 0),
  ('Caixa Fisico',    'caixa', 0),
  ('PIX',             'pix',   0)
ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 14. USUARIO ADMIN INICIAL
-- Após executar, crie o login no Supabase Auth com este email.
-- ────────────────────────────────────────────────────────────
INSERT INTO usuarios (nome, email, perfil, ativo, permissoes) VALUES
  ('Administrador', 'admin@gestcei.com', 'admin', true,
   '{"cozinha":true,"limpeza":true,"pedagogico":true,"escritorio":true,"lista":true,"financeiro":true,"auditoria":true,"usuarios":true}')
ON CONFLICT (email) DO NOTHING;

-- ============================================================
-- PRONTO! Agora crie um usuário no Supabase Auth:
--   Email: admin@gestcei.com
--   Senha: (a que você quiser)
--   Marque "Auto Confirm" para pular a verificação de e-mail
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 15. ATUALIZAÇÕES DO BANCO (EXECUTAR CASO O BANCO JÁ EXISTA)
-- ────────────────────────────────────────────────────────────
-- Se você já rodou o script acima antes, execute as linhas 
-- abaixo para adicionar os campos de status e pessoa nas tabelas de caixa:
-- 
-- ALTER TABLE fin_receitas ADD COLUMN IF NOT EXISTS pessoa text;
-- ALTER TABLE fin_receitas ADD COLUMN IF NOT EXISTS status text DEFAULT 'concluido';
-- ALTER TABLE fin_despesas ADD COLUMN IF NOT EXISTS pessoa text;
-- ALTER TABLE fin_despesas ADD COLUMN IF NOT EXISTS status text DEFAULT 'concluido';
-- ────────────────────────────────────────────────────────────
