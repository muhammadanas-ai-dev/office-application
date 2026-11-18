// Public environment — CLIENT-SAFE. Only NEXT_PUBLIC_* names are read
// here, so importing this module from a Client Component cannot leak
// server secrets. Values are validated with Zod; only variable NAMES
// are ever named in an error, never values.
import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url()
    .refine((url) => url.includes(".supabase.co"), {
      message: "NEXT_PUBLIC_SUPABASE_URL must be a Supabase project URL",
    }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(10),
  // Legacy anon JWT, kept only as a fallback for the session proxy.
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(10).optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

/** Pure, testable parser. `input` is a name -> value record. */
export function parsePublicEnv(
  input: Record<string, string | undefined>
): PublicEnv {
  const result = publicEnvSchema.safeParse(input);
  if (!result.success) {
    const names = result.error.issues
      .map((issue) => issue.path.join("."))
      .join(", ");
    throw new Error(`Invalid public environment variables: ${names}`);
  }
  return result.data;
}

let cached: PublicEnv | undefined;

/**
 * Validated public env for the running app. Parsed lazily on first use
 * (so importing this module never crashes a test or a build that has
 * not loaded env yet) and cached afterwards. Throws when a required
 * public variable is missing or malformed.
 */
export function getPublicEnv(): PublicEnv {
  cached ??= parsePublicEnv(process.env);
  return cached;
}
