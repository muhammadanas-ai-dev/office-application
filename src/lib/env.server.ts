// Server environment — SERVER ONLY. `server-only` makes any client-side
// import a build error. Only variable NAMES are ever named in an error,
// never values.
import "server-only";
import { parseServerEnv } from "@/lib/env-server-parse";

export { getPrivilegedKey, parseServerEnv } from "@/lib/env-server-parse";
export type { ServerEnv } from "@/lib/env-server-parse";

/** Validated server env for the running app. */
export const serverEnv = parseServerEnv(process.env);
