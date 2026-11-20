"use server";

import { refresh } from "next/cache";
import { incomeSchema } from "@/lib/validation/finance";
import { requireWriteUserId } from "@/server/access/guard";
import { createIncome, deleteIncome, setIncomeActive, updateIncome } from "@/server/finance/incomes";
import { formObject, invalid, notFound, parseId, type ActionState } from "./form-state";

export async function saveIncomeAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const uid = await requireWriteUserId();
  const parsed = incomeSchema.safeParse(formObject(fd));
  if (!parsed.success) return invalid(parsed.error);

  const id = parseId(fd.get("id"));
  try {
    if (id) {
      if (!(await updateIncome(uid, id, parsed.data))) return { error: "Renda não encontrada." };
    } else {
      await createIncome(uid, parsed.data);
    }
  } catch (error) {
    return notFound(error);
  }
  refresh();
  return { ok: true };
}

export async function toggleIncomeAction(fd: FormData): Promise<void> {
  const uid = await requireWriteUserId();
  const id = parseId(fd.get("id"));
  if (id) await setIncomeActive(uid, id, fd.get("active") === "true");
  refresh();
}

export async function deleteIncomeAction(fd: FormData): Promise<void> {
  const uid = await requireWriteUserId();
  const id = parseId(fd.get("id"));
  if (id) await deleteIncome(uid, id);
  refresh();
}
