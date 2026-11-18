// Password-protect a PDF (Day 20).
//
// POST /api/documents/[id]/pdf/protect
// Body: { "userPassword": "opensesame",
//         "ownerPassword": "ownerpass" (optional — defaults to
//         the user password),
//         "bits": 256 (128 or 256),
//         "permissions": { "print": "full" | "low" | "none",
//                          "extract": true, "modify": "all" | "none",
//                          "annotate": true } }
//
// The PDF is encrypted with qpdf (AES-256 by default). The
// passwords are used only for this call and are never stored.
// An already-encrypted PDF is refused (unlock it first, then
// protect it again). Every protection creates a new immutable
// version — the original file is never overwritten.
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
import { isEncryptedPdf } from "@/lib/pdf-security";
import {
  PdfSecurityError,
  getPdfSecurity,
  protectPdf,
} from "@/lib/pdf-security.server";

const PermissionsBody = z.object({
  print: z.enum(["full", "low", "none"]),
  extract: z.boolean(),
  modify: z.enum(["all", "none"]),
  annotate: z.boolean(),
});

const ProtectBody = z.object({
  userPassword: z
    .string()
    .min(4, "The password must be at least 4 characters.")
    .max(128, "The password must be at most 128 characters."),
  ownerPassword: z.string().max(128).optional(),
  bits: z.enum(["128", "256"]).transform((v) => Number(v) as 128 | 256),
  permissions: PermissionsBody,
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

  const parsed = ProtectBody.safeParse(body);
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
    if (await isEncryptedPdf(bytes)) {
      return NextResponse.json(
        {
          error:
            "This PDF is already protected. Unlock it first, then protect it again with the new settings.",
        },
        { status: 400 }
      );
    }
    const protectedBytes = await protectPdf(bytes, parsed.data);
    // Confirm the result is really encrypted before saving it.
    const info = await getPdfSecurity(protectedBytes);
    if (!info.encrypted) {
      return NextResponse.json(
        { error: "Could not protect this PDF." },
        { status: 500 }
      );
    }
    const version = await saveNewVersion(document, user.id, protectedBytes);
    return editJsonResponse({
      version,
      documentId: document.id,
      title: document.title,
    });
  } catch (error) {
    if (
      error instanceof PdfEditError ||
      error instanceof PdfToolsError ||
      error instanceof PdfSecurityError
    ) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("[pdf protect]", error);
    return NextResponse.json(
      { error: "Could not protect this PDF." },
      { status: 500 }
    );
  }
}
