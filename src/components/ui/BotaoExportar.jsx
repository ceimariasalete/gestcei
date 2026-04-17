import { useState } from "react";
import { exportarCSV } from "../../lib/helpers";

/**
 * BotaoExportar — exporta dados para CSV
 * Props:
 *   dados: array de objetos
 *   nomeArquivo: string
 *   label: string (opcional)
 */
export default function BotaoExportar({ dados, nomeArquivo, label = "Exportar CSV" }) {
  const [exportando, setExportando] = useState(false);

  function handleExportar() {
    if (!dados || dados.length === 0) {
      alert("Nenhum dado para exportar.");
      return;
    }
    setExportando(true);
    setTimeout(() => {
      exportarCSV(dados, nomeArquivo);
      setExportando(false);
    }, 100);
  }

  return (
    <button
      onClick={handleExportar}
      disabled={exportando}
      style={{
        padding: "7px 14px", borderRadius: 7, border: "0.5px solid #185FA5",
        background: "#E6F1FB", color: "#185FA5", fontSize: 13,
        fontFamily: "inherit", cursor: exportando ? "not-allowed" : "pointer",
        opacity: exportando ? 0.7 : 1, display: "flex", alignItems: "center", gap: 6,
      }}
    >
      {exportando ? "Exportando..." : `↓ ${label}`}
    </button>
  );
}
