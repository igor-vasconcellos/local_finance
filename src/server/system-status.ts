import "server-only";
import { desc, sql } from "drizzle-orm";
import { db, sqlite } from "@/db/client";
import { categories, cdiRates, settings, users } from "@/db/schema";
import { env, mailTransport } from "@/env";

export type SystemStatus = Awaited<ReturnType<typeof getSystemStatus>>;

/** Diagnóstico do ambiente exibido na página inicial da Etapa 1. */
export async function getSystemStatus() {
  try {
    const tables = sqlite
      .prepare(
        `SELECT COUNT(*) AS n FROM sqlite_master
         WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'`,
      )
      .get() as { n: number };

    const [config] = db.select().from(settings).limit(1).all();
    const [cdi] = db.select().from(cdiRates).orderBy(desc(cdiRates.effectiveFrom)).limit(1).all();
    const [{ n: categoryCount }] = db.select({ n: sql<number>`count(*)` }).from(categories).all();
    const [{ n: userCount }] = db.select({ n: sql<number>`count(*)` }).from(users).all();

    return {
      ok: true as const,
      databasePath: env.DATABASE_PATH,
      sqliteVersion: (sqlite.prepare("SELECT sqlite_version() AS v").get() as { v: string }).v,
      journalMode: sqlite.pragma("journal_mode", { simple: true }) as string,
      foreignKeys: sqlite.pragma("foreign_keys", { simple: true }) === 1,
      tableCount: tables.n,
      categoryCount,
      hasUser: userCount > 0,
      thresholds: config
        ? { greenBp: config.greenThresholdBp, yellowBp: config.yellowThresholdBp }
        : null,
      cdi: cdi ? { annualRateBp: cdi.annualRateBp, effectiveFrom: cdi.effectiveFrom } : null,
      mailTransport,
    };
  } catch (error) {
    return {
      ok: false as const,
      databasePath: env.DATABASE_PATH,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
