// PDF form-fill UI (Phase B, feature 4) — client component.
//
// The PDF renders in the browser with PDF.js, and a side panel
// lists every form field with the right input for its type: a
// text box (or textarea for multi-line fields), a checkbox, a
// radio group, or a dropdown/list. Saving fills the fields and
// creates a new version — the original file is never overwritten.
// Errors come from the route's JSON error message, so the user
// always sees a real reason, never a generic failure.
//
// A PDF with no form fields shows an honest empty state in the
// panel instead of a fake form.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import Link from "next/link";
import type { PdfFormField, PdfFormValue } from "@/lib/pdf-form";

// PDF.js is imported dynamically inside the load effect, not at
// the top of this file: pdfjs-dist references browser-only globals
// (DOMMatrix) at import time, which breaks server-side rendering.
// A static import would make this page render nothing on the
// server. The worker is served from public/ (copied from
// pdfjs-dist at install time).

interface PdfFormClientProps {
  document: { id: string; title: string; version: number };
  pageCount: number | null;
  initialFields: PdfFormField[];
  fieldsError: string | null;
}

const sectionClass = "rounded-xl border border-[#dce3ec] bg-white p-4";
const inputClass =
  "h-9 w-full rounded-lg border border-[#dce3ec] bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3159c9]";
const buttonClass =
  "inline-flex h-9 items-center rounded-lg bg-[#3159c9] px-3 text-sm font-medium text-white hover:bg-[#2a4cab] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3159c9] disabled:opacity-60";
const labelClass = "mb-1 block text-xs font-medium text-[#202b3c]";

interface PageView {
  pageNumber: number;
  width: number;
  height: number;
}

const SCALE = 1.5;

/** The value a field's input holds (mirrors PdfFormValue). */
type FieldInput = string | boolean | string[];

function initialValue(field: PdfFormField): FieldInput {
  if (field.type === "checkbox") return field.value === true;
  if (field.type === "radio")
    return typeof field.value === "string" ? field.value : "";
  if (field.type === "dropdown" || field.type === "optionList")
    return Array.isArray(field.value) ? field.value : [];
  if (field.type === "text")
    return typeof field.value === "string" ? field.value : "";
  return "";
}

