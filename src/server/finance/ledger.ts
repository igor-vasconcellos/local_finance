import "server-only";
import { and, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { db, type DB, type Tx } from "@/db/client";
import { first } from "@/db/query";
import { accountMovements } from "@/db/schema";
import type { MovementKind } from "@/db/schema/ledger";
import { todayISO, type ISODate } from "@/lib/dates";

/**
 * Saldo em conta = "Saldo inicial" + lançamentos com data desde o saldo inicial
 * até hoje. Lançamentos datados ANTES do saldo inicial não contam: o valor que a
 * pessoa informou já inclui o que aconteceu antes dele. Ajustes sempre contam.
 */

type Q = DB | Tx;

export type Balance = {
  /** null = a pessoa ainda não informou o saldo. */
  cents: number | null;
  openingDate: ISODate | null;
};

export async function getBalance(uid: number, today: ISODate = todayISO(), q: Q = db): Promise<Balance> {
  const opening = await q
    .select({ date: accountMovements.date })
    .from(accountMovements)
    .where(and(eq(accountMovements.userId, uid), eq(accountMovements.kind, "opening")))
    .orderBy(desc(accountMovements.date), desc(accountMovements.id))
    .limit(1)
    .then(first);
  if (!opening) return { cents: null, openingDate: null };

  const [row] = await q
    .select({ total: sql<number>`coalesce(sum(${accountMovements.amountCents}), 0)`.mapWith(Number) })
    .from(accountMovements)
    .where(
      and(
        eq(accountMovements.userId, uid),
        lte(accountMovements.date, today),
        or(inArray(accountMovements.kind, ["opening", "adjustment"]), gte(accountMovements.date, opening.date)),
      ),
    );
  return { cents: row.total, openingDate: opening.date };
}

export type MovementRow = {
  id: number;
  kind: MovementKind;
  date: ISODate;
  amountCents: number;
  description: string;
  /** Lançamento anterior ao saldo inicial ou com data futura: não entra no saldo de hoje. */
  counted: boolean;
};

export async function listMovements(uid: number, limit = 30, today: ISODate = todayISO()): Promise<MovementRow[]> {
  const { openingDate } = await getBalance(uid, today);
  const rows = await db
    .select({
      id: accountMovements.id,
      kind: accountMovements.kind,
      date: accountMovements.date,
      amountCents: accountMovements.amountCents,
      description: accountMovements.description,
    })
    .from(accountMovements)
    .where(eq(accountMovements.userId, uid))
    .orderBy(desc(accountMovements.date), desc(accountMovements.id))
    .limit(Math.min(Math.max(limit, 1), 200));
  return rows.map((r) => ({
    ...r,
    counted:
      openingDate != null &&
      r.date <= today &&
      (r.kind === "opening" || r.kind === "adjustment" || r.date >= openingDate),
  }));
}

/**
 * "Ajustar saldo": a pessoa informa o valor real do banco. Na primeira vez vira o
 * saldo inicial; depois, só a diferença entra como ajuste.
 */
export async function setBalance(uid: number, targetCents: number, today: ISODate = todayISO()) {
  return db.transaction(async (tx) => {
    const current = await getBalance(uid, today, tx);
    if (current.cents === null) {
      await tx
        .insert(accountMovements)
        .values({ userId: uid, kind: "opening", date: today, amountCents: targetCents, description: "Saldo inicial" });
      return { diff: targetCents };
    }
    const diff = targetCents - current.cents;
    if (diff !== 0) {
      await tx
        .insert(accountMovements)
        .values({ userId: uid, kind: "adjustment", date: today, amountCents: diff, description: "Ajuste de saldo" });
    }
    return { diff };
  });
}

type Link =
  | { settlementId: number }
  | { invoiceId: number }
  | { oneTimeId: number }
  | { boxTxId: number };

/** Grava o lançamento de uma origem (dentro da mesma transação que confirma a origem). */
export async function recordMovement(
  q: Q,
  uid: number,
  kind: Exclude<MovementKind, "opening" | "adjustment">,
  link: Link,
  amountCents: number,
  date: ISODate,
  description: string,
) {
  if (amountCents === 0) return;
  await q
    .insert(accountMovements)
    .values({ userId: uid, kind, date, amountCents, description: description.slice(0, 120), ...link })
    .onConflictDoNothing();
}

/** Desfazer a confirmação de uma renda/gasto: o lançamento sai do extrato. */
export async function removeSettlementMovement(q: Q, uid: number, settlementId: number) {
  await q
    .delete(accountMovements)
    .where(and(eq(accountMovements.userId, uid), eq(accountMovements.settlementId, settlementId)));
}

export async function removeInvoiceMovement(q: Q, uid: number, invoiceId: number) {
  await q.delete(accountMovements).where(and(eq(accountMovements.userId, uid), eq(accountMovements.invoiceId, invoiceId)));
}
