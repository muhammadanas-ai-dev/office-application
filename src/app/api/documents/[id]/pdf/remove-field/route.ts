// Remove a form field from a PDF (Phase B, feature 5 — form builder).
//
// POST /api/documents/[id]/pdf/remove-field
// Body: { "name": "Full Name" }
//
// Removes the field and its widget(s) from the page, completely.
// Every removal creates a new immutable version — the original
// file is never overwritten. Returns { ok, version, documentId,
// title, field }.
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  PdfFormBuilderError,
  builderJsonResponse,
  fetchFormDocument,
  fetchFormDocumentBytes,
  getToolsClient,
  getToolsUser,
  pdfFormBuilderRateLimiter,
  removeFormField,
  saveFilledVersion,
} from "@/lib/pdf-form-builder.server";
import { PdfFormError } from "@/lib/pdf-form.server";

const RemoveFieldBody = z.object({
  name: z
    .string()
    .min(1, "Give the name of the field to remove.")
    .max(200, "The field name is too long."),
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
  const parsed = RemoveFieldBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }

  try {
    const user = await getToolsUser();
    const limit = pdfFormBuilderRateLimiter.check(user.id);
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
    const document = await fetchFormDocument(userClient, id);
    const bytes = await fetchFormDocumentBytes(document);
    const out = await removeFormField(bytes, parsed.data.name);
    const version = await saveFilledVersion(document, user.id, out);
    return builderJsonResponse({
      version,
      documentId: document.id,
      title: document.title,
      field: parsed.data.name,
    });
  } catch (error) {
    if (error instanceof PdfFormBuilderError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    if (error instanceof PdfFormError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("[pdf remove-field]", error);
    return NextResponse.json(
      { error: "Could not remove this field." },
      { status: 500 }
    );
  }
}
