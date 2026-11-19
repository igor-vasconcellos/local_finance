import type { Metadata } from "next";
import { ChevronDown, FileBarChart } from "lucide-react";
import { MonthNav } from "@/components/finance/month-nav";
import { Badge } from "@/components/ui/badge";
import { Card, EmptyState, PageHeader } from "@/components/ui/page";
import { currentMonth, formatMonthLong } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { formatPct } from "@/lib/rates";
import { getCategoryReport } from "@/server/finance/overview";
import { requireUserId } from "@/server/auth/current";

export const metadata: Metadata = { title: "Relatório por categoria" };

const SOURCE_LABEL = { fixo: "Gasto fixo", "cartão": "Cartão", avulso: "Avulso" } as const;

export default async function ReportPage({ searchParams }: PageProps<"/relatorios">) {
  const uid = await requireUserId();
  const current = currentMonth();
  const requested = (await searchParams).mes;
  const month = typeof requested === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) ? requested : current;
  const { rows, totalCents } = getCategoryReport(uid, month);
  // Créditos/estornos entram negativos: a participação é calculada sobre os gastos brutos.
  const grossCents = rows.filter((r) => r.totalCents > 0).reduce((a, r) => a + r.totalCents, 0) || 1;
  const bySource = (s: keyof typeof SOURCE_LABEL) =>
    rows.flatMap((r) => r.items).filter((i) => i.source === s).reduce((a, i) => a + i.amountCents, 0);

  return (
    <>
      <PageHeader
        title="Gastos por categoria"
        description={`Todas as saídas de ${formatMonthLong(month).toLowerCase()}: gastos fixos, parcelas das faturas que vencem no mês e gastos avulsos.`}
        actions={<MonthNav month={month} current={current} basePath="/relatorios" />}
      />

      {rows.length === 0 ? (
        <EmptyState icon={<FileBarChart />} title="Nenhum gasto neste mês" description="Navegue para outro mês ou cadastre gastos fixos e compras no cartão." />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-4">
            <Summary label="Total de saídas" value={formatBRL(totalCents)} strong />
            <Summary label="Gastos fixos" value={formatBRL(bySource("fixo"))} />
            <Summary label="Cartões" value={formatBRL(bySource("cartão"))} />
            <Summary label="Avulsos" value={formatBRL(bySource("avulso"))} />
          </div>

          {/* Barra empilhada com a participação de cada categoria */}
          <Card className="mb-6 p-5">
            <div className="flex h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label="Participação de cada categoria no total">
              {rows.filter((r) => r.totalCents > 0).map((r) => (
                <div
                  key={r.name}
                  title={`${r.name}: ${formatPct((r.totalCents / grossCents) * 100, 1)}`}
                  style={{ width: `${(r.totalCents / grossCents) * 100}%`, background: r.color ?? "var(--muted-foreground)" }}
                />
              ))}
            </div>
          </Card>

          <Card>
            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b px-5 py-3 text-xs font-medium text-muted-foreground uppercase">
              <span>Categoria</span>
              <span className="w-16 text-right">%</span>
              <span className="w-28 text-right">Valor</span>
            </div>
            <ul className="divide-y">
              {rows.map((r) => {
                const pct = (r.totalCents / grossCents) * 100;
                return (
                  <li key={r.name}>
                    <details className="group">
                      <summary className="grid cursor-pointer list-none grid-cols-[1fr_auto_auto] items-center gap-4 px-5 py-3.5 hover:bg-muted/40">
                        <span className="flex min-w-0 items-center gap-3">
                          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
                          <span className="size-2.5 shrink-0 rounded-full" style={{ background: r.color ?? "var(--muted-foreground)" }} aria-hidden />
                          <span className="truncate font-medium">{r.name}</span>
                          <span className="text-xs text-muted-foreground">{r.items.length}</span>
                        </span>
                        <span className="w-16 text-right text-sm tabular-nums text-muted-foreground">{pct > 0 ? formatPct(pct, 1) : "—"}</span>
                        <span className="w-28 text-right font-semibold tabular-nums">{formatBRL(r.totalCents)}</span>
                      </summary>
                      <ul className="border-t bg-muted/25">
                        {r.items.map((it, i) => (
                          <li key={i} className="grid grid-cols-[1fr_auto] items-center gap-4 py-2.5 pr-5 pl-14 text-sm">
                            <span className="min-w-0">
                              <span className="block truncate">{it.label}</span>
                              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Badge tone={it.source === "fixo" ? "neutral" : it.source === "cartão" ? "primary" : "warning"}>
                                  {SOURCE_LABEL[it.source]}
                                </Badge>
                                {it.detail}
                              </span>
                            </span>
                            <span className="w-28 text-right tabular-nums">{formatBRL(it.amountCents)}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </li>
                );
              })}
            </ul>
            <div className="grid grid-cols-[1fr_auto] gap-4 border-t px-5 py-4 font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatBRL(totalCents)}</span>
            </div>
          </Card>
        </>
      )}
    </>
  );
}

function Summary({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-xs">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={strong ? "mt-1 text-xl font-semibold tabular-nums" : "mt-1 text-lg font-medium tabular-nums"}>{value}</p>
    </div>
  );
}
