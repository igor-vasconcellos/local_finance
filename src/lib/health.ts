/** Farol de saúde financeira (função pura, usada no servidor e no navegador). */
export type Health = "green" | "yellow" | "red";

/**
 * Classifica o mês pelo percentual da renda que sobra livre.
 * > verde = saudável · entre amarelo e verde = atenção · abaixo do amarelo ou negativo = crítico.
 */
export function healthOf(freeCents: number, incomeCents: number, greenBp: number, yellowBp: number): Health {
  if (incomeCents <= 0) return freeCents > 0 ? "green" : "red";
  const ratioBp = (freeCents / incomeCents) * 10000;
  if (ratioBp > greenBp) return "green";
  if (ratioBp >= yellowBp) return "yellow";
  return "red";
}
