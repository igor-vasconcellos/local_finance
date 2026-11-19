import {
  Calculator,
  CreditCard,
  FileBarChart,
  LayoutDashboard,
  PiggyBank,
  Receipt,
  Settings,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; soon?: boolean };

export const NAV_SECTIONS: { title?: string; items: NavItem[] }[] = [
  {
    items: [
      { href: "/dashboard", label: "Visão geral", icon: LayoutDashboard },
      { href: "/relatorios", label: "Relatórios", icon: FileBarChart },
    ],
  },
  {
    title: "Planejamento",
    items: [
      { href: "/rendas", label: "Rendas", icon: TrendingUp },
      { href: "/gastos", label: "Gastos fixos", icon: Receipt },
      { href: "/cartoes", label: "Cartões", icon: CreditCard },
      { href: "/caixinhas", label: "Caixinhas", icon: PiggyBank },
    ],
  },
  {
    title: "Em breve",
    items: [
      { href: "/simulador", label: "Simulador", icon: Calculator, soon: true },
    ],
  },
  {
    title: "Sistema",
    items: [{ href: "/configuracoes", label: "Configurações", icon: Settings }],
  },
];
