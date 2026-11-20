"use server";

import { refresh } from "next/cache";
import { requireSession } from "@/server/auth/current";
import { revokeOtherSessions, revokeOwnSession } from "@/server/auth/sessions";
import { logSecurityEvent } from "@/server/security/events";

/**
 * Encerrar sessões é uma ação de SEGURANÇA: continua liberada mesmo com a conta
 * bloqueada (quem desconfia de acesso indevido precisa conseguir se proteger).
 */
export async function revokeMySessionAction(fd: FormData): Promise<{ error?: string }> {
  const { user, sessionId } = await requireSession();
  const id = String(fd.get("sessionId") ?? "");
  if (!/^[a-f0-9]{64}$/.test(id)) return { error: "Sessão inválida." };
  if (id === sessionId) return { error: "Para sair deste aparelho, use o botão Sair." };
  if (!(await revokeOwnSession(user.id, id))) return { error: "Sessão não encontrada." };
  await logSecurityEvent({ event: "session_revoked", userId: user.id, details: { scope: "one" } });
  refresh();
  return {};
}

export async function revokeOtherSessionsAction(): Promise<{ error?: string }> {
  const { user, sessionId } = await requireSession();
  const n = await revokeOtherSessions(user.id, sessionId);
  if (n > 0) await logSecurityEvent({ event: "session_revoked", userId: user.id, details: { scope: "others", count: n } });
  refresh();
  return {};
}
