import "server-only";
import { and, eq, gte, lte, ne, sql, sum } from "drizzle-orm";
import { db } from "@/db/client";
import {
  cardPurchases,
  categories,
  creditCards,
  installments,
  invoices,
  oneTimeExpenses,
} from "@/db/schema";
import { dayOfMonth, todayISO, type ISODate, type Month } from "@/lib/dates";
import { goalsForMonth, totalReserve } from "./boxes";
import { invoiceStatus, type InvoiceStatus } from "./cards";
import { expenseAppliesTo, listExpenses } from "./expenses";
import { incomeAppliesTo, listIncomes } from "./incomes";
import { getSettings } from "./settings";
import { listSettlements } from "./settlements";
import { simulatedItemsForMonth } from "./simulations";

import { healthOf, type Health } from "@/lib/health";

export { healthOf, type Health };

export type IncomeOccurrence = { id: number; name: string; date: ISODate; amountCents: number; settled: boolean };
export type ExpenseOccurrence = {
  id: number;
  name: string;
  date: ISODate;
  amountCents: number;
  settled: boolean;
  categoryName: string;
  categoryColor: string | null;
};
export type MonthInvoice = {
  cardId: number;
  cardName: string;
  cardColor: string | null;
  referenceMonth: Month;
  dueDate: ISODate;
  closingDate: ISODate;
  totalCents: number;
  status: InvoiceStatus;
};
export type Payable =
  | ({ kind: "expense" } & ExpenseOccurrence & { overdue: boolean })
  | ({ kind: "invoice" } & MonthInvoice & { date: ISODate; overdue: boolean });

/** Faturas (com lançamentos) que vencem no mês, de todos os cartões. */
function monthInvoices(month: Month, today: ISODate): MonthInvoice[] {
  return db
    .select({
      cardId: creditCards.id,
      cardName: creditCards.name,
      cardColor: creditCards.color,
      referenceMonth: invoices.referenceMonth,
      dueDate: invoices.dueDate,
      closingDate: invoices.closingDate,
      status: invoices.status,
      totalCents: sql<number>`coalesce(${sum(installments.amountCents)}, 0)`.mapWith(Number),
    })
    .from(invoices)
    .innerJoin(creditCards, eq(creditCards.id, invoices.cardId))
    .leftJoin(installments, eq(installments.invoiceId, invoices.id))
    .where(eq(invoices.referenceMonth, month))
    .groupBy(invoices.id)
    .orderBy(invoices.dueDate)
    .all()
    .filter((i) => i.totalCents > 0 || i.status === "paid")
    .map((i) => ({ ...i, status: invoiceStatus(i, today) }));
}

/** Tudo que falta pagar nos cartões (parcelas em faturas não pagas, inclusive futuras). */
function cardDebts(): number {
  const row = db
    .select({ total: sql<number>`coalesce(${sum(installments.amountCents)}, 0)`.mapWith(Number) })
    .from(installments)
    .innerJoin(invoices, eq(invoices.id, installments.invoiceId))
    .where(ne(invoices.status, "paid"))
    .get();
  return row?.total ?? 0;
}

function oneTimeInMonth(month: Month) {
  return db
    .select({
      id: oneTimeExpenses.id,
      description: oneTimeExpenses.description,
      amountCents: oneTimeExpenses.amountCents,
      date: oneTimeExpenses.date,
      categoryName: categories.name,
      categoryColor: categories.color,
    })
    .from(oneTimeExpenses)
    .leftJoin(categories, eq(categories.id, oneTimeExpenses.categoryId))
    .where(and(gte(oneTimeExpenses.date, `${month}-01`), lte(oneTimeExpenses.date, `${month}-31`)))
    .all();
}

