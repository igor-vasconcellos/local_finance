import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { accountMovements, invoices } from "@/db/schema";
import { todayISO } from "@/lib/dates";
import { addBoxTransaction, createBox, deleteBoxTransaction } from "@/server/finance/boxes";
import { createCard, createPurchase, setInvoicePaid } from "@/server/finance/cards";
import { createExpense, deleteExpense } from "@/server/finance/expenses";
import { createIncome, deleteIncome } from "@/server/finance/incomes";
import { getBalance, listMovements, setBalance } from "@/server/finance/ledger";
import { deleteOneTimeExpense } from "@/server/finance/one-time";
import { getMonthOverview } from "@/server/finance/overview";
import { setSettled } from "@/server/finance/settlements";
import { createSimulation, effectivateSimulation } from "@/server/finance/simulations";
import { categories } from "@/db/schema";
import { freshUser } from "./helpers/user";

const TODAY = "2026-11-20";
const M = "2026-11";
let uid = 0;
const bal = async (today = TODAY) => (await getBalance(uid, today)).cents;

async function salary() {
  return createIncome(uid, {
    recurrence: "monthly",
    payDay: 5,
    startMonth: "2026-01",
    endMonth: null,
    name: "Salário",
    type: "salary",
    amount: 500000,
    categoryId: null,
    notes: null,
  });
}

beforeEach(async () => {
  uid = await freshUser();
});

