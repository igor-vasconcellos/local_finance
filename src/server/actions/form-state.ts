import type { z } from "zod";
import { fieldErrors } from "@/lib/validation/auth";
import { NotFoundError } from "@/server/finance/owner";

/** Estado devolvido pelas Server Actions de formulário. */
export type ActionState = {
  ok?: boolean;
  error?: string;
  fields?: Record<string, string>;
};

/** Converte FormData em objeto de strings (campos vazios viram ""). */
export function formObject(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") out[k] = v;
  return out;
}

/** Id numérico opcional vindo de um campo hidden. */
export function parseId(value: FormDataEntryValue | null): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function invalid(error: z.ZodError): ActionState {
  return { fields: fieldErrors(error) };
}

/** Id de outra conta (ou apagado) vira mensagem amigável; qualquer outro erro sobe. */
export function notFound(error: unknown): ActionState {
  if (error instanceof NotFoundError) return { error: error.message };
  throw error;
}
