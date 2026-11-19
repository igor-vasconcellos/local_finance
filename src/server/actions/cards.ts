"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { cardSchema, purchaseSchema } from "@/lib/validation/finance";
import { requireUserId } from "@/server/auth/current";
import {
  createCard,
  createPurchase,
  deleteCard,
  deletePurchase,
  setCardActive,
  setInvoicePaid,
  updateCard,
  updatePurchase,
} from "@/server/finance/cards";
import { NotFoundError } from "@/server/finance/owner";
import { formObject, invalid, parseId, type ActionState } from "./form-state";

export async function saveCardAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const uid = await requireUserId();
  const parsed = cardSchema.safeParse(formObject(fd));
  if (!parsed.success) return invalid(parsed.error);

  const id = parseId(fd.get("id"));
  if (id) {
    if (!updateCard(uid, id, parsed.data)) return { error: "Cartão não encontrado." };
  } else {
    createCard(uid, parsed.data);
  }
  refresh();
  return { ok: true };
}

export async function toggleCardAction(fd: FormData): Promise<void> {
  const uid = await requireUserId();
  const id = parseId(fd.get("id"));
  if (id) setCardActive(uid, id, fd.get("active") === "true");
  refresh();
}

export async function deleteCardAction(fd: FormData): Promise<void> {
  const uid = await requireUserId();
  const id = parseId(fd.get("id"));
  if (id) deleteCard(uid, id);
  redirect("/cartoes");
}

export async function savePurchaseAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const uid = await requireUserId();
  const parsed = purchaseSchema.safeParse(formObject(fd));
  if (!parsed.success) return invalid(parsed.error);

  const id = parseId(fd.get("id"));
  try {
    if (id) {
      if (!updatePurchase(uid, id, parsed.data)) return { error: "Compra não encontrada." };
    } else {
      createPurchase(uid, parsed.data);
    }
  } catch (error) {
    if (error instanceof NotFoundError) return { error: error.message };
    console.error("[cards] Falha ao salvar compra:", error);
    return { error: "Não foi possível salvar a compra. Tente novamente." };
  }
  refresh();
  return { ok: true };
}

export async function deletePurchaseAction(fd: FormData): Promise<void> {
  const uid = await requireUserId();
  const id = parseId(fd.get("id"));
  if (id) deletePurchase(uid, id);
  refresh();
}

export async function setInvoicePaidAction(fd: FormData): Promise<void> {
  const uid = await requireUserId();
  const cardId = parseId(fd.get("cardId"));
  const month = String(fd.get("month") ?? "");
  if (cardId && /^\d{4}-\d{2}$/.test(month)) setInvoicePaid(uid, cardId, month, fd.get("paid") === "true");
  refresh();
}
