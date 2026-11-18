import { z } from "zod";

const email = z
  .string()
  .trim()
  .min(1, "Informe seu e-mail.")
  .max(254, "E-mail muito longo.")
  .pipe(z.email("E-mail inválido."))
  .transform((v) => v.toLowerCase());

export const PASSWORD_MIN = 10;

/** bcrypt considera só os primeiros 72 bytes — rejeitamos senhas maiores. */
const newPassword = z
  .string()
  .min(PASSWORD_MIN, `A senha precisa ter pelo menos ${PASSWORD_MIN} caracteres.`)
  .refine((v) => new TextEncoder().encode(v).length <= 72, "A senha pode ter no máximo 72 caracteres.")
  .refine((v) => /[A-Za-zÀ-ÿ]/.test(v) && /\d/.test(v), "Use letras e números na senha.");

export const setupSchema = z
  .object({
    name: z.string().trim().min(2, "Informe seu nome.").max(80, "Nome muito longo."),
    email,
    password: newPassword,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas não conferem.",
  });

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Informe sua senha.").max(200),
});

export const verifySchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Digite os 6 dígitos do código."),
});

/** Converte erros do Zod em { campo: primeira mensagem }. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
