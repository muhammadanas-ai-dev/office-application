# Day 01 — Handoff

- Date: 2026-11-17
- Version label: day-01
- Branch: day-01-discovery
- Commit SHA: f78a573 (head; Day 1 commit 45f32e2)
- Vercel Preview URL: NOT PERFORMED — no Vercel/Git remote access
- Production URL (only if promoted): none
- Office engine version/edition: none deployed

## 1. What was researched

- WPS platform/build/plan: Official WPS web pages only (no desktop build,
  no authorized WPS account/trial session available).
- Source URLs: https://www.wps.com/feature/ , https://www.wps.com/buy/ ,
  https://helpcenter.onlyoffice.com/docs/faq/docs-community.aspx ,
  https://api.onlyoffice.com/docs/docs-api/usage-api/doceditor ,
  https://github.com/ONLYOFFICE/document-formats
- Research skill used: comprehensive_research (Standard mode: 3 searches +
  3 official page reads). REA skill was NOT used — clean-room observation
  of public documentation only, no decompilation or bypass.
- What was directly observed: WPS feature directory (Docs/Sheets/Slides/
  PDF/AI); ONLYOFFICE Community FAQ AGPLv3 terms (SaaS must disclose
  modified source + derivatives; commercial licence needed for proprietary
  products; no white-labelling; no SLA; Community for testing/personal/
  dev/small-scale).
- What remains unverified: Hands-on WPS session; WPS plan prices (official
  buy page table is JS-rendered and not extractable — prices in the
  inventory are secondary-source and region-dependent, not hardcoded);
  ONLYOFFICE format matrix on the exact deployed version (no server yet).

## 2. Completed functionality

| Feature | Status | Evidence/test ID | Notes |
|---|---|---|---|
| Brief saved in project | done | docs/project-brief/ (16 files) | Originals kept in ~/workspace/user/files/ |
| WPS feature inventory | done | docs/reverse-engineering/day-01-wps-inventory.md | Dated 2026-11-17 |
| ADR-001 editor engine | done | docs/architecture/ADR-001-office-editor-engine.md | Commercial launch BLOCKED pending owner decision |
| Feature matrix | done | docs/feature-matrix.csv (25 rows) | researched/planned, no fake "supported" claims |
| Known limitations | done | docs/known-limitations.md | Honest Day 1 state |
| Brand tokens + wireframe | done | globals.css, layout.tsx, page.tsx | Inter font; disabled coming-soon actions |
| Git baseline | done | branch day-01-discovery, commits 45f32e2 + f78a573 | .env.local verified ignored; no secrets staged |

## 3. Code and data changes

- Pages/components: src/app/page.tsx (Forma wireframe), layout.tsx
  (Inter font, Forma metadata), globals.css (Forma tokens).
- Services/API routes: none changed; /api/supabase-status and
  /api/db-status unchanged.
- Supabase migrations/RLS: none — no tables exist yet (Day 3–4).
- Storage policy changes: none.
- Environment variable names added (never values): none. .env.example
  now committed with placeholders only (fixed .gitignore negation).

## 4. Tests

- Lint: 0 errors, 1 pre-existing warning (src/lib/db.ts unused
  eslint-disable directive — left for Day 2 cleanup).
- Typecheck: no script exists yet; `next build` ran TypeScript and passed.
- Unit: none (no test runner yet — Day 2).
- Integration: none.
- E2E: none.
- Build: pass (Next.js 16.4.6, 6/6 pages generated).
- Preview smoke tests: local smoke test pass — homepage shows Forma
  branding, headline, coming-soon buttons and licence note; "Connected"
  status present; /api/supabase-status reachable:true; /api/db-status
  reachable:false with the known SSL error (unchanged from before Day 1).

## 5. Deployment verification

- Preview deployment result: NOT PERFORMED — no Vercel/Git remote access.
  Do not claim a Preview URL exists.
- Health endpoint: /api/supabase-status reachable locally.
- Browser console/network result: not checked (no deployed URL).
- Main workflow result: no user workflow exists yet beyond the wireframe.

## 6. Security/licensing checks

- RLS and Storage access: not yet implemented (Day 3–4).
- Editor JWT/callback: not yet implemented (Day 5, gated).
- Secrets: secret-scan of the staged tree found no secret values;
  .env.local is gitignored; .env.example holds placeholders only.
  Rotation of the keys pasted in chat earlier is still unconfirmed.
- File handling: none yet.
- License status: ONLYOFFICE Community = AGPLv3; commercial launch
  BLOCKED. See ADR-001.

## 7. Known defects and limitations

- No editor, auth, tables, tests, or deployment (see
  docs/known-limitations.md).
- Direct Postgres still fails from this VM (SSL establishment, before
  auth); REST works.
- WPS pricing not verified from the official page; do not hardcode prices.

## 8. Tomorrow's target

- Highest-priority feature: Day 2 — application shell and design system
  (Next.js strict TypeScript, Tailwind/shadcn patterns, Lucide, real
  navigation/loading/empty/error states, typecheck + test scripts,
  env validation).
- Acceptance criteria: lint, typecheck, tests and build pass; no dead
  navigation; no secrets in client bundle.
- Dependencies/blockers: Owner decisions needed before Day 5 (not Day 2):
  (1) proprietary commercial product (→ ONLYOFFICE Developer licence +
  legal review) or open/learning project (→ AGPL-compliant Community
  evaluation); (2) document-server hosting.
