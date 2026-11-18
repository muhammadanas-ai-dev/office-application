// Share links client (Day 25).
//
// The create form (an expiry select + a Create button) and the
// list of links (each with its URL, expiry, and a Revoke
// button). The new link's URL is shown once — the token is
// never stored, so it must be copied when it appears.
"use client";

import { useState } from "react";
import { Check, Copy, Link2, ShieldOff } from "lucide-react";
import {
  DEFAULT_SHARE_EXPIRY,
  SHARE_EXPIRIES,
  type ShareExpiryChoice,
} from "@/lib/sharing";

export interface ShareListItem {
  id: string;
  expiresAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

interface SharingClientProps {
  documentId: string;
  shares: ShareListItem[];
  migrationApplied: boolean;
}

function formatDate(value: string | null): string {
  if (!value) return "Never expires";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function SharingClient({
  documentId,
  shares,
  migrationApplied,
}: SharingClientProps) {
  const [expiry, setExpiry] = useState<ShareExpiryChoice>(DEFAULT_SHARE_EXPIRY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newUrl, setNewUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  async function createLink() {
    setBusy(true);
    setError(null);
    setNewUrl(null);
    setCopied(false);
    const res = await fetch(`/api/documents/${documentId}/shares`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expiry }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok || !data.share?.url) {
      setError(data.error ?? "Could not create the share link.");
      return;
    }
    // The full URL (the route returns the path) — shown once.
    setNewUrl(`${window.location.origin}${data.share.url}`);
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setError("Could not copy the link. Select it and copy it by hand.");
    }
  }

  async function revoke(id: string) {
    setRevoking(id);
    setError(null);
    const res = await fetch(
      `/api/documents/${documentId}/shares/${id}/revoke`,
      { method: "POST" }
    );
    const data = await res.json().catch(() => ({}));
    setRevoking(null);
    if (!res.ok) {
      setError(data.error ?? "Could not revoke the share link.");
      return;
    }
    window.location.reload();
  }

  if (!migrationApplied) {
    return (
      <div className="rounded-xl border border-[#dce3ec] bg-white p-6">
        <p className="text-sm font-medium text-[#1d2733]">
          Sharing is not set up yet
        </p>
        <p className="mt-1 text-sm text-[#667389]">
          Run forma-shares-migration.sql in the Supabase Dashboard SQL Editor,
          then come back here to create share links.
        </p>
      </div>
    );
  }

  const active = shares.filter((s) => !s.revokedAt);
  const revoked = shares.filter((s) => Boolean(s.revokedAt));

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[#dce3ec] bg-white p-6">
        <h2 className="text-sm font-semibold text-[#1d2733]">
          Create a share link
        </h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="w-48">
            <label
              htmlFor="share-expiry"
              className="mb-1 block text-xs font-medium text-[#202b3c]"
            >
              Link expires
            </label>
            <select
              id="share-expiry"
              className="h-10 w-full rounded-lg border border-[#c8d0dc] bg-white px-3 text-sm text-[#1d2733] focus:border-[#3159c9] focus:outline-none"
              value={expiry}
              disabled={busy}
              onChange={(e) => setExpiry(e.target.value as ShareExpiryChoice)}
            >
              {SHARE_EXPIRIES.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={createLink}
            disabled={busy}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#3159c9] px-4 text-sm font-medium text-white hover:bg-[#2548a5] disabled:opacity-60"
          >
            <Link2 size={16} aria-hidden="true" />
            {busy ? "Creating…" : "Create link"}
          </button>
        </div>
        {error && (
          <p className="mt-3 text-sm text-[#b3261e]" role="alert">
            {error}
          </p>
        )}
        {newUrl && (
          <div className="mt-4 rounded-lg border border-[#dce3ec] bg-[#f5f7fb] p-4">
            <p className="text-sm font-medium text-[#1d2733]">
              Your share link — copy it now. It will not be shown again.
            </p>
            <p className="mt-1 break-all text-sm text-[#3159c9]">{newUrl}</p>
            <button
              type="button"
              onClick={() => copyLink(newUrl)}
              className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg border border-[#c8d0dc] bg-white px-3 text-sm font-medium text-[#1d2733] hover:bg-[#f5f7fb]"
            >
              {copied ? (
                <Check size={16} aria-hidden="true" />
              ) : (
                <Copy size={16} aria-hidden="true" />
              )}
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-[#dce3ec] bg-white p-6">
        <h2 className="text-sm font-semibold text-[#1d2733]">
          Share links ({active.length} active
          {revoked.length > 0 ? `, ${revoked.length} revoked` : ""})
        </h2>
        {shares.length === 0 ? (
          <p className="mt-2 text-sm text-[#667389]">
            No share links yet. Create one above.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {shares.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#dce3ec] px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#1d2733]">
                    {s.revokedAt
                      ? "Revoked"
                      : `Expires ${formatDate(s.expiresAt)}`}
                  </p>
                  <p className="text-xs text-[#667389]">
                    Created {formatDate(s.createdAt)}
                    {s.revokedAt ? ` · revoked ${formatDate(s.revokedAt)}` : ""}
                  </p>
                </div>
                {!s.revokedAt && (
                  <button
                    type="button"
                    onClick={() => revoke(s.id)}
                    disabled={revoking === s.id}
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#c8d0dc] bg-white px-3 text-sm font-medium text-[#1d2733] hover:bg-[#f5f7fb] disabled:opacity-60"
                  >
                    <ShieldOff size={16} aria-hidden="true" />
                    {revoking === s.id ? "Revoking…" : "Revoke"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
