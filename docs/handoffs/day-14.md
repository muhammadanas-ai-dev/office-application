# Day 14 handoff — Conversion hub (Phase D)

Date: 2026-11-18. Owner instruction (15:27 PKT): "okay now
moved to next feature and follow the same loop". The next
feature in the queue is the conversion hub (Phase D): convert
any supported format to any other, as a Convert action per
document in the library. Acceptance (WPS_LEVEL_PLAN.md): every
offered conversion is a conversion the engine actually
performs; the result downloads as a new file, never
overwriting the original.

## 1. What was researched

- **The engine: ONLYOFFICE ConvertService (already integrated).**
  Day 7 (PDF export) already calls it: `src/lib/export.ts`
  (pure: request building, response parsing, rate limiter) +
  `src/lib/export.server.ts` (server-only: JWT-signed POST to
  `/ConvertService.ashx`, download the result, validate it is a
  PDF). The hub generalises that call from "always to PDF" to
  "to any supported output type". Request (api.onlyoffice.com):
  POST JSON to `/converter` (v5.5+) or `/ConvertService.ashx`
  (legacy — the app uses this, and it works on the installed
  10.0.0 server). Parameters: `async` (false = synchronous; a
  slow sync conversion can hit a web timeout, and the result
  is then only retrievable by re-sending with the same key),
  `filetype`, `key`, `outputtype`, `title`, `url`, `token`
  (JWT). Response (ConvertService.ashx): XML with `<FileUrl>`
  on success or `<Error>` (a numeric code) on failure.
  `outputtype` may also be `ooxml` or `odf` (a format family)
  — Forma does not use those; it asks for one exact extension.
