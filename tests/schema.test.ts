import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import {
  boxTransactions,
  cardPurchases,
  categories,
  cdiRates,
  creditCards,
  incomeSources,
  installments,
  institutions,
  invoices,
  oneTimeExpenses,
  recurringExpenses,
  savingsBoxes,
  settings,
  simulations,
  users,
} from "@/db/schema";
import { freshUser } from "./helpers/user";

/** O Drizzle embrulha o erro do Postgres: a mensagem original fica em `cause`. */
async function dbError(p: Promise<unknown>, re: RegExp) {
  try {
    await p;
  } catch (error) {
    const e = error as { message?: string; cause?: { message?: string } };
    expect(`${e.message} ${e.cause?.message ?? ""}`).toMatch(re);
    return;
  }
  throw new Error("Era esperado um erro do banco.");
}

const CHECK = /violates check constraint/;
const UNIQUE = /duplicate key value violates unique constraint/;
const FK = /violates (RESTRICT setting of )?foreign key constraint/;

let uid = 0;
const user = { name: "Igor", email: "x@example.com", passwordHash: "x" };

beforeEach(async () => {
  uid = await freshUser();
});

describe("Módulo 1 — contas", () => {
  it("aceita várias contas, com e-mail único e em minúsculas", async () => {
    await db.insert(users).values(user);
    expect(await db.select().from(users)).toHaveLength(2);
    await dbError(db.insert(users).values(user), UNIQUE);
    await dbError(db.insert(users).values({ ...user, email: "Igor2@Example.com" }), CHECK);
  });

  it("categoria com o mesmo nome pode existir em contas diferentes", async () => {
    const [other] = await db.insert(users).values(user).returning();
    await db.insert(categories).values({ userId: uid, name: "Moradia", kind: "expense" });
    await db.insert(categories).values({ userId: other.id, name: "Moradia", kind: "expense" });
    await dbError(db.insert(categories).values({ userId: uid, name: "Moradia", kind: "expense" }), UNIQUE);
  });

  it("RLS ligado em todas as tabelas (a Data API do Supabase não enxerga nada)", async () => {
    const res = await db.execute(sql`select count(*)::int as n from pg_tables where schemaname = 'public' and not rowsecurity`);
    const rows = (res as unknown as { rows?: { n: number }[] }).rows ?? (res as unknown as { n: number }[]);
    expect(rows[0].n).toBe(0);
  });
});

describe("Configurações e CDI", () => {
  it("settings tem defaults do farol (20% / 5%) e uma linha por conta", async () => {
    await db.insert(settings).values({ userId: uid });
    const [row] = await db.select().from(settings);
    expect(row).toMatchObject({ greenThresholdBp: 2000, yellowThresholdBp: 500 });
    await dbError(db.insert(settings).values({ userId: uid }), UNIQUE);
  });

  it("rejeita limites do farol fora de ordem e data da taxa CDI fora do formato", async () => {
    await dbError(db.insert(settings).values({ userId: uid, greenThresholdBp: 300, yellowThresholdBp: 500 }), CHECK);
    await db.insert(cdiRates).values({ userId: uid, annualRateBp: 1365, effectiveFrom: "2026-11-05" });
    await dbError(db.insert(cdiRates).values({ userId: uid, annualRateBp: 1365, effectiveFrom: "05/11/2026" }), CHECK);
  });
});

