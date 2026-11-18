import { describe, expect, it } from "vitest";
import { canManageMembers, canPerform } from "@/features/auth/roles";

describe("canPerform", () => {
  it("owner can do everything", () => {
    for (const required of [
      "viewer",
      "commenter",
      "editor",
      "admin",
      "owner",
    ] as const) {
      expect(canPerform("owner", required)).toBe(true);
    }
  });

  it("viewer can only view", () => {
    expect(canPerform("viewer", "viewer")).toBe(true);
    expect(canPerform("viewer", "commenter")).toBe(false);
    expect(canPerform("viewer", "editor")).toBe(false);
    expect(canPerform("viewer", "admin")).toBe(false);
  });

  it("editor cannot manage members", () => {
    expect(canPerform("editor", "admin")).toBe(false);
    expect(canManageMembers("editor")).toBe(false);
  });

  it("admin and owner can manage members", () => {
    expect(canManageMembers("admin")).toBe(true);
    expect(canManageMembers("owner")).toBe(true);
  });

  it("no role means no access", () => {
    expect(canPerform(null, "viewer")).toBe(false);
    expect(canPerform(undefined, "viewer")).toBe(false);
    expect(canManageMembers(null)).toBe(false);
  });
});
