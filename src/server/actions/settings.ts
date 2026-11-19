"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { parseBRL } from "@/lib/money";
import { monthlyToAnnualPct, parsePct, pctToBp } from "@/lib/rates";
import { dateField } from "@/lib/validation/finance";
import { requireSession, requireUserId } from "@/server/auth/current";
import { AVATAR_COLORS } from "@/lib/profile";
import { updateAvatarColor, updateUserName } from "@/server/auth/users";
import { deleteCdiRate, setCdiRate, updateAccountBalance, updateThresholds } from "@/server/finance/settings";
import { formObject, invalid, parseId, type ActionState } from "./form-state";

export async function saveNameAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { user } = await requireSession();
  const parsed = z
    .object({ name: z.string().trim().min(2, "Informe seu nome.").max(80, "Nome muito longo.") })
    .safeParse(formObject(fd));
  if (!parsed.success) return invalid(parsed.error);
  updateUserName(user.id, parsed.data.name);
  refresh();
  return { ok: true };
}

export async function saveBalanceAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const uid = await requireUserId();
  const parsed = z
    .object({
      balance: z.string().transform((v, ctx) => {
        const negative = v.trim().startsWith("-");
        const cents = parseBRL(v.replace("-", ""));
        if (cents === null) {
          ctx.addIssue({ code: "custom", message: "Informe o saldo." });
          return z.NEVER;
        }
        return negative ? -cents : cents;
      }),
      negative: z.string().optional(),
      date: dateField,
    })
    .safeParse(formObject(fd));
  if (!parsed.success) return invalid(parsed.error);
  const cents = parsed.data.negative === "on" ? -Math.abs(parsed.data.balance) : parsed.data.balance;
  updateAccountBalance(uid, cents, parsed.data.date);
  refresh();
  return { ok: true };
}

export async function saveCdiAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const uid = await requireUserId();
  const parsed = z
    .object({
      mode: z.enum(["monthly", "annual"]),
      rate: z.string().transform((v, ctx) => {
        const pct = parsePct(v);
        if (pct === null || pct <= 0) {
          ctx.addIssue({ code: "custom", message: "Informe a taxa, ex.: 1,07" });
          return z.NEVER;
        }
        return pct;
      }),
      effectiveFrom: dateField,
    })
    .safeParse(formObject(fd));
  if (!parsed.success) return invalid(parsed.error);

  const { mode, rate, effectiveFrom } = parsed.data;
  const annualPct = mode === "monthly" ? monthlyToAnnualPct(rate) : rate;
  if (annualPct <= 0 || annualPct > 100) return { fields: { rate: "Taxa fora do esperado. Confira o valor." } };
  setCdiRate(uid, pctToBp(annualPct), effectiveFrom);
  refresh();
  return { ok: true };
}

export async function deleteCdiAction(fd: FormData): Promise<void> {
  const uid = await requireUserId();
  const id = parseId(fd.get("id"));
  if (id) deleteCdiRate(uid, id);
  refresh();
}

export async function saveThresholdsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const uid = await requireUserId();
  const pct = (label: string) =>
    z.string().transform((v, ctx) => {
      const n = parsePct(v);
      if (n === null || n < 0 || n > 100) {
        ctx.addIssue({ code: "custom", message: `Informe ${label} entre 0 e 100.` });
        return z.NEVER;
      }
      return n;
    });
  const parsed = z
    .object({ green: pct("o limite verde"), yellow: pct("o limite amarelo") })
    .refine((d) => d.green > d.yellow, { path: ["green"], message: "O verde precisa ser maior que o amarelo." })
    .safeParse(formObject(fd));
  if (!parsed.success) return invalid(parsed.error);
  updateThresholds(uid, pctToBp(parsed.data.green), pctToBp(parsed.data.yellow));
  refresh();
  return { ok: true };
}

export async function saveAvatarColorAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { user } = await requireSession();
  const color = String(fd.get("color") ?? "");
  if (!(AVATAR_COLORS as readonly string[]).includes(color)) return { error: "Cor inválida." };
  updateAvatarColor(user.id, color);
  refresh();
  return { ok: true };
}
