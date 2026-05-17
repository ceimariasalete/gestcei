/**
 * Motor de Categorização de Transações Bancárias
 * GestCEI — Centro de Educação Infantil Maria Salete LTDA
 *
 * Hierarquia: Padrão SICOOB → Regras → Histórico Seed → Valor → Outros
 * IA é fallback externo chamado pelo processar-documento.js
 */

// ─── Whitelist de categorias válidas ───────────────────────────────────────
export const CATEGORIAS_VALIDAS = [
  'SALÁRIOS & PRÓ-LABORE',
  'FORNECEDORES & SERVIÇOS',
  'UTILIDADES PÚBLICAS',
  'EDUCAÇÃO & DESENVOLVIMENTO',
  'PESSOAL & MANUTENÇÃO',
  'PAGAMENTOS DE CARTÃO',
  'INVESTIMENTOS',
  'TRANSFERÊNCIAS INTERNAS',
  'RECEITAS & TRANSFERÊNCIAS RECEBIDAS',
  'OUTROS',
];

// ─── Memória seed de estabelecimentos conhecidos ───────────────────────────
// nome_normalizado (uppercase, sem acento) → categoria
export const MERCHANTS_SEED = {
  'CASA MIL':            'FORNECEDORES & SERVIÇOS',
  'KOMPRAO':             'FORNECEDORES & SERVIÇOS',
  'ECOXAXIM':            'PESSOAL & MANUTENÇÃO',
  'LUZINETE SIQUEIRA':   'SALÁRIOS & PRÓ-LABORE',
  'VILMAR DA SILVA':     'SALÁRIOS & PRÓ-LABORE',
  'INES APARECIDA FOSS': 'SALÁRIOS & PRÓ-LABORE',
  'MUNICIPIO DE JOINVILLE': 'RECEITAS & TRANSFERÊNCIAS RECEBIDAS',
  'MUNICIPIO JOINVILLE': 'RECEITAS & TRANSFERÊNCIAS RECEBIDAS',
  'PREFEITURA JOINVILLE':'RECEITAS & TRANSFERÊNCIAS RECEBIDAS',
  'SICOOB':              'INVESTIMENTOS',
  'CELESC':              'UTILIDADES PÚBLICAS',
  'SAMAE':               'UTILIDADES PÚBLICAS',
  'CASAN':               'UTILIDADES PÚBLICAS',
};

