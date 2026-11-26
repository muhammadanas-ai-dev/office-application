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
import { resolveOutline, type OutlineItem } from "@/lib/pdf-outline";
import type { RedactRegion } from "@/lib/pdf-redact";
import { MessageSquare } from "lucide-react";

interface PdfAnnotateClientProps {
  document: { id: string; title: string; version: number };
  pageCount: number | null;
  otherPdfs?: { id: string; title: string }[];
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

type Mode = "select" | "note" | "ink" | "redact";

/** F21 viewer state: the annotate surface (single page, full
 *  markup tools) or the read surface (continuous/facing
 *  scroll, thumbnails + outline navigation). */
type ViewMode = "annotate" | "read";
type ReadLayout = "continuous" | "facing";

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

/** A page thumbnail (F21): renders one page to a small canvas
 *  once it mounts. Capped by the parent (very long documents
 *  show the first pages and a note). */
function ThumbCanvas({
  pdf,
  pageNumber,
  width,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  width: number;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const canvas = ref.current;
      if (!canvas) return;
      const page = await pdf.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: width / base.width });
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      if (cancelled) return;
      await page.render({ canvas, viewport: vp }).promise;
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pdf, pageNumber, width]);
  return <canvas ref={ref} className="block w-full" />;
}

/** One page on the reading surface (F21): a plain canvas at
 *  the read scale — no annotation overlays. */
function ReadCanvas({
  pdf,
  pageNumber,
  scale,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const canvas = ref.current;
      if (!canvas) return;
      const page = await pdf.getPage(pageNumber);
      const vp = page.getViewport({ scale });
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      if (cancelled) return;
      await page.render({ canvas, viewport: vp }).promise;
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pdf, pageNumber, scale]);
  return <canvas ref={ref} className="mx-auto block shadow" />;
}

/** The outline (bookmarks) tree (F21): nested buttons; an
 *  entry with no resolvable page renders as plain text. */
