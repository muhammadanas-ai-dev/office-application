// Insert an image onto a page of a PDF (F38).
//
// POST /api/documents/[id]/pdf/insert-image
// Body: { "imageDocumentId": "<uuid>", "page": 1,
//         "x": 50, "y": 400, "width": 200 }
//
// The image comes from the library (PNG/JPEG directly;
// WEBP/TIFF are decoded to PNG first — for a multi-page
// TIFF the first page is used). (x, y) is the image's
// bottom-left corner in PDF points; the height follows
// the aspect ratio. Saves a new version.
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
import { insertImageOnPageInPdf } from "@/lib/pdf-page-tools";
import { IMAGE_TO_PDF_MIME_TYPES } from "@/lib/pdf-images";
import { imageToPdfPages } from "@/lib/pdf-images.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DOCUMENTS_BUCKET } from "@/lib/storage";
import { logError } from "@/lib/log";

const InsertImageBody = z.object({
  imageDocumentId: z.string().uuid("Choose an image from your library."),
  page: z.number().int().min(1),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().positive(),
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
  const parsed = InsertImageBody.safeParse(body);
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
        { error: "Too many requests — wait a moment and try again." },
        { status: 429 }
      );
    }
    const userClient = await getToolsClient();
    const document = await fetchEditableDocument(userClient, id);
    const { bytes } = await fetchDocumentPdf(userClient, id);

    // The source image, through the user's client (RLS).
    const { data: imageDoc, error: imageError } = await userClient
      .from("documents")
      .select("id, title, file_path, mime_type")
      .eq("id", parsed.data.imageDocumentId)
      .is("deleted_at", null)
      .maybeSingle();
    if (imageError) {
      throw new PdfToolsError(500, "Could not load the image.");
    }
    if (!imageDoc) {
      throw new PdfToolsError(
        404,
        "Image not found, or you do not have access to it."
      );
    }
    const imagePath = imageDoc.file_path;
    const imageMime = imageDoc.mime_type;
    if (
      !imagePath ||
      !imageMime ||
      !(IMAGE_TO_PDF_MIME_TYPES as readonly string[]).includes(imageMime)
    ) {
      throw new PdfToolsError(
        400,
        "Choose a PNG, JPEG, WEBP or TIFF image from your library."
      );
    }
    const admin = createAdminClient();
    const { data: blob, error: downloadError } = await admin.storage
      .from(DOCUMENTS_BUCKET)
      .download(imagePath);
    if (downloadError || !blob) {
      throw new PdfToolsError(500, "Could not read the image file.");
    }
    const pages = await imageToPdfPages(
      new Uint8Array(await blob.arrayBuffer()),
      imageMime
    );
    const first = pages[0];
    const newBytes = await insertImageOnPageInPdf(
      bytes,
      { bytes: first.bytes, mimeType: first.mimeType },
      {
        page: parsed.data.page,
        x: parsed.data.x,
        y: parsed.data.y,
        width: parsed.data.width,
      }
    );
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
    logError("pdf insert-image", error);
    return NextResponse.json(
      { error: "Could not insert the image." },
      { status: 500 }
    );
  }
}
