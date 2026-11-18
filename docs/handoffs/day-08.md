# Day 08 — Handoff (Phase B, feature 2: PDF merge / split / rotate / compress)

- Date: 2026-11-18 (early morning)
- Version label: day-08
- Branch: day-08-pdf-utilities
- Commit SHA: 5fdbd14
- Vercel Preview URL: NOT PERFORMED — no Vercel/Git remote access
- Production URL (only if promoted): none
- Office engine version/edition: ONLYOFFICE Docs 10.0.0 Community
  (AGPLv3), DEB install on this VM — unchanged from Day 5.
- PDF engines: pdf-lib 1.17.1 (npm), Ghostscript 10.02.1 (apt).

## 1. What was researched

- Owner method (standing, 2026-11-17 23:41 PKT): one feature at
  a time, fully proper and production-grade, tested before moving
  on. This feature is Phase B feature 2: **PDF merge, split,
  rotate, compress** — four operations, each built separately on
  one shared pipeline.
- Source URLs: none new. pdf-lib docs (npm) and Ghostscript
  `pdfwrite` device flags are the engine references.
- Research skill used: none.
- What was directly observed:
  - pdf-lib cannot compress PDFs — a pdf-lib "compress" would be
    a re-save, i.e. a fake. Real compression needs Ghostscript
    (downsamples images, subsets fonts, drops duplicates).
    Ghostscript was NOT installed on this VM; `apt-get install
    ghostscript` installed 10.02.1. The apt run reported a dpkg
    error code 1, but that is the pre-existing half-configured
    `ttf-mscorefonts-installer` / `onlyoffice-documentserver`
    state from Day 5, not a Ghostscript failure — `gs --version`
    returns 10.02.1 and it compresses correctly.
  - pdf-lib writes drawn text as hex strings in content streams,
    so test text extraction must decode `<...>` hex literals.
    pdf-lib also deduplicates a copied page's content stream, so
    a split of [3, 1, 3] has one stream object shared by two
    pages — the test verifies the Contents references, not a
    text count.
  - `import "server-only"` makes a module unimportable in Vitest,
    so the document operations were split into `pdf-ops.ts`
    (no server-only, no Supabase/Next — unit-testable) and
    `pdf-tools.server.ts` (auth/storage wiring, keeps
    server-only). The operations module is server-side by
    convention (uses Node APIs) and must not be imported from a
    client component.
  - **Proxy gap found and fixed:** `/documents` was not in
    `PROTECTED_PREFIXES`, so a signed-out visitor to
    `/documents/[id]/pdf-tools` got a 200 with the workspace
    shell instead of a redirect to sign-in (the page's own
    redirect is the second layer and did not produce a 307 under
    Cache Components). `/documents` is now protected, matching
    every other workspace area.
- What remains unverified: Vercel Preview/Production environment
  separation (no access); Supabase Auth URL Configuration (Site URL
  + redirect allowlist) — check in the dashboard before the first
  real sign-up.

## 2. Completed functionality

| Feature | Status | Evidence/test ID | Notes |
|---|---|---|---|
| PDF merge (2–20 PDFs, in order) | done | Unit tests; live gate 307 | Authenticated end-to-end pending migrations |
| PDF split (page ranges) | done | Unit tests; live gate 307 | Same |
| PDF rotate (additive) | done | Unit tests; live gate 307 | Same |
| PDF compress (Ghostscript) | done | Unit tests + live image proof | Needs Ghostscript on the host |
| PDF tools page + library link | done | Build pass; live gate 307 | Same |
| PDF editing, OCR, AI, conversion hub, templates | not started | — | Later features, in plan order |

## 3. Code and data changes

- `src/lib/pdf-tools.ts` (new, pure): page-range parser
  ("1-3, 5", duplicates kept for split), rotate selection ("all"
  or ranges, duplicates collapsed), rotation degrees (90/180/270
  only), compression levels (screen/ebook/printer, default
  ebook), PDF MIME/header checks, tool file names, and the named
  constants (10/min rate limit, 2 min timeout, 50 MB cap, 20-doc
  merge cap, 500-page cap). No hardcoded document, user, URL or
  secret anywhere.
