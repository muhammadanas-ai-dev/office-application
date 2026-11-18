# Schema and RLS — Forma Office (Day 3)

Updated: 2026-11-17 (Day 4 — see the note at the end)

## Applying the migration

File: `supabase/migrations/20261117010000_forma_auth_workspace.sql`

**Day 4 adds a second migration**
(`supabase/migrations/20261117020000_forma_documents_library.sql`):
apply the Day 3 file first, then the Day 4 file, in the same SQL
Editor session or two runs in order. The Day 4 file references the
Day 3 tables, and provisioning now inserts `workspaces.is_personal`,
so a first sign-up before Day 4 is applied would fail. The library
model, Storage policies and upload rules are documented in
`docs/architecture/library-and-storage.md`.

Direct Postgres (port 5432) is blocked from this machine: the runtime
network policy answers the Postgres TLS handshake with a plain-text
proxy message, so `psql` and `supabase db push` cannot reach the
project from here. Apply the migration in the Supabase dashboard:

1. Open the project (ref `pwncfcvnwudbvwcumado`) → **SQL Editor** →
   **New query**.
2. Paste the whole migration file and run it.
3. Confirm the three tables exist under **Table Editor** and RLS is
   enabled on each.
4. Under **Authentication → URL Configuration**, confirm the Site URL
   is `http://localhost:3000` for local work and that
   `http://localhost:3000/auth/callback` is an allowed redirect URL
   (the sign-up and password-reset emails link there). Supabase allows
   localhost redirects by default, but check before the first real
   sign-up.
5. Run the live RLS test from this repo: `npm run test:live`.

Alternative: a scoped Supabase personal access token lets the CLI
(`supabase link` + `supabase db push`) apply migrations from another
machine. Do not paste a token in chat; use the secure entry flow.

## Tables

### profiles (one row per auth user)

| Column                  | Type                                           | Notes                                |
| ----------------------- | ---------------------------------------------- | ------------------------------------ |
| id                      | uuid PK, FK → auth.users(id) ON DELETE CASCADE | The auth user id; no separate app id |
| display_name            | text, ≤ 100 chars, nullable                    | From sign-up; editable in Settings   |
| avatar_path             | text, nullable                                 | Storage path; used Day 4+            |
| locale                  | text, default 'en'                             |                                      |
| created_at / updated_at | timestamptz, default now()                     | updated_at via trigger               |

### workspaces

| Column                  | Type                                             | Notes                    |
| ----------------------- | ------------------------------------------------ | ------------------------ |
| id                      | uuid PK, default gen_random_uuid()               |                          |
| name                    | text, 1–100 chars                                | e.g. "Ana's workspace"   |
| owner_id                | uuid, FK → auth.users(id) ON DELETE CASCADE      | Indexed                  |
| plan_key                | text, default 'free', check in (free, pro, team) | Entitlements land Day 13 |
| created_at / updated_at | timestamptz, default now()                       | updated_at via trigger   |

### workspace_members (the only source of roles)

| Column                         | Type                                                                       | Notes                                                  |
| ------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------ |
| id                             | uuid PK                                                                    |                                                        |
| workspace_id                   | uuid, FK → workspaces(id) ON DELETE CASCADE                                |                                                        |
| user_id                        | uuid, FK → auth.users(id) ON DELETE CASCADE                                |                                                        |
| role                           | text, default 'editor', check in (owner, admin, editor, commenter, viewer) | Hierarchy: viewer < commenter < editor < admin < owner |
| status                         | text, default 'active', check in (active, invited, removed)                | Invites land Day 10                                    |
| joined_at                      | timestamptz, default now()                                                 |                                                        |
| UNIQUE (workspace_id, user_id) |                                                                            | One membership per user per workspace                  |

Indexes: the unique constraint indexes (workspace_id, user_id);
`workspace_members_user_id_idx` indexes (user_id, workspace_id) for
"all workspaces for this user"; `workspaces_owner_id_idx` for owner
lookups. Every foreign key is indexed (best-practices rule
schema-foreign-key-indexes).

## Helper functions (schema `app_private`, never Data-API exposed)

