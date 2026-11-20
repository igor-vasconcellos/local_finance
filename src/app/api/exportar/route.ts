import { getCurrentSession } from "@/server/auth/current";
import { hitRateLimit } from "@/server/auth/rate-limit";
import { exportUserData } from "@/server/export/service";

/** Baixa um .zip com todos os dados da conta logada (liberado mesmo com a conta bloqueada). */
export async function GET() {
  const session = await getCurrentSession();
  if (!session) return new Response("Não autenticado.", { status: 401 });

  const limit = await hitRateLimit(`export:user:${session.user.id}`, 10, 60 * 60);
  if (!limit.ok) return new Response("Muitas exportações seguidas. Tente de novo mais tarde.", { status: 429 });

  const zip = await exportUserData(session.user.id);
  const date = new Date().toISOString().slice(0, 10);
  return new Response(zip as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="beaconfinance-meus-dados-${date}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
