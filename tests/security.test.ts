import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { adminAuditLog, securityEvents } from "@/db/schema";
import { listMyActivity, listSecurity, normalizeFilters, PAGE_SIZE } from "@/server/admin/audit";
import { createSession, listActiveSessions, revokeOtherSessions, revokeOwnSession, validateSession } from "@/server/auth/sessions";
import { ALERT_FAILED_LOGINS, logSecurityEvent, purgeOldSecurityData } from "@/server/security/events";
import { addUser, freshUser } from "./helpers/user";

const origin = (ip: string) => ({ ip, userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/130" });
let admin = 0;
let ana = 0;

beforeEach(async () => {
  admin = await freshUser("admin@example.com", "Igor");
  ana = await addUser("ana@example.com", "Ana");
  vi.restoreAllMocks();
});

describe("eventos de segurança", () => {
  it("grava o evento e acha a conta pelo e-mail digitado", async () => {
    await logSecurityEvent({ event: "login_failed", email: " ANA@example.com ", origin: origin("1.1.1.1") });
    await logSecurityEvent({ event: "login_failed", email: "ninguem@example.com", origin: origin("1.1.1.1") });
    const rows = await db.select().from(securityEvents);
    expect(rows.map((r) => [r.userId, r.email])).toEqual([
      [ana, "ana@example.com"],
      [null, "ninguem@example.com"],
    ]);
    expect(rows[0].ip).toBe("1.1.1.1");
  });

  it("nunca lança erro (falha ao registrar não derruba o login)", async () => {
    await expect(logSecurityEvent({ event: "login_failed", userId: 999999, origin: origin("x") })).resolves.toBeUndefined();
  });

  it(`alerta o admin com ${ALERT_FAILED_LOGINS} senhas erradas em 15 min, no máximo 1 vez por hora`, async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (let i = 0; i < ALERT_FAILED_LOGINS - 1; i++) await logSecurityEvent({ event: "login_failed", email: "ana@example.com", origin: origin("2.2.2.2") });
    expect(warn).not.toHaveBeenCalled();
    await logSecurityEvent({ event: "login_failed", email: "ana@example.com", origin: origin("2.2.2.2") });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("Muitas tentativas");
    expect(String(warn.mock.calls[0][0])).not.toContain("ana@example.com"); // e-mail mascarado
    await logSecurityEvent({ event: "login_failed", email: "ana@example.com", origin: origin("2.2.2.2") });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("alerta quando a conta é bloqueada por tentativas", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await logSecurityEvent({ event: "login_locked", email: "ana@example.com", origin: origin("3.3.3.3") });
    expect(String(warn.mock.calls[0]?.[0])).toContain("bloqueada temporariamente");
  });

  it("alerta login do admin a partir de IP novo (o primeiro login não alerta)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await logSecurityEvent({ event: "login_success", userId: admin, origin: origin("10.0.0.1") });
    await logSecurityEvent({ event: "login_success", userId: admin, origin: origin("10.0.0.1") });
    expect(warn).not.toHaveBeenCalled();
    await logSecurityEvent({ event: "login_success", userId: admin, origin: origin("10.0.0.99") });
    expect(String(warn.mock.calls[0]?.[0])).toContain("IP novo");
    // usuário comum não gera alerta de IP novo
    await logSecurityEvent({ event: "login_success", userId: ana, origin: origin("10.0.0.1") });
    await logSecurityEvent({ event: "login_success", userId: ana, origin: origin("10.0.0.2") });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("retenção: apaga o que tem mais de 12 meses", async () => {
    const now = new Date("2026-11-20T12:00:00Z");
    await logSecurityEvent({ event: "logout", userId: ana, origin: origin("1.1.1.1"), now: new Date("2025-11-01T00:00:00Z") });
    await logSecurityEvent({ event: "logout", userId: ana, origin: origin("1.1.1.1"), now: new Date("2026-11-01T00:00:00Z") });
    await db.insert(adminAuditLog).values({ actorUserId: admin, action: "feature.lock", createdAt: "2025-01-01T00:00:00.000Z" });
    await purgeOldSecurityData(now);
    expect((await db.select().from(securityEvents)).length).toBe(1);
    expect((await db.select().from(adminAuditLog)).length).toBe(0);
  });
});

describe("filtros da auditoria", () => {
  it("por tipo, conta, período e páginas", async () => {
    const o = origin("4.4.4.4");
    await logSecurityEvent({ event: "login_success", userId: ana, origin: o, now: new Date("2026-11-10T15:00:00Z") });
    await logSecurityEvent({ event: "login_failed", email: "ana@example.com", origin: o, now: new Date("2026-11-11T02:30:00Z") }); // 10/11 23:30 em Brasília
    await logSecurityEvent({ event: "login_failed", email: "admin@example.com", origin: o, now: new Date("2026-11-12T15:00:00Z") });

    expect((await listSecurity({ tipo: "login_failed" })).total).toBe(2);
    expect((await listSecurity({ conta: "ANA@" })).total).toBe(2);
    expect((await listSecurity({ tipo: "nao_existe" })).total).toBe(3); // tipo inválido é ignorado
    expect((await listSecurity({ de: "2026-11-10", ate: "2026-11-10" })).total).toBe(2); // dia no fuso de Brasília
    expect((await listSecurity({ de: "2026-11-12" })).total).toBe(1);

    for (let i = 0; i < PAGE_SIZE + 5; i++) await logSecurityEvent({ event: "logout", userId: ana, origin: o });
    expect((await listSecurity({ page: 1 })).rows.length).toBe(PAGE_SIZE);
    expect((await listSecurity({ page: 2 })).rows.length).toBe(8);
    expect((await listMyActivity(ana, 20)).length).toBe(20);
  });

  it("normaliza filtros da URL", () => {
    expect(normalizeFilters({ de: "2026-13-99x", ate: "2026-11-30", pagina: "-3", conta: "  " })).toEqual({
      tipo: undefined,
      conta: undefined,
      de: undefined,
      ate: "2026-11-30",
      page: 1,
    });
  });
});

describe("minhas sessões", () => {
  it("encerra só sessões da própria conta e mantém a atual", async () => {
    const a1 = await createSession(ana);
    const a2 = await createSession(ana);
    const a3 = await createSession(ana);
    const b1 = await createSession(admin);
    const current = (await validateSession(a1.jwt))!.sessionId;
    const list = await listActiveSessions(ana);
    expect(list.length).toBe(3);
    const other = list.find((s) => s.id !== current)!;
    const adminSession = (await validateSession(b1.jwt))!.sessionId;
    expect(await revokeOwnSession(ana, adminSession)).toBe(false); // sessão de outra conta
    expect(await revokeOwnSession(ana, other.id)).toBe(true);
    expect(await revokeOtherSessions(ana, current)).toBe(1);
    expect(await validateSession(a1.jwt)).not.toBeNull();
    expect(await validateSession(a2.jwt)).toBeNull();
    expect(await validateSession(a3.jwt)).toBeNull();
    expect(await validateSession(b1.jwt)).not.toBeNull();
  });
});
