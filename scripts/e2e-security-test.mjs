// Live end-to-end harness for PDF security (Day 20).
// Run with the app on :3000:
//   node scripts/e2e-security-test.mjs
// Creates real test users and deletes them afterwards.
// Temporary harness — not part of the repo.
// Requires the app on http://localhost:3000, the fixture
// /tmp/e2e/pdf1.pdf (3 pages, "PDF One page N"), and the qpdf
// binary on this VM (reinstall with `sudo apt-get install qpdf`
// after a VM reset).
import { readFileSync, existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createClient } from "@supabase/supabase-js";

const execFileAsync = promisify(execFile);
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
const userA = { email: `forma-e2e-sec-a-${suffix}@example.com`, password: "TestPass123!" };
const userB = { email: `forma-e2e-sec-b-${suffix}@example.com`, password: "TestPass123!" };
let userAId = "", userBId = "", workspaceAId = "", workspaceBId = "";
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

async function currentBytes(docId) {
  const { data: doc } = await admin.from("documents").select("file_path").eq("id", docId).maybeSingle();
  const { data: blob } = await admin.storage.from("documents").download(doc.file_path);
  return new Uint8Array(await blob.arrayBuffer());
}

// Write bytes to a temp file and run qpdf --show-encryption on
// it, returning the stdout. (qpdf works on files, not stdin.)
async function showEncryption(bytes) {
  const { writeFileSync, unlinkSync } = await import("node:fs");
  const path = `/tmp/e2e-sec-${Date.now()}.pdf`;
  writeFileSync(path, bytes);
  try {
    const { stdout } = await execFileAsync("qpdf", ["--show-encryption", path]);
    return stdout;
  } finally {
    unlinkSync(path);
  }
}

