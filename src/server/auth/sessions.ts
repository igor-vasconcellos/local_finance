import "server-only";
import crypto from "node:crypto";
import { and, eq, isNotNull, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db/client";
import { first } from "@/db/query";
import { sessions } from "@/db/schema";
import { env } from "@/env";
import { signSessionJwt, verifySessionJwt } from "@/lib/auth/jwt";
import { getUserById, type PublicUser } from "./users";

/** Atualiza last_seen_at no máximo a cada 5 minutos (evita escrita a cada request). */
const TOUCH_INTERVAL_MS = 5 * 60_000;

const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

export type NewSession = { jwt: string; expiresAt: Date };

export async function createSession(
  userId: number,
  meta: { userAgent?: string | null; ip?: string | null } = {},
  now: Date = new Date(),
): Promise<NewSession> {
  const sid = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + env.SESSION_TTL_HOURS * 3_600_000);

  await db.transaction(async (tx) => {
    // Faxina de sessões vencidas ou revogadas.
    await tx.delete(sessions).where(or(lt(sessions.expiresAt, now.toISOString()), isNotNull(sessions.revokedAt)));
    await tx.insert(sessions).values({
      id: sha256(sid),
      userId,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
      ip: meta.ip?.slice(0, 64) ?? null,
      lastSeenAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
  });

  const jwt = await signSessionJwt({ sub: String(userId), sid }, expiresAt);
  return { jwt, expiresAt };
}

export type ValidSession = {
  user: PublicUser;
  sessionId: string;
  expiresAt: string;
};

/** Validação completa: assinatura do JWT + sessão existente, não revogada e não expirada. */
export async function validateSession(jwt: string | undefined, now: Date = new Date()): Promise<ValidSession | null> {
  const claims = await verifySessionJwt(jwt);
  if (!claims) return null;

  const id = sha256(claims.sid);
  const row = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, id), isNull(sessions.revokedAt)))
    .then(first);

  const nowIso = now.toISOString();
  if (!row || row.expiresAt <= nowIso || String(row.userId) !== claims.sub) return null;

  const user = await getUserById(row.userId);
  if (!user) return null;

  if (now.getTime() - new Date(row.lastSeenAt).getTime() > TOUCH_INTERVAL_MS) {
    await db.update(sessions).set({ lastSeenAt: nowIso }).where(eq(sessions.id, id));
  }

  return { user, sessionId: id, expiresAt: row.expiresAt };
}

export async function revokeSession(jwt: string | undefined, now: Date = new Date()): Promise<void> {
  const claims = await verifySessionJwt(jwt);
  if (!claims) return;
  await db
    .update(sessions)
    .set({ revokedAt: now.toISOString() })
    .where(eq(sessions.id, sha256(claims.sid)));
}
