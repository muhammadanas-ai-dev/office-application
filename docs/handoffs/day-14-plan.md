# Day 14 plan — Conversion hub (Phase D)

Owner instruction (2026-11-18 15:27 PKT): "okay now moved to
next feature and follow the same loop". The next feature in the
queue is the conversion hub (Phase D): convert any supported
format to any other, as a Convert action per document in the
library. Acceptance (WPS_LEVEL_PLAN.md): every offered
conversion is a conversion the engine actually performs; the
result downloads as a new file, never overwriting the original.

## Research (loop step 1)

### The engine: ONLYOFFICE ConvertService (already integrated)
- Day 7 (PDF export) already calls it: `src/lib/export.ts`
  (pure: request building, response parsing, rate limiter) +
  `src/lib/export.server.ts` (server-only: JWT-signed POST to
  `/ConvertService.ashx`, download the result, validate it is a
  PDF). The conversion hub generalises that call from
  "always to PDF" to "to any supported output type".
- Request (api.onlyoffice.com, Conversion API): POST JSON to
  `/converter` (v5.5+) or `/ConvertService.ashx` (legacy — the
  app uses this, and it works on the installed 10.0.0 server).
  Parameters: `async` (false = synchronous; a slow sync
  conversion can hit a web timeout, and the result is then only
  retrievable by re-sending with the same key), `filetype`,
  `key` (a unique document id), `outputtype`, `title`, `url`
  (the absolute URL of the source file), `token` (JWT, required
  by the server config). Response (ConvertService.ashx): XML
  with `<FileUrl>` on success or `<Error>` (a numeric code) on
  failure. `outputtype` may also be `ooxml` or `odf` (a format
  family, not an extension) — Forma does not use those; it asks
  for one exact extension.
- **Docserver state (2026-11-18): the document server is
  WIPED** (VM reset). No `/etc/onlyoffice`, no package, the
  healthcheck returns nothing, no .deb in the apt cache, and a
  direct download of the 10.0.0 .deb returns **403** through the
  egress proxy (re-checked 2026-11-18 15:28). The conversion
  live e2e is therefore BLOCKED on the docserver, exactly like
  the export live e2e (Day 7). The feature is built fully and
  unit-tested; the live proof runs when the docserver is back.
  The route's validation/RLS paths CAN be tested live without
  it (they fail at the engine call with a clear 503).

### The conversion matrix (what the engine actually performs)
Source: the ONLYOFFICE Help Center "Download as" tables (the
editor's own list of what the engine produces for each input
format) — the most honest source available, because it is the
engine's own menu, not a marketing claim. Restricted to
Forma's formats (the 12 upload formats + PDF; image outputs
and EPUB/FB2/HTML/RTF/MD are excluded — Forma cannot store or
open them as documents, and a thumbnail is not a document).

| Input | Offered outputs (Forma formats only) |
|---|---|
| docx | odt, pdf, txt |
| doc | docx, odt, pdf, txt |
| odt | docx, pdf, txt |
| txt | docx, odt, pdf |
| xlsx | csv, ods, pdf |
| xls | csv, ods, xlsx, pdf |
| ods | csv, xlsx, pdf |
| csv | ods, xlsx, pdf |
| pptx | odp, pdf |
| ppt | odp, pptx, pdf |
| odp | pptx, pdf |
| pdf | docx, txt |
| png, jpg, jpeg | none (an image is not convertible by the office engine) |

Notes on the matrix (recorded honestly, not silently):
- No cross-family conversions: a word document cannot become a
  spreadsheet, and a spreadsheet cannot become a presentation.
  The engine converts within a family, plus every editable
  format to PDF, plus PDF back to DOCX/TXT.
- `docx → doc` and `xlsx → xls` are NOT offered: the editor's
  own "Download as" list does not include them (the engine
  moves forward to the modern format, not back to the legacy
  one). If a live test against the docserver later proves the
  ConvertService does them, the matrix can grow — it is data,
  not code.
- `pdf → xlsx` (WPS's "PDF-to-Excel") is NOT offered in v1:
  the PDF editor's "Download as" list is DOCX, DOTX, EPUB,
  FB2, HTML, JPG, PDF/A-2a, PNG, RTF, TXT — no XLSX. Same
  rule: if a live test proves it, the matrix grows.
- `pdf → docx` uses the ConvertService `documentRenderer`
  parameter (the PDF is rendered to text first); the result's
  fidelity depends on the PDF. It is offered because the
  editor's own list includes DOCX for a PDF input.
- The same-format target is never offered (converting a DOCX
  to DOCX is a no-op).

### Result validation (by target format)
The converted bytes are validated before anything is saved —
the same rule as the export (never return or store partial or
wrong-format bytes):
- pdf → starts with `%PDF-` (already in export.server.ts).
- docx, xlsx, pptx, odt, ods, odp, doc, xls, ppt → ZIP
  archives, start with `PK\x03\x04` (the `looksLikeOfficeZip`
  helper already exists in editor.ts).
- txt, csv → plain text: valid UTF-8, non-empty, and NOT a
  ZIP or PDF (a wrong-format response is caught, not stored).
- Size: non-empty and ≤ 50 MB (the upload cap).

### Where the result goes (design decision)
The conversion creates a **new document** in the library
(same workspace, same folder as the source), titled with the
new extension, version 1 — never a new version of the source,
and never an overwrite. Rationale: the WPS plan acceptance
says "the result downloads as a new file, never overwriting
the original", and a converted file is a different file (a
different format) that the user may want to edit, share or
download independently. The route returns the new document's
id + title + mime type, and the UI links to it. (The Day 7
export is different: it streams a download and creates
nothing — because an export is a throwaway copy, not a new
document.)

