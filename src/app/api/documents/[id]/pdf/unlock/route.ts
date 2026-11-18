// Unlock a password-protected PDF (Day 20).
//
// POST /api/documents/[id]/pdf/unlock
// Body: { "password": "opensesame" }
//
// The PDF is decrypted with qpdf. The password is used only for
// this call and is never stored. A wrong password is refused
// with a clear 400. A PDF that is not encrypted is refused too.
// Unlocking creates a new immutable version (the unencrypted
// file) — the original file is never overwritten.
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
import { PdfSecurityError, unlockPdf } from "@/lib/pdf-security.server";

const UnlockBody = z.object({
  password: z.string().min(1, "Enter the password.").max(128),
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

  const parsed = UnlockBody.safeParse(body);
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
    if (!(await isEncryptedPdf(bytes))) {
      return NextResponse.json(
        { error: "This PDF is not protected, so there is nothing to unlock." },
        { status: 400 }
      );
    }
    const unlockedBytes = await unlockPdf(bytes, parsed.data.password);
    // Confirm the result is really unencrypted before saving it.
    if (await isEncryptedPdf(unlockedBytes)) {
      return NextResponse.json(
        { error: "Could not unlock this PDF." },
        { status: 500 }
      );
    }
    const version = await saveNewVersion(document, user.id, unlockedBytes);
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
    console.error("[pdf unlock]", error);
    return NextResponse.json(
      { error: "Could not unlock this PDF." },
      { status: 500 }
    );
  }
}
