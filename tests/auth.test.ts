import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { authChallenges, sessions, users } from "@/db/schema";
import { signSessionJwt, verifySessionJwt } from "@/lib/auth/jwt";
import { setupSchema } from "@/lib/validation/auth";
import { createSession, revokeSession, validateSession } from "@/server/auth/sessions";
import {
  createChallenge,
  getPendingChallenge,
  getResendTarget,
  verifyChallenge,
} from "@/server/auth/two-factor";
import { authenticate, createMasterUser, hasMasterUser, MAX_FAILED_LOGINS } from "@/server/auth/users";

const PASSWORD = "senhaForte123";

beforeEach(() => {
  db.delete(sessions).run();
  db.delete(authChallenges).run();
  db.delete(users).run();
});

async function seedUser() {
  const r = await createMasterUser({ name: "Igor Vasconcellos", email: "Igor@Example.com", password: PASSWORD });
  if (!r.ok) throw new Error("falha ao criar usuário");
  return r.user;
}

const minutes = (base: Date, m: number) => new Date(base.getTime() + m * 60_000);

describe("cadastro do usuário master", () => {
  it("cria uma única vez, com e-mail normalizado e senha em hash", async () => {
    expect(hasMasterUser()).toBe(false);
    const user = await seedUser();
    expect(user.email).toBe("igor@example.com");
    expect(hasMasterUser()).toBe(true);

    const row = db.select().from(users).get()!;
    expect(row.passwordHash).not.toContain(PASSWORD);
    expect(row.passwordHash).toMatch(/^\$2[aby]\$12\$/);

    const second = await createMasterUser({ name: "Outro", email: "x@y.com", password: PASSWORD });
    expect(second).toEqual({ ok: false, reason: "already_exists" });
  });

  it("valida a senha: tamanho, letras+números e confirmação", () => {
    const base = { name: "Igor", email: "igor@example.com" };
    expect(setupSchema.safeParse({ ...base, password: "curta1", confirmPassword: "curta1" }).success).toBe(false);
    expect(setupSchema.safeParse({ ...base, password: "somenteletras", confirmPassword: "somenteletras" }).success).toBe(false);
    expect(setupSchema.safeParse({ ...base, password: PASSWORD, confirmPassword: "outra123456" }).success).toBe(false);
    expect(setupSchema.safeParse({ ...base, password: PASSWORD, confirmPassword: PASSWORD }).success).toBe(true);
  });
});

describe("login — e-mail e senha", () => {
  it("aceita credenciais corretas (e-mail sem diferenciar maiúsculas)", async () => {
    await seedUser();
    const r = await authenticate("  IGOR@example.com ", PASSWORD);
    expect(r.ok).toBe(true);
  });

  it("não revela se o e-mail existe", async () => {
    await seedUser();
    expect(await authenticate("ninguem@example.com", PASSWORD)).toEqual({ ok: false, reason: "invalid_credentials" });
    expect(await authenticate("igor@example.com", "errada12345")).toEqual({ ok: false, reason: "invalid_credentials" });
  });

  it(`bloqueia por 15 min após ${MAX_FAILED_LOGINS} erros — mesmo com a senha certa`, async () => {
    await seedUser();
    const now = new Date("2026-11-18T12:00:00Z");
    for (let i = 1; i < MAX_FAILED_LOGINS; i++) {
      expect((await authenticate("igor@example.com", "errada12345", now)).ok).toBe(false);
    }
    const locked = await authenticate("igor@example.com", "errada12345", now);
    expect(locked).toMatchObject({ ok: false, reason: "locked" });

    expect(await authenticate("igor@example.com", PASSWORD, minutes(now, 5))).toMatchObject({ reason: "locked" });
    expect((await authenticate("igor@example.com", PASSWORD, minutes(now, 16))).ok).toBe(true);

    const row = db.select().from(users).get()!;
    expect(row.failedLogins).toBe(0);
    expect(row.lockedUntil).toBeNull();
  });
});

