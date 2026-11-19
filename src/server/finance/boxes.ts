import "server-only";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { boxTransactions, institutions, savingsBoxes } from "@/db/schema";
import {
  monthlyRate,
  projectedMonthYield,
  rateOn,
  requiredMonthlyDeposit,
  simulateBox,
  type BalancePoint,
  type BoxTx,
} from "@/lib/cdi";
import { addMonths, dayOfMonth, monthOf, monthsBetween, todayISO, type ISODate, type Month } from "@/lib/dates";
import type { BoxInput, BoxTxInput } from "@/lib/validation/finance";
import { listCdiRates } from "./settings";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function rates() {
  return listCdiRates().map((r) => ({ annualRateBp: r.annualRateBp, effectiveFrom: r.effectiveFrom }));
}

function txsOf(boxId: number): (BoxTx & { id: number; notes: string | null })[] {
  return db
    .select({
      id: boxTransactions.id,
      type: boxTransactions.type,
      amountCents: boxTransactions.amountCents,
      date: boxTransactions.date,
      notes: boxTransactions.notes,
    })
    .from(boxTransactions)
    .where(eq(boxTransactions.boxId, boxId))
    .orderBy(asc(boxTransactions.date), asc(boxTransactions.id))
    .all();
}

export type BoxGoal = {
  goalCents: number;
  goalDate: ISODate | null;
  progressPct: number;
  reached: boolean;
  /** Aporte mensal sugerido até a data da meta (null quando não há data). */
  monthlyDepositCents: number | null;
  monthsLeft: number | null;
};

export type BoxSummary = {
  id: number;
  name: string;
  institutionName: string;
  cdiPercentBp: number;
  color: string | null;
  balanceCents: number;
  contributedCents: number;
  yieldCents: number;
  /** Rendimento esperado no mês corrente, sobre o saldo atual. */
  monthYieldCents: number;
  goal: BoxGoal | null;
};

/** Plano da meta, calculado a partir do saldo no início do mês (estável durante o mês). */
function goalPlan(
  box: { goalCents: number | null; goalDate: string | null; cdiPercentBp: number },
  txs: BoxTx[],
  balanceNow: number,
  today: ISODate,
): BoxGoal | null {
  if (!box.goalCents) return null;
  const r = rates();
  const progressPct = Math.min(100, (balanceNow / box.goalCents) * 100);
  const reached = balanceNow >= box.goalCents;
  if (!box.goalDate) {
    return { goalCents: box.goalCents, goalDate: null, progressPct, reached, monthlyDepositCents: null, monthsLeft: null };
  }
  const month = monthOf(today);
  const goalMonth = monthOf(box.goalDate);
  const monthsLeft = monthsBetween(month, goalMonth) + 1;
  const startOfMonth = simulateBox(txs.filter((t) => t.date < `${month}-01`), r, box.cdiPercentBp, dayOfMonth(addMonths(month, -1), 31)).balance;
  const rate = monthlyRate(rateOn(r, today), box.cdiPercentBp);
  return {
    goalCents: box.goalCents,
    goalDate: box.goalDate,
    progressPct,
    reached,
    monthsLeft: Math.max(0, monthsLeft),
    monthlyDepositCents: reached ? 0 : monthsLeft <= 0 ? Math.ceil(box.goalCents - balanceNow) : requiredMonthlyDeposit(startOfMonth, box.goalCents, monthsLeft, rate),
  };
}

function summarize(
  box: typeof savingsBoxes.$inferSelect & { institutionName: string },
  today: ISODate,
): BoxSummary {
  const r = rates();
  const txs = txsOf(box.id);
  const sim = simulateBox(txs, r, box.cdiPercentBp, today);
  return {
    id: box.id,
    name: box.name,
    institutionName: box.institutionName,
    cdiPercentBp: box.cdiPercentBp,
    color: box.color,
    balanceCents: Math.round(sim.balance),
    contributedCents: sim.contributed,
    yieldCents: Math.round(sim.yieldTotal),
    monthYieldCents: Math.round(projectedMonthYield(sim.balance, rateOn(r, today), box.cdiPercentBp, monthOf(today))),
    goal: goalPlan(box, txs, sim.balance, today),
  };
}

function boxesWithInstitution() {
  return db
    .select({ box: savingsBoxes, institutionName: institutions.name })
    .from(savingsBoxes)
    .innerJoin(institutions, eq(institutions.id, savingsBoxes.institutionId))
    .orderBy(asc(savingsBoxes.name))
    .all()
    .map((r) => ({ ...r.box, institutionName: r.institutionName }));
}

export function listBoxes(today: ISODate = todayISO()): BoxSummary[] {
  return boxesWithInstitution()
    .map((b) => summarize(b, today))
    .sort((a, b) => b.balanceCents - a.balanceCents);
}

export function getBoxDetail(id: number, today: ISODate = todayISO()) {
  const box = boxesWithInstitution().find((b) => b.id === id);
  if (!box) return null;
  const r = rates();
  const txs = txsOf(id);
  const summary = summarize(box, today);
  const history: BalancePoint[] = simulateBox(txs, r, box.cdiPercentBp, today).series;
  return {
    ...summary,
    goalCentsRaw: box.goalCents,
    goalDateRaw: box.goalDate,
    currentAnnualRateBp: rateOn(r, today),
    transactions: [...txs].reverse(),
    history,
  };
}

