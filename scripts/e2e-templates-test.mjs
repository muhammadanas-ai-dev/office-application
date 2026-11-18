// Live end-to-end harness for Templates (Day 16).
// Run with the app on :3000:
//   node scripts/e2e-templates-test.mjs
// Creates real test users and deletes them afterwards.
// Temporary harness — not part of the repo.
// Requires the app on http://localhost:3000.
//
// Applying a template is a server action, so the harness drives it
// through the app's own form: it loads /templates, extracts the
// action fields from each template's "Use this template" form, and
// POSTs the multipart form back — exactly what a browser does.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
const userA = { email: `forma-e2e-tpl-a-${suffix}@example.com`, password: "TestPass123!" };
const userB = { email: `forma-e2e-tpl-b-${suffix}@example.com`, password: "TestPass123!" };
let userAId = "", userBId = "", workspaceAId = "", workspaceBId = "";
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
// Find the "Use this template" form for one template id in the
// /templates HTML and pull out the server-action fields.
function extractActionFields(html, templateId) {
  const marker = `name="templateId" value="${templateId}"`;
  const idx = html.indexOf(marker);
  if (idx === -1) return null;
  const formStart = html.lastIndexOf("<form", idx);
  const formEnd = html.indexOf("</form>", idx);
  const formHtml = html.slice(formStart, formEnd);
  const refMatch = formHtml.match(/name="(\$ACTION_REF_\d+)"/);
  const idMatch = formHtml.match(/name="(\$ACTION_\d+:0)" value="([^"]*)"/);
  const prevMatch = formHtml.match(/name="(\$ACTION_\d+:1)" value="([^"]*)"/);
  const keyMatch = formHtml.match(/name="\$ACTION_KEY" value="([^"]*)"/);
  if (!refMatch || !idMatch || !prevMatch || !keyMatch) return null;
  return {
    refName: refMatch[1],
    idName: idMatch[1],
    idValue: idMatch[2].replace(/&quot;/g, '"'),
    prevName: prevMatch[1],
    prevValue: prevMatch[2].replace(/&quot;/g, '"'),
    keyValue: keyMatch[1],
  };
}
async function applyTemplate(session, fields, templateId, title) {
  const form = new FormData();
  form.append(fields.refName, "");
  form.append(fields.idName, fields.idValue);
  form.append(fields.prevName, fields.prevValue);
  form.append("$ACTION_KEY", fields.keyValue);
  form.append("folderId", "");
  form.append("templateId", templateId);
  form.append("title", title);
  return fetch(`${APP}/templates`, {
    method: "POST",
    headers: { Cookie: cookieFor(session) },
    body: form,
    redirect: "manual",
  });
}
function hasZipMagic(bytes) {
  return bytes && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}
