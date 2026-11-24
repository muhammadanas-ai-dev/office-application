# Forma Office — Feature Audit (what is built, what is not)

**Date:** 2026-11-18
**Source:** the owner's uploaded `WPS_FEATURE_PARITY_CHECKLIST.md`
(2026-11-18), checked against the actual app
(`~/workspace/nextjs-supabase-app/` — code, routes, tests, handoffs).
**Owner's scope decisions (2026-11-18):** AI features (checklist §7)
SKIPPED for now; cloud services (storage limits / quotas, cloud
drive, sync, multi-user collaboration, billing/plan UI) SKIPPED —
he has a Supabase free plan. Everything else is built one feature
at a time with the standing loop (research → plan → implement →
test).

## How to read this

- ✅ **Done** — built, tested, and proven (the evidence is named).
  "Via the editor" means ONLYOFFICE Docs provides it; Forma
  integrates the editor, it does not re-build it.
- 🟡 **Partial** — exists but has a real gap (the gap is named).
- ❌ **Not started** — no code for it.
- ⏭️ **Skipped** — excluded by the owner's scope decision above.

**One honest caveat that applies to every "via the editor" item:**
the editor round-trip is proven at the API level (the editor page
loads with the right document type, a simulated save creates
version 2 — 41/41 live checks, Day 10), but NOT by a human typing
in the editor UI in a browser, because no browser here can reach
the local document server, and the document server itself is
currently wiped (its installer download returns 403). The editor's
own features are real (they are ONLYOFFICE's, tested by
ONLYOFFICE); the browser proof is the missing piece.

## ⚠️ Two scope conflicts to confirm (not silent)

1. **The checklist says "local-first — do not upload document
   binaries to Supabase Storage" (§2.2, §13.2). The app as built
   DOES store document binaries in Supabase Storage** (the
   `documents` bucket, Days 3–4, from the owner's own 16 brief
   files — Supabase is the backend). What is skipped per his
   instruction is the quota / plan / cloud-drive / sync UI, not
   the Storage-based library. If he wants true local-first
   (files on the device, IndexedDB drafts), that is a redesign
   of the library, not a new feature.
2. **"New blank document" creates a title-only row with no
   file** (`createDocument` inserts a document with a title and
   no `file_path` / `mime_type`). It cannot be opened in the
   editor until a file is uploaded. It is a real gap, not a
   working blank-document flow.

## 1. Product scope (§2)

| Item | Status | Evidence / note |
|---|---|---|
| App shell + 9 workspace areas (Home, Recent, My files, Shared, Starred, Templates, Trash, Settings, Plan) | ✅ Done | Day 2. Templates / Shared / Plan are placeholders (see below) |
| Supabase Auth + secure metadata schema | ✅ Done | Day 3; 8 tables, RLS local 18/18 + live 9/9 |
| Real Writer/Spreadsheet/Presentation editing engine | ✅ Done (via the editor) | ONLYOFFICE Docs 10.0.0, Days 5–6; API-level proof 41/41 |
| Import / edit / save / export / print | 🟡 Partial | Import ✅, edit ✅, save ✅ (v2 on callback), export ✅ (PDF, Day 7 — blocked on the docserver), print ✅ via the editor |
| Feature-entitlement structure (Free/Premium split later) | 🟡 Partial | `plan_key` exists on workspaces; no premium gating, no plan UI (skipped) |
| Cloud drive / quotas / sync / backup / multi-device | ⏭️ Skipped | Per the owner's instruction |

## 2. Writer (§3)

### 3.1 Document lifecycle

| Item | Status | Evidence / note |
|---|---|---|
| Create a blank document | 🟡 Partial | The button exists but creates a title-only row with no file (see conflict 2) — it cannot be opened or edited |
| Open an existing document from the device | ✅ Done | Upload (14 formats) + open in the editor, Days 4–6 |
| Edit an imported document | ✅ Done (via the editor) | Save callback creates version 2, proven live |
| Save / Save As / Download | 🟡 Partial | Save ✅ (editor callback), Download ✅ (signed-URL route), Save As ❌ (no "save a copy under a new name" — Duplicate is the closest) |
| Export to supported formats | ✅ Done | PDF export Day 7; conversion hub Day 14 (matrix live, conversion blocked on the docserver) |
| Print and print preview | ✅ Done (via the editor) | ONLYOFFICE print; not proven in a browser |
| Recent documents list | ✅ Done | /recent page, Day 4 |
| Multiple open documents / document tabs | ❌ Not started | One document at a time in the editor |
| Document properties and metadata | ❌ Not started | No properties panel |
| Auto-save draft to local browser storage | ❌ Not started | The editor autosaves to the server, not to local storage |
| Recover a locally saved draft after a browser restart | ❌ Not started | No local draft recovery |
| Undo and redo history | ✅ Done (via the editor) | ONLYOFFICE undo/redo |
| Document password protection | ❌ Not started | No UI for it |
| Read-only / restricted-editing mode | ❌ Not started | No UI for it |
| Document compare and merge | ❌ Not started | |
| File repair / recovery utilities | ❌ Not started | |

