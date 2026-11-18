# Forma Office — WPS-Level Plan

**Owner direction (2026-11-17 23:33 PKT):** build Forma Office to the
level of WPS — properly, all the features WPS has: every editor,
every format, proper OCR, and all the paid features, as Forma's own
application. **No Docker files for now.** This plan replaces the
Writer-first scope of `ROADMAP_15_DAYS.md` as the project's scope
document; the 15-day cadence (one day at a time, handoff per day)
still applies.

**Clean-room rule (unchanged, owner-confirmed 2026-11-17):** Forma
takes inspiration from WPS features and builds a better version. It
is NOT a clone of WPS: no WPS code, logos, templates, or pixel-exact
screens. Paid-feature *equivalents* are built as Forma's own
features on open-source engines (see the engine column below), never
by copying or unlocking WPS itself.

**Deployment rule (new):** no Docker files — no `Dockerfile`, no
`docker-compose.yml`, no container image for the app or the document
server. The document server runs from the DEB package on a
persistent host (already installed on this VM for evaluation); the
app deploys to Vercel when the owner provides access. If a host
change is ever needed, it is a host decision, not a container file.

## WPS feature inventory → Forma phases

Source: `docs/reverse-engineering/day-01-wps-inventory.md` (official
WPS pages, 2026-11-17). Every row below names the Forma engine that
provides it; "Forma own" means original Forma code on an
open-source library.

### Phase A — Core editors, every format (Day 6, in progress)

| WPS feature | Forma equivalent | Engine | Status |
|---|---|---|---|
| Writer: DOC/DOCX/ODT/TXT edit | Writer editor | ONLYOFFICE Docs 10.0.0 (word) | Done (Day 5) |
| Spreadsheet: XLSX/XLS/CSV/ODS edit, formulas, pivot tables, charts | Spreadsheet editor | ONLYOFFICE Docs 10.0.0 (cell) | Done (Day 6, proven live Day 10: opens as cell, save creates v2) |
| Presentation: PPTX/PPT/ODP edit | Presentation editor | ONLYOFFICE Docs 10.0.0 (slide) | Done (Day 6, proven live Day 10: opens as slide, save creates v2) |
| PDF view | PDF viewer | ONLYOFFICE Docs 10.0.0 (pdf) | Done (Day 5, view-only) |
| Upload/open for all of the above | Format capability registry + library open links | Forma own | Done (Day 6; blank-document creation fixed Day 15 — a new blank DOCX/XLSX/PPTX is a real file that opens in the editor) |
| File opener for dozens of formats | Honest per-format capability (editable / view-only / convertible / unsupported) | Forma own + ONLYOFFICE | Phase A + Day 8 |

Acceptance: a spreadsheet and a presentation open in the real
editor, edit, save to a new version and reopen showing the edits;
an unsupported file never silently opens as editable.

### Phase B — PDF tools (one feature at a time, production-grade)

Owner method (2026-11-17 23:41 PKT): implement feature by feature,
each one fully proper and production-grade — no loopholes, no bugs,
no hardcoded values — and tested properly before moving on. No
feature is bundled with the next.

| WPS feature | Forma equivalent | Engine | Status |
|---|---|---|---|
| PDF export (DOCX/XLSX/PPTX → PDF) | Export via document server | ONLYOFFICE ConvertService | Done (Day 7, feature 1) |
| PDF merge, split, rotate | PDF utilities | Forma own on pdf-lib (open-source) | Done (Day 8, feature 2) |
| PDF compress | PDF utilities | Ghostscript (open-source) | Done (Day 8, feature 2) |
| PDF edit text/images/pages | PDF editor | Forma own on pdf-lib + PDF.js | Done (Day 9, feature 3; fonts + colour preserved Day 10) |
| PDF form fill | Form fill | Forma own on pdf-lib (AcroForm) | Done (Day 11, feature 4) |
| PDF form builder | Form builder | Forma own on pdf-lib (create fields) | Done (Day 12, feature 5) |
| PDF annotations (highlight, underline, strikethrough, sticky note, freehand) | Annotations stored in the PDF itself | Forma own on pdf-lib + PDF.js | Done (Day 17) — live e2e 33/33; no /AP in v1, five fixed colours |
| PDF page tools, part 1 (insert pages, page numbers) | Insert blank / from another library PDF; page numbers | Forma own on pdf-lib | Done (Day 18) — live e2e 25/25; insert from a library PDF only, page numbers drawn into the content |
| PDF page tools, part 2 (crop, add text, hyperlinks, shapes) | Page tools | Forma own on pdf-lib | Done (Day 19) — live e2e 29/29; fixed colour set, three standard fonts, no free-form colour picker |
| PDF security (password-protect, permissions, unlock) | Security | Forma own on qpdf | Done (Day 20) — live e2e 24/24; 256/128-bit AES, no 40-bit, no password recovery |
| OCR for scanned files | OCR | Forma own on Tesseract | Done (Day 13) — live e2e 22/22 |
| PDF preview/download | Preview + signed download | Forma own | Partial (download exists) |

