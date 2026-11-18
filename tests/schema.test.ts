import { beforeEach, describe, expect, it } from "vitest";
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
import { createTestDb } from "./helpers/test-db";

let t: ReturnType<typeof createTestDb>;

beforeEach(() => {
  t = createTestDb();
});

const user = { name: "Igor", email: "igor@example.com", passwordHash: "x" };

describe("Módulo 1 — usuário único", () => {
  it("aceita o usuário master com id 1", () => {
    t.db.insert(users).values({ id: 1, ...user }).run();
    expect(t.db.select().from(users).all()).toHaveLength(1);
  });

  it("rejeita um segundo usuário", () => {
    t.db.insert(users).values({ id: 1, ...user }).run();
    expect(() =>
      t.db.insert(users).values({ id: 2, ...user, email: "outro@example.com" }).run(),
    ).toThrow(/CHECK constraint failed/);
  });

  it("exige e-mail em minúsculas", () => {
    expect(() =>
      t.db.insert(users).values({ id: 1, ...user, email: "Igor@Example.com" }).run(),
    ).toThrow(/CHECK constraint failed/);
  });
});

describe("Configurações e CDI", () => {
  it("settings tem defaults do farol (20% / 5%) e linha única", () => {
    t.db.insert(settings).values({ id: 1 }).run();
    const row = t.db.select().from(settings).get();
    expect(row).toMatchObject({ greenThresholdBp: 2000, yellowThresholdBp: 500 });
    expect(() => t.db.insert(settings).values({ id: 2 }).run()).toThrow();
  });

  it("rejeita limites do farol fora de ordem", () => {
    expect(() =>
      t.db.insert(settings).values({ id: 1, greenThresholdBp: 300, yellowThresholdBp: 500 }).run(),
    ).toThrow(/CHECK constraint failed/);
  });

  it("valida formato de data da taxa CDI", () => {
    t.db.insert(cdiRates).values({ annualRateBp: 1365, effectiveFrom: "2026-11-05" }).run();
    expect(() =>
      t.db.insert(cdiRates).values({ annualRateBp: 1365, effectiveFrom: "05/11/2026" }).run(),
    ).toThrow(/CHECK constraint failed/);
  });
});

describe("Módulo 2 — cadastros base", () => {
  it("renda mensal exige dia de pagamento; renda única exige data", () => {
    const base = { name: "Salário", type: "salary" as const, amountCents: 800000, startMonth: "2026-11" };
    t.db.insert(incomeSources).values({ ...base, recurrence: "monthly", payDay: 5 }).run();
    t.db.insert(incomeSources).values({ ...base, recurrence: "once", payDate: "2026-12-20" }).run();
    expect(() => t.db.insert(incomeSources).values({ ...base, recurrence: "monthly" }).run()).toThrow(
      /CHECK constraint failed/,
    );
    expect(() => t.db.insert(incomeSources).values({ ...base, recurrence: "once" }).run()).toThrow(
      /CHECK constraint failed/,
    );
  });

  it("rejeita valores não positivos e dia de vencimento inválido", () => {
    const cat = t.db.insert(categories).values({ name: "Moradia", kind: "expense" }).returning().get();
    const base = { name: "Aluguel", categoryId: cat.id, startMonth: "2026-11" };
    expect(() =>
      t.db.insert(recurringExpenses).values({ ...base, amountCents: 0, dueDay: 10 }).run(),
    ).toThrow(/CHECK constraint failed/);
    expect(() =>
      t.db.insert(recurringExpenses).values({ ...base, amountCents: 150000, dueDay: 32 }).run(),
    ).toThrow(/CHECK constraint failed/);
  });

  it("não permite apagar categoria em uso por gasto recorrente", () => {
    const cat = t.db.insert(categories).values({ name: "Moradia", kind: "expense" }).returning().get();
    t.db
      .insert(recurringExpenses)
      .values({ name: "Aluguel", categoryId: cat.id, amountCents: 150000, dueDay: 10, startMonth: "2026-11" })
      .run();
    expect(() => t.sqlite.prepare("DELETE FROM categories WHERE id = ?").run(cat.id)).toThrow(
      /FOREIGN KEY constraint failed/,
    );
  });

  it("compra parcelada liga parcelas às faturas; uma fatura por cartão/mês", () => {
    const card = t.db
      .insert(creditCards)
      .values({ name: "Nubank", limitCents: 500000, closingDay: 3, dueDay: 10 })
      .returning()
      .get();
    const inv = t.db
      .insert(invoices)
      .values({ cardId: card.id, referenceMonth: "2026-12", closingDate: "2026-12-03", dueDate: "2026-12-10" })
      .returning()
      .get();
    expect(() =>
      t.db
        .insert(invoices)
        .values({ cardId: card.id, referenceMonth: "2026-12", closingDate: "2026-12-03", dueDate: "2026-12-10" })
        .run(),
    ).toThrow(/UNIQUE constraint failed/);

    const purchase = t.db
      .insert(cardPurchases)
      .values({ cardId: card.id, description: "Notebook", totalCents: 10000, installmentsCount: 3, purchaseDate: "2026-11-20" })
      .returning()
      .get();
    t.db.insert(installments).values({ purchaseId: purchase.id, invoiceId: inv.id, number: 1, amountCents: 3334 }).run();
    expect(() =>
      t.db.insert(installments).values({ purchaseId: purchase.id, invoiceId: inv.id, number: 1, amountCents: 3333 }).run(),
    ).toThrow(/UNIQUE constraint failed/);

    // apagar a compra apaga as parcelas (cascade)
    t.sqlite.prepare("DELETE FROM card_purchases WHERE id = ?").run(purchase.id);
    expect(t.db.select().from(installments).all()).toHaveLength(0);
  });

  it("limita o parcelamento a 48x", () => {
    const card = t.db
      .insert(creditCards)
      .values({ name: "Itaú", limitCents: 0, closingDay: 1, dueDay: 8 })
      .returning()
      .get();
    expect(() =>
      t.db
        .insert(cardPurchases)
        .values({ cardId: card.id, description: "X", totalCents: 100, installmentsCount: 49, purchaseDate: "2026-11-20" })
        .run(),
    ).toThrow(/CHECK constraint failed/);
  });
});

