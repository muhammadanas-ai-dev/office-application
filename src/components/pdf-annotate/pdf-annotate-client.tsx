// PDF annotation UI (Day 17) — client component.
//
// The PDF renders in the browser with PDF.js. The user selects
// text to highlight, underline or strike through; clicks to place
// a sticky note; or draws freehand. Every change goes to its API
// route and creates a new version — the original file is never
// overwritten. Errors come from the route's JSON error message,
// so the user always sees a real reason, never a generic failure.
//
// pdfjs-dist is imported DYNAMICALLY inside the load effect (a
// static import breaks SSR with `ReferenceError: DOMMatrix is not
// defined` — the pdf-edit page still has that pre-existing gap).
// The annotation overlay is drawn from the list the GET route
// returns (the annotations live in the PDF itself), so what the
// user sees is what the file contains.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import type { PageViewport } from "pdfjs-dist/types/src/display/display_utils";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import Link from "next/link";
import { MessageSquare } from "lucide-react";

interface PdfAnnotateClientProps {
  document: { id: string; title: string; version: number };
  pageCount: number | null;
}

const sectionClass = "rounded-xl border border-[#dce3ec] bg-white p-4";
const inputClass =
  "h-9 w-full rounded-lg border border-[#dce3ec] bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3159c9]";
const buttonClass =
  "inline-flex h-9 items-center rounded-lg bg-[#3159c9] px-3 text-sm font-medium text-white hover:bg-[#2a4cab] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3159c9] disabled:opacity-60";
const toolButtonClass = (active: boolean) =>
  `inline-flex h-9 items-center rounded-lg border px-3 text-sm font-medium ${
    active
      ? "border-[#3159c9] bg-[#3159c9] text-white"
      : "border-[#dce3ec] bg-white text-[#202b3c] hover:bg-[#f2f5fa]"
  }`;

const SCALE = 1.5;

type Mode = "select" | "note" | "ink";

type ListedAnnotation = {
  page: number;
  index: number;
  subtype: string;
  rect: [number, number, number, number];
  quadPoints?: number[];
  inkList?: number[][];
  contents?: string;
  color?: [number, number, number];
  author?: string;
  date?: string;
};

type TextSelection = {
  text: string;
  quadPoints: number[];
};

type PageText = {
  pageNumber: number;
  width: number;
  height: number;
  items: TextItem[];
};

const SUBTYPE_LABEL: Record<string, string> = {
  Highlight: "Highlight",
  Underline: "Underline",
  StrikeOut: "Strikethrough",
  Text: "Sticky note",
  Ink: "Freehand",
};

