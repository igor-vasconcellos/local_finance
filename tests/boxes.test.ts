import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { boxTransactions, cdiRates, institutions, savingsBoxes } from "@/db/schema";
import { dailyCdiRate } from "@/lib/cdi";
import {
  addBoxTransaction, createBox, deleteBoxTransaction, getBoxDetail, goalsForMonth, listBoxes, totalReserve,
} from "@/server/finance/boxes";

const base = { name: "Reserva", institution: "Nubank", cdiPercent: 11500, goal: null, goalDate: null, color: "#7c3aed" as const };
const dep = (boxId: number, amount: number, date: string) => ({ boxId, type: "deposit" as const, amount, date, notes: null });
const wd = (boxId: number, amount: number, date: string) => ({ boxId, type: "withdrawal" as const, amount, date, notes: null });

beforeEach(() => {
  db.delete(boxTransactions).run(); db.delete(savingsBoxes).run(); db.delete(institutions).run(); db.delete(cdiRates).run();
  db.insert(cdiRates).values({ annualRateBp: 1365, effectiveFrom: "2026-01-01" }).run();
});

describe("caixinhas", () => {
  it("saldo com rendimento de 115% do CDI", () => {
    const { id } = createBox(base);
    expect(addBoxTransaction(dep(id, 1_000_000, "2026-11-13"), "2026-11-18")).toEqual({ ok: true }); // sexta
    const [b] = listBoxes("2026-11-18"); // seg 16, ter 17, qua 18 = 3 dias úteis
    const expected = 1_000_000 * Math.pow(1 + dailyCdiRate(1365) * 1.15, 3);
    expect(b.balanceCents).toBe(Math.round(expected));
    expect(b.yieldCents).toBe(Math.round(expected - 1_000_000));
    expect(b.institutionName).toBe("Nubank");
  });

  it("não permite resgatar mais que o saldo, nem aporte com data futura", () => {
    const { id } = createBox(base);
    addBoxTransaction(dep(id, 100_000, "2026-11-02"), "2026-11-18");
    const r = addBoxTransaction(wd(id, 500_000, "2026-11-10"), "2026-11-18");
    expect(r.ok).toBe(false);
    expect(addBoxTransaction(dep(id, 100, "2026-11-30"), "2026-11-18")).toMatchObject({ ok: false });
    expect(addBoxTransaction(wd(id, 50_000, "2026-11-10"), "2026-11-18")).toEqual({ ok: true });
  });

  it("não permite excluir um aporte que deixaria um resgate posterior sem saldo", () => {
    const { id } = createBox(base);
    addBoxTransaction(dep(id, 100_000, "2026-11-02"), "2026-11-18");
    addBoxTransaction(wd(id, 90_000, "2026-11-10"), "2026-11-18");
    const detail = getBoxDetail(id, "2026-11-18")!;
    const deposit = detail.transactions.find((t) => t.type === "deposit")!;
    expect(deleteBoxTransaction(deposit.id, "2026-11-18").ok).toBe(false);
    const withdrawal = detail.transactions.find((t) => t.type === "withdrawal")!;
    expect(deleteBoxTransaction(withdrawal.id, "2026-11-18").ok).toBe(true);
  });

  it("meta com data sugere aporte mensal e entra no planejado do mês", () => {
    const { id } = createBox({ ...base, goal: 1_200_000, goalDate: "2027-10-31" }); // 12 meses (nov→out)
    addBoxTransaction(dep(id, 50_000, "2026-11-05"), "2026-11-18");
    const [b] = listBoxes("2026-11-18");
    expect(b.goal?.monthsLeft).toBe(12);
    expect(b.goal!.monthlyDepositCents!).toBeGreaterThan(90_000);
    expect(b.goal!.monthlyDepositCents!).toBeLessThan(100_000);

    const nov = goalsForMonth("2026-11", "2026-11-18");
    expect(nov.saved).toBe(50_000);
    expect(nov.planned).toBe(b.goal!.monthlyDepositCents! - 50_000);
    const dec = goalsForMonth("2026-12", "2026-11-18");
    expect(dec).toMatchObject({ saved: 0, planned: b.goal!.monthlyDepositCents });
    expect(goalsForMonth("2027-11", "2026-11-18").planned).toBe(0); // depois da data da meta
    expect(goalsForMonth("2026-10", "2026-11-18").planned).toBe(0); // passado: só o realizado
  });

  it("reserva total soma todas as caixinhas", () => {
    const a = createBox(base);
    const b = createBox({ ...base, name: "Viagem", institution: "NUBANK", cdiPercent: 10000 });
    addBoxTransaction(dep(a.id, 100_000, "2026-11-18"), "2026-11-18");
    addBoxTransaction(dep(b.id, 50_000, "2026-11-18"), "2026-11-18");
    expect(totalReserve("2026-11-18")).toBe(150_000);
    expect(db.select().from(institutions).all()).toHaveLength(1);
  });
});
