import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useApp } from "../context/AppContext";
import { Btn, Input, AlertBar } from "./ui";

export default function LoginPage() {
  const { handleLogin } = useApp();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setErro("");
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
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
    setLoading(false);
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

        <Input
          label="E-mail"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="seu@email.com"
        />
        <Input
          label="Senha"
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          placeholder="••••••••"
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        />

        <Btn
          variant="primary"
          onClick={handleSubmit}
          disabled={loading}
          style={{ width: "100%", padding: "10px", marginTop: 4 }}
        >
          {loading ? "Entrando..." : "Entrar"}
        </Btn>

        <div style={{ marginTop: 16, fontSize: 11, color: "#aaa", textAlign: "center" }}>
          Problemas de acesso? Fale com o administrador.
        </div>
      </div>
    </div>
  );
}
