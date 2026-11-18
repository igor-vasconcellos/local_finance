const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** E-mail do código 2FA (HTML com estilos inline + versão texto). */
export function twoFactorEmail({ name, code, ttlMinutes }: { name: string; code: string; ttlMinutes: number }) {
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
        <h1 style="font-size:20px;margin:24px 0 8px">Seu código de verificação</h1>
        <p style="margin:0 0 24px;color:#5b5a66;font-size:14px;line-height:1.5">Olá, ${firstName}! Use o código abaixo para concluir seu login.</p>
        <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 auto 24px"><tr>${digits}</tr></table>
        <p style="margin:0;color:#5b5a66;font-size:13px;line-height:1.5">O código expira em <strong>${ttlMinutes} minutos</strong> e só pode ser usado uma vez.</p>
        <p style="margin:16px 0 0;color:#8a8995;font-size:12px;line-height:1.5">Se não foi você que tentou entrar, troque sua senha — alguém pode conhecê-la.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  const text = `Olá, ${name.split(" ")[0]}!

Seu código de verificação do Local Finance é: ${code}

Ele expira em ${ttlMinutes} minutos e só pode ser usado uma vez.
Se não foi você que tentou entrar, troque sua senha.`;

  return { subject: `${code} é seu código do Local Finance`, html, text };
}
