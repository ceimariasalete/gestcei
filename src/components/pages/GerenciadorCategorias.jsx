import React, { useState, useEffect } from 'react';
import { Modal, Btn, Table, EmptyRow, Input, SelectField, Msg } from '../ui';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../context/AppContext';
import { useAuditoria } from '../../hooks/useAuditoria';

export default function GerenciadorCategorias({ onClose, onUpdate }) {
  const { usuario } = useApp();
  const { log } = useAuditoria(usuario);

  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ nome: "", tipo: "despesa", cor: "#000000" });

  const showMsg = (m) => { setMsg(m); setTimeout(() => setMsg(""), 4000); };

  const carregarCategorias = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('fin_categorias')
      .select('*')
      .eq('ativo', true)
      .order('nome');
      
    if (error) {
      console.error(error);
      showMsg("Erro ao carregar categorias.");
    } else {
      setCategorias(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    carregarCategorias();
  }, []);

  const resetForm = () => {
    setEditId(null);
    setForm({ nome: "", tipo: "despesa", cor: "#000000" });
  };

  const handleEdit = (cat) => {
    setEditId(cat.id);
    setForm({ nome: cat.nome, tipo: cat.tipo, cor: cat.cor || "#000000" });
  };

  const salvarCategoria = async () => {
    if (!form.nome.trim()) return showMsg("O nome da categoria é obrigatório.");
    
    setLoading(true);
    
    // Validar se já existe com o mesmo nome e tipo (se não for o próprio que está sendo editado)
    const dupl = categorias.find(c => c.nome.toLowerCase() === form.nome.toLowerCase() && c.tipo === form.tipo && c.id !== editId);
    if (dupl) {
      setLoading(false);
      return showMsg("Já existe uma categoria com este nome e tipo.");
    }

    const payload = {
      nome: form.nome,
      tipo: form.tipo,
      cor: form.cor
    };

    if (editId) {
      const { error } = await supabase.from('fin_categorias').update(payload).eq('id', editId);
      if (error) {
        showMsg("Erro ao atualizar: " + error.message);
      } else {
        await log("fin_categorias", "UPDATE", editId, `Atualizou categoria ${form.nome}`, null, payload);
        showMsg("Categoria atualizada com sucesso!");
        resetForm();
        await carregarCategorias();
        if (onUpdate) onUpdate();
      }
    } else {
      const { data, error } = await supabase.from('fin_categorias').insert(payload).select().single();
      if (error) {
        showMsg("Erro ao criar: " + error.message);
      } else {
        await log("fin_categorias", "INSERT", data.id, `Criou categoria ${form.nome}`, null, payload);
        showMsg("Categoria criada com sucesso!");
        resetForm();
        await carregarCategorias();
        if (onUpdate) onUpdate();
      }
    }
    setLoading(false);
  };

  const excluirCategoria = async (cat) => {
    if (!window.confirm(`Tem certeza que deseja remover a categoria "${cat.nome}"?`)) return;
    
    setLoading(true);
    
    // Verificar uso em receitas, despesas e recorrencias
    const [rec, desp, recorr] = await Promise.all([
      supabase.from('fin_receitas').select('id').eq('categoria_id', cat.id).limit(1),
      supabase.from('fin_despesas').select('id').eq('categoria_id', cat.id).limit(1),
      supabase.from('fin_recorrencias').select('id').eq('categoria_id', cat.id).limit(1)
    ]);

    const emUso = (rec.data?.length > 0) || (desp.data?.length > 0) || (recorr.data?.length > 0);

    if (emUso) {
      showMsg("Não é possível excluir. Esta categoria já está sendo usada em lançamentos ou recorrências. Ela foi inativada.");
      // Soft delete
      const { error } = await supabase.from('fin_categorias').update({ ativo: false }).eq('id', cat.id);
      if (!error) {
        await log("fin_categorias", "UPDATE", cat.id, `Inativou categoria ${cat.nome} (em uso)`, { ativo: true }, { ativo: false });
        await carregarCategorias();
        if (onUpdate) onUpdate();
      }
    } else {
      // Hard delete
      const { error } = await supabase.from('fin_categorias').delete().eq('id', cat.id);
      if (error) {
        showMsg("Erro ao excluir: " + error.message);
      } else {
        await log("fin_categorias", "DELETE", cat.id, `Excluiu categoria ${cat.nome}`);
        showMsg("Categoria excluída.");
        await carregarCategorias();
        if (onUpdate) onUpdate();
      }
    }
    setLoading(false);
  };

  return (
    <Modal title="Gerenciador de Categorias" onClose={onClose} width="600px">
      <Msg text={msg} />
      
      {/* Formulário de Criação/Edição */}
      <div style={{ background: '#f9f9f9', padding: 16, borderRadius: 8, marginBottom: 24, border: '1px solid #eee' }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
          {editId ? "Editar Categoria" : "Nova Categoria"}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'end' }}>
          <Input 
            label="Nome da Categoria" 
            value={form.nome} 
            onChange={e => setForm({ ...form, nome: e.target.value })} 
            placeholder="Ex: Alimentação"
          />
          <SelectField 
            label="Tipo" 
            value={form.tipo} 
            onChange={e => setForm({ ...form, tipo: e.target.value })}
          >
            <option value="despesa">Despesa</option>
            <option value="receita">Receita</option>
            <option value="ambos">Ambos</option>
          </SelectField>
          <div style={{ paddingBottom: 6 }}>
            <div style={{ fontSize: 12, color: '#666', fontWeight: 500, marginBottom: 6 }}>Cor</div>
            <input 
              type="color" 
              value={form.cor} 
              onChange={e => setForm({ ...form, cor: e.target.value })}
              style={{ width: 40, height: 38, border: 'none', cursor: 'pointer', padding: 0, background: 'transparent' }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
          {editId && <Btn onClick={resetForm} disabled={loading}>Cancelar</Btn>}
          <Btn variant="primary" onClick={salvarCategoria} disabled={loading}>
            {loading ? "Salvando..." : (editId ? "Atualizar" : "Adicionar")}
          </Btn>
        </div>
      </div>

      {/* Tabela de Categorias */}
      <div style={{ maxHeight: 350, overflowY: 'auto' }}>
        <Table headers={["Cor", "Nome", "Tipo", "Ações"]}>
          {categorias.map(cat => (
            <tr key={cat.id} style={{ borderBottom: "0.5px solid #f0f0f0" }}>
              <td style={{ padding: "10px 14px", width: 50 }}>
                <div style={{ width: 16, height: 16, borderRadius: '50%', backgroundColor: cat.cor || '#ccc' }}></div>
              </td>
              <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 500 }}>{cat.nome}</td>
              <td style={{ padding: "10px 14px", fontSize: 12 }}>
                <span style={{ 
                  padding: "2px 8px", borderRadius: 10, fontSize: 11, 
                  background: cat.tipo === "receita" ? "#E1F5EE" : (cat.tipo === "despesa" ? "#FCEBEB" : "#f0f0f0"), 
                  color: cat.tipo === "receita" ? "#085041" : (cat.tipo === "despesa" ? "#791F1F" : "#555") 
                }}>
                  {cat.tipo}
                </span>
              </td>
              <td style={{ padding: "10px 14px", textAlign: "right" }}>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <Btn small onClick={() => handleEdit(cat)}>Editar</Btn>
                  <Btn small variant="danger" onClick={() => excluirCategoria(cat)}>Excluir</Btn>
                </div>
              </td>
            </tr>
          ))}
          {categorias.length === 0 && !loading && (
            <EmptyRow colSpan={4} message="Nenhuma categoria encontrada." />
          )}
        </Table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
        <Btn onClick={onClose}>Fechar</Btn>
      </div>
    </Modal>
  );
}
