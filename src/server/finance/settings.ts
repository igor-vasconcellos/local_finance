import "server-only";
import { and, asc, desc, eq, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { first, touched } from "@/db/query";
import { cdiRates, settings } from "@/db/schema";
import { todayISO, type ISODate } from "@/lib/dates";

export type AppSettings = {
  greenThresholdBp: number;
  yellowThresholdBp: number;
  accountBalanceCents: number | null;
  accountBalanceDate: ISODate | null;
};

export async function getSettings(uid: number): Promise<AppSettings> {
  let row = await db.select().from(settings).where(eq(settings.userId, uid)).then(first);
  if (!row) {
    await db.insert(settings).values({ userId: uid }).onConflictDoNothing();
    row = (await db.select().from(settings).where(eq(settings.userId, uid)).then(first))!;
  }
  return {
    greenThresholdBp: row.greenThresholdBp,
    yellowThresholdBp: row.yellowThresholdBp,
    accountBalanceCents: row.accountBalanceCents,
    accountBalanceDate: row.accountBalanceDate,
  };
}

export async function updateThresholds(uid: number, greenBp: number, yellowBp: number) {
  await getSettings(uid);
  await db.update(settings).set({ greenThresholdBp: greenBp, yellowThresholdBp: yellowBp }).where(eq(settings.userId, uid));
}


// ------------------------------------------------------------------ CDI --

export type CdiRate = { id: number; annualRateBp: number; effectiveFrom: ISODate };

const rateCols = { id: cdiRates.id, annualRateBp: cdiRates.annualRateBp, effectiveFrom: cdiRates.effectiveFrom };

export async function listCdiRates(uid: number): Promise<CdiRate[]> {
  return db.select(rateCols).from(cdiRates).where(eq(cdiRates.userId, uid)).orderBy(desc(cdiRates.effectiveFrom));
}

/** Taxa vigente numa data (a mais recente com effective_from ≤ data; se nenhuma, a mais antiga). */
export async function cdiRateOn(uid: number, date: ISODate = todayISO()): Promise<CdiRate | undefined> {
  return (
    (await db
      .select(rateCols)
      .from(cdiRates)
      .where(and(eq(cdiRates.userId, uid), lte(cdiRates.effectiveFrom, date)))
      .orderBy(desc(cdiRates.effectiveFrom))
      .limit(1)
      .then(first)) ??
    (await db
      .select(rateCols)
      .from(cdiRates)
      .where(eq(cdiRates.userId, uid))
      .orderBy(asc(cdiRates.effectiveFrom))
      .limit(1)
      .then(first))
  );
}

/** Registra nova taxa a partir de uma data (substitui se já houver taxa nessa mesma data). */
export async function setCdiRate(uid: number, annualRateBp: number, effectiveFrom: ISODate) {
  await db
    .insert(cdiRates)
    .values({ userId: uid, annualRateBp, effectiveFrom })
    .onConflictDoUpdate({ target: [cdiRates.userId, cdiRates.effectiveFrom], set: { annualRateBp } });
}

/** Remove uma taxa do histórico (sempre mantém pelo menos uma). */
export async function deleteCdiRate(uid: number, id: number): Promise<boolean> {
  if ((await listCdiRates(uid)).length <= 1) return false;
  return (
    (
      await db
        .delete(cdiRates)
        .where(and(eq(cdiRates.id, id), eq(cdiRates.userId, uid)))
        .returning(touched)
    ).length > 0
  );
}
