# Day 30 plan — Remaining templates (6 new templates)

Owner instruction (2026-11-21 19:55 PKT): "okay go head
implement the next feature properly by using feature
loop.md". The audit queue is empty (Day 28 closed it), so
the next feature is the first item of the follow-up list
(Day 28 handoff §8): the remaining templates from audit
§3.12 / §8 — proposal / contract, invoice / purchase order,
meeting minutes, certificate / form, spreadsheet
budget/tracker, presentation pitch-deck. Day 16 delivered
only the first three (resume, letter, report).

## 1. Research (done)

- **The Day 16 pattern** (`scripts/generate-templates.py`
  is the source of truth): each template is a real Office
  file built with python-docx, its first page rendered to
  a PNG thumbnail (LibreOffice headless → PDF → pdftoppm),
  and its text extracted to a `<slug>.preview.json` (a list
  of `{style, text}`), so the preview can never drift from
  the file. The registry (`src/lib/templates.ts`) lists the
  templates + their preview data; the server bytes reader
  (`src/lib/templates.server.ts`) reads the file from disk;
  the gallery page (`src/app/(workspace)/templates/page.tsx`)
  shows the thumbnail + preview + an ApplyTemplateForm;
  the apply action (`applyTemplate` in
  `src/features/library/actions.ts`) copies the template
  file into the user's library as a new document (v1).
- **The gap for XLSX/PPTX.** The registry has no file-type
  field and the apply action hardcodes `"docx"` for the
  file name (`getTemplateFileName(title, "docx")`) and the
  MIME type (`ALLOWED_UPLOAD_TYPES.docx`). A budget tracker
  (XLSX) and a pitch deck (PPTX) need the template's own
  extension + MIME type. The preview extractor is DOCX-only
  (it reads `word/document.xml`); XLSX needs the sheet
  names + cell values, PPTX the slide titles + text.
- **LibreOffice + pdftoppm are present** (`/usr/bin/libreoffice`,
  `/usr/bin/pdftoppm`), so thumbnails for XLSX/PPTX use the
  same `render_thumbnail` (LibreOffice converts any Office
  file to PDF). The verify step must check the right main
  part per type (`word/document.xml` / `xl/workbook.xml` /
  `ppt/presentation.xml`).
- **The Day 16 e2e harness** (`scripts/e2e-templates-test.mjs`)
  drives the apply through the gallery form (loads
  /templates, extracts the action fields, POSTs the form).
  It can be extended to the 6 new templates (or a Day 30
  harness written the same way).
- **The vercel-setup.py** (Day 29) builds resume/letter/
  report by importing the builders from generate-templates.py
  and draws PIL thumbnails. It must be updated to build all
  9 templates (the DOCX builders + the new XLSX/PPTX builders
  and their preview extractors), or the Vercel build will
  ship a gallery with 6 broken templates.

## 2. The six templates (all Forma's own original content)

| # | Template | Type | Content (bracketed placeholders) |
|---|---|---|---|
| 1 | Business Proposal | DOCX | Title, client + prepared-by, executive summary, scope, deliverables, a timeline table, a pricing table, terms |
| 2 | Invoice | DOCX | Business details, bill-to, invoice no. + date + due date, a line-items table (description / qty / rate / amount), subtotal / tax / total, payment terms |
| 3 | Meeting Minutes | DOCX | Title, date / time / location, attendees, agenda, discussion, decisions, an action-items table (action / owner / due) |
| 4 | Certificate of Achievement | DOCX | Title, "This certifies that", recipient name, the achievement, date, two signature lines (issued by / date) |
| 5 | Monthly Budget Tracker | XLSX | A Budget sheet: income rows, expense categories, a monthly budget column, an actual column, a difference column with formulas (SUM + subtraction), a totals row |
| 6 | Pitch Deck | PPTX | 7 slides: title, problem, solution, market, product, business model, team + ask |

## 3. Small tasks (in order)

