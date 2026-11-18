// Admin client — SERVER ONLY. Never import from a Client Component
// and never expose these keys with a NEXT_PUBLIC_ prefix.
// Prefers the new secret key (sb_secret_...); falls back to the
// legacy service_role key. Both bypass Row Level Security.
import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env";
import { getPrivilegedKey, serverEnv } from "@/lib/env.server";
import type { Database } from "@/types/database.types";

export function createAdminClient() {
  const key = getPrivilegedKey(serverEnv);
  if (!key) {
    throw new Error(
      "No privileged Supabase key configured: set SUPABASE_SECRET_KEY " +
        "or SUPABASE_SERVICE_ROLE_KEY (server-only)."
    );
  }
  const url = serverEnv.SUPABASE_URL ?? getPublicEnv().NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error(
      "No Supabase URL configured: set SUPABASE_URL or " +
        "NEXT_PUBLIC_SUPABASE_URL."
    );
  }
  return createSupabaseClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
