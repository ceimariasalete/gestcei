import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { useApp } from "../../context/AppContext";
import { useAuditoria } from "../../hooks/useAuditoria";
import { fmt, fmtMoeda, CATS_DEFAULT, periodoParaDatas, exportarCSV } from "../../lib/helpers";
import { processarDocumentoIA } from "../../api/claude";
import SeletorPeriodo from "../ui/SeletorPeriodo";
import BotaoExportar from "../ui/BotaoExportar";
import {
  Btn, Input, SelectField, Modal, ConfirmModal,
  MetricCard, AlertBar, Msg, PageHeader, Table, EmptyRow, Badge,
} from "../ui";

const CONFIANCA_COLOR = { alta: "#E1F5EE", media: "#FAEEDA", baixa: "#FCEBEB" };
const CONFIANCA_TEXT  = { alta: "#085041", media: "#633806", baixa: "#791F1F" };

const CATS_DEMISSAO = [
  "Demissao",
];

export default function Financeiro() {
  const { usuario } = useApp();
  const { log } = useAuditoria(usuario);

  const periodoInicial = periodoParaDatas("mes_atual");
  const [periodo, setPeriodo] = useState({ ...periodoInicial, periodo: "mes_atual" });
  const [lancamentos, setLancamentos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [regras, setRegras] = useState({});
  const [catFiltro, setCatFiltro] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState("");
  const [modal, setModal] = useState(null);
  const [editLanc, setEditLanc] = useState(null);
  const [form, setForm] = useState({ descricao: "", valor: "", tipo: "saida", categoria: "", subcategoria: "", data: new Date().toISOString().split("T")[0], observacao: "" });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [confirmData, setConfirmData] = useState(null);
  const [aba, setAba] = useState("lancamentos");
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadResultados, setUploadResultados] = useState([]);
  const [uploadErro, setUploadErro] = useState("");
  const [novaCat, setNovaCat] = useState("");
  const [novaCatUpload, setNovaCatUpload] = useState("");
  const [selecionados, setSelecionados] = useState([]);
  const [saldoAnterior, setSaldoAnterior] = useState(0);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 640);
  const [numAlunos, setNumAlunos] = useState(80);
  const [horasDia, setHorasDia] = useState(8);
  const [margemCalc, setMargemCalc] = useState(10);

  const showMsg = (m) => { setMsg(m); setTimeout(() => setMsg(""), 4000); };

  const carregarLancamentos = useCallback(async () => {
    const { data } = await supabase.from("financeiro").select("*")
      .gte("data", periodo.inicio).lte("data", periodo.fim)
      .order("data", { ascending: false });
    setLancamentos(data || []);
    // Saldo acumulado: tudo antes do inicio do periodo
    const { data: anterior } = await supabase.from("financeiro").select("tipo,valor")
      .lt("data", periodo.inicio);
    if (anterior) {
      const s = anterior.reduce((acc, l) => acc + (l.tipo === "entrada" ? Number(l.valor) : -Number(l.valor)), 0);
      setSaldoAnterior(s);
    }
  }, [periodo.inicio, periodo.fim]);

  const carregarCategorias = useCallback(async () => {
    const { data } = await supabase.from("financeiro_categorias").select("*").order("nome");
    setCategorias(data && data.length > 0 ? data.map((c) => c.nome) : CATS_DEFAULT);
  }, []);

  const carregarRegras = useCallback(async () => {
    const { data } = await supabase.from("financeiro_regras").select("*");
    if (data) { const r = {}; data.forEach((d) => { r[d.fornecedor_chave] = d.categoria; }); setRegras(r); }
  }, []);

  useEffect(() => { carregarLancamentos(); }, [carregarLancamentos]);
  useEffect(() => {
    const handle = () => setIsMobile(window.innerWidth <= 640);
    window.addEventListener("resize", handle);
    return () => window.removeEventListener("resize", handle);
  }, []);
  useEffect(() => { carregarCategorias(); carregarRegras(); }, [carregarCategorias, carregarRegras]);

  // ── Cálculos ──────────────────────────────────
  const lancFiltrados = lancamentos.filter((l) =>
    (!catFiltro || l.categoria === catFiltro) && (!tipoFiltro || l.tipo === tipoFiltro)
  );
  const totalEntradas = lancamentos.filter((l) => l.tipo === "entrada").reduce((s, l) => s + Number(l.valor), 0);
  const totalSaidas   = lancamentos.filter((l) => l.tipo === "saida").reduce((s, l) => s + Number(l.valor), 0);
  const saldo = totalEntradas - totalSaidas;
  const saldoAcumulado = saldoAnterior + saldo;
  const margem = totalEntradas > 0 ? Math.round((saldo / totalEntradas) * 100) : 0;

  // Encargos de demissão separados
  const totalDemissoes = lancamentos.filter((l) =>
    l.tipo === "saida" && CATS_DEMISSAO.includes(l.categoria)
  ).reduce((s, l) => s + Number(l.valor), 0);

  const porCategoriaSaida = categorias
    .map((cat) => ({ cat, total: lancamentos.filter((l) => l.categoria === cat && l.tipo === "saida").reduce((s, l) => s + Number(l.valor), 0) }))
    .filter((c) => c.total > 0).sort((a, b) => b.total - a.total);

  const porCategoriaEntrada = Object.entries(
    lancamentos.filter((l) => l.tipo === "entrada").reduce((acc, l) => { acc[l.categoria] = (acc[l.categoria] || 0) + Number(l.valor); return acc; }, {})
  ).sort((a, b) => b[1] - a[1]);

  const dreEntradas = lancamentos.filter((l) => l.tipo === "entrada").reduce((acc, l) => { acc[l.categoria] = (acc[l.categoria] || 0) + Number(l.valor); return acc; }, {});
  const dreSaidas   = lancamentos.filter((l) => l.tipo === "saida").reduce((acc, l) => { acc[l.categoria] = (acc[l.categoria] || 0) + Number(l.valor); return acc; }, {});

  // Dados para exportação
  const dadosExportar = lancFiltrados.map((l) => ({
    Data: l.data, Descricao: l.descricao, Categoria: l.categoria,
    Subcategoria: l.subcategoria || "", Tipo: l.tipo,
    Valor: Number(l.valor).toFixed(2).replace(".", ","),
    "Lancado por": l.usuario_nome,
  }));

  // ── CRUD ──────────────────────────────────────
  async function salvar() {
    if (!form.descricao || !form.valor) return;
    setLoading(true);
    const cat = form.categoria || categorias[0] || "Outros";
    const payload = { ...form, categoria: cat, valor: parseFloat(form.valor), subcategoria: form.subcategoria || null };
    if (editLanc) {
      await supabase.from("financeiro").update(payload).eq("id", editLanc.id);
      await log("financeiro", "UPDATE", editLanc.id, `Editou lancamento "${form.descricao}"`, editLanc, form);
    } else {
      const { data } = await supabase.from("financeiro").insert({ ...payload, usuario_id: usuario.id, usuario_nome: usuario.nome }).select().single();
      await log("financeiro", "INSERT", data?.id, `Lancou ${form.tipo} "${form.descricao}" - ${fmtMoeda(form.valor)}`, null, form);
    }
    setModal(null); setLoading(false); carregarLancamentos();
    showMsg("Lancamento salvo!");
  }

  async function excluir(l) {
    setConfirmData(null);
    await supabase.from("financeiro").delete().eq("id", l.id);
    await log("financeiro", "DELETE", l.id, `Excluiu lancamento "${l.descricao}"`, l, null);
    carregarLancamentos(); showMsg("Lancamento excluido.");
  }

  // ── Upload IA ──────────────────────────────────
  async function processarArquivo() {
    if (!uploadFile) return;
    setUploadLoading(true); setUploadErro(""); setUploadResultados([]);
    try {
      const resultado = await processarDocumentoIA(uploadFile, categorias, regras);
      const items = resultado.lancamentos || [];
      if (items.length === 0) {
        setUploadErro("Nenhum lancamento encontrado no documento.");
      } else {
        setUploadResultados(items);
      }
    } catch (e) {
      setUploadErro("Erro ao processar: " + e.message);
    } finally {
      setUploadLoading(false);
    }
  }

  async function confirmarLancamentos() {
    setLoading(true);
    let importados = 0;
    let duplicados = 0;
    for (const l of uploadResultados) {
      if (l._ignorar) continue;
      // Verificar duplicata por data + valor + tipo + descricao
      const { data: existe } = await supabase.from("financeiro")
        .select("id").eq("data", l.data).eq("valor", l.valor).eq("tipo", l.tipo).eq("descricao", l.descricao).limit(1);
      if (existe && existe.length > 0) { duplicados++; continue; }
      await supabase.from("financeiro").insert({
        descricao: l.descricao, valor: l.valor, tipo: l.tipo,
        categoria: l.categoria_sugerida, subcategoria: l.subcategoria_sugerida || null,
        data: l.data, observacao: `Importado via IA - ${uploadFile.name}`,
        usuario_id: usuario.id, usuario_nome: usuario.nome,
      });
      importados++;
      if (l.fornecedor_chave && l.categoria_sugerida) {
        await supabase.from("financeiro_regras").upsert(
          { fornecedor_chave: l.fornecedor_chave, categoria: l.categoria_sugerida },
          { onConflict: "fornecedor_chave" }
        );
      }
    }
    await log("financeiro", "INSERT", null, `Importou ${importados} lancamentos via IA de "${uploadFile.name}" (${duplicados} duplicados ignorados)`, null, null);
    setUploadResultados([]); setUploadFile(null); setModal(null);
    setLoading(false); carregarLancamentos(); carregarRegras();
    const msg = duplicados > 0 ? `${importados} importados, ${duplicados} duplicados ignorados!` : `${importados} lancamentos importados com sucesso!`;
    showMsg(msg);
  }

  async function excluirSelecionados() {
    const total = selecionados.length;
    setLoading(true);
    // Deletar todos de uma vez com .in()
    await supabase.from("financeiro").delete().in("id", selecionados);
    await log("financeiro", "DELETE", null, `Excluiu ${total} lancamentos em lote`, null, null);
    setSelecionados([]);
    setLoading(false);
    carregarLancamentos();
    showMsg(`${total} lancamentos excluidos!`);
  }

  function toggleSelecionado(id) {
    setSelecionados(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function toggleTodos() {
    if (selecionados.length === lancFiltrados.length) {
      setSelecionados([]);
    } else {
      setSelecionados(lancFiltrados.map(l => l.id));
    }
  }

  async function adicionarCategoriaUpload() {
    if (!novaCatUpload.trim()) return;
    await supabase.from("financeiro_categorias").insert({ nome: novaCatUpload.trim() });
    setNovaCatUpload(""); carregarCategorias();
  }

  async function removerCategoriaUpload(nome) {
    await supabase.from("financeiro_categorias").delete().eq("nome", nome);
    carregarCategorias();
  }

  async function adicionarCategoria() {
    if (!novaCat.trim()) return;
    await supabase.from("financeiro_categorias").insert({ nome: novaCat.trim() });
    setNovaCat(""); carregarCategorias();
  }

  async function removerCategoria(nome) {
    await supabase.from("financeiro_categorias").delete().eq("nome", nome);
    carregarCategorias();
  }

  return (
    <div style={{ padding: "clamp(0.75rem, 3vw, 1.5rem)", maxWidth: 1200, margin: "0 auto" }}>
      {confirmData && <ConfirmModal {...confirmData} onCancel={() => setConfirmData(null)} />}

      <PageHeader title="Financeiro" subtitle="Fluxo de caixa, DRE e dashboard">
        <BotaoExportar dados={dadosExportar} nomeArquivo="financeiro" />
        <Btn variant="info" onClick={() => setModal("categorias")}>Categorias</Btn>
        <Btn onClick={() => setModal("upload")}>Subir documento</Btn>
        <Btn variant="primary" onClick={() => {
          setForm({ descricao: "", valor: "", tipo: "saida", categoria: categorias[0] || "", subcategoria: "", data: new Date().toISOString().split("T")[0], observacao: "" });
          setEditLanc(null); setModal("form");
        }}>+ Lancamento</Btn>
      </PageHeader>

      {/* Sub-abas + seletor de período */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 20, borderBottom: "0.5px solid #e0e0e0", paddingBottom: 12, flexWrap: "wrap" }}>
        {[["lancamentos","Lancamentos"],["dre","DRE"],["dashboard","Dashboard"],["demissoes","Custo/Aluno"],["regras","Regras IA"]].map(([k,l]) => (
          <button key={k} onClick={() => setAba(k)}
            style={{ padding: "6px 16px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 13,
              background: aba === k ? "#1D9E75" : "transparent",
              color: aba === k ? "#fff" : "#555", fontWeight: aba === k ? 500 : 400 }}>{l}</button>
        ))}
        <div style={{ marginLeft: "auto" }}>
          <SeletorPeriodo onChange={setPeriodo} />
        </div>
      </div>

      <Msg text={msg} />

      {/* KPIs sempre visíveis */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 8, marginBottom: 20 }}>
        <MetricCard label="Receita total" value={fmtMoeda(totalEntradas)} subColor="#1D9E75" sub="entradas" accent="#E1F5EE" />
        <MetricCard label="Despesa total" value={fmtMoeda(totalSaidas)} subColor="#A32D2D" sub="saidas" accent="#FCEBEB" />
        <MetricCard label="Resultado" value={fmtMoeda(saldo)} subColor={saldo >= 0 ? "#1D9E75" : "#A32D2D"} sub={saldo >= 0 ? "superavit" : "deficit"} />
        <MetricCard label="Saldo acumulado" value={fmtMoeda(saldoAcumulado)} subColor={saldoAcumulado >= 0 ? "#1D9E75" : "#A32D2D"} sub="saldo geral" accent={saldoAcumulado >= 0 ? "#E1F5EE" : "#FCEBEB"} />
        <MetricCard label="Margem" value={`${margem}%`} subColor={margem >= 0 ? "#1D9E75" : "#A32D2D"} sub="de resultado" />
        <MetricCard label="Demissoes" value={fmtMoeda(totalDemissoes)} subColor="#A32D2D" sub="encargos trabalhistas" accent="#FFF5F5" />
      </div>

      {/* ── LANCAMENTOS ── */}
      {aba === "lancamentos" && (
        <>
          {/* Filtros + barra de ações em lote */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
            <select value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value)}
              style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #e0e0e0", fontSize: 13, fontFamily: "inherit", background: "#fff", color: tipoFiltro ? "#085041" : "#555", fontWeight: tipoFiltro ? 500 : 400, cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", minWidth: 140 }}>
              <option value="">Todos os tipos</option>
              <option value="entrada">Entradas</option>
              <option value="saida">Saidas</option>
            </select>
            <select value={catFiltro} onChange={(e) => setCatFiltro(e.target.value)}
              style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #e0e0e0", fontSize: 13, fontFamily: "inherit", background: "#fff", color: catFiltro ? "#085041" : "#555", fontWeight: catFiltro ? 500 : 400, cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", minWidth: 180 }}>
              <option value="">Todas as categorias</option>
              {categorias.map((c) => <option key={c}>{c}</option>)}
            </select>
            {(tipoFiltro || catFiltro) && (
              <button onClick={() => { setTipoFiltro(""); setCatFiltro(""); }}
                style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #e0e0e0", background: "#fff", fontSize: 12, color: "#888", cursor: "pointer", fontFamily: "inherit" }}>
                ✕ Limpar filtros
              </button>
            )}
            {selecionados.length > 0 && (
              <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", background: "#FCEBEB", padding: "6px 14px", borderRadius: 8 }}>
                <span style={{ fontSize: 12, color: "#791F1F", fontWeight: 500 }}>{selecionados.length} selecionado(s)</span>
                <Btn small variant="danger" onClick={() => setConfirmData({
                  title: "Excluir selecionados",
                  message: `Excluir ${selecionados.length} lancamento(s) selecionados?`,
                  onConfirm: excluirSelecionados
                })}>Excluir todos</Btn>
                <button onClick={() => setSelecionados([])}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#A32D2D", padding: 0 }}>✕</button>
              </div>
            )}
          </div>

          {/* Desktop: tabela */}
          {!isMobile && <div>
            <Table headers={["", "Data","Descricao","Categoria","Tipo","Valor","Por",""]}>
              <tr style={{ background: "#f7f7f5" }}>
                <td style={{ padding: "8px 14px" }}>
                  <input type="checkbox"
                    checked={lancFiltrados.length > 0 && selecionados.length === lancFiltrados.length}
                    onChange={toggleTodos}
                    style={{ width: 15, height: 15, accentColor: "#1D9E75", cursor: "pointer" }} />
                </td>
                <td colSpan={7} style={{ padding: "8px 14px", fontSize: 11, color: "#888" }}>
                  {selecionados.length === 0 ? "Selecionar todos" : `${selecionados.length} de ${lancFiltrados.length} selecionados`}
                </td>
              </tr>
              {lancFiltrados.map((l) => (
                <tr key={l.id} style={{ borderBottom: "0.5px solid #f0f0f0", background: selecionados.includes(l.id) ? "#F0FAF6" : "transparent" }}>
                  <td style={{ padding: "10px 14px" }}>
                    <input type="checkbox" checked={selecionados.includes(l.id)} onChange={() => toggleSelecionado(l.id)}
                      style={{ width: 15, height: 15, accentColor: "#1D9E75", cursor: "pointer" }} />
                  </td>
                  <td style={{ padding: "10px 14px", fontSize: 12, color: "#888", whiteSpace: "nowrap" }}>{fmt(l.data)}</td>
                  <td style={{ padding: "10px 14px", fontSize: 13 }}>
                    <span style={{ fontWeight: 500 }}>{l.descricao}</span>
                    {l.observacao && <div style={{ fontSize: 11, color: "#aaa" }}>{l.observacao}</div>}
                  </td>
                  <td style={{ padding: "10px 14px", fontSize: 12, color: "#555" }}>
                    {l.categoria}
                    {l.subcategoria && <div style={{ fontSize: 11, color: "#aaa" }}>↳ {l.subcategoria}</div>}
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <span style={{ padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 500,
                      background: l.tipo === "entrada" ? "#EAF3DE" : "#FCEBEB",
                      color: l.tipo === "entrada" ? "#27500A" : "#791F1F" }}>{l.tipo}</span>
                  </td>
                  <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 500, color: l.tipo === "entrada" ? "#1D9E75" : "#A32D2D" }}>
                    {l.tipo === "entrada" ? "+" : "-"}{fmtMoeda(l.valor)}
                  </td>
                  <td style={{ padding: "10px 14px", fontSize: 12, color: "#888" }}>{l.usuario_nome}</td>
                  <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                    <Btn small onClick={() => { setForm({ ...l, valor: String(l.valor) }); setEditLanc(l); setModal("form"); }} style={{ marginRight: 4 }}>Editar</Btn>
                    <Btn small variant="danger" onClick={() => setConfirmData({ title: "Excluir lancamento", message: `Excluir "${l.descricao}"?`, onConfirm: () => excluir(l) })}>Excluir</Btn>
                  </td>
                </tr>
              ))}
              {lancFiltrados.length === 0 && <EmptyRow colSpan={8} message="Nenhum lancamento encontrado." />}
            </Table>
          </div>}

          {/* Mobile: cards com checkbox */}
          {isMobile && <div>
            {lancFiltrados.length > 0 && (
              <div style={{ padding: "10px 14px", borderBottom: "0.5px solid #f0f0f0", display: "flex", alignItems: "center", gap: 10, background: "#f7f7f5" }}>
                <input type="checkbox"
                  checked={selecionados.length === lancFiltrados.length}
                  onChange={toggleTodos}
                  style={{ width: 16, height: 16, accentColor: "#1D9E75" }} />
                <span style={{ fontSize: 12, color: "#888" }}>Selecionar todos ({lancFiltrados.length})</span>
              </div>
            )}
            {lancFiltrados.length === 0 && <div style={{ padding: "2rem", textAlign: "center", color: "#aaa", fontSize: 13 }}>Nenhum lancamento encontrado.</div>}
            {lancFiltrados.map((l) => (
              <div key={l.id} style={{ padding: "12px 14px", borderBottom: "0.5px solid #f0f0f0", background: selecionados.includes(l.id) ? "#F0FAF6" : "transparent" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 4 }}>
                  <input type="checkbox" checked={selecionados.includes(l.id)} onChange={() => toggleSelecionado(l.id)}
                    style={{ width: 16, height: 16, accentColor: "#1D9E75", marginTop: 2, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{l.descricao}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: l.tipo === "entrada" ? "#1D9E75" : "#A32D2D", whiteSpace: "nowrap" }}>
                    {l.tipo === "entrada" ? "+" : "-"}{fmtMoeda(l.valor)}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", paddingLeft: 26 }}>
                  <span style={{ fontSize: 11, color: "#888" }}>{fmt(l.data)}</span>
                  <span style={{ fontSize: 11, color: "#555", background: "#f5f5f3", padding: "1px 7px", borderRadius: 10 }}>{l.categoria}</span>
                  <span style={{ padding: "1px 8px", borderRadius: 20, fontSize: 10, fontWeight: 500,
                    background: l.tipo === "entrada" ? "#EAF3DE" : "#FCEBEB",
                    color: l.tipo === "entrada" ? "#27500A" : "#791F1F" }}>{l.tipo}</span>
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 8, paddingLeft: 26 }}>
                  <Btn small onClick={() => { setForm({ ...l, valor: String(l.valor) }); setEditLanc(l); setModal("form"); }}>Editar</Btn>
                  <Btn small variant="danger" onClick={() => setConfirmData({ title: "Excluir lancamento", message: `Excluir "${l.descricao}"?`, onConfirm: () => excluir(l) })}>Excluir</Btn>
                </div>
              </div>
            ))}
          </div>}
        </>
      )}

      {/* ── DRE ── */}
      {aba === "dre" && (
        <div style={{ background: "#fff", border: "0.5px solid #e0e0e0", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "0.5px solid #e0e0e0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 14, fontWeight: 500 }}>Demonstrativo de Resultado</span>
            <BotaoExportar dados={[
              ...Object.entries(dreEntradas).map(([cat,val]) => ({ Tipo:"Receita", Categoria:cat, Valor:Number(val).toFixed(2).replace(".",",") })),
              ...Object.entries(dreSaidas).map(([cat,val]) => ({ Tipo:"Despesa", Categoria:cat, Valor:Number(val).toFixed(2).replace(".",",") })),
              { Tipo:"RESULTADO", Categoria:"", Valor:Number(saldo).toFixed(2).replace(".",",") },
            ]} nomeArquivo="dre" label="Exportar DRE" />
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: "#f7f7f5" }}>
              <th style={{ padding: "10px 20px", fontSize: 12, fontWeight: 500, color: "#777", textAlign: "left", borderBottom: "0.5px solid #e0e0e0" }}>Descricao</th>
              <th style={{ padding: "10px 20px", fontSize: 12, fontWeight: 500, color: "#777", textAlign: "right", borderBottom: "0.5px solid #e0e0e0" }}>Valor</th>
            </tr></thead>
            <tbody>
              <tr><td colSpan={2} style={{ padding: "10px 20px", fontSize: 12, fontWeight: 500, color: "#1D9E75", background: "#f0faf5", borderBottom: "0.5px solid #e0e0e0" }}>RECEITAS</td></tr>
              {Object.entries(dreEntradas).map(([cat,val]) => (
                <tr key={cat} style={{ borderBottom: "0.5px solid #f0f0f0" }}>
                  <td style={{ padding: "9px 20px 9px 32px", fontSize: 13, color: "#555" }}>{cat}</td>
                  <td style={{ padding: "9px 20px", fontSize: 13, textAlign: "right", color: "#1D9E75", fontWeight: 500 }}>{fmtMoeda(val)}</td>
                </tr>
              ))}
              {Object.keys(dreEntradas).length === 0 && <tr><td colSpan={2} style={{ padding: "9px 20px 9px 32px", fontSize: 13, color: "#aaa" }}>Sem receitas no periodo</td></tr>}
              <tr style={{ background: "#f0faf5" }}>
                <td style={{ padding: "10px 20px", fontSize: 13, fontWeight: 500, borderTop: "0.5px solid #e0e0e0" }}>Total Receitas</td>
                <td style={{ padding: "10px 20px", fontSize: 13, fontWeight: 500, textAlign: "right", color: "#1D9E75", borderTop: "0.5px solid #e0e0e0" }}>{fmtMoeda(totalEntradas)}</td>
              </tr>
              <tr><td colSpan={2} style={{ padding: "10px 20px", fontSize: 12, fontWeight: 500, color: "#A32D2D", background: "#fff5f5", borderBottom: "0.5px solid #e0e0e0", borderTop: "0.5px solid #e0e0e0" }}>DESPESAS</td></tr>
              {Object.entries(dreSaidas).map(([cat,val]) => (
                <tr key={cat} style={{ borderBottom: "0.5px solid #f0f0f0", background: CATS_DEMISSAO.includes(cat) ? "#fff8f8" : "transparent" }}>
                  <td style={{ padding: "9px 20px 9px 32px", fontSize: 13, color: "#555" }}>
                    {cat}{CATS_DEMISSAO.includes(cat) && <span style={{ fontSize: 10, color: "#A32D2D", marginLeft: 6, background: "#FCEBEB", padding: "1px 6px", borderRadius: 10 }}>demissao</span>}
                  </td>
                  <td style={{ padding: "9px 20px", fontSize: 13, textAlign: "right", color: "#A32D2D", fontWeight: 500 }}>{fmtMoeda(val)}</td>
                </tr>
              ))}
              {Object.keys(dreSaidas).length === 0 && <tr><td colSpan={2} style={{ padding: "9px 20px 9px 32px", fontSize: 13, color: "#aaa" }}>Sem despesas no periodo</td></tr>}
              <tr style={{ background: "#fff5f5" }}>
                <td style={{ padding: "10px 20px", fontSize: 13, fontWeight: 500, borderTop: "0.5px solid #e0e0e0" }}>Total Despesas</td>
                <td style={{ padding: "10px 20px", fontSize: 13, fontWeight: 500, textAlign: "right", color: "#A32D2D", borderTop: "0.5px solid #e0e0e0" }}>{fmtMoeda(totalSaidas)}</td>
              </tr>
              <tr style={{ background: saldo >= 0 ? "#f0faf5" : "#fff5f5" }}>
                <td style={{ padding: "12px 20px", fontSize: 14, fontWeight: 500, borderTop: "2px solid #e0e0e0" }}>RESULTADO DO PERIODO</td>
                <td style={{ padding: "12px 20px", fontSize: 14, fontWeight: 500, textAlign: "right", color: saldo >= 0 ? "#1D9E75" : "#A32D2D", borderTop: "2px solid #e0e0e0" }}>{fmtMoeda(saldo)}</td>
              </tr>
              <tr>
                <td style={{ padding: "10px 20px", fontSize: 13, color: "#888" }}>Margem de resultado</td>
                <td style={{ padding: "10px 20px", fontSize: 13, textAlign: "right", fontWeight: 500, color: margem >= 0 ? "#1D9E75" : "#A32D2D" }}>{margem}%</td>
              </tr>
              {totalDemissoes > 0 && (
                <tr style={{ background: "#FFF5F5" }}>
                  <td style={{ padding: "10px 20px", fontSize: 13, color: "#A32D2D", fontWeight: 500 }}>Total encargos de demissao</td>
                  <td style={{ padding: "10px 20px", fontSize: 13, textAlign: "right", fontWeight: 500, color: "#A32D2D" }}>{fmtMoeda(totalDemissoes)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── DASHBOARD ── */}
      {aba === "dashboard" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            {/* Gastos por categoria */}
            <div style={{ background: "#fff", border: "0.5px solid #e0e0e0", borderRadius: 12, padding: "1.25rem" }}>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 16 }}>Gastos por categoria</div>
              {porCategoriaSaida.length === 0 && <div style={{ fontSize: 13, color: "#aaa" }}>Nenhuma despesa no periodo.</div>}
              {porCategoriaSaida.map(({ cat, total }) => {
                const pct = totalSaidas > 0 ? Math.round((total / totalSaidas) * 100) : 0;
                const isDemissao = CATS_DEMISSAO.includes(cat);
                const subs = lancamentos.filter((l) => l.tipo === "saida" && l.categoria === cat && l.subcategoria)
                  .reduce((acc, l) => { acc[l.subcategoria] = (acc[l.subcategoria] || 0) + Number(l.valor); return acc; }, {});
                return (
                  <div key={cat} style={{ marginBottom: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                      <span style={{ fontWeight: 500 }}>
                        {cat}{isDemissao && <span style={{ fontSize: 10, color: "#A32D2D", marginLeft: 6, background: "#FCEBEB", padding: "1px 6px", borderRadius: 10 }}>demissao</span>}
                      </span>
                      <span style={{ color: "#A32D2D", fontWeight: 500 }}>{fmtMoeda(total)} <span style={{ fontSize: 11, color: "#aaa", fontWeight: 400 }}>({pct}%)</span></span>
                    </div>
                    <div style={{ height: 7, background: "#f0f0f0", borderRadius: 4, overflow: "hidden", marginBottom: 4 }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: isDemissao ? "#E24B4A" : "#A32D2D", borderRadius: 4, opacity: 0.7 }} />
                    </div>
                    {Object.entries(subs).map(([sub, val]) => (
                      <div key={sub} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#888", paddingLeft: 12, marginTop: 2 }}>
                        <span>↳ {sub}</span><span>{fmtMoeda(val)}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            {/* Receitas por categoria */}
            <div style={{ background: "#fff", border: "0.5px solid #e0e0e0", borderRadius: 12, padding: "1.25rem" }}>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 16 }}>Receitas por categoria</div>
              {porCategoriaEntrada.length === 0 && <div style={{ fontSize: 13, color: "#aaa" }}>Nenhuma receita no periodo.</div>}
              {porCategoriaEntrada.map(([cat, val]) => {
                const pct = totalEntradas > 0 ? Math.round((val / totalEntradas) * 100) : 0;
                const subs = lancamentos.filter((l) => l.tipo === "entrada" && l.categoria === cat && l.subcategoria)
                  .reduce((acc, l) => { acc[l.subcategoria] = (acc[l.subcategoria] || 0) + Number(l.valor); return acc; }, {});
                return (
                  <div key={cat} style={{ marginBottom: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                      <span style={{ fontWeight: 500 }}>{cat}</span>
                      <span style={{ color: "#1D9E75", fontWeight: 500 }}>{fmtMoeda(val)} <span style={{ fontSize: 11, color: "#aaa", fontWeight: 400 }}>({pct}%)</span></span>
                    </div>
                    <div style={{ height: 7, background: "#f0f0f0", borderRadius: 4, overflow: "hidden", marginBottom: 4 }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: "#1D9E75", borderRadius: 4, opacity: 0.7 }} />
                    </div>
                    {Object.entries(subs).map(([sub, val2]) => (
                      <div key={sub} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#888", paddingLeft: 12, marginTop: 2 }}>
                        <span>↳ {sub}</span><span>{fmtMoeda(val2)}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* Ultimos lancamentos */}
            <div style={{ background: "#fff", border: "0.5px solid #e0e0e0", borderRadius: 12, padding: "1.25rem" }}>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>Ultimos lancamentos</div>
              {lancamentos.slice(0, 8).map((l) => (
                <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "0.5px solid #f0f0f0", fontSize: 13 }}>
                  <span style={{ padding: "1px 8px", borderRadius: 20, fontSize: 10, background: l.tipo === "entrada" ? "#EAF3DE" : "#FCEBEB", color: l.tipo === "entrada" ? "#27500A" : "#791F1F" }}>{l.tipo}</span>
                  <span style={{ flex: 1, color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.descricao}</span>
                  <span style={{ fontSize: 11, color: "#aaa" }}>{fmt(l.data)}</span>
                  <span style={{ fontWeight: 500, color: l.tipo === "entrada" ? "#1D9E75" : "#A32D2D", whiteSpace: "nowrap" }}>{l.tipo === "entrada" ? "+" : "-"}{fmtMoeda(l.valor)}</span>
                </div>
              ))}
              {lancamentos.length === 0 && <div style={{ fontSize: 13, color: "#aaa" }}>Nenhum lancamento.</div>}
            </div>

            {/* Analise de margem */}
            <div style={{ background: "#fff", border: "0.5px solid #e0e0e0", borderRadius: 12, padding: "1.25rem" }}>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 16 }}>Analise de margem</div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                  <span style={{ color: "#888" }}>Receita bruta</span>
                  <span style={{ fontWeight: 500, color: "#1D9E75" }}>{fmtMoeda(totalEntradas)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                  <span style={{ color: "#888" }}>(-) Despesas operacionais</span>
                  <span style={{ fontWeight: 500, color: "#A32D2D" }}>-{fmtMoeda(totalSaidas - totalDemissoes)}</span>
                </div>
                {totalDemissoes > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                    <span style={{ color: "#888" }}>(-) Encargos de demissao</span>
                    <span style={{ fontWeight: 500, color: "#E24B4A" }}>-{fmtMoeda(totalDemissoes)}</span>
                  </div>
                )}
                <div style={{ borderTop: "1px solid #e0e0e0", paddingTop: 8, display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                  <span style={{ fontWeight: 500 }}>Resultado liquido</span>
                  <span style={{ fontWeight: 500, color: saldo >= 0 ? "#1D9E75" : "#A32D2D" }}>{fmtMoeda(saldo)}</span>
                </div>
              </div>
              <div style={{ background: "#f7f7f5", borderRadius: 8, padding: "12px" }}>
                <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>Margem de resultado</div>
                <div style={{ height: 12, background: "#e0e0e0", borderRadius: 6, overflow: "hidden", marginBottom: 8 }}>
                  <div style={{ height: "100%", width: `${Math.min(100, Math.abs(margem))}%`, background: saldo >= 0 ? "#1D9E75" : "#A32D2D", borderRadius: 6 }} />
                </div>
                <div style={{ fontSize: 22, fontWeight: 500, color: saldo >= 0 ? "#1D9E75" : "#A32D2D", textAlign: "center" }}>{margem}%</div>
                <div style={{ fontSize: 12, color: "#888", textAlign: "center", marginTop: 4 }}>
                  {totalEntradas > 0 ? (saldo >= 0 ? `Para cada R$1,00 recebido, sobram R$${(saldo/totalEntradas).toFixed(2)}` : `Para cada R$1,00 recebido, gasta-se R$${(totalSaidas/totalEntradas).toFixed(2)}`) : "Sem receitas no periodo"}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CUSTO/ALUNO ── */}
      {aba === "demissoes" && (() => {
        const custoTotal = totalSaidas;
        const custoAluno = numAlunos > 0 ? custoTotal / numAlunos : 0;
        // Custo/hora baseado em 8h integral como referencia
        const custoHora = custoAluno / (8 * 22);
        // Mensalidade proporcional as horas contratadas
        const custoMensalidade = custoHora * horasDia * 22;
        const valorSugerido = custoMensalidade * (1 + margemCalc / 100);
        // Breakdown por categoria
        const catsCusto = [
          { nome: "Salarios", cats: ["Salarios", "Encargos Trabalhistas"] },
          { nome: "Alimentacao", cats: ["Alimentacao"] },
          { nome: "Material Pedagogico", cats: ["Material Pedagogico"] },
          { nome: "Agua/Energia/Tel", cats: ["Agua/Energia", "Telefone/Internet"] },
          { nome: "Contabilidade/Nutri", cats: ["Contabilidade", "Nutricionista"] },
          { nome: "Outros", cats: ["Manutencao", "Limpeza", "Transporte", "Seguro", "Outros"] },
        ];
        return (
          <div>
            {/* KPIs principais */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 20 }}>
              <MetricCard label="Custo total" value={fmtMoeda(custoTotal)} subColor="#A32D2D" sub="despesas no periodo" accent="#FCEBEB" />
              <MetricCard label="Custo por aluno" value={fmtMoeda(custoAluno)} subColor="#A32D2D" sub={`com ${numAlunos} alunos`} accent="#FFF5F5" />
              <MetricCard label="Custo por hora" value={fmtMoeda(custoHora)} subColor="#BA7517" sub={`${horasDia}h/dia x 22 dias`} accent="#FAEEDA" />
              <MetricCard label="Mensalidade sugerida" value={fmtMoeda(valorSugerido)} subColor="#1D9E75" sub={`${horasDia}h/dia · ${margemCalc}% margem`} accent="#E1F5EE" />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              {/* Calculadora */}
              <div style={{ background: "#fff", border: "0.5px solid #e0e0e0", borderRadius: 12, padding: "1.25rem" }}>
                <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 16 }}>Calculadora de mensalidade</div>

                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>Numero de alunos</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input type="range" min={10} max={150} value={numAlunos} onChange={e => setNumAlunos(Number(e.target.value))}
                      style={{ flex: 1, accentColor: "#1D9E75" }} />
                    <input type="number" value={numAlunos} onChange={e => setNumAlunos(Number(e.target.value))}
                      style={{ width: 60, padding: "4px 8px", borderRadius: 6, border: "0.5px solid #ccc", fontSize: 13, textAlign: "center", fontFamily: "inherit" }} />
                  </div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>Horas por dia que o aluno fica</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input type="range" min={1} max={12} value={horasDia} onChange={e => setHorasDia(Number(e.target.value))}
                      style={{ flex: 1, accentColor: "#1D9E75" }} />
                    <input type="number" value={horasDia} onChange={e => setHorasDia(Number(e.target.value))}
                      style={{ width: 60, padding: "4px 8px", borderRadius: 6, border: "0.5px solid #ccc", fontSize: 13, textAlign: "center", fontFamily: "inherit" }} />
                    <span style={{ fontSize: 12, color: "#888" }}>h</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>
                    {horasDia <= 4 ? "Meio periodo (manha ou tarde)" : horasDia <= 7 ? "Periodo estendido" : "Periodo integral"}
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>Margem de sustentabilidade (%)</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input type="range" min={0} max={50} value={margemCalc} onChange={e => setMargemCalc(Number(e.target.value))}
                      style={{ flex: 1, accentColor: "#1D9E75" }} />
                    <input type="number" value={margemCalc} onChange={e => setMargemCalc(Number(e.target.value))}
                      style={{ width: 60, padding: "4px 8px", borderRadius: 6, border: "0.5px solid #ccc", fontSize: 13, textAlign: "center", fontFamily: "inherit" }} />
                    <span style={{ fontSize: 12, color: "#888" }}>%</span>
                  </div>
                </div>

                <div style={{ background: "#E1F5EE", borderRadius: 10, padding: "16px", textAlign: "center" }}>
                  <div style={{ fontSize: 12, color: "#085041", marginBottom: 4 }}>Mensalidade sugerida</div>
                  <div style={{ fontSize: 28, fontWeight: 600, color: "#085041" }}>{fmtMoeda(valorSugerido)}</div>
                  <div style={{ fontSize: 11, color: "#1D9E75", marginTop: 4 }}>
                    {fmtMoeda(custoHora)}/hora · {fmtMoeda(custoMensalidade)} custo real ({horasDia}h/dia)
                  </div>
                </div>
              </div>

              {/* Breakdown de custos */}
              <div style={{ background: "#fff", border: "0.5px solid #e0e0e0", borderRadius: 12, padding: "1.25rem" }}>
                <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 16 }}>Composicao do custo por aluno</div>
                {catsCusto.map(({ nome, cats }) => {
                  const total = lancamentos.filter(l => cats.includes(l.categoria) && l.tipo === "saida").reduce((s,l) => s + Number(l.valor), 0);
                  if (total === 0) return null;
                  const porAluno = numAlunos > 0 ? total / numAlunos : 0;
                  const pct = custoTotal > 0 ? Math.round((total / custoTotal) * 100) : 0;
                  return (
                    <div key={nome} style={{ marginBottom: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                        <span style={{ color: "#555", fontWeight: 500 }}>{nome}</span>
                        <span style={{ color: "#333" }}>{fmtMoeda(porAluno)}/aluno <span style={{ color: "#aaa" }}>({pct}%)</span></span>
                      </div>
                      <div style={{ height: 6, background: "#f0f0ee", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: "#1D9E75", borderRadius: 3, opacity: 0.7 }} />
                      </div>
                    </div>
                  );
                })}
                {custoTotal === 0 && <div style={{ fontSize: 13, color: "#aaa", textAlign: "center", padding: "2rem 0" }}>Sem despesas no periodo selecionado.</div>}
              </div>
            </div>

            {/* Tabela simulacao por turno */}
            <div style={{ background: "#fff", border: "0.5px solid #e0e0e0", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", borderBottom: "0.5px solid #e0e0e0", fontSize: 14, fontWeight: 500 }}>
                Simulacao por turno
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr style={{ background: "#f7f7f5" }}>
                  {["Turno","Horas/dia","Custo real","Sugerido (+"+margemCalc+"%)"].map(h => (
                    <th key={h} style={{ padding: "10px 20px", fontSize: 12, fontWeight: 500, color: "#777", textAlign: h === "Turno" ? "left" : "right", borderBottom: "0.5px solid #e0e0e0" }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {[["Meio periodo","4h",4],["Periodo estendido","6h",6],["Integral","8h",8],["Integral plus","10h",10]].map(([turno, label, h]) => {
                    const custo = custoHora * h * 22;
                    const sugerido = custo * (1 + margemCalc / 100);
                    return (
                      <tr key={turno} style={{ borderBottom: "0.5px solid #f0f0f0", background: h === horasDia ? "#F0FAF6" : "transparent" }}>
                        <td style={{ padding: "12px 20px", fontSize: 13, fontWeight: h === horasDia ? 600 : 400 }}>
                          {turno} {h === horasDia && <span style={{ fontSize: 10, background: "#1D9E75", color: "#fff", padding: "1px 6px", borderRadius: 10, marginLeft: 6 }}>selecionado</span>}
                        </td>
                        <td style={{ padding: "12px 20px", fontSize: 13, textAlign: "right", color: "#888" }}>{label}</td>
                        <td style={{ padding: "12px 20px", fontSize: 13, textAlign: "right", color: "#A32D2D", fontWeight: 500 }}>{fmtMoeda(custo)}</td>
                        <td style={{ padding: "12px 20px", fontSize: 13, textAlign: "right", color: "#1D9E75", fontWeight: 600 }}>{fmtMoeda(sugerido)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* ── REGRAS DA IA ── */}
      {aba === "regras" && (
        <div style={{ background: "#fff", border: "0.5px solid #e0e0e0", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "0.5px solid #e0e0e0", fontSize: 14, fontWeight: 500 }}>
            Regras aprendidas pela IA
            <span style={{ fontSize: 12, color: "#888", fontWeight: 400, marginLeft: 8 }}>fornecedor → categoria automatica</span>
          </div>
          {Object.keys(regras).length === 0 && (
            <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: "#aaa" }}>
              Nenhuma regra ainda. Importe documentos para a IA aprender automaticamente.
            </div>
          )}
          <Table headers={["Fornecedor / Descricao", "Categoria automatica", ""]}>
            {Object.entries(regras).map(([forn, cat]) => (
              <tr key={forn} style={{ borderBottom: "0.5px solid #f0f0f0" }}>
                <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 500 }}>{forn}</td>
                <td style={{ padding: "10px 14px" }}><Badge color="info">{cat}</Badge></td>
                <td style={{ padding: "10px 14px" }}>
                  <Btn small variant="danger" onClick={async () => { await supabase.from("financeiro_regras").delete().eq("fornecedor_chave", forn); carregarRegras(); }}>Remover</Btn>
                </td>
              </tr>
            ))}
          </Table>
        </div>
      )}

      {/* ── MODAL: Lancamento ── */}
      {modal === "form" && (
        <Modal title={editLanc ? "Editar lancamento" : "Novo lancamento"} onClose={() => setModal(null)}>
          <Input label="Descricao *" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Ex: Compra de arroz, Pagamento luz, Rescisao funcionario..." />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Input label="Valor (R$) *" type="number" step="0.01" min="0" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
            <Input label="Data" type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <SelectField label="Tipo" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
              <option value="saida">Saida (despesa)</option>
              <option value="entrada">Entrada (receita)</option>
            </SelectField>
            <SelectField label="Categoria" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value, subcategoria: "" })}>
              {categorias.map((c) => <option key={c}>{c}</option>)}
            </SelectField>
          </div>
          <Input label="Subcategoria (opcional)" value={form.subcategoria || ""} onChange={(e) => setForm({ ...form, subcategoria: e.target.value })} placeholder="Ex: Repasse convenio, Vaga particular, FGTS multa 40%..." />
          <Input label="Observacao (opcional)" value={form.observacao || ""} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <Btn onClick={() => setModal(null)}>Cancelar</Btn>
            <Btn variant="primary" onClick={salvar} disabled={loading}>{loading ? "Salvando..." : "Salvar"}</Btn>
          </div>
        </Modal>
      )}

      {/* ── MODAL: Upload ── */}
      {modal === "upload" && (
        <Modal title="Subir documento — leitura automatica por IA" onClose={() => { setModal(null); setUploadResultados([]); setUploadFile(null); setUploadErro(""); }} width={680}>
          {uploadResultados.length === 0 ? (
            <>
              <div style={{ border: "1.5px dashed #ccc", borderRadius: 10, padding: "2rem", textAlign: "center", marginBottom: 16, cursor: "pointer", background: "#fafafa" }}
                onClick={() => document.getElementById("fileInput").click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setUploadFile(f); }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: "#333" }}>{uploadFile ? uploadFile.name : "Clique ou arraste o arquivo aqui"}</div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>PDF de extrato, nota fiscal, foto de comprovante ou cupom</div>
                <input id="fileInput" type="file" accept=".pdf,image/*" style={{ display: "none" }} onChange={(e) => setUploadFile(e.target.files[0])} />
              </div>
              {uploadErro && <AlertBar type="danger">{uploadErro}</AlertBar>}
              <div style={{ fontSize: 12, color: "#888", marginBottom: 16, padding: "10px", background: "#f7f7f5", borderRadius: 8 }}>
                A IA vai ler o documento e sugerir categorias automaticamente. Documentos com "RESCISAO", "FGTS", "AVISO PREVIO" serao automaticamente categorizados como encargos de demissao.
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <Btn onClick={() => { setModal(null); setUploadFile(null); setUploadErro(""); }}>Cancelar</Btn>
                <Btn variant="primary" onClick={processarArquivo} disabled={!uploadFile || uploadLoading}>
                  {uploadLoading ? "Processando..." : "Processar com IA"}
                </Btn>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, color: "#555", marginBottom: 12, padding: "10px", background: "#E1F5EE", borderRadius: 8 }}>
                A IA encontrou {uploadResultados.length} lancamento(s). Revise e desmarque os que nao deseja importar.
              </div>
              <div style={{ maxHeight: 380, overflowY: "auto", marginBottom: 16 }}>
                {uploadResultados.map((l, idx) => (
                  <div key={idx} style={{ padding: "10px 12px", borderBottom: "0.5px solid #f0f0f0", opacity: l._ignorar ? 0.4 : 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                      <input type="checkbox" checked={!l._ignorar}
                        onChange={(e) => setUploadResultados((prev) => prev.map((r, i) => i === idx ? { ...r, _ignorar: !e.target.checked } : r))}
                        style={{ width: 16, height: 16, accentColor: "#1D9E75" }} />
                      <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{l.descricao}</span>
                      <span style={{ fontSize: 13, fontWeight: 500, color: l.tipo === "entrada" ? "#1D9E75" : "#A32D2D" }}>
                        {l.tipo === "entrada" ? "+" : "-"}{fmtMoeda(l.valor)}
                      </span>
                      <span style={{ fontSize: 11, color: "#888" }}>{fmt(l.data)}</span>
                      <span style={{ background: CONFIANCA_COLOR[l.confianca] || "#f0f0ee", color: CONFIANCA_TEXT[l.confianca] || "#555", padding: "2px 8px", borderRadius: 20, fontSize: 10 }}>{l.confianca}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 26, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12, color: "#888" }}>Categoria:</span>
                      <select value={l.categoria_sugerida}
                        onChange={(e) => setUploadResultados((prev) => prev.map((r, i) => i === idx ? { ...r, categoria_sugerida: e.target.value } : r))}
                        style={{ padding: "4px 8px", borderRadius: 6, border: "0.5px solid #ccc", fontSize: 12, fontFamily: "inherit", background: "#fff" }}>
                        {categorias.map((c) => <option key={c}>{c}</option>)}
                      </select>
                      {l.subcategoria_sugerida && <span style={{ fontSize: 11, color: "#888" }}>↳ {l.subcategoria_sugerida}</span>}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ background: "#f7f7f5", borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: "#555", marginBottom: 8 }}>Gerenciar categorias</div>
                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  <input value={novaCatUpload} onChange={(e) => setNovaCatUpload(e.target.value)}
                    placeholder="Nova categoria..." onKeyDown={(e) => e.key === "Enter" && adicionarCategoriaUpload()}
                    style={{ flex: 1, padding: "5px 8px", borderRadius: 6, border: "0.5px solid #ccc", fontSize: 12, fontFamily: "inherit" }} />
                  <Btn small variant="primary" onClick={adicionarCategoriaUpload}>+ Adicionar</Btn>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {categorias.filter(c => !CATS_DEFAULT.includes(c)).map(cat => (
                    <span key={cat} style={{ display: "flex", alignItems: "center", gap: 4, background: "#fff", border: "0.5px solid #e0e0e0", borderRadius: 20, padding: "3px 10px", fontSize: 11 }}>
                      {cat}
                      <button onClick={() => removerCategoriaUpload(cat)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#A32D2D", fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
                    </span>
                  ))}
                  {categorias.filter(c => !CATS_DEFAULT.includes(c)).length === 0 && (
                    <span style={{ fontSize: 11, color: "#aaa" }}>Nenhuma categoria personalizada ainda.</span>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <Btn onClick={() => { setUploadResultados([]); setUploadFile(null); }}>Voltar</Btn>
                <Btn variant="primary" onClick={confirmarLancamentos} disabled={loading}>{loading ? "Importando..." : "Confirmar e importar"}</Btn>
              </div>
            </>
          )}
        </Modal>
      )}

      {/* ── MODAL: Categorias ── */}
      {modal === "categorias" && (
        <Modal title="Gerenciar categorias financeiras" onClose={() => setModal(null)} width={420}>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input value={novaCat} onChange={(e) => setNovaCat(e.target.value)} placeholder="Nome da nova categoria..."
              onKeyDown={(e) => e.key === "Enter" && adicionarCategoria()}
              style={{ flex: 1, padding: "8px 10px", borderRadius: 7, border: "0.5px solid #ccc", fontSize: 13, fontFamily: "inherit" }} />
            <Btn variant="primary" onClick={adicionarCategoria}>Adicionar</Btn>
          </div>
          <div style={{ maxHeight: 360, overflowY: "auto" }}>
            {categorias.map((cat) => (
              <div key={cat} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "0.5px solid #f0f0f0" }}>
                <div>
                  <span style={{ fontSize: 13 }}>{cat}</span>
                  {CATS_DEMISSAO.includes(cat) && <span style={{ fontSize: 10, color: "#A32D2D", marginLeft: 6, background: "#FCEBEB", padding: "1px 6px", borderRadius: 10 }}>demissao</span>}
                </div>
                {!CATS_DEFAULT.includes(cat)
                  ? <Btn small variant="danger" onClick={() => removerCategoria(cat)}>Remover</Btn>
                  : <span style={{ fontSize: 11, color: "#aaa" }}>padrao</span>}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
            <Btn onClick={() => setModal(null)}>Fechar</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
