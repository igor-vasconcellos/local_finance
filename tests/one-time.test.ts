import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { categories } from "@/db/schema";
import { oneTimeSchema } from "@/lib/validation/finance";
import { getBalance } from "@/server/finance/ledger";
import { createOneTime, deleteOneTimeExpense, listOneTimeInMonth, setOneTimePaid, updateOneTime } from "@/server/finance/one-time";
import { getMonthOverview } from "@/server/finance/overview";
import { addUser, freshUser } from "./helpers/user";

let uid = 0;
let cat = 0;
const TODAY = "2026-11-20";
const input = (over: Partial<Record<string, string>> = {}) =>
  oneTimeSchema.parse({ description: "Conserto do carro", categoryId: String(cat), amount: "850,00", date: "2026-11-18", notes: "", ...over });

beforeEach(async () => {
  uid = await freshUser();
  [{ id: cat }] = await db.insert(categories).values({ userId: uid, name: "Transporte", kind: "expense", color: "#0284c7" }).returning();
});

describe("despesas avulsas", () => {
  it("pendente aparece em Próximos vencimentos e não mexe no saldo até 'Pagar'", async () => {
    const ot = await createOneTime(uid, input());
    let o = await getMonthOverview(uid, "2026-11", TODAY);
    expect(o.payables.map((p) => [p.kind, p.kind === "invoice" ? p.cardName : p.name, p.overdue])).toEqual([["one_time", "Conserto do carro", true]]);
    expect(o.totals.toPay).toBe(85000);
    expect(await getBalance(uid, "2026-11")).toBe(0);

    await setOneTimePaid(uid, ot.id, true);
    o = await getMonthOverview(uid, "2026-11", TODAY);
    expect(o.payables).toEqual([]);
    expect(o.paidItems.map((p) => [p.kind, p.name])).toEqual([["one_time", "Conserto do carro"]]);
    expect(o.totals.paid).toBe(85000);
    expect(await getBalance(uid, "2026-11")).toBe(-85000);

    await setOneTimePaid(uid, ot.id, false);
    expect(await getBalance(uid, "2026-11")).toBe(0);
  });

  it("'Já está paga' no cadastro; editar mantém o pagamento", async () => {
    const ot = await createOneTime(uid, input({ paid: "on" }));
    expect(ot.paidAt).not.toBeNull();
    expect(await updateOneTime(uid, ot.id, input({ amount: "900,00", paid: "on" }))).toBe(true);
    const [row] = await listOneTimeInMonth(uid, "2026-11");
    expect([row.amountCents, row.paidAt]).toEqual([90000, ot.paidAt]);
  });

  it("só aparece no mês da data (não se repete)", async () => {
    await createOneTime(uid, input());
    expect((await listOneTimeInMonth(uid, "2026-11")).length).toBe(1);
    expect((await listOneTimeInMonth(uid, "2026-12")).length).toBe(0);
    expect((await getMonthOverview(uid, "2026-12", TODAY)).payables).toEqual([]);
  });

  it("exige categoria de despesa da própria conta e isola entre contas", async () => {
    const other = await addUser("b@example.com");
    const [foreign] = await db.insert(categories).values({ userId: other, name: "X", kind: "expense", color: "#000" }).returning();
    await expect(createOneTime(uid, input({ categoryId: String(foreign.id) }))).rejects.toThrow();
    const ot = await createOneTime(uid, input());
    expect(await setOneTimePaid(other, ot.id, true)).toBe(false);
    expect(await deleteOneTimeExpense(other, ot.id)).toBe(false);
    expect(await deleteOneTimeExpense(uid, ot.id)).toBe(true);
  });

  it("validação: descrição, valor e data obrigatórios", () => {
    const r = oneTimeSchema.safeParse({ description: "", categoryId: "", amount: "", date: "", notes: "" });
    expect(r.success).toBe(false);
    expect(new Set(r.error!.issues.map((i) => i.path[0]))).toEqual(new Set(["description", "categoryId", "amount", "date"]));
  });
});
