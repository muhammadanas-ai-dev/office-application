// Live end-to-end harness for PDF annotations (Day 17).
// Run with the app on :3000:
//   node scripts/e2e-annotate-test.mjs
// Creates real test users and deletes them afterwards.
// Temporary harness — not part of the repo.
// Requires the app on http://localhost:3000 and the fixture
// /tmp/e2e/pdf1.pdf (rebuilt after a VM reset by
// scripts/rebuild-fixtures.mjs if it is missing).
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
const userA = { email: `forma-e2e-ann-a-${suffix}@example.com`, password: "TestPass123!" };
const userB = { email: `forma-e2e-ann-b-${suffix}@example.com`, password: "TestPass123!" };
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
  await admin.from("profiles").upsert({ id: userAId, display_name: "E2E Annotations" }, { onConflict: "id" });
  const { data: wsA } = await admin.from("workspaces").insert({ name: "E2E ann ws A", owner_id: userAId, plan_key: "free", is_personal: true }).select("id").single();
  workspaceAId = wsA.id;
  await admin.from("workspace_members").insert({ workspace_id: workspaceAId, user_id: userAId, role: "owner", status: "active" });
  const { data: wsB } = await admin.from("workspaces").insert({ name: "E2E ann ws B", owner_id: userBId, plan_key: "free", is_personal: true }).select("id").single();
  workspaceBId = wsB.id;
  await admin.from("workspace_members").insert({ workspace_id: workspaceBId, user_id: userBId, role: "owner", status: "active" });
  const clientA = createClient(SUPA_URL, PUB, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: sA } = await clientA.auth.signInWithPassword(userA);
  sessionA = sA.session;
  const clientB = createClient(SUPA_URL, PUB, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: sB } = await clientB.auth.signInWithPassword(userB);
  sessionB = sB.session;

  // ---- upload a PDF (the 3-page fixture) ----
  const pdfBytes = readFileSync("/tmp/e2e/pdf1.pdf");
  documentId = crypto.randomUUID();
  const filePath = `${workspaceAId}/${documentId}/v1/annot-test.pdf`;
  const { error: upErr } = await admin.storage.from("documents").upload(filePath, pdfBytes, { contentType: "application/pdf" });
  check("setup: the PDF uploads to Storage", !upErr, upErr?.message ?? "");
  const { error: docErr } = await admin.from("documents").insert({ id: documentId, workspace_id: workspaceAId, folder_id: null, title: "Annot test", file_path: filePath, mime_type: "application/pdf", size_bytes: pdfBytes.length, version: 1, created_by: userAId });
  check("setup: the document row is created (v1)", !docErr, docErr?.message ?? "");
  const { error: verErr } = await admin.from("document_versions").insert({ document_id: documentId, workspace_id: workspaceAId, version_number: 1, file_path: filePath, mime_type: "application/pdf", size_bytes: pdfBytes.length, created_by: userAId });
  check("setup: the version-1 row is created", !verErr, verErr?.message ?? "");
  const v1Bytes = pdfBytes;

  async function listAnnotations(session) {
    const resp = await appFetch(`/api/documents/${documentId}/pdf/annotations`, { session });
    const data = await resp.json().catch(() => ({}));
    return { resp, data };
  }

  // ---- add each of the five kinds ----
  const QUADS = [50, 664, 350, 664, 50, 648, 350, 648];
  const adds = [
    { kind: "highlight", page: 1, quadPoints: QUADS, contents: "A highlight" },
    { kind: "underline", page: 1, quadPoints: QUADS },
    { kind: "strikeout", page: 1, quadPoints: QUADS },
    { kind: "note", page: 1, x: 100, y: 500, contents: "A sticky note" },
    { kind: "ink", page: 1, strokes: [[50, 500, 175, 550, 300, 500]] },
  ];
  let expectedVersion = 1;
  for (const annotation of adds) {
    const resp = await appFetch(`/api/documents/${documentId}/pdf/annotations`, { session: sessionA, method: "POST", body: { annotations: [annotation] } });
    const data = await resp.json().catch(() => ({}));
    expectedVersion += 1;
    check(`add ${annotation.kind}: succeeds (200) and creates version ${expectedVersion}`, resp.status === 200 && data.version === expectedVersion, `status ${resp.status}, version ${data.version}`);
    const { data: doc } = await admin.from("documents").select("version").eq("id", documentId).maybeSingle();
    check(`add ${annotation.kind}: the document row is now version ${expectedVersion}`, doc?.version === expectedVersion, `version ${doc?.version}`);
  }

  // ---- version 1 is unchanged ----
  const { data: v1 } = await admin.from("document_versions").select("file_path, size_bytes").eq("document_id", documentId).eq("version_number", 1).maybeSingle();
  const { data: v1Blob } = await admin.storage.from("documents").download(v1.file_path);
  const v1Downloaded = new Uint8Array(await v1Blob.arrayBuffer());
  check("versions: version 1 is byte-identical to the upload", Buffer.compare(Buffer.from(v1Downloaded), Buffer.from(v1Bytes)) === 0, `${v1Downloaded.length} bytes`);

  // ---- the list shows all five ----
  const { resp: listResp, data: listData } = await listAnnotations(sessionA);
  check("list: succeeds (200)", listResp.status === 200, `status ${listResp.status}`);
  const subtypes = (listData.annotations ?? []).map((a) => a.subtype).sort();
  check("list: all five annotations are present", JSON.stringify(subtypes) === JSON.stringify(["Highlight", "Ink", "StrikeOut", "Text", "Underline"]), subtypes.join(","));
  const highlight = (listData.annotations ?? []).find((a) => a.subtype === "Highlight");
  check("list: the highlight carries its quads, colour and note", Array.isArray(highlight?.quadPoints) && highlight.quadPoints.length === 8 && JSON.stringify(highlight?.color) === JSON.stringify([1, 1, 0]) && highlight?.contents === "A highlight", JSON.stringify(highlight?.color));
  const ink = (listData.annotations ?? []).find((a) => a.subtype === "Ink");
  check("list: the ink annotation carries its stroke", Array.isArray(ink?.inkList) && ink.inkList.length === 1 && ink.inkList[0].length === 6);

  // ---- PDF.js can read the annotations from the saved file ----
  const { data: currentDoc } = await admin.from("documents").select("file_path").eq("id", documentId).maybeSingle();
  const { data: currentBlob } = await admin.storage.from("documents").download(currentDoc.file_path);
  const currentBytes = new Uint8Array(await currentBlob.arrayBuffer());
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({ data: currentBytes });
  const pdf = await loadingTask.promise;
  const pdfPage = await pdf.getPage(1);
  const pdfAnnots = await pdfPage.getAnnotations();
  const pdfSubtypes = pdfAnnots.map((a) => a.subtype).sort();
  check("pdf.js: the saved file's annotations read back (5)", pdfAnnots.length === 5, `got ${pdfAnnots.length}`);
  check("pdf.js: the subtypes match", JSON.stringify(pdfSubtypes) === JSON.stringify(["Highlight", "Ink", "StrikeOut", "Text", "Underline"]), pdfSubtypes.join(","));

  // ---- the annotation page loads ----
  const pageA = await appFetch(`/documents/${documentId}/pdf-annotate`, { session: sessionA });
  const pageHtmlA = await pageA.text();
  check("annotate page: loads for A (200)", pageA.status === 200, `status ${pageA.status}`);
  // The page is a client component: the server renders its loading
  // state ("Loading the PDF…") and the toolbar renders in the
  // browser after the PDF loads — so the initial HTML carries the
  // loading state, not the tools. The tools themselves are a
  // browser-only check (see the handoff).
  check("annotate page: the client component mounts (loading state)", pageHtmlA.includes("Loading the PDF"));
  const pageB = await appFetch(`/documents/${documentId}/pdf-annotate`, { session: sessionB });
  const pageHtmlB = await pageB.text();
  check("annotate page: shows 'Document not found' for B", pageB.status === 200 && pageHtmlB.includes("Document not found"), `status ${pageB.status}`);

  // ---- remove one annotation ----
  const toRemove = (listData.annotations ?? []).find((a) => a.subtype === "Underline");
  const delResp = await appFetch(`/api/documents/${documentId}/pdf/annotations`, { session: sessionA, method: "DELETE", body: { page: toRemove.page, index: toRemove.index } });
  const delData = await delResp.json().catch(() => ({}));
  expectedVersion += 1;
  check("remove: succeeds (200) and creates a new version", delResp.status === 200 && delData.version === expectedVersion, `status ${delResp.status}, version ${delData.version}`);
  const { data: listAfter } = await listAnnotations(sessionA);
  const subtypesAfter = (listAfter.annotations ?? []).map((a) => a.subtype);
  check("remove: the underline is gone and the other four remain", subtypesAfter.length === 4 && !subtypesAfter.includes("Underline"), subtypesAfter.join(","));

  // ---- validation ----
  const badQuad = await appFetch(`/api/documents/${documentId}/pdf/annotations`, { session: sessionA, method: "POST", body: { annotations: [{ kind: "highlight", page: 1, quadPoints: [1, 2, 3] }] } });
  check("validation: a bad QuadPoints array is refused (400)", badQuad.status === 400, `status ${badQuad.status}`);
  const badPage = await appFetch(`/api/documents/${documentId}/pdf/annotations`, { session: sessionA, method: "POST", body: { annotations: [{ kind: "note", page: 99, x: 1, y: 1 }] } });
  check("validation: a page that does not exist is refused (400)", badPage.status === 400, `status ${badPage.status}`);
  const badRemove = await appFetch(`/api/documents/${documentId}/pdf/annotations`, { session: sessionA, method: "DELETE", body: { page: 1, index: 99 } });
  check("validation: removing a missing annotation is refused (404)", badRemove.status === 404, `status ${badRemove.status}`);

  // ---- cross-user isolation ----
  const listB = await appFetch(`/api/documents/${documentId}/pdf/annotations`, { session: sessionB });
  check("isolation: user B gets 404 on list", listB.status === 404, `status ${listB.status}`);
  const addB = await appFetch(`/api/documents/${documentId}/pdf/annotations`, { session: sessionB, method: "POST", body: { annotations: [{ kind: "note", page: 1, x: 1, y: 1 }] } });
  check("isolation: user B gets 404 on add", addB.status === 404, `status ${addB.status}`);
  const delB = await appFetch(`/api/documents/${documentId}/pdf/annotations`, { session: sessionB, method: "DELETE", body: { page: 1, index: 0 } });
  check("isolation: user B gets 404 on remove", delB.status === 404, `status ${delB.status}`);

  // ---- signed-out ----
  const signedOutList = await fetch(`${APP}/api/documents/${documentId}/pdf/annotations`, { redirect: "manual" });
  check("signed-out: list redirects to login (307)", signedOutList.status === 307, `status ${signedOutList.status}`);
  const signedOutAdd = await fetch(`${APP}/api/documents/${documentId}/pdf/annotations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ annotations: [{ kind: "note", page: 1, x: 1, y: 1 }] }), redirect: "manual" });
  check("signed-out: add redirects to login (307)", signedOutAdd.status === 307, `status ${signedOutAdd.status}`);
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
