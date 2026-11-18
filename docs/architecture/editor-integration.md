# Editor Integration — Day 5

Engine: ONLYOFFICE Docs **10.0.0** Community Edition (GNU AGPLv3),
verified 2026-11-17 from the official changelog and the
ONLYOFFICE/DocumentServer repository. Official Docker install page:
https://helpcenter.onlyoffice.com/docs/installation/community/docker/installing/install
(the old `.aspx` URL is dead — the Help Center restructured).
Editor config reference:
https://api.onlyoffice.com/docs/docs-api/usage-api/config.
Requirements per the official page: dual-core 2 GHz, 4 GB RAM,
40 GB disk, 4 GB swap; JWT is enabled by default in 10.0.

## How it fits together

```
Browser ── loads api.js from ──► Document server (ONLYOFFICE Docs)
   │                                   │
   │ opens /editor/[id]                │ fetches the file
   ▼                                   ▼
Forma app ── signed config ──► /api/editor/file/[id]?t=<HMAC token>
   │                                   │
   │ saves come back as                │ POSTs the saved file
   ▼                                   ▼
/api/editor/callback ◄── JWT ── document server (status 2)
   │
   ▼
new immutable version in private Storage + documents row updated
```

## Config (`src/features/editor/config.ts`)

`buildEditorConfig(document, user)` mints a signed DocEditor config:

- A random 20-hex-character document key (`newDocumentKey`), recorded
  in `editor_sessions` with the document, workspace, user and version.
  The key reveals nothing and cannot be guessed; the callback maps it
  back. A new key is minted per page load (per editing session).
- The file URL points at `/api/editor/file/[id]` with a short-lived
  HMAC token (`signFileToken`, 1-hour expiry, one document version).
- The callback URL is `/api/editor/callback`.
- The whole config is signed as a JWT (HS256, `ONLYOFFICE_JWT_SECRET`,
  1-hour expiry) and passed to DocEditor as `token`.
- Mode is `edit` for Word formats (DOCX/DOC/ODT/TXT) and `view` for PDF.

## Controlled file fetch (`/api/editor/file/[id]`)

The document server has no user session, so the HMAC token is the
authorization: shape, timing-safe signature, expiry and the
document-id/version match are all verified before any byte is read.
The file is then streamed from private Storage via the admin client.
A token for another document, an expired token or a bad signature
gets 403. The proxy exempts this route from the session redirect —
otherwise the document server would receive a login page instead of
the file (this was caught by the Day 5 gate tests: the route first
returned 307).

## Save callback (`/api/editor/callback`)

The ONLYOFFICE JWT is the only authorization. The token
(`Authorization: Bearer`, or the `token` field in the body) is
verified first with `ONLYOFFICE_JWT_SECRET`, and the VERIFIED
payload — never the raw body — is used as the callback data. No
token or a bad signature gets 401 before anything is read or written.

- Status 1 (editing), 4 (closed without changes) and 6 (save error
  on the document-server side): acknowledged with `{"error": 0}`,
  nothing stored.
- Status 2 (ready to save): the key is mapped back through
  `editor_sessions`; the session must exist and not be expired; the
  user's workspace membership is re-checked; the document must be in
  the same workspace and at the session's version (a document
  version past the session version means a duplicate delivery, which
  is acknowledged without writing twice). The saved file is
  downloaded from the document server's URL (http/https only),
  validated (non-empty, ≤ 50 MB, DOCX magic bytes `PK\x03\x04`),
  uploaded to private Storage as version n+1, a `document_versions`
  row is inserted, the `documents` row is updated (guarded on the
  old version), and the session's version is advanced so further
  edits in the same editing session keep working.

## Sessions (`editor_sessions`)

Migration `20261117030000_forma_editor_sessions.sql`: key (PK),
document/workspace/user, version, expires_at (1 hour). RLS is
enabled with NO policies and all privileges revoked from `anon` /
`authenticated` — only the admin client reads/writes it. Local RLS
verification T18 proves an authenticated user can neither read nor
insert a session row.

## Editor page (`/editor/[id]`)

Server component: the document is loaded through the signed-in
user's client (RLS decides access) before any config is built. If
the document server URL is not configured, or the file cannot be
opened, the page says so honestly — it never shows a fake editor.
The client component loads the document server's `api.js` and
instantiates `DocsAPI.DocEditor`; a script load failure or a start
failure shows an error, never a text box.

## Secrets

- `ONLYOFFICE_DOCSERVER_URL` — public (the browser loads JS from it).
- `ONLYOFFICE_JWT_SECRET` — server-only; shared with the document
  server (config token + callback). Generated on Day 5 and stored in
  `.env.local`; the document server must be started with the same
  value (Docker `-e JWT_SECRET=...`, DEB `local.json`).
- `EDITOR_FILE_TOKEN_SECRET` — server-only; HMAC for file tokens.
- `EDITOR_PUBLIC_URL` — the URL the document server uses to reach
  this app (file + callback URLs). For a local Docker document
  server it is `http://host.docker.internal:3000`; for a local DEB
  server on the same host it is `http://localhost:3000`.

## Verification (Day 5)

- Unit tests: 9 files, 52 tests — file-token sign/verify
  (round-trip, tampered, wrong secret, expired, malformed),
  document-key shape, format mapping, DOCX magic bytes, ONLYOFFICE
  JWT sign/verify (tampered + wrong secret rejected).
- Local RLS verification: 18/18 checks on Postgres 16 (T18 covers
  editor_sessions).
- Live route-gate tests against the running app (2026-11-17):
  file route with a bad token → 403 `{"error":"Malformed token"}`;
  file route with no token → 403; callback with no token → 401
  `{"error":1}`; callback with a valid JWT but an unknown key →
  403; callback with a tampered JWT → 401; callback with a valid
  JWT and status 1 → 200 `{"error":0}`. Editor page signed out →
  307 to sign-in.
- NOT proven yet: the full round-trip (open → edit → save → new
  version) through the real document server. See the Day 5 handoff
  for the two blockers (migrations not applied; no document server
  running on this VM) and what each needs.

## Known gaps

- The callback trusts the document server's `url` (JWT-verified, so
  only the document server can produce it) and fetches it
  server-side; there is no allow-list on the host. Acceptable for
  the Day 5 proof; a production deployment should restrict the
  callback URL to the document server's host.
- `changesurl` / co-editing history from the callback is not
  consumed (version history UI is Day 9).
- The editor page mints a new session (and a new document key) on
  every load; an already-open editor in another tab keeps its own
  key and version.
- No byte-signature check on uploads (Day 12 hardening) — the
  callback path DOES check DOCX magic bytes.
