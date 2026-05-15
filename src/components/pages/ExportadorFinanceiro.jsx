import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useApp } from "../../context/AppContext";
import { Modal, Btn, Input, SelectField, Msg } from "../ui";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

const OPCOES_PERIODO = [
  { id: "hoje", label: "Hoje" },
  { id: "ultimos7", label: "Últimos 7 dias" },
  { id: "mesAtual", label: "Este mês" },
  { id: "ultimos30", label: "Últimos 30 dias" },
  { id: "semestre", label: "Este semestre" },
  { id: "ano", label: "Este ano" },
  { id: "personalizado", label: "Personalizado" },
];

export default function ExportadorFinanceiro({ onClose }) {
  const { usuario } = useApp();
  
  // States para opções
  const [formato, setFormato] = useState("XLSX");
  const [periodoRef, setPeriodoRef] = useState("mesAtual");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  
  const [filtroTipo, setFiltroTipo] = useState("todos"); // todos, receitas, despesas
  const [filtroCat, setFiltroCat] = useState("todas");
  const [filtroConta, setFiltroConta] = useState("todas");
  
  // Listas do banco
  const [categorias, setCategorias] = useState([]);
  const [contas, setContas] = useState([]);
  
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const showMsg = (m) => { setMsg(m); setTimeout(() => setMsg(""), 4000); };

  // Carregar listas
  useEffect(() => {
    async function loadLists() {
      const [cats, cnts] = await Promise.all([
        supabase.from("fin_categorias").select("*").order("nome"),
        supabase.from("fin_contas").select("*").order("nome")
      ]);
      if (cats.data) setCategorias(cats.data);
      if (cnts.data) setContas(cnts.data);
    }
    loadLists();
  }, []);

  // Atualizar datas quando muda o período rápido
  useEffect(() => {
    if (periodoRef === "personalizado") return;
    
    const hoje = new Date();
    let inicio, fim;
    
    switch (periodoRef) {
      case "hoje":
        inicio = new Date(); fim = new Date();
        break;
      case "ultimos7":
        inicio = new Date(); inicio.setDate(hoje.getDate() - 7);
        fim = new Date();
        break;
      case "mesAtual":
        inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
        break;
      case "ultimos30":
        inicio = new Date(); inicio.setDate(hoje.getDate() - 30);
        fim = new Date();
        break;
      case "semestre":
        const m = hoje.getMonth();
        inicio = new Date(hoje.getFullYear(), m < 6 ? 0 : 6, 1);
        fim = new Date(hoje.getFullYear(), m < 6 ? 6 : 12, 0);
        break;
      case "ano":
        inicio = new Date(hoje.getFullYear(), 0, 1);
        fim = new Date(hoje.getFullYear(), 11, 31);
        break;
      default:
        return;
    }
    
    setDataInicio(inicio.toISOString().split("T")[0]);
    setDataFim(fim.toISOString().split("T")[0]);
  }, [periodoRef]);

  // Função principal de exportação
  async function handleExport() {
    if (!dataInicio || !dataFim) return showMsg("Datas inválidas.");
    if (new Date(dataInicio) > new Date(dataFim)) return showMsg("Data inicial maior que a final.");

    setLoading(true);

    try {
      // 1. Buscar Receitas
      let reqRec = supabase.from("fin_receitas").select("*, fin_categorias(nome), fin_contas(nome, tipo)").gte("data", dataInicio).lte("data", dataFim);
      if (filtroCat !== "todas") reqRec = reqRec.eq("categoria_id", filtroCat);
      if (filtroConta !== "todas") reqRec = reqRec.eq("conta_id", filtroConta);
      
      // 2. Buscar Despesas
      let reqDesp = supabase.from("fin_despesas").select("*, fin_categorias(nome), fin_contas(nome, tipo)").gte("data", dataInicio).lte("data", dataFim);
      if (filtroCat !== "todas") reqDesp = reqDesp.eq("categoria_id", filtroCat);
      if (filtroConta !== "todas") reqDesp = reqDesp.eq("conta_id", filtroConta);

      const [resRec, resDesp] = await Promise.all([reqRec, reqDesp]);

      if (resRec.error) throw resRec.error;
      if (resDesp.error) throw resDesp.error;

      const receitas = filtroTipo !== "saidas" ? (resRec.data || []) : [];
      const despesas = filtroTipo !== "entradas" ? (resDesp.data || []) : [];

      if (receitas.length === 0 && despesas.length === 0) {
        setLoading(false);
        return showMsg("Nenhum registro encontrado para este período/filtro.");
      }

      // Preparar os dados unificados
      const mapItem = (item, isReceita) => ({
        id: item.id,
        data: item.data,
        tipo: isReceita ? "Entrada" : "Saída",
        categoria: item.fin_categorias?.nome || "Sem Categoria",
        descricao: item.descricao || "",
        valor: Number(item.valor) || 0,
        forma_pagamento: item.fin_contas?.tipo || "Desconhecido",
        status: item.status || "Concluído",
        pessoa: item.pessoa || "",
        conta: item.fin_contas?.nome || "Sem Conta",
        usuario: item.usuario_nome || "",
        observacao: item.observacao || "",
        criado_em: new Date(item.criado_em).toLocaleString("pt-BR")
      });

      const todos = [
        ...receitas.map(r => mapItem(r, true)),
        ...despesas.map(d => mapItem(d, false))
      ].sort((a, b) => a.data.localeCompare(b.data)); // ordenar por data

      const totalEntradas = receitas.reduce((acc, r) => acc + Number(r.valor), 0);
      const totalSaidas = despesas.reduce((acc, d) => acc + Number(d.valor), 0);
      const saldoFinal = totalEntradas - totalSaidas;

      // Montar nome do arquivo
      const dataSufix = periodoRef !== "personalizado" ? periodoRef : `${dataInicio}_a_${dataFim}`;
      const fileName = `fluxo-caixa-${dataSufix}.${formato.toLowerCase()}`;

      if (formato === "CSV") {
        gerarCSV(todos, totalEntradas, totalSaidas, saldoFinal, fileName);
      } else {
        await gerarXLSX(receitas.map(r => mapItem(r, true)), despesas.map(d => mapItem(d, false)), totalEntradas, totalSaidas, saldoFinal, fileName);
      }

      showMsg("Exportação concluída com sucesso!");
      setTimeout(onClose, 2000);

    } catch (err) {
      console.error(err);
      showMsg("Erro ao exportar: " + err.message);
    }
    setLoading(false);
  }

  function gerarCSV(dados, totalEntradas, totalSaidas, saldoFinal, fileName) {
    const colunas = [
      "ID", "Data", "Tipo", "Categoria", "Descrição", "Valor", 
      "Forma Pagamento", "Status", "Cliente/Fornecedor", "Conta", 
      "Usuário", "Observação", "Criado em"
    ];

    const formatData = (d) => d.split("-").reverse().join("/");
    
    let csvContent = colunas.join(";") + "\n";
    
    dados.forEach(d => {
      const row = [
        d.id,
        formatData(d.data),
        d.tipo,
        d.categoria,
        `"${d.descricao.replace(/"/g, '""')}"`,
        d.valor.toFixed(2).replace(".", ","),
        d.forma_pagamento,
        d.status,
        `"${d.pessoa.replace(/"/g, '""')}"`,
        d.conta,
        `"${d.usuario}"`,
        `"${d.observacao.replace(/"/g, '""')}"`,
        d.criado_em
      ];
      csvContent += row.join(";") + "\n";
    });

    // Rodapé
    csvContent += "\n";
    csvContent += `RESUMO FINANCEIRO\n`;
    csvContent += `Total Entradas;${totalEntradas.toFixed(2).replace(".", ",")}\n`;
    csvContent += `Total Saídas;${totalSaidas.toFixed(2).replace(".", ",")}\n`;
    csvContent += `Saldo Final;${saldoFinal.toFixed(2).replace(".", ",")}\n`;

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    saveAs(blob, fileName);
  }

  async function gerarXLSX(entradas, saidas, totalE, totalS, saldoF, fileName) {
    const wb = new ExcelJS.Workbook();
    wb.creator = "GestCEI";
    wb.created = new Date();

    const colsConfig = [
      { header: "Data", key: "data", width: 12 },
      { header: "Tipo", key: "tipo", width: 12 },
      { header: "Categoria", key: "categoria", width: 25 },
      { header: "Descrição", key: "descricao", width: 40 },
      { header: "Valor (R$)", key: "valor", width: 15 },
      { header: "Forma Pagamento", key: "forma_pagamento", width: 18 },
      { header: "Status", key: "status", width: 15 },
      { header: "Cliente/Fornecedor", key: "pessoa", width: 25 },
      { header: "Conta", key: "conta", width: 20 },
      { header: "Usuário Responsável", key: "usuario", width: 20 },
      { header: "Observações", key: "observacao", width: 30 },
      { header: "ID", key: "id", width: 10 },
      { header: "Data Criação", key: "criado_em", width: 20 },
    ];

    // Estilo cabeçalho
    const styleHeader = (worksheet) => {
      worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2C3E50" } };
      worksheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
    };

    // Formatação de linhas
    const styleRows = (worksheet) => {
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
          // Format Data
          const dataVal = row.getCell(1).value;
          if (dataVal) row.getCell(1).value = new Date(dataVal + "T12:00:00");
          row.getCell(1).numFmt = "dd/mm/yyyy";
          
          // Format Moeda
          row.getCell(5).numFmt = '"R$" #,##0.00';
          
          // Cores condicionais Tipo
          const tipo = row.getCell(2).value;
          if (tipo === "Entrada") {
            row.getCell(5).font = { color: { argb: "FF1D9E75" }, bold: true };
          } else if (tipo === "Saída") {
            row.getCell(5).font = { color: { argb: "FFE74C3C" }, bold: true };
          }
        }
      });
    };

    // Aba 1: Resumo
    const wsResumo = wb.addWorksheet("Resumo", { properties: { tabColor: { argb: "FF1D9E75" } } });
    wsResumo.columns = [
      { header: "", width: 5 },
      { header: "Métrica", width: 25 },
      { header: "Valor (R$)", width: 20 }
    ];
    
    wsResumo.getCell("B2").value = "RESUMO FINANCEIRO";
    wsResumo.getCell("B2").font = { size: 16, bold: true, color: { argb: "FF2C3E50" } };
    wsResumo.getCell("B3").value = `Período: ${dataInicio.split("-").reverse().join("/")} até ${dataFim.split("-").reverse().join("/")}`;
    wsResumo.getCell("B3").font = { italic: true, color: { argb: "FF7F8C8D" } };
    
    wsResumo.addRow([]);
    wsResumo.addRow(["", "Total Entradas", totalE]).font = { bold: true };
    wsResumo.addRow(["", "Total Saídas", totalS]).font = { bold: true };
    wsResumo.addRow([]);
    wsResumo.addRow(["", "SALDO FINAL", saldoF]).font = { bold: true, size: 14 };

    // Formatando números no Resumo
    wsResumo.getCell("C5").numFmt = '"R$" #,##0.00';
    wsResumo.getCell("C5").font = { color: { argb: "FF1D9E75" }, bold: true };
    wsResumo.getCell("C6").numFmt = '"R$" #,##0.00';
    wsResumo.getCell("C6").font = { color: { argb: "FFE74C3C" }, bold: true };
    wsResumo.getCell("C8").numFmt = '"R$" #,##0.00';
    wsResumo.getCell("C8").font = { color: { argb: saldoF >= 0 ? "FF1D9E75" : "FFE74C3C" }, bold: true, size: 14 };

    // Aba 2: Entradas
    if (filtroTipo !== "saidas") {
      const wsRec = wb.addWorksheet("Entradas", { properties: { tabColor: { argb: "FF27AE60" } } });
      wsRec.columns = colsConfig;
      wsRec.addRows(entradas.sort((a,b) => a.data.localeCompare(b.data)));
      styleHeader(wsRec);
      styleRows(wsRec);
    }

    // Aba 3: Saídas
    if (filtroTipo !== "entradas") {
      const wsDesp = wb.addWorksheet("Saídas", { properties: { tabColor: { argb: "FFE74C3C" } } });
      wsDesp.columns = colsConfig;
      wsDesp.addRows(saidas.sort((a,b) => a.data.localeCompare(b.data)));
      styleHeader(wsDesp);
      styleRows(wsDesp);
    }

    const buffer = await wb.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), fileName);
  }

  return (
    <Modal title="📤 Exportar Relatório Financeiro" onClose={onClose}>
      <Msg text={msg} />
      
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <SelectField label="Formato" value={formato} onChange={e => setFormato(e.target.value)}>
          <option value="XLSX">Planilha Excel (XLSX)</option>
          <option value="CSV">Arquivo texto (CSV)</option>
        </SelectField>

        <SelectField label="Período" value={periodoRef} onChange={e => setPeriodoRef(e.target.value)}>
          {OPCOES_PERIODO.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </SelectField>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12, opacity: periodoRef === "personalizado" ? 1 : 0.5 }}>
        <Input label="Data Inicial" type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} disabled={periodoRef !== "personalizado"} />
        <Input label="Data Final" type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} disabled={periodoRef !== "personalizado"} />
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, color: "#555", marginTop: 16, marginBottom: 8, borderBottom: "0.5px solid #eee", paddingBottom: 4 }}>Filtros Opcionais</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
        <SelectField label="Tipo" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
          <option value="todos">Todos</option>
          <option value="entradas">Só Entradas</option>
          <option value="saidas">Só Saídas</option>
        </SelectField>

        <SelectField label="Categoria" value={filtroCat} onChange={e => setFiltroCat(e.target.value)}>
          <option value="todas">Todas</option>
          {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </SelectField>

        <SelectField label="Conta" value={filtroConta} onChange={e => setFiltroConta(e.target.value)}>
          <option value="todas">Todas</option>
          {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </SelectField>
      </div>

      <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 24 }}>
        <Btn onClick={onClose} disabled={loading}>Cancelar</Btn>
        <Btn variant="primary" onClick={handleExport} disabled={loading}>
          {loading ? "Processando..." : `Baixar ${formato}`}
        </Btn>
      </div>
    </Modal>
  );
}
