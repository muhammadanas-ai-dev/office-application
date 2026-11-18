# Day 05 — Handoff

- Date: 2026-11-17
- Version label: day-05
- Branch: day-05-editor
- Commit SHA: 2582a6d
- Vercel Preview URL: NOT PERFORMED — no Vercel/Git remote access
- Production URL (only if promoted): none
- Office engine version/edition: ONLYOFFICE Docs 10.0.0 Community
  (AGPLv3), installed locally from the DEB package
  (onlyoffice-documentserver 10.0.0-169) — see §1 and §5.

## 1. What was researched

- WPS platform/build/plan: none — Day 5 is editor work. The owner's
  position (received 2026-11-17 22:46 PKT): he knows the licence and
  says don't worry — Forma takes inspiration from WPS features and
  builds a better version, NOT a clone of WPS (clean-room,
  inspiration-only; no WPS code, logos, templates or pixel-exact
  screens). Recorded in ADR-001.
- Source URLs:
  - https://helpcenter.onlyoffice.com/docs/installation/community/docker/installing/install
    ("Installing ONLYOFFICE Docs on a local server using Docker") —
    the old `.aspx` URL 404s; the Help Center restructured. Current
    version 10.0.0 (12 Oct 2026); Docker requirements dual-core
    2 GHz, 4 GB RAM, 40 GB disk, 4 GB swap; JWT enabled by default
    in 10.0, secret set with `-e JWT_SECRET=...`.
  - https://helpcenter.onlyoffice.com/docs/installation/community/changelog
    (version 10.0.0) and https://github.com/ONLYOFFICE/DocumentServer
    (licence: GNU AGPL v3).
  - https://api.onlyoffice.com/docs/docs-api/usage-api/config
    (DocEditor config reference: document, documentType, token,
    editorConfig.callbackUrl).
- Research skill used: browser verification (read-only) for the
  install page + version/licence; search for the Docker
  requirements.
- What was directly observed:
  - The Day 3, Day 4 and Day 5 migrations are STILL NOT applied to
    the live project (re-verified 2026-11-17 22:46 PKT with a real
    REST query — all tables return PGRST205). The user has not
    applied them yet. This is the one thing standing between the
    integration code and a live sign-up/upload/edit.
  - Docker on this VM: `docker.io` installed, but the daemon needs
    `--iptables=false --bridge=none` (no NET_ADMIN for the NAT
    chain), overlayfs extraction fails on this filesystem (vfs is
    the fallback), and the egress proxy cuts large downloads from
    registry-1.docker.io (TLS handshake timeouts and EOFs across
    three pull attempts of `onlyoffice/documentserver:10.0.0`).
    Small requests to the registry work (curl 401 in 0.6s); large
    layer downloads do not survive.
  - The DEB install works instead: `download.onlyoffice.com` is
    reachable through the proxy, and `onlyoffice-documentserver`
    10.0.0-169 installed from the official apt repo. Two problems
    on the way: the GPG keyring needed `chmod 644` before apt
    trusted it, and `ttf-mscorefonts-installer` fails (SourceForge
    mirrors drop some font downloads, so its postinst errors) —
    the document server was configured with
    `dpkg --configure --force-depends`, and the editor works
    without the MS core fonts (it falls back to metric-compatible
    fonts). The fonts package stays half-configured (`iF`).
  - The DEB's nginx listens on port **8083** by default (not 80);
    the stock nginx default site still answers port 80 with the
    welcome page (harmless). The services (`ds-docservice`,
    `ds-converter`, `ds-example`, `nginx`) were started manually
    because systemd service starts are denied by policy-rc.d;
    they do NOT survive a VM restart. Healthcheck
    `http://localhost:8083/healthcheck` returns `true`.
  - This VM has ~600–900 MB RAM available; the official requirement
    is 4 GB. The server runs and answers, but opening a large or
    complex document may OOM — the Day 5 proof uses a tiny file.
- What remains unverified: Vercel Preview/Production environment
  separation (no access); Supabase Auth URL Configuration (Site URL
  + redirect allowlist) — check in the dashboard before the first
  real sign-up.

