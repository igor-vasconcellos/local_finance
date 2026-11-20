"use server";

import crypto from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { passwordProblem } from "@/lib/auth/password-policy";
import { sendTwoFactorCode } from "@/lib/mail/mailer";
import { fieldErrors, forgotSchema, loginSchema, resetSchema, signupSchema, verifySchema } from "@/lib/validation/auth";
import {
  clearPendingChallengeCookie,
  clearSessionCookie,
  getCurrentSession,
  getPendingChallengeId,
  getSessionJwt,
  setPendingChallengeCookie,
  setSessionCookie,
} from "@/server/auth/current";
import { checkEmailDomain } from "@/server/auth/email-domain";
import { limitByIp } from "@/server/auth/rate-limit";
import { createSession, revokeSession } from "@/server/auth/sessions";
import {
  createChallenge,
  getResendTarget,
  sendCooldown,
  verifyChallenge,
  type ChallengePurpose,
  type VerifyResult,
} from "@/server/auth/two-factor";
import {
  authenticate,
  changePassword,
  confirmEmail,
  findVerifiedUserByEmail,
  getUserById,
  registerUser,
} from "@/server/auth/users";
import { logSecurityEvent } from "@/server/security/events";

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
  new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

/** Gera um novo desafio, envia o código e grava o cookie de pré-autenticação. */
async function issueChallenge(user: { id: number; name: string; email: string }, purpose: ChallengePurpose) {
  const challenge = await createChallenge(user.id, new Date(), purpose);
  const delivery = await sendTwoFactorCode({
    to: user.email,
    name: user.name,
    code: challenge.code,
    expiresAt: challenge.expiresAt,
    purpose,
  });
  await setPendingChallengeCookie(challenge.challengeId, challenge.expiresAt);
  return delivery;
}

function codeError(result: Exclude<VerifyResult, { ok: true }>): string | null {
  switch (result.reason) {
    case "invalid":
      return `Código incorreto. ${result.attemptsLeft === 1 ? "Resta 1 tentativa" : `Restam ${result.attemptsLeft} tentativas`}.`;
    case "expired":
      return "Este código expirou. Clique em “Reenviar código” para receber um novo.";
    case "too_many_attempts":
      return "Tentativas esgotadas para este código. Reenvie um novo código.";
    default:
      return null;
  }
}

async function startSession(userId: number) {
  const h = await headers();
  const session = await createSession(userId, {
    userAgent: h.get("user-agent"),
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip"),
  });
  await clearPendingChallengeCookie();
  await setSessionCookie(session.jwt, session.expiresAt);
}

const SEND_FAILED = "Não foi possível enviar o e-mail com o código. Tente novamente em instantes.";

// --------------------------------------------------------------- Cadastro --

export async function signupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = { name: str(formData, "name"), email: str(formData, "email") };
  const parsed = signupSchema.safeParse({
    ...values,
    password: str(formData, "password"),
    confirmPassword: str(formData, "confirmPassword"),
  });
  if (!parsed.success) return { fields: fieldErrors(parsed.error), values };

  const limitedSignup = await limitByIp("signup");
  if (limitedSignup) return { error: limitedSignup, values };

  const domain = await checkEmailDomain(parsed.data.email);
  if (domain === "disposable") {
    return {
      fields: {
        email: "E-mails temporários não são aceitos. Use seu e-mail pessoal.",
      },
      values,
    };
  }
  if (domain === "no_mail_server") {
    return {
      fields: {
        email: "Este domínio não recebe e-mails. Confira se o endereço está certo.",
      },
      values,
    };
  }

  const result = await registerUser(parsed.data);
  if (!result.ok) {
    return {
      fields: {
        email: "Já existe uma conta com este e-mail. Entre ou use “Esqueci minha senha”.",
      },
      values,
    };
  }

  const wait = await sendCooldown(result.user.id, "signup");
  if (wait > 0)
    return {
      error: `Acabamos de enviar um código para este e-mail. Aguarde ${wait}s para pedir outro.`,
      values,
    };

  let delivery;
  try {
    delivery = await issueChallenge(result.user, "signup");
  } catch {
    return { error: SEND_FAILED, values };
  }
  redirect(delivery.delivered === "console" ? `/verify?via=${delivery.reason}` : "/verify");
}

// ------------------------------------------------------ Login — etapa 1/2 --

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = { email: str(formData, "email") };
  const parsed = loginSchema.safeParse({
    ...values,
    password: str(formData, "password"),
  });
  if (!parsed.success) return { fields: fieldErrors(parsed.error), values };

  const limitedLogin = await limitByIp("login");
  if (limitedLogin) return { error: limitedLogin, values };

  const result = await authenticate(parsed.data.email, parsed.data.password);

  if (!result.ok) {
    await logSecurityEvent({
      event: result.reason === "locked" ? "login_locked" : "login_failed",
      email: parsed.data.email,
      details: result.reason === "locked" ? { until: result.until } : undefined,
    });
    if (result.reason === "locked") {
      return {
        error: `Muitas tentativas incorretas. Por segurança, o login está bloqueado até ${formatTime(result.until)}.`,
        values,
      };
    }
    return { error: "E-mail ou senha incorretos.", values };
  }

  // Conta criada mas e-mail ainda não confirmado: manda o código de confirmação.
  const purpose: ChallengePurpose = result.verified ? "login" : "signup";
  let delivery;
  try {
    delivery = await issueChallenge(result.user, purpose);
  } catch {
    return { error: SEND_FAILED, values };
  }

  redirect(delivery.delivered === "console" ? `/verify?via=${delivery.reason}` : "/verify");
}

