// GET /api/health — operational health (Day 27, hardening).
//
// One JSON object reporting the health of the app's
// dependencies, so a monitor can poll it: the app itself, the
// database (a select on the workspaces table via the service
// role), the Storage bucket (a list on `documents`), and the
// ONLYOFFICE document server (a GET on its URL — expected
// `down` while it is not installed; that is reported, not an
// error). Each check has a `status` (`ok` / `down` / `error`)
// and a `latencyMs`.
//
// The route is public (a health endpoint is meant to be
// probed) but returns no user data and no secrets — only
// statuses and latencies. The overall HTTP status is 200
// when the app + database + storage are ok (the docserver
// being down does not make the app unhealthy — editing and
// conversion are degraded, not the app), and 503 when the
// database or storage is down.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DOCUMENTS_BUCKET } from "@/lib/storage";
import { getDocumentServerUrl } from "@/lib/editor.server";

export type HealthStatus = "ok" | "down" | "error";

export interface HealthCheck {
  status: HealthStatus;
  latencyMs: number;
  detail?: string;
}

export interface HealthResponse {
  status: "ok" | "degraded" | "down";
  app: HealthCheck;
  database: HealthCheck;
  storage: HealthCheck;
  docserver: HealthCheck;
}

async function timed<T>(
  fn: () => Promise<T>
): Promise<{ value: T; latencyMs: number }> {
  const start = Date.now();
  const value = await fn();
  return { value, latencyMs: Date.now() - start };
}

export async function GET(): Promise<NextResponse> {
  const app: HealthCheck = { status: "ok", latencyMs: 0 };

  // Database: a select on the workspaces table via the
  // service role. (The public anon key cannot read it.)
  // The Supabase query builder is thenable, not a Promise,
  // so it is timed inline rather than through the helper.
  let database: HealthCheck;
  try {
    const admin = createAdminClient();
    const start = Date.now();
    const { error } = await admin.from("workspaces").select("id").limit(1);
    const latencyMs = Date.now() - start;
    database = error
      ? { status: "error", latencyMs, detail: error.message }
      : { status: "ok", latencyMs };
  } catch (err) {
    database = {
      status: "error",
      latencyMs: 0,
      detail: err instanceof Error ? err.message : "Unknown error",
    };
  }

  // Storage: a list on the documents bucket.
  let storage: HealthCheck;
  try {
    const admin = createAdminClient();
    const start = Date.now();
    const { error } = await admin.storage
      .from(DOCUMENTS_BUCKET)
      .list("", { limit: 1 });
    const latencyMs = Date.now() - start;
    storage = error
      ? { status: "error", latencyMs, detail: error.message }
      : { status: "ok", latencyMs };
  } catch (err) {
    storage = {
      status: "error",
      latencyMs: 0,
      detail: err instanceof Error ? err.message : "Unknown error",
    };
  }

  // Document server: a GET on its URL. It is expected to be
  // down while it is not installed — that is `down`, not an
  // error, and it does not make the app unhealthy.
  let docserver: HealthCheck;
  const docServerUrl = getDocumentServerUrl();
  if (!docServerUrl) {
    docserver = { status: "down", latencyMs: 0, detail: "not configured" };
  } else {
    try {
      const { value, latencyMs } = await timed(() =>
        fetch(docServerUrl, {
          method: "GET",
          signal: AbortSignal.timeout(5000),
        })
      );
      docserver = value.ok
        ? { status: "ok", latencyMs }
        : { status: "down", latencyMs, detail: `HTTP ${value.status}` };
    } catch (err) {
      docserver = {
        status: "down",
        latencyMs: 0,
        detail: err instanceof Error ? err.message : "unreachable",
      };
    }
  }

  const coreOk = database.status === "ok" && storage.status === "ok";
  const status: HealthResponse["status"] = coreOk
    ? docserver.status === "ok"
      ? "ok"
      : "degraded"
    : "down";
  const body: HealthResponse = { status, app, database, storage, docserver };
  return NextResponse.json(body, { status: coreOk ? 200 : 503 });
}
