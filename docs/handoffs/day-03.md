# Day 03 — Handoff

- Date: 2026-11-17
- Version label: day-03
- Branch: day-03-auth-schema
- Commit SHA: 9c64884 (Day 3 code) + d1651a8 (RLS grant corrections after local verification)
- Vercel Preview URL: NOT PERFORMED — no Vercel/Git remote access
- Production URL (only if promoted): none
- Office engine version/edition: none deployed

## 1. What was researched

- WPS platform/build/plan: none — Day 3 is auth/schema work, no WPS
  research needed. Day 1 inventory still stands.
- Source URLs:
  - https://supabase.com/docs/guides/auth/server-side/creating-a-client.md?framework=nextjs
    (current SSR guide, crawled 2026-11-16) — confirms the existing
    browser/server client + proxy/getClaims pattern; adds that
    redirect responses must carry the refreshed cookies and cache
    headers, and that getSession() must never be trusted in server
    code.
  - Supabase skill: changelog + security checklist (TO-clause
    policies, no auth.role(), UPDATE needs USING + WITH CHECK,
    SECURITY DEFINER helpers only in a private schema with an
    auth.uid() check, revoke EXECUTE from app roles).
  - supabase-postgres-best-practices rules read: security-rls-basics,
    security-rls-performance, security-privileges,
    schema-foreign-key-indexes, schema-primary-keys.
