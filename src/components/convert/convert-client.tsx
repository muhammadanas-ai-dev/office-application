"use client";

import { useState } from "react";

export function ConvertClient({
  documentId,
  title,
  sourceLabel,
  targets,
}: {
  documentId: string;
  title: string;
  sourceLabel: string;
  targets: { ext: string; label: string }[];
}) {
  const [selected, setSelected] = useState(targets[0]?.ext ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [converted, setConverted] = useState<{
    id: string;
    title: string;
    mimeType: string;
  } | null>(null);

  async function convert() {
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    setConverted(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outputType: selected }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof body?.error === "string"
            ? body.error
            : "The conversion failed. Try again."
        );
        return;
      }
      setConverted(body.document);
    } catch {
      setError("The conversion failed. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        <span className="font-medium text-neutral-900 dark:text-neutral-100">
          {title}
        </span>{" "}
        is a {sourceLabel}. Choose the format to convert it to:
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {targets.map((target) => (
          <label
            key={target.ext}
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:border-[#3159c9] dark:border-neutral-700"
          >
            <input
              type="radio"
              name="convert-target"
              value={target.ext}
              checked={selected === target.ext}
              onChange={() => setSelected(target.ext)}
              disabled={busy}
            />
            {target.label}
          </label>
        ))}
      </div>
      <button
        type="button"
        onClick={convert}
        disabled={busy || !selected}
        className="mt-4 inline-flex h-9 items-center rounded-lg bg-[#3159c9] px-4 text-sm font-medium text-white hover:bg-[#2a4cab] disabled:opacity-50"
      >
        {busy ? "Converting…" : "Convert"}
      </button>
      {error ? (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}
      {converted ? (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm dark:border-green-900 dark:bg-green-950">
          <p className="font-medium text-green-800 dark:text-green-200">
            Converted — a new document was created.
          </p>
          <p className="mt-1 text-green-700 dark:text-green-300">
            <a
              href={`/api/documents/${converted.id}/download`}
              className="underline"
            >
              Download {converted.title}
            </a>{" "}
            or find it in your files — the original file is untouched.
          </p>
        </div>
      ) : null}
    </div>
  );
}
