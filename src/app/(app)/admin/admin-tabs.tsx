"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin", label: "Visão geral" },
  { href: "/admin/usuarios", label: "Usuários" },
  { href: "/admin/funcionalidades", label: "Funcionalidades" },
  { href: "/admin/auditoria", label: "Auditoria" },
];

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Seções do painel" className="mb-8 flex gap-1 overflow-x-auto rounded-xl border bg-card p-1">
      {TABS.map((t) => {
        const active = t.href === "/admin" ? pathname === "/admin" : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              active && "bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
