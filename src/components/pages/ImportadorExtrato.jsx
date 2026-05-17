import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Modal, Btn, EmptyRow, SelectField, Msg } from '../ui';
import { fileToBase64, fmt, fmtMoeda } from '../../lib/helpers';
import { processarDocumentoIA } from '../../api/claude';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../context/AppContext';
import { useAuditoria } from '../../hooks/useAuditoria';

// Badge de origem da categorização
const BadgeOrigem = ({ origem }) => {
  const map = {
    padrao_sicoob:  { label: 'SICOOB',     bg: '#1a56db', color: '#fff' },
    historico:      { label: 'Histórico',   bg: '#0e9f6e', color: '#fff' },
    historico_db:   { label: 'Histórico',   bg: '#0e9f6e', color: '#fff' },
    regra:          { label: 'Regra',       bg: '#7e3af2', color: '#fff' },
    ia:             { label: 'IA',          bg: '#e3a008', color: '#fff' },
    heuristica_valor:{ label: 'Heurística', bg: '#f05252', color: '#fff' },
    desc_vazia:     { label: 'Vazio',       bg: '#9ca3af', color: '#fff' },
    fallback:       { label: 'Indefinido',  bg: '#9ca3af', color: '#fff' },
  };
  const s = map[origem] || { label: origem || '?', bg: '#d1d5db', color: '#374151' };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 7px', borderRadius: 12,
      fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
      background: s.bg, color: s.color, whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  );
};

// Barra de confiança
const BarraConfianca = ({ score }) => {
  const pct = Math.round((parseFloat(score) || 0) * 100);
  const cor = pct >= 85 ? '#0e9f6e' : pct >= 60 ? '#e3a008' : '#f05252';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={{ flex: 1, height: 6, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: cor, borderRadius: 4 }} />
      </div>
      <span style={{ fontSize: 10, color: '#6b7280', minWidth: 28 }}>{pct}%</span>
    </div>
  );
};

