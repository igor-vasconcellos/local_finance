import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { env, mailTransport } from "@/env";
import { codeEmail, type CodePurpose } from "./templates";

export type SendCodeResult =
  | { delivered: "email" }
  | { delivered: "console"; reason: "not_configured" | "smtp_failed" };

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  return transporter;
}

/** Imprime o código no terminal do servidor (modo dev ou fallback). */
const CONSOLE_TITLE: Record<CodePurpose, string> = {
  login: "CÓDIGO DE VERIFICAÇÃO (LOGIN)",
  signup: "CÓDIGO DE CONFIRMAÇÃO DO CADASTRO",
  reset: "CÓDIGO PARA REDEFINIR A SENHA",
};

function printToConsole(to: string, code: string, expiresAt: string, purpose: CodePurpose, note?: string) {
  const time = new Date(expiresAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const lines = [
    "",
    "────────────────────────────────────────────────",
    `  🔐 BEACONFINANCE — ${CONSOLE_TITLE[purpose]}`,
    "",
    `     ${code.split("").join("  ")}`,
    "",
    `  Para: ${to}`,
    `  Válido até ${time}`,
    "────────────────────────────────────────────────",
  ];
  if (note) lines.push(`   ⚠️  ${note}`);
  console.log(lines.join("\n") + "\n");
}

/**
 * Envia um código de 6 dígitos (login, confirmação de cadastro ou troca de senha).
 * - SMTP configurado → envia por e-mail.
 * - MAIL_MODE=auto e o SMTP falhar → avisa no log e imprime o código no terminal,
 *   para você não ficar trancado fora do próprio app.
 * - MAIL_MODE=smtp → falha do SMTP é erro (sem fallback).
 */
export async function sendTwoFactorCode(params: {
  to: string;
  name: string;
  code: string;
  expiresAt: string;
  purpose?: CodePurpose;
}): Promise<SendCodeResult> {
  const { to, name, code, expiresAt, purpose = "login" } = params;

  if (mailTransport === "console") {
    printToConsole(to, code, expiresAt, purpose, "SMTP não configurado — modo console (dev).");
    return { delivered: "console", reason: "not_configured" };
  }

  const message = codeEmail({ name, code, ttlMinutes: env.TWO_FACTOR_TTL_MINUTES, purpose });
  try {
    await getTransporter().sendMail({
      from: env.SMTP_FROM ?? env.SMTP_USER,
      to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return { delivered: "email" };
  } catch (error) {
    console.error("[mail] Falha ao enviar e-mail via SMTP:", error instanceof Error ? error.message : error);
    if (env.MAIL_MODE === "smtp") throw new Error("Falha ao enviar o e-mail de verificação.");
    printToConsole(to, code, expiresAt, purpose, "Falha no SMTP — código impresso aqui como fallback.");
    return { delivered: "console", reason: "smtp_failed" };
  }
}

/**
 * Alerta de segurança para os administradores. Nunca derruba a ação que o
 * disparou: se o SMTP falhar (ou não existir), o alerta vai para o log.
 */
export async function sendAdminAlert(params: { to: string[]; subject: string; text: string }): Promise<void> {
  const { to, subject, text } = params;
  if (to.length === 0) return;
  if (mailTransport === "console") {
    console.warn(`[alerta] ${subject}\n${text}`);
    return;
  }
  try {
    await getTransporter().sendMail({
      from: env.SMTP_FROM ?? env.SMTP_USER,
      to: to.join(", "),
      subject: `[BeaconFinance] ${subject}`,
      text,
    });
  } catch (error) {
    console.error("[alerta] Falha ao enviar alerta:", error instanceof Error ? error.message : error, "—", subject);
  }
}
