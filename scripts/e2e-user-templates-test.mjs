// Live end-to-end harness for user-created templates (Day 31).
// Run with the app on :3000:
//   node scripts/e2e-user-templates-test.mjs
// Creates real test users and deletes them afterwards.
// Requires the Day 31 migration applied (the user_templates
// table) — without it, the save/list/apply/delete actions
// return the honest setup error and the harness fails loudly.
//
// The save/apply/rename/delete are driven through the app's
// own forms: the harness loads the page, finds the form by the
// fields it carries, and POSTs it — exactly what a browser does.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const APP = "http://localhost:3000";
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
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
const admin = createClient(SUPA_URL, SVC, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const suffix = Date.now().toString(36);
const userA = {
  email: `forma-e2e-utpl-a-${suffix}@example.com`,
  password: "TestPass123!",
};
const userB = {
  email: `forma-e2e-utpl-b-${suffix}@example.com`,
  password: "TestPass123!",
};
let userAId = "",
  userBId = "",
  workspaceAId = "",
  workspaceBId = "";
let sessionA = null,
  sessionB = null;

function cookieFor(session) {
  return `sb-${REF}-auth-token=${encodeURIComponent(JSON.stringify(session))}`;
}
async function appFetch(path, { session, method = "GET", body } = {}) {
  const headers = {};
  if (session) headers.Cookie = cookieFor(session);
  return fetch(`${APP}${path}`, {
    method,
    headers,
    body,
    redirect: "manual",
  });
}

// Find a server-action form in the HTML: the form whose HTML
// contains ALL of the given markers (e.g. a template id + the
// field that distinguishes the apply form from the rename and
// delete forms). Returns the action fields for that form.
function findForm(html, markers) {
  const formRe = /<form[\s\S]*?<\/form>/g;
  let m;
  while ((m = formRe.exec(html)) !== null) {
    const formHtml = m[0];
    if (!markers.every((marker) => formHtml.includes(marker))) continue;
    const refMatch = formHtml.match(/name="(\$ACTION_REF_\d+)"/);
    const idMatch = formHtml.match(/name="(\$ACTION_\d+:0)" value="([^"]*)"/);
    const prevMatch = formHtml.match(/name="(\$ACTION_\d+:1)" value="([^"]*)"/);
    const keyMatch = formHtml.match(/name="\$ACTION_KEY" value="([^"]*)"/);
    if (!refMatch || !idMatch || !prevMatch || !keyMatch) continue;
    return {
      refName: refMatch[1],
      idName: idMatch[1],
      idValue: idMatch[2].replace(/&quot;/g, '"'),
      prevName: prevMatch[1],
      prevValue: prevMatch[2].replace(/&quot;/g, '"'),
      keyValue: keyMatch[1],
    };
  }
  return null;
}

async function postAction(session, path, fields, extra, file) {
  const form = new FormData();
  form.append(fields.refName, "");
  form.append(fields.idName, fields.idValue);
  form.append(fields.prevName, fields.prevValue);
  form.append("$ACTION_KEY", fields.keyValue);
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  if (file) form.append("file", file.blob, file.name);
  return fetch(`${APP}${path}`, {
    method: "POST",
    headers: { Cookie: cookieFor(session) },
    body: form,
    redirect: "manual",
  });
}

