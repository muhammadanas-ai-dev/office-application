// Live end-to-end harness for the conversion hub (Phase D, Day 14).
// Run with the app on :3000:
//   node scripts/e2e-convert-test.mjs
// Creates real test users and deletes them afterwards.
// Temporary harness — not part of the repo.
// Requires the app on http://localhost:3000.
//
// NOTE: the full conversion (a DOCX becoming a PDF) needs the
// ONLYOFFICE document server, which is currently wiped (the .deb
// download is 403 through the proxy). Until it is back, the
// conversion itself returns 503 and that is asserted here as the
// expected outcome; the validation, RLS and page checks run live
// regardless. When the docserver returns, flip DOCSERVER_LIVE to
// true and the conversion checks run for real.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const APP = "http://localhost:3000";
const DOCSERVER_LIVE = false;
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
const userA = { email: `forma-e2e-convert-a-${suffix}@example.com`, password: "TestPass123!" };
const userB = { email: `forma-e2e-convert-b-${suffix}@example.com`, password: "TestPass123!" };
let userAId = "", userBId = "", workspaceAId = "";
let sessionA = null, sessionB = null;

function cookieFor(session) {
  return `sb-${REF}-auth-token=base64-${Buffer.from(JSON.stringify(session), "utf8").toString("base64url")}`;
}
async function appFetch(path, { session, method = "GET", body, contentType } = {}) {
  const headers = {};
  if (session) headers.Cookie = cookieFor(session);
  if (body !== undefined) headers["Content-Type"] = contentType ?? "application/json";
  return fetch(`${APP}${path}`, {
    method, headers,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    redirect: "manual",
  });
}
async function downloadVersion(docId, version) {
  const { data: v } = await admin.from("document_versions").select("file_path").eq("document_id", docId).eq("version_number", version).single();
  if (!v) return null;
  const { data: blob } = await admin.storage.from("documents").download(v.file_path);
  return new Uint8Array(await blob.arrayBuffer());
}