// The DOCX content is deflate-compressed inside the ZIP, so the
// plain text is not visible in the raw bytes. Extract
// word/document.xml with unzip and check the text there.
async function docxContainsText(bytes, needle) {
  const dir = mkdtempSync(join(tmpdir(), "forma-tpl-"));
  try {
    const file = join(dir, "doc.docx");
    writeFileSync(file, bytes);
    const { stdout } = await execFileAsync("unzip", ["-p", file, "word/document.xml"]);
    return stdout.includes(needle);
  } catch {
    return false;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

try {
  // ---- setup ----
  const { data: cA } = await admin.auth.admin.createUser({ email: userA.email, password: userA.password, email_confirm: true });
  userAId = cA.user.id;
  const { data: cB } = await admin.auth.admin.createUser({ email: userB.email, password: userB.password, email_confirm: true });
  userBId = cB.user.id;
  await admin.from("profiles").upsert({ id: userAId, display_name: "E2E Templates" }, { onConflict: "id" });
  const { data: wsA } = await admin.from("workspaces").insert({ name: "E2E tpl ws A", owner_id: userAId, plan_key: "free", is_personal: true }).select("id").single();
  workspaceAId = wsA.id;
  await admin.from("workspace_members").insert({ workspace_id: workspaceAId, user_id: userAId, role: "owner", status: "active" });
  const { data: wsB } = await admin.from("workspaces").insert({ name: "E2E tpl ws B", owner_id: userBId, plan_key: "free", is_personal: true }).select("id").single();
  workspaceBId = wsB.id;
  await admin.from("workspace_members").insert({ workspace_id: workspaceBId, user_id: userBId, role: "owner", status: "active" });
  const clientA = createClient(SUPA_URL, PUB, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: sA } = await clientA.auth.signInWithPassword(userA);
  sessionA = sA.session;
  const clientB = createClient(SUPA_URL, PUB, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: sB } = await clientB.auth.signInWithPassword(userB);
  sessionB = sB.session;

  // ---- the gallery renders ----
  const gallery = await appFetch("/templates", { session: sessionA });
  const galleryHtml = await gallery.text();
  check("templates page: loads for A (200)", gallery.status === 200, `status ${gallery.status}`);
  check("templates page: lists Resume, Letter and Report", galleryHtml.includes("Professional Resume") && galleryHtml.includes("Formal Business Letter") && galleryHtml.includes("Business Report"));
  check("templates page: shows the thumbnails", galleryHtml.includes("/templates/resume.png") && galleryHtml.includes("/templates/letter.png") && galleryHtml.includes("/templates/report.png"));
  check("templates page: shows the resume preview text", galleryHtml.includes("Professional Summary") && galleryHtml.includes("Experience"));
  check("templates page: shows the report preview text", galleryHtml.includes("Executive Summary") && galleryHtml.includes("more lines in the template"));

  const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  async function verifyApply(templateId, title, distinctiveText) {
    const fields = extractActionFields(galleryHtml, templateId);
    check(`apply ${templateId}: the form's action fields are extractable`, fields !== null);
    if (!fields) return;
    const resp = await applyTemplate(sessionA, fields, templateId, title);
    check(`apply ${templateId}: the form POST succeeds (${resp.status})`, resp.status === 200 || resp.status === 303, `status ${resp.status}`);
    const { data: doc } = await admin.from("documents").select("id, title, file_path, mime_type, size_bytes, version, workspace_id").eq("workspace_id", workspaceAId).eq("title", title).maybeSingle();
    check(`apply ${templateId}: the document has a file, the DOCX MIME type and version 1`, !!doc && !!doc.file_path && doc.mime_type === DOCX_MIME && doc.version === 1, doc ? `mime ${doc.mime_type}, version ${doc.version}` : "no row");
    if (doc?.file_path) {
      const { data: blob } = await admin.storage.from("documents").download(doc.file_path);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const text = Buffer.from(bytes).toString("latin1");
      const containsText = await docxContainsText(bytes, distinctiveText);
      check(`apply ${templateId}: the stored file is a valid DOCX containing the template's text`, hasZipMagic(bytes) && text.includes("word/document.xml") && containsText, `${bytes.length} bytes`);
      check(`apply ${templateId}: the file name carries the .docx extension`, doc.file_path.endsWith(".docx"), doc.file_path);
      const { data: ver } = await admin.from("document_versions").select("version_number, file_path").eq("document_id", doc.id).eq("version_number", 1).maybeSingle();
      check(`apply ${templateId}: a version-1 row exists`, !!ver && ver.file_path === doc.file_path);
    }
    return doc;
  }

  const resumeDoc = await verifyApply("resume", "My resume", "Professional Summary");
  await verifyApply("letter", "My letter", "Subject:");
  await verifyApply("report", "My report", "Executive Summary");

  // ---- the applied document opens in the editor ----
  if (resumeDoc?.id) {
    const editorPage = await appFetch(`/editor/${resumeDoc.id}`, { session: sessionA });
    const editorHtml = await editorPage.text();
    check("editor: the applied resume opens as a word document (200)", editorPage.status === 200 && editorHtml.includes("word"), `status ${editorPage.status}`);
  }

  // ---- an unknown template id is refused ----
  const fieldsResume = extractActionFields(galleryHtml, "resume");
  const badResp = await applyTemplate(sessionA, fieldsResume, "invoice", "Bad template doc");
  check("apply: an unknown template id is refused (no document created)", badResp.status === 200 || badResp.status === 303, `status ${badResp.status}`);
  const { data: badDoc } = await admin.from("documents").select("id").eq("workspace_id", workspaceAId).eq("title", "Bad template doc").maybeSingle();
  check("apply: the rejected template left no document behind", !badDoc);

  // ---- cross-user isolation ----
  const filesPageB = await appFetch("/files", { session: sessionB });
  const filesHtmlB = await filesPageB.text();
  check("files page: user B does not see A's applied resume", !filesHtmlB.includes("My resume"));
  const galleryB = await appFetch("/templates", { session: sessionB });
  const galleryHtmlB = await galleryB.text();
  const fieldsB = extractActionFields(galleryHtmlB, "letter");
  const bResp = await applyTemplate(sessionB, fieldsB, "letter", "B letter");
  check("apply: user B can apply a template in their own workspace", bResp.status === 200 || bResp.status === 303, `status ${bResp.status}`);
  const { data: bDoc } = await admin.from("documents").select("workspace_id").eq("title", "B letter").maybeSingle();
  check("apply: B's document landed in B's workspace, not A's", bDoc?.workspace_id === workspaceBId, `workspace ${bDoc?.workspace_id}`);

  // ---- signed-out ----
  const signedOut = await fetch(`${APP}/templates`, { method: "POST", body: new FormData(), redirect: "manual" });
  check("apply: signed-out POST redirects to login (307)", signedOut.status === 307, `status ${signedOut.status}`);
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
