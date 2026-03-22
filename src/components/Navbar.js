import { useApp } from "../context/AppContext";
import { TODAS_ABAS } from "../lib/helpers";
import { Btn } from "./ui";

export default function Navbar() {
  const { usuario, tab, setTab, perms, handleLogout } = useApp();

  if (!usuario) return null;

  const tabs = TODAS_ABAS.filter((t) => perms[t.key]);

  return (
    <nav
      style={{
        background: "#fff",
        borderBottom: "0.5px solid #e0e0e0",
        padding: "0 1.5rem",
        display: "flex",
        alignItems: "center",
        height: 52,
        gap: 4,
        flexWrap: "wrap",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      <span style={{ fontSize: 16, fontWeight: 600, color: "#1D9E75", marginRight: 12 }}>
        GestCEI
      </span>

      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => setTab(t.key)}
          style={{
            padding: "6px 14px",
            borderRadius: 7,
            border: "none",
            cursor: "pointer",
            fontSize: 13,
            background: tab === t.key ? "#E1F5EE" : "transparent",
            color: tab === t.key ? "#085041" : "#555",
            fontWeight: tab === t.key ? 500 : 400,
            transition: "background .15s",
          }}
        >
          {t.label}
        </button>
      ))}

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 30, height: 30, borderRadius: "50%",
            background: "#E1F5EE", color: "#085041",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 500,
          }}
        >
          {usuario.nome.slice(0, 2).toUpperCase()}
        </div>
        <span style={{ fontSize: 13, color: "#555" }}>{usuario.nome}</span>
        <span style={{ fontSize: 11, background: "#f0f0ee", padding: "2px 8px", borderRadius: 20, color: "#666" }}>
          {usuario.perfil}
        </span>
        <Btn small onClick={handleLogout}>Sair</Btn>
      </div>
    </nav>
  );
}
