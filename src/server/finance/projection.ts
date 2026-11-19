import "server-only";
import { and, eq, gte, lte, sql, sum } from "drizzle-orm";
import { db } from "@/db/client";
import {
  creditCards,
  installments,
  invoiceCredits,
  invoices,
  oneTimeExpenses,
  simulationInstallments,
  simulations,
} from "@/db/schema";
import { addMonths, todayISO, type ISODate, type Month } from "@/lib/dates";
import { healthOf, type Health } from "@/lib/health";
import { goalsForMonth } from "./boxes";
import { expenseAppliesTo, listExpenses } from "./expenses";
import { incomeAppliesTo, listIncomes } from "./incomes";
import { getSettings } from "./settings";

export type ProjectionMonth = {
  month: Month;
  incomeCents: number;
  fixedCents: number;
  invoicesCents: number;
  oneTimeCents: number;
  goalsCents: number;
  /** Simulações salvas e marcadas para entrar no cenário. */
  simulatedCents: number;
  /** Renda − (fixos + faturas + avulsos + metas). Sem simulações. */
  freeRealCents: number;
  /** Livre já descontando as simulações consideradas. */
  freeCents: number;
  healthReal: Health;
  health: Health;
};

/**
 * Fluxo de caixa previsto mês a mês:
 * livre = rendas previstas − (gastos fixos + faturas que vencem no mês + avulsos + metas) − simulações.
 */
export async function projectMonths(
  uid: number,
  from: Month,
  count: number,
  today: ISODate = todayISO(),
): Promise<{ months: ProjectionMonth[]; thresholds: { greenBp: number; yellowBp: number } }> {
  const to = addMonths(from, count - 1);
  const [settings, incomes, expenses] = await Promise.all([getSettings(uid), listIncomes(uid), listExpenses(uid)]);

  const byMonth = <T extends { month: string; total: number }>(rows: T[]) => new Map(rows.map((r) => [r.month, r.total]));

  const invoiceTotals = byMonth(
    await db
      .select({
        month: invoices.referenceMonth,
        total: sql<number>`coalesce(${sum(installments.amountCents)}, 0)`.mapWith(Number),
      })
      .from(installments)
      .innerJoin(invoices, eq(invoices.id, installments.invoiceId))
      .innerJoin(creditCards, eq(creditCards.id, invoices.cardId))
      .where(and(eq(creditCards.userId, uid), gte(invoices.referenceMonth, from), lte(invoices.referenceMonth, to)))
      .groupBy(invoices.referenceMonth),
  );

  const creditTotals = byMonth(
    await db
      .select({
        month: invoices.referenceMonth,
        total: sql<number>`coalesce(${sum(invoiceCredits.amountCents)}, 0)`.mapWith(Number),
      })
      .from(invoiceCredits)
      .innerJoin(invoices, eq(invoices.id, invoiceCredits.invoiceId))
      .innerJoin(creditCards, eq(creditCards.id, invoices.cardId))
      .where(and(eq(creditCards.userId, uid), gte(invoices.referenceMonth, from), lte(invoices.referenceMonth, to)))
      .groupBy(invoices.referenceMonth),
  );
  for (const [m, credit] of creditTotals) invoiceTotals.set(m, Math.max(0, (invoiceTotals.get(m) ?? 0) - credit));

  const oneTimeTotals = byMonth(
    await db
      .select({
        month: sql<string>`substr(${oneTimeExpenses.date}, 1, 7)`,
        total: sql<number>`sum(${oneTimeExpenses.amountCents})`.mapWith(Number),
      })
      .from(oneTimeExpenses)
      .where(and(eq(oneTimeExpenses.userId, uid), gte(oneTimeExpenses.date, `${from}-01`), lte(oneTimeExpenses.date, `${to}-31`)))
      .groupBy(sql`substr(${oneTimeExpenses.date}, 1, 7)`),
  );

  const simTotals = byMonth(
    await db
      .select({
        month: simulationInstallments.referenceMonth,
        total: sql<number>`sum(${simulationInstallments.amountCents})`.mapWith(Number),
      })
      .from(simulationInstallments)
      .innerJoin(simulations, eq(simulations.id, simulationInstallments.simulationId))
      .where(
        and(
          eq(simulations.userId, uid),
          eq(simulations.status, "active"),
          eq(simulations.isVisible, true),
          gte(simulationInstallments.referenceMonth, from),
          lte(simulationInstallments.referenceMonth, to),
        ),
      )
      .groupBy(simulationInstallments.referenceMonth),
  );

  const months: ProjectionMonth[] = [];
  for (let i = 0; i < count; i++) {
    const month = addMonths(from, i);
    const incomeCents = incomes.filter((x) => incomeAppliesTo(x, month)).reduce((a, x) => a + x.amountCents, 0);
    const fixedCents = expenses.filter((x) => expenseAppliesTo(x, month)).reduce((a, x) => a + x.amountCents, 0);
    const invoicesCents = invoiceTotals.get(month) ?? 0;
    const oneTimeCents = oneTimeTotals.get(month) ?? 0;
    const goalsCents = (await goalsForMonth(uid, month, today)).total;
    const simulatedCents = simTotals.get(month) ?? 0;
    const freeRealCents = incomeCents - fixedCents - invoicesCents - oneTimeCents - goalsCents;
    const freeCents = freeRealCents - simulatedCents;
    months.push({
      month,
      incomeCents,
      fixedCents,
      invoicesCents,
      oneTimeCents,
      goalsCents,
      simulatedCents,
      freeRealCents,
      freeCents,
      healthReal: healthOf(freeRealCents, incomeCents, settings.greenThresholdBp, settings.yellowThresholdBp),
      health: healthOf(freeCents, incomeCents, settings.greenThresholdBp, settings.yellowThresholdBp),
    });
  }

  return { months, thresholds: { greenBp: settings.greenThresholdBp, yellowBp: settings.yellowThresholdBp } };
}
