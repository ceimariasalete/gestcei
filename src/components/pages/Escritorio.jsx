import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { useApp } from "../../context/AppContext";
import { useAuditoria } from "../../hooks/useAuditoria";
import { fmt, statusItem, qtdEmUso, exportarCSV } from "../../lib/helpers";
import BotaoExportar from "../ui/BotaoExportar";
import {
  Btn, Input, SelectField, Modal, ConfirmModal,
  MetricCard, AlertBar, Msg, TagStatus, PageHeader, Table, EmptyRow,
} from "../ui";

const CATEGORIAS_ESCRITORIO = [
  "Papel e Impressao",
  "Canetas e Lapis",
  "Pastas e Arquivos",
  "Toner e Cartuchos",
  "Material de Escritorio Geral",
  "Equipamentos",
  "Informatica",
  "Higiene e Limpeza Escritorio",
  "Outros",
];

export default function Escritorio() {
  const { usuario } = useApp();
  const { log } = useAuditoria(usuario);

  const [itens, setItens] = useState([]);
  const [movs, setMovs] = useState([]);
  const [busca, setBusca] = useState("");
  const [catFiltro, setCatFiltro] = useState("");
  const [modal, setModal] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({});
  const [movForm, setMovForm] = useState({ item_id: "", tipo: "entrada", quantidade: 1, observacao: "" });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [confirmData, setConfirmData] = useState(null);

  const showMsg = (m) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };

  const carregarItens = useCallback(async () => {
    const { data } = await supabase.from("itens_estoque").select("*").eq("tipo", "escritorio").order("nome");
    setItens(data || []);
  }, []);

  const carregarMovs = useCallback(async () => {
    const { data: ti } = await supabase.from("itens_estoque").select("id").eq("tipo", "escritorio");
    const ids = (ti || []).map((i) => i.id);
    if (!ids.length) { setMovs([]); return; }
    const { data } = await supabase.from("movimentacoes").select("*").in("item_id", ids).order("data", { ascending: false }).limit(30);
    setMovs(data || []);
  }, []);

  useEffect(() => { carregarItens(); carregarMovs(); }, [carregarItens, carregarMovs]);

  const itensFiltrados = itens.filter((i) => {
    const q = busca.toLowerCase();
    return (!q || i.nome.toLowerCase().includes(q) || i.categoria.toLowerCase().includes(q)) && (!catFiltro || i.categoria === catFiltro);
  });

  const cats = [...new Set(itens.map((i) => i.categoria))].sort();
  const baixo = itens.filter((i) => i.quantidade <= i.estoque_minimo).length;
  const vencendo = itens.filter((i) => { if (!i.validade) return false; const d = (new Date(i.validade) - new Date()) / 86400000; return d >= 0 && d <= 30; }).length;
  const vencido = itens.filter((i) => i.validade && new Date(i.validade) < new Date()).length;

  async function salvarItem() {
    if (!form.nome) return;
    setLoading(true);
    if (editItem) {
      const payload = { ...form, quantidade: parseFloat(form.quantidade)||0, em_uso: parseFloat(form.em_uso)||0, estoque_minimo: parseFloat(form.estoque_minimo)||1, validade: form.validade||null, atualizado_em: new Date().toISOString() };
      await supabase.from("itens_estoque").update(payload).eq("id", editItem.id);
      await log("itens_estoque", "UPDATE", editItem.id, `Editou item escritorio "${form.nome}"`, editItem, form);
    } else {
      const payload2 = { ...form, quantidade: parseFloat(form.quantidade)||0, em_uso: parseFloat(form.em_uso)||0, estoque_minimo: parseFloat(form.estoque_minimo)||1, validade: form.validade||null };
      const { data } = await supabase.from("itens_estoque").insert({ ...payload2, tipo: "escritorio" }).select().single();
      await log("itens_estoque", "INSERT", data?.id, `Adicionou "${form.nome}" ao estoque de escritorio`, null, form);
    }
    setModal(null); setLoading(false); carregarItens();
    showMsg(editItem ? "Item atualizado!" : "Item adicionado!");
  }

  async function excluirItem(item) {
    setConfirmData(null);
    await supabase.from("itens_estoque").delete().eq("id", item.id);
    await log("itens_estoque", "DELETE", item.id, `Excluiu item escritorio "${item.nome}"`, item, null);
    carregarItens(); showMsg("Item excluido.");
  }

  async function registrarMov() {
    const item = itens.find((i) => i.id === movForm.item_id);
    if (!item || !movForm.quantidade) return;
    const qtd = parseFloat(movForm.quantidade);
    setLoading(true);
    let novaQtd = item.quantidade;
    let novoEmUso = item.em_uso || 0;
    if (movForm.tipo === "entrada") {
      novaQtd = item.quantidade + qtd;
    } else if (movForm.tipo === "saida") {
      if (item.quantidade < qtd) { showMsg("Quantidade insuficiente!"); setLoading(false); return; }
      novaQtd = item.quantidade - qtd;
    } else if (movForm.tipo === "em_uso") {
      if (item.quantidade < qtd) { showMsg("Quantidade insuficiente!"); setLoading(false); return; }
      novaQtd = item.quantidade - qtd; novoEmUso += qtd;
    } else if (movForm.tipo === "retorno_uso") {
      if (novoEmUso < qtd) { showMsg("Quantidade em uso insuficiente!"); setLoading(false); return; }
      novaQtd = item.quantidade + qtd; novoEmUso -= qtd;
    } else if (movForm.tipo === "consumo_uso") {
      if (novoEmUso < qtd) { showMsg("Quantidade em uso insuficiente!"); setLoading(false); return; }
      novoEmUso -= qtd;
    }
    await supabase.from("itens_estoque").update({ quantidade: novaQtd, em_uso: novoEmUso }).eq("id", item.id);
    await supabase.from("movimentacoes").insert({ item_id: item.id, item_nome: item.nome, tipo: movForm.tipo, quantidade: qtd, usuario_id: usuario.id, usuario_nome: usuario.nome, observacao: movForm.observacao });
    await log("movimentacoes", "INSERT", item.id, `Movimentacao "${movForm.tipo}" de ${qtd} - "${item.nome}" (escritorio)`, { quantidade: item.quantidade, em_uso: item.em_uso }, { quantidade: novaQtd, em_uso: novoEmUso });
    setModal(null); setLoading(false); carregarItens(); carregarMovs();
    showMsg("Movimentacao registrada!");
  }

  const dadosExportar = itensFiltrados.map((i) => ({
    Nome: i.nome, Categoria: i.categoria, Quantidade: i.quantidade,
    Unidade: i.unidade, "Estoque Minimo": i.estoque_minimo,
    Validade: i.validade || "", Status: statusItem(i),
  }));

  return (
    <div style={{ padding: "1.5rem", maxWidth: 1100, margin: "0 auto" }}>
      {confirmData && <ConfirmModal {...confirmData} onCancel={() => setConfirmData(null)} />}

      <PageHeader title="Material de Escritorio" subtitle="Controle de materiais administrativos">
        <BotaoExportar dados={dadosExportar} nomeArquivo="estoque_escritorio" />
        <Btn onClick={() => setModal("mov")}>+ Movimentacao</Btn>
        <Btn variant="primary" onClick={() => { setForm({ nome: "", categoria: CATEGORIAS_ESCRITORIO[0], quantidade: 0, em_uso: 0, unidade: "un", validade: "", estoque_minimo: 1, observacao: "" }); setEditItem(null); setModal("form"); }}>+ Novo item</Btn>
      </PageHeader>

      <Msg text={msg} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 20 }}>
        <MetricCard label="Total de itens" value={itens.length} />
        <MetricCard label="Estoque baixo" value={baixo} sub={baixo > 0 ? "reposicao necessaria" : "tudo ok"} subColor={baixo > 0 ? "#BA7517" : "#1D9E75"} />
        <MetricCard label="Vencendo (30d)" value={vencendo} sub={vencendo > 0 ? "atencao!" : "tudo ok"} subColor={vencendo > 0 ? "#BA7517" : "#1D9E75"} />
        <MetricCard label="Vencidos" value={vencido} sub={vencido > 0 ? "remover" : "nenhum"} subColor={vencido > 0 ? "#A32D2D" : "#1D9E75"} />
      </div>

      {vencido > 0 && <AlertBar type="danger">{vencido} item(ns) vencido(s) — verifique imediatamente.</AlertBar>}
      {baixo > 0 && vencido === 0 && <AlertBar>{baixo} item(ns) abaixo do minimo.</AlertBar>}

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar material..."
          style={{ flex: 1, padding: "7px 12px", borderRadius: 7, border: "0.5px solid #ccc", fontSize: 13, fontFamily: "inherit" }} />
        <select value={catFiltro} onChange={(e) => setCatFiltro(e.target.value)}
          style={{ padding: "7px 12px", borderRadius: 7, border: "0.5px solid #ccc", fontSize: 13, fontFamily: "inherit", background: "#fff" }}>
          <option value="">Todas as categorias</option>
          {cats.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>

      <div style={{ marginBottom: 24 }}>
        <Table headers={["Item", "Categoria", "Estoque", "Em uso", "Validade", "Status", ""]}>
          {itensFiltrados.map((item) => (
            <tr key={item.id} style={{ borderBottom: "0.5px solid #f0f0f0" }}>
              <td style={{ padding: "10px 14px", fontSize: 13 }}>
                <span style={{ fontWeight: 500 }}>{item.nome}</span>
                {item.observacao && <div style={{ fontSize: 11, color: "#aaa" }}>{item.observacao}</div>}
              </td>
              <td style={{ padding: "10px 14px", fontSize: 13, color: "#555" }}>{item.categoria}</td>
              <td style={{ padding: "10px 14px", fontSize: 13 }}>{item.quantidade} {item.unidade}<span style={{ fontSize: 11, color: "#aaa", marginLeft: 6 }}>min {item.estoque_minimo}</span></td>
              <td style={{ padding: "10px 14px" }}>
                {(item.em_uso || 0) > 0
                  ? <span style={{ background: "#EEF3FF", color: "#2B4CBF", borderRadius: 20, padding: "1px 8px", fontSize: 11, fontWeight: 500 }}>🔵 {item.em_uso} {item.unidade}</span>
                  : <span style={{ fontSize: 12, color: "#ccc" }}>—</span>}
              </td>
              <td style={{ padding: "10px 14px", fontSize: 12, color: "#555" }}>
                {item.validade ? fmt(item.validade) : <span style={{ color: "#ccc" }}>—</span>}
              </td>
              <td style={{ padding: "10px 14px" }}><TagStatus status={statusItem(item)} /></td>
              <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                <Btn small onClick={() => { setForm({ ...item }); setEditItem(item); setModal("form"); }} style={{ marginRight: 4 }}>Editar</Btn>
                <Btn small variant="danger" onClick={() => setConfirmData({ title: "Excluir item", message: `Excluir "${item.nome}"?`, onConfirm: () => excluirItem(item) })}>Excluir</Btn>
              </td>
            </tr>
          ))}
          {itensFiltrados.length === 0 && <EmptyRow colSpan={7} message="Nenhum material encontrado." />}
        </Table>
      </div>

      <div style={{ background: "#fff", border: "0.5px solid #e0e0e0", borderRadius: 12, padding: "1.25rem" }}>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>Historico de movimentacoes</div>
        {movs.length === 0 && <div style={{ fontSize: 13, color: "#aaa" }}>Nenhuma movimentacao registrada.</div>}
        {movs.slice(0, 10).map((m) => (
          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "0.5px solid #f0f0f0", fontSize: 13 }}>
            <span style={{ padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 500, background: m.tipo === "entrada" ? "#EAF3DE" : "#FCEBEB", color: m.tipo === "entrada" ? "#27500A" : "#791F1F" }}>{m.tipo}</span>
            <span style={{ flex: 1 }}>{m.item_nome}</span>
            <span style={{ color: "#888" }}>{m.quantidade} un</span>
            <span style={{ color: "#aaa", marginLeft: 12 }}>{fmt(m.data)}</span>
            <span style={{ color: "#aaa", marginLeft: 12 }}>{m.usuario_nome}</span>
          </div>
        ))}
      </div>

      {modal === "form" && (
        <Modal title={editItem ? "Editar item" : "Novo material de escritorio"} onClose={() => setModal(null)}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Input label="Nome" value={form.nome || ""} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            <SelectField label="Categoria" value={form.categoria || ""} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
              {CATEGORIAS_ESCRITORIO.map((c) => <option key={c}>{c}</option>)}
            </SelectField>
            <Input label="Quantidade" type="number" value={form.quantidade || 0} onChange={(e) => setForm({ ...form, quantidade: e.target.value })} />
            <Input label="Unidade (un, cx, pct...)" value={form.unidade || ""} onChange={(e) => setForm({ ...form, unidade: e.target.value })} />
            <Input label="Qtd. em uso" type="number" min="0" value={form.em_uso ?? 0} onChange={(e) => setForm({ ...form, em_uso: e.target.value })} />
            <Input label="Estoque mínimo" type="number" value={form.estoque_minimo || 1} onChange={(e) => setForm({ ...form, estoque_minimo: e.target.value })} />
          </div>
          <div style={{ marginTop: 8 }}>
            <label style={{ fontSize: 12, color: "#666", display: "block", marginBottom: 4 }}>Validade <span style={{ color: "#aaa" }}>(opcional)</span></label>
            <input type="date" value={form.validade || ""} onChange={(e) => setForm({ ...form, validade: e.target.value })}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "0.5px solid #ccc", fontSize: 13, fontFamily: "inherit" }} />
            {form.validade && <button onClick={() => setForm({ ...form, validade: "" })} style={{ fontSize: 11, color: "#A32D2D", background: "none", border: "none", cursor: "pointer", marginTop: 4, padding: 0 }}>✕ Remover validade</button>}

          </div>
          <Input label="Observacao (opcional)" value={form.observacao || ""} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <Btn onClick={() => setModal(null)}>Cancelar</Btn>
            <Btn variant="primary" onClick={salvarItem} disabled={loading}>{loading ? "Salvando..." : "Salvar"}</Btn>
          </div>
        </Modal>
      )}

      {modal === "mov" && (
        <Modal title="Registrar movimentação" onClose={() => setModal(null)}>
          <SelectField label="Material" value={movForm.item_id} onChange={(e) => setMovForm({ ...movForm, item_id: e.target.value })}>
            <option value="">Selecione...</option>
            {itens.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nome} — estoque: {i.quantidade} {i.unidade}{(i.em_uso||0)>0?` · em uso: ${i.em_uso}`:""}
              </option>
            ))}
          </SelectField>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
            <SelectField label="Tipo de movimentação" value={movForm.tipo} onChange={(e) => setMovForm({ ...movForm, tipo: e.target.value })}>
              <option value="entrada">📥 Entrada (compra/recebimento)</option>
              <option value="saida">📤 Saída (descarte/perda)</option>
              <option value="em_uso">🔵 Colocar em uso</option>
              <option value="retorno_uso">↩️ Retorno do uso</option>
              <option value="consumo_uso">✅ Consumido (em uso acabou)</option>
            </SelectField>
            <Input label="Quantidade" type="number" min="1" value={movForm.quantidade} onChange={(e) => setMovForm({ ...movForm, quantidade: e.target.value })} />
          </div>
          <Input label="Observação" value={movForm.observacao} onChange={(e) => setMovForm({ ...movForm, observacao: e.target.value })} style={{ marginTop: 8 }} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
            <Btn onClick={() => setModal(null)}>Cancelar</Btn>
            <Btn variant="primary" onClick={registrarMov} disabled={loading}>{loading ? "Registrando..." : "Registrar"}</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
