# Clean-Room Reverse-Engineering Playbook

This playbook turns WPS Office research into a reliable feature specification without copying protected implementation details or bypassing access controls.

## 1. Research sources, in order of trust

1. Official WPS pricing and plan comparison pages.
2. Official WPS feature directory and product-specific feature pages.
3. Official WPS Academy/help articles and release notes.
4. Authorized WPS desktop/web/mobile app session using an account or trial legitimately available to the researcher.
5. Official WPS product videos and demonstrations.
6. Public user reviews and community reports as secondary evidence only. Mark these as anecdotal and corroborate before product decisions.

Use official editor-engine docs (for example ONLYOFFICE API, supported formats and license documentation) to establish what our selected integration can truly do.

## 2. Skill-first research procedure

At the start of every research session:

1. Inspect Muse AI's installed skills.
2. Identify the skill that supports browser automation, web research or software product inspection.
3. Read the skill's full instructions and any linked references.
4. Use the skill only in its documented workflow. Never invent an API or bypass a website's controls.
5. If the skill does not allow authenticated product inspection, do not attempt to work around the restriction. Use official public documentation or ask the owner to provide screenshots/video from an authorized session.
6. Record what you could not verify.

## 3. What to inspect in WPS

The product benchmark contains several modules. Research the module separately rather than treating WPS as one editor screen.

### A. Writer

- New blank document and templates.
- File open/save/save-as/export/print.
- Ribbon or menu structure and toolbar grouping.
- Font family, size, weight, color and highlighting.
- Paragraph styles, heading hierarchy and navigation pane.
- Lists, indentation, tabs, line and paragraph spacing.
- Page size, orientation, margins, columns, borders and background.
- Tables: insert, resize, merge/split cells, borders, shading, row/column operations.
- Images, shapes, links, captions and text boxes.
- Headers, footers, page numbers, footnotes/endnotes and section breaks.
- Find/replace, word count, spell check, grammar, translation.
- Track changes, comments, compare/merge and document protection.
- Mail merge, references, table of contents and citations.
- Templates, recovery, autosave and version history.
- AI drafting, rewrite, summary, translation and proofreading if included in the plan.

### B. Spreadsheet

- Workbook open/create/save and supported formats.
- Sheets/tabs, cells/ranges, formulas, functions, named ranges.
- Formatting, styles, borders, conditional formatting and data validation.
- Sort/filter, charts, pivot tables, import/export, freeze panes.
- Formula bar, function helper, calculation behavior and error values.
- Collaboration/protection, comments, print/page setup and macros if relevant.

### C. Presentation

- Deck creation, slide layouts, themes and templates.
- Shapes, text, tables, images, audio/video.
- Animations and slide transitions.
- Speaker notes, presenter view and slideshow.
- Import/export and font substitution behavior.

### D. PDF

- Open/view/search/select/copy/print.
- Edit text/images/links.
- Merge, split, reorder, rotate, crop and delete pages.
- Convert to/from DOCX/XLSX/PPTX/images.
- OCR and scanned-PDF workflows.
- Annotations, stamps, watermarks, bookmarks and signatures.
- Forms, fill/save, encryption and protection.
- PDF chat/summarization if available.

### E. Workspace/cloud/AI

- Login, account, device sessions and sync.
- Cloud storage and usage limits.
- Recent files, folders, search, recovery and recycle bin.
- Share/invite permissions, real-time collaboration and comments.
- Templates and template downloads.
- Plan comparison, purchase flow, trial, renew/cancel and feature entitlements.
- AI privacy notice, quotas, provider/feature behavior and user confirmation.

## 4. Inspect a feature systematically

For every feature, record:

