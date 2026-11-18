"use client";

import {
  ArrowLeft,
  CheckCircle2,
  Pause,
  Pencil,
  Play,
  Plus,
  ReceiptText,
  RotateCcw,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CardForm } from "@/components/finance/card-form";
import { CategoryLabel } from "@/components/finance/category-dot";
import { CreditCardVisual } from "@/components/finance/credit-card-visual";
import { InvoiceStatusBadge } from "@/components/finance/invoice-status";
import { PurchaseForm } from "@/components/finance/purchase-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Dialog } from "@/components/ui/dialog";
import { IconButton } from "@/components/ui/icon-button";
import { Card } from "@/components/ui/page";
import { formatDate, formatDayMonth, formatMonthLong, formatMonthShort, type ISODate, type Month } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  deleteCardAction,
  deletePurchaseAction,
  setInvoicePaidAction,
  toggleCardAction,
} from "@/server/actions/cards";
import type { getInvoiceDetail, PurchaseRow } from "@/server/finance/cards";
import type { CategoryOption } from "@/server/finance/categories";

type Invoice = NonNullable<ReturnType<typeof getInvoiceDetail>>;
type CardData = {
  id: number;
  name: string;
  institutionName: string | null;
  limitCents: number;
  usedCents: number;
  closingDay: number;
  dueDay: number;
  color: string | null;
  active: boolean;
};
type Tab = { referenceMonth: Month; totalCents: number; isCurrent: boolean };
type CardOption = { id: number; name: string; closingDay: number; dueDay: number };

type DialogState =
  | { kind: "editCard" }
  | { kind: "newPurchase" }
  | { kind: "editPurchase"; purchase: PurchaseRow }
  | null;

