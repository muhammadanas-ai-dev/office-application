// Single-user sharing (Day 25) — pure helpers.
//
// A shareable link is /s/<token> where <token> is a random
// 32-hex-char string. The database stores only the SHA-256 hash
// of the token (never the token itself), so a database leak does
// not expose the links. A share can be revoked and can expire.
// Nothing here touches the filesystem or a network, so it is
// safe to import from anywhere, including tests.
import crypto from "node:crypto";

/** A share token is 16 random bytes, as 32 hex characters. */
export function newShareToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

/** The SHA-256 hex of a share token (what the database stores). */
export function hashShareToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** The four expiry choices offered when creating a link. */
export const SHARE_EXPIRIES = [
  { value: "1d", label: "1 day" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "never", label: "Never expires" },
] as const;

export type ShareExpiryChoice = (typeof SHARE_EXPIRIES)[number]["value"];

export function isShareExpiryChoice(
  value: unknown
): value is ShareExpiryChoice {
  return (
    typeof value === "string" &&
    (SHARE_EXPIRIES as readonly { value: string }[]).some(
      (e) => e.value === value
    )
  );
}

/** The default expiry choice for a new link. */
export const DEFAULT_SHARE_EXPIRY: ShareExpiryChoice = "7d";

/**
 * The expiry timestamp for a choice, or null for "never".
 * `now` is injected so tests can fix the clock.
 */
export function expiresAtForChoice(
  choice: ShareExpiryChoice,
  now: number = Date.now()
): Date | null {
  if (choice === "never") return null;
  const days = choice === "1d" ? 1 : choice === "30d" ? 30 : 7;
  return new Date(now + days * 24 * 60 * 60 * 1000);
}

/** True when the link has passed its expiry (null = never expires). */
export function isShareExpired(
  expiresAt: Date | string | null,
  now: number = Date.now()
): boolean {
  if (expiresAt === null) return false;
  return new Date(expiresAt).getTime() <= now;
}

/** The public URL for a share link. */
export function getShareUrl(token: string): string {
  return `/s/${token}`;
}

/** The label for an expiry choice (for the manage UI). */
export function shareExpiryLabel(choice: ShareExpiryChoice): string {
  return SHARE_EXPIRIES.find((e) => e.value === choice)?.label ?? choice;
}

/** The status of a share link for the Shared page: a revoked
 *  link is "Revoked", an expired one is "Expired", anything
 *  else is "Live". */
export function shareStatusLabel(share: {
  expiresAt: Date | string | null;
  revokedAt: Date | string | null;
}): "Live" | "Expired" | "Revoked" {
  if (share.revokedAt !== null) return "Revoked";
  if (isShareExpired(share.expiresAt)) return "Expired";
  return "Live";
}

/** Format an expiry for the Shared page: "Never expires" when
 *  there is none, otherwise the date. */
export function formatShareExpiry(expiresAt: Date | string | null): string {
  if (expiresAt === null) return "Never expires";
  return `Expires ${new Date(expiresAt).toLocaleDateString()}`;
}
