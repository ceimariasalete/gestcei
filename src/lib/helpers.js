export function fmt(d) {
  if (!d) return "—";
  // Força meio-dia para evitar bug de fuso horário (UTC-3 jogaria para o dia anterior)
  return new Date(d + "T12:00:00").toLocaleDateString("pt-BR");
}

export function fmtMes(d) {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("pt-BR", {
    month: "long", year: "numeric",
  });
}

export function fmtMoeda(v) {
  return Number(v || 0).toLocaleString("pt-BR", {
    style: "currency", currency: "BRL",
  });
}

export function statusItem(item) {
  // Estoque disponível = quantidade armazenada (em_uso não conta como disponível)
  const disponivelReal = Number(item.quantidade || 0);
  const low = disponivelReal <= Number(item.estoque_minimo || 0);

  // Validade é opcional — só verifica se existir
  if (item.validade) {
    const diff = (new Date(item.validade) - new Date()) / 86400000;
    if (diff < 0) return "vencido";
    if (diff <= 30) return "vencendo";
  }
  if (low) return "baixo";
  return "ok";
}

// Retorna quantidade disponível considerando em_uso como separado
export function qtdDisponivel(item) {
  return Number(item.quantidade || 0);
}

// Retorna quantidade em uso
export function qtdEmUso(item) {
  return Number(item.em_uso || 0);
}

export function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = () => rej(new Error("Erro ao ler arquivo"));
    r.readAsDataURL(file);
  });
}

// Retorna inicio e fim para um período predefinido
export function periodoParaDatas(periodo) {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();

  switch (periodo) {
    case "mes_atual":
      return {
        inicio: new Date(ano, mes, 1).toISOString().split("T")[0],
        fim: new Date(ano, mes + 1, 0).toISOString().split("T")[0],
      };
    case "mes_anterior":
      return {
        inicio: new Date(ano, mes - 1, 1).toISOString().split("T")[0],
        fim: new Date(ano, mes, 0).toISOString().split("T")[0],
      };
    case "trimestre_atual": {
      const t = Math.floor(mes / 3);
      return {
        inicio: new Date(ano, t * 3, 1).toISOString().split("T")[0],
        fim: new Date(ano, t * 3 + 3, 0).toISOString().split("T")[0],
      };
    }
    case "semestre_atual": {
      const s = mes < 6 ? 0 : 6;
      return {
        inicio: new Date(ano, s, 1).toISOString().split("T")[0],
        fim: new Date(ano, s + 6, 0).toISOString().split("T")[0],
      };
    }
    case "ano_atual":
      return {
        inicio: new Date(ano, 0, 1).toISOString().split("T")[0],
        fim: new Date(ano, 11, 31).toISOString().split("T")[0],
      };
    default:
      return {
        inicio: new Date(ano, mes, 1).toISOString().split("T")[0],
        fim: new Date(ano, mes + 1, 0).toISOString().split("T")[0],
      };
  }
}

export function labelPeriodo(periodo, inicio, fim) {
  const labels = {
    mes_atual: "Mes atual",
    mes_anterior: "Mes anterior",
    trimestre_atual: "Trimestre atual",
    semestre_atual: "Semestre atual",
    ano_atual: "Ano atual",
    customizado: `${fmt(inicio)} a ${fmt(fim)}`,
  };
  return labels[periodo] || "";
}

// Exportação CSV
export function exportarCSV(dados, nomeArquivo) {
  if (!dados || dados.length === 0) return;
  const headers = Object.keys(dados[0]);
  const linhas = [
    headers.join(";"),
    ...dados.map((row) =>
      headers.map((h) => {
        const val = row[h] === null || row[h] === undefined ? "" : row[h];
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(";")
    ),
  ];
  const blob = new Blob(["\uFEFF" + linhas.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nomeArquivo}_${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export const CATS_DEFAULT = [
  "Alimentacao",
  "Limpeza",
  "Salarios",
  "Encargos Trabalhistas",
  "Demissao",
  "Material Pedagogico",
  "Material de Escritorio",
  "Manutencao",
  "Agua/Energia",
  "Telefone/Internet",
  "Contabilidade",
  "Nutricionista",
  "Transporte",
  "Seguro",
  "Mensalidade",
  "Repasse/Convenio",
  "Matricula",
  "Outros",
];

export const TODAS_ABAS = [
  { key: "cozinha",    label: "Cozinha"           },
  { key: "limpeza",    label: "Limpeza"            },
  { key: "pedagogico", label: "Mat. Pedagogico"    },
  { key: "escritorio", label: "Mat. Escritorio"    },
  { key: "lista",      label: "Lista de Compras"   },
  { key: "financeiro", label: "Financeiro"         },
  { key: "auditoria",  label: "Auditoria"          },
  { key: "usuarios",   label: "Usuarios"           },
];

export const TIPOS_ESTOQUE = [
  { key: "cozinha",    label: "Cozinha"           },
  { key: "limpeza",    label: "Limpeza"            },
  { key: "pedagogico", label: "Mat. Pedagogico"    },
  { key: "escritorio", label: "Mat. Escritorio"    },
];

export const ABAS_ESTOQUE_KEYS = ["cozinha", "limpeza", "pedagogico", "escritorio"];

export const PERMS_PADRAO = {
  admin:         { cozinha:true,  limpeza:true,  pedagogico:true,  escritorio:true,  lista:true, financeiro:true,  auditoria:true,  usuarios:true  },
  nutricionista: { cozinha:true,  limpeza:false, pedagogico:false, escritorio:false, lista:true, financeiro:false, auditoria:false, usuarios:false },
  cozinheira:    { cozinha:true,  limpeza:false, pedagogico:false, escritorio:false, lista:true, financeiro:false, auditoria:false, usuarios:false },
  limpeza:       { cozinha:false, limpeza:true,  pedagogico:false, escritorio:false, lista:true, financeiro:false, auditoria:false, usuarios:false },
  pedagogico:    { cozinha:false, limpeza:false, pedagogico:true,  escritorio:false, lista:true, financeiro:false, auditoria:false, usuarios:false },
  escritorio:    { cozinha:false, limpeza:false, pedagogico:false, escritorio:true,  lista:true, financeiro:false, auditoria:false, usuarios:false },
};
