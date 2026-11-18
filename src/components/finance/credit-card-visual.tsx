import { Nfc } from "lucide-react";
import { cn } from "@/lib/utils";

/** Representação visual do cartão (gradiente na cor escolhida). */
export function CreditCardVisual({
  name,
  institution,
  color,
  closingDay,
  dueDay,
  inactive,
  className,
}: {
  name: string;
  institution: string | null;
  color: string | null;
  closingDay: number;
  dueDay: number;
  inactive?: boolean;
  className?: string;
}) {
  const base = color ?? "#7c3aed";
  return (
    <div
      className={cn(
        "relative flex aspect-[1.586] w-full flex-col justify-between overflow-hidden rounded-2xl p-5 text-white shadow-md",
        inactive && "grayscale",
        className,
      )}
      style={{
        background: `radial-gradient(120% 120% at 100% 0%, color-mix(in oklch, ${base} 55%, white) 0%, ${base} 45%, color-mix(in oklch, ${base} 70%, black) 100%)`,
      }}
    >
      <div aria-hidden className="absolute -right-10 -bottom-16 size-48 rounded-full bg-white/10" />
      <div aria-hidden className="absolute -right-2 -bottom-24 size-48 rounded-full bg-white/5" />
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium tracking-wide text-white/75 uppercase">{institution ?? "Cartão"}</p>
          <p className="truncate text-lg font-semibold">{name}</p>
        </div>
        <Nfc className="size-6 shrink-0 text-white/80" aria-hidden />
      </div>
      <div className="relative flex items-end justify-between gap-2 text-xs">
        <div aria-hidden className="h-7 w-10 rounded-md bg-gradient-to-br from-amber-200 to-amber-500 opacity-90" />
        <div className="text-right leading-tight text-white/85">
          <p>Fecha dia {closingDay}</p>
          <p>Vence dia {dueDay}</p>
        </div>
      </div>
    </div>
  );
}
