// Resize pages of a PDF (F27).
//
// POST /api/documents/[id]/pdf/resize-pages
// Body: { "pages": [1, 2] | [] (all),
//         "target": { "kind": "preset", "preset": "a4" }
//                 | { "kind": "scale", "percent": 150 } }
//
// Resized pages are rebuilt at the target size with the
// original page fitted into them (preset: fit + centre,
// aspect kept; scale: the box grows/shrinks by the percent).
// Unselected pages are copied unchanged. Annotations on
// resized pages do not carry over — the page is rebuilt.
// Creates a new immutable version.
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
import { resizePagesInPdf } from "@/lib/pdf-page-tools";
import { logError } from "@/lib/log";

const ResizeBody = z.object({
  pages: z.array(z.number().int().min(1)).max(500).default([]),
  target: z.union([
    z.object({
      kind: z.literal("preset"),
      preset: z.enum(["a4", "letter", "a5", "legal"]),
    }),
    z.object({
      kind: z.literal("scale"),
      percent: z.number(),
    }),
  ]),
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
  const parsed = ResizeBody.safeParse(body);
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
    const newBytes = await resizePagesInPdf(bytes, parsed.data);
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
    logError("pdf resize-pages", error);
    return NextResponse.json(
      { error: "Could not resize this PDF's pages." },
      { status: 500 }
    );
  }
}
