// Add a form field to a PDF (Phase B, feature 5 — form builder).
//
// POST /api/documents/[id]/pdf/add-field
// Body: { "name": "Full Name", "type": "text", "page": 1,
//         "x": 50, "y": 700, "width": 200, "height": 24,
//         "required": true }
//
// Types: text, checkbox, radio, dropdown, optionList. For radio,
// dropdown and optionList, "options" is the list of choices —
// a radio group is laid out as a vertical column starting at
// (x, y), 20 points per option. x, y, width and height are in
// PDF points (origin bottom-left); the client converts the
// click position from screen coordinates. Validation is atomic —
// a bad spec refuses the whole add and nothing is saved. Every
// add creates a new immutable version — the original file is
// never overwritten. Returns { ok, version, documentId, title,
// field }.
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  PdfFormBuilderError,
  addFormField,
  builderJsonResponse,
  fetchFormDocument,
  fetchFormDocumentBytes,
  getToolsClient,
  getToolsUser,
  pdfFormBuilderRateLimiter,
  saveFilledVersion,
} from "@/lib/pdf-form-builder.server";
import { PdfFormError } from "@/lib/pdf-form.server";
import { logError } from "@/lib/log";

const AddFieldBody = z.object({
  name: z
    .string()
    .min(1, "Give the field a name.")
    .max(200, "The field name is too long — keep it under 200 characters."),
  type: z.enum(["text", "checkbox", "radio", "dropdown", "optionList"]),
  page: z
    .number()
    .int("The page must be a whole number.")
    .min(1, "The page must be at least 1."),
  x: z.number("The x position must be a number."),
  y: z.number("The y position must be a number."),
  width: z.number("The width must be a number."),
  height: z.number("The height must be a number."),
  options: z
    .array(
      z
        .string()
        .min(1, "Every option needs a name.")
        .max(200, "Keep each option under 200 characters.")
    )
    .max(100, "A field accepts at most 100 options.")
    .optional(),
  multiline: z.boolean().optional(),
  maxLength: z
    .number()
    .int("The maximum length must be a whole number.")
    .min(1, "The maximum length must be at least 1.")
    .max(10000, "The maximum length is too large.")
    .optional(),
  multiselect: z.boolean().optional(),
  required: z.boolean().optional(),
  readOnly: z.boolean().optional(),
  defaultValue: z
    .union([
      z.string().max(5000, "The default value is too long."),
      z.boolean(),
      z.array(z.string().max(5000)).max(100),
    ])
    .optional(),
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
  const parsed = AddFieldBody.safeParse(body);
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
    const out = await addFormField(bytes, parsed.data);
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
    logError("pdf add-field", error);
    return NextResponse.json(
      { error: "Could not add this field." },
      { status: 500 }
    );
  }
}
