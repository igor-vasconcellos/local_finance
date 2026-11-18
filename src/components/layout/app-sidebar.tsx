"use client";

import { LogOut, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/server/actions/auth";
import { Brand } from "./brand";
import { NAV_SECTIONS } from "./nav-items";
import { ThemeToggle } from "./theme-toggle";

type User = { name: string; email: string };

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="grid gap-6" aria-label="Navegação principal">
      {NAV_SECTIONS.map((section, i) => (
        <div key={i} className="grid gap-1">
          {section.title && (
            <p className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground/80 uppercase">
              {section.title}
            </p>
          )}
          {section.items.map(({ href, label, icon: Icon, soon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            if (soon) {
              return (
                <span
                  key={href}
                  className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground/60"
                  aria-disabled
                >
                  <Icon className="size-4" aria-hidden />
                  {label}
                </span>
              );
            }
            return (
              <Link
                key={href}
                href={href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors",
                  "hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
                  active && "bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function UserFooter({ user }: { user: User }) {
  return (
    <div className="grid gap-3 border-t pt-4">
      <ThemeToggle />
      <div className="flex items-center gap-3">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
          {initials(user.name)}
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            aria-label="Sair"
            title="Sair"
            className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <LogOut className="size-4" aria-hidden />
          </button>
        </form>
      </div>
    </div>
  );
}

export function AppSidebar({ user }: { user: User }) {
  const [open, setOpen] = useState(false);

  // Trava a rolagem do fundo enquanto o menu do celular está aberto.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {/* Desktop */}
      <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col gap-8 border-r bg-card/40 px-4 py-6 lg:flex">
        <Brand className="px-2" />
        <div className="flex-1 overflow-y-auto">
          <NavLinks />
        </div>
        <UserFooter user={user} />
      </aside>

      {/* Celular: barra superior + gaveta */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/85 px-4 backdrop-blur lg:hidden">
        <Brand />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
          aria-expanded={open}
          className="inline-flex size-9 items-center justify-center rounded-lg hover:bg-muted"
        >
          <Menu className="size-5" aria-hidden />
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col gap-8 border-r bg-background px-4 py-5 shadow-xl">
            <div className="flex items-center justify-between">
              <Brand className="px-2" />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar menu"
                className="inline-flex size-9 items-center justify-center rounded-lg hover:bg-muted"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <NavLinks onNavigate={() => setOpen(false)} />
            </div>
            <UserFooter user={user} />
          </div>
        </div>
      )}
    </>
  );
}
