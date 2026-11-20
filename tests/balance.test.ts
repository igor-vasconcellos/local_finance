import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { categories, invoices } from "@/db/schema";
import { todayISO } from "@/lib/dates";
import { addBoxTransaction, createBox } from "@/server/finance/boxes";
import { createCard, createPurchase, setInvoicePaid } from "@/server/finance/cards";
import { createExpense, deleteExpense } from "@/server/finance/expenses";
import { createIncome } from "@/server/finance/incomes";
import { getBalance } from "@/server/finance/ledger";
import { getMonthOverview } from "@/server/finance/overview";
import { setSettled } from "@/server/finance/settlements";
import { createSimulation, effectivateSimulation } from "@/server/finance/simulations";
import { eq } from "drizzle-orm";
import { freshUser } from "./helpers/user";

const TODAY = "2026-11-20";
let uid = 0;
let catId = 0;

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
async function rent() {
  return createExpense(uid, { name: "Aluguel", categoryId: catId, amount: 150000, dueDay: 10, startMonth: "2026-01", endMonth: null, notes: null });
}

beforeEach(async () => {
  uid = await freshUser();
  [{ id: catId }] = await db.insert(categories).values({ userId: uid, name: "Moradia", kind: "expense", color: "#7c3aed" }).returning();
});

describe("saldo em conta calculado", () => {
  it("começa em zero e só muda com o que foi marcado", async () => {
    await salary();
    await rent();
    expect(await getBalance(uid, "2026-11", TODAY)).toBe(0);
  });

  it("só 'Recebi' já atualiza o saldo (sem marcar nenhum pagamento)", async () => {
    const inc = await salary();
    await setSettled(uid, "income", inc.id, "2026-11", true);
    expect(await getBalance(uid, "2026-11", TODAY)).toBe(500000);
  });

  it("recebido com valor real − pago; desfazer volta", async () => {
    const inc = await salary();
    const exp = await rent();
    await setSettled(uid, "income", inc.id, "2026-11", true, { amountCents: 498000 });
    await setSettled(uid, "expense", exp.id, "2026-11", true);
    expect(await getBalance(uid, "2026-11", TODAY)).toBe(348000);
    await setSettled(uid, "expense", exp.id, "2026-11", false);
    expect(await getBalance(uid, "2026-11", TODAY)).toBe(498000);
  });

  it("a sobra de um mês passa para o seguinte (e não volta para trás)", async () => {
    const inc = await salary();
    const exp = await rent();
    await setSettled(uid, "income", inc.id, "2026-10", true);
    await setSettled(uid, "expense", exp.id, "2026-10", true);
    await setSettled(uid, "income", inc.id, "2026-11", true);
    expect(await getBalance(uid, "2026-10", TODAY)).toBe(350000);
    expect(await getBalance(uid, "2026-11", TODAY)).toBe(850000);
    const o = await getMonthOverview(uid, "2026-11", TODAY);
    expect(o.accountBalance).toEqual({ cents: 850000, carried: 350000 });
    expect(o.totals.netWorth).toBe(850000 + o.totals.reserve - o.totals.debts);
  });

  it("apagar a renda/gasto confirmado tira do saldo (some do histórico)", async () => {
    const inc = await salary();
    const exp = await rent();
    await setSettled(uid, "income", inc.id, "2026-11", true);
    await setSettled(uid, "expense", exp.id, "2026-11", true);
    await deleteExpense(uid, exp.id);
    expect(await getBalance(uid, "2026-11", TODAY)).toBe(500000);
  });

  it("fatura paga sai pelo total líquido; reabrir devolve", async () => {
    const card = await createCard(uid, { name: "Nubank", institution: "Nubank", limit: 1000000, closingDay: 3, dueDay: 10, color: "#7c3aed" });
    await createPurchase(uid, { cardId: card.id, description: "TV", categoryId: null, total: 120000, installmentsCount: 1, purchaseDate: "2026-10-20", notes: null });
    const [inv] = await db.select().from(invoices).where(eq(invoices.cardId, card.id));
    await setInvoicePaid(uid, card.id, inv.referenceMonth, true);
    expect(await getBalance(uid, inv.referenceMonth, TODAY)).toBe(-120000);
    await setInvoicePaid(uid, card.id, inv.referenceMonth, false);
    expect(await getBalance(uid, inv.referenceMonth, TODAY)).toBe(0);
  });

  it("caixinhas não mexem no saldo; gasto avulso sai quando a data chega", async () => {
    const box = await createBox(uid, { name: "Reserva", institution: "Nubank", cdiPercent: 10000, goal: null, goalDate: null, color: "#7c3aed" });
    await addBoxTransaction(uid, { boxId: box.id, type: "deposit", amount: 100000, date: "2026-11-02", notes: null }, TODAY);
    expect(await getBalance(uid, "2026-11", TODAY)).toBe(0);
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
    expect(await getBalance(uid, "2026-11", TODAY)).toBe(0);
    expect(await getBalance(uid, "2026-11", "2026-11-25")).toBe(-25000);
  });

  it("bate com o 'Realizado' do mês quando não há meses anteriores", async () => {
    const inc = await salary();
    const exp = await rent();
    await setSettled(uid, "income", inc.id, "2026-11", true);
    await setSettled(uid, "expense", exp.id, "2026-11", true);
    const o = await getMonthOverview(uid, "2026-11", TODAY);
    expect(o.accountBalance.cents).toBe(o.totals.realized);
  });

  it("hoje é calculado no fuso de Brasília", () => {
    expect(todayISO(new Date("2026-11-20T02:30:00Z"))).toBe("2026-11-19");
    expect(todayISO(new Date("2026-11-20T03:30:00Z"))).toBe("2026-11-20");
  });
});