describe("2FA — código de 6 dígitos", () => {
  it("gera código numérico de 6 dígitos e guarda apenas o hash", async () => {
    const user = await seedUser();
    const c = createChallenge(user.id);
    expect(c.code).toMatch(/^\d{6}$/);
    const row = db.select().from(authChallenges).where(eq(authChallenges.id, c.challengeId)).get()!;
    expect(row.codeHash).not.toContain(c.code);
  });

  it("aceita o código correto uma única vez", async () => {
    const user = await seedUser();
    const c = createChallenge(user.id);
    expect(verifyChallenge(c.challengeId, c.code)).toEqual({ ok: true, userId: user.id });
    expect(verifyChallenge(c.challengeId, c.code)).toEqual({ ok: false, reason: "not_found" });
  });

  it("expira após 5 minutos", async () => {
    const user = await seedUser();
    const now = new Date();
    const c = createChallenge(user.id, now);
    expect(getPendingChallenge(c.challengeId, minutes(now, 4))).not.toBeNull();
    expect(verifyChallenge(c.challengeId, c.code, minutes(now, 6))).toEqual({ ok: false, reason: "expired" });
  });

  it("conta tentativas e esgota após 5 erros (nem o código certo passa depois)", async () => {
    const user = await seedUser();
    const c = createChallenge(user.id);
    const wrong = c.code === "000000" ? "111111" : "000000";

    expect(verifyChallenge(c.challengeId, wrong)).toEqual({ ok: false, reason: "invalid", attemptsLeft: 4 });
    for (let i = 0; i < 3; i++) verifyChallenge(c.challengeId, wrong);
    expect(verifyChallenge(c.challengeId, wrong)).toEqual({ ok: false, reason: "too_many_attempts" });
    expect(verifyChallenge(c.challengeId, c.code)).toEqual({ ok: false, reason: "too_many_attempts" });
  });

  it("um novo código invalida o anterior", async () => {
    const user = await seedUser();
    const first = createChallenge(user.id);
    const second = createChallenge(user.id);
    expect(verifyChallenge(first.challengeId, first.code)).toEqual({ ok: false, reason: "not_found" });
    expect(verifyChallenge(second.challengeId, second.code).ok).toBe(true);
  });

  it("reenvio respeita intervalo de 30s e funciona mesmo com o código expirado", async () => {
    const user = await seedUser();
    vi.useFakeTimers({ now: new Date("2026-11-18T12:00:00Z"), toFake: ["Date"] });
    try {
      const c = createChallenge(user.id);
      expect(getResendTarget(c.challengeId)?.waitSeconds).toBe(30);
      vi.setSystemTime(new Date("2026-11-18T12:00:31Z"));
      expect(getResendTarget(c.challengeId)?.waitSeconds).toBe(0);
      vi.setSystemTime(new Date("2026-11-18T12:10:00Z")); // código já expirou
      expect(getResendTarget(c.challengeId)).toMatchObject({ userId: user.id, waitSeconds: 0 });
      vi.setSystemTime(new Date("2026-11-18T13:10:00Z")); // mais de 1h: precisa logar de novo
      expect(getResendTarget(c.challengeId)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejeita id de desafio inexistente ou ausente", () => {
    expect(verifyChallenge(undefined, "123456")).toEqual({ ok: false, reason: "not_found" });
    expect(verifyChallenge("nao-existe", "123456")).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("sessões", () => {
  it("cria sessão válida e guarda apenas o hash do token", async () => {
    const user = await seedUser();
    const { jwt } = await createSession(user.id, { userAgent: "vitest" });
    const claims = await verifySessionJwt(jwt);
    expect(claims?.sub).toBe(String(user.id));

    const row = db.select().from(sessions).get()!;
    expect(row.id).not.toBe(claims?.sid);
    expect(row.id).toMatch(/^[0-9a-f]{64}$/);

    const valid = await validateSession(jwt);
    expect(valid?.user.email).toBe("igor@example.com");
  });

  it("logout revoga a sessão mesmo com o JWT ainda válido", async () => {
    const user = await seedUser();
    const { jwt } = await createSession(user.id);
    await revokeSession(jwt);
    expect(await verifySessionJwt(jwt)).not.toBeNull(); // assinatura continua ok…
    expect(await validateSession(jwt)).toBeNull(); // …mas o banco recusa
  });

  it("recusa JWT adulterado, de sessão inexistente ou expirada", async () => {
    const user = await seedUser();
    const { jwt } = await createSession(user.id);
    const tampered = jwt.slice(0, -4) + (jwt.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(await validateSession(tampered)).toBeNull();

    const forged = await signSessionJwt({ sub: "1", sid: "inventado" }, minutes(new Date(), 60));
    expect(await validateSession(forged)).toBeNull();

    expect(await validateSession(jwt, minutes(new Date(), 13 * 60))).toBeNull();
    expect(await validateSession(undefined)).toBeNull();
  });
});
