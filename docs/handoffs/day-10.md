# Day 10 handoff — Editing: fonts, styling, every format

Date: 2026-11-18 (early morning). Branch: `day-10-editing-fonts`.
Owner instruction (2026-11-18 00:49 PKT): "make sure the editing
fieter is very important the fonts and also styling all the features
applicable to every formate like docx pdf and excel file and ppts
too" — interpreted as: the editing feature must keep fonts and
styling, and it must be proven for every format (DOCX, PDF, XLSX,
PPTX).

## 1. What was researched

- **How the PDF text edit lost styling.** Day 9 drew every
  replacement in standard Helvetica with no colour set. Two
  separate losses: (1) the font — the run's BaseFont name was
  never read from the font dict, so the replacement could not
  match it; (2) the colour — the extractor's header claimed it
  tracked `rg/RG` but no colour operator was handled at all, so
  the run's fill colour was unknown.
- **The embedded font cannot be reused.** An embedded subset
  font almost never contains the replacement text's glyphs, so
  reusing the original font would render blanks. The honest
  substitute is the closest of the 14 standard PDF fonts, chosen
  from the BaseFont name (family, weight, slant).
- **The docserver's font substitution.** The VM has no MS core
  fonts (the ttf-mscorefonts-installer is half-configured and its
  SourceForge downloads fail through the proxy). ONLYOFFICE
  substitutes metric-compatible fonts: Arial -> Liberation Sans,
  Times New Roman -> Liberation Serif, Calibri -> Carlito. A
  styled round-trip (bold red / italic blue / plain black in each
  format) proves the substitution keeps bold, italic, family and
  colour.
- **A real extractor bug, caught by a test.** The old extractor
  reset the whole text state on BT (font, size, leading...). The
  PDF spec says BT resets ONLY the text matrix and text line
  matrix; the font and size persist across BT...ET blocks, and
  the text state is part of the graphics state saved by q/Q. A
  stream where two text objects share one Tf (the second has no
  Tf of its own) lost its second run entirely under the old code.

## 2. Completed functionality

- **PDF text editing keeps the font and colour.** The
  replacement is drawn in the closest standard font to the run's
  BaseFont (Arial/Liberation Sans -> Helvetica, Times/Liberation
  Serif -> Times, Courier/monospace -> Courier; bold and italic
  kept; subset prefixes stripped) and in the run's fill colour
  (rg/g/k, CMYK converted to RGB; grey via `g`). When the stream
  never set a colour, no colour is set and the replacement
  inherits the colour in effect (the same colour the original run
  had). The replacement block is wrapped in q...Q so the font and
  colour it sets never leak into later runs — without the wrapper,
  a later run that relies on the font set earlier would silently
  change font.
- **The extractor is spec-correct.** The text state (font, size,
  leading, charSpace, wordSpace, horizScale, rise, Tm, Tlm) now
  lives in the graphics state: BT resets only Tm/Tlm, and q/Q
  save and restore the whole state (CTM + fill colour + text
  state). A colour change ends the current run, so a run never
  spans two colours.
- **The editor is proven live for every format.** DOCX opens as
  documentType `word`, XLSX as `cell`, PPTX as `slide`; a
  simulated ONLYOFFICE save callback (status 2) creates version 2
  with the edited text for each. A styled file in each format
  (bold red / italic blue / plain black) exports to a PDF that
  keeps the bold font (Liberation Sans-Bold), the italic font
  (Liberation Serif-Italic), the plain font (Carlito) and the red
  and blue colours.
- **PDF editing live proof, extended.** The edit harness now
  edits a styled PDF: a bold red line becomes a new heading drawn
  in Helvetica-Bold in red, an italic blue line becomes a new
  note drawn in Times-Italic in blue, and the plain black line is
  untouched.

## 3. Code and data changes

- `src/lib/pdf-content.ts`:
  - `PdfFontInfo` gains `baseFont: string | null`.
  - `PdfTextRun` gains `baseFont` and `fillColor` (`{r,g,b}` 0..1
    or null).
  - `extractTextRuns` reworked: the graphics state is now
    `{ctm, fillColor, ts}` with a deep-copy stack for q/Q; BT
    resets only Tm/Tlm; `rg`/`g`/`k` set the fill colour (and end
    the current run); the run records its base font and fill
    colour.
  - `buildReplacementOps` gains an optional `fillColor` argument
    and wraps the block in `q ... Q`, emitting `<r> <g> <b> rg`
    only when a colour is known.
