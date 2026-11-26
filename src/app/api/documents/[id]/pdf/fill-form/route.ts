// Fill the form fields of a PDF (Phase B, feature 4).
//
// POST /api/documents/[id]/pdf/fill-form
// Body: { "values": { "Full Name": "Muhammad Anas",
//                      "Subscribe": true, "Country": "Pakistan" } }
//
// Values: a string for text and radio fields, a boolean for
// checkboxes, a string (or array of strings) for dropdowns and
// option lists. Validation is atomic — one bad value refuses the
// whole fill and nothing is saved. Every fill creates a new
// immutable version — the original file is never overwritten.
// Returns { ok, version, documentId, title }.
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  PdfFormError,
  fetchFormDocument,
  fetchFormDocumentBytes,
  fillJsonResponse,
  fillPdfForm,
  getToolsClient,
  getToolsUser,
  pdfFormRateLimiter,
  saveFilledVersion,
} from "@/lib/pdf-form.server";
import { logError } from "@/lib/log";

const FormValue = z.union([
  z.string().max(5000, "A field value is longer than 5,000 characters."),
  z.boolean(),
  z
    .array(z.string().max(5000))
    .max(100, "A field accepts at most 100 options at once."),
]);

const FillFormBody = z.object({
  values: z
    .record(z.string().min(1), FormValue)
    .refine((v) => Object.keys(v).length > 0, {
      message: "Enter at least one field value.",
    })
    .refine((v) => Object.keys(v).length <= 200, {
      message: "A fill accepts at most 200 fields at once.",
    }),
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
  const parsed = FillFormBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }

  try {
    const user = await getToolsUser();
    const limit = pdfFormRateLimiter.check(user.id);
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
    const out = await fillPdfForm(bytes, parsed.data.values);
    const version = await saveFilledVersion(document, user.id, out);
    return fillJsonResponse({
      version,
      documentId: document.id,
      title: document.title,
    });
  } catch (error) {
    if (error instanceof PdfFormError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    logError("pdf fill-form", error);
    return NextResponse.json(
      { error: "Could not fill this form." },
      { status: 500 }
    );
  }
}
