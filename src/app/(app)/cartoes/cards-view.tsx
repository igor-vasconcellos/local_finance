"use client";

import { ChevronRight, CreditCard, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { CardForm } from "@/components/finance/card-form";
import { CreditCardVisual } from "@/components/finance/credit-card-visual";
import { InvoiceStatusBadge } from "@/components/finance/invoice-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/page";
import { formatDayMonth, formatMonthShort } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { CardSummary } from "@/server/finance/cards";

export function CardsView({ cards, institutions }: { cards: CardSummary[]; institutions: string[] }) {
  const [creating, setCreating] = useState(false);
  const close = useCallback(() => setCreating(false), []);

  const newButton = (
    <Button onClick={() => setCreating(true)}>
      <Plus aria-hidden /> Novo cartão
    </Button>
  );

  return (
    <>
      {cards.length === 0 ? (
        <EmptyState
          icon={<CreditCard />}
          title="Nenhum cartão cadastrado"
          description="Cadastre seus cartões com o dia de fechamento e vencimento. As compras parceladas vão direto para as faturas certas."
          action={newButton}
        />
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">Seus cartões</h2>
            {newButton}
          </div>
          <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map((c) => {
              const usedPct = c.limitCents ? Math.min(100, Math.round((c.usedCents / c.limitCents) * 100)) : 0;
              return (
                <li key={c.id}>
                  <Link
                    href={`/cartoes/${c.id}`}
                    className={cn(
                      "group block rounded-2xl border bg-card p-4 shadow-xs transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring",
                      !c.active && "opacity-70",
                    )}
                  >
                    <CreditCardVisual
                      name={c.name}
                      institution={c.institutionName}
                      color={c.color}
                      closingDay={c.closingDay}
                      dueDay={c.dueDay}
                      inactive={!c.active}
                    />

                    <div className="mt-4 grid gap-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-xs text-muted-foreground">
                            Fatura {formatMonthShort(c.currentInvoice.referenceMonth)} · vence {formatDayMonth(c.currentInvoice.dueDate)}
                          </p>
                          <p className="text-xl font-semibold tabular-nums">{formatBRL(c.currentInvoice.totalCents)}</p>
                        </div>
                        {c.active ? <InvoiceStatusBadge status={c.currentInvoice.status} /> : <Badge>Desativado</Badge>}
                      </div>

                      <div className="grid gap-1.5">
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="presentation">
                          <div
                            className={cn("h-full rounded-full", usedPct >= 90 ? "bg-danger" : usedPct >= 70 ? "bg-warning" : "bg-primary")}
                            style={{ width: `${usedPct}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Usado {formatBRL(c.usedCents)}</span>
                          <span>Disponível {formatBRL(Math.max(0, c.limitCents - c.usedCents))}</span>
                        </div>
                      </div>

                      <span className="flex items-center justify-end gap-1 text-sm font-medium text-primary">
                        Ver faturas e compras
                        <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <Dialog open={creating} onClose={close} title="Novo cartão">
        {creating && <CardForm institutions={institutions} onDone={close} />}
      </Dialog>
    </>
  );
}