- `src/lib/pdf-edit.ts`:
  - `getPageFonts` reads `BaseFont` from each font dict.
  - New exported `mapBaseFontToStandard(baseFont)` — subset
    prefix stripped, family/weight/slant mapped to the closest
    StandardFonts value (Courier for courier/mono, Times for
    times/georgia/serif-not-sans, Helvetica otherwise).
  - `ensureEditFont` takes the standard font to embed.
  - `editTextInPdf` maps the target run's BaseFont and passes
    its fill colour to the replacement ops.
- Tests: `src/lib/pdf-content.test.ts` (+6: colour/base-font
  recording, grey/CMYK, q/Q colour restore, q/Q wrapper + colour,
  no-colour inheritance, no font leak) and
  `src/lib/pdf-edit.test.ts` (+2: the font map, and a styled-PDF
  edit that keeps bold-red and italic-blue, verified with qpdf
  --qdf and qpdf --check). A `styledPdf()` fixture builder and
  `qdfText`/`qpdfOk` helpers live in the edit test file.
- Harnesses (dev only): `scripts/e2e-pdf-test.mjs` gains
  section 7 (styled DOCX/XLSX/PPTX export + editor page and save
  callback for XLSX and PPTX) plus `pdfFonts` and `zipRead`
  helpers; `scripts/e2e-edit-test.mjs` gains section 2b (styled
  PDF font/colour edit) plus a `qdfText` helper and the styled
  PDF upload. Fixtures in `/tmp/e2e/`: `styled.docx`,
  `styled.xlsx`, `styled.pptx` (built by
  `/tmp/e2e/make_styled_fixtures.py` with python-docx/openpyxl/
  python-pptx), `styled-edited.xlsx`, `styled-edited.pptx` (for
  the callbacks), `styled.pdf` (built with pdf-lib).
- Docs: `docs/project-brief/WPS_LEVEL_PLAN.md` (spreadsheet and
  presentation editors Done, PDF editing fonts+colour Done),
  `docs/feature-matrix.csv` (FORMA-007/008/009/010/015 updated),
  `docs/known-limitations.md` (rewritten to Day 10: font/colour
  now kept, exact-font and stroked-colour limits stated, editor
  proven for all three formats), CHANGELOG (Day 10 entry).

## 4. Tests

- **Unit: 120/120 pass (14 files)** — up from 111. New: 6 in
  pdf-content.test.ts, 2 in pdf-edit.test.ts (one builds a
  styled PDF in-test and checks the edited file with qpdf).
- **Live RLS: 9/9 pass** (`npm run test:live` — unchanged).
  **Local RLS: 18/18 pass** (re-run, no regression).
- **Live e2e PDF features: 41/41 pass**
  (`node scripts/e2e-pdf-test.mjs`) — the 24 Day 9 checks plus
  17 new ones: styled DOCX/XLSX/PPTX exports keep all three
  lines, the bold font and the italic font; editor XLSX opens as
  `cell` and PPTX as `slide`; both save callbacks are accepted
  and create version 2 with the edited text.
- **Live e2e PDF editing: 29/29 pass**
  (`node scripts/e2e-edit-test.mjs`) — the 21 Day 9 checks plus
  8 new ones: a bold red edit returns version 2 drawn in
  Helvetica-Bold in red, an italic blue edit returns version 3
  drawn in Times-Italic in blue, and the plain black line is
  untouched.
- **Engine round-trip (direct ConvertService):** styled DOCX,
  XLSX and PPTX each convert to a PDF with the text, the three
  fonts (Liberation Sans-Bold, Liberation Serif-Italic, Carlito)
  and the red (`1 0 0 rg`) and blue (`0 0 1 rg`) colours.
- **Lint: 0 errors, 0 warnings. Typecheck, format, build: pass.**

## 5. Deployment verification

- Build passes; the app server was restarted with the new build
  (next-server killed by explicit PID). App root 200,
  supabase-status reachable. The docserver (8083) and the file
  server (8899) are still running.
