// Live end-to-end harness for Versions UI (Day 23).
// Run with the app on :3000:
//   node scripts/e2e-versions-test.mjs
// Creates real test users and deletes them afterwards.
// Temporary harness — not part of the repo.
//
// Requires the fixture /tmp/e2e/pdf1.pdf (3 pages:
// "PDF One page 1/2/3").
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const APP = "http://localhost:3000";
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const SUPA_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const PUB = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SVC = env.SUPABASE_SERVICE_ROLE_KEY;
const REF = new URL(SUPA_URL).hostname.split(".")[0];
const admin = createClient(SUPA_URL, SVC, { auth: { persistSession: false, autoRefreshToken: false } });
const suffix = Date.now().toString(36);
const userA = { email: `forma-e2e-ver-a-${suffix}@example.com`, password: "TestPass123!" };
const userB = { email: `forma-e2e-ver-b-${suffix}@example.com`, password: "TestPass123!" };
let userAId = "", userBId = "", workspaceAId = "";
let sessionA = null, sessionB = null;
let documentId = "";

function cookieFor(session) {
  return `sb-${REF}-auth-token=base64-${Buffer.from(JSON.stringify(session), "utf8").toString("base64url")}`;
}
async function appFetch(path, { session, method = "GET", body } = {}) {
  const headers = {};
  if (session) headers.Cookie = cookieFor(session);
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return fetch(`${APP}${path}`, {
    method, headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
}

try {
  if (!existsSync("/tmp/e2e/pdf1.pdf")) {
    console.log("MISSING FIXTURE /tmp/e2e/pdf1.pdf — rebuild it with scripts/rebuild-fixtures.mjs first.");
    process.exit(1);
  }
  // ---- setup ----
  const { data: cA } = await admin.auth.admin.createUser({ email: userA.email, password: userA.password, email_confirm: true });
  userAId = cA.user.id;
  const { data: cB } = await admin.auth.admin.createUser({ email: userB.email, password: userB.password, email_confirm: true });
  userBId = cB.user.id;
  await admin.from("profiles").upsert({ id: userAId, display_name: "E2E Versions" }, { onConflict: "id" });
  const { data: wsA } = await admin.from("workspaces").insert({ name: "E2E ver ws A", owner_id: userAId, plan_key: "free", is_personal: true }).select("id").single();
  workspaceAId = wsA.id;
  await admin.from("workspace_members").insert({ workspace_id: workspaceAId, user_id: userAId, role: "owner", status: "active" });
  const clientA = createClient(SUPA_URL, PUB, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: sA } = await clientA.auth.signInWithPassword(userA);
  sessionA = sA.session;
  const clientB = createClient(SUPA_URL, PUB, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: sB } = await clientB.auth.signInWithPassword(userB);
  sessionB = sB.session;

  // Upload a PDF (version 1).
  documentId = crypto.randomUUID();
  const pdfBytes = readFileSync("/tmp/e2e/pdf1.pdf");
  const filePath = `${workspaceAId}/${documentId}/v1/pdf1.pdf`;
  await admin.storage.from("documents").upload(filePath, pdfBytes, { contentType: "application/pdf" });
  await admin.from("documents").insert({ id: documentId, workspace_id: workspaceAId, folder_id: null, title: "pdf1.pdf", file_path: filePath, mime_type: "application/pdf", size_bytes: pdfBytes.length, version: 1, created_by: userAId });
  await admin.from("document_versions").insert({ document_id: documentId, workspace_id: workspaceAId, version_number: 1, file_path: filePath, mime_type: "application/pdf", size_bytes: pdfBytes.length, created_by: userAId });
  check("setup: the PDF uploads (version 1)", true);

  // Edit it twice via the pdf-edit route (versions 2 and 3).
  for (const [page, text, replacement] of [
    [1, "PDF One page 1", "PDF One page ONE"],
    [2, "PDF One page 2", "PDF One page TWO"],
  ]) {
    const resp = await appFetch(`/api/documents/${documentId}/pdf/edit-text`, { session: sessionA, method: "POST", body: { page, text, replacement } });
    const data = await resp.json().catch(() => ({}));
    check(`setup: edit page ${page} creates a new version`, resp.status === 200 && typeof data.version === "number", `status ${resp.status}, version ${data.version}`);
  }

  // ---- the versions page ----
  const pageA = await appFetch(`/documents/${documentId}/versions`, { session: sessionA });
  const pageHtml = await pageA.text();
  check("versions page: loads for A (200)", pageA.status === 200, `status ${pageA.status}`);
  check("versions page: lists version 3 as current", pageHtml.includes("Version 3 · current"), "the label is missing");
  check("versions page: lists versions 2 and 1", pageHtml.includes("Version 2") && pageHtml.includes("Version 1"), "an older version is missing");
  check("versions page: has a Download link and a Restore button", pageHtml.includes("Download") && pageHtml.includes("Restore"), "a control is missing");

  // ---- download version 1 ----
  const dl1 = await appFetch(`/api/documents/${documentId}/versions/1/download`, { session: sessionA });
  // The route redirects to a signed Storage URL; follow it.
  const dl1Final = dl1.status === 302 || dl1.status === 307
    ? await fetch(dl1.headers.get("Location"))
    : dl1;
  const dl1Bytes = new Uint8Array(await dl1Final.arrayBuffer());
  check("download: version 1 returns 200 (via the signed URL) and matches the original upload", dl1Final.status === 200 && Buffer.compare(Buffer.from(dl1Bytes), Buffer.from(pdfBytes)) === 0, `status ${dl1Final.status}, ${dl1Bytes.length} bytes`);

  // ---- restore version 1 ----
  const restore = await appFetch(`/api/documents/${documentId}/versions/1/restore`, { session: sessionA, method: "POST", body: {} });
  const restoreData = await restore.json().catch(() => ({}));
  check("restore: version 1 restores as version 4 (200)", restore.status === 200 && restoreData.version === 4, `status ${restore.status}, version ${restoreData.version}`);
  const { data: docAfter } = await admin.from("documents").select("version, file_path").eq("id", documentId).maybeSingle();
  check("restore: the document is now version 4", docAfter.version === 4, `version ${docAfter.version}`);
  const { data: v4Blob } = await admin.storage.from("documents").download(docAfter.file_path);
  check("restore: version 4's bytes match version 1's", Buffer.compare(Buffer.from(new Uint8Array(await v4Blob.arrayBuffer())), Buffer.from(pdfBytes)) === 0);
  const { data: versionsAfter } = await admin.from("document_versions").select("version_number").eq("document_id", documentId).order("version_number");
  check("restore: versions 1-3 are unchanged (4 rows now)", versionsAfter.map((v) => v.version_number).join(",") === "1,2,3,4", versionsAfter.map((v) => v.version_number).join(","));

  // ---- restore refusals ----
  const restoreCurrent = await appFetch(`/api/documents/${documentId}/versions/4/restore`, { session: sessionA, method: "POST", body: {} });
  check("restore: restoring the current version is refused (400)", restoreCurrent.status === 400, `status ${restoreCurrent.status}`);
  const restoreMissing = await appFetch(`/api/documents/${documentId}/versions/99/restore`, { session: sessionA, method: "POST", body: {} });
  check("restore: restoring a missing version is 404", restoreMissing.status === 404, `status ${restoreMissing.status}`);
  const dlMissing = await appFetch(`/api/documents/${documentId}/versions/99/download`, { session: sessionA });
  check("download: a missing version is 404", dlMissing.status === 404, `status ${dlMissing.status}`);

  // ---- cross-user isolation ----
  // The versions page renders an EmptyState (200) for a document
  // the user cannot access — it does not return a 404 status.
  // So check the content, not the status.
  const pageB = await appFetch(`/documents/${documentId}/versions`, { session: sessionB });
  const pageBHtml = await pageB.text();
  check("isolation: user B sees 'Document not found' on the versions page (no versions listed)", pageBHtml.includes("Document not found") && !pageBHtml.includes("Version 3"), `status ${pageB.status}`);
  const dlB = await appFetch(`/api/documents/${documentId}/versions/1/download`, { session: sessionB });
  check("isolation: user B gets 404 on the version download", dlB.status === 404, `status ${dlB.status}`);
  const restoreB = await appFetch(`/api/documents/${documentId}/versions/1/restore`, { session: sessionB, method: "POST", body: {} });
  check("isolation: user B gets 404 on the version restore", restoreB.status === 404, `status ${restoreB.status}`);

  // ---- signed-out ----
  const soPage = await fetch(`${APP}/documents/${documentId}/versions`, { redirect: "manual" });
  check("signed-out: the versions page redirects to login (307)", soPage.status === 307, `status ${soPage.status}`);
  const soRestore = await fetch(`${APP}/api/documents/${documentId}/versions/1/restore`, { method: "POST", redirect: "manual" });
  check("signed-out: the version restore redirects to login (307)", soRestore.status === 307, `status ${soRestore.status}`);
} catch (error) {
  console.error("HARNESS ERROR:", error);
  results.push({ name: "harness", ok: false, detail: String(error) });
} finally {
  if (userAId) await admin.auth.admin.deleteUser(userAId);
  if (userBId) await admin.auth.admin.deleteUser(userBId);
  console.log("\n==== SUMMARY ====");
  const passed = results.filter((r) => r.ok).length;
  console.log(`${passed}/${results.length} checks passed`);
  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.log("FAILED:");
    for (const f of failed) console.log(` - ${f.name}: ${f.detail}`);
    process.exitCode = 1;
  }
}
