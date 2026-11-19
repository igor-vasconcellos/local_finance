"use client";

import { Check, X } from "lucide-react";
import { passwordChecks } from "@/lib/auth/password-policy";
import { cn } from "@/lib/utils";

/** Lista dos critérios de senha forte, atualizada enquanto a pessoa digita. */
export function PasswordStrength({ password, name, email }: { password: string; name?: string; email?: string }) {
  const checks = passwordChecks(password, { name, email });
  const done = checks.filter((c) => c.ok).length;
  const level = password ? (done === checks.length ? 3 : done >= 5 ? 2 : 1) : 0;
  const tone = ["bg-muted", "bg-danger", "bg-warning", "bg-success"][level];
  const label = ["", "Fraca", "Quase lá", "Forte"][level];

  return (
    <div className="grid gap-2" aria-live="polite">
      <div className="flex items-center gap-3">
        <div className="grid flex-1 grid-cols-3 gap-1" aria-hidden>
          {[1, 2, 3].map((i) => (
            <span key={i} className={cn("h-1.5 rounded-full transition-colors", level >= i ? tone : "bg-muted")} />
          ))}
        </div>
        {label && <span className="w-16 text-right text-xs font-medium text-muted-foreground">{label}</span>}
      </div>
      <ul className="grid gap-1 text-xs sm:grid-cols-2">
        {checks.map((c) => (
          <li key={c.id} className={cn("flex items-center gap-1.5", c.ok ? "text-success" : "text-muted-foreground")}>
            {c.ok ? <Check className="size-3.5 shrink-0" aria-hidden /> : <X className="size-3.5 shrink-0" aria-hidden />}
            <span>
              {c.label}
              <span className="sr-only">{c.ok ? " — ok" : " — pendente"}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
