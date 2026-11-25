// Local reviewer notes (Day 34) — pure helpers, no server imports.
//
// A reviewer note is a private note on a document, stored in
// Forma only: it is never written into the document's file and
// never shown on a share link. Notes belong to the user who
// wrote them (RLS owner-only).

export const MAX_NOTE_BODY_CHARS = 2000;

export type DocumentNote = {
  id: string;
  documentId: string;
  workspaceId: string;
  userId: string;
  body: string;
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
};

/** Validate a note body: plain text, non-empty after trimming,
 *  at most 2000 chars (the same cap as annotation Contents).
 *  Returns the trimmed body, or throws an Error with a real
 *  reason. */
export function validateNoteBody(body: unknown): string {
  if (typeof body !== "string") {
    throw new Error("Write a note first.");
  }
  const trimmed = body.trim();
  if (trimmed.length === 0) {
    throw new Error("Write a note first.");
  }
  if (trimmed.length > MAX_NOTE_BODY_CHARS) {
    throw new Error(`A note can be at most ${MAX_NOTE_BODY_CHARS} characters.`);
  }
  return trimmed;
}
