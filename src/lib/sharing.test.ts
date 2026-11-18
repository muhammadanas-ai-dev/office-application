// Unit tests for Single-user sharing (Day 25) — the token,
// the hash, the expiry choices, and the URL.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHARE_EXPIRY,
  expiresAtForChoice,
  getShareUrl,
  hashShareToken,
  isShareExpired,
  isShareExpiryChoice,
  newShareToken,
  shareExpiryLabel,
} from "@/lib/sharing";

describe("newShareToken", () => {
  it("is 32 hex characters and unique", () => {
    const a = newShareToken();
    const b = newShareToken();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(b).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toBe(b);
  });
});

describe("hashShareToken", () => {
  it("is deterministic, 64 hex, and not the token itself", () => {
    const token = newShareToken();
    const hash = hashShareToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashShareToken(token));
    expect(hash).not.toBe(token);
    expect(hashShareToken(newShareToken())).not.toBe(hash);
  });
});

describe("expiresAtForChoice", () => {
  it("returns null for never, and the right day count otherwise", () => {
    const now = Date.parse("2026-11-18T12:00:00Z");
    expect(expiresAtForChoice("never", now)).toBeNull();
    expect(expiresAtForChoice("1d", now)?.toISOString()).toBe(
      "2026-11-19T12:00:00.000Z"
    );
    expect(expiresAtForChoice("7d", now)?.toISOString()).toBe(
      "2026-11-25T12:00:00.000Z"
    );
    expect(expiresAtForChoice("30d", now)?.toISOString()).toBe(
      "2026-12-18T12:00:00.000Z"
    );
    expect(DEFAULT_SHARE_EXPIRY).toBe("7d");
  });
});

describe("isShareExpired", () => {
  it("never expires when the expiry is null", () => {
    expect(isShareExpired(null, Date.now())).toBe(false);
  });

  it("is expired in the past and not in the future", () => {
    const now = Date.parse("2026-11-18T12:00:00Z");
    expect(isShareExpired(new Date(now - 1000), now)).toBe(true);
    expect(isShareExpired(new Date(now + 1000), now)).toBe(false);
    expect(isShareExpired("2026-11-17T12:00:00Z", now)).toBe(true);
  });
});

describe("isShareExpiryChoice", () => {
  it("accepts only the four choices", () => {
    expect(isShareExpiryChoice("1d")).toBe(true);
    expect(isShareExpiryChoice("7d")).toBe(true);
    expect(isShareExpiryChoice("30d")).toBe(true);
    expect(isShareExpiryChoice("never")).toBe(true);
    expect(isShareExpiryChoice("1h")).toBe(false);
    expect(isShareExpiryChoice(7)).toBe(false);
  });
});

describe("getShareUrl and shareExpiryLabel", () => {
  it("builds the public URL and labels the choices", () => {
    expect(getShareUrl("abc123")).toBe("/s/abc123");
    expect(shareExpiryLabel("1d")).toBe("1 day");
    expect(shareExpiryLabel("7d")).toBe("7 days");
    expect(shareExpiryLabel("30d")).toBe("30 days");
    expect(shareExpiryLabel("never")).toBe("Never expires");
  });
});
