# Day 02 — Handoff

- Date: 2026-11-17
- Version label: day-02
- Branch: day-02-app-shell
- Commit SHA: 0d99ee7
- Vercel Preview URL: NOT PERFORMED — no Vercel/Git remote access
- Production URL (only if promoted): none
- Office engine version/edition: none deployed

## 1. What was researched

- WPS platform/build/plan: none — Day 2 is foundation work, no WPS
  research needed. Day 1 inventory still stands.
- Source URLs: none new.
- Research skill used: none.
- What was directly observed: TypeScript strict mode already on
  (tsconfig `strict: true`); Tailwind v4 + shadcn/ui + Lucide already
  installed; no test runner, typecheck or format script existed.
- What remains unverified: Vercel Preview/Production environment
  separation (no access).

## 2. Completed functionality

| Feature | Status | Evidence/test ID | Notes |
|---|---|---|---|
| App shell + navigation | done | Local smoke test, 9 routes 200 | Sidebar, header, mobile drawer; no dead nav |
| Placeholder pages | done | /home /recent /files /shared /starred /templates /trash /settings /plan | Each states its roadmap day |
| Loading/error/not-found | done | loading.tsx, error.tsx, not-found.tsx (root + workspace) | 404 verified returning 404 |
| Env validation | done | src/lib/env.test.ts (8 tests) | Zod; names only in errors, never values |
| Server-only boundaries | done | admin.ts, db.ts import server-only | Client bundle scan: no sb_secret_ literal |
| Unit/component tests | done | 3 files, 11 tests, all passing | Vitest + Testing Library + jsdom |
| Scripts + format | done | typecheck, test, format, format:check | Prettier config added |

## 3. Code and data changes

- Pages/components: src/app/page.tsx (FormaLogo, real /home /files
  /templates links), src/app/(workspace)/ (layout + 9 pages),
  src/components/brand/forma-logo.tsx,
  src/components/layout/app-shell.tsx,
  src/components/ui/empty-state.tsx, skeleton.tsx,
  src/components/workspace/workspace-placeholder.tsx.
- Services/API routes: none changed.
- Supabase migrations/RLS: none — no tables yet (Day 3–4).
- Storage policy changes: none.
- Environment variable names added (never values):
  NEXT_PUBLIC_APP_URL (added to .env.example).
- Dependencies: zod, react-hook-form, server-only added;
  vitest, @testing-library/react, @testing-library/jest-dom, jsdom,
  prettier added as devDependencies; @types/node ^20 → ^24 (Vitest 5
  requires @types/node ^22 or >=24; Node here is v24).

## 4. Tests

- Lint: 0 errors, 0 warnings.
- Typecheck: `tsc --noEmit` pass.
- Unit: 11 passed / 0 failed (3 files).
- Integration: none.
- E2E: none (no Playwright suite yet — Day 14).
- Build: pass (all workspace routes generated).
- Preview smoke tests: local smoke test pass — /, /home, /files,
  /templates, /plan, /recent, /shared, /starred, /trash, /settings
  all 200 with Forma branding and honest placeholder copy;
  /this-page-does-not-exist returns 404 with the not-found page;
  /api/supabase-status reachable:true.

## 5. Deployment verification

- Preview deployment result: NOT PERFORMED — no Vercel/Git remote access.
- Health endpoint: /api/supabase-status reachable locally.
- Browser console/network result: not checked (no deployed URL).
- Main workflow result: no user workflow exists yet beyond the shell.

## 6. Security/licensing checks

- RLS and Storage access: not yet implemented (Day 3–4).
- Editor JWT/callback: not yet implemented (Day 5, gated).
- Secrets: client-bundle scan found no `sb_secret_` literal in
  .next/static; .env.local still gitignored; .env.example holds
  placeholders only. Rotation of keys pasted in chat earlier is
  still unconfirmed.
- File handling: none yet.
- License status: unchanged from Day 1 (ADR-001); commercial launch
  BLOCKED pending owner decision.

## 7. Known defects and limitations

- Workspace pages are placeholders; search/create/sign-in disabled
  (see docs/known-limitations.md).
- Dark mode not supported (light Forma palette only).
- No E2E suite; no Vercel deployment.
- `src/lib/supabase/middleware.ts` (shadcn reference) intentionally
  untouched; active refresh is `src/lib/supabase/proxy.ts`.

## 8. Tomorrow's target

- Highest-priority feature: Day 3 — Supabase Auth, schema and RLS
  (migrations for profiles, workspaces, workspace_members; RLS;
  sign-up/sign-in/sign-out/reset password; cross-user denial tests).
  Use the installed `supabase` and `supabase-postgres-best-practices`
  skills before any schema/RLS/migration work.
- Acceptance criteria: users can sign up/in/out and reach only
  authorized workspace data; no browser code can use service-role
  credentials; RLS tests prove cross-workspace denial.
- Dependencies/blockers: Owner decisions needed before Day 5 (not
  Day 3): ONLYOFFICE licence route and document-server hosting.
