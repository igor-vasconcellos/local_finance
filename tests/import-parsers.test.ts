import { describe, expect, it } from "vitest";
import {
  checkTotals,
  cleanDescription,
  merchantKey,
  parseCsvStatement,
  parsePdfStatement,
  suggestCategoryName,
} from "@/lib/import";
import { extractInstallment, inferYear, parseAmount } from "@/lib/import/text";

/*
 * Fixtures com o MESMO formato das faturas reais, mas com dados fictícios
 * (nomes, endereços e finais de cartão inventados). Faturas reais nunca entram no repositório.
 * As linhas imitam a saída do extrator de PDF: células separadas por dois espaços.
 */

const MERCADO_PAGO = [
  "Fulano de Tal",
  "Emitida em:  06/11/2026",
  "Total a pagar  Vence em  Limite total  Saque total",
  "10/11/2026  R$ 900,00  R$ 50,00",
  "Consumos de 06/10 a 05/11  R$ 120,40  Juros do mês anterior  R$ 0,00",
  "Fulano de Tal",
  "Vencimento: 10/11/2026",
  "Movimentações na fatura",
  "Data  Movimentações  Valor em R$",
  "05/11  Pagamento da fatura de novembro/2026  R$ 98,00",
  "Cartão Visa [************1111]",
  "Data  Movimentações  Valor em R$",
  "10/10  Leitura  R$ 49,90",
  "21/10  MP*LOJINHA  R$ 32,00",
  "23/10  DL  *UberRides  R$ 7,62",
  "Total  R$ 89,52",
  "Cartão Visa [************2222]",
  "Data  Movimentações  Valor em R$",
  "12/10  JET PATINETES  R$ 10,00",
  "12/10  JET PATINETES  R$ 10,00",
  "18/10  IFD*12345678 RESTAURANTE  R$ 10,88",
  "Total  R$ 30,88",
  "Fechamento da fatura  05/11/2026",
  "Próximo fechamento  05/12/2026",
  "Crédito Mercado Pago",
];

const PICPAY = [
  "FULANO DE TAL,",
  "Rua Exemplo, 1, CENTRO, 00000000",
  "Vencimento:  10/01/2027  Fechamento:  04/01/2027",
  "PicPay Mastercard® GOLD",
  "Fatura anterior  245,40  Limite total  300,00",
  "Créditos e estornos  -1,13  Limite disponível  156,00",
  "Despesas do mês  46,36",
  "Picpay Card",
  "Total geral dos lançamentos  46,36",
  "Data  Estabelecimento  Valor (R$)",
  "28/12  UBER  2,02",
  "29/12  DEVOLUCAO COMPRA REAL  -0,57",
  "30/12  PAGAMENTO DE FATURA  -245,40",
  "02/01  LOJA DE MOVEIS PARC 03/10  19,87",
  "03/01  DEVOLUCAO COMPRA REAL  -0,56",
  "Subtotal dos lançamentos  21,89",
  "FULANO T SILVA",
  "Picpay Card final 9999",
  "Data  Estabelecimento  Valor (R$)",
  "21/12  KIM+ TECNOLOGIA EM MOB  10,00",
  "28/12  MP *ACAI DO BAIRRO  14,47",
  "Subtotal dos lançamentos  24,47",
];

const NUBANK = `date,title,amount
2026-10-28,Mp *Padaria,"14,00"
2026-10-18,99 - NuPay,"26,60"
2026-10-11,Assai Atacadista Lj309,"80,73"
2026-10-05,Pagamento recebido,"- 55,20"
2026-10-04,Estorno de compra,"- 3,00"
2026-10-03,Loja Grande - Parcela 2/3,"100,00"
`;

describe("valores e datas", () => {
  it("lê valores no formato brasileiro, com e sem R$ e sinal", async () => {
    expect(parseAmount("R$ 1.234,56")).toBe(123456);
    expect(parseAmount("- 55,20")).toBe(-5520);
    expect(parseAmount("-R$ 3,00")).toBe(-300);
    expect(parseAmount("R$ -3,00")).toBe(-300);
    expect(parseAmount("14.00")).toBe(1400);
    expect(parseAmount("abc")).toBeNull();
  });

  it("deduz o ano pelo fechamento (virada de ano)", async () => {
    expect(inferYear("28/12", "2027-01-04")).toBe("2026-12-28");
    expect(inferYear("02/01", "2027-01-04")).toBe("2027-01-02");
    expect(inferYear("06/11", "2026-11-05")).toBe("2026-11-06");
  });

  it("reconhece parcelas nos formatos comuns", async () => {
    expect(extractInstallment("LOJA PARC 03/10")).toEqual({ description: "LOJA", installment: { number: 3, count: 10 } });
    expect(extractInstallment("Loja - Parcela 2/3")).toEqual({ description: "Loja", installment: { number: 2, count: 3 } });
    expect(extractInstallment("LOJA 2 de 6")).toEqual({ description: "LOJA", installment: { number: 2, count: 6 } });
    expect(extractInstallment("LOJA 02/10").installment).toEqual({ number: 2, count: 10 });
    expect(extractInstallment("LOJA 7/3").installment).toBeNull(); // parcela > total: não é parcela
    expect(extractInstallment("UBER").installment).toBeNull();
  });
});

