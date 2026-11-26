// Extract a PDF's embedded images (F22).
//
// GET /api/documents/[id]/pdf/extract-images
// Returns a ZIP with the images embedded in the PDF — the
// actual image objects at their stored resolution (via
// poppler's pdfimages), named img-<page>-<index>.<ext>. An
// image's alpha mask is extracted as its own file, as
// pdfimages reports it. This is an export: it creates no
// document and no version. A PDF with no embedded images is
// a 400 with a clear message (rendering pages as images is
// the Day 22 "Export images" instead).
import { NextResponse } from "next/server";
import { PdfEditError } from "@/lib/pdf-edit";
import {
  OcrError,
  extractEmbeddedImages,
  fetchDocumentPdf,
  fetchEditableDocument,
  getToolsClient,
  getToolsUser,
  withTempDir,
  zipImageFiles,
} from "@/lib/pdf-images.server";
import { PdfToolsError } from "@/lib/pdf-ops";
import { getExtractImagesFileName } from "@/lib/pdf-images";
import { logError } from "@/lib/log";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await getToolsUser();
    const userClient = await getToolsClient();
    const document = await fetchEditableDocument(userClient, id);
    const { bytes } = await fetchDocumentPdf(userClient, id);
    const zipBytes = await withTempDir(async (dir) => {
      const imagePaths = await extractEmbeddedImages(bytes, dir);
      if (imagePaths.length === 0) {
        throw new PdfEditError(
          400,
          "This PDF contains no embedded images. To get a picture of each page instead, use Export images."
        );
      }
      return zipImageFiles(dir, imagePaths);
    });
    const fileName = getExtractImagesFileName(document.title);
    const encoded = encodeURIComponent(fileName).replace(
      /[!'()*]/g,
      (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
    );
    return new Response(new Uint8Array(zipBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encoded}`,
      },
    });
  } catch (error) {
    if (
      error instanceof PdfEditError ||
      error instanceof PdfToolsError ||
      error instanceof OcrError
    ) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    logError("pdf extract-images", error);
    return NextResponse.json(
      { error: "Could not extract this PDF's images." },
      { status: 500 }
    );
  }
}