// ----------------------------- Código: login (2FA) ou confirmação do cadastro --

export async function verifyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = verifySchema.safeParse({ code: str(formData, "code") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const limitedCode = await limitByIp("code");
  if (limitedCode) return { error: limitedCode };

  const challengeId = await getPendingChallengeId();
  const result = await verifyChallenge(challengeId, parsed.data.code);
  if (!result.ok) {
    const target = await getResendTarget(challengeId);
    await logSecurityEvent({ event: "code_failed", userId: target?.userId ?? null, details: { reason: result.reason } });
    const message = codeError(result);
    if (message) return { error: message };
    await clearPendingChallengeCookie();
    redirect("/login?expired=1");
  }

  if (result.purpose === "signup") {
    await confirmEmail(result.userId);
    await logSecurityEvent({ event: "signup_confirmed", userId: result.userId });
  }
  await startSession(result.userId);
  await logSecurityEvent({ event: "login_success", userId: result.userId });
  redirect(result.purpose === "signup" ? "/dashboard?bemvindo=1" : "/dashboard");
}

export async function resendCodeAction(_prev: FormState): Promise<FormState> {
  const target = await getResendTarget(await getPendingChallengeId());
  const user = target ? await getUserById(target.userId) : undefined;
  if (!target || !user || target.purpose === "reset") {
    await clearPendingChallengeCookie();
    redirect("/login?expired=1");
  }
  if (target.waitSeconds > 0) {
    return {
      error: `Aguarde ${target.waitSeconds}s para pedir um novo código.`,
    };
  }

  try {
    const delivery = await issueChallenge(user, target.purpose);
    return {
      notice:
        delivery.delivered === "email"
          ? "Novo código enviado para o seu e-mail."
          : "Novo código gerado — veja o terminal onde o servidor está rodando.",
    };
  } catch {
    return { error: SEND_FAILED };
  }
}

// ------------------------------------------------------- Esqueci a senha --

/**
 * Sempre responde do mesmo jeito, exista ou não a conta, para não revelar quais
 * e-mails estão cadastrados. Sem conta, o cookie aponta para um desafio inexistente.
 */
export async function forgotPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = { email: str(formData, "email") };
  const parsed = forgotSchema.safeParse(values);
  if (!parsed.success) return { fields: fieldErrors(parsed.error), values };

  const limitedForgot = await limitByIp("forgot");
  if (limitedForgot) return { error: limitedForgot, values };

  const user = await findVerifiedUserByEmail(parsed.data.email);
  await logSecurityEvent({ event: "password_reset_requested", userId: user?.id ?? null, email: parsed.data.email });
  if (user) {
    // Pedido repetido em menos de 30s não dispara outro e-mail (o código anterior continua valendo).
    if ((await sendCooldown(user.id, "reset")) === 0) {
      try {
        await issueChallenge(user, "reset");
      } catch {
        return { error: SEND_FAILED, values };
      }
    }
  } else {
    await setPendingChallengeCookie(crypto.randomUUID(), new Date(Date.now() + 15 * 60_000).toISOString());
  }
  redirect("/redefinir-senha");
}

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetSchema.safeParse({
    code: str(formData, "code"),
    password: str(formData, "password"),
    confirmPassword: str(formData, "confirmPassword"),
  });
  if (!parsed.success) return { fields: fieldErrors(parsed.error) };

  const limitedReset = await limitByIp("code");
  if (limitedReset) return { fields: { code: limitedReset } };

  const challengeId = await getPendingChallengeId();
  const target = await getResendTarget(challengeId);
  const user = target?.purpose === "reset" ? await getUserById(target.userId) : undefined;

  // Confere a força da senha com o nome/e-mail da conta ANTES de gastar uma tentativa do código.
  if (user) {
    const problem = passwordProblem(parsed.data.password, {
      name: user.name,
      email: user.email,
    });
    if (problem) return { fields: { password: problem } };
  }

  const result = await verifyChallenge(challengeId, parsed.data.code, new Date(), ["reset"]);
  if (!result.ok) {
    await logSecurityEvent({ event: "code_failed", userId: target?.userId ?? null, details: { reason: result.reason, purpose: "reset" } });
    return {
      fields: {
        code: codeError(result) ?? "Código inválido ou expirado. Peça um novo código.",
      },
    };
  }

  await changePassword(result.userId, parsed.data.password);
  await logSecurityEvent({ event: "password_changed", userId: result.userId, details: { via: "reset" } });
  await clearPendingChallengeCookie();
  redirect("/login?senha=1");
}

export async function resendResetCodeAction(_prev: FormState): Promise<FormState> {
  const notice = "Se houver uma conta com esse e-mail, enviamos um novo código.";
  const target = await getResendTarget(await getPendingChallengeId());
  const user = target?.purpose === "reset" ? await getUserById(target.userId) : undefined;
  if (!target || !user) return { notice };
  if (target.waitSeconds > 0)
    return {
      error: `Aguarde ${target.waitSeconds}s para pedir um novo código.`,
    };
  try {
    await issueChallenge(user, "reset");
  } catch {
    return { error: SEND_FAILED };
  }
  return { notice };
}

// ------------------------------------------------------------------ Logout --

export async function logoutAction(): Promise<void> {
  const session = await getCurrentSession();
  if (session) await logSecurityEvent({ event: "logout", userId: session.user.id });
  await revokeSession(await getSessionJwt());
  await clearSessionCookie();
  redirect("/login");
}
