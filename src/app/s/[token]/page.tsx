// A public share page (Day 25) — no sign-in, no sidebar.
//
// /s/[token] shows the shared document's title, type, size and
// when the link expires, plus a Download button. A dead link
// (unknown, revoked, or expired) shows a plain message — it does
// not say whether the token ever existed.
import type { Metadata } from "next";
import Link from "next/link";
import { Download, FileWarning, Link2Off } from "lucide-react";
import { formatBytes } from "@/lib/storage";
import { resolveShare } from "@/lib/sharing.server";

export const metadata: Metadata = {
  title: "Shared document — Forma Office",
};

function formatExpiry(expiresAt: string | null): string {
  if (!expiresAt) return "This link never expires.";
  return `This link expires on ${new Date(expiresAt).toLocaleDateString(
    "en-GB",
    { day: "numeric", month: "short", year: "numeric" }
  )}.`;
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const resolved = await resolveShare(token);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center px-4 py-12">
      <p className="text-sm font-semibold tracking-wide text-[#3159c9]">
        Forma Office
      </p>
      {!resolved.ok ? (
        <div className="mt-6 w-full rounded-xl border border-[#dce3ec] bg-white p-6 text-center">
          <Link2Off
            size={28}
            aria-hidden="true"
            className="mx-auto text-[#667389]"
          />
          <h1 className="mt-3 text-lg font-semibold text-[#1d2733]">
            This link is not valid.
          </h1>
          <p className="mt-1 text-sm text-[#667389]">
            {resolved.reason === "expired"
              ? "This share link has expired."
              : resolved.reason === "revoked"
                ? "This share link was revoked by its owner."
                : "The link may have been typed wrong, or the document was removed."}
          </p>
          <p className="mt-4 text-sm text-[#667389]">
            Ask the person who shared it for a new link.
          </p>
        </div>
      ) : (
        <div className="mt-6 w-full rounded-xl border border-[#dce3ec] bg-white p-6">
          <FileWarning
            size={28}
            aria-hidden="true"
            className="text-[#667389]"
          />
          <h1 className="mt-3 break-words text-lg font-semibold text-[#1d2733]">
            {resolved.document.title}
          </h1>
          <p className="mt-1 text-sm text-[#667389]">
            {resolved.document.mime_type ?? "Document"}
            {resolved.document.size_bytes !== null
              ? ` · ${formatBytes(resolved.document.size_bytes)}`
              : ""}
          </p>
          <p className="mt-1 text-sm text-[#667389]">
            {formatExpiry(resolved.expiresAt)}
          </p>
          <p className="mt-3 text-sm text-[#667389]">
            Someone shared this document with you. The link gives download
            access — no account needed.
          </p>
          <Link
            href={`/s/${token}/download`}
            className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-[#3159c9] px-4 text-sm font-medium text-white hover:bg-[#2548a5]"
          >
            <Download size={16} aria-hidden="true" />
            Download
          </Link>
        </div>
      )}
      <p className="mt-6 text-xs text-[#667389]">
        Shared with Forma Office — Documents, made precise.
      </p>
    </main>
  );
}
