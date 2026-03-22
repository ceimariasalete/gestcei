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
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        const { data: usr } = await supabase
          .from("usuarios")
          .select("*")
          .eq("email", data.session.user.email)
          .single();
        if (usr && usr.ativo) {
          handleLogin(usr);
        }
      }
      setLoading(false);
    });
  }, []);

  return (
    <AppContext.Provider value={{ usuario, setUsuario, tab, setTab, perms, loading, handleLogin, handleLogout, supabase }}>
      {children}
    </AppContext.Provider>
  );
}
