import type { Metadata } from "next";
import {
  ArrowDownCircle,
  ArrowRight,
  ArrowUpCircle,
  CalendarClock,
  CircleDollarSign,
  CreditCard,
  Landmark,
  PiggyBank,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { CheckButton } from "@/components/finance/check-button";
import { HealthBadge } from "@/components/finance/health-badge";
import { InvoiceStatusBadge } from "@/components/finance/invoice-status";
import { MonthNav } from "@/components/finance/month-nav";
import { Card, PageHeader } from "@/components/ui/page";
import { currentMonth, formatDate, formatDayMonth, formatMonthLong, todayISO } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { formatPct } from "@/lib/rates";
import { cn } from "@/lib/utils";
import { setInvoicePaidAction } from "@/server/actions/cards";
import { toggleSettlementAction } from "@/server/actions/overview";
import { requireSession } from "@/server/auth/current";
import { getCategoryReport, getMonthOverview } from "@/server/finance/overview";

export const metadata: Metadata = { title: "Visão geral" };

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const { user } = await requireSession();
  const today = todayISO();
  const current = currentMonth();
  const requested = (await searchParams).mes;
  const month = typeof requested === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) ? requested : current;

  const o = getMonthOverview(month, today);
  const report = getCategoryReport(month);
  const t = o.totals;
  const freePct = t.totalIncome > 0 ? (t.forecast / t.totalIncome) * 100 : null;
  const monthLabel = formatMonthLong(month).toLowerCase();
  const hasOverdue = o.payables.some((p) => p.overdue);

  return (
    <>
      <PageHeader
        title={`Olá, ${user.name.split(" ")[0]}!`}
        description={month === current ? "Este é o resumo do seu mês." : `Resumo de ${monthLabel}.`}
        actions={<MonthNav month={month} current={current} basePath="/dashboard" />}
      />

      {/* Previsão do mês */}
      <Card className="mb-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">Previsão do mês</p>
              {(t.totalIncome > 0 || t.toPay + t.paid > 0) && <HealthBadge health={o.health} />}
            </div>
            <p className={cn("mt-1 text-4xl font-semibold tracking-tight tabular-nums", t.forecast < 0 && "text-danger")}>
              {formatBRL(t.forecast)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {freePct !== null
                ? `${formatPct(freePct, 1)} da renda do mês fica livre`
                : "Cadastre suas rendas para acompanhar a saúde financeira"}
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-4">
            <Formula label="Realizado" value={t.realized} sign="" />
            <Formula label="A receber" value={t.toReceive} sign="+" />
            <Formula label="A pagar" value={t.toPay} sign="−" />
            <Formula label="Metas" value={t.goals} sign="−" hint="Etapa 4" />
          </dl>
        </div>
      </Card>

      {/* Indicadores */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi label="Total recebido" value={t.received} icon={<ArrowDownCircle />} tone="success" hint={`de ${formatBRL(t.totalIncome)} previstos`} />
        <Kpi label="Despesas pagas" value={t.paid} icon={<ArrowUpCircle />} tone="danger" hint={`de ${formatBRL(t.paid + t.toPay)} no mês`} />
        <Kpi label="A receber" value={t.toReceive} icon={<CalendarClock />} hint={plural(o.incomes.filter((i) => !i.settled).length, "entrada pendente", "entradas pendentes")} />
        <Kpi label="A pagar" value={t.toPay} icon={<CircleDollarSign />} hint={plural(o.payables.length, "conta pendente", "contas pendentes")} />
        <Kpi label="Reserva (cofrinho)" value={t.reserve} icon={<PiggyBank />} tone="primary" hint="Total nas caixinhas hoje" />
        <Kpi
          label="Patrimônio líquido"
          value={t.netWorth}
          icon={<Landmark />}
          tone="primary"
          hint={
            o.accountBalance.cents === null ? (
              <Link href="/configuracoes#saldo" className="text-primary hover:underline">
                Informe o saldo em conta →
              </Link>
            ) : (
              `Conta + reserva − ${formatBRL(t.debts)} a pagar nos cartões`
            )
          }
        />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        {/* Próximos vencimentos */}
        <Card>
          <SectionHeader icon={<CalendarClock />} title="Próximos vencimentos" aside={formatBRL(t.toPay)} />
          {o.payables.length === 0 ? (
            <Empty>Nenhuma conta pendente em {monthLabel}.</Empty>
          ) : (
            <ul className="divide-y">
              {o.payables.map((p) => (
                <li key={`${p.kind}-${p.kind === "invoice" ? p.cardId : p.id}`} className="flex items-center gap-3 px-5 py-3">
                  <DateChip date={p.date} overdue={p.overdue} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.kind === "invoice" ? `Fatura ${p.cardName}` : p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.overdue ? (
                        <span className="font-medium text-danger">Venceu em {formatDate(p.date)}</span>
                      ) : p.kind === "invoice" ? (
                        "Cartão de crédito"
                      ) : (
                        p.categoryName
                      )}
                    </p>
                  </div>
                  <p className="text-sm font-semibold tabular-nums">{formatBRL(p.kind === "invoice" ? p.totalCents : p.amountCents)}</p>
                  {p.kind === "invoice" ? (
                    <InvoiceForm cardId={p.cardId} month={month} paid={false} label="Pagar" />
                  ) : (
                    <SettleForm kind="expense" id={p.id} month={month} settled={false} label="Pagar" />
                  )}
                </li>
              ))}
            </ul>
          )}
          {o.paidItems.length > 0 && (
            <details className="group border-t">
              <summary className="cursor-pointer list-none px-5 py-3 text-sm text-muted-foreground hover:text-foreground">
                <span className="group-open:hidden">Ver {plural(o.paidItems.length, "conta paga", "contas pagas")} neste mês</span>
                <span className="hidden group-open:inline">Ocultar contas pagas</span>
              </summary>
              <ul className="divide-y border-t">
                {o.paidItems.map((p) => (
                  <li key={`${p.kind}-${p.id}`} className="flex items-center gap-3 px-5 py-2.5 text-sm text-muted-foreground">
                    <span className="w-12 text-xs tabular-nums">{formatDayMonth(p.date)}</span>
                    <span className="min-w-0 flex-1 truncate line-through decoration-muted-foreground/50">{p.name}</span>
                    <span className="tabular-nums">{formatBRL(p.amountCents)}</span>
                    {p.kind === "invoice" ? (
                      <InvoiceForm cardId={p.id} month={month} paid label="Desfazer" />
                    ) : (
                      <SettleForm kind="expense" id={p.id} month={month} settled label="Desfazer" />
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Card>

        {/* Entradas */}
        <Card>
          <SectionHeader icon={<Wallet />} title="Entradas do mês" aside={formatBRL(t.totalIncome)} />
          {o.incomes.length === 0 ? (
            <Empty>
              Nenhuma renda prevista para {monthLabel}.{" "}
              <Link href="/rendas" className="text-primary hover:underline">
                Cadastrar renda
              </Link>
            </Empty>
          ) : (
            <ul className="divide-y">
              {o.incomes.map((i) => (
                <li key={i.id} className={cn("flex items-center gap-3 px-5 py-3", i.settled && "text-muted-foreground")}>
                  <DateChip date={i.date} />
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate text-sm font-medium", i.settled && "line-through decoration-muted-foreground/50")}>{i.name}</p>
                    <p className="text-xs text-muted-foreground">{i.settled ? "Recebido" : "A receber"}</p>
                  </div>
                  <p className={cn("text-sm font-semibold tabular-nums", !i.settled && "text-success")}>{formatBRL(i.amountCents)}</p>
                  <SettleForm kind="income" id={i.id} month={month} settled={i.settled} label={i.settled ? "Desfazer" : "Recebi"} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Faturas */}
        <Card>
          <SectionHeader icon={<CreditCard />} title={`Faturas de ${monthLabel}`} aside={formatBRL(o.cardInvoices.reduce((a, i) => a + i.totalCents, 0))} />
          {o.cardInvoices.length === 0 ? (
            <Empty>Nenhuma fatura com lançamentos neste mês.</Empty>
          ) : (
            <ul className="divide-y">
              {o.cardInvoices.map((i) => (
                <li key={i.cardId}>
                  <Link href={`/cartoes/${i.cardId}?fatura=${i.referenceMonth}`} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/50">
                    <span className="size-3 shrink-0 rounded-full" style={{ background: i.cardColor ?? "var(--primary)" }} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{i.cardName}</p>
                      <p className="text-xs text-muted-foreground">Vence {formatDate(i.dueDate)}</p>
                    </div>
                    <InvoiceStatusBadge status={i.status} />
                    <p className="w-28 text-right text-sm font-semibold tabular-nums">{formatBRL(i.totalCents)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Gastos por categoria */}
        <Card>
          <SectionHeader
            icon={<CircleDollarSign />}
            title="Gastos por categoria"
            aside={
              report.rows.length > 0 ? (
                <Link
                  href={`/relatorios${month === current ? "" : `?mes=${month}`}`}
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  Ver relatório <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              ) : undefined
            }
          />
          {report.rows.length === 0 ? (
            <Empty>Nenhum gasto em {monthLabel}.</Empty>
          ) : (
            <ul className="grid gap-3 px-5 py-4">
              {report.rows.slice(0, 6).map((r) => {
                const pct = Math.round((r.totalCents / report.totalCents) * 100);
                return (
                  <li key={r.name} className="grid gap-1.5">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="size-2 shrink-0 rounded-full" style={{ background: r.color ?? "var(--muted-foreground)" }} aria-hidden />
                        <span className="truncate">{r.name}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {formatBRL(r.totalCents)} · {pct}%
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="presentation">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: r.color ?? "var(--muted-foreground)" }} />
                    </div>
                  </li>
                );
              })}
              {report.rows.length > 6 && (
                <li className="text-xs text-muted-foreground">+ {report.rows.length - 6} categoria(s) no relatório completo</li>
              )}
            </ul>
          )}
        </Card>
      </div>

      {(month !== current || hasOverdue) && (
        <p className="mt-6 text-xs text-muted-foreground">
          Reserva e patrimônio líquido mostram sempre a posição de hoje.
          {hasOverdue && " Contas com a data em vermelho já venceram: marque como pagas quando quitar."}
        </p>
      )}
    </>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function Formula({ label, value, sign, hint }: { label: string; value: number; sign: string; hint?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">
        {label}
        {hint && <span className="ml-1 opacity-70">({hint})</span>}
      </dt>
      <dd className="font-medium tabular-nums">
        {sign && <span className="mr-0.5 text-muted-foreground">{sign}</span>}
        {formatBRL(value)}
      </dd>
    </div>
  );
}

function Kpi({
  label,
  value,
  icon,
  hint,
  tone,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  hint?: ReactNode;
  tone?: "success" | "danger" | "primary";
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
      <p className={cn("mt-2 text-2xl font-semibold tracking-tight tabular-nums", value < 0 && "text-danger")}>{formatBRL(value)}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SectionHeader({ icon, title, aside }: { icon: ReactNode; title: string; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
      <h2 className="flex items-center gap-2 font-semibold [&_svg]:size-4 [&_svg]:text-muted-foreground">
        {icon}
        {title}
      </h2>
      {aside && <span className="shrink-0 text-sm font-medium whitespace-nowrap tabular-nums text-muted-foreground">{aside}</span>}
    </div>
  );
}

function DateChip({ date, overdue }: { date: string; overdue?: boolean }) {
  const [, m, d] = date.split("-");
  return (
    <span
      className={cn(
        "flex size-10 shrink-0 flex-col items-center justify-center rounded-xl bg-muted leading-none",
        overdue && "bg-danger-soft text-danger",
      )}
    >
      <span className="text-sm font-semibold tabular-nums">{d}</span>
      <span className="text-[10px] opacity-70">/{m}</span>
    </span>
  );
}

function SettleForm({
  kind,
  id,
  month,
  settled,
  label,
}: {
  kind: "income" | "expense";
  id: number;
  month: string;
  settled: boolean;
  label: string;
}) {
  return (
    <form action={toggleSettlementAction}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="month" value={month} />
      <input type="hidden" name="settled" value={String(!settled)} />
      <CheckButton done={settled} label={label} />
    </form>
  );
}

function InvoiceForm({ cardId, month, paid, label }: { cardId: number; month: string; paid: boolean; label: string }) {
  return (
    <form action={setInvoicePaidAction}>
      <input type="hidden" name="cardId" value={cardId} />
      <input type="hidden" name="month" value={month} />
      <input type="hidden" name="paid" value={String(!paid)} />
      <CheckButton done={paid} label={label} />
    </form>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-5 py-10 text-center text-sm text-muted-foreground">{children}</p>;
}
