// PDF edit UI (Phase B, feature 3) — client component.
//
// The PDF renders in the browser with PDF.js. Text runs and images
// are clickable overlays on each page: click a text run to edit
// it, click an image to replace it. Pages can be deleted or
// reordered. Every edit goes to its API route and creates a new
// version — the original file is never overwritten. Errors come
// from the route's JSON error message, so the user always sees a
// real reason, never a generic failure.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import Link from "next/link";
import type { PdfImageInfo } from "@/lib/pdf-edit";

// The worker is served from public/ (copied from pdfjs-dist at
// install time). Pointing PDF.js at it avoids the bundler having
// to treat the worker as a module.
pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

interface PdfEditClientProps {
  document: { id: string; title: string; version: number };
  pageCount: number | null;
  images: PdfImageInfo[];
}

const sectionClass = "rounded-xl border border-[#dce3ec] bg-white p-4";
const inputClass =
  "h-9 w-full rounded-lg border border-[#dce3ec] bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3159c9]";
const buttonClass =
  "inline-flex h-9 items-center rounded-lg bg-[#3159c9] px-3 text-sm font-medium text-white hover:bg-[#2a4cab] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3159c9] disabled:opacity-60";
const labelClass = "mb-1 block text-xs font-medium text-[#202b3c]";

interface TextSelection {
  page: number;
  text: string;
  x: number;
  y: number;
  fontSize: number;
}

interface ImageSelection {
  page: number;
  index: number;
  name: string;
}

interface PageView {
  pageNumber: number;
  width: number;
  height: number;
  items: TextItem[];
}

const SCALE = 1.5;

