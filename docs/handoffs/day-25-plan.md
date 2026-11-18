# Day 25 plan — Single-user sharing (shareable links)

Owner instruction (2026-11-18 18:04 PKT): "okay go head
implement this properly by using feature loop.md i run the
query" — build audit queue item 10
(`docs/project-brief/FEATURE_AUDIT.md` §16): Sharing
(single-user, local). The owner also confirmed he ran the
Day 24 preferences migration — the Day 24 harness was
re-run first (14/14, see the Day 24 handoff §4).

## 1. Research

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
    for workspace members (the owner manages their own
    document's links); the PUBLIC share page reads via the
    SERVICE ROLE (admin client) by token hash — the token
    itself is the credential, so no user session is needed.
    **The public read must NOT use the user client (RLS
    would block an anonymous visitor).** It uses the admin
    client, but ONLY after the token hash matches a row —
    the token is the authorization.
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
  document (a small form on the document page, or a section
  on the document's page): create a link (pick the expiry),
  see the link (copy it), and revoke it. The links are
  listed with their expiry and a Revoke button. **Where:**
  a "Share" section on the document's versions page is the
  wrong home; the library's DocumentActions gets a "Share"
  link to a new page `/documents/[id]/share` (server: the
  document + its active links via the user client; client:
  the create form + the list + revoke buttons). This keeps
  the library list clean and the share UI in one place.
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

## 2. Small tasks (in order)

1. **Verify the mechanism (proof of concept).** The script
   `scripts/prove-sharing.mjs` (in the project dir — keep
   it until the commit, then delete): create a test user +
   workspace + document (upload pdf1.pdf), create a share
   row (token hash, 7-day expiry) via the admin client,
   open `/s/<token>` as an anonymous visitor (the page
   shows the document title + a Download button), download
   via `/s/<token>/download` (the bytes match the upload),
   revoke the share (set `revoked_at`), and confirm the
   page + download now refuse it; confirm an expired share
   (expires_at in the past) is refused; confirm a bad token
   is refused. *Test: the script prints PASS for every
   check.*
2. **Pure module + unit tests.** `src/lib/sharing.ts`:
   `newShareToken()` (32 hex chars from
   `crypto.randomBytes(16)`), `hashShareToken(token)`
   (SHA-256 hex), `isShareExpired(expiresAt, now)` (null
   expiry = never), `getShareUrl(token)` (`/s/<token>`),
   `SHARE_EXPIRIES` (the four choices: 1 day, 7 days,
   30 days, never — with labels), `expiresAtForChoice(choice,
   now)` (the expiry timestamp, or null for never).
   Tests in `src/lib/sharing.test.ts`: the token format
   (32 hex, unique), the hash (deterministic, 64 hex, the
   token itself is not the hash), the expiry (null = never,
   past = expired, future = not), the choices.
   *Test: the new unit tests pass.*
3. **Migration + server module + routes.** Migration
   `supabase/migrations/20261118090000_forma_shares.sql` +
   the copy in `~/workspace/your_files/` (the owner applies
   it — the Day 21/24 pattern). Server module
   `src/lib/sharing.server.ts` (`import "server-only"`):
   `createShare(userClient, documentId, expiresAt, userId)`
   (loads the document via the user client (RLS) → 404 if
   missing; inserts the share row; returns `{token, url,
   expiresAt}` — the token is returned ONCE, at creation;
   the database only ever holds the hash),
   `listShares(userClient, documentId)` (the active +
   revoked links, newest first),
   `revokeShare(userClient, documentId, shareId, userId)`
   (sets `revoked_at`), `resolveShare(token)` (the PUBLIC
   lookup: hash the token, admin client, the share row +
   the document's current file; returns the document or a
   reason: not-found / revoked / expired).
   Routes: `POST /api/documents/[id]/shares` (create —
   Zod: the expiry choice; returns `{ok, share: {id, url,
   expiresAt}}`), `GET /api/documents/[id]/shares` (list),
   `POST /api/documents/[id]/shares/[shareId]/revoke`,
   `GET /s/[token]/download` (public — the signed-URL
   redirect, the Day 4 pattern).
   *Test: the unit tests + the live e2e.*
4. **The share page + the manage UI.** Page `/s/[token]`
   (a PUBLIC route, outside the workspace layout — no
   sign-in, no sidebar): server loads the share via
   `resolveShare`; if valid, shows the document title, type,
   size, expiry, and a Download link; if not, shows a
   plain "This link is not valid / has expired / was
   revoked." message. Page `/documents/[id]/share` (the
   manage UI, workspace layout): server loads the document
   + its links; client `src/components/sharing/
   sharing-client.tsx` (the create form — an expiry select
   + a Create button; the list — each link with its URL
   (copyable), expiry, and a Revoke button). The library
   gets a "Share" link (`shareHref` prop in DocumentActions,
   shown for every document with a file).
   *Test: the live e2e checks the pages.*
5. **Live e2e harness.** `scripts/e2e-sharing-test.mjs`
   (focused, the Day 13–24 pattern — the session cookie
   holds the session as a JSON OBJECT, not an array, the
   Day 24 lesson): as user A, upload a PDF; create a share
   (7-day expiry) via the API (200, a URL is returned);
   open `/s/<token>` anonymously (200, the title + Download
   are shown); download via `/s/<token>/download` (200 via
   the signed URL, the bytes match the upload); revoke the
   share (200); the page + download now refuse it; an
   expired share (create with a 1-day expiry then set
   expires_at in the past via the admin client) is refused;
   a bad token is refused; user B cannot create/list/revoke
   A's shares (404); signed-out gets 307 on the manage
   page and the create route. **If the migration is not
   applied, the harness reports it clearly and only runs
   the checks that do not need it** (the Day 21/24
   pattern).
   *Test: the harness passes end to end (after the
   migration).*
6. **Checks + docs + commit.** Typecheck, lint, Prettier,
   build, restart the app. Update `WPS_LEVEL_PLAN.md` (the
   sharing row → Done), `feature-matrix.csv` (FORMA-034),
   `known-limitations.md` (the sharing limits),
   `CHANGELOG.md` (Day 25 entry), `FEATURE_AUDIT.md` (§16
   item 10 → Done — the link half; the comments/notes half
   is noted as future work), `docs/handoffs/day-25.md`.
   Commit on branch `day-25-sharing`. Update `~/MEMORY.md`.
   Reply to the owner (including the migration step).

## 3. What is NOT in this feature

- No multi-user sharing (the "Shared with me" page stays a
  placeholder; no roles, no co-editing, no invitations).
- No in-browser preview on the share page (download only in
  v1).
- No "export with comments" and no "local reviewer notes"
  (separate sub-features of item 10 — they need a
  comments/notes model; noted as future work).
- No password on a share link (the token itself is the
  credential; a password is a separate feature).
- No change to the editor, the upload flow, or the other PDF
  tools. No WPS feature, branding or font is used; the
  implementation is Forma's own (a random token + a SHA-256
  hash + a database row).