describe("Módulo 3 — caixinhas", () => {
  it("guarda percentual do CDI em basis points (115% = 11500) e valida movimentações", () => {
    const inst = t.db.insert(institutions).values({ name: "Banco X" }).returning().get();
    const box = t.db
      .insert(savingsBoxes)
      .values({ institutionId: inst.id, name: "Reserva", cdiPercentBp: 11500 })
      .returning()
      .get();
    expect(box.cdiPercentBp).toBe(11500);

    t.db.insert(boxTransactions).values({ boxId: box.id, type: "deposit", amountCents: 100000, date: "2026-11-18" }).run();
    expect(() =>
      t.db.insert(boxTransactions).values({ boxId: box.id, type: "deposit", amountCents: -5, date: "2026-11-18" }).run(),
    ).toThrow(/CHECK constraint failed/);
  });
});

describe("Módulo 4 — simulações crédito e débito", () => {
  const sim = { description: "TV", totalCents: 200000, purchaseDate: "2026-11-25" };

  it("crédito exige cartão; débito proíbe cartão e é sempre 1 parcela", () => {
    const card = t.db
      .insert(creditCards)
      .values({ name: "Nubank", limitCents: 500000, closingDay: 3, dueDay: 10 })
      .returning()
      .get();

    t.db.insert(simulations).values({ ...sim, paymentMethod: "credit", cardId: card.id, installmentsCount: 12 }).run();
    t.db.insert(simulations).values({ ...sim, paymentMethod: "debit" }).run();

    expect(() => t.db.insert(simulations).values({ ...sim, paymentMethod: "credit" }).run()).toThrow(
      /CHECK constraint failed/,
    );
    expect(() =>
      t.db.insert(simulations).values({ ...sim, paymentMethod: "debit", cardId: card.id }).run(),
    ).toThrow(/CHECK constraint failed/);
    expect(() =>
      t.db.insert(simulations).values({ ...sim, paymentMethod: "debit", installmentsCount: 3 }).run(),
    ).toThrow(/CHECK constraint failed/);
  });

  it("status 'effectivated' exige data de efetivação", () => {
    expect(() =>
      t.db.insert(simulations).values({ ...sim, paymentMethod: "debit", status: "effectivated" }).run(),
    ).toThrow(/CHECK constraint failed/);
  });

  it("uma simulação de débito efetivada gera no máximo um gasto avulso", () => {
    const s = t.db
      .insert(simulations)
      .values({ ...sim, paymentMethod: "debit", status: "effectivated", effectivatedAt: "2026-11-25T12:00:00Z" })
      .returning()
      .get();
    const row = { description: "TV", amountCents: 200000, date: "2026-11-25", simulationId: s.id };
    t.db.insert(oneTimeExpenses).values(row).run();
    expect(() => t.db.insert(oneTimeExpenses).values(row).run()).toThrow(/UNIQUE constraint failed/);
  });
});
