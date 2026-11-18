// OCR UI (Phase C) — client component.
//
// Start an OCR run (English, Urdu or Arabic), watch its progress,
// and read the extracted text per page with its confidence score.
// The status is polled from GET /api/documents/[id]/ocr while a
// job is pending or processing; the worker does the actual OCR.
// Errors come from the route's JSON error message, so the user
// always sees a real reason, never a generic failure.
//
// A document that has never been OCR'd shows the start form, not
// a fake result. A failed job shows its error honestly.
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface OcrClientProps {
  document: { id: string; title: string; version: number; mimeType: string };
  /** The user's OCR default language (from their preferences). */
  defaultLanguage: string;
}

type OcrStatus = "pending" | "processing" | "done" | "failed";

interface OcrJobState {
  id: string;
  status: OcrStatus;
  language: string;
  page_count: number | null;
  processed_pages: number;
  error: string | null;
}

interface OcrPageState {
  page: number;
  text: string;
  confidence: number | null;
}

const sectionClass = "rounded-xl border border-[#dce3ec] bg-white p-4";
const buttonClass =
  "inline-flex h-9 items-center rounded-lg bg-[#3159c9] px-3 text-sm font-medium text-white hover:bg-[#2a4cab] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3159c9] disabled:opacity-60";
const inputClass =
  "h-9 w-full rounded-lg border border-[#dce3ec] bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3159c9]";

const LANGUAGES = [
  { value: "eng", label: "English" },
  { value: "urd", label: "Urdu" },
  { value: "ara", label: "Arabic" },
] as const;

function statusLabel(job: OcrJobState): string {
  if (job.status === "pending") return "Queued — waiting for the OCR worker.";
  if (job.status === "processing") {
    if (job.page_count) {
      return `Reading page ${Math.min(job.processed_pages + 1, job.page_count)} of ${job.page_count}…`;
    }
    return "Reading the document…";
  }
  if (job.status === "done") return "Done.";
  return "Failed.";
}

