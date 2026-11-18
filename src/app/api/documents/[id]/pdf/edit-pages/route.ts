// Delete or reorder the pages of a PDF (Phase B, feature 3).
//
// POST /api/documents/[id]/pdf/edit-pages
// Body: { "action": "delete", "pages": [2] }
//    or { "action": "reorder", "order": [3, 1, 2] }
//
// A reorder must list every page exactly once. At least one page
// must remain. Every edit creates a new immutable version — the
// original file is never overwritten.
// Returns { ok, version, documentId, title }.
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  PdfEditError,
  deletePagesInPdf,
  editJsonResponse,
  fetchDocumentPdf,
  fetchEditableDocument,
  getToolsClient,
  getToolsUser,
  pdfEditRateLimiter,
  reorderPagesInPdf,
  saveNewVersion,
} from "@/lib/pdf-edit.server";

const EditPagesBody = z.union([
  z.object({
    action: z.literal("delete"),
    pages: z
      .array(z.number().int().min(1))
      .min(1, "Choose at least one page to delete.")
      .max(500),
  }),
  z.object({
    action: z.literal("reorder"),
    order: z
      .array(z.number().int().min(1))
      .min(1, "The new order must list every page.")
      .max(500),
  }),
]);

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
  const parsed = EditPagesBody.safeParse(body);
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
    const out =
      parsed.data.action === "delete"
        ? await deletePagesInPdf(bytes, { pages: parsed.data.pages })
        : await reorderPagesInPdf(bytes, { order: parsed.data.order });
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
    console.error("[pdf edit-pages]", error);
    return NextResponse.json(
      { error: "Could not change these pages." },
      { status: 500 }
    );
  }
}
