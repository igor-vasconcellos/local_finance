"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { cn } from "@/lib/utils";

/**
 * Painel flutuante ancorado num elemento, usando a Popover API nativa:
 * fica acima de tudo (inclusive de modais), fecha com Esc ou clique fora.
 */
export function usePopover(anchorRef: RefObject<HTMLElement | null>) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const position = useCallback(() => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const r = anchor.getBoundingClientRect();
    const h = panel.offsetHeight;
    const w = panel.offsetWidth;
    // Abre para baixo; se não couber e houver mais espaço acima, abre para cima.
    const below = r.bottom + 6 + h <= window.innerHeight || r.top < window.innerHeight - r.bottom;
    const top = below ? r.bottom + 6 : r.top - h - 6;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
    panel.style.top = `${Math.max(8, top)}px`;
    panel.style.left = `${left}px`;
  }, [anchorRef]);

  const show = useCallback(() => {
    const panel = panelRef.current;
    if (!panel || panel.matches(":popover-open")) return;
    panel.showPopover();
    position();
  }, [position]);

  const hide = useCallback(() => {
    const panel = panelRef.current;
    if (panel?.matches(":popover-open")) panel.hidePopover();
  }, []);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const onToggle = (e: Event) => setOpen((e as ToggleEvent).newState === "open");
    panel.addEventListener("toggle", onToggle);
    return () => panel.removeEventListener("toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    // O conteúdo só é desenhado depois de abrir: reposiciona com a altura real.
    const raf = requestAnimationFrame(position);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open, position]);

  return { panelRef, open, show, hide, toggle: () => (open ? hide() : show()) };
}

export function PopoverPanel({
  panelRef,
  children,
  className,
  label,
}: {
  panelRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <div
      ref={panelRef}
      popover="auto"
      role="dialog"
      aria-label={label}
      className={cn(
        "fixed m-0 rounded-2xl border bg-card p-3 text-card-foreground shadow-xl [inset:unset]",
        className,
      )}
    >
      {children}
    </div>
  );
}
