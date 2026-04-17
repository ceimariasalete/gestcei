import { supabase } from "../lib/supabase";

export function useAuditoria(usuario) {
  async function log(tabela, operacao, registroId, descricao, antes, depois) {
    if (!usuario) return;
    await supabase.from("auditoria").insert({
      tabela,
      operacao,
      registro_id: registroId,
      descricao,
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      dados_anteriores: antes || null,
      dados_novos: depois || null,
    });
  }

  return { log };
}
