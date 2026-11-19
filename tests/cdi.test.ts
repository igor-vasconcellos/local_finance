import { describe, expect, it } from "vitest";
import {
  businessDaysInMonth,
  dailyCdiRate,
  isBusinessDay,
  monthlyRate,
  rateOn,
  requiredMonthlyDeposit,
  simulateBox,
} from "@/lib/cdi";

const CDI = [{ annualRateBp: 1365, effectiveFrom: "2026-01-01" }];

describe("dias úteis", () => {
  it("segunda a sexta contam; sábado e domingo não", async () => {
    expect(isBusinessDay("2026-11-16")).toBe(true); // segunda
    expect(isBusinessDay("2026-11-20")).toBe(true); // sexta
    expect(isBusinessDay("2026-11-21")).toBe(false); // sábado
    expect(isBusinessDay("2026-11-22")).toBe(false); // domingo
  });
  it("conta dias úteis do mês", async () => {
    expect(businessDaysInMonth("2026-11")).toBe(21);
    expect(businessDaysInMonth("2027-02")).toBe(20);
  });
});

describe("taxas", () => {
  it("taxa diária base 252: 252 dias úteis reproduzem a taxa anual", async () => {
    expect(Math.pow(1 + dailyCdiRate(1365), 252) - 1).toBeCloseTo(0.1365, 10);
  });
  it("taxa vigente por data, com histórico", async () => {
    const rates = [
      { annualRateBp: 1365, effectiveFrom: "2026-11-05" },
      { annualRateBp: 1400, effectiveFrom: "2027-01-01" },
    ];
    expect(rateOn(rates, "2026-12-31")).toBe(1365);
    expect(rateOn(rates, "2027-01-01")).toBe(1400);
    expect(rateOn(rates, "2026-01-01")).toBe(1365);
  });
});

describe("simulação de caixinha", () => {
  it("dinheiro aplicado começa a render no próximo dia útil", async () => {
    const tx = [{ type: "deposit" as const, amountCents: 1_000_000, date: "2026-11-20" }]; // sexta
    expect(simulateBox(tx, CDI, 10000, "2026-11-20").yieldTotal).toBe(0);
    expect(simulateBox(tx, CDI, 10000, "2026-11-22").yieldTotal).toBe(0); // fim de semana
    const monday = simulateBox(tx, CDI, 10000, "2026-11-23");
    expect(monday.yieldTotal).toBeCloseTo(1_000_000 * dailyCdiRate(1365), 6);
  });

  it("115% do CDI rende 1,15× a taxa diária", async () => {
    const tx = [{ type: "deposit" as const, amountCents: 1_000_000, date: "2026-11-20" }];
    const r100 = simulateBox(tx, CDI, 10000, "2026-11-23").yieldTotal;
    const r115 = simulateBox(tx, CDI, 11500, "2026-11-23").yieldTotal;
    expect(r115 / r100).toBeCloseTo(1.15, 6);
  });

  it("um ano útil a 100% do CDI rende ≈ a taxa anual", async () => {
    const tx = [{ type: "deposit" as const, amountCents: 1_000_000, date: "2025-12-31" }];
    const s = simulateBox(tx, CDI, 10000, "2026-12-31");
    // 2026 tem 261 dias úteis (seg–sex, sem descontar feriados): um pouco acima de 13,65%.
    const expected = Math.pow(1 + dailyCdiRate(1365), 261) - 1;
    expect(s.yieldTotal / 1_000_000).toBeCloseTo(expected, 8);
    expect(s.series).toHaveLength(13); // dez/2025 + 12 meses
  });

  it("resgate reduz o saldo e o aportado; saldo mínimo detecta resgate maior que o saldo", async () => {
    const ok = simulateBox(
      [
        { type: "deposit", amountCents: 100_000, date: "2026-11-02" },
        { type: "withdrawal", amountCents: 40_000, date: "2026-11-10" },
      ],
      CDI,
      10000,
      "2026-11-30",
    );
    expect(ok.contributed).toBe(60_000);
    expect(ok.balance).toBeGreaterThan(60_000);
    expect(ok.minBalanceAfterTx).toBeGreaterThan(0);

    const bad = simulateBox(
      [
        { type: "deposit", amountCents: 100_000, date: "2026-11-02" },
        { type: "withdrawal", amountCents: 200_000, date: "2026-11-10" },
      ],
      CDI,
      10000,
      "2026-11-30",
    );
    expect(bad.minBalanceAfterTx).toBeLessThan(0);
  });

  it("mudança de taxa no meio do período passa a valer a partir da data", async () => {
    const tx = [{ type: "deposit" as const, amountCents: 1_000_000, date: "2026-11-30" }];
    const flat = simulateBox(tx, CDI, 10000, "2026-12-31").yieldTotal;
    const higher = simulateBox(tx, [...CDI, { annualRateBp: 2000, effectiveFrom: "2026-12-15" }], 10000, "2026-12-31").yieldTotal;
    expect(higher).toBeGreaterThan(flat);
  });

  it("sem movimentações, tudo zero", async () => {
    expect(simulateBox([], CDI, 11500, "2026-11-30")).toMatchObject({ balance: 0, yieldTotal: 0, series: [] });
  });
});

describe("metas", () => {
  it("aporte mensal para chegar à meta considerando rendimento", async () => {
    const r = monthlyRate(1365, 10000);
    const pmt = requiredMonthlyDeposit(0, 1_200_000, 12, r);
    expect(pmt).toBeLessThan(100_000); // rendimento ajuda: menos que 12.000/12
    expect(pmt).toBeGreaterThan(90_000);
    // conferência: 12 aportes rendendo chegam à meta
    let b = 0;
    for (let i = 0; i < 12; i++) b = b * (1 + r) + pmt;
    expect(b).toBeGreaterThanOrEqual(1_200_000 - 1);
  });
  it("meta já atingida → 0; último mês → falta tudo", async () => {
    expect(requiredMonthlyDeposit(500_000, 400_000, 6, 0.01)).toBe(0);
    expect(requiredMonthlyDeposit(100_000, 400_000, 1, 0.01)).toBe(300_000);
    expect(requiredMonthlyDeposit(0, 120_000, 12, 0)).toBe(10_000);
  });
});
