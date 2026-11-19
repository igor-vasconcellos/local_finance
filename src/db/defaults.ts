import { categories, cdiRates, settings } from "@/db/schema";
import type { Tx } from "@/db/client";

/** Dados iniciais de cada conta nova: configurações, taxa CDI e categorias padrão. */

// CDI de referência (Selic 13,75% mantida pelo Copom em 04/11/2026 → CDI ≈ 13,65% a.a.).
// Ajustável depois em Configurações; novas taxas valem a partir da data informada.
export const INITIAL_CDI = { annualRateBp: 1365, effectiveFrom: "2026-11-05" };

export const INCOME_CATEGORIES = [
  { name: "Salário", icon: "briefcase", color: "#10b981" },
  { name: "Pró-labore", icon: "building-2", color: "#14b8a6" },
  { name: "Freelance", icon: "laptop", color: "#06b6d4" },
  { name: "Rendimentos", icon: "trending-up", color: "#22c55e" },
  { name: "Outras rendas", icon: "plus-circle", color: "#84cc16" },
];

export const EXPENSE_CATEGORIES = [
  { name: "Moradia", icon: "home", color: "#8b5cf6" },
  { name: "Contas da casa", icon: "zap", color: "#f59e0b" },
  { name: "Internet e telefone", icon: "wifi", color: "#3b82f6" },
  { name: "Assinaturas", icon: "repeat", color: "#ec4899" },
  { name: "Mercado", icon: "shopping-cart", color: "#f97316" },
  { name: "Alimentação", icon: "utensils", color: "#ef4444" },
  { name: "Transporte", icon: "car", color: "#0ea5e9" },
  { name: "Saúde", icon: "heart-pulse", color: "#e11d48" },
  { name: "Educação", icon: "graduation-cap", color: "#6366f1" },
  { name: "Lazer", icon: "party-popper", color: "#d946ef" },
  { name: "Compras", icon: "shopping-bag", color: "#a855f7" },
  { name: "Viagem", icon: "plane", color: "#0891b2" },
  { name: "Outros", icon: "circle-ellipsis", color: "#64748b" },
];

/** Idempotente: pode rodar de novo sem duplicar nada. */
export async function seedUserDefaults(tx: Tx, userId: number) {
  await tx.insert(settings).values({ userId }).onConflictDoNothing();
  await tx
    .insert(cdiRates)
    .values({ ...INITIAL_CDI, userId })
    .onConflictDoNothing();
  await tx
    .insert(categories)
    .values([
      ...INCOME_CATEGORIES.map((c) => ({
        ...c,
        userId,
        kind: "income" as const,
      })),
      ...EXPENSE_CATEGORIES.map((c) => ({
        ...c,
        userId,
        kind: "expense" as const,
      })),
    ])
    .onConflictDoNothing();
}
