/** Data e hora no fuso de São Paulo (ex.: 19/11/2026 22:47). */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

/** "2026-12-31" → 31/12/2026 */
export function formatDay(day: string | null | undefined): string {
  if (!day) return "—";
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
}

export const ACTION_LABEL: Record<string, string> = {
  "user.block": "Bloqueou a conta",
  "user.unblock": "Desbloqueou a conta",
  "user.courtesy.grant": "Liberou cortesia",
  "user.courtesy.revoke": "Removeu a cortesia",
  "user.sessions.revoke": "Encerrou as sessões",
  "feature.lock": "Travou uma função",
  "feature.unlock": "Liberou uma função",
};

export const FEATURE_NAME: Record<string, string> = {
  boxes: "Caixinhas",
  simulator: "Simulador",
  invoice_import: "Importação de faturas",
};

/** Resumo legível dos detalhes gravados na auditoria. */
export function describeDetails(details: string | null): string {
  if (!details) return "";
  try {
    const d = JSON.parse(details) as Record<string, unknown>;
    const parts: string[] = [];
    if (d.feature) parts.push(FEATURE_NAME[String(d.feature)] ?? String(d.feature));
    if (d.reason) parts.push(`motivo: ${d.reason}`);
    if (d.until) {
      const until = String(d.until);
      parts.push(until === "permanente" ? "permanente" : until.includes("T") ? `bloqueado até ${formatDateTime(until)}` : `até ${formatDay(until)}`);
    }
    if (d.message) parts.push(`mensagem: ${d.message}`);
    if (typeof d.sessionsRevoked === "number") parts.push(`${d.sessionsRevoked} sessão(ões) encerrada(s)`);
    if (d.reason === "invalid") parts.push("código incorreto");
    if (d.reason === "expired") parts.push("código expirado");
    if (d.reason === "too_many_attempts") parts.push("tentativas esgotadas");
    if (d.purpose === "reset") parts.push("redefinição de senha");
    if (d.via === "reset") parts.push("pelo “Esqueci minha senha”");
    if (d.via === "settings") parts.push("em Configurações");
    if (d.path) parts.push(`em ${d.path}`);
    if (d.scope === "others") parts.push("todas as outras");
    return parts.join(" · ");
  } catch {
    return "";
  }
}

export const SECURITY_LABEL: Record<string, string> = {
  login_success: "Login",
  login_failed: "Senha errada",
  login_locked: "Login bloqueado (tentativas)",
  code_failed: "Código errado/expirado",
  signup_confirmed: "Cadastro confirmado",
  password_reset_requested: "Pediu nova senha",
  password_changed: "Trocou a senha",
  logout: "Saiu",
  data_export: "Exportou os dados",
  blocked_write: "Tentativa barrada (conta bloqueada)",
  feature_locked: "Tentativa barrada (função travada)",
  session_revoked: "Encerrou uma sessão",
};

/** Eventos que merecem destaque (vermelho) na lista. */
export const SECURITY_DANGER = new Set(["login_failed", "login_locked", "code_failed", "blocked_write"]);
