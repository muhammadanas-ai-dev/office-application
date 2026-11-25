# Day 34 handoff — Export with comments + local reviewer notes

Date: 2026-11-26 (owner instruction 2026-11-25 07:34 PKT,
confirmed by his tap at 01:07 PKT: "Go ahead — implement it
as planned"). The Day 25 half of audit §10.1 — "export with
comments" and "local reviewer notes". Day 25 shipped only the
share-link half. The plan (research + scope + 11 small tasks)
was prepared in the 2026-11-25 morning look and approved by
the owner as written — the definitions in the plan §2 are the
ones built.

## 1. What was built

**Export with comments** (no migration needed):
- `flattenAnnotationsInPdf` in `src/lib/pdf-annotate.ts`:
  lists the annotations (the existing `listAnnotationsInPdf`),
  draws the highlight quads as translucent rectangles in the
  annotation's own colour, the underline/strikeout as lines,
  and the ink strokes as polylines, then removes every
  annotation dict. Note annotations are NOT drawn (a note has
  no printable geometry beyond its icon). Throws
  AnnotateError(400, "This document has no comments to
  export.") when there are none; never modifies the input.
- `appendCommentsSummaryInPdf` in the same module: appends a
  summary page (more if needed) listing every annotation in
  page order — page, kind, author/date when the dict carries
  them, the Contents text truncated at 200 chars. It also
  strips the empty Annots array pdf-lib writes on a freshly
  added page, so the exported copy carries no Annots key at
  all.
- `POST /api/documents/[id]/pdf/export-comments` (JSON body
  `{ mode: "flattened" }`): flatten + summary + `saveNewVersion`
  (the Day 17/32 pattern). A document with no annotations is
  refused (400).
- The PDF tools page gains an "Export with comments" section:
  it fetches the annotation count from the existing
  annotations GET, disables the button at zero, and says the
  flattened copy cannot be un-flattened.

**Local reviewer notes** (migration owner-applied):
- Migration `supabase/migrations/20261125010000_forma_document_notes.sql`:
  a `document_notes` table (id, document_id, workspace_id,
  user_id, body, resolved, created_at, updated_at) with RLS
  owner-only (`user_id = auth.uid()` + workspace membership
  on select/insert; the one-argument helper form) and the
  GRANTS section. A copy is sent to the owner as
  `~/workspace/your_files/forma-document-notes-migration.sql`.
- `src/lib/document-notes.ts`: `validateNoteBody` (plain
  text, non-empty after trim, at most 2000 chars — the same
  cap as annotation Contents) + the `DocumentNote` type.
- `src/lib/document-notes.server.ts`: list/create/update/
  delete through the user's client (RLS); a missing table
  becomes a clear setup message (400), not a 500.
- Routes: `GET/POST /api/documents/[id]/notes` and
  `PATCH/DELETE /api/documents/[id]/notes/[noteId]`.
- UI: a "Notes" link in the document actions (always
  available) + a notes page
  (`/documents/[id]/notes`) with the add form and the list
  (newest first, resolved shown struck through, Resolve /
  Reopen and Delete buttons).

## 2. Tests

- **Unit: 443 passed, 2 failed, 9 skipped.** The 7 new tests
  pass (3 in pdf-annotate.test.ts: the flatten removes every
  annotation and keeps the original untouched, the
  no-annotations rejection, the summary lists every annotation
  in order; 4 in document-notes.test.ts: the body validation).
  **The 2 failures are pre-existing and not Day 34 code**:
  `pdf-edit.test.ts` (editTextInPdf) and `pdf-form.test.ts`
  (fillPdfForm) both shell out to `qpdf`, which a VM reset
  wiped; the apt mirror is too slow through the egress proxy
  to reinstall it in this session (a system `apt-get update`
  held the lock for 5+ minutes and never finished). The same
  2 failures were recorded on Day 28 for the same reason.
  Reinstall qpdf (`sudo apt-get install qpdf`) and they pass.
- **Build passes** (the export-comments route, both notes
  routes and the notes page are in the route table).
- **Live e2e (export half) CLOSED 2026-11-26 (13/13)** via
  `scripts/e2e-export-comments-test.mjs`: annotate (a
  highlight + a note), the tools page offers the section,
  export (version 3, 4 pages, the summary lists both comments,
  no annotations left in the copy), no-comments refused (400),
  cross-user isolation (404), signed-out 307, and — the table
  not existing yet — the notes route's clear setup message
  (400). Two harness notes: (1) the first run's "Annots still
  present" failure was the harness counting pages with an
  Annots KEY (an empty array on the summary page) instead of
  annotation dicts — the check now counts dicts, and the
  summary function strips the empty array anyway; (2) the
  notes round-trip checks SKIP (not fail) until the owner
  applies the migration.
- **The notes round-trip is still owed**: after the owner
  applies the migration, re-run the harness — the notes
  add/list/resolve/delete + cross-user checks then run.
- The app was down when the harness started (a VM reset);
  restarted with the Day 34 build; `/` 200.

## 3. Docs

- Feature matrix FORMA-042 + FORMA-043, known-limitations
  (the export/notes limits), CHANGELOG (Day 34), the audit
  §9 rows → Done + the §16 item 10 note, FEATURE_LOOP item
  18 → Done. MEMORY.md: add Day 34.

## 4. Honest limits

- Note annotations are not drawn into the flattened pages —
  their text lives only on the summary page.
- The summary page is plain text (no clickable jump back to
  the page).
- The flattened copy removes the annotation dicts, so it
  cannot be un-flattened — restore an earlier version.
- Reviewer notes are owner-only and never leave Forma: they
  do not travel with a download or a share link.

## 5. Still owed after Day 34

- **The owner applies the notes migration** (attached to the
  delivery reply), then the notes round-trip e2e runs.
- The follow-up list, in order: deleting the /plan route, a
  live 390px render, the docserver reinstall. AI tools and
  cloud/collaboration/billing stay SKIPPED unless the owner
  restarts them.
- **Vercel deploy still blocked** (the team
  re-authorization). The app runs only on this VM at
  localhost:3000, which the owner cannot open from his own
  browser. The owner can run it on his own machine from the
  GitHub repo, or unblock Vercel.
- qpdf is missing on this VM (wiped by a reset; the apt
  mirror is too slow to reinstall it right now) — the PDF
  security page will report it missing until it is back, and
  the 2 qpdf unit tests fail until then.
