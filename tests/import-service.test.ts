import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { freshUser } from "./helpers/user";
import {
  cardPurchases,
  categories,
  creditCards,
  installments,
  institutions,
  invoiceCredits,
  invoiceImports,
  invoices,
  merchantRules,
} from "@/db/schema";
import { parseCsvStatement, parsePdfStatement, type ParsedStatement } from "@/lib/import";
import { createCard, createPurchase, getInvoiceDetail, listCards, listInvoiceMonths } from "@/server/finance/cards";
import { getCategoryReport, getMonthOverview } from "@/server/finance/overview";
import { buildPreview, commitImport, listImports, undoImport, type ImportPreview } from "@/server/import/service";

const TODAY = "2026-11-19";

const PICPAY = [
  "Vencimento:  10/11/2026  Fechamento:  04/11/2026",
  "PicPay Mastercard® GOLD",
  "Créditos e estornos  -0,57",
  "Despesas do mês  45,02",
  "Picpay Card",
  "01/10  UBER  2,02",
  "03/10  DEVOLUCAO COMPRA REAL  -0,57",
  "05/10  PAGAMENTO DE FATURA  -245,40",
  "14/10  LOJA DE MOVEIS PARC 03/10  30,00",
  "Picpay Card final 9999",
  "21/10  FARMACIA CENTRAL  13,00",
];

let transporte = 0;
let saude = 0;

let uid = 0;

beforeEach(() => {
  uid = freshUser();
  db.delete(installments).run();
  db.delete(invoiceCredits).run();
  db.delete(cardPurchases).run();
  db.delete(invoiceImports).run();
  db.delete(invoices).run();
  db.delete(creditCards).run();
  db.delete(institutions).run();
  db.delete(merchantRules).run();
  db.delete(categories).run();
  transporte = db.insert(categories).values({ userId: uid, name: "Transporte", kind: "expense" }).returning().get().id;
  saude = db.insert(categories).values({ userId: uid, name: "Saúde", kind: "expense" }).returning().get().id;
  db.insert(categories).values({ userId: uid, name: "Compras", kind: "expense" }).run();
});

const newCard = (closingDay = 3, dueDay = 10) =>
  createCard(uid, { name: "PicPay", institution: "PicPay", limit: 300000, closingDay, dueDay, color: "#7c3aed" }).id;

function commitAll(p: ImportPreview, over: Partial<Parameters<typeof commitImport>[1]> = {}) {
  return commitImport(uid, {
    cardId: p.cardId,
    bank: p.bank,
    fileName: p.fileName,
    referenceMonth: p.referenceMonth,
    dueDate: p.dueDate,
    closingDate: p.closingDate,
    datesFromFile: p.datesFromFile,
    markPaid: false,
    updateCardSchedule: false,
    lines: p.lines
      .filter((l) => l.selected && l.kind !== "payment")
      .map((l) => ({
        key: l.key,
        kind: l.kind as "purchase" | "credit",
        date: l.date,
        description: l.description,
        amountCents: l.amountCents,
        installment: l.installment,
        categoryId: l.categoryId,
      })),
    ...over,
  });
}

describe("prévia", () => {
  it("marca pagamento como ignorado, sugere categoria e aponta dias diferentes do cartão", () => {
    const cardId = newCard();
    const p = buildPreview(uid, cardId, "fatura.pdf", parsePdfStatement(PICPAY), TODAY);
    expect(p.referenceMonth).toBe("2026-11");
    expect(p.totals.ok).toBe(true);
    expect(p.scheduleMismatch).toMatchObject({ closingDay: 4, dueDay: 10, cardClosingDay: 3 });
    expect(p.multipleCards).toBe(true);
    expect(p.markPaidDefault).toBe(true); // venceu em 10/11, hoje é 19/11
    expect(p.lines.find((l) => l.kind === "payment")).toMatchObject({ status: "ignored", selected: false });
    expect(p.lines.find((l) => l.description === "Uber")?.categoryId).toBe(transporte);
    expect(p.lines.find((l) => l.description === "Farmacia Central")?.categoryId).toBe(saude);
  });

  it("aponta possível duplicada de compra lançada à mão (vem desmarcada)", () => {
    const cardId = newCard();
    createPurchase(uid, { cardId, description: "Uber", categoryId: null, total: 202, installmentsCount: 1, purchaseDate: "2026-10-01", notes: null });
    const p = buildPreview(uid, cardId, "fatura.pdf", parsePdfStatement(PICPAY), TODAY);
    expect(p.lines.find((l) => l.description === "Uber")).toMatchObject({ status: "duplicate", selected: false });
  });
});

