/**
 * Dinheiro sempre em CENTAVOS (inteiros). Nada de float em cálculos.
 */

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const plain = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 123456 → "R$ 1.234,56" */
export function formatBRL(cents: number): string {
  return brl.format(cents / 100).replace(/ /g, " ");
}

/** 123456 → "1.234,56" (para preencher campos de formulário) */
export function formatAmount(cents: number): string {
  return plain.format(cents / 100);
}

/**
 * Converte o que o usuário digitou em centavos. Aceita "1.234,56", "1234,56",
 * "1234.56", "R$ 1.234", "50". Retorna null se não for um valor válido.
 */
export function parseBRL(input: string): number | null {
  let s = input.replace(/R\$/gi, "").replace(/\s/g, "").trim();
  if (!s) return null;
  const negative = s.startsWith("-");
  if (negative) s = s.slice(1);

  let intPart: string;
  let decPart = "";
  if (s.includes(",")) {
    // Formato brasileiro: ponto = milhar, vírgula = decimal.
    const [i, d, ...rest] = s.split(",");
    if (rest.length) return null;
    intPart = i.replace(/\./g, "");
    decPart = d ?? "";
  } else {
    const dots = s.split(".");
    const last = dots[dots.length - 1];
    if (dots.length === 2 && last.length > 0 && last.length <= 2) {
      // "1234.5" ou "1234.56": ponto como decimal.
      intPart = dots[0];
      decPart = last;
    } else {
      // "1.234" ou "1.234.567": pontos como milhar.
      if (dots.length > 1 && dots.slice(1).some((g) => g.length !== 3)) return null;
      intPart = dots.join("");
    }
  }

  if (!/^\d+$/.test(intPart || "0") || !/^\d{0,2}$/.test(decPart)) return null;
  const cents = Number(intPart || "0") * 100 + Number(decPart.padEnd(2, "0") || "0");
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

/**
 * Divide um total em N parcelas inteiras. Os centavos que sobram vão para as
 * primeiras parcelas, para que a soma bata exatamente com o total.
 * Ex.: 10000 em 3x → [3334, 3333, 3333]
 */
export function splitInstallments(totalCents: number, count: number): number[] {
  if (!Number.isInteger(totalCents) || totalCents <= 0) throw new Error("Total inválido.");
  if (!Number.isInteger(count) || count < 1) throw new Error("Número de parcelas inválido.");
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}