Acceptance: each PDF action is a real action on a real file; an
unsupported PDF operation is hidden or marked, never faked.

### Phase C — OCR (after Phase B)

| WPS feature | Forma equivalent | Engine | Status |
|---|---|---|---|
| OCR for scanned files (image/PDF → text) | OCR a file into searchable text | Forma own on Tesseract (open-source) | Done (Day 13) — engine built from source in ocr/, worker + routes + UI live; live e2e 22/22 as a real user |
| Scanned PDF → searchable PDF / DOCX | OCR + export | Tesseract + ConvertService | Searchable PDF: Done (Day 21) — the invisible text layer is embedded (rendering mode 3), live e2e pending the Day 21 migration; PDF → DOCX is the Day 14 conversion hub (blocked on the docserver) |

Acceptance: OCR runs server-side on the user's own file; languages
are the ones actually installed (owner to confirm: English +
Urdu/Arabic is the target market check). No OCR claim without a
tested language pack.

### Phase D — Conversion hub (after Phase C)

| WPS feature | Forma equivalent | Engine | Status |
|---|---|---|---|
| PDF-to-Excel, CSV-to-Excel, DOCX↔PDF, PPTX↔PDF | Convert any supported format to any other | ONLYOFFICE ConvertService | Done (Day 14) — matrix + route + UI live; the conversion itself is blocked on the docserver (see below) |
| Batch / format picker in the library | Convert action per document | Forma own | Done (Day 14) |

Acceptance: every offered conversion is a conversion the engine
actually performs; the result downloads as a new file, never
overwriting the original.

### Phase E — AI tools (after Phase D)

| WPS feature | Forma equivalent | Engine | Status |
|---|---|---|---|
| AI Writer, drafting, grammar, proofreading | Rewrite / proofread / summarize selected text or document | Forma own, provider abstraction, server-only key | Not started |
| AI PPT Maker, slides summarizer | Outline → presentation draft; talking-points summary | Forma own, same provider | Not started |
| AI Formula Generator (plain English → formula) | Formula help in spreadsheets | Forma own, same provider | Not started |
| Chat PDF (ask questions with source context) | Ask questions over a document | Forma own, RAG over the user's file | Not started |
| AI translation | Translate selected text | Forma own, same provider | Not started |

Acceptance: no AI action runs without an explicit user action; a
proposal/diff is shown and the user applies it; quotas are enforced
server-side; keys and document content never reach browser logs.
**Open decision (owner):** which LLM provider and key to use — the
abstraction is built first, the provider is his call.

### Phase F — Templates, cloud, collaboration (already planned)

| WPS feature | Forma equivalent | Engine | Status |
|---|---|---|---|
| Resume/letter/report/proposal/invoice templates, unlimited templates | Original template gallery (Forma's own templates) | Forma own | Done (Day 16, first three: resume, letter, report — DOCX only; proposal/invoice/minutes/certificate and spreadsheet/presentation templates are later steps) |
| Cloud sync, 20 GB cloud, file recovery | Supabase Storage + versions + trash/restore | Supabase | Partial (library, versions, trash done) |
| Sharing, comments, track changes, co-editing | Share/invite, roles, comments, co-editing | Supabase + ONLYOFFICE | Not started (was Days 9–10) |
| E-signatures | E-signature maker | Defer — needs a legal/verification decision | Not started |
| Online form builder | Form builder | Forma own on pdf-lib | Done (Day 12, feature 5) |

## What is NOT in scope

- No WPS desktop/mobile app, no WPS account, no WPS file format
  internals. Forma is a web workspace.
- No Docker files (owner instruction, 2026-11-17).
- No billing until merchant eligibility, tax and compliance are
  verified (unchanged from the 15-day plan).
- No claim of complete WPS parity in product copy; the feature
  matrix states what is actually built and tested.

## Build order

1. **Phase A** (Day 6): Spreadsheet + Presentation editors, every
   format openable, format capability registry.
2. **Phase B** (Days 7–8): PDF export + PDF tools.
3. **Phase C** (Day 9): OCR.
4. **Phase D** (Day 10): Conversion hub.
5. **Phase E** (Days 11–12): AI tools (provider decision first).
6. **Phase F** (Days 13–15): Templates, sharing/collaboration,
   hardening, release candidate.

Each phase keeps the one-day cadence: plan → build → verify →
handoff. A phase that needs an owner decision (AI provider, OCR
languages, e-signatures) stops at that decision instead of guessing.
