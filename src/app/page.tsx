import { connection } from "next/server";
import { CheckCircle2, Database, Mail, Percent, TriangleAlert, Wallet, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { cn } from "@/lib/utils";
import { getSystemStatus } from "@/server/system-status";

const pct = (bp: number) =>
  (bp / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";

/**
 * Etapa 1 — página de verificação do ambiente.
 * Será substituída pelo fluxo de login (Etapa 2) e pelo dashboard (Etapa 3+).
 */
export default async function SetupStatusPage() {
  await connection(); // sempre consulta o banco na hora, nunca na build
  const status = await getSystemStatus();

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Wallet className="size-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Local Finance</h1>
            <p className="text-sm text-muted-foreground">Etapa 1 · verificação do ambiente</p>
          </div>
        </div>
        <ThemeToggle />
      </header>

      {status.ok ? (
        <>
          <section
            className="flex items-start gap-3 rounded-xl border border-success/30 bg-success-soft p-4"
            aria-live="polite"
          >
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
            <div className="text-sm">
              <p className="font-medium">Ambiente pronto.</p>
              <p className="text-muted-foreground">
                Banco SQLite conectado e migrado. O próximo passo é a Etapa 2: cadastro do
                usuário master e login com 2FA.
              </p>
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <StatCard icon={<Database className="size-4" />} title="Banco de dados">
              <Row label="Arquivo" value={<code className="font-mono text-xs">{status.databasePath}</code>} />
              <Row label="SQLite" value={status.sqliteVersion} />
              <Row label="Tabelas" value={status.tableCount} />
              <Row label="Modo de journal" value={status.journalMode.toUpperCase()} />
              <Row label="Chaves estrangeiras" value={status.foreignKeys ? "Ativas" : "Desligadas"} />
            </StatCard>

            <StatCard icon={<Percent className="size-4" />} title="Parâmetros financeiros">
              <Row
                label="CDI anual"
                value={status.cdi ? pct(status.cdi.annualRateBp) : "—"}
              />
              <Row
                label="Vigente desde"
                value={status.cdi ? status.cdi.effectiveFrom.split("-").reverse().join("/") : "—"}
              />
              <Row label="Categorias padrão" value={status.categoryCount} />
              <Row label="Usuário master" value={status.hasUser ? "Cadastrado" : "Pendente (Etapa 2)"} />
            </StatCard>

            <StatCard icon={<Mail className="size-4" />} title="E-mail (2FA)">
              <Row
                label="Modo"
                value={status.mailTransport === "smtp" ? "SMTP configurado" : "Console (dev)"}
              />
              <p className="pt-1 text-xs text-muted-foreground">
                {status.mailTransport === "smtp"
                  ? "Os códigos de verificação serão enviados por e-mail."
                  : "Sem SMTP no .env: os códigos 2FA aparecerão no terminal do servidor."}
              </p>
            </StatCard>

            <StatCard icon={<TriangleAlert className="size-4" />} title="Farol de saúde financeira">
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
            <p className="text-muted-foreground">
              Rode <code className="font-mono">npm run db:setup</code> e recarregue a página.
            </p>
            <p className="mt-2 font-mono text-xs text-muted-foreground">{status.error}</p>
          </div>
        </section>
      )}
    </main>
  );
}

function StatCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-xs">
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
      <span className="font-medium">{value}</span>
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
