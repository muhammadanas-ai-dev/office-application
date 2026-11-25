# Day 34 plan — Export with comments + local reviewer notes

The next item of the follow-up list (Day 33 handoff §6): the
Day 25 half of audit §10.1 — "export with comments" and "local
reviewer notes". Day 25 shipped only the share-link half; this
half needs a comments/notes model, which did not exist then.
Prepared 2026-11-25 (morning look) as feature-loop steps 1–2
(research + plan). No code written yet — implementation starts
on the owner's go-ahead.

## 1. Research (done)

- **The audit never defined these two sub-features**, so this
  plan defines them from what Forma already has and what WPS
  does. The definitions below are the one thing to confirm
  with the owner before implementing (see §4).
- **Annotations live IN the PDF** (Day 17): standard
  annotation dicts on each page's /Annots array — highlight,
  underline, strikeout (QuadPoints), note (Text, 20×20 icon),
  ink (InkList). They travel with the file and open in any
  PDF reader.
- **Reading them back is proven**: `listAnnotationsInPdf` in
  `src/lib/pdf-annotate.ts` returns every annotation in page
  order with page, index, subtype, Rect, QuadPoints, InkList,
  Contents, colour, author (/T) and date (/M). The GET
  `/api/documents/[id]/pdf/annotations` route already serves
  that list. Nothing new is needed to *read* comments.
- **pdf-lib has no annotation-flattening API** (the same
  lesson as Day 17, where the dicts are built by hand).
  Flattening is a Forma-own drawing job, the way Day 32 drew
  watermarks/stamps into page content: `page.drawRectangle`
  (with opacity) for highlight quads, `page.drawLine` for
  underline/strikeout baselines and for ink strokes
  (consecutive InkList points). QuadPoints are in
  [top-left, top-right, bottom-left, bottom-right] order
  (Day 17 note) and must be converted to PDF bottom-left
  coordinates before drawing.
- **A note annotation has no printable geometry** beyond its
  20×20 icon, so its text cannot be flattened into the page
  it sits on. Notes are carried by the comments summary
  instead (see §2). That is an honest limit, recorded below.
- **"Local" means single-user, in Forma** (audit §10.1 is the
  single-user sharing item; multi-user co-editing stays
  skipped). Reviewer notes are per-document notes owned by
  the app, visible only to the document's owner — they are
  NOT written into the file and NOT shown on share links.
  No `document_notes` / `document_comments` table exists yet
  (checked 2026-11-25); it needs a migration, in the
  `20261118090000_forma_shares.sql` pattern (RLS
  owner-only, `app_private.is_workspace_member` one-argument
  form — the Day 25 lesson: the two-argument form fails
  42883).
- **The migration pattern is owner-applied** (Days 24/25/31):
  the migration file ships in the repo and a copy is sent to
  the owner; the live e2e runs after he applies it. The
  export half needs no migration and can be proven first.
- **WPS parallel (for the definition, not a clone):** WPS
  exports comments as a printed markup view and as a
  comments list; Forma-own is a flattened copy plus a
  summary page appended at the end. No engine change — the
  ONLYOFFICE docserver is still down, so this is pure
  pdf-lib work on the file, like Days 17–22 and 32–33.

## 2. The feature (scope)

| Piece | Behaviour |
|---|---|
| Export with comments — flattened copy | A new version of the PDF with the markup drawn into the page content: highlight quads as translucent rectangles in the annotation's own colour, underline/strikeout as lines at the quad baseline, ink strokes redrawn as polylines. The annotation dicts are then removed, so the copy prints and renders identically in every reader. Note annotations are NOT drawn (no printable geometry) — their text goes in the summary. |
| Export with comments — summary page | A page appended at the end of the flattened copy listing every annotation in page order: page number, kind, author and date when the dict carries them, and the Contents text (truncated at 200 chars in the list). A document with no annotations is refused with a real reason ("This document has no comments to export"). |
| Local reviewer notes | A Notes panel on the document page: add a note (plain text, at most 2000 chars, the same cap as annotation Contents), list the document's notes newest first, mark a note resolved / reopen it, delete a note. Notes belong to the document's owner only (RLS), are never written into the file, and never appear on the public share page. |
| Route (export) | `POST /api/documents/[id]/pdf/export-comments` (JSON body: `{ mode: "flattened" }` — one mode, both outputs in one file). Zod validation + the shared rate limiter + `saveNewVersion`, the Day 17/32 pattern. A document with no annotations is refused (400). |
| Route (notes) | `GET/POST /api/documents/[id]/notes` and `PATCH/DELETE /api/documents/[id]/notes/[noteId]` (the Day 4 library-route pattern: workspace membership check, Zod body, RLS owner-only). |
| UI | The PDF tools page gains an "Export with comments" section (one button, shows the annotation count from the existing annotations GET, refused clearly when zero). The document page gains a Notes panel next to the existing actions. |
| Errors | No annotations (400), a note over 2000 chars (400), an empty note (400), a note on someone else's document (404), signed-out (307 to login). |

