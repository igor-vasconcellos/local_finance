/**
 * Conversão de taxas compostas. Os bancos mostram o CDI do mês (ex.: 1,07% a.m.);
 * guardamos a taxa anual equivalente: (1 + mensal)^12 − 1.
 * Taxas em basis points: 1365 = 13,65%; 107 = 1,07%.
 */

/** 1,07% a.m. → 13,62% a.a. (valores em %) */
export function monthlyToAnnualPct(monthlyPct: number): number {
  return (Math.pow(1 + monthlyPct / 100, 12) - 1) * 100;
}

/** 13,65% a.a. → 1,0727% a.m. (valores em %) */
export function annualToMonthlyPct(annualPct: number): number {
  return (Math.pow(1 + annualPct / 100, 1 / 12) - 1) * 100;
}

/** Taxa em % → basis points inteiros (arredondado). */
export function pctToBp(pct: number): number {
  return Math.round(pct * 100);
}

export function bpToPct(bp: number): number {
  return bp / 100;
}

/** "1,07" / "1.07" / "13,65%" → 1.07 (número) ou null. */
export function parsePct(input: string): number | null {
  const s = input.replace("%", "").replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

/** 13.6249 → "13,62%"; casas configuráveis. */
export function formatPct(pct: number, decimals = 2): string {
  return `${pct.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}%`;
}
