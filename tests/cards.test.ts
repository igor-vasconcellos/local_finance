import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { cardPurchases, creditCards, installments, institutions, invoices } from "@/db/schema";
import {
  createCard,
  createPurchase,
  deleteCard,
  deletePurchase,
  getInvoiceDetail,
  invoiceStatus,
  listCards,
  listInvoiceMonths,
  listPurchases,
  setInvoicePaid,
  updatePurchase,
} from "@/server/finance/cards";

const card = { name: "Nubank", institution: "Nubank", limit: 500000, closingDay: 3, dueDay: 10, color: "#7c3aed" as const };
const purchase = (cardId: number, over: Partial<Parameters<typeof createPurchase>[0]> = {}) => ({
  cardId,
  description: "Notebook",
  categoryId: null,
  total: 1200000,
  installmentsCount: 12,
  purchaseDate: "2026-11-18",
  notes: null,
  ...over,
});

beforeEach(() => {
  db.delete(installments).run();
  db.delete(cardPurchases).run();
  db.delete(invoices).run();
  db.delete(creditCards).run();
  db.delete(institutions).run();
});

describe("compras parceladas", () => {
  it("12x gera 12 parcelas em 12 faturas, somando exatamente o total", () => {
    const { id: cardId } = createCard(card);
    createPurchase(purchase(cardId, { total: 200000 })); // R$ 2.000 em 12x

    const months = listInvoiceMonths(cardId, "2026-11-18");
    expect(months.map((m) => m.referenceMonth)).toEqual([
      "2026-12", "2027-01", "2027-02", "2027-03", "2027-04", "2027-05",
      "2027-06", "2027-07", "2027-08", "2027-09", "2027-10", "2027-11",
    ]);
    expect(months.reduce((a, m) => a + m.totalCents, 0)).toBe(200000);
    // 2000/12 = 166,666…: as 8 primeiras parcelas levam R$ 166,67 e as 4 últimas R$ 166,66.
    expect(months.map((m) => m.totalCents)).toEqual([...Array(8).fill(16667), ...Array(4).fill(16666)]);
  });

  it("várias compras no mesmo mês caem na mesma fatura", () => {
    const { id: cardId } = createCard(card);
    createPurchase(purchase(cardId, { description: "Mercado", total: 30000, installmentsCount: 1 }));
    createPurchase(purchase(cardId, { description: "Farmácia", total: 5000, installmentsCount: 1, purchaseDate: "2026-11-25" }));
    const inv = getInvoiceDetail(cardId, "2026-12", "2026-11-18")!;
    expect(inv.items.map((i) => i.description)).toEqual(["Mercado", "Farmácia"]);
    expect(inv.totalCents).toBe(35000);
    expect(inv).toMatchObject({ closingDate: "2026-12-03", dueDate: "2026-12-10", status: "open" });
    expect(db.select().from(invoices).all()).toHaveLength(1);
  });

  it("editar a compra recalcula as parcelas e remove faturas que ficaram vazias", () => {
    const { id: cardId } = createCard(card);
    const { id } = createPurchase(purchase(cardId));
    expect(updatePurchase(id, purchase(cardId, { installmentsCount: 3, total: 90000 }))).toBe(true);

    const months = listInvoiceMonths(cardId, "2026-11-18");
    expect(months.map((m) => [m.referenceMonth, m.totalCents])).toEqual([
      ["2026-12", 30000],
      ["2027-01", 30000],
      ["2027-02", 30000],
    ]);
  });

  it("mover a compra para outro cartão limpa as faturas do cartão antigo", () => {
    const { id: a } = createCard(card);
    const { id: b } = createCard({ ...card, name: "Itaú", closingDay: 28, dueDay: 5 });
    const { id } = createPurchase(purchase(a, { installmentsCount: 2 }));
    updatePurchase(id, purchase(b, { installmentsCount: 2 }));
    expect(listInvoiceMonths(a)).toHaveLength(0);
    // Itaú: compra 18/11 entra na fatura que fecha 28/11 e vence 05/12.
    expect(listInvoiceMonths(b, "2026-11-18").map((m) => m.referenceMonth)).toEqual(["2026-12", "2027-01"]);
  });

  it("excluir a compra apaga parcelas e faturas vazias, mas preserva faturas pagas", () => {
    const { id: cardId } = createCard(card);
    const { id } = createPurchase(purchase(cardId, { installmentsCount: 2 }));
    setInvoicePaid(cardId, "2026-12", true);
    deletePurchase(id);
    expect(db.select().from(installments).all()).toHaveLength(0);
    expect(db.select({ m: invoices.referenceMonth }).from(invoices).all()).toEqual([{ m: "2026-12" }]);
  });
});

describe("cartões e limite", () => {
  it("limite usado = parcelas em faturas não pagas; pagar libera limite", () => {
    const { id: cardId } = createCard(card);
    createPurchase(purchase(cardId, { total: 120000, installmentsCount: 12 }));
    let [c] = listCards("2026-11-18");
    expect(c.usedCents).toBe(120000);
    expect(c.currentInvoice).toMatchObject({ referenceMonth: "2026-12", totalCents: 10000, status: "open" });

    setInvoicePaid(cardId, "2026-12", true);
    [c] = listCards("2026-11-18");
    expect(c.usedCents).toBe(110000);
  });

  it("reaproveita a instituição sem diferenciar maiúsculas", () => {
    createCard(card);
    createCard({ ...card, name: "Nubank PJ", institution: "NUBANK" });
    expect(db.select().from(institutions).all()).toHaveLength(1);
  });

  it("excluir cartão remove compras, parcelas e faturas", () => {
    const { id: cardId } = createCard(card);
    createPurchase(purchase(cardId));
    expect(deleteCard(cardId)).toBe(true);
    expect(db.select().from(cardPurchases).all()).toHaveLength(0);
    expect(db.select().from(installments).all()).toHaveLength(0);
    expect(db.select().from(invoices).all()).toHaveLength(0);
  });

  it("listPurchases mostra quanto falta pagar", () => {
    const { id: cardId } = createCard(card);
    createPurchase(purchase(cardId, { total: 30000, installmentsCount: 3 }));
    setInvoicePaid(cardId, "2026-12", true);
    const [p] = listPurchases(cardId);
    expect(p).toMatchObject({ firstMonth: "2026-12", lastMonth: "2027-02", remainingCount: 2, remainingCents: 20000 });
  });
});

describe("status da fatura", () => {
  const inv = { status: "open", closingDate: "2026-12-03", dueDate: "2026-12-10" };
  it.each([
    ["2026-12-02", "open"],
    ["2026-12-03", "closed"],
    ["2026-12-10", "closed"],
    ["2026-12-11", "overdue"],
  ])("em %s → %s", (today, expected) => {
    expect(invoiceStatus(inv, today)).toBe(expected);
  });
  it("paga é sempre paga", () => {
    expect(invoiceStatus({ ...inv, status: "paid" }, "2027-01-01")).toBe("paid");
  });
});
