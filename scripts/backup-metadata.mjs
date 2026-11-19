// Backup the Forma Office metadata (Day 27, hardening).
//
// Exports the app's tables via the Supabase REST API (the admin
// client) to a timestamped JSON file. This is the METADATA only
// (profiles, workspaces, members, folders, documents, versions,
// stars, editor sessions, OCR jobs/results, shares) — the
// document FILES live in Supabase Storage (the `documents`
// bucket) and are NOT in this file. A full restore also needs
// the Storage objects (export them via the Supabase Dashboard
// or the Storage API — see docs/BACKUP_RESTORE.md).
//
// Why REST, not pg_dump: direct Postgres does not connect from
// this VM (the runtime egress policy intercepts the TLS
// handshake — the same reason migrations are applied via the
// dashboard). The REST-API export is the honest backup for this
// environment. The Supabase project's own automatic backups
// (dashboard) are the primary backup; this script is the
// app-level safety net.
//
// Run: node scripts/backup-metadata.mjs
//   (reads .env.local; writes workspace/backups/forma-backup-<timestamp>.json)
// The file contains user data (names, emails, document titles)
// — keep it private, the same as the database itself.

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");

function loadEnv() {
  const env = {};
  for (const line of readFileSync(
    join(PROJECT_ROOT, ".env.local"),
    "utf8"
  ).split("\n")) {
    const i = line.indexOf("=");
    if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return env;
}

const TABLES = [
  "profiles",
  "workspaces",
  "workspace_members",
  "folders",
  "documents",
  "document_versions",
  "document_stars",
  "editor_sessions",
  "ocr_jobs",
  "document_ocr_results",
  "document_shares",
];

async function main() {
  const env = loadEnv();
  const admin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
  const backup = {
    app: "Forma Office",
    backedUpAt: new Date().toISOString(),
    tables: {},
  };
  for (const table of TABLES) {
    // Paginate (PostgREST defaults to 1,000 rows per request).
    const rows = [];
    let from = 0;
    const PAGE = 1000;
    for (;;) {
      const { data, error } = await admin
        .from(table)
        .select("*")
        .range(from, from + PAGE - 1);
      if (error) {
        console.error(`backup: ${table} failed — ${error.message}`);
        process.exit(1);
      }
      rows.push(...(data ?? []));
      if ((data ?? []).length < PAGE) break;
      from += PAGE;
    }
    backup.tables[table] = rows;
    console.log(`backup: ${table} — ${rows.length} rows`);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = join(PROJECT_ROOT, "..", "backups");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `forma-backup-${stamp}.json`);
  writeFileSync(path, JSON.stringify(backup, null, 2));
  const total = Object.values(backup.tables).reduce(
    (n, rows) => n + rows.length,
    0
  );
  console.log(
    `backup: wrote ${path} (${total} rows across ${TABLES.length} tables)`
  );
  console.log(
    "backup: NOTE — this is metadata only. The document files live in Supabase Storage; see docs/BACKUP_RESTORE.md."
  );
}

main().catch((err) => {
  console.error("backup failed:", err);
  process.exit(1);
});
