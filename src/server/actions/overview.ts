"use server";

import { refresh } from "next/cache";
import { requireSession } from "@/server/auth/current";
import { setSettled } from "@/server/finance/settlements";
import { parseId } from "./form-state";

/** Marca/desmarca renda como recebida ou gasto fixo como pago no mês. */
export async function toggleSettlementAction(fd: FormData): Promise<void> {
  await requireSession();
  const kind = fd.get("kind");
  const id = parseId(fd.get("id"));
  const month = String(fd.get("month") ?? "");
  if ((kind === "income" || kind === "expense") && id && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    setSettled(kind, id, month, fd.get("settled") === "true");
  }
  refresh();
}
