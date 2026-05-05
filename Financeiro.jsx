import { useState } from 'react';
import { useFinanceiro } from '../../hooks/useFinanceiro';

const styles = {
  container: { minHeight: '100vh', background: '#f9f9f9' },
  header: { background: '#fff', padding: '2rem', borderBottom: '1px solid #eee' },
  nav: { display: 'flex', borderBottom: '1px solid #eee', background: '#fff', overflow: 'auto' },
  navBtn: { flex: 1, padding: '1rem', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '14px', fontWeight: '500', borderBottom: '3px solid transparent', whiteSpace: 'nowrap' },
  navBtnActive: { borderBottomColor: '#1D9E75', color: '#1D9E75' },
  content: { padding: '2rem' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' },
  metricaCard: { background: '#fff', padding: '1.5rem', borderRadius: '8px', borderTop: '4px solid #1D9E75', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' },
  metricaValor: { fontSize: '24px', fontWeight: 'bold', marginTop: '0.5rem' },
  botao: { padding: '0.75rem 1.5rem', background: '#1D9E75', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', marginBottom: '1rem' },
  botaoDanger: { background: '#E74C3C' },
  tabela: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '1rem', textAlign: 'left', background: '#f5f5f5', borderBottom: '1px solid #eee' },
  td: { padding: '1rem', borderBottom: '1px solid #eee' },
  modal: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modalContent: { background: '#fff', padding: '2rem', borderRadius: '8px', minWidth: '400px', maxHeight: '90vh', overflow: 'auto' },
  input: { width: '100%', padding: '0.75rem', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px', marginBottom: '1rem', boxSizing: 'border-box' },
  erro: { padding: '1rem', background: '#FFE0E0', borderLeft: '4px solid #E74C3C', color: '#C33', marginBottom: '1rem', borderRadius: '4px' },
  card: { background: '#fff', padding: '1.5rem', borderRadius: '8px', marginBottom: '1.5rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }
};

export default function Financeiro() {
  const [aba, setAba] = useState('dashboard');
  const periodo = {
    inicio: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    fim: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]
  };

  const { receitas, despesas, contas, categorias, loading, erro, salvarReceita, salvarDespesa, deletarReceita, deletarDespesa } = useFinanceiro(periodo);

  const [modalReceita, setModalReceita] = useState(false);
  const [modalDespesa, setModalDespesa] = useState(false);
  const [formReceita, setFormReceita] = useState({ tipo: 'mensalidade', valor: '', data_receita: new Date().toISOString().split('T')[0], descricao: '', categoria_id: '', conta_id: '' });
  const [formDespesa, setFormDespesa] = useState({ descricao: '', valor: '', data_despesa: new Date().toISOString().split('T')[0], tipo: 'variavel', categoria_id: '', conta_id: '', paga: false });
  const [erroLocal, setErroLocal] = useState('');

  if (loading) return <div style={styles.container}><div style={styles.header}>Carregando...</div></div>;

  const totalReceitas = receitas.reduce((s, r) => s + (r.valor || 0), 0);
  const totalDespesas = despesas.reduce((s, d) => s + (d.valor || 0), 0);
  const saldoTotal = contas.reduce((s, c) => s + (c.saldo_atual || 0), 0);

  const handleSalvarReceita = async () => {
    setErroLocal('');
    const result = await salvarReceita(formReceita);
    if (result.sucesso) {
      setModalReceita(false);
      setFormReceita({ tipo: 'mensalidade', valor: '', data_receita: new Date().toISOString().split('T')[0], descricao: '', categoria_id: '', conta_id: '' });
    } else {
      setErroLocal(result.erro || 'Erro ao salvar');
    }
  };

  const handleSalvarDespesa = async () => {
    setErroLocal('');
    const result = await salvarDespesa(formDespesa);
    if (result.sucesso) {
      setModalDespesa(false);
      setFormDespesa({ descricao: '', valor: '', data_despesa: new Date().toISOString().split('T')[0], tipo: 'variavel', categoria_id: '', conta_id: '', paga: false });
    } else {
      setErroLocal(result.erro || 'Erro ao salvar');
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1>Financeiro</h1>
        <p style={{ color: '#666', fontSize: '14px' }}>Período: {new Date(periodo.inicio).toLocaleDateString('pt-BR')} a {new Date(periodo.fim).toLocaleDateString('pt-BR')}</p>
      </div>

      <div style={styles.nav}>
        <button style={{ ...styles.navBtn, ...(aba === 'dashboard' ? styles.navBtnActive : {}) }} onClick={() => setAba('dashboard')}>Dashboard</button>
        <button style={{ ...styles.navBtn, ...(aba === 'receitas' ? styles.navBtnActive : {}) }} onClick={() => setAba('receitas')}>Receitas</button>
        <button style={{ ...styles.navBtn, ...(aba === 'despesas' ? styles.navBtnActive : {}) }} onClick={() => setAba('despesas')}>Despesas</button>
        <button style={{ ...styles.navBtn, ...(aba === 'contas' ? styles.navBtnActive : {}) }} onClick={() => setAba('contas')}>Contas</button>
      </div>

      {erro && <div style={{ ...styles.erro, margin: '2rem 2rem 0' }}>{erro}</div>}

      <div style={styles.content}>
        {aba === 'dashboard' && (
          <div>
            <div style={styles.grid}>
              <div style={styles.metricaCard}>
                <div style={{ fontSize: '12px', color: '#999' }}>Saldo Total</div>
                <div style={{ ...styles.metricaValor, color: saldoTotal >= 0 ? '#1D9E75' : '#E74C3C' }}>R$ {saldoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
              </div>
              <div style={styles.metricaCard}>
                <div style={{ fontSize: '12px', color: '#999' }}>Receitas</div>
                <div style={{ ...styles.metricaValor, color: '#27AE60' }}>R$ {totalReceitas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
              </div>
              <div style={styles.metricaCard}>
                <div style={{ fontSize: '12px', color: '#999' }}>Despesas</div>
                <div style={{ ...styles.metricaValor, color: '#E74C3C' }}>R$ {totalDespesas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
              </div>
            </div>

            <div style={styles.card}>
              <h3>Saldo por Conta</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
                {contas.map(conta => (
                  <div key={conta.id} style={{ padding: '1rem', border: '1px solid #eee', borderRadius: '4px', borderLeft: '4px solid #1D9E75' }}>
                    <div style={{ fontSize: '12px', color: '#666' }}>{conta.nome}</div>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', marginTop: '0.5rem', color: conta.saldo_atual >= 0 ? '#1D9E75' : '#E74C3C' }}>
                      R$ {conta.saldo_atual.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {aba === 'receitas' && (
          <div>
            <button style={styles.botao} onClick={() => setModalReceita(true)}>Nova Receita</button>
            <div style={styles.card}>
              <table style={styles.tabela}>
                <thead><tr><th style={styles.th}>Data</th><th style={styles.th}>Descrição</th><th style={styles.th}>Tipo</th><th style={styles.th} style={{ textAlign: 'right' }}>Valor</th><th style={styles.th}>Ação</th></tr></thead>
                <tbody>
                  {receitas.map(r => (
                    <tr key={r.id}>
                      <td style={styles.td}>{new Date(r.data_receita).toLocaleDateString('pt-BR')}</td>
                      <td style={styles.td}>{r.descricao}</td>
                      <td style={styles.td}>{r.tipo}</td>
                      <td style={{ ...styles.td, color: '#1D9E75', fontWeight: 'bold', textAlign: 'right' }}>R$ {r.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td style={styles.td}><button style={{ ...styles.botao, ...styles.botaoDanger, padding: '0.25rem 0.75rem', fontSize: '12px', marginBottom: 0 }} onClick={() => deletarReceita(r.id)}>Deletar</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {aba === 'despesas' && (
          <div>
            <button style={{ ...styles.botao, ...styles.botaoDanger }} onClick={() => setModalDespesa(true)}>Nova Despesa</button>
            <div style={styles.card}>
              <table style={styles.tabela}>
                <thead><tr><th style={styles.th}>Data</th><th style={styles.th}>Descrição</th><th style={styles.th}>Categoria</th><th style={styles.th} style={{ textAlign: 'right' }}>Valor</th><th style={styles.th}>Ação</th></tr></thead>
                <tbody>
                  {despesas.map(d => (
                    <tr key={d.id}>
                      <td style={styles.td}>{new Date(d.data_despesa).toLocaleDateString('pt-BR')}</td>
                      <td style={styles.td}>{d.descricao}</td>
                      <td style={styles.td}>{categorias.find(c => c.id === d.categoria_id)?.nome || '-'}</td>
                      <td style={{ ...styles.td, color: '#E74C3C', fontWeight: 'bold', textAlign: 'right' }}>R$ {d.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td style={styles.td}><button style={{ ...styles.botao, ...styles.botaoDanger, padding: '0.25rem 0.75rem', fontSize: '12px', marginBottom: 0 }} onClick={() => deletarDespesa(d.id)}>Deletar</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {aba === 'contas' && (
          <div>
            {contas.map(conta => (
              <div key={conta.id} style={styles.card}>
                <h3>{conta.nome}</h3>
                <p style={{ color: '#666' }}>{conta.tipo.toUpperCase()}</p>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: conta.saldo_atual >= 0 ? '#1D9E75' : '#E74C3C', marginTop: '1rem' }}>
                  R$ {conta.saldo_atual.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modalReceita && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <h3>Nova Receita</h3>
            {erroLocal && <div style={styles.erro}>{erroLocal}</div>}
            <input type="text" placeholder="Descrição" value={formReceita.descricao} onChange={e => setFormReceita({ ...formReceita, descricao: e.target.value })} style={styles.input} />
            <input type="number" placeholder="Valor" value={formReceita.valor} onChange={e => setFormReceita({ ...formReceita, valor: e.target.value })} style={styles.input} />
            <input type="date" value={formReceita.data_receita} onChange={e => setFormReceita({ ...formReceita, data_receita: e.target.value })} style={styles.input} />
            <select value={formReceita.tipo} onChange={e => setFormReceita({ ...formReceita, tipo: e.target.value })} style={styles.input}>
              <option value="mensalidade">Mensalidade</option>
              <option value="matricula">Matrícula</option>
              <option value="convenio">Convênio</option>
              <option value="doacao">Doação</option>
            </select>
            <select value={formReceita.conta_id} onChange={e => setFormReceita({ ...formReceita, conta_id: e.target.value })} style={styles.input}>
              <option value="">Selecione conta</option>
              {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setModalReceita(false)} style={{ ...styles.botao, background: '#ccc', color: '#333' }}>Cancelar</button>
              <button onClick={handleSalvarReceita} style={styles.botao}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      {modalDespesa && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <h3>Nova Despesa</h3>
            {erroLocal && <div style={styles.erro}>{erroLocal}</div>}
            <input type="text" placeholder="Descrição" value={formDespesa.descricao} onChange={e => setFormDespesa({ ...formDespesa, descricao: e.target.value })} style={styles.input} />
            <input type="number" placeholder="Valor" value={formDespesa.valor} onChange={e => setFormDespesa({ ...formDespesa, valor: e.target.value })} style={styles.input} />
            <input type="date" value={formDespesa.data_despesa} onChange={e => setFormDespesa({ ...formDespesa, data_despesa: e.target.value })} style={styles.input} />
            <select value={formDespesa.tipo} onChange={e => setFormDespesa({ ...formDespesa, tipo: e.target.value })} style={styles.input}>
              <option value="variavel">Variável</option>
              <option value="fixa">Fixa</option>
            </select>
            <select value={formDespesa.categoria_id} onChange={e => setFormDespesa({ ...formDespesa, categoria_id: e.target.value })} style={styles.input}>
              <option value="">Selecione categoria</option>
              {categorias.filter(c => c.tipo === 'despesa' || c.tipo === 'ambos').map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <select value={formDespesa.conta_id} onChange={e => setFormDespesa({ ...formDespesa, conta_id: e.target.value })} style={styles.input}>
              <option value="">Selecione conta</option>
              {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setModalDespesa(false)} style={{ ...styles.botao, background: '#ccc', color: '#333' }}>Cancelar</button>
              <button onClick={handleSalvarDespesa} style={{ ...styles.botao, ...styles.botaoDanger }}>Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
