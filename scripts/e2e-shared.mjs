// Shared setup for the checklist-completion e2e harnesses
// (F20+). Each feature harness imports this, runs its own
// checks, and calls finish() to clean up and print the score.
// Requires the app on http://localhost:3000 and the fixture
// /tmp/e2e/pdf1.pdf (3 pages, "PDF One page N"), rebuilt after
// a VM reset by scripts/rebuild-fixtures.py.
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

export const APP = "http://localhost:3000";
const results = [];
export function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`
  );
}
export function skip(name, detail = "") {
  results.push({ name, ok: true });
  console.log(`SKIP  ${name} — ${detail}`);
}

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);
const SUPA_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const PUB = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SVC = env.SUPABASE_SERVICE_ROLE_KEY;
const REF = new URL(SUPA_URL).hostname.split(".")[0];
export const admin = createClient(SUPA_URL, SVC, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const cleanup = [];
export function onCleanup(fn) {
  cleanup.push(fn);
}

function cookieFor(session) {
  return (
    "sb-" +
    REF +
    "-auth-token=" +
    encodeURIComponent(JSON.stringify(session))
  );
}

export async function appFetch(path, { session, method = "GET", body } = {}) {
  const headers = {};
  if (session) headers.Cookie = cookieFor(session);
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return fetch(`${APP}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
}

/** Create a user with a profile, a personal workspace and a
 *  signed-in session. Returns { id, email, workspaceId,
 *  session }. */
export async function makeUser(tag) {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const email = `forma-e2e-${tag}-${suffix}@example.com`;
  const password = "TestPass123!";
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser failed: ${error.message}`);
  const id = created.user.id;
  await admin
    .from("profiles")
    .upsert({ id, display_name: `E2E ${tag}` }, { onConflict: "id" });
  const { data: ws } = await admin
    .from("workspaces")
    .insert({
      name: `E2E ${tag} ws`,
      owner_id: id,
      plan_key: "free",
      is_personal: true,
    })
    .select("id")
    .single();
  await admin.from("workspace_members").insert({
    workspace_id: ws.id,
    user_id: id,
    role: "owner",
    status: "active",
  });
  const client = createClient(SUPA_URL, PUB, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: signed } = await client.auth.signInWithPassword({
    email,
    password,
  });
  onCleanup(async () => {
    await admin.from("workspaces").delete().eq("id", ws.id);
    await admin.auth.admin.deleteUser(id);
  });
  return { id, email, workspaceId: ws.id, session: signed.session };
}

/** Upload the 3-page fixture as a document owned by `user`. */
export async function uploadFixturePdf(user, title = "Search Fixture") {
  if (!existsSync("/tmp/e2e/pdf1.pdf")) {
    throw new Error(
      "MISSING FIXTURE /tmp/e2e/pdf1.pdf — run scripts/rebuild-fixtures.py"
    );
  }
  const pdfBytes = readFileSync("/tmp/e2e/pdf1.pdf");
  const id = crypto.randomUUID();
  const filePath = `${user.workspaceId}/${id}/v1/${title.replace(/\s+/g, "-").toLowerCase()}.pdf`;
  const { error: upErr } = await admin.storage
    .from("documents")
    .upload(filePath, pdfBytes, { contentType: "application/pdf" });
  if (upErr) throw new Error(`upload failed: ${upErr.message}`);
  await admin.from("documents").insert({
    id,
    workspace_id: user.workspaceId,
    folder_id: null,
    title,
    file_path: filePath,
    mime_type: "application/pdf",
    size_bytes: pdfBytes.length,
    version: 1,
    created_by: user.id,
  });
  await admin.from("document_versions").insert({
    document_id: id,
    workspace_id: user.workspaceId,
    version_number: 1,
    file_path: filePath,
    mime_type: "application/pdf",
    size_bytes: pdfBytes.length,
    created_by: user.id,
  });
  onCleanup(async () => {
    await admin.storage.from("documents").remove([filePath]);
    await admin.from("documents").delete().eq("id", id);
  });
  return id;
}

export async function currentBytes(docId) {
  const { data: doc } = await admin
    .from("documents")
    .select("file_path")
    .eq("id", docId)
    .maybeSingle();
  const { data: blob } = await admin.storage
    .from("documents")
    .download(doc.file_path);
  return new Uint8Array(await blob.arrayBuffer());
}

export async function finish(label) {
  for (const fn of cleanup.reverse()) {
    try {
      await fn();
    } catch {
      // Cleanup is best-effort; a stale test user is a known,
      // harmless leftover the owner can delete in the dashboard.
    }
  }
  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} passed` +
      (failed.length ? ` — FAILED: ${failed.map((f) => f.name).join("; ")}` : "") +
      ` (${label})`
  );
  process.exit(failed.length ? 1 : 0);
}
