import "server-only";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db/client";
import { first } from "@/db/query";
import { featureFlags, users } from "@/db/schema";
import type { FeatureKey } from "@/db/schema/admin";
import { env } from "@/env";
import { resolveAccess, type Access, type FeatureLocks } from "./policy";

/** Travas globais ligadas (sem linha ou locked=false = liberada). */
export async function getFeatureLocks(): Promise<FeatureLocks> {
  const rows = await db.select().from(featureFlags).where(eq(featureFlags.locked, true));
  const locks: FeatureLocks = {};
  for (const r of rows) locks[r.key as FeatureKey] = { message: r.message };
  return locks;
}

export async function getAccessForUser(uid: number, now: Date = new Date()): Promise<Access | null> {
  const [user, locks] = await Promise.all([
    db
      .select({
        email: users.email,
        emailVerifiedAt: users.emailVerifiedAt,
        blockedAt: users.blockedAt,
        blockedReason: users.blockedReason,
        courtesyAt: users.courtesyAt,
        courtesyUntil: users.courtesyUntil,
      })
      .from(users)
      .where(eq(users.id, uid))
      .then(first),
    getFeatureLocks(),
  ]);
  return user ? resolveAccess(user, locks, env.ADMIN_EMAILS, now) : null;
}

/** Acesso da conta logada, memoizado por requisição. */
export const getAccessCached = cache((uid: number) => getAccessForUser(uid));
