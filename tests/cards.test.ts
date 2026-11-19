import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { freshUser } from "./helpers/user";
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
const purchase = (cardId: number, over: Partial<Parameters<typeof createPurchase>[1]> = {}) => ({
  cardId,
  description: "Notebook",
  categoryId: null,
  total: 1200000,
  installmentsCount: 12,
  purchaseDate: "2026-11-18",
  notes: null,
  ...over,
});

let uid = 0;

beforeEach(async () => {
  uid = await freshUser();
  await db.delete(installments);
  await db.delete(cardPurchases);
  await db.delete(invoices);
  await db.delete(creditCards);
  await db.delete(institutions);
});

describe("compras parceladas", () => {
  it("12x gera 12 parcelas em 12 faturas, somando exatamente o total", async () => {
    const { id: cardId } = await createCard(uid, card);
    await createPurchase(uid, purchase(cardId, { total: 200000 })); // R$ 2.000 em 12x

    const months = await listInvoiceMonths(uid, cardId, "2026-11-18");
    expect(months.map((m) => m.referenceMonth)).toEqual([
      "2026-12",
      "2027-01",
      "2027-02",
      "2027-03",
      "2027-04",
      "2027-05",
      "2027-06",
      "2027-07",
      "2027-08",
      "2027-09",
      "2027-10",
      "2027-11",
    ]);
    expect(months.reduce((a, m) => a + m.totalCents, 0)).toBe(200000);
    // 2000/12 = 166,666…: as 8 primeiras parcelas levam R$ 166,67 e as 4 últimas R$ 166,66.
    expect(months.map((m) => m.totalCents)).toEqual([...Array(8).fill(16667), ...Array(4).fill(16666)]);
  });

  it("várias compras no mesmo mês caem na mesma fatura", async () => {
    const { id: cardId } = await createCard(uid, card);
    await createPurchase(uid, purchase(cardId, { description: "Mercado", total: 30000, installmentsCount: 1 }));
    await createPurchase(
      uid,
      purchase(cardId, { description: "Farmácia", total: 5000, installmentsCount: 1, purchaseDate: "2026-11-25" }),
    );
    const inv = (await getInvoiceDetail(uid, cardId, "2026-12", "2026-11-18"))!;
    expect(inv.items.map((i) => i.description)).toEqual(["Mercado", "Farmácia"]);
    expect(inv.totalCents).toBe(35000);
    expect(inv).toMatchObject({ closingDate: "2026-12-03", dueDate: "2026-12-10", status: "open" });
    expect(await db.select().from(invoices)).toHaveLength(1);
  });

  it("editar a compra recalcula as parcelas e remove faturas que ficaram vazias", async () => {
    const { id: cardId } = await createCard(uid, card);
    const { id } = await createPurchase(uid, purchase(cardId));
    expect(await updatePurchase(uid, id, purchase(cardId, { installmentsCount: 3, total: 90000 }))).toBe(true);

    const months = await listInvoiceMonths(uid, cardId, "2026-11-18");
    expect(months.map((m) => [m.referenceMonth, m.totalCents])).toEqual([
      ["2026-12", 30000],
      ["2027-01", 30000],
      ["2027-02", 30000],
    ]);
  });

  it("mover a compra para outro cartão limpa as faturas do cartão antigo", async () => {
    const { id: a } = await createCard(uid, card);
    const { id: b } = await createCard(uid, { ...card, name: "Itaú", closingDay: 28, dueDay: 5 });
    const { id } = await createPurchase(uid, purchase(a, { installmentsCount: 2 }));
    await updatePurchase(uid, id, purchase(b, { installmentsCount: 2 }));
    expect(await listInvoiceMonths(uid, a)).toHaveLength(0);
    // Itaú: compra 18/11 entra na fatura que fecha 28/11 e vence 05/12.
    expect((await listInvoiceMonths(uid, b, "2026-11-18")).map((m) => m.referenceMonth)).toEqual(["2026-12", "2027-01"]);
  });

  it("excluir a compra apaga parcelas e faturas vazias, mas preserva faturas pagas", async () => {
    const { id: cardId } = await createCard(uid, card);
    const { id } = await createPurchase(uid, purchase(cardId, { installmentsCount: 2 }));
    await setInvoicePaid(uid, cardId, "2026-12", true);
    await deletePurchase(uid, id);
    expect(await db.select().from(installments)).toHaveLength(0);
    expect(await db.select({ m: invoices.referenceMonth }).from(invoices)).toEqual([{ m: "2026-12" }]);
  });
});

describe("cartões e limite", () => {
  it("limite usado = parcelas em faturas não pagas; pagar libera limite", async () => {
    const { id: cardId } = await createCard(uid, card);
    await createPurchase(uid, purchase(cardId, { total: 120000, installmentsCount: 12 }));
    let [c] = await listCards(uid, "2026-11-18");
    expect(c.usedCents).toBe(120000);
    expect(c.currentInvoice).toMatchObject({ referenceMonth: "2026-12", totalCents: 10000, status: "open" });

    await setInvoicePaid(uid, cardId, "2026-12", true);
    [c] = await listCards(uid, "2026-11-18");
    expect(c.usedCents).toBe(110000);
  });

  it("reaproveita a instituição sem diferenciar maiúsculas", async () => {
    await createCard(uid, card);
    await createCard(uid, { ...card, name: "Nubank PJ", institution: "NUBANK" });
    expect(await db.select().from(institutions)).toHaveLength(1);
  });

  it("excluir cartão remove compras, parcelas e faturas", async () => {
    const { id: cardId } = await createCard(uid, card);
    await createPurchase(uid, purchase(cardId));
    expect(await deleteCard(uid, cardId)).toBe(true);
    expect(await db.select().from(cardPurchases)).toHaveLength(0);
    expect(await db.select().from(installments)).toHaveLength(0);
    expect(await db.select().from(invoices)).toHaveLength(0);
  });

  it("listPurchases mostra quanto falta pagar", async () => {
    const { id: cardId } = await createCard(uid, card);
    await createPurchase(uid, purchase(cardId, { total: 30000, installmentsCount: 3 }));
    await setInvoicePaid(uid, cardId, "2026-12", true);
    const [p] = await listPurchases(uid, cardId);
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
  it("paga é sempre paga", async () => {
    expect(invoiceStatus({ ...inv, status: "paid" }, "2027-01-01")).toBe("paid");
  });
});
