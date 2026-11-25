// Local reviewer notes server wiring (Day 34) — server-only.
//
// Notes live in the document_notes table, owned by the user who
// wrote them (RLS owner-only). They are never written into the
// document's file and never shown on a share link. The document
// itself is loaded through the user's client (RLS), so a note
// can only be added to a document the user can access.
import "server-only";
import { PdfEditError } from "@/lib/pdf-edit";
import { fetchEditableDocument } from "@/lib/pdf-edit.server";
import { createClient } from "@/lib/supabase/server";
import { validateNoteBody, type DocumentNote } from "@/lib/document-notes";

type NotesClient = Awaited<ReturnType<typeof createClient>>;

export async function getNotesClient(): Promise<NotesClient> {
  return createClient();
}

export async function getNotesUser(): Promise<{ id: string }> {
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw new PdfEditError(401, "Sign in to use notes.");
  return { id: user.id };
}

type NoteRow = {
  id: string;
  document_id: string;
  workspace_id: string;
  user_id: string;
  body: string;
  resolved: boolean;
  created_at: string;
  updated_at: string;
};

function toNote(row: NoteRow): DocumentNote {
  return {
    id: row.id,
    documentId: row.document_id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    body: row.body,
    resolved: row.resolved,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const NOTE_COLUMNS =
  "id, document_id, workspace_id, user_id, body, resolved, created_at, updated_at";

/** A missing table (the migration not applied yet) becomes a
 *  clear setup message, not a 500. */
function notesTableError(error: { code?: string }): PdfEditError | null {
  if (
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    error.code === "42703"
  ) {
    return new PdfEditError(
      400,
      "Notes are not set up yet — run forma-document-notes-migration.sql in the Supabase Dashboard SQL Editor, then try again."
    );
  }
  return null;
}

/** List the user's own notes for a document, newest first. */
export async function listNotes(
  userClient: NotesClient,
  documentId: string
): Promise<DocumentNote[]> {
  const document = await fetchEditableDocument(userClient, documentId);
  const { data, error } = await userClient
    .from("document_notes")
    .select(NOTE_COLUMNS)
    .eq("document_id", document.id)
    .order("created_at", { ascending: false });
  if (error) {
    throw (
      notesTableError(error) ??
      new PdfEditError(500, "Could not load the notes.")
    );
  }
  return ((data ?? []) as NoteRow[]).map(toNote);
}

/** Add a note to a document. The body is validated (plain text,
 *  non-empty, at most 2000 chars). */
export async function createNote(
  userClient: NotesClient,
  documentId: string,
  userId: string,
  body: unknown
): Promise<DocumentNote> {
  let validated: string;
  try {
    validated = validateNoteBody(body);
  } catch (error) {
    throw new PdfEditError(
      400,
      error instanceof Error ? error.message : "Write a note first."
    );
  }
  const document = await fetchEditableDocument(userClient, documentId);
  const { data, error } = await userClient
    .from("document_notes")
    .insert({
      document_id: document.id,
      workspace_id: document.workspace_id,
      user_id: userId,
      body: validated,
    })
    .select(NOTE_COLUMNS)
    .single();
  if (error || !data) {
    throw (
      (error ? notesTableError(error) : null) ??
      new PdfEditError(500, "Could not save the note.")
    );
  }
  return toNote(data as NoteRow);
}

/** Update one of the user's own notes (resolve / reopen, or edit
 *  the body). A note that is not theirs — or does not exist —
 *  is a 404. */
export async function updateNote(
  userClient: NotesClient,
  documentId: string,
  noteId: string,
  userId: string,
  patch: { resolved?: boolean; body?: unknown }
): Promise<DocumentNote> {
  const document = await fetchEditableDocument(userClient, documentId);
  const update: { resolved?: boolean; body?: string; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };
  if (patch.resolved !== undefined) update.resolved = patch.resolved;
  if (patch.body !== undefined) {
    try {
      update.body = validateNoteBody(patch.body);
    } catch (error) {
      throw new PdfEditError(
        400,
        error instanceof Error ? error.message : "Write a note first."
      );
    }
  }
  const { data, error } = await userClient
    .from("document_notes")
    .update(update)
    .eq("id", noteId)
    .eq("document_id", document.id)
    .eq("user_id", userId)
    .select(NOTE_COLUMNS)
    .maybeSingle();
  if (error) {
    throw (
      notesTableError(error) ??
      new PdfEditError(500, "Could not update the note.")
    );
  }
  if (!data) throw new PdfEditError(404, "That note does not exist.");
  return toNote(data as NoteRow);
}

/** Delete one of the user's own notes. */
export async function deleteNote(
  userClient: NotesClient,
  documentId: string,
  noteId: string,
  userId: string
): Promise<void> {
  const document = await fetchEditableDocument(userClient, documentId);
  const { data, error } = await userClient
    .from("document_notes")
    .delete()
    .eq("id", noteId)
    .eq("document_id", document.id)
    .eq("user_id", userId)
    .select("id");
  if (error) {
    throw (
      notesTableError(error) ??
      new PdfEditError(500, "Could not delete the note.")
    );
  }
  if (!data || data.length === 0) {
    throw new PdfEditError(404, "That note does not exist.");
  }
}
