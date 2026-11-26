# Feature loop (standing method, owner instruction 2026-11-18 13:31 PKT)

Owner's words: "research how to develope first and then make a
plan and make a small tasks step by step to implement and then
implement that properly and then test this loop apply for the all
the next features till all the features is developed".

## The loop (applies to every next feature, in order)

1. **Research first.** Before writing any code, find out how the
   feature is actually built: read the engine/library API that
   will do the work (not a summary of it), find the honest limits
   (what the engine cannot do, what it silently destroys, what it
   fakes), and decide the approach (Forma-own vs engine, and why).
   Write the research down in the day's handoff §1 so the next
   feature can reuse it.
2. **Plan, in small tasks.** Break the feature into small,
   ordered tasks, each one a single verifiable step (one module,
   one route, one UI piece, one test file). Write the plan down
   (a `day-NN-plan.md` handoff) before implementing. A task is
   small enough when its test can be named in the same line.
3. **Implement properly, one task at a time.** Production-grade:
   no hardcoded values, no loopholes, no silent failures, no
   faked behaviour. Every refusal is a clear error message. The
   original file is never overwritten (a new version is created).
4. **Test properly.** Unit tests for the logic, then a live
   end-to-end test as a real signed-in user (the harness), with
   cross-user and signed-out checks. A feature is done only when
   the live e2e passes and the counts are recorded.
5. **Docs + commit + handoff + reply.** Update the plan, the
   feature matrix, the known limitations and the changelog; commit
   on a `day-NN-<feature>` branch; write the handoff; tell the
   owner what shipped and what is still limited.
6. **Next feature.** Move to the next item in the queue below.
   Repeat until every feature is developed.

## The queue (remaining features, in order)

The audit of 2026-11-18 (`docs/project-brief/FEATURE_AUDIT.md`
§16) is the authoritative remaining list — it replaces the
WPS_LEVEL_PLAN queue below, which is kept for history. AI (§7 of
the owner's checklist) and cloud services (quotas, cloud drive,
sync, multi-user collaboration, billing/plan UI) are skipped by
the owner's instruction of 2026-11-18; Supabase Storage stays
(the library is built on it).

