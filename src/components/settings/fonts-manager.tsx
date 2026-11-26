"use client";

// Fonts manager (F33) — Settings section.
//
// Upload TTF/OTF fonts, mark favourites, delete. Uploaded
// fonts appear in the PDF draw page's Add-text font picker
// (favourites first, then most recently used). Everything
// goes through /api/fonts; a "not set up yet" answer from
// the API (the F33 table lands with the combined SQL file)
// is shown as a notice, not an error.
import { useCallback, useEffect, useRef, useState } from "react";

interface FontItem {
  id: string;
  name: string;
  format: string;
  sizeBytes: number;
  isFavourite: boolean;
  lastUsedAt: string | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function FontsManager() {
  const [fonts, setFonts] = useState<FontItem[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/fonts");
    const data = (await response.json().catch(() => null)) as {
      fonts?: FontItem[];
      error?: string;
    } | null;
    if (!response.ok) {
      if ((data?.error ?? "").includes("not set up yet")) {
        setNotice(data?.error ?? null);
        setFonts([]);
        return;
      }
      throw new Error(data?.error ?? "Could not load your fonts.");
    }
    setFonts(data?.fonts ?? []);
  }, []);

  useEffect(() => {
    load().catch((failure) =>
      setError(
        failure instanceof Error ? failure.message : "Could not load fonts."
      )
    );
  }, [load]);

  async function onUpload(event: React.FormEvent) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a font file (.ttf or .otf) first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const name = nameRef.current?.value.trim();
      if (name) form.set("name", name);
      const response = await fetch("/api/fonts", {
        method: "POST",
        body: form,
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(data?.error ?? "Upload failed.");
      }
      if (fileRef.current) fileRef.current.value = "";
      if (nameRef.current) nameRef.current.value = "";
      await load();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Upload failed."
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggleFavourite(font: FontItem) {
    setError(null);
    const response = await fetch(`/api/fonts/${font.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFavourite: !font.isFavourite }),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(data?.error ?? "Could not update the font.");
      return;
    }
    await load();
  }

  async function remove(font: FontItem) {
    if (!window.confirm(`Delete the font “${font.name}”?`)) return;
    setError(null);
    const response = await fetch(`/api/fonts/${font.id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(data?.error ?? "Could not delete the font.");
      return;
    }
    await load();
  }

  return (
    <div className="max-w-md">
      {notice ? (
        <p className="rounded-lg border border-[#dce3ec] bg-[#f4f6fa] px-3 py-2 text-sm text-[#667389]">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {fonts === null ? (
        <p className="text-sm text-[#667389]">Loading your fonts…</p>
      ) : fonts.length === 0 ? (
        <p className="text-sm text-[#667389]">
          No uploaded fonts yet. Upload one and it will appear in the PDF
          draw page&apos;s font picker.
        </p>
      ) : (
        <ul className="space-y-2">
          {fonts.map((font) => (
            <li
              key={font.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-[#dce3ec] px-3 py-2"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-[#202b3c]">
                  {font.isFavourite ? "★ " : ""}
                  {font.name}
                </span>
                <span className="block text-xs text-[#667389]">
                  {font.format.toUpperCase()} · {formatBytes(font.sizeBytes)}
                  {font.lastUsedAt
                    ? ` · last used ${new Date(font.lastUsedAt).toLocaleDateString("en-GB")}`
                    : " · not used yet"}
                </span>
              </span>
              <span className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => void toggleFavourite(font)}
                  className="text-xs text-[#3159c9] hover:underline"
                >
                  {font.isFavourite ? "Unfavourite" : "Favourite"}
                </button>
                <button
                  type="button"
                  onClick={() => void remove(font)}
                  className="text-xs text-red-700 hover:underline"
                >
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={onUpload} className="mt-4 space-y-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-[#1d2733]">
            Font file (.ttf or .otf, up to 10 MB)
          </span>
          <input
            ref={fileRef}
            type="file"
            accept=".ttf,.otf,font/ttf,font/otf"
            className="w-full text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-[#1d2733]">
            Name (optional — defaults to the file name)
          </span>
          <input
            ref={nameRef}
            type="text"
            maxLength={80}
            className="w-full rounded-lg border border-[#dce3ec] bg-white px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-[#3159c9] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Uploading…" : "Upload font"}
        </button>
        <p className="text-xs text-[#667389]">
          Only upload fonts you have the right to use. Uploaded fonts work
          in Forma&apos;s PDF tools; the document editor uses its own font
          set.
        </p>
      </form>
    </div>
  );
}
