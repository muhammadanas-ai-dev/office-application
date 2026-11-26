// Edit a PDF's information dictionary (F29).
//
// POST /api/documents/[id]/pdf/metadata
// Body: { "title": "...", "author": "...",
//         "subject": "...", "keywords": "a, b, c" }
//
// Writes the fields into the PDF itself and saves a new
// version. Creator and producer are the producing
// software's record and cannot be edited.
import { NextResponse } from "next/server";
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
  applyPdfMetadata,
  validateMetadataEdit,
} from "@/lib/pdf-metadata";
import { logError } from "@/lib/log";

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
  try {
    const edit = validateMetadataEdit(
      (body ?? {}) as Record<string, unknown>
    );
    const user = await getToolsUser();
    const limit = pdfEditRateLimiter.check(user.id);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many requests — wait a moment and try again." },
        { status: 429 }
      );
    }
    const userClient = await getToolsClient();
    const document = await fetchEditableDocument(userClient, id);
    const { bytes } = await fetchDocumentPdf(userClient, id);
    const newBytes = await applyPdfMetadata(bytes, edit);
    const version = await saveNewVersion(document, user.id, newBytes);
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
    logError("pdf metadata edit", error);
    return NextResponse.json(
      { error: "Could not update this PDF's properties." },
      { status: 500 }
    );
  }
}
