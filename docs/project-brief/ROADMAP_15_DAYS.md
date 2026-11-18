# 15-Day Delivery Roadmap

**Cadence:** 15 daily iterations.  
**Deployment rule:** Every day must create a Vercel Preview deployment (or explicitly report why it could not). Production promotion is gated by tests and owner authorization.  
**Milestone:** Writer-first v0.1.0 with app foundation and tested editor integration, not total WPS parity.

## Daily rhythm

- Start: inspect repository, previous release, installed Muse skills and current Vercel Preview.
- Research: observe the exact WPS workflow and verify engine support/license.
- Plan: write acceptance criteria, risks, tests and rollback.
- Build: one complete vertical slice, with migration/RLS/UI/server logic.
- Verify: lint, typecheck, unit/integration/E2E, production build and deployed smoke test.
- Ship: branch Preview URL, screenshots, changelog, feature matrix and handoff.

## Day 1 — Product discovery, benchmark and architecture decision

**Objective:** Replace assumptions with an evidence-backed product map and select the editing engine/licensing route.

Tasks:
- Read all project docs and inspect the repository, existing functionality, dependencies, test scripts and Git status.
- Inspect Muse AI's installed research skills and read the applicable skill.
- Inventory WPS features across Writer, Spreadsheet, Presentation, PDF, cloud, templates and AI.
- Compare current WPS free/premium plan differences for the owner's target region/platform; record date and official sources.
- Inspect official editor-engine feature/format/API docs and licensing. Produce ADR-001.
- Decide whether to proceed with a commercial ONLYOFFICE license, AGPL-compatible open project or another validated engine. Block commercial integration if license is unresolved.
- Create `docs/feature-matrix.csv`, `docs/reverse-engineering/`, `docs/architecture/`, `docs/known-limitations.md` and initial `CHANGELOG.md`.
- Establish original brand tokens and page-wireframe.

Acceptance:
- Each Day-15 feature has a source or is marked as original product behavior.
- Licensing and hosting decision is documented with risks.
- No unverified “all formats” claim remains in the product copy.
- Baseline branch/Preview deployment exists if repository access is available.

## Day 2 — Application foundation and design system

**Objective:** Build the application shell and production-ready code foundation.

Tasks:
- Set up or audit Next.js App Router, TypeScript strict mode, lint/format and test scripts.
- Install/verify Tailwind, shadcn/ui patterns, Lucide and form/validation libraries.
- Implement Forma design tokens, typography, app navigation, header, responsive layout and accessible controls.
- Add error boundary, loading/skeleton and empty-state patterns.
- Add safe env validation, `.env.example`, `.gitignore` checks and server-only secret module boundaries.
- Connect Vercel Git integration and Preview/Production environment separation.

Acceptance:
- Responsive authenticated-shell placeholder with no dead navigation.
- `lint`, `typecheck`, tests and `build` pass.
- No secret values are committed or exposed in client bundle.
- Preview deploy succeeds and smoke test passes.

## Day 3 — Supabase Auth, schema and RLS

**Objective:** Establish secure identity, workspace membership and core database model.

Tasks:
- Configure Supabase Auth with current `@supabase/ssr` cookie-based guidance.
- Create migrations for profiles, workspaces, workspace_members and foundational tables.
- Add RLS to all user-owned tables and role checks for owner/admin/editor/commenter/viewer.
- Add typed database types and seed data for local/test environment.
- Add sign-up, sign-in, sign-out, reset password and profile setup.
- Test cross-user and cross-workspace denial paths.

Acceptance:
- Users can sign up, sign in/out and reach only authorized workspace data.
- No browser code can use service-role credentials.
- RLS tests prove that one user cannot read or mutate another user's workspace.
- Preview deploy and auth smoke tests pass.

## Day 4 — Document library, folders and private storage

**Objective:** Make the workspace useful before the editor integration.

Tasks:
- Create folders, documents, document_versions and relevant audit tables/migrations.
- Create private Storage buckets and policies for upload/read/update/delete.
- Implement file library with list/grid, search, sort, filters, breadcrumbs and recent items.
- Implement create folder, rename, move, upload, download and soft-delete/restore if included.
- Validate extension, MIME signature, size, quota and generated storage path on the server.
- Show a truthful supported-format message before attempting to edit a file.

Acceptance:
- User can create folder, upload, view, rename, move, download and delete/restore authorized files.
- Private Storage blocks unauthorized object access.
- Upload errors and quota errors are handled.
- Preview deploy and upload/download smoke tests pass.

