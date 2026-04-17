import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useApp } from "../context/AppContext";
import { Btn, Input, AlertBar } from "./ui";

export default function LoginPage() {
  const { handleLogin } = useApp();
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    if (e) e.preventDefault();
    setErro("");
    setLoading(true);

    const formData = new FormData(e.target);
    const email = formData.get("email");
    const senha = formData.get("senha");

    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("fetch_timeout")), 8000)
      );

      const loginResult = await Promise.race([
        supabase.auth.signInWithPassword({ email, password: senha }),
        timeoutPromise
      ]);

      const { error } = loginResult;

      if (error) {
        setErro("E-mail ou senha incorretos.");
        setLoading(false);
        return;
      }

      const { data: usr } = await supabase
        .from("usuarios")
        .select("*")
        .eq("email", email)
        .single();

      if (!usr || !usr.ativo) {
        setErro("Usuario inativo ou nao cadastrado. Contate o administrador.");
        setLoading(false);
        return;
      }

      handleLogin(usr);
    } catch (err) {
      if (err.message === "fetch_timeout" || err.message?.includes("fetch") || err.name === "TypeError") {
        setErro("Erro de conexão com o servidor. A rede local, Wi-Fi ou DNS estão bloqueando o banco de dados.");
      } else {
        setErro("Erro inesperado ao entrar. Tente novamente.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f4f4f2",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 14,
          padding: "2.5rem 2rem",
          width: 360,
          border: "0.5px solid #e0e0e0",
          boxSizing: "border-box",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "1.8rem" }}>
          <div style={{ fontSize: 26, fontWeight: 600, color: "#1D9E75", letterSpacing: -0.5 }}>
            GestCEI
          </div>
          <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>
            Gestao de estoque e financeiro
          </div>
        </div>

        {erro && <AlertBar type="danger">{erro}</AlertBar>}

        <form onSubmit={handleSubmit}>
          <Input
            id="email"
            name="email"
            label="E-mail"
            type="email"
            placeholder="seu@email.com"
            required
            disabled={loading}
          />
          <Input
            id="senha"
            name="senha"
            label="Senha"
            type="password"
            placeholder="••••••••"
            required
            disabled={loading}
          />

          <Btn
            type="submit"
            variant="primary"
            disabled={loading}
            style={{ width: "100%", padding: "10px", marginTop: 4 }}
          >
            {loading ? "Entrando..." : "Entrar"}
          </Btn>
        </form>

        <div style={{ marginTop: 16, fontSize: 11, color: "#aaa", textAlign: "center" }}>
          Problemas de acesso? Fale com o administrador.
        </div>
      </div>
    </div>
  );
}

