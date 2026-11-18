// PDF security UI (Day 20) — client component.
//
// If the PDF is not protected, the user sets a password and
// permissions. If it is protected, the page shows its strength
// and permissions and offers to unlock it. Every change goes to
// its API route and creates a new version — the original file is
// never overwritten. Errors come from the route's JSON error
// message, so the user always sees a real reason, never a
// generic failure. The passwords are sent only to the route for
// this one operation and are never stored.
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import type { PdfSecurityInfo } from "@/lib/pdf-security";

interface PdfSecurityClientProps {
  document: { id: string; title: string; version: number };
  security: PdfSecurityInfo | null;
  securityError: string | null;
}

const sectionClass = "rounded-xl border border-[#dce3ec] bg-white p-4";
const inputClass =
  "h-9 w-full rounded-lg border border-[#dce3ec] bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3159c9]";
const buttonClass =
  "inline-flex h-9 items-center rounded-lg bg-[#3159c9] px-3 text-sm font-medium text-white hover:bg-[#2a4cab] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3159c9] disabled:opacity-60";
const labelClass = "mb-1 block text-xs font-medium text-[#202b3c]";

const PERMISSION_LABEL: Record<string, string> = {
  print: "Printing",
  extract: "Copying text",
  modify: "Editing",
  annotate: "Annotating",
};

function permissionValue(
  security: Extract<PdfSecurityInfo, { encrypted: true }>,
  key: "print" | "extract" | "modify" | "annotate"
): string {
  const p = security.permissions;
  if (key === "print")
    return p.print === "full"
      ? "Allowed"
      : p.print === "low"
        ? "Low resolution only"
        : "Not allowed";
  if (key === "extract") return p.extract ? "Allowed" : "Not allowed";
  if (key === "modify")
    return p.modify === "all"
      ? "Allowed"
      : p.modify === "partial"
        ? "Some kinds"
        : "Not allowed";
  return p.annotate ? "Allowed" : "Not allowed";
}

