# Day 30 handoff — Remaining templates (6 new templates)

Owner instruction (2026-11-21 19:55 PKT): "okay go head
implement the next feature properly by using feature
loop.md". The audit queue was empty (Day 28 closed it), so
the next feature is the first item of the follow-up list
(Day 28 handoff §8): the remaining templates from audit
§3.12 / §8 — proposal / contract, invoice / purchase order,
meeting minutes, certificate / form, spreadsheet
budget/tracker, presentation pitch-deck. Day 16 delivered
only the first three (resume, letter, report).

## 1. Research

- **The Day 16 pattern** (`scripts/generate-templates.py`
  is the source of truth): each template is a real Office
  file built with python-docx, its first page rendered to a
  PNG thumbnail (LibreOffice headless → PDF → pdftoppm),
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
- **The gap for XLSX/PPTX.** The registry had no file-type
  field and the apply action hardcoded `"docx"` for the file
  name and the MIME type. A budget tracker (XLSX) and a pitch
  deck (PPTX) need the template's own extension + MIME type.
  The preview extractor was DOCX-only (it reads
  `word/document.xml`); XLSX needs the sheet names + cell
  values, PPTX the slide titles + text.
- **LibreOffice + pdftoppm are present** (`/usr/bin/libreoffice`,
  `/usr/bin/pdftoppm`), so thumbnails for XLSX/PPTX use the
  same `render_thumbnail` (LibreOffice converts any Office
  file to PDF). The verify step checks the right main part
  per type (`word/document.xml` / `xl/workbook.xml` /
  `ppt/presentation.xml`).
- **The Day 16 e2e harness** (`scripts/e2e-templates-test.mjs`)
  drives the apply through the gallery form (loads /templates,
  extracts the action fields, POSTs the form).
- **`scripts/vercel-setup.py`** (Day 29) builds resume/letter/
  report by importing the builders from generate-templates.py
  and draws PIL thumbnails. It had to be updated to build all
  9 templates, or the Vercel build would ship a gallery with
  6 broken templates.

## 2. What was built

The gallery now has nine templates (FORMA-038):

| Template | Type | Content |
|---|---|---|
| Business Proposal | DOCX | Title, client + prepared-by, executive summary, scope, deliverables, a timeline table, a pricing table, terms |
| Invoice | DOCX | Business details, bill-to, invoice no. + date + due date, a line-items table (description / qty / rate / amount), subtotal / tax / total, payment terms |
| Meeting Minutes | DOCX | Title, date / time / location, attendees, agenda, discussion, decisions, an action-items table (action / owner / due) |
| Certificate of Achievement | DOCX | Title, recipient name, the achievement, a details table, two signature lines |
| Monthly Budget Tracker | XLSX | A Budget sheet: income rows, expense categories, Budget / Actual / Difference columns with formulas (SUM + subtraction), a totals row, a Remaining row |
| Pitch Deck | PPTX | 7 slides: title, problem, solution, market, product, business model, team + ask |

