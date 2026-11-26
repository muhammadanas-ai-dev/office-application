// Exchanges the email-confirmation / password-reset code for a
// session, provisions the user's profile + personal workspace, then
// sends them to the page they asked for (default /home).
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureProfileAndWorkspace } from "@/features/auth/provision";
import { logError } from "@/lib/log";

function safeNext(value: string | null): string {
  if (value && value.startsWith("/") && !value.startsWith("//")) return value;
  return "/home";
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));
  const loginUrl = new URL("/auth/login", request.url);
  loginUrl.searchParams.set("error", "callback");

  if (!code) {
    return NextResponse.redirect(loginUrl);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    logError("auth callback", error.message, "exchange failed");
    return NextResponse.redirect(loginUrl);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(loginUrl);
  }

  try {
    await ensureProfileAndWorkspace(
      user.id,
      (user.user_metadata?.display_name as string | undefined) ?? null
    );
  } catch (provisionError) {
    // The session is valid; provisioning retries on the next sign-in.
    logError("auth callback", provisionError, "provisioning failed");
  }

  return NextResponse.redirect(new URL(next, request.url));
}
