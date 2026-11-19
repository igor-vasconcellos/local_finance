const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export type CodePurpose = "login" | "signup" | "reset";

const COPY: Record<CodePurpose, { title: string; lead: string; warn: string; subject: (c: string) => string }> = {
  login: {
    title: "Seu código de verificação",
    lead: "Use o código abaixo para concluir seu login.",
    warn: "Se não foi você que tentou entrar, troque sua senha — alguém pode conhecê-la.",
    subject: (c) => `${c} é seu código do Local Finance`,
  },
  signup: {
    title: "Confirme seu e-mail",
    lead: "Bem-vindo(a) ao Local Finance! Use o código abaixo para confirmar seu e-mail e ativar sua conta.",
    warn: "Se você não criou uma conta no Local Finance, ignore este e-mail.",
    subject: (c) => `${c} é o código para confirmar seu e-mail`,
  },
  reset: {
    title: "Redefinição de senha",
    lead: "Recebemos um pedido para trocar a senha da sua conta. Use o código abaixo para criar uma nova senha.",
    warn: "Se não foi você que pediu, ignore este e-mail: sua senha continua a mesma.",
    subject: (c) => `${c} é o código para redefinir sua senha`,
  },
};

/** E-mail com código de 6 dígitos (HTML com estilos inline + versão texto). */
export function codeEmail({
  name,
  code,
  ttlMinutes,
  purpose = "login",
}: {
  name: string;
  code: string;
  ttlMinutes: number;
  purpose?: CodePurpose;
}) {
  const copy = COPY[purpose];
  const firstName = escapeHtml(name.split(" ")[0] ?? name);
  const digits = code
    .split("")
    .map(
      (d) =>
        `<td style="width:44px;height:52px;border:1px solid #e4e4ed;border-radius:10px;background:#f7f7fb;font:600 26px/52px ui-monospace,Menlo,Consolas,monospace;color:#1c1b22;text-align:center">${d}</td>`,
    )
    .join('<td style="width:8px"></td>');

  const html = `<!doctype html>
<html lang="pt-BR"><body style="margin:0;padding:32px 16px;background:#f4f4f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c1b22">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
    <table role="presentation" width="100%" style="max-width:440px;background:#ffffff;border:1px solid #e4e4ed;border-radius:16px;padding:32px" cellspacing="0" cellpadding="0">
      <tr><td>
        <div style="display:inline-block;background:#7c3aed;color:#fff;border-radius:10px;padding:8px 12px;font-weight:600;font-size:14px">Local Finance</div>
        <h1 style="font-size:20px;margin:24px 0 8px">${copy.title}</h1>
        <p style="margin:0 0 24px;color:#5b5a66;font-size:14px;line-height:1.5">Olá, ${firstName}! ${copy.lead}</p>
        <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 auto 24px"><tr>${digits}</tr></table>
        <p style="margin:0;color:#5b5a66;font-size:13px;line-height:1.5">O código expira em <strong>${ttlMinutes} minutos</strong> e só pode ser usado uma vez.</p>
        <p style="margin:16px 0 0;color:#8a8995;font-size:12px;line-height:1.5">${copy.warn}</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  const text = `Olá, ${name.split(" ")[0]}!

${copy.lead}

Código: ${code}

Ele expira em ${ttlMinutes} minutos e só pode ser usado uma vez.
${copy.warn}`;

  return { subject: copy.subject(code), html, text };
}

/** Compatibilidade: e-mail do 2FA do login. */
export const twoFactorEmail = (p: { name: string; code: string; ttlMinutes: number }) => codeEmail({ ...p, purpose: "login" });
