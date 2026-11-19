"use server";

import { refresh } from "next/cache";
import { expenseSchema } from "@/lib/validation/finance";
import { requireUserId } from "@/server/auth/current";
import { createExpense, deleteExpense, setExpenseActive, updateExpense } from "@/server/finance/expenses";
import { deleteOneTimeExpense } from "@/server/finance/one-time";
import { formObject, invalid, notFound, parseId, type ActionState } from "./form-state";

export async function saveExpenseAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const uid = await requireUserId();
  const parsed = expenseSchema.safeParse(formObject(fd));
  if (!parsed.success) return invalid(parsed.error);

  const id = parseId(fd.get("id"));
  try {
    if (id) {
      if (!updateExpense(uid, id, parsed.data)) return { error: "Gasto não encontrado." };
    } else {
      createExpense(uid, parsed.data);
    }
  } catch (error) {
    return notFound(error);
  }
  refresh();
  return { ok: true };
}

export async function toggleExpenseAction(fd: FormData): Promise<void> {
  const uid = await requireUserId();
  const id = parseId(fd.get("id"));
  if (id) setExpenseActive(uid, id, fd.get("active") === "true");
  refresh();
}

export async function deleteExpenseAction(fd: FormData): Promise<void> {
  const uid = await requireUserId();
  const id = parseId(fd.get("id"));
  if (id) deleteExpense(uid, id);
  refresh();
}

export async function deleteOneTimeAction(fd: FormData): Promise<void> {
  const uid = await requireUserId();
  const id = parseId(fd.get("id"));
  if (id) deleteOneTimeExpense(uid, id);
  refresh();
}