### 3.2–3.11 Ribbons (font, paragraph, find/replace, insert, tables, images, page layout, references, review, view)

**All ✅ Done via the ONLYOFFICE editor** (font family/size, bold/
italic/underline, strikethrough, superscript/subscript, font colour,
highlight, change case, clear formatting, format painter, alignment,
line/paragraph spacing, indentation, bulleted/numbered/multilevel
lists, paragraph borders/shading, heading styles, find/replace,
navigation pane, page break, tables, images, hyperlinks, text boxes,
shapes, charts, headers/footers, page numbers, symbols, equations,
footnotes, captions, margins, paper size, orientation, columns,
watermarks, table of contents, footnotes/endnotes, mail merge,
spelling checker, word count, comments, Track Changes, accept/reject,
zoom, fit page/width, ruler, formatting marks). These are the
editor's own ribbons — Forma does not re-build them. Caveat: proven
at the API level, not by a human in a browser (see the note at the
top).

**Not started (not in the editor's standard ribbons, or not exposed
by Forma):** double underline / underline styles, text shading and
character borders, character spacing, text effects (outline/shadow/
reflection/glow), WordArt, font fallback / embedding controls, tab
stops and leaders, custom bullet symbols, keep-with-next /
widow-orphan controls, sort paragraphs, draw table, text-to-table,
icons/SVG insert, SmartArt-like diagrams, date/time fields, bookmark,
cross-reference, signature line, envelope/label layouts, Quick Parts,
table styles, cell margins, repeat header row, table positioning,
table formulas, sort table rows, image rotation/flip, aspect-ratio
lock, text wrapping, align/distribute, group/ungroup, arrange,
selection pane, image compression, background removal, shape effects,
section breaks, different layout per section, page borders, page
background, vertical alignment, header/footer distance, different
first/odd-even headers, mirror margins, booklet layout, page-number
style per section, TOC levels/styles, table of figures,
bibliography/citations, merge preview, envelope/label merge, grammar
suggestions, character/paragraph/line counts, comment replies,
resolve/reopen comments, revision navigation, compare versions,
combine revisions, restrict editing, password protection, web layout,
read mode, one/multiple-page views, gridlines, split window,
full-screen reading.

### 3.12 Writer templates

| Item | Status |
|---|---|
| Blank document templates | ✅ Done (Day 15 — a new blank DOCX/XLSX/PPTX is a real file that opens in the editor) |
| Resume / CV, cover letter, business report, academic, research, letter/memo, proposal/contract, invoice, minutes, certificate/form templates | ✅ Done (Day 16 first three, Day 30 remaining six — proposal, invoice, minutes, certificate; spreadsheet budget/tracker and presentation pitch-deck) |
| User-created reusable templates stored locally | ✅ Done (Day 31 — save/apply/rename/delete; the live e2e is pending the owner applying the Day 31 migration) |

## 3. Spreadsheet (§4)

**Core editing ✅ Done via the ONLYOFFICE spreadsheet editor**
(create/open/save workbook, add/delete/rename/reorder/duplicate
worksheets, select cells/ranges/rows/columns, row height/column
width, cell formatting, font/borders/alignment/wrap/merge, number/
currency/percentage/date formats, decimal controls, format painter,
formula bar, autocomplete, relative/absolute/mixed references,
cross-sheet references, arithmetic, SUM/AVERAGE/MIN/MAX, COUNT/
COUNTA/COUNTBLANK, IF/AND/OR, SUMIF/COUNTIF, VLOOKUP, INDEX/MATCH,
text functions, date functions, ROUND, sort, filter/AutoFilter,
import CSV, print preview, orientation/paper size, export to PDF).
Caveat: proven at the API level, not by a human in a browser.

**Not started:** hide/unhide worksheet, freeze panes, split view,
hide/unhide rows/columns, protect worksheet/workbook, print area and
page setup, multiple workbook tabs, custom number formats, text
rotation/indentation, cell styles, conditional formatting (rules,
data bars, color scales, icon sets), IFS, XLOOKUP, statistical/
financial functions, formula error explanations, trace precedents/
dependents, named ranges, advanced statistical/engineering functions,
macro/VBA, multi-column sorting, custom filters, remove duplicates,
data validation/dropdowns, text to columns, flash fill, tab-delimited
import, data tables, pivot tables, group/ungroup, what-if/goal seek,
external data connections, duplicate/missing-value detection, charts
(column/bar/line/pie/area/scatter/combo — the editor has charts, but
Forma has no chart-creation UI of its own; the editor's chart tools
are the feature), chart title/legend/axis/data-labels/gridlines,
change chart type, edit chart data source, chart copy/paste/export,
margins/scaling, print titles, headers/footers, page breaks,
export selected sheets.

