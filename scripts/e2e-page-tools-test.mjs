// Live end-to-end harness for PDF page tools part 1 (Day 18).
// Run with the app on :3000:
//   node scripts/e2e-page-tools-test.mjs
// Creates real test users and deletes them afterwards.
// Temporary harness — not part of the repo.
// Requires the app on http://localhost:3000 and the fixtures
// /tmp/e2e/pdf1.pdf (3 pages) and /tmp/e2e/pdf2.pdf (2 pages),
// rebuilt after a VM reset by scripts/rebuild-fixtures.mjs.
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
const userA = { email: `forma-e2e-pt-a-${suffix}@example.com`, password: "TestPass123!" };
const userB = { email: `forma-e2e-pt-b-${suffix}@example.com`, password: "TestPass123!" };
let userAId = "", userBId = "", workspaceAId = "", workspaceBId = "";
let sessionA = null, sessionB = null;
let documentId = "", sourceId = "";

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

async function pageTexts(bytes) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await (await pdfjs.getDocument({ data: bytes })).promise;
  const texts = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    texts.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
  }
  return { numPages: pdf.numPages, texts };
}

async function currentBytes(docId) {
  const { data: doc } = await admin.from("documents").select("file_path").eq("id", docId).maybeSingle();
  const { data: blob } = await admin.storage.from("documents").download(doc.file_path);
  return new Uint8Array(await blob.arrayBuffer());
}

