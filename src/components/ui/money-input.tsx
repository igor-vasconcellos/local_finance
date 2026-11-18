"use client";

import { useState, type ComponentProps } from "react";
import { formatAmount, parseBRL } from "@/lib/money";
import { cn } from "@/lib/utils";

/** Campo de valor em reais: aceita "1234,5" e formata para "1.234,50" ao sair do campo. */
export function MoneyInput({
  defaultValue,
  className,
  onValueChange,
  ...props
}: Omit<ComponentProps<"input">, "type" | "defaultValue" | "value" | "onChange"> & {
  defaultValue?: string;
  onValueChange?: (cents: number | null) => void;
}) {
  const [value, setValue] = useState(defaultValue ?? "");

  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
        R$
      </span>
      <input
        {...props}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(e) => {
          const next = e.target.value.replace(/[^\d.,]/g, "");
          setValue(next);
          onValueChange?.(parseBRL(next));
        }}
        onBlur={(e) => {
          const cents = parseBRL(value);
          if (cents !== null) setValue(formatAmount(cents));
          props.onBlur?.(e);
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
