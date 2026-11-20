"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { FEATURE_KEYS } from "@/db/schema/admin";
import { requireAdmin } from "@/server/access/guard";
import {
  AdminError,
  blockUser,
  grantCourtesy,
  revokeCourtesy,
  revokeUserSessions,
  setFeatureLock,
  unblockUser,
  type Actor,
} from "@/server/admin/service";
import { clientIp } from "@/server/auth/rate-limit";
import { parseId, type ActionState } from "./form-state";

/** Toda ação do painel: confirma que quem chama é admin e registra o IP para a auditoria. */
async function actor(): Promise<Actor> {
  const session = await requireAdmin();
  return { id: session.user.id, ip: await clientIp() };
}

async function run(fn: () => Promise<unknown>): Promise<ActionState> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof AdminError) return { error: error.message };
    throw error;
  }
  refresh();
  return { ok: true };
}

export async function blockUserAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const a = await actor();
  const id = parseId(fd.get("userId"));
  if (!id) return { error: "Conta inválida." };
  const reason = String(fd.get("reason") ?? "");
  if (reason.trim().length < 3) return { fields: { reason: "Informe o motivo do bloqueio." } };
  return run(() => blockUser(a, id, reason));
}

export async function unblockUserAction(fd: FormData): Promise<{ error?: string }> {
  const a = await actor();
  const id = parseId(fd.get("userId"));
  if (!id) return { error: "Conta inválida." };
  return run(() => unblockUser(a, id));
}

export async function grantCourtesyAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const a = await actor();
  const id = parseId(fd.get("userId"));
  if (!id) return { error: "Conta inválida." };
  const until = String(fd.get("until") ?? "").trim();
  return run(() => grantCourtesy(a, id, until === "" ? null : until));
}

export async function revokeCourtesyAction(fd: FormData): Promise<{ error?: string }> {
  const a = await actor();
  const id = parseId(fd.get("userId"));
  if (!id) return { error: "Conta inválida." };
  return run(() => revokeCourtesy(a, id));
}

export async function revokeSessionsAction(fd: FormData): Promise<{ error?: string }> {
  const a = await actor();
  const id = parseId(fd.get("userId"));
  if (!id) return { error: "Conta inválida." };
  return run(() => revokeUserSessions(a, id));
}

const featureSchema = z.object({
  key: z.enum(FEATURE_KEYS),
  locked: z.enum(["true", "false"]),
  message: z.string().max(200, "Mensagem muito longa (máx. 200).").optional(),
});

export async function setFeatureAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const a = await actor();
  const parsed = featureSchema.safeParse({
    key: fd.get("key"),
    locked: fd.get("locked"),
    message: fd.get("message") ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const { key, locked, message } = parsed.data;
  return run(() => setFeatureLock(a, key, locked === "true", message ?? null));
}
