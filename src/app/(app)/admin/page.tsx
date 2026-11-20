import { maskEmail } from "@/lib/mask";
import { Ban, Gift, Lock, UserCheck, Users } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, StatCard } from "@/components/ui/page";
import { getOverview, listAudit, listFeatures } from "@/server/admin/service";
import { ACTION_LABEL, FEATURE_NAME, describeDetails, formatDateTime } from "./format";

export default async function AdminOverviewPage() {
  const [overview, features, audit] = await Promise.all([getOverview(), listFeatures(), listAudit(5)]);
  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Contas" value={overview.total} hint={`${overview.verified} com e-mail confirmado`} icon={<Users />} tone="primary" />
        <StatCard label="Ativas (30 dias)" value={overview.activeLast30} hint="acessaram no último mês" icon={<UserCheck />} tone="success" />
        <StatCard label="Em cortesia" value={overview.courtesy} hint="uso liberado sem pagar" icon={<Gift />} />
        <StatCard label="Bloqueadas" value={overview.blocked} hint="somente consulta" icon={<Ban />} tone="danger" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between border-b px-5 py-4">
            <h2 className="font-semibold">Funcionalidades</h2>
            <Link href="/admin/funcionalidades" className="text-sm font-medium text-primary hover:underline">
              Gerenciar
            </Link>
          </div>
          <ul className="divide-y">
            {features.map((f) => (
              <li key={f.key} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span>{FEATURE_NAME[f.key]}</span>
                {f.locked ? (
                  <Badge tone="danger" dot>
                    <Lock className="size-3" aria-hidden /> Travada
                  </Badge>
                ) : (
                  <Badge tone="success" dot>
                    Liberada
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <div className="flex items-center justify-between border-b px-5 py-4">
            <h2 className="font-semibold">Últimas ações</h2>
            <Link href="/admin/auditoria" className="text-sm font-medium text-primary hover:underline">
              Ver tudo
            </Link>
          </div>
          {audit.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">Nenhuma ação registrada ainda.</p>
          ) : (
            <ul className="divide-y">
              {audit.map((a) => (
                <li key={a.id} className="grid gap-0.5 px-5 py-3 text-sm">
                  <p className="font-medium">
                    {ACTION_LABEL[a.action] ?? a.action}
                    {a.targetEmail && <span className="font-normal text-muted-foreground"> · {maskEmail(a.targetEmail)}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(a.createdAt)}
                    {describeDetails(a.details) && ` · ${describeDetails(a.details)}`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