- `app_private.is_workspace_member(uuid) → boolean` — SECURITY
  DEFINER, fixed `search_path = ''`, checks `auth.uid()` inside its
  own body. Used by the workspace/member SELECT policies.
- `app_private.workspace_role(uuid) → text` — same pattern; returns
  the caller's role in a workspace, or NULL.
- `app_private.set_updated_at()` — plain trigger function (SECURITY
  INVOKER) for `updated_at`.

EXECUTE on the two membership helpers is revoked only from `anon`.
It must stay granted to `authenticated`: RLS policies evaluate the
helpers as the querying user, and revoking EXECUTE from
`authenticated` (or from PUBLIC, which includes it) breaks every
workspace/member policy outright — proven by local test T2 on
Postgres 16, which failed with "permission denied for function
is_workspace_member" until the grant was restored. `authenticated`
also needs USAGE on the `app_private` schema itself, or the same
policies fail with "permission denied for schema app_private"
(local test T9). The real protection is the non-exposed schema: the
Data API cannot reach functions in `app_private` at all, and each
helper checks `auth.uid()` inside its own body, so it can only ever
answer about the caller. Verified by local test T9 (see below).

## RLS policies (all `TO authenticated` + ownership predicate)

Never `auth.role()` (deprecated) and never bare `TO authenticated`
(authentication without authorization). `auth.uid()` is wrapped in
`(select ...)` so it is evaluated once per query, not per row.

- **profiles**: SELECT own row; UPDATE own row (USING + WITH CHECK).
  No INSERT/DELETE policy — rows are created by the server-side admin
  client during sign-up provisioning and removed by the auth-user
  delete cascade.
- **workspaces**: SELECT if member; INSERT with `owner_id =
auth.uid()`; UPDATE/DELETE only by the owner (USING + WITH CHECK).
- **workspace_members**: SELECT if member; INSERT/UPDATE only by an
  owner or admin of that workspace; DELETE only by an owner/admin,
  and never the owner's own owner row (last-owner guard; owner
  transfer is a Day 10 feature).

Grants: `authenticated` gets SELECT/INSERT/UPDATE/DELETE on the three
tables (table-level access; RLS is the row gate). `anon` gets nothing.
If the Data API settings do not auto-expose new tables, these grants
are what make the tables reachable at all — check **Project Settings
→ Data API** if a table returns "permission denied" from the client.

RLS is deliberately NOT forced (`force row level security`): the
server-side admin client (service_role) is the legitimate
provisioning path, and forcing RLS would block it. All user access
goes through RLS.

## Provisioning (no trigger on auth.users)

No `handle_new_user` trigger exists. When a user signs up, signs in,
or follows an email link, the server action / callback calls
`ensureProfileAndWorkspace` (admin client, idempotent): upsert the
profile, then create a personal workspace + owner membership if the
user has none. `user_metadata` is never used for authorization — it
is user-editable; roles live only in `workspace_members`.

## Verification

### Local (runs here, no Supabase needed)

`bash scripts/verify-rls-local.sh` — installs a mock `auth` schema in
a throwaway local Postgres database, applies the migration, and runs
10 assertions (`supabase/tests/rls-local.sql`): own-profile visibility,
cross-user profile/workspace invisibility, cross-workspace
insert/update/delete denial, owner positive control, editor limits,
helper not directly callable, owner-row deletion guard.

### Live (needs the migration applied)

`npm run test:live` — creates two real auth users, then proves over
the REST/Data API that B cannot read A's workspace or profile and
cannot add a member to A's workspace, while A can read it. Test
users are deleted afterwards (cascades clean up).

## Known gaps (Day 3)

- No last-owner protection beyond the delete guard: an owner could
  still be demoted by another admin (UPDATE policy allows it).
  Owner transfer + demotion guard land with invites (Day 10).
- Two concurrent first sign-ins could create two personal workspaces
  for one user. Unlikely in practice; dedupe is a Day 4 cleanup.
- `gen_random_uuid()` (v4) is used for ids; UUIDv7 would reduce
  index fragmentation at very large scale (best-practices rule
  schema-primary-keys). Not worth an extension dependency at this
  size; revisit if workspaces grow past ~1M rows.
