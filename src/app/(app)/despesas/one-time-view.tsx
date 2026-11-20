"use client";

import { Check, Pencil, Plus, Receipt, RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { CategoryLabel } from "@/components/finance/category-dot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Dialog } from "@/components/ui/dialog";
import { IconButton } from "@/components/ui/icon-button";
import { Card, EmptyState } from "@/components/ui/page";
import { formatDate, formatMonthLong, type Month } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";
import { deleteOneTimeAction, setOneTimePaidAction } from "@/server/actions/expenses";
import type { CategoryOption } from "@/server/finance/categories";
import type { OneTimeRow } from "@/server/finance/one-time";
import { ExpenseForm } from "./expense-form";

/** Despesas avulsas do mês: cadastrar, editar, marcar como paga e excluir. */
export function OneTimeView({
  items,
  categories,
  month,
  today,
}: {
  items: OneTimeRow[];
  categories: CategoryOption[];
  month: Month;
  today: string;
}) {
  const [editing, setEditing] = useState<OneTimeRow | "new" | null>(null);
  const close = useCallback(() => setEditing(null), []);
  const newButton = (
    <Button onClick={() => setEditing("new")}>
      <Plus aria-hidden /> Nova despesa avulsa
    </Button>
  );

  return (
    <>
      {items.length === 0 ? (
        <EmptyState
          icon={<Receipt />}
          title={`Nenhuma despesa avulsa em ${formatMonthLong(month).toLowerCase()}`}
          description="Cadastre despesas que acontecem uma vez só. Elas aparecem em Próximos vencimentos até você marcar como paga."
          action={newButton}
        />
      ) : (
        <Card>
          <div className="flex items-center justify-between gap-4 border-b px-5 py-4">
            <h2 className="font-semibold">Despesas avulsas</h2>
            {newButton}
          </div>
          <ul className="divide-y">
            {items.map((i) => {
              const paid = i.paidAt != null;
              const overdue = !paid && i.date < today;
              return (
                <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
                  <span className="w-20 text-xs text-muted-foreground tabular-nums">{formatDate(i.date)}</span>
                  <div className="min-w-0 flex-1 basis-[calc(100%-6rem)] sm:basis-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium">{i.description}</p>
                      {paid ? (
                        <Badge tone="success" dot>
                          Paga
                        </Badge>
                      ) : overdue ? (
                        <Badge tone="danger" dot>
                          Vencida
                        </Badge>
                      ) : (
                        <Badge tone="warning" dot>
                          A pagar
                        </Badge>
                      )}
                      {i.fromSimulation && <Badge tone="primary">Do simulador</Badge>}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      <CategoryLabel name={i.categoryName} color={i.categoryColor} />
                    </div>
                  </div>
                  <p className={cn("ml-auto font-semibold tabular-nums sm:ml-0", paid && "text-muted-foreground")}>
                    {formatBRL(i.amountCents)}
                  </p>
                  <div className="flex items-center gap-0.5">
                    <form action={setOneTimePaidAction}>
                      <input type="hidden" name="id" value={i.id} />
                      <input type="hidden" name="paid" value={String(!paid)} />
                      {paid ? (
                        <IconButton type="submit" label="Desfazer pagamento">
                          <RotateCcw />
                        </IconButton>
                      ) : (
                        <Button type="submit" size="sm" variant="secondary">
                          <Check aria-hidden /> Pagar
                        </Button>
                      )}
                    </form>
                    <IconButton label="Editar" onClick={() => setEditing(i)}>
                      <Pencil />
                    </IconButton>
                    <ConfirmAction
                      action={deleteOneTimeAction}
                      fields={{ id: i.id }}
                      title="Excluir despesa avulsa?"
                      description={`“${i.description}” de ${formatBRL(i.amountCents)} será removida do mês, do saldo e dos relatórios.`}
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

      <Dialog open={editing !== null} onClose={close} title={editing === "new" ? "Nova despesa" : "Editar despesa avulsa"}>
        {editing !== null && (
          <ExpenseForm
            oneTime={editing === "new" ? undefined : editing}
            categories={categories}
            defaultMonth={month}
            today={today}
            initialRepetition="once"
            onDone={close}
          />
        )}
      </Dialog>
    </>
  );
}
