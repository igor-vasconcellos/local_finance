import { z } from "zod";

/**
 * Validação centralizada das variáveis de ambiente.
 * Se algo obrigatório estiver faltando ou inválido, a aplicação falha
 * imediatamente na inicialização com uma mensagem clara — e não no meio
 * de um login.
 *
 * Importante: nunca importe este módulo em Client Components.
 */

const optionalString = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // ---- Aplicação ----
  APP_URL: z.url().default("http://localhost:3000"),
  /** Postgres (Supabase): pooler em modo transação, porta 6543. */
  DATABASE_URL: z
    .string()
    .trim()
    .regex(/^postgres(ql)?:\/\//, "DATABASE_URL precisa ser uma URL postgres://… (veja o .env.example)."),
  /** Conexões por instância (funções da Vercel: poucas). */
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(20).default(3),

  // ---- Sessão ----
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET precisa ter pelo menos 32 caracteres. Rode `npm run setup` para gerar um."),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(12),
  COOKIE_SECURE: z.stringbool().default(false),

  // ---- 2FA ----
  TWO_FACTOR_TTL_MINUTES: z.coerce.number().int().min(1).max(30).default(5),
  TWO_FACTOR_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),

  // ---- E-mail ----
  MAIL_MODE: z.enum(["auto", "smtp", "console"]).default("auto"),
  SMTP_HOST: optionalString,
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: z.stringbool().default(false),
  SMTP_USER: optionalString,
  SMTP_PASS: optionalString,
  SMTP_FROM: optionalString,

  // ---- Tarefas agendadas (Vercel Cron) ----
  /** A Vercel envia "Authorization: Bearer <CRON_SECRET>" nas chamadas agendadas. */
  CRON_SECRET: optionalString,

  // ---- Administração ----
  /**
   * E-mails (separados por vírgula) das contas administradoras. Só valem com o
   * e-mail confirmado. Nenhuma tela do app consegue promover outra conta a admin.
   */
  ADMIN_EMAILS: z
    .string()
    .default("")
    .transform((v) =>
      v
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),

  // ---- Cadastro ----
  /** Confere se o domínio do e-mail recebe mensagens (MX) antes de enviar o código. */
  EMAIL_MX_CHECK: z.stringbool().default(true),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Aceita também os nomes criados pela integração Supabase ↔ Vercel (Marketplace):
 * POSTGRES_URL (pooler em modo transação) e POSTGRES_URL_NON_POOLING.
 */
function withDatabaseAliases(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...source,
    DATABASE_URL: source.DATABASE_URL || source.POSTGRES_URL,
  };
}

function loadEnv(): Env {
  const parsed = envSchema.safeParse(withDatabaseAliases(process.env));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  • ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`\n❌ Configuração inválida no .env:\n${issues}\n\nVeja o .env.example para referência.\n`);
  }

  const env = parsed.data;

  if (env.MAIL_MODE === "smtp" && !env.SMTP_HOST) {
    throw new Error("MAIL_MODE=smtp exige SMTP_HOST configurado no .env.");
  }

  // Em produção na Vercel o código NUNCA pode ir para o log: exige SMTP.
  if (process.env.VERCEL_ENV === "production" && env.MAIL_MODE !== "smtp") {
    throw new Error("Em produção use MAIL_MODE=smtp (o modo console imprimiria códigos de acesso nos logs).");
  }

  return env;
}

export const env = loadEnv();

/** Modo efetivo de envio de e-mail: em "auto", usa SMTP só se estiver configurado. */
export const mailTransport: "smtp" | "console" =
  env.MAIL_MODE === "console" ? "console" : env.MAIL_MODE === "smtp" || env.SMTP_HOST ? "smtp" : "console";
