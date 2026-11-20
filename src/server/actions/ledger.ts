"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { todayISO } from "@/lib/dates";
import { parseBRL } from "@/lib/money";
import { dateField } from "@/lib/validation/finance";
import { requireWriteUserId } from "@/server/access/guard";
import { setInvoicePaid } from "@/server/finance/cards";
import { setBalance } from "@/server/finance/ledger";
import { setSettled } from "@/server/finance/settlements";
import { formObject, invalid, parseId, type ActionState } from "./form-state";

const positiveMoney = z.string().transform((v, ctx) => {
  const cents = parseBRL(v);
  if (cents === null || cents <= 0) {
    ctx.addIssue({ code: "custom", message: "Informe o valor." });
    return z.NEVER;
  }
  return cents;
});

/** A data da confirmação não pode ficar no futuro (o dinheiro ainda não se moveu). */
const pastDate = dateField.refine((d) => d <= todayISO(), "A data não pode estar no futuro.");
const monthField = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

/** "Ajustar saldo": informa o valor real da conta; o app lança a diferença. */
export async function setBalanceAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const uid = await requireWriteUserId();
  const raw = String(fd.get("balance") ?? "");
  const cents = parseBRL(raw.replace("-", ""));
  if (cents === null) return { fields: { balance: "Informe o saldo." } };
  const negative = fd.get("negative") === "on" || raw.trim().startsWith("-");
  await setBalance(uid, negative ? -cents : cents);
  refresh();
  return { ok: true };
}

/** "Recebi" / "Paguei" com o valor real e a data em que o dinheiro se moveu. */
export async function confirmSettlementAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const uid = await requireWriteUserId();
  const parsed = z
    .object({ kind: z.enum(["income", "expense"]), month: monthField, amount: positiveMoney, date: pastDate })
    .safeParse(formObject(fd));
  if (!parsed.success) return invalid(parsed.error);
  const id = parseId(fd.get("id"));
  if (!id) return { error: "Item inválido." };
  const { kind, month, amount, date } = parsed.data;
  if (!(await setSettled(uid, kind, id, month, true, { amountCents: amount, date }))) return { error: "Item não encontrado." };
  refresh();
  return { ok: true };
}

/** Pagar fatura com o valor pago (normalmente o total) e a data do pagamento. */
export async function payInvoiceAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const uid = await requireWriteUserId();
  const parsed = z.object({ month: monthField, amount: positiveMoney, date: pastDate }).safeParse(formObject(fd));
  if (!parsed.success) return invalid(parsed.error);
  const cardId = parseId(fd.get("cardId"));
  if (!cardId) return { error: "Cartão inválido." };
  const { month, amount, date } = parsed.data;
  if (!(await setInvoicePaid(uid, cardId, month, true, { amountCents: amount, date }))) return { error: "Fatura não encontrada." };
  refresh();
  return { ok: true };
}