## Day 5 — Office engine integration proof

**Objective:** Prove an actual office file can open, edit, save and reopen through the selected engine.

Tasks:
- Deploy/configure the office document server on a separate persistent host if credentials/license/infra are ready.
- Implement server-side editor config generation and JWT signing.
- Implement controlled document fetch and a secure save callback handler.
- Validate callback signature, document access, payload, status and downloaded output.
- Save the returned file as a new immutable version in Supabase Storage.
- Test a simple DOCX and one complex fixture.
- If engine hosting/licensing is blocked, create an integration spike report and do not fake the editor with a text area.

Acceptance:
- Test DOCX opens in real editor, user edit is persisted, browser reload shows saved result.
- JWT secret remains server-only.
- Callback tampering/unauthorized document IDs are rejected.
- Record engine version and license state.
- Preview deploy and end-to-end editor smoke test pass.

## Day 6 — Writer shell and core formatting

**Objective:** Deliver the main Writer workflow in the real editor.

Tasks:
- Integrate editor into `/editor/[documentId]` with a robust loading/error boundary.
- Add original app-level top bar, title, sync state, share action and navigation back to library.
- Verify actual editor controls for font family/size, bold, italic, underline, strike-through, color/highlight, alignment, lists and indent.
- Ensure controls are the editor's real controls or invoke documented editor APIs.
- Add find/replace, undo/redo and zoom only if supported by the chosen engine.
- Test each action affects persisted document output.

Acceptance:
- No decorative toolbar controls.
- Every visible core formatting control changes the document and survives save/reopen.
- Keyboard focus and accessible labels work.
- Preview deploy and Writer smoke tests pass.

## Day 7 — Page layout and document elements

**Objective:** Build common professional document formatting workflows.

Tasks:
- Verify and expose page size, orientation, margins, columns and page breaks.
- Verify paragraph/heading styles and navigation/outline features.
- Test insert/edit of tables, images, hyperlinks and shapes where supported.
- Add headers, footers and page numbering where supported by the editor edition.
- Build fixtures with complex tables, images and mixed page orientation.

Acceptance:
- Each visible layout action changes saved output.
- Exported PDF has acceptable page count/layout for fixture set.
- Unsupported layout tools are hidden or explicitly marked unsupported.
- Preview deploy and fixture regression passes.

## Day 8 — Format compatibility, import/export and font handling

**Objective:** Establish honest, tested format behavior.

Tasks:
- Implement format capability registry (`editable`, `view_only`, `convertible`, `unsupported`).
- Reverify the exact editor version's official supported format list.
- Test DOCX/DOC/DOCM/RTF/ODT/TXT/HTML/PDF and WPS-specific formats according to actual engine support.
- Implement safe conversion flows only where officially supported.
- Install/verify a small licensed font set on the document server; align font selector with installed fonts.
- Test Unicode, Urdu/Arabic/RTL and common Latin fonts as target market checks.

Acceptance:
- UI explains capability per extension; no unsupported file silently opens as editable.
- A fixture-based test report exists for each claimed format.
- Exported fonts are compared against browser preview.
- Preview deploy and import/export tests pass.

## Day 9 — Autosave, versions and recovery

**Objective:** Make document persistence trustworthy.

Tasks:
- Validate save callbacks under idle, close, forced-save and concurrent-editor conditions according to the engine docs.
- Implement version snapshots, checksum and consistent current-version metadata updates.
- Implement visible saving/saved/offline/error/conflict states based on real state.
- Implement version history list and restore as a new version.
- Add idempotency/retry protection for callbacks and duplicate saves.

Acceptance:
- Save/reopen works under refresh and normal navigation.
- A previous version restores without deleting later versions.
- Duplicate callbacks do not create corrupt duplicate current versions.
- Network/save failure is visible and recoverable.
- Preview deploy and persistence E2E pass.

## Day 10 — Sharing, permissions and review

**Objective:** Support controlled collaboration.

Tasks:
- Implement secure document share/invite flow and role selection.
- Implement invite-token hashing/expiry/revocation if link sharing is enabled.
- Build permissions-aware editor configuration.
- Verify comments, track changes and co-editing with a second test account if available in the licensed editor edition.
- Use Supabase Realtime only for app metadata/presence, not as a substitute for document collaboration.
- Add audit events for sharing and revocation.

Acceptance:
- Viewer cannot edit; commenter cannot edit body; editor can edit; owner/admin can manage shares.
- Revocation blocks future access.
- Two-user collaboration is tested if enabled; otherwise marked engine/plan blocked.
- Preview deploy and multi-user permission tests pass.

