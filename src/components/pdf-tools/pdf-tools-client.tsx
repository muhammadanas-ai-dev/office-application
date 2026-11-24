// PDF tools forms (Phase B, feature 2) — client component.
//
// Each tool POSTs JSON to its API route and downloads the returned
// PDF. Errors come from the route's JSON error message, so the user
// always sees a real reason, never a generic failure.
"use client";

import { useState } from "react";
import Link from "next/link";

interface PdfToolsClientProps {
  document: { id: string; title: string };
  pageCount: number | null;
  otherPdfs: { id: string; title: string }[];
}

const sectionClass = "rounded-xl border border-[#dce3ec] bg-white p-4";
const inputClass =
  "h-9 w-full rounded-lg border border-[#dce3ec] bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3159c9]";
const buttonClass =
  "inline-flex h-9 items-center rounded-lg bg-[#3159c9] px-3 text-sm font-medium text-white hover:bg-[#2a4cab] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3159c9] disabled:opacity-60";
const labelClass = "mb-1 block text-xs font-medium text-[#202b3c]";

function filenameFromDisposition(header: string | null): string {
  if (!header) return "result.pdf";
  const utf8 = header.match(/filename\*=UTF-8''([^;]+)/);
  if (utf8) {
    try {
      return decodeURIComponent(utf8[1]);
    } catch {
      // Fall through to the ASCII filename.
    }
  }
  const ascii = header.match(/filename="([^"]+)"/);
  if (ascii) return ascii[1];
  return "result.pdf";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** POST JSON to a PDF-tools route and download the returned PDF. */
async function runTool(
  url: string,
  body: unknown
): Promise<{ fileName: string; savedBytes: number | null }> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    let message = "This operation failed.";
    try {
      const data = (await response.json()) as { error?: unknown };
      if (typeof data.error === "string" && data.error) message = data.error;
    } catch {
      // Keep the generic message.
    }
    throw new Error(message);
  }
  const blob = await response.blob();
  const fileName = filenameFromDisposition(
    response.headers.get("Content-Disposition")
  );
  const savedHeader = response.headers.get("X-Forma-Compress-Saved-Bytes");
  const savedBytes = savedHeader ? Number(savedHeader) : null;
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  return { fileName, savedBytes };
}

/** POST JSON to a PDF-tools route that saves a new version in the
 *  library (instead of downloading a file). Returns the new version
 *  number. */
