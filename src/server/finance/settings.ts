import "server-only";
import { desc, eq, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { cdiRates, settings } from "@/db/schema";
import { todayISO, type ISODate } from "@/lib/dates";

export type AppSettings = {
  greenThresholdBp: number;
  yellowThresholdBp: number;
  accountBalanceCents: number | null;
  accountBalanceDate: ISODate | null;
};

export function getSettings(): AppSettings {
  db.insert(settings).values({ id: 1 }).onConflictDoNothing().run();
  const row = db.select().from(settings).where(eq(settings.id, 1)).get()!;
  return {
    greenThresholdBp: row.greenThresholdBp,
    yellowThresholdBp: row.yellowThresholdBp,
    accountBalanceCents: row.accountBalanceCents,
    accountBalanceDate: row.accountBalanceDate,
  };
}

export function updateThresholds(greenBp: number, yellowBp: number) {
  getSettings();
  db.update(settings).set({ greenThresholdBp: greenBp, yellowThresholdBp: yellowBp }).where(eq(settings.id, 1)).run();
}

export function updateAccountBalance(cents: number, date: ISODate) {
  getSettings();
  db.update(settings).set({ accountBalanceCents: cents, accountBalanceDate: date }).where(eq(settings.id, 1)).run();
}

// ------------------------------------------------------------------ CDI --

export type CdiRate = { id: number; annualRateBp: number; effectiveFrom: ISODate };

export function listCdiRates(): CdiRate[] {
  return db
    .select({ id: cdiRates.id, annualRateBp: cdiRates.annualRateBp, effectiveFrom: cdiRates.effectiveFrom })
    .from(cdiRates)
    .orderBy(desc(cdiRates.effectiveFrom))
    .all();
}

/** Taxa vigente numa data (a mais recente com effective_from ≤ data; se nenhuma, a mais antiga). */
export function cdiRateOn(date: ISODate = todayISO()): CdiRate | undefined {
  return (
    db
      .select({ id: cdiRates.id, annualRateBp: cdiRates.annualRateBp, effectiveFrom: cdiRates.effectiveFrom })
      .from(cdiRates)
      .where(lte(cdiRates.effectiveFrom, date))
      .orderBy(desc(cdiRates.effectiveFrom))
      .get() ?? listCdiRates().at(-1)
  );
}

/** Registra nova taxa a partir de uma data (substitui se já houver taxa nessa mesma data). */
export function setCdiRate(annualRateBp: number, effectiveFrom: ISODate) {
  db.insert(cdiRates)
    .values({ annualRateBp, effectiveFrom })
    .onConflictDoUpdate({ target: cdiRates.effectiveFrom, set: { annualRateBp } })
    .run();
}

/** Remove uma taxa do histórico (sempre mantém pelo menos uma). */
export function deleteCdiRate(id: number): boolean {
  if (listCdiRates().length <= 1) return false;
  return db.delete(cdiRates).where(eq(cdiRates.id, id)).run().changes > 0;
}
