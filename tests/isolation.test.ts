import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { categories } from "@/db/schema";
import { parsePdfStatement } from "@/lib/import";
import { addBoxTransaction, createBox, deleteBox, getBoxDetail, listBoxes, updateBox } from "@/server/finance/boxes";
import {
  createCard,
  createPurchase,
  deleteCard,
  deletePurchase,
  getCard,
  getInvoiceDetail,
  listCards,
  listInvoiceMonths,
  listPurchases,
  setInvoicePaid,
  updateCard,
  updatePurchase,
} from "@/server/finance/cards";
import { listCategories } from "@/server/finance/categories";
import { createExpense, deleteExpense, listExpenses } from "@/server/finance/expenses";
import { createIncome, deleteIncome, listIncomes, updateIncome } from "@/server/finance/incomes";
import { getCategoryReport, getMonthOverview } from "@/server/finance/overview";
import { NotFoundError } from "@/server/finance/owner";
import { projectMonths } from "@/server/finance/projection";
import { deleteCdiRate, listCdiRates, setCdiRate } from "@/server/finance/settings";
import { setSettled } from "@/server/finance/settlements";
import { createSimulation, deleteSimulation, effectivateSimulation, listSimulations } from "@/server/finance/simulations";
import { buildPreview, commitImport, listImports, undoImport } from "@/server/import/service";
import { addUser, freshUser } from "./helpers/user";

/*
 * Isolamento entre contas: a conta B nunca vê, altera ou usa dados da conta A,
 * mesmo enviando ids da conta A diretamente (como faria um formulário adulterado).
 */

const TODAY = "2026-11-19";
let a = 0;
let b = 0;
let catA = 0;

const card = { name: "Nubank", institution: "Nubank", limit: 500000, closingDay: 3, dueDay: 10, color: "#7c3aed" as const };
const purchase = (cardId: number, categoryId: number | null = null) => ({
  cardId,
  description: "Notebook",
  categoryId,
  total: 120000,
  installmentsCount: 3,
  purchaseDate: "2026-11-18",
  notes: null,
});
const income = {
  recurrence: "monthly" as const,
  payDay: 5,
  startMonth: "2026-11",
  endMonth: null,
  name: "Salário",
  type: "salary" as const,
  amount: 1000000,
  categoryId: null,
  notes: null,
};

beforeEach(() => {
  a = freshUser("a@example.com", "Ana");
  b = addUser("b@example.com", "Bruno");
  catA = db.insert(categories).values({ userId: a, name: "Moradia", kind: "expense" }).returning().get().id;
  setCdiRate(a, 1365, "2026-01-01");
  setCdiRate(b, 1365, "2026-01-01");
});