async function runVersionTool(
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

/** POST a FormData body to a PDF-tools route that saves a new
 *  version in the library (instead of downloading a file).
 *  Returns the new version number. */
async function runVersionToolForm(
  url: string,
  form: FormData
): Promise<{ version: number }> {
  const response = await fetch(url, { method: "POST", body: form });
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

function ToolMessage({
  error,
  success,
}: {
  error: string | null;
  success: string | null;
}) {
  if (error) {
    return (
      <p role="alert" className="mt-2 text-xs text-[#b3261e]">
        {error}
      </p>
    );
  }
  if (success) {
    return <p className="mt-2 text-xs text-[#1a7f37]">{success}</p>;
  }
  return null;
}

export function PdfToolsClient({
  document,
  pageCount,
  otherPdfs,
}: PdfToolsClientProps) {
  const [mergeChecked, setMergeChecked] = useState<string[]>([]);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [mergeSuccess, setMergeSuccess] = useState<string | null>(null);
  const [mergeBusy, setMergeBusy] = useState(false);

  const [splitPages, setSplitPages] = useState("");
  const [splitError, setSplitError] = useState<string | null>(null);
  const [splitSuccess, setSplitSuccess] = useState<string | null>(null);
  const [splitBusy, setSplitBusy] = useState(false);

  const [rotatePages, setRotatePages] = useState("all");
  const [rotateDegrees, setRotateDegrees] = useState("90");
  const [rotateError, setRotateError] = useState<string | null>(null);
  const [rotateSuccess, setRotateSuccess] = useState<string | null>(null);
  const [rotateBusy, setRotateBusy] = useState(false);

  const [compressLevel, setCompressLevel] = useState("ebook");
  const [compressError, setCompressError] = useState<string | null>(null);
  const [compressSuccess, setCompressSuccess] = useState<string | null>(null);
  const [compressBusy, setCompressBusy] = useState(false);

  // Insert pages (Day 18, part 1; image pages Day 33).
  const [insertSource, setInsertSource] = useState<"blank" | "pdf" | "image">(
    "blank"
  );
  const [insertSourceId, setInsertSourceId] = useState("");
  const [insertSourcePages, setInsertSourcePages] = useState("1");
  const [insertImageFiles, setInsertImageFiles] = useState<FileList | null>(
    null
  );
  const [insertPosition, setInsertPosition] = useState<
    "before" | "after" | "end"
  >("end");
  const [insertPage, setInsertPage] = useState("1");
  const [insertError, setInsertError] = useState<string | null>(null);
  const [insertSuccess, setInsertSuccess] = useState<string | null>(null);
  const [insertBusy, setInsertBusy] = useState(false);

  // Page numbers (Day 18, part 1).
  const [numberPosition, setNumberPosition] = useState("bottom-centre");
  const [numberFormat, setNumberFormat] = useState("page-of-total");
  const [numberFromPage, setNumberFromPage] = useState("1");
  const [numberStart, setNumberStart] = useState("1");
  const [numberError, setNumberError] = useState<string | null>(null);
  const [numberSuccess, setNumberSuccess] = useState<string | null>(null);
  const [numberBusy, setNumberBusy] = useState(false);

  const pageHint =
    pageCount !== null
      ? `This PDF has ${pageCount} page${pageCount === 1 ? "" : "s"}.`
      : "Page numbers start at 1.";

  async function onMerge(event: React.FormEvent) {
    event.preventDefault();
    setMergeError(null);
    setMergeSuccess(null);
    setMergeBusy(true);
    try {
      const { fileName } = await runTool(
        `/api/documents/${document.id}/pdf/merge`,
        { documentIds: [document.id, ...mergeChecked] }
      );
      setMergeSuccess(`Merged PDF downloaded as ${fileName}.`);
    } catch (error) {
      setMergeError(error instanceof Error ? error.message : "Merge failed.");
    } finally {
      setMergeBusy(false);
    }
  }

  async function onSplit(event: React.FormEvent) {
    event.preventDefault();
    setSplitError(null);
    setSplitSuccess(null);
    setSplitBusy(true);
    try {
      const { fileName } = await runTool(
        `/api/documents/${document.id}/pdf/split`,
        { pages: splitPages }
      );
      setSplitSuccess(`Extracted PDF downloaded as ${fileName}.`);
    } catch (error) {
      setSplitError(error instanceof Error ? error.message : "Split failed.");
    } finally {
      setSplitBusy(false);
    }
  }

  async function onRotate(event: React.FormEvent) {
    event.preventDefault();
    setRotateError(null);
    setRotateSuccess(null);
    setRotateBusy(true);
    try {
      const { fileName } = await runTool(
        `/api/documents/${document.id}/pdf/rotate`,
        { pages: rotatePages, degrees: Number(rotateDegrees) }
      );
      setRotateSuccess(`Rotated PDF downloaded as ${fileName}.`);
    } catch (error) {
      setRotateError(error instanceof Error ? error.message : "Rotate failed.");
    } finally {
      setRotateBusy(false);
    }
  }

  async function onCompress(event: React.FormEvent) {
    event.preventDefault();
    setCompressError(null);
    setCompressSuccess(null);
    setCompressBusy(true);
    try {
      const { fileName, savedBytes } = await runTool(
        `/api/documents/${document.id}/pdf/compress`,
        { level: compressLevel }
      );
      setCompressSuccess(
        savedBytes !== null && savedBytes > 0
          ? `Compressed PDF downloaded as ${fileName} — saved ${formatBytes(savedBytes)}.`
          : `Compressed PDF downloaded as ${fileName} — this file could not be made smaller, so the original was returned.`
      );
    } catch (error) {
      setCompressError(
        error instanceof Error ? error.message : "Compress failed."
      );
    } finally {
      setCompressBusy(false);
    }
  }

  async function onInsert(event: React.FormEvent) {
    event.preventDefault();
    setInsertError(null);
    setInsertSuccess(null);
    setInsertBusy(true);
    try {
      const position =
        insertPosition === "end"
          ? { kind: "end" as const }
          : {
              kind: insertPosition,
              page: Number(insertPage),
            };
      if (insertSource === "image") {
        if (!insertImageFiles || insertImageFiles.length === 0) {
          throw new Error("Choose at least one PNG or JPEG image to insert.");
        }
        const form = new FormData();
        form.append("source", "image");
        for (const file of insertImageFiles) {
          form.append("image", file);
        }
        form.append("position_kind", insertPosition);
        if (insertPosition !== "end") {
          form.append("position_page", insertPage);
        }
        const { version } = await runVersionToolForm(
          `/api/documents/${document.id}/pdf/insert-pages`,
          form
        );
        setInsertSuccess(
          `Pages inserted — saved as version ${version}. The original file is untouched.`
        );
        return;
      }
      const source =
        insertSource === "blank"
          ? "blank"
          : {
              documentId: insertSourceId,
              pages: insertSourcePages
                .split(/[,\s]+/)
                .filter(Boolean)
                .map((n) => Number(n)),
            };
      const { version } = await runVersionTool(
        `/api/documents/${document.id}/pdf/insert-pages`,
        { source, position }
      );
      setInsertSuccess(
        `Pages inserted — saved as version ${version}. The original file is untouched.`
      );
    } catch (error) {
      setInsertError(error instanceof Error ? error.message : "Insert failed.");
    } finally {
      setInsertBusy(false);
    }
  }

  async function onPageNumbers(event: React.FormEvent) {
    event.preventDefault();
    setNumberError(null);
    setNumberSuccess(null);
    setNumberBusy(true);
    try {
      const { version } = await runVersionTool(
        `/api/documents/${document.id}/pdf/page-numbers`,
        {
          position: numberPosition,
          format: numberFormat,
          fromPage: Number(numberFromPage),
          startNumber: Number(numberStart),
        }
      );
      setNumberSuccess(
        `Page numbers added — saved as version ${version}. The original file is untouched.`
      );
    } catch (error) {
      setNumberError(
        error instanceof Error ? error.message : "Page numbers failed."
      );
    } finally {
      setNumberBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-[#202b3c]">
          PDF tools — {document.title}
        </h1>
        <p className="mt-1 text-sm text-[#667389]">
          Merge, split, rotate or compress this PDF — those tools download a new
          file. Insert pages and page numbers save a new version in your library
          instead. The original is never changed.{" "}
          <Link href="/files" className="text-[#3159c9] hover:underline">
            Back to files
          </Link>
        </p>
      </div>

      <section className={sectionClass} aria-labelledby="merge-heading">
        <h2 id="merge-heading" className="text-sm font-semibold text-[#202b3c]">
          Merge PDFs
        </h2>
        <p className="mt-1 text-xs text-[#667389]">
          Combine this PDF with others from the same workspace, in order. The
          first page of the result is the first page of this document.
        </p>
        <form onSubmit={onMerge} className="mt-3 space-y-2">
          {otherPdfs.length === 0 ? (
            <p className="text-xs text-[#667389]">
              No other PDFs in this workspace to merge with.
            </p>
          ) : (
            <fieldset>
              <legend className={labelClass}>
                PDFs to append after this one
              </legend>
              <div className="space-y-1.5">
                {otherPdfs.map((pdf) => (
                  <label
                    key={pdf.id}
                    className="flex items-center gap-2 text-sm text-[#202b3c]"
                  >
                    <input
                      type="checkbox"
                      checked={mergeChecked.includes(pdf.id)}
                      onChange={(event) => {
                        setMergeChecked((current) =>
                          event.target.checked
                            ? [...current, pdf.id]
                            : current.filter((id) => id !== pdf.id)
                        );
                      }}
                    />
                    {pdf.title}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <button
            type="submit"
            disabled={mergeBusy || mergeChecked.length === 0}
            className={buttonClass}
          >
            {mergeBusy ? "Merging…" : "Merge and download"}
          </button>
          <ToolMessage error={mergeError} success={mergeSuccess} />
        </form>
      </section>

      <section className={sectionClass} aria-labelledby="split-heading">
        <h2 id="split-heading" className="text-sm font-semibold text-[#202b3c]">
          Extract pages
        </h2>
        <p className="mt-1 text-xs text-[#667389]">
          {pageHint} Pages are extracted in the order you list them.
        </p>
        <form onSubmit={onSplit} className="mt-3 space-y-2">
          <div>
            <label htmlFor="split-pages" className={labelClass}>
              Pages
            </label>
            <input
              id="split-pages"
              className={inputClass}
              value={splitPages}
              onChange={(event) => setSplitPages(event.target.value)}
              placeholder="1-3, 5"
              autoComplete="off"
            />
          </div>
          <button
            type="submit"
            disabled={splitBusy || splitPages.trim() === ""}
            className={buttonClass}
          >
            {splitBusy ? "Extracting…" : "Extract and download"}
          </button>
          <ToolMessage error={splitError} success={splitSuccess} />
        </form>
      </section>

      <section className={sectionClass} aria-labelledby="rotate-heading">
        <h2
          id="rotate-heading"
          className="text-sm font-semibold text-[#202b3c]"
        >
          Rotate pages
        </h2>
        <p className="mt-1 text-xs text-[#667389]">
          {pageHint} Rotation adds to a page&apos;s current rotation.
        </p>
        <form onSubmit={onRotate} className="mt-3 space-y-2">
          <div>
            <label htmlFor="rotate-pages" className={labelClass}>
              Pages
            </label>
            <input
              id="rotate-pages"
              className={inputClass}
              value={rotatePages}
              onChange={(event) => setRotatePages(event.target.value)}
              placeholder="all"
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor="rotate-degrees" className={labelClass}>
              Rotate clockwise by
            </label>
            <select
              id="rotate-degrees"
              className={inputClass}
              value={rotateDegrees}
              onChange={(event) => setRotateDegrees(event.target.value)}
            >
              <option value="90">90°</option>
              <option value="180">180°</option>
              <option value="270">270°</option>
            </select>
          </div>
          <button type="submit" disabled={rotateBusy} className={buttonClass}>
            {rotateBusy ? "Rotating…" : "Rotate and download"}
          </button>
          <ToolMessage error={rotateError} success={rotateSuccess} />
        </form>
      </section>

      <section className={sectionClass} aria-labelledby="compress-heading">
        <h2
          id="compress-heading"
          className="text-sm font-semibold text-[#202b3c]"
        >
          Compress PDF
        </h2>
        <p className="mt-1 text-xs text-[#667389]">
          Shrink this PDF by downsampling images and subsetting fonts. If it
          cannot be made smaller, the original is returned unchanged.
        </p>
        <form onSubmit={onCompress} className="mt-3 space-y-2">
          <div>
            <label htmlFor="compress-level" className={labelClass}>
              Quality
            </label>
            <select
              id="compress-level"
              className={inputClass}
              value={compressLevel}
              onChange={(event) => setCompressLevel(event.target.value)}
            >
              <option value="screen">Screen — smallest, 72 dpi images</option>
              <option value="ebook">Ebook — balanced, 150 dpi images</option>
              <option value="printer">Printer — largest, 300 dpi images</option>
            </select>
          </div>
          <button type="submit" disabled={compressBusy} className={buttonClass}>
            {compressBusy ? "Compressing…" : "Compress and download"}
          </button>
          <ToolMessage error={compressError} success={compressSuccess} />
        </form>
      </section>

      <section className={sectionClass} aria-labelledby="insert-heading">
        <h2
          id="insert-heading"
          className="text-sm font-semibold text-[#202b3c]"
        >
          Insert pages
        </h2>
        <p className="mt-1 text-xs text-[#667389]">
          {pageHint} Insert a blank page, pages from another PDF in this
          workspace, or pages from images — each image becomes a page of its
          own, sized like its neighbours with the image centred. The result is
          saved as a new version — the original file is untouched.
        </p>
        <form onSubmit={onInsert} className="mt-3 space-y-2">
          <div>
            <label htmlFor="insert-source" className={labelClass}>
              What to insert
            </label>
            <select
              id="insert-source"
              className={inputClass}
              value={insertSource}
              onChange={(event) =>
                setInsertSource(event.target.value as "blank" | "pdf" | "image")
              }
            >
              <option value="blank">A blank page</option>
              <option value="pdf">Pages from another PDF</option>
              <option value="image">Pages from an image</option>
            </select>
          </div>
          {insertSource === "image" ? (
            <div>
              <label htmlFor="insert-source-images" className={labelClass}>
                Images (PNG or JPEG, each at most 10 MB — each becomes one page,
                in the order chosen)
              </label>
              <input
                id="insert-source-images"
                type="file"
                accept="image/png,image/jpeg"
                multiple
                className={inputClass}
                onChange={(event) => setInsertImageFiles(event.target.files)}
              />
            </div>
          ) : null}
          {insertSource === "pdf" ? (
            <>
              <div>
                <label htmlFor="insert-source-pdf" className={labelClass}>
                  Source PDF
                </label>
                <select
                  id="insert-source-pdf"
                  className={inputClass}
                  value={insertSourceId}
                  onChange={(event) => setInsertSourceId(event.target.value)}
                >
                  <option value="">Choose a PDF…</option>
                  {otherPdfs.map((pdf) => (
                    <option key={pdf.id} value={pdf.id}>
                      {pdf.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="insert-source-pages" className={labelClass}>
                  Pages from the source
                </label>
                <input
                  id="insert-source-pages"
                  className={inputClass}
                  value={insertSourcePages}
                  onChange={(event) => setInsertSourcePages(event.target.value)}
                  placeholder="1, 2"
                  autoComplete="off"
                />
              </div>
            </>
          ) : null}
          <div>
            <label htmlFor="insert-position" className={labelClass}>
              Where to insert
            </label>
            <select
              id="insert-position"
              className={inputClass}
              value={insertPosition}
              onChange={(event) =>
                setInsertPosition(
                  event.target.value as "before" | "after" | "end"
                )
              }
            >
              <option value="before">Before a page</option>
              <option value="after">After a page</option>
              <option value="end">At the end</option>
            </select>
          </div>
          {insertPosition !== "end" ? (
            <div>
              <label htmlFor="insert-page" className={labelClass}>
                Page
              </label>
              <input
                id="insert-page"
                className={inputClass}
                value={insertPage}
                onChange={(event) => setInsertPage(event.target.value)}
                inputMode="numeric"
                autoComplete="off"
              />
            </div>
          ) : null}
          <button
            type="submit"
            disabled={
              insertBusy ||
              (insertSource === "pdf" &&
                (insertSourceId === "" || insertSourcePages.trim() === ""))
            }
            className={buttonClass}
          >
            {insertBusy ? "Inserting…" : "Insert pages"}
          </button>
          <ToolMessage error={insertError} success={insertSuccess} />
        </form>
      </section>

      <section className={sectionClass} aria-labelledby="numbers-heading">
        <h2
          id="numbers-heading"
          className="text-sm font-semibold text-[#202b3c]"
        >
          Page numbers
        </h2>
        <p className="mt-1 text-xs text-[#667389]">
          {pageHint} The numbers are drawn onto the pages, so they are permanent
          — applying page numbers twice draws a second number over the first.
          The result is saved as a new version — the original file is untouched.
        </p>
        <form onSubmit={onPageNumbers} className="mt-3 space-y-2">
          <div>
            <label htmlFor="number-position" className={labelClass}>
              Position
            </label>
            <select
              id="number-position"
              className={inputClass}
              value={numberPosition}
              onChange={(event) => setNumberPosition(event.target.value)}
            >
              <option value="bottom-centre">Bottom centre</option>
              <option value="bottom-right">Bottom right</option>
              <option value="top-centre">Top centre</option>
              <option value="top-right">Top right</option>
            </select>
          </div>
          <div>
            <label htmlFor="number-format" className={labelClass}>
              Format
            </label>
            <select
              id="number-format"
              className={inputClass}
              value={numberFormat}
              onChange={(event) => setNumberFormat(event.target.value)}
            >
              <option value="number">Number only (1, 2, 3)</option>
              <option value="page">Page 1, Page 2</option>
              <option value="page-of-total">Page 1 of 5, Page 2 of 5</option>
            </select>
          </div>
          <div>
            <label htmlFor="number-from-page" className={labelClass}>
              First page to number
            </label>
            <input
              id="number-from-page"
              className={inputClass}
              value={numberFromPage}
              onChange={(event) => setNumberFromPage(event.target.value)}
              inputMode="numeric"
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor="number-start" className={labelClass}>
              Starting number
            </label>
            <input
              id="number-start"
              className={inputClass}
              value={numberStart}
              onChange={(event) => setNumberStart(event.target.value)}
              inputMode="numeric"
              autoComplete="off"
            />
          </div>
          <button type="submit" disabled={numberBusy} className={buttonClass}>
            {numberBusy ? "Adding…" : "Add page numbers"}
          </button>
          <ToolMessage error={numberError} success={numberSuccess} />
        </form>
      </section>
    </div>
  );
}
