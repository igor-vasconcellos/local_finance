import { Wallet } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** Logo + nome. Com `href`, vira link (ícone e nome clicáveis). */
export function Brand({
  className,
  subtitle,
  href,
  onNavigate,
}: {
  className?: string;
  subtitle?: string;
  href?: string;
  onNavigate?: () => void;
}) {
  const content = (
    <>
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <Wallet className="size-5" aria-hidden />
      </span>
      <div className="leading-tight">
        <p className="font-semibold tracking-tight">Local Finance</p>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        onClick={onNavigate}
        aria-label="Local Finance — ir para a Visão geral"
        title="Ir para a Visão geral"
        className={cn("flex items-center gap-3 rounded-xl transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-ring", className)}
      >
        {content}
      </Link>
    );
  }
  return <div className={cn("flex items-center gap-3", className)}>{content}</div>;
}