1. **Name:** user-facing feature name in our own words; preserve WPS term only as a benchmark reference.
2. **Module:** Writer, Spreadsheet, Presentation, PDF, Workspace or AI.
3. **Platform:** desktop OS, web, Android, iOS; do not assume parity.
4. **Product version/build and observation date.**
5. **Plan/tier:** Free, Premium/Pro/AI/etc. as shown by WPS at that time and region.
6. **Entry point:** menu/ribbon path and context needed.
7. **Preconditions:** document type, selection, account, network, subscription.
8. **Steps:** exact user actions, including modal/menu choices.
9. **Inputs:** example document/file/content and settings.
10. **Expected result:** visible output and persistent file change.
11. **Edge cases:** no selection, read-only, unsupported font, offline, large file, concurrent edit, quota exceeded.
12. **Evidence:** source URL, screenshot/video captured by the authorized researcher, timestamp.
13. **Our implementation decision:** use editor engine, build custom app layer, integrate third-party service, defer, or not reproduce.
14. **Acceptance criteria and test ID.**
15. **Status:** researched → specified → implemented → tested → deployed.

## 5. Feature matrix template

Maintain `/docs/feature-matrix.csv` with at least these columns:

`id,module,feature,reference_platform,reference_version,reference_plan,observed_on,source_url,entry_point,preconditions,steps,expected_result,edge_cases,engine_support,implementation_decision,priority,status,test_id,evidence_path,notes`

One row per independently testable feature. Do not put an entire ribbon tab in one row.

## 6. Clean-room rules

Allowed:
- Observe publicly documented behavior and workflows.
- Use an account/trial the owner is authorized to use.
- Record feature names, user flows, visible outputs and technical requirements.
- Create original code, icons, layouts, names, help text and templates.
- Use documented APIs under their terms and compatible licenses.
- Test with synthetic or properly licensed fixture documents.

Not allowed:
- Copy WPS source code, decompile client binaries or extract proprietary internals.
- Bypass subscriptions, DRM, authentication, rate limits or feature gates.
- Reuse proprietary WPS logos, icons, illustrations, premium templates, screenshots or marketing text as product assets.
- Claim access to private APIs or undisclosed algorithms.
- Remove attribution/license notices from third-party software.

## 7. File fidelity research

Build a fixture corpus rather than testing only one simple DOCX. Include:

- Plain text with multiple fonts and headings.
- Multilevel numbered lists and nested bullets.
- Tables with merged cells, repeated headers and cell shading.
- Inline/floating images with captions and anchors.
- Header/footer, page numbers, page breaks and section breaks.
- Footnotes/endnotes and table of contents.
- Columns, page borders, landscape pages and mixed page sizes.
- Unicode, right-to-left text and non-Latin scripts relevant to the target market.
- Comments and tracked changes.
- Hyperlinks, fields and document metadata.

For each file:

1. Keep an immutable original fixture.
2. Open it with the chosen editor engine.
3. Make one known change and save.
4. Reopen the saved output.
5. Export to PDF and compare page count, text, table position, image placement, font substitution and page breaks.
6. Record expected/actual differences.
7. Never mark a format fully supported based only on successful upload or open.

## 8. Prioritization method

Score each feature 1–5 on:

- User value.
- Frequency of use.
- Paid-plan importance.
- Technical dependency readiness.
- Delivery cost/risk (reverse score for easier work).

Prioritize high-value, frequent, differentiating and dependency-ready features. Do not prioritize a visually impressive low-value feature over reliable save/reopen, access control or document fidelity.

## 9. Research note template

Create a Markdown file such as `docs/reverse-engineering/day-03-writer-autosave.md`:

```md
# Research Note: [Feature]
- Observed on:
- Platform/build:
- WPS plan/tier:
- Source URL(s):
- Research skill used:
- Evidence path:

## Observed workflow
1.
2.

## Preconditions and edge cases
- ...

## Expected user outcome
- ...

## Chosen implementation
- Engine/API/custom module:
- Licensing constraints:
- Data model/API impact:

## Acceptance criteria
- [ ] ...

## Verification
- Fixture/test ID:
- Result:
- Known gaps:
```
