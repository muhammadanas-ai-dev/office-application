import { describe, expect, it } from "vitest";
import {
  DRAFT_MAX_AGE_MS,
  clearDraft,
  draftStorageKey,
  parseDraft,
  readDraft,
  saveDraft,
  serializeDraft,
  type StorageLike,
} from "@/lib/draft-autosave";

function fakeStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

const NOW = 1_800_000_000_000;

describe("draft auto-save (F35)", () => {
  it("keys drafts per user, document and surface", () => {
    expect(draftStorageKey("u1", "d1", "note")).toBe("forma-draft:u1:d1:note");
    expect(draftStorageKey("u1", "d1", "note")).not.toBe(
      draftStorageKey("u2", "d1", "note")
    );
  });

  it("round-trips a draft and clears it on empty text", () => {
    const storage = fakeStorage();
    const key = draftStorageKey("u1", "d1", "note");
    saveDraft(storage, key, "half-written note", NOW);
    expect(readDraft(storage, key, NOW + 1000)?.text).toBe(
      "half-written note"
    );
    saveDraft(storage, key, "", NOW + 2000);
    expect(readDraft(storage, key, NOW + 3000)).toBeNull();
    saveDraft(storage, key, "again", NOW);
    clearDraft(storage, key);
    expect(readDraft(storage, key, NOW)).toBeNull();
  });

  it("expires drafts after 7 days and refuses malformed values", () => {
    expect(
      parseDraft(serializeDraft("old", NOW - DRAFT_MAX_AGE_MS - 1), NOW)
    ).toBeNull();
    expect(
      parseDraft(serializeDraft("fresh", NOW - DRAFT_MAX_AGE_MS + 1), NOW)
        ?.text
    ).toBe("fresh");
    expect(parseDraft("not json", NOW)).toBeNull();
    expect(parseDraft('{"text":5,"savedAt":1}', NOW)).toBeNull();
    expect(parseDraft('{"text":"x","savedAt":99999999999999}', NOW)).toBeNull();
    expect(parseDraft(null, NOW)).toBeNull();
  });

  it("survives a throwing storage", () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };
    expect(readDraft(broken, "k", NOW)).toBeNull();
    expect(() => saveDraft(broken, "k", "x", NOW)).not.toThrow();
    expect(() => clearDraft(broken, "k")).not.toThrow();
  });
});
