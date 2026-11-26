// PDF → PPTX model — pure helpers (F25).
//
// The text-based PDF-to-PowerPoint export: one slide per
// PDF page. The page's first text line becomes the slide
// title; the remaining lines become the body. A page with
// no text still gets a slide ("Page N", empty body) so the
// slide count always matches the page count. The model is
// pure; the server module renders it with PptxGenJS.
//
// This is a TEXT export — the PDF's layout, images and
// formatting are not reproduced, and the route says so.
export interface PptxSlide {
  title: string;
  bodyLines: string[];
}

/** The longest slide title (longer first lines are cut with
 *  an ellipsis so the title box stays readable). */
export const MAX_SLIDE_TITLE_CHARS = 90;

/** Build the slide model from per-page text. */
export function buildPptxSlides(
  pages: { page: number; text: string }[]
): PptxSlide[] {
  return pages.map(({ page, text }) => {
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l !== "");
    if (lines.length === 0) {
      return { title: `Page ${page}`, bodyLines: [] };
    }
    const [first, ...rest] = lines;
    const title =
      first.length > MAX_SLIDE_TITLE_CHARS
        ? `${first.slice(0, MAX_SLIDE_TITLE_CHARS - 1)}…`
        : first;
    return { title, bodyLines: rest };
  });
}

/** True when at least one page carried any text. */
export function pptxSlidesHaveText(
  pages: { page: number; text: string }[]
): boolean {
  return pages.some((p) => p.text.trim() !== "");
}

/** The file name for a document's PPTX export. */
export function getPptxFileName(title: string): string {
  const base = title.replace(/\.[^.]+$/, "").trim() || "document";
  return `${base}.pptx`;
}
