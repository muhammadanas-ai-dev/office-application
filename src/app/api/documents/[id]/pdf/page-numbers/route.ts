// Add page numbers to a PDF (Day 18, part 1).
//
// POST /api/documents/[id]/pdf/page-numbers
// Body: { "position": "bottom-centre" | "bottom-right" |
//                   "top-centre" | "top-right",
//         "format": "number" | "page" | "page-of-total",
//         "fromPage": 1, "startNumber": 1 }
//
// The numbers are drawn onto the page content (they become part
// of the page), so applying page numbers twice draws a second
// number over the first — the UI says so. Every application
// creates a new immutable version — the original file is never
// overwritten. Returns { ok, version, documentId, title }.
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
import { addPageNumbersToPdf } from "@/lib/pdf-page-tools";
import { logError } from "@/lib/log";

const PageNumbersBody = z.object({
  position: z.enum([
    "bottom-centre",
    "bottom-right",
    "top-centre",
    "top-right",
  ]),
  format: z.enum(["number", "page", "page-of-total"]),
  fromPage: z.number().int().min(1).optional(),
  startNumber: z.number().int().min(1).optional(),
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

  const parsed = PageNumbersBody.safeParse(body);
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
    const numbered = await addPageNumbersToPdf(bytes, parsed.data);
    const version = await saveNewVersion(document, user.id, numbered);
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
    logError("pdf page-numbers", error);
    return NextResponse.json(
      { error: "Could not add the page numbers." },
      { status: 500 }
    );
  }
}
