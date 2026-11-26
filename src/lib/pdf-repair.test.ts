import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { repairPdfBytes } from "@/lib/pdf-repair.server";

async function healthyPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  page.drawText("Healthy page", { x: 50, y: 700, size: 14, font });
  return doc.save();
}

describe("PDF repair (F36)", () => {
  it("rebuilds a healthy PDF (still a valid, loadable file)", async () => {
    const result = await repairPdfBytes(await healthyPdf());
    expect(result.hadProblems).toBe(false);
    const doc = await PDFDocument.load(result.bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it("refuses bytes that are not a readable PDF", async () => {
    await expect(
      repairPdfBytes(new TextEncoder().encode("definitely not a pdf"))
    ).rejects.toThrow(/could not be repaired/);
  });
});