export function OcrClient({ document, defaultLanguage }: OcrClientProps) {
  const [language, setLanguage] = useState<string>(defaultLanguage);
  const [job, setJob] = useState<OcrJobState | null>(null);
  const [results, setResults] = useState<OcrPageState[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [searchableBusy, setSearchableBusy] = useState(false);
  const [searchableMessage, setSearchableMessage] = useState<string | null>(
    null
  );
  const [searchableError, setSearchableError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    const response = await fetch(`/api/documents/${document.id}/ocr`);
    const data = (await response.json()) as {
      job?: OcrJobState | null;
      results?: OcrPageState[];
      error?: string;
    };
    if (!response.ok)
      throw new Error(data.error ?? "Could not load the OCR status.");
    return data;
  }, [document.id]);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchStatus();
      setJob(data.job ?? null);
      setResults(data.results ?? []);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load the OCR status."
      );
    } finally {
      setLoading(false);
    }
  }, [fetchStatus]);

  // Load the status on mount, and keep polling while a job is
  // active. The poll stops once the job is done or failed. The
  // initial load is an async continuation (not a synchronous
  // setState in the effect), matching the pdf-form client's
  // loading pattern.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchStatus();
        if (cancelled) return;
        setJob(data.job ?? null);
        setResults(data.results ?? []);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Could not load the OCR status."
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    const timer = setInterval(() => {
      if (!cancelled) refresh();
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [fetchStatus, refresh]);

  const jobActive =
    job !== null && (job.status === "pending" || job.status === "processing");

  async function startOcr() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/documents/${document.id}/ocr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language }),
      });
      const data = (await response.json()) as {
        job?: OcrJobState;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "Could not start OCR.");
      setJob(data.job ?? null);
      setResults([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start OCR.");
    } finally {
      setBusy(false);
    }
  }

  async function makeSearchable() {
    setSearchableBusy(true);
    setSearchableError(null);
    setSearchableMessage(null);
    try {
      const response = await fetch(
        `/api/documents/${document.id}/pdf/make-searchable`,
        { method: "POST" }
      );
      const data = (await response.json().catch(() => ({}))) as {
        error?: unknown;
        version?: unknown;
      };
      if (!response.ok) {
        throw new Error(
          typeof data.error === "string" && data.error
            ? data.error
            : "Could not make this PDF searchable."
        );
      }
      setSearchableMessage(
        `Searchable copy saved as version ${data.version}. The original scan is untouched.`
      );
    } catch (err) {
      setSearchableError(
        err instanceof Error
          ? err.message
          : "Could not make this PDF searchable."
      );
    } finally {
      setSearchableBusy(false);
    }
  }

  async function copyAll() {
    const all = results.map((r) => r.text).join("\n\n");
    try {
      await navigator.clipboard.writeText(all);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(
        "Could not copy the text — your browser blocked clipboard access."
      );
    }
  }

  const fullText = results.map((r) => r.text).join("\n\n");

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#202b3c]">
            OCR — {document.title}
          </h1>
          <p className="text-sm text-[#5b6b7f]">
            Version {document.version} · {document.mimeType} · the original file
            is never changed.
          </p>
        </div>
        <Link
          href="/files"
          className="inline-flex h-9 items-center rounded-lg border border-[#dce3ec] bg-white px-3 text-sm font-medium text-[#202b3c] hover:bg-[#f2f5f8]"
        >
          Back to files
        </Link>
      </div>

      {loading ? (
        <div className={sectionClass}>
          <p className="text-sm text-[#5b6b7f]">Loading the OCR status…</p>
        </div>
      ) : (
        <>
          <div className={sectionClass}>
            <h2 className="mb-3 text-sm font-semibold text-[#202b3c]">
              Read this document&apos;s text
            </h2>
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-48">
                <label
                  htmlFor="ocr-language"
                  className="mb-1 block text-xs font-medium text-[#202b3c]"
                >
                  Language
                </label>
                <select
                  id="ocr-language"
                  className={inputClass}
                  value={language}
                  disabled={busy || jobActive}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className={buttonClass}
                disabled={busy || jobActive}
                onClick={startOcr}
              >
                {busy
                  ? "Starting…"
                  : jobActive
                    ? "OCR is running…"
                    : "Start OCR"}
              </button>
            </div>
            <p className="mt-3 text-xs text-[#5b6b7f]">
              The text is read by the project&apos;s own Tesseract engine, on
              this server — the file is not sent anywhere. A run handles at most
              20 pages.
            </p>
          </div>

          {error && (
            <div className="rounded-xl border border-[#f0c4c4] bg-[#fdf2f2] p-4">
              <p className="text-sm text-[#8c2f2f]">{error}</p>
            </div>
          )}

          {job && (
            <div className={sectionClass}>
              <h2 className="text-sm font-semibold text-[#202b3c]">Status</h2>
              <p className="mt-1 text-sm text-[#5b6b7f]">{statusLabel(job)}</p>
              {job.status === "failed" && job.error && (
                <p className="mt-2 text-sm text-[#8c2f2f]">{job.error}</p>
              )}
              {job.status === "done" && job.page_count !== null && (
                <p className="mt-1 text-sm text-[#5b6b7f]">
                  {job.page_count} page{job.page_count === 1 ? "" : "s"} read.
                </p>
              )}
            </div>
          )}

          {job?.status === "done" && results.length > 0 && (
            <div className={sectionClass}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-[#202b3c]">
                  Extracted text
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  {document.mimeType === "application/pdf" && (
                    <button
                      type="button"
                      disabled={searchableBusy}
                      className="inline-flex h-9 items-center rounded-lg bg-[#3159c9] px-3 text-sm font-medium text-white hover:bg-[#2a4cab] disabled:opacity-60"
                      onClick={makeSearchable}
                    >
                      Make searchable
                    </button>
                  )}
                  <button
                    type="button"
                    className="inline-flex h-9 items-center rounded-lg border border-[#dce3ec] bg-white px-3 text-sm font-medium text-[#202b3c] hover:bg-[#f2f5f8]"
                    onClick={copyAll}
                  >
                    {copied ? "Copied" : "Copy all"}
                  </button>
                </div>
              </div>
              {searchableMessage ? (
                <p className="mb-3 text-sm text-[#1a7f37]">
                  {searchableMessage}
                </p>
              ) : null}
              {searchableError ? (
                <p role="alert" className="mb-3 text-sm text-[#b3261e]">
                  {searchableError}
                </p>
              ) : null}
              <p className="mb-3 text-sm text-[#5b6b7f]">
                Make searchable embeds this text as an invisible layer in the
                PDF, so the scan becomes searchable — it saves a new version and
                the original is untouched.
              </p>
              <div className="space-y-4">
                {results.map((r) => (
                  <div key={r.page}>
                    <div className="mb-1 flex items-baseline justify-between gap-3">
                      <span className="text-xs font-medium text-[#202b3c]">
                        Page {r.page}
                      </span>
                      <span className="text-xs text-[#5b6b7f]">
                        Confidence{" "}
                        {r.confidence === null
                          ? "—"
                          : `${r.confidence.toFixed(0)}%`}
                      </span>
                    </div>
                    <pre className="whitespace-pre-wrap break-words rounded-lg bg-[#f2f5f8] p-3 font-sans text-sm text-[#202b3c]">
                      {r.text || "(no text found on this page)"}
                    </pre>
                  </div>
                ))}
              </div>
              {fullText.trim() === "" && (
                <p className="mt-3 text-sm text-[#5b6b7f]">
                  No text was found in this file — it may be blank, or the scan
                  may be too faint for the engine to read.
                </p>
              )}
            </div>
          )}

          {job === null && (
            <div className={sectionClass}>
              <p className="text-sm text-[#5b6b7f]">
                This document has not been OCR&apos;d yet. Pick a language and
                start OCR to read its text.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
