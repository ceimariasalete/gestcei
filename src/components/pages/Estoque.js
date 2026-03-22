import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { useApp } from "../../context/AppContext";
import { useAuditoria } from "../../hooks/useAuditoria";
import { fmt, statusItem } from "../../lib/helpers";
import {
  Btn, Input, SelectField, Modal, ConfirmModal,
  MetricCard, AlertBar, Msg, TagStatus, PageHeader,
  Table, EmptyRow,
} from "../ui";

export default function Estoque({ tipo }) {
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

  const titulo = tipo === "cozinha" ? "Estoque de Cozinha" : "Estoque de Limpeza";

  const carregarItens = useCallback(async () => {
    const { data } = await supabase.from("itens_estoque").select("*").eq("tipo", tipo).order("nome");
    setItens(data || []);
  }, [tipo]);

  const carregarMovs = useCallback(async () => {
    const { data: ti } = await supabase.from("itens_estoque").select("id").eq("tipo", tipo);
    const ids = (ti || []).map((i) => i.id);
    if (!ids.length) { setMovs([]); return; }
    const { data } = await supabase
      .from("movimentacoes")
      .select("*")
      .in("item_id", ids)
      .order("data", { ascending: false })
      .limit(30);
    setMovs(data || []);
  }, [tipo]);

  useEffect(() => {
    carregarItens();
    carregarMovs();
  }, [carregarItens, carregarMovs]);

  const showMsg = (m) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };

  const itensFiltrados = itens.filter((i) => {
    const q = busca.toLowerCase();
    return (
      (!q || i.nome.toLowerCase().includes(q) || i.categoria.toLowerCase().includes(q)) &&
      (!catFiltro || i.categoria === catFiltro)
    );
  });

  const cats = [...new Set(itens.map((i) => i.categoria))].sort();
  const baixo = itens.filter((i) => i.quantidade <= i.estoque_minimo).length;
  const vencendo = itens.filter((i) => {
    if (!i.validade) return false;
    const d = (new Date(i.validade) - new Date()) / 86400000;
    return d >= 0 && d <= 30;
  }).length;
  const vencido = itens.filter((i) => i.validade && new Date(i.validade) < new Date()).length;

  function abrirAdd() {
    setForm({ nome: "", categoria: "", quantidade: 0, unidade: "", validade: "", estoque_minimo: 1, observacao: "" });
    setEditItem(null);
    setModal("form");
  }

  function abrirEdit(item) {
    setForm({ ...item });
    setEditItem(item);
    setModal("form");
  }

  async function salvarItem() {
    if (!form.nome) return;
    setLoading(true);
    if (editItem) {
      await supabase.from("itens_estoque").update({ ...form, atualizado_em: new Date().toISOString() }).eq("id", editItem.id);
      await log("itens_estoque", "UPDATE", editItem.id, `Editou item "${form.nome}"`, editItem, form);
    } else {
      const { data } = await supabase.from("itens_estoque").insert({ ...form, tipo }).select().single();
      await log("itens_estoque", "INSERT", data?.id, `Adicionou "${form.nome}" ao estoque de ${tipo}`, null, form);
    }
    setModal(null);
    setLoading(false);
    carregarItens();
    showMsg(editItem ? "Item atualizado!" : "Item adicionado!");
  }

  async function excluirItem(item) {
    setConfirmData(null);
    await supabase.from("itens_estoque").delete().eq("id", item.id);
    await log("itens_estoque", "DELETE", item.id, `Excluiu item "${item.nome}"`, item, null);
    carregarItens();
    showMsg("Item excluido.");
  }

  async function registrarMov() {
    const item = itens.find((i) => i.id === movForm.item_id);
    if (!item || !movForm.quantidade) return;
    const qtd = parseFloat(movForm.quantidade);
    if (movForm.tipo === "saida" && item.quantidade < qtd) {
      showMsg("Erro: Quantidade insuficiente no estoque!");
      return;
    }
    setLoading(true);
    const novaQtd = movForm.tipo === "entrada" ? item.quantidade + qtd : item.quantidade - qtd;
    await supabase.from("itens_estoque").update({ quantidade: novaQtd }).eq("id", item.id);
    await supabase.from("movimentacoes").insert({
      item_id: item.id, item_nome: item.nome,
      tipo: movForm.tipo, quantidade: qtd,
      usuario_id: usuario.id, usuario_nome: usuario.nome,
      observacao: movForm.observacao,
    });
    await log("movimentacoes", "INSERT", item.id,
      `${movForm.tipo === "entrada" ? "Entrada" : "Saida"} de ${qtd} ${item.unidade} - "${item.nome}"`,
      { quantidade: item.quantidade }, { quantidade: novaQtd });
    setModal(null);
    setLoading(false);
    carregarItens();
    carregarMovs();
    showMsg("Movimentacao registrada!");
  }

  return (
    <div style={{ padding: "1.5rem", maxWidth: 1100, margin: "0 auto" }}>
      {confirmData && <ConfirmModal {...confirmData} onCancel={() => setConfirmData(null)} />}

      <PageHeader title={titulo} subtitle="Controle e movimentacoes">
        <Btn onClick={() => setModal("mov")}>+ Movimentacao</Btn>
        <Btn variant="primary" onClick={abrirAdd}>+ Novo item</Btn>
      </PageHeader>

      <Msg text={msg} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 20 }}>
        <MetricCard label="Total de itens" value={itens.length} />
        <MetricCard label="Estoque baixo" value={baixo} sub={baixo > 0 ? "reposicao necessaria" : "tudo ok"} subColor={baixo > 0 ? "#BA7517" : "#1D9E75"} />
        <MetricCard label="Vencendo (30d)" value={vencendo} sub={vencendo > 0 ? "atencao!" : "tudo ok"} subColor={vencendo > 0 ? "#BA7517" : "#1D9E75"} />
        <MetricCard label="Vencidos" value={vencido} sub={vencido > 0 ? "remover" : "nenhum"} subColor={vencido > 0 ? "#A32D2D" : "#1D9E75"} />
      </div>

      {vencido > 0 && <AlertBar type="danger">{vencido} item(ns) vencido(s) — verifique imediatamente.</AlertBar>}
      {baixo > 0 && vencido === 0 && <AlertBar>{baixo} item(ns) abaixo do minimo de estoque.</AlertBar>}

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar item..."
          style={{ flex: 1, padding: "7px 12px", borderRadius: 7, border: "0.5px solid #ccc", fontSize: 13, fontFamily: "inherit" }}
        />
        <select
          value={catFiltro}
          onChange={(e) => setCatFiltro(e.target.value)}
          style={{ padding: "7px 12px", borderRadius: 7, border: "0.5px solid #ccc", fontSize: 13, fontFamily: "inherit", background: "#fff" }}
        >
          <option value="">Todas as categorias</option>
          {cats.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>

      <div style={{ marginBottom: 24 }}>
        <Table headers={["Item", "Categoria", "Quantidade", "Validade", "Status", ""]}>
          {itensFiltrados.map((item) => (
            <tr key={item.id} style={{ borderBottom: "0.5px solid #f0f0f0" }}>
              <td style={{ padding: "10px 14px", fontSize: 13 }}>
                <span style={{ fontWeight: 500 }}>{item.nome}</span>
                {item.observacao && <div style={{ fontSize: 11, color: "#aaa" }}>{item.observacao}</div>}
              </td>
              <td style={{ padding: "10px 14px", fontSize: 13, color: "#555" }}>{item.categoria}</td>
              <td style={{ padding: "10px 14px", fontSize: 13 }}>
                {item.quantidade} {item.unidade}
                <span style={{ fontSize: 11, color: "#aaa", marginLeft: 6 }}>min {item.estoque_minimo}</span>
              </td>
              <td style={{ padding: "10px 14px", fontSize: 13, color: "#555" }}>{fmt(item.validade)}</td>
              <td style={{ padding: "10px 14px" }}><TagStatus status={statusItem(item)} /></td>
              <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                <Btn small onClick={() => abrirEdit(item)} style={{ marginRight: 4 }}>Editar</Btn>
                <Btn small variant="danger" onClick={() => setConfirmData({
                  title: "Excluir item",
                  message: `Deseja excluir "${item.nome}"? Esta acao nao pode ser desfeita.`,
                  onConfirm: () => excluirItem(item),
                })}>Excluir</Btn>
              </td>
            </tr>
          ))}
          {itensFiltrados.length === 0 && <EmptyRow colSpan={6} message="Nenhum item encontrado." />}
        </Table>
      </div>

      {/* Histórico */}
      <div style={{ background: "#fff", border: "0.5px solid #e0e0e0", borderRadius: 12, padding: "1.25rem" }}>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>Historico de movimentacoes</div>
        {movs.length === 0 && <div style={{ fontSize: 13, color: "#aaa" }}>Nenhuma movimentacao registrada.</div>}
        {movs.slice(0, 10).map((m) => (
          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "0.5px solid #f0f0f0", fontSize: 13 }}>
            <span style={{ padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 500, background: m.tipo === "entrada" ? "#EAF3DE" : "#FCEBEB", color: m.tipo === "entrada" ? "#27500A" : "#791F1F" }}>
              {m.tipo}
            </span>
            <span style={{ flex: 1 }}>{m.item_nome}</span>
            <span style={{ color: "#888" }}>{m.quantidade} un</span>
            <span style={{ color: "#aaa", marginLeft: 12 }}>{fmt(m.data)}</span>
            <span style={{ color: "#aaa", marginLeft: 12 }}>{m.usuario_nome}</span>
            {m.observacao && <span style={{ color: "#bbb", fontSize: 11 }}>— {m.observacao}</span>}
          </div>
        ))}
      </div>

      {/* Modal: Novo/Editar item */}
      {modal === "form" && (
        <Modal title={editItem ? "Editar item" : "Novo item"} onClose={() => setModal(null)}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Input label="Nome" value={form.nome || ""} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            <Input label="Categoria" value={form.categoria || ""} onChange={(e) => setForm({ ...form, categoria: e.target.value })} />
            <Input label="Quantidade" type="number" value={form.quantidade || 0} onChange={(e) => setForm({ ...form, quantidade: e.target.value })} />
            <Input label="Unidade (kg, L, un...)" value={form.unidade || ""} onChange={(e) => setForm({ ...form, unidade: e.target.value })} />
            <Input label="Estoque minimo" type="number" value={form.estoque_minimo || 1} onChange={(e) => setForm({ ...form, estoque_minimo: e.target.value })} />
            <Input label="Validade" type="date" value={form.validade || ""} onChange={(e) => setForm({ ...form, validade: e.target.value })} />
          </div>
          <Input label="Observacao (opcional)" value={form.observacao || ""} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <Btn onClick={() => setModal(null)}>Cancelar</Btn>
            <Btn variant="primary" onClick={salvarItem} disabled={loading}>{loading ? "Salvando..." : "Salvar"}</Btn>
          </div>
        </Modal>
      )}

      {/* Modal: Movimentação */}
      {modal === "mov" && (
        <Modal title="Registrar movimentacao" onClose={() => setModal(null)}>
          <SelectField label="Item" value={movForm.item_id} onChange={(e) => setMovForm({ ...movForm, item_id: e.target.value })}>
            <option value="">Selecione...</option>
            {itens.map((i) => <option key={i.id} value={i.id}>{i.nome} ({i.quantidade} {i.unidade})</option>)}
          </SelectField>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <SelectField label="Tipo" value={movForm.tipo} onChange={(e) => setMovForm({ ...movForm, tipo: e.target.value })}>
              <option value="entrada">Entrada</option>
              <option value="saida">Saida</option>
            </SelectField>
            <Input label="Quantidade" type="number" min="1" value={movForm.quantidade} onChange={(e) => setMovForm({ ...movForm, quantidade: e.target.value })} />
          </div>
          <Input label="Observacao" value={movForm.observacao} onChange={(e) => setMovForm({ ...movForm, observacao: e.target.value })} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <Btn onClick={() => setModal(null)}>Cancelar</Btn>
            <Btn variant="primary" onClick={registrarMov} disabled={loading}>{loading ? "Registrando..." : "Registrar"}</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
