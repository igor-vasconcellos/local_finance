"use client";

import { ArrowDownLeft, ArrowUpRight, History, Landmark, Pencil, Scale } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, fieldControlProps } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { formatDate } from "@/lib/dates";
import { formatAmount, formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";
import { setBalanceAction } from "@/server/actions/ledger";
import { useCloseOnSuccess } from "./use-close-on-success";
import { useFormAction } from "./use-form-action";

export type Movement = {
  id: number;
  kind: string;
  date: string;
  amountCents: number;
  description: string;
  counted: boolean;
};

function AdjustDialog({ current, onClose }: { current: number | null; onClose: () => void }) {
  const { state, onSubmit, pending } = useFormAction(setBalanceAction);
  useCloseOnSuccess(state, onClose);
  const f = state.fields ?? {};
  const first = current === null;
  return (
    <Dialog
      open
      onClose={onClose}
      title={first ? "Informe seu saldo em conta" : "Ajustar saldo"}
      description={
        first
          ? "O valor que aparece hoje no app do banco. A partir dele, o saldo se atualiza sozinho a cada confirmação."
          : "Digite o valor que o banco mostra agora. O app lança só a diferença no extrato, como “Ajuste de saldo”."
      }
    >
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        {state.error && <Alert tone="danger">{state.error}</Alert>}
        <Field id="balance" label="Saldo real hoje" error={f.balance}>
          <MoneyInput
            {...fieldControlProps("balance", f.balance)}
            name="balance"
            defaultValue={current !== null ? formatAmount(Math.abs(current)) : ""}
            autoFocus
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="negative" defaultChecked={current !== null && current < 0} className="size-4 accent-[var(--primary)]" />
          Saldo negativo (cheque especial)
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" loading={pending}>
            Salvar saldo
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function StatementDialog({ movements, onClose }: { movements: Movement[]; onClose: () => void }) {
  return (
    <Dialog open onClose={onClose} title="Extrato da conta" description="Últimos lançamentos que formam o seu saldo.">
      {movements.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nenhum lançamento ainda.</p>
      ) : (
        <ul className="-mx-2 divide-y">
          {movements.map((m) => {
            const income = m.amountCents > 0;
            const neutral = m.kind === "opening" || m.kind === "adjustment";
            return (
              <li key={m.id} className={cn("flex items-center gap-3 px-2 py-2.5", !m.counted && "opacity-55")}>
                <span
                  className={cn(
                    "inline-flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4",
                    neutral ? "bg-muted text-muted-foreground" : income ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
                  )}
                >
                  {neutral ? <Scale /> : income ? <ArrowDownLeft /> : <ArrowUpRight />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(m.date)}
                    {!m.counted && " · não entra no saldo de hoje"}
                  </p>
                </div>
                <span className={cn("text-sm font-semibold tabular-nums", !neutral && (income ? "text-success" : "text-danger"))}>
                  {m.kind === "opening" ? formatBRL(m.amountCents) : `${income ? "+" : "−"} ${formatBRL(Math.abs(m.amountCents))}`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        Lançamentos com data anterior ao saldo inicial ou no futuro aparecem apagados: eles não mudam o saldo de hoje.
      </p>
    </Dialog>
  );
}

/** Card "Saldo em conta" da Visão geral: valor atualizado, ajuste e extrato sem sair da tela. */
export function BalanceCard({
  balance,
  netWorth,
  reserve,
  debts,
  movements,
  readOnly,
}: {
  balance: number | null;
  netWorth: number;
  reserve: number;
  debts: number;
  movements: Movement[];
  readOnly?: boolean;
}) {
  const [dialog, setDialog] = useState<"adjust" | "statement" | null>(null);
  const close = () => setDialog(null);
  return (
    <div className="rounded-2xl border border-primary/25 bg-card p-5 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Saldo em conta</p>
        <span className="inline-flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground [&_svg]:size-4">
          <Landmark />
        </span>
      </div>
      {balance === null ? (
        <>
          <p className="mt-2 text-sm text-muted-foreground">Informe quanto você tem na conta hoje para acompanhar o saldo.</p>
          {!readOnly && (
            <Button size="sm" className="mt-3" onClick={() => setDialog("adjust")}>
              Informar saldo
            </Button>
          )}
        </>
      ) : (
        <>
          <p className={cn("mt-2 text-2xl font-semibold tracking-tight tabular-nums", balance < 0 && "text-danger")}>
            {formatBRL(balance)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground" title={`Saldo ${formatBRL(balance)} + caixinhas ${formatBRL(reserve)} − cartões ${formatBRL(debts)}`}>
            Patrimônio total: <strong className="font-medium text-foreground tabular-nums">{formatBRL(netWorth)}</strong>
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {!readOnly && (
              <Button size="sm" variant="secondary" onClick={() => setDialog("adjust")}>
                <Pencil aria-hidden /> Ajustar
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setDialog("statement")}>
              <History aria-hidden /> Ver extrato
            </Button>
          </div>
        </>
      )}
      {dialog === "adjust" && <AdjustDialog current={balance} onClose={close} />}
      {dialog === "statement" && <StatementDialog movements={movements} onClose={close} />}
    </div>
  );
}
