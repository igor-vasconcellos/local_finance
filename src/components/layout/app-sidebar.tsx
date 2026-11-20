"use client";

import { Lock, LogOut, Menu, PanelLeftClose, PanelLeftOpen, ShieldCheck, Wallet, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/server/actions/auth";
import { Avatar } from "./avatar";
import { Brand } from "./brand";
import { NAV_SECTIONS, type NavItem } from "./nav-items";
import { SIDEBAR_COOKIE } from "./sidebar-config";
import { ThemeToggle } from "./theme-toggle";

type User = { name: string; email: string; avatarColor: string | null };

/** O que muda no menu conforme o acesso da conta. */
export type NavAccess = { isAdmin: boolean; lockedHrefs: string[] };

const ADMIN_SECTION: { title?: string; items: NavItem[] } = {
  title: "Administração",
  items: [{ href: "/admin", label: "Painel admin", icon: ShieldCheck }],
};

function NavLinks({ collapsed, onNavigate, access }: { collapsed?: boolean; onNavigate?: () => void; access: NavAccess }) {
  const pathname = usePathname();
  const sections = access.isAdmin ? [...NAV_SECTIONS, ADMIN_SECTION] : NAV_SECTIONS;
  return (
    <nav className={cn("grid", collapsed ? "gap-3" : "gap-6")} aria-label="Navegação principal">
      {sections.map((section, i) => (
        <div key={i} className="grid gap-1">
          {section.title &&
            (collapsed ? (
              i > 0 && <hr className="mx-2 mb-2 border-border" />
            ) : (
              <p className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground/80 uppercase">
                {section.title}
              </p>
            ))}
          {section.items.map(({ href, label, icon: Icon, soon }) => {
            const isLocked = access.lockedHrefs.includes(href);
            const active = pathname === href || pathname.startsWith(`${href}/`);
            const cls = cn(
              "flex items-center gap-3 rounded-lg py-2 text-sm font-medium transition-colors",
              collapsed ? "justify-center px-0" : "px-3",
            );
            if (soon) {
              return (
                <span
                  key={href}
                  className={cn(cls, "cursor-not-allowed text-muted-foreground/60")}
                  aria-disabled
                  title={collapsed ? `${label} (em breve)` : undefined}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  {collapsed ? <span className="sr-only">{label}</span> : label}
                </span>
              );
            }
            return (
              <Link
                key={href}
                href={href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                title={collapsed ? (isLocked ? `${label} (indisponível)` : label) : isLocked ? "Indisponível no momento" : undefined}
                className={cn(
                  cls,
                  "text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
                  active && "bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <Icon className={cn("shrink-0", collapsed ? "size-[18px]" : "size-4")} aria-hidden />
                {collapsed ? <span className="sr-only">{label}</span> : label}
                {isLocked && !collapsed && <Lock className="ml-auto size-3.5 text-muted-foreground/70" aria-label="indisponível" />}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function LogoutButton() {
  return (
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
  );
}

function UserFooter({ user, collapsed }: { user: User; collapsed?: boolean }) {
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-3 border-t pt-4">
        <ThemeToggle vertical />
        <Link href="/configuracoes#conta" title={`${user.name} · ${user.email}`} aria-label="Perfil">
          <Avatar name={user.name} color={user.avatarColor} />
        </Link>
        <LogoutButton />
      </div>
    );
  }
  return (
    <div className="grid gap-3 border-t pt-4">
      <ThemeToggle />
      <div className="flex items-center gap-3">
        <Link href="/configuracoes#conta" aria-label="Perfil" title="Perfil">
          <Avatar name={user.name} color={user.avatarColor} />
        </Link>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>
        <LogoutButton />
      </div>
    </div>
  );
}

export function AppSidebar({ user, defaultCollapsed, access }: { user: User; defaultCollapsed: boolean; access: NavAccess }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    // Lembrado entre visitas (o servidor lê o cookie e já renderiza no estado certo).
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
  };

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
      <aside
        className={cn(
          "sticky top-0 hidden h-svh shrink-0 flex-col gap-6 border-r bg-card/40 py-6 transition-[width] duration-200 lg:flex",
          collapsed ? "w-[72px] cursor-e-resize px-3 hover:bg-muted/40" : "w-64 px-4",
        )}
        aria-label="Barra lateral"
        title={collapsed ? "Clique para expandir" : undefined}
        onClick={(e) => {
          // Recolhida: clicar em qualquer espaço vazio (fora de links/botões) expande.
          if (collapsed && !(e.target as HTMLElement).closest("a, button, input, select, label, form")) toggleCollapsed();
        }}
      >
        <div className={cn("flex items-center", collapsed ? "flex-col gap-3" : "justify-between gap-2")}>
          {collapsed ? (
            <Link href="/dashboard" aria-label="BeaconFinance — Visão geral" title="BeaconFinance">
              <span className="inline-flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                <Wallet className="size-5" aria-hidden />
              </span>
            </Link>
          ) : (
            <Brand className="px-2" href="/dashboard" />
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expandir barra lateral" : "Recolher barra lateral"}
            aria-expanded={!collapsed}
            title={collapsed ? "Expandir" : "Recolher"}
            className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            {collapsed ? <PanelLeftOpen className="size-4" aria-hidden /> : <PanelLeftClose className="size-4" aria-hidden />}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <NavLinks collapsed={collapsed} access={access} />
        </div>
        <UserFooter user={user} collapsed={collapsed} />
      </aside>

      {/* Celular: barra superior + gaveta */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/85 px-4 backdrop-blur lg:hidden">
        <Brand href="/dashboard" />
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
              <Brand className="px-2" href="/dashboard" onNavigate={() => setOpen(false)} />
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
              <NavLinks onNavigate={() => setOpen(false)} access={access} />
            </div>
            <UserFooter user={user} />
          </div>
        </div>
      )}
    </>
  );
}