## 4. Presentation (§5)

**Core editing ✅ Done via the ONLYOFFICE presentation editor**
(create/open/save, add/delete/duplicate/reorder slides, slide
layouts, thumbnails/navigation, insert/edit text boxes, text
formatting, insert images, crop/resize/rotate/position, shapes/
lines, align/distribute, slideshow from beginning/current slide,
next/previous controls, export to PDF). Caveat: proven at the API
level, not by a human in a browser.

**Not started:** slide sections, slide master editing, multiple
masters, speaker notes, slide size/aspect ratio, icons/SVG, tables,
charts, SmartArt-like diagrams, hyperlinks, audio/video, group/
ungroup, arrange, selection pane, slide background, colour/font
themes, animations (entrance/emphasis/exit/motion paths/timeline/
start/delay/duration), transitions (duration/options/apply-to-all/
preview), presenter view, full-screen slideshow, slide timing/
rehearsal, export slides to images, print handouts/notes.

## 5. PDF (§6)

### 6.1 Viewing and navigation

| Item | Status | Evidence / note |
|---|---|---|
| Open PDF from device | ✅ Done | Upload + open, Days 4–5 |
| Render pages accurately | ✅ Done | PDF.js viewer in the PDF pages; ONLYOFFICE pdf view |
| Page thumbnails and navigation | 🟡 Partial | Pages render with navigation; no thumbnail strip |
| Zoom, fit page and fit width | 🟡 Partial | The PDF.js viewer renders at a fixed scale; no zoom/fit controls |
| Search text in PDF | ❌ Not started | No search box in the viewer |
| Bookmarks / outline navigation | ❌ Not started | |
| Single / facing / continuous modes | ❌ Not started | |
| Full-screen / reading mode | ❌ Not started | |
| Print PDF | ✅ Done (via the editor) | ONLYOFFICE pdf print |

### 6.2 Page operations

| Item | Status | Evidence / note |
|---|---|---|
| Merge PDFs | ✅ Done | Day 8; live e2e 24/24 |
| Split PDF by page range | ✅ Done | Day 8; live e2e 24/24 |
| Extract selected pages | ✅ Done | Split does this |
| Delete pages | ✅ Done | Day 9; live e2e 21/21 |
| Insert pages from another PDF or image | 🟡 Partial | Day 18: from another PDF in the library (live e2e 25/25); from an image — not started |
| Reorder pages | ✅ Done | Day 9; live e2e 21/21 |
| Rotate pages | ✅ Done | Day 8; live e2e 24/24 |
| Crop pages | ✅ Done | Day 19; live e2e 29/29 |
| Page size / resize tools | ❌ Not started | |
| Add page numbers | ✅ Done | Day 18; live e2e 25/25 |
| Add page labels | ❌ Not started | |
| Batch page operations | ❌ Not started | |

### 6.3 Content editing

| Item | Status | Evidence / note |
|---|---|---|
| Edit existing PDF text (where the structure permits) | ✅ Done | Day 9; fonts + colour preserved Day 10; live e2e 21/21 + 29/29 |
| Add text to PDF | ✅ Done | Day 19; live e2e 29/29 |
| Delete or move editable text objects | ❌ Not started | |
| Change supported font styling | ✅ Done | Day 10 (closest standard font + fill colour) |
| Insert, move, resize and replace images | 🟡 Partial | Replace image ✅ (Day 9); insert/move/resize ❌ |
| Add hyperlinks | ✅ Done | Day 19; live e2e 29/29 |
| Edit vector / graphical objects | ❌ Not started | |
| Add shapes and drawing objects | ❌ Not started | |

### 6.4 Annotations and review

| Item | Status |
|---|---|
| Highlight, underline, strikethrough | ✅ Done (Day 17 — stored in the PDF itself, live e2e 33/33) |
| Sticky notes and comments | ✅ Done (Day 17 — sticky notes; comments as a thread are not started) |
| Freehand drawing | ✅ Done (Day 17 — ink annotations) |
| Shapes and callout annotations | 🟡 Partial | Day 19: rectangle, ellipse, line on the draw page (live e2e 29/29); callout annotations — not started |
| Stamps / custom stamps | ✅ Done | Day 32; live e2e 18/18 |
| Text watermark / image watermark (opacity, position, rotation) | ✅ Done | Day 32; live e2e 18/18 |
| Annotation list and navigation | ✅ Done (Day 17 — the annotation list on the annotate page, with remove) |

### 6.5 Forms, security and signatures

| Item | Status | Evidence / note |
|---|---|---|
| Fill existing PDF form fields | ✅ Done | Day 11; live e2e 50/50 |
| Create fillable PDF form fields | ✅ Done | Day 12; live e2e 70/70 |
| Password-protect PDF | ✅ Done | Day 20; live e2e 24/24 (qpdf, 256/128-bit AES) |
| Set permissions (printing, copying, editing) | ✅ Done | Day 20; live e2e 24/24 |
| Electronic signature / signature image | ❌ Not started | Deferred — needs a legal/verification decision |
| Certificate-based digital signature | ❌ Not started | |
| Validate digital signatures | ❌ Not started | |
| Redaction (permanently remove data) | ❌ Not started | |
| Unlock with a valid password | ✅ Done | Day 20; live e2e 24/24 |

