import { useState, useEffect, useRef } from "react";
import { useApp } from "../context/AppContext";
import { TODAS_ABAS, ABAS_ESTOQUE_KEYS } from "../lib/helpers";
import { Btn } from "./ui";

const ABAS_ESTOQUE = ABAS_ESTOQUE_KEYS;

export default function Navbar() {
  const { usuario, tab, setTab, perms, handleLogout } = useApp();
  const [menuAberto, setMenuAberto] = useState(false);
  const [estoqueAberto, setEstoqueAberto] = useState(false);
  const [mobileEstoqueAberto, setMobileEstoqueAberto] = useState(false);
  const estoqueRef = useRef(null);

  if (!usuario) return null;

  const tabs = TODAS_ABAS.filter((t) => perms[t.key]);
  const tabsEstoque = tabs.filter((t) => ABAS_ESTOQUE.includes(t.key));
  const tabsOutras  = tabs.filter((t) => !ABAS_ESTOQUE.includes(t.key));
  const estoqueAtivo = ABAS_ESTOQUE.includes(tab);

  function navegar(key) {
    setTab(key);
    setMenuAberto(false);
    setEstoqueAberto(false);
    setMobileEstoqueAberto(false);
  }

  useEffect(() => {
    function handleOut(e) {
      if (estoqueRef.current && !estoqueRef.current.contains(e.target)) {
        setEstoqueAberto(false);
      }
    }
    document.addEventListener("mousedown", handleOut);
    return () => document.removeEventListener("mousedown", handleOut);
  }, []);

  const btnBase = {
    padding: "6px 13px", borderRadius: 7, border: "none", cursor: "pointer",
    fontSize: 13, fontFamily: "inherit", transition: "background .15s",
    whiteSpace: "nowrap", lineHeight: "1.4",
  };
  const btnAtivo   = { background: "#E1F5EE", color: "#085041", fontWeight: 600 };
  const btnInativo = { background: "transparent", color: "#555", fontWeight: 400 };

  return (
    <>
      {/* ── BARRA ── */}
      <nav style={{
        background: "#fff", borderBottom: "1px solid #e8e8e8",
        padding: "0 1.25rem", display: "flex", alignItems: "center",
        height: 52, position: "sticky", top: 0, zIndex: 200,
        boxSizing: "border-box", width: "100%",
      }}>
        {/* Logo */}
        <span style={{ fontSize: 15, fontWeight: 700, color: "#1D9E75", marginRight: 20, whiteSpace: "nowrap", flexShrink: 0 }}>
          GestCEI
        </span>

        {/* ── Desktop: nav ── */}
        <div className="hide-mobile" style={{ display: "flex", gap: 2, alignItems: "center", flex: 1 }}>

          {/* Estoque — menu pai com dropdown */}
          {tabsEstoque.length > 0 && (
            <div ref={estoqueRef} style={{ position: "relative" }}>
              <button
                onClick={() => setEstoqueAberto(v => !v)}
                style={{
                  ...btnBase,
                  ...(estoqueAtivo ? btnAtivo : btnInativo),
                  display: "flex", alignItems: "center", gap: 5,
                }}
              >
                Estoque
                <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{
                  transition: "transform .2s",
                  transform: estoqueAberto ? "rotate(180deg)" : "rotate(0deg)",
                  opacity: 0.5,
                }}>
                  <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>

              {/* Dropdown */}
              {estoqueAberto && (
                <div style={{
                  position: "absolute", top: "calc(100% + 8px)", left: 0,
                  background: "#fff",
                  border: "1px solid #e8e8e8",
                  borderRadius: 10,
                  boxShadow: "0 8px 24px rgba(0,0,0,.09)",
                  zIndex: 300, minWidth: 200, padding: "8px 0",
                }}>
                  {/* Seta */}
                  <div style={{
                    position: "absolute", top: -5, left: 18,
                    width: 10, height: 10, background: "#fff",
                    borderTop: "1px solid #e8e8e8", borderLeft: "1px solid #e8e8e8",
                    transform: "rotate(45deg)",
                  }} />
                  <div style={{ padding: "4px 14px 8px", fontSize: 10, color: "#bbb", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.7px" }}>
                    Controle de Estoque
                  </div>
                  {tabsEstoque.map((t) => (
                    <button key={t.key} onClick={() => navegar(t.key)} style={{
                      display: "flex", alignItems: "center", width: "100%",
                      textAlign: "left", padding: "9px 14px",
                      border: "none", fontFamily: "inherit",
                      background: tab === t.key ? "#F0FAF6" : "transparent",
                      color: tab === t.key ? "#085041" : "#333",
                      fontSize: 13, fontWeight: tab === t.key ? 600 : 400,
                      cursor: "pointer",
                      borderLeft: tab === t.key ? "3px solid #1D9E75" : "3px solid transparent",
                    }}>
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Demais abas */}
          {tabsOutras.map((t) => (
            <button key={t.key} onClick={() => navegar(t.key)}
              style={{ ...btnBase, ...(tab === t.key ? btnAtivo : btnInativo) }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Direita ── */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div className="hide-mobile" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 30, height: 30, borderRadius: "50%",
              background: "#E1F5EE", color: "#085041",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700,
            }}>
              {usuario.nome.slice(0, 2).toUpperCase()}
            </div>
            <span style={{ fontSize: 13, color: "#444", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {usuario.nome}
            </span>
            <Btn small onClick={handleLogout}>Sair</Btn>
          </div>

          {/* Hamburguer */}
          <button className="show-mobile" onClick={() => setMenuAberto(v => !v)}
            style={{ background: "none", border: "none", cursor: "pointer", padding: "6px", lineHeight: 1, borderRadius: 6 }}>
            {menuAberto
              ? <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M4 4l12 12M16 4L4 16" stroke="#333" strokeWidth="2" strokeLinecap="round"/></svg>
              : <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 5h14M3 10h14M3 15h14" stroke="#333" strokeWidth="2" strokeLinecap="round"/></svg>
            }
          </button>
        </div>
      </nav>

      {/* ── MOBILE: drawer ── */}
      {menuAberto && (
        <>
          <div className="show-mobile" onClick={() => setMenuAberto(false)} style={{
            position: "fixed", inset: 0, top: 52,
            background: "rgba(0,0,0,.38)", zIndex: 350,
          }} />
          <nav className="show-mobile" style={{
            position: "fixed", top: 52, left: 0, bottom: 0,
            width: 260, maxWidth: "85vw",
            background: "#fff", zIndex: 400,
            boxShadow: "4px 0 20px rgba(0,0,0,.13)",
            display: "flex", flexDirection: "column",
            overflowY: "auto",
          }}>

            {/* Estoque acordeão */}
            {tabsEstoque.length > 0 && (
              <div>
                <button onClick={() => setMobileEstoqueAberto(v => !v)} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  width: "100%", padding: "14px 20px",
                  border: "none", borderBottom: "1px solid #f2f2f2", fontFamily: "inherit",
                  background: estoqueAtivo ? "#F0FAF6" : "transparent",
                  color: estoqueAtivo ? "#085041" : "#222",
                  fontSize: 15, fontWeight: 500, cursor: "pointer",
                }}>
                  <span>Estoque</span>
                  <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{
                    transition: "transform .2s",
                    transform: mobileEstoqueAberto ? "rotate(180deg)" : "rotate(0)",
                  }}>
                    <path d="M1 1l4 4 4-4" stroke="#aaa" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </button>
                {mobileEstoqueAberto && (
                  <div style={{ background: "#fafafa", borderBottom: "1px solid #f2f2f2" }}>
                    {tabsEstoque.map((t) => (
                      <button key={t.key} onClick={() => navegar(t.key)} style={{
                        display: "block", width: "100%", textAlign: "left",
                        padding: "12px 20px 12px 34px",
                        border: "none", fontFamily: "inherit",
                        background: tab === t.key ? "#E1F5EE" : "transparent",
                        color: tab === t.key ? "#085041" : "#444",
                        fontSize: 14, fontWeight: tab === t.key ? 600 : 400,
                        cursor: "pointer",
                        borderLeft: tab === t.key ? "3px solid #1D9E75" : "3px solid transparent",
                      }}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Demais abas */}
            {tabsOutras.map((t) => (
              <button key={t.key} onClick={() => navegar(t.key)} style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "14px 20px",
                border: "none", borderBottom: "1px solid #f2f2f2", fontFamily: "inherit",
                background: tab === t.key ? "#E1F5EE" : "transparent",
                color: tab === t.key ? "#085041" : "#222",
                fontSize: 15, fontWeight: tab === t.key ? 600 : 400,
                cursor: "pointer",
                borderLeft: tab === t.key ? "3px solid #1D9E75" : "3px solid transparent",
              }}>
                {t.label}
              </button>
            ))}

            {/* Rodapé */}
            <div style={{ marginTop: "auto", padding: "16px 20px", borderTop: "1px solid #eee", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div>
                <div style={{ fontSize: 14, color: "#333", fontWeight: 500 }}>{usuario.nome}</div>
                <div style={{ fontSize: 12, color: "#999", marginTop: 1 }}>{usuario.perfil}</div>
              </div>
              <Btn small onClick={handleLogout}>Sair</Btn>
            </div>
          </nav>
        </>
      )}
    </>
  );
}
