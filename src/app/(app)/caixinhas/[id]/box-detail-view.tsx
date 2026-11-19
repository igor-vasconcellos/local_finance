"use client";

import { ArrowDownToLine, ArrowLeft, ArrowUpFromLine, History, Pencil, PiggyBank, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { BoxChart, type ChartPoint } from "@/components/finance/box-chart";
import { BoxForm } from "@/components/finance/box-form";
import { BoxTxForm } from "@/components/finance/box-tx-form";
import { GoalProgress } from "@/components/finance/goal-progress";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Dialog } from "@/components/ui/dialog";
import { IconButton } from "@/components/ui/icon-button";
import { Card } from "@/components/ui/page";
import type { BalancePoint } from "@/lib/cdi";
import { formatDate } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { annualToMonthlyPct, bpToPct, formatPct } from "@/lib/rates";
import { cn } from "@/lib/utils";
import { deleteBoxAction, deleteBoxTxAction } from "@/server/actions/boxes";
import type { getBoxDetail } from "@/server/finance/boxes";

type Box = NonNullable<Awaited<ReturnType<typeof getBoxDetail>>>;
type DialogState = { kind: "edit" } | { kind: "tx"; type: "deposit" | "withdrawal" } | null;

export function BoxDetailView({
  box,
  projection,
  projectionWithDeposit,
  institutions,
  today,
}: {
  box: Box;
  projection: BalancePoint[];
  projectionWithDeposit: boolean;
  institutions: string[];
  today: string;
}) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const close = useCallback(() => setDialog(null), []);
  const color = box.color ?? "#7c3aed";
  const pctLabel = formatPct(box.cdiPercentBp / 100, box.cdiPercentBp % 100 ? 1 : 0);
  const effectiveMonthly = annualToMonthlyPct(bpToPct(box.currentAnnualRateBp)) * (box.cdiPercentBp / 10000);

  // Une histórico (linha cheia) e projeção (tracejada), ligadas no ponto atual.
  const chart: ChartPoint[] = [
    ...box.history.map((p, i) => ({
      date: p.date,
      real: p.balanceCents,
      projected: i === box.history.length - 1 && projection.length ? p.balanceCents : undefined,
    })),
    ...projection.map((p) => ({ date: p.date, projected: p.balanceCents })),
  ];
  const projected12 = projection.at(-1)?.balanceCents;

  return (
    <>
      <Link
        href="/caixinhas"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> Caixinhas
      </Link>

      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <span
            className="inline-flex size-14 items-center justify-center rounded-2xl text-white shadow-sm"
            style={{ background: color }}
          >
            <PiggyBank className="size-7" aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{box.name}</h1>
            <p className="text-sm text-muted-foreground">
              {box.institutionName} · {pctLabel} do CDI · ≈ {formatPct(effectiveMonthly)} ao mês
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setDialog({ kind: "tx", type: "deposit" })}>
            <ArrowDownToLine aria-hidden /> Aportar
          </Button>
          <Button
            variant="secondary"
            onClick={() => setDialog({ kind: "tx", type: "withdrawal" })}
            disabled={box.balanceCents <= 0}
          >
            <ArrowUpFromLine aria-hidden /> Resgatar
          </Button>
          <Button variant="ghost" onClick={() => setDialog({ kind: "edit" })}>
            <Pencil aria-hidden /> Editar
          </Button>
          <ConfirmAction
            action={deleteBoxAction}
            fields={{ id: box.id }}
            title="Excluir caixinha?"
            description={`“${box.name}” e todo o histórico de aportes e resgates serão apagados. O dinheiro no banco não é afetado — isso só remove o controle aqui.`}
            confirmLabel="Excluir caixinha"
            trigger={(open) => (
              <Button variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger" onClick={open}>
                <Trash2 aria-hidden /> Excluir
              </Button>
            )}
          />
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Saldo atual" value={formatBRL(box.balanceCents)} strong />
        <Stat label="Total aportado" value={formatBRL(box.contributedCents)} hint="Aportes − resgates" />
        <Stat label="Rendimento acumulado" value={`+${formatBRL(box.yieldCents)}`} tone="success" />
        <Stat label="Previsto este mês" value={`+${formatBRL(box.monthYieldCents)}`} hint="Sobre o saldo atual" tone="success" />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="p-5">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">Evolução do saldo</h2>
            {projected12 !== undefined && (
              <p className="text-sm text-muted-foreground">
                Em 12 meses: <strong className="text-foreground tabular-nums">{formatBRL(projected12)}</strong>
                {projectionWithDeposit && " com os aportes da meta"}
              </p>
            )}
          </div>
          {chart.length ? (
            <BoxChart data={chart} color={color} />
          ) : (
            <p className="py-16 text-center text-sm text-muted-foreground">Faça o primeiro aporte para ver a evolução.</p>
          )}
          <p className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded" style={{ background: color }} /> Saldo
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: color }} /> Projeção com o CDI atual
            </span>
          </p>
        </Card>

        <Card className="h-fit p-5">
          <h2 className="mb-4 font-semibold">Meta</h2>
          {box.goal ? (
            <GoalProgress goal={box.goal} balanceCents={box.balanceCents} color={box.color} />
          ) : (
            <div className="grid gap-3 text-sm text-muted-foreground">
              <p>Sem meta definida. Defina um valor e uma data para o app calcular quanto guardar por mês.</p>
              <Button variant="secondary" size="sm" onClick={() => setDialog({ kind: "edit" })}>
                Definir meta
              </Button>
            </div>
          )}
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between gap-4 border-b px-5 py-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <History className="size-4 text-muted-foreground" aria-hidden /> Movimentações
          </h2>
          <span className="text-sm text-muted-foreground">{box.transactions.length}</span>
        </div>
        {box.transactions.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Nenhuma movimentação ainda. Já tem dinheiro nessa caixinha? Registre o saldo atual como primeiro aporte.
            </p>
            <Button size="sm" onClick={() => setDialog({ kind: "tx", type: "deposit" })}>
              <ArrowDownToLine aria-hidden /> Registrar aporte
            </Button>
          </div>
        ) : (
          <ul className="divide-y">
            {box.transactions.map((t) => (
              <li key={t.id} className="flex items-center gap-4 px-5 py-3">
                <span
                  className={cn(
                    "inline-flex size-9 shrink-0 items-center justify-center rounded-xl [&_svg]:size-4",
                    t.type === "deposit" ? "bg-success-soft text-success" : "bg-warning-soft text-warning",
                  )}
                >
                  {t.type === "deposit" ? <ArrowDownToLine aria-hidden /> : <ArrowUpFromLine aria-hidden />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {t.type === "deposit" ? "Aporte" : "Resgate"}
                    {t.notes && <span className="font-normal text-muted-foreground"> · {t.notes}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatDate(t.date)}</p>
                </div>
                <p className={cn("text-sm font-semibold tabular-nums", t.type === "deposit" ? "text-success" : "")}>
                  {t.type === "deposit" ? "+" : "−"}
                  {formatBRL(t.amountCents)}
                </p>
                <ConfirmAction
                  action={deleteBoxTxAction}
                  fields={{ id: t.id }}
                  title={`Excluir ${t.type === "deposit" ? "aporte" : "resgate"}?`}
                  description={`${t.type === "deposit" ? "Aporte" : "Resgate"} de ${formatBRL(t.amountCents)} em ${formatDate(t.date)}. O saldo e o rendimento serão recalculados.`}
                  trigger={(open) => (
                    <IconButton label="Excluir movimentação" tone="danger" onClick={open}>
                      <Trash2 />
                    </IconButton>
                  )}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="mt-6 text-xs text-muted-foreground">
        Rendimento bruto estimado: capitalização diária em dias úteis (seg–sex, base 252), usando o histórico de CDI das
        Configurações. Pode diferir alguns centavos do banco (feriados, IR e IOF não são considerados).
      </p>

      <Dialog
        open={dialog !== null}
        onClose={close}
        title={
          dialog?.kind === "edit"
            ? "Editar caixinha"
            : dialog?.kind === "tx" && dialog.type === "withdrawal"
              ? "Resgatar"
              : "Aportar"
        }
      >
        {dialog?.kind === "edit" && (
          <BoxForm
            box={{
              id: box.id,
              name: box.name,
              institutionName: box.institutionName,
              cdiPercentBp: box.cdiPercentBp,
              goalCents: box.goalCentsRaw,
              goalDate: box.goalDateRaw,
              color: box.color,
            }}
            institutions={institutions}
            onDone={close}
          />
        )}
        {dialog?.kind === "tx" && (
          <BoxTxForm
            boxId={box.id}
            initialType={dialog.type}
            balanceCents={box.balanceCents}
            suggestedDepositCents={box.goal && !box.goal.reached ? box.goal.monthlyDepositCents : null}
            today={today}
            onDone={close}
          />
        )}
      </Dialog>
    </>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
  strong,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "success";
  strong?: boolean;
}) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-xs">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 font-semibold tracking-tight tabular-nums",
          strong ? "text-2xl" : "text-xl",
          tone === "success" && "text-success",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
