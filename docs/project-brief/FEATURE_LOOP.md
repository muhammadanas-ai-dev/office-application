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
| 10 | Sharing (single-user, local) | **Done (Day 25, the link half — unit 319/319; live e2e pending the migration)** |
| 11 | Compatibility test corpus | Next |
| 10 | Sharing (single-user, local) | Not started |
| 11 | Compatibility test corpus | Not started |
| 12 | Hardening (byte-signature validation, auth rate limiting, monitoring, backup/restore, privacy disclosures, licence audit) | Not started |
| 13 | UX gaps (dead sidebar controls, drag-and-drop upload, responsive layout, document tabs) | Not started |

E-signatures are deferred (needs a legal/verification decision).
No billing until merchant eligibility/tax/compliance is verified.
The owner can reorder the queue; the loop stays the same.
