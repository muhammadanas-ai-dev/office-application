// Unit tests for local reviewer notes (Day 34).
import { describe, expect, it } from "vitest";
import { MAX_NOTE_BODY_CHARS, validateNoteBody } from "@/lib/document-notes";

describe("validateNoteBody", () => {
  it("accepts a normal note and trims it", () => {
    expect(validateNoteBody("  Check the totals on page 2.  ")).toBe(
      "Check the totals on page 2."
    );
  });

  it("accepts exactly 2000 characters", () => {
    const body = "a".repeat(MAX_NOTE_BODY_CHARS);
    expect(validateNoteBody(body)).toBe(body);
  });

  it("rejects an empty note", () => {
    expect(() => validateNoteBody("")).toThrow();
    expect(() => validateNoteBody("   ")).toThrow();
    expect(() => validateNoteBody(undefined)).toThrow();
  });

  it("rejects a note over 2000 characters", () => {
    expect(() =>
      validateNoteBody("a".repeat(MAX_NOTE_BODY_CHARS + 1))
    ).toThrow();
  });
});
