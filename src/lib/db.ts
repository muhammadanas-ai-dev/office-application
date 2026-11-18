// Direct Postgres — SERVER ONLY. Never import from a Client Component.
// Uses DATABASE_URL from .env.local. Supabase requires SSL.
// Kept as a singleton so dev reloads don't open a new pool each time.
import "server-only";
import { Pool } from "pg";
import { serverEnv } from "@/lib/env.server";

declare global {
  var __pgPool: Pool | undefined;
}

export function getPool(): Pool {
  if (!globalThis.__pgPool) {
    if (!serverEnv.DATABASE_URL) {
      throw new Error(
        "No direct Postgres URL configured: set DATABASE_URL (server-only)."
      );
    }
    globalThis.__pgPool = new Pool({
      connectionString: serverEnv.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 5,
    });
  }
  return globalThis.__pgPool;
}

export async function checkDb() {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
    const tables = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
    );
    return {
      reachable: true,
      tables: tables.rows.map((r: { table_name: string }) => r.table_name),
    };
  } finally {
    client.release();
  }
}