### Reuse (not reinvention)
- `buildConvertRequest` / `parseConvertResponse` /
  `FixedWindowRateLimiter` / `EXPORT_TIMEOUT_MS` /
  `MAX_EXPORT_BYTES` from `src/lib/export.ts` (generalise the
  request's `outputtype` from `"pdf"` to a string).
- `convertToPdf` in `src/lib/export.server.ts` becomes the
  general `convertDocument` (same JWT + fetch + download +
  validation, parameterised by output type). The export route
  keeps calling it with `outputtype: "pdf"` — no behaviour
  change for the export.
- `buildStoragePath` / `DOCUMENTS_BUCKET` / `MAX_UPLOAD_BYTES`
  from `src/lib/storage.ts`; the document-creation rows mirror
  the upload action (documents + document_versions, version 1).
- The file-token + HMAC download URL pattern from the export
  route (the converter fetches the source from Forma's own
  file route, so the docserver never sees a Storage URL).
- The rate limiter: 10/min per user, same constants as the
  export (a shared limiter is the multi-instance hardening
  item, unchanged).

## Plan (loop step 2) — small tasks

1. `src/lib/convert.ts` (pure): the matrix
   (`CONVERSION_MATRIX: Record<sourceExt, targetExt[]>`),
   `getConvertibleTargets(sourceExt)`, `isConversionSupported(from, to)`,
   `getTargetMimeType(ext)`, `validateConvertedBytes(bytes, targetExt)`
   (PDF / ZIP / text checks), `getConvertedFileName(title, targetExt)`
   and `getConvertedTitle(title, targetExt)`. Test: `convert.test.ts`
   (every matrix row, same-format refused, unknown formats refused,
   byte validation per target, filename helpers).
2. `src/lib/convert.server.ts` (server-only): `ConvertError`
   (status), `convertDocument({fileUrl, fileType, outputType, title})`
   — generalise `convertToPdf` (same JWT, same fetch, same
   download, validation by target type). Refactor `export.server.ts`
   to call it with `outputtype: "pdf"` (export behaviour unchanged;
   its tests still pass). Test: the existing export tests + new
   convert tests (request building per output type, response
   parsing, byte validation).
3. `POST /api/documents/[id]/convert` (route): Zod `{outputType}`,
   RLS document load (user client), the conversion must be in the
   matrix (400 otherwise), the source must have a file (400), the
   target must not equal the source (400), rate-limited 10/min,
   convert via the server module (503 when the docserver is not
   configured — the live state today), upload the result to Storage
   as a NEW document (same workspace + folder, new id, version 1,
   title with the new extension), insert the documents +
   document_versions rows, return `{ok, document: {id, title,
   mimeType, folderId}}`. Test: unit (matrix/validation) + live
   (validation/RLS paths without the docserver; the full
   conversion when the docserver returns).
4. UI: `/documents/[id]/convert` page (server + client, same
   pattern as the pdf-form/builder pages): shows the source
   document, lists the offered target formats from the matrix
   (with a plain-language label per format), a Convert button,
   and on success a link to the new document ("Open the
   converted file"). Library: a "Convert" action in
   DocumentActions for convertible documents (all 12 office
   formats + PDF; images get no Convert action). Test: the page
   loads for A (200, lists the targets), B sees "Document not
   found".
5. Live e2e (`scripts/e2e-convert-test.mjs`, focused harness):
   as a real user A — convert a DOCX to PDF (the new document
   appears in the library with the right mime type and the PDF
   magic bytes, and the original is untouched), convert a CSV
   to XLSX, convert a PDF to DOCX, an unsupported conversion
   refused 400, same-format refused 400, cross-user 404,
   signed-out 307, the convert page loads for A / "Document not
   found" for B. **Blocked on the docserver** — run the
   validation/RLS part now, the full conversion when the
   docserver is back.
6. Docs + commit + handoff + reply: WPS_LEVEL_PLAN.md (Phase D
   → Done, with the docserver caveat), feature-matrix.csv
   (FORMA-023), known-limitations.md (matrix limits, the
   docserver blocker, no cross-family / no PDF-to-Excel in v1),
   CHANGELOG.md (Day 14 entry), docs/handoffs/day-14.md,
   commit on branch `day-14-conversion-hub`, MEMORY.md, reply.

## Acceptance (to check at the end)
- The matrix offers only conversions the engine's own "Download
  as" tables list, restricted to Forma's formats.
- Every conversion creates a new document; the original is
  never modified or overwritten.
- The converted bytes are validated by target format before
  anything is saved.
- Unit tests green; the live e2e's validation/RLS part green;
  the full conversion part recorded as blocked on the docserver
  (with the exact 403 evidence), not claimed as done.