// ─── Regras por palavras-chave ──────────────────────────────────────────────
const REGRAS_KEYWORDS = {
  'SALÁRIOS & PRÓ-LABORE': [
    'SALARIO','SALÁRIO','CREDITO SALARIO','CREDITO SALÁRIO','CRED SALARIO',
    'HOLERITE','FOLHA','ADIANTAMENTO SALARIO','PRO-LABORE','PROLABORE',
    '13 SALARIO','FERIAS PROPORCIONAIS','RESCISAO','AVISO PREVIO',
  ],
  'UTILIDADES PÚBLICAS': [
    'SANEAMENTO','CELESC','SAMAE','CASAN','COPEL','SABESP','LIGHT',
    'COHAPAR','DMAE','SAAEJ','AGUAS DO','COMPANHIA DE AGUAS',
    'ENERGIA ELETRICA','CONTA DE LUZ','CONTA AGUA','AGUA E ESGOTO',
    'DEB CONV SANEA','DEB CONV TELE','DEB CONV PREF','DEB CONV IPTU',
    'TRIBUTARIO','TRIBUTO','IPTU','ISSQN','SIMPLES NACIONAL','DARF',
    'RECEITA FEDERAL','PGFN','INSS AUTONOMO',
  ],
  'FORNECEDORES & SERVIÇOS': [
    'KOMPRAO','CASA MIL','SUPERMERCADO','ATACADO','ATACADAO',
    'ANGELONI','BISTEK','COMPER','GIASSI','SAO BRAZ','CARREFOUR',
    'BIG','EXTRA','ASSAI','FORT ATACADISTA','CONSTRUCAO','MATERIAIS',
    'TINTAS','FERRAGENS','MADEIREIRA','ELETRICA','HIDRAULICA',
    'PAPELARIA','GRAFICA','PROVEDOR','SERVICOS','SERVICO',
  ],
  'EDUCAÇÃO & DESENVOLVIMENTO': [
    'PEDAGOGICO','PEDAGÓGICO','CURSO','CAPACITACAO','CAPACITAÇÃO',
    'TREINAMENTO','EDUCACAO','EDUCAÇÃO','DIDATICO','DIDÁTICO',
    'ESCOLAR','LIVRO','BRINQUEDO','FORMACAO','FORMAÇÃO',
    'MATERIAL ESCOLAR','APOSTILA','UNIFORME ESCOLAR',
  ],
  'PESSOAL & MANUTENÇÃO': [
    'ECOXAXIM','LIMPEZA','HIGIENE','DESCARTAVEL','SABAO','DETERGENTE',
    'DESINFETANTE','MANUTENCAO','MANUTENÇÃO','CONSERTO','REFORMA',
    'PINTURA','DEDETIZ','JARDINAGEM','PREDIAL','INSTALACAO','REPARO',
    'VALE TRANSPORTE','VALE-TRANSPORTE','EPI','SEGURANCA DO TRABALHO',
    'SUPERCLEAN','RODO','VASSOURA',
  ],
  'PAGAMENTOS DE CARTÃO': [
    'VISA ELECTRO','COMP VISA','COMP MASTER','MASTERCARD DEBITO',
    'DEB PGTO BOLETO','DEB CONV DEM EMPRES MASTER','DEB CONV DEM EMPRES VISA',
    'FATURA CARTAO','FATURA CARTÃO','SICOOB CARD','CREDITO CARTAO',
    'DEBITO CARTAO','NUBANK','INTER CARD','ITAUCARD','BRADESCO CARD',
  ],
  'INVESTIMENTOS': [
    'RDC','APLICACAO EM RDC','RESGATE RDC','APLICACAO AUTOMATICA',
    'RESGATE AUTOMATICO','CDB','LCI','LCA','POUPANCA','POUPANÇA',
    'FUNDO DE INVEST','RENDA FIXA','RENDIMENTOS','APLICACAO FINANCEIRA',
  ],
  'TRANSFERÊNCIAS INTERNAS': [
    'CONTA PROPRIA','CONTA PRÓPRIA','TRANSF PROPRIA','TRANSF PRÓPRIA',
    'ENTRE CONTAS','CONTA CORRENTE PROPRIA',
  ],
  'RECEITAS & TRANSFERÊNCIAS RECEBIDAS': [
    'MUNICIPIO DE JOINVILLE','MUNICÍPIO DE JOINVILLE',
    'PREFEITURA DE JOINVILLE','PREFEITURA JOINVILLE',
    'PMJ','FAS JOINVILLE','FUNDACAO JOINVILLE','CREAS',
    'SECRETARIA MUNICIPAL','SECRETARIA EDUCACAO',
    'MENSALIDADE','MATRÍCULA','MATRICULA','CONVENIO','CONVÊNIO',
    'REPASSE PREFEITURA','REPASSE PMJ','CRED TED',
    'CRED.TED','CRÉD.TED','CREDITO CONVENIO',
  ],
};

