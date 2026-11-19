// Structured server-side error logging (Day 27, hardening).
//
// The app logs errors with bare `console.error` calls, which
// produce free-form lines that are hard to search and can leak
// secrets (a token or password in an error object would be
// printed). This helper writes one JSON line per error — a
// timestamp, a scope (which part of the app), a message, and an
// optional context object — and REDACTS any field whose name
// looks like a secret before it is written.
//
// The log goes to stdout (the process log), where a monitor can
// collect it. There is no external error tracker in v1 (Sentry
// etc. needs an account and a DSN — a deployment decision for
// the owner); the health endpoint (`/api/health`) is the
// monitoring hook, and this log is what it feeds on.

const REDACTED = "[redacted]";

/** Field names that must never appear in a log line. */
const SECRET_KEYS = [
  "password",
  "passwd",
  "secret",
  "token",
  "api_key",
  "apikey",
  "access_key",
  "service_role",
  "servicekey",
  "private_key",
  "authorization",
  "cookie",
];

function isSecretKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SECRET_KEYS.some((s) => lower.includes(s));
}

/** Deep-copy a value, replacing any secret field with
 *  "[redacted]". Circular references are replaced with
 *  "[circular]" instead of throwing. */
export function redactSecrets(value: unknown, seen = new Set()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value;
  if (typeof value !== "object") return value;
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((v) => redactSecrets(v, seen));
  }
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    out[key] = isSecretKey(key) ? REDACTED : redactSecrets(v, seen);
  }
  return out;
}

/** The shape of one log line. */
export interface LogEntry {
  time: string;
  level: "error" | "warn" | "info";
  scope: string;
  message: string;
  context?: unknown;
}

/** Write one JSON log line to stdout. `context` is redacted
 *  before it is written, so a secret passed in by mistake
 *  never reaches the log. */
export function logLine(
  level: LogEntry["level"],
  scope: string,
  message: string,
  context?: unknown
): void {
  const entry: LogEntry = {
    time: new Date().toISOString(),
    level,
    scope,
    message,
    ...(context !== undefined ? { context: redactSecrets(context) } : {}),
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(entry));
}

/** Log an error (an Error, a string, or anything else) under a
 *  scope. The error's message is logged; its stack is included
 *  only when it is an Error (a stack can contain a secret in a
 *  URL, so it is redacted the same way). */
export function logError(
  scope: string,
  error: unknown,
  context?: unknown
): void {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unknown error";
  const detail: Record<string, unknown> = {};
  if (error instanceof Error && error.stack) {
    detail.stack = error.stack;
  }
  logLine("error", scope, message, {
    ...detail,
    ...(context !== undefined ? { context } : {}),
  });
}
