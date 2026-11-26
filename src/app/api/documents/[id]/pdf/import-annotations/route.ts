// Import annotations from another PDF (F30).
//
// POST /api/documents/[id]/pdf/import-annotations
// Body: { "sourceDocumentId": "<uuid>" }
//
// Copies every annotation from the source PDF onto the
// same page numbers of this document and saves a new
// version. Annotations on source pages this document does
// not have are skipped and counted in the response.
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  AnnotateError,
  fetchAnnotateDocument,
  fetchAnnotateDocumentBytes,
  getToolsClient,
  getToolsUser,
  importAnnotationsInPdf,
  pdfAnnotateRateLimiter,
  saveAnnotatedVersion,
} from "@/lib/pdf-annotate.server";
import { fetchDocumentPdf } from "@/lib/pdf-tools.server";
import { PdfToolsError } from "@/lib/pdf-ops";
import { PdfEditError } from "@/lib/pdf-edit";
import { logError } from "@/lib/log";

const ImportBody = z.object({
  sourceDocumentId: z.string().uuid("Choose a PDF from your library."),
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
  const parsed = ImportBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }
  if (parsed.data.sourceDocumentId === id) {
    return NextResponse.json(
      { error: "Choose a different PDF to import comments from." },
      { status: 400 }
    );
  }
  try {
    const user = await getToolsUser();
    const limit = pdfAnnotateRateLimiter.check(user.id);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many requests — wait a moment and try again." },
        { status: 429 }
      );
    }
    const userClient = await getToolsClient();
    const document = await fetchAnnotateDocument(userClient, id);
    const targetBytes = await fetchAnnotateDocumentBytes(document);
    const { bytes: sourceBytes } = await fetchDocumentPdf(
      userClient,
      parsed.data.sourceDocumentId
    );
    const result = await importAnnotationsInPdf(targetBytes, sourceBytes);
    const version = await saveAnnotatedVersion(
      document,
      user.id,
      result.bytes
    );
    return NextResponse.json({
      ok: true,
      version,
      documentId: document.id,
      title: document.title,
      imported: result.imported,
      skipped: result.skipped,
    });
  } catch (error) {
    if (
      error instanceof AnnotateError ||
      error instanceof PdfToolsError ||
      error instanceof PdfEditError
    ) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    logError("pdf import-annotations", error);
    return NextResponse.json(
      { error: "Could not import the comments." },
      { status: 500 }
    );
  }
}
