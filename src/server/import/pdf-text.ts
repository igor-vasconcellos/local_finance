import "server-only";

type TextItem = { str: string; transform: number[] };

/**
 * Extrai o texto do PDF em linhas, na ordem de leitura: os pedaços de texto são
 * agrupados pela altura (y) na página e ordenados da esquerda para a direita.
 * Tudo roda localmente (pdf.js da Mozilla), sem enviar o arquivo para lugar nenhum.
 */
export async function extractPdfLines(data: Uint8Array): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({
    data,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  });
  const doc = await task.promise;

  const lines: string[] = [];
  try {
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
      }
      rows.sort((a, b) => b.y - a.y);
      for (const r of rows) {
        r.items.sort((a, b) => a.x - b.x);
        lines.push(r.items.map((i) => i.s.trim()).join("  "));
      }
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return lines;
}
