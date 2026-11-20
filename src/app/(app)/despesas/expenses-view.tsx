"use client";

import { Pause, Pencil, Play, Plus, Receipt, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { CategoryLabel } from "@/components/finance/category-dot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Dialog } from "@/components/ui/dialog";
import { IconButton } from "@/components/ui/icon-button";
import { Card, EmptyState } from "@/components/ui/page";
import { formatMonthShort, type Month } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";
import { deleteExpenseAction, toggleExpenseAction } from "@/server/actions/expenses";
import type { CategoryOption } from "@/server/finance/categories";
import type { ExpenseRow } from "@/server/finance/expenses";
import { ExpenseForm } from "./expense-form";

type Props = { expenses: ExpenseRow[]; categories: CategoryOption[]; defaultMonth: Month; today: string };

export function ExpensesView({ expenses, categories, defaultMonth, today }: Props) {
  const [editing, setEditing] = useState<ExpenseRow | "new" | null>(null);
  const close = useCallback(() => setEditing(null), []);

  const newButton = (
    <Button onClick={() => setEditing("new")}>
      <Plus aria-hidden /> Nova despesa
    </Button>
  );

  return (
    <div className="min-w-0">
      {expenses.length === 0 ? (
        <EmptyState
          icon={<Receipt />}
          title="Nenhuma despesa fixa cadastrada"
          description="Cadastre aluguel, contas de consumo e assinaturas para enxergar seu custo de vida mensal. Para uma despesa que acontece uma vez só, escolha “Só uma vez” na repetição."
          action={newButton}
        />
      ) : (
        <Card>
          <div className="flex items-center justify-between gap-4 border-b px-5 py-4">
            <h2 className="font-semibold">Suas despesas fixas</h2>
            {newButton}
          </div>
          <ul className="divide-y">
            {expenses.map((e) => {
              const ended = Boolean(e.endMonth && e.endMonth < defaultMonth);
              const notStarted = e.startMonth > defaultMonth;
              return (
                <li key={e.id} className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4", (!e.active || ended) && "opacity-60")}>
                  <div className="flex size-10 shrink-0 flex-col items-center justify-center rounded-xl bg-muted leading-none">
                    <span className="text-[10px] text-muted-foreground uppercase">dia</span>
                    <span className="text-sm font-semibold tabular-nums">{e.dueDay}</span>
                  </div>
                  <div className="min-w-0 flex-1 basis-[calc(100%-4rem)] sm:basis-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium">{e.name}</p>
                      {!e.active && <Badge>Pausado</Badge>}
                      {e.active && ended && <Badge>Encerrado</Badge>}
                      {e.active && notStarted && <Badge tone="primary">Começa em {formatMonthShort(e.startMonth)}</Badge>}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <CategoryLabel name={e.categoryName} color={e.categoryColor} />
                      <span>
                        desde {formatMonthShort(e.startMonth)}
                        {e.endMonth ? ` até ${formatMonthShort(e.endMonth)}` : " · todo mês, sem fim"}
                      </span>
                    </div>
                  </div>
                  <p className="ml-auto font-semibold tabular-nums sm:ml-0">{formatBRL(e.amountCents)}</p>
                  <div className="flex items-center gap-0.5">
                    <IconButton label="Editar" onClick={() => setEditing(e)}>
                      <Pencil />
                    </IconButton>
                    <form action={toggleExpenseAction}>
                      <input type="hidden" name="id" value={e.id} />
                      <input type="hidden" name="active" value={String(!e.active)} />
                      <IconButton type="submit" label={e.active ? "Pausar" : "Reativar"}>
                        {e.active ? <Pause /> : <Play />}
                      </IconButton>
                    </form>
                    <ConfirmAction
                      action={deleteExpenseAction}
                      fields={{ id: e.id }}
                      title="Excluir despesa fixa?"
                      description={`“${e.name}” será removida de todos os meses (inclusive dos pagamentos já marcados). Se a despesa só acabou, edite e escolha “Todo mês até…”.`}
                      trigger={(open) => (
                        <IconButton label="Excluir" tone="danger" onClick={open}>
                          <Trash2 />
                        </IconButton>
                      )}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Dialog open={editing !== null} onClose={close} title={editing === "new" ? "Nova despesa" : "Editar despesa fixa"}>
        {editing !== null && (
          <ExpenseForm
            expense={editing === "new" ? undefined : editing}
            categories={categories}
            defaultMonth={defaultMonth}
            today={today}
            onDone={close}
          />
        )}
      </Dialog>
    </div>
  );
}
