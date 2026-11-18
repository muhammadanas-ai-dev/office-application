# Day 07 — Handoff (Phase B, feature 1: PDF export)

- Date: 2026-11-17 (late night)
- Version label: day-07
- Branch: day-07-pdf-export
- Commit SHA: 1630922
- Vercel Preview URL: NOT PERFORMED — no Vercel/Git remote access
- Production URL (only if promoted): none
- Office engine version/edition: ONLYOFFICE Docs 10.0.0 Community
  (AGPLv3), DEB install on this VM — unchanged from Day 5.

## 1. What was researched

- Owner method (2026-11-17 23:41 PKT): implement feature by
  feature — one at a time, each fully proper and production-grade,
  no loopholes, no bugs, no hardcoded values, and tested properly
  before moving on. Recorded in
  `docs/project-brief/WPS_LEVEL_PLAN.md` (Phase B section).
- This feature is the first of Phase B: **PDF export** — convert
  any editable document to PDF and download it.
- Source URLs: none new. The conversion contract is the
  ONLYOFFICE ConvertService already proven on Days 5–6
  (DOCX→PDF, XLSX→PDF, PPTX→PDF with exact text); the auth
  pattern follows the Day 4 download route (user's client + RLS).
- Research skill used: none.
- What was directly observed:
  - The app proxy redirects unauthenticated `/api/*` requests to
    sign-in (307) before a route handler runs — so the export
    route's own 401 is a second layer, not the first. The
    redirect carries `next` back to the export URL, so after
    sign-in the download starts. Same behaviour as the Day 4
    download route.
  - `new Response(bytes)` does not typecheck for a Uint8Array in
    this TS config; `bytes.buffer as ArrayBuffer` is used instead
    (the view covers a fresh ArrayBuffer from arrayBuffer()).
  - `sanitizeFileName` (Storage paths) strips spaces, which is
    wrong for a download filename — a dedicated
    `sanitizeDownloadName` keeps spaces and only removes
    header-unsafe characters.
- What remains unverified: Vercel Preview/Production environment
  separation (no access); Supabase Auth URL Configuration (Site URL
  + redirect allowlist) — check in the dashboard before the first
  real sign-up.

## 2. Completed functionality

| Feature | Status | Evidence/test ID | Notes |
|---|---|---|---|
| PDF export route (GET /api/documents/[id]/export) | done | Unit tests; live gate 307 | Authenticated end-to-end export pending migrations |
| "Export as PDF" library action | done | Build pass | Only shown for exportable formats |
| Rate limit (10/min/user) | done | Unit tests (limiter) | In-memory, per-instance (see §7) |
| PDF merge/split/rotate/compress | not started | — | Next feature (Day 8) |
| PDF editing, OCR, AI, conversion hub, templates | not started | — | Later features, in plan order |

## 3. Code and data changes

- `src/lib/export.ts` (new, pure): `isExportableToPdf` (all 11
  editable formats; PDF itself excluded), `getExportFileName`
  (appends .pdf once), `getSourceFileName` (source name with its
  real extension for the converter), `sanitizeDownloadName`
  (header-safe, keeps spaces), `buildContentDisposition` (ASCII
  fallback + RFC 5987 UTF-8 filename), `buildConvertRequest`,
  `parseConvertResponse` (XML: FileUrl success, Error code,
  malformed and unfinished rejections, non-HTTP URL rejection),
  `ExportRateLimiter` (fixed-window, injectable clock), and the
  named constants `EXPORT_TIMEOUT_MS` (2 min),
  `MAX_EXPORT_BYTES` (50 MB), `EXPORT_RATE_LIMIT_MAX` (10),
  `EXPORT_RATE_LIMIT_WINDOW_MS` (60 s). No hardcoded document,
  user, URL or secret anywhere.
- `src/lib/export.server.ts` (new, server-only): `convertToPdf`
  — JWT-signed ConvertService call (5 min token), timeout,
  response parsing, server-side download of the result, size cap
  and `%PDF-` header validation. Throws `ExportError` (with a
  status) on every failure path; never returns partial or
  wrong-format bytes.
- `src/app/api/documents/[id]/export/route.ts` (new): GET handler.
  Format param must be `pdf` (400 otherwise). Auth via the
  signed-in user's client; document fetched through RLS (404/400
  paths); PDF sources get a clear 400 ("already a PDF — use
  Download"); rate limit 429 with Retry-After; file fetched by
  the document server through the HMAC-gated file route; PDF
  streamed back with Content-Type, Content-Disposition,
  Content-Length and `Cache-Control: no-store`. The original file
  is never modified and no version is created.
- `src/components/library/library-forms.tsx`: `DocumentActions`
  gained an `exportHref` prop rendering an "Export as PDF" link.
- `src/components/library/library-list.tsx`: computes `exportHref`
  from `isExportableToPdf` (file present + convertible format).
- Supabase migrations/RLS: none. No new tables.
- Environment variable names added (never values): none.
- Dependencies: none added.
- Infrastructure (this VM only, not in the repo): none new.

## 4. Tests

- Lint: 0 errors, 0 warnings.
- Typecheck: `tsc --noEmit` pass.
- Unit: 70 passed / 0 failed (10 files) — up from 55: new
  `src/lib/export.test.ts` (15 tests) covers every exportable
  format, filename sanitizing (including a non-English title and
  a quote/newline injection attempt), the ConvertService request
  shape, response parsing (success, error code, unfinished,
  unsafe URL, malformed), and the rate limiter (limit, per-key
  isolation, window reset with a fake clock).
- Integration: local RLS verification PASSED 18/18 (re-run;
  unchanged tables, no regression). Live RLS test
  (`npm run test:live`) still not run — migrations not applied.
- E2E: none (no Playwright suite yet).
- Build: pass (new route `/api/documents/[id]/export` included).
- Preview smoke tests: local smoke test pass after restarting
  the app server with the new build — / 200; export route
  unauthenticated → 307 to `/auth/login?next=.../export` (the
  proxy's standard redirect; the route's own 401 is the second
  layer); `?format=docx` → 307 as well (proxy first — the
  route's 400 applies to signed-in callers).
- Engine proof: the conversion itself is the proven
  ConvertService path (Days 5–6: DOCX/XLSX/PPTX→PDF with exact
  text). The authenticated end-to-end export (sign in → click
  Export as PDF → a correct PDF downloads) is NOT proven live —
  it needs a signed-in user and a document row, which need the
  migrations applied.

## 5. Deployment verification

- Preview deployment result: NOT PERFORMED — no Vercel/Git remote access.
- Health endpoint: /api/supabase-status reachable locally.
- Document server: http://localhost:8083/healthcheck → `true`.
- Browser console/network result: no browser proof.
- Main workflow result: no live sign-up, upload, edit or export
  yet (migrations pending).

## 6. Security/licensing checks

- RLS and Storage access: unchanged (local RLS 18/18 re-run).
  The export route fetches the document through the user's own
  client, so a user can only export documents in workspaces they
  belong to; a cross-user id returns 404, never another user's
  file.
- Editor JWT/callback: unchanged. The export re-uses the same
  JWT (ConvertService) and HMAC (file route) contracts.
- Secrets: none added; `.env.local` still gitignored.
- File handling: the converted PDF is validated as a real PDF
  (header + non-empty + size cap) before it is returned; the
  file URL from the converter is rejected unless it is http(s);
  the download filename cannot break out of its quoted header
  value (quotes/backslashes/control characters are stripped,
  and the UTF-8 name is percent-encoded).
- Rate limiting: 10 exports/minute per user, in-memory per
  server process. It bounds abuse on a single instance; a
  multi-instance deployment needs a shared limiter (Day 14
  hardening item, recorded in known-limitations.md).
- License status: ONLYOFFICE Docs 10.0.0 Community, GNU AGPLv3
  (unchanged). No licence change from this feature.

## 6b. Verification notes and fixes made during Day 7

- Two bugs were caught by the tests and fixed before commit:
  1. `getEditorFileType` was imported from `@/lib/export` in the
     route — it lives in `@/lib/editor`. The build caught it.
  2. `new Response(Uint8Array)` does not typecheck; fixed with
     `bytes.buffer as ArrayBuffer` (documented in the code).
  3. The filename sanitizer was reworked (see §1): the Storage
     sanitizer strips spaces, which made download names ugly
     ("Quarterly_report.pdf"). The new `sanitizeDownloadName`
     keeps spaces and only removes header-unsafe characters.
     The tests caught all three — the implementation was fixed,
     not the tests (except two expectations that had the old
     sanitizer's behaviour baked in).
- The live gate test returned 307, not the route's 401 — that is
  the proxy, not a bug (see §1). The route's 401 stays as the
  second layer.

## 7. Known defects and limitations

- All four migrations not applied — the one thing standing
  between this code and a working sign-up/upload/edit/export.
  Apply Day 3, then Day 4, then Day 5, then Day 6, in the
  dashboard SQL Editor, then run `npm run test:live`.
- The export rate limit is in-memory per server process (see §6).
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

- Highest-priority feature: **Phase B, feature 2 — PDF
  merge/split/rotate/compress** (per
  `docs/project-brief/WPS_LEVEL_PLAN.md`): one feature, deeply
  and production-grade — merge, split, rotate and compress as
  separate actions on pdf-lib, each with its own validation,
  tests and UI, in that order. BUT first: the owner applies the
  four migrations (dashboard SQL Editor), so the authenticated
  end-to-end export can be proven live.
- Acceptance criteria: two PDFs merge into one correct PDF;
  a PDF splits into correct pages; rotate changes a page's
  orientation and persists; compress produces a smaller valid
  PDF; every action rejects a non-PDF, an oversized file and a
  document the user cannot access.
- Dependencies/blockers: the migration application is the
  owner's step; a persistent document-server host (4 GB RAM) is
  the owner's decision for anything beyond this evaluation.
