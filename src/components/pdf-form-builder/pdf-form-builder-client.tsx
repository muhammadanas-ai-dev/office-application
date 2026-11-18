// PDF form-builder UI (Phase B, feature 5) — client component.
//
// The PDF renders in the browser with PDF.js. A toolbar picks a
// field type (text, checkbox, radio group, dropdown, option
// list); clicking on a page places the field there (a dashed
// outline shows where it will go), and a side panel sets its
// name, options and properties. Adding a field creates a new
// version — the original file is never overwritten. A field list
// shows every field already on the PDF, with a remove button.
// Errors come from the route's JSON error message, so the user
// always sees a real reason, never a generic failure.
//
// A PDF with no form fields yet is a blank canvas, not an error:
// the first field added creates the form.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import Link from "next/link";
import type { PdfFormField } from "@/lib/pdf-form";
import type { PdfFormBuilderFieldType } from "@/lib/pdf-form-builder";

interface PdfFormBuilderClientProps {
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
  /** Page size in PDF points (scale 1). */
  pdfWidth: number;
  pdfHeight: number;
}

const SCALE = 1.5;
/** Vertical pitch of one radio option (16 pt box + 4 pt gap). */
const RADIO_OPTION_PITCH = 20;

const FIELD_TYPES: {
  type: PdfFormBuilderFieldType;
  label: string;
  width: number;
  height: number;
}[] = [
  { type: "text", label: "Text field", width: 200, height: 24 },
  { type: "checkbox", label: "Checkbox", width: 18, height: 18 },
  { type: "radio", label: "Radio group", width: 16, height: 16 },
  { type: "dropdown", label: "Dropdown", width: 200, height: 24 },
  { type: "optionList", label: "Option list", width: 200, height: 72 },
];

const TYPE_BASE_NAME: Record<PdfFormBuilderFieldType, string> = {
  text: "Text field",
  checkbox: "Checkbox",
  radio: "Choice",
  dropdown: "Dropdown",
  optionList: "List",
};

const DEFAULT_OPTIONS: Record<string, string> = {
  radio: "Option 1\nOption 2",
  dropdown: "Option 1\nOption 2\nOption 3",
  optionList: "Option 1\nOption 2\nOption 3",
};

interface PendingField {
  type: PdfFormBuilderFieldType;
  page: number;
  /** Bottom-left x in PDF points. */
  x: number;
  /** Bottom-left y of the field (or of the first radio option). */
  y: number;
  width: number;
  height: number;
}

/** The full height of a radio column, in PDF points. */
function radioColumnHeight(optionCount: number, optionHeight: number): number {
  return optionCount * RADIO_OPTION_PITCH - (RADIO_OPTION_PITCH - optionHeight);
}

