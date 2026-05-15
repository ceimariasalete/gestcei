import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { PageHeader, Table, EmptyRow } from "../ui";

export default function Auditoria() {
  const [logs, setLogs] = useState([]);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    supabase.from("auditoria").select("*").order("data", { ascending: false }).limit(300)
      .then(({ data }) => setLogs(data || []));
  }, []);

  const filtered = logs.filter((l) =>
    !busca ||
    l.descricao?.toLowerCase().includes(busca.toLowerCase()) ||
    l.usuario_nome?.toLowerCase().includes(busca.toLowerCase()) ||
    l.tabela?.toLowerCase().includes(busca.toLowerCase())
  );

  const opStyle = {
    INSERT: { bg: "#E1F5EE", color: "#085041" },
    UPDATE: { bg: "#FAEEDA", color: "#633806" },
    DELETE: { bg: "#FCEBEB", color: "#791F1F" },
  };

  return (
    <div style={{ padding: "1.5rem", maxWidth: 1100, margin: "0 auto" }}>
      <PageHeader title="Auditoria" subtitle="Historico completo — quem alterou o que e quando" />

      <input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Filtrar por usuario, acao ou tabela..."
        style={{ width: "100%", padding: "8px 12px", borderRadius: 7, border: "0.5px solid #ccc", fontSize: 13, fontFamily: "inherit", marginBottom: 12, boxSizing: "border-box" }}
      />

      <Table headers={["Data/Hora", "Usuario", "Operacao", "Tabela", "Descricao"]}>
        {filtered.map((l) => {
          const s = opStyle[l.operacao] || { bg: "#f0f0ee", color: "#555" };
          return (
            <tr key={l.id} style={{ borderBottom: "0.5px solid #f0f0f0" }}>
              <td style={{ padding: "9px 14px", fontSize: 12, color: "#888", whiteSpace: "nowrap" }}>
                {new Date(l.data).toLocaleString("pt-BR")}
              </td>
              <td style={{ padding: "9px 14px", fontSize: 13, fontWeight: 500 }}>{l.usuario_nome}</td>
              <td style={{ padding: "9px 14px" }}>
                <span style={{ background: s.bg, color: s.color, padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 500 }}>
                  {l.operacao}
                </span>
              </td>
              <td style={{ padding: "9px 14px", fontSize: 12, color: "#888" }}>{l.tabela}</td>
              <td style={{ padding: "9px 14px", fontSize: 13 }}>{l.descricao}</td>
            </tr>
          );
        })}
        {filtered.length === 0 && <EmptyRow colSpan={5} message="Nenhum registro encontrado." />}
      </Table>
    </div>
  );
}
