// Draft auto-save (F35) — pure helpers.
//
// Forma's own writing surfaces keep an unsent draft in the
// browser's local storage, so a closed tab or a browser
// restart does not lose the text. Drafts are keyed per
// user + document + surface, expire after 7 days, and are
// cleared when the content is actually saved. (The
// document editor keeps its own server-side autosave —
// this covers the surfaces Forma owns itself.)

export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const DRAFT_SAVE_DEBOUNCE_MS = 500;

export interface StoredDraft {
  text: string;
  savedAt: number;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function draftStorageKey(
  userId: string,
  documentId: string,
  surface: string
): string {
  return `forma-draft:${userId}:${documentId}:${surface}`;
}

export function serializeDraft(text: string, now: number): string {
  return JSON.stringify({ text, savedAt: now });
}

/** Parse a stored draft; null when malformed, empty or
 *  older than the max age. */
export function parseDraft(raw: string | null, now: number): StoredDraft | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredDraft>;
    if (typeof parsed.text !== "string" || parsed.text.length === 0) {
      return null;
    }
    if (typeof parsed.savedAt !== "number") return null;
    if (now - parsed.savedAt > DRAFT_MAX_AGE_MS) return null;
    if (parsed.savedAt > now + 60_000) return null;
    return { text: parsed.text, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

export function readDraft(
  storage: StorageLike,
  key: string,
  now: number
): StoredDraft | null {
  try {
    return parseDraft(storage.getItem(key), now);
  } catch {
    return null;
  }
}

/** Save a draft; an empty text clears it instead. Storage
 *  failures (private mode, quota) are swallowed — a draft
 *  is a convenience, never a reason to break the surface. */
export function saveDraft(
  storage: StorageLike,
  key: string,
  text: string,
  now: number
): void {
  try {
    if (text.length === 0) {
      storage.removeItem(key);
    } else {
      storage.setItem(key, serializeDraft(text, now));
    }
  } catch {
    // Storage unavailable — the surface keeps working.
  }
}

export function clearDraft(storage: StorageLike, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Nothing to clear.
  }
}