export function PdfSecurityClient({
  document,
  security,
  securityError,
}: PdfSecurityClientProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Protect form.
  const [userPassword, setUserPassword] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [bits, setBits] = useState<"128" | "256">("256");
  const [allowPrint, setAllowPrint] = useState(true);
  const [allowCopy, setAllowCopy] = useState(true);
  const [allowEdit, setAllowEdit] = useState(true);
  const [allowAnnotate, setAllowAnnotate] = useState(true);
  // Unlock form.
  const [unlockPassword, setUnlockPassword] = useState("");

  async function postSecurity(
    url: string,
    body: Record<string, unknown>,
    successMessage: string
  ) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
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
      setMessage(
        `${successMessage} — saved as version ${data.version}. The original file is untouched.`
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "This operation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold text-[#202b3c]">
          PDF security — {document.title}
        </h1>
        <p className="mt-1 text-sm text-[#667389]">
          Password-protect this PDF, set what others may do with it, or unlock
          it. Every change saves a new version — the original file is untouched.{" "}
          <Link href="/files" className="text-[#3159c9] hover:underline">
            Back to files
          </Link>
        </p>
      </div>

      {message ? (
        <p className="mt-3 text-sm text-[#1a7f37]">{message}</p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-[#b3261e]">
          {error}
        </p>
      ) : null}

      {securityError ? (
        <div className={`${sectionClass} mt-4`}>
          <p role="alert" className="text-sm text-[#b3261e]">
            {securityError}
          </p>
          <p className="mt-2 text-sm text-[#667389]">
            PDF security needs the qpdf tool on this server. If it was removed
            by a server reset, reinstall it and reload this page.
          </p>
        </div>
      ) : security && security.encrypted ? (
        <div className={`${sectionClass} mt-4`}>
          <h2 className="text-base font-semibold text-[#202b3c]">
            This PDF is protected
          </h2>
          <dl className="mt-3 space-y-1 text-sm text-[#202b3c]">
            <div className="flex justify-between gap-4">
              <dt>Encryption</dt>
              <dd>
                {security.bits}-bit AES
                {security.bits === 256 ? " (strongest)" : ""}
              </dd>
            </div>
            {(["print", "extract", "modify", "annotate"] as const).map(
              (key) => (
                <div key={key} className="flex justify-between gap-4">
                  <dt>{PERMISSION_LABEL[key]}</dt>
                  <dd>{permissionValue(security, key)}</dd>
                </div>
              )
            )}
          </dl>
          <p className="mt-3 text-sm text-[#667389]">
            To change the password or permissions, unlock this PDF first (it
            saves an unprotected copy as a new version), then protect it again
            with the new settings. There is no password recovery — if the
            password is forgotten, the PDF cannot be opened.
          </p>
          <div className="mt-4 space-y-2">
            <div>
              <label htmlFor="unlock-password" className={labelClass}>
                Password
              </label>
              <input
                id="unlock-password"
                type="password"
                value={unlockPassword}
                onChange={(e) => setUnlockPassword(e.target.value)}
                maxLength={128}
                placeholder="Enter the password to unlock this PDF"
                className={inputClass}
                autoComplete="off"
              />
            </div>
            <button
              type="button"
              disabled={busy || !unlockPassword}
              onClick={() =>
                postSecurity(
                  `/api/documents/${document.id}/pdf/unlock`,
                  { password: unlockPassword },
                  "PDF unlocked"
                )
              }
              className={buttonClass}
            >
              Unlock
            </button>
          </div>
        </div>
      ) : (
        <div className={`${sectionClass} mt-4`}>
          <h2 className="text-base font-semibold text-[#202b3c]">
            Protect this PDF
          </h2>
          <p className="mt-1 text-sm text-[#667389]">
            Anyone who opens the protected PDF needs the password. The owner
            password (optional) opens it with full permissions, ignoring the
            restrictions below — if you leave it blank, it is the same as the
            password. The passwords are used only for this one operation and are
            never stored.
          </p>
          <div className="mt-4 space-y-3">
            <div>
              <label htmlFor="user-password" className={labelClass}>
                Password (at least 4 characters)
              </label>
              <input
                id="user-password"
                type="password"
                value={userPassword}
                onChange={(e) => setUserPassword(e.target.value)}
                maxLength={128}
                placeholder="Choose a password"
                className={inputClass}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label htmlFor="owner-password" className={labelClass}>
                Owner password (optional)
              </label>
              <input
                id="owner-password"
                type="password"
                value={ownerPassword}
                onChange={(e) => setOwnerPassword(e.target.value)}
                maxLength={128}
                placeholder="Leave blank to use the same password"
                className={inputClass}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label htmlFor="security-bits" className={labelClass}>
                Encryption strength
              </label>
              <select
                id="security-bits"
                value={bits}
                onChange={(e) => setBits(e.target.value as "128" | "256")}
                className={inputClass}
              >
                <option value="256">256-bit AES (strongest)</option>
                <option value="128">128-bit AES (older readers)</option>
              </select>
            </div>
            <fieldset>
              <legend className={labelClass}>What others may do</legend>
              <div className="space-y-1 text-sm text-[#202b3c]">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={allowPrint}
                    onChange={(e) => setAllowPrint(e.target.checked)}
                  />
                  Allow printing
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={allowCopy}
                    onChange={(e) => setAllowCopy(e.target.checked)}
                  />
                  Allow copying text
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={allowEdit}
                    onChange={(e) => setAllowEdit(e.target.checked)}
                  />
                  Allow editing
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={allowAnnotate}
                    onChange={(e) => setAllowAnnotate(e.target.checked)}
                  />
                  Allow annotating
                </label>
              </div>
            </fieldset>
            <button
              type="button"
              disabled={busy || userPassword.trim().length < 4}
              onClick={() =>
                postSecurity(
                  `/api/documents/${document.id}/pdf/protect`,
                  {
                    userPassword: userPassword.trim(),
                    ...(ownerPassword.trim()
                      ? { ownerPassword: ownerPassword.trim() }
                      : {}),
                    bits,
                    permissions: {
                      print: allowPrint ? "full" : "none",
                      extract: allowCopy,
                      modify: allowEdit ? "all" : "none",
                      annotate: allowAnnotate,
                    },
                  },
                  "PDF protected"
                )
              }
              className={buttonClass}
            >
              Protect PDF
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