try {
  for (const fixture of ["/tmp/e2e/pdf1.pdf", "/tmp/e2e/pdf2.pdf"]) {
    if (!existsSync(fixture)) {
      console.log(`MISSING FIXTURE ${fixture} — rebuild it with scripts/rebuild-fixtures.mjs first.`);
      process.exit(1);
    }
  }
  // ---- setup ----
  const { data: cA } = await admin.auth.admin.createUser({ email: userA.email, password: userA.password, email_confirm: true });
  userAId = cA.user.id;
  const { data: cB } = await admin.auth.admin.createUser({ email: userB.email, password: userB.password, email_confirm: true });
  userBId = cB.user.id;
  await admin.from("profiles").upsert({ id: userAId, display_name: "E2E Page Tools" }, { onConflict: "id" });
  const { data: wsA } = await admin.from("workspaces").insert({ name: "E2E pt ws A", owner_id: userAId, plan_key: "free", is_personal: true }).select("id").single();
  workspaceAId = wsA.id;
  await admin.from("workspace_members").insert({ workspace_id: workspaceAId, user_id: userAId, role: "owner", status: "active" });
  const { data: wsB } = await admin.from("workspaces").insert({ name: "E2E pt ws B", owner_id: userBId, plan_key: "free", is_personal: true }).select("id").single();
  workspaceBId = wsB.id;
  await admin.from("workspace_members").insert({ workspace_id: workspaceBId, user_id: userBId, role: "owner", status: "active" });
  const clientA = createClient(SUPA_URL, PUB, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: sA } = await clientA.auth.signInWithPassword(userA);
  sessionA = sA.session;
  const clientB = createClient(SUPA_URL, PUB, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: sB } = await clientB.auth.signInWithPassword(userB);
  sessionB = sB.session;

  async function createPdfDocument(title, fileName, bytes) {
    const id = crypto.randomUUID();
    const filePath = `${workspaceAId}/${id}/v1/${fileName}`;
    const { error: upErr } = await admin.storage.from("documents").upload(filePath, bytes, { contentType: "application/pdf" });
    check(`setup: ${title} uploads to Storage`, !upErr, upErr?.message ?? "");
    await admin.from("documents").insert({ id, workspace_id: workspaceAId, folder_id: null, title, file_path: filePath, mime_type: "application/pdf", size_bytes: bytes.length, version: 1, created_by: userAId });
    await admin.from("document_versions").insert({ document_id: id, workspace_id: workspaceAId, version_number: 1, file_path: filePath, mime_type: "application/pdf", size_bytes: bytes.length, created_by: userAId });
    return id;
  }

  const pdf1Bytes = readFileSync("/tmp/e2e/pdf1.pdf"); // 3 pages, "PDF One page N"
  const pdf2Bytes = readFileSync("/tmp/e2e/pdf2.pdf"); // 2 pages, "PDF Two page N"
  documentId = await createPdfDocument("Page tools target", "page-tools.pdf", pdf1Bytes);
  sourceId = await createPdfDocument("Page tools source", "page-tools-source.pdf", pdf2Bytes);
  const v1Bytes = pdf1Bytes;

  // ---- insert a blank page before page 2 ----
  const blankResp = await appFetch(`/api/documents/${documentId}/pdf/insert-pages`, { session: sessionA, method: "POST", body: { source: "blank", position: { kind: "before", page: 2 } } });
  const blankData = await blankResp.json().catch(() => ({}));
  check("insert blank: succeeds (200) and creates version 2", blankResp.status === 200 && blankData.version === 2, `status ${blankResp.status}, version ${blankData.version}`);
  let { numPages, texts } = await pageTexts(await currentBytes(documentId));
  check("insert blank: the count goes 3 to 4", numPages === 4, `pages ${numPages}`);
  check("insert blank: page 2 is blank (no body text)", texts[1].trim() === "", texts[1]);
  check("insert blank: the order is kept (page 1, blank, page 2, page 3)", texts[0].includes("PDF One page 1") && texts[2].includes("PDF One page 2") && texts[3].includes("PDF One page 3"), texts.join(" | "));

  // ---- insert pages 1-2 from the source PDF at the end ----
  const srcResp = await appFetch(`/api/documents/${documentId}/pdf/insert-pages`, { session: sessionA, method: "POST", body: { source: { documentId: sourceId, pages: [1, 2] }, position: { kind: "end" } } });
  const srcData = await srcResp.json().catch(() => ({}));
  check("insert from source: succeeds (200) and creates version 3", srcResp.status === 200 && srcData.version === 3, `status ${srcResp.status}, version ${srcData.version}`);
  ({ numPages, texts } = await pageTexts(await currentBytes(documentId)));
  check("insert from source: the count goes 4 to 6", numPages === 6, `pages ${numPages}`);
  check("insert from source: the copied pages carry the source text", texts[4].includes("PDF Two page 1") && texts[5].includes("PDF Two page 2"), texts[4] + " | " + texts[5]);

  // ---- add page numbers bottom centre, "Page N of M" ----
  const numResp = await appFetch(`/api/documents/${documentId}/pdf/page-numbers`, { session: sessionA, method: "POST", body: { position: "bottom-centre", format: "page-of-total", fromPage: 1, startNumber: 1 } });
  const numData = await numResp.json().catch(() => ({}));
  check("page numbers: succeeds (200) and creates version 4", numResp.status === 200 && numData.version === 4, `status ${numResp.status}, version ${numData.version}`);
  ({ numPages, texts } = await pageTexts(await currentBytes(documentId)));
  check("page numbers: every page carries its number", texts.every((t, i) => t.includes(`Page ${i + 1} of 6`)), texts.join(" | "));
  check("page numbers: the blank page has only its number", texts[1].trim() === "Page 2 of 6", texts[1]);

  // ---- version 1 is unchanged ----
  const { data: v1 } = await admin.from("document_versions").select("file_path").eq("document_id", documentId).eq("version_number", 1).maybeSingle();
  const { data: v1Blob } = await admin.storage.from("documents").download(v1.file_path);
  const v1Downloaded = new Uint8Array(await v1Blob.arrayBuffer());
  check("versions: version 1 is byte-identical to the upload", Buffer.compare(Buffer.from(v1Downloaded), Buffer.from(v1Bytes)) === 0, `${v1Downloaded.length} bytes`);

  // ---- the pdf-tools page loads ----
  const pageA = await appFetch(`/documents/${documentId}/pdf-tools`, { session: sessionA });
  const pageHtmlA = await pageA.text();
  check("pdf-tools page: loads for A (200)", pageA.status === 200, `status ${pageA.status}`);
  check("pdf-tools page: shows the new sections", pageHtmlA.includes("Insert pages") && pageHtmlA.includes("Page numbers"));
  const pageB = await appFetch(`/documents/${documentId}/pdf-tools`, { session: sessionB });
  const pageHtmlB = await pageB.text();
  check("pdf-tools page: shows 'Document not found' for B", pageB.status === 200 && pageHtmlB.includes("Document not found"), `status ${pageB.status}`);

  // ---- validation ----
  const badPos = await appFetch(`/api/documents/${documentId}/pdf/insert-pages`, { session: sessionA, method: "POST", body: { source: "blank", position: { kind: "before", page: 99 } } });
  check("validation: a position beyond the last page is refused (400)", badPos.status === 400, `status ${badPos.status}`);
  const badSrcPage = await appFetch(`/api/documents/${documentId}/pdf/insert-pages`, { session: sessionA, method: "POST", body: { source: { documentId: sourceId, pages: [9] }, position: { kind: "end" } } });
  check("validation: a source page that does not exist is refused (400)", badSrcPage.status === 400, `status ${badSrcPage.status}`);
  const selfSrc = await appFetch(`/api/documents/${documentId}/pdf/insert-pages`, { session: sessionA, method: "POST", body: { source: { documentId: documentId, pages: [1] }, position: { kind: "end" } } });
  check("validation: inserting from the same document is refused (400)", selfSrc.status === 400, `status ${selfSrc.status}`);
  const badFormat = await appFetch(`/api/documents/${documentId}/pdf/page-numbers`, { session: sessionA, method: "POST", body: { position: "bottom-centre", format: "roman" } });
  check("validation: an unknown page-number format is refused (400)", badFormat.status === 400, `status ${badFormat.status}`);
  const badFrom = await appFetch(`/api/documents/${documentId}/pdf/page-numbers`, { session: sessionA, method: "POST", body: { position: "bottom-centre", format: "number", fromPage: 99 } });
  check("validation: a first page beyond the last page is refused (400)", badFrom.status === 400, `status ${badFrom.status}`);

  // ---- cross-user isolation ----
  const insB = await appFetch(`/api/documents/${documentId}/pdf/insert-pages`, { session: sessionB, method: "POST", body: { source: "blank", position: { kind: "end" } } });
  check("isolation: user B gets 404 on insert", insB.status === 404, `status ${insB.status}`);
  const numB = await appFetch(`/api/documents/${documentId}/pdf/page-numbers`, { session: sessionB, method: "POST", body: { position: "bottom-centre", format: "number" } });
  check("isolation: user B gets 404 on page numbers", numB.status === 404, `status ${numB.status}`);

  // ---- signed-out ----
  const soIns = await fetch(`${APP}/api/documents/${documentId}/pdf/insert-pages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: "blank", position: { kind: "end" } }), redirect: "manual" });
  check("signed-out: insert redirects to login (307)", soIns.status === 307, `status ${soIns.status}`);
  const soNum = await fetch(`${APP}/api/documents/${documentId}/pdf/page-numbers`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ position: "bottom-centre", format: "number" }), redirect: "manual" });
  check("signed-out: page numbers redirects to login (307)", soNum.status === 307, `status ${soNum.status}`);
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
