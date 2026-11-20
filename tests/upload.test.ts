import { describe, expect, it } from "vitest";
import { extractPdfLines } from "@/server/import/pdf-text";
import { MAX_PDF_PAGES, UploadError, safeFileName, sniffUpload, withTimeout } from "@/server/import/upload";

const enc = (s: string) => new TextEncoder().encode(s);

/** PDF mínimo válido com N páginas (cada uma com uma linha de texto). */
function makePdf(pages: number): Uint8Array {
  const objs: string[] = [];
  const kids = Array.from({ length: pages }, (_, i) => `${4 + i * 2} 0 R`).join(" ");
  objs.push("<< /Type /Catalog /Pages 2 0 R >>");
  objs.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages} >>`);
  objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  for (let i = 0; i < pages; i++) {
    const stream = `BT /F1 12 Tf 72 720 Td (Linha ${i + 1}) Tj ET`;
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`);
    objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return enc(out);
}

describe("upload de fatura: tipo decidido pelo conteúdo", () => {
  it("PDF pela assinatura, mesmo com nome .csv", () => {
    expect(sniffUpload(makePdf(1)).kind).toBe("pdf");
  });

  it("CSV de texto com separador", () => {
    const r = sniffUpload(enc("date,title,amount\n2026-11-01,Mercado,10.00\n"));
    expect(r.kind).toBe("csv");
  });

  it.each([
    ["zip/xlsx", new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])],
    ["executável", new Uint8Array([0x4d, 0x5a, 0x90, 0x00])],
    ["imagem", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])],
    ["binário com NUL", enc("a,b\u0000c")],
    ["UTF-8 inválido", new Uint8Array([0x61, 0x2c, 0xff, 0xfe, 0xfd])],
    ["texto sem separador", enc("<script>alert(1)</script>")],
    ["vazio", new Uint8Array()],
  ])("recusa %s", (_label, bytes) => {
    expect(() => sniffUpload(bytes)).toThrow(UploadError);
  });

  it("recusa arquivo grande demais e CSV com linhas demais", () => {
    expect(() => sniffUpload(new Uint8Array(5 * 1024 * 1024 + 1).fill(0x61))).toThrow("muito grande");
    expect(() => sniffUpload(enc("a,b\n".repeat(6000)))).toThrow("linhas demais");
  });

  it("nome do arquivo sem caminho nem caracteres de controle", () => {
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("C:\\Users\\x\\fatura\u0000<b>.pdf")).toBe("faturab.pdf");
    expect(safeFileName("")).toBe("fatura");
  });
});

describe("leitura do PDF com limites", () => {
  it("lê um PDF normal", async () => {
    expect(await extractPdfLines(makePdf(2))).toEqual(["Linha 1", "Linha 2"]);
  });

  it("recusa PDF com páginas demais", async () => {
    await expect(extractPdfLines(makePdf(MAX_PDF_PAGES + 1))).rejects.toThrow("páginas demais");
  });

  it("PDF corrompido gera erro (sem travar)", async () => {
    await expect(extractPdfLines(enc("%PDF-1.4\nlixo sem estrutura"))).rejects.toThrow();
  });

  it("tempo máximo de leitura", async () => {
    let cancelled = false;
    await expect(withTimeout(new Promise(() => {}), 20, () => (cancelled = true))).rejects.toThrow("demorou demais");
    expect(cancelled).toBe(true);
  });
});