describe("importação", () => {
  it("cria compras e créditos na fatura do arquivo, e o total bate com o banco", () => {
    const cardId = newCard(4, 10);
    const p = buildPreview(uid, cardId, "fatura.pdf", parsePdfStatement(PICPAY), TODAY);
    const r = commitAll(p);
    expect(r).toMatchObject({ purchases: 3, credits: 1, skipped: 0 });

    const inv = getInvoiceDetail(uid, cardId, "2026-11", TODAY)!;
    // 2,02 + 30,00 (parcela 3/10) + 13,00 − 0,57
    expect(inv.chargesCents).toBe(4502);
    expect(inv.creditsCents).toBe(57);
    expect(inv.totalCents).toBe(4445);
    expect(inv.closingDate).toBe("2026-11-04");
    expect(inv.credits[0].description).toBe("Devolucao Compra Real");
  });

  it("parcela 3/10 vira compra de 10x com as 2 faturas anteriores pagas e 7 futuras", () => {
    const cardId = newCard(4, 10);
    commitAll(buildPreview(uid, cardId, "fatura.pdf", parsePdfStatement(PICPAY), TODAY));
    const purchase = db.select().from(cardPurchases).all().find((x) => x.installmentsCount === 10)!;
    expect(purchase.totalCents).toBe(30000);
    expect(purchase.firstInvoiceMonth).toBe("2026-09");

    const months = listInvoiceMonths(uid, cardId, TODAY);
    expect(months.map((m) => m.referenceMonth)).toEqual([
      "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04", "2027-05", "2027-06",
    ]);
    expect(months.slice(0, 2).every((m) => m.status === "paid")).toBe(true);
    expect(months[2].status).not.toBe("paid");
    // Limite usado: fatura atual + 7 parcelas futuras.
    expect(listCards(uid, TODAY)[0].usedCents).toBe(4445 + 7 * 3000);
  });

  it("não importa a mesma linha duas vezes", () => {
    const cardId = newCard(4, 10);
    commitAll(buildPreview(uid, cardId, "fatura.pdf", parsePdfStatement(PICPAY), TODAY));
    const again = buildPreview(uid, cardId, "fatura.pdf", parsePdfStatement(PICPAY), TODAY);
    expect(again.lines.filter((l) => l.kind !== "payment").every((l) => l.status === "imported")).toBe(true);
    // Mesmo se forçar, o servidor pula as repetidas.
    const forced = commitAll({ ...again, lines: again.lines.map((l) => ({ ...l, selected: true })) });
    expect(forced).toMatchObject({ purchases: 0, credits: 0, skipped: 4 });
  });

  it("parcela seguinte no mês que vem é reconhecida como já importada", () => {
    const cardId = newCard(4, 10);
    commitAll(buildPreview(uid, cardId, "fatura.pdf", parsePdfStatement(PICPAY), TODAY));
    const next = parsePdfStatement([
      "Vencimento:  10/12/2026  Fechamento:  04/12/2026",
      "PicPay",
      "Picpay Card",
      "14/10  LOJA DE MOVEIS PARC 04/10  30,00",
      "20/11  UBER  9,00",
    ]);
    const p = buildPreview(uid, cardId, "dez.pdf", next, TODAY);
    expect(p.lines.find((l) => l.installment)?.status).toBe("imported");
    expect(p.lines.find((l) => l.description === "Uber")?.status).toBe("new");
  });

  it("aprende a categoria escolhida para o estabelecimento", () => {
    const cardId = newCard(4, 10);
    const p = buildPreview(uid, cardId, "fatura.pdf", parsePdfStatement(PICPAY), TODAY);
    const compras = db.select().from(categories).all().find((c) => c.name === "Compras")!.id;
    commitAll({ ...p, lines: p.lines.map((l) => (l.description === "Uber" ? { ...l, categoryId: compras } : l)) });
    const next = parsePdfStatement(["Vencimento:  10/12/2026  Fechamento:  04/12/2026", "PicPay", "20/11  UBER  9,00"]);
    expect(buildPreview(uid, cardId, "dez.pdf", next, TODAY).lines[0].categoryId).toBe(compras);
  });

  it("marca a fatura como paga e atualiza os dias do cartão quando pedido", () => {
    const cardId = newCard(3, 12);
    const p = buildPreview(uid, cardId, "fatura.pdf", parsePdfStatement(PICPAY), TODAY);
    commitAll(p, { markPaid: true, updateCardSchedule: true });
    expect(getInvoiceDetail(uid, cardId, "2026-11", TODAY)!.status).toBe("paid");
    const card = db.select().from(creditCards).get()!;
    expect([card.closingDay, card.dueDay]).toEqual([4, 10]);
  });

  it("créditos abatem o painel e entram negativos no relatório", () => {
    const cardId = newCard(4, 10);
    commitAll(buildPreview(uid, cardId, "fatura.pdf", parsePdfStatement(PICPAY), TODAY));
    const ov = getMonthOverview(uid, "2026-11", TODAY);
    expect(ov.cardInvoices.find((i) => i.cardId === cardId)?.totalCents).toBe(4445);
    const report = getCategoryReport(uid, "2026-11");
    expect(report.rows.find((r) => r.name === "Créditos e estornos")?.totalCents).toBe(-57);
    expect(report.totalCents).toBe(4445);
  });
});