export default function ImportadorExtrato({ onClose, onImportSuccess }) {
  const { usuario } = useApp();
  const { log } = useAuditoria(usuario);

  const fileInputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [importando, setImportando] = useState(false);
  const [msg, setMsg] = useState('');
  const [showDebug, setShowDebug] = useState(false);

  const [contas, setContas] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [contaSelecionada, setContaSelecionada] = useState('');
  const [lancamentosEditaveis, setLancamentosEditaveis] = useState([]);

  useEffect(() => {
    async function carregarDados() {
      const [resContas, resCategorias] = await Promise.all([
        supabase.from('fin_contas').select('*').eq('ativo', true),
        supabase.from('fin_categorias').select('*').eq('ativo', true),
      ]);
      if (resContas.data) setContas(resContas.data);
      if (resCategorias.data) setCategorias(resCategorias.data);
    }
    carregarDados();
  }, []);

  const showMsg = useCallback((m) => { setMsg(m); setTimeout(() => setMsg(''), 5000); }, []);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setLancamentosEditaveis([]);
    }
  };

  // Encontrar categoria_id pelo nome (inclui busca parcial para compatibilidade)
  const encontrarCategoriaId = useCallback((nomeCat) => {
    if (!nomeCat) return '';
    // Busca exata
    const exato = categorias.find(c => c.nome === nomeCat);
    if (exato) return exato.id;
    // Busca parcial (case-insensitive)
    const parcial = categorias.find(c =>
      c.nome.toUpperCase().includes(nomeCat.toUpperCase()) ||
      nomeCat.toUpperCase().includes(c.nome.toUpperCase())
    );
    return parcial?.id || '';
  }, [categorias]);

  const handleProcessar = async () => {
    if (!selectedFile) return showMsg('Selecione um arquivo primeiro.');
    setLoading(true);
    try {
      const data = await processarDocumentoIA(selectedFile, [], []);
      const extraidos = Array.isArray(data) ? data : (data?.lancamentos || data?.transacoes || []);

      setLancamentosEditaveis(extraidos.map(l => ({
        ...l,
        conta_id: contaSelecionada || '',
        categoria_id: encontrarCategoriaId(l.categoria_sugerida),
        selected: true,
        // campos de debug (prefixo _)
        _descricao_original:   l._descricao_original   || l.descricao || '',
        _descricao_limpa:      l._descricao_limpa       || '',
        _merchant_detectado:   l._merchant_detectado    || l.fornecedor_chave || '',
        _origem_categorizacao: l._origem_categorizacao  || 'desconhecido',
        _score_confianca:      l._score_confianca       || 0,
      })));
    } catch (error) {
      showMsg('Erro ao processar o arquivo: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (index, field, value) => {
    const novos = [...lancamentosEditaveis];
    novos[index] = { ...novos[index], [field]: value };
    setLancamentosEditaveis(novos);
  };

  // Ao editar categoria manualmente → salvar no histórico
  const handleEditCategoria = async (index, categoriaId) => {
    handleEdit(index, 'categoria_id', categoriaId);
    const l = lancamentosEditaveis[index];
    const merchant = l._merchant_detectado || l.fornecedor_chave || '';
    const catNome = categorias.find(c => c.id === categoriaId)?.nome || '';

    if (merchant && catNome) {
      try {
        await fetch('/api/aprender-merchant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ normalized_name: merchant, category: catNome, origem: 'usuario' }),
        });
        // Atualizar debug do item
        const novos = [...lancamentosEditaveis];
        novos[index] = { ...novos[index], _origem_categorizacao: 'usuario', _score_confianca: 0.98 };
        setLancamentosEditaveis(novos);
      } catch (_) {}
    }
  };

  const handleToggleSelect    = (i) => { const n = [...lancamentosEditaveis]; n[i].selected = !n[i].selected; setLancamentosEditaveis(n); };
  const handleToggleSelectAll = (e) => setLancamentosEditaveis(prev => prev.map(l => ({ ...l, selected: e.target.checked })));
  const handleRemove          = (i) => setLancamentosEditaveis(lancamentosEditaveis.filter((_, idx) => idx !== i));

  const handleAddManual = () => {
    setLancamentosEditaveis([...lancamentosEditaveis, {
      data: new Date().toISOString().split('T')[0],
      descricao: '', valor: '', tipo: 'despesa',
      categoria_id: '', conta_id: contaSelecionada || '',
      selected: true,
      _descricao_original: '', _descricao_limpa: '', _merchant_detectado: '',
      _origem_categorizacao: 'manual', _score_confianca: 1,
    }]);
  };

  const handleContaGlobalChange = (e) => {
    const val = e.target.value;
    setContaSelecionada(val);
    setLancamentosEditaveis(prev => prev.map(l => ({ ...l, conta_id: val })));
  };

  const importarSelecionados = async () => {
    const itens = lancamentosEditaveis.filter(l => l.selected);
    if (itens.length === 0) return showMsg('Nenhum lançamento selecionado.');

    for (let i = 0; i < itens.length; i++) {
      const l = itens[i];
      if (!l.descricao?.trim())         return showMsg(`Lançamento ${i + 1} sem descrição.`);
      if (!l.data)                       return showMsg(`Lançamento ${i + 1} sem data.`);
      const val = parseFloat(l.valor);
      if (isNaN(val) || val <= 0)        return showMsg(`Lançamento ${i + 1} com valor inválido.`);
    }

    setImportando(true);
    let ok = 0;

    for (const l of itens) {
      const payload = {
        descricao:    l.descricao,
        valor:        parseFloat(l.valor) || 0,
        data:         l.data,
        tipo:         l.tipo === 'receita' ? 'outros' : 'variavel',
        conta_id:     l.conta_id || null,
        categoria_id: l.categoria_id || null,
        usuario_id:   usuario?.id,
        usuario_nome: usuario?.nome,
        observacao: [
          'Importado via extrato IA',
          l._merchant_detectado ? `Merchant: ${l._merchant_detectado}` : '',
          l._origem_categorizacao ? `Origem: ${l._origem_categorizacao}` : '',
        ].filter(Boolean).join(' | '),
      };

      try {
        const tabela = l.tipo === 'receita' ? 'fin_receitas' : 'fin_despesas';
        const { data: row, error } = await supabase.from(tabela).insert(payload).select().single();
        if (!error && row) {
          await log(tabela, 'INSERT', row.id, `Importação IA: ${l.descricao}`, null, payload);
          ok++;
        }
      } catch (_) {}
    }

    setImportando(false);
    if (ok > 0) {
      if (onImportSuccess) onImportSuccess();
      else { showMsg(`${ok} lançamentos importados com sucesso!`); setTimeout(() => onClose(), 1500); }
    } else {
      showMsg('Falha ao importar os lançamentos.');
    }
  };

  // ── Contadores de resumo ─────────────────────────────────────────────────
  const totalSelecionados = lancamentosEditaveis.filter(l => l.selected).length;
  const origemCounts = lancamentosEditaveis.reduce((acc, l) => {
    const o = l._origem_categorizacao || 'desconhecido';
    acc[o] = (acc[o] || 0) + 1;
    return acc;
  }, {});

  return (
    <Modal title="Importar Extrato Bancário" onClose={onClose}>
      <Msg text={msg} />

      {/* ── Seleção de arquivo ─────────────────────────────────────────── */}
      <div style={{ padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <p style={{ fontSize: 14, color: '#666', textAlign: 'center' }}>
            Selecione um extrato bancário (PDF ou imagem) para processamento.
          </p>

          <input type="file" ref={fileInputRef} accept=".pdf,image/*"
            style={{ display: 'none' }} onChange={handleFileChange} />

          <Btn variant="primary" onClick={() => fileInputRef.current?.click()} disabled={loading || importando}>
            {selectedFile ? 'Trocar Arquivo' : 'Selecionar Arquivo'}
          </Btn>

          {selectedFile && !loading && lancamentosEditaveis.length === 0 && (
            <>
              <div style={{ fontSize: 13, color: '#1D9E75', background: '#E1F5EE', padding: '6px 12px', borderRadius: 8 }}>
                Arquivo selecionado: <strong>{selectedFile.name}</strong>
              </div>
              <Btn variant="primary" onClick={handleProcessar} disabled={loading || importando}>
                Processar Documento
              </Btn>
            </>
          )}

          {selectedFile && !loading && lancamentosEditaveis.length > 0 && (
            <div style={{ fontSize: 13, color: '#1D9E75', background: '#E1F5EE', padding: '6px 12px', borderRadius: 8 }}>
              Processado: <strong>{selectedFile.name}</strong> — {lancamentosEditaveis.length} lançamentos extraídos
            </div>
          )}

          {loading && (
            <div style={{ fontSize: 13, color: '#888', marginTop: 8 }}>
              Aguarde, extraindo e categorizando via IA...
            </div>
          )}
        </div>

        {/* ── Tabela de revisão ──────────────────────────────────────────── */}
        {lancamentosEditaveis.length > 0 && !loading && (
          <div style={{ marginTop: 16 }}>
            {/* Cabeçalho com controles */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                Revisão de Lançamentos — {totalSelecionados}/{lancamentosEditaveis.length} selecionados
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn small onClick={() => setShowDebug(d => !d)}>
                  {showDebug ? 'Ocultar Debug' : 'Ver Debug'}
                </Btn>
                <Btn small onClick={handleAddManual}>+ Manual</Btn>
              </div>
            </div>

            {/* Resumo de origens */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {Object.entries(origemCounts).map(([origem, qtd]) => (
                <div key={origem} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#555' }}>
                  <BadgeOrigem origem={origem} /> ×{qtd}
                </div>
              ))}
            </div>

            {/* Conta global */}
            <div style={{ marginBottom: 16 }}>
              <SelectField label="Conta de Destino (todos)" value={contaSelecionada} onChange={handleContaGlobalChange}>
                <option value="">Selecione uma conta...</option>
                {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </SelectField>
            </div>

            {/* Tabela */}
            <div style={{ maxHeight: 440, overflowY: 'auto', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontWeight: 600 }}>
                    <th style={{ padding: '8px 6px', width: 30, textAlign: 'center' }}>
                      <input type="checkbox"
                        checked={lancamentosEditaveis.length > 0 && lancamentosEditaveis.every(l => l.selected)}
                        onChange={handleToggleSelectAll} />
                    </th>
                    <th style={{ padding: '8px 6px', minWidth: 90 }}>Data</th>
                    <th style={{ padding: '8px 6px', minWidth: 150 }}>Descrição</th>
                    <th style={{ padding: '8px 6px', minWidth: 80 }}>Valor</th>
                    <th style={{ padding: '8px 6px', minWidth: 70 }}>Tipo</th>
                    <th style={{ padding: '8px 6px', minWidth: 150 }}>Categoria</th>
                    <th style={{ padding: '8px 6px', minWidth: 110 }}>Conta</th>
                    {showDebug && <>
                      <th style={{ padding: '8px 6px', minWidth: 100 }}>Merchant</th>
                      <th style={{ padding: '8px 6px', minWidth: 90 }}>Origem</th>
                      <th style={{ padding: '8px 6px', minWidth: 80 }}>Confiança</th>
                    </>}
                    <th style={{ padding: '8px 6px', width: 30 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {lancamentosEditaveis.map((l, i) => (
                    <tr key={i} style={{
                      borderBottom: '1px solid #f3f4f6',
                      opacity: l.selected ? 1 : 0.45,
                      background: l.selected ? 'transparent' : '#f9fafb',
                    }}>
                      <td style={{ padding: '6px', textAlign: 'center' }}>
                        <input type="checkbox" checked={!!l.selected} onChange={() => handleToggleSelect(i)} />
                      </td>
                      <td style={{ padding: '6px' }}>
                        <input type="date" value={l.data || ''} onChange={e => handleEdit(i, 'data', e.target.value)}
                          style={{ width: 110, fontSize: 11, padding: '3px 4px', border: '1px solid #d1d5db', borderRadius: 4 }} />
                      </td>
                      <td style={{ padding: '6px' }}>
                        <input type="text" value={l.descricao || ''} onChange={e => handleEdit(i, 'descricao', e.target.value)}
                          title={l._descricao_original ? `Original: ${l._descricao_original}\nLimpa: ${l._descricao_limpa}` : ''}
                          style={{ width: '100%', minWidth: 140, fontSize: 11, padding: '3px 4px', border: '1px solid #d1d5db', borderRadius: 4 }} />
                      </td>
                      <td style={{ padding: '6px' }}>
                        <input type="number" step="0.01" value={l.valor || ''} onChange={e => handleEdit(i, 'valor', e.target.value)}
                          style={{ width: 80, fontSize: 11, padding: '3px 4px', border: '1px solid #d1d5db', borderRadius: 4 }} />
                      </td>
                      <td style={{ padding: '6px' }}>
                        <select value={l.tipo || 'despesa'} onChange={e => handleEdit(i, 'tipo', e.target.value)}
                          style={{ fontSize: 11, padding: '3px 4px', border: '1px solid #d1d5db', borderRadius: 4 }}>
                          <option value="receita">Receita</option>
                          <option value="despesa">Despesa</option>
                          <option value="saida">Saída</option>
                          <option value="entrada">Entrada</option>
                        </select>
                      </td>
                      <td style={{ padding: '6px' }}>
                        <select value={l.categoria_id || ''} onChange={e => handleEditCategoria(i, e.target.value)}
                          style={{ fontSize: 11, padding: '3px 4px', border: '1px solid #d1d5db', borderRadius: 4, minWidth: 140 }}>
                          <option value="">Nenhuma</option>
                          {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '6px' }}>
                        <select value={l.conta_id || ''} onChange={e => handleEdit(i, 'conta_id', e.target.value)}
                          style={{ fontSize: 11, padding: '3px 4px', border: '1px solid #d1d5db', borderRadius: 4, minWidth: 100 }}>
                          <option value="">Sem conta</option>
                          {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                        </select>
                      </td>
                      {showDebug && <>
                        <td style={{ padding: '6px', maxWidth: 120 }}>
                          <span style={{ fontSize: 10, color: '#374151', wordBreak: 'break-word' }}>
                            {l._merchant_detectado || '—'}
                          </span>
                        </td>
                        <td style={{ padding: '6px' }}>
                          <BadgeOrigem origem={l._origem_categorizacao} />
                        </td>
                        <td style={{ padding: '6px', minWidth: 80 }}>
                          <BarraConfianca score={l._score_confianca} />
                        </td>
                      </>}
                      <td style={{ padding: '6px' }}>
                        <Btn small variant="danger" onClick={() => handleRemove(i)}>×</Btn>
                      </td>
                    </tr>
                  ))}
                  {lancamentosEditaveis.length === 0 && <EmptyRow colSpan={showDebug ? 11 : 8} message="Nenhum lançamento." />}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Rodapé ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, paddingTop: 12, borderTop: '1px solid #f0f0f0' }}>
        <Btn onClick={onClose} disabled={importando}>Cancelar</Btn>
        {lancamentosEditaveis.length > 0 && !loading && (
          <Btn variant="primary" onClick={importarSelecionados} disabled={importando}>
            {importando ? 'Importando...' : `Importar Selecionados (${totalSelecionados})`}
          </Btn>
        )}
      </div>
    </Modal>
  );
}
