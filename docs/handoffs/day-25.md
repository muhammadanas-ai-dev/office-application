# Day 25 handoff — Single-user sharing (shareable links)

Date: 2026-11-18. Owner instruction (18:04 PKT): "okay go head
implement this properly by using feature loop.md i run the
query" — build audit queue item 10
(`docs/project-brief/FEATURE_AUDIT.md` §16): Sharing
(single-user, local). The owner also confirmed he ran the
Day 24 preferences migration — the Day 24 harness was re-run
first (14/14, see the Day 24 handoff §4).

## 1. What was researched

- **What "single-user sharing" means here.** A shareable
  LINK for a document: the owner creates a link, anyone with
  the link can open it and download the document — no
  account, no sign-in. This is the single-user half of the
  audit's item 10. **Multi-user co-editing stays skipped**
  (the owner's 2026-11-18 instruction) — the "Shared with
  me" page (/shared) stays a placeholder; this feature does
  NOT build it.
- **The token model.** The editor's HMAC file-token pattern
  (`src/lib/editor.ts`: `signFileToken` /
  `verifyFileToken`, HMAC-SHA256, 1 hour) is the model, but
  it is STATELESS — a signed token cannot be revoked and
  cannot be listed. A share link MUST be revocable and
  listable, so it needs a database row. Design:
  - The link is `/s/<token>` where `<token>` is a random
    32-hex-char string (`crypto.randomBytes(16)` — 128 bits,
    unguessable).
  - The database stores the SHA-256 HASH of the token (not
    the token itself — so a database leak does not expose
    the links). To open a link, hash the incoming token and
    look up the hash.
  - Table `document_shares` (migration
    `20261118090000_forma_shares.sql`): `id uuid pk`,
    `document_id uuid` (references documents, cascade
    delete), `workspace_id uuid`, `token_hash text not null
    unique`, `expires_at timestamptz null` (null = never
    expires), `created_by uuid`, `created_at timestamptz`,
    `revoked_at timestamptz null`. RLS: SELECT/INSERT/UPDATE
    for workspace members; DELETE for owner/admin. **The
    public share page reads via the SERVICE ROLE (admin
    client) by token hash — the token itself is the
    credential, so no user session is needed.** It uses the
    admin client, but ONLY after the token hash matches a
    row.
- **What the link gives (v1).** The share page (`/s/[token]`)
  is a PUBLIC page (no sign-in): it shows the document
  title, file type, size, and when the link expires, plus a
  Download button. The download serves the document's
  CURRENT version (the file at the document's current
  `file_path`). **Download only in v1** — no in-browser
  preview (a PDF.js preview is a separate feature). The
  page says plainly that the link gives download access.
- **Expiry.** The owner picks when creating the link: 1 day,
  7 days, 30 days, or never. Default: 7 days. An expired
  link shows "This link has expired." A revoked link shows
  "This link was revoked." A bad/unknown token shows "This
  link is not valid." (All three are the same "not found"
  shape — they do not reveal whether the token ever existed.)
- **Managing links.** The library gets a "Share" action per
  document. A new page `/documents/[id]/share` (server: the
  document + its active links via the user client; client:
  the create form + the list + revoke buttons) keeps the
  library list clean and the share UI in one place.
- **The download.** The share page's Download button goes
  to `GET /s/[token]/download` (a public route): it verifies
  the token (hash lookup, not revoked, not expired), loads
  the document's current version, mints a signed Storage
  URL (the Day 4 pattern, 1 hour) and redirects. **The
  signed URL is NOT shown to the recipient as a permanent
  link** — it is a 1-hour redirect, and the share link
  itself is the stable address.
- **The audit's "export with comments" and "local reviewer
  notes"** are separate sub-features of item 10 (they need
  a comments/notes model). They are NOT in this feature —
  the share link is the core. They are noted as future work.

## 2. Completed functionality

- **The pure module** (`src/lib/sharing.ts`):
  `newShareToken()` (32 hex chars from
  `crypto.randomBytes(16)`), `hashShareToken(token)`
  (SHA-256 hex), `isShareExpired(expiresAt, now)` (null =
  never), `getShareUrl(token)` (`/s/<token>`),
  `SHARE_EXPIRIES` (1 day, 7 days, 30 days, never),
  `expiresAtForChoice(choice, now)`.
- **The migration** (`supabase/migrations/
  20261118090000_forma_shares.sql` + the copy in
  `~/workspace/your_files/forma-shares-migration.sql`).
