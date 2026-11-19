import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { freshUser } from "./helpers/user";
import { boxTransactions, cdiRates, institutions, savingsBoxes } from "@/db/schema";
import { dailyCdiRate } from "@/lib/cdi";
import {
  addBoxTransaction,
  createBox,
  deleteBoxTransaction,
  getBoxDetail,
  goalsForMonth,
  listBoxes,
  totalReserve,
} from "@/server/finance/boxes";

const base = { name: "Reserva", institution: "Nubank", cdiPercent: 11500, goal: null, goalDate: null, color: "#7c3aed" as const };
const dep = (boxId: number, amount: number, date: string) => ({ boxId, type: "deposit" as const, amount, date, notes: null });
const wd = (boxId: number, amount: number, date: string) => ({ boxId, type: "withdrawal" as const, amount, date, notes: null });

let uid = 0;

beforeEach(async () => {
  uid = await freshUser();
  await db.delete(boxTransactions);
  await db.delete(savingsBoxes);
  await db.delete(institutions);
  await db.delete(cdiRates);
  await db.insert(cdiRates).values({ userId: uid, annualRateBp: 1365, effectiveFrom: "2026-01-01" });
});

describe("caixinhas", () => {
  it("saldo com rendimento de 115% do CDI", async () => {
    const { id } = await createBox(uid, base);
    expect(await addBoxTransaction(uid, dep(id, 1_000_000, "2026-11-13"), "2026-11-18")).toEqual({ ok: true }); // sexta
    const [b] = await listBoxes(uid, "2026-11-18"); // seg 16, ter 17, qua 18 = 3 dias úteis
    const expected = 1_000_000 * Math.pow(1 + dailyCdiRate(1365) * 1.15, 3);
    expect(b.balanceCents).toBe(Math.round(expected));
    expect(b.yieldCents).toBe(Math.round(expected - 1_000_000));
    expect(b.institutionName).toBe("Nubank");
  });

  it("não permite resgatar mais que o saldo, nem aporte com data futura", async () => {
    const { id } = await createBox(uid, base);
    await addBoxTransaction(uid, dep(id, 100_000, "2026-11-02"), "2026-11-18");
    const r = await addBoxTransaction(uid, wd(id, 500_000, "2026-11-10"), "2026-11-18");
    expect(r.ok).toBe(false);
    expect(await addBoxTransaction(uid, dep(id, 100, "2026-11-30"), "2026-11-18")).toMatchObject({ ok: false });
    expect(await addBoxTransaction(uid, wd(id, 50_000, "2026-11-10"), "2026-11-18")).toEqual({ ok: true });
  });

  it("não permite excluir um aporte que deixaria um resgate posterior sem saldo", async () => {
    const { id } = await createBox(uid, base);
    await addBoxTransaction(uid, dep(id, 100_000, "2026-11-02"), "2026-11-18");
    await addBoxTransaction(uid, wd(id, 90_000, "2026-11-10"), "2026-11-18");
    const detail = (await getBoxDetail(uid, id, "2026-11-18"))!;
    const deposit = detail.transactions.find((t) => t.type === "deposit")!;
    expect((await deleteBoxTransaction(uid, deposit.id, "2026-11-18")).ok).toBe(false);
    const withdrawal = detail.transactions.find((t) => t.type === "withdrawal")!;
    expect((await deleteBoxTransaction(uid, withdrawal.id, "2026-11-18")).ok).toBe(true);
  });

  it("meta com data sugere aporte mensal e entra no planejado do mês", async () => {
    const { id } = await createBox(uid, { ...base, goal: 1_200_000, goalDate: "2027-10-31" }); // 12 meses (nov→out)
    await addBoxTransaction(uid, dep(id, 50_000, "2026-11-05"), "2026-11-18");
    const [b] = await listBoxes(uid, "2026-11-18");
    expect(b.goal?.monthsLeft).toBe(12);
    expect(b.goal!.monthlyDepositCents!).toBeGreaterThan(90_000);
    expect(b.goal!.monthlyDepositCents!).toBeLessThan(100_000);

    const nov = await goalsForMonth(uid, "2026-11", "2026-11-18");
    expect(nov.saved).toBe(50_000);
    expect(nov.planned).toBe(b.goal!.monthlyDepositCents! - 50_000);
    const dec = await goalsForMonth(uid, "2026-12", "2026-11-18");
    expect(dec).toMatchObject({ saved: 0, planned: b.goal!.monthlyDepositCents });
    expect((await goalsForMonth(uid, "2027-11", "2026-11-18")).planned).toBe(0); // depois da data da meta
    expect((await goalsForMonth(uid, "2026-10", "2026-11-18")).planned).toBe(0); // passado: só o realizado
  });

  it("reserva total soma todas as caixinhas", async () => {
    const a = await createBox(uid, base);
    const b = await createBox(uid, { ...base, name: "Viagem", institution: "NUBANK", cdiPercent: 10000 });
    await addBoxTransaction(uid, dep(a.id, 100_000, "2026-11-18"), "2026-11-18");
    await addBoxTransaction(uid, dep(b.id, 50_000, "2026-11-18"), "2026-11-18");
    expect(await totalReserve(uid, "2026-11-18")).toBe(150_000);
    expect(await db.select().from(institutions)).toHaveLength(1);
  });
});
