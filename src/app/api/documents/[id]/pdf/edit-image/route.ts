// Replace an image in a PDF (Phase B, feature 3).
//
// POST /api/documents/[id]/pdf/edit-image
// Body: multipart/form-data with `page` (1-based), `imageIndex`
// (0-based, as listed by the edit page) and `file` (a PNG or JPEG).
//
// The replacement is embedded and drawn in exactly the same frame
// (position and size) as the old image. Every edit creates a new
// immutable version — the original file is never overwritten.
// Returns { ok, version, documentId, title }.
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  PdfEditError,
  detectImageMime,
  editJsonResponse,
  fetchDocumentPdf,
  fetchEditableDocument,
  getToolsClient,
  getToolsUser,
  pdfEditRateLimiter,
  replaceImageInPdf,
  saveNewVersion,
} from "@/lib/pdf-edit.server";
import { MAX_REPLACEMENT_IMAGE_BYTES } from "@/lib/pdf-edit";
import { logError } from "@/lib/log";

const EditImageFields = z.object({
  page: z.coerce.number().int().min(1, "Page must be at least 1."),
  imageIndex: z.coerce.number().int().min(0, "Image index must be at least 0."),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Attach a PNG or JPEG image." },
      { status: 400 }
    );
  }
  const parsed = EditImageFields.safeParse({
    page: form.get("page"),
    imageIndex: form.get("imageIndex"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }
  if (file.size === 0 || file.size > MAX_REPLACEMENT_IMAGE_BYTES) {
    return NextResponse.json(
      { error: "The replacement image is empty or larger than 10 MB." },
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
    const imageBytes = new Uint8Array(await file.arrayBuffer());
    const imageMime = detectImageMime(imageBytes);
    if (!imageMime) {
      return NextResponse.json(
        { error: "The replacement file is not a PNG or JPEG image." },
        { status: 400 }
      );
    }
    const userClient = await getToolsClient();
    const document = await fetchEditableDocument(userClient, id);
    const { bytes } = await fetchDocumentPdf(userClient, id);
    const out = await replaceImageInPdf(bytes, {
      page: parsed.data.page,
      imageIndex: parsed.data.imageIndex,
      imageBytes,
      imageMime,
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
    logError("pdf edit-image", error);
    return NextResponse.json(
      { error: "Could not replace this image." },
      { status: 500 }
    );
  }
}
