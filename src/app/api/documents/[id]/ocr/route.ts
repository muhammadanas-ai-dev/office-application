// OCR a document (Phase C).
//
// POST /api/documents/[id]/ocr
// Body: { "language": "eng" | "urd" | "ara" } (default "eng").
// Enqueues an OCR job and returns it immediately — the worker
// (ocr/worker.ts) does the actual OCR, because it takes seconds
// per page and does not belong inside a web request. Returns
// { ok, job, documentId, title }. Refuses when a job is already
// in progress for the document (409), and when the file is not a
// PDF, PNG or JPEG (400).
//
// GET /api/documents/[id]/ocr
// Returns the latest job and its stored results:
// { ok, job: {...} | null, results: [{ page, text, confidence }] }.
// A document that has never been OCR'd returns job: null.
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  OcrError,
  enqueueOcrJob,
  fetchOcrDocument,
  getLatestOcrJobAndResults,
  getToolsClient,
  getToolsUser,
  isOcrLanguage,
  ocrRateLimiter,
} from "@/lib/ocr.server";
import { logError } from "@/lib/log";

const OcrBody = z.object({
  language: z
    .string()
    .optional()
    .refine((v) => v === undefined || isOcrLanguage(v), {
      message: "Language must be eng, urd or ara.",
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
  const parsed = OcrBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }
  const language = parsed.data.language ?? "eng";

  try {
    const user = await getToolsUser();
    const limit = ocrRateLimiter.check(user.id);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many OCR requests — try again in a moment." },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)),
          },
        }
      );
    }
    const userClient = await getToolsClient();
    const document = await fetchOcrDocument(userClient, id);
    const job = await enqueueOcrJob(userClient, document, user.id, language);
    return NextResponse.json(
      {
        ok: true,
        job,
        documentId: document.id,
        title: document.title,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof OcrError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    logError("ocr", error);
    return NextResponse.json(
      { error: "Could not start OCR for this document." },
      { status: 500 }
    );
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    await getToolsUser();
    const userClient = await getToolsClient();
    const document = await fetchOcrDocument(userClient, id);
    const { job, results } = await getLatestOcrJobAndResults(
      userClient,
      document.id
    );
    return NextResponse.json(
      {
        ok: true,
        job,
        results: results.map((r) => ({
          page: r.page_number,
          text: r.text,
          confidence: r.mean_confidence,
        })),
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof OcrError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    logError("ocr", error);
    return NextResponse.json(
      { error: "Could not load this document's OCR status." },
      { status: 500 }
    );
  }
}
