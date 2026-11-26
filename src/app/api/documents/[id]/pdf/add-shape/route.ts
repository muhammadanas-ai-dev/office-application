// Add a shape to a page of a PDF (Day 19, part 2).
//
// POST /api/documents/[id]/pdf/add-shape
// Body: { "page": 1, "shape": "rectangle" | "ellipse" | "line",
//         "rect": { "x1": 50, "y1": 300, "x2": 150, "y2": 350 },
//         "color": "blue", "filled": true }
//
// A rectangle or ellipse is inscribed in the dragged rectangle; a
// line runs from the drag's start point to its end point. Every
// addition creates a new immutable version — the original file is
// never overwritten. Returns { ok, version, documentId, title }.
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
import { addShapeToPdf } from "@/lib/pdf-page-tools";
import { logError } from "@/lib/log";

const DragRectBody = z.object({
  x1: z.number().finite(),
  y1: z.number().finite(),
  x2: z.number().finite(),
  y2: z.number().finite(),
});

const AddShapeBody = z.object({
  page: z.number().int().min(1),
  shape: z.enum(["rectangle", "ellipse", "line"]),
  rect: DragRectBody,
  color: z.enum(["black", "grey", "red", "green", "blue"]),
  filled: z.boolean(),
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

  const parsed = AddShapeBody.safeParse(body);
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
    const { bytes } = await fetchDocumentPdf(userClient, id);
    const shaped = await addShapeToPdf(bytes, parsed.data);
    const version = await saveNewVersion(document, user.id, shaped);
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
    logError("pdf add-shape", error);
    return NextResponse.json(
      { error: "Could not add the shape." },
      { status: 500 }
    );
  }
}
