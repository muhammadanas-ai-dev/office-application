// Live end-to-end harness for "New blank document" (Day 15).
// Run with the app on :3000:
//   node scripts/e2e-blank-document-test.mjs
// Creates real test users and deletes them afterwards.
// Temporary harness — not part of the repo.
// Requires the app on http://localhost:3000.
//
// The create flow is a server action, so the harness drives it
// through the app's own form: it loads /files, extracts the
// action fields from the rendered "New blank document" form, and
// POSTs the multipart form back — exactly what a browser does.
import { readFileSync } from "node:fs";
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
const userA = { email: `forma-e2e-blank-a-${suffix}@example.com`, password: "TestPass123!" };
const userB = { email: `forma-e2e-blank-b-${suffix}@example.com`, password: "TestPass123!" };
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
// Find the "New blank document" form in the /files HTML and pull
// out the server-action fields Next.js needs to route the POST.
function extractActionFields(html) {
  const formStart = html.indexOf("New blank document");
  if (formStart === -1) return null;
  const formHtml = html.slice(html.lastIndexOf("<form", formStart), formStart);
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
async function createBlank(session, fields, title, type) {
  const form = new FormData();
  form.append(fields.refName, "");
  form.append(fields.idName, fields.idValue);
  form.append(fields.prevName, fields.prevValue);
  form.append("$ACTION_KEY", fields.keyValue);
  form.append("folderId", "");
  form.append("title", title);
  form.append("type", type);
  const resp = await fetch(`${APP}/files`, {
    method: "POST",
    headers: { Cookie: cookieFor(session) },
    body: form,
    redirect: "manual",
  });
  return resp;
}
function hasZipMagic(bytes) {
  return bytes && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}
function zipHasEntry(bytes, entry) {
  // Scan the local file headers for the entry name.
  const text = Buffer.from(bytes).toString("latin1");
  return text.includes(entry);
}

try {
  // ---- setup ----
  const { data: cA } = await admin.auth.admin.createUser({ email: userA.email, password: userA.password, email_confirm: true });
  userAId = cA.user.id;
  const { data: cB } = await admin.auth.admin.createUser({ email: userB.email, password: userB.password, email_confirm: true });
  userBId = cB.user.id;
  await admin.from("profiles").upsert({ id: userAId, display_name: "E2E Blank" }, { onConflict: "id" });
  const { data: wsA } = await admin.from("workspaces").insert({ name: "E2E blank ws A", owner_id: userAId, plan_key: "free", is_personal: true }).select("id").single();
  workspaceAId = wsA.id;
  await admin.from("workspace_members").insert({ workspace_id: workspaceAId, user_id: userAId, role: "owner", status: "active" });
  const { data: wsB } = await admin.from("workspaces").insert({ name: "E2E blank ws B", owner_id: userBId, plan_key: "free", is_personal: true }).select("id").single();
  workspaceBId = wsB.id;
  await admin.from("workspace_members").insert({ workspace_id: workspaceBId, user_id: userBId, role: "owner", status: "active" });
  const clientA = createClient(SUPA_URL, PUB, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: sA } = await clientA.auth.signInWithPassword(userA);
  sessionA = sA.session;
  const clientB = createClient(SUPA_URL, PUB, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: sB } = await clientB.auth.signInWithPassword(userB);
  sessionB = sB.session;

  // ---- the form renders with the type selector ----
  const filesPage = await appFetch("/files", { session: sessionA });
  const filesHtml = await filesPage.text();
  check("files page: loads for A (200) and shows the blank-document form", filesPage.status === 200 && filesHtml.includes("New blank document"), `status ${filesPage.status}`);
  check("files page: offers Document, Spreadsheet and Presentation", filesHtml.includes("Document") && filesHtml.includes("Spreadsheet") && filesHtml.includes("Presentation"));
  const fields = extractActionFields(filesHtml);
  check("files page: the create action fields are extractable", fields !== null);

  async function verifyBlank(title, type, mime, mainPart) {
    const resp = await createBlank(sessionA, fields, title, type);
    const okStatus = resp.status === 200 || resp.status === 303;
    check(`create blank ${type}: the form POST succeeds (${resp.status})`, okStatus, `status ${resp.status}`);
    const { data: doc } = await admin.from("documents").select("id, title, file_path, mime_type, size_bytes, version, workspace_id").eq("workspace_id", workspaceAId).eq("title", title).maybeSingle();
    check(`create blank ${type}: the document has a file, the right MIME type and version 1`, !!doc && !!doc.file_path && doc.mime_type === mime && doc.version === 1, doc ? `mime ${doc.mime_type}, version ${doc.version}` : "no row");
    if (doc?.file_path) {
      const { data: blob } = await admin.storage.from("documents").download(doc.file_path);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      check(`create blank ${type}: the stored file is a valid Office file`, hasZipMagic(bytes) && zipHasEntry(bytes, "[Content_Types].xml") && zipHasEntry(bytes, mainPart), `${bytes.length} bytes`);
      check(`create blank ${type}: the file name carries the .${type} extension`, doc.file_path.endsWith(`.${type}`), doc.file_path);
      const { data: ver } = await admin.from("document_versions").select("version_number, file_path").eq("document_id", doc.id).eq("version_number", 1).maybeSingle();
      check(`create blank ${type}: a version-1 row exists`, !!ver && ver.file_path === doc.file_path);
    }
    return doc;
  }

  const docx = await verifyBlank("Blank report", "docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "word/document.xml");
  await verifyBlank("Blank sheet", "xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xl/workbook.xml");
  await verifyBlank("Blank deck", "pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "ppt/presentation.xml");

  // ---- the blank document opens in the editor ----
  if (docx?.id) {
    const editorPage = await appFetch(`/editor/${docx.id}`, { session: sessionA });
    const editorHtml = await editorPage.text();
    check("editor: the blank DOCX opens as a word document (200)", editorPage.status === 200 && editorHtml.includes("word"), `status ${editorPage.status}`);
  }

  // ---- an unknown type is rejected (no document created) ----
  const badResp = await createBlank(sessionA, fields, "Bad type doc", "pdf");
  check("create blank: an unknown type is refused (no document created)", (badResp.status === 200 || badResp.status === 303), `status ${badResp.status}`);
  const { data: badDoc } = await admin.from("documents").select("id").eq("workspace_id", workspaceAId).eq("title", "Bad type doc").maybeSingle();
  check("create blank: the rejected type left no document behind", !badDoc);

  // ---- cross-user isolation ----
  const filesPageB = await appFetch("/files", { session: sessionB });
  const filesHtmlB = await filesPageB.text();
  check("files page: user B does not see A's blank document", !filesHtmlB.includes("Blank report"));
  const fieldsB = extractActionFields(filesHtmlB);
  const bResp = await createBlank(sessionB, fieldsB, "B blank doc", "docx");
  check("create blank: user B can create in their own workspace", bResp.status === 200 || bResp.status === 303, `status ${bResp.status}`);
  const { data: bDoc } = await admin.from("documents").select("workspace_id").eq("title", "B blank doc").maybeSingle();
  check("create blank: B's document landed in B's workspace, not A's", bDoc?.workspace_id === workspaceBId, `workspace ${bDoc?.workspace_id}`);

  // ---- signed-out ----
  const signedOut = await fetch(`${APP}/files`, { method: "POST", body: new FormData(), redirect: "manual" });
  check("create blank: signed-out POST redirects to login (307)", signedOut.status === 307, `status ${signedOut.status}`);
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
