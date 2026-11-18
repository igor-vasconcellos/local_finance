import "server-only";
import bcrypt from "bcryptjs";

const COST = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Hash fixo usado quando o e-mail não existe: comparamos mesmo assim para que
 * o tempo de resposta não revele se o e-mail está cadastrado.
 */
export const DUMMY_HASH = "$2b$12$xI.qO09sLLfmYKmoa94vuuJFEo.ojMhdwVI7fsXbu8XW6mstXYC7S";
