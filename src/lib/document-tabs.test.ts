// Unit tests for the open-document tabs (Day 28) — the tab
// list helpers (add/close/dedupe/cap), the localStorage parse,
// and the document id in a pathname.
import { describe, expect, it } from "vitest";
import {
  MAX_TABS,
  addTab,
  closeTab,
  documentIdFromPath,
  parseTabs,
  serializeTabs,
} from "@/lib/document-tabs";

describe("parseTabs", () => {
  it("parses a valid list", () => {
    expect(
      parseTabs(
        JSON.stringify([
          { id: "a", title: "Report" },
          { id: "b", title: "Notes" },
        ])
      )
    ).toEqual([
      { id: "a", title: "Report" },
      { id: "b", title: "Notes" },
    ]);
  });

  it("ignores malformed values", () => {
    expect(parseTabs("not json")).toEqual([]);
    expect(parseTabs(null)).toEqual([]);
    expect(parseTabs(undefined)).toEqual([]);
    expect(parseTabs(JSON.stringify({ id: "a" }))).toEqual([]);
    expect(
      parseTabs(
        JSON.stringify([
          { id: "a", title: "Report" },
          { id: 1, title: "Bad" },
          { title: "No id" },
        ])
      )
    ).toEqual([{ id: "a", title: "Report" }]);
  });

  it("caps the list at MAX_TABS", () => {
    const many = Array.from({ length: 15 }, (_, i) => ({
      id: `id-${i}`,
      title: `Doc ${i}`,
    }));
    expect(parseTabs(JSON.stringify(many))).toHaveLength(MAX_TABS);
  });
});

describe("serializeTabs", () => {
  it("round-trips through parseTabs", () => {
    const tabs = [
      { id: "a", title: "Report" },
      { id: "b", title: "Notes" },
    ];
    expect(parseTabs(serializeTabs(tabs))).toEqual(tabs);
  });
});

describe("addTab", () => {
  it("adds a new tab to the front", () => {
    expect(addTab([{ id: "a", title: "A" }], { id: "b", title: "B" })).toEqual([
      { id: "b", title: "B" },
      { id: "a", title: "A" },
    ]);
  });

  it("moves an already-open document to the front (no duplicate)", () => {
    expect(
      addTab(
        [
          { id: "a", title: "A" },
          { id: "b", title: "B" },
        ],
        { id: "b", title: "B (renamed)" }
      )
    ).toEqual([
      { id: "b", title: "B (renamed)" },
      { id: "a", title: "A" },
    ]);
  });

  it("caps the list at MAX_TABS, dropping the oldest", () => {
    const tabs = Array.from({ length: MAX_TABS }, (_, i) => ({
      id: `id-${i}`,
      title: `Doc ${i}`,
    }));
    const next = addTab(tabs, { id: "new", title: "New" });
    expect(next).toHaveLength(MAX_TABS);
    expect(next[0]).toEqual({ id: "new", title: "New" });
    expect(next.some((t) => t.id === `id-${MAX_TABS - 1}`)).toBe(false);
  });
});

describe("closeTab", () => {
  it("removes the tab and leaves the rest", () => {
    expect(
      closeTab(
        [
          { id: "a", title: "A" },
          { id: "b", title: "B" },
        ],
        "a"
      )
    ).toEqual([{ id: "b", title: "B" }]);
  });

  it("leaves the list unchanged for an unknown id", () => {
    expect(closeTab([{ id: "a", title: "A" }], "zzz")).toEqual([
      { id: "a", title: "A" },
    ]);
  });
});

describe("documentIdFromPath", () => {
  it("finds the document id on the editor page", () => {
    expect(documentIdFromPath("/editor/abc-123")).toBe("abc-123");
  });

  it("finds the document id on a tool page", () => {
    expect(documentIdFromPath("/documents/abc-123/pdf-tools")).toBe("abc-123");
    expect(documentIdFromPath("/documents/abc-123/share")).toBe("abc-123");
  });

  it("returns null elsewhere", () => {
    expect(documentIdFromPath("/files")).toBeNull();
    expect(documentIdFromPath("/home")).toBeNull();
    expect(documentIdFromPath("/documents")).toBeNull();
  });
});
