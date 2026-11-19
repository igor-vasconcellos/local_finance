import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { freshUser } from "./helpers/user";
import {
  boxTransactions, cardPurchases, categories, cdiRates, creditCards, incomeSources, installments, institutions,
  invoices, monthlySettlements, oneTimeExpenses, recurringExpenses, savingsBoxes, settings, simulationInstallments, simulations,
} from "@/db/schema";
import { healthOf } from "@/lib/health";
import { simulationSchedule } from "@/lib/simulation";
import { simulationSchema } from "@/lib/validation/finance";
import { createCard, createPurchase, listInvoiceMonths, setCardActive } from "@/server/finance/cards";
import { createExpense } from "@/server/finance/expenses";
import { createIncome } from "@/server/finance/incomes";
import { projectMonths } from "@/server/finance/projection";
import {
  createSimulation, deleteSimulation, effectivateSimulation, listSimulations, setSimulationVisible,
} from "@/server/finance/simulations";

const TODAY = "2026-11-18";
let cat: number;

let uid = 0;

beforeEach(() => {
  uid = freshUser();
  for (const t of [simulationInstallments, cardPurchases, oneTimeExpenses, simulations, monthlySettlements, installments, invoices, creditCards,
    boxTransactions, savingsBoxes, institutions, incomeSources, recurringExpenses, settings]) db.delete(t).run();
  db.delete(categories).run(); db.delete(cdiRates).run();
  db.insert(cdiRates).values({ userId: uid, annualRateBp: 1365, effectiveFrom: "2026-01-01" }).run();
  cat = db.insert(categories).values({ userId: uid, name: "Moradia", kind: "expense" }).returning().get().id;
  createIncome(uid, { recurrence: "monthly", payDay: 5, startMonth: "2026-11", endMonth: null, name: "Salário", type: "salary", amount: 1_000_000, categoryId: null, notes: null });
  createExpense(uid, { name: "Aluguel", categoryId: cat, amount: 600_000, dueDay: 10, startMonth: "2026-11", endMonth: null, notes: null });
});

const card = () => createCard(uid, { name: "Nubank", institution: "Nubank", limit: 2_000_000, closingDay: 3, dueDay: 10, color: "#7c3aed" });
const sim = (over: Partial<Parameters<typeof createSimulation>[1]> = {}) => ({
  description: "TV", paymentMethod: "credit" as const, cardId: null as number | null, categoryId: null,
  total: 240_000, installmentsCount: 12, purchaseDate: TODAY, ...over,
});

describe("cronograma da simulação", () => {
  it("crédito: parcelas nos meses de vencimento das faturas", () => {
    const s = simulationSchedule({ paymentMethod: "credit", totalCents: 30_000, installmentsCount: 3, purchaseDate: TODAY, card: { closingDay: 3, dueDay: 10 } });
    expect(s).toEqual([
      { number: 1, referenceMonth: "2026-12", amountCents: 10_000 },
      { number: 2, referenceMonth: "2027-01", amountCents: 10_000 },
      { number: 3, referenceMonth: "2027-02", amountCents: 10_000 },
    ]);
  });
  it("débito: valor inteiro no mês da compra", () => {
    expect(simulationSchedule({ paymentMethod: "debit", totalCents: 50_000, installmentsCount: 1, purchaseDate: TODAY })).toEqual([
      { number: 1, referenceMonth: "2026-11", amountCents: 50_000 },
    ]);
  });
  it("validação: crédito exige cartão; débito força 1 parcela", () => {
    const base = { description: "X", total: "100,00", installmentsCount: "6", purchaseDate: TODAY, categoryId: "" };
    expect(simulationSchema.safeParse({ ...base, paymentMethod: "credit" }).success).toBe(false);
    const d = simulationSchema.parse({ ...base, paymentMethod: "debit", cardId: "3" });
    expect(d).toMatchObject({ cardId: null, installmentsCount: 1, total: 10_000 });
  });
});

