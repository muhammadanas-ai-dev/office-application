// Crop pages of a PDF (Day 19, part 2).
//
// POST /api/documents/[id]/pdf/crop
// Body: { "pages": [1, 2],
//         "rect": { "x1": 0, "y1": 396, "x2": 612, "y2": 792 } }
//
// The rectangle is the visible region, in PDF points (origin
// bottom-left), as the two endpoints of a drag. It must lie
// inside the page. Every crop creates a new immutable version —
// the original file is never overwritten.
// Returns { ok, version, documentId, title }.
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  PdfEditError,
  editJsonResponse,
  fetchEditableDocument,
  getToolsClient,
  getToolsUser,
  pdfEditRateLimiter,
  saveNewVersion,
} from "@/lib/pdf-edit.server";
import { fetchDocumentPdf } from "@/lib/pdf-tools.server";
import { PdfToolsError } from "@/lib/pdf-ops";
import { cropPagesInPdf } from "@/lib/pdf-page-tools";
import { logError } from "@/lib/log";

const DragRectBody = z.object({
  x1: z.number().finite(),
  y1: z.number().finite(),
  x2: z.number().finite(),
  y2: z.number().finite(),
});

const CropBody = z.object({
  pages: z
    .array(z.number().int().min(1))
    .min(1, "Choose at least one page to crop.")
    .max(500),
  rect: DragRectBody,
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

  const parsed = CropBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body." },
      { status: 400 }
    );
  }

  try {
    const user = await getToolsUser();
    const limit = pdfEditRateLimiter.check(user.id);
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
    const document = await fetchEditableDocument(userClient, id);
    const { bytes } = await fetchDocumentPdf(userClient, id);
    const cropped = await cropPagesInPdf(bytes, parsed.data);
    const version = await saveNewVersion(document, user.id, cropped);
    return editJsonResponse({
      version,
      documentId: document.id,
      title: document.title,
    });
  } catch (error) {
    if (error instanceof PdfEditError || error instanceof PdfToolsError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    logError("pdf crop", error);
    return NextResponse.json(
      { error: "Could not crop the pages." },
      { status: 500 }
    );
  }
}
