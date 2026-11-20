import "server-only";
import { and, count, desc, eq, ilike, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db, type Tx } from "@/db/client";
import { first } from "@/db/query";
import { adminAuditLog, featureFlags, sessions, users } from "@/db/schema";
import { FEATURE_KEYS, type FeatureKey } from "@/db/schema/admin";
import { env } from "@/env";
import { courtesyActive, isAdminUser } from "@/server/access/policy";

/**
 * Operações do painel admin. Só dados da CONTA — nunca dados financeiros.
 * Toda alteração grava uma linha de auditoria na mesma transação.
 */

export type Actor = { id: number; ip: string };

export class AdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminError";
  }
}

export type AdminUserRow = {
  id: number;
  name: string;
  email: string;
  verified: boolean;
  isAdmin: boolean;
  createdAt: string;
  lastSeenAt: string | null;
  blockedAt: string | null;
  blockedReason: string | null;
  courtesyAt: string | null;
  courtesyUntil: string | null;
  courtesyActive: boolean;
};

const lastSeen = sql<string | null>`(select max(s.last_seen_at) from sessions s where s.user_id = "users"."id")`;

export async function listUsers(search = "", now: Date = new Date()): Promise<AdminUserRow[]> {
  const q = search.trim().toLowerCase().slice(0, 100);
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      emailVerifiedAt: users.emailVerifiedAt,
      createdAt: users.createdAt,
      lastSeenAt: lastSeen,
      blockedAt: users.blockedAt,
      blockedReason: users.blockedReason,
      courtesyAt: users.courtesyAt,
      courtesyUntil: users.courtesyUntil,
    })
    .from(users)
    .where(q ? or(ilike(users.email, pattern), ilike(users.name, pattern)) : undefined)
    .orderBy(desc(users.createdAt))
    .limit(200);
  return rows.map(({ emailVerifiedAt, ...r }) => ({
    ...r,
    verified: emailVerifiedAt != null,
    isAdmin: isAdminUser({ email: r.email, emailVerifiedAt }, env.ADMIN_EMAILS),
    courtesyActive: courtesyActive(r, now),
  }));
}

export type AdminOverview = { total: number; verified: number; blocked: number; courtesy: number; activeLast30: number };

export async function getOverview(now: Date = new Date()): Promise<AdminOverview> {
  const today = now.toISOString().slice(0, 10);
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const [row] = await db
    .select({
      total: count(),
      verified: count(users.emailVerifiedAt),
      blocked: count(users.blockedAt),
      courtesy: sql<number>`count(*) filter (where ${users.courtesyAt} is not null and (${users.courtesyUntil} is null or ${users.courtesyUntil} >= ${today}))`.mapWith(Number),
    })
    .from(users);
  const [active] = await db
    .select({ n: sql<number>`count(distinct ${sessions.userId})`.mapWith(Number) })
    .from(sessions)
    .where(sql`${sessions.lastSeenAt} >= ${since}`);
  return { ...row, activeLast30: active.n };
}

async function audit(tx: Tx, actor: Actor, action: string, target: { id: number; email: string } | null, details?: object) {
  await tx.insert(adminAuditLog).values({
    actorUserId: actor.id,
    action,
    targetUserId: target?.id ?? null,
    targetEmail: target?.email ?? null,
    details: details ? JSON.stringify(details) : null,
    ip: actor.ip.slice(0, 64),
  });
}

/** Conta-alvo de uma ação: precisa existir e nunca pode ser um admin (nem você mesmo). */
async function target(tx: Tx, actor: Actor, targetId: number) {
  const user = await tx
    .select({ id: users.id, email: users.email, emailVerifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.id, targetId))
    .then(first);
  if (!user) throw new AdminError("Conta não encontrada.");
  if (user.id === actor.id || isAdminUser(user, env.ADMIN_EMAILS)) {
    throw new AdminError("Contas de administrador não podem ser alteradas pelo painel.");
  }
  return user;
}

async function revokeAll(tx: Tx, userId: number, now: Date) {
  const res = await tx
    .update(sessions)
    .set({ revokedAt: now.toISOString() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });
  return res.length;
}

export async function blockUser(actor: Actor, targetId: number, reason: string, now: Date = new Date()) {
  const clean = reason.trim().slice(0, 300);
  if (clean.length < 3) throw new AdminError("Informe o motivo do bloqueio.");
  await db.transaction(async (tx) => {
    const t = await target(tx, actor, targetId);
    await tx.update(users).set({ blockedAt: now.toISOString(), blockedReason: clean }).where(eq(users.id, t.id));
    const revoked = await revokeAll(tx, t.id, now);
    await audit(tx, actor, "user.block", t, { reason: clean, sessionsRevoked: revoked });
  });
}

