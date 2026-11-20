import "server-only";
import { recordMovement } from "./ledger";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { first, touched } from "@/db/query";
import { categories, creditCards, oneTimeExpenses, simulationInstallments, simulations } from "@/db/schema";
import type { Month } from "@/lib/dates";
import { simulationSchedule } from "@/lib/simulation";
import type { SimulationInput } from "@/lib/validation/finance";
import { createPurchaseTx } from "./cards";
import { assertCategory, NotFoundError } from "./owner";

const mine = (uid: number, id: number) => and(eq(simulations.id, id), eq(simulations.userId, uid));

export type SimulationRow = typeof simulations.$inferSelect & {
  cardName: string | null;
  categoryName: string | null;
  firstMonth: Month | null;
  lastMonth: Month | null;
  installmentCents: number;
};

export async function listSimulations(uid: number): Promise<SimulationRow[]> {
  const rows = await db
    .select({ s: simulations, cardName: creditCards.name, categoryName: categories.name })
    .from(simulations)
    .leftJoin(creditCards, eq(creditCards.id, simulations.cardId))
    .leftJoin(categories, eq(categories.id, simulations.categoryId))
    .where(eq(simulations.userId, uid))
    .orderBy(asc(simulations.status), desc(simulations.createdAt));
  if (!rows.length) return [];

  const parts = await db
    .select()
    .from(simulationInstallments)
    .where(
      inArray(
        simulationInstallments.simulationId,
        rows.map((r) => r.s.id),
      ),
    )
    .orderBy(asc(simulationInstallments.number));

  return rows.map(({ s, cardName, categoryName }) => {
    const mineParts = parts.filter((p) => p.simulationId === s.id);
    return {
      ...s,
      cardName,
      categoryName,
      firstMonth: mineParts[0]?.referenceMonth ?? null,
      lastMonth: mineParts.at(-1)?.referenceMonth ?? null,
      installmentCents: mineParts.at(-1)?.amountCents ?? s.totalCents,
    };
  });
}

export type SimResult = { ok: true; id: number } | { ok: false; error: string };

export async function createSimulation(uid: number, input: SimulationInput): Promise<SimResult> {
  const card = input.cardId
    ? await db
        .select()
        .from(creditCards)
        .where(and(eq(creditCards.id, input.cardId), eq(creditCards.userId, uid)))
        .then(first)
    : null;
  if (input.paymentMethod === "credit" && !card) return { ok: false, error: "Cartão não encontrado." };
  try {
    await assertCategory(db, uid, input.categoryId, "expense");
  } catch (e) {
    if (e instanceof NotFoundError) return { ok: false, error: e.message };
    throw e;
  }

  const schedule = simulationSchedule({
    paymentMethod: input.paymentMethod,
    totalCents: input.total,
    installmentsCount: input.installmentsCount,
    purchaseDate: input.purchaseDate,
    card: card ?? null,
  });

  const id = await db.transaction(async (tx) => {
    const [{ id }] = await tx
      .insert(simulations)
      .values({
        userId: uid,
        description: input.description,
        paymentMethod: input.paymentMethod,
        cardId: input.paymentMethod === "credit" ? input.cardId : null,
        categoryId: input.categoryId,
        totalCents: input.total,
        installmentsCount: input.paymentMethod === "credit" ? input.installmentsCount : 1,
        purchaseDate: input.purchaseDate,
      })
      .returning({ id: simulations.id });
    await tx.insert(simulationInstallments).values(schedule.map((p) => ({ simulationId: id, ...p })));
    return id;
  });
  return { ok: true, id };
}

export async function setSimulationVisible(uid: number, id: number, visible: boolean) {
  return (await db.update(simulations).set({ isVisible: visible }).where(mine(uid, id)).returning(touched)).length > 0;
}

export async function deleteSimulation(uid: number, id: number) {
  return (await db.delete(simulations).where(mine(uid, id)).returning(touched)).length > 0;
}

/**
 * Transforma a simulação em lançamento real:
 * - crédito → compra no cartão (parcelas nas faturas, regras atuais do cartão);
 * - débito  → gasto avulso na data da compra.
 */
export async function effectivateSimulation(uid: number, id: number): Promise<SimResult> {
  const sim = await db.select().from(simulations).where(mine(uid, id)).then(first);
  if (!sim) return { ok: false, error: "Simulação não encontrada." };
  if (sim.status === "effectivated") return { ok: false, error: "Esta simulação já foi efetivada." };

  if (sim.paymentMethod === "credit") {
    const card = sim.cardId
      ? await db
          .select()
          .from(creditCards)
          .where(and(eq(creditCards.id, sim.cardId), eq(creditCards.userId, uid)))
          .then(first)
      : null;
    if (!card) return { ok: false, error: "O cartão desta simulação não existe mais." };
    if (!card.active) return { ok: false, error: "O cartão desta simulação está desativado. Reative-o antes de efetivar." };
  }

  await db.transaction(async (tx) => {
    if (sim.paymentMethod === "credit") {
      await createPurchaseTx(
        tx,
        uid,
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
      const [row] = await tx
        .insert(oneTimeExpenses)
        .values({
          userId: uid,
          description: sim.description,
          categoryId: sim.categoryId,
          amountCents: sim.totalCents,
          date: sim.purchaseDate,
          simulationId: sim.id,
          notes: "Efetivada pelo simulador",
        })
        .returning({ id: oneTimeExpenses.id });
      // Débito/Pix sai da conta na data da compra.
      await recordMovement(tx, uid, "one_time", { oneTimeId: row.id }, -sim.totalCents, sim.purchaseDate, sim.description);
    }
    await tx
      .update(simulations)
      .set({ status: "effectivated", effectivatedAt: new Date().toISOString(), isVisible: false })
      .where(eq(simulations.id, sim.id));
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
export async function simulatedItemsForMonth(uid: number, month: Month): Promise<SimulatedItem[]> {
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
    .where(
      and(
        eq(simulations.userId, uid),
        eq(simulationInstallments.referenceMonth, month),
        eq(simulations.status, "active"),
        eq(simulations.isVisible, true),
      ),
    )
    .orderBy(asc(simulations.purchaseDate));
}