describe("projeção e farol", () => {
  it("livre = renda − fixos − faturas − metas; farol por mês", () => {
    const { months } = projectMonths(uid, "2026-11", 3, TODAY);
    expect(months.map((m) => m.freeRealCents)).toEqual([400_000, 400_000, 400_000]);
    expect(months[0].healthReal).toBe("green"); // 40% livre
  });

  it("simulações consideradas entram no cenário; desmarcar tira", () => {
    const c = card();
    const r = createSimulation(uid, sim({ cardId: c.id }));
    expect(r.ok).toBe(true);
    let { months } = projectMonths(uid, "2026-11", 3, TODAY);
    expect(months.map((m) => m.simulatedCents)).toEqual([0, 20_000, 20_000]);
    expect(months[1].freeCents).toBe(380_000);
    setSimulationVisible(uid, r.ok ? r.id : 0, false);
    ({ months } = projectMonths(uid, "2026-11", 3, TODAY));
    expect(months[1].simulatedCents).toBe(0);
  });

  it("compra grande no débito pode deixar o mês vermelho", () => {
    createSimulation(uid, sim({ paymentMethod: "debit", total: 380_000, installmentsCount: 1 }));
    const { months } = projectMonths(uid, "2026-11", 2, TODAY);
    expect(months[0].freeCents).toBe(20_000); // 2% da renda
    expect(months[0].health).toBe("red");
    expect(months[0].healthReal).toBe("green");
    expect(months[1].health).toBe("green");
  });

  it("faturas reais entram no mês do vencimento", () => {
    const c = card();
    createPurchase(uid, { cardId: c.id, description: "Notebook", categoryId: null, total: 300_000, installmentsCount: 3, purchaseDate: TODAY, notes: null });
    const { months } = projectMonths(uid, "2026-11", 4, TODAY);
    expect(months.map((m) => m.invoicesCents)).toEqual([0, 100_000, 100_000, 100_000]);
  });

  it("limites de farol", () => {
    expect(healthOf(2001, 10000, 2000, 500)).toBe("green");
    expect(healthOf(500, 10000, 2000, 500)).toBe("yellow");
    expect(healthOf(499, 10000, 2000, 500)).toBe("red");
  });
});

describe("efetivar simulação", () => {
  it("crédito vira compra real com parcelas e sai do cenário simulado", () => {
    const c = card();
    const r = createSimulation(uid, sim({ cardId: c.id, installmentsCount: 3, total: 90_000 }));
    if (!r.ok) throw new Error();
    expect(effectivateSimulation(uid, r.id)).toEqual({ ok: true, id: r.id });
    expect(listInvoiceMonths(uid, c.id, TODAY).map((m) => [m.referenceMonth, m.totalCents])).toEqual([
      ["2026-12", 30_000], ["2027-01", 30_000], ["2027-02", 30_000],
    ]);
    const purchase = db.select().from(cardPurchases).get()!;
    expect(purchase.simulationId).toBe(r.id);
    const [s] = listSimulations(uid);
    expect(s.status).toBe("effectivated");
    const { months } = projectMonths(uid, "2026-12", 1, TODAY);
    expect(months[0]).toMatchObject({ simulatedCents: 0, invoicesCents: 30_000 }); // não conta em dobro
    expect(effectivateSimulation(uid, r.id).ok).toBe(false);
  });

  it("débito vira gasto avulso na data", () => {
    const r = createSimulation(uid, sim({ paymentMethod: "debit", total: 50_000 }));
    if (!r.ok) throw new Error();
    effectivateSimulation(uid, r.id);
    expect(db.select().from(oneTimeExpenses).get()).toMatchObject({ amountCents: 50_000, date: TODAY, simulationId: r.id });
    expect(projectMonths(uid, "2026-11", 1, TODAY).months[0]).toMatchObject({ oneTimeCents: 50_000, simulatedCents: 0 });
  });

  it("não efetiva em cartão desativado; excluir simulação remove as parcelas simuladas", () => {
    const c = card();
    const r = createSimulation(uid, sim({ cardId: c.id }));
    if (!r.ok) throw new Error();
    setCardActive(uid, c.id, false);
    expect(effectivateSimulation(uid, r.id)).toMatchObject({ ok: false });
    expect(deleteSimulation(uid, r.id)).toBe(true);
    expect(db.select().from(simulationInstallments).all()).toHaveLength(0);
  });
});
