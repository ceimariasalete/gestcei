import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { useApp } from "../../context/AppContext";
import { useAuditoria } from "../../hooks/useAuditoria";
import { fmt, statusItem, qtdEmUso } from "../../lib/helpers";
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

  const titulos = {
    cozinha: "Estoque — Cozinha",
    limpeza: "Estoque — Limpeza",
    pedagogico: "Estoque — Material Pedagógico",
    escritorio: "Estoque — Material de Escritório",
  };
  const titulo = titulos[tipo] || "Estoque";

  const carregarItens = useCallback(async () => {
    const { data } = await supabase.from("itens_estoque").select("*").eq("tipo", tipo).order("nome");
    setItens(data || []);
  }, [tipo]);

  const carregarMovs = useCallback(async () => {
    const { data: ti } = await supabase.from("itens_estoque").select("id").eq("tipo", tipo);
    const ids = (ti || []).map((i) => i.id);
    if (!ids.length) { setMovs([]); return; }
    const { data } = await supabase
      .from("movimentacoes").select("*")
      .in("item_id", ids).order("data", { ascending: false }).limit(40);
    setMovs(data || []);
  }, [tipo]);

  useEffect(() => { carregarItens(); carregarMovs(); }, [carregarItens, carregarMovs]);

  const showMsg = (m) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };

  const itensFiltrados = itens.filter((i) => {
    const q = busca.toLowerCase();
    return (
      (!q || i.nome.toLowerCase().includes(q) || (i.categoria || "").toLowerCase().includes(q)) &&
      (!catFiltro || i.categoria === catFiltro)
    );
  });

  const cats = [...new Set(itens.map((i) => i.categoria).filter(Boolean))].sort();
  const baixo = itens.filter((i) => statusItem(i) === "baixo").length;
  const vencendo = itens.filter((i) => statusItem(i) === "vencendo").length;
  const vencido = itens.filter((i) => statusItem(i) === "vencido").length;
  const emUsoTotal = itens.reduce((s, i) => s + qtdEmUso(i), 0);

  function abrirAdd() {
    setForm({ nome: "", categoria: "", quantidade: 0, em_uso: 0, unidade: "", validade: "", estoque_minimo: 1, observacao: "" });
    setEditItem(null);
    setModal("form");
  }

  function abrirEdit(item) {
    setForm({ ...item, em_uso: item.em_uso || 0, validade: item.validade || "" });
    setEditItem(item);
    setModal("form");
  }

  async function salvarItem() {
    if (!form.nome) return;
    setLoading(true);
    const payload = {
      ...form,
      quantidade: parseFloat(form.quantidade) || 0,
      em_uso: parseFloat(form.em_uso) || 0,
      estoque_minimo: parseFloat(form.estoque_minimo) || 1,
      validade: form.validade || null,   // validade opcional
      atualizado_em: new Date().toISOString(),
    };
    if (editItem) {
      await supabase.from("itens_estoque").update(payload).eq("id", editItem.id);
      await log("itens_estoque", "UPDATE", editItem.id, `Editou item "${form.nome}"`, editItem, payload);
    } else {
      const { data } = await supabase.from("itens_estoque").insert({ ...payload, tipo }).select().single();
      await log("itens_estoque", "INSERT", data?.id, `Adicionou "${form.nome}" ao estoque de ${tipo}`, null, payload);
    }
    setModal(null); setLoading(false); carregarItens();
    showMsg(editItem ? "Item atualizado!" : "Item adicionado!");
  }

  async function excluirItem(item) {
    setConfirmData(null);
    await supabase.from("itens_estoque").delete().eq("id", item.id);
    await log("itens_estoque", "DELETE", item.id, `Excluiu item "${item.nome}"`, item, null);
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
      if (item.quantidade < qtd) { showMsg("Quantidade insuficiente no estoque!"); setLoading(false); return; }
      novaQtd = item.quantidade - qtd;
    } else if (movForm.tipo === "em_uso") {
      // Coloca em uso: retira do estoque disponível, adiciona a em_uso
      if (item.quantidade < qtd) { showMsg("Quantidade insuficiente no estoque!"); setLoading(false); return; }
      novaQtd = item.quantidade - qtd;
      novoEmUso = novoEmUso + qtd;
    } else if (movForm.tipo === "retorno_uso") {
      // Retorna do uso para o estoque
      if (novoEmUso < qtd) { showMsg("Quantidade em uso insuficiente!"); setLoading(false); return; }
      novaQtd = item.quantidade + qtd;
      novoEmUso = novoEmUso - qtd;
    } else if (movForm.tipo === "consumo_uso") {
      // Item em uso foi consumido (ex: caixa de leite aberta acabou)
      if (novoEmUso < qtd) { showMsg("Quantidade em uso insuficiente!"); setLoading(false); return; }
      novoEmUso = novoEmUso - qtd;
      // Não altera estoque — item já foi retirado quando foi para uso
    }

    await supabase.from("itens_estoque").update({
      quantidade: novaQtd, em_uso: novoEmUso
    }).eq("id", item.id);

    const labelTipo = {
      entrada: "Entrada", saida: "Saida",
      em_uso: "Colocado em uso", retorno_uso: "Retorno do uso",
      consumo_uso: "Consumido (estava em uso)",
    };

    await supabase.from("movimentacoes").insert({
      item_id: item.id, item_nome: item.nome,
      tipo: movForm.tipo, quantidade: qtd,
      usuario_id: usuario.id, usuario_nome: usuario.nome,
      observacao: movForm.observacao,
    });
    await log("movimentacoes", "INSERT", item.id,
      `${labelTipo[movForm.tipo]} de ${qtd} ${item.unidade} — "${item.nome}"`,
      { quantidade: item.quantidade, em_uso: item.em_uso },
      { quantidade: novaQtd, em_uso: novoEmUso });

    setModal(null); setLoading(false); carregarItens(); carregarMovs();
    showMsg("Movimentacao registrada!");
  }

  // Cor do badge "em uso"
  const badgeEmUso = { background: "#EEF3FF", color: "#2B4CBF", borderRadius: 20, padding: "1px 8px", fontSize: 11, fontWeight: 500 };

  return (
    <div style={{ padding: "clamp(0.75rem,3vw,1.5rem)", maxWidth: 1100, margin: "0 auto" }}>
      {confirmData && <ConfirmModal {...confirmData} onCancel={() => setConfirmData(null)} />}

      <PageHeader title={titulo} subtitle="Controle, movimentações e itens em uso">
        <Btn onClick={() => { setMovForm({ item_id: "", tipo: "entrada", quantidade: 1, observacao: "" }); setModal("mov"); }}>
          + Movimentação
        </Btn>
        <Btn variant="primary" onClick={abrirAdd}>+ Novo item</Btn>
      </PageHeader>

      <Msg text={msg} />

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 12, marginBottom: 20 }}>
        <MetricCard label="Total de itens" value={itens.length} />
        <MetricCard label="Em uso agora" value={emUsoTotal} sub="unidades em aberto" subColor="#2B4CBF" accent="#EEF3FF" />
        <MetricCard label="Estoque baixo" value={baixo} sub={baixo > 0 ? "reposição necessária" : "tudo ok"} subColor={baixo > 0 ? "#BA7517" : "#1D9E75"} />
        <MetricCard label="Vencendo (30d)" value={vencendo} sub={vencendo > 0 ? "atenção!" : "tudo ok"} subColor={vencendo > 0 ? "#BA7517" : "#1D9E75"} />
        <MetricCard label="Vencidos" value={vencido} sub={vencido > 0 ? "remover" : "nenhum"} subColor={vencido > 0 ? "#A32D2D" : "#1D9E75"} />
      </div>

      {vencido > 0 && <AlertBar type="danger">{vencido} item(ns) vencido(s) — verifique imediatamente.</AlertBar>}
      {baixo > 0 && vencido === 0 && <AlertBar>{baixo} item(ns) abaixo do mínimo de estoque.</AlertBar>}

      {/* Filtros */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar item..."
          style={{ flex: 1, minWidth: 160, padding: "7px 12px", borderRadius: 7, border: "0.5px solid #ccc", fontSize: 13, fontFamily: "inherit" }} />
        <select value={catFiltro} onChange={(e) => setCatFiltro(e.target.value)}
          style={{ padding: "7px 12px", borderRadius: 7, border: "0.5px solid #ccc", fontSize: 13, fontFamily: "inherit", background: "#fff" }}>
          <option value="">Todas as categorias</option>
          {cats.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>

      {/* Tabela */}
      <div style={{ marginBottom: 24 }}>
        <Table headers={["Item", "Categoria", "Estoque", "Em uso", "Validade", "Status", ""]}>
          {itensFiltrados.map((item) => (
            <tr key={item.id} style={{ borderBottom: "0.5px solid #f0f0f0" }}>
              <td style={{ padding: "10px 14px", fontSize: 13 }}>
                <span style={{ fontWeight: 500 }}>{item.nome}</span>
                {item.observacao && <div style={{ fontSize: 11, color: "#aaa" }}>{item.observacao}</div>}
              </td>
              <td style={{ padding: "10px 14px", fontSize: 12, color: "#555" }}>{item.categoria}</td>
              <td style={{ padding: "10px 14px", fontSize: 13 }}>
                <span style={{ fontWeight: 500 }}>{item.quantidade}</span>
                <span style={{ fontSize: 11, color: "#aaa" }}> {item.unidade}</span>
                <div style={{ fontSize: 10, color: "#bbb" }}>mín {item.estoque_minimo}</div>
              </td>
              <td style={{ padding: "10px 14px" }}>
                {(item.em_uso || 0) > 0
                  ? <span style={badgeEmUso}>🔵 {item.em_uso} {item.unidade}</span>
                  : <span style={{ fontSize: 12, color: "#ccc" }}>—</span>}
              </td>
              <td style={{ padding: "10px 14px", fontSize: 12, color: "#555" }}>
                {item.validade ? fmt(item.validade) : <span style={{ color: "#ccc" }}>—</span>}
              </td>
              <td style={{ padding: "10px 14px" }}><TagStatus status={statusItem(item)} /></td>
              <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                <Btn small onClick={() => abrirEdit(item)} style={{ marginRight: 4 }}>Editar</Btn>
                <Btn small variant="danger" onClick={() => setConfirmData({
                  title: "Excluir item",
                  message: `Deseja excluir "${item.nome}"?`,
                  onConfirm: () => excluirItem(item),
                })}>Excluir</Btn>
              </td>
            </tr>
          ))}
          {itensFiltrados.length === 0 && <EmptyRow colSpan={7} message="Nenhum item encontrado." />}
        </Table>
      </div>

      {/* Histórico */}
      <div style={{ background: "#fff", border: "0.5px solid #e0e0e0", borderRadius: 12, padding: "1.25rem" }}>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>Histórico de movimentações</div>
        {movs.length === 0 && <div style={{ fontSize: 13, color: "#aaa" }}>Nenhuma movimentação registrada.</div>}
        {movs.slice(0, 12).map((m) => {
          const bg = {
            entrada: "#EAF3DE", saida: "#FCEBEB",
            em_uso: "#EEF3FF", retorno_uso: "#FFF8E1", consumo_uso: "#FFF0F0",
          }[m.tipo] || "#f0f0f0";
          const fg = {
            entrada: "#27500A", saida: "#791F1F",
            em_uso: "#2B4CBF", retorno_uso: "#7A5200", consumo_uso: "#A32D2D",
          }[m.tipo] || "#555";
          const label = {
            entrada: "Entrada", saida: "Saída",
            em_uso: "Em uso", retorno_uso: "Retorno", consumo_uso: "Consumido",
          }[m.tipo] || m.tipo;
          return (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "0.5px solid #f0f0f0", fontSize: 13, flexWrap: "wrap" }}>
              <span style={{ padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 500, background: bg, color: fg }}>{label}</span>
              <span style={{ flex: 1, minWidth: 100 }}>{m.item_nome}</span>
              <span style={{ color: "#888" }}>{m.quantidade} un</span>
              <span style={{ color: "#aaa" }}>{fmt(m.data)}</span>
              <span style={{ color: "#aaa" }}>{m.usuario_nome}</span>
              {m.observacao && <span style={{ color: "#bbb", fontSize: 11 }}>— {m.observacao}</span>}
            </div>
          );
        })}
      </div>

      {/* ── MODAL: Novo/Editar item ── */}
      {modal === "form" && (
        <Modal title={editItem ? "Editar item" : "Novo item"} onClose={() => setModal(null)}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Input label="Nome *" value={form.nome || ""} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            <Input label="Categoria" value={form.categoria || ""} onChange={(e) => setForm({ ...form, categoria: e.target.value })} />
            <Input label="Qtd. em estoque" type="number" min="0" value={form.quantidade ?? 0} onChange={(e) => setForm({ ...form, quantidade: e.target.value })} />
            <Input label="Em uso agora" type="number" min="0" value={form.em_uso ?? 0}
              onChange={(e) => setForm({ ...form, em_uso: e.target.value })}
              placeholder="0"
            />
            <Input label="Unidade (kg, L, un...)" value={form.unidade || ""} onChange={(e) => setForm({ ...form, unidade: e.target.value })} />
            <Input label="Estoque mínimo" type="number" min="0" value={form.estoque_minimo ?? 1} onChange={(e) => setForm({ ...form, estoque_minimo: e.target.value })} />
          </div>

          {/* Validade opcional */}
          <div style={{ marginTop: 8 }}>
            <label style={{ fontSize: 12, color: "#666", display: "block", marginBottom: 4 }}>
              Validade <span style={{ color: "#aaa" }}>(opcional — deixe em branco se não tiver)</span>
            </label>
            <input
              type="date"
              value={form.validade || ""}
              onChange={(e) => setForm({ ...form, validade: e.target.value })}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "0.5px solid #ccc", fontSize: 13, fontFamily: "inherit" }}
            />
            {form.validade && (
              <button onClick={() => setForm({ ...form, validade: "" })}
                style={{ fontSize: 11, color: "#A32D2D", background: "none", border: "none", cursor: "pointer", marginTop: 4, padding: 0 }}>
                ✕ Remover validade
              </button>
            )}
          </div>

          <Input label="Observação (opcional)" value={form.observacao || ""} onChange={(e) => setForm({ ...form, observacao: e.target.value })} style={{ marginTop: 8 }} />

          {/* Legenda em_uso */}
          <div style={{ background: "#EEF3FF", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#2B4CBF", marginTop: 10 }}>
            💡 <strong>Em uso</strong>: unidades já abertas ou em utilização. Não contam como estoque disponível imediato.
            Quando acabarem, devem ser repostas do estoque armazenado.
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
            <Btn onClick={() => setModal(null)}>Cancelar</Btn>
            <Btn variant="primary" onClick={salvarItem} disabled={loading}>{loading ? "Salvando..." : "Salvar"}</Btn>
          </div>
        </Modal>
      )}

      {/* ── MODAL: Movimentação ── */}
      {modal === "mov" && (
        <Modal title="Registrar movimentação" onClose={() => setModal(null)}>
          <SelectField label="Item" value={movForm.item_id} onChange={(e) => setMovForm({ ...movForm, item_id: e.target.value })}>
            <option value="">Selecione...</option>
            {itens.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nome} — estoque: {i.quantidade} {i.unidade}{(i.em_uso || 0) > 0 ? ` · em uso: ${i.em_uso}` : ""}
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
            <Input label="Quantidade" type="number" min="1" value={movForm.quantidade}
              onChange={(e) => setMovForm({ ...movForm, quantidade: e.target.value })} />
          </div>

          {/* Explicação contextual do tipo selecionado */}
          {movForm.tipo === "em_uso" && (
            <AlertBar type="success" style={{ marginTop: 8 }}>
              Retira do estoque disponível e registra como "em uso". Ex: abrir uma caixa de leite.
            </AlertBar>
          )}
          {movForm.tipo === "consumo_uso" && (
            <AlertBar style={{ marginTop: 8 }}>
              O item em uso foi consumido. O estoque disponível só diminui quando você repor com "Colocar em uso" novamente.
            </AlertBar>
          )}
          {movForm.tipo === "retorno_uso" && (
            <AlertBar type="success" style={{ marginTop: 8 }}>
              Devolve o item para o estoque disponível. Ex: sobrou produto e foi guardado.
            </AlertBar>
          )}

          <Input label="Observação" value={movForm.observacao}
            onChange={(e) => setMovForm({ ...movForm, observacao: e.target.value })} style={{ marginTop: 8 }} />

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
            <Btn onClick={() => setModal(null)}>Cancelar</Btn>
            <Btn variant="primary" onClick={registrarMov} disabled={loading}>{loading ? "Registrando..." : "Registrar"}</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
