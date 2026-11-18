import type { Metadata } from "next";
import { CheckCircle2, Database, Mail, Percent, ShieldCheck, TriangleAlert, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { requireSession } from "@/server/auth/current";
import { getSystemStatus } from "@/server/system-status";

export const metadata: Metadata = { title: "Início" };

const pct = (bp: number) =>
  (bp / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

/**
 * Página inicial provisória (Etapas 1–2): confirma login e mostra o status do ambiente.
 * Será substituída pelo dashboard financeiro nas próximas etapas.
 */
export default async function DashboardPage() {
  const { user, expiresAt } = await requireSession();
  const status = await getSystemStatus();
  const firstName = user.name.split(" ")[0];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Olá, {firstName}! 👋</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Comece cadastrando suas rendas, gastos fixos e cartões pelo menu. O dashboard financeiro completo chega na Etapa 6.
        </p>
      </div>

      {status.ok ? (
        <>
          <section
            className="flex items-start gap-3 rounded-xl border border-success/30 bg-success-soft p-4"
            aria-live="polite"
          >
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
            <div className="text-sm">
              <p className="font-medium">Ambiente pronto e sessão protegida.</p>
              <p className="text-muted-foreground">
                Sua sessão expira em {dateTime(expiresAt)}. Use “Sair” para encerrá-la antes.
              </p>
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <StatCard icon={<ShieldCheck className="size-4" />} title="Conta">
              <Row label="Nome" value={user.name} />
              <Row label="E-mail" value={user.email} />
              <Row label="Sessão válida até" value={dateTime(expiresAt)} />
            </StatCard>

            <StatCard icon={<Database className="size-4" />} title="Banco de dados">
              <Row label="Arquivo" value={<code className="font-mono text-xs">{status.databasePath}</code>} />
              <Row label="SQLite" value={status.sqliteVersion} />
              <Row label="Tabelas" value={status.tableCount} />
              <Row label="Modo de journal" value={status.journalMode.toUpperCase()} />
            </StatCard>

            <StatCard icon={<Percent className="size-4" />} title="Parâmetros financeiros">
              <Row label="CDI anual" value={status.cdi ? pct(status.cdi.annualRateBp) : "—"} />
              <Row
                label="Vigente desde"
                value={status.cdi ? status.cdi.effectiveFrom.split("-").reverse().join("/") : "—"}
              />
              <Row label="Categorias padrão" value={status.categoryCount} />
            </StatCard>

            <StatCard icon={<Mail className="size-4" />} title="E-mail (2FA)">
              <Row label="Modo" value={status.mailTransport === "smtp" ? "SMTP configurado" : "Console (dev)"} />
              <p className="pt-1 text-xs text-muted-foreground">
                {status.mailTransport === "smtp"
                  ? "Os códigos de verificação são enviados por e-mail."
                  : "Sem SMTP no .env: os códigos 2FA aparecem no terminal do servidor."}
              </p>
            </StatCard>

            <StatCard icon={<TriangleAlert className="size-4" />} title="Farol de saúde financeira" className="sm:col-span-2">
              {status.thresholds && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <HealthBadge tone="success">Saudável · &gt; {pct(status.thresholds.greenBp)}</HealthBadge>
                  <HealthBadge tone="warning">
                    Atenção · {pct(status.thresholds.yellowBp)}–{pct(status.thresholds.greenBp)}
                  </HealthBadge>
                  <HealthBadge tone="danger">Crítico · &lt; {pct(status.thresholds.yellowBp)}</HealthBadge>
                </div>
              )}
              <p className="pt-2 text-xs text-muted-foreground">
                Percentual do saldo livre sobre a renda do mês. Ajustável em Configurações.
              </p>
            </StatCard>
          </section>
        </>
      ) : (
        <section className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger-soft p-4">
          <XCircle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
          <div className="text-sm">
            <p className="font-medium">Não foi possível ler o banco de dados.</p>
            <p className="mt-2 font-mono text-xs text-muted-foreground">{status.error}</p>
          </div>
        </section>
      )}
    </div>
  );
}

function StatCard({
  icon,
  title,
  children,
  className,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border bg-card p-5 shadow-xs", className)}>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
        {icon}
        {title}
      </h2>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium">{value}</span>
    </div>
  );
}

function HealthBadge({ tone, children }: { tone: "success" | "warning" | "danger"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        tone === "success" && "bg-success-soft text-success",
        tone === "warning" && "bg-warning-soft text-warning",
        tone === "danger" && "bg-danger-soft text-danger",
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {children}
    </span>
  );
}