/** Total guardado em todas as caixinhas na data, com rendimento. */
export function totalReserve(date: ISODate = todayISO()): number {
  const r = rates();
  return boxesWithInstitution().reduce(
    (acc, b) => acc + Math.round(simulateBox(txsOf(b.id), r, b.cdiPercentBp, date).balance),
    0,
  );
}

/**
 * Metas no mês (para a previsão do painel):
 * - guardado: aportes − resgates feitos no mês (todas as caixinhas);
 * - planejado: o que ainda falta aportar no mês para seguir o plano das metas com data.
 */
export function goalsForMonth(month: Month, today: ISODate = todayISO()) {
  const moved = db
    .select({
      boxId: boxTransactions.boxId,
      net: sql<number>`sum(case when ${boxTransactions.type} = 'deposit' then ${boxTransactions.amountCents} else -${boxTransactions.amountCents} end)`.mapWith(Number),
      deposits: sql<number>`sum(case when ${boxTransactions.type} = 'deposit' then ${boxTransactions.amountCents} else 0 end)`.mapWith(Number),
    })
    .from(boxTransactions)
    .where(and(gte(boxTransactions.date, `${month}-01`), lte(boxTransactions.date, `${month}-31`)))
    .groupBy(boxTransactions.boxId)
    .all();

  const saved = moved.reduce((a, m) => a + m.net, 0);
  const current = monthOf(today);
  let planned = 0;

  if (month >= current) {
    for (const b of listBoxes(today)) {
      const g = b.goal;
      if (!g?.goalDate || g.reached || !g.monthlyDepositCents) continue;
      if (month > monthOf(g.goalDate)) continue;
      const depositedThisMonth = month === current ? (moved.find((m) => m.boxId === b.id)?.deposits ?? 0) : 0;
      planned += Math.max(0, g.monthlyDepositCents - depositedThisMonth);
    }
  }
  return { saved, planned, total: saved + planned };
}

// ------------------------------------------------------------------ CRUD --

function upsertInstitution(tx: Tx, name: string): number {
  const clean = name.trim();
  const existing = tx
    .select({ id: institutions.id })
    .from(institutions)
    .where(sql`lower(${institutions.name}) = lower(${clean})`)
    .get();
  if (existing) return existing.id;
  return tx.insert(institutions).values({ name: clean }).returning({ id: institutions.id }).get().id;
}

function boxValues(tx: Tx, input: BoxInput) {
  return {
    name: input.name,
    institutionId: upsertInstitution(tx, input.institution),
    cdiPercentBp: input.cdiPercent,
    goalCents: input.goal,
    goalDate: input.goalDate,
    color: input.color,
  };
}

export function createBox(input: BoxInput) {
  return db.transaction((tx) => tx.insert(savingsBoxes).values(boxValues(tx, input)).returning({ id: savingsBoxes.id }).get());
}

export function updateBox(id: number, input: BoxInput) {
  return db.transaction((tx) => tx.update(savingsBoxes).set(boxValues(tx, input)).where(eq(savingsBoxes.id, id)).run().changes > 0);
}

export function deleteBox(id: number) {
  return db.delete(savingsBoxes).where(eq(savingsBoxes.id, id)).run().changes > 0;
}

export type TxResult = { ok: true } | { ok: false; error: string };

/** Registra aporte/resgate. Resgates não podem deixar o saldo negativo em nenhum momento. */
export function addBoxTransaction(input: BoxTxInput, today: ISODate = todayISO()): TxResult {
  const box = db.select().from(savingsBoxes).where(eq(savingsBoxes.id, input.boxId)).get();
  if (!box) return { ok: false, error: "Caixinha não encontrada." };
  if (input.date > today) return { ok: false, error: "A data não pode estar no futuro." };

  if (input.type === "withdrawal") {
    const candidate = [...txsOf(box.id), { type: "withdrawal" as const, amountCents: input.amount, date: input.date }];
    const sim = simulateBox(candidate, rates(), box.cdiPercentBp, today);
    if (sim.minBalanceAfterTx < -0.5) {
      const available = Math.floor(simulateBox(txsOf(box.id), rates(), box.cdiPercentBp, input.date).balance);
      return { ok: false, error: `Saldo insuficiente nessa data. Disponível: R$ ${(available / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}.` };
    }
  }

  db.insert(boxTransactions)
    .values({ boxId: box.id, type: input.type, amountCents: input.amount, date: input.date, notes: input.notes })
    .run();
  return { ok: true };
}

/** Exclui uma movimentação, desde que isso não deixe o saldo negativo depois. */
export function deleteBoxTransaction(id: number, today: ISODate = todayISO()): TxResult {
  const row = db.select().from(boxTransactions).where(eq(boxTransactions.id, id)).get();
  if (!row) return { ok: false, error: "Movimentação não encontrada." };
  const box = db.select().from(savingsBoxes).where(eq(savingsBoxes.id, row.boxId)).get()!;
  const remaining = txsOf(row.boxId).filter((t) => t.id !== id);
  if (simulateBox(remaining, rates(), box.cdiPercentBp, today).minBalanceAfterTx < -0.5) {
    return { ok: false, error: "Não é possível excluir este aporte: um resgate posterior ficaria sem saldo." };
  }
  db.delete(boxTransactions).where(eq(boxTransactions.id, id)).run();
  return { ok: true };
}

export function listBoxInstitutionNames(): string[] {
  return db.select({ name: institutions.name }).from(institutions).orderBy(asc(institutions.name)).all().map((r) => r.name);
}

