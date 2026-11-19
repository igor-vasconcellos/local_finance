import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { first } from "@/db/query";
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

beforeEach(async () => {
  a = await freshUser("a@example.com", "Ana");
  b = await addUser("b@example.com", "Bruno");
  catA = (await db.insert(categories).values({ userId: a, name: "Moradia", kind: "expense" }).returning().then(first))!.id;
  await setCdiRate(a, 1365, "2026-01-01");
  await setCdiRate(b, 1365, "2026-01-01");
});

describe("isolamento entre contas", () => {
  it("listas e painéis só mostram os dados da própria conta", async () => {
    const { id: cardA } = await createCard(a, card);
    await createPurchase(a, purchase(cardA, catA));
    await createIncome(a, income);
    await createExpense(a, {
      name: "Aluguel",
      categoryId: catA,
      amount: 300000,
      dueDay: 10,
      startMonth: "2026-11",
      endMonth: null,
      notes: null,
    });
    await createBox(a, {
      name: "Reserva",
      institution: "Nubank",
      cdiPercent: 11500,
      goal: null,
      goalDate: null,
      color: "#7c3aed",
    });

    expect(await listCards(b, TODAY)).toEqual([]);
    expect(await listIncomes(b)).toEqual([]);
    expect(await listExpenses(b)).toEqual([]);
    expect(await listBoxes(b, TODAY)).toEqual([]);
    expect(await listCategories(b, "expense")).toEqual([]);
    const ov = await getMonthOverview(b, "2026-12", TODAY);
    expect(ov.totals.toPay + ov.totals.totalIncome + ov.totals.debts).toBe(0);
    expect((await getCategoryReport(b, "2026-12")).rows).toEqual([]);
    expect((await projectMonths(b, "2026-12", 3, TODAY)).months.every((m) => m.incomeCents === 0 && m.invoicesCents === 0)).toBe(
      true,
    );

    // A continua vendo tudo.
    expect(await listCards(a, TODAY)).toHaveLength(1);
    expect((await getMonthOverview(a, "2026-12", TODAY)).totals.debts).toBe(120000);
  });

  it("não lê nem altera cartões, compras e faturas de outra conta", async () => {
    const { id: cardA } = await createCard(a, card);
    const { id: purchaseA } = await createPurchase(a, purchase(cardA));

    expect(await getCard(b, cardA)).toBeUndefined();
    expect(await listInvoiceMonths(b, cardA, TODAY)).toEqual([]);
    expect(await getInvoiceDetail(b, cardA, "2026-12", TODAY)).toBeNull();
    expect(await listPurchases(b, cardA)).toEqual([]);
    expect(await updateCard(b, cardA, { ...card, name: "Hackeado" })).toBe(false);
    expect(await setInvoicePaid(b, cardA, "2026-12", true)).toBe(false);
    expect(await updatePurchase(b, purchaseA, purchase(cardA))).toBe(false);
    expect(await deletePurchase(b, purchaseA)).toBe(false);
    expect(await deleteCard(b, cardA)).toBe(false);

    expect((await getCard(a, cardA))?.card.name).toBe("Nubank");
    expect(await listPurchases(a, cardA)).toHaveLength(1);
  });

  it("não deixa usar cartão ou categoria de outra conta ao lançar", async () => {
    const { id: cardA } = await createCard(a, card);
    const { id: cardB } = await createCard(b, card);
    await expect(createPurchase(b, purchase(cardA))).rejects.toThrow(NotFoundError);
    await expect(createPurchase(b, purchase(cardB, catA))).rejects.toThrow(NotFoundError);
    await expect(createIncome(b, { ...income, categoryId: catA })).rejects.toThrow(NotFoundError);
    expect(
      await createSimulation(b, {
        description: "TV",
        paymentMethod: "credit",
        cardId: cardA,
        categoryId: null,
        total: 1000,
        installmentsCount: 1,
        purchaseDate: TODAY,
      }),
    ).toEqual({
      ok: false,
      error: "Cartão não encontrado.",
    });
  });

  it("não altera rendas, caixinhas, simulações, confirmações e CDI de outra conta", async () => {
    const { id: incomeA } = await createIncome(a, income);
    const { id: boxA } = await createBox(a, {
      name: "Reserva",
      institution: "Nubank",
      cdiPercent: 11500,
      goal: null,
      goalDate: null,
      color: "#7c3aed",
    });
    const simA = await createSimulation(a, {
      description: "TV",
      paymentMethod: "debit",
      cardId: null,
      categoryId: null,
      total: 1000,
      installmentsCount: 1,
      purchaseDate: TODAY,
    });
    const simId = simA.ok ? simA.id : 0;

    expect(await updateIncome(b, incomeA, { ...income, name: "X" })).toBe(false);
    expect(await deleteIncome(b, incomeA)).toBe(false);
    expect(await setSettled(b, "income", incomeA, "2026-11", true)).toBe(false);
    expect(await getBoxDetail(b, boxA, TODAY)).toBeNull();
    expect(
      await updateBox(b, boxA, { name: "X", institution: "Y", cdiPercent: 10000, goal: null, goalDate: null, color: "#7c3aed" }),
    ).toBe(false);
    expect(
      await addBoxTransaction(b, { boxId: boxA, type: "deposit", amount: 100, date: TODAY, notes: null }, TODAY),
    ).toMatchObject({ ok: false });
    expect(await deleteBox(b, boxA)).toBe(false);
    expect(await effectivateSimulation(b, simId)).toMatchObject({ ok: false });
    expect(await deleteSimulation(b, simId)).toBe(false);
    expect(await listSimulations(b)).toEqual([]);
    expect(await deleteExpense(b, 1)).toBe(false);
    const rateA = (await listCdiRates(a))[0].id;
    await setCdiRate(a, 1400, "2026-06-01");
    expect(await deleteCdiRate(b, rateA)).toBe(false);
    expect(await listCdiRates(a)).toHaveLength(2);

    expect((await listIncomes(a))[0].name).toBe("Salário");
    expect(await listBoxes(a, TODAY)).toHaveLength(1);
  });

  it("importação de fatura respeita a conta", async () => {
    const { id: cardA } = await createCard(a, card);
    const st = parsePdfStatement(["Vencimento:  10/12/2026  Fechamento:  04/12/2026", "PicPay", "20/11  UBER  9,00"]);
    await expect(buildPreview(b, cardA, "f.pdf", st, TODAY)).rejects.toThrow(/Cartão não encontrado/);
    const p = await buildPreview(a, cardA, "f.pdf", st, TODAY);
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
      lines: p.lines.map((l) => ({
        key: l.key,
        kind: "purchase" as const,
        date: l.date,
        description: l.description,
        amountCents: l.amountCents,
        installment: null,
        categoryId: null,
      })),
    };
    await expect(commitImport(b, input)).rejects.toThrow(NotFoundError);
    await expect(commitImport(a, { ...input, lines: input.lines.map((l) => ({ ...l, categoryId: 999999 })) })).rejects.toThrow(
      NotFoundError,
    );
    const r = await commitImport(a, input);
    expect(await listImports(b, cardA)).toEqual([]);
    expect(await undoImport(b, cardA, r.importId)).toBe(false);
    expect(await listImports(a, cardA)).toHaveLength(1);
  });
});
