// OCR worker (Phase C) — the process that does the actual OCR.
//
// Run from the project root:
//
//   node ocr/worker.ts
//
// It polls the ocr_jobs table for pending jobs, claims one, downloads
// the file from private Storage, renders its pages and runs the
// project's own Tesseract binary per page (src/lib/ocr.ts), stores
// the text in document_ocr_results, and marks the job done/failed.
//
// It uses the Supabase service role key, which bypasses RLS — the
// route enforces access when the job is enqueued, and the worker
// only ever processes jobs that exist. It runs until stopped
// (Ctrl-C) and does not survive a VM reset — restart it next to
// the app. It needs Node 22.6+ (it runs TypeScript directly).
//
// The OCR engine is imported by a relative path on purpose: the
// worker is not part of the Next.js app, so the `@/` alias does
// not exist here.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/types/database.types.ts";
import { OcrError, ocrDocument, type OcrLanguage } from "../src/lib/ocr.ts";

const POLL_INTERVAL_MS = 5_000;
/** A job left "processing" longer than this is assumed orphaned
 *  (its worker died) and is re-queued on worker start. */
const STALE_PROCESSING_MS = 10 * 60 * 1000;
const DOCUMENTS_BUCKET = "documents";

/** Read .env.local (KEY=value lines) — the worker is not a Next.js
 *  process, so Next does not load env for it. Only the names are
 *  ever logged, never the values. */
async function loadEnvLocal(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  let text = "";
  try {
    text = await readFile(join(process.cwd(), ".env.local"), "utf8");
  } catch {
    return out;
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

interface WorkerConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
}

function getConfig(): WorkerConfig {
  const env = { ...process.env };
  return {
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL ?? "",
    serviceRoleKey:
      env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  };
}

const sleep = (ms: number) =>
  new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

let stopping = false;
process.on("SIGINT", () => {
  stopping = true;
  console.log("[ocr worker] stopping after the current job…");
});
process.on("SIGTERM", () => {
  stopping = true;
  console.log("[ocr worker] stopping after the current job…");
});

async function main(): Promise<void> {
  const fileEnv = await loadEnvLocal();
  for (const [key, value] of Object.entries(fileEnv)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
  const config = getConfig();
  if (!config.supabaseUrl || !config.serviceRoleKey) {
    console.error(
      "[ocr worker] missing Supabase URL or service role key — set them in .env.local."
    );
    process.exit(1);
  }
  const admin = createClient<Database>(
    config.supabaseUrl,
    config.serviceRoleKey,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );

  // Re-queue jobs orphaned by a worker that died mid-job.
  const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS).toISOString();
  const { data: stale, error: staleError } = await admin
    .from("ocr_jobs")
    .update({
      status: "pending",
      started_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("status", "processing")
    .lt("updated_at", staleBefore)
    .select("id");
  if (staleError) {
    console.error(
      "[ocr worker] could not re-queue stale jobs:",
      staleError.message
    );
  } else if (stale && stale.length > 0) {
    console.log(`[ocr worker] re-queued ${stale.length} stale job(s).`);
  }

  console.log("[ocr worker] started — polling for OCR jobs.");
  while (!stopping) {
    try {
      const claimed = await claimNextJob(admin);
      if (!claimed) {
        await sleep(POLL_INTERVAL_MS);
        continue;
      }
      await processJob(admin, claimed);
    } catch (error) {
      console.error("[ocr worker] poll error:", (error as Error).message);
      await sleep(POLL_INTERVAL_MS);
    }
  }
  console.log("[ocr worker] stopped.");
}

interface ClaimedJob {
  id: string;
  document_id: string;
  language: OcrLanguage;
}

/** Claim the oldest pending job. The status guard (only claim a
 *  job that is still pending) keeps two workers from taking the
 *  same job. Returns null when there is nothing to do. */
async function claimNextJob(
  admin: SupabaseClient<Database>
): Promise<ClaimedJob | null> {
  const { data: pending, error } = await admin
    .from("ocr_jobs")
    .select("id, document_id, language")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw new Error(`could not list pending jobs: ${error.message}`);
  if (!pending || pending.length === 0) return null;
  const job = pending[0] as ClaimedJob;
  const { data: claimed, error: claimError } = await admin
    .from("ocr_jobs")
    .update({
      status: "processing",
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id)
    .eq("status", "pending")
    .select("id, document_id, language")
    .maybeSingle();
  if (claimError)
    throw new Error(`could not claim job ${job.id}: ${claimError.message}`);
  if (!claimed) return null;
  return claimed as ClaimedJob;
}

/** Process one claimed job: download the file, OCR it, store the
 *  results, and mark the job done. Any failure marks the job failed
 *  with a clear error — a job never stays stuck in "processing". */
async function processJob(
  admin: SupabaseClient<Database>,
  job: ClaimedJob
): Promise<void> {
  const startedAt = Date.now();
  console.log(
    `[ocr worker] job ${job.id} — document ${job.document_id} (${job.language})`
  );
  try {
    const { data: document, error: docError } = await admin
      .from("documents")
      .select("id, file_path, mime_type, workspace_id")
      .eq("id", job.document_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (docError)
      throw new Error(`could not load the document: ${docError.message}`);
    if (!document || !document.file_path) {
      throw new OcrError(400, "This document has no file yet.");
    }
    if (!document.mime_type) {
      throw new OcrError(400, "This document has no file type.");
    }
    const { data: blob, error: downloadError } = await admin.storage
      .from(DOCUMENTS_BUCKET)
      .download(document.file_path);
    if (downloadError || !blob) {
      throw new Error("Could not download the document file.");
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const result = await ocrDocument(bytes, document.mime_type, job.language);
    const { error: insertError } = await admin
      .from("document_ocr_results")
      .insert(
        result.pages.map((page) => ({
          document_id: job.document_id,
          workspace_id: document.workspace_id,
          job_id: job.id,
          page_number: page.page,
          text: page.text,
          mean_confidence: page.meanConfidence,
          language: job.language,
          // The word boxes (image pixels at the render DPI) —
          // "Make searchable" places the invisible text over
          // them. Stored as JSON so no extra table is needed.
          words: page.words,
        }))
      );
    if (insertError) {
      throw new Error(
        `could not store the OCR results: ${insertError.message}`
      );
    }
    const { error: doneError } = await admin
      .from("ocr_jobs")
      .update({
        status: "done",
        page_count: result.pages.length,
        processed_pages: result.pages.length,
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    if (doneError)
      throw new Error(`could not mark the job done: ${doneError.message}`);
    console.log(
      `[ocr worker] job ${job.id} done — ${result.pages.length} page(s) in ${((Date.now() - startedAt) / 1000).toFixed(1)}s.`
    );
  } catch (error) {
    const message =
      error instanceof OcrError
        ? error.message
        : "OCR failed — the file may be damaged or too complex.";
    console.error(`[ocr worker] job ${job.id} failed: ${message}`);
    await admin
      .from("ocr_jobs")
      .update({
        status: "failed",
        error: message,
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
  }
}

main().catch((error: Error) => {
  console.error("[ocr worker] fatal:", error.message);
  process.exit(1);
});
