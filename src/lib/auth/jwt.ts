import { jwtVerify, SignJWT } from "jose";
import { env } from "@/env";

/**
 * Assinatura/verificação do JWT do cookie de sessão.
 * Módulo leve (sem banco) para poder ser usado também no proxy.
 *
 * O JWT carrega apenas: sub = id do usuário, sid = token aleatório da sessão.
 * No banco guardamos só o SHA-256 do sid — um vazamento do .db não permite
 * forjar sessões, e a sessão pode ser revogada a qualquer momento.
 */

export const SESSION_COOKIE = "lf_session";
export const PENDING_2FA_COOKIE = "lf_2fa";

const key = new TextEncoder().encode(env.SESSION_SECRET);
const ISSUER = "local-finance";

export type SessionClaims = { sub: string; sid: string };

export async function signSessionJwt(claims: SessionClaims, expiresAt: Date): Promise<string> {
  return new SignJWT({ sid: claims.sid })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(key);
}

export async function verifySessionJwt(token: string | undefined): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key, { issuer: ISSUER, algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.sid !== "string") return null;
    return { sub: payload.sub, sid: payload.sid };
  } catch {
    return null;
  }
}
