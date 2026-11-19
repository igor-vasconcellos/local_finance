/**
 * Motor de rendimento das caixinhas (funções puras).
 *
 * Convenções (padrão de mercado simplificado):
 * - Capitalização DIÁRIA apenas em dias úteis (segunda a sexta), base 252.
 *   Feriados nacionais não são descontados (diferença pequena).
 * - Taxa diária do CDI = (1 + CDI anual)^(1/252) − 1.
 * - A caixinha rende "X% do CDI": fator do dia = 1 + taxa diária × X%.
 * - Dinheiro aplicado no dia D começa a render no próximo dia útil.
 * - Rendimento BRUTO (sem IR/IOF).
 */

import { addMonths, dayOfMonth, monthOf, type ISODate, type Month } from "./dates";

export type RatePoint = { annualRateBp: number; effectiveFrom: ISODate };
export type BoxTx = { type: "deposit" | "withdrawal"; amountCents: number; date: ISODate };

const MS_DAY = 86_400_000;

function toUTC(d: ISODate): number {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
}

function fromUTC(t: number): ISODate {
  return new Date(t).toISOString().slice(0, 10);
}

export function isBusinessDay(d: ISODate): boolean {
  const wd = new Date(toUTC(d)).getUTCDay();
  return wd !== 0 && wd !== 6;
}

/** Dias úteis (seg–sex) dentro do mês. */
export function businessDaysInMonth(m: Month): number {
  let n = 0;
  for (let t = toUTC(`${m}-01`); monthOf(fromUTC(t)) === m; t += MS_DAY) if (isBusinessDay(fromUTC(t))) n++;
  return n;
}

export function dailyCdiRate(annualRateBp: number): number {
  return Math.pow(1 + annualRateBp / 10000, 1 / 252) - 1;
}

/** Fator de um dia útil para uma caixinha que rende `cdiPercentBp` (11500 = 115%). */
export function dailyFactor(annualRateBp: number, cdiPercentBp: number): number {
  return 1 + dailyCdiRate(annualRateBp) * (cdiPercentBp / 10000);
}

/** Taxa vigente na data: a mais recente com effectiveFrom ≤ data; antes de todas, a mais antiga. */
export function rateOn(rates: RatePoint[], date: ISODate): number {
  if (!rates.length) return 0;
  const sorted = [...rates].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  let current = sorted[0].annualRateBp;
  for (const r of sorted) if (r.effectiveFrom <= date) current = r.annualRateBp;
  return current;
}

export type BalancePoint = { date: ISODate; balanceCents: number; contributedCents: number };

export type BoxSimulation = {
  /** Saldo com rendimento (em centavos, ainda não arredondado). */
  balance: number;
  /** Aportes − resgates. */
  contributed: number;
  /** Rendimento bruto acumulado = saldo − (aportes − resgates). */
  yieldTotal: number;
  /** Menor saldo logo após cada movimentação (para validar resgates). */
  minBalanceAfterTx: number;
  /** Um ponto por fim de mês + o dia final. */
  series: BalancePoint[];
};

/** Calcula o saldo de uma caixinha até `asOf`, dia a dia. */
export function simulateBox(
  txs: BoxTx[],
  rates: RatePoint[],
  cdiPercentBp: number,
  asOf: ISODate,
): BoxSimulation {
  const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));
  if (!sorted.length || sorted[0].date > asOf) {
    return { balance: 0, contributed: 0, yieldTotal: 0, minBalanceAfterTx: 0, series: [] };
  }

  const byDay = new Map<ISODate, BoxTx[]>();
  for (const tx of sorted) byDay.set(tx.date, [...(byDay.get(tx.date) ?? []), tx]);

  const sortedRates = [...rates].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  const start = sorted[0].date;
  let balance = 0;
  let contributed = 0;
  let minAfter = Infinity;
  const series: BalancePoint[] = [];
  const end = toUTC(asOf);

  for (let t = toUTC(start); t <= end; t += MS_DAY) {
    const day = fromUTC(t);
    if (day > start && balance > 0 && isBusinessDay(day)) {
      balance *= dailyFactor(rateOn(sortedRates, day), cdiPercentBp);
    }
    const todays = byDay.get(day);
    if (todays) {
      for (const tx of todays) {
        const signed = tx.type === "deposit" ? tx.amountCents : -tx.amountCents;
        balance += signed;
        contributed += signed;
      }
      minAfter = Math.min(minAfter, balance);
    }
    const next = fromUTC(t + MS_DAY);
    if (monthOf(next) !== monthOf(day) || t === end) {
      series.push({ date: day, balanceCents: Math.round(balance), contributedCents: contributed });
    }
  }

  return {
    balance,
    contributed,
    yieldTotal: balance - contributed,
    minBalanceAfterTx: minAfter === Infinity ? 0 : minAfter,
    series,
  };
}

/** Taxa efetiva de um mês com N dias úteis. */
export function monthlyRate(annualRateBp: number, cdiPercentBp: number, businessDays = 21): number {
  return Math.pow(dailyFactor(annualRateBp, cdiPercentBp), businessDays) - 1;
}

/** Rendimento esperado de um saldo ao longo do mês (dias úteis reais do mês). */
export function projectedMonthYield(balanceCents: number, annualRateBp: number, cdiPercentBp: number, month: Month): number {
  return balanceCents * monthlyRate(annualRateBp, cdiPercentBp, businessDaysInMonth(month));
}

/** Projeção dos próximos meses mantendo a taxa atual e um aporte mensal fixo. */
export function projectSeries(
  balanceCents: number,
  annualRateBp: number,
  cdiPercentBp: number,
  fromMonth: Month,
  months: number,
  monthlyDepositCents = 0,
): BalancePoint[] {
  const out: BalancePoint[] = [];
  let b = balanceCents;
  for (let i = 1; i <= months; i++) {
    const m = addMonths(fromMonth, i);
    b = b * (1 + monthlyRate(annualRateBp, cdiPercentBp, businessDaysInMonth(m))) + monthlyDepositCents;
    out.push({ date: dayOfMonth(m, 31), balanceCents: Math.round(b), contributedCents: 0 });
  }
  return out;
}

/**
 * Aporte mensal necessário para sair de `balance` e chegar a `goal` em `months`
 * aportes (o primeiro no mês atual), com o dinheiro rendendo `rate` ao mês.
 * Fórmula de série de pagamentos (anuidade).
 */
export function requiredMonthlyDeposit(balanceCents: number, goalCents: number, months: number, rate: number): number {
  if (goalCents <= balanceCents) return 0;
  if (months <= 1) return Math.max(0, Math.ceil(goalCents - balanceCents));
  if (rate <= 0) return Math.ceil((goalCents - balanceCents) / months);
  const growth = Math.pow(1 + rate, months);
  const pmt = ((goalCents - balanceCents * growth) * rate) / (growth - 1);
  return Math.max(0, Math.ceil(pmt));
}
