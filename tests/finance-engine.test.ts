import { describe, expect, it } from "vitest";
import {
  addMonths,
  dayOfMonth,
  firstInvoiceFor,
  formatMonthLong,
  formatMonthShort,
  installmentSchedule,
  monthsBetween,
} from "@/lib/dates";
import { formatBRL, parseBRL, splitInstallments } from "@/lib/money";

describe("dinheiro", () => {
  it.each([
    ["1.234,56", 123456],
    ["1234,56", 123456],
    ["1234,5", 123450],
    ["1234.56", 123456],
    ["1234.5", 123450],
    ["R$ 1.234,56", 123456],
    ["1.234", 123400],
    ["1.234.567", 123456700],
    ["50", 5000],
    ["0,99", 99],
    [",5", 50],
  ])("parseBRL(%s) = %i centavos", (input, cents) => {
    expect(parseBRL(input)).toBe(cents);
  });

  it.each(["", "abc", "1,2,3", "1.23.4", "12,345", "1.2345"])("rejeita %s", (input) => {
    expect(parseBRL(input)).toBeNull();
  });

  it("formata em reais", () => {
    expect(formatBRL(123456)).toBe("R$ 1.234,56");
    expect(formatBRL(5)).toBe("R$ 0,05");
  });

  it("divide parcelas sem perder centavos (sobra vai para as primeiras)", () => {
    expect(splitInstallments(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(splitInstallments(200000, 12).reduce((a, b) => a + b)).toBe(200000);
    expect(splitInstallments(100, 1)).toEqual([100]);
    expect(splitInstallments(5, 3)).toEqual([2, 2, 1]);
    expect(() => splitInstallments(0, 2)).toThrow();
  });
});

describe("datas e competências", () => {
  it("soma meses atravessando o ano", () => {
    expect(addMonths("2026-11", 3)).toBe("2027-02");
    expect(addMonths("2027-01", -1)).toBe("2026-12");
    expect(monthsBetween("2026-11", "2027-11")).toBe(12);
  });

  it("ajusta dias 29–31 ao último dia do mês", () => {
    expect(dayOfMonth("2027-02", 31)).toBe("2027-02-28");
    expect(dayOfMonth("2028-02", 30)).toBe("2028-02-29"); // bissexto
    expect(dayOfMonth("2026-04", 31)).toBe("2026-04-30");
    expect(dayOfMonth("2026-12", 31)).toBe("2026-12-31");
  });

  it("formata meses em português", () => {
    expect(formatMonthShort("2026-12")).toBe("dez/2026");
    expect(formatMonthLong("2027-03")).toBe("Março de 2027");
  });
});

describe("fatura de destino de uma compra", () => {
  // Cartão tipo Nubank: fecha dia 3, vence dia 10 (mesmo mês).
  it("compra antes do fechamento entra na fatura do mês", () => {
    expect(firstInvoiceFor("2026-12-02", 3, 10)).toEqual({
      referenceMonth: "2026-12",
      closingDate: "2026-12-03",
      dueDate: "2026-12-10",
    });
  });

  it("compra NO dia do fechamento ou depois vai para a fatura seguinte", () => {
    expect(firstInvoiceFor("2026-12-03", 3, 10).referenceMonth).toBe("2027-01");
    expect(firstInvoiceFor("2026-11-18", 3, 10)).toEqual({
      referenceMonth: "2026-12",
      closingDate: "2026-12-03",
      dueDate: "2026-12-10",
    });
  });

  // Cartão tipo Itaú: fecha dia 28, vence dia 5 do mês seguinte.
  it("vencimento no mês seguinte ao fechamento", () => {
    expect(firstInvoiceFor("2026-11-18", 28, 5)).toEqual({
      referenceMonth: "2026-12",
      closingDate: "2026-11-28",
      dueDate: "2026-12-05",
    });
    expect(firstInvoiceFor("2026-11-29", 28, 5).referenceMonth).toBe("2027-01");
  });

  it("fechamento dia 31 em mês curto fecha no último dia", () => {
    // Fevereiro/2027 tem 28 dias: compra em 28/02 já é no fechamento → próxima fatura.
    expect(firstInvoiceFor("2027-02-27", 31, 10)).toMatchObject({ closingDate: "2027-02-28", referenceMonth: "2027-03" });
    expect(firstInvoiceFor("2027-02-28", 31, 10)).toMatchObject({ closingDate: "2027-03-31", referenceMonth: "2027-04" });
  });

  it("12 parcelas caem em 12 faturas consecutivas, atravessando o ano", () => {
    const s = installmentSchedule("2026-11-18", 12, 3, 10);
    expect(s).toHaveLength(12);
    expect(s[0].referenceMonth).toBe("2026-12");
    expect(s[1].referenceMonth).toBe("2027-01");
    expect(s[11].referenceMonth).toBe("2027-11");
    expect(s[2].dueDate).toBe("2027-02-10");
    expect(new Set(s.map((x) => x.referenceMonth)).size).toBe(12);
  });

  it("parcelas de cartão com fechamento 30 mantêm um mês por fatura (sem pular fevereiro)", () => {
    const s = installmentSchedule("2027-01-15", 3, 30, 7);
    expect(s.map((x) => x.closingDate)).toEqual(["2027-01-30", "2027-02-28", "2027-03-30"]);
    expect(s.map((x) => x.referenceMonth)).toEqual(["2027-02", "2027-03", "2027-04"]);
  });
});