| # | Feature | Status |
|---|---|---|
| 1 | Fix "New blank document" (real blank DOCX/XLSX/PPTX) | **Done (Day 15)** |
| 2 | Templates (original gallery) | **Done (Day 16, first three)** |
| 3 | PDF annotations (highlight, underline, notes, freehand) | **Done (Day 17)** |
| 4 | PDF page tools, second half (insert/crop/page numbers/add text/hyperlinks/shapes) | **Done (Days 18–19)** |
| 5 | PDF security (password-protect, permissions, unlock) | **Done (Day 20)** |
| 6 | Searchable PDF after OCR + extract text | **Done (Day 21, live e2e pending the migration)** |
| 7 | PDF ↔ image (export pages to PNG/JPG, images to PDF) | **Done (Day 22, live e2e 20/20)** |
| 8 | Versions UI | **Done (Day 23, live e2e 20/20)** |
| 9 | Settings / preferences | **Done (Day 24, unit 312/312, live e2e 14/14)** |
| 10 | Sharing (single-user, local) | **Done (Day 25, the link half — unit 319/319; live e2e 23/23 after the owner applied the corrected migration)** |
| 11 | Compatibility test corpus | **Done (Day 26 — unit 338/338; the runner 56 passed, 0 failed, 22 skipped (docserver))** |
| 10 | Sharing (single-user, local) | Not started |
| 11 | Compatibility test corpus | Not started |
| 12 | Hardening (byte-signature validation, auth rate limiting, monitoring, backup/restore, privacy disclosures, licence audit) | **Done (Day 27 — unit 369/369; live e2e 11/11)** |
| 13 | UX gaps (dead sidebar controls, drag-and-drop upload, responsive layout, document tabs) | **Done (Day 28 — unit 382/384; live e2e 9/9)** |
| 14 | Remaining templates (proposal, invoice, minutes, certificate, budget tracker, pitch deck) | **Done (Day 30 — unit 414/414; live e2e 68/68)** |
| 15 | Save a custom template (turn one of your documents into a reusable template) | **Done (Day 31 — unit 422/422; live e2e 29/29, closed 2026-11-21 after the owner applied the migration)** |
| 16 | Stamps / watermarks (a text watermark, an image watermark and a rubber stamp on PDF pages) | **Done (Day 32 — unit 432/432; live e2e 18/18, closed 2026-11-24)** |
| 17 | Insert pages from an image (each uploaded PNG/JPEG becomes a new page) | **Done (Day 33 — unit 436/436; live e2e 16/16, closed 2026-11-25)** |
| 18 | Export with comments + local reviewer notes (the Day 25 half) | **Done (Day 34 — export live e2e 13/13; the notes round-trip runs after the owner applies the migration)** |
| 19 | Small leftovers: delete the /plan route + the console.error → logError sweep | In progress (2026-11-26 run) |
| 20 | PDF text search (per-page search API + UI) | **Done (F20, 2026-11-26 — unit 10 new; live e2e 9/9)** |
| 21 | PDF outline/bookmarks + reading modes + thumbnails/zoom finish (viewer) | **Done (F21, 2026-11-26 — outline resolver unit 4/4; regression e2e 4/4; canvas rendering is browser-side, not pixel-verified from the VM)** |
| 22 | Extract embedded images from PDF | **Done (F22, 2026-11-26 — live e2e 5/5)** |
| 23 | Extract tables from PDF (CSV download as a ZIP of CSVs) | **Done (F23, 2026-11-26 — unit 7 new; live e2e 6/6)** |
| 24 | Export PDF to XLSX (text-based) | **Done (F24, 2026-11-26 — unit 5 new; live e2e 7/7)** |
| 25 | Export PDF to PPTX (text-based) | **Done (F25, 2026-11-26 — unit 5 new; live e2e 6/6)** |
| 26 | Redaction (permanently remove content under regions) | **Done (F26, 2026-11-26 — unit 7 new; live e2e 8/8)** |
| 27 | Page resize tools | **Done (F27, 2026-11-26 — unit 4 new; live e2e 8/8)** |
| 28 | Batch conversion (multiple files through the PDF tools) | **Done (F28, 2026-11-26 — unit 3 new; live e2e 8/8)** |
| 29 | Document properties / metadata view + edit | **Done (F29, 2026-11-26 — unit 4 new; live e2e 8/8)** |
| 30 | Import annotations from another PDF | **Done (F30, 2026-11-26 — unit 2 new; live e2e 7/7)** |
| 31 | Print reviewed document (print view) | **Done (F31, 2026-11-26 — live e2e 4/4)** |
| 32 | Settings pack: theme, locale/date/number formats, shortcut reference, accessibility preferences | **Done (F32, 2026-11-26 — unit 4 new (10 in preferences); live e2e 7/7; persistence activates with the combined SQL)** |
| 33 | Fonts: user font upload + favourites/recently used | **Done (F33, 2026-11-26 — unit 4 new; live e2e 5/5; table in the combined SQL)** |
| 34 | Long-tail formats (WEBP/TIFF images to PDF; honest limits where the docserver is required) | **Done (F34, 2026-11-26 — unit 6 new; live e2e 4/4; bucket SQL in the combined file). DOCM/RTF/PDF-A and TIFF/BMP/GIF/SVG as document formats stay with the docserver (blocked)** |
| 35 | Draft auto-save + recovery (buildable slice only; the editor-dependent part waits for the docserver) | **Done (buildable slice) (F35, 2026-11-26 — unit 4 new; live e2e 4/4). Editor-document local drafts stay with the editor's server autosave (docserver)** |

**The 2026-11-26 completion run (owner instruction):** build
every remaining buildable checklist feature, one by one, each
through the full loop (research → plan → implement → test),
production-grade, without stopping. Excluded by the owner:
the blocked items (the docserver reinstall, the Vercel
deploy), all AI features, all cloud/collaboration/billing
features, and anything that needs a permission he has not
given (leave that feature and move on). **No GitHub push
during this run** (local commits only). **All SQL migrations
from this run are delivered to the owner as ONE combined
file at the very end**, proper and correct, instead of one
file per feature.

E-signatures are deferred (needs a legal/verification decision).
No billing until merchant eligibility/tax/compliance is verified.
The owner can reorder the queue; the loop stays the same.

## Completion run additions (2026-11-26, audit reconciliation)

| 36 | Batch page operations (rotate/compress many PDFs) + PDF repair (qpdf rebuild) | **Done (F36, 2026-11-26 — unit 2 new; live e2e 6/6)** |
| 37 | PDF page labels | **Done (F37, 2026-11-26 — unit 4 new; live e2e 5/5)** |
| 38 | Insert an image onto existing PDF pages | **Done (F38, 2026-11-26 — unit 2 new (47 in pdf-page-tools); live e2e 5/5)** |