## 2. Completed functionality

| Feature | Status | Evidence/test ID | Notes |
|---|---|---|---|
| Editor page /editor/[id] | done (UI) | Build passes; signed-out → 307 to sign-in | Needs migrations + running doc server to open a file |
| Signed DocEditor config | done | Unit tests (JWT round-trip) | Random 20-hex key, 1-hour JWT + file token |
| Controlled file fetch | done | Live: bad token → 403, no token → 403 | HMAC token; proxy exempted (was 307 — see §6b) |
| Save callback | done | Live: no token → 401, tampered JWT → 401, unknown key → 403, status-1 → 200 | Status-2 save → new version; duplicate delivery acked |
| editor_sessions table | written, NOT applied | Local RLS 18/18 (T18) | Admin-only; RLS no policies + privileges revoked |
| "Open in editor" links | done | Library DocumentActions | Only for files the editor can open |
| Document server (local) | installed + running | healthcheck `true`; api.js 200; example app 200 | DEB 10.0.0-169; started manually; no restart persistence |
| DOCX round-trip proof | engine proven, browser UI open | ConvertService.ashx DOCX→PDF (see §4) | The editor UI round-trip (type → save → reopen) is NOT proven: no browser on this VM can reach the local servers — see §6b |

## 3. Code and data changes

- Pages: src/app/(workspace)/editor/[id]/page.tsx (new),
  src/components/editor/editor-client.tsx (new, loads api.js and
  instantiates DocsAPI.DocEditor).
- Services: src/lib/editor.ts (pure helpers — tokens, format
  mapping, DOCX magic bytes), src/lib/editor.server.ts (secret
  getters only), src/features/editor/config.ts (signed config +
  session minting/lookup).
- Routes: src/app/api/editor/file/[id]/route.ts (HMAC-gated file
  fetch), src/app/api/editor/callback/route.ts (JWT-verified save
  callback → new version).
- Proxy: src/lib/supabase/proxy.ts — /api/editor/file and
  /api/editor/callback exempt from the session redirect (they
  authenticate with their own tokens); /editor added to the
  protected prefixes.
- Library: DocumentActions gains an `openHref` prop; DocumentTable
  passes `/editor/[id]` for files the editor can open.
- Types: database.types.ts gains editor_sessions.
- Supabase migrations/RLS: Day 5 migration
  (20261117030000_forma_editor_sessions.sql) — editor_sessions,
  RLS enabled, no policies, privileges revoked from anon /
  authenticated. NOT applied to the live project.
