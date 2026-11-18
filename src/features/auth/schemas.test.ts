import { describe, expect, it } from "vitest";
import {
  resetRequestSchema,
  signInSchema,
  signUpSchema,
  updatePasswordSchema,
  updateProfileSchema,
} from "@/features/auth/schemas";

describe("signInSchema", () => {
  it("accepts a valid email and password", () => {
    expect(
      signInSchema.safeParse({
        email: "ana@example.com",
        password: "correct horse",
      }).success
    ).toBe(true);
  });

  it("rejects a bad email and a short password", () => {
    expect(
      signInSchema.safeParse({ email: "not-an-email", password: "short" })
        .success
    ).toBe(false);
  });
});

describe("signUpSchema", () => {
  it("rejects an empty display name", () => {
    expect(
      signUpSchema.safeParse({
        displayName: "  ",
        email: "a@b.co",
        password: "12345678",
      }).success
    ).toBe(false);
  });
});

describe("updatePasswordSchema", () => {
  it("rejects mismatched passwords", () => {
    const result = updatePasswordSchema.safeParse({
      password: "newpassword1",
      confirmPassword: "different2",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["confirmPassword"]);
    }
  });
});

describe("updateProfileSchema", () => {
  it("rejects a name over 100 characters", () => {
    expect(
      updateProfileSchema.safeParse({ displayName: "x".repeat(101) }).success
    ).toBe(false);
  });
});

describe("resetRequestSchema", () => {
  it("rejects an empty email", () => {
    expect(resetRequestSchema.safeParse({ email: "" }).success).toBe(false);
  });
});
