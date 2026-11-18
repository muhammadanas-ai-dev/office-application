# Daily Muse AI Prompts — 15-Day Execution Pack

Use one prompt per day after loading `MASTER_PROMPT_FOR_MUSE.md`. These prompts are intentionally scoped; the persistent instructions require research, tests, Preview deployment and a handoff every day.

## Reusable start-of-day prompt

```text
Begin today's Forma Office iteration. Read INSTRUCTIONS.md, MASTER_PROMPT_FOR_MUSE.md, PRODUCT_SPEC.md, ARCHITECTURE_AND_TECH_STACK.md, BRAND_GUIDELINES.md, ROADMAP_15_DAYS.md, QA_RELEASE_SECURITY.md, the latest CHANGELOG.md, feature matrix and previous handoff. Inspect Git status, the current repository and yesterday's Vercel Preview. Inspect Muse's installed skills, read the relevant research/engineering skill, then research today's target from official WPS and editor-engine sources. Do not guess, overwrite working code or reveal any secrets. Prepare acceptance criteria and a small plan, implement today's complete vertical slice, run all required checks, deploy a Vercel Preview, smoke-test the deployed build, update evidence/changelog/feature matrix/known limitations and write the handoff. Report what was not possible honestly.
```

## Day 1 — research and architecture

```text
Execute Day 1 from ROADMAP_15_DAYS.md only. Build a dated WPS feature inventory covering Writer, Spreadsheet, Presentation, PDF, cloud, templates and AI. Use the installed browser/research skill only after reading it. Verify WPS premium claims against official plan pages and feature documentation. Compare office engines and produce ADR-001 covering supported formats, editor API, save callbacks, collaboration, hosting, fonts and license obligations. Confirm the target is Writer-first for 15 days. Create the feature matrix, research-note template, known-limitations file, initial changelog and original Forma design tokens. Do not implement fake editing functionality. Finish with a Preview deployment if access exists and a Day-1 handoff.
```

## Day 2 — application shell

```text
Execute Day 2. Build/audit the Next.js App Router + strict TypeScript foundation, design token system and responsive Forma Office shell. Use Tailwind, accessible shadcn/ui patterns and Lucide icons. Implement real navigation, loading, empty, error and not-found states. Validate environment variable names server-side and confirm .env.local is ignored. Do not add editor controls that do not work. Run lint, typecheck, tests and build; deploy and smoke-test the Preview URL; update evidence and handoff.
```

## Day 3 — Auth, schema and RLS

```text
Execute Day 3. Implement Supabase SSR authentication using the current official @supabase/ssr Next.js instructions. Add migrations for profiles, workspaces and workspace_members, role checks and RLS. Generate database types. Test two independent accounts and prove cross-workspace reads/writes are denied. Never expose service role keys. Run migrations safely, tests, build and Preview smoke tests. Document the schema and RLS policy rationale.
```

## Day 4 — library and storage

```text
Execute Day 4. Implement folders, document metadata, private Storage upload/download, list/grid library, search, sort, breadcrumbs, rename, move and delete/restore if safely supported. Validate file extension, MIME signature, size, quota and workspace authorization server-side. Keep file bytes out of Postgres. Add RLS and Storage policies; test unauthorized access with a second user. Make format capability messages truthful. Deploy Preview and complete upload/download E2E.
```

## Day 5 — office engine integration

```text
Execute Day 5. Use the selected editor engine from ADR-001. Verify the exact engine version and license. Implement server-side editor config signing, controlled source-file access, callback JWT validation and save-to-new-version handling. Integrate the real editor in a test route. Prove a DOCX can open, edit, save and reopen. Test tampered callback and cross-user access. Do not replace the editor with a textarea or fake demo. If licensing or hosting blocks the integration, stop and produce a blocker/decision report instead of pretending it works.
```

## Day 6 — Writer shell and core formatting

```text
Execute Day 6. Build the `/editor/[documentId]` workspace around the actual office editor. Implement document title, navigation, genuine save status, responsive panels and supported core formatting. Verify font family/size, bold, italic, underline, strike-through, color/highlight, alignment, lists and indent. Every control must invoke the editor's real UI/API and persist. Add keyboard and accessibility tests. Run the DOCX save/reopen regression and deploy Preview.
```

## Day 7 — layout and inserted objects