try {
  // ---- setup ----
  const { data: cA } = await admin.auth.admin.createUser({
    email: userA.email,
    password: userA.password,
    email_confirm: true,
  });
  userAId = cA.user.id;
  const { data: cB } = await admin.auth.admin.createUser({
    email: userB.email,
    password: userB.password,
    email_confirm: true,
  });
  userBId = cB.user.id;
  await admin
    .from("profiles")
    .upsert({ id: userAId, display_name: "E2E User Templates" }, { onConflict: "id" });
  const { data: wsA } = await admin
    .from("workspaces")
    .insert({ name: "E2E utpl ws A", owner_id: userAId, plan_key: "free", is_personal: true })
    .select("id")
    .single();
  workspaceAId = wsA.id;
  await admin
    .from("workspace_members")
    .insert({ workspace_id: workspaceAId, user_id: userAId, role: "owner", status: "active" });
  const { data: wsB } = await admin
    .from("workspaces")
    .insert({ name: "E2E utpl ws B", owner_id: userBId, plan_key: "free", is_personal: true })
    .select("id")
    .single();
  workspaceBId = wsB.id;
  await admin
    .from("workspace_members")
    .insert({ workspace_id: workspaceBId, user_id: userBId, role: "owner", status: "active" });
  const clientA = createClient(SUPA_URL, PUB, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: sA } = await clientA.auth.signInWithPassword(userA);
  sessionA = sA.session;
  const clientB = createClient(SUPA_URL, PUB, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: sB } = await clientB.auth.signInWithPassword(userB);
  sessionB = sB.session;

  // ---- the table exists ----
  // NOTE: a head:true count query gives a FALSE POSITIVE for table
  // existence (PostgREST returns 404 with an empty body, which the
  // client does not surface as an error) — verify with a real
  // select().limit(1).
  const { error: tableError } = await admin
    .from("user_templates")
    .select("id")
    .limit(1);
  check(
    "user_templates table: exists (the Day 31 migration is applied)",
    !tableError,
    tableError ? tableError.message : ""
  );
  if (tableError) throw new Error("The Day 31 migration is not applied.");

  // ---- upload a document to save as a template ----
  const filesPage = await appFetch("/files", { session: sessionA });
  const filesHtml = await filesPage.text();
  const uploadForm = findForm(filesHtml, ['name="file"', 'name="folderId"']);
  check("setup: the library upload form is present", uploadForm !== null);
  let doc = null;
  if (uploadForm) {
    const docx = readFileSync("src/lib/templates/resume.docx");
    const upResp = await postAction(
      sessionA,
      "/files",
      uploadForm,
      { folderId: "" },
      {
        blob: new Blob([docx], {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
        name: "My contract source.docx",
      }
    );
    check("setup: the upload POST succeeds", upResp.status === 200 || upResp.status === 303, `status ${upResp.status}`);
    const found = await admin
      .from("documents")
      .select("id, title, file_path, mime_type, size_bytes")
      .eq("workspace_id", workspaceAId)
      .eq("title", "My contract source")
      .maybeSingle();
    doc = found.data;
    check("setup: a document with a file exists for A", !!doc?.file_path, doc ? doc.file_path : "no doc");
  }
  if (!doc) throw new Error("Could not upload the source document.");

  // ---- the Save as template form is on the library page ----
  // Re-fetch the page AFTER the upload — the HTML fetched before
  // the upload does not list the new document yet.
  const filesPageAfter = await appFetch("/files", { session: sessionA });
  const filesHtmlAfter = await filesPageAfter.text();
  check("files page: the Save as template form is present", filesHtmlAfter.includes("Save as template"));
  const saveForm = findForm(filesHtmlAfter, [
    `name="documentId" value="${doc.id}"`,
    'name="name"',
    'name="description"',
  ]);
  check("save: the form's action fields are extractable", saveForm !== null);
  let tpl = null;
  if (saveForm) {
    const saveResp = await postAction(sessionA, "/files", saveForm, {
      documentId: doc.id,
      name: "My contract template",
      description: "The standard client contract.",
    });
    check("save: the form POST succeeds", saveResp.status === 200 || saveResp.status === 303, `status ${saveResp.status}`);
    const found = await admin
      .from("user_templates")
      .select("id, name, description, file_path, mime_type, size_bytes, source_document_id, workspace_id")
      .eq("workspace_id", workspaceAId)
      .eq("name", "My contract template")
      .maybeSingle();
    tpl = found.data;
    check(
      "save: the template row exists with the right fields",
      !!tpl &&
        tpl.description === "The standard client contract." &&
        tpl.source_document_id === doc.id &&
        tpl.mime_type === doc.mime_type &&
        tpl.size_bytes === doc.size_bytes,
      tpl ? `mime ${tpl.mime_type}` : "no row"
    );
    check(
      "save: the template file is a separate copy (not the document's path)",
      !!tpl && tpl.file_path !== doc.file_path && tpl.file_path.startsWith(`${workspaceAId}/templates/`),
      tpl ? tpl.file_path : "no row"
    );
    if (tpl) {
      const { data: blob } = await admin.storage.from("documents").download(tpl.file_path);
      check("save: the template file exists in Storage", !!blob);
    }
  }
  if (!tpl) throw new Error("Could not save the template.");

  // ---- the gallery lists it ----
  const gallery = await appFetch("/templates", { session: sessionA });
  const galleryHtml = await gallery.text();
  check("gallery: loads for A (200)", gallery.status === 200, `status ${gallery.status}`);
  check(
    "gallery: lists the custom template in My templates",
    galleryHtml.includes("My templates") &&
      galleryHtml.includes("My contract template") &&
      galleryHtml.includes("The standard client contract.")
  );
  check("gallery: shows the template's file type", galleryHtml.includes("Word"));

  // ---- apply it ----
  const applyForm = findForm(galleryHtml, [
    `name="templateId" value="${tpl.id}"`,
    'name="title"',
  ]);
  check("apply: the form's action fields are extractable", applyForm !== null);
  if (applyForm) {
    const applyResp = await postAction(sessionA, "/templates", applyForm, {
      templateId: tpl.id,
      title: "New contract from template",
      folderId: "",
    });
    check("apply: the form POST succeeds", applyResp.status === 200 || applyResp.status === 303, `status ${applyResp.status}`);
    const { data: newDoc } = await admin
      .from("documents")
      .select("id, title, file_path, mime_type, version")
      .eq("workspace_id", workspaceAId)
      .eq("title", "New contract from template")
      .maybeSingle();
    check(
      "apply: a new document exists with the template's MIME type and version 1",
      !!newDoc && newDoc.mime_type === tpl.mime_type && newDoc.version === 1,
      newDoc ? `mime ${newDoc.mime_type}` : "no row"
    );
    check(
      "apply: the new document's file is a copy, not the template's path",
      !!newDoc && newDoc.file_path !== tpl.file_path,
      newDoc ? newDoc.file_path : "no row"
    );
    if (newDoc) {
      const { data: ver } = await admin
        .from("document_versions")
        .select("version_number, file_path")
        .eq("document_id", newDoc.id)
        .eq("version_number", 1)
        .maybeSingle();
      check("apply: a version-1 row exists", !!ver && ver.file_path === newDoc.file_path);
    }
  }

  // ---- rename it ----
  const gallery2 = await appFetch("/templates", { session: sessionA });
  const galleryHtml2 = await gallery2.text();
  const renameForm = findForm(galleryHtml2, [
    `name="templateId" value="${tpl.id}"`,
    'name="name"',
    'name="description"',
  ]);
  check("rename: the form's action fields are extractable", renameForm !== null);
  if (renameForm) {
    const renameResp = await postAction(sessionA, "/templates", renameForm, {
      templateId: tpl.id,
      name: "Renamed contract template",
      description: "Renamed.",
    });
    check("rename: the form POST succeeds", renameResp.status === 200 || renameResp.status === 303, `status ${renameResp.status}`);
    const { data: renamed } = await admin
      .from("user_templates")
      .select("name, description")
      .eq("id", tpl.id)
      .maybeSingle();
    check(
      "rename: the name and description changed",
      renamed?.name === "Renamed contract template" && renamed?.description === "Renamed."
    );
  }

  // ---- delete it ----
  const gallery3 = await appFetch("/templates", { session: sessionA });
  const galleryHtml3 = await gallery3.text();
  // The delete form is the one with this template id that has
  // neither a title input (apply) nor a name input (rename).
  const deleteForm = findForm(galleryHtml3, [`name="templateId" value="${tpl.id}"`]);
  // findForm returns the FIRST matching form (the apply form), so
  // instead find all forms with the marker and take the one that
  // has no title/name input.
  let deleteFields = null;
  const formRe = /<form[\s\S]*?<\/form>/g;
  let m;
  while ((m = formRe.exec(galleryHtml3)) !== null) {
    const formHtml = m[0];
    if (!formHtml.includes(`name="templateId" value="${tpl.id}"`)) continue;
    if (formHtml.includes('name="title"') || formHtml.includes('name="name"')) continue;
    const refMatch = formHtml.match(/name="(\$ACTION_REF_\d+)"/);
    const idMatch = formHtml.match(/name="(\$ACTION_\d+:0)" value="([^"]*)"/);
    const prevMatch = formHtml.match(/name="(\$ACTION_\d+:1)" value="([^"]*)"/);
    const keyMatch = formHtml.match(/name="\$ACTION_KEY" value="([^"]*)"/);
    if (!refMatch || !idMatch || !prevMatch || !keyMatch) continue;
    deleteFields = {
      refName: refMatch[1],
      idName: idMatch[1],
      idValue: idMatch[2].replace(/&quot;/g, '"'),
      prevName: prevMatch[1],
      prevValue: prevMatch[2].replace(/&quot;/g, '"'),
      keyValue: keyMatch[1],
    };
    break;
  }
  check("delete: the form's action fields are extractable", deleteFields !== null);
  if (deleteFields) {
    const deleteResp = await postAction(sessionA, "/templates", deleteFields, {
      templateId: tpl.id,
    });
    check("delete: the form POST succeeds", deleteResp.status === 200 || deleteResp.status === 303, `status ${deleteResp.status}`);
    const { data: gone } = await admin
      .from("user_templates")
      .select("id")
      .eq("id", tpl.id)
      .maybeSingle();
    check("delete: the template row is gone", !gone);
    const { data: removed } = await admin.storage.from("documents").download(tpl.file_path);
    check("delete: the template file is gone from Storage", !removed);
    const { data: source } = await admin
      .from("documents")
      .select("id")
      .eq("id", doc.id)
      .maybeSingle();
    check("delete: the source document survives", !!source);
  }

  // ---- cross-user isolation ----
  const galleryB = await appFetch("/templates", { session: sessionB });
  const galleryHtmlB = await galleryB.text();
  check(
    "gallery: user B does not see A's template",
    !galleryHtmlB.includes("My contract template") && !galleryHtmlB.includes("Renamed contract template")
  );
  check("gallery: user B sees the empty My templates state", galleryHtmlB.includes("No custom templates yet"));

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
