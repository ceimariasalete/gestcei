import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { Btn, Modal, Input, SelectField, MetricCard, ConfirmModal, Msg, PageHeader } from "../ui";

export default function ListaCompras() {
  const [itens, setItens] = useState([]);
  const [filtro, setFiltro] = useState("geral");
  const [modalItem, setModalItem] = useState(false);
  const [listaExtra, setListaExtra] = useState([]);
  const [formExtra, setFormExtra] = useState({ nome: "", categoria: "", quantidade: "", unidade: "", tipo: "cozinha", observacao: "" });
  const [confirmData, setConfirmData] = useState(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    supabase.from("itens_estoque").select("*").order("nome").then(({ data }) => setItens(data || []));
  }, []);

  const itensBaixo = itens.filter((i) => i.quantidade <= i.estoque_minimo && (filtro === "geral" || i.tipo === filtro));
  const listaExtraFiltrada = listaExtra.filter((i) => filtro === "geral" || i.tipo === filtro);
  const totalPendente = itensBaixo.filter((i) => !i._comprado).length + listaExtraFiltrada.filter((i) => !i.comprado).length;
  const totalComprado = itensBaixo.filter((i) => i._comprado).length + listaExtraFiltrada.filter((i) => i.comprado).length;

  function toggleComprado(id, isManual) {
    if (isManual) setListaExtra((prev) => prev.map((i) => i.id === id ? { ...i, comprado: !i.comprado } : i));
    else setItens((prev) => prev.map((i) => i.id === id ? { ...i, _comprado: !i._comprado } : i));
  }

  function addExtra() {
    if (!formExtra.nome) return;
    setListaExtra((prev) => [...prev, { ...formExtra, id: Date.now(), comprado: false }]);
    setFormExtra({ nome: "", categoria: "", quantidade: "", unidade: "", tipo: "cozinha", observacao: "" });
    setModalItem(false);
    setMsg("Item adicionado!"); setTimeout(() => setMsg(""), 2000);
  }

  return (
    <div style={{ padding: "1.5rem", maxWidth: 900, margin: "0 auto" }}>
      {confirmData && <ConfirmModal {...confirmData} onCancel={() => setConfirmData(null)} />}

      <PageHeader title="Lista de Compras" subtitle="Itens abaixo do minimo + adicionados manualmente">
        <Btn variant="primary" onClick={() => setModalItem(true)}>+ Adicionar item</Btn>
      </PageHeader>

      <Msg text={msg} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
        <MetricCard label="A comprar" value={totalPendente} subColor={totalPendente > 0 ? "#BA7517" : "#1D9E75"} sub={totalPendente > 0 ? "pendente" : "tudo ok"} />
        <MetricCard label="Ja comprado" value={totalComprado} subColor="#1D9E75" sub="marcados" />
        <MetricCard label="Total na lista" value={totalPendente + totalComprado} sub="itens" />
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {[["geral","Geral"],["cozinha","Cozinha"],["limpeza","Limpeza"],["pedagogico","Mat. Pedagogico"],["escritorio","Mat. Escritorio"]].map(([k,l]) => (
          <button key={k} onClick={() => setFiltro(k)}
            style={{ padding: "6px 18px", borderRadius: 20, border: "0.5px solid", fontSize: 13, cursor: "pointer", fontFamily: "inherit",
              background: filtro === k ? "#1D9E75" : "#fff", borderColor: filtro === k ? "#1D9E75" : "#ccc", color: filtro === k ? "#fff" : "#555" }}>
            {l}
          </button>
        ))}
      </div>

      {/* Estoque baixo automático */}
      <div style={{ background: "#fff", border: "0.5px solid #e0e0e0", borderRadius: 12, padding: "1.25rem", marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>
          Estoque abaixo do minimo
          <span style={{ fontSize: 12, color: "#888", fontWeight: 400, marginLeft: 8 }}>gerado automaticamente</span>
        </div>
        {itensBaixo.length === 0 && <div style={{ fontSize: 13, color: "#aaa" }}>Nenhum item abaixo do minimo neste filtro.</div>}
        {itensBaixo.map((item) => (
          <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "0.5px solid #f0f0f0", opacity: item._comprado ? 0.4 : 1 }}>
            <input type="checkbox" checked={!!item._comprado} onChange={() => toggleComprado(item.id, false)}
              style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#1D9E75" }} />
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 13, fontWeight: 500, textDecoration: item._comprado ? "line-through" : "none" }}>{item.nome}</span>
              <span style={{ fontSize: 11, color: "#aaa", marginLeft: 8 }}>{item.categoria}</span>
            </div>
            <span style={{ fontSize: 12, color: "#888" }}>Tem: {item.quantidade} {item.unidade} — Min: {item.estoque_minimo}</span>
            <span style={{ fontSize: 12, background: "#FAEEDA", color: "#633806", padding: "2px 10px", borderRadius: 20 }}>
              ~{Math.max(1, item.estoque_minimo - item.quantidade + 1)} {item.unidade}
            </span>
            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20,
              background: item.tipo === "cozinha" ? "#E1F5EE" : item.tipo === "pedagogico" ? "#F0FAF6" : "#E6F1FB",
              color: item.tipo === "cozinha" ? "#085041" : item.tipo === "pedagogico" ? "#085041" : "#0C447C" }}>{item.tipo}</span>
          </div>
        ))}
      </div>

      {/* Itens manuais */}
      <div style={{ background: "#fff", border: "0.5px solid #e0e0e0", borderRadius: 12, padding: "1.25rem" }}>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>
          Adicoes manuais
          <span style={{ fontSize: 12, color: "#888", fontWeight: 400, marginLeft: 8 }}>itens extras</span>
        </div>
        {listaExtraFiltrada.length === 0 && <div style={{ fontSize: 13, color: "#aaa" }}>Nenhum item manual adicionado neste filtro.</div>}
        {listaExtraFiltrada.map((item) => (
          <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "0.5px solid #f0f0f0", opacity: item.comprado ? 0.4 : 1 }}>
            <input type="checkbox" checked={!!item.comprado} onChange={() => toggleComprado(item.id, true)}
              style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#1D9E75" }} />
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 13, fontWeight: 500, textDecoration: item.comprado ? "line-through" : "none" }}>{item.nome}</span>
              {item.categoria && <span style={{ fontSize: 11, color: "#aaa", marginLeft: 8 }}>{item.categoria}</span>}
              {item.observacao && <div style={{ fontSize: 11, color: "#bbb" }}>{item.observacao}</div>}
            </div>
            {item.quantidade && <span style={{ fontSize: 12, color: "#888" }}>{item.quantidade} {item.unidade}</span>}
            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20,
              background: item.tipo === "cozinha" ? "#E1F5EE" : item.tipo === "pedagogico" ? "#F0FAF6" : "#E6F1FB",
              color: item.tipo === "cozinha" ? "#085041" : item.tipo === "pedagogico" ? "#085041" : "#0C447C" }}>{item.tipo}</span>
            <Btn small variant="danger" onClick={() => setConfirmData({
              title: "Remover item",
              message: `Remover "${item.nome}" da lista?`,
              onConfirm: () => { setListaExtra((prev) => prev.filter((i) => i.id !== item.id)); setConfirmData(null); },
            })}>Remover</Btn>
          </div>
        ))}
      </div>

      {modalItem && (
        <Modal title="Adicionar item a lista" onClose={() => setModalItem(false)}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Input label="Nome *" value={formExtra.nome} onChange={(e) => setFormExtra({ ...formExtra, nome: e.target.value })} />
            <Input label="Categoria" value={formExtra.categoria} onChange={(e) => setFormExtra({ ...formExtra, categoria: e.target.value })} />
            <Input label="Quantidade" value={formExtra.quantidade} onChange={(e) => setFormExtra({ ...formExtra, quantidade: e.target.value })} />
            <Input label="Unidade" value={formExtra.unidade} placeholder="kg, L, un..." onChange={(e) => setFormExtra({ ...formExtra, unidade: e.target.value })} />
          </div>
          <SelectField label="Setor" value={formExtra.tipo} onChange={(e) => setFormExtra({ ...formExtra, tipo: e.target.value })}>
            <option value="cozinha">Cozinha</option>
            <option value="limpeza">Limpeza</option>
            <option value="pedagogico">Mat. Pedagogico</option>
            <option value="escritorio">Mat. Escritorio</option>
          </SelectField>
          <Input label="Observacao" value={formExtra.observacao} onChange={(e) => setFormExtra({ ...formExtra, observacao: e.target.value })} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <Btn onClick={() => setModalItem(false)}>Cancelar</Btn>
            <Btn variant="primary" onClick={addExtra}>Adicionar</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
