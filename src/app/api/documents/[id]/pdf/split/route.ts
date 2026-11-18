// Extract pages from a PDF (Phase B, feature 2).
//
// POST /api/documents/[id]/pdf/split
// Body: { "pages": "1-3, 5" }
//
// Returns one PDF containing exactly the selected pages, in the
// order given (duplicates allowed). The source file is never
// modified.
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  PdfToolsError,
  countPdfPages,
  fetchDocumentPdf,
  getToolsClient,
  getToolsUser,
  pdfDownloadResponse,
  pdfToolsRateLimiter,
  splitPdf,
} from "@/lib/pdf-tools.server";
import { getPdfToolsFileName, parsePageRanges } from "@/lib/pdf-tools";

const SplitBody = z.object({
  pages: z.string().min(1, "Enter at least one page.").max(200),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }
  const parsed = SplitBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }

  try {
    const user = await getToolsUser();
    const limit = pdfToolsRateLimiter.check(user.id);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many PDF operations — try again in a moment." },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)),
          },
        }
      );
    }
    const userClient = await getToolsClient();
    const { document, bytes } = await fetchDocumentPdf(userClient, id);
    const pageCount = await countPdfPages(bytes);
    const ranges = parsePageRanges(parsed.data.pages, pageCount);
    if (!ranges.ok) {
      return NextResponse.json({ error: ranges.error }, { status: 400 });
    }
    const out = await splitPdf(bytes, ranges.pages);
    return pdfDownloadResponse(
      out,
      getPdfToolsFileName(document.title, `pages ${parsed.data.pages.trim()}`)
    );
  } catch (error) {
    if (error instanceof PdfToolsError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("[pdf split]", error);
    return NextResponse.json(
      { error: "Could not extract these pages." },
      { status: 500 }
    );
  }
}
