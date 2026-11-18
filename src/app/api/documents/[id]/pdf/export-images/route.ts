// Export a PDF's pages as images (Day 22).
//
// GET /api/documents/[id]/pdf/export-images?format=png|jpg&dpi=72|150|300
// Returns a ZIP file with one image per page (page-1.png, ...).
// Defaults: PNG, 150 DPI. The page count is capped at 20.
// It is an export (like Day 7) — it creates no document and no
// version.
import { NextResponse } from "next/server";
import { PdfEditError } from "@/lib/pdf-edit";
import {
  OcrError,
  countOcrPdfPages,
  fetchDocumentPdf,
  fetchEditableDocument,
  getToolsClient,
  getToolsUser,
  renderPdfPagesToImages,
  withTempDir,
  zipImageFiles,
} from "@/lib/pdf-images.server";
import { PdfToolsError } from "@/lib/pdf-ops";
import {
  MAX_IMAGE_EXPORT_PAGES,
  getImageExportFileName,
  isImageExportDpi,
  isImageExportFormat,
} from "@/lib/pdf-images";

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
    const url = new URL(request.url);
    const formatParam = (url.searchParams.get("format") ?? "png").toLowerCase();
    const dpiParam = Number(url.searchParams.get("dpi") ?? "150");
    if (!isImageExportFormat(formatParam)) {
      return NextResponse.json(
        { error: "Choose png or jpg for the image format." },
        { status: 400 }
      );
    }
    if (!isImageExportDpi(dpiParam)) {
      return NextResponse.json(
        { error: "Choose 72, 150 or 300 for the DPI." },
        { status: 400 }
      );
    }
    const pageCount = await countOcrPdfPages(bytes);
    if (pageCount > MAX_IMAGE_EXPORT_PAGES) {
      return NextResponse.json(
        {
          error: `This PDF has ${pageCount} pages — at most ${MAX_IMAGE_EXPORT_PAGES} pages can be exported at once.`,
        },
        { status: 400 }
      );
    }
    const zipBytes = await withTempDir(async (dir) => {
      const imagePaths = await renderPdfPagesToImages(
        bytes,
        dir,
        formatParam,
        dpiParam
      );
      if (imagePaths.length !== pageCount) {
        throw new PdfEditError(
          502,
          `This PDF has ${pageCount} pages but only ${imagePaths.length} rendered.`
        );
      }
      return zipImageFiles(dir, imagePaths);
    });
    const fileName = getImageExportFileName(document.title);
    const encoded = encodeURIComponent(fileName).replace(
      /[!'()*]/g,
      (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
    );
    // zipBytes is a Buffer (a Uint8Array over an ArrayBufferLike);
    // copy it into a fresh Uint8Array so the Response body has
    // exactly the ZIP bytes (a Buffer's .buffer may be a shared
    // pool).
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
    console.error("[pdf export-images]", error);
    return NextResponse.json(
      { error: "Could not export this PDF's pages as images." },
      { status: 500 }
    );
  }
}
