/**
 * Roda uma vez quando o servidor inicia: aplica migrações pendentes do banco
 * e garante os dados iniciais. Assim, depois de um `git pull`, basta rodar
 * `npm run dev` — o banco é atualizado sozinho, sem perder dados.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
