import "server-only";
import { recordMovement } from "./ledger";
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db, type Tx } from "@/db/client";
import { first, touched } from "@/db/query";
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
import { upsertInstitution } from "./cards";
import { listCdiRates } from "./settings";

type Rates = { annualRateBp: number; effectiveFrom: string }[];

async function rates(uid: number): Promise<Rates> {
  return (await listCdiRates(uid)).map((r) => ({ annualRateBp: r.annualRateBp, effectiveFrom: r.effectiveFrom }));
}

type TxRow = BoxTx & { id: number; notes: string | null };

async function txsOf(boxIds: number[]): Promise<Map<number, TxRow[]>> {
  const map = new Map<number, TxRow[]>(boxIds.map((id) => [id, []]));
  if (!boxIds.length) return map;
  const rows = await db
    .select({
      id: boxTransactions.id,
      boxId: boxTransactions.boxId,
      type: boxTransactions.type,
      amountCents: boxTransactions.amountCents,
      date: boxTransactions.date,
      notes: boxTransactions.notes,
    })
    .from(boxTransactions)
    .where(inArray(boxTransactions.boxId, boxIds))
    .orderBy(asc(boxTransactions.date), asc(boxTransactions.id));
  for (const { boxId, ...t } of rows) map.get(boxId)!.push(t);
  return map;
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
  r: Rates,
  box: { goalCents: number | null; goalDate: string | null; cdiPercentBp: number },
  txs: BoxTx[],
  balanceNow: number,
  today: ISODate,
): BoxGoal | null {
  if (!box.goalCents) return null;
  const progressPct = Math.min(100, (balanceNow / box.goalCents) * 100);
  const reached = balanceNow >= box.goalCents;
  if (!box.goalDate) {
    return { goalCents: box.goalCents, goalDate: null, progressPct, reached, monthlyDepositCents: null, monthsLeft: null };
  }
  const month = monthOf(today);
  const goalMonth = monthOf(box.goalDate);
  const monthsLeft = monthsBetween(month, goalMonth) + 1;
  const startOfMonth = simulateBox(
    txs.filter((t) => t.date < `${month}-01`),
    r,
    box.cdiPercentBp,
    dayOfMonth(addMonths(month, -1), 31),
  ).balance;
  const rate = monthlyRate(rateOn(r, today), box.cdiPercentBp);
  return {
    goalCents: box.goalCents,
    goalDate: box.goalDate,
    progressPct,
    reached,
    monthsLeft: Math.max(0, monthsLeft),
    monthlyDepositCents: reached
      ? 0
      : monthsLeft <= 0
        ? Math.ceil(box.goalCents - balanceNow)
        : requiredMonthlyDeposit(startOfMonth, box.goalCents, monthsLeft, rate),
  };
}

type BoxWithInstitution = typeof savingsBoxes.$inferSelect & { institutionName: string };

function summarize(r: Rates, box: BoxWithInstitution, txs: TxRow[], today: ISODate): BoxSummary {
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
    goal: goalPlan(r, box, txs, sim.balance, today),
  };
}

async function boxesWithInstitution(uid: number): Promise<BoxWithInstitution[]> {
  const rows = await db
    .select({ box: savingsBoxes, institutionName: institutions.name })
    .from(savingsBoxes)
    .innerJoin(institutions, eq(institutions.id, savingsBoxes.institutionId))
    .where(eq(savingsBoxes.userId, uid))
    .orderBy(asc(savingsBoxes.name));
  return rows.map((r) => ({ ...r.box, institutionName: r.institutionName }));
}

export async function listBoxes(uid: number, today: ISODate = todayISO()): Promise<BoxSummary[]> {
  const [r, boxes] = await Promise.all([rates(uid), boxesWithInstitution(uid)]);
  const txs = await txsOf(boxes.map((b) => b.id));
  return boxes.map((b) => summarize(r, b, txs.get(b.id)!, today)).sort((a, b) => b.balanceCents - a.balanceCents);
}

