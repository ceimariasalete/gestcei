import { AppProvider, useApp } from "./context/AppContext";
import Navbar from "./components/Navbar";
import LoginPage from "./components/LoginPage";
import Estoque from "./components/pages/Estoque";
import Pedagogico from "./components/pages/Pedagogico";
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
    <div style={{ minHeight: "100vh", background: "#f4f4f2" }}>
      <Navbar />
      {tab === "cozinha"    && <Estoque tipo="cozinha" />}
      {tab === "limpeza"    && <Estoque tipo="limpeza" />}
      {tab === "pedagogico" && <Pedagogico />}
      {tab === "lista"      && <ListaCompras />}
      {tab === "financeiro" && <Financeiro />}
      {tab === "auditoria"  && <Auditoria />}
      {tab === "usuarios"   && <Usuarios />}
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
