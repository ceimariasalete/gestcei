import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../../lib/supabase";
import { useApp } from "../../context/AppContext";
import { useAuditoria } from "../../hooks/useAuditoria";
import { fmt, fmtMoeda } from "../../lib/helpers";
import {
  Btn, Input, SelectField, Modal, ConfirmModal,
  MetricCard, AlertBar, Msg, PageHeader, Table, EmptyRow,
} from "../ui";

// ── Utilitários ────────────────────────────────────────────────
const hoje = () => new Date().toISOString().split("T")[0];
const mesAtual = () => {
  const d = new Date();
  return {
    inicio: new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split("T")[0],
    fim:    new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split("T")[0],
  };
};

// ── Categorização automática por palavras-chave ────────────────
function categorizarTexto(descricao, regrasIA) {
  if (!descricao) return null;
  const texto = descricao.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // Tenta regras aprendidas primeiro (maior prioridade)
  for (const regra of regrasIA) {
    if (texto.includes(regra.chave)) return regra.categoria_id;
  }
  return null;
}

// ── Cores dos gráficos por categoria ──────────────────────────
const CORES = [
  "#E74C3C","#E67E22","#F39C12","#1D9E75","#2980B9",
  "#8E44AD","#16A085","#2C3E50","#C0392B","#27AE60",
  "#D35400","#7F8C8D","#1ABC9C","#922B21","#F1C40F",
];

