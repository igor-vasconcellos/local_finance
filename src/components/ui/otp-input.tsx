"use client";

import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

/**
 * Campo de código com N caixas (padrão 6). Aceita colar o código inteiro,
 * navega com setas/backspace e chama onComplete quando todas estão preenchidas.
 * O valor final vai num <input type="hidden" name={name}> para o form.
 */
export function OtpInput({
  name = "code",
  length = 6,
  invalid,
  disabled,
  autoFocus,
  onComplete,
}: {
  name?: string;
  length?: number;
  invalid?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  onComplete?: (code: string) => void;
}) {
  const [digits, setDigits] = useState<string[]>(() => Array(length).fill(""));
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const focus = (i: number) => refs.current[Math.max(0, Math.min(length - 1, i))]?.focus();

  const update = (next: string[]) => {
    setDigits(next);
    if (next.every((d) => d !== "")) onComplete?.(next.join(""));
  };

  const fillFrom = (start: number, text: string) => {
    const chars = text.replace(/\D/g, "").slice(0, length - start).split("");
    if (!chars.length) return;
    const next = [...digits];
    chars.forEach((c, k) => (next[start + k] = c));
    update(next);
    focus(start + chars.length);
  };

  const onKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      const next = [...digits];
      if (next[i]) {
        next[i] = "";
      } else if (i > 0) {
        next[i - 1] = "";
        focus(i - 1);
      }
      setDigits(next);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focus(i - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focus(i + 1);
    }
  };

  const onPaste = (i: number, e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    fillFrom(i, e.clipboardData.getData("text"));
  };

  return (
    <div className="grid grid-cols-6 gap-2" role="group" aria-label="Código de verificação">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          pattern="[0-9]*"
          maxLength={length}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          aria-label={`Dígito ${i + 1} de ${length}`}
          aria-invalid={invalid || undefined}
          onChange={(e) => fillFrom(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={(e) => onPaste(i, e)}
          onFocus={(e) => e.target.select()}
          className={cn(
            "h-12 w-full min-w-0 rounded-xl border border-input bg-card text-center font-mono text-xl font-semibold shadow-xs outline-none transition-[border-color,box-shadow]",
            "focus:border-ring focus:ring-[3px] focus:ring-ring/25",
            "aria-invalid:border-danger aria-invalid:ring-danger/20",
            "disabled:opacity-60",
          )}
        />
      ))}
      <input type="hidden" name={name} value={digits.join("")} />
    </div>
  );
}