export function CardDetailView({
  card,
  tabs,
  invoice,
  purchases,
  cardOptions,
  categories,
  institutions,
  today,
}: {
  card: CardData;
  tabs: Tab[];
  invoice: Invoice;
  purchases: PurchaseRow[];
  cardOptions: CardOption[];
  categories: CategoryOption[];
  institutions: string[];
  today: ISODate;
}) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const close = useCallback(() => setDialog(null), []);
  const usedPct = card.limitCents ? Math.min(100, Math.round((card.usedCents / card.limitCents) * 100)) : 0;

  // Mantém a aba da fatura selecionada visível na faixa de meses.
  const selectedTab = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    selectedTab.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [invoice.referenceMonth]);

  return (
    <>
      <Link href="/cartoes" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Cartões
      </Link>

      {/* Cabeçalho do cartão */}
      <div className="mb-8 grid gap-6 md:grid-cols-[minmax(0,320px)_1fr] md:items-center">
        <CreditCardVisual
          name={card.name}
          institution={card.institutionName}
          color={card.color}
          closingDay={card.closingDay}
          dueDay={card.dueDay}
          inactive={!card.active}
        />
        <div className="grid gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{card.name}</h1>
              {!card.active && <Badge>Desativado</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">
              {card.institutionName ? `${card.institutionName} · ` : ""}Fecha dia {card.closingDay} · vence dia {card.dueDay}
            </p>
          </div>

          <div className="grid gap-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Limite comprometido</span>
              <span className="font-medium tabular-nums">
                {formatBRL(card.usedCents)} <span className="text-muted-foreground">de {formatBRL(card.limitCents)}</span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted" role="presentation">
              <div
                className={cn("h-full rounded-full", usedPct >= 90 ? "bg-danger" : usedPct >= 70 ? "bg-warning" : "bg-primary")}
                style={{ width: `${usedPct}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Disponível: {formatBRL(Math.max(0, card.limitCents - card.usedCents))} · inclui parcelas futuras ainda não pagas
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setDialog({ kind: "newPurchase" })} disabled={!card.active}>
              <Plus aria-hidden /> Lançar compra
            </Button>
            <Button variant="secondary" onClick={() => setDialog({ kind: "editCard" })}>
              <Pencil aria-hidden /> Editar
            </Button>
            <form action={toggleCardAction}>
              <input type="hidden" name="id" value={card.id} />
              <input type="hidden" name="active" value={String(!card.active)} />
              <Button type="submit" variant="ghost">
                {card.active ? <Pause aria-hidden /> : <Play aria-hidden />}
                {card.active ? "Desativar" : "Reativar"}
              </Button>
            </form>
            <ConfirmAction
              action={deleteCardAction}
              fields={{ id: card.id }}
              title="Excluir cartão?"
              description={
                purchases.length
                  ? `Isso apaga o cartão “${card.name}” junto com ${purchases.length} compra${purchases.length === 1 ? "" : "s"} e todas as faturas. Se você só parou de usar, prefira “Desativar”.`
                  : `O cartão “${card.name}” será excluído.`
              }
              confirmLabel="Excluir cartão"
              trigger={(open) => (
                <Button variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger" onClick={open}>
                  <Trash2 aria-hidden /> Excluir
                </Button>
              )}
            />
          </div>
        </div>
      </div>

      {/* Faturas */}
      <Card className="mb-8 overflow-hidden">
        <nav aria-label="Faturas por mês" className="flex gap-1 overflow-x-auto border-b px-3 py-2">
          {tabs.map((t) => {
            const selected = t.referenceMonth === invoice.referenceMonth;
            return (
              <Link
                key={t.referenceMonth}
                ref={selected ? selectedTab : undefined}
                href={`?fatura=${t.referenceMonth}`}
                scroll={false}
                aria-current={selected ? "page" : undefined}
                className={cn(
                  "flex shrink-0 flex-col items-center rounded-lg px-3 py-1.5 text-xs transition-colors",
                  selected ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <span className="font-medium capitalize">
                  {formatMonthShort(t.referenceMonth)}
                  {t.isCurrent && " •"}
                </span>
                <span className="tabular-nums opacity-80">{t.totalCents ? formatBRL(t.totalCents) : "—"}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-wrap items-start justify-between gap-4 border-b px-5 py-5">
          <div className="grid gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold">Fatura de {formatMonthLong(invoice.referenceMonth).toLowerCase()}</h2>
              <InvoiceStatusBadge status={invoice.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              Fecha em {formatDate(invoice.closingDate)} · vence em {formatDate(invoice.dueDate)}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <p className="text-2xl font-semibold tracking-tight tabular-nums">{formatBRL(invoice.totalCents)}</p>
            {invoice.exists && (
              <form action={setInvoicePaidAction}>
                <input type="hidden" name="cardId" value={card.id} />
                <input type="hidden" name="month" value={invoice.referenceMonth} />
                <input type="hidden" name="paid" value={String(invoice.status !== "paid")} />
                {invoice.status === "paid" ? (
                  <Button type="submit" variant="ghost" size="sm">
                    <RotateCcw aria-hidden /> Reabrir
                  </Button>
                ) : (
                  <Button type="submit" variant="secondary" size="sm">
                    <CheckCircle2 aria-hidden /> Marcar como paga
                  </Button>
                )}
              </form>
            )}
          </div>
        </div>

        {invoice.items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-12 text-center text-sm text-muted-foreground">
            <ReceiptText className="size-6" aria-hidden />
            Nenhum lançamento nesta fatura.
          </div>
        ) : (
          <ul className="divide-y">
            {invoice.items.map((it) => (
              <li key={it.installmentId} className="flex items-center gap-4 px-5 py-3">
                <span className="w-12 shrink-0 text-xs text-muted-foreground tabular-nums">{formatDayMonth(it.purchaseDate)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{it.description}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    {it.installmentsCount > 1 && (
                      <span className="text-xs text-muted-foreground">
                        Parcela {it.number}/{it.installmentsCount}
                      </span>
                    )}
                    <CategoryLabel name={it.categoryName} color={it.categoryColor} />
                  </div>
                </div>
                <p className="text-sm font-semibold tabular-nums">{formatBRL(it.amountCents)}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Compras */}
      <Card>
        <div className="flex items-center justify-between gap-4 border-b px-5 py-4">
          <h2 className="font-semibold">Compras neste cartão</h2>
          <span className="text-sm text-muted-foreground">{purchases.length}</span>
        </div>
        {purchases.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
            <ShoppingBag className="size-6 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">Nenhuma compra lançada ainda.</p>
            {card.active && (
              <Button size="sm" onClick={() => setDialog({ kind: "newPurchase" })}>
                <Plus aria-hidden /> Lançar a primeira compra
              </Button>
            )}
          </div>
        ) : (
          <ul className="divide-y">
            {purchases.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
                <div className="min-w-0 flex-1 basis-full sm:basis-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium">{p.description}</p>
                    {p.installmentsCount > 1 ? (
                      <Badge tone="primary">{p.installmentsCount}x</Badge>
                    ) : (
                      <Badge>À vista</Badge>
                    )}
                    {p.remainingCount === 0 && <Badge tone="success">Quitada</Badge>}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>Compra em {formatDate(p.purchaseDate)}</span>
                    {p.firstMonth && (
                      <span>
                        {p.installmentsCount > 1
                          ? `Faturas de ${formatMonthShort(p.firstMonth)} a ${formatMonthShort(p.lastMonth)}`
                          : `Fatura de ${formatMonthShort(p.firstMonth)}`}
                      </span>
                    )}
                    <CategoryLabel name={p.categoryName} color={p.categoryColor} />
                  </div>
                </div>
                <div className="ml-auto text-right sm:ml-0">
                  <p className="font-semibold tabular-nums">{formatBRL(p.totalCents)}</p>
                  {p.remainingCount > 0 && p.installmentsCount > 1 && (
                    <p className="text-xs text-muted-foreground tabular-nums">
                      Faltam {p.remainingCount} · {formatBRL(p.remainingCents)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-0.5">
                  <IconButton label="Editar compra" onClick={() => setDialog({ kind: "editPurchase", purchase: p })}>
                    <Pencil />
                  </IconButton>
                  <ConfirmAction
                    action={deletePurchaseAction}
                    fields={{ id: p.id }}
                    title="Excluir compra?"
                    description={`“${p.description}” e todas as ${p.installmentsCount > 1 ? `${p.installmentsCount} parcelas` : "suas parcelas"} serão removidas das faturas.`}
                    trigger={(open) => (
                      <IconButton label="Excluir compra" tone="danger" onClick={open}>
                        <Trash2 />
                      </IconButton>
                    )}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Dialog
        open={dialog !== null}
        onClose={close}
        title={dialog?.kind === "editCard" ? "Editar cartão" : dialog?.kind === "editPurchase" ? "Editar compra" : "Lançar compra"}
        description={
          dialog?.kind === "newPurchase"
            ? "As parcelas são distribuídas automaticamente nas faturas dos próximos meses."
            : dialog?.kind === "editPurchase"
              ? "Ao salvar, todas as parcelas são recalculadas."
              : undefined
        }
      >
        {dialog?.kind === "editCard" && (
          <CardForm
            card={{ ...card, hasPurchases: purchases.length > 0 }}
            institutions={institutions}
            onDone={close}
          />
        )}
        {(dialog?.kind === "newPurchase" || dialog?.kind === "editPurchase") && (
          <PurchaseForm
            purchase={dialog.kind === "editPurchase" ? dialog.purchase : undefined}
            cards={cardOptions}
            defaultCardId={card.id}
            categories={categories}
            today={today}
            onDone={close}
          />
        )}
      </Dialog>
    </>
  );
}
