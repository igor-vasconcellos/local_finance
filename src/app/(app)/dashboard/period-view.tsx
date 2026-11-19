import { ArrowDownCircle, ArrowUpCircle, FlaskConical, PiggyBank, TriangleAlert, Wallet } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { CashflowChart } from "@/components/finance/cashflow-chart";
import { dashboardHref, type DashboardState } from "@/components/finance/dashboard-controls";
import { HealthBadge } from "@/components/finance/health-badge";
import { Card } from "@/components/ui/page";
import { formatMonthShort, type ISODate } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { formatPct } from "@/lib/rates";
import { cn } from "@/lib/utils";
import { projectMonths } from "@/server/finance/projection";

/** Visão semestral/anual: fluxo de caixa previsto, gráfico e tabela lado a lado. */
export function PeriodView({ state, length, today }: { state: DashboardState; length: number; today: ISODate }) {
  const { months, thresholds } = projectMonths(state.start, length, today);
  const sim = state.sim;

  const rows = months.map((m) => {
    const outflow = m.fixedCents + m.invoicesCents + m.oneTimeCents;
    const free = sim ? m.freeCents : m.freeRealCents;
    return { ...m, outflow, free, shownHealth: sim ? m.health : m.healthReal };
  });

  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + f(r), 0);
  const income = sum((r) => r.incomeCents);
  const outflow = sum((r) => r.outflow);
  const goals = sum((r) => r.goalsCents);
  const simulated = sum((r) => r.simulatedCents);
  const free = sum((r) => r.free);
  const alertMonths = rows.filter((r) => r.shownHealth !== "green");
  const changed = sim ? rows.filter((r) => r.health !== r.healthReal) : [];

  return (
    <>
      {sim && (
        <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-primary/40 bg-accent/40 px-4 py-3 text-sm">
          <FlaskConical className="size-4 text-accent-foreground" aria-hidden />
          <span>
            <strong>Cenário simulado:</strong>{" "}
            {simulated
              ? `${formatBRL(simulated)} em simulações no período${changed.length ? ` · o farol muda em ${changed.length} mês(es)` : " · nenhum mês muda de cor"}.`
              : "nenhuma simulação marcada cai neste período."}
          </span>
          <Link href="/simulador" className="ml-auto font-medium text-primary hover:underline">
            Abrir simulador →
          </Link>
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Entradas previstas" value={formatBRL(income)} icon={<ArrowDownCircle />} tone="success" />
        <Kpi label="Saídas previstas" value={formatBRL(outflow + (sim ? simulated : 0))} icon={<ArrowUpCircle />} tone="danger" hint={sim && simulated ? `inclui ${formatBRL(simulated)} simulados` : "Fixos + faturas + avulsos"} />
        <Kpi label="Guardado em metas" value={formatBRL(goals)} icon={<PiggyBank />} tone="primary" />
        <Kpi
          label="Saldo livre no período"
          value={formatBRL(free)}
          icon={<Wallet />}
          valueClass={free < 0 ? "text-danger" : undefined}
          hint={income > 0 ? `${formatPct((free / income) * 100, 1)} das entradas` : undefined}
        />
      </div>

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="min-w-0 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Fluxo de caixa previsto</h2>
            {alertMonths.length > 0 ? (
              <span className="flex items-center gap-1.5 text-sm text-warning">
                <TriangleAlert className="size-4" aria-hidden /> {alertMonths.length} mês(es) em alerta
              </span>
            ) : (
              <span className="text-sm text-success">Todos os meses saudáveis</span>
            )}
          </div>
          <CashflowChart
            showSimulated={sim}
            data={rows.map((r) => ({
              month: r.month,
              income: r.incomeCents,
              outflow: r.outflow + r.goalsCents + (sim ? r.simulatedCents : 0),
              free: r.freeRealCents,
              freeSimulated: sim ? r.freeCents : undefined,
            }))}
          />
          <p className="mt-2 text-xs text-muted-foreground">Saídas no gráfico incluem metas{sim ? " e simulações" : ""}.</p>
        </Card>

        <Card className="min-w-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground uppercase">
                  <th className="px-5 py-3 font-medium">Mês</th>
                  <th className="hidden px-3 py-3 text-right font-medium sm:table-cell">Entradas</th>
                  <th className="hidden px-3 py-3 text-right font-medium sm:table-cell">Saídas</th>
                  <th className="hidden px-3 py-3 text-right font-medium md:table-cell">Metas</th>
                  {sim && <th className="hidden px-3 py-3 text-right font-medium sm:table-cell">Simulações</th>}
                  <th className="px-3 py-3 text-right font-medium">Livre</th>
                  <th className="py-3 pr-5 pl-3 font-medium">Farol</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.month} className={cn(r.month === state.current && "bg-accent/30")}>
                    <td className="px-5 py-2.5 font-medium">
                      <Link
                        href={dashboardHref(state, { view: "mensal", start: r.month })}
                        className="capitalize hover:text-primary hover:underline"
                        title="Abrir visão mensal"
                      >
                        {formatMonthShort(r.month)}
                      </Link>
                    </td>
                    <td className="hidden px-3 py-2.5 text-right tabular-nums text-success sm:table-cell">{formatBRL(r.incomeCents)}</td>
                    <td className="hidden px-3 py-2.5 text-right tabular-nums sm:table-cell">{formatBRL(r.outflow)}</td>
                    <td className="hidden px-3 py-2.5 text-right tabular-nums text-muted-foreground md:table-cell">{formatBRL(r.goalsCents)}</td>
                    {sim && <td className="hidden px-3 py-2.5 text-right tabular-nums text-accent-foreground sm:table-cell">{r.simulatedCents ? `−${formatBRL(r.simulatedCents)}` : "—"}</td>}
                    <td className={cn("px-3 py-2.5 text-right font-semibold tabular-nums", r.free < 0 && "text-danger")}>{formatBRL(r.free)}</td>
                    <td className="py-2.5 pr-5 pl-3">
                      <HealthBadge health={r.shownHealth} compactOnMobile />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/40 font-semibold">
                  <td className="px-5 py-3">Total</td>
                  <td className="hidden px-3 py-3 text-right tabular-nums sm:table-cell">{formatBRL(income)}</td>
                  <td className="hidden px-3 py-3 text-right tabular-nums sm:table-cell">{formatBRL(outflow)}</td>
                  <td className="hidden px-3 py-3 text-right tabular-nums md:table-cell">{formatBRL(goals)}</td>
                  {sim && <td className="hidden px-3 py-3 text-right tabular-nums sm:table-cell">{simulated ? `−${formatBRL(simulated)}` : "—"}</td>}
                  <td className={cn("px-3 py-3 text-right tabular-nums", free < 0 && "text-danger")}>{formatBRL(free)}</td>
                  <td className="py-3 pr-5 pl-3" />
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="border-t px-5 py-3 text-xs text-muted-foreground">
            Valores previstos (rendas e gastos cadastrados + faturas). Clique no mês para ver os detalhes. Farol: verde acima de{" "}
            {formatPct(thresholds.greenBp / 100, 0)} da renda livre, amarelo a partir de {formatPct(thresholds.yellowBp / 100, 0)}.
          </p>
        </Card>
      </div>
    </>
  );
}

function Kpi({
  label,
  value,
  icon,
  hint,
  tone,
  valueClass,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  hint?: string;
  tone?: "success" | "danger" | "primary";
  valueClass?: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span
          className={cn(
            "inline-flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4",
            tone === "success" && "bg-success-soft text-success",
            tone === "danger" && "bg-danger-soft text-danger",
            tone === "primary" && "bg-accent text-accent-foreground",
          )}
        >
          {icon}
        </span>
      </div>
      <p className={cn("mt-2 text-2xl font-semibold tracking-tight tabular-nums", valueClass)}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