export async function unblockUser(actor: Actor, targetId: number) {
  await db.transaction(async (tx) => {
    const t = await target(tx, actor, targetId);
    const res = await tx
      .update(users)
      .set({ blockedAt: null, blockedReason: null })
      .where(and(eq(users.id, t.id), isNotNull(users.blockedAt)))
      .returning({ id: users.id });
    if (res.length === 0) throw new AdminError("Esta conta não está bloqueada.");
    await audit(tx, actor, "user.unblock", t);
  });
}

/** Cortesia: uso liberado sem pagar. until = "AAAA-MM-DD" (inclusive) ou null = permanente. */
export async function grantCourtesy(actor: Actor, targetId: number, until: string | null, now: Date = new Date()) {
  if (until != null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(until) || Number.isNaN(Date.parse(until))) throw new AdminError("Data de fim inválida.");
    if (until < now.toISOString().slice(0, 10)) throw new AdminError("A data de fim já passou.");
  }
  await db.transaction(async (tx) => {
    const t = await target(tx, actor, targetId);
    await tx.update(users).set({ courtesyAt: now.toISOString(), courtesyUntil: until }).where(eq(users.id, t.id));
    await audit(tx, actor, "user.courtesy.grant", t, { until: until ?? "permanente" });
  });
}

export async function revokeCourtesy(actor: Actor, targetId: number) {
  await db.transaction(async (tx) => {
    const t = await target(tx, actor, targetId);
    const res = await tx
      .update(users)
      .set({ courtesyAt: null, courtesyUntil: null })
      .where(and(eq(users.id, t.id), isNotNull(users.courtesyAt)))
      .returning({ id: users.id });
    if (res.length === 0) throw new AdminError("Esta conta não tem cortesia.");
    await audit(tx, actor, "user.courtesy.revoke", t);
  });
}

export async function revokeUserSessions(actor: Actor, targetId: number, now: Date = new Date()) {
  return await db.transaction(async (tx) => {
    const t = await target(tx, actor, targetId);
    const revoked = await revokeAll(tx, t.id, now);
    await audit(tx, actor, "user.sessions.revoke", t, { sessionsRevoked: revoked });
    return revoked;
  });
}

export type FeatureRow = { key: FeatureKey; locked: boolean; message: string | null; updatedAt: string | null };

export async function listFeatures(): Promise<FeatureRow[]> {
  const rows = await db.select().from(featureFlags);
  return FEATURE_KEYS.map((key) => {
    const r = rows.find((x) => x.key === key);
    return { key, locked: r?.locked ?? false, message: r?.message ?? null, updatedAt: r?.updatedAt ?? null };
  });
}

export async function setFeatureLock(actor: Actor, key: FeatureKey, locked: boolean, message: string | null, now: Date = new Date()) {
  if (!FEATURE_KEYS.includes(key)) throw new AdminError("Função desconhecida.");
  const msg = message?.trim().slice(0, 200) || null;
  await db.transaction(async (tx) => {
    const values = { locked, message: msg, updatedAt: now.toISOString(), updatedBy: actor.id };
    await tx
      .insert(featureFlags)
      .values({ key, ...values })
      .onConflictDoUpdate({ target: featureFlags.key, set: values });
    await audit(tx, actor, locked ? "feature.lock" : "feature.unlock", null, { feature: key, message: msg });
  });
}

export type AuditRow = {
  id: number;
  action: string;
  actorEmail: string | null;
  targetEmail: string | null;
  details: string | null;
  ip: string | null;
  createdAt: string;
};

export async function listAudit(limit = 100): Promise<AuditRow[]> {
  return await db
    .select({
      id: adminAuditLog.id,
      action: adminAuditLog.action,
      actorEmail: users.email,
      targetEmail: adminAuditLog.targetEmail,
      details: adminAuditLog.details,
      ip: adminAuditLog.ip,
      createdAt: adminAuditLog.createdAt,
    })
    .from(adminAuditLog)
    .leftJoin(users, eq(users.id, adminAuditLog.actorUserId))
    .orderBy(desc(adminAuditLog.id))
    .limit(Math.min(Math.max(limit, 1), 500));
}