### 6.6 Conversion, compression and OCR

| Item | Status | Evidence / note |
|---|---|---|
| Export PDF to DOCX | ✅ Done (blocked live) | Day 14 matrix; the conversion itself is blocked on the docserver (502) |
| Export PDF to XLSX | ❌ Not started | Not in the Day 14 matrix (the engine's own list has no XLSX for a PDF input) |
| Export PDF to PPTX | ❌ Not started | Not in the matrix |
| Export PDF pages to PNG / JPG | ❌ Not started | |
| Convert DOCX to PDF | ✅ Done (blocked live) | Day 7 export; blocked on the docserver |
| Convert XLSX to PDF | ✅ Done (blocked live) | Day 7 export; blocked on the docserver |
| Convert PPTX to PDF | ✅ Done (blocked live) | Day 7 export; blocked on the docserver |
| Convert images to PDF | ❌ Not started | |
| Batch conversion | ❌ Not started | One document at a time |
| Compress PDF (selectable quality/size) | ✅ Done | Day 8 (Ghostscript); no quality selector — one fixed pass |
| OCR scanned PDF pages | ✅ Done | Day 13; live e2e 22/22 |
| OCR images and screenshots | ✅ Done | Day 13 (PNG/JPEG) |
| Searchable PDF output after OCR | ✅ Done (pending migration) | Day 21; the invisible text layer (rendering mode 3) is embedded from the stored OCR word boxes; live e2e pending the Day 21 migration (the `words` column) |
| Extract text from a PDF | ✅ Done | Day 21; GET /api/documents/[id]/pdf/extract-text downloads a .txt; live e2e 7/8 (the extract-text checks pass, the searchable checks wait on the migration) |
| Extract text from PDF | ❌ Not started | No plain-text extraction for a normal PDF |
| Extract tables from PDF | ❌ Not started | |
| Extract embedded images from PDF | ❌ Not started | (The PDF editor lists images; it does not extract them as files) |
| Multilingual OCR / layout-preserving conversion tests | 🟡 Partial | English + Urdu + Arabic tested (Urdu usable, not perfect); no layout-preservation test |

## 6. AI (§7) — ⏭️ SKIPPED

All of §7 (AI assistant panel, AI Writer, chat with document, AI
Spreadsheet, AI Presentation, AI PDF, AI image assistance) is
skipped per the owner's instruction. Nothing is built, and no
provider is chosen. The WPS plan records the open decision (which
LLM provider/key) for when he restarts it.

## 7. Fonts and typography (§8)

| Item | Status |
|---|---|
| Consistent font picker across Writer/Spreadsheet/Presentation | ✅ Done (via the editor) |
| Search/filter fonts, family + weights/styles, apply to selection, font-size selector with custom entry | ✅ Done (via the editor) |
| Recently used / favourite fonts, font pairing, theme fonts, fallback/missing-font warning, substitution preview | ❌ Not started (editor defaults only) |
| User-provided font upload | ❌ Not started |
| Consistent typography scale / spacing in the app (Inter, brand tokens) | ✅ Done (Day 1) |
| Accessible contrast and readable toolbar labels | ✅ Done |

## 8. Templates (§9) — ✅ Done (all nine, Day 30)

The /templates gallery is real: Professional Resume, Formal
Business Letter, Business Report, Business Proposal, Invoice,
Meeting Minutes, Certificate of Achievement, Monthly Budget
Tracker (XLSX, with formulas) and Pitch Deck (PPTX, 7 slides),
each with a first-page thumbnail, a preview of its real content,
and a "Use this template" form that creates a new document in
the library. The templates are Forma's own original files (no
WPS templates). The apply action stores the new document with
the template's own type (DOCX, XLSX or PPTX) and MIME type.
Day 31 added a "My templates" section: a document can be saved
as a custom template from its Manage menu (a name + an optional
description); the template is a snapshot of the document's file
at save time, and it can be applied, renamed or deleted from the
gallery. Not started yet: template categories, tags and search;
preview-before-applying is the thumbnail + preview text (not a
full-page render).

## 9. Review, sharing and collaboration (§10)

