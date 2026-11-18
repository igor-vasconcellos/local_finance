import {
  Calculator,
  CreditCard,
  LayoutDashboard,
  PiggyBank,
  Receipt,
  Settings,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; soon?: boolean };

export const NAV_SECTIONS: { title?: string; items: NavItem[] }[] = [
  { items: [{ href: "/dashboard", label: "Visão geral", icon: LayoutDashboard }] },
  {
    title: "Planejamento",
    items: [
      { href: "/rendas", label: "Rendas", icon: TrendingUp },
      { href: "/gastos", label: "Gastos fixos", icon: Receipt },
      { href: "/cartoes", label: "Cartões", icon: CreditCard },
    ],
  },
  {
    title: "Em breve",
    items: [
      { href: "/caixinhas", label: "Caixinhas", icon: PiggyBank, soon: true },
      { href: "/simulador", label: "Simulador", icon: Calculator, soon: true },
      { href: "/configuracoes", label: "Configurações", icon: Settings, soon: true },
    ],
  },
];
