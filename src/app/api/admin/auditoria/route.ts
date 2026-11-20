import { maskEmail } from "@/lib/mask";
import { describeDevice } from "@/lib/user-agent";
import { getAccessCached } from "@/server/access/service";
import { listAdminActions, listSecurity, normalizeFilters } from "@/server/admin/audit";
import { getCurrentSession } from "@/server/auth/current";
import { toCsv } from "@/server/export/service";

const MAX_ROWS = 10_000;

/** CSV da auditoria com os mesmos filtros da tela. Só para o admin (os demais recebem 404). */
export async function GET(request: Request) {
  const session = await getCurrentSession();
  const access = session ? await getAccessCached(session.user.id) : null;
  if (!session || !access?.isAdmin) return new Response("Não encontrado.", { status: 404 });

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const tab = params.aba === "admin" ? "admin" : "seguranca";
  const f = { ...normalizeFilters(params), page: 1 };
  const date = new Date().toISOString().slice(0, 10);

  const rows =
    tab === "seguranca"
      ? (await listSecurity(f, MAX_ROWS)).rows.map((r) => ({
          quando_utc: r.createdAt,
          evento: r.event,
          conta: (r.accountEmail ?? r.email) ? maskEmail((r.accountEmail ?? r.email)!) : "",
          ip: r.ip ?? "",
          aparelho: describeDevice(r.userAgent),
          detalhes: r.details ?? "",
        }))
      : (await listAdminActions(f, MAX_ROWS)).rows.map((r) => ({
          quando_utc: r.createdAt,
          acao: r.action,
          admin: r.actorEmail ? maskEmail(r.actorEmail) : "",
          conta_alvo: r.targetEmail ? maskEmail(r.targetEmail) : "",
          ip: r.ip ?? "",
          detalhes: r.details ?? "",
        }));

  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="auditoria-${tab}-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
