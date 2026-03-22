export function fmt(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
}

export function fmtMes(d) {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
}

export function fmtMoeda(v) {
  return Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function statusItem(item) {
  const low = item.quantidade <= item.estoque_minimo;
  if (item.validade) {
    const diff = (new Date(item.validade) - new Date()) / 86400000;
    if (diff < 0) return "vencido";
    if (diff <= 30) return "vencendo";
  }
  if (low) return "baixo";
  return "ok";
}

export function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = () => rej(new Error("Erro ao ler arquivo"));
    r.readAsDataURL(file);
  });
}

export const CATS_DEFAULT = [
  "Alimentacao",
  "Limpeza",
  "Salarios",
  "Encargos",
  "Material Pedagogico",
  "Manutencao",
  "Agua/Energia",
  "Telefone/Internet",
  "Contabilidade",
  "Repasse/Convenio",
  "Venda de Servico",
  "Outros",
];

export const TODAS_ABAS = [
  { key: "cozinha",     label: "Cozinha"          },
  { key: "limpeza",     label: "Limpeza"           },
  { key: "pedagogico",  label: "Material Pedagogico"},
  { key: "lista",       label: "Lista de Compras"  },
  { key: "financeiro",  label: "Financeiro"        },
  { key: "auditoria",   label: "Auditoria"         },
  { key: "usuarios",    label: "Usuarios"          },
];

export const PERMS_PADRAO = {
  admin:         { cozinha:true,  limpeza:true,  pedagogico:true,  lista:true, financeiro:true,  auditoria:true,  usuarios:true  },
  nutricionista: { cozinha:true,  limpeza:false, pedagogico:false, lista:true, financeiro:false, auditoria:false, usuarios:false },
  cozinheira:    { cozinha:true,  limpeza:false, pedagogico:false, lista:true, financeiro:false, auditoria:false, usuarios:false },
  limpeza:       { cozinha:false, limpeza:true,  pedagogico:false, lista:true, financeiro:false, auditoria:false, usuarios:false },
  pedagogico:    { cozinha:false, limpeza:false, pedagogico:true,  lista:true, financeiro:false, auditoria:false, usuarios:false },
};
