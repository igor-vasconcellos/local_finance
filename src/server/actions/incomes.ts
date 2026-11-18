"use server";

import { refresh } from "next/cache";
import { incomeSchema } from "@/lib/validation/finance";
import { requireSession } from "@/server/auth/current";
import { createIncome, deleteIncome, setIncomeActive, updateIncome } from "@/server/finance/incomes";
import { formObject, invalid, parseId, type ActionState } from "./form-state";

export async function saveIncomeAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireSession();
  const parsed = incomeSchema.safeParse(formObject(fd));
  if (!parsed.success) return invalid(parsed.error);

  const id = parseId(fd.get("id"));
  if (id) {
    if (!updateIncome(id, parsed.data)) return { error: "Renda não encontrada." };
  } else {
    createIncome(parsed.data);
  }
  refresh();
  return { ok: true };
}

export async function toggleIncomeAction(fd: FormData): Promise<void> {
  await requireSession();
  const id = parseId(fd.get("id"));
  if (id) setIncomeActive(id, fd.get("active") === "true");
  refresh();
}

export async function deleteIncomeAction(fd: FormData): Promise<void> {
  await requireSession();
  const id = parseId(fd.get("id"));
  if (id) deleteIncome(id);
  refresh();
}
