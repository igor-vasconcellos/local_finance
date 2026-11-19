/**
 * Política de senha forte (compartilhada entre o formulário e o servidor).
 * Critérios usuais (OWASP/NIST + exigências de bancos digitais): tamanho mínimo,
 * maiúscula, minúscula, número, símbolo, não conter nome/e-mail e não ser senha comum.
 */

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX_BYTES = 72; // bcrypt ignora o que passa de 72 bytes

/** Senhas mais usadas no Brasil e no mundo (comparação sem acento/maiúscula/números finais). */
const COMMON = new Set([
  "123456", "1234567", "12345678", "123456789", "1234567890", "senha", "senha123", "password", "qwerty", "abc123",
  "111111", "000000", "iloveyou", "admin", "welcome", "letmein", "monkey", "dragon", "football", "futebol",
  "flamengo", "corinthians", "palmeiras", "saopaulo", "vasco", "gremio", "brasil", "mudar", "mudar123",
  "qwertyuiop", "asdfghjkl", "zxcvbnm", "princesa", "amor", "teamo", "minhasenha", "mudarsenha", "trocar",
  "trocarsenha", "senhaforte", "segredo", "jesus", "deusefiel", "123mudar", "abcdef", "master", "root", "teste",
]);

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

function isCommon(pw: string): boolean {
  const base = fold(pw).replace(/[^a-z0-9]/g, "");
  const stripped = base.replace(/\d+$/, "").replace(/^\d+/, "");
  return COMMON.has(base) || COMMON.has(stripped) || /^(.)\1+$/.test(base) || /^(0123456789|1234567890|9876543210)/.test(base);
}

function containsPersonal(pw: string, ctx: { name?: string; email?: string }): boolean {
  const p = fold(pw);
  const parts = [
    ...(ctx.name ? fold(ctx.name).split(/\s+/) : []),
    ...(ctx.email ? fold(ctx.email.split("@")[0] ?? "").split(/[._+-]+/) : []),
  ].filter((x) => x.length >= 4);
  return parts.some((x) => p.includes(x));
}

export type PasswordCheck = { id: string; label: string; ok: boolean };

export function passwordChecks(pw: string, ctx: { name?: string; email?: string } = {}): PasswordCheck[] {
  return [
    { id: "length", label: `Pelo menos ${PASSWORD_MIN} caracteres`, ok: pw.length >= PASSWORD_MIN },
    { id: "upper", label: "Uma letra maiúscula", ok: /\p{Lu}/u.test(pw) },
    { id: "lower", label: "Uma letra minúscula", ok: /\p{Ll}/u.test(pw) },
    { id: "number", label: "Um número", ok: /\d/.test(pw) },
    { id: "symbol", label: "Um símbolo (ex.: ! @ # $ %)", ok: /[^\p{L}\d\s]/u.test(pw) },
    {
      id: "personal",
      label: "Não conter seu nome nem seu e-mail",
      ok: pw.length > 0 && !containsPersonal(pw, ctx),
    },
    { id: "common", label: "Não ser uma senha comum", ok: pw.length > 0 && !isCommon(pw) },
  ];
}

/** Primeira regra não atendida (mensagem para o usuário) ou null se a senha é forte. */
export function passwordProblem(pw: string, ctx: { name?: string; email?: string } = {}): string | null {
  if (new TextEncoder().encode(pw).length > PASSWORD_MAX_BYTES) return "A senha pode ter no máximo 72 caracteres.";
  const failed = passwordChecks(pw, ctx).find((c) => !c.ok);
  return failed ? `Senha fraca: falta “${failed.label.toLowerCase()}”.` : null;
}
