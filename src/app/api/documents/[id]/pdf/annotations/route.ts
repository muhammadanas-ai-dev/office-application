// List and add annotations on a PDF (Day 17).
//
// GET /api/documents/[id]/pdf/annotations
// Returns { ok, annotations: [{ page, index, subtype, rect,
// quadPoints, inkList, contents, color, author, date }] }.
// The list is read from the PDF itself — annotations live in the
// file, not in a table.
//
// POST /api/documents/[id]/pdf/annotations
// Body: { "annotations": [ { kind, page, quadPoints?, x?, y?,
// strokes?, contents? }, ... ] }
// Adds the annotations and creates a new immutable version — the
// original file is never overwritten.
// Returns { ok, version, documentId, title }.
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  AnnotateError,
  addAnnotationsToPdf,
  annotateJsonResponse,
  fetchAnnotateDocument,
  fetchAnnotateDocumentBytes,
  getToolsClient,
  getToolsUser,
  listAnnotationsInPdf,
  pdfAnnotateRateLimiter,
  removeAnnotationFromPdf,
  saveAnnotatedVersion,
} from "@/lib/pdf-annotate.server";

const AnnotationInputBody = z.object({
  kind: z.enum(["highlight", "underline", "strikeout", "note", "ink"]),
  page: z.number().int().min(1),
  quadPoints: z.array(z.number().finite()).max(800).optional(),
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  strokes: z.array(z.array(z.number().finite()).max(2000)).max(50).optional(),
  contents: z.string().max(2000).optional(),
});

const AddAnnotationsBody = z.object({
  annotations: z
    .array(AnnotationInputBody)
    .min(1, "Add at least one annotation.")
    .max(50, "Add at most 50 annotations at once."),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    await getToolsUser();
    const userClient = await getToolsClient();
    const document = await fetchAnnotateDocument(userClient, id);
    const bytes = await fetchAnnotateDocumentBytes(document);
    const annotations = await listAnnotationsInPdf(bytes);
    return NextResponse.json(
      { ok: true, annotations },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof AnnotateError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("[pdf annotations]", error);
    return NextResponse.json(
      { error: "Could not list this PDF's annotations." },
      { status: 500 }
    );
  }
}

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

  const parsed = AddAnnotationsBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body." },
      { status: 400 }
    );
  }

  try {
    const user = await getToolsUser();
    const limit = pdfAnnotateRateLimiter.check(user.id);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many annotation requests. Try again in a minute." },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)),
          },
        }
      );
    }
    const userClient = await getToolsClient();
    const document = await fetchAnnotateDocument(userClient, id);
    const bytes = await fetchAnnotateDocumentBytes(document);
    const annotated = await addAnnotationsToPdf(bytes, parsed.data.annotations);
    const version = await saveAnnotatedVersion(document, user.id, annotated);
    return annotateJsonResponse({
      version,
      documentId: document.id,
      title: document.title,
    });
  } catch (error) {
    if (error instanceof AnnotateError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("[pdf annotations]", error);
    return NextResponse.json(
      { error: "Could not add the annotations." },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

  const parsed = z
    .object({
      page: z.number().int().min(1),
      index: z.number().int().min(0),
    })
    .safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body." },
      { status: 400 }
    );
  }

  try {
    const user = await getToolsUser();
    const limit = pdfAnnotateRateLimiter.check(user.id);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many annotation requests. Try again in a minute." },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)),
          },
        }
      );
    }
    const userClient = await getToolsClient();
    const document = await fetchAnnotateDocument(userClient, id);
    const bytes = await fetchAnnotateDocumentBytes(document);
    const annotated = await removeAnnotationFromPdf(
      bytes,
      parsed.data.page,
      parsed.data.index
    );
    const version = await saveAnnotatedVersion(document, user.id, annotated);
    return annotateJsonResponse({
      version,
      documentId: document.id,
      title: document.title,
    });
  } catch (error) {
    if (error instanceof AnnotateError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("[pdf annotations]", error);
    return NextResponse.json(
      { error: "Could not remove the annotation." },
      { status: 500 }
    );
  }
}
