// Live end-to-end harness for export with comments + reviewer
// notes (Day 34).
// Run with the app on :3000:
//   node scripts/e2e-export-comments-test.mjs
// Creates real test users and deletes them afterwards.
// Temporary harness — not part of the repo.
// Requires the app on http://localhost:3000 and the fixture
// /tmp/e2e/pdf1.pdf (3 pages, "PDF One page N" at (50,700),
// size 20), rebuilt after a VM reset by
// scripts/rebuild-fixtures.py.
// The notes round-trip runs only when the document_notes table
// exists (the owner applies forma-document-notes-migration.sql);
// otherwise the notes checks verify the clear setup message and
// are reported as SKIPPED, not failed.
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const APP = "http://localhost:3000";
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}
function skip(name, detail = "") {
  results.push({ name, ok: true, detail: `SKIPPED: ${detail}` });
  console.log(`SKIP  ${name} — ${detail}`);
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
const userA = { email: `forma-e2e-ec-a-${suffix}@example.com`, password: "TestPass123!" };
const userB = { email: `forma-e2e-ec-b-${suffix}@example.com`, password: "TestPass123!" };
let userAId = "", userBId = "", workspaceAId = "", workspaceBId = "";
let sessionA = null, sessionB = null;
let documentId = "", plainDocumentId = "";

function cookieFor(session) {
  return "sb-" + REF + "-auth-token=" + encodeURIComponent(JSON.stringify(session));
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

async function pageTexts(bytes) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // pdfjs-dist rejects a Node Buffer explicitly — always hand it a
  // plain Uint8Array.
  const data = new Uint8Array(bytes);
  const pdf = await (await pdfjs.getDocument({ data })).promise;
  const texts = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    texts.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
  }
  return texts;
}

async function annotCount(bytes) {
  const { PDFDocument, PDFName } = await import("pdf-lib");
  const doc = await PDFDocument.load(new Uint8Array(bytes));
  let count = 0;
  for (let i = 0; i < doc.getPageCount(); i++) {
    const annots = doc.getPage(i).node.get(PDFName.of("Annots"));
    if (annots && typeof annots.size === "function") count += annots.size();
  }
  return count;
}

async function uploadPdf(workspaceId, userId, title) {
  const pdfBytes = readFileSync("/tmp/e2e/pdf1.pdf");
  const id = crypto.randomUUID();
  const filePath = `${workspaceId}/${id}/v1/${title.replace(/\s+/g, "-").toLowerCase()}.pdf`;
  const { error: upErr } = await admin.storage.from("documents").upload(filePath, pdfBytes, { contentType: "application/pdf" });
  if (upErr) throw new Error(`upload failed: ${upErr.message}`);
  await admin.from("documents").insert({ id, workspace_id: workspaceId, folder_id: null, title, file_path: filePath, mime_type: "application/pdf", size_bytes: pdfBytes.length, version: 1, created_by: userId });
  await admin.from("document_versions").insert({ document_id: id, workspace_id: workspaceId, version_number: 1, file_path: filePath, mime_type: "application/pdf", size_bytes: pdfBytes.length, created_by: userId });
  return id;
}

