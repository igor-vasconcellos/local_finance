import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { categories, creditCards, oneTimeExpenses, simulationInstallments, simulations } from "@/db/schema";
import type { Month } from "@/lib/dates";
import { simulationSchedule } from "@/lib/simulation";
import type { SimulationInput } from "@/lib/validation/finance";
import { createPurchaseTx } from "./cards";

export type SimulationRow = typeof simulations.$inferSelect & {
  cardName: string | null;
  categoryName: string | null;
  firstMonth: Month | null;
  lastMonth: Month | null;
  installmentCents: number;
};

export function listSimulations(): SimulationRow[] {
  const rows = db
    .select({ s: simulations, cardName: creditCards.name, categoryName: categories.name })
    .from(simulations)
    .leftJoin(creditCards, eq(creditCards.id, simulations.cardId))
    .leftJoin(categories, eq(categories.id, simulations.categoryId))
    .orderBy(asc(simulations.status), desc(simulations.createdAt))
    .all();

  return rows.map(({ s, cardName, categoryName }) => {
    const parts = db
      .select()
      .from(simulationInstallments)
      .where(eq(simulationInstallments.simulationId, s.id))
      .orderBy(asc(simulationInstallments.number))
      .all();
    return {
      ...s,
      cardName,
      categoryName,
      firstMonth: parts[0]?.referenceMonth ?? null,
      lastMonth: parts.at(-1)?.referenceMonth ?? null,
      installmentCents: parts.at(-1)?.amountCents ?? s.totalCents,
    };
  });
}

export type SimResult = { ok: true; id: number } | { ok: false; error: string };

export function createSimulation(input: SimulationInput): SimResult {
  const card = input.cardId ? db.select().from(creditCards).where(eq(creditCards.id, input.cardId)).get() : null;
  if (input.paymentMethod === "credit" && !card) return { ok: false, error: "Cartão não encontrado." };

  const schedule = simulationSchedule({
    paymentMethod: input.paymentMethod,
    totalCents: input.total,
    installmentsCount: input.installmentsCount,
    purchaseDate: input.purchaseDate,
    card,
  });

  const id = db.transaction((tx) => {
    const { id } = tx
      .insert(simulations)
      .values({
        description: input.description,
        paymentMethod: input.paymentMethod,
        cardId: input.paymentMethod === "credit" ? input.cardId : null,
        categoryId: input.categoryId,
        totalCents: input.total,
        installmentsCount: input.paymentMethod === "credit" ? input.installmentsCount : 1,
        purchaseDate: input.purchaseDate,
      })
      .returning({ id: simulations.id })
      .get();
    tx.insert(simulationInstallments).values(schedule.map((p) => ({ simulationId: id, ...p }))).run();
    return id;
  });
  return { ok: true, id };
}

export function setSimulationVisible(id: number, visible: boolean) {
  return db.update(simulations).set({ isVisible: visible }).where(eq(simulations.id, id)).run().changes > 0;
}

export function deleteSimulation(id: number) {
  return db.delete(simulations).where(eq(simulations.id, id)).run().changes > 0;
}

/**
 * Transforma a simulação em lançamento real:
 * - crédito → compra no cartão (parcelas nas faturas, regras atuais do cartão);
 * - débito  → gasto avulso na data da compra.
 */
export function effectivateSimulation(id: number): SimResult {
  const sim = db.select().from(simulations).where(eq(simulations.id, id)).get();
  if (!sim) return { ok: false, error: "Simulação não encontrada." };
  if (sim.status === "effectivated") return { ok: false, error: "Esta simulação já foi efetivada." };

  if (sim.paymentMethod === "credit") {
    const card = sim.cardId ? db.select().from(creditCards).where(eq(creditCards.id, sim.cardId)).get() : null;
    if (!card) return { ok: false, error: "O cartão desta simulação não existe mais." };
    if (!card.active) return { ok: false, error: "O cartão desta simulação está desativado. Reative-o antes de efetivar." };
  }

  db.transaction((tx) => {
    if (sim.paymentMethod === "credit") {
      createPurchaseTx(
        tx,
        {
          cardId: sim.cardId!,
          description: sim.description,
          categoryId: sim.categoryId,
          total: sim.totalCents,
          installmentsCount: sim.installmentsCount,
          purchaseDate: sim.purchaseDate,
          notes: "Efetivada pelo simulador",
        },
        sim.id,
      );
    } else {
      tx.insert(oneTimeExpenses)
        .values({
          description: sim.description,
          categoryId: sim.categoryId,
          amountCents: sim.totalCents,
          date: sim.purchaseDate,
          simulationId: sim.id,
          notes: "Efetivada pelo simulador",
        })
        .run();
    }
    tx.update(simulations)
      .set({ status: "effectivated", effectivatedAt: new Date().toISOString(), isVisible: false })
      .where(eq(simulations.id, sim.id))
      .run();
  });
  return { ok: true, id: sim.id };
}

export type SimulatedItem = {
  simulationId: number;
  description: string;
  paymentMethod: "credit" | "debit";
  cardName: string | null;
  number: number;
  count: number;
  amountCents: number;
};

/** Parcelas simuladas (ativas e marcadas para o cenário) que caem no mês. */
export function simulatedItemsForMonth(month: Month): SimulatedItem[] {
  return db
    .select({
      simulationId: simulations.id,
      description: simulations.description,
      paymentMethod: simulations.paymentMethod,
      cardName: creditCards.name,
      number: simulationInstallments.number,
      count: simulations.installmentsCount,
      amountCents: simulationInstallments.amountCents,
    })
    .from(simulationInstallments)
    .innerJoin(simulations, eq(simulations.id, simulationInstallments.simulationId))
    .leftJoin(creditCards, eq(creditCards.id, simulations.cardId))
    .where(and(eq(simulationInstallments.referenceMonth, month), eq(simulations.status, "active"), eq(simulations.isVisible, true)))
    .orderBy(asc(simulations.purchaseDate))
    .all();
}
