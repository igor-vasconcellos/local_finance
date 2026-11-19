"use client";

import { ArrowRight, Calculator, CheckCircle2, CreditCard, Eye, EyeOff, Landmark, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { HealthBadge } from "@/components/finance/health-badge";
import { ImpactChart } from "@/components/finance/impact-chart";
import { useFormAction } from "@/components/finance/use-form-action";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Field, fieldControlProps } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Card, EmptyState } from "@/components/ui/page";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { formatDate, formatMonthShort, type ISODate } from "@/lib/dates";
import { healthOf, type Health } from "@/lib/health";
import { formatBRL } from "@/lib/money";
import { formatPct } from "@/lib/rates";
import { simulationSchedule } from "@/lib/simulation";
import { cn } from "@/lib/utils";
import {
  deleteSimulationAction,
  effectivateSimulationAction,
  saveSimulationAction,
  toggleSimulationAction,
} from "@/server/actions/simulations";
import type { CategoryOption } from "@/server/finance/categories";
import type { ProjectionMonth } from "@/server/finance/projection";
import type { SimulationRow } from "@/server/finance/simulations";

type CardOption = { id: number; name: string; closingDay: number; dueDay: number; availableCents: number };

type Props = {
  months: ProjectionMonth[];
  thresholds: { greenBp: number; yellowBp: number };
  cards: CardOption[];
  categories: CategoryOption[];
  simulations: SimulationRow[];
  today: ISODate;
};

const RANK: Record<Health, number> = { green: 0, yellow: 1, red: 2 };