function parseOptions(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function PdfFormBuilderClient({
  document,
  pageCount,
  initialFields,
  fieldsError,
}: PdfFormBuilderClientProps) {
  const router = useRouter();
  const [fields, setFields] = useState<PdfFormField[]>(initialFields);
  const [pages, setPages] = useState<PageView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The field being built.
  const [selectedType, setSelectedType] =
    useState<PdfFormBuilderFieldType | null>(null);
  const [pending, setPending] = useState<PendingField | null>(null);
  const [fieldName, setFieldName] = useState("");
  const [optionsText, setOptionsText] = useState("");
  const [multiline, setMultiline] = useState(false);
  const [maxLength, setMaxLength] = useState("");
  const [multiselect, setMultiselect] = useState(false);
  const [required, setRequired] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [defaultValue, setDefaultValue] = useState("");

  const canvasRefs = useRef(new Map<number, HTMLCanvasElement | null>());
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  // The size the next click places (state, so the width/height
  // inputs work before anything is placed).
  const [size, setSize] = useState({ width: 200, height: 24 });

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
          const points = page.getViewport({ scale: 1 });
          views.push({
            pageNumber: n,
            width: viewport.width,
            height: viewport.height,
            pdfWidth: points.width,
            pdfHeight: points.height,
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
  }

  function suggestName(type: PdfFormBuilderFieldType): string {
    const base = TYPE_BASE_NAME[type];
    const taken = new Set(fields.map((f) => f.name));
    if (!taken.has(base)) return base;
    let n = 2;
    while (taken.has(`${base} ${n}`)) n += 1;
    return `${base} ${n}`;
  }

  function pickType(type: PdfFormBuilderFieldType) {
    const def = FIELD_TYPES.find((t) => t.type === type)!;
    setSelectedType(type);
    setPending(null);
    setFieldName(suggestName(type));
    setOptionsText(DEFAULT_OPTIONS[type] ?? "");
    setMultiline(false);
    setMaxLength("");
    setMultiselect(false);
    setRequired(false);
    setReadOnly(false);
    setDefaultValue("");
    setMessage(null);
    setError(null);
    // The size is remembered so the next click places this type.
    setSize({ width: def.width, height: def.height });
  }

  function placePending(
    pageNumber: number,
    clientX: number,
    clientY: number,
    target: HTMLElement
  ) {
    if (!selectedType) return;
    const view = pages.find((p) => p.pageNumber === pageNumber);
    if (!view) return;
    const rect = target.getBoundingClientRect();
    const cx = clientX - rect.left;
    const cy = clientY - rect.top;
    const { width, height } = size;
    // Click point in PDF points; the click is the field's TOP-LEFT
    // corner (PDF coordinates run bottom-up, the screen runs
    // top-down).
    let x = cx / SCALE;
    let y = view.pdfHeight - cy / SCALE - height;
    // Keep the whole field (or radio column) on the page.
    const columnHeight =
      selectedType === "radio"
        ? radioColumnHeight(
            Math.max(parseOptions(optionsText).length, 1),
            height
          )
        : height;
    if (x + width > view.pdfWidth) x = view.pdfWidth - width;
    if (x < 0) x = 0;
    if (y + height > view.pdfHeight) y = view.pdfHeight - height;
    if (y - (columnHeight - height) < 0) y = columnHeight - height;
    setPending({ type: selectedType, page: pageNumber, x, y, width, height });
    setMessage(null);
    setError(null);
  }

  async function submitAdd() {
    if (!pending || !selectedType) return;
    const name = fieldName.trim();
    if (!name) {
      setError("Give the field a name first.");
      return;
    }
    const options = parseOptions(optionsText);
    if (
      (selectedType === "radio" ||
        selectedType === "dropdown" ||
        selectedType === "optionList") &&
      options.length === 0
    ) {
      setError("Add at least one option for this field type.");
      return;
    }
    const parsedMax = maxLength.trim() === "" ? undefined : Number(maxLength);
    if (
      maxLength.trim() !== "" &&
      (!Number.isInteger(parsedMax) || parsedMax! < 1)
    ) {
      setError("The maximum length must be a whole number of at least 1.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const body: Record<string, unknown> = {
        name,
        type: selectedType,
        page: pending.page,
        x: pending.x,
        y: pending.y,
        width: pending.width,
        height: pending.height,
      };
      if (options.length > 0) body.options = options;
      if (selectedType === "text" && multiline) body.multiline = true;
      if (selectedType === "text" && parsedMax !== undefined)
        body.maxLength = parsedMax;
      if (
        (selectedType === "dropdown" || selectedType === "optionList") &&
        multiselect
      )
        body.multiselect = true;
      if (required) body.required = true;
      if (readOnly) body.readOnly = true;
      if (selectedType === "text" && defaultValue.trim() !== "")
        body.defaultValue = defaultValue;
      if (selectedType === "checkbox" && defaultValue === "checked")
        body.defaultValue = true;
      if (
        (selectedType === "radio" ||
          selectedType === "dropdown" ||
          selectedType === "optionList") &&
        defaultValue !== ""
      )
        body.defaultValue = defaultValue;
      const response = await fetch(
        `/api/documents/${document.id}/pdf/add-field`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
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
            : "Could not add this field."
        );
      }
      if (typeof data.version !== "number")
        throw new Error("The server did not return a version.");
      setMessage(
        `Added "${name}" as version ${data.version} — the original file is untouched. Pick another type, or click on a page to place another ${selectedType} field.`
      );
      setPending(null);
      await refreshFields();
      reload();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not add this field."
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitRemove(name: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/documents/${document.id}/pdf/remove-field`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
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
            : "Could not remove this field."
        );
      }
      if (typeof data.version !== "number")
        throw new Error("The server did not return a version.");
      setMessage(
        `Removed "${name}" as version ${data.version} — the original file is untouched.`
      );
      await refreshFields();
      reload();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not remove this field."
      );
    } finally {
      setBusy(false);
    }
  }

  const options = parseOptions(optionsText);
  const pendingOverlay =
    pending && selectedType
      ? {
          left: pending.x * SCALE,
          top:
            (pages.find((p) => p.pageNumber === pending.page)?.pdfHeight ?? 0) *
              SCALE -
            (pending.y + pending.height) * SCALE,
          width: pending.width * SCALE,
          height:
            (selectedType === "radio"
              ? radioColumnHeight(options.length, pending.height)
              : pending.height) * SCALE,
        }
      : null;

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-[#202b3c]">
            Build form — {document.title}
          </h1>
          <p className="mt-1 text-sm text-[#5a6b7f]">
            Version {document.version}
            {pageCount
              ? ` · ${pageCount} page${pageCount === 1 ? "" : "s"}`
              : ""}
            {fields.length > 0
              ? ` · ${fields.length} field${fields.length === 1 ? "" : "s"}`
              : " · no fields yet"}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/documents/${document.id}/pdf-form`}
            className="inline-flex h-9 items-center rounded-lg border border-[#dce3ec] bg-white px-3 text-sm font-medium text-[#202b3c] hover:bg-[#f4f7fa]"
          >
            Fill form
          </Link>
          <Link
            href="/files"
            className="inline-flex h-9 items-center rounded-lg border border-[#dce3ec] bg-white px-3 text-sm font-medium text-[#202b3c] hover:bg-[#f4f7fa]"
          >
            Back to files
          </Link>
        </div>
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
        {/* The PDF, rendered page by page. Click to place a field. */}
        <div className="space-y-4">
          {loading && (
            <p className="text-sm text-[#5a6b7f]">Opening the PDF…</p>
          )}
          {loadError && (
            <p className="rounded-lg border border-[#f3c2c2] bg-[#fdf0f0] px-3 py-2 text-sm text-[#8f1d1d]">
              {loadError}
            </p>
          )}
          {!loading && !selectedType && (
            <p className="rounded-lg border border-[#dce3ec] bg-white px-3 py-2 text-sm text-[#5a6b7f]">
              Pick a field type on the right, then click on a page to place it.
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
              <div
                className="relative inline-block"
                style={{
                  cursor: selectedType ? "crosshair" : "default",
                }}
                onClick={(e) =>
                  placePending(
                    view.pageNumber,
                    e.clientX,
                    e.clientY,
                    e.currentTarget
                  )
                }
              >
                <canvas
                  ref={(el) => {
                    canvasRefs.current.set(view.pageNumber, el);
                  }}
                  style={{ width: view.width, height: view.height }}
                  className="block max-w-full"
                />
                {pendingOverlay && pending?.page === view.pageNumber && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute rounded-sm border-2 border-dashed border-[#3159c9] bg-[#3159c9]/10"
                    style={{
                      left: pendingOverlay.left,
                      top: pendingOverlay.top,
                      width: pendingOverlay.width,
                      height: pendingOverlay.height,
                    }}
                  />
                )}
              </div>
            </div>
          ))}
        </div>

        {/* The builder panel. */}
        <div className="space-y-4">
          <div className={sectionClass}>
            <h2 className="text-sm font-semibold text-[#202b3c]">
              Add a field
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {FIELD_TYPES.map((t) => (
                <button
                  key={t.type}
                  type="button"
                  className={`inline-flex h-9 items-center rounded-lg border px-3 text-sm font-medium ${
                    selectedType === t.type
                      ? "border-[#3159c9] bg-[#3159c9] text-white"
                      : "border-[#dce3ec] bg-white text-[#202b3c] hover:bg-[#f4f7fa]"
                  }`}
                  disabled={busy}
                  onClick={() => pickType(t.type)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {fieldsError && (
              <p className="mt-3 rounded-lg border border-[#f3c2c2] bg-[#fdf0f0] px-3 py-2 text-sm text-[#8f1d1d]">
                {fieldsError}
              </p>
            )}
            {!selectedType && (
              <p className="mt-3 text-sm text-[#5a6b7f]">
                Choose a field type, then click on a page to place it. A radio
                group is placed as a vertical column of options, starting at the
                click.
              </p>
            )}
            {selectedType && (
              <div className="mt-4 space-y-3">
                <div>
                  <label className={labelClass} htmlFor="builder-name">
                    Field name
                  </label>
                  <input
                    id="builder-name"
                    type="text"
                    className={inputClass}
                    value={fieldName}
                    disabled={busy}
                    onChange={(e) => setFieldName(e.target.value)}
                  />
                </div>
                {(selectedType === "radio" ||
                  selectedType === "dropdown" ||
                  selectedType === "optionList") && (
                  <div>
                    <label className={labelClass} htmlFor="builder-options">
                      Options — one per line
                    </label>
                    <textarea
                      id="builder-options"
                      className={`${inputClass} h-auto min-h-20 py-2`}
                      value={optionsText}
                      disabled={busy}
                      onChange={(e) => setOptionsText(e.target.value)}
                    />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass} htmlFor="builder-width">
                      Width (points)
                    </label>
                    <input
                      id="builder-width"
                      type="number"
                      min={8}
                      className={inputClass}
                      value={pending?.width ?? size.width}
                      disabled={busy}
                      onChange={(e) => {
                        const w = Number(e.target.value);
                        if (Number.isFinite(w) && w >= 8) {
                          setSize((prev) => ({ ...prev, width: w }));
                          if (pending) setPending({ ...pending, width: w });
                        }
                      }}
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="builder-height">
                      Height (points)
                    </label>
                    <input
                      id="builder-height"
                      type="number"
                      min={8}
                      className={inputClass}
                      value={pending?.height ?? size.height}
                      disabled={busy}
                      onChange={(e) => {
                        const h = Number(e.target.value);
                        if (Number.isFinite(h) && h >= 8) {
                          setSize((prev) => ({ ...prev, height: h }));
                          if (pending) setPending({ ...pending, height: h });
                        }
                      }}
                    />
                  </div>
                </div>
                {selectedType === "text" && (
                  <>
                    <label className="flex items-center gap-2 text-sm text-[#202b3c]">
                      <input
                        type="checkbox"
                        checked={multiline}
                        disabled={busy}
                        onChange={(e) => setMultiline(e.target.checked)}
                      />
                      Multi-line
                    </label>
                    <div>
                      <label className={labelClass} htmlFor="builder-maxlength">
                        Maximum length (optional)
                      </label>
                      <input
                        id="builder-maxlength"
                        type="number"
                        min={1}
                        className={inputClass}
                        value={maxLength}
                        placeholder="No limit"
                        disabled={busy}
                        onChange={(e) => setMaxLength(e.target.value)}
                      />
                    </div>
                  </>
                )}
                {(selectedType === "dropdown" ||
                  selectedType === "optionList") && (
                  <label className="flex items-center gap-2 text-sm text-[#202b3c]">
                    <input
                      type="checkbox"
                      checked={multiselect}
                      disabled={busy}
                      onChange={(e) => setMultiselect(e.target.checked)}
                    />
                    Allow several options at once
                  </label>
                )}
                <label className="flex items-center gap-2 text-sm text-[#202b3c]">
                  <input
                    type="checkbox"
                    checked={required}
                    disabled={busy}
                    onChange={(e) => setRequired(e.target.checked)}
                  />
                  Required
                </label>
                <label className="flex items-center gap-2 text-sm text-[#202b3c]">
                  <input
                    type="checkbox"
                    checked={readOnly}
                    disabled={busy}
                    onChange={(e) => setReadOnly(e.target.checked)}
                  />
                  Read-only
                </label>
                {selectedType === "text" && (
                  <div>
                    <label className={labelClass} htmlFor="builder-default">
                      Default value (optional)
                    </label>
                    <input
                      id="builder-default"
                      type="text"
                      className={inputClass}
                      value={defaultValue}
                      disabled={busy}
                      onChange={(e) => setDefaultValue(e.target.value)}
                    />
                  </div>
                )}
                {selectedType === "checkbox" && (
                  <label className="flex items-center gap-2 text-sm text-[#202b3c]">
                    <input
                      type="checkbox"
                      checked={defaultValue === "checked"}
                      disabled={busy}
                      onChange={(e) =>
                        setDefaultValue(e.target.checked ? "checked" : "")
                      }
                    />
                    Checked by default
                  </label>
                )}
                {(selectedType === "radio" ||
                  selectedType === "dropdown" ||
                  selectedType === "optionList") && (
                  <div>
                    <label
                      className={labelClass}
                      htmlFor="builder-default-select"
                    >
                      Default option (optional)
                    </label>
                    <select
                      id="builder-default-select"
                      className={inputClass}
                      value={defaultValue}
                      disabled={busy}
                      onChange={(e) => setDefaultValue(e.target.value)}
                    >
                      <option value="">— None —</option>
                      {options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <button
                  type="button"
                  className={buttonClass}
                  disabled={busy || !pending}
                  onClick={submitAdd}
                >
                  {busy ? "Adding…" : "Add field"}
                </button>
                {!pending && (
                  <p className="text-xs text-[#5a6b7f]">
                    Click on a page to place the field first.
                  </p>
                )}
                <p className="text-xs text-[#5a6b7f]">
                  Adding creates a new version of this document. The original
                  file is never overwritten.
                </p>
              </div>
            )}
          </div>

          {/* The fields already on the PDF. */}
          <div className={sectionClass}>
            <h2 className="text-sm font-semibold text-[#202b3c]">
              Fields on this PDF
            </h2>
            {fields.length === 0 && !fieldsError && (
              <p className="mt-3 text-sm text-[#5a6b7f]">
                No fields yet. Add the first one above — the PDF becomes a
                fillable form.
              </p>
            )}
            {fields.length > 0 && (
              <ul className="mt-3 space-y-2">
                {fields.map((field) => (
                  <li
                    key={field.name}
                    className="flex items-start justify-between gap-2 rounded-lg border border-[#dce3ec] px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#202b3c]">
                        {field.name}
                      </p>
                      <p className="text-xs text-[#5a6b7f]">
                        {field.type}
                        {field.page ? ` · page ${field.page}` : ""}
                        {field.required ? " · required" : ""}
                        {field.readOnly ? " · read-only" : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="inline-flex h-8 shrink-0 items-center rounded-lg border border-[#f3c2c2] bg-white px-2.5 text-xs font-medium text-[#8f1d1d] hover:bg-[#fdf0f0] disabled:opacity-60"
                      disabled={busy}
                      onClick={() => submitRemove(field.name)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
