import { eq } from "drizzle-orm";
import { strFromU8, unzipSync } from "fflate";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { adminAuditLog, sessions, users } from "@/db/schema";
import { courtesyActive, isAdminUser, resolveAccess, type AccessUser } from "@/server/access/policy";
import { getAccessForUser } from "@/server/access/service";
import {
  AdminError,
  blockUser,
  grantCourtesy,
  listAudit,
  listFeatures,
  listUsers,
  getOverview,
  revokeCourtesy,
  revokeUserSessions,
  setFeatureLock,
  unblockUser,
} from "@/server/admin/service";
import { createSession, validateSession } from "@/server/auth/sessions";
import { createIncome } from "@/server/finance/incomes";
import { exportUserData, toCsv } from "@/server/export/service";
import { addUser, freshUser } from "./helpers/user";

const ADMINS = ["admin@example.com"];
const base: AccessUser = {
  email: "ana@example.com",
  emailVerifiedAt: "2026-11-01T00:00:00.000Z",
  blockedAt: null,
  blockedReason: null,
  courtesyAt: null,
  courtesyUntil: null,
};
const NOW = new Date("2026-11-20T12:00:00Z");

describe("regra de acesso (pura)", () => {
  it("admin só com e-mail confirmado e na lista", () => {
    expect(isAdminUser({ email: "Admin@Example.com", emailVerifiedAt: "x" }, ADMINS)).toBe(true);
    expect(isAdminUser({ email: "admin@example.com", emailVerifiedAt: null }, ADMINS)).toBe(false);
    expect(isAdminUser({ email: "outro@example.com", emailVerifiedAt: "x" }, ADMINS)).toBe(false);
  });

  it("admin ignora bloqueio e travas", () => {
    const a = resolveAccess({ ...base, email: "admin@example.com", blockedAt: "x" }, { boxes: { message: null } }, ADMINS, NOW);
    expect(a).toMatchObject({ isAdmin: true, blocked: null, readOnly: false, locked: {} });
  });

  it("bloqueado fica só consulta e recebe o motivo", () => {
    const a = resolveAccess({ ...base, blockedAt: "2026-11-19T00:00:00Z", blockedReason: "Falta de pagamento" }, {}, ADMINS, NOW);
    expect(a.readOnly).toBe(true);
    expect(a.blocked?.reason).toBe("Falta de pagamento");
  });

  it("travas valem para usuários comuns", () => {
    const a = resolveAccess(base, { simulator: { message: "manutenção" } }, ADMINS, NOW);
    expect(a.locked.simulator?.message).toBe("manutenção");
    expect(a.readOnly).toBe(false);
  });

  it("cortesia: permanente, até a data (inclusive) e vencida", () => {
    expect(courtesyActive({ courtesyAt: "x", courtesyUntil: null }, NOW)).toBe(true);
    expect(courtesyActive({ courtesyAt: "x", courtesyUntil: "2026-11-20" }, NOW)).toBe(true);
    expect(courtesyActive({ courtesyAt: "x", courtesyUntil: "2026-11-19" }, NOW)).toBe(false);
    expect(courtesyActive({ courtesyAt: null, courtesyUntil: null }, NOW)).toBe(false);
  });
});

