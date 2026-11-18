// Edit the text of a PDF (Phase B, feature 3).
//
// POST /api/documents/[id]/pdf/edit-text
// Body: { "page": 1, "text": "old line", "replacement": "new line",
//         "occurrence": 0, "position": { "x": 85, "y": 774, "fontSize": 10 } }
//
// The old text is removed from the content stream and the
// replacement is drawn at the same baseline, size and rotation.
// The replacement does not reflow the page. Every edit creates a
// new immutable version — the original file is never overwritten.
// Returns { ok, version, documentId, title }.
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  PdfEditError,
  editJsonResponse,
  editTextInPdf,
  fetchDocumentPdf,
  fetchEditableDocument,
  getToolsClient,
  getToolsUser,
  pdfEditRateLimiter,
  saveNewVersion,
} from "@/lib/pdf-edit.server";
import { MAX_REPLACEMENT_CHARS } from "@/lib/pdf-edit";

const EditTextBody = z.object({
  page: z.number().int().min(1, "Page must be at least 1."),
  text: z.string().min(1, "Enter the text to replace.").max(2000),
  replacement: z
    .string()
    .min(1, "Enter the replacement text.")
    .max(
      MAX_REPLACEMENT_CHARS,
      `The replacement text is longer than ${MAX_REPLACEMENT_CHARS} characters.`
    ),
  occurrence: z.number().int().min(0).optional(),
  position: z
    .object({
      x: z.number().finite(),
      y: z.number().finite(),
      fontSize: z.number().finite().positive(),
    })
    .optional(),
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
  const parsed = EditTextBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
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
    const out = await editTextInPdf(bytes, {
      page: parsed.data.page,
      text: parsed.data.text,
      replacement: parsed.data.replacement,
      occurrence: parsed.data.occurrence,
      position: parsed.data.position,
    });
    const version = await saveNewVersion(document, user.id, out);
    return editJsonResponse({
      version,
      documentId: document.id,
      title: document.title,
    });
  } catch (error) {
    if (error instanceof PdfEditError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("[pdf edit-text]", error);
    return NextResponse.json(
      { error: "Could not edit this text." },
      { status: 500 }
    );
  }
}
