import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { authChallenges, sessions, users } from "@/db/schema";
import { signSessionJwt, verifySessionJwt } from "@/lib/auth/jwt";
import { passwordChecks, passwordProblem } from "@/lib/auth/password-policy";
import { signupSchema } from "@/lib/validation/auth";
import { checkEmailDomain } from "@/server/auth/email-domain";
import { createSession, revokeSession, validateSession } from "@/server/auth/sessions";
import {
  createChallenge,
  getPendingChallenge,
  getResendTarget,
  sendCooldown,
  verifyChallenge,
} from "@/server/auth/two-factor";
import { categories, settings } from "@/db/schema";
import {
  authenticate,
  changePassword,
  confirmEmail,
  findVerifiedUserByEmail,
  MAX_FAILED_LOGINS,
  registerUser,
} from "@/server/auth/users";

const PASSWORD = "Cofre#Azul2026";

beforeEach(() => {
  db.delete(sessions).run();
  db.delete(authChallenges).run();
  db.delete(users).run();
});

async function seedUser(email = "Igor@Example.com") {
  const r = await registerUser({ name: "Igor Vasconcellos", email, password: PASSWORD });
  if (!r.ok) throw new Error("falha ao criar usuário");
  confirmEmail(r.user.id);
  return r.user;
}

const minutes = (base: Date, m: number) => new Date(base.getTime() + m * 60_000);

