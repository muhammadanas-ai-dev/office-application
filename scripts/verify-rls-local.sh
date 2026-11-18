#!/usr/bin/env bash
# Local RLS verification for the Day 3–5 and Day 13 migrations.
#
# Builds a throwaway Postgres database on this machine, installs a
# mock auth schema (the Supabase project provides the real one),
# applies the migrations in order, and runs the RLS assertions in
# supabase/tests/rls-local.sql. Requires a local PostgreSQL server
# (apt install postgresql) and psql on PATH. Run as a user that can
# sudo to postgres, from the project root:
#
#   bash scripts/verify-rls-local.sh
#
# Exit code is non-zero if any check fails. The cluster stops when
# the VM restarts; run `service postgresql start` first if needed.
set -euo pipefail

DB="forma_rls_test"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

PSQL="sudo -u postgres psql -v ON_ERROR_STOP=1 -q"

# The postgres user cannot read files under this workspace (restrictive
# home-directory permissions), so copy the SQL into a world-readable
# temp dir first. Cleaned up on exit.
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT
chmod 755 "$TMPDIR"
cp "$ROOT/supabase/tests/setup-auth-mock.sql" "$TMPDIR/"
cp "$ROOT/supabase/migrations/20261117010000_forma_auth_workspace.sql" "$TMPDIR/"
cp "$ROOT/supabase/migrations/20261117020000_forma_documents_library.sql" "$TMPDIR/"
cp "$ROOT/supabase/migrations/20261117030000_forma_editor_sessions.sql" "$TMPDIR/"
cp "$ROOT/supabase/migrations/20261118050000_forma_ocr.sql" "$TMPDIR/"
cp "$ROOT/supabase/tests/rls-local.sql" "$TMPDIR/"
chmod 644 "$TMPDIR"/*.sql

echo "== creating fresh database $DB =="
$PSQL -c "DROP DATABASE IF EXISTS $DB;" postgres
$PSQL -c "CREATE DATABASE $DB;" postgres

echo "== installing mock auth schema =="
$PSQL -d "$DB" -f "$TMPDIR/setup-auth-mock.sql"

echo "== applying Day 3 migration =="
$PSQL -d "$DB" -f "$TMPDIR/20261117010000_forma_auth_workspace.sql"

# A workspace that predates Day 4, so the Day 4 migration's
# is_personal backfill has a real row to mark (the test setup in
# rls-local.sql inserts the same id with ON CONFLICT DO NOTHING).
echo "== inserting pre-Day-4 workspace =="
$PSQL -d "$DB" -c "insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'a@example.com'), ('22222222-2222-2222-2222-222222222222', 'b@example.com'), ('33333333-3333-3333-3333-333333333333', 'c@example.com') on conflict (id) do nothing; insert into public.workspaces (id, name, owner_id) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A workspace', '11111111-1111-1111-1111-111111111111');"

echo "== applying Day 4 migration =="
$PSQL -d "$DB" -f "$TMPDIR/20261117020000_forma_documents_library.sql"

echo "== applying Day 5 migration =="
$PSQL -d "$DB" -f "$TMPDIR/20261117030000_forma_editor_sessions.sql"

echo "== applying Day 13 migration (OCR) =="
$PSQL -d "$DB" -f "$TMPDIR/20261118050000_forma_ocr.sql"

echo "== running RLS assertions =="
$PSQL -d "$DB" -f "$TMPDIR/rls-local.sql"

echo "== dropping test database =="
$PSQL -c "DROP DATABASE $DB;" postgres

echo "LOCAL RLS VERIFICATION PASSED"
