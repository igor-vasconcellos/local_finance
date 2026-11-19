"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { ImportParseError, parseCsvStatement, parsePdfStatement, type ParsedStatement } from "@/lib/import";
import { requireSession } from "@/server/auth/current";
import { deleteInvoiceCredit } from "@/server/finance/cards";
import { extractPdfLines } from "@/server/import/pdf-text";
import { buildPreview, commitImport, undoImport, type CommitResult, type ImportPreview } from "@/server/import/service";
import { parseId } from "./form-state";

const MAX_BYTES = 10 * 1024 * 1024;

export type PreviewState = { preview?: ImportPreview; error?: string };

/** 1º passo: lê o arquivo (no próprio computador) e devolve a prévia, sem gravar nada. */
export async function previewImportAction(fd: FormData): Promise<PreviewState> {
  await requireSession();
  const cardId = parseId(fd.get("cardId"));
  const file = fd.get("file");
  if (!cardId) return { error: "Cartão inválido." };
  if (!(file instanceof File) || file.size === 0) return { error: "Escolha o arquivo da fatura." };
  if (file.size > MAX_BYTES) return { error: "Arquivo muito grande (máximo de 10 MB)." };

  const name = file.name || "fatura";
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isPdf = /\.pdf$/i.test(name) || file.type === "application/pdf" || String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
  const isCsv = /\.csv$/i.test(name) || file.type === "text/csv";

  try {
    let statement: ParsedStatement;
    if (isPdf) statement = parsePdfStatement(await extractPdfLines(bytes));
    else if (isCsv) statement = parseCsvStatement(new TextDecoder("utf-8").decode(bytes), name);
    else return { error: "Envie a fatura em PDF ou CSV." };

    if (!statement.lines.length) return { error: "Não encontrei lançamentos neste arquivo." };
    return { preview: buildPreview(cardId, name, statement) };
  } catch (error) {
    if (error instanceof ImportParseError) return { error: error.message };
    if (error instanceof Error && error.message === "Cartão não encontrado.") return { error: error.message };
    console.error("[import] Falha ao ler a fatura:", error);
    return { error: "Não consegui ler este arquivo. Ele pode estar protegido por senha ou corrompido." };
  }
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const commitSchema = z.object({
  cardId: z.number().int().positive(),
  bank: z.enum(["nubank", "picpay", "mercadopago"]),
  fileName: z.string().min(1).max(200),
  referenceMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  dueDate: isoDate,
  closingDate: isoDate,
  datesFromFile: z.boolean(),
  markPaid: z.boolean(),
  updateCardSchedule: z.boolean(),
  lines: z
    .array(
      z.object({
        key: z.string().min(8).max(64),
        kind: z.enum(["purchase", "credit"]),
        date: isoDate,
        description: z.string().trim().min(1, "Descrição vazia.").max(120),
        amountCents: z.number().int().positive().max(100_000_000),
        installment: z
          .object({ number: z.number().int().min(1).max(48), count: z.number().int().min(2).max(48) })
          .refine((i) => i.number <= i.count)
          .nullable(),
        categoryId: z.number().int().positive().nullable(),
      }),
    )
    .min(1, "Selecione ao menos um lançamento.")
    .max(2000),
});

export type CommitState = { result?: CommitResult; error?: string };

/** 2º passo: grava o que foi conferido na prévia. */
export async function commitImportAction(payload: unknown): Promise<CommitState> {
  await requireSession();
  const parsed = commitSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  try {
    const result = commitImport(parsed.data);
    refresh();
    return { result };
  } catch (error) {
    console.error("[import] Falha ao importar:", error);
    return { error: "Não foi possível concluir a importação. Nada foi gravado." };
  }
}

export async function undoImportAction(fd: FormData): Promise<{ error?: string } | void> {
  await requireSession();
  const cardId = parseId(fd.get("cardId"));
  const id = parseId(fd.get("id"));
  if (!cardId || !id || !undoImport(cardId, id)) return { error: "Importação não encontrada." };
  refresh();
}

export async function deleteCreditAction(fd: FormData): Promise<void> {
  await requireSession();
  const cardId = parseId(fd.get("cardId"));
  const id = parseId(fd.get("id"));
  if (cardId && id) deleteInvoiceCredit(cardId, id);
  refresh();
}
