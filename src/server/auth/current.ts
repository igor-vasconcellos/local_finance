import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { env } from "@/env";
import { PENDING_2FA_COOKIE, SESSION_COOKIE } from "@/lib/auth/jwt";
import { validateSession, type ValidSession } from "./sessions";

/**
 * Camada de acesso à sessão (DAL). Toda página/action protegida deve passar por
 * aqui — o proxy faz só uma checagem otimista do cookie.
 */

const baseCookie = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  path: "/",
} as const;

/** Sessão atual validada no banco (memoizada por request). */
export const getCurrentSession = cache(async (): Promise<ValidSession | null> => {
  const jwt = (await cookies()).get(SESSION_COOKIE)?.value;
  return validateSession(jwt);
});

/** Exige sessão válida; senão redireciona para o login. */
export async function requireSession(): Promise<ValidSession> {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  return session;
}

export async function getSessionJwt() {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function setSessionCookie(jwt: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, jwt, { ...baseCookie, sameSite: "lax", expires: expiresAt });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getPendingChallengeId() {
  return (await cookies()).get(PENDING_2FA_COOKIE)?.value;
}

export async function setPendingChallengeCookie(challengeId: string, expiresAt: string) {
  (await cookies()).set(PENDING_2FA_COOKIE, challengeId, {
    ...baseCookie,
    sameSite: "strict",
    expires: new Date(expiresAt),
  });
}

export async function clearPendingChallengeCookie() {
  (await cookies()).delete(PENDING_2FA_COOKIE);
}