// ─── Padrões SICOOB de código de transação (máxima precisão) ───────────────
const PADROES_SICOOB = [
  { regex: /D[ÉE]B\.CONV\.SANEA/i,                  cat: 'UTILIDADES PÚBLICAS',              merchant: 'SAMAE/Saneamento' },
  { regex: /D[ÉE]B\.CONV\.TELE/i,                   cat: 'UTILIDADES PÚBLICAS',              merchant: 'Telecomunicações' },
  { regex: /D[ÉE]B\.CONV\.PREF/i,                   cat: 'UTILIDADES PÚBLICAS',              merchant: 'Prefeitura' },
  { regex: /D[ÉE]B\.CONV\.IPTU/i,                   cat: 'UTILIDADES PÚBLICAS',              merchant: 'IPTU' },
  { regex: /D[ÉE]B\.PGTO\.BOLETO/i,                 cat: 'PAGAMENTOS DE CARTÃO',             merchant: 'Boleto/Cartão' },
  { regex: /D[ÉE]B\.CONV\.DEM\.EMPRES.*MASTER/i,    cat: 'PAGAMENTOS DE CARTÃO',             merchant: 'Mastercard' },
  { regex: /D[ÉE]B\.CONV\.DEM.*VISA/i,              cat: 'PAGAMENTOS DE CARTÃO',             merchant: 'Visa' },
  { regex: /COMP VISA ELECTRO/i,                     cat: 'PAGAMENTOS DE CARTÃO',             merchant: 'Cartão Visa' },
  { regex: /COMP MASTER/i,                           cat: 'PAGAMENTOS DE CARTÃO',             merchant: 'Cartão Master' },
  { regex: /APLIC.*RDC|RDC.*APLIC/i,                cat: 'INVESTIMENTOS',                    merchant: 'SICOOB RDC' },
  { regex: /RESGATE.*RDC|RDC.*RESGATE/i,            cat: 'INVESTIMENTOS',                    merchant: 'SICOOB RDC' },
  { regex: /APLICACAO AUTOMATICA/i,                  cat: 'INVESTIMENTOS',                    merchant: 'SICOOB' },
  { regex: /RESGATE AUTOMATICO/i,                    cat: 'INVESTIMENTOS',                    merchant: 'SICOOB' },
  { regex: /CR[ÉE]D\.TED.*MUNICIPIO|MUNICIPIO.*TED/i, cat: 'RECEITAS & TRANSFERÊNCIAS RECEBIDAS', merchant: 'Município de Joinville' },
  { regex: /CREDITO SALARIO|CR[ÉE]DITO SAL[ÁA]RIO/i, cat: 'SALÁRIOS & PRÓ-LABORE',          merchant: '' },
  { regex: /INSS PATRONAL|INSS EMPRESA|FGTS/i,       cat: 'UTILIDADES PÚBLICAS',             merchant: 'Encargos' },
  { regex: /SIMPLES NACIONAL|DARF/i,                 cat: 'UTILIDADES PÚBLICAS',             merchant: 'Receita Federal' },
];

// ─── Normalizar descrição bancária ─────────────────────────────────────────
export function normalizarDescricao(desc) {
  if (!desc) return '';

  // Remover acentos e converter para uppercase
  let s = desc.toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  // Remover valores monetários (ex: 1.706,16D ou 44,52)
  s = s.replace(/[\d.,]+,\d{2}\s*D?\b/g, ' ');

  // Remover prefixos SICOOB
  const prefixos = [
    'PIX EMIT.OUTRA IF', 'PIX RECEB.OUTRA IF',
    'PIX EMIT', 'PIX RECEB', 'PIX',
    'TRANSFERENCIA PIX', 'TRANSF PIX',
    'CRED.TED-STR', 'CRED.TED', 'CRED TED',
    'E2EID', 'E2E',
    'TRANSFERENCIA', 'TRANSF',
    'PAGAMENTO', 'RECEBIMENTO',
    'LANCAMENTO',
  ];
  for (const p of prefixos) {
    const re = new RegExp('\\b' + p.replace(/\./g, '\\.') + '\\b', 'g');
    s = s.replace(re, ' ');
  }

  // Remover IDs numéricos longos (>= 6 dígitos)
  s = s.replace(/\b\d{6,}\b/g, ' ');

  // Remover CNPJ/CPF
  s = s.replace(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g, ' ');
  s = s.replace(/\*?\d{3}\.\d{3}\.\d{3}-\*?\d{0,2}/g, ' ');
  s = s.replace(/\*\.\d{3}\.\d{3}-\*/g, ' ');

  // Remover caracteres especiais (mantém letras e espaços)
  s = s.replace(/[^A-Z0-9\s]/g, ' ');

  // Remover letras isoladas (ex: "D" débito, "C" crédito)
  s = s.replace(/\s[A-Z]\s/g, ' ');

  return s.replace(/\s+/g, ' ').trim();
}

// ─── Extrair nome do merchant/estabelecimento ──────────────────────────────
export function extrairMerchant(descLimpa) {
  if (!descLimpa) return '';
  // Retorna primeiras 4 palavras como nome do merchant
  const palavras = descLimpa.split(' ').filter(Boolean);
  return palavras.slice(0, 4).join(' ');
}

