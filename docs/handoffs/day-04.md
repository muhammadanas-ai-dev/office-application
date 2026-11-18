# Day 04 — Handoff

- Date: 2026-11-17
- Version label: day-04
- Branch: day-04-library
- Commit SHA: 8744189
- Vercel Preview URL: NOT PERFORMED — no Vercel/Git remote access
- Production URL (only if promoted): none
- Office engine version/edition: none deployed

## 1. What was researched

- WPS platform/build/plan: none — Day 4 is library/storage work, no
  WPS research needed. Day 1 inventory still stands.
- Source URLs:
  - Supabase skill security checklist (storage section): Storage
    upsert requires INSERT + SELECT + UPDATE policies; never expose
    service_role/secret keys in public clients; `auth.role()` is
    deprecated in favour of the `TO` clause; UPDATE needs USING +
    WITH CHECK; SECURITY DEFINER helpers only in a private schema
    with an `auth.uid()` check.
  - Next.js 16 docs (node_modules/next/dist/docs/): server-actions
    guide — actions are untrusted entry points (validate inputs,
    authenticate inside the action, constrain return values;
    `redirect()` throws so revalidate before it). The default
    server-action body limit is 1 MB; Day 4 raises it to 50 MB in
    next.config.ts for uploads.
- Research skill used: none (docs read directly per the supabase
  skill's method 2).
- What was directly observed:
  - The Day 3 migration is NOT applied to the live project (verified
    with a real REST query: profiles/workspaces/workspace_members
    all return PGRST205). The user has not applied it yet.
  - A `head: true` count query does NOT validate a table against the
    PostgREST schema cache — it returns no error for a missing
    table. The first Day 4 probe was a false positive for this
    reason; always use a real `select('*')` to check a table exists.
  - Local Postgres (installed Day 3) was stopped after a VM restart;
    `service postgresql start` brings the 16/main cluster back.
  - The only `sb_secret_` match in the client bundle is the literal
    prefix inside supabase-js's own key-type check
    (`startsWith("sb_publishable_") || startsWith("sb_secret_")`) —
    no secret value is shipped to the browser.
- What remains unverified: Vercel Preview/Production environment
  separation (no access); Supabase Auth URL Configuration (Site URL
  - redirect allowlist) — check in the dashboard before the first
    real sign-up.

## 2. Completed functionality

| Feature                               | Status               | Evidence/test ID                                               | Notes                                         |
| ------------------------------------- | -------------------- | -------------------------------------------------------------- | --------------------------------------------- |
| Document library (/files)             | done (UI)            | Local smoke test: /files 307 → sign-in (protected)             | Needs both migrations live to list anything   |
| Folder tree, breadcrumbs              | done                 | Component tests: FolderTree + Breadcrumb                       | Nested list, no drag-and-drop                 |
| Search, sort                          | done                 | GET forms (?q=, ?sort=, ?dir=)                                 | Title/name ilike; sort name/updated/size      |
| Create folder / blank document        | done                 | Server actions + Zod                                           | Role editor+ enforced by RLS                  |
| Rename / move / duplicate             | done                 | Server actions                                                 | Move guards: not into self or a descendant    |
| Upload (DOCX/DOC/PDF/TXT/ODT, ≤50 MB) | done                 | Server-side validation tests                                   | Bucket live; policies in migration            |
| Download (signed URL, 1 h)            | done                 | Route /api/documents/[id]/download                             | 307 signed-out; RLS decides access            |
| Star / unstar                         | done                 | document_stars table + toggle action                           | Per-user; Starred page lists them             |
| Soft-delete + Trash + restore         | done                 | /trash page                                                    | Restore also restores ancestors               |
| Permanent delete                      | done                 | Owner/admin gate + storage cleanup                             | Removes version files too                     |
| Home / Recent / Starred               | done (UI)            | Real counts + lists                                            | Shared/Templates/Plan still placeholders      |
| Private Storage bucket                | done (live)          | `documents`, private, 50 MB, 5 MIME types                      | Policies in Day 4 migration                   |
| Day 4 migration                       | written, NOT applied | supabase/migrations/20261117020000_forma_documents_library.sql | Apply AFTER Day 3, in order                   |
| RLS verification (local)              | done — 17/17 pass    | scripts/verify-rls-local.sh (Postgres 16)                      | T11–T17 cover library + storage + is_personal |
| RLS verification (live)               | pending              | npm run test:live (extended)                                   | Needs both migrations applied                 |
| Unit/component tests                  | done                 | 8 files, 41 tests, all passing                                 | Storage, schemas, tree/breadcrumb             |

## 3. Code and data changes

- Pages: src/app/(workspace)/files, home, recent, starred, trash
  (all real now); src/app/api/documents/[id]/download/route.ts (new).
- Services: src/features/library/ (schemas.ts, queries.ts,
  actions.ts); src/lib/storage.ts (bucket, limits, validation,
  path builder, formatBytes).
- Components: src/components/library/ (library-forms.tsx — client
  forms with useActionState; library-list.tsx — tree, breadcrumb,
  toolbar, folder grid, document table; library-setup.tsx —
  setup-pending / no-workspace states).
- Shell: header search is now a real GET form to /files; the Create
  button links to /files; footer updated to day-04.
- Config: next.config.ts — serverActions.bodySizeLimit "50mb".
- Types: database.types.ts gains folders, documents,
  document_versions, document_stars + workspaces.is_personal, with
  Relationships (except the folders self-reference — see §6b).
- Provisioning: ensureProfileAndWorkspace inserts is_personal=true
  and re-looks up on a unique-violation (concurrent-sign-in race).
- Supabase migrations/RLS: Day 4 migration (see §2) — folders,
  documents, document_versions, document_stars, RLS policies,
  storage.objects policies, is_personal column + partial unique
  index + backfill. Storage bucket `documents` created live via the
  Storage API.
- Storage policy changes: four policies on storage.objects for the
  `documents` bucket (member-only, path's first segment is the
  workspace id).
- Environment variable names added (never values): none.
- Dependencies: none new.

## 4. Tests

- Lint: 0 errors, 0 warnings.
- Typecheck: `tsc --noEmit` pass.
- Unit: 41 passed / 0 failed (8 files).
- Integration: local RLS 17/17 pass (see §2); live RLS test
  extended with document + file cases, gated on FORMA_LIVE_DB=1 —
  not run (migrations not applied).
- E2E: none (no Playwright suite yet — Day 14).
- Build: pass (routes confirmed: /files, /home, /recent, /starred,
  /trash, /api/documents/[id]/download).
- Preview smoke tests: local smoke test pass — / 200, /auth/login
  200, all workspace routes 307 to /auth/login?next=…, download
  route 307 while signed out. Client bundle has no secret value
  (only the supabase-js key-type prefix literal).

## 5. Deployment verification

- Preview deployment result: NOT PERFORMED — no Vercel/Git remote access.
- Health endpoint: /api/supabase-status reachable locally.
- Browser console/network result: not checked (no deployed URL).
- Main workflow result: no live sign-up, upload or download yet
  (both migrations pending).

## 6. Security/licensing checks

- RLS and Storage access: library + storage policies written per
  the supabase security checklist; verified locally 17/17 (see §2);
  live test pending migrations.
- Editor JWT/callback: not yet implemented (Day 5, gated).
- Secrets: no new secrets; .env.local still gitignored; client
  bundle scan clean (see §1). Rotation of keys pasted in chat
  earlier is still unconfirmed.
- File handling: uploads validated server-side (extension, MIME,
  size); bytes go to private Storage, never Postgres. No
  byte-signature (magic-number) check yet — Day 12 hardening item.
- License status: unchanged from Day 1 (ADR-001); commercial launch
  BLOCKED pending owner decision.

## 6b. Verification notes and fixes made during Day 4

- The first local run failed because the Postgres service was
  stopped after a VM restart — `service postgresql start` fixed it.
  The cluster is NOT auto-started; note this in known-limitations.
- T17 first failed: the Day 4 migration's is_personal backfill runs
  before the test inserts its workspace row, so there was nothing
  to mark. The verify script now inserts a pre-Day-4 workspace
  (with its auth.users rows, for the owner FK) between the two
  migrations, so T17 tests the real backfill.
- `subtreeFolderIds` only walked non-deleted folders, so restoring
  or permanently deleting a trashed folder missed its descendants.
  It now takes `includeDeleted`, and restore also restores
  ancestors so a folder never stays hidden under a deleted parent.
- Zod 4's `z.uuid()` rejects the placeholder UUIDs used in tests
  (`11111111-1111-1111-1111-...` fails the version/variant nibble
  check). Test fixtures now use valid version-4 UUIDs.
- supabase-js type inference loops (TS7022) on the breadcrumb
  query and on embedded `document_stars` joins. Fixes: the
  breadcrumb result is explicitly typed, star status is fetched
  with a separate small query, and the folders self-reference is
  omitted from the hand-written types (it still exists in the DB).
- The vitest config does not set `globals`, so testing-library's
  auto-cleanup is not registered; the library-list test file calls
  `cleanup()` in `afterEach` explicitly.

## 7. Known defects and limitations

- Both migrations not applied — the one thing standing between
  this code and a working sign-up/upload/download. Apply Day 3,
  then Day 4, in the dashboard SQL Editor, then run
  `npm run test:live`. The Day 4 migration references Day 3 tables,
  and provisioning inserts `is_personal`, so a first sign-up
  before Day 4 is applied would fail.
- No editor: "Open" is a disabled button labelled Day 5; blank
  documents have no file until the editor saves one.
- No byte-signature validation on uploads (Day 12 hardening).
- Folder tree is a simple nested list (no drag-and-drop, no
  pagination).
- `src/lib/supabase/middleware.ts` (shadcn reference) intentionally
  untouched; the active session refresh + protection is
  `src/lib/supabase/proxy.ts`.
- See docs/known-limitations.md for the full list.

## 8. Tomorrow's target

- Highest-priority feature: Day 5 — ONLYOFFICE integration proof.
  **Gated on the owner's licence/hosting decision** (ADR-001):
  proprietary product → Developer licence + legal review; open/
  learning project → AGPL-compliant Community evaluation. If
  blocked, produce a blocker report, never a fake editor.
- Acceptance criteria: a real DOCX opens in the editor, edits,
  saves via a validated callback to a new version, and reopens
  showing the edits; tampered callback and cross-user access are
  rejected.
- Dependencies/blockers: the licence/hosting decision is the
  owner's step (needed before Day 5 work can start); applying both
  migrations is the owner's step (dashboard SQL Editor, ~2 minutes
  each) and unblocks the live proof for Days 3–4.