export function PdfAnnotateClient({
  document,
  pageCount,
}: PdfAnnotateClientProps) {
  const router = useRouter();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [pages, setPages] = useState<PageText[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [viewport, setViewport] = useState<PageViewport | null>(null);
  const [annotations, setAnnotations] = useState<ListedAnnotation[]>([]);
  const [mode, setMode] = useState<Mode>("select");
  const [selection, setSelection] = useState<TextSelection | null>(null);
  const [notePoint, setNotePoint] = useState<{ x: number; y: number } | null>(
    null
  );
  const [noteText, setNoteText] = useState("");
  const [markupNote, setMarkupNote] = useState("");
  const [inkStrokes, setInkStrokes] = useState<number[][]>([]);
  // The stroke being drawn. It lives in state so the overlay
  // re-renders as the stroke is drawn (a ref must not be read
  // during render).
  const [liveStroke, setLiveStroke] = useState<number[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const drawing = useRef(false);

  const totalPages = pageCount ?? pages.length;

  // Load the PDF (bytes) and each page's text items.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const response = await fetch(`/api/documents/${document.id}/download`);
        if (!response.ok) throw new Error("Could not download this PDF.");
        const bytes = new Uint8Array(await response.arrayBuffer());
        const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
        if (cancelled) return;
        pdfRef.current = pdf;
        const views: PageText[] = [];
        for (let n = 1; n <= pdf.numPages; n += 1) {
          const page = await pdf.getPage(n);
          const vp = page.getViewport({ scale: SCALE });
          const textContent = await page.getTextContent();
          views.push({
            pageNumber: n,
            width: vp.width,
            height: vp.height,
            items: textContent.items.filter(
              (item): item is TextItem =>
                "str" in item && item.str.trim().length > 0
            ),
          });
        }
        if (cancelled) return;
        setPages(views);
        setCurrentPage(1);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setLoadError(
          err instanceof Error ? err.message : "Could not open this PDF."
        );
      }
    })();
    return () => {
      cancelled = true;
      pdfRef.current?.destroy().catch(() => undefined);
      pdfRef.current = null;
    };
  }, [document.id, reloadKey]);

  // Render the current page's canvas.
  useEffect(() => {
    if (pages.length === 0 || !pdfRef.current) return;
    let cancelled = false;
    (async () => {
      const canvas = canvasRef.current;
      const pdf = pdfRef.current;
      if (!canvas || !pdf) return;
      const page: PDFPageProxy = await pdf.getPage(currentPage);
      const vp = page.getViewport({ scale: SCALE });
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      await page.render({ canvas, viewport: vp }).promise;
      if (cancelled) return;
      setViewport(vp);
    })();
    return () => {
      cancelled = true;
    };
  }, [pages, currentPage]);

  // Load the annotations (from the PDF itself, via the GET route).
  // The load runs inside an async function in the effect (the
  // pdf-edit page's pattern) so no state is set synchronously in
  // the effect body.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(
          `/api/documents/${document.id}/pdf/annotations`
        );
        if (!response.ok || cancelled) return;
        const data = (await response.json()) as {
          annotations?: ListedAnnotation[];
        };
        setAnnotations(Array.isArray(data.annotations) ? data.annotations : []);
      } catch {
        // The list is a nicety — a failed load must not block the page.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [document.id, reloadKey]);

  const reload = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    setPages([]);
    setSelection(null);
    setNotePoint(null);
    setNoteText("");
    setMarkupNote("");
    setInkStrokes([]);
    setLiveStroke(null);
    drawing.current = false;
    setReloadKey((k) => k + 1);
    router.refresh();
  }, [router]);

  function switchMode(next: Mode) {
    setMode(next);
    setLiveStroke(null);
    drawing.current = false;
    setSelection(null);
    setNotePoint(null);
  }

  async function postAnnotations(
    body: { annotations: Record<string, unknown>[] },
    successMessage: string
  ) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/documents/${document.id}/pdf/annotations`,
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
            : "Could not add the annotation."
        );
      }
      setMessage(
        `${successMessage} — saved as version ${data.version}. The original file is untouched.`
      );
      setSelection(null);
      setNotePoint(null);
      setNoteText("");
      setMarkupNote("");
      setInkStrokes([]);
      reload();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not add the annotation."
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeAnnotation(page: number, index: number) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/documents/${document.id}/pdf/annotations`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ page, index }),
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
            : "Could not remove the annotation."
        );
      }
      setMessage(
        `Annotation removed — saved as version ${data.version}. The original file is untouched.`
      );
      reload();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not remove the annotation."
      );
    } finally {
      setBusy(false);
    }
  }

  // Read the browser's text selection and turn it into PDF quads.
  // The quads are [top-left, top-right, bottom-left, bottom-right]
  // per line, in PDF points (see the Day 17 plan for the order).
  function readSelection() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      setSelection(null);
      return;
    }
    const container = containerRef.current;
    const vp = viewport;
    if (!container || !vp) return;
    const containerRect = container.getBoundingClientRect();
    const range = sel.getRangeAt(0);
    const rects = Array.from(range.getClientRects()).filter(
      (r) => r.width > 0 && r.height > 0
    );
    if (rects.length === 0) {
      setSelection(null);
      return;
    }
    const quadPoints: number[] = [];
    for (const rect of rects) {
      const left = rect.left - containerRect.left;
      const top = rect.top - containerRect.top;
      const right = rect.right - containerRect.left;
      const bottom = rect.bottom - containerRect.top;
      const tl = vp.convertToPdfPoint(left, top);
      const tr = vp.convertToPdfPoint(right, top);
      const bl = vp.convertToPdfPoint(left, bottom);
      const br = vp.convertToPdfPoint(right, bottom);
      quadPoints.push(tl[0], tl[1], tr[0], tr[1], bl[0], bl[1], br[0], br[1]);
    }
    setSelection({ text: sel.toString().trim(), quadPoints });
  }

  // A click in "Note" mode places a sticky note at that point.
  function handlePageClick(event: React.MouseEvent) {
    if (mode !== "note") return;
    const container = containerRef.current;
    const vp = viewport;
    if (!container || !vp) return;
    const rect = container.getBoundingClientRect();
    const point = vp.convertToPdfPoint(
      event.clientX - rect.left,
      event.clientY - rect.top
    );
    setNotePoint({ x: point[0], y: point[1] });
    setSelection(null);
  }

  // Freehand drawing (pointer events on the ink overlay).
  function inkPoint(event: React.PointerEvent): [number, number] | null {
    const container = containerRef.current;
    const vp = viewport;
    if (!container || !vp) return null;
    const rect = container.getBoundingClientRect();
    const point = vp.convertToPdfPoint(
      event.clientX - rect.left,
      event.clientY - rect.top
    );
    // convertToPdfPoint returns a 2-element array (x, y) — the
    // pdfjs-dist type is loose, so narrow it here.
    return [point[0], point[1]];
  }

  function handleInkDown(event: React.PointerEvent) {
    if (mode !== "ink") return;
    const point = inkPoint(event);
    if (!point) return;
    drawing.current = true;
    setLiveStroke([point[0], point[1]]);
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  }

  function handleInkMove(event: React.PointerEvent) {
    if (mode !== "ink" || !drawing.current) return;
    const point = inkPoint(event);
    if (!point) return;
    setLiveStroke((stroke) =>
      stroke ? [...stroke, point[0], point[1]] : [point[0], point[1]]
    );
  }

  function handleInkUp() {
    if (mode !== "ink" || !drawing.current) return;
    drawing.current = false;
    if (liveStroke && liveStroke.length >= 4) {
      setInkStrokes((strokes) => [...strokes, liveStroke]);
    }
    setLiveStroke(null);
  }

  // Convert a PDF point to the overlay's CSS coordinates.
  function toViewport(x: number, y: number): [number, number] {
    if (!viewport) return [0, 0];
    const [vx, vy] = viewport.convertToViewportPoint(x, y);
    return [vx, vy];
  }

  const currentView = pages.find((p) => p.pageNumber === currentPage);
  const pageAnnotations = annotations.filter((a) => a.page === currentPage);

  // The live (in-progress) ink stroke, drawn as it is drawn.
  const liveStrokeValue = liveStroke;

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6">
        <p className="text-sm text-neutral-500">Loading the PDF…</p>
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6">
        <div className={sectionClass}>
          <h1 className="text-lg font-semibold">Could not open this PDF</h1>
          <p className="mt-1 text-sm text-neutral-500">{loadError}</p>
          <Link href="/files" className="mt-4 inline-block">
            <span className={buttonClass}>Back to files</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Annotate — {document.title}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Version {document.version}. Highlight, underline or strike through
            selected text, place a sticky note, or draw freehand. Every change
            saves a new version.
          </p>
        </div>
        <Link href="/files" className="text-sm text-[#3159c9] hover:underline">
          Back to files
        </Link>
      </div>

      {message ? (
        <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => switchMode("select")}
          className={toolButtonClass(mode === "select")}
        >
          Select text
        </button>
        <button
          type="button"
          onClick={() => switchMode("note")}
          className={toolButtonClass(mode === "note")}
        >
          Sticky note
        </button>
        <button
          type="button"
          onClick={() => switchMode("ink")}
          className={toolButtonClass(mode === "ink")}
        >
          Freehand
        </button>
        <span className="ml-auto flex items-center gap-2 text-sm">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="rounded-lg border border-[#dce3ec] bg-white px-2 py-1 disabled:opacity-50"
          >
            Previous
          </button>
          <span>
            Page {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-lg border border-[#dce3ec] bg-white px-2 py-1 disabled:opacity-50"
          >
            Next
          </button>
        </span>
      </div>

      {mode === "note" ? (
        <p className="mt-3 text-sm text-neutral-500">
          Click anywhere on the page to place a sticky note there.
        </p>
      ) : null}
      {mode === "ink" ? (
        <p className="mt-3 text-sm text-neutral-500">
          Draw on the page with your mouse or finger. Save when you are done —
          each save creates a new version.
        </p>
      ) : null}

      {selection ? (
        <div className={`${sectionClass} mt-4`}>
          <p className="text-sm">
            Selected:{" "}
            <span className="font-medium">
              “{selection.text.slice(0, 120)}”
            </span>
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                postAnnotations(
                  {
                    annotations: [
                      {
                        kind: "highlight",
                        page: currentPage,
                        quadPoints: selection.quadPoints,
                        ...(markupNote.trim()
                          ? { contents: markupNote.trim() }
                          : {}),
                      },
                    ],
                  },
                  "Highlight added"
                )
              }
              className={buttonClass}
            >
              Highlight
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                postAnnotations(
                  {
                    annotations: [
                      {
                        kind: "underline",
                        page: currentPage,
                        quadPoints: selection.quadPoints,
                        ...(markupNote.trim()
                          ? { contents: markupNote.trim() }
                          : {}),
                      },
                    ],
                  },
                  "Underline added"
                )
              }
              className={buttonClass}
            >
              Underline
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                postAnnotations(
                  {
                    annotations: [
                      {
                        kind: "strikeout",
                        page: currentPage,
                        quadPoints: selection.quadPoints,
                        ...(markupNote.trim()
                          ? { contents: markupNote.trim() }
                          : {}),
                      },
                    ],
                  },
                  "Strikethrough added"
                )
              }
              className={buttonClass}
            >
              Strikethrough
            </button>
            <input
              value={markupNote}
              onChange={(e) => setMarkupNote(e.target.value)}
              maxLength={2000}
              placeholder="Add a note to this markup (optional)"
              className={`${inputClass} max-w-xs`}
            />
            <button
              type="button"
              onClick={() => setSelection(null)}
              className="text-sm text-neutral-500 hover:underline"
            >
              Clear selection
            </button>
          </div>
        </div>
      ) : null}

      {notePoint ? (
        <div className={`${sectionClass} mt-4`}>
          <p className="text-sm">
            Sticky note at page {currentPage} — write the note, then save it.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <input
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              maxLength={2000}
              placeholder="Write the note…"
              className={inputClass}
            />
            <button
              type="button"
              disabled={busy || !noteText.trim()}
              onClick={() =>
                postAnnotations(
                  {
                    annotations: [
                      {
                        kind: "note",
                        page: currentPage,
                        x: notePoint.x,
                        y: notePoint.y,
                        contents: noteText.trim(),
                      },
                    ],
                  },
                  "Sticky note added"
                )
              }
              className={buttonClass}
            >
              Save note
            </button>
            <button
              type="button"
              onClick={() => setNotePoint(null)}
              className="text-sm text-neutral-500 hover:underline"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {inkStrokes.length > 0 ? (
        <div className={`${sectionClass} mt-4`}>
          <p className="text-sm">
            {inkStrokes.length} stroke{inkStrokes.length === 1 ? "" : "s"} drawn
            — save them as one freehand annotation.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                postAnnotations(
                  {
                    annotations: [
                      { kind: "ink", page: currentPage, strokes: inkStrokes },
                    ],
                  },
                  "Freehand annotation added"
                )
              }
              className={buttonClass}
            >
              Save freehand
            </button>
            <button
              type="button"
              onClick={() => setInkStrokes([])}
              className="text-sm text-neutral-500 hover:underline"
            >
              Clear strokes
            </button>
          </div>
        </div>
      ) : null}

      <div className={`${sectionClass} mt-4`}>
        <div
          ref={containerRef}
          className="relative mx-auto w-fit"
          style={
            currentView
              ? { width: currentView.width, height: currentView.height }
              : undefined
          }
          onMouseUp={() => {
            if (mode === "select") readSelection();
          }}
          onClick={handlePageClick}
        >
          <canvas ref={canvasRef} className="block" />
          {/* The selectable text layer (transparent spans, one per
              text item) — the browser's native selection works over
              these, and readSelection turns it into PDF quads. */}
          {currentView
            ? currentView.items.map((item, index) => {
                const transform = item.transform;
                const x = transform[4];
                const y = transform[5];
                const fontSize = Math.hypot(transform[2], transform[3]);
                const [vx, vy] = toViewport(x, y);
                return (
                  <span
                    key={index}
                    style={{
                      position: "absolute",
                      left: vx,
                      top: vy - fontSize,
                      fontSize,
                      lineHeight: 1,
                      color: "transparent",
                      whiteSpace: "pre",
                      userSelect: "text",
                    }}
                  >
                    {item.str}
                  </span>
                );
              })
            : null}
          {/* The annotation overlay (from the file, via the GET
              route) — highlights, underlines, strikethroughs,
              sticky notes and freehand strokes, drawn in viewport
              coordinates. */}
          {viewport
            ? pageAnnotations.map((annotation) => {
                if (
                  annotation.quadPoints &&
                  annotation.quadPoints.length >= 8
                ) {
                  const quads: number[][] = [];
                  for (
                    let i = 0;
                    i + 7 < annotation.quadPoints.length;
                    i += 8
                  ) {
                    quads.push(annotation.quadPoints.slice(i, i + 8));
                  }
                  return quads.map((quad, qi) => {
                    const [tlx, tly] = toViewport(quad[0], quad[1]);
                    const [brx, bry] = toViewport(quad[6], quad[7]);
                    const left = Math.min(tlx, brx);
                    const top = Math.min(tly, bry);
                    const width = Math.abs(brx - tlx);
                    const height = Math.abs(bry - tly);
                    if (annotation.subtype === "Highlight") {
                      return (
                        <div
                          key={`${annotation.index}-${qi}`}
                          style={{
                            position: "absolute",
                            left,
                            top,
                            width,
                            height,
                            background: "rgba(255, 255, 0, 0.4)",
                            pointerEvents: "none",
                          }}
                        />
                      );
                    }
                    if (annotation.subtype === "Underline") {
                      return (
                        <div
                          key={`${annotation.index}-${qi}`}
                          style={{
                            position: "absolute",
                            left,
                            top: top + height - 2,
                            width,
                            height: 2,
                            background: "rgb(0, 153, 0)",
                            pointerEvents: "none",
                          }}
                        />
                      );
                    }
                    if (annotation.subtype === "StrikeOut") {
                      return (
                        <div
                          key={`${annotation.index}-${qi}`}
                          style={{
                            position: "absolute",
                            left,
                            top: top + height / 2 - 1,
                            width,
                            height: 2,
                            background: "rgb(255, 0, 0)",
                            pointerEvents: "none",
                          }}
                        />
                      );
                    }
                    return null;
                  });
                }
                if (annotation.subtype === "Text") {
                  const [vx, vy] = toViewport(
                    annotation.rect[0],
                    annotation.rect[3]
                  );
                  return (
                    <div
                      key={annotation.index}
                      title={annotation.contents ?? "Sticky note"}
                      style={{
                        position: "absolute",
                        left: vx,
                        top: vy,
                        width: 20,
                        height: 20,
                        background: "rgb(255, 255, 0)",
                        border: "1px solid rgb(200, 200, 0)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        pointerEvents: "none",
                      }}
                    >
                      <MessageSquare size={12} />
                    </div>
                  );
                }
                if (annotation.subtype === "Ink" && annotation.inkList) {
                  return (
                    <svg
                      key={annotation.index}
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        width: "100%",
                        height: "100%",
                        pointerEvents: "none",
                      }}
                    >
                      {annotation.inkList.map((stroke, si) => {
                        const points: string[] = [];
                        for (let i = 0; i + 1 < stroke.length; i += 2) {
                          const [vx, vy] = toViewport(stroke[i], stroke[i + 1]);
                          points.push(`${vx},${vy}`);
                        }
                        return (
                          <polyline
                            key={si}
                            points={points.join(" ")}
                            fill="none"
                            stroke="rgb(255, 0, 0)"
                            strokeWidth={2 * SCALE}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        );
                      })}
                    </svg>
                  );
                }
                return null;
              })
            : null}
          {/* The ink drawing surface (only in Ink mode) and the
              live strokes being drawn. */}
          {mode === "ink" ? (
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: "100%",
                height: "100%",
                touchAction: "none",
                cursor: "crosshair",
              }}
              onPointerDown={handleInkDown}
              onPointerMove={handleInkMove}
              onPointerUp={handleInkUp}
              onPointerLeave={handleInkUp}
            >
              <svg
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: "100%",
                  height: "100%",
                  pointerEvents: "none",
                }}
              >
                {inkStrokes.map((stroke, si) => {
                  const points: string[] = [];
                  for (let i = 0; i + 1 < stroke.length; i += 2) {
                    const [vx, vy] = toViewport(stroke[i], stroke[i + 1]);
                    points.push(`${vx},${vy}`);
                  }
                  return (
                    <polyline
                      key={si}
                      points={points.join(" ")}
                      fill="none"
                      stroke="rgb(255, 0, 0)"
                      strokeWidth={2 * SCALE}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  );
                })}
                {liveStrokeValue && liveStrokeValue.length >= 4 ? (
                  <polyline
                    points={(() => {
                      const points: string[] = [];
                      for (let i = 0; i + 1 < liveStrokeValue.length; i += 2) {
                        const [vx, vy] = toViewport(
                          liveStrokeValue[i],
                          liveStrokeValue[i + 1]
                        );
                        points.push(`${vx},${vy}`);
                      }
                      return points.join(" ");
                    })()}
                    fill="none"
                    stroke="rgb(255, 0, 0)"
                    strokeWidth={2 * SCALE}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null}
              </svg>
            </div>
          ) : null}
        </div>
      </div>

      <div className={`${sectionClass} mt-4`}>
        <h2 className="text-base font-semibold">
          Annotations on page {currentPage}
        </h2>
        {pageAnnotations.length === 0 ? (
          <p className="mt-1 text-sm text-neutral-500">
            No annotations on this page yet.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {pageAnnotations.map((annotation) => (
              <li
                key={`${annotation.page}-${annotation.index}`}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-[#dce3ec] px-3 py-2 text-sm"
              >
                <span className="font-medium">
                  {SUBTYPE_LABEL[annotation.subtype] ?? annotation.subtype}
                </span>
                {annotation.contents ? (
                  <span className="text-neutral-600">
                    “{annotation.contents.slice(0, 80)}”
                  </span>
                ) : null}
                {annotation.author ? (
                  <span className="text-neutral-500">
                    by {annotation.author}
                  </span>
                ) : null}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    removeAnnotation(annotation.page, annotation.index)
                  }
                  className="ml-auto text-sm text-red-700 hover:underline disabled:opacity-50"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
