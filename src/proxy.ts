// Next.js 16: middleware.ts is deprecated and renamed to proxy.ts.
// Export a named `proxy` function. See node_modules/next/dist/docs/
// 01-app/03-api-reference/03-file-conventions/proxy.md
import { updateSession } from "@/lib/supabase/proxy";
import type { NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image (static files)
     * - favicon.ico and other metadata files
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
