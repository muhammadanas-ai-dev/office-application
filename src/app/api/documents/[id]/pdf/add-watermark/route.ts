// Add a watermark to a PDF (Day 32).
//
// POST /api/documents/[id]/pdf/add-watermark
// Text watermark (JSON body):
//   { "kind": "text", "text": "CONFIDENTIAL", "pages": "all",
//     "position": "centre-diagonal", "size": 48, "color": "red",
//     "opacity": 0.3, "rotation": 45 }
// Image watermark (multipart form data):
//   kind=image, image=<PNG or JPEG file>, pages, position, scale,
//   opacity, rotation
//
// The watermark is drawn INTO the page content (it becomes part
// of the page, not an annotation), so it is permanent — removing
// it later means restoring an earlier version. Every addition
// creates a new immutable version — the original file is never
// overwritten. Returns { ok, version, documentId, title }.
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  PdfEditError,
  PdfToolsError,
  addImageWatermarkToPdf,
  addTextWatermarkToPdf,
  editJsonResponse,
  fetchEditableDocument,
  getToolsClient,
  getToolsUser,
  pdfStampRateLimiter,
  saveNewVersion,
} from "@/lib/pdf-stamp.server";
import { fetchDocumentPdf } from "@/lib/pdf-tools.server";
import {
  DEFAULT_WATERMARK_OPACITY,
  DEFAULT_WATERMARK_SIZE,
  MAX_WATERMARK_IMAGE_BYTES,
  MAX_WATERMARK_OPACITY,
  MAX_WATERMARK_TEXT_CHARS,
  MIN_WATERMARK_OPACITY,
  WATERMARK_ROTATIONS,
} from "@/lib/pdf-stamp";
import { MAX_ADDED_TEXT_SIZE, MIN_ADDED_TEXT_SIZE } from "@/lib/pdf-page-tools";

const TextWatermarkBody = z.object({
  kind: z.literal("text"),
  text: z
    .string()
    .min(1, "Enter the watermark text.")
    .max(MAX_WATERMARK_TEXT_CHARS),
  pages: z.string().min(1, "Choose the pages."),
  position: z.enum([
    "centre-diagonal",
    "centre",
    "top-centre",
    "bottom-centre",
  ]),
  size: z.number().int().min(MIN_ADDED_TEXT_SIZE).max(MAX_ADDED_TEXT_SIZE),
  color: z.enum(["black", "grey", "red", "green", "blue"]),
  opacity: z.number().min(MIN_WATERMARK_OPACITY).max(MAX_WATERMARK_OPACITY),
  rotation: z
    .number()
    .int()
    .refine((v) => (WATERMARK_ROTATIONS as readonly number[]).includes(v), {
      message: "Rotation must be 0, 30, 45, 60 or 90 degrees.",
    }),
});

const ImageWatermarkFields = z.object({
  pages: z.string().min(1, "Choose the pages."),
  position: z.enum([
    "centre",
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
  ]),
  scale: z.number().min(0.1).max(1),
  opacity: z.number().min(MIN_WATERMARK_OPACITY).max(MAX_WATERMARK_OPACITY),
  rotation: z
    .number()
    .int()
    .refine((v) => (WATERMARK_ROTATIONS as readonly number[]).includes(v), {
      message: "Rotation must be 0, 30, 45, 60 or 90 degrees.",
    }),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const contentType = request.headers.get("content-type") ?? "";
  const isMultipart = contentType.includes("multipart/form-data");

  try {
    const user = await getToolsUser();
    const limit = pdfStampRateLimiter.check(user.id);
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

    if (!isMultipart) {
      let body: unknown = null;
      try {
        body = await request.json();
      } catch {
        return NextResponse.json(
          { error: "Invalid request body." },
          { status: 400 }
        );
      }
      const parsed = TextWatermarkBody.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message ?? "Invalid request body." },
          { status: 400 }
        );
      }
      const stamped = await addTextWatermarkToPdf(bytes, parsed.data);
      const version = await saveNewVersion(document, user.id, stamped);
      return editJsonResponse({
        version,
        documentId: document.id,
        title: document.title,
      });
    }

    // Image watermark: multipart form data with the image file.
    const form = await request.formData();
    const kind = form.get("kind");
    if (kind !== "image") {
      return NextResponse.json(
        { error: "The image watermark needs kind=image and an image file." },
        { status: 400 }
      );
    }
    const parsed = ImageWatermarkFields.safeParse({
      pages: form.get("pages"),
      position: form.get("position"),
      scale: Number(form.get("scale") ?? DEFAULT_WATERMARK_SIZE),
      opacity: Number(form.get("opacity") ?? DEFAULT_WATERMARK_OPACITY),
      rotation: Number(form.get("rotation") ?? 0),
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request body." },
        { status: 400 }
      );
    }
    const imageFile = form.get("image");
    if (!(imageFile instanceof File)) {
      return NextResponse.json(
        { error: "Choose a PNG or JPEG image for the watermark." },
        { status: 400 }
      );
    }
    if (imageFile.type !== "image/png" && imageFile.type !== "image/jpeg") {
      return NextResponse.json(
        { error: "The watermark image must be a PNG or a JPEG." },
        { status: 400 }
      );
    }
    if (imageFile.size > MAX_WATERMARK_IMAGE_BYTES) {
      return NextResponse.json(
        { error: "The image must be at most 10 MB." },
        { status: 400 }
      );
    }
    const imageBytes = new Uint8Array(await imageFile.arrayBuffer());
    const stamped = await addImageWatermarkToPdf(
      bytes,
      imageBytes,
      imageFile.type,
      parsed.data
    );
    const version = await saveNewVersion(document, user.id, stamped);
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
    console.error("[pdf add-watermark]", error);
    return NextResponse.json(
      { error: "Could not add the watermark." },
      { status: 500 }
    );
  }
}
