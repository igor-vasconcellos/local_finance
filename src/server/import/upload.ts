/**
 * Validação do arquivo de fatura enviado pelo usuário. O tipo é decidido pelo
 * CONTEÚDO (assinatura dos bytes), nunca pelo nome ou pelo tipo informado pelo
 * navegador — ambos são controlados por quem envia. O arquivo só existe em
 * memória durante a leitura; nada é gravado em disco.
 */

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_PDF_PAGES = 40;
export const MAX_CSV_LINES = 5000;
export const PDF_TIMEOUT_MS = 15_000;

export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadError";
  }
}

export type UploadKind = "pdf" | "csv";

/** Nome seguro para exibir/gravar: sem caminho, sem caracteres de controle, tamanho limitado. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const clean = base.replace(/[\u0000-\u001f\u007f<>"]/g, "").trim();
  return (clean || "fatura").slice(0, 120);
}

function startsWith(bytes: Uint8Array, sig: number[], offset = 0) {
  return sig.every((b, i) => bytes[offset + i] === b);
}

/** Formatos binários comuns que nunca são fatura (executáveis, compactados, imagens). */
function looksBinary(bytes: Uint8Array): boolean {
  return (
    startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || // zip / docx / xlsx
    startsWith(bytes, [0x4d, 0x5a]) || // exe
    startsWith(bytes, [0x7f, 0x45, 0x4c, 0x46]) || // elf
    startsWith(bytes, [0x89, 0x50, 0x4e, 0x47]) || // png
    startsWith(bytes, [0xff, 0xd8, 0xff]) || // jpg
    startsWith(bytes, [0x1f, 0x8b]) || // gzip
    startsWith(bytes, [0x52, 0x61, 0x72, 0x21]) // rar
  );
}

/** "%PDF-" precisa aparecer no começo do arquivo (a especificação tolera lixo antes, até 1 KB). */
export function isPdfBytes(bytes: Uint8Array): boolean {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  return head.includes("%PDF-");
}

/** Decide o tipo pelo conteúdo e devolve o texto quando for CSV. */
export function sniffUpload(bytes: Uint8Array): { kind: "pdf" } | { kind: "csv"; text: string } {
  if (bytes.length === 0) throw new UploadError("O arquivo está vazio.");
  if (bytes.length > MAX_UPLOAD_BYTES) throw new UploadError("Arquivo muito grande (máximo de 5 MB).");
  if (isPdfBytes(bytes)) return { kind: "pdf" };
  if (looksBinary(bytes)) throw new UploadError("Envie a fatura em PDF ou CSV.");

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new UploadError("Envie a fatura em PDF ou CSV (o arquivo não é um texto válido).");
  }
  if (text.includes("\u0000")) throw new UploadError("Envie a fatura em PDF ou CSV.");
  const lines = text.split(/\r?\n/);
  if (lines.length > MAX_CSV_LINES) throw new UploadError(`O CSV tem linhas demais (máximo de ${MAX_CSV_LINES}).`);
  if (lines.some((l) => l.length > 2000)) throw new UploadError("O CSV tem linhas longas demais para uma fatura.");
  if (!lines[0]?.includes(",") && !lines[0]?.includes(";")) throw new UploadError("Envie a fatura em PDF ou CSV.");
  return { kind: "csv", text };
}

/** Rejeita se a promessa demorar demais (PDF montado para travar o leitor). */
export async function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout();
      reject(new UploadError("O arquivo demorou demais para ser lido. Confira se é a fatura certa."));
    }, ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