describe("Nubank CSV", () => {
  it("usa o vencimento do nome do arquivo e o fechamento do cartão", () => {
    const cardId = newCard(1, 8);
    const st: ParsedStatement = parseCsvStatement(
      'date,title,amount\n2026-10-28,Uber - NuPay,"14,00"\n2026-10-05,Pagamento recebido,"- 55,20"\n',
      "Nubank_2026-11-08.csv",
    );
    const p = buildPreview(uid, cardId, "Nubank_2026-11-08.csv", st, TODAY);
    expect(p).toMatchObject({ referenceMonth: "2026-11", dueDate: "2026-11-08", closingDate: "2026-11-01", datesFromFile: false, scheduleMismatch: null });
    commitAll(p);
    expect(getInvoiceDetail(uid, cardId, "2026-11", TODAY)!.totalCents).toBe(1400);
  });
});

describe("desfazer", () => {
  it("remove tudo o que a importação criou e reabre as faturas marcadas como pagas", () => {
    const cardId = newCard(4, 10);
    createPurchase(uid, { cardId, description: "Manual", categoryId: null, total: 5000, installmentsCount: 1, purchaseDate: "2026-10-20", notes: null });
    const r = commitAll(buildPreview(uid, cardId, "fatura.pdf", parsePdfStatement(PICPAY), TODAY), { markPaid: true });
    expect(listImports(uid, cardId)).toHaveLength(1);
    expect(listImports(uid, cardId)[0]).toMatchObject({ purchasesCount: 3, creditsCount: 1, bankLabel: "PicPay" });

    expect(undoImport(uid, cardId, r.importId)).toBe(true);
    expect(listImports(uid, cardId)).toHaveLength(0);
    expect(db.select().from(cardPurchases).all().map((x) => x.description)).toEqual(["Manual"]);
    expect(db.select().from(invoiceCredits).all()).toHaveLength(0);
    // Sobra só a fatura da compra manual, aberta de novo.
    expect(listInvoiceMonths(uid, cardId, TODAY).map((m) => [m.referenceMonth, m.status])).toEqual([["2026-11", "overdue"]]);
  });

  it("não desfaz importação de outro cartão", () => {
    const a = newCard(4, 10);
    const b = newCard(4, 10);
    const r = commitAll(buildPreview(uid, a, "fatura.pdf", parsePdfStatement(PICPAY), TODAY));
    expect(undoImport(uid, b, r.importId)).toBe(false);
    expect(listImports(uid, a)).toHaveLength(1);
  });
});
