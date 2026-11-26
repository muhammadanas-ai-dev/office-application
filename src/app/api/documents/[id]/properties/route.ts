// Document properties (F29).
//
// GET /api/documents/[id]/properties
// Returns the document's library facts (title, type, size,
// version, dates) and — for a PDF with a file — the PDF's
// own information dictionary (title, author, subject,
// keywords, creator, producer, dates, page count).
import { NextResponse } from "next/server";
import {
  getToolsClient,
  getToolsUser,
} from "@/lib/pdf-tools.server";
import { PdfToolsError } from "@/lib/pdf-ops";
import { fetchDocumentPdf } from "@/lib/pdf-tools.server";
import { readPdfMetadata } from "@/lib/pdf-metadata";
import { PdfEditError } from "@/lib/pdf-edit";
import { logError } from "@/lib/log";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await getToolsUser();
    const userClient = await getToolsClient();
    const { data: document, error } = await userClient
      .from("documents")
      .select(
        "id, title, mime_type, size_bytes, version, created_at, updated_at, file_path"
      )
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) {
      throw new PdfToolsError(500, "Could not load the document.");
    }
    if (!document) {
      throw new PdfToolsError(
        404,
        "Document not found, or you do not have access to it."
      );
    }
    let pdf: Awaited<ReturnType<typeof readPdfMetadata>> | null = null;
    if (document.file_path && document.mime_type === "application/pdf") {
      const { bytes } = await fetchDocumentPdf(userClient, id);
      pdf = await readPdfMetadata(bytes);
    }
    return NextResponse.json(
      {
        ok: true,
        document: {
          id: document.id,
          title: document.title,
          mimeType: document.mime_type,
          sizeBytes: document.size_bytes,
          version: document.version,
          createdAt: document.created_at,
          updatedAt: document.updated_at,
          hasFile: document.file_path !== null,
        },
        pdf,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof PdfToolsError || error instanceof PdfEditError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    logError("document properties", error);
    return NextResponse.json(
      { error: "Could not read this document's properties." },
      { status: 500 }
    );
  }
}