function OutlineTree({
  items,
  depth,
  onSelect,
}: {
  items: OutlineItem[];
  depth: number;
  onSelect: (page: number) => void;
}) {
  return (
    <ul className={depth > 0 ? "ml-3 border-l border-[#e4eaf2] pl-2" : ""}>
      {items.map((item, index) => (
        <li key={`${depth}-${index}`} className="py-0.5">
          {item.page ? (
            <button
              type="button"
              onClick={() => onSelect(item.page as number)}
              className="text-left text-sm text-[#202b3c] hover:text-[#3159c9] hover:underline"
            >
              {item.title}
              <span className="ml-1 text-xs text-neutral-400">
                p.{item.page}
              </span>
            </button>
          ) : (
            <span className="text-sm text-neutral-500">{item.title}</span>
          )}
          {item.children.length > 0 ? (
            <OutlineTree
              items={item.children}
              depth={depth + 1}
              onSelect={onSelect}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function PdfAnnotateClient({
  document,
  pageCount,
  otherPdfs = [],
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
  const [searchQuery, setSearchQuery] = useState("");
  const [searchCase, setSearchCase] = useState(false);
  const [searchWord, setSearchWord] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<{
    total: number;
    truncated: boolean;
    pages: {
      page: number;
      matches: {
        before: string;
        match: string;
        after: string;
        startsCut: boolean;
        endsCut: boolean;
      }[];
    }[];
  } | null>(null);
  const [redactRegions, setRedactRegions] = useState<RedactRegion[]>([]);
  const [liveRect, setLiveRect] = useState<RedactRegion | null>(null);
  const redactStart = useRef<{ x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const drawing = useRef(false);
  // F21 viewer state.
  const [viewMode, setViewMode] = useState<ViewMode>("annotate");
  const [readLayout, setReadLayout] = useState<ReadLayout>("continuous");
  const [zoom, setZoom] = useState(1);
  const [sidebar, setSidebar] = useState<"pages" | "outline" | null>(
    "pages"
  );
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const readScrollRef = useRef<HTMLDivElement | null>(null);

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
        try {
          const rawOutline = await pdf.getOutline();
          if (!cancelled && rawOutline) {
            setOutline(await resolveOutline(pdf, rawOutline));
          }
        } catch {
          // A PDF without an outline (or one PDF.js cannot
          // read) simply shows the "no bookmarks" message.
        }
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
      const vp = page.getViewport({ scale: SCALE * zoom });
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      await page.render({ canvas, viewport: vp }).promise;
      if (cancelled) return;
      setViewport(vp);
    })();
    return () => {
      cancelled = true;
    };
  }, [pages, currentPage, zoom]);

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

  // ---- F26 redaction drag ----
  function handleRedactDown(event: React.PointerEvent) {
    if (mode !== "redact") return;
    const point = inkPoint(event);
    if (!point) return;
    redactStart.current = { x: point[0], y: point[1] };
    setLiveRect({
      page: currentPage,
      x: point[0],
      y: point[1],
      width: 0,
      height: 0,
    });
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  }

  function handleRedactMove(event: React.PointerEvent) {
    if (mode !== "redact" || !redactStart.current) return;
    const point = inkPoint(event);
    if (!point) return;
    const start = redactStart.current;
    setLiveRect({
      page: currentPage,
      x: Math.min(start.x, point[0]),
      y: Math.min(start.y, point[1]),
      width: Math.abs(point[0] - start.x),
      height: Math.abs(point[1] - start.y),
    });
  }

  function handleRedactUp() {
    if (mode !== "redact" || !redactStart.current) return;
    redactStart.current = null;
    if (liveRect && liveRect.width >= 2 && liveRect.height >= 2) {
      setRedactRegions((regions) => [...regions, liveRect]);
    }
    setLiveRect(null);
  }

  // Import comments from another PDF (F30).
  const [importSourceId, setImportSourceId] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importNote, setImportNote] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  async function importComments() {
    if (!importSourceId) return;
    setImportBusy(true);
    setImportNote(null);
    setImportError(null);
    try {
      const response = await fetch(
        `/api/documents/${document.id}/pdf/import-annotations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceDocumentId: importSourceId }),
        }
      );
      const data = (await response.json().catch(() => null)) as {
        error?: string;
        imported?: number;
        skipped?: number;
        version?: number;
      } | null;
      if (!response.ok) {
        throw new Error(data?.error ?? "Import failed.");
      }
      setImportNote(
        `Imported ${data?.imported ?? 0} comment${data?.imported === 1 ? "" : "s"}` +
          (data?.skipped
            ? ` — ${data.skipped} skipped because this PDF has fewer pages.`
            : ".") +
          ` Saved as version ${data?.version}.`
      );
      reload();
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : "Import failed."
      );
    } finally {
      setImportBusy(false);
    }
  }

  async function applyRedaction() {
    if (redactRegions.length === 0) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/documents/${document.id}/pdf/redact`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ regions: redactRegions }),
        }
      );
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        version?: number;
        removed?: {
          textRuns: number;
          images: number;
          annotations: number;
        };
      };
      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Could not redact this PDF.");
      }
      const removed = data.removed;
      setMessage(
        `Redaction applied — saved as version ${data.version}. Removed ${removed?.textRuns ?? 0} text run(s), ${removed?.images ?? 0} image(s) and ${removed?.annotations ?? 0} annotation(s) under the marked areas.`
      );
      setRedactRegions([]);
      reload();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not redact this PDF."
      );
    } finally {
      setBusy(false);
    }
  }

  // Convert a PDF point to the overlay's CSS coordinates.
  function toViewport(x: number, y: number): [number, number] {
    if (!viewport) return [0, 0];
    const [vx, vy] = viewport.convertToViewportPoint(x, y);
    return [vx, vy];
  }

  async function runSearch() {
    const q = searchQuery.trim();
    if (!q) {
      setSearchError("Type something to search for.");
      return;
    }
    setSearchBusy(true);
    setSearchError(null);
    try {
      const params = new URLSearchParams({ q });
      if (searchCase) params.set("case", "1");
      if (searchWord) params.set("word", "1");
      const response = await fetch(
        `/api/documents/${document.id}/pdf/search?${params.toString()}`
      );
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        total: number;
        truncated: boolean;
        pages: {
          page: number;
          matches: {
            before: string;
            match: string;
            after: string;
            startsCut: boolean;
            endsCut: boolean;
          }[];
        }[];
      };
      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Could not search this PDF.");
      }
      setSearchResults({
        total: data.total,
        truncated: data.truncated,
        pages: data.pages,
      });
    } catch (err) {
      setSearchResults(null);
      setSearchError(
        err instanceof Error ? err.message : "Could not search this PDF."
      );
    } finally {
      setSearchBusy(false);
    }
  }

  // ---- F21 viewer helpers ----
  function goToPage(n: number) {
    const target = Math.min(Math.max(1, n), totalPages || 1);
    setCurrentPage(target);
    if (viewMode === "read") {
      globalThis.document
        .getElementById(`forma-read-page-${target}`)
        ?.scrollIntoView({ block: "start" });
    }
  }

  function fitWidth() {
    const view = pages.find((p) => p.pageNumber === currentPage);
    const section = viewerRef.current;
    if (!view || !section) return;
    const available =
      section.clientWidth - 32 - (sidebar ? 176 : 0);
    if (available > 0) {
      setZoom(
        Math.min(2.5, Math.max(0.5, Math.round((available / view.width) * 100) / 100))
      );
    }
  }

  function fitPage() {
    const view = pages.find((p) => p.pageNumber === currentPage);
    const section = viewerRef.current;
    if (!view || !section) return;
    const availableWidth =
      section.clientWidth - 32 - (sidebar ? 176 : 0);
    const availableHeight = window.innerHeight - 240;
    const byWidth = availableWidth / view.width;
    const byHeight = availableHeight / view.height;
    setZoom(
      Math.min(2.5, Math.max(0.5, Math.round(Math.min(byWidth, byHeight) * 100) / 100))
    );
  }

  async function toggleFullscreen() {
    try {
      if (globalThis.document.fullscreenElement) {
        await globalThis.document.exitFullscreen();
      } else {
        await viewerRef.current?.requestFullscreen();
      }
    } catch {
      // Full screen is a convenience — a refusal (browser
      // policy) is not an error worth surfacing.
    }
  }

  // In read mode, keep the page indicator honest while the
  // user scrolls.
  useEffect(() => {
    if (viewMode !== "read" || !readScrollRef.current) return;
    const root = readScrollRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const n = Number(
              (entry.target as HTMLElement).dataset.page ?? ""
            );
            if (n >= 1) setCurrentPage(n);
          }
        }
      },
      { root, threshold: 0.4 }
    );
    root
      .querySelectorAll("[data-page]")
      .forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [viewMode, readLayout, zoom, pages]);

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
        <button
          type="button"
          onClick={() => switchMode("redact")}
          className={toolButtonClass(mode === "redact")}
        >
          Redact
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
          <span className="flex items-center gap-1">
            Page
            <input
              type="number"
              min={1}
              max={totalPages}
              value={currentPage}
              onChange={(event) => {
                const n = Number(event.target.value);
                if (Number.isFinite(n) && n >= 1 && n <= totalPages) {
                  goToPage(n);
                }
              }}
              className="h-7 w-14 rounded-md border border-[#dce3ec] px-1 text-center text-sm"
              aria-label="Go to page"
            />
            of {totalPages}
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

      <div className={`${sectionClass} mt-4`}>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="pdf-search-input">
            Search in this PDF
          </label>
          <input
            id="pdf-search-input"
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void runSearch();
              }
            }}
            placeholder="Search in this PDF…"
            maxLength={200}
            className="h-9 w-64 max-w-full rounded-lg border border-[#dce3ec] bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3159c9]"
          />
          <button
            type="button"
            onClick={() => void runSearch()}
            disabled={searchBusy}
            className={buttonClass}
          >
            {searchBusy ? "Searching…" : "Search"}
          </button>
          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={searchCase}
              onChange={(event) => setSearchCase(event.target.checked)}
            />
            Match case
          </label>
          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={searchWord}
              onChange={(event) => setSearchWord(event.target.checked)}
            />
            Whole word
          </label>
        </div>
        {searchError ? (
          <p className="mt-2 text-sm text-red-600">{searchError}</p>
        ) : null}
        {searchResults ? (
          searchResults.total === 0 ? (
            <p className="mt-2 text-sm text-neutral-500">
              No matches. If this is a scanned PDF with no text layer,
              use “Make searchable” on the PDF tools page first — then
              search will find the text.
            </p>
          ) : (
            <div className="mt-3">
              <p className="text-sm text-neutral-500">
                {searchResults.total} match
                {searchResults.total === 1 ? "" : "es"}
                {searchResults.truncated
                  ? " (showing the first 500)"
                  : ""}{" "}
                — click a result to open its page.
              </p>
              <ul className="mt-2 space-y-1">
                {searchResults.pages.map((pageResult) =>
                  pageResult.matches.map((match, index) => (
                    <li key={`${pageResult.page}-${index}`}>
                      <button
                        type="button"
                        onClick={() => setCurrentPage(pageResult.page)}
                        className="w-full rounded-lg border border-[#dce3ec] bg-white px-3 py-2 text-left text-sm hover:bg-[#f2f5fa]"
                      >
                        <span className="mr-2 font-medium text-[#3159c9]">
                          Page {pageResult.page}
                        </span>
                        {match.startsCut ? "…" : ""}
                        {match.before}
                        <mark className="bg-yellow-200">{match.match}</mark>
                        {match.after}
                        {match.endsCut ? "…" : ""}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          )
        ) : null}
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
      {mode === "redact" ? (
        <p className="mt-3 text-sm text-neutral-500">
          Drag a box over anything that must be removed for good. Applying
          redaction deletes the text and images under every box — it cannot
          be undone in the new version (earlier versions keep the original,
          so redact the copy you share, not your only copy).
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

      {otherPdfs.length > 0 ? (
        <div className={`${sectionClass} mt-4`}>
          <p className="text-sm font-medium">Import comments</p>
          <p className="mt-1 text-sm text-neutral-500">
            Copy every comment from another PDF onto the same page
            numbers here. Comments on pages this PDF does not have
            are skipped. Saved as a new version.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select
              aria-label="PDF to import comments from"
              value={importSourceId}
              onChange={(event) => setImportSourceId(event.target.value)}
              className="h-9 max-w-full rounded-lg border border-[#dce3ec] bg-white px-2 text-sm"
            >
              <option value="">Choose a PDF…</option>
              {otherPdfs.map((pdf) => (
                <option key={pdf.id} value={pdf.id}>
                  {pdf.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void importComments()}
              disabled={importBusy || !importSourceId}
              className={buttonClass}
            >
              {importBusy ? "Importing…" : "Import comments"}
            </button>
          </div>
          {importError ? (
            <p className="mt-2 text-sm text-red-600">{importError}</p>
          ) : null}
          {importNote ? (
            <p className="mt-2 text-sm text-neutral-500">{importNote}</p>
          ) : null}
        </div>
      ) : null}

      {redactRegions.length > 0 ? (
        <div className={`${sectionClass} mt-4`}>
          <p className="text-sm">
            {redactRegions.length} redaction area
            {redactRegions.length === 1 ? "" : "s"} marked. Applying
            redaction permanently deletes the text and images under
            every box in the new version.
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {redactRegions.map((region, index) => (
              <li
                key={index}
                className="flex items-center gap-2 text-sm text-neutral-600"
              >
                <span>
                  Page {region.page} — {Math.round(region.width)} ×{" "}
                  {Math.round(region.height)} pt
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setRedactRegions((regions) =>
                      regions.filter((_, i) => i !== index)
                    )
                  }
                  className="text-neutral-500 hover:underline"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void applyRedaction()}
              className="inline-flex h-9 items-center rounded-lg bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-60"
            >
              Apply redaction
            </button>
            <button
              type="button"
              onClick={() => setRedactRegions([])}
              className="text-sm text-neutral-500 hover:underline"
            >
              Clear all
            </button>
          </div>
        </div>
      ) : null}

      <div className={`${sectionClass} mt-4`}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-[#dce3ec]">
            <button
              type="button"
              onClick={() => setViewMode("annotate")}
              className={`px-3 py-1.5 text-sm font-medium ${viewMode === "annotate" ? "bg-[#3159c9] text-white" : "bg-white hover:bg-[#f2f5fa]"}`}
            >
              Annotate
            </button>
            <button
              type="button"
              onClick={() => setViewMode("read")}
              className={`px-3 py-1.5 text-sm font-medium ${viewMode === "read" ? "bg-[#3159c9] text-white" : "bg-white hover:bg-[#f2f5fa]"}`}
            >
              Read
            </button>
          </div>
          <span className="mx-1 h-6 w-px bg-[#dce3ec]" />
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))}
            className="rounded-lg border border-[#dce3ec] bg-white px-2 py-1 text-sm hover:bg-[#f2f5fa]"
            aria-label="Zoom out"
          >
            −
          </button>
          <span className="w-12 text-center text-sm">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2.5, Math.round((z + 0.25) * 100) / 100))}
            className="rounded-lg border border-[#dce3ec] bg-white px-2 py-1 text-sm hover:bg-[#f2f5fa]"
            aria-label="Zoom in"
          >
            +
          </button>
          {viewMode === "annotate" ? (
            <>
              <button
                type="button"
                onClick={fitWidth}
                className="rounded-lg border border-[#dce3ec] bg-white px-2 py-1 text-sm hover:bg-[#f2f5fa]"
              >
                Fit width
              </button>
              <button
                type="button"
                onClick={fitPage}
                className="rounded-lg border border-[#dce3ec] bg-white px-2 py-1 text-sm hover:bg-[#f2f5fa]"
              >
                Fit page
              </button>
            </>
          ) : (
            <div className="flex overflow-hidden rounded-lg border border-[#dce3ec]">
              <button
                type="button"
                onClick={() => setReadLayout("continuous")}
                className={`px-3 py-1.5 text-sm font-medium ${readLayout === "continuous" ? "bg-[#3159c9] text-white" : "bg-white hover:bg-[#f2f5fa]"}`}
              >
                Continuous
              </button>
              <button
                type="button"
                onClick={() => setReadLayout("facing")}
                className={`px-3 py-1.5 text-sm font-medium ${readLayout === "facing" ? "bg-[#3159c9] text-white" : "bg-white hover:bg-[#f2f5fa]"}`}
              >
                Facing
              </button>
            </div>
          )}
          <span className="mx-1 h-6 w-px bg-[#dce3ec]" />
          <button
            type="button"
            onClick={() => setSidebar(sidebar === "pages" ? null : "pages")}
            className={toolButtonClass(sidebar === "pages")}
          >
            Pages
          </button>
          <button
            type="button"
            onClick={() => setSidebar(sidebar === "outline" ? null : "outline")}
            className={toolButtonClass(sidebar === "outline")}
          >
            Outline
          </button>
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            className="rounded-lg border border-[#dce3ec] bg-white px-3 py-1.5 text-sm font-medium hover:bg-[#f2f5fa]"
          >
            Full screen
          </button>
          {viewMode === "read" ? (
            <span className="text-sm text-neutral-500">
              Reading mode — switch to Annotate to mark up the document.
            </span>
          ) : null}
        </div>
      </div>

      <div ref={viewerRef} className={`${sectionClass} mt-4`}>
        <div className="flex items-start gap-4">
          {sidebar ? (
            <div className="w-40 shrink-0">
              {sidebar === "pages" ? (
                <div className="flex max-h-[80vh] flex-col gap-2 overflow-y-auto pr-1">
                  {pages.slice(0, 60).map((p) => (
                    <button
                      key={p.pageNumber}
                      type="button"
                      onClick={() => goToPage(p.pageNumber)}
                      className={`rounded-lg border p-1 ${
                        p.pageNumber === currentPage
                          ? "border-[#3159c9] bg-[#eef3ff]"
                          : "border-[#dce3ec] bg-white hover:bg-[#f2f5fa]"
                      }`}
                    >
                      {pdfRef.current ? (
                        <ThumbCanvas
                          pdf={pdfRef.current}
                          pageNumber={p.pageNumber}
                          width={144}
                        />
                      ) : null}
                      <span className="mt-0.5 block text-center text-xs text-neutral-500">
                        {p.pageNumber}
                      </span>
                    </button>
                  ))}
                  {pages.length > 60 ? (
                    <p className="text-xs text-neutral-400">
                      Thumbnails show the first 60 pages.
                    </p>
                  ) : null}
                </div>
              ) : outline.length > 0 ? (
                <div className="max-h-[80vh] overflow-y-auto pr-1">
                  <OutlineTree
                    items={outline}
                    depth={0}
                    onSelect={goToPage}
                  />
                </div>
              ) : (
                <p className="text-sm text-neutral-500">
                  This PDF has no bookmarks.
                </p>
              )}
            </div>
          ) : null}
          {viewMode === "read" ? (
            <div
              ref={readScrollRef}
              className="max-h-[80vh] min-w-0 flex-1 overflow-y-auto"
            >
              <div
                className={
                  readLayout === "facing"
                    ? "grid grid-cols-2 items-start gap-4"
                    : "flex flex-col gap-4"
                }
              >
                {pages.map((p) => (
                  <div
                    key={p.pageNumber}
                    id={`forma-read-page-${p.pageNumber}`}
                    data-page={p.pageNumber}
                  >
                    {pdfRef.current ? (
                      <ReadCanvas
                        pdf={pdfRef.current}
                        pageNumber={p.pageNumber}
                        scale={SCALE * zoom}
                      />
                    ) : null}
                    <p className="mt-1 text-center text-xs text-neutral-400">
                      Page {p.pageNumber}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div
              ref={containerRef}
              className="relative mx-auto w-fit"
          style={
            currentView
              ? {
                  width: currentView.width * zoom,
                  height: currentView.height * zoom,
                }
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
                      top: vy - fontSize * zoom,
                      fontSize: fontSize * zoom,
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
                            strokeWidth={2 * SCALE * zoom}
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
          {/* F26: the marked redaction areas on this page
              (solid boxes — what will be removed), the live
              drag rectangle, and the drag surface. */}
          {viewport
            ? redactRegions
                .filter((r) => r.page === currentPage)
                .map((region, index) => {
                  const [tlx, tly] = toViewport(
                    region.x,
                    region.y + region.height
                  );
                  const [brx, bry] = toViewport(
                    region.x + region.width,
                    region.y
                  );
                  return (
                    <div
                      key={index}
                      style={{
                        position: "absolute",
                        left: Math.min(tlx, brx),
                        top: Math.min(tly, bry),
                        width: Math.abs(brx - tlx),
                        height: Math.abs(bry - tly),
                        background: "rgba(0, 0, 0, 0.85)",
                        border: "1px solid #000",
                        pointerEvents: "none",
                      }}
                    />
                  );
                })
            : null}
          {viewport && liveRect ? (
            (() => {
              const [tlx, tly] = toViewport(
                liveRect.x,
                liveRect.y + liveRect.height
              );
              const [brx, bry] = toViewport(
                liveRect.x + liveRect.width,
                liveRect.y
              );
              return (
                <div
                  style={{
                    position: "absolute",
                    left: Math.min(tlx, brx),
                    top: Math.min(tly, bry),
                    width: Math.abs(brx - tlx),
                    height: Math.abs(bry - tly),
                    background: "rgba(0, 0, 0, 0.4)",
                    border: "1px dashed #000",
                    pointerEvents: "none",
                  }}
                />
              );
            })()
          ) : null}
          {mode === "redact" ? (
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
              onPointerDown={handleRedactDown}
              onPointerMove={handleRedactMove}
              onPointerUp={handleRedactUp}
              onPointerLeave={handleRedactUp}
            />
          ) : null}
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
                      strokeWidth={2 * SCALE * zoom}
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
                    strokeWidth={2 * SCALE * zoom}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null}
              </svg>
            </div>
          ) : null}
            </div>
          )}
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
