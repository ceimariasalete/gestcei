import { AppProvider, useApp } from "./context/AppContext";
import Navbar from "./components/Navbar";
import LoginPage from "./components/LoginPage";
import Estoque from "./components/pages/Estoque";
import Escritorio from "./components/pages/Escritorio";
import ListaCompras from "./components/pages/ListaCompras";
import Financeiro from "./components/pages/Financeiro";
import Auditoria from "./components/pages/Auditoria";
import Usuarios from "./components/pages/Usuarios";

function Router() {
  const { usuario, tab, loading } = useApp();

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f4f4f2" }}>
        <div style={{ fontSize: 14, color: "#888" }}>Carregando GestCEI...</div>
      </div>
    );
  }

  if (!usuario) return <LoginPage />;

  return (
    <div style={{ minHeight: "100vh", background: "#f4f4f2", overflowX: "hidden" }}>
      <Navbar />
      <div style={{ maxWidth: "100%", overflowX: "hidden" }}>
        {tab === "cozinha"    && <Estoque tipo="cozinha" />}
        {tab === "limpeza"    && <Estoque tipo="limpeza" />}
        {tab === "pedagogico" && <Estoque tipo="pedagogico" />}
        {tab === "escritorio" && <Escritorio />}
        {tab === "lista"      && <ListaCompras />}
        {tab === "financeiro" && <Financeiro />}
        {tab === "auditoria"  && <Auditoria />}
        {tab === "usuarios"   && <Usuarios />}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Router />
    </AppProvider>
  );
}
