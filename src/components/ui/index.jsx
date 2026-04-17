// ─────────────────────────────────────────────
//  GestCEI — Componentes de UI reutilizáveis
// ─────────────────────────────────────────────

const VARIANTS = {
  default: { background: "#fff", borderColor: "#ccc", color: "#333" },
  primary: { background: "#1D9E75", borderColor: "#1D9E75", color: "#fff" },
  danger:  { background: "#fff", borderColor: "#A32D2D", color: "#A32D2D" },
  warn:    { background: "#fff", borderColor: "#BA7517", color: "#BA7517" },
  info:    { background: "#E6F1FB", borderColor: "#185FA5", color: "#185FA5" },
};

export function Btn({ children, onClick, variant = "default", small, disabled, style = {} }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: small ? "4px 12px" : "7px 18px",
        fontSize: small ? 12 : 13,
        borderRadius: 7,
        cursor: disabled ? "not-allowed" : "pointer",
        border: "0.5px solid",
        fontFamily: "inherit",
        transition: "opacity .15s",
        opacity: disabled ? 0.5 : 1,
        ...VARIANTS[variant],
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function Input({ label, ...props }) {
  return (
    <div style={{ marginBottom: 12 }}>
      {label && (
        <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 4 }}>
          {label}
        </label>
      )}
      <input
        style={{
          width: "100%",
          padding: "8px 10px",
          borderRadius: 7,
          border: "0.5px solid #ccc",
          fontSize: 13,
          fontFamily: "inherit",
          boxSizing: "border-box",
        }}
        {...props}
      />
    </div>
  );
}

export function SelectField({ label, children, ...props }) {
  return (
    <div style={{ marginBottom: 12 }}>
      {label && (
        <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 4 }}>
          {label}
        </label>
      )}
      <select
        style={{
          width: "100%",
          padding: "8px 10px",
          borderRadius: 7,
          border: "0.5px solid #ccc",
          fontSize: 13,
          fontFamily: "inherit",
          background: "#fff",
        }}
        {...props}
      >
        {children}
      </select>
    </div>
  );
}

export function Modal({ title, children, onClose, width = 500 }) {
  // Detecta mobile para renderizar como bottom sheet
  const isMobile = typeof window !== "undefined" && window.innerWidth <= 640;
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.45)",
        display: "flex",
        alignItems: isMobile ? "flex-end" : "center",
        justifyContent: isMobile ? "stretch" : "center",
        zIndex: 500,
        padding: isMobile ? 0 : "1rem",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: isMobile ? "20px 20px 0 0" : 12,
          padding: "1.25rem 1.25rem 1.5rem",
          width: isMobile ? "100%" : width,
          maxWidth: isMobile ? "100%" : "95vw",
          maxHeight: isMobile ? "92vh" : "90vh",
          overflowY: "auto",
          border: isMobile ? "none" : "0.5px solid #e0e0e0",
          boxShadow: "0 -4px 30px rgba(0,0,0,.12)",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {/* Alça de arraste no mobile */}
        {isMobile && (
          <div style={{
            width: 40, height: 4, background: "#ddd",
            borderRadius: 2, margin: "0 auto 16px",
          }} />
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: "#111" }}>{title}</span>
          <Btn small onClick={onClose}>✕</Btn>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmModal({ title, message, onConfirm, onCancel, variant = "danger" }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.4)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300,
      }}
    >
      <div style={{ background: "#fff", borderRadius: 12, padding: "1.5rem", width: 380, border: "0.5px solid #e0e0e0" }}>
        <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 13, color: "#666", marginBottom: 20 }}>{message}</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn onClick={onCancel}>Cancelar</Btn>
          <Btn variant={variant} onClick={onConfirm}>Confirmar</Btn>
        </div>
      </div>
    </div>
  );
}

export function MetricCard({ label, value, sub, subColor, accent }) {
  return (
    <div style={{ background: accent || "#f7f7f5", borderRadius: 8, padding: "14px 16px" }}>
      <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 500, color: "#111" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: subColor || "#888", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export function AlertBar({ children, type = "warn" }) {
  const colors = {
    warn:   { bg: "#FAEEDA", border: "#FAC775", color: "#412402" },
    danger: { bg: "#FCEBEB", border: "#F7C1C1", color: "#501313" },
    success:{ bg: "#E1F5EE", border: "#9FE1CB", color: "#085041" },
  };
  const c = colors[type] || colors.warn;
  return (
    <div style={{
      background: c.bg, border: `0.5px solid ${c.border}`,
      borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 13, color: c.color,
    }}>
      {children}
    </div>
  );
}

export function Msg({ text }) {
  if (!text) return null;
  const isErr = text.toLowerCase().startsWith("erro");
  return (
    <div style={{
      background: isErr ? "#FCEBEB" : "#E1F5EE",
      color: isErr ? "#791F1F" : "#085041",
      padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13,
    }}>
      {isErr ? "⚠ " : "✓ "}{text}
    </div>
  );
}

export function TagStatus({ status }) {
  const tags = {
    ok:       { bg: "#E1F5EE", color: "#085041", label: "Normal"   },
    baixo:    { bg: "#FAEEDA", color: "#633806", label: "Baixo"    },
    vencendo: { bg: "#FAEEDA", color: "#633806", label: "Vencendo" },
    vencido:  { bg: "#FCEBEB", color: "#791F1F", label: "Vencido"  },
  };
  const t = tags[status] || tags.ok;
  return (
    <span style={{ background: t.bg, color: t.color, padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 500 }}>
      {t.label}
    </span>
  );
}

export function Badge({ children, color = "info" }) {
  const colors = {
    info:    { bg: "#E6F1FB", color: "#0C447C" },
    success: { bg: "#E1F5EE", color: "#085041" },
    warn:    { bg: "#FAEEDA", color: "#633806" },
    danger:  { bg: "#FCEBEB", color: "#791F1F" },
    gray:    { bg: "#f0f0ee", color: "#555" },
  };
  const c = colors[color] || colors.gray;
  return (
    <span style={{ background: c.bg, color: c.color, padding: "2px 10px", borderRadius: 20, fontSize: 11 }}>
      {children}
    </span>
  );
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", justifyContent: "space-between",
      marginBottom: 20, gap: 12, flexWrap: "wrap",
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: "#111" }}>{title}</div>
        {subtitle && <div style={{ fontSize: 13, color: "#888", marginTop: 2 }}>{subtitle}</div>}
      </div>
      {children && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flexShrink: 0 }}>
          {children}
        </div>
      )}
    </div>
  );
}

export function Table({ headers, children, colSpan }) {
  return (
    <div style={{ background: "#fff", border: "0.5px solid #e0e0e0", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
        <thead>
          <tr style={{ background: "#f7f7f5" }}>
            {headers.map((h) => (
              <th key={h} style={{ padding: "10px 14px", fontSize: 12, fontWeight: 500, color: "#777", textAlign: "left", borderBottom: "0.5px solid #e0e0e0", whiteSpace: "nowrap" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
</div>
  );
}

export function EmptyRow({ colSpan, message = "Nenhum registro encontrado." }) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: 24, textAlign: "center", fontSize: 13, color: "#aaa" }}>
        {message}
      </td>
    </tr>
  );
}
