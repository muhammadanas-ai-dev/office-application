// Compress a PDF (Phase B, feature 2).
//
// POST /api/documents/[id]/pdf/compress
// Body: { "level": "screen" | "ebook" | "printer" } (optional, default ebook)
//
// Compresses with Ghostscript (real compression — image
// downsampling, font subsetting, duplicate removal). If
// Ghostscript cannot shrink the file, the original is returned
// unchanged. The response carries X-Forma-Compress-Saved-Bytes so
// the UI can show how much was saved. The source file is never
// modified.
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  PdfToolsError,
  compressPdf,
  fetchDocumentPdf,
  getToolsClient,
  getToolsUser,
  pdfDownloadResponse,
  pdfToolsRateLimiter,
} from "@/lib/pdf-tools.server";
import { getPdfToolsFileName, parseCompressLevel } from "@/lib/pdf-tools";

const CompressBody = z.object({
  level: z.string().optional(),
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
  const parsed = CompressBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }
  const level = parseCompressLevel(parsed.data.level);
  if (!level.ok) {
    return NextResponse.json({ error: level.error }, { status: 400 });
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
    const { bytes: out, savedBytes } = await compressPdf(bytes, level.level);
    return pdfDownloadResponse(
      out,
      getPdfToolsFileName(document.title, "compressed"),
      { "X-Forma-Compress-Saved-Bytes": String(savedBytes) }
    );
  } catch (error) {
    if (error instanceof PdfToolsError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("[pdf compress]", error);
    return NextResponse.json(
      { error: "Could not compress this PDF." },
      { status: 500 }
    );
  }
}