1. **Generator — DOCX builders.** Add `build_proposal`,
   `build_invoice`, `build_minutes`, `build_certificate` to
   `scripts/generate-templates.py` (python-docx, the same
   style as build_resume/letter/report: Title + Heading1 +
   Normal + tables). Test: run the script, the 4 DOCX files
   are valid ZIPs with `word/document.xml`.
2. **Generator — XLSX builder.** Add `build_budget` (openpyxl):
   a "Budget" sheet with income rows, expense categories,
   Budget / Actual / Difference columns, SUM formulas and a
   totals row. Test: the file is a valid ZIP with
   `xl/workbook.xml` and the formulas are present.
3. **Generator — PPTX builder.** Add `build_pitch` (python-pptx):
   7 slides (title layout for slide 1, title-and-content for
   the rest), each with a title + body text. Test: the file
   is a valid ZIP with `ppt/presentation.xml` and 7 slides.
4. **Generator — preview extractors.** Add
   `extract_preview_xlsx` (sheet names as "Heading1" +
   the first rows' cell values as "Normal") and
   `extract_preview_pptx` (slide titles as "Title"/
   "Heading1" + body text as "Normal"), so the gallery
   preview works for all three types with no page change
   (the page already renders Title/Heading1/Normal). Test:
   each preview JSON is non-empty and starts with the
   template's first heading/title.
5. **Generator — verify + the TEMPLATES list.** Generalise
   `verify` to check the main part per file type, and add
   the 6 templates to the script's TEMPLATES list (with
   their first heading/title). Test: `python3
   scripts/generate-templates.py` builds all 9 files +
   thumbnails + previews and verifies them.
6. **Registry.** Add the 6 templates to `src/lib/templates.ts`
   (with a `fileType: "docx" | "xlsx" | "pptx"` field and
   their preview JSON imports) and a `getTemplateMimeType`
   helper (from the fileType via ALLOWED_UPLOAD_TYPES).
   Test: the unit test lists 9 templates.
7. **Apply action.** Change `applyTemplate` to use the
   template's fileType for the file name extension and the
   MIME type (instead of hardcoded "docx"). Test: applying
   the budget tracker creates an XLSX document, the pitch
   deck a PPTX document.
8. **vercel-setup.py.** Extend its TEMPLATES list to all 9
   (the DOCX builders + the new XLSX/PPTX builders and
   their extractors) so the Vercel build regenerates them.
   Test: `python3 scripts/vercel-setup.py` rebuilds all 9
   from nothing.
9. **Unit tests.** Update `src/lib/templates.test.ts`: 9
   templates (the "rejects unknown template ids" test must
   stop rejecting "invoice" — it is now real; use a still-
   unknown id), the file validation per file type (the main
   part by fileType), the thumbnail PNG check, the preview
   check. Test: the suite passes.
10. **Live e2e.** Extend the Day 16 harness (or a Day 30
    harness the same way) to apply all 9 templates as a
    real user and verify each creates a document with the
    right MIME type + extension, the template itself is
    unchanged, cross-user isolation, signed-out 307.
    Test: the harness passes.
11. **Docs + commit + handoff + reply.** Feature matrix
    (FORMA-038), known-limitations, CHANGELOG, the audit
    §3.12 + §8 rows → Done, the loop queue (add a Day 30
    row), MEMORY.md, the handoff, the commit on
    `day-30-remaining-templates`, the reply.

## 4. Honest limits (to record)

- The templates are Forma's own original content with
  bracketed placeholders — no WPS template, no copied text.
- The XLSX budget tracker uses formulas (SUM + subtraction)
  — LibreOffice/Excel compute them; the preview shows the
  cell values, not the computed results.
- The PPTX pitch deck is 7 slides with title + body text —
  no charts, no images, no animations (python-pptx cannot
  do those reliably; the audit already records no PPTX
  animation).
- The thumbnails are LibreOffice renders locally; on Vercel
  they are the Pillow cards (Day 29) — the gallery shows the
  same thumbnail path either way.