## Day 11 — Templates, reusable styles and usability

**Objective:** Make document creation fast and professional.

Tasks:
- Create original templates: resume, cover letter, business letter, report, proposal, meeting minutes and invoice.
- Build template gallery with preview, category and search.
- Implement create-from-template as a user-owned copy.
- Add reusable style sets and user preferences only if they persist reliably.
- Improve keyboard shortcuts help and responsive layout.

Acceptance:
- Template files are original/licensed and can be edited after creation.
- User edits never mutate the shared original template.
- Font/style availability is truthful.
- Preview deploy and template E2E pass.

## Day 12 — PDF workflow and file utilities

**Objective:** Add tested PDF value without pretending to have a complete Acrobat clone.

Tasks:
- Implement DOCX-to-PDF export via the selected office engine or a verified conversion service.
- Implement PDF preview/download and clear error handling.
- Evaluate merge/split/rotate/compress only with a licensed, supported library/service.
- Separate view, export, convert, annotate and edit capabilities in the UI.
- Add basic PDF fixture tests and verify metadata/page count/text extraction.
- Defer OCR and PDF object editing if the correct engine/service is not ready.

Acceptance:
- PDF export passes page layout/encoding checks on the fixture corpus.
- Unsupported PDF operations are not shown as live actions.
- No untrusted file path/URL is processed.
- Preview deploy and PDF E2E pass.

## Day 13 — AI assistance, plans and usage entitlements

**Objective:** Add controlled premium value with transparent costs and user control.

Tasks:
- Implement provider abstraction and server-only AI credentials.
- Add selected-text rewrite, tone change, summarization and proofreading; translate only if quality/language tests are available.
- Show proposal/diff and require explicit Apply/Replace.
- Add privacy notice and optional whole-document consent.
- Implement Free/Pro/Team entitlement checks and usage events in server-side operations.
- Build billing-provider adapter but do not turn on live billing until merchant eligibility, tax and compliance are verified.

Acceptance:
- No AI action runs without explicit user interaction.
- Quota/plan enforcement is tested server-side.
- AI keys and document content are never emitted in browser logs.
- Failed provider call does not alter source document.
- Preview deploy and AI quota/permission tests pass.

## Day 14 — Security, performance, accessibility and regression

**Objective:** Make the release candidate safer and more reliable.

Tasks:
- Review all RLS policies and Storage object policies.
- Test user/workspace isolation and share-revocation behavior.
- Review editor JWT, callback, URL fetch and document-key logic.
- Add rate limits for upload, editor-config, callbacks, export and AI routes.
- Run file-type/MIME/size abuse tests and malformed files.
- Run Playwright E2E suite across supported browsers and responsive breakpoints.
- Run accessibility checks and keyboard navigation.
- Measure editor startup, open/save and list loading on representative file sizes.
- Review error monitoring, redacted logs and environment separation.

Acceptance:
- No known critical/high security issue remains open.
- Regression test suite and production build pass.
- All critical flows work against Preview.
- Performance measurements and known limitations documented.

## Day 15 — Release candidate, user acceptance and v0.1.0

**Objective:** Package the first credible release and create the next parity roadmap.

Tasks:
- Run full feature matrix against the actual WPS reference and chosen engine version.
- Re-test create/upload/open/edit/save/reopen/download/export, role boundaries, templates, versions and supported PDF workflows.
- Resolve P0 bugs; do not rush P1/P2 features at the expense of save/security.
- Create user demo data and original screenshots.
- Update README, setup instructions, architecture diagrams, environment template, known limitations and release notes.
- Create `0.1.0-rc.1` Preview release.
- Complete manual UAT with the owner. Promote to Production only after explicit release authorization and all gates pass.
- Produce a prioritized 30-day roadmap for Spreadsheet, Presentation, PDF advanced tooling, OCR, additional formats, AI features and billing.

Acceptance:
- Every claimed feature is linked to tests/evidence.
- Compatibility matrix identifies editable/view-only/convertible/unsupported formats.
- Licensing decision is documented.
- Production release occurs only if actually authorized and verified.
- No claim of complete WPS clone is made; release notes describe exactly what is ready.

## Day 15 exit criteria

The 15-day milestone is successful when the user can reliably sign in, create/upload a supported document, edit it through a real editor engine, save/reopen it, organize it in a private library, use the tested formatting/templates/sharing/version features and export a tested PDF — while access control and secrets remain secure.
