// Carrega o .env para scripts executados fora do Next (tsx).
// Deve ser o PRIMEIRO import de cada script, antes de "@/env" ou "@/db".
import fs from "node:fs";

if (fs.existsSync(".env")) {
  process.loadEnvFile(".env");
}