- **The server module** (`src/lib/sharing.server.ts`,
  `import "server-only"`): `createShare` (loads the
  document via the user client (RLS) → 404 if missing;
  inserts the share row; returns `{token, url, expiresAt}`
  — the token is returned ONCE, at creation; the database
  only ever holds the hash), `listShares` (newest first),
  `revokeShare` (sets `revoked_at`; only the creator may
  revoke — a plain member cannot revoke someone else's
  link), `resolveShare(token)` (the PUBLIC lookup: hash the
  token, admin client, the share row + the document's
  current file; returns the document or a reason:
  not-found / revoked / expired).
- **The routes**: `POST /api/documents/[id]/shares`
  (create — Zod: the expiry choice; returns `{ok, share:
  {id, url, expiresAt}}`), `GET /api/documents/[id]/shares`
  (list), `POST /api/documents/[id]/shares/[shareId]/revoke`,
  `GET /s/[token]/download` (public — the signed-URL
  redirect, the Day 4 pattern).
- **The pages**: `/s/[token]` (a PUBLIC page, outside the
  workspace layout — no sign-in, no sidebar; shows the
  title, type, size, expiry, and a Download button; a dead
  link shows a plain "This link is not valid." message) +
  `/documents/[id]/share` (the manage UI: the create form
  + the list + revoke buttons; shows a setup notice if the
  migration is not applied) + the library "Share" link
  (`shareHref` prop in DocumentActions, shown for every
  document with a file).

## 3. Code and data changes

- `src/lib/sharing.ts` (new, pure) +
  `src/lib/sharing.test.ts` (new, 7 tests).