| Item | Status |
|---|---|
| Comments and Track Changes (single-user, in the editor) | ✅ Done (via the editor) |
| Export a document with comments / tracked changes | ❌ Not started |
| Import comments and revisions | ❌ Not started |
| Local reviewer notes | ❌ Not started |
| Print reviewed document | ❌ Not started |
| Copy / export content for sharing outside the app | ✅ Done (Download route) |
| Real-time co-authoring, presence, cursors, comment threads, permissions, conflict handling, activity history, shareable links (§10.2) | ⏭️ Skipped (cloud-dependent, per the owner's instruction) |
| "Shared with me" page | ❌ Not started (placeholder, "coming Day 10") |

## 10. File-format compatibility (§11)

Format support is by operation (open / edit / save back / export /
re-open). Round-trip is proven live at the API level for DOCX,
XLSX and PPTX only (Day 10, 41/41).

| Format | Open | Edit | Save back | Export | Note |
|---|---|---|---|---|---|
| DOC | ✅ | ✅ (via editor) | ✅ | ✅ (to PDF / DOCX / ODT / TXT) | Round-trip not individually proven live |
| DOCX | ✅ | ✅ | ✅ | ✅ | Round-trip proven live (Day 10) |
| ODT | ✅ | ✅ | ✅ | ✅ | Round-trip not individually proven live |
| TXT | ✅ | ✅ | ✅ | ✅ | |
| XLS | ✅ | ✅ | ✅ | ✅ | |
| XLSX | ✅ | ✅ | ✅ | ✅ | Round-trip proven live (Day 10) |
| CSV | ✅ | ✅ | ✅ | ✅ | |
| ODS | ✅ | ✅ | ✅ | ✅ | |
| PPT | ✅ | ✅ | ✅ | ✅ | |
| PPTX | ✅ | ✅ | ✅ | ✅ | Round-trip proven live (Day 10) |
| ODP | ✅ | ✅ | ✅ | ✅ | |
| PDF | ✅ | ✅ (PDF tools) | ✅ (new version) | ✅ (to DOCX/TXT, Day 14 — blocked on the docserver) | Annotate ❌ |
| PNG | ✅ (upload + OCR) | ❌ | — | ❌ (no PNG export) | |
| JPG/JPEG | ✅ (upload + OCR) | ❌ | — | ❌ | |
| TIFF | ❌ | ❌ | ❌ | ❌ | Refused (Leptonica built without TIFF) |
| BMP / GIF / SVG / WEBP | ❌ | ❌ | ❌ | ❌ | Not uploadable |
| DOCM / DOT / DOTX / RTF / HTML / MHT / WPS / XLSM / XLSB / XLTX / PPTM / POT / PPS / PDF/A | ❌ | ❌ | ❌ | ❌ | Not in the 12 upload formats |

**Compatibility test corpus (§11.5):** ✅ **Done (Day 26)** — a
formal corpus of 19 files (`corpus/` + `manifest.json`) with a
runner (`scripts/corpus-test.mjs`): a rich DOCX (mixed fonts,
table, image, header, footer, section break, footnote), a rich
XLSX (formulas, chart, styled cells, multiple sheets), a rich
PPTX (table, chart, image), the legacy formats (DOC, XLS, PPT)
and OpenDocument (ODT, ODS, ODP) via LibreOffice, plain TXT +
CSV, a rich PDF, a scanned PDF, a 30-page PDF, a
password-protected PDF, a PNG + JPG text image, and a corrupt
PDF + DOCX. The runner reports 56 passed, 0 failed, 22 skipped
(78 total) — the 22 skips are the docserver checks. Still
missing: a pivot table (openpyxl cannot create one) and an
animation (python-pptx has no animation API), and no page-count
comparison before/after a docserver round-trip (the docserver
is down).

## 11. Account, settings and subscription (§12)

| Item | Status |
|---|---|
| Sign up / sign in / sign out | ✅ Done (Day 3) |
| Password reset / account recovery | ✅ Done (Day 3) |
| Profile settings | ✅ Done (Settings page, Day 3) |
| User preferences and editor defaults | ❌ Not started |
| Preferred language and locale | ❌ Not started |
| Date, time and number-format preferences | ❌ Not started |
| Theme (light / dark / system) | ❌ Not started |
| Keyboard shortcut reference | ❌ Not started |
| Accessibility preferences | ❌ Not started |
| Plan / entitlement identifiers, server-side gating, upgrade prompts, usage/limits, checkout, billing history, cancellation, admin override (§12.2) | ⏭️ Skipped (billing/plan UI, per the owner's instruction). Foundation only: `plan_key` on workspaces. The /plan page is a placeholder. |

## 12. Supabase and application data (§13)

| Item | Status |
|---|---|
| Supabase Auth | ✅ Done |
| PostgreSQL tables for profiles and metadata | ✅ Done (8 tables + 2 OCR tables) |
| RLS on every user-owned table | ✅ Done (local 18/18 + OCR T19, live 9/9) |
| User preferences and editor settings | ❌ Not started |
| Document metadata only | ✅ Done (documents + versions + stars + folders) |
| Entitlement / plan records | 🟡 Partial (`plan_key` only; no gating) |
| AI usage records | ⏭️ Skipped (AI skipped) |
| Minimal audit events | ❌ Not started |
| Database migrations tracked in source control | ✅ Done (6 migrations + OCR + image-upload) |
| Server-side access through secure clients / service role only where required | ✅ Done |
| Cloud file manager / cloud sync / cloud quotas / cloud drive folders (§13.2) | ⏭️ Skipped (per the owner's instruction) — see conflict 1 above |

## 13. Security, privacy and reliability (§14)

| Item | Status |
|---|---|
| Secrets in environment variables; never commit `.env` | ✅ Done (`.env.example` exists; secrets in `.env.local`) |
| Never expose `service_role` keys in browser code | ✅ Done |
| Validate/sanitise file names, MIME types, extensions, sizes | ✅ Done (upload validation + a byte-signature check on the file's actual bytes, Day 27) |
| Enforce upload/import size limits | ✅ Done (50 MB) |
| Scan or safely process untrusted files before server-side conversion | 🟡 Partial (extension + MIME + byte-signature checked; no malware scan — that needs an external scanner) |
| Protect conversion callbacks with authenticated signatures/tokens | ✅ Done (JWT callback + HMAC file tokens) |
| Authorisation checks on every server action and API route | ✅ Done (RLS + user client on every route; proven live: cross-user 404, signed-out 307) |
| RLS policies enabled and tested | ✅ Done |
| Rate-limit auth, AI and conversion endpoints | ✅ Done (conversion/export/PDF-tools/OCR/form routes rate-limited 10/min; sign-in/sign-up rate-limited 10 per 15 min per email, Day 27) |
| Validate AI output before applying edits | ⏭️ Skipped (AI skipped) |
| Require confirmation before destructive operations | ✅ Done (delete/duplicate confirmations in the library) |
| Avoid storing full document contents in logs | ✅ Done |
| Redact credentials/tokens from logs | ✅ Done |
| Error reporting and operational monitoring | ✅ Done (Day 27 — a `/api/health` endpoint reporting app/database/storage/docserver, and structured JSON error logging with secrets redacted; no external tracker like Sentry yet) |
| Backup / restore procedures for application metadata | ✅ Done (Day 27 — `scripts/backup-metadata.mjs` exports the 11 tables to JSON, with the procedure in `docs/BACKUP_RESTORE.md`; metadata-only via REST, no `pg_dump` from this VM) |
| Privacy disclosures for external AI and conversion services | ✅ Done (Day 27 — a `/privacy` page disclosing storage, Supabase, ONLYOFFICE and local Tesseract OCR; not a legal review) |
| Verify dependency licences before commercial release | ✅ Done (Day 27 — `docs/LICENSES.md`, generated by `scripts/license-audit.mjs`: all 33 npm packages are MIT/Apache/BSD/ISC; ONLYOFFICE, Ghostscript and poppler are flagged for a commercial release; an inventory, not a legal opinion) |

## 14. UX and application quality (§15)

| Item | Status |
|---|---|
| Consistent top application bar | ✅ Done (Day 2 shell) |
| Consistent ribbon with contextual tabs | ✅ Done (via the editor) |
| Contextual toolbars based on selection | ✅ Done (via the editor) |
| Professional document canvas and page boundaries | ✅ Done (via the editor) |
| Accurate page margins and rulers | ✅ Done (via the editor) |
| Status bar (page, word count, zoom) | ✅ Done (via the editor) |
| Document tabs and clear active-document state | ✅ Done (Day 28 — open documents appear as tabs in the app shell, localStorage, max 10, the active one highlighted; opening a document in the editor registers it) |
| Keyboard shortcuts for common editing operations | ✅ Done (via the editor) |
| Context menus | ✅ Done (via the editor) |
| Drag-and-drop support | ✅ Done (Day 28 — dropping files on the library upload area uploads each one through the same upload action; the file input stays) |
| Tooltips and accessible labels | ✅ Done (mostly) |
| Responsive layout for smaller screens | ✅ Done (Day 28 — the shell has a mobile drawer, the library and tool pages wrap and shrink; verified by a class audit — a live 390px render was not possible because the local Chromium is blocked by the managed-browser policy) |
| Loading indicators and progress | ✅ Done |
| Clear unsupported-format and conversion warnings | ✅ Done (400s with clear messages; the matrix is shown, not hidden) |
| Empty states and onboarding examples | ✅ Done |
| Consistent dialogs, menus, popovers and toasts | ✅ Done (mostly) |
| No dead controls / fake progress / placeholder success messages | ✅ Done (Day 28 — Templates is a real gallery since Day 16; Shared is now a real page listing the user's own share links; Plan was removed from the sidebar — no plan UI, per the owner) |

## 15. What is properly built (the short list)

Properly built = the feature works end-to-end, is tested (unit +
live as a real user), and its limits are recorded honestly.

1. **App shell + auth + library** (Days 2–4) — 9 workspace areas,
   sign up/in/reset, profile, folders, create/rename/move/delete/
   duplicate/star/upload/download, trash/restore, recent/starred,
   RLS proven live 9/9. **"New blank document" is fixed (Day 15):**
   it now creates a real blank DOCX/XLSX/PPTX file that opens in
   the editor (live e2e 25/25).
2. **Writer / Spreadsheet / Presentation editors** (Days 5–6) —
   ONLYOFFICE Docs 10.0.0, 12 formats, save creates a new version.
   Proven at the API level 41/41 (DOCX/XLSX/PPTX). Browser
   round-trip still unproven.
3. **PDF export** (Day 7) — DOCX/XLSX/PPTX → PDF via
   ConvertService. Built + unit-tested; live proof blocked on the
   docserver.
4. **PDF utilities** (Day 8) — merge, split, rotate, compress.
   Live e2e 24/24.
5. **PDF editing** (Days 9–10) — edit text (fonts + colour kept),
   replace image, delete/reorder pages. Live e2e 21/21 + 29/29.
6. **PDF form fill** (Day 11) — live e2e 50/50.
7. **PDF form builder** (Day 12) — live e2e 70/70.
8. **OCR** (Day 13) — Tesseract 5.5.4 from source, English/Urdu/
   Arabic, background worker. Live e2e 22/22.
9. **Conversion hub** (Day 14) — matrix + route + UI. Live e2e
   13/13 for validation/RLS/page; the conversion itself is
   blocked on the docserver.
10. **Image uploads for OCR** (Day 13 follow-up) — PNG/JPEG
    uploadable; bucket + app list updated.

**Unit tests: 193/193. Live e2e (all harnesses): 22 + 13 + 70
(earlier) + 41 (editor, API-level) checks green.**

## 16. What remains (the buildable queue, in order)

The loop applies to each one, one at a time. AI and cloud
services are out (skipped above).

| # | Feature | Why it is next | Notes |
|---|---|---|---|
| 1 | **Fix "New blank document"** — create a real blank DOCX/XLSX/PPTX file (from a minimal template) so it opens in the editor | ✅ **Done (Day 15)** — live e2e 25/25 | A blank DOCX/XLSX/PPTX is a few KB; build it with the office-file libraries already in the project |
| 2 | **Templates** (§9) — an original gallery (resume, letter, report, proposal, invoice, minutes, certificate) + preview + apply + save custom template | ✅ **Done (Day 16, first three: resume, letter, report)** — live e2e 30/30. Proposal/invoice/minutes/certificate, spreadsheet/presentation templates and save-custom-template are later steps | Templates are Forma's own (clean-room, no WPS templates); applying one = create a blank document from it (needs #1 first) |
| 3 | **PDF annotations** (§6.4) — highlight, underline, strikethrough, sticky notes, freehand drawing | ✅ **Done (Day 17)** — stored in the PDF itself, live e2e 33/33 | The biggest remaining PDF gap; it is a Forma-own feature on pdf-lib + PDF.js, like the form tools |
| 4 | **PDF page tools, second half** (§6.2–6.3) — insert pages, crop pages, add page numbers, add text, add hyperlinks, add shapes | ✅ **Done (Days 18–19)** — insert + page numbers (Day 18, live e2e 25/25), crop + hyperlinks + add text + shapes (Day 19, live e2e 29/29) | Small, well-defined pdf-lib work, same pattern as Days 9–12 | "Add text" and "add shapes" need a placement UI (click-to-place, like the form builder) |
| 5 | **PDF security** (§6.5) — password-protect a PDF, set permissions, unlock with a password | ✅ **Done (Day 20)** — qpdf (AES-256/128), live e2e 24/24. **Correction:** pdf-lib does NOT support encryption (the audit's earlier note was wrong — pdf-lib throws on an encrypted PDF and cannot encrypt); qpdf is the engine | E-signatures stay deferred (legal decision) |
| 6 | **Searchable PDF after OCR + extract text** (§6.6) — write the OCR text layer back into the PDF, and a plain "extract text" action | ✅ **Done (Day 21)** — the invisible text layer (rendering mode 3) is embedded from the stored OCR word boxes; extract-text downloads a .txt. **Live e2e pending the Day 21 migration** (the `words` column) — the extract-text checks pass (7/8), the searchable checks run after the user applies `forma-ocr-words-migration.sql` | OCRmyPDF does this over Tesseract; Forma can do it with pdf-lib |
| 7 | **PDF → image export + images → PDF** (§6.6) — export PDF pages to PNG/JPG, convert an image to a PDF | ✅ **Done (Day 22)** — a PDF's pages export as a ZIP of PNG/JPG (pdftoppm, 72/150/300 DPI, max 20 pages); images become a PDF (one page per image, fit on A4, centred). Live e2e 20/20 | Small; the rendering (pdftoppm) and the image embedding (pdf-lib) are already in the project |
| 8 | **Versions UI** (Phase F) — list every version of a document, download/restore an old version | ✅ **Done (Day 23)** — a versions page lists every version (newest first) with a download per version and a restore action (restoring creates a NEW version from the old file, never overwrites). Live e2e 20/20 | The versions already exist (document_versions, immutable); only the UI is missing |
| 9 | **Settings / preferences** (Phase F) — per-user preferences (OCR default language, image export format/DPI) on the Settings page | ✅ **Done (Day 24)** — a Preferences section on /settings (OCR default language, image export format, image export DPI), stored as columns on profiles, used by the OCR page and the library Export images link. Unit 312/312 (6 new); live e2e 14/14 (after the owner applied the migration) | The Settings page only had the profile form |
| 9 | **Settings / preferences** (§12.1) — language/locale, date/time/number formats, theme, keyboard-shortcut reference, accessibility preferences | Small app-level work; the profile form already exists | |
| 10 | **Sharing (single-user, local)** (§10.1) — share a document by link / export with comments, local reviewer notes | ✅ **Done (Day 25, the link half)** — a shareable link per document (`/s/<token>`, a random 32-hex token, only its SHA-256 hash stored, 1/7/30 days or never, revocable). Anyone with the link can open the public share page and download the document's current version — no account. The library gains a "Share" link; a manage page creates/lists/revokes links. Unit 319/319 (7 new); live e2e **23/23 after the owner applied the corrected migration** (the first run was 3/4 with the migration pending; the migration's first version called the RLS helpers with two arguments — fixed in commit a633190). The "export with comments" and "local reviewer notes" half is NOT done (it needs a comments/notes model — future work). Multi-user co-editing stays skipped. | The "Shared with me" page is a placeholder; this is the single-user half (multi-user co-editing stays skipped) |
| 11 | **Compatibility test corpus** (§11.5) — a representative set of files + round-trip checks | ✅ **Done (Day 26)** — 19 representative documents (`corpus/` + `manifest.json`) covering all 12 upload formats + PNG/JPG, with a runner (`scripts/corpus-test.mjs`) that uploads each file as a test user and runs the checks the manifest names. The runner reports 56 passed, 0 failed, 22 skipped (78 total) — the 22 skips are the docserver checks (pdf-export + round-trip) while the docserver is down. Unit 338/338 (17 new, incl. one validating the real committed manifest). Limits: no pivot table (openpyxl cannot create one) and no animation (python-pptx has no animation API) — recorded, not faked; round-trip and PDF export unproven until the docserver is back; no UI page in v1. | Can grow alongside the other features |
| 12 | **Hardening** (§14) — byte-signature upload validation, auth rate limiting, error reporting/monitoring, backup/restore procedures, privacy disclosures, full licence audit | ✅ **Done (Day 27)** — the byte-signature check refuses a PNG renamed to .pdf; sign-in/sign-up are rate-limited (10 per 15 min per email); `/api/health` reports the dependencies; errors log as JSON with secrets redacted; the metadata backup script works (38 rows across 11 tables); a `/privacy` page and a full licence audit (`docs/LICENSES.md`) are in place. Unit 369/369 (31 new); live e2e 11/11. Limits: no malware scan, no external error tracker, the backup is metadata-only, the privacy page is not a legal review. | The release gate; do it before any public release |
| 13 | **UX gaps** (§15) — remove or build the three dead sidebar controls (Templates/Shared/Plan), drag-and-drop upload, responsive layout, document tabs | ✅ **Done (Day 28)** — the Shared page is real (the user's own share links, with the Live/Expired/Revoked status and a Revoke button); Plan is gone from the sidebar; drag-and-drop upload is on the library page; the layout wraps and shrinks (verified by a class audit); open documents appear as tabs. Unit 382/384 (the 2 failures are the qpdf-dependent tests — qpdf was wiped by a VM reset); live e2e 9/9. | Partly covered by #2 and #10 (Templates + Shared); the Plan page stays skipped (no plan UI) |

**Blocked (not buildable until the environment is fixed):**
- The **conversion proof** (DOCX→PDF etc. actually converting)
  and the **editor browser round-trip** both need the ONLYOFFICE
  document server reinstalled. Its installer download returns 403
  through the proxy. That is an environment blocker, not a code gap.
- The **local Postgres reinstall** (the local RLS re-run is blocked
  on it; the live app does not need it).

## 17. Suggested next step

**Fix "New blank document" first** (#1 above) — it is the smallest
job, it removes a dead control, and it is the prerequisite for
Templates (#2). **Done Day 15.** Templates (#2) — **done Day 16
(first three: resume, letter, report).** PDF annotations (#3) —
**done Day 17** (stored in the PDF itself, live e2e 33/33). The
next feature is **PDF page tools, second half** (#4) — insert
pages, crop, page numbers, add text, hyperlinks and shapes.
**Insert pages + page numbers done Day 18** (live e2e 25/25);
crop, add text, hyperlinks and shapes **done Day 19** (live e2e
29/29) — item 4 is now complete. **PDF security (#5) — done Day
20** (live e2e 24/24). The next feature is **searchable PDF
after OCR + extract text** (#6).