- Preview deployment: NOT PERFORMED (no Git/Vercel remote
  access). No Preview URL is claimed.

## 6. Security/licensing checks

- Secret scan of the staged diff: clean (no keys; the harness
  reads `.env.local` at runtime and never prints secrets).
- No new routes or permissions. The font/colour work is inside
  the existing edit-text route (same RLS, same rate limit, same
  version bookkeeping).
- ONLYOFFICE licence: unchanged (Community AGPLv3 for the
  evaluation; a proprietary commercial launch still needs the
  Developer licence + legal review). PDF editing uses pdf-lib +
  PDF.js (open-source).

## 6b. Verification notes and fixes made during Day 10

- **Four test failures, three of them test bugs and one a real
  extractor bug:**
  1. The hex-string expectation used uppercase (`<4E6577>`);
     the serializer writes lowercase hex (`<4e6577>`). Test fixed.
  2. The no-leak test expected two runs from a stream where two
     BT blocks share one Tf — the extractor found one. That was
     the real bug: BT was resetting the whole text state. Fixed
     by moving the text state into the graphics state (BT resets
     only Tm/Tlm; q/Q save/restore it).
  3. `mapBaseFontToStandard("LiberationSerif-BoldItalic")`
     returned Helvetica-BoldOblique — the serif branch was
     designed but never written. Added (times/georgia/serif-not-
     sans -> Times).
  4. The plain black line's fill colour was expected to be null
     — pdf-lib writes an explicit `0 0 0 rg` for its default
     colour, so it is `{0,0,0}`. Test fixed (and the replacement
     now explicitly sets black, which is better).
- **The no-leak test's second assertion** searched for the
  literal `(Second)` in the serialized stream, but the serializer
  writes strings as hex (`<5365636f6e64>`). Fixed to the hex form.
- **ESM scripts in /tmp cannot import project packages.**
  `node /tmp/.../convert2.mjs` fails with ERR_MODULE_NOT_FOUND
  for `jose` (resolution is based on the script's location, not
  the cwd). Copy the script into the project root (or run it
  from there) — done for the styled conversions.
- **qpdf is now installed** (`apt-get install -y qpdf`, 11.9.0;
  the dpkg error shown is the old half-configured
  ttf-mscorefonts-installer, not a qpdf failure). It does NOT
  survive a VM reset.
- **python-pptx is now installed** (`pip install
  --break-system-packages python-pptx`, 1.0.2). It does NOT
  survive a VM reset either (pip packages are wiped).

## 7. Known defects and limitations

- Text editing still does not reflow: the replacement sits where
  the old text was (same baseline/size/rotation). A longer
  replacement overflows; the UI says so.
- The exact original font is never reused (its subset lacks the
  replacement's glyphs) — the closest standard font is drawn
  instead. The UI should say the font is matched, not identical.
- A run drawn stroked (Tr 1/2) keeps its fill colour only; the
  stroking colour is not tracked.
- The browser UI round-trip (a human typing in the ONLYOFFICE
  editor) is still NOT proven — no browser here can reach the
  local docserver. The API-level proof now covers all three
  formats.
- qpdf and python-pptx do not survive a VM reset (reinstall on
  demand). Ghostscript and the document server are the same.
- The CSV edge case from Day 6 (a CSV edited in the editor may
  save back as XLSX and be rejected by the callback's filetype
  check) is still untested live.

## 8. Tomorrow's target

- Highest-priority feature: **Phase B, feature 4 — PDF form
  fill** (per `docs/project-brief/WPS_LEVEL_PLAN.md`): fill
  AcroForm fields in a PDF, via ONLYOFFICE Docs (pdf, form) or a
  Forma-own implementation — one feature, deeply and
  production-grade, per the owner's method. Acceptance: a filled
  field shows the entered value and survives a reopen; the
  original file is never overwritten (a new version is created);
  a PDF with no form fields reports that honestly instead of
  faking a form.
- Dependencies/blockers: none new. The document server and
  Ghostscript still run locally only (manual start, do not
  survive a VM restart); the browser UI round-trip still needs a
  real browser on a machine that can reach the app + docserver.
