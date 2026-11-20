"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { ImportParseError, parseCsvStatement, parsePdfStatement, type ParsedStatement } from "@/lib/import";
import { requireWriteUserId } from "@/server/access/guard";
import { deleteInvoiceCredit } from "@/server/finance/cards";
import { extractPdfLines } from "@/server/import/pdf-text";
import { MAX_UPLOAD_BYTES, UploadError, safeFileName, sniffUpload } from "@/server/import/upload";
import { hitRateLimit } from "@/server/auth/rate-limit";
import { buildPreview, commitImport, undoImport, type CommitResult, type ImportPreview } from "@/server/import/service";
import { NotFoundError } from "@/server/finance/owner";
import { parseId } from "./form-state";

export type PreviewState = { preview?: ImportPreview; error?: string };

/**
 * 1º passo: lê o arquivo em memória e devolve a prévia, sem gravar nada.
 * O tipo do arquivo é decidido pelo conteúdo (nunca pelo nome) e há limite de
 * tamanho, de páginas, de tempo e de envios por hora.
 */
export async function previewImportAction(fd: FormData): Promise<PreviewState> {
  const uid = await requireWriteUserId("invoice_import");
  const cardId = parseId(fd.get("cardId"));
  const file = fd.get("file");
  if (!cardId) return { error: "Cartão inválido." };
  if (!(file instanceof File) || file.size === 0) return { error: "Escolha o arquivo da fatura." };
  if (file.size > MAX_UPLOAD_BYTES) return { error: "Arquivo muito grande (máximo de 5 MB)." };

  const limit = await hitRateLimit(`import:user:${uid}`, 30, 60 * 60);
  if (!limit.ok) return { error: "Muitos arquivos enviados seguidos. Tente de novo em alguns minutos." };

  const name = safeFileName(file.name || "fatura");

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const sniffed = sniffUpload(bytes);
    const statement: ParsedStatement =
      sniffed.kind === "pdf" ? parsePdfStatement(await extractPdfLines(bytes)) : parseCsvStatement(sniffed.text, name);

    if (!statement.lines.length) return { error: "Não encontrei lançamentos neste arquivo." };
    return { preview: await buildPreview(uid, cardId, name, statement) };
  } catch (error) {
    if (error instanceof ImportParseError || error instanceof UploadError) return { error: error.message };
    if (error instanceof Error && error.message === "Cartão não encontrado.") return { error: error.message };
    console.error("[import] Falha ao ler a fatura:", error);
    return {
      error: "Não consegui ler este arquivo. Ele pode estar protegido por senha ou corrompido.",
    };
  }
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const commitSchema = z.object({
  cardId: z.number().int().positive(),
  bank: z.enum(["nubank", "picpay", "mercadopago"]),
  fileName: z.string().min(1).max(200).transform(safeFileName),
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
          .object({
            number: z.number().int().min(1).max(48),
            count: z.number().int().min(2).max(48),
          })
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
  const uid = await requireWriteUserId("invoice_import");
  const parsed = commitSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  try {
    const result = await commitImport(uid, parsed.data);
    refresh();
    return { result };
  } catch (error) {
    if (error instanceof NotFoundError) return { error: error.message };
    console.error("[import] Falha ao importar:", error);
    return {
      error: "Não foi possível concluir a importação. Nada foi gravado.",
    };
  }
}

export async function undoImportAction(fd: FormData): Promise<{ error?: string } | void> {
  const uid = await requireWriteUserId();
  const cardId = parseId(fd.get("cardId"));
  const id = parseId(fd.get("id"));
  if (!cardId || !id || !(await undoImport(uid, cardId, id))) return { error: "Importação não encontrada." };
  refresh();
}

export async function deleteCreditAction(fd: FormData): Promise<void> {
  const uid = await requireWriteUserId();
  const cardId = parseId(fd.get("cardId"));
  const id = parseId(fd.get("id"));
  if (cardId && id) await deleteInvoiceCredit(uid, cardId, id);
  refresh();
}