export function SimulatorView({ months, thresholds, cards, categories, simulations, today }: Props) {
  const [formKey, setFormKey] = useState(0);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(cards, today));
  const handleSaved = useCallback(() => {
    setDraft(emptyDraft(cards, today));
    setFormKey((k) => k + 1);
  }, [cards, today]);

  const card = cards.find((c) => c.id === draft.cardId) ?? null;
  const schedule = useMemo(() => {
    if (!draft.totalCents || draft.totalCents <= 0) return [];
    if (draft.method === "credit" && !card) return [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) return [];
    return simulationSchedule({
      paymentMethod: draft.method,
      totalCents: draft.totalCents,
      installmentsCount: draft.method === "credit" ? draft.count : 1,
      purchaseDate: draft.date,
      card,
    });
  }, [draft, card]);

  const draftByMonth = new Map(schedule.map((s) => [s.referenceMonth, s.amountCents]));
  const hasDraft = schedule.length > 0;
  const rows = months.map((m) => {
    const extra = draftByMonth.get(m.month) ?? 0;
    const after = m.freeCents - extra;
    const healthAfter = healthOf(after, m.incomeCents, thresholds.greenBp, thresholds.yellowBp);
    return { ...m, extra, after, healthAfter, worse: RANK[healthAfter] > RANK[m.health] };
  });
  const worsened = rows.filter((r) => r.worse);
  const negative = rows.filter((r) => r.extra > 0 && r.after < 0);
  const outside = schedule.filter((s) => !months.some((m) => m.month === s.referenceMonth));
  const overLimit = draft.method === "credit" && card && draft.totalCents ? draft.totalCents > card.availableCents : false;
  const anySaved = months.some((m) => m.simulatedCents > 0);

  const active = simulations.filter((s) => s.status === "active");
  const done = simulations.filter((s) => s.status === "effectivated");

  return (
    <div className="grid gap-6">
      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <Card className="h-fit p-5">
          <h2 className="mb-4 flex items-center gap-2 font-semibold">
            <Calculator className="size-4 text-muted-foreground" aria-hidden /> Simular uma compra
          </h2>
          <SimulationForm
            key={formKey}
            draft={draft}
            onChange={setDraft}
            cards={cards}
            categories={categories}
            onSaved={handleSaved}
          />
          {hasDraft && (
            <div className="mt-4 grid gap-1 rounded-xl bg-muted/60 p-3 text-sm">
              <p className="font-medium">
                {draft.method === "debit"
                  ? `À vista no débito: ${formatBRL(draft.totalCents!)} em ${formatMonthShort(schedule[0].referenceMonth)}`
                  : schedule.length === 1
                    ? `À vista no crédito: fatura de ${formatMonthShort(schedule[0].referenceMonth)}`
                    : `${schedule.length}x de ${formatBRL(schedule.at(-1)!.amountCents)} · ${formatMonthShort(schedule[0].referenceMonth)} a ${formatMonthShort(schedule.at(-1)!.referenceMonth)}`}
              </p>
              {overLimit && <p className="text-xs text-danger">Acima do limite disponível do cartão ({formatBRL(card!.availableCents)}).</p>}
              {outside.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {outside.length} parcela(s) caem depois dos 12 meses exibidos.
                </p>
              )}
            </div>
          )}
        </Card>

        <Card className="min-w-0 p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Saldo livre nos próximos 12 meses</h2>
            {anySaved && <Badge tone="primary">Inclui simulações salvas marcadas</Badge>}
          </div>

          {hasDraft ? (
            worsened.length === 0 && negative.length === 0 ? (
              <Alert tone="success" title="Cabe no orçamento." className="mb-4">
                Nenhum mês muda de cor no farol com esta compra.
              </Alert>
            ) : (
              <Alert tone={negative.length ? "danger" : "warning"} title={negative.length ? "Atenção: o saldo fica negativo." : "Atenção: o farol piora."} className="mb-4">
                {[
                  negative.length && `Negativo em ${negative.map((r) => formatMonthShort(r.month)).join(", ")}.`,
                  worsened.length && `Piora em ${worsened.length} mês(es): ${worsened.map((r) => formatMonthShort(r.month)).join(", ")}.`,
                ]
                  .filter(Boolean)
                  .join(" ")}
              </Alert>
            )
          ) : (
            <p className="mb-4 text-sm text-muted-foreground">Preencha a compra ao lado para ver o impacto mês a mês.</p>
          )}

          <ImpactChart data={rows.map((r) => ({ month: r.month, before: r.freeCents, after: hasDraft ? r.after : undefined }))} showAfter={hasDraft} />

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground uppercase">
                  <th className="py-2 pr-3 font-medium">Mês</th>
                  <th className="hidden py-2 pr-3 text-right font-medium 2xl:table-cell">Renda</th>
                  <th className="hidden py-2 pr-3 text-right font-medium md:table-cell" title="Gastos fixos + faturas + avulsos + metas + simulações salvas">
                    Compromissos
                  </th>
                  <th className="py-2 pr-3 text-right font-medium">Esta compra</th>
                  <th className="py-2 pr-3 text-right font-medium">Livre</th>
                  <th className="py-2 font-medium">Farol</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => {
                  const committed = r.incomeCents - r.freeCents;
                  const free = hasDraft ? r.after : r.freeCents;
                  const pct = r.incomeCents > 0 ? (free / r.incomeCents) * 100 : null;
                  return (
                    <tr key={r.month} className={cn(r.worse && "bg-warning-soft/40", r.extra > 0 && r.after < 0 && "bg-danger-soft/40")}>
                      <td className="py-2.5 pr-3 font-medium capitalize">{formatMonthShort(r.month)}</td>
                      <td className="hidden py-2.5 pr-3 text-right tabular-nums text-muted-foreground 2xl:table-cell">{formatBRL(r.incomeCents)}</td>
                      <td className="hidden py-2.5 pr-3 text-right tabular-nums text-muted-foreground md:table-cell">{formatBRL(committed)}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{r.extra ? `−${formatBRL(r.extra)}` : "—"}</td>
                      <td className={cn("py-2.5 pr-3 text-right font-semibold tabular-nums", free < 0 && "text-danger")}>
                        {formatBRL(free)}
                        {pct !== null && <span className="ml-1 hidden text-xs font-normal text-muted-foreground sm:inline">({formatPct(pct, 0)})</span>}
                      </td>
                      <td className="py-2.5">
                        <span className="flex items-center gap-1.5">
                          {hasDraft && r.extra > 0 && r.healthAfter !== r.health ? (
                            <>
                              <span className="hidden items-center gap-1.5 sm:inline-flex">
                                <HealthBadge health={r.health} />
                                <ArrowRight className="size-3.5 text-muted-foreground" aria-label="passa para" />
                              </span>
                              <HealthBadge health={r.healthAfter} compactOnMobile />
                            </>
                          ) : (
                            <HealthBadge health={hasDraft ? r.healthAfter : r.health} compactOnMobile />
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Livre = rendas previstas − (gastos fixos + faturas que vencem no mês + gastos avulsos + metas das caixinhas + simulações salvas).
            Farol: verde acima de {formatPct(thresholds.greenBp / 100, 0)} da renda, amarelo a partir de {formatPct(thresholds.yellowBp / 100, 0)}.{" "}
            <Link href="/configuracoes#farol" className="text-primary hover:underline">
              Ajustar
            </Link>
          </p>
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between gap-4 border-b px-5 py-4">
          <h2 className="font-semibold">Simulações salvas</h2>
          <span className="text-sm text-muted-foreground">{active.length}</span>
        </div>
        {active.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<Calculator />}
              title="Nenhuma simulação salva"
              description="Salve uma simulação para comparar cenários: ela pode entrar (ou não) no saldo livre, e vira compra real com um clique em “Efetivar”."
            />
          </div>
        ) : (
          <ul className="divide-y">
            {active.map((s) => (
              <SimulationItem key={s.id} s={s} />
            ))}
          </ul>
        )}
        {done.length > 0 && (
          <details className="group border-t">
            <summary className="cursor-pointer list-none px-5 py-3 text-sm text-muted-foreground hover:text-foreground">
              <span className="group-open:hidden">Ver {done.length} efetivada(s)</span>
              <span className="hidden group-open:inline">Ocultar efetivadas</span>
            </summary>
            <ul className="divide-y border-t">
              {done.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <CheckCircle2 className="size-4 text-success" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{s.description}</span>
                  <span className="text-xs text-muted-foreground">
                    Efetivada em {formatDate(s.effectivatedAt!.slice(0, 10))} · {s.paymentMethod === "credit" ? `${s.cardName ?? "cartão"}` : "gasto avulso"}
                  </span>
                  <span className="tabular-nums">{formatBRL(s.totalCents)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

type Draft = {
  description: string;
  method: "credit" | "debit";
  cardId: number | null;
  totalCents: number | null;
  count: number;
  date: string;
  categoryId: string;
};

function emptyDraft(cards: CardOption[], today: string): Draft {
  return {
    description: "",
    method: cards.length ? "credit" : "debit",
    cardId: cards[0]?.id ?? null,
    totalCents: null,
    count: 1,
    date: today,
    categoryId: "",
  };
}

function SimulationForm({
  draft,
  onChange,
  cards,
  categories,
  onSaved,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  cards: CardOption[];
  categories: CategoryOption[];
  onSaved: () => void;
}) {
  const { state, onSubmit, pending } = useFormAction(saveSimulationAction);
  const f = state.fields ?? {};
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });

  useEffect(() => {
    if (state.ok) onSaved();
  }, [state, onSaved]);

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      {state.error && <Alert tone="danger">{state.error}</Alert>}

      <Field id="description" label="O que você quer comprar?" error={f.description}>
        <Input
          {...fieldControlProps("description", f.description)}
          name="description"
          value={draft.description}
          onChange={(e) => set({ description: e.target.value })}
          placeholder="Ex.: Geladeira nova"
        />
      </Field>

      <Field id="total" label="Valor total" error={f.total}>
        <MoneyInput {...fieldControlProps("total", f.total)} name="total" onValueChange={(c) => set({ totalCents: c })} />
      </Field>

      <div className="grid gap-2">
        <span className="text-sm font-medium">Forma de pagamento</span>
        <Segmented
          name="paymentMethod"
          ariaLabel="Forma de pagamento"
          value={draft.method}
          onChange={(m) => set({ method: m })}
          options={[
            { value: "credit", label: "Crédito" },
            { value: "debit", label: "Débito / Pix" },
          ]}
        />
      </div>

      {draft.method === "credit" ? (
        cards.length === 0 ? (
          <Alert tone="info">
            Cadastre um cartão em{" "}
            <Link href="/cartoes" className="font-medium text-primary hover:underline">
              Cartões
            </Link>{" "}
            para simular no crédito.
          </Alert>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <Field id="cardId" label="Cartão" error={f.cardId}>
              <Select {...fieldControlProps("cardId", f.cardId)} name="cardId" value={draft.cardId ?? ""} onChange={(e) => set({ cardId: Number(e.target.value) })}>
                {cards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="installmentsCount" label="Parcelas" error={f.installmentsCount}>
              <Select
                {...fieldControlProps("installmentsCount", f.installmentsCount)}
                name="installmentsCount"
                value={draft.count}
                onChange={(e) => set({ count: Number(e.target.value) })}
              >
                {Array.from({ length: 48 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? "À vista (1x)" : `${n}x`}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )
      ) : (
        <input type="hidden" name="installmentsCount" value="1" />
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        <Field id="purchaseDate" label="Data da compra" error={f.purchaseDate}>
          <Input {...fieldControlProps("purchaseDate", f.purchaseDate)} name="purchaseDate" type="date" value={draft.date} onChange={(e) => set({ date: e.target.value })} />
        </Field>
        <Field id="categoryId" label="Categoria (opcional)">
          <Select id="categoryId" name="categoryId" value={draft.categoryId} onChange={(e) => set({ categoryId: e.target.value })}>
            <option value="">Sem categoria</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Button type="submit" variant="secondary" loading={pending}>
        <Save aria-hidden /> Salvar simulação
      </Button>
      <p className="-mt-2 text-xs text-muted-foreground">Salvar não cria nenhuma compra. Para lançar de verdade, use “Efetivar” na lista.</p>
    </form>
  );
}

function SimulationItem({ s }: { s: SimulationRow }) {
  return (
    <li className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4", !s.isVisible && "opacity-60")}>
      <span
        className={cn(
          "inline-flex size-9 shrink-0 items-center justify-center rounded-xl [&_svg]:size-4",
          s.paymentMethod === "credit" ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        {s.paymentMethod === "credit" ? <CreditCard aria-hidden /> : <Landmark aria-hidden />}
      </span>
      <div className="min-w-0 flex-1 basis-[calc(100%-4rem)] sm:basis-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-medium">{s.description}</p>
          <Badge tone={s.paymentMethod === "credit" ? "primary" : "neutral"}>
            {s.paymentMethod === "credit" ? (s.installmentsCount > 1 ? `${s.installmentsCount}x no crédito` : "Crédito à vista") : "Débito / Pix"}
          </Badge>
          {!s.isVisible && <Badge>Fora do cenário</Badge>}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {s.paymentMethod === "credit" ? `${s.cardName ?? "Cartão removido"} · ` : ""}
          {s.firstMonth && (s.firstMonth === s.lastMonth ? formatMonthShort(s.firstMonth) : `${formatMonthShort(s.firstMonth)} a ${formatMonthShort(s.lastMonth!)}`)}
          {s.categoryName && ` · ${s.categoryName}`}
        </p>
      </div>
      <div className="ml-auto text-right sm:ml-0">
        <p className="font-semibold tabular-nums">{formatBRL(s.totalCents)}</p>
        {s.installmentsCount > 1 && <p className="text-xs text-muted-foreground tabular-nums">{s.installmentsCount}x {formatBRL(s.installmentCents)}</p>}
      </div>
      <div className="flex items-center gap-1">
        <form action={toggleSimulationAction}>
          <input type="hidden" name="id" value={s.id} />
          <input type="hidden" name="visible" value={String(!s.isVisible)} />
          <IconButton type="submit" label={s.isVisible ? "Tirar do cenário" : "Considerar no cenário"}>
            {s.isVisible ? <Eye /> : <EyeOff />}
          </IconButton>
        </form>
        <ConfirmAction
          action={effectivateSimulationAction}
          fields={{ id: s.id }}
          tone="primary"
          title="Efetivar esta compra?"
          description={
            s.paymentMethod === "credit"
              ? `“${s.description}” vira uma compra real no ${s.cardName ?? "cartão"}, com as parcelas lançadas nas faturas.`
              : `“${s.description}” vira um gasto avulso (débito/Pix) em ${formatDate(s.purchaseDate)}.`
          }
          confirmLabel="Efetivar"
          trigger={(open) => (
            <Button size="sm" onClick={open}>
              <CheckCircle2 aria-hidden /> Efetivar
            </Button>
          )}
        />
        <ConfirmAction
          action={deleteSimulationAction}
          fields={{ id: s.id }}
          title="Excluir simulação?"
          description={`“${s.description}” será descartada. Nenhum dado real é afetado.`}
          trigger={(open) => (
            <IconButton label="Excluir simulação" tone="danger" onClick={open}>
              <Trash2 />
            </IconButton>
          )}
        />
      </div>
    </li>
  );
}

