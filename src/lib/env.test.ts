import { describe, expect, it } from "vitest";
import { getPrivilegedKey, parseServerEnv } from "@/lib/env-server-parse";
import { parsePublicEnv } from "@/lib/env";

const validPublic = {
  NEXT_PUBLIC_SUPABASE_URL: "https://pwncfcvnwudbvwcumado.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
};

describe("parsePublicEnv", () => {
  it("accepts a valid Supabase project URL and publishable key", () => {
    const env = parsePublicEnv(validPublic);
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe(
      "https://pwncfcvnwudbvwcumado.supabase.co"
    );
    expect(env.NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
  });

  it("accepts a custom app URL", () => {
    const env = parsePublicEnv({
      ...validPublic,
      NEXT_PUBLIC_APP_URL: "https://forma.example.com",
    });
    expect(env.NEXT_PUBLIC_APP_URL).toBe("https://forma.example.com");
  });

  it("rejects a non-Supabase URL without naming any value", () => {
    expect(() =>
      parsePublicEnv({
        ...validPublic,
        NEXT_PUBLIC_SUPABASE_URL: "https://example.com",
      })
    ).toThrow("NEXT_PUBLIC_SUPABASE_URL");
  });

  it("rejects a missing publishable key", () => {
    expect(() =>
      parsePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: validPublic.NEXT_PUBLIC_SUPABASE_URL,
      })
    ).toThrow("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  });
});

describe("parseServerEnv and getPrivilegedKey", () => {
  it("prefers the new secret key over the legacy service_role key", () => {
    const env = parseServerEnv({
      SUPABASE_SECRET_KEY: "sb_secret_example",
      SUPABASE_SERVICE_ROLE_KEY: "legacy_example_key",
    });
    expect(getPrivilegedKey(env)).toBe("sb_secret_example");
  });

  it("falls back to the service_role key when no secret key is set", () => {
    const env = parseServerEnv({
      SUPABASE_SERVICE_ROLE_KEY: "legacy_example_key",
    });
    expect(getPrivilegedKey(env)).toBe("legacy_example_key");
  });

  it("returns null when no privileged key is set", () => {
    expect(getPrivilegedKey(parseServerEnv({}))).toBeNull();
  });

  it("rejects a non-postgresql DATABASE_URL", () => {
    expect(() =>
      parseServerEnv({ DATABASE_URL: "mysql://localhost/db" })
    ).toThrow("DATABASE_URL");
  });
});
