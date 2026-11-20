import { Download, History, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, EmptyState } from "@/components/ui/page";
import { Select } from "@/components/ui/select";
import { maskEmail } from "@/lib/mask";
import { describeDevice } from "@/lib/user-agent";
import { cn } from "@/lib/utils";
import { SECURITY_EVENTS } from "@/db/schema/security";
import { ADMIN_ACTIONS, PAGE_SIZE, listAdminActions, listSecurity, normalizeFilters, type AuditFilters } from "@/server/admin/audit";
import { ACTION_LABEL, SECURITY_DANGER, SECURITY_LABEL, describeDetails, formatDateTime } from "../format";

type Tab = "seguranca" | "admin";

function query(tab: Tab, f: AuditFilters, page?: number) {
  const q = new URLSearchParams({ aba: tab });
  if (f.tipo) q.set("tipo", f.tipo);
  if (f.conta) q.set("conta", f.conta);
  if (f.de) q.set("de", f.de);
  if (f.ate) q.set("ate", f.ate);
  if (page && page > 1) q.set("pagina", String(page));
  return q.toString();
}

export default async function AdminAuditPage({ searchParams }: PageProps<"/admin/auditoria">) {
  const raw = await searchParams;
  const tab: Tab = raw.aba === "admin" ? "admin" : "seguranca";
  const f = normalizeFilters(raw);
  const result = tab === "seguranca" ? await listSecurity(f) : await listAdminActions(f);
  const pages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const page = Math.min(f.page ?? 1, pages);
  const types = tab === "seguranca" ? SECURITY_EVENTS.map((e) => [e, SECURITY_LABEL[e]]) : ADMIN_ACTIONS.map((a) => [a, ACTION_LABEL[a]]);
  const filtered = Boolean(f.tipo || f.conta || f.de || f.ate);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["seguranca", "Segurança", ShieldAlert],
            ["admin", "Ações do admin", History],
          ] as const
        ).map(([key, label, Icon]) => (
          <Link
            key={key}
            href={`/admin/auditoria?aba=${key}`}
            aria-current={tab === key ? "page" : undefined}
            className={cn(
              buttonVariants({ variant: tab === key ? "primary" : "secondary", size: "sm" }),
            )}
          >
            <Icon aria-hidden /> {label}
          </Link>
        ))}
      </div>

      <Card className="p-4">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_1.2fr_150px_150px_auto]" action="/admin/auditoria">
          <input type="hidden" name="aba" value={tab} />
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            Tipo
            <Select name="tipo" defaultValue={f.tipo ?? ""}>
              <option value="">Todos</option>
              {types.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </label>
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            Conta (e-mail)
            <Input name="conta" defaultValue={f.conta ?? ""} placeholder="ex.: maria@gmail.com" />
          </label>
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            De
            <Input type="date" name="de" defaultValue={f.de ?? ""} />
          </label>
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            Até
            <Input type="date" name="ate" defaultValue={f.ate ?? ""} />
          </label>
          <div className="flex items-end gap-2">
            <Button type="submit">Filtrar</Button>
            {filtered && (
              <Link href={`/admin/auditoria?aba=${tab}`} className={buttonVariants({ variant: "ghost" })}>
                Limpar
              </Link>
            )}
          </div>
        </form>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 className="font-semibold">{tab === "seguranca" ? "Eventos de segurança" : "Ações do painel admin"}</h2>
            <p className="text-sm text-muted-foreground">
              {result.total} registro{result.total === 1 ? "" : "s"}
              {filtered ? " com estes filtros" : ""} · guardados por 12 meses
            </p>
          </div>
          <a href={`/api/admin/auditoria?${query(tab, f)}`} className={buttonVariants({ variant: "secondary", size: "sm" })} download>
            <Download aria-hidden /> Exportar CSV
          </a>
        </div>

        {result.rows.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={<History />} title="Nenhum registro" description={filtered ? "Tente outros filtros." : "Os eventos aparecem aqui assim que acontecem."} />
          </div>
        ) : tab === "seguranca" ? (
          <ul className="divide-y">
            {(result.rows as Awaited<ReturnType<typeof listSecurity>>["rows"]).map((r) => {
              const email = r.accountEmail ?? r.email;
              const detail = describeDetails(r.details);
              return (
                <li key={r.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-5 py-3 text-sm">
                  <div className="grid min-w-0 gap-0.5">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      <Badge tone={SECURITY_DANGER.has(r.event) ? "danger" : r.event === "login_success" ? "success" : "neutral"} dot>
                        {SECURITY_LABEL[r.event] ?? r.event}
                      </Badge>
                      <span className="font-normal text-muted-foreground">{email ? maskEmail(email) : "conta desconhecida"}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {describeDevice(r.userAgent)}
                      {detail && ` · ${detail}`}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {formatDateTime(r.createdAt)} · IP {r.ip ?? "—"}
                  </p>
                </li>
              );
            })}
          </ul>
        ) : (
          <ul className="divide-y">
            {(result.rows as Awaited<ReturnType<typeof listAdminActions>>["rows"]).map((a) => (
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
        )}

        {pages > 1 && (
          <nav aria-label="Páginas" className="flex items-center justify-between gap-3 border-t px-5 py-3 text-sm">
            {page > 1 ? (
              <Link href={`/admin/auditoria?${query(tab, f, page - 1)}`} className="font-medium text-primary hover:underline">
                ← Anteriores
              </Link>
            ) : (
              <span />
            )}
            <span className="text-muted-foreground">
              Página {page} de {pages}
            </span>
            {page < pages ? (
              <Link href={`/admin/auditoria?${query(tab, f, page + 1)}`} className="font-medium text-primary hover:underline">
                Mais antigos →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </Card>
    </div>
  );
}
