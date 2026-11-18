# Day 06 — Handoff (Phase A of the WPS-level plan)

- Date: 2026-11-17 (late night)
- Version label: day-06
- Branch: day-06-wps-level
- Commit SHA: db31503
- Vercel Preview URL: NOT PERFORMED — no Vercel/Git remote access
- Production URL (only if promoted): none
- Office engine version/edition: ONLYOFFICE Docs 10.0.0 Community
  (AGPLv3), DEB install on this VM — unchanged from Day 5.

## 1. What was researched

- Owner direction (2026-11-17 23:33 PKT): build Forma Office to
  the WPS level, properly — all the features WPS has (every editor,
  every format, proper OCR, all the paid features as Forma's own
  application), and **no Docker files for now**. This re-scopes the
  project: the Writer-first 15-day plan is replaced as the scope
  document by `docs/project-brief/WPS_LEVEL_PLAN.md` (new). The
  one-day cadence and handoff-per-day still apply.
- Source URLs: none new — the scope re-uses the Day 1 WPS
  inventory (`docs/reverse-engineering/day-01-wps-inventory.md`,
  official WPS pages, 2026-11-17) and the Day 5 ONLYOFFICE
  verification (version 10.0.0, AGPLv3, config reference).
- Research skill used: none (no new web research; the inventory
  and engine verification already existed).
- What was directly observed:
  - The ONLYOFFICE engine on this VM converts XLSX and PPTX as
    well as DOCX (see §4). A hand-built minimal PPTX fails
    conversion (Error -3) because it lacks a slide master/layout/
    theme; LibreOffice (installed on this VM, `/usr/bin/soffice`)
    repairs it into a valid PPTX that converts cleanly.
  - The `documents` Storage bucket's MIME list is enforced by
    Supabase Storage on upload, so the new formats needed a live
    bucket update (done via the Storage API, as on Day 4) plus a
    migration recording it.
  - All four migrations (Day 3, Day 4, Day 5, Day 6) are still NOT
    applied to the live project — the user has not applied them
    yet. The Phase A migration only records the bucket MIME list;
    the editor extension itself is code-only.
- What remains unverified: Vercel Preview/Production environment
  separation (no access); Supabase Auth URL Configuration (Site URL
  + redirect allowlist) — check in the dashboard before the first
  real sign-up.

## 2. Completed functionality

| Feature | Status | Evidence/test ID | Notes |
|---|---|---|---|
| Spreadsheet editor (XLSX/XLS/CSV/ODS) | done (code) | Unit tests (cell mapping); XLSX→PDF engine proof | Needs migrations + reachable docserver for a live edit |
| Presentation editor (PPTX/PPT/ODP) | done (code) | Unit tests (slide mapping); PPTX→PDF engine proof | Same as above |
| Uploads for 12 formats | done | Bucket updated live (12 MIME types); file picker `accept` from the same list | Bucket MIME list verified via Storage API |
| Format-agnostic save callback | done | Unit tests; live gate tests (401/403) | Stores the document's own MIME type; rejects wrong filetype; ZIP/PDF/TXT validation |
| WPS-level master plan | done | `docs/project-brief/WPS_LEVEL_PLAN.md` | Phases A–F; no-Docker rule; clean-room rule |
| PDF tools / OCR / conversion hub / AI / templates | not started | — | Phases B–F of the plan |

## 3. Code and data changes

- `src/lib/editor.ts`: `getEditorDocumentType` now returns
  `word | cell | slide | pdf` (`EditorDocumentType`); `cell` for
  XLSX/XLS/CSV/ODS, `slide` for PPTX/PPT/ODP.
  `getEditorFileType` covers all 12 formats.
  `isEditableDocumentType` is true for word/cell/slide, false for
  pdf. `looksLikeDocx` is now an alias of the correctly named
  `looksLikeOfficeZip` (ZIP magic bytes — all Office formats).
- `src/lib/storage.ts`: `ALLOWED_UPLOAD_TYPES` extended to 12
  formats; `SUPPORTED_UPLOAD_MESSAGE` updated. The upload form's
  `accept` attribute and the library's open links follow
  automatically (they read these lists / `getEditorDocumentType`).
- `src/app/api/editor/callback/route.ts`: no longer hardcodes the
  DOCX MIME type — the upload contentType, the
  `document_versions` row and the `documents` row all use the
  document's own `mime_type` from the database. Rejects a save
  whose `filetype` does not match the document's format. Validates
  Office saves by ZIP magic bytes, PDFs by the `%PDF-` header,
  TXT by size only.
- `src/app/(workspace)/editor/[id]/page.tsx` and
  `src/app/(workspace)/files/page.tsx`: copy updated to list all
  12 formats.
- Supabase migrations/RLS: `20261117040000_forma_spreadsheet_presentation.sql`
  — updates `storage.buckets.allowed_mime_types` for `documents`
  to the 12-type list. NOT applied to the live project (same as
  Days 3–5). The bucket itself was updated LIVE via the Storage
  API and verified (12 MIME types, private, 50 MB).
- Environment variable names added (never values): none.
- Dependencies: none added.
- Infrastructure (this VM only, not in the repo): none new. The
  Day 5 document-server stack (nginx + ds-docservice +
  ds-converter + ds-example) is still running; it does NOT
  survive a VM restart.

## 4. Tests

- Lint: 0 errors, 0 warnings.
- Typecheck: `tsc --noEmit` pass.
- Unit: 55 passed / 0 failed (9 files) — up from 52: new tests
  for cell/slide mapping, file types, editable flags and the
  `looksLikeOfficeZip` alias.