- `src/lib/pdf-ops.ts` (new, no server-only): `PdfToolsError`,
  `countPdfPages`, `mergePdfs`, `splitPdf`, `rotatePdf`
  (additive — a page at 90° rotated by 90° ends at 180°),
  `compressPdf` (Ghostscript via execFile with an argument array,
  no shell; temp dir always cleaned up; output validated as a
  real PDF with the same page count; returns the original with
  savedBytes 0 when Ghostscript cannot shrink the file, never a
  larger file; 503 when Ghostscript is missing).
- `src/lib/pdf-tools.server.ts` (new, server-only): `getToolsUser`
  / `getToolsClient`, `pdfToolsRateLimiter` (shared by all four
  routes), `fetchDocumentPdf` (row through the user's client —
  RLS decides — then bytes from private Storage via the admin
  client; PDF MIME + header + size validated), `pdfDownloadResponse`,
  and re-exports of the operations so routes import from one place.
- `src/app/api/documents/[id]/pdf/merge|split|rotate|compress/route.ts`
  (new): POST with a Zod-validated JSON body; 400 on bad body /
  bad ranges / bad degrees / bad level; 404 when a document is
  missing or inaccessible; 429 with Retry-After on rate limit;
  503 when Ghostscript is missing (compress only); 502 on
  conversion failure; the result streams back as a PDF download
  with Content-Type/Disposition/Length/no-store, plus
  `X-Forma-Compress-Saved-Bytes` on compress. Sources are never
  modified and no version is created.
- `src/app/(workspace)/documents/[id]/pdf-tools/page.tsx` (new):
  server page loading the document + other workspace PDFs through
  RLS, the page count read from the file itself (best effort —
  the routes validate server-side anyway), honest EmptyState for
  not-found / non-PDF.
- `src/components/pdf-tools/pdf-tools-client.tsx` (new): one form
  per tool; each POSTs JSON and downloads the returned PDF using
  the filename from Content-Disposition; errors show the route's
  real message; compress shows the bytes saved (or that the
  original was returned because it could not shrink).
- `src/components/library/library-forms.tsx` + `library-list.tsx`:
  DocumentActions gained a `pdfToolsHref` prop; "PDF tools" link
  shown only for PDF documents with a file.
- `src/lib/supabase/proxy.ts`: `/documents` added to
  `PROTECTED_PREFIXES` (see §1 — the gap this fixed).
- `src/lib/export.ts` + `export.test.ts` + the export route:
  `ExportRateLimiter` renamed to `FixedWindowRateLimiter` — it is
  a generic fixed-window limiter now shared by export and PDF
  tools, and the old name lied about what it was.
- Supabase migrations/RLS: none. No new tables.
- Environment variable names added (never values): none.
- Dependencies: pdf-lib@1.17.1 added (package.json + lockfile).
- Infrastructure (this VM only, not in the repo): Ghostscript
  10.02.1 installed via apt; does not survive a VM reset (reinstall
  with `apt-get install -y ghostscript`).

## 4. Tests

- Lint: 0 errors, 0 warnings.
- Typecheck: `tsc --noEmit` pass.
- Unit: 90 passed / 0 failed (11 files) — up from 70: new
  `src/lib/pdf-tools.test.ts` (20 tests) covers the range parser
  (valid/invalid/500-page cap), rotate selection and degrees,
  compression levels, PDF detection, file names, and the pdf-lib
  operations on real fixture PDFs built in-test (merge order and
  text survival, merge 500-page cap, split order via Contents
  references, additive rotation including the 180+180→0 wrap,
  compress contract). The compress tests skip gracefully when
  Ghostscript is absent (`describe.skipIf`).
- Integration: local RLS verification PASSED 18/18 (re-run;
  unchanged tables, no regression). Live RLS test
  (`npm run test:live`) still not run — migrations not applied.
- E2E: none (no Playwright suite yet).
- Build: pass (new routes `/api/documents/[id]/pdf/*` and
  `/documents/[id]/pdf-tools` included).
- Preview smoke tests: local smoke test pass after restarting
  the app server with the new build — / 200; all four PDF-tools
  routes unauthenticated → 307 to `/auth/login?next=...`;
  the PDF tools page unauthenticated → 307 (after the proxy fix;
  it was 200 with the shell before the fix — see §6b).