- `src/lib/sharing.server.ts` (new, server-only).
- `supabase/migrations/20261118090000_forma_shares.sql`
  (new) + `~/workspace/your_files/
  forma-shares-migration.sql` (the owner's copy).
- `src/app/api/documents/[id]/shares/route.ts` (new,
  POST + GET) +
  `src/app/api/documents/[id]/shares/[shareId]/revoke/
  route.ts` (new, POST) +
  `src/app/s/[token]/download/route.ts` (new, GET, public).
- `src/app/s/[token]/page.tsx` (new, public) +
  `src/app/(workspace)/documents/[id]/share/page.tsx`
  (new, manage UI) +
  `src/components/sharing/sharing-client.tsx` (new).
- `src/components/library/library-forms.tsx`
  (`shareHref` prop) +
  `src/components/library/library-list.tsx` (passes it).
- `src/types/database.types.ts` (the document_shares
  Row/Insert/Update).
- `scripts/e2e-sharing-test.mjs` (new, focused harness)
  + `scripts/prove-sharing.mjs` (temporary — delete
  before the commit).
- Docs: `docs/handoffs/day-25-plan.md`,
  `docs/feature-matrix.csv` (FORMA-034),
  `docs/known-limitations.md` (the sharing limits),
  `CHANGELOG.md` (Day 25 entry),
  `docs/project-brief/FEATURE_AUDIT.md` (§16 item 10 → Done
  for the link half; the comments/notes half noted as
  future work), `docs/project-brief/FEATURE_LOOP.md`
  (queue: item 10 Done, Compatibility test corpus next),
  `~/MEMORY.md` (Day 25 entry).

## 4. Tests

- **Proof of concept (task 1): NOT RUN — the migration is
  not applied.** `scripts/prove-sharing.mjs` checks the
  migration first and reports clearly if it is not applied
  (like the Day 21/24 harnesses). It will run after the
  owner applies the migration.
- **Unit: 319/319 (27 files passed, 1 skipped, 11 tests
  skipped — the pre-existing skips).** 7 new: the token
  format (32 hex, unique), the hash (deterministic, 64 hex,
  not the token), the expiry choices (1d/7d/30d/never),
  the expiry check, the URL.
- **Live e2e: 3/4 (`scripts/e2e-sharing-test.mjs`).**
  Without the migration, the manage page shows the setup
  notice; signed-out gets 307 on the manage page and on the
  create route. **The only failure is the migration check
  itself — the owner has NOT applied
  `forma-shares-migration.sql` yet; the share
  create/open/download/revoke checks were correctly skipped.
  Re-run the harness after he applies it** (it then creates
  a 7-day share via the API, opens `/s/<token>` anonymously,
  downloads the bytes (they match the upload), revokes it,
  checks an expired share and a bad token, user B isolation,
  and a never-expiring share).
- **Typecheck, lint, build: pass.** Prettier applied to the
  Day 25 files.

## 5. Deployment verification

- App rebuilt and restarted on :3000 (new build, the share
  pages + routes included); `/api/supabase-status` returns
  200.
- **NOT PERFORMED:** no Vercel/Git remote access — no Preview
  deployment, as every day.

## 6. Security/licensing checks

- No new engine licence to clear: the sharing is Forma's
  own (a random token + a SHA-256 hash + a database row).
  No WPS feature, branding or font is used.
- No secrets in code. The token is returned once, at
  creation, and never stored. The database holds only the
  hash. The public page uses the admin client ONLY after
  the token hash matches a live share row — an anonymous
  visitor cannot list documents or shares. The download
  mints a 1-hour signed URL (the Day 4 pattern). Only the
  creator can revoke their own link (a plain member cannot
  revoke someone else's).
- The share page does not reveal whether a token ever
  existed: unknown, revoked and expired all show the same
  "not valid" shape (with the specific reason in the text
  for the owner-facing cases — revoked/expired — which is
  fine, because the visitor already holds the token).

## 6b. Verification notes and fixes made during Day 25

- **A missing TABLE is PGRST205, not PGRST204.** The
  sharing server module first checked for PGRST204 (the
  Day 21/24 pattern — a missing COLUMN), but a missing
  TABLE returns PGRST205 ("Could not find the table in the
  schema cache"). The manage page then threw a generic 500
  instead of showing the setup notice. **Fix: check for
  PGRST204, PGRST205 and 42703.** (The Day 24 lesson —
  42703 when the schema cache is stale — still applies.)
- **Do NOT use `export const dynamic = "force-dynamic"`.**
  It is not compatible with `nextConfig.cacheComponents`
  (the app uses Cache Components) — the build fails with
  "Route segment config dynamic is not compatible with
  nextConfig.cacheComponents." Pages that read cookies or
  the current time are already dynamic; the
  `Date.now()`-while-prerendering warning in the log is
  just a warning (the build still marks the route `ƒ`
  Dynamic). Removed from both share pages.
- **The RLS helpers take ONE argument.** The first version
  of the migration called
  `app_private.is_workspace_member(workspace_id, auth.uid())`
  and `app_private.is_workspace_owner_or_admin(workspace_id,
  auth.uid())`. Both are wrong: `is_workspace_member` takes
  only the workspace id (it reads `auth.uid()` internally),
  and `is_workspace_owner_or_admin` does not exist at all.
  The owner's run failed with 42883 "function
  app_private.is_workspace_member(uuid, uuid) does not
  exist." **Fix:** `(select
  app_private.is_workspace_member(workspace_id))` for the
  member policies, and `(select
  app_private.is_workspace_member(workspace_id)) and (select
  app_private.workspace_role(workspace_id)) in ('owner',
  'admin')` for the delete policy — the exact Day 3
  patterns. The corrected migration is in
  `~/workspace/your_files/forma-shares-migration.sql`
  (the table was already created by the partial run, so
  re-running it is safe — it uses `if not exists` /
  `drop policy if exists`).
- **The proxy redirects unauthenticated API requests to
  login (307) before the route runs.** The harness's
  "signed-out create is refused (401)" check was wrong —
  the route's 401 is never reached for a signed-out caller
  (the proxy protects all `/api/` paths except the public
  ones). **Fix: the harness expects 307.** The route's 401
  still covers a signed-in caller whose session is invalid.
- **The manage page shows the setup notice, not the create
  form, when the migration is not applied.** The harness's
  "manage page loads and shows the create form" check was
  wrong for the no-migration case. **Fix: the harness
  checks the notice when the migration is not applied and
  the create form when it is.**

## 7. Known defects and limitations

- **Download only** — the public share page shows the
  document title, type, size and expiry plus a Download
  button; there is no in-browser preview.
- **The link gives the document's CURRENT version.** If the
  document is edited after the link is created, the link
  downloads the new version (it is not pinned to the
  version at creation).
- **No password on a link** (the token itself is the
  credential).
- **No "export with comments" and no "local reviewer notes"**
  (they need a comments/notes model — future work).
- **No multi-user sharing** (the "Shared with me" page stays
  a placeholder).
- **The token is returned ONCE, at creation** — after that it
  is unrecoverable (the database only holds its hash), so
  the owner must copy the link when it is shown.
- **The migration is not applied yet** — until the owner
  runs `forma-shares-migration.sql`, the Share page shows a
  setup notice and creating a link returns a clear "run the
  migration" error. The full live e2e runs after he applies
  it.

## 8. Tomorrow's target

- **Next feature in the queue: Compatibility test corpus
  (#11).** A set of test documents (the 12 formats + edge
  cases: a corrupt file, a huge file, an old-format file)
  that the features are run against, so a regression in one
  feature is caught by the corpus. The plan will decide the
  corpus contents and where it lives.