export function getMonthOverview(month: Month, today: ISODate = todayISO(), opts: { includeSimulations?: boolean } = {}) {
  const settled = listSettlements(month);
  const settledIncome = new Map(settled.filter((s) => s.incomeId).map((s) => [s.incomeId!, s.amountCents]));
  const settledExpense = new Map(settled.filter((s) => s.expenseId).map((s) => [s.expenseId!, s.amountCents]));

  const incomes: IncomeOccurrence[] = listIncomes()
    .filter((i) => incomeAppliesTo(i, month))
    .map((i) => ({
      id: i.id,
      name: i.name,
      date: i.recurrence === "monthly" ? dayOfMonth(month, i.payDay!) : i.payDate!,
      amountCents: settledIncome.get(i.id) ?? i.amountCents,
      settled: settledIncome.has(i.id),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const expenses: ExpenseOccurrence[] = listExpenses()
    .filter((e) => expenseAppliesTo(e, month))
    .map((e) => ({
      id: e.id,
      name: e.name,
      date: dayOfMonth(month, e.dueDay),
      amountCents: settledExpense.get(e.id) ?? e.amountCents,
      settled: settledExpense.has(e.id),
      categoryName: e.categoryName,
      categoryColor: e.categoryColor,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const cardInvoices = monthInvoices(month, today);
  const oneTime = oneTimeInMonth(month);

  const sumOf = (xs: { amountCents?: number; totalCents?: number }[]) =>
    xs.reduce((a, x) => a + (x.amountCents ?? x.totalCents ?? 0), 0);

  const received = sumOf(incomes.filter((i) => i.settled));
  const toReceive = sumOf(incomes.filter((i) => !i.settled));
  const paid =
    sumOf(expenses.filter((e) => e.settled)) +
    sumOf(cardInvoices.filter((i) => i.status === "paid")) +
    sumOf(oneTime.filter((o) => o.date <= today));
  const toPay =
    sumOf(expenses.filter((e) => !e.settled)) +
    sumOf(cardInvoices.filter((i) => i.status !== "paid")) +
    sumOf(oneTime.filter((o) => o.date > today));
  const goalPlan = goalsForMonth(month, today);
  const goals = goalPlan.total;
  const realized = received - paid;
  const simulatedItems = opts.includeSimulations ? simulatedItemsForMonth(month) : [];
  const simulated = simulatedItems.reduce((a, s) => a + s.amountCents, 0);
  const forecast = realized + toReceive - toPay - goals - simulated;

  const settings = getSettings();
  const totalIncome = received + toReceive;
  const health = healthOf(forecast, totalIncome, settings.greenThresholdBp, settings.yellowThresholdBp);

  // Posição atual (não depende do mês selecionado).
  const reserve = totalReserve(today);
  const debts = cardDebts();
  const netWorth = (settings.accountBalanceCents ?? 0) + reserve - debts;

  const payables: Payable[] = [
    ...expenses.filter((e) => !e.settled).map((e) => ({ kind: "expense" as const, ...e, overdue: e.date < today })),
    ...cardInvoices
      .filter((i) => i.status !== "paid")
      .map((i) => ({ kind: "invoice" as const, ...i, date: i.dueDate, overdue: i.dueDate < today })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const paidItems = [
    ...expenses.filter((e) => e.settled).map((e) => ({ kind: "expense" as const, id: e.id, name: e.name, date: e.date, amountCents: e.amountCents })),
    ...cardInvoices
      .filter((i) => i.status === "paid")
      .map((i) => ({ kind: "invoice" as const, id: i.cardId, name: `Fatura ${i.cardName}`, date: i.dueDate, amountCents: i.totalCents })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  return {
    month,
    totals: { received, toReceive, paid, toPay, goals, simulated, realized, forecast, totalIncome, reserve, debts, netWorth },
    simulatedItems,
    goals: goalPlan,
    health,
    thresholds: { greenBp: settings.greenThresholdBp, yellowBp: settings.yellowThresholdBp },
    accountBalance: { cents: settings.accountBalanceCents, date: settings.accountBalanceDate },
    incomes,
    payables,
    paidItems,
    cardInvoices,
  };
}

// ------------------------------------------------------ Gastos por categoria --

export type CategoryReportItem = {
  label: string;
  source: "fixo" | "cartão" | "avulso";
  detail: string;
  amountCents: number;
};
export type CategoryReportRow = {
  name: string;
  color: string | null;
  totalCents: number;
  items: CategoryReportItem[];
};

/** Todas as saídas do mês (gastos fixos + parcelas de cartão + avulsos) agrupadas por categoria. */
export function getCategoryReport(month: Month): { rows: CategoryReportRow[]; totalCents: number } {
  const groups = new Map<string, CategoryReportRow>();
  const add = (name: string | null, color: string | null, item: CategoryReportItem) => {
    const key = name ?? "Sem categoria";
    const g = groups.get(key) ?? { name: key, color: name ? color : null, totalCents: 0, items: [] };
    g.totalCents += item.amountCents;
    g.items.push(item);
    groups.set(key, g);
  };

  for (const e of listExpenses().filter((x) => expenseAppliesTo(x, month))) {
    add(e.categoryName, e.categoryColor, { label: e.name, source: "fixo", detail: `Vence dia ${e.dueDay}`, amountCents: e.amountCents });
  }

  const parts = db
    .select({
      description: cardPurchases.description,
      number: installments.number,
      count: cardPurchases.installmentsCount,
      amountCents: installments.amountCents,
      cardName: creditCards.name,
      categoryName: categories.name,
      categoryColor: categories.color,
    })
    .from(installments)
    .innerJoin(invoices, eq(invoices.id, installments.invoiceId))
    .innerJoin(cardPurchases, eq(cardPurchases.id, installments.purchaseId))
    .innerJoin(creditCards, eq(creditCards.id, invoices.cardId))
    .leftJoin(categories, eq(categories.id, cardPurchases.categoryId))
    .where(eq(invoices.referenceMonth, month))
    .all();
  for (const p of parts) {
    add(p.categoryName, p.categoryColor, {
      label: p.description,
      source: "cartão",
      detail: `${p.cardName}${p.count > 1 ? ` · parcela ${p.number}/${p.count}` : ""}`,
      amountCents: p.amountCents,
    });
  }

  for (const o of oneTimeInMonth(month)) {
    add(o.categoryName, o.categoryColor, { label: o.description, source: "avulso", detail: "Débito/Pix", amountCents: o.amountCents });
  }

  const rows = [...groups.values()]
    .map((g) => ({ ...g, items: g.items.sort((a, b) => b.amountCents - a.amountCents) }))
    .sort((a, b) => b.totalCents - a.totalCents);
  return { rows, totalCents: rows.reduce((a, r) => a + r.totalCents, 0) };
}
