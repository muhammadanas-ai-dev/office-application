// Images to PDF client (Day 22).
//
// A list of the user's images with checkboxes (in the order
// shown — the PDF's pages follow that order), a title input,
// and a "Create PDF" button. On success it links to the new
// PDF's download. The button is disabled until at least one
// image is chosen.
"use client";

import { useState } from "react";
import Link from "next/link";

interface ImagesToPdfClientProps {
  images: { id: string; title: string; mimeType: string; version: number }[];
}

export function ImagesToPdfClient({ images }: ImagesToPdfClientProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    id: string;
    title: string;
  } | null>(null);

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function createPdf() {
    setBusy(true);
    setError(null);
    setCreated(null);
    try {
      const response = await fetch("/api/documents/images-to-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentIds: selected,
          ...(title.trim() ? { title: title.trim() } : {}),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: unknown;
        document?: { id: string; title: string };
      };
      if (!response.ok) {
        throw new Error(
          typeof data.error === "string" && data.error
            ? data.error
            : "Could not create the PDF."
        );
      }
      if (!data.document) throw new Error("Could not create the PDF.");
      setCreated(data.document);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create the PDF."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold text-[#202b3c]">Images to PDF</h1>
        <p className="mt-1 text-sm text-[#5b6b7f]">
          Choose your images (PNG, JPEG, WEBP or TIFF) and create one PDF — one page per
          image, each fit on an A4 page. The images stay in your library
          untouched.
        </p>
      </div>

      {images.length === 0 ? (
        <p className="text-sm text-[#5b6b7f]">
          You have no images in your library yet — upload a PNG, JPEG, WEBP or TIFF first,
          then come back here.
        </p>
      ) : (
        <>
          <div className="space-y-2">
            {images.map((image) => (
              <label
                key={image.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#dce3ec] bg-white px-3 py-2"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(image.id)}
                  onChange={() => toggle(image.id)}
                  className="h-4 w-4 accent-[#3159c9]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-[#202b3c]">
                    {image.title}
                  </span>
                  <span className="block text-xs text-[#5b6b7f]">
                    {image.mimeType === "image/png" ? "PNG" : "JPEG"} · version{" "}
                    {image.version}
                  </span>
                </span>
                <span className="text-xs font-medium text-[#5b6b7f]">
                  {selected.includes(image.id)
                    ? `Page ${selected.indexOf(image.id) + 1}`
                    : ""}
                </span>
              </label>
            ))}
          </div>

          <div>
            <label
              htmlFor="images-to-pdf-title"
              className="mb-1 block text-sm font-medium text-[#202b3c]"
            >
              PDF title (optional)
            </label>
            <input
              id="images-to-pdf-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="Images to PDF"
              className="h-10 w-full rounded-lg border border-[#dce3ec] bg-white px-3 text-sm text-[#202b3c] outline-none focus:border-[#3159c9]"
            />
          </div>

          <button
            type="button"
            disabled={busy || selected.length === 0}
            onClick={createPdf}
            className="inline-flex h-10 items-center rounded-lg bg-[#3159c9] px-4 text-sm font-medium text-white hover:bg-[#2a4cab] disabled:opacity-60"
          >
            {busy
              ? "Creating…"
              : `Create PDF (${selected.length} image${selected.length === 1 ? "" : "s"})`}
          </button>

          {error ? (
            <p role="alert" className="text-sm text-[#b3261e]">
              {error}
            </p>
          ) : null}
          {created ? (
            <p className="text-sm text-[#1a7f37]">
              Created “{created.title}”.{" "}
              <Link
                href={`/api/documents/${created.id}/download`}
                className="font-medium underline"
              >
                Download the PDF
              </Link>
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