describe("limpeza e categorias", () => {
  it("deixa as descrições legíveis", async () => {
    expect(cleanDescription("Uber - NuPay")).toBe("Uber");
    expect(cleanDescription("DL *UberRides")).toBe("Uber");
    expect(cleanDescription("MP*OLIMAO")).toBe("Olimao");
    expect(cleanDescription("IFD*60291193 JEFFERSON")).toBe("iFood · Jefferson");
    expect(cleanDescription("FARMACIA ZERO HORA")).toBe("Farmacia Zero Hora");
    expect(cleanDescription("Assai Atacadista Lj309")).toBe("Assai Atacadista Lj309");
  });

  it("sugere categorias por palavras-chave e gera chaves estáveis", async () => {
    expect(suggestCategoryName("Uber")).toBe("Transporte");
    expect(suggestCategoryName("iFood · Jefferson")).toBe("Alimentação");
    expect(suggestCategoryName("Assai Atacadista Lj309")).toBe("Mercado");
    expect(suggestCategoryName("Farmacia Zero Hora")).toBe("Saúde");
    expect(suggestCategoryName("Fulano")).toBeNull();
    expect(merchantKey("iFood · Jefferson")).toBe("ifood");
    expect(merchantKey("Assai Atacadista Lj309")).toBe("assai atacadista lj");
  });
});

describe("Mercado Pago (PDF)", () => {
  const st = parsePdfStatement(MERCADO_PAGO);

  it("detecta o banco, o vencimento e o fechamento", async () => {
    expect(st.bank).toBe("mercadopago");
    expect(st.dueDate).toBe("2026-11-10");
    expect(st.closingDate).toBe("2026-11-05");
  });

  it("separa compras por cartão e ignora o pagamento", async () => {
    const purchases = st.lines.filter((l) => l.kind === "purchase");
    expect(purchases).toHaveLength(6);
    expect(purchases.filter((l) => l.cardFinal === "1111")).toHaveLength(3);
    expect(purchases.filter((l) => l.cardFinal === "2222")).toHaveLength(3);
    expect(st.lines.filter((l) => l.kind === "payment")).toHaveLength(1);
    expect(purchases[2]).toMatchObject({ date: "2026-10-23", description: "Uber", amountCents: 762 });
  });

  it("confere a soma com o total de consumos do PDF", async () => {
    expect(checkTotals(st)).toMatchObject({ ok: true, checked: true, purchasesCents: 12040, expectedPurchasesCents: 12040 });
  });
});

describe("PicPay (PDF)", () => {
  const st = parsePdfStatement(PICPAY);

  it("lê datas da virada de ano, créditos, parcelas e cartão adicional", async () => {
    expect(st.bank).toBe("picpay");
    expect(st.closingDate).toBe("2027-01-04");
    const uber = st.lines.find((l) => l.description === "Uber")!;
    expect(uber.date).toBe("2026-12-28");
    expect(st.lines.filter((l) => l.kind === "credit").map((l) => l.amountCents)).toEqual([57, 56]);
    const parc = st.lines.find((l) => l.installment)!;
    expect(parc).toMatchObject({ description: "Loja de Moveis", installment: { number: 3, count: 10 }, amountCents: 1987 });
    expect(st.lines.find((l) => l.cardFinal === "9999")?.description).toBe("Kim+ Tecnologia em Mob");
    expect(st.lines.find((l) => l.rawDescription.includes("ACAI"))?.description).toBe("Acai do Bairro");
  });

  it("confere despesas e créditos com o resumo da fatura", async () => {
    const t = checkTotals(st);
    expect(t).toMatchObject({ ok: true, purchasesCents: 4636, creditsCents: 113 });
  });

  it("acusa diferença quando falta uma linha", async () => {
    const broken = parsePdfStatement(PICPAY.filter((l) => !l.includes("KIM+")));
    expect(checkTotals(broken).ok).toBe(false);
  });
});

describe("Nubank (CSV)", () => {
  const st = parseCsvStatement(NUBANK, "Nubank_2026-11-08.csv");

  it("usa o nome do arquivo como vencimento e classifica as linhas", async () => {
    expect(st.bank).toBe("nubank");
    expect(st.dueDate).toBe("2026-11-08");
    expect(st.closingDate).toBeNull();
    const kinds = Object.fromEntries(st.lines.map((l) => [l.rawDescription, l.kind]));
    expect(kinds["Pagamento recebido"]).toBe("payment");
    expect(kinds["Estorno de compra"]).toBe("credit");
    expect(kinds["99 - NuPay"]).toBe("purchase");
    expect(st.lines.find((l) => l.installment)).toMatchObject({
      description: "Loja Grande",
      installment: { number: 2, count: 3 },
    });
    expect(st.lines.find((l) => l.rawDescription === "Mp *Padaria")?.description).toBe("Padaria");
  });

  it("aceita o formato antigo com categoria e ponto decimal", async () => {
    const old = parseCsvStatement("date,category,title,amount\n2024-01-05,transporte,Uber *Trip,23.9\n", "x.csv");
    expect(old.lines[0]).toMatchObject({ amountCents: 2390, description: "Uber", kind: "purchase" });
  });

  it("recusa arquivos que não reconhece", async () => {
    expect(() => parseCsvStatement("a,b,c\n1,2,3", "x.csv")).toThrow(/Não reconheci/);
    expect(() => parsePdfStatement(["Banco Qualquer", "Fatura"])).toThrow(/Não reconheci/);
    expect(() => parsePdfStatement([])).toThrow(/escaneada/);
  });
});
