// GET /api/supabase-status
// Checks the Supabase connection without returning any secret.
// Uses the server client; a successful auth.getSession() call means
// the project URL + publishable key reach Supabase. No tables are
// required yet — this project has none created.
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const configured =
    url.startsWith("https://") &&
    url.includes(".supabase.co") &&
    Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

  if (!configured) {
    return NextResponse.json(
      {
        configured: false,
        reachable: false,
        error: "Supabase env vars missing",
      },
      { status: 500 }
    );
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.getSession();
    if (error) {
      return NextResponse.json(
        { configured: true, reachable: false, error: error.message },
        { status: 502 }
      );
    }
    return NextResponse.json({
      configured: true,
      reachable: true,
      projectHost: new URL(url).host,
      region: process.env.SUPABASE_REGION ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      {
        configured: true,
        reachable: false,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 502 }
    );
  }
}
