"use client";

import { ArrowDownLeft, ArrowUpRight, History, Landmark } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { formatDate } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";

/** Um item do extrato do mês: positivo = entrou, negativo = saiu. */
export type StatementItem = { key: string; date: string; description: string; amountCents: number };

function StatementDialog({
  items,
  carried,
  balance,
  monthLabel,
  onClose,
}: {
  items: StatementItem[];
  carried: number;
  balance: number;
  monthLabel: string;
  onClose: () => void;
}) {
  return (
    <Dialog open onClose={onClose} title={`Extrato de ${monthLabel}`} description="O que você marcou como recebido e pago neste mês.">
      <ul className="-mx-2 divide-y">
        <li className="flex items-center justify-between gap-3 px-2 py-2.5 text-sm">
          <span className="text-muted-foreground">Sobra dos meses anteriores</span>
          <span className={cn("font-semibold tabular-nums", carried < 0 && "text-danger")}>{formatBRL(carried)}</span>
        </li>
        {items.length === 0 ? (
          <li className="px-2 py-6 text-center text-sm text-muted-foreground">Nada marcado como recebido ou pago neste mês.</li>
        ) : (
          items.map((m) => {
            const income = m.amountCents > 0;
            return (
              <li key={m.key} className="flex items-center gap-3 px-2 py-2.5">
                <span
                  className={cn(
                    "inline-flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4",
                    income ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
                  )}
                >
                  {income ? <ArrowDownLeft /> : <ArrowUpRight />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.description}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(m.date)}</p>
                </div>
                <span className={cn("text-sm font-semibold tabular-nums", income ? "text-success" : "text-danger")}>
                  {income ? "+" : "−"} {formatBRL(Math.abs(m.amountCents))}
                </span>
              </li>
            );
          })
        )}
        <li className="flex items-center justify-between gap-3 px-2 py-3 text-sm font-semibold">
          <span>Saldo</span>
          <span className={cn("tabular-nums", balance < 0 && "text-danger")}>{formatBRL(balance)}</span>
        </li>
      </ul>
    </Dialog>
  );
}

/**
 * Card "Saldo em conta" da Visão geral. Calculado sozinho: o que foi marcado como
 * recebido − o que foi marcado como pago, com a sobra dos meses anteriores.
 */
export function BalanceCard({
  balance,
  carried,
  netWorth,
  reserve,
  debts,
  items,
  monthLabel,
}: {
  balance: number;
  carried: number;
  netWorth: number;
  reserve: number;
  debts: number;
  items: StatementItem[];
  monthLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const month = balance - carried;
  return (
    <div className="rounded-2xl border border-primary/25 bg-card p-5 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Saldo em conta</p>
        <span className="inline-flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground [&_svg]:size-4">
          <Landmark />
        </span>
      </div>
      <p className={cn("mt-2 text-2xl font-semibold tracking-tight tabular-nums", balance < 0 && "text-danger")}>{formatBRL(balance)}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {carried !== 0 && <>Sobra anterior {formatBRL(carried)} · </>}
        Neste mês {month >= 0 ? "+" : "−"} {formatBRL(Math.abs(month))}
      </p>
      <p
        className="mt-0.5 text-xs text-muted-foreground"
        title={`Saldo ${formatBRL(balance)} + caixinhas ${formatBRL(reserve)} − cartões a pagar ${formatBRL(debts)}`}
      >
        Patrimônio total: <strong className="font-medium text-foreground tabular-nums">{formatBRL(netWorth)}</strong>
      </p>
      <Button size="sm" variant="ghost" className="mt-2 -ml-2" onClick={() => setOpen(true)}>
        <History aria-hidden /> Ver extrato
      </Button>
      {open && <StatementDialog items={items} carried={carried} balance={balance} monthLabel={monthLabel} onClose={() => setOpen(false)} />}
    </div>
  );
}