describe("Módulo 2 — cadastros base", () => {
  it("renda mensal exige dia de pagamento; renda única exige data", async () => {
    const base = { userId: uid, name: "Salário", type: "salary" as const, amountCents: 800000, startMonth: "2026-11" };
    await db.insert(incomeSources).values({ ...base, recurrence: "monthly", payDay: 5 });
    await db.insert(incomeSources).values({ ...base, recurrence: "once", payDate: "2026-12-20" });
    await dbError(db.insert(incomeSources).values({ ...base, recurrence: "monthly" }), CHECK);
    await dbError(db.insert(incomeSources).values({ ...base, recurrence: "once" }), CHECK);
  });

  it("rejeita valores não positivos, dia inválido e apagar categoria em uso", async () => {
    const [cat] = await db.insert(categories).values({ userId: uid, name: "Moradia", kind: "expense" }).returning();
    const base = { userId: uid, name: "Aluguel", categoryId: cat.id, startMonth: "2026-11" };
    await dbError(db.insert(recurringExpenses).values({ ...base, amountCents: 0, dueDay: 10 }), CHECK);
    await dbError(db.insert(recurringExpenses).values({ ...base, amountCents: 150000, dueDay: 32 }), CHECK);
    await db.insert(recurringExpenses).values({ ...base, amountCents: 150000, dueDay: 10 });
    await dbError(db.execute(sql`delete from categories where id = ${cat.id}`), FK);
  });

  it("compra parcelada liga parcelas às faturas; uma fatura por cartão/mês; máximo 48x", async () => {
    const [card] = await db
      .insert(creditCards)
      .values({ userId: uid, name: "Nubank", limitCents: 500000, closingDay: 3, dueDay: 10 })
      .returning();
    const invoice = { cardId: card.id, referenceMonth: "2026-12", closingDate: "2026-12-03", dueDate: "2026-12-10" };
    const [inv] = await db.insert(invoices).values(invoice).returning();
    await dbError(db.insert(invoices).values(invoice), UNIQUE);

    const [purchase] = await db
      .insert(cardPurchases)
      .values({ cardId: card.id, description: "Notebook", totalCents: 10000, installmentsCount: 3, purchaseDate: "2026-11-20" })
      .returning();
    await db.insert(installments).values({ purchaseId: purchase.id, invoiceId: inv.id, number: 1, amountCents: 3334 });
    await dbError(
      db.insert(installments).values({ purchaseId: purchase.id, invoiceId: inv.id, number: 1, amountCents: 3333 }),
      UNIQUE,
    );

    // apagar a compra apaga as parcelas (cascade)
    await db.execute(sql`delete from card_purchases where id = ${purchase.id}`);
    expect(await db.select().from(installments)).toHaveLength(0);

    await dbError(
      db
        .insert(cardPurchases)
        .values({ cardId: card.id, description: "X", totalCents: 100, installmentsCount: 49, purchaseDate: "2026-11-20" }),
      CHECK,
    );
  });
});

describe("Módulo 3 — caixinhas", () => {
  it("guarda percentual do CDI em basis points (115% = 11500) e valida movimentações", async () => {
    const [inst] = await db.insert(institutions).values({ userId: uid, name: "Banco X" }).returning();
    const [box] = await db
      .insert(savingsBoxes)
      .values({ userId: uid, institutionId: inst.id, name: "Reserva", cdiPercentBp: 11500 })
      .returning();
    expect(box.cdiPercentBp).toBe(11500);
    await db.insert(boxTransactions).values({ boxId: box.id, type: "deposit", amountCents: 100000, date: "2026-11-18" });
    await dbError(
      db.insert(boxTransactions).values({ boxId: box.id, type: "deposit", amountCents: -5, date: "2026-11-18" }),
      CHECK,
    );
  });
});

describe("Módulo 4 — simulações crédito e débito", () => {
  const sim = { description: "TV", totalCents: 200000, purchaseDate: "2026-11-25" };

  it("crédito exige cartão; débito proíbe cartão e é sempre 1 parcela; efetivada exige data", async () => {
    const [card] = await db
      .insert(creditCards)
      .values({ userId: uid, name: "Nubank", limitCents: 500000, closingDay: 3, dueDay: 10 })
      .returning();
    await db.insert(simulations).values({ userId: uid, ...sim, paymentMethod: "credit", cardId: card.id, installmentsCount: 12 });
    await db.insert(simulations).values({ userId: uid, ...sim, paymentMethod: "debit" });
    await dbError(db.insert(simulations).values({ userId: uid, ...sim, paymentMethod: "credit" }), CHECK);
    await dbError(db.insert(simulations).values({ userId: uid, ...sim, paymentMethod: "debit", cardId: card.id }), CHECK);
    await dbError(db.insert(simulations).values({ userId: uid, ...sim, paymentMethod: "debit", installmentsCount: 3 }), CHECK);
    await dbError(db.insert(simulations).values({ userId: uid, ...sim, paymentMethod: "debit", status: "effectivated" }), CHECK);
  });

  it("uma simulação de débito efetivada gera no máximo um gasto avulso", async () => {
    const [s] = await db
      .insert(simulations)
      .values({ userId: uid, ...sim, paymentMethod: "debit", status: "effectivated", effectivatedAt: "2026-11-25T12:00:00Z" })
      .returning();
    const row = { userId: uid, description: "TV", amountCents: 200000, date: "2026-11-25", simulationId: s.id };
    await db.insert(oneTimeExpenses).values(row);
    await dbError(db.insert(oneTimeExpenses).values(row), UNIQUE);
  });
});