try {
  // ---- setup ----
  const { data: cA } = await admin.auth.admin.createUser({ email: userA.email, password: userA.password, email_confirm: true });
  userAId = cA.user.id;
  const { data: cB } = await admin.auth.admin.createUser({ email: userB.email, password: userB.password, email_confirm: true });
  userBId = cB.user.id;
  await admin.from("profiles").upsert({ id: userAId, display_name: "E2E Convert" }, { onConflict: "id" });
  const { data: ws } = await admin.from("workspaces").insert({ name: "E2E convert ws", owner_id: userAId, plan_key: "free", is_personal: true }).select("id").single();
  workspaceAId = ws.id;
  await admin.from("workspace_members").insert({ workspace_id: workspaceAId, user_id: userAId, role: "owner", status: "active" });
  const clientA = createClient(SUPA_URL, PUB, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: sA } = await clientA.auth.signInWithPassword(userA);
  sessionA = sA.session;
  const clientB = createClient(SUPA_URL, PUB, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: sB } = await clientB.auth.signInWithPassword(userB);
  sessionB = sB.session;
  async function uploadAsA(localPath, title, mime) {
    const bytes = readFileSync(localPath);
    const docId = crypto.randomUUID();
    const fileName = localPath.split("/").pop().replace(/[^A-Za-z0-9._-]+/g, "_");
    const filePath = `${workspaceAId}/${docId}/v1/${fileName}`;
    const { error: upErr } = await clientA.storage.from("documents").upload(filePath, bytes, { contentType: mime });
    if (upErr) throw new Error(`upload ${title}: ${upErr.message}`);
    await clientA.from("documents").insert({ id: docId, workspace_id: workspaceAId, title, file_path: filePath, mime_type: mime, size_bytes: bytes.length, version: 1, created_by: userAId });
    await clientA.from("document_versions").insert({ document_id: docId, workspace_id: workspaceAId, version_number: 1, file_path: filePath, mime_type: mime, size_bytes: bytes.length, created_by: userAId });
    return docId;
  }
  const docxId = await uploadAsA("/tmp/e2e/sample.docx", "Sample docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  const csvId = await uploadAsA("/tmp/e2e/sample.csv", "Sample csv", "text/csv");
  const pdfId = await uploadAsA("/tmp/e2e/pdf1.pdf", "PDF One", "application/pdf");
  const pngId = await uploadAsA("/tmp/e2e/urdu.png", "Urdu image", "image/png");
  check("setup: users + docx + csv + pdf + png ready", true);

  async function convert(docId, session, outputType) {
    const resp = await appFetch(`/api/documents/${docId}/convert`, { session, method: "POST", body: { outputType } });
    return { status: resp.status, body: await resp.json().catch(() => ({})) };
  }

  // ---- validation (runs live without the docserver) ----
  let r = await convert(docxId, sessionA, "xlsx");
  check("convert: a cross-family conversion is refused (400)", r.status === 400, `status ${r.status}, ${r.body.error ?? ""}`);
  r = await convert(docxId, sessionA, "docx");
  check("convert: the same format is refused (400)", r.status === 400, `status ${r.status}`);
  r = await convert(docxId, sessionA, "epub");
  check("convert: an unknown target is refused (400)", r.status === 400, `status ${r.status}`);
  r = await convert(pngId, sessionA, "pdf");
  check("convert: an image cannot be converted (400)", r.status === 400, `status ${r.status}`);
  r = await convert("00000000-0000-0000-0000-000000000000", sessionA, "pdf");
  check("convert: a missing document is refused (404)", r.status === 404, `status ${r.status}`);

  // ---- the conversion itself ----
  if (DOCSERVER_LIVE) {
    r = await convert(docxId, sessionA, "pdf");
    check("convert: DOCX to PDF returns 200 + a new document", r.status === 200 && r.body.ok && r.body.document?.id, `status ${r.status}, ${r.body.error ?? ""}`);
    const newDocId = r.body.document?.id;
    if (newDocId) {
      const { data: newDoc } = await admin.from("documents").select("title, mime_type, version, workspace_id, folder_id").eq("id", newDocId).single();
      check("convert: the new document is a PDF, version 1, same workspace", newDoc?.mime_type === "application/pdf" && newDoc?.version === 1 && newDoc?.workspace_id === workspaceAId, `mime ${newDoc?.mime_type}, version ${newDoc?.version}`);
      const newBytes = await downloadVersion(newDocId, 1);
      check("convert: the new file starts with the PDF magic bytes", newBytes ? new TextDecoder().decode(newBytes.slice(0, 5)) === "%PDF-" : false);
      check("convert: the new title carries the .pdf extension", newDoc?.title.endsWith(".pdf") ?? false, newDoc?.title ?? "");
      const { data: origDoc } = await admin.from("documents").select("version, mime_type").eq("id", docxId).single();
      check("convert: the original is still version 1 and still a DOCX", origDoc?.version === 1 && origDoc?.mime_type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document", `version ${origDoc?.version}`);
      const origBytes = await downloadVersion(docxId, 1);
      const origUpload = readFileSync("/tmp/e2e/sample.docx");
      check("convert: the original bytes are identical to the upload", origBytes ? Buffer.from(origBytes).equals(origUpload) : false);
    }
    r = await convert(csvId, sessionA, "xlsx");
    check("convert: CSV to XLSX returns 200 + a new document", r.status === 200 && r.body.ok && r.body.document?.id, `status ${r.status}, ${r.body.error ?? ""}`);
    r = await convert(pdfId, sessionA, "docx");
    check("convert: PDF to DOCX returns 200 + a new document", r.status === 200 && r.body.ok && r.body.document?.id, `status ${r.status}, ${r.body.error ?? ""}`);
  } else {
    r = await convert(docxId, sessionA, "pdf");
    check("convert: DOCX to PDF fails honestly (502/503 — the docserver is down)", r.status === 502 || r.status === 503, `status ${r.status}, ${r.body.error ?? ""}`);
    const { data: docs } = await admin.from("documents").select("id").eq("workspace_id", workspaceAId);
    check("convert: no new document was created by the failed conversion", (docs ?? []).length === 4, `documents ${docs?.length}`);
  }

  // ---- cross-user + signed-out ----
  r = await convert(docxId, sessionB, "pdf");
  check("convert: user B cannot convert A's document (404)", r.status === 404, `status ${r.status}`);
  r = await convert(docxId, undefined, "pdf");
  check("convert: signed-out convert redirects to login (307)", r.status === 307, `status ${r.status}`);

  // ---- the convert page ----
  const page = await appFetch(`/documents/${docxId}/convert`, { session: sessionA });
  const pageHtml = await page.text();
  check("convert page: loads for A (200) and lists the PDF target", page.status === 200 && pageHtml.includes("PDF (.pdf)"), `status ${page.status}`);
  const pageB = await appFetch(`/documents/${docxId}/convert`, { session: sessionB });
  const pageBHtml = await pageB.text();
  check("convert page: user B sees 'Document not found'", pageB.status === 200 && pageBHtml.includes("Document not found"), `status ${pageB.status}`);
  const pagePng = await appFetch(`/documents/${pngId}/convert`, { session: sessionA });
  const pagePngHtml = await pagePng.text();
  check("convert page: an image shows 'cannot be converted'", pagePng.status === 200 && pagePngHtml.includes("cannot be converted"), `status ${pagePng.status}`);
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