**Code changes:**
- `scripts/generate-templates.py` — `build_proposal`,
  `build_invoice`, `build_minutes`, `build_certificate`
  (python-docx, the same style as the Day 16 builders);
  `build_budget` (openpyxl); `build_pitch` (python-pptx);
  `extract_preview_xlsx` (sheet names as "Heading1" + the
  first 20 rows' cell values) and `extract_preview_pptx`
  (slide titles as "Heading1" + body text); `verify`
  generalised to check the main part per file type; the
  TEMPLATES list now carries (slug, builder, extractor,
  extension, first heading).
- `src/lib/templates.ts` — the 6 new templates with a
  `fileType: "docx" | "xlsx" | "pptx"` field + their preview
  JSON imports.
- `src/features/library/actions.ts` — `applyTemplate` uses
  the template's `fileType` for the file name extension and
  the MIME type (via `ALLOWED_UPLOAD_TYPES[template.fileType]`)
  instead of hardcoded "docx".
- `src/features/library/schemas.ts` — the `applyTemplateSchema`
  enum now covers all nine template ids (the schema test fails
  until this enum matches the registry).
- `scripts/vercel-setup.py` — builds all nine templates (the
  DOCX builders + the new XLSX/PPTX builders and their
  extractors) so the Vercel build regenerates them.
- `scripts/e2e-templates-test.mjs` — applies all nine
  templates, checks the right MIME type + extension + main
  part per type, and uses "contract" (still unknown) as the
  rejected id.

## 3. Two real bugs found and fixed in the work

1. **The budget's Total-income SUM started at the wrong row.**
   The builder hardcoded `=SUM(B7:B7)` — the income rows are
   at rows 6–7, so the total only summed the second income row.
   Fixed by tracking `income_start` (the first income row) and
   summing `B{income_start}:B{row - 1}`. The expense SUM was
   already correct (it tracked `expense_start`).
2. **The pitch deck's title-slide subtitle was never written.**
   The builder checked `placeholder_format.type == 2` (BODY),
   but the title layout's subtitle placeholder is type 4
   (SUBTITLE). The subtitle was empty, so the preview had 13
   entries instead of 14. Fixed by accepting types 2 and 4.
   The preview extractor's XLSX row limit was also raised
   12 → 20 so the full budget (Total expenses + Remaining)
   is in the preview.

## 4. Tests

- **Unit: 414 passed, 0 failed, 9 skipped** (28 new template
  tests: the 9-template list, the per-type file validation,
  the preview first-line checks for all nine, the budget
  columns/totals, the pitch's 7 slide titles, the invoice
  line-items table, the file-type-matches-file-name check).
  The full suite was red at first (17 failures) because a VM
  reset had wiped /tmp (the PDF fixtures) — rebuilt with
  `python3 scripts/rebuild-fixtures.py` — and because the
  schema enum and the two "invoice is unknown" tests still
  treated invoice as unknown. All fixed; the suite is green.
- **Live e2e: 68/68** (`scripts/e2e-templates-test.mjs`): the
  gallery lists all nine templates + thumbnails + preview text;
  each of the nine applies as a real user and creates a document
  with the right MIME type + extension + version 1, the stored
  file is a valid Office file containing the template's text,
  and a version-1 row exists; the applied resume opens in the
  editor as a word document; an unknown template id ("contract")
  is refused and leaves no document; user B does not see A's
  documents and can apply a template in their own workspace;
  a signed-out POST 307s to login.
- **Typecheck + build pass.** `scripts/vercel-setup.py` was
  proven by deleting all 9 template files + thumbnails +
  previews and rebuilding them from nothing (all 9 rebuilt).
- **The one e2e failure on the first run** was the pitch
  preview check: the gallery shows only the first 8 preview
  entries by design, so "Business Model" (entry 10) is not on
  the page. The check now matches the page's behaviour ("The
  Problem" + the "…and N more lines" note).

## 5. Honest limits

- The templates are Forma's own original content with
  bracketed placeholders — no WPS template, no copied text.
- The budget tracker's preview shows the formulas
  (e.g. `=SUM(B6:B7)`), not the computed results — the numbers
  are computed when the spreadsheet is opened in the editor.
- The pitch deck is 7 slides of title + body text only — no
  charts, images or animations (python-pptx cannot do those
  reliably; the audit already records no PPTX animation).
- The thumbnails are LibreOffice renders locally; on Vercel
  they are the Pillow cards (Day 29) — the gallery shows the
  same thumbnail path either way.
- No "save a custom template" yet (a per-user template store
  is a separate feature).

## 6. Docs + commit

- `docs/feature-matrix.csv` — FORMA-038.
- `CHANGELOG.md` — Day 30 entry.
- `docs/project-brief/FEATURE_AUDIT.md` — §3.12 row and §8
  updated (all nine done; save-a-custom-template still not
  started).
- `docs/project-brief/FEATURE_LOOP.md` — queue item 14
  (Day 30) marked Done.
- `docs/known-limitations.md` — the Templates limits entry
  updated for the nine templates.
- `docs/handoffs/day-30-plan.md` + this handoff.
- Local branch `day-30-remaining-templates`; the GitHub
  snapshot push is the next step (the 6 new binary template
  files + 6 new thumbnails are NOT carried by the snapshot
  push — they are regenerated at Vercel build time by
  `scripts/vercel-setup.py`, or pushable from the owner's
  machine with git).

## 7. What is still open

- **The Vercel deployment is still blocked** on the owner's
  re-authorization (403 on the `muhmmad-anas-projects` team
  scope) or a self-import from the Vercel dashboard — the
  owner said "okay now check it" at 2026-11-20 01:45 PKT and
  the check found the access still blocked (no deployment at
  office-application.vercel.app). Nothing changed since.
- **The next feature** (the follow-up list, in order): "save
  a custom template" (needs a per-user template store — a
  table + Storage), stamps/watermarks, insert-pages-from-an-
  image, Day 25's "export with comments" + "local reviewer
  notes" half, deleting the /plan route, a live 390px render,
  the docserver reinstall.
