// Live end-to-end harness for insert pages from an image (Day 33).
// Run with the app on :3000:
//   node scripts/e2e-insert-image-test.mjs
// Creates real test users and deletes them afterwards.
// Temporary harness — not part of the repo.
// Requires the app on http://localhost:3000 and the fixtures
// /tmp/e2e/pdf1.pdf (3 pages, "PDF One page N" at (50,700),
// size 20) and /tmp/e2e/watermark.png (a small PNG), rebuilt
// after a VM reset by scripts/rebuild-fixtures.py (the PNG is
// made by the harness if it is missing).
import { readFileSync, existsSync, writeFileSync } from "node:fs";
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
const userA = { email: `forma-e2e-ii-a-${suffix}@example.com`, password: "TestPass123!" };
const userB = { email: `forma-e2e-ii-b-${suffix}@example.com`, password: "TestPass123!" };
let userAId = "", userBId = "", workspaceAId = "", workspaceBId = "";
let sessionA = null, sessionB = null;
let documentId = "";

function cookieFor(session) {
  return "sb-" + REF + "-auth-token=" + encodeURIComponent(JSON.stringify(session));
}
async function appFetch(path, { session, method = "GET", body, form } = {}) {
  const headers = {};
  if (session) headers.Cookie = cookieFor(session);
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return fetch(`${APP}${path}`, {
    method, headers,
    body: form ?? (body === undefined ? undefined : JSON.stringify(body)),
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

async function pageSizes(bytes) {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.load(new Uint8Array(bytes));
  return Array.from({ length: doc.getPageCount() }, (_, i) => {
    const page = doc.getPage(i);
    return [page.getWidth(), page.getHeight()];
  });
}

async function pageHasImage(bytes, pageIndex) {
  const { PDFDocument, PDFName } = await import("pdf-lib");
  const doc = await PDFDocument.load(new Uint8Array(bytes));
  const resources = doc.getPage(pageIndex).node.get(PDFName.of("Resources"));
  if (!resources) return false;
  return Boolean(resources.lookup(PDFName.of("XObject")));
}

try {
  if (!existsSync("/tmp/e2e/pdf1.pdf")) {
    console.log("MISSING FIXTURE /tmp/e2e/pdf1.pdf — rebuild it with scripts/rebuild-fixtures.py first.");
    process.exit(1);
  }
  if (!existsSync("/tmp/e2e/watermark.png")) {
    // A 100x60 red PNG, written by hand (no Pillow needed).
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x64, 0x00, 0x00, 0x00, 0x3c,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x6b, 0x1e, 0x3c, 0x0b, 0x00, 0x00, 0x00,
      0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
      0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xdd, 0x8d, 0xb4, 0x00, 0x00, 0x00,
      0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    writeFileSync("/tmp/e2e/watermark.png", png);
  }
  // ---- setup ----
  const { data: cA } = await admin.auth.admin.createUser({ email: userA.email, password: userA.password, email_confirm: true });
  userAId = cA.user.id;
  const { data: cB } = await admin.auth.admin.createUser({ email: userB.email, password: userB.password, email_confirm: true });
  userBId = cB.user.id;
  await admin.from("profiles").upsert({ id: userAId, display_name: "E2E Insert Image" }, { onConflict: "id" });
  const { data: wsA } = await admin.from("workspaces").insert({ name: "E2E ii ws A", owner_id: userAId, plan_key: "free", is_personal: true }).select("id").single();
  workspaceAId = wsA.id;
  await admin.from("workspace_members").insert({ workspace_id: workspaceAId, user_id: userAId, role: "owner", status: "active" });
  const { data: wsB } = await admin.from("workspaces").insert({ name: "E2E ii ws B", owner_id: userBId, plan_key: "free", is_personal: true }).select("id").single();
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
  const filePath = `${workspaceAId}/${documentId}/v1/insert-image-test.pdf`;
  const { error: upErr } = await admin.storage.from("documents").upload(filePath, pdfBytes, { contentType: "application/pdf" });
  check("setup: the PDF uploads to Storage", !upErr, upErr?.message ?? "");
  await admin.from("documents").insert({ id: documentId, workspace_id: workspaceAId, folder_id: null, title: "Insert image test", file_path: filePath, mime_type: "application/pdf", size_bytes: pdfBytes.length, version: 1, created_by: userAId });
  await admin.from("document_versions").insert({ document_id: documentId, workspace_id: workspaceAId, version_number: 1, file_path: filePath, mime_type: "application/pdf", size_bytes: pdfBytes.length, created_by: userAId });
  const v1Bytes = pdfBytes;

  // ---- the tools page shows the image option ----
  const toolsHtml = await (await appFetch(`/documents/${documentId}/pdf-tools`, { session: sessionA })).text();
  check("page: the tools page offers Pages from an image", toolsHtml.includes("Pages from an image"), "option missing");

  // ---- insert one image page at the end ----
  const pngBytes = readFileSync("/tmp/e2e/watermark.png");
  const form1 = new FormData();
  form1.append("source", "image");
  form1.append("image", new Blob([pngBytes], { type: "image/png" }), "photo.png");
  form1.append("position_kind", "end");
  const ins1Resp = await appFetch(`/api/documents/${documentId}/pdf/insert-pages`, { session: sessionA, method: "POST", form: form1 });
  const ins1Data = await ins1Resp.json().catch(() => ({}));
  check("insert one image: succeeds (200) and creates version 2", ins1Resp.status === 200 && ins1Data.version === 2, `status ${ins1Resp.status}, version ${ins1Data.version}, error ${ins1Data.error ?? ""}`);
  let bytes = await currentBytes(documentId);
  let texts = await pageTexts(bytes);
  check("insert one image: the PDF now has 4 pages, the new one blank", texts.length === 4 && texts[3].trim() === "", texts.map((t) => t.slice(0, 20)).join(" | "));
  check("insert one image: the new page carries the image", await pageHasImage(bytes, 3), "no XObject on page 4");
  const sizes = await pageSizes(bytes);
  check("insert one image: the new page is the neighbours' size (612x792)", sizes[3][0] === 612 && sizes[3][1] === 792, `${sizes[3][0]}x${sizes[3][1]}`);
  const v1Texts = await pageTexts(v1Bytes);
  check("insert one image: version 1 is untouched", v1Texts.length === 3, `v1 has ${v1Texts.length} pages`);

  // ---- insert two images before page 2 ----
  const form2 = new FormData();
  form2.append("source", "image");
  form2.append("image", new Blob([pngBytes], { type: "image/png" }), "photo1.png");
  form2.append("image", new Blob([pngBytes], { type: "image/png" }), "photo2.png");
  form2.append("position_kind", "before");
  form2.append("position_page", "2");
  const ins2Resp = await appFetch(`/api/documents/${documentId}/pdf/insert-pages`, { session: sessionA, method: "POST", form: form2 });
  const ins2Data = await ins2Resp.json().catch(() => ({}));
  check("insert two images: succeeds and creates version 3", ins2Resp.status === 200 && ins2Data.version === 3, `status ${ins2Resp.status}, version ${ins2Data.version}, error ${ins2Data.error ?? ""}`);
  bytes = await currentBytes(documentId);
  texts = await pageTexts(bytes);
  check("insert two images: the order is right (Page 1, blank, blank, Page 2, Page 3, image)", texts.length === 6 && texts[0].includes("page 1") && texts[1].trim() === "" && texts[2].trim() === "" && texts[3].includes("page 2") && texts[4].includes("page 3") && texts[5].trim() === "", texts.map((t) => t.slice(0, 20)).join(" | "));
  check("insert two images: both new pages carry the image", (await pageHasImage(bytes, 1)) && (await pageHasImage(bytes, 2)), "a new page has no image");

  // ---- the JSON path still works (a blank page) ----
  const blankResp = await appFetch(`/api/documents/${documentId}/pdf/insert-pages`, { session: sessionA, method: "POST", body: { source: "blank", position: { kind: "end" } } });
  const blankData = await blankResp.json().catch(() => ({}));
  check("JSON path: a blank page still inserts (version 4)", blankResp.status === 200 && blankData.version === 4, `status ${blankResp.status}, version ${blankData.version}`);

  // ---- bad input is refused ----
  const badForm = new FormData();
  badForm.append("source", "image");
  badForm.append("image", new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }), "not-an-image.png");
  badForm.append("position_kind", "end");
  const badResp = await appFetch(`/api/documents/${documentId}/pdf/insert-pages`, { session: sessionA, method: "POST", form: badForm });
  check("bad input: a non-image file is refused (400)", badResp.status === 400, `status ${badResp.status}`);
  const emptyForm = new FormData();
  emptyForm.append("source", "image");
  emptyForm.append("position_kind", "end");
  const emptyResp = await appFetch(`/api/documents/${documentId}/pdf/insert-pages`, { session: sessionA, method: "POST", form: emptyForm });
  check("bad input: no image at all is refused (400)", emptyResp.status === 400, `status ${emptyResp.status}`);
  const badPosForm = new FormData();
  badPosForm.append("source", "image");
  badPosForm.append("image", new Blob([pngBytes], { type: "image/png" }), "photo.png");
  badPosForm.append("position_kind", "before");
  badPosForm.append("position_page", "99");
  const badPosResp = await appFetch(`/api/documents/${documentId}/pdf/insert-pages`, { session: sessionA, method: "POST", form: badPosForm });
  check("bad input: a position past the end is refused (400)", badPosResp.status === 400, `status ${badPosResp.status}`);

  // ---- cross-user isolation + signed-out ----
  const crossForm = new FormData();
  crossForm.append("source", "image");
  crossForm.append("image", new Blob([pngBytes], { type: "image/png" }), "photo.png");
  crossForm.append("position_kind", "end");
  const crossResp = await appFetch(`/api/documents/${documentId}/pdf/insert-pages`, { session: sessionB, method: "POST", form: crossForm });
  check("isolation: another user cannot insert into the document (404)", crossResp.status === 404, `status ${crossResp.status}`);
  const signedOutResp = await appFetch(`/api/documents/${documentId}/pdf/insert-pages`, { method: "POST", form: crossForm });
  check("signed-out: the insert route redirects to login (307)", signedOutResp.status === 307, `status ${signedOutResp.status}`);
} catch (error) {
  console.error("HARNESS ERROR", error);
  results.push({ name: "harness completed without throwing", ok: false, detail: String(error) });
} finally {
  // ---- cleanup ----
  if (documentId) {
    await admin.from("document_versions").delete().eq("document_id", documentId);
    await admin.from("documents").delete().eq("id", documentId);
    await admin.storage.from("documents").remove([1, 2, 3, 4].map((v) => `${workspaceAId}/${documentId}/v${v}/insert-image-test.pdf`));
  }
  if (userAId) await admin.auth.admin.deleteUser(userAId);
  if (userBId) await admin.auth.admin.deleteUser(userBId);
  if (workspaceAId) await admin.from("workspaces").delete().eq("id", workspaceAId);
  if (workspaceBId) await admin.from("workspaces").delete().eq("id", workspaceBId);
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed${failed.length ? ` — FAILED: ${failed.map((r) => r.name).join("; ")}` : ""}`);
  process.exit(failed.length ? 1 : 0);
}