- Environment variable names added (never values):
  ONLYOFFICE_DOCSERVER_URL (now http://localhost:8083),
  ONLYOFFICE_JWT_SECRET (synced to the doc server's generated
  secret), EDITOR_FILE_TOKEN_SECRET, EDITOR_PUBLIC_URL
  (http://localhost:3000).
- Dependencies: jose@6.2.17 (JWT sign/verify).
- Infrastructure (this VM only, not in the repo): docker.io
  installed; ONLYOFFICE apt repo added; onlyoffice-documentserver
  10.0.0-169 installed; nginx + ds-docservice + ds-converter +
  ds-example started manually. None of this survives a VM restart.

## 4. Tests

- Lint: 0 errors, 0 warnings.
- Typecheck: `tsc --noEmit` pass.
- Unit: 52 passed / 0 failed (9 files) — file tokens, document
  keys, format mapping, DOCX magic bytes, ONLYOFFICE JWT contract.
- Integration: local RLS 18/18 pass (see §2); live RLS test
  (`npm run test:live`, gated on FORMA_LIVE_DB=1) extended with
  Day 4 cases — not run (migrations not applied).
- E2E: none (no Playwright suite yet — Day 14).
- Build: pass (routes confirmed: /editor/[id],
  /api/editor/callback, /api/editor/file/[id]).
- Preview smoke tests: local smoke test pass — / 200, /auth/login
  200, workspace routes 307 to /auth/login?next=…, editor page
  signed out 307, file route bad/no token 403, callback no token
  401, valid-JWT unknown-key 403, tampered JWT 401, valid-JWT
  status-1 200.
- DOCX round-trip (open → edit → save → reopen):
  - ENGINE PROVEN 2026-11-17 23:31 PKT: a minimal DOCX built by
    hand ("Forma Office Day 5 proof - engine test." + a second
    line) was converted by the running document server via
    ConvertService.ashx (JWT-signed) to PDF — 200, 100%,
    EndConvert True — and `pdftotext` on the result returns both
    lines exactly. PDF metadata: Creator/Producer
    ONLYOFFICE/10.0.0.169. So the engine reads, renders and
    writes documents correctly on this VM.
  - BROWSER EDITOR UI NOT PROVEN: the open → type → save → reopen
    flow in a real browser could not be run (see §6b). The Forma-app
    path (sign in → open → edit → new version) additionally cannot
    be proven until the three migrations are applied.

## 5. Deployment verification

- Preview deployment result: NOT PERFORMED — no Vercel/Git remote access.
- Health endpoint: /api/supabase-status reachable locally.
- Document server: http://localhost:8083/healthcheck → `true`;
  api.js loads (200); example app http://localhost:8081/ loads (200).
- Browser console/network result: no browser proof — see §6b.
- Document engine: DOCX→PDF conversion proven live (see §4).
- Main workflow result: no live sign-up, upload or edit yet
  (migrations pending).

## 6. Security/licensing checks

- RLS and Storage access: editor_sessions is admin-only (local
  verification T18); the callback re-checks workspace membership
  and the document's workspace before saving; the file route
  verifies the HMAC token before reading any byte.
- Editor JWT/callback: JWT verified on every callback (401 on
  missing/tampered token); the verified payload — never the raw
  body — is used; saved files are validated (size ≤ 50 MB, DOCX
  magic bytes) before storage.
- Secrets: ONLYOFFICE_JWT_SECRET in .env.local matches the doc
  server's generated secret (synced by script, never printed);
  .env.local still gitignored. Rotation of keys pasted in chat
  earlier is still unconfirmed.
- File handling: saved files go to private Storage as new
  immutable versions; the callback's `url` is JWT-verified but
  its host is not allow-listed (see Known gaps in
  docs/architecture/editor-integration.md).
- License status: ONLYOFFICE Docs 10.0.0 Community, GNU AGPLv3 —
  verified from the official changelog and GitHub repo. Owner
  decision recorded (ADR-001): proceed with Community evaluation;
  WPS inspiration-only, not a clone. A proprietary commercial
  launch still needs the Developer licence + legal review before
  the Day 5 integration is promoted to a closed-source SaaS.

## 6b. Verification notes and fixes made during Day 5

- The first live gate tests hit a STALE server: the Day 4
  `next-server` was still running on port 3000 (the Day 4 smoke
  test's pkill had missed it), so the new Day 5 server failed to
  start with EADDRINUSE and the curls tested the old build
  (307s and a 404 for /editor). Fixed by killing the old server
  by PID (never `pkill -f` with a pattern that matches the
  exec command's own command line — that killed my own shell
  twice during Day 5).
- The proxy redirected the document server's file/callback
  requests to sign-in (307). Fixed: the editor endpoints are
  exempt from the session check (their own token auth), and
  /editor joined the protected prefixes.
- `server-only` threw in the test environment (jsdom realm), so
  the pure editor helpers moved to `src/lib/editor.ts` and only
  the secret getters remain in `src/lib/editor.server.ts`.
- jose + TextEncoder also fail under jsdom (Uint8Array realm
  mismatch), so `src/lib/editor.test.ts` runs with
  `@vitest-environment node`. Production runs in Node — the live
  callback tests prove it works there.
- The editor page used `actionLabel`/`actionHref` props the
  EmptyState component does not have; it now passes `icon` and an
  `action` node.
- The Docker pull failed three times (TLS timeouts, EOFs) — the
  egress proxy cuts large downloads from registry-1.docker.io.
  The DEB install was the fallback that worked.
- The fonts installer (`ttf-mscorefonts-installer`) fails on
  SourceForge mirror drops; the document server was configured
  with `dpkg --configure --force-depends` and works without the
  MS core fonts.
- The DEB's nginx listens on port 8083 by default, not 80 — the
  docserver URL in .env.local is http://localhost:8083.
- Browser proof — why the editor UI round-trip is unproven
  (2026-11-17 23:10–23:45 PKT, all attempts documented so the next
  session does not repeat them):
  - The cloud browser runs in a separate VM and rejects every
    loopback address (localhost:8081/8083, 127.0.0.1) before any
    page loads. There is no LAN address it can use, and the user
    taking over that browser would not help either (its localhost
    is its own machine, not this VM). That task was stopped.
  - The Chromium on this VM (/opt/meta-chromium/chrome) CAN run
    headless via CDP (it needs a WebGL domain-policy file + SHA-256
    switches; the all-origins file works), but Chrome 157's Local
    Network Access checks block every navigation to localhost with
    ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS — including a
    startup URL and a redirect from a chrome:// page (which is
    itself blocked by ERR_BLOCKED_BY_ADMINISTRATOR). Tried and
    failed: --disable-features=LocalNetworkAccessChecks, the
    LocalNetworkAccessAllowedForUrls managed policy (both policy
    paths), and a CDP Browser.grantPermissions localNetworkAccess
    grant (accepted but does not cover navigations).
  - A public tunnel was the next idea: cloudflared downloaded
    fine, but its quick-tunnel request fails — the egress proxy
    answers the TLS handshake with non-TLS bytes, so
    api.trycloudflare.com is unreachable from this VM.
  - Two real fixes found along the way (both applied, both in
    VM-level config, not the repo): the example app's `siteUrl`
    MUST be the docserver URL (http://localhost:8083/) — without
    it the editor page renders a broken api.js URL and falls back
    to view-only mode; with it, apiUrl, edit mode and
    permissions.edit are all correct. The example's port was moved
    to 8081 because the docserver's nginx expects the example on
    port 3000, which the Forma app already uses.
  - What would prove the UI round-trip: a real browser on a
    machine that can reach the docserver (a persistent host with
    a public address, or the user's own machine once the app is
    deployed there), plus the three migrations applied.

## 7. Known defects and limitations

- All three migrations not applied — the one thing standing
  between this code and a working sign-up/upload/edit. Apply Day
  3, then Day 4, then Day 5, in the dashboard SQL Editor, then
  run `npm run test:live`. The Day 5 migration references the Day
  3/4 tables.
- The document server runs on this VM only, started manually
  (nginx + ds-docservice + ds-converter + ds-example), and does
  NOT survive a VM restart. To restart it: reload nginx, then
  start the three services as user `ds` with the env from their
  systemd units (see §1). A real deployment needs a persistent
  host with 4 GB RAM (this VM has ~600–900 MB available).
- The callback's `url` host is not allow-listed (see §6).
- `src/lib/supabase/middleware.ts` (shadcn reference) intentionally
  untouched; the active session refresh + protection is
  `src/lib/supabase/proxy.ts`.
- See docs/known-limitations.md for the full list.

## 8. Tomorrow's target

- Highest-priority feature: Day 6 — document versioning / version
  history UI (per ROADMAP_15_DAYS.md), built on the versions the
  callback already creates. BUT first: the owner applies the
  three migrations (dashboard SQL Editor, ~2 minutes each) and the
  document server is confirmed still running after any VM restart
  (restart it manually if needed), so the Forma-app round-trip
  (sign in → open → edit → new version) can be proven live.
- Acceptance criteria: a DOCX opened in the Forma editor, edited,
  saved, and reopened showing the edits as a new version; a
  tampered callback and a cross-user save are rejected.
- Dependencies/blockers: the migration application is the owner's
  step; a persistent document-server host (4 GB RAM) is the
  owner's decision for anything beyond this evaluation.