export async function getBoxDetail(uid: number, id: number, today: ISODate = todayISO()) {
  const box = (await boxesWithInstitution(uid)).find((b) => b.id === id);
  if (!box) return null;
  const r = await rates(uid);
  const txs = (await txsOf([id])).get(id)!;
  const summary = summarize(r, box, txs, today);
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
export async function totalReserve(uid: number, date: ISODate = todayISO()): Promise<number> {
  const [r, boxes] = await Promise.all([rates(uid), boxesWithInstitution(uid)]);
  const txs = await txsOf(boxes.map((b) => b.id));
  return boxes.reduce((acc, b) => acc + Math.round(simulateBox(txs.get(b.id)!, r, b.cdiPercentBp, date).balance), 0);
}

/**
 * Metas no mês (para a previsão do painel):
 * - guardado: aportes − resgates feitos no mês (todas as caixinhas);
 * - planejado: o que ainda falta aportar no mês para seguir o plano das metas com data.
 */
export async function goalsForMonth(uid: number, month: Month, today: ISODate = todayISO()) {
  const moved = await db
    .select({
      boxId: boxTransactions.boxId,
      net: sql<number>`sum(case when ${boxTransactions.type} = 'deposit' then ${boxTransactions.amountCents} else -${boxTransactions.amountCents} end)`.mapWith(
        Number,
      ),
      deposits:
        sql<number>`sum(case when ${boxTransactions.type} = 'deposit' then ${boxTransactions.amountCents} else 0 end)`.mapWith(
          Number,
        ),
    })
    .from(boxTransactions)
    .innerJoin(savingsBoxes, eq(savingsBoxes.id, boxTransactions.boxId))
    .where(and(eq(savingsBoxes.userId, uid), gte(boxTransactions.date, `${month}-01`), lte(boxTransactions.date, `${month}-31`)))
    .groupBy(boxTransactions.boxId);

  const saved = moved.reduce((a, m) => a + m.net, 0);
  const current = monthOf(today);
  let planned = 0;

  if (month >= current) {
    for (const b of await listBoxes(uid, today)) {
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

async function boxValues(tx: Tx, uid: number, input: BoxInput) {
  const institutionId = await upsertInstitution(tx, uid, input.institution);
  if (!institutionId) throw new Error("Instituição obrigatória.");
  return {
    name: input.name,
    institutionId,
    cdiPercentBp: input.cdiPercent,
    goalCents: input.goal,
    goalDate: input.goalDate,
    color: input.color,
  };
}

const mine = (uid: number, id: number) => and(eq(savingsBoxes.id, id), eq(savingsBoxes.userId, uid));

export async function createBox(uid: number, input: BoxInput) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(savingsBoxes)
      .values({ ...(await boxValues(tx, uid, input)), userId: uid })
      .returning({ id: savingsBoxes.id });
    return row;
  });
}

export async function updateBox(uid: number, id: number, input: BoxInput) {
  return db.transaction(async (tx) => {
    const exists = await tx.select({ id: savingsBoxes.id }).from(savingsBoxes).where(mine(uid, id)).then(first);
    if (!exists) return false;
    const rows = await tx
      .update(savingsBoxes)
      .set(await boxValues(tx, uid, input))
      .where(mine(uid, id))
      .returning(touched);
    return rows.length > 0;
  });
}

export async function deleteBox(uid: number, id: number) {
  return (await db.delete(savingsBoxes).where(mine(uid, id)).returning(touched)).length > 0;
}

export type TxResult = { ok: true } | { ok: false; error: string };

/** Registra aporte/resgate. Resgates não podem deixar o saldo negativo em nenhum momento. */
export async function addBoxTransaction(uid: number, input: BoxTxInput, today: ISODate = todayISO()): Promise<TxResult> {
  const box = await db.select().from(savingsBoxes).where(mine(uid, input.boxId)).then(first);
  if (!box) return { ok: false, error: "Caixinha não encontrada." };
  if (input.date > today) return { ok: false, error: "A data não pode estar no futuro." };

  if (input.type === "withdrawal") {
    const r = await rates(uid);
    const existing = (await txsOf([box.id])).get(box.id)!;
    const candidate = [...existing, { type: "withdrawal" as const, amountCents: input.amount, date: input.date }];
    const sim = simulateBox(candidate, r, box.cdiPercentBp, today);
    if (sim.minBalanceAfterTx < -0.5) {
      const available = Math.floor(simulateBox(existing, r, box.cdiPercentBp, input.date).balance);
      return {
        ok: false,
        error: `Saldo insuficiente nessa data. Disponível: R$ ${(available / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}.`,
      };
    }
  }

  // Aporte sai da conta corrente; resgate volta para ela.
  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(boxTransactions)
      .values({ boxId: box.id, type: input.type, amountCents: input.amount, date: input.date, notes: input.notes })
      .returning({ id: boxTransactions.id });
    const deposit = input.type === "deposit";
    await recordMovement(
      tx,
      uid,
      "box",
      { boxTxId: row.id },
      deposit ? -input.amount : input.amount,
      input.date,
      `${deposit ? "Aporte" : "Resgate"}: ${box.name}`,
    );
  });
  return { ok: true };
}

/** Exclui uma movimentação, desde que isso não deixe o saldo negativo depois. */
export async function deleteBoxTransaction(uid: number, id: number, today: ISODate = todayISO()): Promise<TxResult> {
  const found = await db
    .select({ tx: boxTransactions, box: savingsBoxes })
    .from(boxTransactions)
    .innerJoin(savingsBoxes, eq(savingsBoxes.id, boxTransactions.boxId))
    .where(and(eq(boxTransactions.id, id), eq(savingsBoxes.userId, uid)))
    .then(first);
  if (!found) return { ok: false, error: "Movimentação não encontrada." };
  const { tx: row, box } = found;
  const remaining = (await txsOf([row.boxId])).get(row.boxId)!.filter((t) => t.id !== id);
  if (simulateBox(remaining, await rates(uid), box.cdiPercentBp, today).minBalanceAfterTx < -0.5) {
    return { ok: false, error: "Não é possível excluir este aporte: um resgate posterior ficaria sem saldo." };
  }
  await db.delete(boxTransactions).where(eq(boxTransactions.id, id));
  return { ok: true };
}

export async function listBoxInstitutionNames(uid: number): Promise<string[]> {
  const rows = await db
    .select({ name: institutions.name })
    .from(institutions)
    .where(eq(institutions.userId, uid))
    .orderBy(asc(institutions.name));
  return rows.map((r) => r.name);
}