describe("saldo em conta (extrato)", () => {
  it("sem saldo informado = null; o primeiro valor vira o saldo inicial e os seguintes viram ajuste", async () => {
    expect(await bal()).toBeNull();
    await setBalance(uid, 100000, TODAY);
    expect(await bal()).toBe(100000);
    await setBalance(uid, 95050, TODAY);
    expect(await bal()).toBe(95050);
    await setBalance(uid, 95050, TODAY); // igual: nenhum lançamento novo
    const kinds = (await listMovements(uid, 10, TODAY)).map((m) => [m.kind, m.amountCents]);
    expect(kinds).toEqual([
      ["adjustment", -4950],
      ["opening", 100000],
    ]);
    await setBalance(uid, -2000, TODAY); // cheque especial
    expect(await bal()).toBe(-2000);
  });

  it("renda recebida entra com o valor real; desfazer devolve", async () => {
    await setBalance(uid, 0, "2026-11-01");
    const inc = await salary();
    await setSettled(uid, "income", inc.id, M, true, { amountCents: 498000, date: "2026-11-05" });
    expect(await bal()).toBe(498000);
    // o "recebido" do mês usa o valor real
    expect((await getMonthOverview(uid, M, TODAY)).totals.received).toBe(498000);
    // confirmar de novo não duplica
    await setSettled(uid, "income", inc.id, M, true, { amountCents: 498000, date: "2026-11-05" });
    expect(await bal()).toBe(498000);
    await setSettled(uid, "income", inc.id, M, false);
    expect(await bal()).toBe(0);
  });

  it("gasto pago sai; apagar a renda/gasto depois NÃO muda o histórico do saldo", async () => {
    await setBalance(uid, 1000000, "2026-11-01");
    const inc = await salary();
    const [cat] = await db.insert(categories).values({ userId: uid, name: "Moradia", kind: "expense", color: "#7c3aed" }).returning();
    const rent = await createExpense(uid, {
      name: "Aluguel",
      categoryId: cat.id,
      amount: 300000,
      dueDay: 10,
      startMonth: "2026-01",
      endMonth: null,
      notes: null,
    });
    await setSettled(uid, "income", inc.id, M, true, { date: "2026-11-05" });
    await setSettled(uid, "expense", rent.id, M, true, { date: "2026-11-10" });
    const expected = 1000000 + 500000 - 300000;
    expect(await bal()).toBe(expected);
    await deleteIncome(uid, inc.id);
    await deleteExpense(uid, rent.id);
    expect(await bal()).toBe(expected);
  });

  it("fatura paga sai pelo total líquido (ou valor informado); reabrir devolve", async () => {
    await setBalance(uid, 500000, "2026-11-01");
    const card = await createCard(uid, { name: "Nubank", institution: "Nubank", limit: 1000000, closingDay: 3, dueDay: 10, color: "#7c3aed" });
    await createPurchase(uid, {
      cardId: card.id,
      description: "TV",
      categoryId: null,
      total: 120000,
      installmentsCount: 1,
      purchaseDate: "2026-10-20",
      notes: null,
    });
    const [inv] = await db.select().from(invoices).where(eq(invoices.cardId, card.id));
    await setInvoicePaid(uid, card.id, inv.referenceMonth, true, { date: "2026-11-10" });
    expect(await bal()).toBe(380000);
    await setInvoicePaid(uid, card.id, inv.referenceMonth, false);
    expect(await bal()).toBe(500000);
    await setInvoicePaid(uid, card.id, inv.referenceMonth, true, { amountCents: 50000, date: "2026-11-10" });
    expect(await bal()).toBe(450000);
  });

  it("aporte tira da conta, resgate devolve; excluir a movimentação corrige o saldo", async () => {
    await setBalance(uid, 300000, "2026-11-01");
    const box = await createBox(uid, { name: "Reserva", institution: "Nubank", cdiPercent: 10000, goal: null, goalDate: null, color: "#7c3aed" });
    expect((await addBoxTransaction(uid, { boxId: box.id, type: "deposit", amount: 100000, date: "2026-11-02", notes: null }, TODAY)).ok).toBe(true);
    expect((await addBoxTransaction(uid, { boxId: box.id, type: "withdrawal", amount: 30000, date: "2026-11-03", notes: null }, TODAY)).ok).toBe(true);
    expect(await bal()).toBe(230000);
    const withdrawal = (await listMovements(uid, 10, TODAY)).find((m) => m.description.startsWith("Resgate"))!;
    const [row] = await db.select().from(accountMovements).where(eq(accountMovements.id, withdrawal.id));
    await deleteBoxTransaction(uid, row.boxTxId!, TODAY);
    expect(await bal()).toBe(200000);
  });

  it("lançamentos antes do saldo inicial ou no futuro não contam", async () => {
    await setBalance(uid, 100000, "2026-11-10");
    const box = await createBox(uid, { name: "Reserva", institution: "Nubank", cdiPercent: 10000, goal: null, goalDate: null, color: "#7c3aed" });
    await addBoxTransaction(uid, { boxId: box.id, type: "deposit", amount: 40000, date: "2026-11-01", notes: null }, TODAY);
    expect(await bal()).toBe(100000);
    const sim = await createSimulation(uid, {
      description: "Geladeira",
      paymentMethod: "debit",
      cardId: null,
      categoryId: null,
      total: 25000,
      installmentsCount: 1,
      purchaseDate: "2026-11-25",
    });
    if (!sim.ok) throw new Error("simulação");
    await effectivateSimulation(uid, sim.id);
    expect(await bal()).toBe(100000); // compra no dia 25 ainda não aconteceu
    expect(await bal("2026-11-25")).toBe(75000);
    const list = await listMovements(uid, 10, TODAY);
    expect(list.find((m) => m.kind === "box")?.counted).toBe(false);
    // apagar o gasto avulso remove o lançamento
    const oneTime = await db.select().from(accountMovements).where(eq(accountMovements.kind, "one_time"));
    await deleteOneTimeExpense(uid, oneTime[0].oneTimeId!);
    expect(await bal("2026-11-25")).toBe(100000);
  });

  it("patrimônio = saldo do extrato + caixinhas − cartões", async () => {
    await setBalance(uid, 250000, "2026-11-01");
    const o = await getMonthOverview(uid, M, TODAY);
    expect(o.accountBalance.cents).toBe(250000);
    expect(o.totals.netWorth).toBe(250000 + o.totals.reserve - o.totals.debts);
  });

  it("hoje é calculado no fuso de Brasília", () => {
    expect(todayISO(new Date("2026-11-20T02:30:00Z"))).toBe("2026-11-19");
    expect(todayISO(new Date("2026-11-20T03:30:00Z"))).toBe("2026-11-20");
  });
});