// ─── Categorizar por padrões SICOOB ───────────────────────────────────────
export function categorizarPorPadrao(descricaoOriginal) {
  for (const { regex, cat, merchant } of PADROES_SICOOB) {
    if (regex.test(descricaoOriginal)) {
      return { categoria: cat, merchant, origem: 'padrao_sicoob', confianca: 0.97 };
    }
  }
  return null;
}

// ─── Categorizar por seed de merchants conhecidos ─────────────────────────
export function categorizarPorSeed(descLimpa) {
  const upper = descLimpa.toUpperCase();
  for (const [nome, cat] of Object.entries(MERCHANTS_SEED)) {
    if (upper.includes(nome)) {
      return { categoria: cat, merchant: nome, origem: 'historico', confianca: 0.95 };
    }
  }
  return null;
}

// ─── Categorizar por palavras-chave ──────────────────────────────────────
export function categorizarPorRegras(descLimpa) {
  const upper = descLimpa.toUpperCase();
  for (const [cat, keywords] of Object.entries(REGRAS_KEYWORDS)) {
    for (const kw of keywords) {
      if (upper.includes(kw.toUpperCase())) {
        const merchant = extrairMerchant(descLimpa);
        return { categoria: cat, merchant, origem: 'regra', confianca: 0.85 };
      }
    }
  }
  return null;
}

// ─── Heurística por valor ─────────────────────────────────────────────────
export function categorizarPorValor(valor, tipo) {
  const v = Math.abs(parseFloat(valor) || 0);
  if (tipo === 'saida' && v >= 800) {
    return { categoria: 'SALÁRIOS & PRÓ-LABORE', merchant: '', origem: 'heuristica_valor', confianca: 0.55 };
  }
  if (tipo === 'saida' && v < 300) {
    return { categoria: 'FORNECEDORES & SERVIÇOS', merchant: '', origem: 'heuristica_valor', confianca: 0.45 };
  }
  return null;
}

// ─── Validar categoria contra whitelist ──────────────────────────────────
export function validarCategoria(cat) {
  if (!cat) return 'OUTROS';
  // Match exato
  if (CATEGORIAS_VALIDAS.includes(cat)) return cat;
  // Match parcial (para compatibilidade com respostas de IA)
  const upper = cat.toUpperCase();
  for (const valida of CATEGORIAS_VALIDAS) {
    if (upper.includes(valida.toUpperCase()) || valida.toUpperCase().includes(upper)) {
      return valida;
    }
  }
  return 'OUTROS';
}

// ─── Pipeline completo (sem IA) ───────────────────────────────────────────
export function categorizarTransacao({ descricao, tipo, valor }) {
  const descricaoOriginal = descricao || '';

  // 1. Padrão SICOOB (regex preciso)
  const porPadrao = categorizarPorPadrao(descricaoOriginal);
  if (porPadrao) {
    return { ...porPadrao, descricao_original: descricaoOriginal, descricao_limpa: normalizarDescricao(descricaoOriginal) };
  }

  // 2. Normalizar
  const descLimpa = normalizarDescricao(descricaoOriginal);
  const merchant = extrairMerchant(descLimpa);

  // 3. Descrição vazia após limpeza
  if (!descLimpa) {
    return { categoria: 'OUTROS', merchant: '', origem: 'desc_vazia', confianca: 1.0, descricao_original: descricaoOriginal, descricao_limpa: '' };
  }

  // 4. Merchant seed (histórico pré-carregado)
  const porSeed = categorizarPorSeed(descLimpa);
  if (porSeed) {
    return { ...porSeed, descricao_original: descricaoOriginal, descricao_limpa: descLimpa };
  }

  // 5. Regras de palavras-chave
  const porRegra = categorizarPorRegras(descLimpa);
  if (porRegra) {
    return { ...porRegra, descricao_original: descricaoOriginal, descricao_limpa: descLimpa };
  }

  // 6. Heurística por valor (baixa confiança)
  const porValor = categorizarPorValor(valor, tipo);
  if (porValor) {
    return { ...porValor, merchant, descricao_original: descricaoOriginal, descricao_limpa: descLimpa };
  }

  // 7. Fallback final
  return { categoria: 'OUTROS', merchant, origem: 'fallback', confianca: 0.3, descricao_original: descricaoOriginal, descricao_limpa: descLimpa };
}