export function PdfEditClient({
  document,
  pageCount,
  images,
}: PdfEditClientProps) {
  const router = useRouter();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pages, setPages] = useState<PageView[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedText, setSelectedText] = useState<TextSelection | null>(null);
  const [replacement, setReplacement] = useState("");
  const [selectedImage, setSelectedImage] = useState<ImageSelection | null>(
    null
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [order, setOrder] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canvasRefs = useRef(new Map<number, HTMLCanvasElement | null>());
  const pdfRef = useRef<PDFDocumentProxy | null>(null);

  // Load the PDF (bytes) and extract each page's text items.
  // The view is reset in reload(), not here, so this effect never
  // sets state synchronously (no cascading renders).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/documents/${document.id}/download`);
        if (!response.ok) throw new Error("Could not download this PDF.");
        const bytes = new Uint8Array(await response.arrayBuffer());
        const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
        if (cancelled) return;
        pdfRef.current = pdf;
        const views: PageView[] = [];
        for (let n = 1; n <= pdf.numPages; n += 1) {
          const page = await pdf.getPage(n);
          const viewport = page.getViewport({ scale: SCALE });
          const textContent = await page.getTextContent();
          views.push({
            pageNumber: n,
            width: viewport.width,
            height: viewport.height,
            items: textContent.items.filter(
              (item): item is TextItem =>
                "str" in item && item.str.trim().length > 0
            ),
          });
        }
        if (cancelled) return;
        setPages(views);
        setOrder(views.map((v) => v.pageNumber));
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
    setSelectedText(null);
    setSelectedImage(null);
    setReloadKey((k) => k + 1);
    router.refresh();
  }, [router]);

  async function postJson(
    url: string,
    body: unknown
  ): Promise<{ version: number }> {
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
    if (typeof data.version !== "number")
      throw new Error("The server did not return a version.");
    return { version: data.version };
  }

  async function submitTextEdit() {
    if (!selectedText || !replacement.trim()) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const { version } = await postJson(
        `/api/documents/${document.id}/pdf/edit-text`,
        {
          page: selectedText.page,
          text: selectedText.text,
          replacement: replacement.trim(),
          position: {
            x: selectedText.x,
            y: selectedText.y,
            fontSize: selectedText.fontSize,
          },
        }
      );
      setMessage(
        `Text updated — saved as version ${version}. The original file is untouched.`
      );
      setSelectedText(null);
      setReplacement("");
      reload();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not edit this text."
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitImageReplace() {
    if (!selectedImage || !imageFile) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const form = new FormData();
      form.set("page", String(selectedImage.page));
      form.set("imageIndex", String(selectedImage.index));
      form.set("file", imageFile);
      const response = await fetch(
        `/api/documents/${document.id}/pdf/edit-image`,
        {
          method: "POST",
          body: form,
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
            : "Could not replace this image."
        );
      }
      setMessage(
        `Image replaced — saved as version ${data.version}. The original file is untouched.`
      );
      setSelectedImage(null);
      setImageFile(null);
      reload();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not replace this image."
      );
    } finally {
      setBusy(false);
    }
  }

  async function deletePage(pageNumber: number) {
    if (
      !window.confirm(
        `Delete page ${pageNumber} from this PDF? This creates a new version — the original is kept.`
      )
    )
      return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const { version } = await postJson(
        `/api/documents/${document.id}/pdf/edit-pages`,
        {
          action: "delete",
          pages: [pageNumber],
        }
      );
      setMessage(`Page ${pageNumber} deleted — saved as version ${version}.`);
      reload();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not delete this page."
      );
    } finally {
      setBusy(false);
    }
  }

  function movePage(pageNumber: number, direction: -1 | 1) {
    const idx = order.indexOf(pageNumber);
    const swap = idx + direction;
    if (idx < 0 || swap < 0 || swap >= order.length) return;
    const next = [...order];
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setOrder(next);
  }

  async function applyOrder() {
    if (order.length < 2) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const { version } = await postJson(
        `/api/documents/${document.id}/pdf/edit-pages`,
        {
          action: "reorder",
          order,
        }
      );
      setMessage(`Pages reordered — saved as version ${version}.`);
      reload();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not reorder these pages."
      );
    } finally {
      setBusy(false);
    }
  }

  const orderChanged = order.length > 0 && order.some((p, i) => p !== i + 1);

  /** Convert a PDF user-space point to canvas (CSS) coordinates. */
  function toCanvas(
    view: PageView,
    x: number,
    y: number
  ): { left: number; top: number } {
    return { left: x * SCALE, top: view.height - y * SCALE };
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-semibold text-[#202b3c]">Edit PDF</h1>
        <span className="text-sm text-[#5b6b7f]">{document.title}</span>
        <span className="rounded-full bg-[#e8edf5] px-2 py-0.5 text-xs text-[#5b6b7f]">
          Version {document.version}
        </span>
        <Link
          href={`/documents/${document.id}/pdf-tools`}
          className="text-sm text-[#3159c9] underline"
        >
          PDF tools
        </Link>
        <Link href="/files" className="text-sm text-[#3159c9] underline">
          Back to files
        </Link>
      </div>
      <p className="max-w-2xl text-sm text-[#5b6b7f]">
        Click a line of text to edit it, or click an image to replace it. Every
        edit is saved as a new version — the original file is never changed. The
        replacement text sits where the old text was; it does not reflow the
        page.
      </p>
      {message && (
        <p className="rounded-lg border border-[#bfe3c0] bg-[#eef7ee] px-3 py-2 text-sm text-[#2c5a2e]">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-lg border border-[#f3c2c2] bg-[#fdf0f0] px-3 py-2 text-sm text-[#8c2f2f]">
          {error}
        </p>
      )}
      {loadError && (
        <p className="rounded-lg border border-[#f3c2c2] bg-[#fdf0f0] px-3 py-2 text-sm text-[#8c2f2f]">
          {loadError}
        </p>
      )}
      {loading && <p className="text-sm text-[#5b6b7f]">Opening the PDF…</p>}

      {!loading && pages.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          {/* Pages */}
          <div className="space-y-6">
            {pages.map((view) => (
              <div key={view.pageNumber} className={sectionClass}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-[#202b3c]">
                    Page {view.pageNumber}
                  </span>
                  <span className="text-xs text-[#5b6b7f]">
                    {pageCount ? `of ${pageCount}` : ""}
                  </span>
                </div>
                <div
                  className="relative mx-auto overflow-hidden rounded border border-[#dce3ec] bg-white"
                  style={{
                    width: view.width,
                    height: view.height,
                    maxWidth: "100%",
                  }}
                >
                  <canvas
                    ref={(el) => {
                      canvasRefs.current.set(view.pageNumber, el);
                    }}
                    style={{ width: view.width, height: view.height }}
                  />
                  {/* Text overlays */}
                  {view.items.map((item, i) => {
                    const [a, b, , , e, f] = item.transform;
                    const fontSize = Math.hypot(a, b);
                    const pos = toCanvas(view, e, f);
                    const isSelected =
                      selectedText?.page === view.pageNumber &&
                      selectedText.text === item.str &&
                      Math.abs(selectedText.x - e) < 1 &&
                      Math.abs(selectedText.y - f) < 1;
                    return (
                      <button
                        key={i}
                        type="button"
                        title={item.str}
                        onClick={() => {
                          setSelectedText({
                            page: view.pageNumber,
                            text: item.str,
                            x: e,
                            y: f,
                            fontSize,
                          });
                          setReplacement(item.str);
                          setSelectedImage(null);
                          setError(null);
                        }}
                        className={`absolute rounded-sm ${isSelected ? "bg-[#3159c9]/30 outline outline-2 outline-[#3159c9]" : "hover:bg-[#3159c9]/15"}`}
                        style={{
                          left: pos.left,
                          top: pos.top - item.height * SCALE,
                          width: Math.max(item.width * SCALE, 4),
                          height: Math.max(item.height * SCALE, 8),
                        }}
                      />
                    );
                  })}
                  {/* Image overlays */}
                  {images
                    .filter((img) => img.page === view.pageNumber)
                    .map((img) => {
                      const topLeft = toCanvas(view, img.x, img.y + img.height);
                      const isSelected =
                        selectedImage?.page === img.page &&
                        selectedImage.index === img.index;
                      return (
                        <button
                          key={img.name}
                          type="button"
                          title={`Image ${img.index + 1} — click to replace`}
                          onClick={() => {
                            setSelectedImage({
                              page: img.page,
                              index: img.index,
                              name: img.name,
                            });
                            setSelectedText(null);
                            setError(null);
                          }}
                          className={`absolute rounded-sm border-2 ${isSelected ? "border-[#3159c9] bg-[#3159c9]/20" : "border-dashed border-[#3159c9]/60 hover:bg-[#3159c9]/10"}`}
                          style={{
                            left: topLeft.left,
                            top: topLeft.top,
                            width: img.width * SCALE,
                            height: img.height * SCALE,
                          }}
                        />
                      );
                    })}
                </div>
              </div>
            ))}
          </div>

          {/* Side panel */}
          <div className="space-y-4">
            <div className={sectionClass}>
              <h2 className="mb-2 text-sm font-semibold text-[#202b3c]">
                Edit text
              </h2>
              {selectedText ? (
                <div className="space-y-2">
                  <p className="text-xs text-[#5b6b7f]">
                    Page {selectedText.page} — “{selectedText.text}”
                  </p>
                  <label className={labelClass} htmlFor="replacement">
                    Replacement text
                  </label>
                  <input
                    id="replacement"
                    className={inputClass}
                    value={replacement}
                    maxLength={500}
                    onChange={(e) => setReplacement(e.target.value)}
                  />
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={busy || !replacement.trim()}
                    onClick={submitTextEdit}
                  >
                    {busy ? "Saving…" : "Save text edit"}
                  </button>
                  <button
                    type="button"
                    className="ml-2 text-sm text-[#5b6b7f] underline"
                    onClick={() => {
                      setSelectedText(null);
                      setReplacement("");
                    }}
                  >
                    Clear
                  </button>
                </div>
              ) : (
                <p className="text-sm text-[#5b6b7f]">
                  Click a line of text on a page to edit it.
                </p>
              )}
            </div>

            <div className={sectionClass}>
              <h2 className="mb-2 text-sm font-semibold text-[#202b3c]">
                Replace image
              </h2>
              {selectedImage ? (
                <div className="space-y-2">
                  <p className="text-xs text-[#5b6b7f]">
                    Page {selectedImage.page}, image {selectedImage.index + 1}.
                    The new image fills the same frame.
                  </p>
                  <label className={labelClass} htmlFor="image-file">
                    New image (PNG or JPEG, up to 10 MB)
                  </label>
                  <input
                    id="image-file"
                    type="file"
                    accept="image/png,image/jpeg"
                    className={inputClass}
                    onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                  />
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={busy || !imageFile}
                    onClick={submitImageReplace}
                  >
                    {busy ? "Saving…" : "Replace image"}
                  </button>
                  <button
                    type="button"
                    className="ml-2 text-sm text-[#5b6b7f] underline"
                    onClick={() => {
                      setSelectedImage(null);
                      setImageFile(null);
                    }}
                  >
                    Clear
                  </button>
                </div>
              ) : (
                <p className="text-sm text-[#5b6b7f]">
                  {images.length > 0
                    ? "Click a dashed image frame on a page to replace that image."
                    : "This PDF has no images to replace."}
                </p>
              )}
            </div>

            <div className={sectionClass}>
              <h2 className="mb-2 text-sm font-semibold text-[#202b3c]">
                Pages
              </h2>
              <ol className="space-y-1">
                {order.map((pageNumber, idx) => (
                  <li
                    key={pageNumber}
                    className="flex items-center gap-2 rounded-lg border border-[#dce3ec] px-2 py-1.5 text-sm"
                  >
                    <span className="w-6 text-[#5b6b7f]">{idx + 1}.</span>
                    <span className="flex-1">Page {pageNumber}</span>
                    <button
                      type="button"
                      aria-label={`Move page ${pageNumber} up`}
                      disabled={busy || idx === 0}
                      onClick={() => movePage(pageNumber, -1)}
                      className="rounded px-1.5 py-0.5 text-[#3159c9] hover:bg-[#e8edf5] disabled:opacity-40"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`Move page ${pageNumber} down`}
                      disabled={busy || idx === order.length - 1}
                      onClick={() => movePage(pageNumber, 1)}
                      className="rounded px-1.5 py-0.5 text-[#3159c9] hover:bg-[#e8edf5] disabled:opacity-40"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete page ${pageNumber}`}
                      disabled={busy || order.length <= 1}
                      onClick={() => deletePage(pageNumber)}
                      className="rounded px-1.5 py-0.5 text-[#8c2f2f] hover:bg-[#fdf0f0] disabled:opacity-40"
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ol>
              {orderChanged && (
                <button
                  type="button"
                  className={`${buttonClass} mt-2`}
                  disabled={busy}
                  onClick={applyOrder}
                >
                  {busy ? "Saving…" : "Apply new page order"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