export function PdfFormClient({
  document,
  pageCount,
  initialFields,
  fieldsError,
}: PdfFormClientProps) {
  const router = useRouter();
  const [fields, setFields] = useState<PdfFormField[]>(initialFields);
  const [values, setValues] = useState<Record<string, FieldInput>>(() =>
    Object.fromEntries(initialFields.map((f) => [f.name, initialValue(f)]))
  );
  const [changed, setChanged] = useState<Set<string>>(new Set());
  const [pages, setPages] = useState<PageView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canvasRefs = useRef(new Map<number, HTMLCanvasElement | null>());
  const pdfRef = useRef<PDFDocumentProxy | null>(null);

  // Load the PDF (bytes) for the viewer. The view is reset in
  // reload(), not here, so this effect never sets state
  // synchronously (no cascading renders).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/documents/${document.id}/download`);
        if (!response.ok) throw new Error("Could not download this PDF.");
        const bytes = new Uint8Array(await response.arrayBuffer());
        // Dynamic import: pdfjs-dist is browser-only (DOMMatrix).
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
        if (cancelled) return;
        pdfRef.current = pdf;
        const views: PageView[] = [];
        for (let n = 1; n <= pdf.numPages; n += 1) {
          const page = await pdf.getPage(n);
          const viewport = page.getViewport({ scale: SCALE });
          views.push({
            pageNumber: n,
            width: viewport.width,
            height: viewport.height,
          });
        }
        if (cancelled) return;
        setPages(views);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setLoadError(
          err instanceof Error ? err.message : "Could not open this PDF."
        );
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      pdfRef.current?.destroy().catch(() => undefined);
      pdfRef.current = null;
    };
  }, [document.id, reloadKey]);

  // Render each page's canvas once its view is known.
  useEffect(() => {
    if (pages.length === 0 || !pdfRef.current) return;
    let cancelled = false;
    (async () => {
      for (const view of pages) {
        if (cancelled) return;
        const canvas = canvasRefs.current.get(view.pageNumber);
        if (!canvas) continue;
        const pdf = pdfRef.current;
        if (!pdf) continue;
        const page: PDFPageProxy = await pdf.getPage(view.pageNumber);
        const viewport = page.getViewport({ scale: SCALE });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        await page.render({ canvas, viewport }).promise;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pages]);

  const reload = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    setPages([]);
    setReloadKey((k) => k + 1);
    router.refresh();
  }, [router]);

  function setFieldValue(name: string, value: FieldInput) {
    setValues((prev) => ({ ...prev, [name]: value }));
    setChanged((prev) => new Set(prev).add(name));
    setMessage(null);
    setError(null);
  }

  async function refreshFields() {
    const response = await fetch(
      `/api/documents/${document.id}/pdf/form-fields`
    );
    const data = (await response.json().catch(() => ({}))) as {
      fields?: PdfFormField[];
      error?: string;
    };
    if (!response.ok || !Array.isArray(data.fields)) {
      throw new Error(
        typeof data.error === "string" && data.error
          ? data.error
          : "Could not reload the form fields."
      );
    }
    setFields(data.fields);
    setValues(
      Object.fromEntries(data.fields.map((f) => [f.name, initialValue(f)]))
    );
    setChanged(new Set());
  }

  async function submitFill() {
    if (changed.size === 0) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      // Only the fields the user changed are sent. A radio or
      // dropdown the user never touched keeps its current value
      // (sending "no selection" would clear it).
      const toSend: Record<string, PdfFormValue> = {};
      for (const name of changed) {
        const field = fields.find((f) => f.name === name);
        if (!field) continue;
        const value = values[name];
        if (field.type === "radio" && value === "") continue;
        if (
          (field.type === "dropdown" || field.type === "optionList") &&
          Array.isArray(value) &&
          value.length === 0
        ) {
          continue;
        }
        toSend[name] = value as PdfFormValue;
      }
      if (Object.keys(toSend).length === 0) {
        setBusy(false);
        return;
      }
      const response = await fetch(
        `/api/documents/${document.id}/pdf/fill-form`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ values: toSend }),
        }
      );
      const data = (await response.json().catch(() => ({}))) as {
        error?: unknown;
        version?: unknown;
      };
      if (!response.ok) {
        throw new Error(
          typeof data.error === "string" && data.error
            ? data.error
            : "Could not fill this form."
        );
      }
      if (typeof data.version !== "number")
        throw new Error("The server did not return a version.");
      setMessage(
        `Saved as version ${data.version} — the original file is untouched.`
      );
      await refreshFields();
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not fill this form.");
    } finally {
      setBusy(false);
    }
  }

  const fillable = fields.filter(
    (f) => f.type !== "button" && f.type !== "signature"
  );
  const unsupported = fields.filter(
    (f) => f.type === "button" || f.type === "signature"
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-[#202b3c]">
            Fill form — {document.title}
          </h1>
          <p className="mt-1 text-sm text-[#5a6b7f]">
            Version {document.version}
            {pageCount ? ` · ${pageCount} page${pageCount === 1 ? "" : "s"}` : ""}
            {fields.length > 0
              ? ` · ${fields.length} field${fields.length === 1 ? "" : "s"}`
              : ""}
          </p>
        </div>
        <Link
          href="/files"
          className="inline-flex h-9 items-center rounded-lg border border-[#dce3ec] bg-white px-3 text-sm font-medium text-[#202b3c] hover:bg-[#f4f7fa]"
        >
          Back to files
        </Link>
      </div>

      {message && (
        <p className="rounded-lg border border-[#bfe3c6] bg-[#eefaf0] px-3 py-2 text-sm text-[#1e6b34]">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-lg border border-[#f3c2c2] bg-[#fdf0f0] px-3 py-2 text-sm text-[#8f1d1d]">
          {error}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        {/* The PDF, rendered page by page. */}
        <div className="space-y-4">
          {loading && (
            <p className="text-sm text-[#5a6b7f]">Opening the PDF…</p>
          )}
          {loadError && (
            <p className="rounded-lg border border-[#f3c2c2] bg-[#fdf0f0] px-3 py-2 text-sm text-[#8f1d1d]">
              {loadError}
            </p>
          )}
          {pages.map((view) => (
            <div
              key={view.pageNumber}
              className="overflow-x-auto rounded-xl border border-[#dce3ec] bg-white p-2"
            >
              <p className="px-2 pb-2 text-xs font-medium text-[#5a6b7f]">
                Page {view.pageNumber}
              </p>
              <canvas
                ref={(el) => {
                  canvasRefs.current.set(view.pageNumber, el);
                }}
                style={{ width: view.width, height: view.height }}
                className="max-w-full"
              />
            </div>
          ))}
        </div>

        {/* The form fields. */}
        <div className={sectionClass}>
          <h2 className="text-sm font-semibold text-[#202b3c]">Form fields</h2>
          {fieldsError && (
            <p className="mt-3 rounded-lg border border-[#f3c2c2] bg-[#fdf0f0] px-3 py-2 text-sm text-[#8f1d1d]">
              {fieldsError}
            </p>
          )}
          {!fieldsError && fields.length === 0 && (
            <p className="mt-3 text-sm text-[#5a6b7f]">
              This PDF has no form fields to fill. It is a plain
              document, not a form.
            </p>
          )}
          {fillable.length > 0 && (
            <div className="mt-3 space-y-4">
              {fillable.map((field) => (
                <div key={field.name}>
                  <label className={labelClass} htmlFor={`field-${field.name}`}>
                    {field.name}
                    {field.required ? " (required)" : ""}
                    {field.page ? ` — page ${field.page}` : ""}
                  </label>
                  {field.type === "text" && field.multiline ? (
                    <textarea
                      id={`field-${field.name}`}
                      className={`${inputClass} h-auto min-h-20 py-2`}
                      value={(values[field.name] as string) ?? ""}
                      maxLength={field.maxLength ?? undefined}
                      disabled={field.readOnly || busy}
                      onChange={(e) =>
                        setFieldValue(field.name, e.target.value)
                      }
                    />
                  ) : field.type === "text" ? (
                    <input
                      id={`field-${field.name}`}
                      type="text"
                      className={inputClass}
                      value={(values[field.name] as string) ?? ""}
                      maxLength={field.maxLength ?? undefined}
                      disabled={field.readOnly || busy}
                      onChange={(e) =>
                        setFieldValue(field.name, e.target.value)
                      }
                    />
                  ) : field.type === "checkbox" ? (
                    <label className="flex items-center gap-2 text-sm text-[#202b3c]">
                      <input
                        type="checkbox"
                        checked={(values[field.name] as boolean) ?? false}
                        disabled={field.readOnly || busy}
                        onChange={(e) =>
                          setFieldValue(field.name, e.target.checked)
                        }
                      />
                      {field.required ? "Required" : "Tick to check"}
                    </label>
                  ) : field.type === "radio" ? (
                    <div className="space-y-1">
                      {(field.options ?? []).map((option) => (
                        <label
                          key={option}
                          className="flex items-center gap-2 text-sm text-[#202b3c]"
                        >
                          <input
                            type="radio"
                            name={`field-${field.name}`}
                            value={option}
                            checked={
                              (values[field.name] as string) === option
                            }
                            disabled={field.readOnly || busy}
                            onChange={() =>
                              setFieldValue(field.name, option)
                            }
                          />
                          {option}
                        </label>
                      ))}
                    </div>
                  ) : field.type === "dropdown" || field.type === "optionList" ? (
                    <select
                      id={`field-${field.name}`}
                      className={inputClass}
                      multiple={field.multiselect}
                      value={
                        field.multiselect
                          ? ((values[field.name] as string[]) ?? [])
                          : ((values[field.name] as string[]) ?? [])[0] ?? ""
                      }
                      disabled={field.readOnly || busy}
                      onChange={(e) => {
                        if (field.multiselect) {
                          setFieldValue(
                            field.name,
                            Array.from(e.target.selectedOptions).map(
                              (o) => o.value
                            )
                          );
                        } else {
                          setFieldValue(
                            field.name,
                            e.target.value ? [e.target.value] : []
                          );
                        }
                      }}
                    >
                      {!field.multiselect && <option value="">— Choose —</option>}
                      {(field.options ?? []).map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  {field.readOnly && (
                    <p className="mt-1 text-xs text-[#5a6b7f]">
                      This field is read-only.
                    </p>
                  )}
                  {field.type === "text" && field.maxLength && (
                    <p className="mt-1 text-xs text-[#5a6b7f]">
                      At most {field.maxLength} characters.
                    </p>
                  )}
                </div>
              ))}
              <button
                type="button"
                className={buttonClass}
                disabled={busy || changed.size === 0}
                onClick={submitFill}
              >
                {busy ? "Saving…" : "Save filled form"}
              </button>
              <p className="text-xs text-[#5a6b7f]">
                Saving creates a new version of this document. The
                original file is never overwritten.
              </p>
            </div>
          )}
          {unsupported.length > 0 && (
            <div className="mt-4 border-t border-[#dce3ec] pt-3">
              <p className="text-xs font-medium text-[#5a6b7f]">
                Not fillable in Forma:
              </p>
              <ul className="mt-1 list-disc pl-5 text-xs text-[#5a6b7f]">
                {unsupported.map((field) => (
                  <li key={field.name}>
                    {field.name} —{" "}
                    {field.type === "signature"
                      ? "a digital signature field (signing is not supported yet)"
                      : "a button, not a value field"}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
