# office-application

**Forma Office** — Documents, made precise.

A WPS-inspired web office workspace: create, edit, organize and
share professional documents in one clear workspace.
Writer-first. Built with Next.js 16 (App Router), TypeScript,
Tailwind CSS v4 and Supabase (Auth, Postgres + RLS, Storage).

## What it does

- **Document library** — create, rename, move, delete,
  duplicate, star and upload documents (Word, spreadsheet,
  presentation, PDF, images).
- **Editors** — ONLYOFFICE Docs for Word, spreadsheet and
  presentation files (12 formats), with version history on
  every save.
- **PDF tools** — export, merge, split, rotate, compress,
  edit text (keeping the original fonts and colours), fill
  forms, build forms, annotate (highlight, underline,
  strikeout, notes, freehand), add page numbers, crop,
  hyperlinks, text and shapes, and password-protect with
  permissions (qpdf, AES-256).
- **OCR** — read text from scanned PDFs and images
  (Tesseract, English / Urdu / Arabic), then make the PDF
  searchable (an invisible text layer) or extract its text.
- **Conversion** — convert between the supported formats
  (ONLYOFFICE ConvertService).
- **Templates** — original resume, letter and report
  templates, plus real blank Word / spreadsheet /
  presentation files.
- **Sharing** — a shareable link per document (`/s/<token>`,
  revocable, 1/7/30 days or never); anyone with the link can
  download the document, no account needed.
- **Settings** — per-user preferences (OCR default language,
  image export format and DPI).
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
Supabase Dashboard SQL Editor, in order. The app also needs
a local ONLYOFFICE Document Server for the editors and the
conversion/export features (see `docs/`), and `qpdf`,
`pdftoppm` and `zip` installed for the PDF security and
image-export features.

## Tests

```bash
npm test            # unit tests (Vitest)
npm run test:live   # live Supabase checks (needs .env.local)
```

The live end-to-end harnesses live in `scripts/e2e-*-test.mjs`.

## Docs

- `docs/project-brief/` — the project brief, the feature
  audit and the feature loop (one feature at a time, deeply).
- `docs/handoffs/` — a handoff per day of work, with the
  research, the decisions, the tests and the known limits.
- `docs/known-limitations.md` — what is not built yet, and
  the honest limits of what is.

## Licence

Forma Office is a clean-room implementation — no WPS code,
logos or templates are used. ONLYOFFICE Docs Community
Edition is AGPLv3; a proprietary commercial launch needs
the Developer licence and a legal review.