```text
Execute Day 7. Research and implement supported page layout and document elements: page size, orientation, margins, columns, breaks, styles/headings, tables, images, links, headers/footers and page numbers. Use the editor engine where supported; do not write a parallel fake toolbar. Add complex document fixtures with tables, images and mixed layouts. Verify saved DOCX and exported PDF. Clearly mark unsupported engine features. Deploy and hand off.
```

## Day 8 — formats and fonts

```text
Execute Day 8. Re-check the selected engine's official current format matrix. Implement a format-capability registry with editable/view_only/convertible/unsupported plus tested status. Build import/export tests for each format we claim. Verify WPS/WPT and legacy formats rather than assuming compatibility. Install only licensed fonts on the document server, synchronize the font picker with the engine, and test Latin plus Urdu/Arabic/RTL fixtures. Update docs/feature-matrix.csv with evidence. Deploy Preview.
```

## Day 9 — save, versions and recovery

```text
Execute Day 9. Harden save callback handling, autosave state, immutable version snapshots, checksums, idempotency and restore. Check concurrent callback behavior against the official editor docs. Build history UI showing version/author/time and restore as a new version. Simulate offline, callback retry, failed upload and duplicate save. Never show Saved without confirmed persistence. Run E2E and deploy.
```

## Day 10 — sharing and review

```text
Execute Day 10. Implement share/invite with viewer/commenter/editor roles, hashed expiring invite tokens and revocation. Validate every access server-side and pass correct permissions into editor config. If the licensed engine supports comments, track changes and co-editing, verify two-user behavior; otherwise record the limitation. Add audit events. Test that viewer/commenter cannot modify document body. Deploy Preview.
```

## Day 11 — templates and fonts UX

```text
Execute Day 11. Create original templates for resume, cover letter, business letter, report, proposal, meeting minutes and invoice. Build gallery, preview, search and create-from-template. Copy template assets into a user-owned document so edits do not change the shared master. Improve styles, font selector and keyboard help. Verify files are editable and export correctly. Deploy Preview.
```

## Day 12 — PDF workflow

```text
Execute Day 12. Implement and test DOCX-to-PDF export, PDF preview and download using the verified editor engine/conversion service. Investigate merge/split/rotate/compress only if supported by a correctly licensed dependency. Keep view/export/convert/edit/OCR capabilities distinct. Build PDF fixtures and test page count, text, fonts and corruption. Do not label PDF text/object editing or OCR complete without a real tested implementation. Deploy Preview.
```

## Day 13 — AI and entitlements

```text
Execute Day 13. Add opt-in selected-text AI rewrite, tone adjustment, summary and proofreading using a server-side provider abstraction. Show a proposed diff and require user confirmation before applying. Add privacy disclosure and avoid logging document contents. Implement server-enforced Free/Pro/Team feature limits and usage events. Keep payment provider disabled until country eligibility, tax and compliance are checked. Test quota bypass attempts and failed AI calls. Deploy Preview.
```

## Day 14 — hardening

```text
Execute Day 14. Conduct security, reliability and accessibility review: Supabase RLS, Storage RLS, editor JWT/callback, signed URL expiry, file validation, rate limiting, role boundaries, share revocation, secrets/log redaction, keyboard navigation and responsive behavior. Run full Playwright regression on supported browsers and performance tests on representative file sizes. Fix critical/high issues before adding new features. Deploy and smoke-test Preview.
```

## Day 15 — UAT and release

```text
Execute Day 15. Complete the full feature matrix with evidence. Re-run the critical journeys: sign-in, create, upload, open, edit, save, reopen, version restore, share permission, template use and PDF export. Fix P0 failures, update setup/security/licensing documentation, create screenshots and release notes, tag 0.1.0-rc.1 and prepare a truthful final report. Promote to Production only with explicit owner authorization and all QA/security/licensing gates passed. Publish a prioritized 30-day backlog for spreadsheet, presentation, advanced PDF, OCR, additional formats, AI and billing. Do not claim a complete WPS clone.
```

## Reusable end-of-day handoff prompt

```text
Close today's Forma Office iteration. Confirm what is actually implemented and tested. Run lint, typecheck, unit/integration/E2E tests and production build. Deploy the current branch to Vercel Preview and smoke-test the deployed URL if credentials/access are available. Update CHANGELOG.md, docs/feature-matrix.csv, docs/known-limitations.md and docs/handoffs/day-XX.md. Save screenshots or a short test capture under docs/evidence/day-XX/. Report version/commit, deployed Preview URL, feature status, test results, security/licensing issues, remaining defects and tomorrow's single highest-priority target. Never say deployed or tested if it did not happen.
```
