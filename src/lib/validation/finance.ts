import { z } from "zod";
import { parseBRL } from "@/lib/money";

/** Valor em reais digitado ("1.234,56") → centavos > 0. */
export const moneyField = (label = "o valor") =>
  z
    .string()
    .trim()
    .min(1, `Informe ${label}.`)
    .transform((v, ctx) => {
      const cents = parseBRL(v);
      if (cents === null) {
        ctx.addIssue({ code: "custom", message: "Valor inválido. Use o formato 1.234,56." });
        return z.NEVER;
      }
      if (cents <= 0) {
        ctx.addIssue({ code: "custom", message: "O valor precisa ser maior que zero." });
        return z.NEVER;
      }
      if (cents > 100_000_000_00) {
        ctx.addIssue({ code: "custom", message: "Valor alto demais." });
        return z.NEVER;
      }
      return cents;
    });

export const dayField = (label: string) =>
  z.coerce
    .number({ error: `Informe o ${label}.` })
    .int(`O ${label} precisa ser um número inteiro.`)
    .min(1, `O ${label} vai de 1 a 31.`)
    .max(31, `O ${label} vai de 1 a 31.`);

export const monthField = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Informe o mês.");
export const optionalMonth = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mês inválido.").nullable());

export const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data.");

const optionalId = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : Number(v)))
  .pipe(z.number().int().positive().nullable());

const notes = z
  .string()
  .trim()
  .max(500, "Máximo de 500 caracteres.")
  .transform((v) => (v === "" ? null : v));

const name = (label: string) => z.string().trim().min(1, `Informe ${label}.`).max(80, "Máximo de 80 caracteres.");

// ------------------------------------------------------------------ Rendas --

export const INCOME_TYPES = {
  salary: "Salário",
  pro_labore: "Pró-labore",
  extra: "Renda extra",
  other: "Outra",
} as const;

export const incomeSchema = z
  .discriminatedUnion("recurrence", [
    z.object({
      recurrence: z.literal("monthly"),
      payDay: dayField("dia de recebimento"),
      startMonth: monthField,
      endMonth: optionalMonth,
    }),
    z.object({
      recurrence: z.literal("once"),
      payDate: dateField,
    }),
  ])
  .and(
    z.object({
      name: name("uma descrição"),
      type: z.enum(Object.keys(INCOME_TYPES) as [keyof typeof INCOME_TYPES], "Escolha o tipo."),
      amount: moneyField(),
      categoryId: optionalId,
      notes,
    }),
  )
  .superRefine((d, ctx) => {
    if (d.recurrence === "monthly" && d.endMonth && d.endMonth < d.startMonth) {
      ctx.addIssue({ code: "custom", path: ["endMonth"], message: "O término precisa ser depois do início." });
    }
  });

// -------------------------------------------------------- Gastos recorrentes --

export const expenseSchema = z
  .object({
    name: name("uma descrição"),
    categoryId: z.coerce.number({ error: "Escolha uma categoria." }).int().positive("Escolha uma categoria."),
    amount: moneyField(),
    dueDay: dayField("dia de vencimento"),
    startMonth: monthField,
    endMonth: optionalMonth,
    notes,
  })
  .refine((d) => !d.endMonth || d.endMonth >= d.startMonth, {
    path: ["endMonth"],
    message: "O término precisa ser depois do início.",
  });

// ----------------------------------------------------------------- Cartões --

export const CARD_COLORS = [
  "#7c3aed", // roxo
  "#e11d48", // vermelho
  "#ea580c", // laranja
  "#ca8a04", // dourado
  "#059669", // verde
  "#0284c7", // azul
  "#334155", // grafite
  "#18181b", // preto
] as const;

export const cardSchema = z.object({
  name: name("o nome do cartão"),
  institution: z.string().trim().max(60, "Máximo de 60 caracteres."),
  limit: moneyField("o limite"),
  closingDay: dayField("dia de fechamento"),
  dueDay: dayField("dia de vencimento"),
  color: z.enum(CARD_COLORS).catch(CARD_COLORS[0]),
});

export const purchaseSchema = z.object({
  cardId: z.coerce.number().int().positive(),
  description: name("uma descrição"),
  categoryId: optionalId,
  total: moneyField("o valor total"),
  installmentsCount: z.coerce
    .number({ error: "Informe as parcelas." })
    .int()
    .min(1, "Mínimo de 1 parcela.")
    .max(48, "Máximo de 48 parcelas."),
  purchaseDate: dateField,
  notes,
});

export type IncomeInput = z.infer<typeof incomeSchema>;
export type ExpenseInput = z.infer<typeof expenseSchema>;
export type CardInput = z.infer<typeof cardSchema>;
export type PurchaseInput = z.infer<typeof purchaseSchema>;
