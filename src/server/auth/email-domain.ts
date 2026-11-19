import "server-only";
import { resolveMx } from "node:dns/promises";
import { env } from "@/env";

/** Provedores de e-mail temporário/descartável mais comuns. */
const DISPOSABLE = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "sharklasers.com", "10minutemail.com", "10minutemail.net",
  "temp-mail.org", "tempmail.com", "tempmail.net", "tempmailo.com", "yopmail.com", "yopmail.net", "trashmail.com",
  "getnada.com", "nada.email", "dispostable.com", "maildrop.cc", "mailnesia.com", "fakeinbox.com", "throwawaymail.com",
  "mohmal.com", "emailondeck.com", "mintemail.com", "mytemp.email", "tempr.email", "discard.email", "spamgourmet.com",
  "moakt.com", "burnermail.io", "inboxkitten.com", "1secmail.com", "1secmail.net", "emailfake.com", "fakemail.net",
]);

export type EmailDomainCheck = "ok" | "disposable" | "no_mail_server";

/**
 * Confere se o domínio do e-mail pode receber mensagens (registro MX) e se não é
 * descartável. A prova final de que a caixa existe é o código enviado no cadastro.
 * Falhas de rede (sem internet, DNS fora) não bloqueiam o cadastro.
 */
export async function checkEmailDomain(email: string): Promise<EmailDomainCheck> {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (DISPOSABLE.has(domain)) return "disposable";
  if (!env.EMAIL_MX_CHECK) return "ok";
  const found = await hasMx(domain);
  if (found !== false) return "ok"; // true, ou null = não deu para consultar
  // Sem internet/DNS, TODO domínio "não existe": confere um domínio conhecido antes de recusar.
  return (await hasMx("gmail.com")) === true ? "no_mail_server" : "ok";
}

/** true = recebe e-mail; false = domínio sem MX/inexistente; null = falha na consulta. */
async function hasMx(domain: string): Promise<boolean | null> {
  try {
    const records = await Promise.race([
      resolveMx(domain),
      new Promise<never>((_, reject) => setTimeout(() => reject(Object.assign(new Error("timeout"), { code: "ETIMEOUT" })), 4000)),
    ]);
    return records.some((r) => r.exchange && r.exchange !== ".");
  } catch (error) {
    const code = (error as { code?: string }).code;
    return code === "ENOTFOUND" || code === "ENODATA" ? false : null;
  }
}
