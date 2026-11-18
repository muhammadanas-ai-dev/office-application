// Session refresh + route protection for Next.js 16 proxy.ts.
// Keeps the Supabase auth session fresh on every request and sends
// signed-out visitors away from the workspace.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicEnv } from "@/lib/env";

/** Workspace areas that require a signed-in user. */
const PROTECTED_PREFIXES = [
  "/home",
  "/recent",
  "/files",
  "/shared",
  "/starred",
  "/templates",
  "/trash",
  "/settings",
  "/plan",
  "/editor",
  // PDF tools pages live under /documents/[id]/pdf-tools. Without
  // this entry a signed-out visitor got a 200 with the workspace
  // shell instead of a redirect (the page's own redirect is the
  // second layer, not the first).
  "/documents",
];

/**
 * Endpoints that stay public to the session check. The health
 * endpoints are unauthenticated; the editor endpoints authenticate
 * with their own tokens instead of a user session (the document
 * server calls them with no cookies): /api/editor/file requires a
 * valid HMAC file token, /api/editor/callback requires a valid
 * ONLYOFFICE JWT. They must NOT be redirected to sign-in, or the
 * document server would receive a login page instead of the file
 * or the save acknowledgement.
 */
const PUBLIC_API_PREFIXES = [
  "/api/supabase-status",
  "/api/db-status",
  "/api/editor/file",
  "/api/editor/callback",
];

function isProtectedPath(pathname: string): boolean {
  if (
    PROTECTED_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    )
  ) {
    return true;
  }
  if (pathname.startsWith("/api/")) {
    return !PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  }
  return false;
}

function isAuthPage(pathname: string): boolean {
  return (
    pathname === "/auth/login" ||
    pathname === "/auth/signup" ||
    pathname === "/auth/reset-password"
  );
}

/**
 * Copy the refreshed session cookies and cache headers from the
 * Supabase response onto a redirect response. Without this, the
 * browser keeps the old token and the user is signed out on the
 * next request (Supabase SSR docs: "Hook up proxy").
 */
function withSessionCookies(
  response: NextResponse,
  supabaseResponse: NextResponse
): NextResponse {
  // NOTE: the Supabase docs show response.cookies.setAll(...), but this
  // Next.js 16.4.6 build has no setAll on ResponseCookies — copy each
  // cookie (name, value and options) with set(cookie) instead.
  for (const cookie of supabaseResponse.cookies.getAll()) {
    response.cookies.set(cookie);
  }
  for (const header of ["cache-control", "expires", "pragma"]) {
    const value = supabaseResponse.headers.get(header);
    if (value) response.headers.set(header, value);
  }
  return response;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const publicEnv = getPublicEnv();
  const url = publicEnv.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!key) {
    throw new Error(
      "No Supabase publishable key configured: set " +
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY."
    );
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // getClaims() verifies the token signature on every call. Never
  // trust getSession() here — it reads the cookie without
  // revalidating it. Do not run code between createServerClient and
  // getClaims().
  const { data } = await supabase.auth.getClaims();
  const isSignedIn = Boolean(data?.claims);

  const { pathname } = request.nextUrl;

  if (!isSignedIn && isProtectedPath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/auth/login";
    loginUrl.searchParams.set("next", pathname);
    return withSessionCookies(
      NextResponse.redirect(loginUrl),
      supabaseResponse
    );
  }

  if (isSignedIn && isAuthPage(pathname)) {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/home";
    homeUrl.search = "";
    return withSessionCookies(NextResponse.redirect(homeUrl), supabaseResponse);
  }

  return supabaseResponse;
}
