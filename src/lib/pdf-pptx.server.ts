// Server side of PDF → PPTX (F25).
//
// Builds the pure slide model (pdf-pptx.ts) from the Day 21
// text extraction and renders it with PptxGenJS (server-only
// module). Each slide is a blank layout with a title text
// box and a body text box in the Forma type style.
import PptxGenJS from "pptxgenjs";
import { extractPdfText } from "@/lib/pdf-searchable";
import {
  buildPptxSlides,
  pptxSlidesHaveText,
  type PptxSlide,
} from "@/lib/pdf-pptx";
import { PdfEditError } from "@/lib/pdf-edit";

export { getPptxFileName } from "@/lib/pdf-pptx";
export {
  fetchDocumentPdf,
  fetchEditableDocument,
  getToolsClient,
  getToolsUser,
} from "@/lib/pdf-images.server";

/** Render the slide model to .pptx bytes. */
export async function renderPptx(slides: PptxSlide[]): Promise<Uint8Array> {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "FORMA", width: 13.33, height: 7.5 });
  pptx.layout = "FORMA";
  for (const slide of slides) {
    const s = pptx.addSlide();
    s.addText(slide.title, {
      x: 0.6,
      y: 0.4,
      w: 12.1,
      h: 0.9,
      fontSize: 28,
      bold: true,
      color: "202B3C",
      fontFace: "Calibri",
    });
    if (slide.bodyLines.length > 0) {
      s.addText(
        slide.bodyLines.map((line) => ({
          text: line,
          options: { breakLine: true },
        })),
        {
          x: 0.6,
          y: 1.5,
          w: 12.1,
          h: 5.6,
          fontSize: 16,
          color: "202B3C",
          fontFace: "Calibri",
          valign: "top",
        }
      );
    }
  }
  const buffer = (await pptx.write({
    outputType: "nodebuffer",
  })) as Buffer;
  return new Uint8Array(buffer);
}

/**
 * Build a PDF's PPTX export bytes. Throws PdfEditError(400)
 * when the PDF carries no extractable text at all (a scanned
 * PDF — the OCR page is the fix).
 */
export async function buildPdfPptx(bytes: Uint8Array): Promise<Uint8Array> {
  const { pages } = await extractPdfText(bytes);
  if (!pptxSlidesHaveText(pages)) {
    throw new PdfEditError(
      400,
      "This PDF has no extractable text to export. If it is a scanned PDF, run OCR first (the OCR page), then export."
    );
  }
  return renderPptx(buildPptxSlides(pages));
}
