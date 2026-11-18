// Add text to a page of a PDF (Day 19, part 2).
//
// POST /api/documents/[id]/pdf/add-text
// Body: { "page": 1, "x": 50, "y": 400, "text": "Added text",
//         "size": 14, "font": "helvetica", "color": "red" }
//
// The text is drawn with its baseline at (x, y) — the click is
// where the text starts. Every addition creates a new immutable
// version — the original file is never overwritten.
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
import {
  MAX_ADDED_TEXT_CHARS,
  MAX_ADDED_TEXT_SIZE,
  MIN_ADDED_TEXT_SIZE,
  addTextToPdf,
} from "@/lib/pdf-page-tools";

const AddTextBody = z.object({
  page: z.number().int().min(1),
  x: z.number().finite(),
  y: z.number().finite(),
  text: z.string().min(1, "Enter the text to add.").max(MAX_ADDED_TEXT_CHARS),
  size: z.number().int().min(MIN_ADDED_TEXT_SIZE).max(MAX_ADDED_TEXT_SIZE),
  font: z.enum(["helvetica", "times", "courier"]),
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

  const parsed = AddTextBody.safeParse(body);
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
    const added = await addTextToPdf(bytes, parsed.data);
    const version = await saveNewVersion(document, user.id, added);
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
    console.error("[pdf add-text]", error);
    return NextResponse.json(
      { error: "Could not add the text." },
      { status: 500 }
    );
  }
}