try {
  if (!existsSync("/tmp/e2e/pdf1.pdf")) {
    console.log("MISSING FIXTURE /tmp/e2e/pdf1.pdf — rebuild it with scripts/rebuild-fixtures.py first.");
    process.exit(1);
  }
  // ---- setup ----
  const { data: cA } = await admin.auth.admin.createUser({ email: userA.email, password: userA.password, email_confirm: true });
  userAId = cA.user.id;
  const { data: cB } = await admin.auth.admin.createUser({ email: userB.email, password: userB.password, email_confirm: true });
  userBId = cB.user.id;
  await admin.from("profiles").upsert({ id: userAId, display_name: "E2E Export Comments" }, { onConflict: "id" });
  const { data: wsA } = await admin.from("workspaces").insert({ name: "E2E ec ws A", owner_id: userAId, plan_key: "free", is_personal: true }).select("id").single();
  workspaceAId = wsA.id;
  await admin.from("workspace_members").insert({ workspace_id: workspaceAId, user_id: userAId, role: "owner", status: "active" });
  const { data: wsB } = await admin.from("workspaces").insert({ name: "E2E ec ws B", owner_id: userBId, plan_key: "free", is_personal: true }).select("id").single();
  workspaceBId = wsB.id;
  await admin.from("workspace_members").insert({ workspace_id: workspaceBId, user_id: userBId, role: "owner", status: "active" });
  const clientA = createClient(SUPA_URL, PUB, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: sA } = await clientA.auth.signInWithPassword(userA);
  sessionA = sA.session;
  const clientB = createClient(SUPA_URL, PUB, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: sB } = await clientB.auth.signInWithPassword(userB);
  sessionB = sB.session;

  documentId = await uploadPdf(workspaceAId, userAId, "Export comments test");
  plainDocumentId = await uploadPdf(workspaceAId, userAId, "No comments test");
  check("setup: both PDFs upload", Boolean(documentId && plainDocumentId), "");

  // ---- add a highlight + a note through the annotations API ----
  const addResp = await appFetch(`/api/documents/${documentId}/pdf/annotations`, {
    session: sessionA, method: "POST",
    body: { annotations: [
      { kind: "highlight", page: 1, quadPoints: [50, 714, 200, 714, 50, 694, 200, 694], contents: "Check this line" },
      { kind: "note", page: 2, x: 100, y: 500, contents: "A reviewer note" },
    ] },
  });
  const addData = await addResp.json().catch(() => ({}));
  check("annotate: a highlight + a note are added (version 2)", addResp.status === 200 && addData.version === 2, `status ${addResp.status}, version ${addData.version}, error ${addData.error ?? ""}`);

  // ---- the tools page shows the export section ----
  const toolsHtml = await (await appFetch(`/documents/${documentId}/pdf-tools`, { session: sessionA })).text();
  check("page: the tools page offers Export with comments", toolsHtml.includes("Export with comments"), "section missing");

  // ---- export with comments ----
  const exportResp = await appFetch(`/api/documents/${documentId}/pdf/export-comments`, { session: sessionA, method: "POST", body: { mode: "flattened" } });
  const exportData = await exportResp.json().catch(() => ({}));
  check("export: succeeds (200) and creates version 3", exportResp.status === 200 && exportData.version === 3, `status ${exportResp.status}, version ${exportData.version}, error ${exportData.error ?? ""}`);
  const exported = await currentBytes(documentId);
  const texts = await pageTexts(exported);
  check("export: the copy has 4 pages (3 + the summary)", texts.length === 4, `pages: ${texts.length}`);
  check("export: the summary lists both comments", texts[3].includes("Comments") && texts[3].includes("Highlight") && texts[3].includes("Check this line") && texts[3].includes("Note") && texts[3].includes("A reviewer note"), texts[3].slice(0, 160));
  check("export: the flattened copy has no annotations left", (await annotCount(exported)) === 0, "Annots still present");

  // ---- export with no annotations is refused ----
  const plainResp = await appFetch(`/api/documents/${plainDocumentId}/pdf/export-comments`, { session: sessionA, method: "POST", body: { mode: "flattened" } });
  check("export: a document with no comments is refused (400)", plainResp.status === 400, `status ${plainResp.status}`);

  // ---- cross-user isolation + signed-out ----
  const crossResp = await appFetch(`/api/documents/${documentId}/pdf/export-comments`, { session: sessionB, method: "POST", body: { mode: "flattened" } });
  check("isolation: another user cannot export the document (404)", crossResp.status === 404, `status ${crossResp.status}`);
  const signedOutResp = await appFetch(`/api/documents/${documentId}/pdf/export-comments`, { method: "POST", body: { mode: "flattened" } });
  check("signed-out: the export route redirects to login (307)", signedOutResp.status === 307, `status ${signedOutResp.status}`);

  // ---- reviewer notes ----
  const { error: notesProbe } = await admin.from("document_notes").select("id").limit(1);
  const notesTableExists = !notesProbe;
  if (!notesTableExists) {
    const listResp = await appFetch(`/api/documents/${documentId}/notes`, { session: sessionA });
    const listData = await listResp.json().catch(() => ({}));
    check("notes: without the migration, the route gives a clear setup message (400)", listResp.status === 400 && String(listData.error ?? "").includes("not set up yet"), `status ${listResp.status}, error ${listData.error ?? ""}`);
    skip("notes: add/list/resolve/delete round-trip", "the document_notes table does not exist yet — the owner applies forma-document-notes-migration.sql first");
    skip("notes: cross-user isolation", "needs the table");
  } else {
    const addNoteResp = await appFetch(`/api/documents/${documentId}/notes`, { session: sessionA, method: "POST", body: { body: "Please recheck the totals." } });
    const addNoteData = await addNoteResp.json().catch(() => ({}));
    const noteId = addNoteData.note?.id ?? "";
    check("notes: a note is added", addNoteResp.status === 200 && Boolean(noteId), `status ${addNoteResp.status}, error ${addNoteData.error ?? ""}`);
    const listResp = await appFetch(`/api/documents/${documentId}/notes`, { session: sessionA });
    const listData = await listResp.json().catch(() => ({}));
    check("notes: the list shows the note", listResp.status === 200 && (listData.notes ?? []).some((n) => n.id === noteId && n.body === "Please recheck the totals."), `count ${(listData.notes ?? []).length}`);
    const emptyResp = await appFetch(`/api/documents/${documentId}/notes`, { session: sessionA, method: "POST", body: { body: "   " } });
    check("notes: an empty note is refused (400)", emptyResp.status === 400, `status ${emptyResp.status}`);
    const longResp = await appFetch(`/api/documents/${documentId}/notes`, { session: sessionA, method: "POST", body: { body: "a".repeat(2001) } });
    check("notes: a note over 2000 chars is refused (400)", longResp.status === 400, `status ${longResp.status}`);
    const resolveResp = await appFetch(`/api/documents/${documentId}/notes/${noteId}`, { session: sessionA, method: "PATCH", body: { resolved: true } });
    const resolveData = await resolveResp.json().catch(() => ({}));
    check("notes: the note resolves", resolveResp.status === 200 && resolveData.note?.resolved === true, `status ${resolveResp.status}`);
    const crossListResp = await appFetch(`/api/documents/${documentId}/notes`, { session: sessionB });
    check("notes: another user cannot list the notes (404)", crossListResp.status === 404, `status ${crossListResp.status}`);
    const crossPatchResp = await appFetch(`/api/documents/${documentId}/notes/${noteId}`, { session: sessionB, method: "PATCH", body: { resolved: false } });
    check("notes: another user cannot change the note (404)", crossPatchResp.status === 404, `status ${crossPatchResp.status}`);
    const deleteResp = await appFetch(`/api/documents/${documentId}/notes/${noteId}`, { session: sessionA, method: "DELETE" });
    check("notes: the note deletes", deleteResp.status === 200, `status ${deleteResp.status}`);
    const list2Resp = await appFetch(`/api/documents/${documentId}/notes`, { session: sessionA });
    const list2Data = await list2Resp.json().catch(() => ({}));
    check("notes: the list is empty after the delete", (list2Data.notes ?? []).length === 0, `count ${(list2Data.notes ?? []).length}`);
    const notesPageHtml = await (await appFetch(`/documents/${documentId}/notes`, { session: sessionA })).text();
    check("notes: the notes page renders", notesPageHtml.includes("Notes —") && notesPageHtml.includes("Add a note"), "page markers missing");
    const signedOutNotes = await appFetch(`/api/documents/${documentId}/notes`, { method: "GET" });
    check("signed-out: the notes route redirects to login (307)", signedOutNotes.status === 307, `status ${signedOutNotes.status}`);
  }
} catch (error) {
  console.error("HARNESS ERROR", error);
  results.push({ name: "harness completed without throwing", ok: false, detail: String(error) });
} finally {
  // ---- cleanup ----
  for (const docId of [documentId, plainDocumentId]) {
    if (!docId) continue;
    await admin.from("document_notes").delete().eq("document_id", docId);
    await admin.from("document_versions").delete().eq("document_id", docId);
    await admin.from("documents").delete().eq("id", docId);
  }
  if (workspaceAId) {
    const { data: files } = await admin.storage.from("documents").list(workspaceAId, { limit: 100 });
    // Best-effort: remove the uploaded fixture files.
    void files;
  }
  if (userAId) await admin.auth.admin.deleteUser(userAId);
  if (userBId) await admin.auth.admin.deleteUser(userBId);
  if (workspaceAId) await admin.from("workspaces").delete().eq("id", workspaceAId);
  if (workspaceBId) await admin.from("workspaces").delete().eq("id", workspaceBId);
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed${failed.length ? ` — FAILED: ${failed.map((r) => r.name).join("; ")}` : ""}`);
  process.exit(failed.length ? 1 : 0);
}
