// Extract a PDF's text (Day 21).
//
// GET /api/documents/[id]/pdf/extract-text
// Returns the PDF's text as a downloadable .txt file (plain
// text, one line per text line, pages separated by a blank
// line). A scanned PDF with no text layer returns an empty file
// — that is the case "Make searchable" fixes (the response
// carries X-Forma-Extract-Empty: 1 in that case). The file name
// is the document's title with a .txt extension.
import { NextResponse } from "next/server";
import { PdfEditError } from "@/lib/pdf-edit";
import {
  fetchEditableDocument,
  getToolsClient,
  getToolsUser,
} from "@/lib/pdf-searchable.server";
import { fetchDocumentPdf } from "@/lib/pdf-tools.server";
import { PdfToolsError } from "@/lib/pdf-ops";
import { extractPdfText } from "@/lib/pdf-searchable";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    await getToolsUser();
    const userClient = await getToolsClient();
    const document = await fetchEditableDocument(userClient, id);
    const { bytes } = await fetchDocumentPdf(userClient, id);
    const { text } = await extractPdfText(bytes);
    const baseName = document.title.replace(/\.[^.]+$/, "") || "document";
    const fileName = `${baseName}.txt`;
    const encoded = encodeURIComponent(fileName).replace(
      /[!'()*]/g,
      (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
    );
    return new NextResponse(text, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encoded}`,
        ...(text.trim() === "" ? { "X-Forma-Extract-Empty": "1" } : {}),
      },
    });
  } catch (error) {
    if (error instanceof PdfEditError || error instanceof PdfToolsError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("[pdf extract-text]", error);
    return NextResponse.json(
      { error: "Could not extract this PDF's text." },
      { status: 500 }
    );
  }
}
