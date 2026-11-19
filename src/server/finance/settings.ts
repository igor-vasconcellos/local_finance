import "server-only";
import { and, asc, desc, eq, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { cdiRates, settings } from "@/db/schema";
import { todayISO, type ISODate } from "@/lib/dates";

export type AppSettings = {
  greenThresholdBp: number;
  yellowThresholdBp: number;
  accountBalanceCents: number | null;
  accountBalanceDate: ISODate | null;
};

export function getSettings(uid: number): AppSettings {
  db.insert(settings).values({ userId: uid }).onConflictDoNothing().run();
  const row = db.select().from(settings).where(eq(settings.userId, uid)).get()!;
  return {
    greenThresholdBp: row.greenThresholdBp,
    yellowThresholdBp: row.yellowThresholdBp,
    accountBalanceCents: row.accountBalanceCents,
    accountBalanceDate: row.accountBalanceDate,
  };
}

export function updateThresholds(uid: number, greenBp: number, yellowBp: number) {
  getSettings(uid);
  db.update(settings).set({ greenThresholdBp: greenBp, yellowThresholdBp: yellowBp }).where(eq(settings.userId, uid)).run();
}

export function updateAccountBalance(uid: number, cents: number, date: ISODate) {
  getSettings(uid);
  db.update(settings).set({ accountBalanceCents: cents, accountBalanceDate: date }).where(eq(settings.userId, uid)).run();
}

// ------------------------------------------------------------------ CDI --

export type CdiRate = { id: number; annualRateBp: number; effectiveFrom: ISODate };

const rateCols = { id: cdiRates.id, annualRateBp: cdiRates.annualRateBp, effectiveFrom: cdiRates.effectiveFrom };

export function listCdiRates(uid: number): CdiRate[] {
  return db.select(rateCols).from(cdiRates).where(eq(cdiRates.userId, uid)).orderBy(desc(cdiRates.effectiveFrom)).all();
}

/** Taxa vigente numa data (a mais recente com effective_from ≤ data; se nenhuma, a mais antiga). */
export function cdiRateOn(uid: number, date: ISODate = todayISO()): CdiRate | undefined {
  return (
    db
      .select(rateCols)
      .from(cdiRates)
      .where(and(eq(cdiRates.userId, uid), lte(cdiRates.effectiveFrom, date)))
      .orderBy(desc(cdiRates.effectiveFrom))
      .get() ??
    db.select(rateCols).from(cdiRates).where(eq(cdiRates.userId, uid)).orderBy(asc(cdiRates.effectiveFrom)).get()
  );
}

/** Registra nova taxa a partir de uma data (substitui se já houver taxa nessa mesma data). */
export function setCdiRate(uid: number, annualRateBp: number, effectiveFrom: ISODate) {
  db.insert(cdiRates)
    .values({ userId: uid, annualRateBp, effectiveFrom })
    .onConflictDoUpdate({ target: [cdiRates.userId, cdiRates.effectiveFrom], set: { annualRateBp } })
    .run();
}

/** Remove uma taxa do histórico (sempre mantém pelo menos uma). */
export function deleteCdiRate(uid: number, id: number): boolean {
  if (listCdiRates(uid).length <= 1) return false;
  return db.delete(cdiRates).where(and(eq(cdiRates.id, id), eq(cdiRates.userId, uid))).run().changes > 0;
}
