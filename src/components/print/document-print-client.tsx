"use client";

// Print view for a reviewed PDF (F31).
//
// Renders every page at print resolution and, optionally,
// the comments list after the document — then the browser's
// own print dialog does the rest (paper or "Save as PDF").
// Print CSS keeps one PDF page per printed sheet and hides
// the controls.
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

interface ListedComment {
  id: string;
  page: number;
  kind: string;
  contents: string;
  author: string;
}

const MAX_PRINT_PAGES = 100;
const PRINT_SCALE = 2;

export function DocumentPrintClient({
  document,
}: {
  document: { id: string; title: string };
}) {
  const [status, setStatus] = useState("Loading the document…");
  const [ready, setReady] = useState(false);
  const [pageTotal, setPageTotal] = useState(0);
  const [comments, setComments] = useState<ListedComment[]>([]);
  const [includeComments, setIncludeComments] = useState(true);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const response = await fetch(
          `/api/documents/${document.id}/download`
        );
        if (!response.ok) throw new Error("Could not download this PDF.");
        const bytes = new Uint8Array(await response.arrayBuffer());
        const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
        if (cancelled) return;
        pdfRef.current = pdf;
        setPageTotal(pdf.numPages);
        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = "";
        const count = Math.min(pdf.numPages, MAX_PRINT_PAGES);
        for (let n = 1; n <= count; n += 1) {
          if (cancelled) return;
          const page = await pdf.getPage(n);
          const viewport = page.getViewport({ scale: PRINT_SCALE });
          const wrapper = window.document.createElement("div");
          wrapper.className = "forma-print-page";
          const canvas = window.document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = "100%";
          canvas.style.height = "auto";
          wrapper.appendChild(canvas);
          container.appendChild(wrapper);
          await page.render({ canvas, viewport }).promise;
        }
        const annotationsResponse = await fetch(
          `/api/documents/${document.id}/pdf/annotations`
        );
        if (annotationsResponse.ok) {
          const data = (await annotationsResponse.json()) as {
            annotations?: ListedComment[];
          };
          if (!cancelled && Array.isArray(data.annotations)) {
            setComments(data.annotations);
          }
        }
        if (!cancelled) {
          setReady(true);
          setStatus(
            pdf.numPages > MAX_PRINT_PAGES
              ? `Showing the first ${MAX_PRINT_PAGES} of ${pdf.numPages} pages — print in parts for the rest.`
              : ""
          );
        }
      } catch (error) {
        if (!cancelled) {
          setStatus(
            error instanceof Error
              ? error.message
              : "Could not load this PDF for printing."
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [document.id]);

  return (
    <main className="mx-auto w-full max-w-3xl p-4">
      <style>{`
        @media print {
          aside, header { display: none !important; }
          .forma-print-page { break-after: page; }
          .forma-print-page:last-child { break-after: auto; }
        }
      `}</style>
      <div className="print:hidden">
        <h1 className="text-lg font-semibold text-[#202b3c]">
          Print — {document.title}
        </h1>
        <p className="mt-1 text-sm text-[#667389]">
          Every page is rendered ready for paper. Use the print button and
          choose your printer, or “Save as PDF” in the print dialog.
          {pageTotal > 0 ? ` ${pageTotal} page${pageTotal === 1 ? "" : "s"}.` : ""}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!ready}
            onClick={() => window.print()}
            className="rounded-lg bg-[#3159c9] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Print / Save as PDF
          </button>
          <label className="flex items-center gap-1 text-sm text-[#202b3c]">
            <input
              type="checkbox"
              checked={includeComments}
              onChange={(event) => setIncludeComments(event.target.checked)}
            />
            Include the comments list ({comments.length})
          </label>
        </div>
        {status ? (
          <p className="mt-2 text-sm text-[#667389]">{status}</p>
        ) : null}
      </div>
      <div ref={containerRef} className="mt-4 space-y-4 print:space-y-0" />
      {ready && includeComments && comments.length > 0 ? (
        <section className="forma-print-page mt-6">
          <h2 className="text-base font-semibold text-[#202b3c]">
            Comments on “{document.title}”
          </h2>
          <ul className="mt-2 space-y-2">
            {comments.map((comment) => (
              <li
                key={comment.id}
                className="rounded-lg border border-[#dce3ec] p-3 print:border-black/30"
              >
                <p className="text-xs text-[#667389]">
                  Page {comment.page} · {comment.kind} · {comment.author}
                </p>
                <p className="mt-1 text-sm break-words text-[#202b3c]">
                  {comment.contents || "(no text)"}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
