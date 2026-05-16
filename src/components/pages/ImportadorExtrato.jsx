import React, { useRef, useState, useEffect } from 'react';
import { Modal, Btn, Table, EmptyRow, SelectField, Input, Msg } from '../ui';
import { fileToBase64, fmt, fmtMoeda } from '../../lib/helpers';
import { processarDocumentoIA } from '../../api/claude';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../context/AppContext';
import { useAuditoria } from '../../hooks/useAuditoria';

export default function ImportadorExtrato({ onClose, onImportSuccess }) {
  const { usuario } = useApp();
  const { log } = useAuditoria(usuario);

  const fileInputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileBase64, setFileBase64] = useState(null);
  const [loading, setLoading] = useState(false);
  const [importando, setImportando] = useState(false);
  const [msg, setMsg] = useState("");

  const [contas, setContas] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [contaSelecionada, setContaSelecionada] = useState("");
  
  const [lancamentosEditaveis, setLancamentosEditaveis] = useState([]);

  useEffect(() => {
    async function carregarDados() {
      const [ resContas, resCategorias ] = await Promise.all([
        supabase.from('fin_contas').select('*').eq('ativo', true),
        supabase.from('fin_categorias').select('*').eq('ativo', true)
      ]);
      if (resContas.data) setContas(resContas.data);
      if (resCategorias.data) setCategorias(resCategorias.data);
    }
    carregarDados();
  }, []);

  const showMsg = (m) => { setMsg(m); setTimeout(() => setMsg(""), 4000); };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setFileBase64(null); // Resetar processamento anterior se houver
      setLancamentosEditaveis([]);
    }
  };

  const handleProcessar = async () => {
    if (!selectedFile) return showMsg("Selecione um arquivo primeiro.");
    setLoading(true);
    try {
      const base64 = await fileToBase64(selectedFile);
      setFileBase64(base64);
      
      const data = await processarDocumentoIA(selectedFile, categorias, []);
      const extraidos = Array.isArray(data) ? data : (data?.transacoes || data?.lancamentos || []);
      
      setLancamentosEditaveis(extraidos.map(l => ({
        ...l,
        conta_id: contaSelecionada || "", 
        categoria_id: categorias.find(c => c.nome === l.categoria_sugerida)?.id || "",
        selected: true // Padrão: todos selecionados
      })));
      
    } catch (error) {
      showMsg("Erro ao processar o arquivo via IA: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectClick = () => {
    fileInputRef.current?.click();
  };

  const handleEdit = (index, field, value) => {
    const novos = [...lancamentosEditaveis];
    novos[index][field] = value;
    setLancamentosEditaveis(novos);
  };

  const handleToggleSelect = (index) => {
    const novos = [...lancamentosEditaveis];
    novos[index].selected = !novos[index].selected;
    setLancamentosEditaveis(novos);
  };

  const handleToggleSelectAll = (e) => {
    const isChecked = e.target.checked;
    setLancamentosEditaveis(prev => prev.map(l => ({ ...l, selected: isChecked })));
  };

  const handleAddManual = () => {
    const dataHoje = new Date().toISOString().split('T')[0];
    setLancamentosEditaveis([
      ...lancamentosEditaveis,
      {
        data: dataHoje,
        descricao: '',
        valor: '',
        tipo: 'despesa',
        categoria_id: '',
        conta_id: contaSelecionada || '',
        selected: true
      }
    ]);
  };

  const handleRemove = (index) => {
    setLancamentosEditaveis(lancamentosEditaveis.filter((_, i) => i !== index));
  };

  const handleContaGlobalChange = (e) => {
    const val = e.target.value;
    setContaSelecionada(val);
    setLancamentosEditaveis(prev => prev.map(l => ({
      ...l,
      conta_id: val
    })));
  };

  const importarSelecionados = async () => {
    const itensParaImportar = lancamentosEditaveis.filter(l => l.selected);
    
    if (itensParaImportar.length === 0) return showMsg("Nenhum lançamento selecionado para importar.");
    
    // Validação estrita
    for (let i = 0; i < itensParaImportar.length; i++) {
      const l = itensParaImportar[i];
      if (!l.descricao || !l.descricao.trim()) return showMsg(`O lançamento ${i + 1} selecionado está sem descrição.`);
      if (!l.data) return showMsg(`O lançamento ${i + 1} selecionado está sem data.`);
      const val = parseFloat(l.valor);
      if (isNaN(val) || val <= 0) return showMsg(`O lançamento ${i + 1} selecionado possui valor inválido.`);
    }

    setImportando(true);
    let sucessoCount = 0;

    for (const l of itensParaImportar) {
      const payload = {
        descricao: l.descricao,
        valor: parseFloat(l.valor) || 0,
        data: l.data,
        tipo: l.tipo === 'receita' ? 'outros' : 'variavel',
        conta_id: l.conta_id || null,
        categoria_id: l.categoria_id || null,
        usuario_id: usuario?.id,
        usuario_nome: usuario?.nome,
        observacao: l.fornecedor_chave ? `Importado via extrato IA. Fornecedor: ${l.fornecedor_chave}` : 'Importado via extrato IA'
      };

      try {
        const tabela = l.tipo === 'receita' ? 'fin_receitas' : 'fin_despesas';
        const { data, error } = await supabase.from(tabela).insert(payload).select().single();
        
        if (!error && data) {
          await log(tabela, 'INSERT', data.id, `Importação IA: ${l.descricao}`, null, payload);
          sucessoCount++;
        } else {
          console.error("Erro ao importar item:", error, l);
        }
      } catch (err) {
        console.error("Exceção ao importar:", err);
      }
    }

    setImportando(false);
    if (sucessoCount > 0) {
      if (onImportSuccess) {
        onImportSuccess();
      } else {
        showMsg(`${sucessoCount} lançamentos importados com sucesso!`);
        setTimeout(() => onClose(), 1500);
      }
    } else {
      showMsg("Falha ao importar os lançamentos.");
    }
  };

  return (
    <Modal title="Importar Extrato Bancário" onClose={onClose}>
      <Msg text={msg} />
      <div style={{ padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <p style={{ fontSize: 14, color: '#666', textAlign: 'center' }}>
            Selecione um arquivo de extrato bancário para processamento via IA.
          </p>
          
          <input 
            type="file" 
            ref={fileInputRef} 
            accept=".pdf,image/*" 
            style={{ display: 'none' }} 
            onChange={handleFileChange}
          />
          
          <Btn variant="primary" onClick={handleSelectClick} disabled={loading || importando}>
            {selectedFile ? "Trocar Arquivo" : "Selecionar Arquivo"}
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
              Arquivo processado: <strong>{selectedFile.name}</strong>
            </div>
          )}
          
          {loading && (
            <div style={{ fontSize: 13, color: '#888', marginTop: 8 }}>
              Aguarde, a Inteligência Artificial está extraindo os dados...
            </div>
          )}
        </div>

        {lancamentosEditaveis.length > 0 && !loading && (
          <div style={{ marginTop: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Revisão de Lançamentos Extraídos</div>
            
            <div style={{ marginBottom: 16 }}>
              <SelectField 
                label="Conta de Destino (Para todos)" 
                value={contaSelecionada} 
                onChange={handleContaGlobalChange}
              >
                <option value="">Selecione uma conta...</option>
                {contas.map(c => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </SelectField>
              <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                * Esta conta será aplicada a todos os lançamentos acima.
              </div>
            </div>

            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#f5f5f5', borderBottom: '1px solid #e0e0e0', fontSize: 12, color: '#666' }}>
                    <th style={{ padding: '8px', width: 30, textAlign: 'center' }}>
                      <input 
                        type="checkbox" 
                        checked={lancamentosEditaveis.length > 0 && lancamentosEditaveis.every(l => l.selected)}
                        onChange={handleToggleSelectAll}
                      />
                    </th>
                    <th style={{ padding: '8px', fontWeight: 600 }}>Data</th>
                    <th style={{ padding: '8px', fontWeight: 600 }}>Descrição</th>
                    <th style={{ padding: '8px', fontWeight: 600 }}>Valor</th>
                    <th style={{ padding: '8px', fontWeight: 600 }}>Tipo</th>
                    <th style={{ padding: '8px', fontWeight: 600 }}>Categoria</th>
                    <th style={{ padding: '8px', fontWeight: 600 }}>Conta</th>
                    <th style={{ padding: '8px', fontWeight: 600 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {lancamentosEditaveis.map((l, i) => (
                    <tr key={i} style={{ borderBottom: "0.5px solid #f0f0f0", opacity: l.selected ? 1 : 0.5 }}>
                      <td style={{ padding: "8px", textAlign: 'center' }}>
                        <input 
                          type="checkbox" 
                          checked={!!l.selected} 
                          onChange={() => handleToggleSelect(i)} 
                        />
                      </td>
                      <td style={{ padding: "8px" }}>
                        <input type="date" value={l.data} onChange={e => handleEdit(i, 'data', e.target.value)} style={{ width: 110, fontSize: 12, padding: 4, border: '1px solid #ccc', borderRadius: 4 }} />
                      </td>
                      <td style={{ padding: "8px" }}>
                        <input type="text" value={l.descricao} onChange={e => handleEdit(i, 'descricao', e.target.value)} style={{ width: '100%', minWidth: 120, fontSize: 12, padding: 4, border: '1px solid #ccc', borderRadius: 4 }} />
                      </td>
                      <td style={{ padding: "8px" }}>
                        <input type="number" step="0.01" value={l.valor} onChange={e => handleEdit(i, 'valor', e.target.value)} style={{ width: 80, fontSize: 12, padding: 4, border: '1px solid #ccc', borderRadius: 4 }} />
                      </td>
                      <td style={{ padding: "8px" }}>
                        <select value={l.tipo} onChange={e => handleEdit(i, 'tipo', e.target.value)} style={{ fontSize: 12, padding: 4, border: '1px solid #ccc', borderRadius: 4 }}>
                          <option value="receita">Receita</option>
                          <option value="despesa">Despesa</option>
                        </select>
                      </td>
                      <td style={{ padding: "8px" }}>
                        <select value={l.categoria_id || ""} onChange={e => handleEdit(i, 'categoria_id', e.target.value)} style={{ fontSize: 12, padding: 4, border: '1px solid #ccc', borderRadius: 4, width: 100 }}>
                          <option value="">Nenhuma</option>
                          {categorias.filter(c => l.tipo === 'receita' ? c.tipo !== 'despesa' : c.tipo !== 'receita').map(c => (
                            <option key={c.id} value={c.id}>{c.nome}</option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: "8px" }}>
                        <select value={l.conta_id || ""} onChange={e => handleEdit(i, 'conta_id', e.target.value)} style={{ fontSize: 12, padding: 4, border: '1px solid #ccc', borderRadius: 4, width: 100 }}>
                          <option value="">Sem conta</option>
                          {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: "8px", textAlign: 'right' }}>
                        <Btn small variant="danger" onClick={() => handleRemove(i)}>X</Btn>
                      </td>
                    </tr>
                  ))}
                  {lancamentosEditaveis.length === 0 && <EmptyRow colSpan={8} message="Todos os lançamentos foram removidos." />}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 12 }}>
              <Btn small onClick={handleAddManual}>+ Adicionar Lançamento Manual</Btn>
            </div>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
        <Btn onClick={onClose} disabled={importando}>Cancelar</Btn>
        {lancamentosEditaveis.length > 0 && !loading && (
          <Btn variant="primary" onClick={importarSelecionados} disabled={importando}>
            {importando ? "Importando..." : `Importar Selecionados (${lancamentosEditaveis.filter(l => l.selected).length})`}
          </Btn>
        )}
      </div>
    </Modal>
  );
}
