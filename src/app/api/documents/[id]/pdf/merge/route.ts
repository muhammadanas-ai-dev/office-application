// Merge PDFs (Phase B, feature 2).
//
// POST /api/documents/[id]/pdf/merge
// Body: { "documentIds": ["<uuid>", "<uuid>", ...] }
//
// Merges the listed PDFs into one, in order. The URL id must be
// the first document in the list. Every document is fetched through
// the signed-in user's client (RLS), so a user can only merge PDFs
// in workspaces they belong to. The result is a download only —
// the source files are never modified.
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  PdfToolsError,
  fetchDocumentPdf,
  getToolsClient,
  getToolsUser,
  mergePdfs,
  pdfDownloadResponse,
  pdfToolsRateLimiter,
} from "@/lib/pdf-tools.server";
import { MAX_MERGE_DOCUMENTS } from "@/lib/pdf-tools";
import { getMergedFileName } from "@/lib/pdf-tools";

const MergeBody = z.object({
  documentIds: z
    .array(z.string().uuid())
    .min(2, "Select at least 2 PDFs to merge.")
    .max(
      MAX_MERGE_DOCUMENTS,
      `Merge at most ${MAX_MERGE_DOCUMENTS} PDFs at a time.`
    ),
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
  const parsed = MergeBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }
  const { documentIds } = parsed.data;
  if (new Set(documentIds).size !== documentIds.length) {
    return NextResponse.json(
      { error: "Select each PDF only once." },
      { status: 400 }
    );
  }
  if (documentIds[0] !== id) {
    return NextResponse.json(
      {
        error: "The first PDF to merge must be the one you opened tools from.",
      },
      { status: 400 }
    );
  }

  try {
    const user = await getToolsUser();
    const limit = pdfToolsRateLimiter.check(user.id);
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
    const inputs: Uint8Array[] = [];
    let firstTitle = "document";
    for (let i = 0; i < documentIds.length; i++) {
      const { document, bytes } = await fetchDocumentPdf(
        userClient,
        documentIds[i]
      );
      if (i === 0) firstTitle = document.title;
      inputs.push(bytes);
    }
    const merged = await mergePdfs(inputs);
    return pdfDownloadResponse(merged, getMergedFileName(firstTitle));
  } catch (error) {
    if (error instanceof PdfToolsError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("[pdf merge]", error);
    return NextResponse.json(
      { error: "Could not merge these PDFs." },
      { status: 500 }
    );
  }
}
