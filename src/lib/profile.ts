/** Cores disponíveis para o fundo do avatar do perfil. */
export const AVATAR_COLORS = [
  "#7c3aed", // roxo
  "#2563eb", // azul
  "#0891b2", // ciano
  "#059669", // verde
  "#65a30d", // lima
  "#ca8a04", // dourado
  "#ea580c", // laranja
  "#e11d48", // vermelho
  "#db2777", // rosa
  "#475569", // grafite
] as const;

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