describe("cadastro de contas", () => {
  it("cria a conta com e-mail normalizado, senha em hash e ainda não confirmada", async () => {
    const r = await registerUser({ name: "Igor", email: "Igor@Example.com", password: PASSWORD });
    expect(r.ok && r.user.email).toBe("igor@example.com");
    const row = db.select().from(users).get()!;
    expect(row.passwordHash).not.toContain(PASSWORD);
    expect(row.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(row.emailVerifiedAt).toBeNull();
    expect(findVerifiedUserByEmail("igor@example.com")).toBeUndefined();
    expect((await authenticate("igor@example.com", PASSWORD)) as { verified?: boolean }).toMatchObject({ ok: true, verified: false });
  });

  it("ao confirmar o e-mail, cria categorias, CDI e configurações da conta", async () => {
    const user = await seedUser();
    expect(db.select().from(users).get()!.emailVerifiedAt).not.toBeNull();
    expect(db.select().from(categories).where(eq(categories.userId, user.id)).all().length).toBe(18);
    expect(db.select().from(settings).where(eq(settings.userId, user.id)).get()).toBeTruthy();
    confirmEmail(user.id); // idempotente
    expect(db.select().from(categories).where(eq(categories.userId, user.id)).all().length).toBe(18);
  });

  it("não deixa cadastrar e-mail já confirmado; cadastro abandonado é reaproveitado", async () => {
    await seedUser();
    expect(await registerUser({ name: "Outro", email: "igor@example.com", password: PASSWORD })).toEqual({
      ok: false,
      reason: "already_exists",
    });
    const a = await registerUser({ name: "Ana", email: "ana@example.com", password: PASSWORD });
    const b = await registerUser({ name: "Ana Souza", email: "ana@example.com", password: "Outra#Senha99" });
    expect(a.ok && b.ok && a.user.id === b.user.id).toBe(true);
    expect(db.select().from(users).all()).toHaveLength(2);
  });

  it("senha forte: tamanho, maiúscula, minúscula, número, símbolo, sem dados pessoais e não comum", () => {
    const ctx = { name: "Igor Vasconcellos", email: "igor.vasc@example.com" };
    expect(passwordProblem("Curta#1", ctx)).toMatch(/10 caracteres/);
    expect(passwordProblem("semmaiuscula#2026", ctx)).toMatch(/maiúscula/);
    expect(passwordProblem("SEMMINUSCULA#2026", ctx)).toMatch(/minúscula/);
    expect(passwordProblem("SemNumero#Aqui", ctx)).toMatch(/número/);
    expect(passwordProblem("SemSimbolo2026", ctx)).toMatch(/símbolo/);
    expect(passwordProblem("Vasconcellos#2026", ctx)).toMatch(/nome/);
    expect(passwordProblem("Senha123!!!!", ctx)).toMatch(/comum/);
    expect(passwordProblem(PASSWORD, ctx)).toBeNull();
    expect(passwordChecks(PASSWORD, ctx).every((c) => c.ok)).toBe(true);
  });

  it("o formulário de cadastro exige senha forte e confirmação igual", () => {
    const base = { name: "Igor", email: "igor@example.com" };
    expect(signupSchema.safeParse({ ...base, password: "senhaforte123", confirmPassword: "senhaforte123" }).success).toBe(false);
    expect(signupSchema.safeParse({ ...base, password: PASSWORD, confirmPassword: "Outra#Senha99" }).success).toBe(false);
    expect(signupSchema.safeParse({ ...base, password: PASSWORD, confirmPassword: PASSWORD }).success).toBe(true);
  });

  it("recusa e-mails descartáveis", async () => {
    expect(await checkEmailDomain("alguem@mailinator.com")).toBe("disposable");
    expect(await checkEmailDomain("alguem@gmail.com")).toBe("ok"); // checagem MX desligada nos testes
  });
});

describe("esqueci a senha", () => {
  it("código de troca de senha não serve para entrar, e o de login não serve para trocar a senha", async () => {
    const user = await seedUser();
    const reset = createChallenge(user.id, new Date(), "reset");
    expect(verifyChallenge(reset.challengeId, reset.code)).toEqual({ ok: false, reason: "not_found" });
    const login = createChallenge(user.id, new Date(), "login");
    expect(verifyChallenge(login.challengeId, login.code, new Date(), ["reset"])).toEqual({ ok: false, reason: "not_found" });
    const reset2 = createChallenge(user.id, new Date(), "reset");
    expect(verifyChallenge(reset2.challengeId, reset2.code, new Date(), ["reset"])).toEqual({ ok: true, userId: user.id, purpose: "reset" });
  });

  it("trocar a senha desbloqueia o login e encerra todas as sessões", async () => {
    const user = await seedUser();
    const s = await createSession(user.id);
    db.update(users).set({ lockedUntil: "2999-01-01T00:00:00Z", failedLogins: 3 }).run();
    await changePassword(user.id, "Nova#Senha2027");
    expect(await validateSession(s.jwt)).toBeNull();
    expect((await authenticate("igor@example.com", "Nova#Senha2027")).ok).toBe(true);
    expect((await authenticate("igor@example.com", PASSWORD)).ok).toBe(false);
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
    expect(await authenticate("igor@example.com", "Errada#12345")).toEqual({ ok: false, reason: "invalid_credentials" });
  });

  it(`bloqueia por 15 min após ${MAX_FAILED_LOGINS} erros — mesmo com a senha certa`, async () => {
    await seedUser();
    const now = new Date("2026-11-18T12:00:00Z");
    for (let i = 1; i < MAX_FAILED_LOGINS; i++) {
      expect((await authenticate("igor@example.com", "Errada#12345", now)).ok).toBe(false);
    }
    const locked = await authenticate("igor@example.com", "Errada#12345", now);
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
    expect(verifyChallenge(c.challengeId, c.code)).toEqual({ ok: true, userId: user.id, purpose: "login" });
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

describe("limite de envio de códigos", () => {
  it("só libera outro código do mesmo tipo depois de 30s (controle no banco, não no cookie)", async () => {
    const user = await seedUser();
    const now = new Date("2026-11-19T12:00:00Z");
    expect(sendCooldown(user.id, "reset", now)).toBe(0);
    createChallenge(user.id, now, "reset");
    expect(sendCooldown(user.id, "reset", new Date(now.getTime() + 10_000))).toBe(20);
    expect(sendCooldown(user.id, "login", new Date(now.getTime() + 10_000))).toBe(0);
    expect(sendCooldown(user.id, "reset", new Date(now.getTime() + 31_000))).toBe(0);
  });
});
