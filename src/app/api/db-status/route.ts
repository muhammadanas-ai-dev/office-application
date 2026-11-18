// GET /api/db-status
// Checks the direct Postgres connection. Returns no credentials.
import { checkDb } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { reachable: false, error: "DATABASE_URL missing" },
      { status: 500 }
    );
  }
  try {
    const result = await checkDb();
    return NextResponse.json({
      reachable: true,
      host: process.env.PGHOST ?? null,
      port: process.env.PGPORT ?? null,
      database: process.env.PGDATABASE ?? null,
      tables: result.tables,
    });
  } catch (err) {
    return NextResponse.json(
      {
        reachable: false,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 502 }
    );
  }
}