describe("isolamento entre contas", () => {
  it("listas e painéis só mostram os dados da própria conta", () => {
    const { id: cardA } = createCard(a, card);
    createPurchase(a, purchase(cardA, catA));
    createIncome(a, income);
    createExpense(a, { name: "Aluguel", categoryId: catA, amount: 300000, dueDay: 10, startMonth: "2026-11", endMonth: null, notes: null });
    createBox(a, { name: "Reserva", institution: "Nubank", cdiPercent: 11500, goal: null, goalDate: null, color: "#7c3aed" });

    expect(listCards(b, TODAY)).toEqual([]);
    expect(listIncomes(b)).toEqual([]);
    expect(listExpenses(b)).toEqual([]);
    expect(listBoxes(b, TODAY)).toEqual([]);
    expect(listCategories(b, "expense")).toEqual([]);
    const ov = getMonthOverview(b, "2026-12", TODAY);
    expect(ov.totals.toPay + ov.totals.totalIncome + ov.totals.debts).toBe(0);
    expect(getCategoryReport(b, "2026-12").rows).toEqual([]);
    expect(projectMonths(b, "2026-12", 3, TODAY).months.every((m) => m.incomeCents === 0 && m.invoicesCents === 0)).toBe(true);

    // A continua vendo tudo.
    expect(listCards(a, TODAY)).toHaveLength(1);
    expect(getMonthOverview(a, "2026-12", TODAY).totals.debts).toBe(120000);
  });

  it("não lê nem altera cartões, compras e faturas de outra conta", () => {
    const { id: cardA } = createCard(a, card);
    const { id: purchaseA } = createPurchase(a, purchase(cardA));

    expect(getCard(b, cardA)).toBeUndefined();
    expect(listInvoiceMonths(b, cardA, TODAY)).toEqual([]);
    expect(getInvoiceDetail(b, cardA, "2026-12", TODAY)).toBeNull();
    expect(listPurchases(b, cardA)).toEqual([]);
    expect(updateCard(b, cardA, { ...card, name: "Hackeado" })).toBe(false);
    expect(setInvoicePaid(b, cardA, "2026-12", true)).toBe(false);
    expect(updatePurchase(b, purchaseA, purchase(cardA))).toBe(false);
    expect(deletePurchase(b, purchaseA)).toBe(false);
    expect(deleteCard(b, cardA)).toBe(false);

    expect(getCard(a, cardA)?.card.name).toBe("Nubank");
    expect(listPurchases(a, cardA)).toHaveLength(1);
  });

  it("não deixa usar cartão ou categoria de outra conta ao lançar", () => {
    const { id: cardA } = createCard(a, card);
    const { id: cardB } = createCard(b, card);
    expect(() => createPurchase(b, purchase(cardA))).toThrow(NotFoundError);
    expect(() => createPurchase(b, purchase(cardB, catA))).toThrow(NotFoundError);
    expect(() => createIncome(b, { ...income, categoryId: catA })).toThrow(NotFoundError);
    expect(createSimulation(b, { description: "TV", paymentMethod: "credit", cardId: cardA, categoryId: null, total: 1000, installmentsCount: 1, purchaseDate: TODAY })).toEqual({
      ok: false,
      error: "Cartão não encontrado.",
    });
  });

  it("não altera rendas, caixinhas, simulações, confirmações e CDI de outra conta", () => {
    const { id: incomeA } = createIncome(a, income);
    const { id: boxA } = createBox(a, { name: "Reserva", institution: "Nubank", cdiPercent: 11500, goal: null, goalDate: null, color: "#7c3aed" });
    const simA = createSimulation(a, { description: "TV", paymentMethod: "debit", cardId: null, categoryId: null, total: 1000, installmentsCount: 1, purchaseDate: TODAY });
    const simId = simA.ok ? simA.id : 0;

    expect(updateIncome(b, incomeA, { ...income, name: "X" })).toBe(false);
    expect(deleteIncome(b, incomeA)).toBe(false);
    expect(setSettled(b, "income", incomeA, "2026-11", true)).toBe(false);
    expect(getBoxDetail(b, boxA, TODAY)).toBeNull();
    expect(updateBox(b, boxA, { name: "X", institution: "Y", cdiPercent: 10000, goal: null, goalDate: null, color: "#7c3aed" })).toBe(false);
    expect(addBoxTransaction(b, { boxId: boxA, type: "deposit", amount: 100, date: TODAY, notes: null }, TODAY)).toMatchObject({ ok: false });
    expect(deleteBox(b, boxA)).toBe(false);
    expect(effectivateSimulation(b, simId)).toMatchObject({ ok: false });
    expect(deleteSimulation(b, simId)).toBe(false);
    expect(listSimulations(b)).toEqual([]);
    expect(deleteExpense(b, 1)).toBe(false);
    const rateA = listCdiRates(a)[0].id;
    setCdiRate(a, 1400, "2026-06-01");
    expect(deleteCdiRate(b, rateA)).toBe(false);
    expect(listCdiRates(a)).toHaveLength(2);

    expect(listIncomes(a)[0].name).toBe("Salário");
    expect(listBoxes(a, TODAY)).toHaveLength(1);
  });

  it("importação de fatura respeita a conta", () => {
    const { id: cardA } = createCard(a, card);
    const st = parsePdfStatement(["Vencimento:  10/12/2026  Fechamento:  04/12/2026", "PicPay", "20/11  UBER  9,00"]);
    expect(() => buildPreview(b, cardA, "f.pdf", st, TODAY)).toThrow(/Cartão não encontrado/);
    const p = buildPreview(a, cardA, "f.pdf", st, TODAY);
    const input = {
      cardId: cardA,
      bank: p.bank,
      fileName: "f.pdf",
      referenceMonth: p.referenceMonth,
      dueDate: p.dueDate,
      closingDate: p.closingDate,
      datesFromFile: true,
      markPaid: false,
      updateCardSchedule: false,
      lines: p.lines.map((l) => ({ key: l.key, kind: "purchase" as const, date: l.date, description: l.description, amountCents: l.amountCents, installment: null, categoryId: null })),
    };
    expect(() => commitImport(b, input)).toThrow(NotFoundError);
    expect(() => commitImport(a, { ...input, lines: input.lines.map((l) => ({ ...l, categoryId: 999999 })) })).toThrow(NotFoundError);
    const r = commitImport(a, input);
    expect(listImports(b, cardA)).toEqual([]);
    expect(undoImport(b, cardA, r.importId)).toBe(false);
    expect(listImports(a, cardA)).toHaveLength(1);
  });
});
