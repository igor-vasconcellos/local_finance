import "server-only";
import { MAX_PDF_PAGES, PDF_TIMEOUT_MS, UploadError, withTimeout } from "./upload";

type TextItem = { str: string; transform: number[] };

/**
 * Extrai o texto do PDF em linhas, na ordem de leitura: os pedaços de texto são
 * agrupados pela altura (y) na página e ordenados da esquerda para a direita.
 * Tudo roda no servidor (pdf.js da Mozilla), sem enviar o arquivo para lugar nenhum.
 *
 * Segurança: só extraímos TEXTO. Formulários XFA, fontes embutidas e imagens não são
 * processados; o pdf.js atual nunca executa código do PDF (eval desligado). Há limite
 * de páginas, de texto e de tempo para um PDF malicioso não travar o servidor.
 */
export async function extractPdfLines(data: Uint8Array): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({
    data,
    disableFontFace: true,
    useSystemFonts: false,
    enableXfa: false,
    disableAutoFetch: true,
    isOffscreenCanvasSupported: false,
    maxImageSize: 1,
    verbosity: 0,
  });
  try {
    return await withTimeout(readLines(task.promise), PDF_TIMEOUT_MS, () => void task.destroy());
  } finally {
    await task.destroy();
  }
}

const MAX_TEXT_CHARS = 2_000_000;

async function readLines(docPromise: Promise<PdfDoc>): Promise<string[]> {
  const doc = await docPromise;
  if (doc.numPages > MAX_PDF_PAGES) throw new UploadError(`O PDF tem páginas demais (máximo de ${MAX_PDF_PAGES}).`);

  const lines: string[] = [];
  let chars = 0;
  {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const rows: { y: number; items: { x: number; s: string }[] }[] = [];
      for (const raw of content.items) {
        const it = raw as Partial<TextItem>;
        if (typeof it.str !== "string" || !it.str.trim() || !it.transform) continue;
        const x = it.transform[4];
        const y = it.transform[5];
        let row = rows.find((r) => Math.abs(r.y - y) < 2.5);
        if (!row) {
          row = { y, items: [] };
          rows.push(row);
        }
        row.items.push({ x, s: it.str });
        chars += it.str.length;
        if (chars > MAX_TEXT_CHARS) throw new UploadError("O PDF tem texto demais para uma fatura.");
      }
      rows.sort((a, b) => b.y - a.y);
      for (const r of rows) {
        r.items.sort((a, b) => a.x - b.x);
        lines.push(r.items.map((i) => i.s.trim()).join("  "));
      }
      page.cleanup();
    }
  }
  return lines;
}

type PdfDoc = {
  numPages: number;
  getPage(n: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }>; cleanup(): void }>;
};
