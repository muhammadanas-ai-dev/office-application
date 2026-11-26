// Batch page operations (F36).
//
// POST /api/batch/pdf-pages
// Body: { "documentIds": ["<uuid>", ...],  (1–10)
//         "operation": { "kind": "rotate", "degrees": 90 }
//                    | { "kind": "compress", "level": "ebook" } }
//
// Applies the operation to every selected PDF and saves a
// new version of each. Per-document results come back in
// the response; one failure never fails the batch. Only a
// batch where every document fails returns an error.
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
import { runBatchPageOperation } from "@/lib/pdf-batch-pages.server";
import { MAX_BATCH_DOCUMENTS } from "@/lib/pdf-batch";
import { logError } from "@/lib/log";

const BatchPagesBody = z.object({
  documentIds: z
    .array(z.string().uuid("Choose documents from your library."))
    .min(1, "Choose at least one PDF.")
    .max(
      MAX_BATCH_DOCUMENTS,
      `Work on at most ${MAX_BATCH_DOCUMENTS} PDFs at once.`
    ),
  operation: z.union([
    z.object({
      kind: z.literal("rotate"),
      degrees: z.union([z.literal(90), z.literal(180), z.literal(270)]),
    }),
    z.object({
      kind: z.literal("compress"),
      level: z.enum(["screen", "ebook", "printer"]),
    }),
  ]),
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
  const parsed = BatchPagesBody.safeParse(body);
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
    const results = await runBatchPageOperation(
      userClient,
      user.id,
      [...new Set(parsed.data.documentIds)],
      parsed.data.operation
    );
    const succeeded = results.filter((r) => r.ok).length;
    if (succeeded === 0) {
      return NextResponse.json(
        {
          error: `The operation failed for every selected PDF. First problem: ${results[0]?.error ?? "unknown"}`,
          results,
        },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    if (error instanceof PdfToolsError || error instanceof PdfEditError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    logError("batch pdf pages", error);
    return NextResponse.json(
      { error: "Could not run the batch operation." },
      { status: 500 }
    );
  }
}
