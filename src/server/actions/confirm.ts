"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { parseBRL } from "@/lib/money";
import { requireWriteUserId } from "@/server/access/guard";
import { setSettled } from "@/server/finance/settlements";
import { formObject, invalid, parseId, type ActionState } from "./form-state";

/** "Recebi" / "Pagar" com o valor real (pode ser diferente do previsto). */
export async function confirmSettlementAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const uid = await requireWriteUserId();
  const parsed = z
    .object({
      kind: z.enum(["income", "expense"]),
      month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
      amount: z.string().transform((v, ctx) => {
        const cents = parseBRL(v);
        if (cents === null || cents <= 0) {
          ctx.addIssue({ code: "custom", message: "Informe o valor." });
          return z.NEVER;
        }
        return cents;
      }),
    })
    .safeParse(formObject(fd));
  if (!parsed.success) return invalid(parsed.error);
  const id = parseId(fd.get("id"));
  if (!id) return { error: "Item inválido." };
  const { kind, month, amount } = parsed.data;
  if (!(await setSettled(uid, kind, id, month, true, { amountCents: amount }))) return { error: "Item não encontrado." };
  refresh();
  return { ok: true };
}
