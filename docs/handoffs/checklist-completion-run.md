# Checklist completion run (F19–F38) — handoff

**Date:** 2026-11-26. **Branch:** `checklist-completion` (local
commits only — nothing pushed, per the owner's instruction).
**Instruction:** build every remaining buildable checklist
feature, one at a time, full loop each (research → plan →
implement → test), production-grade; skip blocked items,
cloud/AI (owner-skipped), and anything needing a permission;
deliver ONE combined SQL file at the end.

## What shipped (20 features)

| # | Feature | Unit | Live e2e |
|---|---------|------|----------|
| F19 | /plan route deleted; all bare console.error swept onto logError | suite green | /plan 404 verified |
| F20 | PDF text search (API + Annotate UI) | 10 | 9/9 |
| F21 | Viewer finished: outline, thumbnails, zoom/fit, read modes, full screen | 4 | 4/4 regression |
| F22 | Extract embedded images (ZIP) | +1 | 5/5 |
| F23 | Extract tables (CSV ZIP) | 7 | 6/6 |
| F24 | PDF → XLSX (text-based) | 5 | 7/7 |
| F25 | PDF → PPTX (text-based) | 5 | 6/6 |
| F26 | Redaction (true removal + qpdf rebuild) | 7 | 8/8 |
| F27 | Page resize (presets + scale) | 4 | 8/8 |
| F28 | Batch export (≤10 PDFs → ZIP) | 3 | 8/8 |
| F29 | Document properties + PDF metadata edit | 4 | 8/8 |
| F30 | Import comments from another PDF | 2 | 7/7 |
| F31 | Print view (pages + comments) | — | 4/4 |
| F32 | Settings pack (theme/locale/formats/shortcuts/accessibility) | 4 | 7/7 |
| F33 | User fonts (upload, favourites/recent, draw with them) | 4 | 5/5 |
| F34 | WEBP/TIFF uploads + images-to-PDF decode | 6 | 4/4 |
| F35 | Draft auto-save + recovery (notes + draw text) | 4 | 4/4 |
| F36 | Batch page operations + PDF repair | 2 | 6/6 |
| F37 | Page labels | 4 | 5/5 |
| F38 | Insert image onto existing pages | 2 | 5/5 |

Full unit suite at the end: **520 passed / 0 failed / 9
skipped** (was 443 passed at Day 34).

## The one owner action

Run `~/workspace/your_files/forma-checklist-completion-migrations.sql`
ONCE in the Supabase SQL Editor. It activates: F32 appearance
persistence, F33 the user_fonts table, F34 WEBP/TIFF uploads
(bucket allowlist). Everything is idempotent. The Day 34
notes migration (separate file, delivered 2026-11-26) is
still pending too — after it runs, re-run
`scripts/e2e-export-comments-test.mjs` for the notes
round-trip, and `scripts/e2e-fonts-test.mjs` /
`scripts/e2e-appearance-test.mjs` flip from setup-notice
checks to full checks.

## Still blocked / not built (unchanged, honest)

- Document server (ONLYOFFICE) reinstall — .deb download 403.
  Everything "via the editor" stays API-proven only.
- Vercel deploy — team-scope 403 on the owner's account;
  dashboard import is his move.
- Signatures — deferred (legal decision).
- AI + cloud/collaboration/billing — skipped by his decision.
- Audit rows still ❌ (4): read-only/restricted-editing mode,
  move/delete text objects (edit ✅, redaction covers
  removal), edit vector objects, minimal audit events.
