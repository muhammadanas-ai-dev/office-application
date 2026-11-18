# Research Note: WPS feature inventory (Day 1)

- Observed on: 2026-11-17
- Platform/build: Official WPS web pages (no desktop/mobile build inspected;
  no authorized WPS account/trial session was available)
- WPS plan/tier: Standard (Free) vs Pro+ — see pricing note below
- Source URL(s):
  - https://www.wps.com/feature/
  - https://www.wps.com/buy/
  - https://www.wps.com/office/
  - https://www.wps.com/office/writer/
  - https://www.wps.com/feature/pdf/
  - https://www.wps.com/feature/pdf-ocr/
- Research skill used: comprehensive_research (Standard mode)
- Evidence path: docs/reverse-engineering/day-01-wps-inventory.md,
  docs/feature-matrix.csv

## Observed workflow (official feature directory, 2026-11-17)

### Writer / Docs
Write, edit and polish Word documents; AI drafting, grammar checks,
translation, online DOC/DOCX editing in the browser, resume templates
with AI fill, AI document generator from a brief. Full formatting is
in the free tier per secondary sources; confirm per-feature in the
engine matrix, not from this page alone.

### Spreadsheet / Sheets
Formulas, pivot tables and charts, Excel-compatible AI, AI formula
generator from plain English, invoice generator, PDF-to-Excel and
CSV-to-Excel conversion, Excel Online XLSX editing.

### Presentation / Slides
AI PPT maker from a prompt, PowerPoint Online PPT/PPTX editing,
slides translator, AI summarizer for talking points.

### PDF
Edit text, images and pages; merge, split, compress; OCR for scanned
files; Chat PDF (ask questions with source context).

### AI
AI Office Suite / AI Copilot across Docs, Sheets, Slides and PDF;
AI Writer, AI PPT Maker, AI Summarizer, AI Formula Generator.

### Workspace / cloud / other
Online document editor with no install, file opener for dozens of
formats, online form builder, e-signature maker, file recovery for
unsaved/closed documents. Cloud sync and 1 GB free storage per
secondary sources (see pricing note).

## Pricing — what was verified, and what was not

- The official buy page (https://www.wps.com/buy/) was opened on
  2026-11-17, but its plan table is JavaScript-rendered and was not
  extractable from the text fetch. Do not quote prices from it.
- Secondary sources reviewed on 2026-11-17 agree on the shape, but
  disagree on the number by region/date: Pro+ is reported as
  $69.99/year (US, several Oct 2026 reviews), Rp409,000/year
  (Indonesia listing), and $29.99/year in one Aug 2026 review.
  **Prices vary by region, platform, promotion and billing interval.**
  The consistent shape is: Standard is free with ads, basic PDF,
  limited templates and 1 GB cloud; Pro+ removes ads and adds full
  PDF editing/conversion, OCR, e-signatures, unlimited templates,
  20 GB cloud and AI tools with limits.
- No price is hardcoded in Forma Office product copy. Re-check the
  official buy page before any pricing claim.

## Chosen implementation

- Writer-first for 15 days. Spreadsheet, Presentation, full PDF
  editing, OCR and AI are separate modules with their own matrices;
  they are not claimed complete because Writer exists.
- Editor engine: ONLYOFFICE Docs, licence-gated — see
  docs/architecture/ADR-001-office-editor-engine.md. No document
  server is deployed on Day 1.

## Acceptance criteria

- [x] Every Day-15 feature in docs/feature-matrix.csv has a source
      or is marked as an original Forma decision.
- [x] Licensing/hosting decision documented with risks (ADR-001).
- [x] No unverified "all formats" claim in product copy.
- [ ] Hands-on WPS session verification — NOT done Day 1; needs an
      authorized account/trial from the owner if deeper verification
      is wanted.

## Verification

- Fixture/test ID: none yet (no fixtures, no editor server).
- Result: Inventory is documentation-based only.
- Known gaps: No hands-on WPS session; no per-feature free/Pro
  verification beyond the plan shape above; ONLYOFFICE format matrix
  must be re-verified on the exact deployed engine version.
