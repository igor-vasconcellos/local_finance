import "server-only";
import { and, count, desc, eq, gte, ilike, lt, or, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { adminAuditLog, securityEvents, users } from "@/db/schema";
import { SECURITY_EVENTS } from "@/db/schema/security";

/** Filtros da auditoria (vêm da URL; tudo validado aqui). */
export type AuditFilters = { tipo?: string; conta?: string; de?: string; ate?: string; page?: number };

export const PAGE_SIZE = 50;
export const ADMIN_ACTIONS = [
  "user.block",
  "user.unblock",
  "user.courtesy.grant",
  "user.courtesy.revoke",
  "user.sessions.revoke",
  "feature.lock",
  "feature.unlock",
] as const;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Dia em Brasília (UTC−3) → instante UTC do começo do dia. */
function dayStartUtc(day: string): string {
  return new Date(`${day}T03:00:00.000Z`).toISOString();
}
function nextDayStartUtc(day: string): string {
  return new Date(new Date(`${day}T03:00:00.000Z`).getTime() + 86_400_000).toISOString();
}

function like(text: string) {
  return `%${text.trim().toLowerCase().slice(0, 100).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export function normalizeFilters(raw: Record<string, string | string[] | undefined>): AuditFilters {
  const pick = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : undefined);
  const page = Math.max(1, Math.min(10_000, Number(pick("pagina")) || 1));
  const de = pick("de");
  const ate = pick("ate");
  return {
    tipo: pick("tipo") || undefined,
    conta: pick("conta")?.trim() || undefined,
    de: de && DAY.test(de) ? de : undefined,
    ate: ate && DAY.test(ate) ? ate : undefined,
    page,
  };
}

export type SecurityRow = {
  id: number;
  event: string;
  email: string | null;
  accountEmail: string | null;
  ip: string | null;
  userAgent: string | null;
  details: string | null;
  createdAt: string;
};

function securityWhere(f: AuditFilters): SQL | undefined {
  const conds: (SQL | undefined)[] = [];
  if (f.tipo && (SECURITY_EVENTS as readonly string[]).includes(f.tipo)) conds.push(eq(securityEvents.event, f.tipo as never));
  if (f.conta) conds.push(or(ilike(securityEvents.email, like(f.conta)), ilike(users.email, like(f.conta))));
  if (f.de) conds.push(gte(securityEvents.createdAt, dayStartUtc(f.de)));
  if (f.ate) conds.push(lt(securityEvents.createdAt, nextDayStartUtc(f.ate)));
  return and(...conds);
}

export async function listSecurity(f: AuditFilters, limit = PAGE_SIZE): Promise<{ rows: SecurityRow[]; total: number }> {
  const where = securityWhere(f);
  const offset = ((f.page ?? 1) - 1) * PAGE_SIZE;
  const [rows, [{ n }]] = await Promise.all([
    db
      .select({
        id: securityEvents.id,
        event: securityEvents.event,
        email: securityEvents.email,
        accountEmail: users.email,
        ip: securityEvents.ip,
        userAgent: securityEvents.userAgent,
        details: securityEvents.details,
        createdAt: securityEvents.createdAt,
      })
      .from(securityEvents)
      .leftJoin(users, eq(users.id, securityEvents.userId))
      .where(where)
      .orderBy(desc(securityEvents.id))
      .limit(limit)
      .offset(limit === PAGE_SIZE ? offset : 0),
    db.select({ n: count() }).from(securityEvents).leftJoin(users, eq(users.id, securityEvents.userId)).where(where),
  ]);
  return { rows, total: n };
}

export type AdminActionRow = {
  id: number;
  action: string;
  actorEmail: string | null;
  targetEmail: string | null;
  details: string | null;
  ip: string | null;
  createdAt: string;
};

function adminWhere(f: AuditFilters): SQL | undefined {
  const conds: (SQL | undefined)[] = [];
  if (f.tipo && (ADMIN_ACTIONS as readonly string[]).includes(f.tipo)) conds.push(eq(adminAuditLog.action, f.tipo));
  if (f.conta) conds.push(ilike(adminAuditLog.targetEmail, like(f.conta)));
  if (f.de) conds.push(gte(adminAuditLog.createdAt, dayStartUtc(f.de)));
  if (f.ate) conds.push(lt(adminAuditLog.createdAt, nextDayStartUtc(f.ate)));
  return and(...conds);
}

export async function listAdminActions(f: AuditFilters, limit = PAGE_SIZE): Promise<{ rows: AdminActionRow[]; total: number }> {
  const where = adminWhere(f);
  const offset = ((f.page ?? 1) - 1) * PAGE_SIZE;
  const [rows, [{ n }]] = await Promise.all([
    db
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
      .where(where)
      .orderBy(desc(adminAuditLog.id))
      .limit(limit)
      .offset(limit === PAGE_SIZE ? offset : 0),
    db.select({ n: count() }).from(adminAuditLog).where(where),
  ]);
  return { rows, total: n };
}

/** Atividade da própria conta (Configurações → Segurança). */
export async function listMyActivity(uid: number, limit = 20) {
  return db
    .select({
      id: securityEvents.id,
      event: securityEvents.event,
      ip: securityEvents.ip,
      userAgent: securityEvents.userAgent,
      createdAt: securityEvents.createdAt,
    })
    .from(securityEvents)
    .where(eq(securityEvents.userId, uid))
    .orderBy(desc(securityEvents.id))
    .limit(limit);
}
