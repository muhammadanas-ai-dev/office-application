// Pure server-env parsing — no "server-only" import here, so unit tests
// can import these helpers. The server-only boundary lives in
// env.server.ts, which re-exports them.
import { z } from "zod";

const serverEnvSchema = z.object({
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SECRET_KEY: z.string().min(10).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10).optional(),
  DATABASE_URL: z
    .string()
    .refine((url) => url.startsWith("postgresql://"), {
      message: "DATABASE_URL must be a postgresql:// URL",
    })
    .optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Pure, testable parser. `input` is a name -> value record. */
export function parseServerEnv(
  input: Record<string, string | undefined>
): ServerEnv {
  const result = serverEnvSchema.safeParse(input);
  if (!result.success) {
    const names = result.error.issues
      .map((issue) => issue.path.join("."))
      .join(", ");
    throw new Error(`Invalid server environment variables: ${names}`);
  }
  return result.data;
}

/** Returns the privileged Supabase key: new secret key first, legacy
 *  service_role key as fallback. Returns null when neither is set. */
export function getPrivilegedKey(env: ServerEnv): string | null {
  return env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY ?? null;
}
