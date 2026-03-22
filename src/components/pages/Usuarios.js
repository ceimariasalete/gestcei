import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useApp } from "../../context/AppContext";
import { useAuditoria } from "../../hooks/useAuditoria";
import { TODAS_ABAS, PERMS_PADRAO } from "../../lib/helpers";
import { Btn, Input, SelectField, Modal, ConfirmModal, Msg, PageHeader, Table, EmptyRow, Badge } from "../ui";

const PERFIL_COLOR = {
  admin:         { bg: "#F4C0D1", color: "#72243E" },
  nutricionista: { bg: "#E6F1FB", color: "#0C447C" },
  cozinheira:    { bg: "#E1F5EE", color: "#085041" },
  limpeza:       { bg: "#FAEEDA", color: "#633806" },
  pedagogico:    { bg: "#EEEDFE", color: "#3C3489" },
};

export default function Usuarios() {
  const { usuario } = useApp();
  const { log } = useAuditoria(usuario);

  const [usuarios, setUsuarios] = useState([]);
  const [modal, setModal] = useState(false);
  const [modalPerms, setModalPerms] = useState(null);
  const [form, setForm] = useState({ nome: "", email: "", perfil: "cozinheira", senha: "", ativo: true });
  const [editUsr, setEditUsr] = useState(null);
  const [permsEdit, setPermsEdit] = useState({});
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [confirmData, setConfirmData] = useState(null);

  const showMsg = (m) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    const { data } = await supabase.from("usuarios").select("*").order("nome");
    setUsuarios(data || []);
  }

  function abrir(u = null) {
    setEditUsr(u);
    setForm(u ? { ...u, senha: "" } : { nome: "", email: "", perfil: "cozinheira", senha: "", ativo: true });
    setModal(true);
  }

  function abrirPerms(u) {
    setPermsEdit({ ...PERMS_PADRAO[u.perfil], ...(u.permissoes || {}) });
    setModalPerms(u);
  }

  async function salvarPerms() {
    await supabase.from("usuarios").update({ permissoes: permsEdit }).eq("id", modalPerms.id);
    await log("usuarios", "UPDATE", modalPerms.id, `Alterou permissoes de "${modalPerms.nome}"`, modalPerms.permissoes, permsEdit);
    setModalPerms(null);
    carregar();
    showMsg("Permissoes atualizadas!");
  }

  async function salvar() {
    if (!form.nome || !form.email) return;
    setLoading(true);
    try {
      if (editUsr) {
        await supabase.from("usuarios").update({ nome: form.nome, perfil: form.perfil, ativo: form.ativo }).eq("id", editUsr.id);
        await log("usuarios", "UPDATE", editUsr.id, `Editou usuario "${form.nome}"`, editUsr, form);
        showMsg("Usuario atualizado!");
      } else {
        const { data: authData, error } = await supabase.auth.admin.createUser({
          email: form.email, password: form.senha, email_confirm: true,
        });
        if (error) { showMsg("Erro: " + error.message); setLoading(false); return; }
        await supabase.from("usuarios").insert({
          nome: form.nome, email: form.email, perfil: form.perfil,
          ativo: true, permissoes: PERMS_PADRAO[form.perfil] || {},
        });
        await log("usuarios", "INSERT", authData.user?.id, `Criou usuario "${form.nome}" (${form.perfil})`, null, form);
        showMsg("Usuario criado!");
      }
      setModal(false);
      carregar();
    } catch (e) {
      showMsg("Erro: " + e.message);
    }
    setLoading(false);
  }

  async function toggleAtivo(u) {
    setConfirmData(null);
    await supabase.from("usuarios").update({ ativo: !u.ativo }).eq("id", u.id);
    await log("usuarios", "UPDATE", u.id, `${u.ativo ? "Desativou" : "Ativou"} usuario "${u.nome}"`, u, { ...u, ativo: !u.ativo });
    carregar();
  }

  return (
    <div style={{ padding: "1.5rem", maxWidth: 1000, margin: "0 auto" }}>
      {confirmData && <ConfirmModal {...confirmData} onCancel={() => setConfirmData(null)} />}

      <PageHeader title="Usuarios" subtitle="Gerenciar acessos e permissoes">
        <Btn variant="primary" onClick={() => abrir()}>+ Novo usuario</Btn>
      </PageHeader>

      <Msg text={msg} />

      <Table headers={["Nome", "E-mail", "Perfil", "Status", "Acesso a", ""]}>
        {usuarios.map((u) => {
          const pc = PERFIL_COLOR[u.perfil] || { bg: "#f0f0ee", color: "#555" };
          const perms = u.permissoes || PERMS_PADRAO[u.perfil] || {};
          const abasAtivas = TODAS_ABAS.filter((a) => perms[a.key]).map((a) => a.label);
          return (
            <tr key={u.id} style={{ borderBottom: "0.5px solid #f0f0f0" }}>
              <td style={{ padding: "10px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: pc.bg, color: pc.color,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 500 }}>
                    {u.nome.slice(0, 2).toUpperCase()}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{u.nome}</span>
                </div>
              </td>
              <td style={{ padding: "10px 14px", fontSize: 13, color: "#555" }}>{u.email}</td>
              <td style={{ padding: "10px 14px" }}>
                <span style={{ background: pc.bg, color: pc.color, padding: "2px 10px", borderRadius: 20, fontSize: 11 }}>{u.perfil}</span>
              </td>
              <td style={{ padding: "10px 14px" }}>
                <span style={{ background: u.ativo ? "#E1F5EE" : "#f0f0ee", color: u.ativo ? "#085041" : "#888",
                  padding: "2px 10px", borderRadius: 20, fontSize: 11 }}>{u.ativo ? "Ativo" : "Inativo"}</span>
              </td>
              <td style={{ padding: "10px 14px", fontSize: 12, color: "#888" }}>
                {abasAtivas.join(" · ") || "Nenhuma"}
              </td>
              <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                <Btn small onClick={() => abrir(u)} style={{ marginRight: 4 }}>Editar</Btn>
                <Btn small variant="info" onClick={() => abrirPerms(u)} style={{ marginRight: 4 }}>Permissoes</Btn>
                <Btn small variant={u.ativo ? "danger" : "warn"}
                  onClick={() => setConfirmData({
                    title: u.ativo ? "Desativar usuario" : "Ativar usuario",
                    message: `${u.ativo ? "Desativar" : "Ativar"} o acesso de "${u.nome}"?`,
                    variant: u.ativo ? "danger" : "primary",
                    onConfirm: () => toggleAtivo(u),
                  })}>
                  {u.ativo ? "Desativar" : "Ativar"}
                </Btn>
              </td>
            </tr>
          );
        })}
        {usuarios.length === 0 && <EmptyRow colSpan={6} />}
      </Table>

      {/* Modal: Editar/Criar usuario */}
      {modal && (
        <Modal title={editUsr ? "Editar usuario" : "Novo usuario"} onClose={() => setModal(false)}>
          <Input label="Nome completo" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          <Input label="E-mail" type="email" value={form.email} disabled={!!editUsr} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          {!editUsr && <Input label="Senha inicial" type="password" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} />}
          <SelectField label="Perfil" value={form.perfil} onChange={(e) => setForm({ ...form, perfil: e.target.value })}>
            <option value="admin">Administrador</option>
            <option value="nutricionista">Nutricionista</option>
            <option value="cozinheira">Cozinheira</option>
            <option value="limpeza">Limpeza</option>
            <option value="pedagogico">Pedagogico</option>
          </SelectField>
          {editUsr && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />
                Usuario ativo
              </label>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <Btn onClick={() => setModal(false)}>Cancelar</Btn>
            <Btn variant="primary" onClick={salvar} disabled={loading}>{loading ? "Salvando..." : "Salvar"}</Btn>
          </div>
        </Modal>
      )}

      {/* Modal: Permissoes */}
      {modalPerms && (
        <Modal title={`Permissoes — ${modalPerms.nome}`} onClose={() => setModalPerms(null)} width={420}>
          <div style={{ fontSize: 13, color: "#888", marginBottom: 16 }}>
            Selecione quais abas este usuario pode acessar:
          </div>
          {TODAS_ABAS.map((aba) => (
            <label key={aba.key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "0.5px solid #f0f0f0", cursor: "pointer" }}>
              <input type="checkbox" checked={!!permsEdit[aba.key]}
                onChange={(e) => setPermsEdit({ ...permsEdit, [aba.key]: e.target.checked })}
                style={{ width: 16, height: 16, accentColor: "#1D9E75" }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{aba.label}</div>
                <div style={{ fontSize: 11, color: "#aaa" }}>
                  {{ cozinha:"Ver e gerenciar estoque de cozinha", limpeza:"Ver e gerenciar estoque de limpeza", lista:"Ver e editar lista de compras", financeiro:"Lancamentos, DRE, dashboard e IA", auditoria:"Ver historico de alteracoes", usuarios:"Gerenciar usuarios e permissoes" }[aba.key]}
                </div>
              </div>
            </label>
          ))}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <Btn onClick={() => setModalPerms(null)}>Cancelar</Btn>
            <Btn variant="primary" onClick={salvarPerms}>Salvar permissoes</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
