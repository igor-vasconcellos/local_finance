import { z } from "zod";
import { passwordProblem } from "@/lib/auth/password-policy";

export { PASSWORD_MIN } from "@/lib/auth/password-policy";

export const emailField = z
  .string()
  .trim()
  .min(1, "Informe seu e-mail.")
  .max(254, "E-mail muito longo.")
  .pipe(z.email("E-mail inválido."))
  .transform((v) => v.toLowerCase());

const nameField = z.string().trim().min(2, "Informe seu nome.").max(80, "Nome muito longo.");

export const signupSchema = z
  .object({
    name: nameField,
    email: emailField,
    password: z.string().max(200),
    confirmPassword: z.string(),
  })
  .superRefine((d, ctx) => {
    const problem = passwordProblem(d.password, { name: d.name, email: d.email });
    if (problem) ctx.addIssue({ code: "custom", path: ["password"], message: problem });
    if (d.password !== d.confirmPassword) {
      ctx.addIssue({ code: "custom", path: ["confirmPassword"], message: "As senhas não conferem." });
    }
  });

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Informe sua senha.").max(200),
});

export const verifySchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Digite os 6 dígitos do código."),
});

export const forgotSchema = z.object({ email: emailField });

/** Nova senha (redefinição). O nome/e-mail da conta entram na checagem no servidor. */
export const resetSchema = z
  .object({
    code: z.string().regex(/^\d{6}$/, "Digite os 6 dígitos do código."),
    password: z.string().max(200),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, { path: ["confirmPassword"], message: "As senhas não conferem." });

/** Converte erros do Zod em { campo: primeira mensagem }. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
