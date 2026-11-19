import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import {
  boxTransactions, cardPurchases, categories, creditCards, incomeSources, installments,
  institutions, invoices, monthlySettlements, recurringExpenses, savingsBoxes, settings,
} from "@/db/schema";
import { annualToMonthlyPct, monthlyToAnnualPct, parsePct } from "@/lib/rates";
import { createCard, createPurchase, setInvoicePaid } from "@/server/finance/cards";
import { createExpense, updateExpense } from "@/server/finance/expenses";
import { createIncome } from "@/server/finance/incomes";
import { getCategoryReport, getMonthOverview, healthOf } from "@/server/finance/overview";
import { cdiRateOn, deleteCdiRate, listCdiRates, setCdiRate, updateAccountBalance } from "@/server/finance/settings";
import { setSettled } from "@/server/finance/settlements";

const M = "2026-12";
const TODAY = "2026-12-12";
let moradia: number;

beforeEach(() => {
  for (const t of [monthlySettlements, installments, cardPurchases, invoices, creditCards, boxTransactions, savingsBoxes, institutions, incomeSources, recurringExpenses, settings]) db.delete(t).run();
  db.delete(categories).run();
  moradia = db.insert(categories).values({ name: "Moradia", kind: "expense", color: "#8b5cf6" }).returning().get().id;
});

function seed() {
  const salary = createIncome({ recurrence: "monthly", payDay: 5, startMonth: "2026-11", endMonth: null, name: "Salário", type: "salary", amount: 1000000, categoryId: null, notes: null });
  createIncome({ recurrence: "once", payDate: "2026-12-20", name: "Bônus", type: "extra", amount: 200000, categoryId: null, notes: null });
  const rent = createExpense({ name: "Aluguel", categoryId: moradia, amount: 300000, dueDay: 10, startMonth: "2026-11", endMonth: null, notes: null });
  createExpense({ name: "Condomínio", categoryId: moradia, amount: 80000, dueDay: 15, startMonth: "2026-11", endMonth: null, notes: null });
  const card = createCard({ name: "Nubank", institution: "Nubank", limit: 1000000, closingDay: 3, dueDay: 10, color: "#7c3aed" });
  createPurchase({ cardId: card.id, description: "TV", categoryId: null, total: 120000, installmentsCount: 2, purchaseDate: "2026-11-20", notes: null });
  return { salary, rent, card };
}

describe("taxas CDI", () => {
  it("converte mensal ⇄ anual com juros compostos", () => {
    expect(monthlyToAnnualPct(1)).toBeCloseTo(12.6825, 3);
    expect(annualToMonthlyPct(12.6825)).toBeCloseTo(1, 4);
    expect(annualToMonthlyPct(13.65)).toBeCloseTo(1.072, 3);
    expect(parsePct("1,07")).toBe(1.07);
    expect(parsePct("13,65%")).toBe(13.65);
    expect(parsePct("abc")).toBeNull();
  });

  it("histórico: taxa vigente por data e nunca apaga a última", async () => {
    db.delete((await import("@/db/schema")).cdiRates).run();
    setCdiRate(1365, "2026-11-05");
    setCdiRate(1400, "2027-01-01");
    expect(cdiRateOn("2026-12-01")?.annualRateBp).toBe(1365);
    expect(cdiRateOn("2027-02-01")?.annualRateBp).toBe(1400);
    expect(cdiRateOn("2020-01-01")?.annualRateBp).toBe(1365); // antes de tudo: a mais antiga
    setCdiRate(1410, "2027-01-01"); // mesma data substitui
    expect(listCdiRates()).toHaveLength(2);
    const [a, b] = listCdiRates();
    expect(deleteCdiRate(a.id)).toBe(true);
    expect(deleteCdiRate(b.id)).toBe(false);
  });
});

describe("painel do mês", () => {
  it("tudo pendente: recebido 0, a receber e a pagar completos", () => {
    seed();
    const o = getMonthOverview(M, TODAY);
    expect(o.totals).toMatchObject({ received: 0, toReceive: 1200000, paid: 0, toPay: 300000 + 80000 + 60000 });
    expect(o.totals.forecast).toBe(1200000 - 440000);
    expect(o.payables.map((p) => p.date)).toEqual(["2026-12-10", "2026-12-10", "2026-12-15"]);
    expect(o.payables.filter((p) => p.overdue)).toHaveLength(2); // aluguel e fatura venceram dia 10
  });

  it("confirmar recebimento e pagamentos move os valores sem mudar a previsão", () => {
    const { salary, rent, card } = seed();
    setSettled("income", salary.id, M, true);
    setSettled("expense", rent.id, M, true);
    setInvoicePaid(card.id, M, true);
    const o = getMonthOverview(M, TODAY);
    expect(o.totals).toMatchObject({ received: 1000000, toReceive: 200000, paid: 360000, toPay: 80000 });
    expect(o.totals.realized).toBe(640000);
    expect(o.totals.forecast).toBe(760000);
    expect(o.paidItems.map((p) => p.name)).toEqual(["Aluguel", "Fatura Nubank"]);
  });

  it("valor confirmado fica congelado mesmo se o gasto mudar depois", () => {
    const { rent } = seed();
    setSettled("expense", rent.id, M, true);
    updateExpense(rent.id, { name: "Aluguel", categoryId: moradia, amount: 350000, dueDay: 10, startMonth: "2026-11", endMonth: null, notes: null });
    expect(getMonthOverview(M, TODAY).totals.paid).toBe(300000);
    expect(getMonthOverview("2027-01", TODAY).totals.toPay).toBeGreaterThanOrEqual(350000);
    setSettled("expense", rent.id, M, false);
    expect(getMonthOverview(M, TODAY).totals.paid).toBe(0);
  });

  it("patrimônio = saldo em conta + caixinhas − dívidas dos cartões", () => {
    seed();
    updateAccountBalance(500000, TODAY);
    const inst = db.insert(institutions).values({ name: "Banco" }).returning().get();
    const box = db.insert(savingsBoxes).values({ institutionId: inst.id, name: "Reserva", cdiPercentBp: 11500 }).returning().get();
    db.insert(boxTransactions).values([
      { boxId: box.id, type: "deposit", amountCents: 300000, date: "2026-12-01" },
      { boxId: box.id, type: "withdrawal", amountCents: 50000, date: "2026-12-05" },
    ]).run();
    const o = getMonthOverview(M, TODAY);
    expect(o.totals.reserve).toBe(250000);
    expect(o.totals.debts).toBe(120000);
    expect(o.totals.netWorth).toBe(500000 + 250000 - 120000);
  });

  it("farol usa os limites configurados", () => {
    expect(healthOf(2500, 10000, 2000, 500)).toBe("green");
    expect(healthOf(1000, 10000, 2000, 500)).toBe("yellow");
    expect(healthOf(400, 10000, 2000, 500)).toBe("red");
    expect(healthOf(-1, 10000, 2000, 500)).toBe("red");
    expect(healthOf(0, 0, 2000, 500)).toBe("red");
  });
});

describe("relatório por categoria", () => {
  it("junta gastos fixos e parcelas do cartão do mês, ordenado por valor", () => {
    seed();
    const r = getCategoryReport(M);
    expect(r.rows.map((x) => [x.name, x.totalCents])).toEqual([
      ["Moradia", 380000],
      ["Sem categoria", 60000],
    ]);
    expect(r.totalCents).toBe(440000);
    expect(r.rows[1].items[0]).toMatchObject({ label: "TV", source: "cartão", detail: "Nubank · parcela 1/2" });
  });
});