try {
  if (!existsSync("/tmp/e2e/pdf1.pdf")) {
    console.log("MISSING FIXTURE /tmp/e2e/pdf1.pdf — rebuild it with scripts/rebuild-fixtures.mjs first.");
    process.exit(1);
  }
  try {
    await execFileAsync("qpdf", ["--version"]);
  } catch {
    console.log("MISSING qpdf — reinstall it with `sudo apt-get install qpdf` first.");
    process.exit(1);
  }
  // ---- setup ----
  const { data: cA } = await admin.auth.admin.createUser({ email: userA.email, password: userA.password, email_confirm: true });
  userAId = cA.user.id;
  const { data: cB } = await admin.auth.admin.createUser({ email: userB.email, password: userB.password, email_confirm: true });
  userBId = cB.user.id;
  await admin.from("profiles").upsert({ id: userAId, display_name: "E2E Security" }, { onConflict: "id" });
  const { data: wsA } = await admin.from("workspaces").insert({ name: "E2E sec ws A", owner_id: userAId, plan_key: "free", is_personal: true }).select("id").single();
  workspaceAId = wsA.id;
  await admin.from("workspace_members").insert({ workspace_id: workspaceAId, user_id: userAId, role: "owner", status: "active" });
  const { data: wsB } = await admin.from("workspaces").insert({ name: "E2E sec ws B", owner_id: userBId, plan_key: "free", is_personal: true }).select("id").single();
  workspaceBId = wsB.id;
  await admin.from("workspace_members").insert({ workspace_id: workspaceBId, user_id: userBId, role: "owner", status: "active" });
  const clientA = createClient(SUPA_URL, PUB, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: sA } = await clientA.auth.signInWithPassword(userA);
  sessionA = sA.session;
  const clientB = createClient(SUPA_URL, PUB, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: sB } = await clientB.auth.signInWithPassword(userB);
  sessionB = sB.session;

  // ---- upload a PDF ----
  const pdfBytes = readFileSync("/tmp/e2e/pdf1.pdf");
  documentId = crypto.randomUUID();
  const filePath = `${workspaceAId}/${documentId}/v1/security-test.pdf`;
  const { error: upErr } = await admin.storage.from("documents").upload(filePath, pdfBytes, { contentType: "application/pdf" });
  check("setup: the PDF uploads to Storage", !upErr, upErr?.message ?? "");
  await admin.from("documents").insert({ id: documentId, workspace_id: workspaceAId, folder_id: null, title: "Security test", file_path: filePath, mime_type: "application/pdf", size_bytes: pdfBytes.length, version: 1, created_by: userAId });
  await admin.from("document_versions").insert({ document_id: documentId, workspace_id: workspaceAId, version_number: 1, file_path: filePath, mime_type: "application/pdf", size_bytes: pdfBytes.length, created_by: userAId });
  const v1Bytes = pdfBytes;

  // ---- the security page loads ----
  const pageA = await appFetch(`/documents/${documentId}/pdf-security`, { session: sessionA });
  const pageHtmlA = await pageA.text();
  check("security page: loads for A (200)", pageA.status === 200, `status ${pageA.status}`);
  check("security page: shows the protect form", pageHtmlA.includes("Protect this PDF"));
  const pageB = await appFetch(`/documents/${documentId}/pdf-security`, { session: sessionB });
  const pageHtmlB = await pageB.text();
  check("security page: shows 'Document not found' for B", pageB.status === 200 && pageHtmlB.includes("Document not found"), `status ${pageB.status}`);

  // ---- protect it (256-bit, print full, copy off, edit off, annotate off) ----
  const protectResp = await appFetch(`/api/documents/${documentId}/pdf/protect`, { session: sessionA, method: "POST", body: { userPassword: "opensesame", bits: "256", permissions: { print: "full", extract: false, modify: "none", annotate: false } } });
  const protectData = await protectResp.json().catch(() => ({}));
  check("protect: succeeds (200) and creates version 2", protectResp.status === 200 && protectData.version === 2, `status ${protectResp.status}, version ${protectData.version}`);
  const protectedBytes = await currentBytes(documentId);
  const encInfo = await showEncryption(protectedBytes);
  check("protect: the stored file is encrypted (R=6, AES-256)", encInfo.includes("R = 6") && encInfo.includes("AESv3"), encInfo.split("\n").slice(0, 3).join(" | "));
  check("protect: copying text is not allowed", encInfo.includes("extract for any purpose: not allowed"));
  check("protect: printing is allowed", encInfo.includes("print high resolution: allowed"));
  check("protect: editing is not allowed", encInfo.includes("modify anything: not allowed"));
  // pdf-lib must refuse the protected file.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  try {
    await (await pdfjs.getDocument({ data: protectedBytes })).promise;
    check("protect: PDF.js refuses the protected file without a password", false, "it loaded");
  } catch (err) {
    check("protect: PDF.js refuses the protected file without a password", String(err.message).toLowerCase().includes("password"), String(err.message).slice(0, 80));
  }

  // ---- the security page now shows the protected state ----
  const pageA2 = await appFetch(`/documents/${documentId}/pdf-security`, { session: sessionA });
  const pageHtmlA2 = await pageA2.text();
  check("security page: shows the protected state", pageHtmlA2.includes("This PDF is protected"));
  // React inserts <!-- --> between adjacent text/expression
  // nodes in the server-rendered HTML, so "256-bit AES" reads
  // as "256<!-- -->-bit AES" — strip the comments before
  // checking.
  const pageTextA2 = pageHtmlA2.replace(/<!-- -->/g, "");
  check("security page: shows the 256-bit strength", pageTextA2.includes("256-bit AES"));

  // ---- protect again (already encrypted) is refused ----
  const protectAgain = await appFetch(`/api/documents/${documentId}/pdf/protect`, { session: sessionA, method: "POST", body: { userPassword: "anotherpass", bits: "256", permissions: { print: "full", extract: true, modify: "all", annotate: true } } });
  check("validation: protecting an already-protected PDF is refused (400)", protectAgain.status === 400, `status ${protectAgain.status}`);

  // ---- unlock with a WRONG password is refused ----
  const wrongUnlock = await appFetch(`/api/documents/${documentId}/pdf/unlock`, { session: sessionA, method: "POST", body: { password: "wrongpass" } });
  const wrongData = await wrongUnlock.json().catch(() => ({}));
  check("validation: a wrong password is refused (400)", wrongUnlock.status === 400, `status ${wrongUnlock.status}, error ${wrongData.error}`);

  // ---- unlock with the RIGHT password ----
  const unlockResp = await appFetch(`/api/documents/${documentId}/pdf/unlock`, { session: sessionA, method: "POST", body: { password: "opensesame" } });
  const unlockData = await unlockResp.json().catch(() => ({}));
  check("unlock: succeeds (200) and creates version 3", unlockResp.status === 200 && unlockData.version === 3, `status ${unlockResp.status}, version ${unlockData.version}`);
  const unlockedBytes = await currentBytes(documentId);
  const decInfo = await showEncryption(unlockedBytes);
  check("unlock: the stored file is not encrypted", decInfo.includes("File is not encrypted"));
  const unlockedPdf = await (await pdfjs.getDocument({ data: unlockedBytes })).promise;
  check("unlock: the file loads in PDF.js with 3 pages", unlockedPdf.numPages === 3, `pages ${unlockedPdf.numPages}`);

  // ---- unlock a PDF that is not protected is refused ----
  const unlockPlain = await appFetch(`/api/documents/${documentId}/pdf/unlock`, { session: sessionA, method: "POST", body: { password: "opensesame" } });
  check("validation: unlocking an unprotected PDF is refused (400)", unlockPlain.status === 400, `status ${unlockPlain.status}`);

  // ---- a short password is refused ----
  const shortPass = await appFetch(`/api/documents/${documentId}/pdf/protect`, { session: sessionA, method: "POST", body: { userPassword: "abc", bits: "256", permissions: { print: "full", extract: true, modify: "all", annotate: true } } });
  check("validation: a password under 4 characters is refused (400)", shortPass.status === 400, `status ${shortPass.status}`);

  // ---- version 1 is unchanged ----
  const { data: v1 } = await admin.from("document_versions").select("file_path").eq("document_id", documentId).eq("version_number", 1).maybeSingle();
  const { data: v1Blob } = await admin.storage.from("documents").download(v1.file_path);
  const v1Downloaded = new Uint8Array(await v1Blob.arrayBuffer());
  check("versions: version 1 is byte-identical to the upload", Buffer.compare(Buffer.from(v1Downloaded), Buffer.from(v1Bytes)) === 0, `${v1Downloaded.length} bytes`);

  // ---- cross-user isolation ----
  const protectB = await appFetch(`/api/documents/${documentId}/pdf/protect`, { session: sessionB, method: "POST", body: { userPassword: "opensesame", bits: "256", permissions: { print: "full", extract: true, modify: "all", annotate: true } } });
  check("isolation: user B gets 404 on protect", protectB.status === 404, `status ${protectB.status}`);
  const unlockB = await appFetch(`/api/documents/${documentId}/pdf/unlock`, { session: sessionB, method: "POST", body: { password: "opensesame" } });
  check("isolation: user B gets 404 on unlock", unlockB.status === 404, `status ${unlockB.status}`);

  // ---- signed-out ----
  const soProtect = await fetch(`${APP}/api/documents/${documentId}/pdf/protect`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userPassword: "opensesame", bits: "256", permissions: { print: "full", extract: true, modify: "all", annotate: true } }), redirect: "manual" });
  check("signed-out: protect redirects to login (307)", soProtect.status === 307, `status ${soProtect.status}`);
  const soUnlock = await fetch(`${APP}/api/documents/${documentId}/pdf/unlock`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "opensesame" }), redirect: "manual" });
  check("signed-out: unlock redirects to login (307)", soUnlock.status === 307, `status ${soUnlock.status}`);
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
