import "server-only";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db/client";
import { first } from "@/db/query";
import { featureFlags, subscriptions, users } from "@/db/schema";
import type { FeatureKey } from "@/db/schema/admin";
import { env } from "@/env";
import { todayISO } from "@/lib/dates";
import { resolveAccess, type Access, type BillingConfig, type FeatureLocks } from "./policy";

export function billingConfig(): BillingConfig {
  return {
    enabled: env.BILLING_ENABLED,
    startDate: env.BILLING_START_DATE ?? null,
    trialDays: env.BILLING_TRIAL_DAYS,
    graceDays: env.BILLING_GRACE_DAYS,
  };
}

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
        createdAt: users.createdAt,
        subStatus: subscriptions.status,
        subPaidUntil: subscriptions.paidUntil,
        subLastFailureAt: subscriptions.lastFailureAt,
      })
      .from(users)
      .leftJoin(subscriptions, eq(subscriptions.userId, users.id))
      .where(eq(users.id, uid))
      .then(first),
    getFeatureLocks(),
  ]);
  if (!user) return null;
  const billing = {
    config: billingConfig(),
    userCreatedAt: user.createdAt,
    subscription: user.subStatus
      ? { status: user.subStatus, paidUntil: user.subPaidUntil, failing: user.subLastFailureAt != null }
      : null,
  };
  return resolveAccess(user, locks, env.ADMIN_EMAILS, now, billing, todayISO(now));
}

/** Acesso da conta logada, memoizado por requisição. */
export const getAccessCached = cache((uid: number) => getAccessForUser(uid));
