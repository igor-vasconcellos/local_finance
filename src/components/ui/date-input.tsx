"use client";

import { CalendarDays } from "lucide-react";
import { useRef, useState, type ComponentProps } from "react";
import {
  brToISO,
  brToMonth,
  currentMonth,
  isoToBR,
  maskDateBR,
  maskMonthBR,
  monthToBR,
  todayISO,
  type ISODate,
  type Month,
} from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Calendar, MonthGrid } from "./calendar";
import { PopoverPanel, usePopover } from "./popover";

type BaseProps = Omit<ComponentProps<"input">, "type" | "value" | "defaultValue" | "onChange" | "min" | "max" | "name">;

const inputCls = cn(
  "flex h-10 w-full rounded-lg border border-input bg-card pr-10 pl-3 text-sm tabular-nums shadow-xs outline-none transition-[border-color,box-shadow]",
  "placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25",
  "aria-invalid:border-danger aria-invalid:ring-danger/20 disabled:opacity-60",
);
const iconBtn =
  "absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring";

/**
 * Campo de data no formato dd/mm/aaaa, com calendário em português.
 * Digite só os números (as barras entram sozinhas) ou escolha no calendário.
 * Envia no formulário o valor ISO (aaaa-mm-dd) no campo `name`.
 */
export function DateInput({
  name,
  value,
  defaultValue,
  onValueChange,
  min,
  max,
  className,
  ...props
}: BaseProps & {
  name: string;
  value?: ISODate | null;
  defaultValue?: ISODate | null;
  onValueChange?: (iso: ISODate | null) => void;
  min?: ISODate;
  max?: ISODate;
}) {
  const controlled = value !== undefined;
  const [inner, setInner] = useState<ISODate | null>(defaultValue ?? null);
  const iso = controlled ? value : inner;
  const [text, setText] = useState(isoToBR(iso));
  const [lastIso, setLastIso] = useState(iso);
  if (iso !== lastIso) {
    // Valor mudou por fora (ex.: formulário resetado) → atualiza o texto.
    setLastIso(iso);
    if (brToISO(text) !== iso) setText(isoToBR(iso));
  }

  const wrapRef = useRef<HTMLDivElement>(null);
  const pop = usePopover(wrapRef);

  const commit = (next: ISODate | null) => {
    if (!controlled) setInner(next);
    setLastIso(next);
    onValueChange?.(next);
  };

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <input
        {...props}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={props.placeholder ?? "dd/mm/aaaa"}
        value={text}
        onChange={(e) => {
          const t = maskDateBR(e.target.value);
          setText(t);
          const parsed = brToISO(t);
          if (parsed || t === "") commit(parsed);
        }}
        onBlur={(e) => {
          if (text && !brToISO(text)) commit(null);
          props.onBlur?.(e);
        }}
        className={inputCls}
      />
      <button type="button" className={iconBtn} onClick={pop.toggle} aria-label="Abrir calendário" aria-expanded={pop.open}>
        <CalendarDays className="size-4" aria-hidden />
      </button>
      <input type="hidden" name={name} value={iso ?? (text ? "invalid" : "")} />
      <PopoverPanel panelRef={pop.panelRef} label="Calendário">
        {pop.open && (
          <Calendar
            value={iso}
            today={todayISO()}
            min={min}
            max={max}
            onSelect={(d) => {
              setText(isoToBR(d));
              commit(d);
              pop.hide();
            }}
          />
        )}
      </PopoverPanel>
    </div>
  );
}

/** Campo de mês no formato mm/aaaa, com seletor de meses. Envia "aaaa-mm" no campo `name`. */
export function MonthInput({
  name,
  defaultValue,
  optional,
  className,
  ...props
}: BaseProps & { name: string; defaultValue?: Month | null; optional?: boolean }) {
  const [month, setMonth] = useState<Month | null>(defaultValue ?? null);
  const [text, setText] = useState(monthToBR(defaultValue));
  const wrapRef = useRef<HTMLDivElement>(null);
  const pop = usePopover(wrapRef);

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <input
        {...props}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={props.placeholder ?? "mm/aaaa"}
        value={text}
        onChange={(e) => {
          const t = maskMonthBR(e.target.value);
          setText(t);
          const parsed = brToMonth(t);
          if (parsed || t === "") setMonth(parsed);
        }}
        onBlur={(e) => {
          if (text && !brToMonth(text)) setMonth(null);
          props.onBlur?.(e);
        }}
        className={inputCls}
      />
      <button type="button" className={iconBtn} onClick={pop.toggle} aria-label="Escolher mês" aria-expanded={pop.open}>
        <CalendarDays className="size-4" aria-hidden />
      </button>
      <input type="hidden" name={name} value={month ?? (text ? "invalid" : "")} />
      <PopoverPanel panelRef={pop.panelRef} label="Escolher mês">
        {pop.open && (
          <>
            <MonthGrid
              value={month}
              current={currentMonth()}
              onSelect={(m) => {
                setMonth(m);
                setText(monthToBR(m));
                pop.hide();
              }}
            />
            {optional && month && (
              <button
                type="button"
                className="mt-2 w-full rounded-lg py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => {
                  setMonth(null);
                  setText("");
                  pop.hide();
                }}
              >
                Limpar
              </button>
            )}
          </>
        )}
      </PopoverPanel>
    </div>
  );
}
