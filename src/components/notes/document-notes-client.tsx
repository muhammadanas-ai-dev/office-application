// Reviewer notes panel (Day 34) — client component.
//
// Loads the signed-in user's own notes for the document from
// the notes API, and lets them add a note, mark one resolved /
// reopen it, and delete one. Notes live in Forma only — they
// are never written into the file and never shown on share
// links.
"use client";

import { useCallback, useEffect, useState } from "react";
import { useDraftAutosave } from "@/components/drafts/use-draft-autosave";
import { draftStorageKey } from "@/lib/draft-autosave";
import Link from "next/link";

type Note = {
  id: string;
  body: string;
  resolved: boolean;
  createdAt: string;
};

const sectionClass = "rounded-xl border border-[#dce3ec] bg-white p-4";
const inputClass =
  "w-full rounded-lg border border-[#dce3ec] bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3159c9]";
const buttonClass =
  "inline-flex h-9 items-center rounded-lg bg-[#3159c9] px-3 text-sm font-medium text-white hover:bg-[#2a4cab] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3159c9] disabled:opacity-60";
const smallButtonClass =
  "inline-flex h-7 items-center rounded-lg border border-[#dce3ec] bg-white px-2 text-xs font-medium text-[#202b3c] hover:bg-[#f4f6fa] disabled:opacity-60";

export function DocumentNotesClient({
  document,
  userId,
}: {
  document: { id: string; title: string };
  userId: string;
}) {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  // Draft auto-save (F35): an unsent note survives a closed
  // tab or a browser restart (local storage, 7-day expiry).
  const {
    restoredAt,
    dismissRestored,
    clear: clearSavedDraft,
  } = useDraftAutosave({
    storageKey: draftStorageKey(userId, document.id, "note"),
    value: draft,
    onRestore: setDraft,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/documents/${document.id}/notes`);
      const data = (await response.json().catch(() => ({}))) as {
        notes?: Note[];
        error?: unknown;
      };
      if (!response.ok) {
        throw new Error(
          typeof data.error === "string" && data.error
            ? data.error
            : "Could not load the notes."
        );
      }
      setNotes(Array.isArray(data.notes) ? data.notes : []);
      setLoadError(null);
    } catch (loadErr) {
      setLoadError(
        loadErr instanceof Error ? loadErr.message : "Could not load the notes."
      );
    }
  }, [document.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onAdd(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const response = await fetch(`/api/documents/${document.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: draft }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: unknown;
      };
      if (!response.ok) {
        throw new Error(
          typeof data.error === "string" && data.error
            ? data.error
            : "Could not save the note."
        );
      }
      setDraft("");
      clearSavedDraft();
      await load();
    } catch (addErr) {
      setError(
        addErr instanceof Error ? addErr.message : "Could not save the note."
      );
    } finally {
      setBusy(false);
    }
  }

  async function onToggle(note: Note) {
    setError(null);
    try {
      const response = await fetch(
        `/api/documents/${document.id}/notes/${note.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resolved: !note.resolved }),
        }
      );
      if (!response.ok) throw new Error("Could not update the note.");
      await load();
    } catch (toggleErr) {
      setError(
        toggleErr instanceof Error
          ? toggleErr.message
          : "Could not update the note."
      );
    }
  }

  async function onDelete(note: Note) {
    setError(null);
    try {
      const response = await fetch(
        `/api/documents/${document.id}/notes/${note.id}`,
        { method: "DELETE" }
      );
      if (!response.ok) throw new Error("Could not delete the note.");
      await load();
    } catch (deleteErr) {
      setError(
        deleteErr instanceof Error
          ? deleteErr.message
          : "Could not delete the note."
      );
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-[#202b3c]">
          Notes — {document.title}
        </h1>
        <p className="mt-1 text-sm text-[#667389]">
          Your private reviewer notes on this document. They are stored in Forma
          only — never written into the file, and never shown on a share link.{" "}
          <Link href="/files" className="text-[#3159c9] hover:underline">
            Back to files
          </Link>
        </p>
      </div>

      <section className={sectionClass} aria-labelledby="add-note-heading">
        <h2
          id="add-note-heading"
          className="text-sm font-semibold text-[#202b3c]"
        >
          Add a note
        </h2>
        <form onSubmit={onAdd} className="mt-3 space-y-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Write a note…"
            className={inputClass}
            aria-label="Note text"
          />
          {restoredAt ? (
            <p className="flex flex-wrap items-center gap-2 text-xs text-[#667389]">
              Draft restored from{" "}
              {new Date(restoredAt).toLocaleString("en-GB")} — it is saved
              in this browser until you add the note.
              <button
                type="button"
                onClick={() => {
                  setDraft("");
                  clearSavedDraft();
                  dismissRestored();
                }}
                className="text-[#3159c9] hover:underline"
              >
                Discard draft
              </button>
            </p>
          ) : null}
          <button type="submit" disabled={busy} className={buttonClass}>
            {busy ? "Saving…" : "Add note"}
          </button>
          {error ? (
            <p role="alert" className="text-xs text-[#b3261e]">
              {error}
            </p>
          ) : null}
        </form>
      </section>

      <section className={sectionClass} aria-labelledby="notes-list-heading">
        <h2
          id="notes-list-heading"
          className="text-sm font-semibold text-[#202b3c]"
        >
          Your notes
        </h2>
        {loadError ? (
          <p role="alert" className="mt-2 text-xs text-[#b3261e]">
            {loadError}
          </p>
        ) : notes === null ? (
          <p className="mt-2 text-xs text-[#667389]">Loading…</p>
        ) : notes.length === 0 ? (
          <p className="mt-2 text-xs text-[#667389]">
            No notes yet. Add your first note above.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {notes.map((note) => (
              <li
                key={note.id}
                className="rounded-lg border border-[#dce3ec] p-3"
              >
                <p
                  className={`whitespace-pre-wrap text-sm text-[#202b3c] ${
                    note.resolved ? "line-through opacity-60" : ""
                  }`}
                >
                  {note.body}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-[#667389]">
                    {new Date(note.createdAt).toLocaleString()}
                    {note.resolved ? " · Resolved" : ""}
                  </span>
                  <button
                    type="button"
                    className={smallButtonClass}
                    onClick={() => void onToggle(note)}
                  >
                    {note.resolved ? "Reopen" : "Resolve"}
                  </button>
                  <button
                    type="button"
                    className={smallButtonClass}
                    onClick={() => void onDelete(note)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
