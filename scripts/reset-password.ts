/**
 * Recuperação de acesso pelo terminal (quando o e-mail não chega): define uma nova senha
 * para a conta informada,
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
import { passwordProblem } from "@/lib/auth/password-policy";

async function main() {
  // Lê linha a linha (funciona tanto digitando quanto com entrada redirecionada).
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  const lines = rl[Symbol.asyncIterator]();
  const ask = async (q: string) => {
    process.stdout.write(q);
    const { value } = await lines.next();
    return typeof value === "string" ? value : "";
  };

  const email = (await ask("E-mail da conta: ")).trim().toLowerCase();
  const user = db.select().from(users).where(eq(users.email, email)).get();
  if (!user) {
    rl.close();
    console.log("ℹ️  Nenhuma conta com esse e-mail.");
    return;
  }
  console.log(`\n🔑 Redefinir senha de ${user.name} <${user.email}>\n`);
  const password = await ask("Nova senha (forte: 10+ caracteres, maiúscula, minúscula, número e símbolo): ");
  const confirm = await ask("Confirme a nova senha: ");
  rl.close();

  if (password !== confirm) throw new Error("As senhas não conferem.");
  const problem = passwordProblem(password, { name: user.name, email: user.email });
  if (problem) throw new Error(problem);

  const passwordHash = await bcrypt.hash(password, 12);
  db.transaction((tx) => {
    tx.update(users).set({ passwordHash, failedLogins: 0, lockedUntil: null }).where(eq(users.id, user.id)).run();
    tx.delete(sessions).where(eq(sessions.userId, user.id)).run();
    tx.delete(authChallenges).where(eq(authChallenges.userId, user.id)).run();
  });

  console.log("\n✅ Senha redefinida. Todas as sessões foram encerradas — faça login novamente.");
}

main()
  .catch((err: unknown) => {
    console.error(`\n❌ ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  })
  .finally(() => sqlite.close());