describe("painel admin (banco)", () => {
  let admin = 0;
  let ana = 0;
  const actor = () => ({ id: admin, ip: "1.2.3.4" });

  beforeEach(async () => {
    admin = await freshUser("admin@example.com", "Igor");
    ana = await addUser("ana@example.com", "Ana");
  });

  it("bloquear: grava motivo, derruba as sessões e registra auditoria", async () => {
    const s = await createSession(ana);
    expect(await validateSession(s.jwt)).not.toBeNull();

    await blockUser(actor(), ana, "  Falta de pagamento.  ");

    expect(await validateSession(s.jwt)).toBeNull();
    const access = await getAccessForUser(ana);
    expect(access?.readOnly).toBe(true);
    expect(access?.blocked?.reason).toBe("Falta de pagamento.");
    const [log] = await listAudit(1);
    expect(log).toMatchObject({ action: "user.block", targetEmail: "ana@example.com", actorEmail: "admin@example.com", ip: "1.2.3.4" });

    await unblockUser(actor(), ana);
    expect((await getAccessForUser(ana))?.readOnly).toBe(false);
    await expect(unblockUser(actor(), ana)).rejects.toThrow("não está bloqueada");
  });

  it("motivo é obrigatório", async () => {
    await expect(blockUser(actor(), ana, " ")).rejects.toBeInstanceOf(AdminError);
  });

  it("nenhuma ação do painel atinge um admin (nem a própria conta)", async () => {
    await expect(blockUser(actor(), admin, "teste")).rejects.toThrow("administrador");
    await expect(grantCourtesy(actor(), admin, null)).rejects.toThrow("administrador");
    await expect(revokeUserSessions(actor(), admin)).rejects.toThrow("administrador");
    const row = await db.select().from(users).where(eq(users.id, admin));
    expect(row[0].blockedAt).toBeNull();
  });

  it("cortesia com data de fim e remoção", async () => {
    await expect(grantCourtesy(actor(), ana, "2020-01-01", NOW)).rejects.toThrow("já passou");
    await expect(grantCourtesy(actor(), ana, "31/12/2026", NOW)).rejects.toThrow("inválida");
    await grantCourtesy(actor(), ana, "2026-12-31", NOW);
    const list = await listUsers("ana", NOW);
    expect(list[0]).toMatchObject({ courtesyActive: true, courtesyUntil: "2026-12-31" });
    expect((await getOverview(NOW)).courtesy).toBe(1);
    await revokeCourtesy(actor(), ana);
    expect((await listUsers("ana", NOW))[0].courtesyActive).toBe(false);
  });

  it("encerrar sessões", async () => {
    await createSession(ana);
    await createSession(ana);
    expect(await revokeUserSessions(actor(), ana)).toBe(2);
    const open = await db.select().from(sessions).where(eq(sessions.userId, ana));
    expect(open.every((s) => s.revokedAt)).toBe(true);
  });

  it("travar função: vale para todos, menos para o admin", async () => {
    await setFeatureLock(actor(), "boxes", true, "Em manutenção");
    expect((await getAccessForUser(ana))?.locked.boxes?.message).toBe("Em manutenção");
    expect((await getAccessForUser(admin))?.locked).toEqual({});
    expect((await listFeatures()).find((f) => f.key === "boxes")?.locked).toBe(true);
    await setFeatureLock(actor(), "boxes", false, null);
    expect((await getAccessForUser(ana))?.locked.boxes).toBeUndefined();
    const actions = (await db.select().from(adminAuditLog)).map((r) => r.action);
    expect(actions).toEqual(["feature.lock", "feature.unlock"]);
  });

  it("busca por nome ou e-mail, com curingas tratados como texto", async () => {
    expect((await listUsers("ANA@EXAMPLE")).map((u) => u.id)).toEqual([ana]);
    expect(await listUsers("%")).toEqual([]);
    expect((await listUsers("")).length).toBe(2);
    expect((await listUsers("")).find((u) => u.id === admin)?.isAdmin).toBe(true);
  });
});

describe("exportar meus dados", () => {
  it("o .zip tem só os dados da própria conta e neutraliza fórmulas", async () => {
    const a = await freshUser("a@example.com", "A");
    const b = await addUser("b@example.com", "B");
    await createIncome(a, { recurrence: "monthly", payDay: 5, startMonth: "2026-11", endMonth: null, name: "=HYPERLINK(\"x\")", type: "salary", amount: 100000, categoryId: null, notes: null });
    await createIncome(b, { recurrence: "monthly", payDay: 5, startMonth: "2026-11", endMonth: null, name: "Renda da B", type: "salary", amount: 100000, categoryId: null, notes: null });

    const files = unzipSync(await exportUserData(a));
    expect(Object.keys(files)).toContain("LEIA-ME.txt");
    const rendas = strFromU8(files["rendas.csv"]);
    expect(rendas).toContain("'=HYPERLINK");
    expect(rendas).not.toContain("Renda da B");
  });

  it("CSV com separador ; e aspas escapadas", () => {
    expect(toCsv([{ a: 'x;"y"', b: null }])).toBe('\uFEFFa;b\r\n"x;""y""";\r\n');
  });
});