- Research skill used: none (docs fetched directly per the supabase
  skill's method 2).
- What was directly observed: Next.js 16.4.6 `ResponseCookies` has NO
  `setAll` method (the Supabase docs snippet uses it) — cookies are
  copied one by one with `set(cookie)` in the proxy. Direct Postgres
  is definitively blocked from this VM: the egress policy answers the
  Postgres TLS handshake with a plain-text proxy message
  ("muse: Database c…"), proven with a raw SSLRequest probe.
- What remains unverified: Vercel Preview/Production environment
  separation (no access); Supabase Auth URL Configuration (Site URL
  + redirect allowlist) — check in the dashboard before the first
  real sign-up.

## 2. Completed functionality

| Feature | Status | Evidence/test ID | Notes |
|---|---|---|---|
| Sign up / sign in / sign out | done (UI) | Local smoke test: /auth/login, /auth/signup 200 | Needs migration applied to work live |
| Password reset + new password | done (UI) | /auth/reset-password, /auth/update-password 200 | Reset link goes via /auth/callback |
| Email callback + provisioning | done | /auth/callback route; ensureProfileAndWorkspace | Idempotent; admin client (service_role) |
| Route protection | done | /home /files /settings /plan → 307 to /auth/login?next=… | Proxy getClaims(); cookies+headers copied |
| Profile settings | done (UI) | Settings page renders profile form | RLS-protected update; needs migration live |
| Migration (schema + RLS) | written, NOT applied | File: supabase/migrations/20261117010000_forma_auth_workspace.sql | Apply via dashboard SQL Editor |
| RLS verification (local) | done — 10/10 checks pass | scripts/verify-rls-local.sh (Postgres 16 local) | See correction note below |
| RLS verification (live) | pending | npm run test:live | Needs migration applied |
| Unit/component tests | done | 5 files, 22 tests, all passing | Roles, schemas, env, empty-state, placeholder |

## 3. Code and data changes

- Pages/components: src/app/auth/ (layout, login, signup,
  reset-password, update-password), src/app/auth/callback/route.ts,
  src/components/auth/ (auth-ui, login-form, signup-form,
  reset-password-form, update-password-form, profile-form),
  src/components/layout/user-menu.tsx; AppShell header now shows the
  user menu; landing page Sign in is a real link.
- Services: src/features/auth/ (actions.ts, provision.ts, roles.ts,
  schemas.ts); src/lib/supabase/proxy.ts rewritten with protection;
  server.ts/client.ts/admin.ts typed with the Database generic.
- Supabase migrations/RLS: one migration file (see above) — profiles,
  workspaces, workspace_members, app_private helpers
  (is_workspace_member, workspace_role, set_updated_at), RLS
  policies, grants. No trigger on auth.users by design.
- Storage policy changes: none.
- Environment variable names added (never values): none.
- Dependencies: dotenv (dev) for the live RLS test; new script
  `test:live` (FORMA_LIVE_DB=1).

## 4. Tests

- Lint: 0 errors, 0 warnings.
- Typecheck: `tsc --noEmit` pass.
- Unit: 22 passed / 0 failed (5 files).
- Integration: live RLS test written, gated on FORMA_LIVE_DB=1 —
  not run (migration not applied).
- E2E: none (no Playwright suite yet — Day 14).
- Build: pass (auth routes present at /auth/*).
- Preview smoke tests: local smoke test pass — / 200, all four auth
  pages 200 with correct copy, /home /files /settings /plan 307 to
  /auth/login?next=…, /api/supabase-status reachable:true.

## 5. Deployment verification

- Preview deployment result: NOT PERFORMED — no Vercel/Git remote access.
- Health endpoint: /api/supabase-status reachable locally.
- Browser console/network result: not checked (no deployed URL).
- Main workflow result: no live sign-up yet (migration pending).

## 6. Security/licensing checks

- RLS and Storage access: RLS written per the supabase security
  checklist; verification pending (see §2). Storage lands Day 4.
- Editor JWT/callback: not yet implemented (Day 5, gated).
- Secrets: no new secrets; .env.local still gitignored; client
  bundle scan from Day 2 still applies (publishable key only).
  Rotation of keys pasted in chat earlier is still unconfirmed.
- File handling: none yet.
- License status: unchanged from Day 1 (ADR-001); commercial launch
  BLOCKED pending owner decision.

## 6b. Local RLS verification — correction found and fixed

The first local run FAILED at T2: `permission denied for function
is_workspace_member`. Cause: the migration revoked EXECUTE on the
membership helpers from `authenticated` (following the
supabase-postgres-best-practices reference example). On Postgres 16,
RLS policies evaluate helper functions as the querying user, so that
revoke breaks every workspace/member policy. Fix: EXECUTE stays
granted to `authenticated`; only `anon` is revoked. A second failure
followed at T9 (`permission denied for schema app_private`):
`authenticated` also needs USAGE on the `app_private` schema. Both
fixes are in the migration now, and the protection is the
non-exposed schema (the Data API cannot reach `app_private`) plus
the `auth.uid()` check inside each helper body. This was caught
before the migration was applied anywhere — the file to paste into
the dashboard is the corrected one. Full run after the fix: T1–T10
all pass (own-profile visibility, cross-user invisibility,
cross-workspace insert/update/delete denial, owner positive control,
editor limits, helper caller-only answers, anon denial, owner-row
guard). A T9 test bug was also fixed (user B had legitimately become
an editor in T6, so the outsider in T9 is user C).

## 7. Known defects and limitations

- Migration not applied — the one thing standing between this code
  and a working sign-up. See docs/architecture/schema-and-rls.md
  for the exact dashboard steps.
- `react-hook-form` (installed Day 2) was not used for the auth
  forms; server actions + useActionState fit the current Next.js
  pattern better. It stays installed for Day 4+ forms.
- Owner demotion by another admin is not yet guarded; owner transfer
  is a Day 10 feature. Two concurrent first sign-ins could create
  two personal workspaces (dedupe is a Day 4 cleanup).
- `src/lib/supabase/middleware.ts` (shadcn reference) intentionally
  untouched; the active session refresh + protection is
  `src/lib/supabase/proxy.ts`.
- See docs/known-limitations.md for the full list.

## 8. Tomorrow's target

- Highest-priority feature: Day 4 — document library, folders,
  private Storage. BUT first: apply the Day 3 migration and run
  `npm run test:live` so auth is proven live before building on it.
- Acceptance criteria: two independent accounts can sign up/in and
  each sees only their own workspace; cross-workspace reads/writes
  denied (live test green); library lists, creates, renames, moves
  and deletes folders/documents with RLS + Storage policies.
- Dependencies/blockers: Owner decisions needed before Day 5 (not
  Day 4): ONLYOFFICE licence route and document-server hosting.
  The Day 3 migration application is the owner's step (dashboard
  SQL Editor, ~2 minutes) or a scoped PAT for CLI use.