**Honest limits to record:** note annotations are not drawn
into the flattened pages — their text lives only on the
summary page; the summary page is plain text (no clickable
jump back to the page); reviewer notes are owner-only and
never leave Forma (they do not travel with a download or a
share link); the flattened copy removes the annotation dicts,
so the copy cannot be un-flattened — restore the earlier
version instead (the page says so).

## 3. Small tasks (in order)

1. **Pure function — flatten.** `flattenAnnotationsInPdf` in
   `src/lib/pdf-annotate.ts` (bytes): list the annotations
   (the existing `listAnnotationsInPdf`), draw highlight
   quads / underline / strikeout / ink into the page
   content, remove the annotation dicts, return the new
   bytes. Throws AnnotateError(400, …) when there are no
   annotations; never modifies the input bytes. Test: the
   unit tests below.
2. **Pure function — summary page.** `appendCommentsSummaryInPdf`
   in `src/lib/pdf-annotate.ts` (bytes, annotations): append
   one page at the end listing every annotation (page, kind,
   author/date when present, Contents truncated at 200
   chars). Test: the unit tests below.
3. **Route — export.** `POST
   /api/documents/[id]/pdf/export-comments`: load the
   current version, flatten, append the summary, save as a
   new version (the Day 17/32 pattern). Test: the live e2e.
4. **Migration — notes.** `supabase/migrations/
   20261125010000_forma_document_notes.sql`: a
   `document_notes` table (id, document_id, user_id, body,
   resolved, created_at, updated_at) with RLS owner-only in
   the one-argument helper form. A copy is sent to the owner
   to apply (the Days 24/25/31 pattern). Test: the live e2e
   after he applies it.
5. **Pure functions — notes.** `validateNoteBody` and the
   note row type in `src/lib/document-notes.ts` (body at most
   2000 chars, non-empty after trim). Test: the unit tests
   below.
6. **Routes — notes.** `GET/POST /api/documents/[id]/notes`
   and `PATCH/DELETE /api/documents/[id]/notes/[noteId]`
   (workspace membership + RLS owner-only). Test: the live
   e2e.
7. **UI — export.** The "Export with comments" section on
   the PDF tools page (`src/components/pdf-tools/
   pdf-tools-client.tsx`): the annotation count from the
   existing annotations GET, one button, the result via
   `runVersionTool`. Test: the live e2e (the section and the
   count are present).
8. **UI — notes.** A Notes panel on the document page: the
   add form, the list (newest first, resolved shown struck
   through), resolve/reopen and delete buttons. Test: the
   live e2e (the panel renders and a note round-trips).
9. **Unit tests.** In `src/lib/pdf-annotate.test.ts`: the
   flattened copy has the highlight drawn and no Annots
   left, the summary page lists every annotation in order,
   the rejections (no annotations). In a new
   `src/lib/document-notes.test.ts`: the body validation
   (empty, over 2000 chars, exactly 2000 chars passes).
   Test: the suite passes.
10. **Live e2e.** A Day 34 harness
    (`scripts/e2e-export-comments-test.mjs`, the Day 17/19
    pattern): upload a PDF, add a highlight + a note, export
    (the page count grows by one, the flattened page carries
    the highlight, the summary lists both, the old version
    is untouched), export with no annotations is refused
    (400), notes add/list/resolve/delete round-trip,
    cross-user isolation (404), signed-out 307. Runs after
    the owner applies the notes migration. Test: the harness
    passes.
11. **Docs + commit + handoff + reply.** Feature matrix, the
    known limitations, CHANGELOG, audit §10.1 → Done (both
    halves), the loop queue (add a Day 34 row), MEMORY.md,
    the handoff, the commit on
    `day-34-export-comments-notes`, the GitHub snapshot push,
    the reply.

## 4. The one thing to confirm before implementing

The audit never defined these two sub-features, so the
definitions in §2 are a proposal: (a) "export with comments"
= one flattened copy with a comments summary page appended;
(b) "local reviewer notes" = owner-only notes stored in
Forma, never in the file and never on share links. If the
owner wants a different shape (for example notes inside the
file, or the summary as a separate download instead of an
appended page), say so and the plan changes before any code.
