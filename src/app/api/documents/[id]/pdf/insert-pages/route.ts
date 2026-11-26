// Insert pages into a PDF (Day 18, part 1; image pages Day 33).
//
// POST /api/documents/[id]/pdf/insert-pages
// Body (JSON): { "source": "blank",
//         "position": { "kind": "before", "page": 2 }
//               | { "kind": "after", "page": 2 }
//               | { "kind": "end" } }
//    or { "source": { "documentId": "<uuid>", "pages": [1, 2] },
//         "position": { ... } }
// Body (multipart form data): source=image, one or more `image`
//   files (PNG/JPEG, each at most 10 MB), position_kind
//   (before/after/end) and position_page (for before/after).
//
// A blank page is sized from a neighbouring page. Pages from
// another PDF come from a PDF already in the library (the source
// is loaded through RLS, so the user must have access to it) and
// keep their own size, fonts and content. Each image becomes a
// new page of its own, sized from its neighbours, with the image
// drawn centred and scaled to fit. Every insert creates a new
// immutable version — the original file is never overwritten.
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
  MAX_INSERT_IMAGE_BYTES,
  insertBlankPageInPdf,
  insertPagesFromImageInPdf,
  insertPagesFromPdf,
  type InsertPosition,
} from "@/lib/pdf-page-tools";
import { logError } from "@/lib/log";

const PositionBody = z.union([
  z.object({ kind: z.literal("before"), page: z.number().int().min(1) }),
  z.object({ kind: z.literal("after"), page: z.number().int().min(1) }),
  z.object({ kind: z.literal("end") }),
]);

const InsertPagesBody = z.object({
  source: z.union([
    z.literal("blank"),
    z.object({
      documentId: z.string().uuid("Choose a PDF from your library."),
      pages: z
        .array(z.number().int().min(1))
        .min(1, "Choose at least one page to insert.")
        .max(50, "Insert at most 50 pages at once."),
    }),
  ]),
  position: PositionBody,
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const contentType = request.headers.get("content-type") ?? "";
  const isMultipart = contentType.includes("multipart/form-data");

  if (isMultipart) {
    return insertFromImages(request, id);
  }

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  const parsed = InsertPagesBody.safeParse(body);
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
    if (!document.file_path) {
      throw new PdfEditError(400, "This document has no file yet.");
    }
    const { bytes } = await fetchDocumentPdf(userClient, id);
    const position = parsed.data.position as InsertPosition;
    let inserted: Uint8Array;
    if (parsed.data.source === "blank") {
      inserted = await insertBlankPageInPdf(bytes, position);
    } else {
      if (parsed.data.source.documentId === id) {
        throw new PdfEditError(
          400,
          "Insert pages from a different PDF, not this one."
        );
      }
      const source = await fetchDocumentPdf(
        userClient,
        parsed.data.source.documentId
      );
      inserted = await insertPagesFromPdf(bytes, source.bytes, {
        pages: parsed.data.source.pages,
        position,
      });
    }
    const version = await saveNewVersion(document, user.id, inserted);
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
    logError("pdf insert-pages", error);
    return NextResponse.json(
      { error: "Could not insert the pages." },
      { status: 500 }
    );
  }
}

/** Insert pages from uploaded images (multipart form data).
 *  Fields: source=image, image (one or more PNG/JPEG files),
 *  position_kind (before/after/end), position_page (for
 *  before/after). */
async function insertFromImages(request: Request, id: string) {
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
    if (!document.file_path) {
      throw new PdfEditError(400, "This document has no file yet.");
    }
    const form = await request.formData();
    if (form.get("source") !== "image") {
      return NextResponse.json(
        { error: "The image insert needs source=image and image files." },
        { status: 400 }
      );
    }
    const positionKind = form.get("position_kind");
    const positionPage = Number(form.get("position_page") ?? 1);
    const position: InsertPosition =
      positionKind === "end"
        ? { kind: "end" }
        : positionKind === "after"
          ? { kind: "after", page: positionPage }
          : { kind: "before", page: positionPage };
    const files = form.getAll("image").filter((f) => f instanceof File);
    if (files.length === 0) {
      return NextResponse.json(
        { error: "Choose at least one PNG or JPEG image to insert." },
        { status: 400 }
      );
    }
    const images: { bytes: Uint8Array; mime: string }[] = [];
    for (const file of files as File[]) {
      if (file.type !== "image/png" && file.type !== "image/jpeg") {
        return NextResponse.json(
          { error: "Each image must be a PNG or a JPEG." },
          { status: 400 }
        );
      }
      if (file.size > MAX_INSERT_IMAGE_BYTES) {
        return NextResponse.json(
          { error: "Each image must be at most 10 MB." },
          { status: 400 }
        );
      }
      images.push({
        bytes: new Uint8Array(await file.arrayBuffer()),
        mime: file.type,
      });
    }
    const { bytes } = await fetchDocumentPdf(userClient, id);
    const inserted = await insertPagesFromImageInPdf(bytes, images, position);
    const version = await saveNewVersion(document, user.id, inserted);
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
    logError("pdf insert-pages image", error);
    return NextResponse.json(
      { error: "Could not insert the pages." },
      { status: 500 }
    );
  }
}
