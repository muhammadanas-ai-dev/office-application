// Batch PDF export (F28).
//
// POST /api/batch/pdf-export
// Body: { "documentIds": ["<uuid>", ...],  (1–10)
//         "format": "txt" | "xlsx" | "pptx" }
//
// Converts every selected PDF with the text-based
// exporters and returns ONE ZIP. A document that cannot
// be exported is listed in batch-errors.txt inside the
// ZIP instead of failing the batch; only a batch where
// every document fails returns an error.
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  PdfEditError,
  pdfEditRateLimiter,
} from "@/lib/pdf-edit.server";
import {
  getToolsClient,
  getToolsUser,
} from "@/lib/pdf-tools.server";
import { PdfToolsError } from "@/lib/pdf-ops";
import { buildContentDisposition } from "@/lib/export";
import { buildBatchExport } from "@/lib/pdf-batch.server";
import {
  MAX_BATCH_DOCUMENTS,
  getBatchZipName,
} from "@/lib/pdf-batch";
import { logError } from "@/lib/log";

const BatchBody = z.object({
  documentIds: z
    .array(z.string().uuid("Choose documents from your library."))
    .min(1, "Choose at least one PDF.")
    .max(
      MAX_BATCH_DOCUMENTS,
      `Export at most ${MAX_BATCH_DOCUMENTS} PDFs at once.`
    ),
  format: z.enum(["txt", "xlsx", "pptx"]),
});

export async function POST(request: Request) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }
  const parsed = BatchBody.safeParse(body);
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
    const result = await buildBatchExport(
      userClient,
      [...new Set(parsed.data.documentIds)],
      parsed.data.format
    );
    return new Response(result.zipBytes.buffer as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": buildContentDisposition(getBatchZipName()),
        "Content-Length": String(result.zipBytes.length),
        "Cache-Control": "no-store",
        "X-Forma-Batch-Succeeded": String(result.succeeded),
        "X-Forma-Batch-Failures": String(result.failures.length),
      },
    });
  } catch (error) {
    if (error instanceof PdfToolsError || error instanceof PdfEditError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    logError("batch pdf export", error);
    return NextResponse.json(
      { error: "Could not export these PDFs." },
      { status: 500 }
    );
  }
}
