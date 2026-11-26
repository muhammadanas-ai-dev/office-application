// PDF draw UI (Day 19, part 2) — client component.
//
// The PDF renders in the browser with PDF.js. The user drags a
// rectangle to crop a page, add a hyperlink or draw a shape, or
// clicks a point to add text. Every change goes to its API route
// and creates a new version — the original file is never
// overwritten. Errors come from the route's JSON error message,
// so the user always sees a real reason, never a generic failure.
//
// pdfjs-dist is imported DYNAMICALLY inside the load effect (a
// static import breaks SSR with `ReferenceError: DOMMatrix is not
// defined` — the pdf-edit page still has that pre-existing gap).
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDraftAutosave } from "@/components/drafts/use-draft-autosave";
import { draftStorageKey } from "@/lib/draft-autosave";
import { useRouter } from "next/navigation";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import type { PageViewport } from "pdfjs-dist/types/src/display/display_utils";
import Link from "next/link";

interface PdfDrawClientProps {
  document: { id: string; title: string; version: number };
  pageCount: number | null;
  userFonts?: { id: string; name: string; isFavourite: boolean }[];
  userId: string;
  images?: { id: string; title: string }[];
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
const labelClass = "mb-1 block text-xs font-medium text-[#202b3c]";

const SCALE = 1.5;

type Mode = "crop" | "link" | "text" | "shape" | "image";
type ShapeKind = "rectangle" | "ellipse" | "line";
type DrawColor = "black" | "grey" | "red" | "green" | "blue";
type DrawFont = "helvetica" | "times" | "courier";

type DragRect = { x1: number; y1: number; x2: number; y2: number };

type PageSize = {
  pageNumber: number;
  width: number;
  height: number;
};

const COLOR_LABEL: Record<DrawColor, string> = {
  black: "Black",
  grey: "Grey",
  red: "Red",
  green: "Green",
  blue: "Blue",
};

const COLOR_HEX: Record<DrawColor, string> = {
  black: "#000000",
  grey: "#666666",
  red: "#ff0000",
  green: "#009900",
  blue: "#0000ff",
};

export function PdfDrawClient({ document, pageCount, userFonts = [], userId, images = [] }: PdfDrawClientProps) {
  const router = useRouter();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [pages, setPages] = useState<PageSize[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [viewport, setViewport] = useState<PageViewport | null>(null);
  const [mode, setMode] = useState<Mode>("crop");
  // The drag in progress (PDF points), in state so the overlay
  // re-renders as the rectangle is dragged.
  const [liveDrag, setLiveDrag] = useState<DragRect | null>(null);
  // The completed drag (PDF points) — the rectangle the tool
  // acts on.
  const [dragRect, setDragRect] = useState<DragRect | null>(null);
  // The click point for text mode (PDF points).
  const [textPoint, setTextPoint] = useState<{ x: number; y: number } | null>(
    null
  );
  // The click point + form for image mode (F38).
  const [imagePoint, setImagePoint] = useState<{ x: number; y: number } | null>(
    null
  );
  const [imageId, setImageId] = useState("");
  const [imageWidth, setImageWidth] = useState("200");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const dragging = useRef(false);

  // Crop form.
  const [cropScope, setCropScope] = useState<"this" | "all">("this");
  // Link form.
  const [linkUrl, setLinkUrl] = useState("");
  // Text form.
  const [textInput, setTextInput] = useState("");
  // Draft auto-save (F35) for the Add-text box.
  const {
    restoredAt: textRestoredAt,
    clear: clearTextDraft,
  } = useDraftAutosave({
    storageKey: draftStorageKey(userId, document.id, "draw-text"),
    value: textInput,
    onRestore: setTextInput,
  });
  const [textSize, setTextSize] = useState("14");
  const [textFont, setTextFont] = useState<string>("helvetica");
  const [textColor, setTextColor] = useState<DrawColor>("black");
  // Shape form.
  const [shapeKind, setShapeKind] = useState<ShapeKind>("rectangle");
  const [shapeColor, setShapeColor] = useState<DrawColor>("blue");
  const [shapeFilled, setShapeFilled] = useState(true);

  const totalPages = pageCount ?? pages.length;

  // Load the PDF (bytes) and each page's size.
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
        const views: PageSize[] = [];
        for (let n = 1; n <= pdf.numPages; n += 1) {
          const page = await pdf.getPage(n);
          const vp = page.getViewport({ scale: SCALE });
          views.push({ pageNumber: n, width: vp.width, height: vp.height });
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

  const reload = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    setPages([]);
    setLiveDrag(null);
    setDragRect(null);
    setTextPoint(null);
    dragging.current = false;
    setReloadKey((k) => k + 1);
    router.refresh();
  }, [router]);

  function switchMode(next: Mode) {
    setMode(next);
    setLiveDrag(null);
    setDragRect(null);
    setTextPoint(null);
    setImagePoint(null);
    dragging.current = false;
  }

  function switchPage(next: number) {
    if (next < 1 || next > totalPages) return;
    setCurrentPage(next);
    setLiveDrag(null);
    setDragRect(null);
    setTextPoint(null);
    setImagePoint(null);
    dragging.current = false;
  }

  // Convert a pointer event to a PDF point (in PDF points).
  function pointerToPdf(event: React.PointerEvent): [number, number] | null {
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

  // Convert a PDF point to the overlay's CSS coordinates.
  function toViewport(x: number, y: number): [number, number] {
    if (!viewport) return [0, 0];
    const [vx, vy] = viewport.convertToViewportPoint(x, y);
    return [vx, vy];
  }

  // Dragging a rectangle (crop / link / shape modes).
  function handleDragDown(event: React.PointerEvent) {
    if (mode === "text" || mode === "image") return;
    const point = pointerToPdf(event);
    if (!point) return;
    dragging.current = true;
    setLiveDrag({ x1: point[0], y1: point[1], x2: point[0], y2: point[1] });
    setDragRect(null);
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  }

  function handleDragMove(event: React.PointerEvent) {
    if (mode === "text" || mode === "image" || !dragging.current) return;
    const point = pointerToPdf(event);
    if (!point) return;
    setLiveDrag((drag) =>
      drag ? { ...drag, x2: point[0], y2: point[1] } : null
    );
  }

  function handleDragUp() {
    if (mode === "text" || mode === "image" || !dragging.current) return;
    dragging.current = false;
    setLiveDrag((drag) => {
      if (drag && (drag.x1 !== drag.x2 || drag.y1 !== drag.y2)) {
        setDragRect(drag);
      }
      return null;
    });
  }

  // A click in "Text" mode places the text at that point;
  // in "Image" mode it places the image's bottom-left corner.
  function handlePageClick(event: React.MouseEvent) {
    if (mode !== "text" && mode !== "image") return;
    const point = pointerToPdf(event as unknown as React.PointerEvent);
    if (!point) return;
    if (mode === "text") {
      setTextPoint({ x: point[0], y: point[1] });
    } else {
      setImagePoint({ x: point[0], y: point[1] });
    }
    setDragRect(null);
  }

  async function postDraw(
    url: string,
    body: Record<string, unknown>,
    successMessage: string,
    onSuccess?: () => void
  ) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: unknown;
        version?: unknown;
      };
      if (!response.ok) {
        throw new Error(
          typeof data.error === "string" && data.error
            ? data.error
            : "This operation failed."
        );
      }
      setMessage(
        `${successMessage} — saved as version ${data.version}. The original file is untouched.`
      );
      setDragRect(null);
      setTextPoint(null);
      onSuccess?.();
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "This operation failed.");
    } finally {
      setBusy(false);
    }
  }

  const currentView = pages.find((p) => p.pageNumber === currentPage);

  // The rectangle to draw on the overlay (the live drag, or the
  // completed drag), in CSS coordinates.
  const overlayRect = liveDrag ?? dragRect;
  let overlayBox: {
    left: number;
    top: number;
    width: number;
    height: number;
  } | null = null;
  if (overlayRect && viewport) {
    const [x1, y1] = toViewport(overlayRect.x1, overlayRect.y1);
    const [x2, y2] = toViewport(overlayRect.x2, overlayRect.y2);
    overlayBox = {
      left: Math.min(x1, x2),
      top: Math.min(y1, y2),
      width: Math.abs(x2 - x1),
      height: Math.abs(y2 - y1),
    };
  }

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
        <h1 className="text-xl font-semibold text-[#202b3c]">
          Draw on PDF — {document.title}
        </h1>
        <p role="alert" className="mt-2 text-sm text-[#b3261e]">
          {loadError}
        </p>
        <p className="mt-2 text-sm text-[#667389]">
          <Link href="/files" className="text-[#3159c9] hover:underline">
            Back to files
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold text-[#202b3c]">
          Draw on PDF — {document.title}
        </h1>
        <p className="mt-1 text-sm text-[#667389]">
          Crop a page, add a hyperlink, add text, or draw a shape. Every change
          saves a new version — the original file is untouched.{" "}
          <Link href="/files" className="text-[#3159c9] hover:underline">
            Back to files
          </Link>
        </p>
      </div>

      {message ? (
        <p className="mt-3 text-sm text-[#1a7f37]">{message}</p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-[#b3261e]">
          {error}
        </p>
      ) : null}

      <div className={`${sectionClass} mt-4`}>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => switchMode("crop")}
            className={toolButtonClass(mode === "crop")}
          >
            Crop
          </button>
          <button
            type="button"
            onClick={() => switchMode("link")}
            className={toolButtonClass(mode === "link")}
          >
            Hyperlink
          </button>
          <button
            type="button"
            onClick={() => switchMode("text")}
            className={toolButtonClass(mode === "text")}
          >
            Add text
          </button>
          <button
            type="button"
            onClick={() => switchMode("shape")}
            className={toolButtonClass(mode === "shape")}
          >
            Shape
          </button>
          <button
            type="button"
            onClick={() => switchMode("image")}
            className={toolButtonClass(mode === "image")}
          >
            Insert image
          </button>
          <span className="ml-auto text-sm text-[#667389]">
            Page {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => switchPage(currentPage - 1)}
            className="text-sm text-[#3159c9] hover:underline disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => switchPage(currentPage + 1)}
            className="text-sm text-[#3159c9] hover:underline disabled:opacity-40"
          >
            Next
          </button>
        </div>
        <p className="mt-2 text-xs text-[#667389]">
          {mode === "crop"
            ? "Drag a rectangle over the part of the page to keep, then crop it."
            : mode === "link"
              ? "Drag a rectangle over the clickable area, then enter the web address."
              : mode === "text"
                ? "Click where the text should start, then write it."
                : mode === "image"
                  ? "Click where the image's bottom-left corner should go, then choose the image and its width."
                  : "Drag a rectangle for the shape, then choose the shape and colour."}
        </p>
      </div>

      {mode === "image" && imagePoint ? (
        <div className={`${sectionClass} mt-4`}>
          <p className="text-sm">
            Insert an image at ({Math.round(imagePoint.x)},{" "}
            {Math.round(imagePoint.y)}) on page {currentPage} — the point is
            the image&apos;s bottom-left corner, and the height follows the
            image&apos;s shape. The image must fit fully on the page.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              aria-label="Image to insert"
              value={imageId}
              onChange={(e) => setImageId(e.target.value)}
              className={`${inputClass} max-w-xs`}
            >
              <option value="">Choose an image…</option>
              {images.map((image) => (
                <option key={image.id} value={image.id}>
                  {image.title}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-sm text-[#667389]">
              Width (pt)
              <input
                type="number"
                min={10}
                value={imageWidth}
                onChange={(e) => setImageWidth(e.target.value)}
                className={`${inputClass} w-20`}
              />
            </label>
            <button
              type="button"
              disabled={busy || !imageId}
              onClick={() =>
                postDraw(
                  `/api/documents/${document.id}/pdf/insert-image`,
                  {
                    imageDocumentId: imageId,
                    page: currentPage,
                    x: imagePoint.x,
                    y: imagePoint.y,
                    width: Number(imageWidth),
                  },
                  "Image inserted"
                )
              }
              className={buttonClass}
            >
              Insert image
            </button>
            <button
              type="button"
              onClick={() => setImagePoint(null)}
              className="text-sm text-neutral-500 hover:underline"
            >
              Clear point
            </button>
          </div>
          {images.length === 0 ? (
            <p className="mt-2 text-xs text-[#667389]">
              No images in this workspace yet — upload a PNG, JPEG, WEBP or
              TIFF to the library first.
            </p>
          ) : null}
        </div>
      ) : null}

      {mode === "crop" && dragRect ? (
        <div className={`${sectionClass} mt-4`}>
          <p className="text-sm">
            Crop rectangle on page {currentPage} — crop this page, or every page
            to the same rectangle.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <select
              value={cropScope}
              onChange={(e) => setCropScope(e.target.value as "this" | "all")}
              className={`${inputClass} max-w-xs`}
            >
              <option value="this">This page only</option>
              <option value="all">All pages</option>
            </select>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                postDraw(
                  `/api/documents/${document.id}/pdf/crop`,
                  {
                    pages:
                      cropScope === "all"
                        ? Array.from({ length: totalPages }, (_, i) => i + 1)
                        : [currentPage],
                    rect: dragRect,
                  },
                  "Pages cropped"
                )
              }
              className={buttonClass}
            >
              Crop
            </button>
            <button
              type="button"
              onClick={() => setDragRect(null)}
              className="text-sm text-neutral-500 hover:underline"
            >
              Clear rectangle
            </button>
          </div>
        </div>
      ) : null}

      {mode === "link" && dragRect ? (
        <div className={`${sectionClass} mt-4`}>
          <p className="text-sm">
            Hyperlink on page {currentPage} — enter the web address for the
            rectangle you dragged.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://example.com"
              className={inputClass}
              autoComplete="off"
            />
            <button
              type="button"
              disabled={busy || !linkUrl.trim()}
              onClick={() =>
                postDraw(
                  `/api/documents/${document.id}/pdf/links`,
                  { page: currentPage, rect: dragRect, url: linkUrl.trim() },
                  "Hyperlink added"
                )
              }
              className={buttonClass}
            >
              Add link
            </button>
            <button
              type="button"
              onClick={() => setDragRect(null)}
              className="text-sm text-neutral-500 hover:underline"
            >
              Clear rectangle
            </button>
          </div>
        </div>
      ) : null}

      {mode === "text" && textPoint ? (
        <div className={`${sectionClass} mt-4`}>
          <p className="text-sm">
            Text on page {currentPage} — the text starts where you clicked.
          </p>
          <div className="mt-3 space-y-2">
            <div>
              <label htmlFor="draw-text" className={labelClass}>
                Text
              </label>
              <input
                id="draw-text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                maxLength={500}
                placeholder="Write the text…"
                className={inputClass}
              />
              {textRestoredAt ? (
                <p className="mt-1 text-xs text-neutral-500">
                  Draft restored from{" "}
                  {new Date(textRestoredAt).toLocaleString("en-GB")}.
                </p>
              ) : null}
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label htmlFor="draw-text-font" className={labelClass}>
                  Font
                </label>
                <select
                  id="draw-text-font"
                  value={textFont}
                  onChange={(e) => setTextFont(e.target.value)}
                  className={inputClass}
                >
                  <option value="helvetica">Helvetica</option>
                  <option value="times">Times</option>
                  <option value="courier">Courier</option>
                  {userFonts.length > 0 ? (
                    <optgroup label="Your fonts">
                      {userFonts.map((font) => (
                        <option key={font.id} value={`custom:${font.id}`}>
                          {font.isFavourite ? "★ " : ""}
                          {font.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
              </div>
              <div className="flex-1">
                <label htmlFor="draw-text-size" className={labelClass}>
                  Size (pt)
                </label>
                <input
                  id="draw-text-size"
                  value={textSize}
                  onChange={(e) => setTextSize(e.target.value)}
                  inputMode="numeric"
                  className={inputClass}
                  autoComplete="off"
                />
              </div>
              <div className="flex-1">
                <label htmlFor="draw-text-color" className={labelClass}>
                  Colour
                </label>
                <select
                  id="draw-text-color"
                  value={textColor}
                  onChange={(e) => setTextColor(e.target.value as DrawColor)}
                  className={inputClass}
                >
                  {(Object.keys(COLOR_LABEL) as DrawColor[]).map((c) => (
                    <option key={c} value={c}>
                      {COLOR_LABEL[c]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={busy || !textInput.trim()}
                onClick={() =>
                  postDraw(
                    `/api/documents/${document.id}/pdf/add-text`,
                    {
                      page: currentPage,
                      x: textPoint.x,
                      y: textPoint.y,
                      text: textInput.trim(),
                      size: Number(textSize),
                      font: textFont.startsWith("custom:")
                        ? "custom"
                        : textFont,
                      fontId: textFont.startsWith("custom:")
                        ? textFont.slice("custom:".length)
                        : undefined,
                      color: textColor,
                    },
                    "Text added",
                    clearTextDraft
                  )
                }
                className={buttonClass}
              >
                Add text
              </button>
              <button
                type="button"
                onClick={() => setTextPoint(null)}
                className="text-sm text-neutral-500 hover:underline"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {mode === "shape" && dragRect ? (
        <div className={`${sectionClass} mt-4`}>
          <p className="text-sm">
            Shape on page {currentPage} — choose the shape and colour for the
            rectangle you dragged. A line runs from where you started dragging
            to where you stopped.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <select
              value={shapeKind}
              onChange={(e) => setShapeKind(e.target.value as ShapeKind)}
              className={`${inputClass} max-w-[10rem]`}
            >
              <option value="rectangle">Rectangle</option>
              <option value="ellipse">Ellipse</option>
              <option value="line">Line</option>
            </select>
            <select
              value={shapeColor}
              onChange={(e) => setShapeColor(e.target.value as DrawColor)}
              className={`${inputClass} max-w-[8rem]`}
            >
              {(Object.keys(COLOR_LABEL) as DrawColor[]).map((c) => (
                <option key={c} value={c}>
                  {COLOR_LABEL[c]}
                </option>
              ))}
            </select>
            {shapeKind !== "line" ? (
              <label className="flex items-center gap-1 text-sm text-[#202b3c]">
                <input
                  type="checkbox"
                  checked={shapeFilled}
                  onChange={(e) => setShapeFilled(e.target.checked)}
                />
                Filled
              </label>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                postDraw(
                  `/api/documents/${document.id}/pdf/add-shape`,
                  {
                    page: currentPage,
                    shape: shapeKind,
                    rect: dragRect,
                    color: shapeColor,
                    filled: shapeFilled,
                  },
                  "Shape added"
                )
              }
              className={buttonClass}
            >
              Add shape
            </button>
            <button
              type="button"
              onClick={() => setDragRect(null)}
              className="text-sm text-neutral-500 hover:underline"
            >
              Clear rectangle
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
          onClick={handlePageClick}
        >
          <canvas ref={canvasRef} className="block" />
          {/* The drag surface (crop / link / shape modes) and the
              live / completed rectangle, drawn in viewport
              coordinates. */}
          {mode !== "text" ? (
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
              onPointerDown={handleDragDown}
              onPointerMove={handleDragMove}
              onPointerUp={handleDragUp}
              onPointerLeave={handleDragUp}
            >
              {overlayBox ? (
                mode === "shape" && shapeKind === "line" ? (
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
                    <line
                      x1={overlayBox.left}
                      y1={overlayBox.top + overlayBox.height}
                      x2={overlayBox.left + overlayBox.width}
                      y2={overlayBox.top}
                      stroke={COLOR_HEX[shapeColor]}
                      strokeWidth={2 * SCALE}
                      strokeLinecap="round"
                    />
                  </svg>
                ) : (
                  <div
                    style={{
                      position: "absolute",
                      left: overlayBox.left,
                      top: overlayBox.top,
                      width: overlayBox.width,
                      height: overlayBox.height,
                      border: `2px dashed ${mode === "crop" ? "#3159c9" : COLOR_HEX[mode === "shape" ? shapeColor : "blue"]}`,
                      background:
                        mode === "crop"
                          ? "rgba(49, 89, 201, 0.08)"
                          : "rgba(0, 0, 255, 0.08)",
                      pointerEvents: "none",
                    }}
                  />
                )
              ) : null}
            </div>
          ) : null}
          {/* The click point for text mode. */}
          {mode === "text" && textPoint && viewport ? (
            <div
              style={{
                position: "absolute",
                left: toViewport(textPoint.x, textPoint.y)[0] - 4,
                top: toViewport(textPoint.x, textPoint.y)[1] - 4,
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#3159c9",
                pointerEvents: "none",
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
