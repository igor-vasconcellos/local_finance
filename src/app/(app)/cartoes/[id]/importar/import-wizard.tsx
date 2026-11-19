"use client";

import { ArrowLeft, CheckCircle2, FileText, FileUp, Loader2, ReceiptText, ShieldCheck, Upload } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/page";
import { Select } from "@/components/ui/select";
import { addMonths, formatDate, formatDayMonth, formatMonthLong, type Month } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";
import { commitImportAction, previewImportAction } from "@/server/actions/imports";
import type { CategoryOption } from "@/server/finance/categories";
import type { CommitResult, ImportPreview, LineStatus, PreviewLine } from "@/server/import/service";

type CardInfo = { id: number; name: string; closingDay: number; dueDay: number };

const STATUS: Record<LineStatus, { label: string; tone: BadgeTone } | null> = {
  new: null,
  imported: { label: "Já importada", tone: "neutral" },
  duplicate: { label: "Possível duplicada", tone: "warning" },
  ignored: { label: "Pagamento · ignorado", tone: "neutral" },
};

export function ImportWizard({ card, categories }: { card: CardInfo; categories: CategoryOption[] }) {
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<{ res: CommitResult; month: Month } | null>(null);

  return (
    <>
      <Link
        href={`/cartoes/${card.id}`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> {card.name}
      </Link>
      <PageHeader
        title="Importar fatura"
        description={`Envie o arquivo da fatura do banco para lançar as compras no cartão ${card.name}.`}
      />
      {result ? (
        <Done
          card={card}
          result={result.res}
          month={result.month}
          onAgain={() => {
            setResult(null);
            setPreview(null);
          }}
        />
      ) : preview ? (
        <Review
          preview={preview}
          categories={categories}
          onBack={() => setPreview(null)}
          onDone={(res, month) => setResult({ res, month })}
        />
      ) : (
        <UploadStep cardId={card.id} onPreview={setPreview} />
      )}
    </>
  );
}

// ------------------------------------------------------------------ Envio --

function UploadStep({ cardId, onPreview }: { cardId: number; onPreview: (p: ImportPreview) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const send = (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setFileName(file.name);
    const fd = new FormData();
    fd.set("cardId", String(cardId));
    fd.set("file", file);
    start(async () => {
      const res = await previewImportAction(fd);
      if (res.preview) onPreview(res.preview);
      else setError(res.error ?? "Não foi possível ler o arquivo.");
      if (input.current) input.current.value = "";
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="grid content-start gap-4">
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            send(e.dataTransfer.files[0]);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed bg-card/60 px-6 py-16 text-center transition-colors",
            dragging ? "border-primary bg-accent" : "hover:border-primary/50 hover:bg-muted/40",
            pending && "pointer-events-none opacity-70",
          )}
        >
          <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
            {pending ? <Loader2 className="size-6 animate-spin" aria-hidden /> : <FileUp className="size-6" aria-hidden />}
          </span>
          <span className="font-semibold">
            {pending ? `Lendo ${fileName ?? "arquivo"}…` : "Arraste a fatura aqui ou clique para escolher"}
          </span>
          <span className="text-sm text-muted-foreground">PDF ou CSV · até 10 MB</span>
          <input
            ref={input}
            type="file"
            name="file"
            accept=".pdf,.csv,application/pdf,text/csv"
            className="sr-only"
            onChange={(e) => send(e.target.files?.[0])}
            disabled={pending}
            aria-label="Arquivo da fatura"
          />
        </label>
        {error && (
          <Alert tone="danger" title="Não deu para importar">
            {error}
          </Alert>
        )}
      </div>

      <Card className="grid content-start gap-4 p-5 text-sm">
        <h2 className="font-semibold">Bancos suportados</h2>
        <ul className="grid gap-3">
          <Supported name="Nubank" format="CSV" hint="App → Cartão → Faturas → Exportar fatura" />
          <Supported name="PicPay" format="PDF" hint="App → Cartão → Faturas → Baixar PDF" />
          <Supported name="Mercado Pago" format="PDF" hint="App → Cartão → Faturas → Baixar PDF" />
        </ul>
        <p className="flex items-start gap-2 border-t pt-4 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />O arquivo é lido pelo BeaconFinance e
          descartado em seguida: não fica guardado. Nada é gravado antes de você conferir e confirmar.
        </p>
      </Card>
    </div>
  );
}

function Supported({ name, format, hint }: { name: string; format: string; hint: string }) {
  return (
    <li className="flex items-start gap-3">
      <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="grid gap-0.5">
        <span className="flex items-center gap-2 font-medium">
          {name} <Badge>{format}</Badge>
        </span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </span>
    </li>
  );
}

// -------------------------------------------------------------- Conferência --

function Review({
  preview,
  categories,
  onBack,
  onDone,
}: {
  preview: ImportPreview;
  categories: CategoryOption[];
  onBack: () => void;
  onDone: (r: CommitResult, month: Month) => void;
}) {
  const [lines, setLines] = useState<PreviewLine[]>(preview.lines);
  const [month, setMonth] = useState<Month>(preview.referenceMonth);
  const [markPaid, setMarkPaid] = useState(preview.markPaidDefault);
  const [updateSchedule, setUpdateSchedule] = useState(Boolean(preview.scheduleMismatch));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const update = (i: number, patch: Partial<PreviewLine>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const selectable = (l: PreviewLine) => l.status !== "ignored" && l.status !== "imported";

  const sums = useMemo(() => {
    const chosen = lines.filter((l) => l.selected && selectable(l));
    const purchases = chosen.filter((l) => l.kind === "purchase");
    const credits = chosen.filter((l) => l.kind === "credit");
    const p = purchases.reduce((a, l) => a + l.amountCents, 0);
    const c = credits.reduce((a, l) => a + l.amountCents, 0);
    return { purchases: purchases.length, credits: credits.length, p, c, total: chosen.length };
  }, [lines]);

  const allSelectable = lines.filter(selectable);
  const allOn = allSelectable.length > 0 && allSelectable.every((l) => l.selected);
  const t = preview.totals;
  const m = preview.scheduleMismatch;

  const submit = () => {
    setError(null);
    start(async () => {
      const res = await commitImportAction({
        cardId: preview.cardId,
        bank: preview.bank,
        fileName: preview.fileName,
        referenceMonth: month,
        dueDate: preview.dueDate,
        closingDate: preview.closingDate,
        datesFromFile: preview.datesFromFile,
        markPaid,
        updateCardSchedule: updateSchedule,
        lines: lines
          .filter((l) => l.selected && selectable(l) && l.kind !== "payment")
          .map((l) => ({
            key: l.key,
            kind: l.kind as "purchase" | "credit",
            date: l.date,
            description: l.description.trim(),
            amountCents: l.amountCents,
            installment: l.installment,
            categoryId: l.kind === "purchase" ? l.categoryId : null,
          })),
      });
      if (res.result) onDone(res.result, month);
      else setError(res.error ?? "Não foi possível importar.");
    });
  };

  return (
    <div className="grid gap-6">
      {/* Resumo do arquivo */}
      <Card className="grid gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="primary">{preview.bankLabel}</Badge>
              <span className="truncate text-sm text-muted-foreground">{preview.fileName}</span>
            </div>
            <h2 className="text-lg font-semibold">Fatura de {formatMonthLong(month).toLowerCase()}</h2>
            <p className="text-sm text-muted-foreground">
              {preview.datesFromFile
                ? `Fechou em ${formatDate(preview.closingDate)} · vence em ${formatDate(preview.dueDate)} (datas do arquivo)`
                : "O CSV não informa as datas da fatura: confira o mês abaixo."}
            </p>
          </div>
          {!preview.datesFromFile && (
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Fatura (vencimento)</span>
              <Select value={month} onChange={(e) => setMonth(e.target.value)} className="w-52">
                {[-2, -1, 0, 1, 2].map((d) => {
                  const v = addMonths(preview.referenceMonth, d);
                  return (
                    <option key={v} value={v}>
                      {formatMonthLong(v)}
                    </option>
                  );
                })}
              </Select>
            </label>
          )}
        </div>

        {t.checked &&
          (t.ok ? (
            <Alert tone="success" title="Leitura conferida">
              A soma das compras ({formatBRL(t.purchasesCents)})
              {t.expectedCreditsCents !== null && ` e dos créditos (${formatBRL(t.creditsCents)})`} bate com o total informado na
              fatura.
            </Alert>
          ) : (
            <Alert tone="warning" title="A soma não bateu com o total da fatura">
              Compras lidas: {formatBRL(t.purchasesCents)}
              {t.expectedPurchasesCents !== null && ` · fatura informa ${formatBRL(t.expectedPurchasesCents)}`}
              {t.expectedCreditsCents !== null &&
                ` · créditos lidos ${formatBRL(t.creditsCents)} (fatura: ${formatBRL(t.expectedCreditsCents)})`}
              . Confira os lançamentos antes de importar.
            </Alert>
          ))}

        {m && preview.datesFromFile && (
          <Alert tone="warning" title="O banco usa dias diferentes dos cadastrados">
            <span className="block">
              Pela fatura, o cartão fecha dia {m.closingDay ?? "?"} e vence dia {m.dueDay}. No app está fechando dia{" "}
              {m.cardClosingDay} e vencendo dia {m.cardDueDay}.
            </span>
            <label className="mt-2 flex items-center gap-2 text-foreground">
              <input
                type="checkbox"
                checked={updateSchedule}
                onChange={(e) => setUpdateSchedule(e.target.checked)}
                className="size-4 accent-[var(--primary)]"
              />
              Atualizar o cartão para fechar dia {m.closingDay} e vencer dia {m.dueDay}
            </label>
          </Alert>
        )}

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={markPaid}
            onChange={(e) => setMarkPaid(e.target.checked)}
            className="size-4 accent-[var(--primary)]"
          />
          Esta fatura já está paga
        </label>
      </Card>

      {/* Lançamentos */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={allOn}
              onChange={(e) => setLines((ls) => ls.map((l) => (selectable(l) ? { ...l, selected: e.target.checked } : l)))}
              className="size-4 accent-[var(--primary)]"
              aria-label="Selecionar todos"
            />
            Lançamentos ({lines.length})
          </label>
          <span className="text-xs text-muted-foreground">Você pode ajustar a descrição e a categoria antes de importar.</span>
        </div>
        <ul className="divide-y">
          {lines.map((l, i) => {
            const status = STATUS[l.status];
            const disabled = !selectable(l);
            return (
              <li
                key={l.key}
                className={cn(
                  "grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2 px-5 py-3 sm:grid-cols-[auto_3.5rem_1fr_12rem_7rem]",
                  (disabled || !l.selected) && "bg-muted/30",
                )}
              >
                <input
                  type="checkbox"
                  checked={l.selected && !disabled}
                  disabled={disabled}
                  onChange={(e) => update(i, { selected: e.target.checked })}
                  className="size-4 accent-[var(--primary)]"
                  aria-label={`Importar ${l.description}`}
                />
                <span className="hidden text-xs text-muted-foreground tabular-nums sm:block">{formatDayMonth(l.date)}</span>
                <div className={cn("grid min-w-0 gap-1", (disabled || !l.selected) && "opacity-60")}>
                  {l.kind === "payment" ? (
                    <span className="text-sm font-medium">{l.description}</span>
                  ) : (
                    <input
                      value={l.description}
                      onChange={(e) => update(i, { description: e.target.value })}
                      disabled={disabled}
                      maxLength={120}
                      className="-ml-1.5 h-8 rounded-md border border-transparent bg-transparent px-1.5 text-sm font-medium outline-none hover:border-input focus:border-ring disabled:hover:border-transparent"
                      aria-label="Descrição"
                    />
                  )}
                  <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="tabular-nums sm:hidden">{formatDayMonth(l.date)}</span>
                    {l.rawDescription !== l.description && l.kind !== "payment" && (
                      <span className="truncate">{l.rawDescription}</span>
                    )}
                    {l.installment && (
                      <Badge tone="primary">
                        Parcela {l.installment.number}/{l.installment.count}
                      </Badge>
                    )}
                    {preview.multipleCards && <Badge>{l.cardFinal ? `final ${l.cardFinal}` : "titular"}</Badge>}
                    {l.kind === "credit" && <Badge tone="success">Crédito/estorno</Badge>}
                    {status && <Badge tone={status.tone}>{status.label}</Badge>}
                  </span>
                </div>
                <div className="col-span-3 col-start-2 sm:col-span-1 sm:col-start-auto">
                  {l.kind === "purchase" ? (
                    <Select
                      value={l.categoryId ?? ""}
                      onChange={(e) => update(i, { categoryId: e.target.value ? Number(e.target.value) : null })}
                      disabled={disabled}
                      className="h-8 text-xs"
                      aria-label="Categoria"
                    >
                      <option value="">Sem categoria</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <span className="hidden sm:block" />
                  )}
                </div>
                <span
                  className={cn(
                    "col-start-3 row-start-1 text-right text-sm font-semibold tabular-nums sm:col-start-auto sm:row-start-auto",
                    l.kind === "credit" && "text-success",
                    l.kind === "payment" && "font-normal text-muted-foreground line-through",
                  )}
                >
                  {l.kind === "credit" ? "− " : ""}
                  {formatBRL(l.amountCents)}
                  {l.installment && (
                    <span className="block text-[11px] font-normal text-muted-foreground">
                      total {formatBRL(l.amountCents * l.installment.count)}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      {lines.some((l) => l.installment && l.installment.number > 1 && l.selected && selectable(l)) && (
        <Alert tone="info" title="Compras parceladas">
          Cada parcela vira a compra completa: as parcelas anteriores ficam em faturas passadas (marcadas como pagas) e as
          próximas entram nas faturas futuras.
        </Alert>
      )}

      {error && (
        <Alert tone="danger" title="Não deu para importar">
          {error}
        </Alert>
      )}

      {/* Rodapé fixo com o resumo */}
      <div className="sticky bottom-4 z-20 rounded-2xl border bg-card/95 shadow-lg backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
          <p className="text-sm">
            <span className="font-medium">
              {sums.purchases} compra{sums.purchases === 1 ? "" : "s"}
            </span>{" "}
            <span className="tabular-nums text-muted-foreground">{formatBRL(sums.p)}</span>
            {sums.credits > 0 && (
              <>
                {" · "}
                <span className="font-medium">
                  {sums.credits} crédito{sums.credits === 1 ? "" : "s"}
                </span>{" "}
                <span className="tabular-nums text-success">− {formatBRL(sums.c)}</span>
              </>
            )}
            {" · "}
            <span className="font-semibold tabular-nums">{formatBRL(Math.max(0, sums.p - sums.c))}</span>
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onBack} disabled={pending}>
              Trocar arquivo
            </Button>
            <Button onClick={submit} loading={pending} disabled={sums.total === 0}>
              <Upload aria-hidden /> Importar {sums.total || ""}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------- Concluído --

function Done({ card, result, month, onAgain }: { card: CardInfo; result: CommitResult; month: Month; onAgain: () => void }) {
  return (
    <Card className="flex flex-col items-center gap-4 px-6 py-12 text-center">
      <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-success-soft text-success">
        <CheckCircle2 className="size-6" aria-hidden />
      </span>
      <div className="grid gap-1">
        <h2 className="text-lg font-semibold">Fatura importada</h2>
        <p className="text-sm text-muted-foreground">
          {result.purchases} compra{result.purchases === 1 ? "" : "s"}
          {result.credits > 0 && ` e ${result.credits} crédito${result.credits === 1 ? "" : "s"}`} lançados na fatura de{" "}
          {formatMonthLong(month).toLowerCase()} · {formatBRL(result.netCents)}
          {result.skipped > 0 &&
            ` · ${result.skipped} já existia${result.skipped === 1 ? "" : "m"} e fo${result.skipped === 1 ? "i" : "ram"} pulado${result.skipped === 1 ? "" : "s"}`}
        </p>
        <p className="text-xs text-muted-foreground">
          Se algo saiu errado, dá para desfazer em “Importações” na página do cartão.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Link
          href={`/cartoes/${card.id}?fatura=${month}`}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <ReceiptText className="size-4" aria-hidden /> Ver fatura
        </Link>
        <Button variant="secondary" onClick={onAgain}>
          Importar outra
        </Button>
      </div>
    </Card>
  );
}
