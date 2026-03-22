import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { useApp } from "../../context/AppContext";
import { useAuditoria } from "../../hooks/useAuditoria";
import { fmt, fmtMes, fmtMoeda, CATS_DEFAULT } from "../../lib/helpers";
import { processarDocumentoIA } from "../../api/claude";
import {
  Btn, Input, SelectField, Modal, ConfirmModal,
  MetricCard, AlertBar, Msg, PageHeader, Table, EmptyRow, Badge,
} from "../ui";

const CONFIANCA_COLOR = { alta: "#E1F5EE", media: "#FAEEDA", baixa: "#FCEBEB" };
const CONFIANCA_TEXT  = { alta: "#085041", media: "#633806", baixa: "#791F1F" };

export default function Financeiro() {
  const { usuario } = useApp();
  const { log } = useAuditoria(usuario);

  const [lancamentos, setLancamentos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [regras, setRegras] = useState({});
  const [mesFiltro, setMesFiltro] = useState(new Date().toISOString().slice(0, 7));
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

  const showMsg = (m) => { setMsg(m); setTimeout(() => setMsg(""), 4000); };

  const carregarLancamentos = useCallback(async () => {
    const { data } = await supabase
      .from("financeiro")
      .select("*")
      .gte("data", mesFiltro + "-01")
      .lte("data", mesFiltro + "-31")
      .order("data", { ascending: false });
    setLancamentos(data || []);
  }, [mesFiltro]);

  const carregarCategorias = useCallback(async () => {
    const { data } = await supabase.from("financeiro_categorias").select("*").order("nome");
    setCategorias(data && data.length > 0 ? data.map((c) => c.nome) : CATS_DEFAULT);
  }, []);

  const carregarRegras = useCallback(async () => {
    const { data } = await supabase.from("financeiro_regras").select("*");
    if (data) {
      const r = {};
      data.forEach((d) => { r[d.fornecedor_chave] = d.categoria; });
      setRegras(r);
    }
  }, []);

  useEffect(() => { carregarLancamentos(); }, [carregarLancamentos]);
  useEffect(() => { carregarCategorias(); carregarRegras(); }, [carregarCategorias, carregarRegras]);

  // ── Cálculos ──────────────────────────────────────────────
  const lancFiltrados = lancamentos.filter((l) =>
    (!catFiltro || l.categoria === catFiltro) && (!tipoFiltro || l.tipo === tipoFiltro)
  );
  const totalEntradas = lancamentos.filter((l) => l.tipo === "entrada").reduce((s, l) => s + Number(l.valor), 0);
  const totalSaidas   = lancamentos.filter((l) => l.tipo === "saida").reduce((s, l) => s + Number(l.valor), 0);
  const saldo = totalEntradas - totalSaidas;
  const margem = totalEntradas > 0 ? Math.round((saldo / totalEntradas) * 100) : 0;

  const porCategoriaSaida = categorias
    .map((cat) => ({ cat, total: lancamentos.filter((l) => l.categoria === cat && l.tipo === "saida").reduce((s, l) => s + Number(l.valor), 0) }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);

  const porCategoriaEntrada = Object.entries(
    lancamentos.filter((l) => l.tipo === "entrada").reduce((acc, l) => { acc[l.categoria] = (acc[l.categoria] || 0) + Number(l.valor); return acc; }, {})
  ).sort((a, b) => b[1] - a[1]);

  const maxCatSaida = porCategoriaSaida[0]?.total || 1;

  const dreEntradas = lancamentos.filter((l) => l.tipo === "entrada").reduce((acc, l) => { acc[l.categoria] = (acc[l.categoria] || 0) + Number(l.valor); return acc; }, {});
  const dreSaidas   = lancamentos.filter((l) => l.tipo === "saida").reduce((acc, l) => { acc[l.categoria] = (acc[l.categoria] || 0) + Number(l.valor); return acc; }, {});

  const meses = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    meses.push(d.toISOString().slice(0, 7));
  }

  // ── CRUD lançamentos ──────────────────────────────────────
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
    setModal(null);
    setLoading(false);
    carregarLancamentos();
    showMsg("Lancamento salvo!");
  }

  async function excluir(l) {
    setConfirmData(null);
    await supabase.from("financeiro").delete().eq("id", l.id);
    await log("financeiro", "DELETE", l.id, `Excluiu lancamento "${l.descricao}"`, l, null);
    carregarLancamentos();
    showMsg("Lancamento excluido.");
  }

  // ── Upload com IA ─────────────────────────────────────────
  async function processarArquivo() {
    if (!uploadFile) return;
    setUploadLoading(true);
    setUploadErro("");
    setUploadResultados([]);
    try {
      const resultado = await processarDocumentoIA(uploadFile, categorias, regras);
      const items = resultado.lancamentos || [];
      setUploadResultados(items);
      if (items.length === 0) setUploadErro("Nenhum lancamento encontrado no documento.");
    } catch (e) {
      setUploadErro("Erro ao processar: " + e.message);
    }
    setUploadLoading(false);
  }

  async function confirmarLancamentos() {
    setLoading(true);
    for (const l of uploadResultados) {
      if (l._ignorar) continue;
      await supabase.from("financeiro").insert({
        descricao: l.descricao,
        valor: l.valor,
        tipo: l.tipo,
        categoria: l.categoria_sugerida,
        subcategoria: l.subcategoria_sugerida || null,
        data: l.data,
        observacao: `Importado via IA - ${uploadFile.name}`,
        usuario_id: usuario.id,
        usuario_nome: usuario.nome,
      });
      if (l.fornecedor_chave && l.categoria_sugerida) {
        await supabase.from("financeiro_regras").upsert(
          { fornecedor_chave: l.fornecedor_chave, categoria: l.categoria_sugerida },
          { onConflict: "fornecedor_chave" }
        );
      }
    }
    const importados = uploadResultados.filter((l) => !l._ignorar).length;
    await log("financeiro", "INSERT", null, `Importou ${importados} lancamentos via IA do arquivo "${uploadFile.name}"`, null, null);
    setUploadResultados([]);
    setUploadFile(null);
    setModal(null);
    setLoading(false);
    carregarLancamentos();
    carregarRegras();
    showMsg(`${importados} lancamentos importados com sucesso!`);
  }

  // ── Categorias ─────────────────────────────────────────────
  async function adicionarCategoria() {
    if (!novaCat.trim()) return;
    await supabase.from("financeiro_categorias").insert({ nome: novaCat.trim() });
    setNovaCat("");
    carregarCategorias();
  }

  async function removerCategoria(nome) {
    await supabase.from("financeiro_categorias").delete().eq("nome", nome);
    carregarCategorias();
  }

  return (
    <div style={{ padding: "1.5rem", maxWidth: 1100, margin: "0 auto" }}>
      {confirmData && <ConfirmModal {...confirmData} onCancel={() => setConfirmData(null)} />}

      <PageHeader title="Financeiro" subtitle="Fluxo de caixa, DRE e dashboard">
        <Btn variant="info" onClick={() => setModal("categorias")}>Categorias</Btn>
        <Btn onClick={() => setModal("upload")}>Subir documento</Btn>
        <Btn variant="primary" onClick={() => {
          setForm({ descricao: "", valor: "", tipo: "saida", categoria: categorias[0] || "", subcategoria: "", data: new Date().toISOString().split("T")[0], observacao: "" });
          setEditLanc(null);
          setModal("form");
        }}>+ Lancamento</Btn>
      </PageHeader>

      {/* Sub-abas */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "0.5px solid #e0e0e0", paddingBottom: 12 }}>
        {[["lancamentos","Lancamentos"],["dre","DRE Mensal"],["dashboard","Dashboard"],["regras","Regras da IA"]].map(([k,l]) => (
          <button key={k} onClick={() => setAba(k)}
            style={{ padding: "6px 16px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 13,
              background: aba === k ? "#1D9E75" : "transparent",
              color: aba === k ? "#fff" : "#555",
              fontWeight: aba === k ? 500 : 400 }}>
            {l}
          </button>
        ))}
        <div style={{ marginLeft: "auto" }}>
          <select value={mesFiltro} onChange={(e) => setMesFiltro(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: 7, border: "0.5px solid #ccc", fontSize: 13, fontFamily: "inherit", background: "#fff" }}>
            {meses.map((m) => <option key={m} value={m}>{fmtMes(m + "-01")}</option>)}
          </select>
        </div>
      </div>

      <Msg text={msg} />

      {/* KPIs sempre visíveis */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 20 }}>
        <MetricCard label="Receita total" value={fmtMoeda(totalEntradas)} subColor="#1D9E75" sub="entradas" accent="#E1F5EE" />
        <MetricCard label="Despesa total" value={fmtMoeda(totalSaidas)} subColor="#A32D2D" sub="saidas" accent="#FCEBEB" />
        <MetricCard label="Resultado" value={fmtMoeda(saldo)} subColor={saldo >= 0 ? "#1D9E75" : "#A32D2D"} sub={saldo >= 0 ? "superavit" : "deficit"} />
        <MetricCard label="Margem" value={`${margem}%`} subColor={margem >= 0 ? "#1D9E75" : "#A32D2D"} sub={margem >= 0 ? "de resultado" : "de prejuizo"} />
      </div>

      {/* ── LANCAMENTOS ── */}
      {aba === "lancamentos" && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <select value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value)}
              style={{ padding: "7px 12px", borderRadius: 7, border: "0.5px solid #ccc", fontSize: 13, fontFamily: "inherit", background: "#fff" }}>
              <option value="">Todos os tipos</option>
              <option value="entrada">Somente entradas</option>
              <option value="saida">Somente saidas</option>
            </select>
            <select value={catFiltro} onChange={(e) => setCatFiltro(e.target.value)}
              style={{ padding: "7px 12px", borderRadius: 7, border: "0.5px solid #ccc", fontSize: 13, fontFamily: "inherit", background: "#fff" }}>
              <option value="">Todas as categorias</option>
              {categorias.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <Table headers={["Data","Descricao","Categoria","Tipo","Valor","Por",""]}>
            {lancFiltrados.map((l) => (
              <tr key={l.id} style={{ borderBottom: "0.5px solid #f0f0f0" }}>
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
            {lancFiltrados.length === 0 && <EmptyRow colSpan={7} message="Nenhum lancamento encontrado." />}
          </Table>
        </>
      )}

      {/* ── DRE ── */}
      {aba === "dre" && (
        <div style={{ background: "#fff", border: "0.5px solid #e0e0e0", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "0.5px solid #e0e0e0", fontSize: 14, fontWeight: 500 }}>
            Demonstrativo de Resultado — {fmtMes(mesFiltro + "-01")}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f7f7f5" }}>
                <th style={{ padding: "10px 20px", fontSize: 12, fontWeight: 500, color: "#777", textAlign: "left", borderBottom: "0.5px solid #e0e0e0" }}>Descricao</th>
                <th style={{ padding: "10px 20px", fontSize: 12, fontWeight: 500, color: "#777", textAlign: "right", borderBottom: "0.5px solid #e0e0e0" }}>Valor</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colSpan={2} style={{ padding: "10px 20px", fontSize: 12, fontWeight: 500, color: "#1D9E75", background: "#f0faf5", borderBottom: "0.5px solid #e0e0e0" }}>RECEITAS</td></tr>
              {Object.entries(dreEntradas).map(([cat, val]) => (
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
              {Object.entries(dreSaidas).map(([cat, val]) => (
                <tr key={cat} style={{ borderBottom: "0.5px solid #f0f0f0" }}>
                  <td style={{ padding: "9px 20px 9px 32px", fontSize: 13, color: "#555" }}>{cat}</td>
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
                const subs = lancamentos.filter((l) => l.tipo === "saida" && l.categoria === cat && l.subcategoria)
                  .reduce((acc, l) => { acc[l.subcategoria] = (acc[l.subcategoria] || 0) + Number(l.valor); return acc; }, {});
                return (
                  <div key={cat} style={{ marginBottom: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                      <span style={{ fontWeight: 500 }}>{cat}</span>
                      <span style={{ color: "#A32D2D", fontWeight: 500 }}>{fmtMoeda(total)} <span style={{ fontSize: 11, color: "#aaa", fontWeight: 400 }}>({pct}%)</span></span>
                    </div>
                    <div style={{ height: 7, background: "#f0f0f0", borderRadius: 4, overflow: "hidden", marginBottom: 4 }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: "#A32D2D", borderRadius: 4, opacity: 0.7 }} />
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
            {/* Últimos lançamentos */}
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

            {/* Análise de margem */}
            <div style={{ background: "#fff", border: "0.5px solid #e0e0e0", borderRadius: 12, padding: "1.25rem" }}>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 16 }}>Analise de margem</div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                  <span style={{ color: "#888" }}>Receita bruta</span>
                  <span style={{ fontWeight: 500, color: "#1D9E75" }}>{fmtMoeda(totalEntradas)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                  <span style={{ color: "#888" }}>(-) Despesas totais</span>
                  <span style={{ fontWeight: 500, color: "#A32D2D" }}>-{fmtMoeda(totalSaidas)}</span>
                </div>
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
                <div style={{ fontSize: 22, fontWeight: 500, color: saldo >= 0 ? "#1D9E75" : "#A32D2D", textAlign: "center" }}>
                  {margem}%
                </div>
                <div style={{ fontSize: 12, color: "#888", textAlign: "center", marginTop: 4 }}>
                  {totalEntradas > 0
                    ? saldo >= 0
                      ? `Para cada R$1,00 de receita, sobram R$${(saldo / totalEntradas).toFixed(2)}`
                      : `Para cada R$1,00 de receita, gasta-se R$${(totalSaidas / totalEntradas).toFixed(2)}`
                    : "Sem receitas no periodo"}
                </div>
              </div>
              {porCategoriaSaida.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>Maior gasto do mes</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{porCategoriaSaida[0].cat}</span>
                    <span style={{ fontSize: 13, color: "#A32D2D", fontWeight: 500 }}>{fmtMoeda(porCategoriaSaida[0].total)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#aaa" }}>
                    {totalSaidas > 0 ? Math.round((porCategoriaSaida[0].total / totalSaidas) * 100) : 0}% do total de despesas
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
          <Table headers={["Fornecedor / Descricao","Categoria automatica",""]}>
            {Object.entries(regras).map(([forn, cat]) => (
              <tr key={forn} style={{ borderBottom: "0.5px solid #f0f0f0" }}>
                <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 500 }}>{forn}</td>
                <td style={{ padding: "10px 14px" }}><Badge color="info">{cat}</Badge></td>
                <td style={{ padding: "10px 14px" }}>
                  <Btn small variant="danger" onClick={async () => {
                    await supabase.from("financeiro_regras").delete().eq("fornecedor_chave", forn);
                    carregarRegras();
                  }}>Remover</Btn>
                </td>
              </tr>
            ))}
          </Table>
        </div>
      )}

      {/* ── MODAL: Lancamento ── */}
      {modal === "form" && (
        <Modal title={editLanc ? "Editar lancamento" : "Novo lancamento"} onClose={() => setModal(null)}>
          <Input label="Descricao *" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Ex: Compra de arroz, Pagamento luz..." />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Input label="Valor (R$) *" type="number" step="0.01" min="0" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} placeholder="0,00" />
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
          <Input label="Subcategoria (opcional)" value={form.subcategoria || ""} onChange={(e) => setForm({ ...form, subcategoria: e.target.value })} placeholder="Ex: Repasse convenio, Vaga particular..." />
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
              <div
                style={{ border: "1.5px dashed #ccc", borderRadius: 10, padding: "2rem", textAlign: "center", marginBottom: 16, cursor: "pointer", background: "#fafafa" }}
                onClick={() => document.getElementById("fileInput").click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setUploadFile(f); }}
              >
                <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: "#333" }}>{uploadFile ? uploadFile.name : "Clique ou arraste o arquivo aqui"}</div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>PDF de extrato, nota fiscal, foto de comprovante ou cupom</div>
                <input id="fileInput" type="file" accept=".pdf,image/*" style={{ display: "none" }} onChange={(e) => setUploadFile(e.target.files[0])} />
              </div>
              {uploadErro && <AlertBar type="danger">{uploadErro}</AlertBar>}
              <div style={{ fontSize: 12, color: "#888", marginBottom: 16, padding: "10px", background: "#f7f7f5", borderRadius: 8 }}>
                A IA vai ler o documento, extrair todos os lancamentos e sugerir categorias baseadas nas regras ja aprendidas. Voce revisa antes de confirmar.
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
              <AlertBar type="success">
                A IA encontrou {uploadResultados.length} lancamento(s). Revise e desmarque os que nao deseja importar.
              </AlertBar>
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
                      <span style={{ background: CONFIANCA_COLOR[l.confianca] || "#f0f0ee", color: CONFIANCA_TEXT[l.confianca] || "#555", padding: "2px 8px", borderRadius: 20, fontSize: 10 }}>
                        {l.confianca}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 26 }}>
                      <span style={{ fontSize: 12, color: "#888" }}>Categoria:</span>
                      <select value={l.categoria_sugerida}
                        onChange={(e) => setUploadResultados((prev) => prev.map((r, i) => i === idx ? { ...r, categoria_sugerida: e.target.value } : r))}
                        style={{ padding: "4px 8px", borderRadius: 6, border: "0.5px solid #ccc", fontSize: 12, fontFamily: "inherit", background: "#fff" }}>
                        {categorias.map((c) => <option key={c}>{c}</option>)}
                      </select>
                      {l.subcategoria_sugerida && (
                        <span style={{ fontSize: 11, color: "#888" }}>↳ {l.subcategoria_sugerida}</span>
                      )}
                    </div>
                  </div>
                ))}
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
                <span style={{ fontSize: 13 }}>{cat}</span>
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
