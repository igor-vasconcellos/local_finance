import { Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

export function Brand({ className, subtitle }: { className?: string; subtitle?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span className="inline-flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <Wallet className="size-5" aria-hidden />
      </span>
      <div className="leading-tight">
        <p className="font-semibold tracking-tight">Local Finance</p>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}
