"use server";

import { refresh } from "next/cache";
import { expenseSchema, oneTimeSchema } from "@/lib/validation/finance";
import { requireWriteUserId } from "@/server/access/guard";
import { createExpense, deleteExpense, setExpenseActive, updateExpense } from "@/server/finance/expenses";
import { createOneTime, deleteOneTimeExpense, setOneTimePaid, updateOneTime } from "@/server/finance/one-time";
import { formObject, invalid, notFound, parseId, type ActionState } from "./form-state";

/**
 * Cadastro de despesa com "Repetição":
 * - "monthly": todo mês, sem fim (fixa sem mês de término);
 * - "until": todo mês até o mês informado (fixa com término);
 * - "once": só uma vez (despesa avulsa, com data e "Já está paga").
 */
export async function saveExpenseAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const uid = await requireWriteUserId();
  const repetition = String(fd.get("repetition") ?? "monthly");
  const id = parseId(fd.get("id"));

  if (repetition === "once" && !id) {
    const parsed = oneTimeSchema.safeParse({ ...formObject(fd), description: String(fd.get("name") ?? "") });
    if (!parsed.success) {
      const res = invalid(parsed.error);
      // O campo de descrição do formulário se chama "name".
      if (res.fields?.description) res.fields = { ...res.fields, name: res.fields.description };
      return res;
    }
    try {
      await createOneTime(uid, parsed.data);
    } catch (error) {
      return notFound(error);
    }
    refresh();
    return { ok: true };
  }

  const raw = formObject(fd);
  if (repetition === "monthly") raw.endMonth = "";
  if (repetition === "until" && !raw.endMonth) return { fields: { endMonth: "Informe até quando a despesa se repete." } };
  const parsed = expenseSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);

  try {
    if (id) {
      if (!(await updateExpense(uid, id, parsed.data))) return { error: "Despesa não encontrada." };
    } else {
      await createExpense(uid, parsed.data);
    }
  } catch (error) {
    return notFound(error);
  }
  refresh();
  return { ok: true };
}

/** Editar uma despesa avulsa. */
export async function saveOneTimeAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const uid = await requireWriteUserId();
  const id = parseId(fd.get("id"));
  if (!id) return { error: "Despesa não encontrada." };
  const parsed = oneTimeSchema.safeParse({ ...formObject(fd), description: String(fd.get("name") ?? "") });
  if (!parsed.success) {
    const res = invalid(parsed.error);
    if (res.fields?.description) res.fields = { ...res.fields, name: res.fields.description };
    return res;
  }
  try {
    if (!(await updateOneTime(uid, id, parsed.data))) return { error: "Despesa não encontrada." };
  } catch (error) {
    return notFound(error);
  }
  refresh();
  return { ok: true };
}

export async function setOneTimePaidAction(fd: FormData): Promise<void> {
  const uid = await requireWriteUserId();
  const id = parseId(fd.get("id"));
  if (id) await setOneTimePaid(uid, id, fd.get("paid") === "true");
  refresh();
}

export async function toggleExpenseAction(fd: FormData): Promise<void> {
  const uid = await requireWriteUserId();
  const id = parseId(fd.get("id"));
  if (id) await setExpenseActive(uid, id, fd.get("active") === "true");
  refresh();
}

export async function deleteExpenseAction(fd: FormData): Promise<void> {
  const uid = await requireWriteUserId();
  const id = parseId(fd.get("id"));
  if (id) await deleteExpense(uid, id);
  refresh();
}

export async function deleteOneTimeAction(fd: FormData): Promise<void> {
  const uid = await requireWriteUserId();
  const id = parseId(fd.get("id"));
  if (id) await deleteOneTimeExpense(uid, id);
  refresh();
}
