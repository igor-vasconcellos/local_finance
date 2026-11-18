/**
 * Cria o .env a partir do .env.example (se ainda não existir) e gera um
 * SESSION_SECRET aleatório. Nunca sobrescreve um .env existente.
 */
import crypto from "node:crypto";
import fs from "node:fs";

const ENV = ".env";
const EXAMPLE = ".env.example";

if (fs.existsSync(ENV)) {
  const content = fs.readFileSync(ENV, "utf8");
  const match = content.match(/^SESSION_SECRET=(.*)$/m);
  if (!match || match[1].trim().length < 32) {
    const secret = crypto.randomBytes(48).toString("base64url");
    const updated = match
      ? content.replace(/^SESSION_SECRET=.*$/m, `SESSION_SECRET=${secret}`)
      : `${content.trimEnd()}\nSESSION_SECRET=${secret}\n`;
    fs.writeFileSync(ENV, updated);
    console.log("🔑 SESSION_SECRET gerado no .env existente.");
  } else {
    console.log("✅ .env já existe e está com SESSION_SECRET — nada a fazer.");
  }
  process.exit(0);
}

const template = fs.readFileSync(EXAMPLE, "utf8");
const secret = crypto.randomBytes(48).toString("base64url");
fs.writeFileSync(ENV, template.replace(/^SESSION_SECRET=.*$/m, `SESSION_SECRET=${secret}`));
console.log("✅ .env criado a partir do .env.example com um SESSION_SECRET aleatório.");
console.log("   Para enviar o código 2FA por e-mail, preencha as variáveis SMTP_* no .env.");
console.log("   Sem SMTP, o código aparece aqui no terminal (modo console).");
