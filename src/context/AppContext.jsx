import { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { PERMS_PADRAO, TODAS_ABAS } from "../lib/helpers";

const AppContext = createContext(null);

export function useApp() {
  return useContext(AppContext);
}

export function AppProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [tab, setTab] = useState("cozinha");
  const [perms, setPerms] = useState({});
  const [loading, setLoading] = useState(true);

  function resolverPerms(usr) {
    return usr.permissoes || PERMS_PADRAO[usr.perfil] || {};
  }

  function primeiraAba(p) {
    return TODAS_ABAS.find((a) => p[a.key])?.key || "cozinha";
  }

  function handleLogin(usr) {
    const p = resolverPerms(usr);
    setUsuario(usr);
    setPerms(p);
    setTab(primeiraAba(p));
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setUsuario(null);
    setPerms({});
  }

  useEffect(() => {
    async function initSession() {
      try {
        // Limite de 4 segundos para tentar carregar a sessão salva
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout inicial da sessão")), 4000)
        );

        const { data } = await Promise.race([
          supabase.auth.getSession(),
          timeoutPromise
        ]);

        if (data?.session) {
          const { data: usr } = await supabase
            .from("usuarios")
            .select("*")
            .eq("email", data.session.user.email)
            .single();

          if (usr && usr.ativo) {
            handleLogin(usr);
          }
        }
      } catch (err) {
        // Se der timeout ou erro de rede, apenas engolimos o erro,
        // garantindo que a tela de login abra (não fica travado no "Carregando...")
        console.warn("Nao foi possivel restaurar a sessao:", err.message);
      } finally {
        setLoading(false);
      }
    }
    
    initSession();
  }, []);

  return (
    <AppContext.Provider value={{ usuario, setUsuario, tab, setTab, perms, loading, handleLogin, handleLogout, supabase }}>
      {children}
    </AppContext.Provider>
  );
}
