// The Shared page's list (Day 28) — a client component so a
// live link can be revoked without a full page reload.
//
// Each entry is one share link the user created: the document
// title (a link to the document), the expiry, and the status
// (Live / Expired / Revoked). A live link has a Revoke button
// that calls the same revoke route the per-document Share page
// uses (`POST /api/documents/[id]/shares/[shareId]/revoke`).
"use client";

import { useState } from "react";
import Link from "next/link";
import { formatShareExpiry, shareStatusLabel } from "@/lib/sharing";
import type { MyShare } from "@/lib/sharing.server";

/** The date a share was created (the library's format). */
function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function SharedListClient({ shares }: { shares: MyShare[] }) {
  const [items, setItems] = useState(shares);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function revoke(share: MyShare) {
    setRevoking(share.id);
    setError(null);
    try {
      const resp = await fetch(
        `/api/documents/${share.documentId}/shares/${share.id}/revoke`,
        { method: "POST" }
      );
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setError(data.error ?? "Could not revoke the share link.");
        return;
      }
      setItems((prev) =>
        prev.map((s) =>
          s.id === share.id ? { ...s, revokedAt: new Date().toISOString() } : s
        )
      );
    } catch {
      setError("Could not revoke the share link.");
    } finally {
      setRevoking(null);
    }
  }

  return (
    <div>
      {error ? (
        <p role="alert" className="mb-3 text-sm text-[#b3261e]">
          {error}
        </p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {items.map((share) => {
          const status = shareStatusLabel(share);
          const live = status === "Live";
          return (
            <li
              key={share.id}
              className="rounded-xl border border-[#dce3ec] bg-white p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    href={`/documents/${share.documentId}/share`}
                    className="font-medium text-[#3159c9] hover:underline"
                  >
                    {share.documentTitle}
                  </Link>
                  <p className="text-xs text-[#667389]">
                    {formatShareExpiry(share.expiresAt)} · Created{" "}
                    {formatDate(share.createdAt)}
                  </p>
                </div>
                <span
                  className={
                    live
                      ? "rounded-full bg-[#e6f4ea] px-2 py-0.5 text-xs font-medium text-[#1a7f37]"
                      : "rounded-full bg-[#f2f5f8] px-2 py-0.5 text-xs font-medium text-[#667389]"
                  }
                >
                  {status}
                </span>
              </div>
              {live ? (
                <div className="mt-2">
                  <button
                    type="button"
                    disabled={revoking === share.id}
                    onClick={() => revoke(share)}
                    className="inline-flex h-8 items-center rounded-lg border border-[#dce3ec] bg-white px-3 text-sm font-medium text-[#202b3c] hover:bg-[#f2f5f8] disabled:opacity-60"
                  >
                    {revoking === share.id ? "Revoking…" : "Revoke"}
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
