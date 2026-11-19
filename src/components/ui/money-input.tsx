"use client";

import { useState, type ComponentProps } from "react";
import { formatAmount, parseBRL } from "@/lib/money";
import { cn } from "@/lib/utils";

const MAX_DIGITS = 12; // até R$ 9.999.999.999,99

/** "1.234,56" | "" → "123456" (só dígitos, sem zeros à esquerda) */
function toDigits(text: string): string {
  return text.replace(/\D/g, "").replace(/^0+/, "").slice(0, MAX_DIGITS);
}

/**
 * Campo de valor em reais com máscara automática, como nos apps de banco:
 * basta digitar os números — 1 → 0,01 · 12 → 0,12 · 1234 → 12,34 · 123456 → 1.234,56.
 * Backspace apaga o último dígito. O valor enviado no formulário é "1.234,56".
 */
export function MoneyInput({
  defaultValue,
  className,
  onValueChange,
  ...props
}: Omit<ComponentProps<"input">, "type" | "defaultValue" | "value" | "onChange"> & {
  defaultValue?: string;
  onValueChange?: (cents: number | null) => void;
}) {
  const [digits, setDigits] = useState(() => {
    const cents = defaultValue ? parseBRL(defaultValue) : null;
    return cents && cents > 0 ? String(cents) : "";
  });

  const display = digits ? formatAmount(Number(digits)) : "";

  const update = (next: string) => {
    setDigits(next);
    onValueChange?.(next ? Number(next) : null);
  };

  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
        R$
      </span>
      <input
        {...props}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={display}
        onChange={(e) => update(toDigits(e.target.value))}
        onKeyDown={(e) => {
          // Backspace/Delete: com texto selecionado limpa o campo; senão remove o último dígito.
          if (e.key === "Backspace" || e.key === "Delete") {
            e.preventDefault();
            const el = e.currentTarget;
            const hasSelection = el.selectionStart !== null && el.selectionStart !== el.selectionEnd;
            update(hasSelection ? "" : digits.slice(0, -1));
          }
          props.onKeyDown?.(e);
        }}
        onFocus={(e) => {
          const el = e.currentTarget;
          requestAnimationFrame(() => el.setSelectionRange(el.value.length, el.value.length));
          props.onFocus?.(e);
        }}
        onClick={(e) => {
          const el = e.currentTarget;
          el.setSelectionRange(el.value.length, el.value.length);
          props.onClick?.(e);
        }}
        placeholder={props.placeholder ?? "0,00"}
        className={cn(
          "flex h-10 w-full rounded-lg border border-input bg-card pr-3 pl-10 text-sm tabular-nums shadow-xs outline-none transition-[border-color,box-shadow]",
          "placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25",
          "aria-invalid:border-danger aria-invalid:ring-danger/20",
          className,
        )}
      />
    </div>
  );
}
