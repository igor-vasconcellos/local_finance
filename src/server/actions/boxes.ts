"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { boxSchema, boxTxSchema } from "@/lib/validation/finance";
import { requireSession } from "@/server/auth/current";
import { addBoxTransaction, createBox, deleteBox, deleteBoxTransaction, updateBox } from "@/server/finance/boxes";
import { formObject, invalid, parseId, type ActionState } from "./form-state";

export async function saveBoxAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireSession();
  const parsed = boxSchema.safeParse(formObject(fd));
  if (!parsed.success) return invalid(parsed.error);
  const id = parseId(fd.get("id"));
  if (id) {
    if (!updateBox(id, parsed.data)) return { error: "Caixinha não encontrada." };
  } else {
    createBox(parsed.data);
  }
  refresh();
  return { ok: true };
}

export async function deleteBoxAction(fd: FormData): Promise<void> {
  await requireSession();
  const id = parseId(fd.get("id"));
  if (id) deleteBox(id);
  redirect("/caixinhas");
}

export async function addBoxTxAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireSession();
  const parsed = boxTxSchema.safeParse(formObject(fd));
  if (!parsed.success) return invalid(parsed.error);
  const result = addBoxTransaction(parsed.data);
  if (!result.ok) return { error: result.error };
  refresh();
  return { ok: true };
}

export async function deleteBoxTxAction(fd: FormData): Promise<{ error?: string }> {
  await requireSession();
  const id = parseId(fd.get("id"));
  if (!id) return { error: "Movimentação inválida." };
  const result = deleteBoxTransaction(id);
  if (!result.ok) return { error: result.error };
  refresh();
  return {};
}