- **The conversion matrix (what the engine actually performs).**
  Source: the ONLYOFFICE Help Center "Download as" tables (the
  editor's own list of what it produces for each input format)
  — the most honest source available, because it is the
  engine's own menu, not a marketing claim. Restricted to
  Forma's formats (the 12 upload formats + PDF; image outputs
  and EPUB/FB2/HTML/RTF/MD are excluded — Forma cannot store
  or open them as documents, and a thumbnail is not a
  document). The matrix (in `src/lib/convert.ts`):
  docx → odt, pdf, txt; doc → docx, odt, pdf, txt; odt → docx,
  pdf, txt; txt → docx, odt, pdf; xlsx → csv, ods, pdf; xls →
  csv, ods, xlsx, pdf; ods → csv, xlsx, pdf; csv → ods, xlsx,
  pdf; pptx → odp, pdf; ppt → odp, pptx, pdf; odp → pptx, pdf;
  pdf → docx, txt. No cross-family conversions. `docx → doc`
  and `xlsx → xls` are NOT offered (the editor's own list does
  not include them). `pdf → xlsx` (WPS's "PDF-to-Excel") is
  NOT offered in v1 (the PDF editor's list has no XLSX). If a
  live test against the docserver later proves either, the
  matrix grows — it is data, not code.
- **Result validation (by target format).** PDF → `%PDF-`
  magic; docx/xlsx/pptx/odt/ods/odp/doc/xls/ppt → ZIP magic
  `PK\x03\x04` (the `looksLikeOfficeZip` helper already exists
  in editor.ts); txt/csv → valid UTF-8, non-empty, and NOT a
  ZIP or PDF. Size ≤ 50 MB. The same rule as the export: never
  return or store partial or wrong-format bytes.
- **Where the result goes.** The conversion creates a NEW
  document in the library (same workspace, same folder as the
  source), titled with the new extension, version 1 — never a
  new version of the source, and never an overwrite. The route
  returns the new document's id + title + mime type, and the UI
  links to its download. (The Day 7 export is different: it
  streams a download and creates nothing — because an export
  is a throwaway copy, not a new document.)
- **Docserver state (2026-11-18): the document server is
  WIPED** (VM reset). No `/etc/onlyoffice`, no package, the
  healthcheck returns nothing, no .deb in the apt cache, and a
  direct download of the 10.0.0 .deb returns **403** through
  the egress proxy (re-checked 2026-11-18 15:28). The
  conversion live e2e is therefore BLOCKED on the docserver,
  exactly like the export live e2e (Day 7).

## 2. Completed functionality

- **The matrix + engine (`src/lib/convert.ts`, pure).**
  `CONVERSION_MATRIX`, `getConvertibleTargets`,
  `isConversionSupported`, `getTargetMimeType`,
  `getFormatLabel`, `validateConvertedBytes` (PDF / ZIP /
  text checks), `getConvertedFileName` / `getConvertedTitle`.
- **The converter (`src/lib/convert.server.ts`).**
  `ConvertError` (status) + `convertDocument({fileUrl,
  fileType, outputType, title})` — the same JWT + fetch +
  download + validation as the export, parameterised by output
  type. The Day 7 export now runs on it (`convertToPdf` calls
  `convertDocument` with `outputtype: "pdf"`); its behaviour
  is unchanged and its tests still pass. The
  `buildConvertRequest` `outputtype` field was generalised
  from `"pdf"` to `string` (default `"pdf"`).
- **The route (`POST /api/documents/[id]/convert`).** Zod
  `{outputType}`, RLS document load (user client), the
  conversion must be in the matrix (400 otherwise), the source
  must have a file (400), rate-limited 10/min (the export's
  constants), the HMAC file-token URL (the same pattern as the
  export), convert via the server module (ConvertError → its
  status; 502 when the docserver cannot be reached, 503 when
  it is not configured), then the result is uploaded to Storage
  as a NEW document (same workspace + folder, new id, version
  1, title with the new extension) with the documents +
  document_versions rows — and the uploaded file is removed
  again if either insert fails. Returns `{ok, document: {id,
  title, mimeType}, sourceId}`.
- **The UI.** `/documents/[id]/convert` — the source document
  and the offered target formats from the matrix (with a
  plain-language label per format), a Convert button, and on
  success a download link for the new document ("the original
  file is untouched"). A "Convert" action in DocumentActions
  for convertible documents (all 12 office formats + PDF;
  images get no Convert action). The success link goes to the
  download route — there is no `/documents/[id]` detail page,
  so the first version of the client linked there and was
  corrected before the build.

## 3. Code and data changes

- `src/lib/convert.ts` (new) + `src/lib/convert.test.ts` (new,
  20 tests) + `src/lib/convert.server.ts` (new).
- `src/lib/export.ts`: `ConvertRequestBody.outputtype` is now
  `string`; `buildConvertRequest` takes an optional `outputType`
  (default `"pdf"`).
- `src/lib/export.server.ts`: `convertToPdf` now delegates to
  `convertDocument` (the JWT/fetch/download code moved there);
  the unused `isPdf` helper and the jose/editor.server imports
  were removed.
- `src/app/api/documents/[id]/convert/route.ts` (new).
- `src/app/(workspace)/documents/[id]/convert/page.tsx` (new)
  + `src/components/convert/convert-client.tsx` (new).
- `src/components/library/library-forms.tsx` +
  `library-list.tsx`: a `convertHref` prop and the "Convert"
  link (shown when the file's format has any matrix targets).
- `scripts/e2e-convert-test.mjs` (new, focused harness).
  `DOCSERVER_LIVE = false` at the top — flip it to `true`
  when the docserver is back and the conversion checks run
  for real.
- Docs: `docs/handoffs/day-14-plan.md`, `WPS_LEVEL_PLAN.md`
  (Phase D → Done, with the docserver caveat),
  `docs/feature-matrix.csv` (FORMA-023),
  `docs/known-limitations.md` (matrix limits + the docserver
  blocker), `CHANGELOG.md` (Day 14 entry).

## 4. Tests

- **Unit: 193/193 (18 files, 9 skipped — the pre-existing
  skips).** The 20 new convert tests pass: every matrix row,
  no cross-family conversion, no same-format conversion, no
  PDF-to-Excel in v1, unknown sources return [], byte
  validation per target (PDF / ZIP / text / empty / unknown),
  filename helpers. The export tests still pass after the
  refactor (the `convertToPdf` delegation changed no
  behaviour).
- **Live e2e: 13/13 (`scripts/e2e-convert-test.mjs`).** As a
  real signed-in user A: a cross-family conversion refused
  400 ("the engine does not perform that conversion"), the
  same format refused 400, an unknown target refused 400, an
  image refused 400, a missing document refused 404; the
  DOCX→PDF conversion fails honestly with 502 ("The document
  server could not be reached") and creates NO new document
  (the workspace still has exactly its 4 documents); user B
  gets 404; signed-out gets 307; the convert page loads for A
  (200, lists "PDF (.pdf)") and shows "Document not found"
  for B; an image's convert page shows "cannot be converted".
- **The one failure on the first run, and what it meant.** The
  harness first expected 503 ("not configured") for the
  conversion, but got 502 ("could not be reached") — because
  `ONLYOFFICE_DOCSERVER_URL` is still set in `.env.local`
  (pointing at the old local docserver), so the code correctly
  tries the configured URL and finds nothing listening. The
  harness expectation was fixed (502 or 503 is an honest
  "the engine is down"), not the code. The env var stays set:
  when the docserver is reinstalled at the same URL, the same
  config works.
- **Typecheck, lint, build: pass.** Prettier applied to all
  Day 14 files.
- **NOT proven live:** the conversion itself (a DOCX actually
  becoming a PDF). It needs the docserver. The harness has
  the checks written and gated behind `DOCSERVER_LIVE`.

## 5. Deployment verification

- App rebuilt and restarted on :3000 (new build, convert route
  and page included); `/api/supabase-status` returns 200.
- **NOT PERFORMED:** no Vercel/Git remote access — no Preview
  deployment, as every day.
- **Docserver:** still wiped, .deb download still 403
  (re-checked 2026-11-18 15:28). The conversion proof waits
  on it. The OCR worker is still running (it does not depend
  on the docserver).

## 6. Security/licensing checks

- No new engine, no new licence: the conversion uses the same
  ONLYOFFICE ConvertService (Community, AGPLv3 — the Day 5
  licence note stands) that the export already uses.
- No secrets in code. The docserver URL and JWT secret come
  from the environment at call time; the URL never reaches
  the browser (the route saves the bytes itself).
- The converted bytes are validated for the target format
  before anything is saved — a wrong-format response from the
  server is refused, never stored.
- The new document is created through the signed-in user's
  client (RLS), in the same workspace and folder as the
  source; a user who cannot read the source cannot convert it
  (proven live: user B gets 404).

## 6b. Verification notes and fixes made during Day 14

- The success link in the convert client first pointed at
  `/documents/<id>` — there is no such detail page, so it
  would have 404'd. Corrected to the download route before
  the build.
- The harness's first 503 expectation was wrong (see §4) —
  the code was right, the expectation was fixed.

## 7. Known defects and limitations

- **The conversion itself is not proven live** — the
  docserver is down (see §5). The matrix, the route's
  validation/RLS paths and the page ARE proven live (13/13).
- **No cross-family conversion, no docx → doc, no xlsx →
  xls, no PDF-to-Excel in v1** — the matrix is what the
  engine's own "Download as" tables list. If a live test
  proves one of these, the matrix grows (data, not code).
- **No batch conversion** (one document at a time). The WPS
  plan's "Batch / format picker in the library" row is the
  per-document Convert action in v1.
- **No image outputs** (JPG/PNG thumbnails) — a thumbnail is
  not a document, and Forma cannot store it as one.
- **The rate limiter is per-process in-memory** (10/min),
  the same as the export — a shared limiter is the
  multi-instance hardening item (unchanged).

## 8. Tomorrow's target

- **First: the conversion proof, when the docserver is back.**
  Flip `DOCSERVER_LIVE` in `scripts/e2e-convert-test.mjs`
  and run it — the DOCX→PDF, CSV→XLSX and PDF→DOCX checks
  are already written (new document in the library, right
  mime type and magic bytes, original untouched). Then update
  this handoff and the WPS plan row (drop the caveat).
- **Next feature in the queue: AI tools (Phase E).** Blocked
  on the owner's LLM provider decision (open since the plan
  was written) — the abstraction is built first, the provider
  is his call. If he names a provider, build the provider
  abstraction + the first AI tool (rewrite/proofread/summarize)
  with the same loop. If he does not, the next buildable
  feature is **Templates (Phase F)** — ask him which one he
  wants.
