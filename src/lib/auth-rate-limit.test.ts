import { describe, expect, it } from "vitest";
import {
  AUTH_RATE_LIMIT_MAX,
  AUTH_RATE_LIMIT_MESSAGE,
  authRateLimitKey,
  checkAuthAttempt,
  clearAuthAttempts,
} from "@/lib/auth-rate-limit";

describe("authRateLimitKey", () => {
  it("lowercases and trims the email", () => {
    expect(authRateLimitKey("  User@Example.com ", "sign-in")).toBe(
      "sign-in:user@example.com"
    );
  });

  it("keeps sign-in and sign-up separate", () => {
    expect(authRateLimitKey("a@b.com", "sign-in")).not.toBe(
      authRateLimitKey("a@b.com", "sign-up")
    );
  });
});

describe("checkAuthAttempt", () => {
  it("allows attempts up to the limit, then blocks", () => {
    const email = `rate-limit-${Date.now()}@example.com`;
    for (let i = 0; i < AUTH_RATE_LIMIT_MAX; i++) {
      expect(checkAuthAttempt(email, "sign-in").allowed).toBe(true);
    }
    const blocked = checkAuthAttempt(email, "sign-in");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("a successful attempt clears the counter", () => {
    const email = `rate-clear-${Date.now()}@example.com`;
    for (let i = 0; i < AUTH_RATE_LIMIT_MAX; i++) {
      checkAuthAttempt(email, "sign-in");
    }
    expect(checkAuthAttempt(email, "sign-in").allowed).toBe(false);
    clearAuthAttempts(email, "sign-in");
    expect(checkAuthAttempt(email, "sign-in").allowed).toBe(true);
  });

  it("different emails have separate counters", () => {
    const a = `rate-a-${Date.now()}@example.com`;
    const b = `rate-b-${Date.now()}@example.com`;
    for (let i = 0; i < AUTH_RATE_LIMIT_MAX; i++) {
      checkAuthAttempt(a, "sign-in");
    }
    expect(checkAuthAttempt(a, "sign-in").allowed).toBe(false);
    expect(checkAuthAttempt(b, "sign-in").allowed).toBe(true);
  });
});

describe("AUTH_RATE_LIMIT_MESSAGE", () => {
  it("does not say whether the email exists", () => {
    expect(AUTH_RATE_LIMIT_MESSAGE).not.toMatch(/email|account|exist/i);
  });
});
