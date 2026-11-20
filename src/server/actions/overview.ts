"use server";

import { refresh } from "next/cache";
import { requireWriteUserId } from "@/server/access/guard";
import { setSettled } from "@/server/finance/settlements";
import { parseId } from "./form-state";

/** Marca/desmarca renda como recebida ou despesa fixa como paga no mês. */
export async function toggleSettlementAction(fd: FormData): Promise<void> {
  const uid = await requireWriteUserId();
  const kind = fd.get("kind");
  const id = parseId(fd.get("id"));
  const month = String(fd.get("month") ?? "");
  if ((kind === "income" || kind === "expense") && id && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    await setSettled(uid, kind, id, month, fd.get("settled") === "true");
  }
  refresh();
}