- Engine proof (live, 2026-11-18 00:0x PKT): a 1-page PDF with a
  1500×1500 random-noise image (6,753,013 bytes) compressed by
  Ghostscript /ebook to 1,105,008 bytes — 84% smaller, page
  preserved. The Day 5 text PDF also compressed (29,542 →
  23,840 bytes) with its text intact.
- The authenticated end-to-end flow (sign in → open PDF tools →
  merge/split/rotate/compress → a correct PDF downloads) is NOT
  proven live — it needs a signed-in user and document rows,
  which need the migrations applied.

## 5. Deployment verification

- Preview deployment result: NOT PERFORMED — no Vercel/Git remote access.
- Health endpoint: /api/supabase-status reachable locally.
- Document server: http://localhost:8083/healthcheck → `true`.
- Browser console/network result: no browser proof.
- Main workflow result: no live sign-up, upload, edit or export
  yet (migrations pending).

## 6. Security/licensing checks

- RLS and Storage access: unchanged (local RLS 18/18 re-run).
  Every PDF-tools route fetches documents through the user's own
  client, so a user can only operate on PDFs in workspaces they
  belong to; a cross-user id returns 404, never another user's
  file. Merge fetches each listed document the same way.
- Editor JWT/callback: unchanged.
- Secrets: none added; `.env.local` still gitignored.
- File handling: every input is validated as a real PDF (header +
  pdf-lib load) before any operation; outputs are validated (page
  count for compress, page caps for merge/split); Ghostscript runs
  with an argument array (no shell — no injection), a timeout,
  and temp files that are always removed; the compress output is
  never larger than the input.
- Rate limiting: 10 PDF operations/minute per user, in-memory per
  server process (shared instance across the four routes). Same
  multi-instance hardening item as export.
- License status: ONLYOFFICE Docs 10.0.0 Community, GNU AGPLv3
  (unchanged); pdf-lib is MIT; Ghostscript is AGPLv3 (a system
  binary, not linked into the app). No licence change from this
  feature.

## 6b. Verification notes and fixes made during Day 8

- Two test failures were the TEST's assumptions, fixed by
  correcting the test (the implementation was right both times):
  pdf-lib writes text as hex strings (decode them), and a split
  of [3, 1, 3] shares one content stream between the two copies
  of page 3 (verify Contents references, not text counts).
- The proxy gap (§1) was found by the live gate test, not by a
  unit test: the PDF tools page returned 200 with the shell for a
  signed-out visitor. Fixed by adding `/documents` to
  `PROTECTED_PREFIXES`; the page's own redirect stays as the
  second layer.

## 7. Known defects and limitations

- All four migrations not applied — the one thing standing
  between this code and a working sign-up/upload/edit/export/
  PDF-tools flow. Apply Day 3, then Day 4, then Day 5, then Day
  6, in the dashboard SQL Editor, then run `npm run test:live`.
- PDF compress needs Ghostscript on the host (10.02.1 on this
  VM; reinstall after a VM reset). Without it the compress route
  returns 503; merge/split/rotate do not need it.
- The document server runs on this VM only, started manually,
  and does NOT survive a VM restart. A real deployment needs a
  persistent host with 4 GB RAM (this VM has ~600 MB–1.2 GB
  available).
- The callback's `url` host is not allow-listed (see §6, Day 5).
- The CSV save-format edge case from Day 6 is still open (a CSV
  edited in the editor may save back as XLSX and be rejected by
  the filetype check).
- See docs/known-limitations.md for the full list.

## 8. Tomorrow's target

- Highest-priority feature: **Phase B, feature 3 — PDF editing**
  (per `docs/project-brief/WPS_LEVEL_PLAN.md`): edit text,
  images and pages of a PDF — one feature, deeply and
  production-grade. BUT first: the owner applies the four
  migrations (dashboard SQL Editor), so the authenticated
  end-to-end PDF-tools flow can be proven live.
- Acceptance criteria: a text edit changes the visible text and
  survives a reopen; an image can be replaced; a page can be
  deleted/reordered; every edit is validated and the original
  file is never overwritten (a new version is created).
- Dependencies/blockers: the migration application is the
  owner's step; a persistent document-server host (4 GB RAM) is
  the owner's decision for anything beyond this evaluation.
