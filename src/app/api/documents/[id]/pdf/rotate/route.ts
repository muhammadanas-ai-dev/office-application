// Rotate pages of a PDF (Phase B, feature 2).
//
// POST /api/documents/[id]/pdf/rotate
// Body: { "pages": "all" | "1-3, 5", "degrees": 90 | 180 | 270 }
//
// Rotates the selected pages clockwise by the given amount,
// ADDITIVE to each page's current rotation. The source file is
// never modified.
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
  rotatePdf,
} from "@/lib/pdf-tools.server";
import {
  getPdfToolsFileName,
  parseRotateSelection,
  parseRotationDegrees,
} from "@/lib/pdf-tools";

const RotateBody = z.object({
  pages: z.string().min(1, "Enter pages or 'all'.").max(200),
  degrees: z.coerce.number(),
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
  const parsed = RotateBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }
  const rotation = parseRotationDegrees(parsed.data.degrees);
  if (!rotation.ok) {
    return NextResponse.json({ error: rotation.error }, { status: 400 });
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
    const selection = parseRotateSelection(parsed.data.pages, pageCount);
    if (!selection.ok) {
      return NextResponse.json({ error: selection.error }, { status: 400 });
    }
    const out = await rotatePdf(bytes, selection.pages, rotation.degrees);
    return pdfDownloadResponse(
      out,
      getPdfToolsFileName(document.title, "rotated")
    );
  } catch (error) {
    if (error instanceof PdfToolsError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("[pdf rotate]", error);
    return NextResponse.json(
      { error: "Could not rotate these pages." },
      { status: 500 }
    );
  }
}
