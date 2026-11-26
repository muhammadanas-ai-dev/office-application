// List the form fields of a PDF (Phase B, feature 4).
//
// GET /api/documents/[id]/pdf/form-fields
// Returns { ok, fields: [{ name, type, page, required, readOnly,
// value, options, maxLength, multiline }], hasForm }.
//
// A PDF with no form fields returns an empty list with
// hasForm: false — the UI reports that honestly instead of
// faking a form. An XFA PDF is refused with a clear 400.
import { NextResponse } from "next/server";
import {
  PdfFormError,
  fetchFormDocument,
  fetchFormDocumentBytes,
  getToolsClient,
  getToolsUser,
  listPdfFormFields,
} from "@/lib/pdf-form.server";
import { logError } from "@/lib/log";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    await getToolsUser();
    const userClient = await getToolsClient();
    const document = await fetchFormDocument(userClient, id);
    const bytes = await fetchFormDocumentBytes(document);
    const fields = await listPdfFormFields(bytes);
    return NextResponse.json(
      { ok: true, fields, hasForm: fields.length > 0 },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof PdfFormError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    logError("pdf form-fields", error);
    return NextResponse.json(
      { error: "Could not list this PDF's form fields." },
      { status: 500 }
    );
  }
}
