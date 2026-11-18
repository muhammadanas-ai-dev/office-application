// Versions client (Day 23).
//
// The list of a document's versions, newest first. Each row
// shows the version number, when it was saved, its size, and
// whether it is the current version; a Download link and (except
// for the current version) a Restore button. Restoring asks once
// (a confirm) — it creates a NEW version from the old file, so
// it is safe, but the user should know it becomes the current
// version.
"use client";

import { useState } from "react";
import {
  formatVersionSize,
  getVersionLabel,
  isRestorable,
} from "@/lib/versions";

interface VersionsClientProps {
  documentId: string;
  title: string;
  currentVersion: number;
  versions: {
    versionNumber: number;
    sizeBytes: number | null;
    createdAt: string;
  }[];
}

export function VersionsClient({
  documentId,
  title,
  currentVersion,
  versions,
}: VersionsClientProps) {
  const [restoring, setRestoring] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState<number | null>(null);

  async function restore(versionNumber: number) {
    if (
      !window.confirm(
        `Restore version ${versionNumber}? It will become the current version as a new version ${currentVersion + 1} — the other versions stay.`
      )
    ) {
      return;
    }
    setRestoring(versionNumber);
    setError(null);
    setRestored(null);
    try {
      const response = await fetch(
        `/api/documents/${documentId}/versions/${versionNumber}/restore`,
        { method: "POST" }
      );
      const data = (await response.json().catch(() => ({}))) as {
        error?: unknown;
        version?: number;
      };
      if (!response.ok) {
        throw new Error(
          typeof data.error === "string" && data.error
            ? data.error
            : "Could not restore this version."
        );
      }
      setRestored(data.version ?? currentVersion + 1);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not restore this version."
      );
    } finally {
      setRestoring(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold text-[#202b3c]">
          Versions — {title}
        </h1>
        <p className="mt-1 text-sm text-[#5b6b7f]">
          Every save is a new version — nothing is ever overwritten. Restoring
          an old version creates a new version from it, so the history stays.
        </p>
      </div>

      {versions.length === 0 ? (
        <p className="text-sm text-[#5b6b7f]">
          This document has no saved versions yet.
        </p>
      ) : (
        <div className="space-y-2">
          {versions.map((version) => {
            const isCurrent = version.versionNumber === currentVersion;
            return (
              <div
                key={version.versionNumber}
                className="flex items-center gap-3 rounded-lg border border-[#dce3ec] bg-white px-3 py-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-[#202b3c]">
                    {getVersionLabel(version.versionNumber, isCurrent)}
                  </span>
                  <span className="block text-xs text-[#5b6b7f]">
                    {new Date(version.createdAt).toLocaleString()} ·{" "}
                    {formatVersionSize(version.sizeBytes)}
                  </span>
                </span>
                <a
                  href={`/api/documents/${documentId}/versions/${version.versionNumber}/download`}
                  className="inline-flex h-8 items-center rounded-lg border border-[#dce3ec] px-3 text-sm font-medium text-[#202b3c] hover:bg-[#f2f5f9]"
                >
                  Download
                </a>
                {isRestorable(version.versionNumber, currentVersion) ? (
                  <button
                    type="button"
                    disabled={restoring !== null}
                    onClick={() => restore(version.versionNumber)}
                    className="inline-flex h-8 items-center rounded-lg bg-[#3159c9] px-3 text-sm font-medium text-white hover:bg-[#2a4cab] disabled:opacity-60"
                  >
                    {restoring === version.versionNumber
                      ? "Restoring…"
                      : "Restore"}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {error ? (
        <p role="alert" className="text-sm text-[#b3261e]">
          {error}
        </p>
      ) : null}
      {restored !== null ? (
        <p className="text-sm text-[#1a7f37]">
          Restored as version {restored} — it is now the current version. Reload
          the page to see the updated list.
        </p>
      ) : null}
    </div>
  );
}
