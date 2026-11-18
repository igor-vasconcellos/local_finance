/**
 * Recuperação de acesso local: define uma nova senha para o usuário master,
 * desbloqueia o login e encerra todas as sessões abertas.
 * Só funciona com acesso ao terminal do computador onde o app roda.
 *
 * Uso:  npm run user:reset-password
 */
import "./_load-env";
import readline from "node:readline/promises";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, sqlite } from "@/db/client";
import { authChallenges, sessions, users } from "@/db/schema";
import { PASSWORD_MIN } from "@/lib/validation/auth";

async function main() {
  const user = db.select().from(users).where(eq(users.id, 1)).get();
  if (!user) {
    console.log("ℹ️  Nenhum usuário cadastrado ainda. Abra o app e faça o primeiro acesso.");
    return;
  }

  console.log(`\n🔑 Redefinir senha de ${user.name} <${user.email}>\n`);
  // Lê linha a linha (funciona tanto digitando quanto com entrada redirecionada).
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  const lines = rl[Symbol.asyncIterator]();
  const ask = async (q: string) => {
    process.stdout.write(q);
    const { value } = await lines.next();
    return typeof value === "string" ? value : "";
  };
  const password = await ask(`Nova senha (mín. ${PASSWORD_MIN} caracteres, letras e números): `);
  const confirm = await ask("Confirme a nova senha: ");
  rl.close();

  if (password !== confirm) throw new Error("As senhas não conferem.");
  if (password.length < PASSWORD_MIN || !/[A-Za-zÀ-ÿ]/.test(password) || !/\d/.test(password)) {
    throw new Error(`A senha precisa ter ao menos ${PASSWORD_MIN} caracteres, com letras e números.`);
  }
  if (new TextEncoder().encode(password).length > 72) throw new Error("Senha longa demais (máx. 72).");

  const passwordHash = await bcrypt.hash(password, 12);
  db.transaction((tx) => {
    tx.update(users).set({ passwordHash, failedLogins: 0, lockedUntil: null }).where(eq(users.id, 1)).run();
    tx.delete(sessions).run();
    tx.delete(authChallenges).run();
  });

  console.log("\n✅ Senha redefinida. Todas as sessões foram encerradas — faça login novamente.");
}

main()
  .catch((err: unknown) => {
    console.error(`\n❌ ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  })
  .finally(() => sqlite.close());