// ── Componente gráfico de pizza simples (SVG) ─────────────────
function GraficoPizza({ dados, titulo }) {
  const total = dados.reduce((s, d) => s + d.valor, 0);
  if (total === 0) return <div style={{ textAlign: "center", color: "#aaa", fontSize: 13, padding: "2rem" }}>Sem dados</div>;
  let acumAngle = 0;
  const slices = dados.map((d, i) => {
    const pct = d.valor / total;
    const start = acumAngle;
    acumAngle += pct * 360;
    return { ...d, pct, start, cor: CORES[i % CORES.length] };
  });
  function arc(cx, cy, r, startDeg, endDeg) {
    const s = (startDeg * Math.PI) / 180;
    const e = (endDeg   * Math.PI) / 180;
    const x1 = cx + r * Math.cos(s - Math.PI / 2);
    const y1 = cy + r * Math.sin(s - Math.PI / 2);
    const x2 = cx + r * Math.cos(e - Math.PI / 2);
    const y2 = cy + r * Math.sin(e - Math.PI / 2);
    const large = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
  }
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{titulo}</div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
        <svg viewBox="0 0 120 120" width={120} height={120} style={{ flexShrink: 0 }}>
          {slices.map((s, i) => (
            <path key={i} d={arc(60, 60, 55, s.start, s.start + s.pct * 360)} fill={s.cor} stroke="#fff" strokeWidth="1" />
          ))}
        </svg>
        <div style={{ flex: 1, minWidth: 0 }}>
          {slices.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, fontSize: 12 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: s.cor, flexShrink: 0 }} />
              <span style={{ flex: 1, color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.nome}</span>
              <span style={{ fontWeight: 500, color: "#333" }}>{Math.round(s.pct * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Gráfico de barras simples ─────────────────────────────────
function GraficoBarras({ dados, titulo, corPos = "#1D9E75", corNeg = "#E74C3C" }) {
  const max = Math.max(...dados.map(d => Math.max(d.receitas || 0, d.despesas || 0)), 1);
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{titulo}</div>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", height: 100, overflowX: "auto" }}>
        {dados.map((d, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 40 }}>
            <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 80 }}>
              {d.receitas !== undefined && (
                <div style={{ width: 14, height: `${(d.receitas / max) * 80}px`, background: corPos, borderRadius: "3px 3px 0 0", minHeight: 2 }} title={fmtMoeda(d.receitas)} />
              )}
              {d.despesas !== undefined && (
                <div style={{ width: 14, height: `${(d.despesas / max) * 80}px`, background: corNeg, borderRadius: "3px 3px 0 0", minHeight: 2 }} title={fmtMoeda(d.despesas)} />
              )}
            </div>
            <span style={{ fontSize: 10, color: "#888", whiteSpace: "nowrap" }}>{d.label}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
        <span style={{ fontSize: 11, color: "#555", display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 10, height: 10, background: corPos, borderRadius: 2 }} /> Receitas
        </span>
        <span style={{ fontSize: 11, color: "#555", display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 10, height: 10, background: corNeg, borderRadius: 2 }} /> Despesas
        </span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════
export default function Financeiro() {
  const { usuario } = useApp();
  const { log } = useAuditoria(usuario);

  // ── Estado global ─────────────────────────────────────────
  const [aba, setAba] = useState("dashboard");
  const [periodo, setPeriodo] = useState(mesAtual());
  const [msg, setMsg]         = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmData, setConfirmData] = useState(null);

  // ── Dados do banco ────────────────────────────────────────
  const [receitas, setReceitas]       = useState([]);
  const [despesas, setDespesas]       = useState([]);
  const [categorias, setCategorias]   = useState([]);
  const [contas, setContas]           = useState([]);
  const [recorrencias, setRecorrencias] = useState([]);
  const [regrasIA, setRegrasIA]       = useState([]);

  // ── Formulários ───────────────────────────────────────────
  const [modal, setModal]   = useState(null); // "receita"|"despesa"|"recorrencia"|"conta"
  const [editItem, setEditItem] = useState(null);

  const formRecDefault = { descricao: "", valor: "", data: hoje(), tipo: "mensalidade", conta_id: "", referencia: "", observacao: "" };
  const formDespDefault = { descricao: "", valor: "", data: hoje(), tipo: "variavel", conta_id: "", categoria_id: "", observacao: "" };
  const formRecorrDefault = { descricao: "", valor: "", dia_vencimento: 5, categoria_id: "", conta_id: "" };

  const [formRec,  setFormRec]  = useState(formRecDefault);
  const [formDesp, setFormDesp] = useState(formDespDefault);
  const [formRecorr, setFormRecorr] = useState(formRecorrDefault);

  // ── Calculadora ───────────────────────────────────────────
  const [calc, setCalc] = useState({ alunos: 80, custos: 0, margem: 15, horas: 8, ocupacao: 100 });

  const showMsg = (m) => { setMsg(m); setTimeout(() => setMsg(""), 4000); };

  // ── Carregar dados ────────────────────────────────────────
  const carregar = useCallback(async () => {
    const [
      { data: recs },
      { data: desps },
      { data: cats },
      { data: conts },
      { data: recorrs },
      { data: regras },
    ] = await Promise.all([
      supabase.from("fin_receitas").select("*, fin_categorias(nome,cor)").gte("data", periodo.inicio).lte("data", periodo.fim).order("data", { ascending: false }),
      supabase.from("fin_despesas").select("*, fin_categorias(nome,cor)").gte("data", periodo.inicio).lte("data", periodo.fim).order("data", { ascending: false }),
      supabase.from("fin_categorias").select("*").eq("ativo", true).order("nome"),
      supabase.from("fin_contas").select("*").eq("ativo", true),
      supabase.from("fin_recorrencias").select("*, fin_categorias(nome)").eq("ativo", true),
      supabase.from("fin_regras_ia").select("*, fin_categorias(id,nome)").order("usos", { ascending: false }),
    ]);
    setReceitas(recs || []);
    setDespesas(desps || []);
    setCategorias(cats || []);
    setContas(conts || []);
    setRecorrencias(recorrs || []);
    setRegrasIA((regras || []).map(r => ({ ...r, categoria_id: r.fin_categorias?.id })));
    // Atualizar custos da calculadora com total de despesas do período
    const totalDesp = (desps || []).reduce((s, d) => s + Number(d.valor), 0);
    setCalc(c => ({ ...c, custos: totalDesp }));
  }, [periodo.inicio, periodo.fim]);

  useEffect(() => { carregar(); }, [carregar]);

  // Gerar recorrências ao abrir
  useEffect(() => {
    // Corrigido: rpc() retorna um PostgrestFilterBuilder que é thenable/awaitable
    supabase.rpc("gerar_recorrencias_mes").then(({ error }) => {
      if (error) console.error("Erro ao gerar recorrências:", error);
    });
  }, []);

  // ── Cálculos derivados ────────────────────────────────────
  const totalReceitas = useMemo(() => receitas.filter(r => !r.is_saldo_inicial).reduce((s, r) => s + Number(r.valor), 0), [receitas]);
  const totalDespesas = useMemo(() => despesas.reduce((s, d) => s + Number(d.valor), 0), [despesas]);
  const saldoInicial  = useMemo(() => {
    const si = receitas.find(r => r.is_saldo_inicial);
    return si ? Number(si.valor) : 0;
  }, [receitas]);
  const resultado = totalReceitas - totalDespesas;

  const despPorCat = useMemo(() => {
    const map = {};
    despesas.forEach(d => {
      const nome = d.fin_categorias?.nome || "Sem categoria";
      map[nome] = (map[nome] || 0) + Number(d.valor);
    });
    return Object.entries(map).map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor);
  }, [despesas]);

  // ── Calculadora de mensalidade ────────────────────────────
  const calcResult = useMemo(() => {
    const { alunos, custos, margem, horas, ocupacao } = calc;
    const alunosEfetivos = alunos * (ocupacao / 100);
    const custoAluno     = alunosEfetivos > 0 ? custos / alunosEfetivos : 0;
    // Proporcional às horas (base: 8h = integral)
    const fatorHora      = horas / 8;
    const custoHora      = custoAluno * fatorHora;
    const mensalidadeIdeal = custoHora * (1 + margem / 100);
    const faturamentoNec   = mensalidadeIdeal * alunosEfetivos;
    const lucroEstimado    = faturamentoNec - custos;
    return { custoAluno: custoHora, mensalidadeIdeal, faturamentoNec, lucroEstimado };
  }, [calc]);

  // ── Salvar receita ────────────────────────────────────────
  async function salvarReceita() {
    const { descricao, valor, data, tipo, conta_id, referencia, observacao } = formRec;
    if (!descricao || !valor || !data) return showMsg("Preencha os campos obrigatórios.");
    if (Number(valor) <= 0) return showMsg("Valor deve ser positivo.");
    setLoading(true);
    // Auto-categorizar
    const catId = categorizarTexto(descricao, regrasIA) ||
      categorias.find(c => c.tipo === "receita")?.id;
    const payload = {
      descricao, valor: parseFloat(valor), data,
      tipo, conta_id: conta_id || null,
      categoria_id: catId || null,
      referencia: referencia || null,
      observacao: observacao || null,
      usuario_id: usuario.id, usuario_nome: usuario.nome,
    };
    if (editItem) {
      const { error } = await supabase.from("fin_receitas").update(payload).eq("id", editItem.id);
      if (error) { showMsg("Erro: " + (error.code === "23505" ? "Receita duplicada!" : error.message)); setLoading(false); return; }
      await log("fin_receitas", "UPDATE", editItem.id, `Editou receita "${descricao}"`, editItem, payload);
    } else {
      const { error } = await supabase.from("fin_receitas").insert(payload);
      if (error) { showMsg("Erro: " + (error.code === "23505" ? "Receita duplicada!" : error.message)); setLoading(false); return; }
      // Aprender regra
      await aprenderRegra(descricao, catId);
      await log("fin_receitas", "INSERT", null, `Lançou receita "${descricao}" — ${fmtMoeda(valor)}`, null, payload);
    }
    setModal(null); setLoading(false); carregar();
    showMsg(editItem ? "Receita atualizada!" : "Receita lançada!");
  }

  // ── Salvar despesa ────────────────────────────────────────
  async function salvarDespesa() {
    const { descricao, valor, data, tipo, conta_id, categoria_id, observacao } = formDesp;
    if (!descricao || !valor || !data) return showMsg("Preencha os campos obrigatórios.");
    if (Number(valor) <= 0) return showMsg("Valor deve ser positivo.");
    setLoading(true);
    // Auto-categorizar se não selecionou
    const catId = categoria_id || categorizarTexto(descricao, regrasIA) ||
      categorias.find(c => c.tipo === "despesa")?.id;
    const payload = {
      descricao, valor: parseFloat(valor), data,
      tipo, conta_id: conta_id || null,
      categoria_id: catId || null,
      observacao: observacao || null,
      usuario_id: usuario.id, usuario_nome: usuario.nome,
    };
    if (editItem) {
      const { error } = await supabase.from("fin_despesas").update(payload).eq("id", editItem.id);
      if (error) { showMsg("Erro: " + (error.code === "23505" ? "Despesa duplicada!" : error.message)); setLoading(false); return; }
    } else {
      const { error } = await supabase.from("fin_despesas").insert(payload);
      if (error) { showMsg("Erro: " + (error.code === "23505" ? "Despesa duplicada!" : error.message)); setLoading(false); return; }
      await aprenderRegra(descricao, catId);
    }
    await log("fin_despesas", editItem ? "UPDATE" : "INSERT", editItem?.id || null, `${editItem ? "Editou" : "Lançou"} despesa "${descricao}"`, editItem, payload);
    setModal(null); setLoading(false); carregar();
    showMsg(editItem ? "Despesa atualizada!" : "Despesa lançada!");
  }

  // ── Aprender regra de categorização ──────────────────────
  async function aprenderRegra(descricao, catId) {
    if (!catId || !descricao) return;
    const palavras = descricao.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/\s+/).filter(p => p.length >= 4);
    for (const palavra of palavras.slice(0, 3)) {
      await supabase.from("fin_regras_ia").upsert(
        { chave: palavra, categoria_id: catId, usos: 1 },
        { onConflict: "chave", ignoreDuplicates: false }
      ).then(async () => {
        // Corrigido: rpc() não deve ser usado dentro de update() como valor.
        // O objetivo parece ser incrementar 'usos'. No Supabase/PostgREST usa-se rpc para lógica complexa
        // ou uma query direta se for apenas incremento. Como o código original tentava algo inválido,
        // vamos substituir por uma lógica funcional de incremento se possível, ou apenas remover o erro.
        // Para incrementar no Supabase:
        const { data: current } = await supabase.from("fin_regras_ia").select("usos").eq("chave", palavra).single();
        const novosUsos = (current?.usos || 0) + 1;
        await supabase.from("fin_regras_ia").update({ usos: novosUsos }).eq("chave", palavra);
      }).catch((err) => console.error("Erro ao aprender regra:", err));
    }
  }

  // ── Excluir ───────────────────────────────────────────────
  async function excluir(tabela, item) {
    setConfirmData(null);
    await supabase.from(tabela).delete().eq("id", item.id);
    await log(tabela, "DELETE", item.id, `Excluiu "${item.descricao}"`, item, null);
    carregar(); showMsg("Excluído.");
  }

  // ── Salvar recorrência ────────────────────────────────────
  async function salvarRecorrencia() {
    if (!formRecorr.descricao || !formRecorr.valor) return;
    await supabase.from("fin_recorrencias").insert({
      ...formRecorr, valor: parseFloat(formRecorr.valor),
    });
    setModal(null); carregar(); showMsg("Recorrência criada!");
  }

  // ── Helpers de período ────────────────────────────────────
  function mudarMes(delta) {
    const d = new Date(periodo.inicio + "T12:00:00");
    d.setMonth(d.getMonth() + delta);
    setPeriodo({
      inicio: new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split("T")[0],
      fim:    new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split("T")[0],
    });
  }

  const labelPeriodo = new Date(periodo.inicio + "T12:00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  // ── Sub-abas ──────────────────────────────────────────────
  const abas = [
    { key: "dashboard",    label: "Dashboard"     },
    { key: "receitas",     label: "Receitas"      },
    { key: "despesas",     label: "Despesas"      },
    { key: "calculadora",  label: "Calculadora"   },
    { key: "recorrencias", label: "Recorrências"  },
    { key: "contas",       label: "Contas"        },
  ];

  const S = { // estilos reutilizáveis
    card: { background: "#fff", border: "0.5px solid #e0e0e0", borderRadius: 12, padding: "1.25rem" },
    grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
    label: { fontSize: 11, color: "#888", marginBottom: 2 },
    val: { fontSize: 20, fontWeight: 600 },
  };

  return (
    <div style={{ padding: "clamp(0.75rem,3vw,1.5rem)", maxWidth: 1200, margin: "0 auto" }}>
      {confirmData && <ConfirmModal {...confirmData} onCancel={() => setConfirmData(null)} />}

      <PageHeader title="Financeiro" subtitle="Controle completo de receitas e despesas">
        <button onClick={() => mudarMes(-1)} style={{ padding: "6px 10px", border: "0.5px solid #ccc", borderRadius: 7, background: "#fff", cursor: "pointer", fontSize: 13 }}>‹</button>
        <span style={{ fontSize: 13, fontWeight: 500, color: "#333", textTransform: "capitalize", minWidth: 140, textAlign: "center" }}>{labelPeriodo}</span>
        <button onClick={() => mudarMes(1)} style={{ padding: "6px 10px", border: "0.5px solid #ccc", borderRadius: 7, background: "#fff", cursor: "pointer", fontSize: 13 }}>›</button>
        <Btn variant="primary" onClick={() => { setFormRec(formRecDefault); setEditItem(null); setModal("receita"); }}>+ Receita</Btn>
        <Btn variant="danger" onClick={() => { setFormDesp(formDespDefault); setEditItem(null); setModal("despesa"); }}>+ Despesa</Btn>
      </PageHeader>

      <Msg text={msg} />

      {/* Sub-abas */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "0.5px solid #e0e0e0", paddingBottom: 10, flexWrap: "wrap" }}>
        {abas.map(a => (
          <button key={a.key} onClick={() => setAba(a.key)} style={{
            padding: "6px 14px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 13,
            background: aba === a.key ? "#1D9E75" : "transparent",
            color: aba === a.key ? "#fff" : "#555", fontWeight: aba === a.key ? 500 : 400,
          }}>{a.label}</button>
        ))}
      </div>

      {/* ══════════ DASHBOARD ══════════ */}
      {aba === "dashboard" && (
        <div>
          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginBottom: 20 }}>
            {[
              { label: "Saldo inicial",   val: saldoInicial, cor: "#2980B9" },
              { label: "Total receitas",  val: totalReceitas, cor: "#1D9E75" },
              { label: "Total despesas",  val: totalDespesas, cor: "#E74C3C" },
              { label: "Resultado",       val: resultado, cor: resultado >= 0 ? "#1D9E75" : "#E74C3C" },
            ].map(k => (
              <div key={k.label} style={{ ...S.card }}>
                <div style={S.label}>{k.label}</div>
                <div style={{ ...S.val, color: k.cor }}>{fmtMoeda(k.val)}</div>
              </div>
            ))}
          </div>

          {/* Gráficos */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div style={S.card}>
              <GraficoPizza dados={despPorCat} titulo="Despesas por categoria" />
            </div>
            <div style={S.card}>
              <GraficoBarras
                titulo="Receitas vs Despesas"
                dados={[{ label: labelPeriodo.split(" ")[0].slice(0,3), receitas: totalReceitas, despesas: totalDespesas }]}
              />
            </div>
          </div>

          {/* Últimas movimentações */}
          <div style={S.card}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Últimas movimentações</div>
            {[...receitas.filter(r => !r.is_saldo_inicial).slice(0, 5).map(r => ({ ...r, _tipo: "receita" })),
               ...despesas.slice(0, 5).map(d => ({ ...d, _tipo: "despesa" }))
             ].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 8).map(l => (
              <div key={l.id} style={{ display: "flex", gap: 10, padding: "7px 0", borderBottom: "0.5px solid #f0f0f0", fontSize: 13, alignItems: "center" }}>
                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: l._tipo === "receita" ? "#E1F5EE" : "#FCEBEB", color: l._tipo === "receita" ? "#085041" : "#791F1F" }}>
                  {l._tipo}
                </span>
                <span style={{ flex: 1, color: "#444" }}>{l.descricao}</span>
                <span style={{ fontSize: 11, color: "#aaa" }}>{fmt(l.data)}</span>
                <span style={{ fontWeight: 600, color: l._tipo === "receita" ? "#1D9E75" : "#E74C3C" }}>
                  {l._tipo === "receita" ? "+" : "-"}{fmtMoeda(l.valor)}
                </span>
              </div>
            ))}
            {receitas.length === 0 && despesas.length === 0 && (
              <div style={{ color: "#aaa", fontSize: 13, textAlign: "center", padding: "1rem" }}>Nenhuma movimentação no período.</div>
            )}
          </div>
        </div>
      )}

      {/* ══════════ RECEITAS ══════════ */}
      {aba === "receitas" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <Btn variant="primary" onClick={() => { setFormRec(formRecDefault); setEditItem(null); setModal("receita"); }}>+ Nova receita</Btn>
          </div>
          <Table headers={["Data", "Descrição", "Tipo", "Categoria", "Conta", "Valor", ""]}>
            {receitas.map(r => (
              <tr key={r.id} style={{ borderBottom: "0.5px solid #f0f0f0" }}>
                <td style={{ padding: "10px 14px", fontSize: 12, color: "#888" }}>{fmt(r.data)}</td>
                <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 500 }}>
                  {r.descricao}
                  {r.is_saldo_inicial && <span style={{ marginLeft: 6, fontSize: 10, background: "#E6F1FB", color: "#185FA5", padding: "1px 6px", borderRadius: 10 }}>saldo inicial</span>}
                  {r.referencia && <div style={{ fontSize: 11, color: "#aaa" }}>Ref: {r.referencia}</div>}
                </td>
                <td style={{ padding: "10px 14px", fontSize: 12, color: "#555" }}>{r.tipo}</td>
                <td style={{ padding: "10px 14px", fontSize: 12 }}>
                  {r.fin_categorias ? (
                    <span style={{ background: r.fin_categorias.cor + "22", color: r.fin_categorias.cor, padding: "2px 8px", borderRadius: 10, fontSize: 11 }}>
                      {r.fin_categorias.nome}
                    </span>
                  ) : "—"}
                </td>
                <td style={{ padding: "10px 14px", fontSize: 12, color: "#555" }}>
                  {contas.find(c => c.id === r.conta_id)?.nome || "—"}
                </td>
                <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 600, color: "#1D9E75" }}>
                  +{fmtMoeda(r.valor)}
                </td>
                <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                  <Btn small onClick={() => { setFormRec({ ...r, valor: String(r.valor) }); setEditItem(r); setModal("receita"); }} style={{ marginRight: 4 }}>Editar</Btn>
                  <Btn small variant="danger" onClick={() => setConfirmData({ title: "Excluir receita", message: `Excluir "${r.descricao}"?`, onConfirm: () => excluir("fin_receitas", r) })}>Excluir</Btn>
                </td>
              </tr>
            ))}
            {receitas.length === 0 && <EmptyRow colSpan={7} message="Nenhuma receita no período." />}
          </Table>
        </div>
      )}

      {/* ══════════ DESPESAS ══════════ */}
      {aba === "despesas" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
            <div style={{ display: "flex", gap: 12 }}>
              {despPorCat.slice(0, 3).map(d => (
                <div key={d.nome} style={{ fontSize: 12, color: "#555" }}>
                  <span style={{ fontWeight: 600 }}>{d.nome}:</span> {fmtMoeda(d.valor)}
                </div>
              ))}
            </div>
            <Btn variant="danger" onClick={() => { setFormDesp(formDespDefault); setEditItem(null); setModal("despesa"); }}>+ Nova despesa</Btn>
          </div>
          <Table headers={["Data", "Descrição", "Categoria", "Tipo", "Conta", "Valor", ""]}>
            {despesas.map(d => (
              <tr key={d.id} style={{ borderBottom: "0.5px solid #f0f0f0" }}>
                <td style={{ padding: "10px 14px", fontSize: 12, color: "#888" }}>{fmt(d.data)}</td>
                <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 500 }}>
                  {d.descricao}
                  {d.recorrencia_id && <span style={{ marginLeft: 6, fontSize: 10, background: "#FAEEDA", color: "#633806", padding: "1px 6px", borderRadius: 10 }}>recorrente</span>}
                </td>
                <td style={{ padding: "10px 14px", fontSize: 12 }}>
                  {d.fin_categorias ? (
                    <span style={{ background: d.fin_categorias.cor + "22", color: d.fin_categorias.cor, padding: "2px 8px", borderRadius: 10, fontSize: 11 }}>
                      {d.fin_categorias.nome}
                    </span>
                  ) : <span style={{ fontSize: 12, color: "#aaa" }}>—</span>}
                </td>
                <td style={{ padding: "10px 14px", fontSize: 12 }}>
                  <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 11, background: d.tipo === "fixa" ? "#E6F1FB" : "#f5f5f3", color: d.tipo === "fixa" ? "#185FA5" : "#555" }}>
                    {d.tipo}
                  </span>
                </td>
                <td style={{ padding: "10px 14px", fontSize: 12, color: "#555" }}>
                  {contas.find(c => c.id === d.conta_id)?.nome || "—"}
                </td>
                <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 600, color: "#E74C3C" }}>
                  -{fmtMoeda(d.valor)}
                </td>
                <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                  <Btn small onClick={() => { setFormDesp({ ...d, valor: String(d.valor), categoria_id: String(d.categoria_id || "") }); setEditItem(d); setModal("despesa"); }} style={{ marginRight: 4 }}>Editar</Btn>
                  <Btn small variant="danger" onClick={() => setConfirmData({ title: "Excluir despesa", message: `Excluir "${d.descricao}"?`, onConfirm: () => excluir("fin_despesas", d) })}>Excluir</Btn>
                </td>
              </tr>
            ))}
            {despesas.length === 0 && <EmptyRow colSpan={7} message="Nenhuma despesa no período." />}
          </Table>
        </div>
      )}

      {/* ══════════ CALCULADORA ══════════ */}
      {aba === "calculadora" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {/* Inputs */}
          <div style={S.card}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>🧮 Parâmetros</div>
            {[
              { key: "alunos",   label: "Total de alunos",          min: 1,  max: 500, step: 1  },
              { key: "custos",   label: "Custos mensais totais (R$)", min: 0,  max: 999999, step: 100 },
              { key: "margem",   label: "Margem desejada (%)",       min: 0,  max: 100, step: 1  },
              { key: "horas",    label: "Horas/dia do aluno",        min: 1,  max: 12, step: 0.5 },
              { key: "ocupacao", label: "Taxa de ocupação (%)",      min: 10, max: 100, step: 5  },
            ].map(({ key, label, min, max, step }) => (
              <div key={key} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>{label}</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="range" min={min} max={max} step={step} value={calc[key]}
                    onChange={e => setCalc(c => ({ ...c, [key]: Number(e.target.value) }))}
                    style={{ flex: 1, accentColor: "#1D9E75" }} />
                  <input type="number" value={calc[key]} min={min} max={max} step={step}
                    onChange={e => setCalc(c => ({ ...c, [key]: Number(e.target.value) }))}
                    style={{ width: 80, padding: "5px 8px", borderRadius: 6, border: "0.5px solid #ccc", fontSize: 13, fontFamily: "inherit" }} />
                </div>
                {key === "horas" && (
                  <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>
                    {calc.horas <= 4 ? "Meio período" : calc.horas <= 6 ? "Período estendido" : "Integral"}
                  </div>
                )}
              </div>
            ))}
            <div style={{ fontSize: 12, color: "#888", background: "#f7f7f5", borderRadius: 8, padding: 10, marginTop: 8 }}>
              Alunos efetivos: <strong>{Math.round(calc.alunos * calc.ocupacao / 100)}</strong> ({calc.ocupacao}% de {calc.alunos})
            </div>
          </div>

          {/* Resultados */}
          <div>
            <div style={{ ...S.card, background: "#1D9E75", color: "#fff", marginBottom: 12, textAlign: "center" }}>
              <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>Mensalidade ideal ({calc.horas}h/dia)</div>
              <div style={{ fontSize: 36, fontWeight: 700 }}>{fmtMoeda(calcResult.mensalidadeIdeal)}</div>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>por aluno / mês</div>
            </div>
            {[
              { label: "Custo real por aluno",   val: calcResult.custoAluno,    cor: "#E74C3C" },
              { label: "Faturamento necessário",  val: calcResult.faturamentoNec, cor: "#2980B9" },
              { label: "Lucro estimado",          val: calcResult.lucroEstimado, cor: calcResult.lucroEstimado >= 0 ? "#1D9E75" : "#E74C3C" },
            ].map(k => (
              <div key={k.label} style={{ ...S.card, marginBottom: 10 }}>
                <div style={{ fontSize: 12, color: "#888" }}>{k.label}</div>
                <div style={{ fontSize: 22, fontWeight: 600, color: k.cor }}>{fmtMoeda(k.val)}</div>
              </div>
            ))}
            {/* Tabela por turno */}
            <div style={S.card}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Simulação por turno</div>
              {[["Meio período", 4], ["Período estendido", 6], ["Integral", 8], ["Integral Plus", 10]].map(([turno, h]) => {
                const { alunos, custos, margem, ocupacao } = calc;
                const ef = alunos * (ocupacao / 100);
                const ch = ef > 0 ? custos / ef / 8 : 0;
                const val = ch * h * (1 + margem / 100);
                return (
                  <div key={turno} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "0.5px solid #f5f5f5", fontSize: 13, background: h === calc.horas ? "#f0faf6" : "transparent", borderRadius: 4, paddingInline: 4 }}>
                    <span style={{ color: "#555" }}>{turno} <span style={{ color: "#aaa", fontSize: 11 }}>({h}h)</span></span>
                    <span style={{ fontWeight: 600, color: "#1D9E75" }}>{fmtMoeda(val)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ══════════ RECORRÊNCIAS ══════════ */}
      {aba === "recorrencias" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 13, color: "#888" }}>Despesas fixas geradas automaticamente todo mês</div>
            <Btn variant="primary" onClick={() => { setFormRecorr(formRecorrDefault); setModal("recorrencia"); }}>+ Nova recorrência</Btn>
          </div>
          <Table headers={["Descrição", "Categoria", "Valor", "Vencimento", "Última geração", ""]}>
            {recorrencias.map(r => (
              <tr key={r.id} style={{ borderBottom: "0.5px solid #f0f0f0" }}>
                <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 500 }}>{r.descricao}</td>
                <td style={{ padding: "10px 14px", fontSize: 12 }}>{r.fin_categorias?.nome || "—"}</td>
                <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 600, color: "#E74C3C" }}>{fmtMoeda(r.valor)}</td>
                <td style={{ padding: "10px 14px", fontSize: 12, color: "#555" }}>Dia {r.dia_vencimento}</td>
                <td style={{ padding: "10px 14px", fontSize: 12, color: "#aaa" }}>{r.ultima_geracao ? fmt(r.ultima_geracao) : "Nunca"}</td>
                <td style={{ padding: "10px 14px" }}>
                  <Btn small variant="danger" onClick={() => setConfirmData({ title: "Excluir recorrência", message: `Excluir "${r.descricao}"?`, onConfirm: () => excluir("fin_recorrencias", r) })}>Excluir</Btn>
                </td>
              </tr>
            ))}
            {recorrencias.length === 0 && <EmptyRow colSpan={6} message="Nenhuma recorrência." />}
          </Table>
        </div>
      )}

      {/* ══════════ CONTAS ══════════ */}
      {aba === "contas" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 16 }}>
          {contas.map(c => {
            const entradas = receitas.filter(r => r.conta_id === c.id).reduce((s, r) => s + Number(r.valor), 0);
            const saidas   = despesas.filter(d => d.conta_id === c.id).reduce((s, d) => s + Number(d.valor), 0);
            const saldo    = c.saldo_inicial + entradas - saidas;
            return (
              <div key={c.id} style={{ ...S.card, borderLeft: `4px solid ${saldo >= 0 ? "#1D9E75" : "#E74C3C"}` }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
                  {{banco: "🏦", caixa: "💵", pix: "📲", investimento: "📈"}[c.tipo]} {c.nome}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                  <div><div style={S.label}>Entradas</div><div style={{ fontSize: 15, color: "#1D9E75", fontWeight: 600 }}>{fmtMoeda(entradas)}</div></div>
                  <div><div style={S.label}>Saídas</div><div style={{ fontSize: 15, color: "#E74C3C", fontWeight: 600 }}>{fmtMoeda(saidas)}</div></div>
                </div>
                <div style={{ borderTop: "0.5px solid #f0f0f0", paddingTop: 10 }}>
                  <div style={S.label}>Saldo atual</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: saldo >= 0 ? "#1D9E75" : "#E74C3C" }}>{fmtMoeda(saldo)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ══════════ MODAIS ══════════ */}

      {/* Modal Receita */}
      {modal === "receita" && (
        <Modal title={editItem ? "Editar receita" : "Nova receita"} onClose={() => setModal(null)}>
          {/* Saldo inicial */}
          {!editItem && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: formRec.is_saldo_inicial ? "#E1F5EE" : "#f7f7f5", borderRadius: 8, marginBottom: 12, cursor: "pointer", border: formRec.is_saldo_inicial ? "1px solid #1D9E75" : "1px solid transparent" }}>
              <input type="checkbox" checked={!!formRec.is_saldo_inicial}
                onChange={e => setFormRec(f => ({ ...f, is_saldo_inicial: e.target.checked, descricao: e.target.checked ? "Saldo inicial" : "", tipo: "outros" }))}
                style={{ accentColor: "#1D9E75" }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>💰 Saldo inicial</div>
                <div style={{ fontSize: 11, color: "#666" }}>Ponto de partida do caixa — não entra no DRE</div>
              </div>
            </label>
          )}
          {!formRec.is_saldo_inicial && (
            <Input label="Descrição *" value={formRec.descricao} onChange={e => setFormRec(f => ({ ...f, descricao: e.target.value }))} placeholder="Ex: Mensalidade João Silva" />
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Input label="Valor (R$) *" type="number" step="0.01" min="0" value={formRec.valor} onChange={e => setFormRec(f => ({ ...f, valor: e.target.value }))} />
            <Input label="Data *" type="date" value={formRec.data} onChange={e => setFormRec(f => ({ ...f, data: e.target.value }))} />
          </div>
          {!formRec.is_saldo_inicial && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <SelectField label="Tipo" value={formRec.tipo} onChange={e => setFormRec(f => ({ ...f, tipo: e.target.value }))}>
                <option value="mensalidade">Mensalidade</option>
                <option value="matricula">Matrícula</option>
                <option value="convenio">Convênio</option>
                <option value="doacao">Doação</option>
                <option value="outros">Outros</option>
              </SelectField>
              <SelectField label="Conta" value={formRec.conta_id} onChange={e => setFormRec(f => ({ ...f, conta_id: e.target.value }))}>
                <option value="">Sem conta</option>
                {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </SelectField>
            </div>
          )}
          {!formRec.is_saldo_inicial && (
            <Input label="Referência (opcional)" value={formRec.referencia} onChange={e => setFormRec(f => ({ ...f, referencia: e.target.value }))} placeholder="Ex: Abril/2026" />
          )}
          <Input label="Observação" value={formRec.observacao} onChange={e => setFormRec(f => ({ ...f, observacao: e.target.value }))} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <Btn onClick={() => setModal(null)}>Cancelar</Btn>
            <Btn variant="primary" onClick={salvarReceita} disabled={loading}>{loading ? "Salvando..." : "Salvar"}</Btn>
          </div>
        </Modal>
      )}

      {/* Modal Despesa */}
      {modal === "despesa" && (
        <Modal title={editItem ? "Editar despesa" : "Nova despesa"} onClose={() => setModal(null)}>
          <Input label="Descrição *" value={formDesp.descricao} onChange={e => {
            const desc = e.target.value;
            const catId = categorizarTexto(desc, regrasIA);
            setFormDesp(f => ({ ...f, descricao: desc, categoria_id: catId ? String(catId) : f.categoria_id }));
          }} placeholder="Ex: Compra supermercado, Conta de luz..." />
          {formDesp.descricao && formDesp.categoria_id && (
            <div style={{ fontSize: 12, color: "#1D9E75", marginTop: -8, marginBottom: 8 }}>
              ✨ Categoria identificada: <strong>{categorias.find(c => c.id === parseInt(formDesp.categoria_id))?.nome}</strong>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Input label="Valor (R$) *" type="number" step="0.01" min="0" value={formDesp.valor} onChange={e => setFormDesp(f => ({ ...f, valor: e.target.value }))} />
            <Input label="Data *" type="date" value={formDesp.data} onChange={e => setFormDesp(f => ({ ...f, data: e.target.value }))} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <SelectField label="Tipo" value={formDesp.tipo} onChange={e => setFormDesp(f => ({ ...f, tipo: e.target.value }))}>
              <option value="variavel">Variável</option>
              <option value="fixa">Fixa</option>
            </SelectField>
            <SelectField label="Categoria" value={formDesp.categoria_id} onChange={e => setFormDesp(f => ({ ...f, categoria_id: e.target.value }))}>
              <option value="">Detectar automaticamente</option>
              {categorias.filter(c => c.tipo === "despesa" || c.tipo === "ambos").map(c => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </SelectField>
          </div>
          <SelectField label="Conta" value={formDesp.conta_id} onChange={e => setFormDesp(f => ({ ...f, conta_id: e.target.value }))}>
            <option value="">Sem conta</option>
            {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </SelectField>
          <Input label="Observação" value={formDesp.observacao} onChange={e => setFormDesp(f => ({ ...f, observacao: e.target.value }))} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <Btn onClick={() => setModal(null)}>Cancelar</Btn>
            <Btn variant="danger" onClick={salvarDespesa} disabled={loading}>{loading ? "Salvando..." : "Salvar"}</Btn>
          </div>
        </Modal>
      )}

      {/* Modal Recorrência */}
      {modal === "recorrencia" && (
        <Modal title="Nova despesa recorrente" onClose={() => setModal(null)}>
          <Input label="Descrição *" value={formRecorr.descricao} onChange={e => setFormRecorr(f => ({ ...f, descricao: e.target.value }))} placeholder="Ex: Conta de luz, Internet..." />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Input label="Valor (R$) *" type="number" step="0.01" min="0" value={formRecorr.valor} onChange={e => setFormRecorr(f => ({ ...f, valor: e.target.value }))} />
            <Input label="Dia do vencimento" type="number" min="1" max="31" value={formRecorr.dia_vencimento} onChange={e => setFormRecorr(f => ({ ...f, dia_vencimento: e.target.value }))} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <SelectField label="Categoria" value={formRecorr.categoria_id} onChange={e => setFormRecorr(f => ({ ...f, categoria_id: e.target.value }))}>
              <option value="">Sem categoria</option>
              {categorias.filter(c => c.tipo === "despesa" || c.tipo === "ambos").map(c => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </SelectField>
            <SelectField label="Conta" value={formRecorr.conta_id} onChange={e => setFormRecorr(f => ({ ...f, conta_id: e.target.value }))}>
              <option value="">Sem conta</option>
              {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </SelectField>
          </div>
          <AlertBar>Esta despesa será criada automaticamente todo mês no dia {formRecorr.dia_vencimento}.</AlertBar>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <Btn onClick={() => setModal(null)}>Cancelar</Btn>
            <Btn variant="primary" onClick={salvarRecorrencia} disabled={loading}>{loading ? "Criando..." : "Criar"}</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
