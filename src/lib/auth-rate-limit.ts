// Auth rate limiting (Day 27, hardening).
//
// The conversion/export/PDF-tools/OCR/form routes are already
// rate-limited (10/min per user). The auth server actions were
// not — a brute-force run could hammer sign-in through the app's
// own form. This module adds a per-email limiter to the sign-in
// and sign-up actions.
//
// The limit is generous on purpose: 10 attempts per 15 minutes
// per email address. A legitimate user mistyping their password
// never hits it; a brute-force run does. A successful sign-in
// clears the counter for that email, so a user who eventually
// remembers their password is not locked out by their own
// earlier failures.
//
// Honest limits (the same as every other limiter in the app):
// this is per-process in-memory, so it bounds abuse on a
// single-instance deployment and resets on a restart. Supabase
// Auth also rate-limits server-side (its own limits apply in the
// dashboard) — this is defense-in-depth for the app's form, not
// a replacement for the auth server's own limits.

import { FixedWindowRateLimiter } from "@/lib/export";

/** 10 auth attempts per email per 15 minutes. */
export const AUTH_RATE_LIMIT_MAX = 10;
export const AUTH_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

/** The message returned when the limit is hit. It does not say
 *  whether the email exists (the sign-in error does not either). */
export const AUTH_RATE_LIMIT_MESSAGE =
  "Too many attempts. Try again in a few minutes.";

const signInLimiter = new FixedWindowRateLimiter(
  AUTH_RATE_LIMIT_MAX,
  AUTH_RATE_LIMIT_WINDOW_MS
);
const signUpLimiter = new FixedWindowRateLimiter(
  AUTH_RATE_LIMIT_MAX,
  AUTH_RATE_LIMIT_WINDOW_MS
);

export type AuthActionKind = "sign-in" | "sign-up";

/** The rate-limit key for an email + action. The email is
 *  lowercased and trimmed so `User@Example.com` and
 *  `user@example.com` share one counter. */
export function authRateLimitKey(email: string, kind: AuthActionKind): string {
  return `${kind}:${email.trim().toLowerCase()}`;
}

/**
 * Record one auth attempt for an email. Returns `{ allowed: true }`
 * when the attempt may proceed, or `{ allowed: false }` when the
 * limit is hit (the caller returns AUTH_RATE_LIMIT_MESSAGE and
 * does NOT call Supabase Auth).
 */
export function checkAuthAttempt(
  email: string,
  kind: AuthActionKind
): { allowed: boolean; retryAfterMs: number } {
  const limiter = kind === "sign-in" ? signInLimiter : signUpLimiter;
  return limiter.check(authRateLimitKey(email, kind));
}

/**
 * Clear the counter for an email (called after a successful
 * sign-in, so a user who eventually remembers their password
 * is not locked out by their own earlier failures).
 */
export function clearAuthAttempts(email: string, kind: AuthActionKind): void {
  const limiter = kind === "sign-in" ? signInLimiter : signUpLimiter;
  limiter.reset(authRateLimitKey(email, kind));
}
