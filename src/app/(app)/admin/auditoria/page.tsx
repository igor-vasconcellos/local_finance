import { maskEmail } from "@/lib/mask";
import { History } from "lucide-react";
import { Card, EmptyState } from "@/components/ui/page";
import { listAudit } from "@/server/admin/service";
import { ACTION_LABEL, describeDetails, formatDateTime } from "../format";

export default async function AdminAuditPage() {
  const rows = await listAudit(200);
  if (rows.length === 0) {
    return <EmptyState icon={<History />} title="Nenhuma ação registrada" description="Tudo o que for feito no painel aparece aqui." />;
  }
  return (
    <Card>
      <div className="border-b px-5 py-4">
        <h2 className="font-semibold">Registro de ações</h2>
        <p className="text-sm text-muted-foreground">As 200 ações mais recentes do painel.</p>
      </div>
      <ul className="divide-y">
        {rows.map((a) => (
          <li key={a.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-5 py-3 text-sm">
            <div className="grid min-w-0 gap-0.5">
              <p className="font-medium">
                {ACTION_LABEL[a.action] ?? a.action}
                {a.targetEmail && <span className="font-normal text-muted-foreground"> · {maskEmail(a.targetEmail)}</span>}
              </p>
              {describeDetails(a.details) && <p className="text-xs text-muted-foreground">{describeDetails(a.details)}</p>}
            </div>
            <p className="text-xs text-muted-foreground tabular-nums">
              {formatDateTime(a.createdAt)} · {a.actorEmail ? maskEmail(a.actorEmail) : "conta removida"} · IP {a.ip ?? "—"}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
