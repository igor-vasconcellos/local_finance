"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { sendTwoFactorCode } from "@/lib/mail/mailer";
import { fieldErrors, loginSchema, setupSchema, verifySchema } from "@/lib/validation/auth";
import {
  clearPendingChallengeCookie,
  clearSessionCookie,
  getPendingChallengeId,
  getSessionJwt,
  setPendingChallengeCookie,
  setSessionCookie,
} from "@/server/auth/current";
import { createSession, revokeSession } from "@/server/auth/sessions";
import { createChallenge, getResendTarget, verifyChallenge } from "@/server/auth/two-factor";
import { authenticate, createMasterUser, getUserById, hasMasterUser } from "@/server/auth/users";

export type FormState = {
  error?: string;
  fields?: Record<string, string>;
  values?: Record<string, string>;
  notice?: string;
};

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** Gera um novo desafio, envia o código e grava o cookie de pré-autenticação. */
async function issueChallenge(user: { id: number; name: string; email: string }) {
  const challenge = createChallenge(user.id);
  const delivery = await sendTwoFactorCode({
    to: user.email,
    name: user.name,
    code: challenge.code,
    expiresAt: challenge.expiresAt,
  });
  await setPendingChallengeCookie(challenge.challengeId, challenge.expiresAt);
  return delivery;
}

// --------------------------------------------------------------- Cadastro --

export async function setupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (hasMasterUser()) redirect("/login");

  const values = { name: str(formData, "name"), email: str(formData, "email") };
  const parsed = setupSchema.safeParse({
    ...values,
    password: str(formData, "password"),
    confirmPassword: str(formData, "confirmPassword"),
  });
  if (!parsed.success) return { fields: fieldErrors(parsed.error), values };

  const result = await createMasterUser(parsed.data);
  if (!result.ok) redirect("/login");

  redirect("/login?created=1");
}

// ------------------------------------------------------ Login — etapa 1/2 --

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = { email: str(formData, "email") };
  const parsed = loginSchema.safeParse({ ...values, password: str(formData, "password") });
  if (!parsed.success) return { fields: fieldErrors(parsed.error), values };

  const result = await authenticate(parsed.data.email, parsed.data.password);

  if (!result.ok) {
    if (result.reason === "locked") {
      return {
        error: `Muitas tentativas incorretas. Por segurança, o login está bloqueado até ${formatTime(result.until)}.`,
        values,
      };
    }
    return { error: "E-mail ou senha incorretos.", values };
  }

  let delivery;
  try {
    delivery = await issueChallenge(result.user);
  } catch {
    return { error: "Não foi possível enviar o código de verificação. Verifique o SMTP no .env.", values };
  }

  redirect(delivery.delivered === "console" ? `/verify?via=${delivery.reason}` : "/verify");
}

// --------------------------------------------------- Login — etapa 2/2 (2FA) --

export async function verifyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = verifySchema.safeParse({ code: str(formData, "code") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const challengeId = await getPendingChallengeId();
  const result = verifyChallenge(challengeId, parsed.data.code);

  if (!result.ok) {
    switch (result.reason) {
      case "invalid":
        return {
          error: `Código incorreto. ${result.attemptsLeft === 1 ? "Resta 1 tentativa" : `Restam ${result.attemptsLeft} tentativas`}.`,
        };
      case "expired":
        return { error: "Este código expirou. Clique em “Reenviar código” para receber um novo." };
      case "too_many_attempts":
        return { error: "Tentativas esgotadas para este código. Reenvie um novo código ou volte ao login." };
      default:
        await clearPendingChallengeCookie();
        redirect("/login?expired=1");
    }
  }

  const h = await headers();
  const session = await createSession(result.userId, {
    userAgent: h.get("user-agent"),
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip"),
  });

  await clearPendingChallengeCookie();
  await setSessionCookie(session.jwt, session.expiresAt);
  redirect("/dashboard");
}

export async function resendCodeAction(_prev: FormState): Promise<FormState> {
  const target = getResendTarget(await getPendingChallengeId());
  const user = target ? getUserById(target.userId) : undefined;
  if (!target || !user) {
    await clearPendingChallengeCookie();
    redirect("/login?expired=1");
  }
  if (target.waitSeconds > 0) {
    return { error: `Aguarde ${target.waitSeconds}s para pedir um novo código.` };
  }

  try {
    const delivery = await issueChallenge(user);
    return {
      notice:
        delivery.delivered === "email"
          ? "Novo código enviado para o seu e-mail."
          : "Novo código gerado — veja o terminal onde o servidor está rodando.",
    };
  } catch {
    return { error: "Não foi possível enviar o código. Verifique o SMTP no .env." };
  }
}

// ------------------------------------------------------------------ Logout --

export async function logoutAction(): Promise<void> {
  await revokeSession(await getSessionJwt());
  await clearSessionCookie();
  redirect("/login");
}
