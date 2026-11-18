"use server";

import { refresh } from "next/cache";
import { expenseSchema } from "@/lib/validation/finance";
import { requireSession } from "@/server/auth/current";
import { createExpense, deleteExpense, setExpenseActive, updateExpense } from "@/server/finance/expenses";
import { formObject, invalid, parseId, type ActionState } from "./form-state";

export async function saveExpenseAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireSession();
  const parsed = expenseSchema.safeParse(formObject(fd));
  if (!parsed.success) return invalid(parsed.error);

  const id = parseId(fd.get("id"));
  if (id) {
    if (!updateExpense(id, parsed.data)) return { error: "Gasto não encontrado." };
  } else {
    createExpense(parsed.data);
  }
  refresh();
  return { ok: true };
}

export async function toggleExpenseAction(fd: FormData): Promise<void> {
  await requireSession();
  const id = parseId(fd.get("id"));
  if (id) setExpenseActive(id, fd.get("active") === "true");
  refresh();
}

export async function deleteExpenseAction(fd: FormData): Promise<void> {
  await requireSession();
  const id = parseId(fd.get("id"));
  if (id) deleteExpense(id);
  refresh();
}
