import { useState } from "react";
import { periodoParaDatas, labelPeriodo } from "../../lib/helpers";

/**
 * SeletorPeriodo — componente reutilizável para selecionar período financeiro
 * Retorna { inicio, fim } via onChange
 */
export default function SeletorPeriodo({ onChange }) {
  const [periodo, setPeriodo] = useState("mes_atual");
  const [customInicio, setCustomInicio] = useState("");
  const [customFim, setCustomFim] = useState("");
  const [aberto, setAberto] = useState(false);

  function aplicar(p, ci, cf) {
    if (p === "customizado") {
      if (!ci || !cf) return;
      onChange({ inicio: ci, fim: cf, periodo: p });
    } else {
      const datas = periodoParaDatas(p);
      onChange({ ...datas, periodo: p });
    }
  }

  function selecionarPeriodo(p) {
    setPeriodo(p);
    if (p !== "customizado") {
      aplicar(p, customInicio, customFim);
      setAberto(false);
    }
  }

  const opcoes = [
    { key: "mes_atual",       label: "Mes atual"        },
    { key: "mes_anterior",    label: "Mes anterior"     },
    { key: "trimestre_atual", label: "Trimestre atual"  },
    { key: "semestre_atual",  label: "Semestre atual"   },
    { key: "ano_atual",       label: "Ano atual"        },
    { key: "customizado",     label: "Periodo customizado" },
  ];

  const datas = periodo !== "customizado" ? periodoParaDatas(periodo) : { inicio: customInicio, fim: customFim };

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setAberto(!aberto)}
        style={{
          padding: "7px 14px", borderRadius: 7, border: "0.5px solid #ccc",
          background: "#fff", fontSize: 13, fontFamily: "inherit",
          cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
        }}
      >
        <span style={{ color: "#1D9E75", fontWeight: 500 }}>
          {labelPeriodo(periodo, datas.inicio, datas.fim)}
        </span>
        <span style={{ color: "#888", fontSize: 11 }}>▼</span>
      </button>

      {aberto && (
        <div style={{
          position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 100,
          background: "#fff", border: "0.5px solid #e0e0e0", borderRadius: 10,
          boxShadow: "0 4px 20px rgba(0,0,0,.1)", width: 280, padding: 12,
        }}>
          {opcoes.map((o) => (
            <button key={o.key} onClick={() => selecionarPeriodo(o.key)}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "8px 12px", borderRadius: 6, border: "none",
                background: periodo === o.key ? "#E1F5EE" : "transparent",
                color: periodo === o.key ? "#085041" : "#333",
                fontSize: 13, fontFamily: "inherit", cursor: "pointer",
                fontWeight: periodo === o.key ? 500 : 400,
                marginBottom: 2,
              }}>
              {o.label}
            </button>
          ))}

          {periodo === "customizado" && (
            <div style={{ marginTop: 10, borderTop: "0.5px solid #e0e0e0", paddingTop: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                <div>
                  <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 4 }}>De</label>
                  <input type="date" value={customInicio} onChange={(e) => setCustomInicio(e.target.value)}
                    style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "0.5px solid #ccc", fontSize: 12, fontFamily: "inherit", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 4 }}>Ate</label>
                  <input type="date" value={customFim} onChange={(e) => setCustomFim(e.target.value)}
                    style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "0.5px solid #ccc", fontSize: 12, fontFamily: "inherit", boxSizing: "border-box" }} />
                </div>
              </div>
              <button onClick={() => { aplicar("customizado", customInicio, customFim); setAberto(false); }}
                style={{
                  width: "100%", padding: "7px", borderRadius: 6, border: "none",
                  background: "#1D9E75", color: "#fff", fontSize: 13,
                  fontFamily: "inherit", cursor: "pointer", fontWeight: 500,
                }}>
                Aplicar periodo
              </button>
            </div>
          )}
        </div>
      )}

      {/* Fecha ao clicar fora */}
      {aberto && (
        <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setAberto(false)} />
      )}
    </div>
  );
}