- Integration: local RLS verification PASSED 18/18 (re-run;
  unchanged tables, no regression). Live RLS test
  (`npm run test:live`) still not run — migrations not applied.
- E2E: none (no Playwright suite yet — Day 14 in the old plan;
  Phase F in the new plan).
- Build: pass (routes unchanged).
- Preview smoke tests: local smoke test pass after restarting the
  app server with the new build — / 200, file route bad token
  403, callback no token 401, editor page signed out 307.
- Engine proofs (document server, 2026-11-17 23:37 PKT):
  - XLSX→PDF via ConvertService.ashx (JWT-signed): 200, 100%,
    PDF 16,797 bytes; `pdftotext` returns both proof lines
    exactly ("Forma Office Day 6 proof - spreadsheet works." +
    second line).
  - PPTX→PDF via ConvertService.ashx: 200, 100%, PDF 28,759
    bytes; `pdftotext` returns "Forma Office Day 6 proof -
    presentation works." (The first hand-built PPTX failed with
    Error -3 — missing slide master/layout/theme — and was
    repaired with LibreOffice before converting.)

## 5. Deployment verification

- Preview deployment result: NOT PERFORMED — no Vercel/Git remote access.
- Health endpoint: /api/supabase-status reachable locally.
- Document server: http://localhost:8083/healthcheck → `true`;
  XLSX and PPTX conversions proven (see §4).
- Browser console/network result: no browser proof — the editor
  UI round-trip is still unproven for the reasons in the Day 5
  handoff §6b (no browser here can reach the local servers).
- Main workflow result: no live sign-up, upload or edit yet
  (migrations pending).

## 6. Security/licensing checks

- RLS and Storage access: unchanged from Day 5 (local RLS 18/18
  re-run). The bucket stays private; the MIME extension only
  admits the 12 listed office formats.
- Editor JWT/callback: unchanged contract; the callback now also
  rejects a save whose filetype mismatches the document's format
  (defence against a document server — or a forged callback —
  swapping a document's format).
- Secrets: none added; `.env.local` still gitignored. The bucket
  update used the server-only service key through a script that
  never prints it. Rotation of keys pasted in chat earlier is
  still unconfirmed.
- File handling: saves are stored in the document's own format
  and MIME type; the TXT/PDF validation branches are explicit
  (TXT has no magic bytes; PDF is checked by header).
- License status: ONLYOFFICE Docs 10.0.0 Community, GNU AGPLv3
  (unchanged). The WPS-level scope does not change the licence
  position: Forma's paid-feature equivalents will be built on
  open-source engines (Tesseract, pdf-lib), never by copying or
  unlocking WPS. A proprietary commercial launch still needs the
  Developer licence + legal review.

## 6b. Verification notes and fixes made during Day 6

- The first hand-built PPTX failed conversion (Error -3). The
  fix was not to guess at the XML — LibreOffice on this VM
  opened the file and re-saved it as a valid PPTX, which then
  converted cleanly. Lesson: use LibreOffice to build or repair
  office fixtures instead of hand-crafting minimal OOXML.
- Prettier flagged 2 files after the edits; `npm run format`
  fixed them before commit.
- The `http.server` on port 8899 (file server for the conversion
  proofs) was left running during the proofs; it is proof
  scaffolding, not part of the app — stop it when the proofs are
  done.
- The Day 5 browser-proof gap is unchanged (see Day 5 handoff
  §6b). The conversion proofs are engine-level evidence, not a
  browser UI round-trip.

## 7. Known defects and limitations

- All four migrations not applied — the one thing standing
  between this code and a working sign-up/upload/edit. Apply Day
  3, then Day 4, then Day 5, then Day 6, in the dashboard SQL
  Editor, then run `npm run test:live`. The Day 6 migration only
  records the bucket MIME list (already applied live).
- The document server runs on this VM only, started manually,
  and does NOT survive a VM restart. A real deployment needs a
  persistent host with 4 GB RAM (this VM has ~600 MB–1.2 GB
  available).
- The callback's `url` host is not allow-listed (see §6, Day 5).
- The live edit round-trip (open → type → save → reopen) for
  spreadsheets and presentations is unproven — same blocker as
  Day 5 (migrations + a browser that can reach the docserver).
- CSV files open as spreadsheets; ONLYOFFICE converts CSV to
  XLSX internally on open — the saved filetype check accepts
  the document's own format, so a CSV edited and saved through
  the editor may arrive back as XLSX and be rejected by the
  filetype check. This is a known edge case to verify live once
  the migrations are applied (the check may need a CSV→XLSX
  allowance).
- See docs/known-limitations.md for the full list.

## 8. Tomorrow's target

- Highest-priority feature: **Phase B — PDF tools** (per
  `docs/project-brief/WPS_LEVEL_PLAN.md`): PDF export via the
  document server (DOCX/XLSX/PPTX → PDF download), then PDF
  merge/split/rotate/compress on pdf-lib. BUT first: the owner
  applies the four migrations (dashboard SQL Editor), so the
  Forma-app round-trip (sign in → upload XLSX/PPTX → open → edit
  → new version) can be proven live.
- Acceptance criteria: a spreadsheet and a presentation each open
  in the Forma editor, edit, save, and reopen showing the edits
  as a new version in the same format; a wrong-filetype save is
  rejected; a PDF export downloads a correct PDF.
- Dependencies/blockers: the migration application is the owner's
  step; a persistent document-server host (4 GB RAM) is the
  owner's decision for anything beyond this evaluation; the CSV
  save-format edge case (§7) needs a live check.
