# Forma Office

**Forma Office** — Documents, made precise.

A WPS-inspired web office workspace: create, edit, organize and
share professional documents in one clear workspace.
Writer-first. Built with Next.js 16 (App Router), TypeScript,
Tailwind CSS v4 and Supabase (Auth, Postgres + RLS, Storage).

> **Status — 2026-11-26:** Days 1–34 complete, plus the
> checklist completion run **F19–F38** (20 features). Full unit
> suite: **520 passed / 0 failed / 9 skipped**. Feature audit:
> 164 done, 11 skipped by owner decision, ~6 partial, 4 not
> started. See `docs/handoffs/checklist-completion-run.md`.

## What it does

- **Document library** — create, rename, move, delete,
  duplicate, star and upload documents (Word, spreadsheet,
  presentation, PDF, images, WEBP and TIFF). Drag-and-drop
  upload, document tabs, batch export and batch page tools.
- **Editors** — ONLYOFFICE Docs for Word, spreadsheet and
  presentation files (12 formats), with version history on
  every save.
- **PDF tools** — export, merge, split, rotate, compress,
  resize pages, page labels, repair (qpdf), edit text
  (keeping the original fonts and colours), fill forms,
  build forms, annotate (highlight, underline, strikeout,
  notes, freehand), import comments from another PDF,
  export with comments (flattened copy + summary page),
  add page numbers, crop, hyperlinks, text and shapes,
  stamps and watermarks, insert pages from an image,
  insert an image onto existing pages, and
  password-protect with permissions (qpdf, AES-256).
- **PDF search, viewer and extraction** — full-text search
  inside a PDF, a finished viewer (outline, thumbnails,
  zoom / fit, read modes, full screen, print view with
  comments), extract embedded images, extract tables as
  CSV, extract text, and export a PDF to text-based
  XLSX or PPTX.
- **Redaction** — mark regions and permanently remove the
  underlying text and images, verified after a qpdf rebuild.
- **OCR** — read text from scanned PDFs and images
  (Tesseract, English / Urdu / Arabic), then make the PDF
  searchable (an invisible text layer) or extract its text.
- **Conversion** — convert between the supported formats
  (ONLYOFFICE ConvertService).
- **Templates** — 9 original templates (resume, letter,
  report and more), real blank Word / spreadsheet /
  presentation files, and save your own documents as
  custom templates.
- **Sharing** — a shareable link per document (`/s/<token>`,
  revocable, 1/7/30 days or never); anyone with the link can
  download the document, no account needed. Local reviewer
  notes stay private to the owner and are never written
  into the file or shown on share links.
- **Document properties** — library facts for every document
  and editing of the PDF information dictionary (title,
  author, subject, keywords), saved as a new version.
- **Settings** — per-user preferences: OCR default language,
  image export format and DPI, theme (light / dark / system),
  locale, date and number formats, accessibility options
  (reduce motion, larger text, high contrast), a keyboard
  shortcuts reference, and your own uploaded fonts
  (TTF/OTF) for use in Forma's PDF tools.
- **Drafts** — auto-save and recovery for reviewer notes and
  Draw-page text (7-day, per-user, on-device).
- **Versions** — every version of a document, with download
  and restore (restoring creates a new version, never
  overwrites).

## Run it locally

```bash
npm install
cp .env.example .env.local   # fill in your Supabase keys
npm run dev                  # http://localhost:3000
```

Apply the migrations in `supabase/migrations/` in the
Supabase Dashboard SQL Editor, in order.

Two migrations are still owner-pending as of 2026-11-26:

1. `forma-document-notes-migration.sql` — the Day 34
   `document_notes` table (reviewer notes live round-trip).
2. `forma-checklist-completion-migrations.sql` — F32
   appearance columns, the F33 `user_fonts` table, and the
   F34 storage bucket allowlist for WEBP/TIFF. Run it once;
   everything in it is idempotent.

The app also needs a local ONLYOFFICE Document Server for
the editors and the conversion/export features (see
`docs/`), and `qpdf`, `pdftoppm`, Ghostscript, `pdfimages`
and `zip` installed for the PDF security, repair, image
and extraction features.

## Tests

```bash
npm test            # unit tests (Vitest) — 520 passed at F38
```

The live end-to-end harnesses live in `scripts/e2e-*-test.mjs`
and run against a real signed-in user and Supabase project.

## Known limits

- No public deployment yet: Vercel deployment is blocked on
  team-scope access for the owner's account; the app runs
  locally for now.
- The ONLYOFFICE Document Server is not currently installed
  in this environment, so editor / export / conversion live
  proofs are blocked until it is reinstalled.
- Skipped by owner decision: AI features, cloud quota /
  sync / multi-user collaboration and billing UI, and
  e-signatures (deferred for legal reasons).
- Still not started (4 audit rows): read-only /
  restricted-editing mode, move/delete editable text
  objects, edit vector objects, minimal audit events.
- Full detail: `docs/known-limitations.md`.

## Docs

- `docs/project-brief/` — the project brief, the feature
  audit and the feature loop (one feature at a time, deeply).
- `docs/handoffs/` — a handoff per day of work, with the
  research, the decisions, the tests and the known limits.
  Latest: `docs/handoffs/checklist-completion-run.md`.
- `docs/known-limitations.md` — what is not built yet, and
  the honest limits of what is.

## Licence

Forma Office is a clean-room implementation — no WPS code,
logos or templates are used. ONLYOFFICE Docs Community
Edition is AGPLv3; a proprietary commercial launch needs
the Developer licence and a legal review.
