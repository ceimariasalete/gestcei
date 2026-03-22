import { useState } from "react";
import { useApp } from "../context/AppContext";
import { TODAS_ABAS } from "../lib/helpers";
import { Btn } from "./ui";

export default function Navbar() {
  const { usuario, tab, setTab, perms, handleLogout } = useApp();
  const [menuAberto, setMenuAberto] = useState(false);

  if (!usuario) return null;

  const tabs = TODAS_ABAS.filter((t) => perms[t.key]);

  return (
    <nav style={{
      background: "#fff", borderBottom: "0.5px solid #e0e0e0",
      padding: "0 1rem", display: "flex", alignItems: "center",
      height: 52, position: "sticky", top: 0, zIndex: 100,
    }}>
      <span style={{ fontSize: 16, fontWeight: 600, color: "#1D9E75", marginRight: 12 }}>GestCEI</span>

      {/* Desktop: links */}
      <div className="hide-mobile" style={{ display: "flex", gap: 4, alignItems: "center" }}>
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: "6px 14px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 13,
            background: tab === t.key ? "#E1F5EE" : "transparent",
            color: tab === t.key ? "#085041" : "#555",
            fontWeight: tab === t.key ? 500 : 400, transition: "background .15s",
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
        {/* Desktop: usuario */}
        <div className="hide-mobile" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#E1F5EE", color: "#085041", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 500 }}>
            {usuario.nome.slice(0, 2).toUpperCase()}
          </div>
          <span style={{ fontSize: 13, color: "#555" }}>{usuario.nome}</span>
          <span style={{ fontSize: 11, background: "#f0f0ee", padding: "2px 8px", borderRadius: 20, color: "#666" }}>{usuario.perfil}</span>
          <Btn small onClick={handleLogout}>Sair</Btn>
        </div>

        {/* Mobile: hamburguer */}
        <button className="show-mobile" onClick={() => setMenuAberto(!menuAberto)}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: "#333", padding: "4px 8px" }}>
          {menuAberto ? "✕" : "☰"}
        </button>
      </div>

      {/* Mobile: menu dropdown */}
      {menuAberto && (
        <div className="show-mobile" style={{
          position: "absolute", top: 52, left: 0, right: 0, background: "#fff",
          borderBottom: "0.5px solid #e0e0e0", boxShadow: "0 4px 12px rgba(0,0,0,.08)",
          zIndex: 200, padding: "8px 0",
        }}>
          {tabs.map((t) => (
            <button key={t.key} onClick={() => { setTab(t.key); setMenuAberto(false); }} style={{
              display: "block", width: "100%", textAlign: "left", padding: "12px 20px",
              border: "none", background: tab === t.key ? "#E1F5EE" : "transparent",
              color: tab === t.key ? "#085041" : "#333", fontSize: 14,
              fontWeight: tab === t.key ? 500 : 400, cursor: "pointer",
            }}>{t.label}</button>
          ))}
          <div style={{ borderTop: "0.5px solid #f0f0f0", padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, color: "#555" }}>{usuario.nome} <span style={{ fontSize: 11, color: "#888" }}>({usuario.perfil})</span></span>
            <Btn small onClick={handleLogout}>Sair</Btn>
          </div>
        </div>
      )}
    </nav>
  );
}
