// Add a rubber stamp to a PDF (Day 32).
//
// POST /api/documents/[id]/pdf/add-stamp
// Body: { "text": "CONFIDENTIAL", "pages": "all",
//         "position": "top-centre", "color": "red" }
//
// The stamp is a bordered box with the text centred inside it,
// drawn INTO the page content (it becomes part of the page, not
// an annotation), so it is permanent — removing it later means
// restoring an earlier version. Every addition creates a new
// immutable version — the original file is never overwritten.
// Returns { ok, version, documentId, title }.
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  PdfEditError,
  PdfToolsError,
  addStampToPdf,
  editJsonResponse,
  fetchEditableDocument,
  getToolsClient,
  getToolsUser,
  pdfStampRateLimiter,
  saveNewVersion,
} from "@/lib/pdf-stamp.server";
import { fetchDocumentPdf } from "@/lib/pdf-tools.server";
import { MAX_STAMP_TEXT_CHARS, STAMP_PRESETS } from "@/lib/pdf-stamp";
import { logError } from "@/lib/log";

const AddStampBody = z.object({
  text: z.string().min(1, "Enter the stamp text.").max(MAX_STAMP_TEXT_CHARS),
  pages: z.string().min(1, "Choose the pages."),
  position: z.enum([
    "top-centre",
    "top-right",
    "bottom-centre",
    "bottom-right",
  ]),
  color: z.enum(["black", "grey", "red", "green", "blue"]),
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

  const parsed = AddStampBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body." },
      { status: 400 }
    );
  }

  try {
    const user = await getToolsUser();
    const limit = pdfStampRateLimiter.check(user.id);
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
    const stamped = await addStampToPdf(bytes, parsed.data);
    const version = await saveNewVersion(document, user.id, stamped);
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
    logError("pdf add-stamp", error);
    return NextResponse.json(
      { error: "Could not add the stamp." },
      { status: 500 }
    );
  }
}

export { STAMP_PRESETS };
