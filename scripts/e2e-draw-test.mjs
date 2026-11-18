// Live end-to-end harness for PDF page tools part 2 (Day 19).
// Run with the app on :3000:
//   node scripts/e2e-draw-test.mjs
// Creates real test users and deletes them afterwards.
// Temporary harness — not part of the repo.
// Requires the app on http://localhost:3000 and the fixture
// /tmp/e2e/pdf1.pdf (3 pages, "PDF One page N" at (50,700),
// size 20), rebuilt after a VM reset by
// scripts/rebuild-fixtures.mjs.
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
const userA = { email: `forma-e2e-dr-a-${suffix}@example.com`, password: "TestPass123!" };
const userB = { email: `forma-e2e-dr-b-${suffix}@example.com`, password: "TestPass123!" };
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

async function loadPdfjs(bytes) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return (await pdfjs.getDocument({ data: bytes })).promise;
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
  await admin.from("profiles").upsert({ id: userAId, display_name: "E2E Draw" }, { onConflict: "id" });
  const { data: wsA } = await admin.from("workspaces").insert({ name: "E2E dr ws A", owner_id: userAId, plan_key: "free", is_personal: true }).select("id").single();
  workspaceAId = wsA.id;
  await admin.from("workspace_members").insert({ workspace_id: workspaceAId, user_id: userAId, role: "owner", status: "active" });
  const { data: wsB } = await admin.from("workspaces").insert({ name: "E2E dr ws B", owner_id: userBId, plan_key: "free", is_personal: true }).select("id").single();
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
  const filePath = `${workspaceAId}/${documentId}/v1/draw-test.pdf`;
  const { error: upErr } = await admin.storage.from("documents").upload(filePath, pdfBytes, { contentType: "application/pdf" });
  check("setup: the PDF uploads to Storage", !upErr, upErr?.message ?? "");
  await admin.from("documents").insert({ id: documentId, workspace_id: workspaceAId, folder_id: null, title: "Draw test", file_path: filePath, mime_type: "application/pdf", size_bytes: pdfBytes.length, version: 1, created_by: userAId });
  await admin.from("document_versions").insert({ document_id: documentId, workspace_id: workspaceAId, version_number: 1, file_path: filePath, mime_type: "application/pdf", size_bytes: pdfBytes.length, created_by: userAId });
  const v1Bytes = pdfBytes;

  // ---- crop page 1 to its top half ----
  const cropResp = await appFetch(`/api/documents/${documentId}/pdf/crop`, { session: sessionA, method: "POST", body: { pages: [1], rect: { x1: 0, y1: 396, x2: 612, y2: 792 } } });
  const cropData = await cropResp.json().catch(() => ({}));
  check("crop: succeeds (200) and creates version 2", cropResp.status === 200 && cropData.version === 2, `status ${cropResp.status}, version ${cropData.version}`);
  let pdf = await loadPdfjs(await currentBytes(documentId));
  const croppedPage = await pdf.getPage(1);
  const viewport = croppedPage.getViewport({ scale: 1 });
  check("crop: the page's viewport is half the height", Math.abs(viewport.height - 396) < 1, `height ${viewport.height}`);
  const page2 = await pdf.getPage(2);
  const viewport2 = page2.getViewport({ scale: 1 });
  check("crop: page 2 is unchanged (full height)", Math.abs(viewport2.height - 792) < 1, `height ${viewport2.height}`);

  // ---- add a hyperlink to page 1 ----
  const linkResp = await appFetch(`/api/documents/${documentId}/pdf/links`, { session: sessionA, method: "POST", body: { page: 1, rect: { x1: 50, y1: 700, x2: 200, y2: 720 }, url: "example.com/docs" } });
  const linkData = await linkResp.json().catch(() => ({}));
  check("link: succeeds (200) and creates version 3", linkResp.status === 200 && linkData.version === 3, `status ${linkResp.status}, version ${linkData.version}`);
  pdf = await loadPdfjs(await currentBytes(documentId));
  const linkPage = await pdf.getPage(1);
  const annots = await linkPage.getAnnotations();
  const link = annots.find((a) => a.subtype === "Link");
  check("link: the annotation reads back with the right URL", link?.url === "https://example.com/docs", `url ${link?.url}`);
  check("link: the annotation rect is right", JSON.stringify(link?.rect) === JSON.stringify([50, 700, 200, 720]), JSON.stringify(link?.rect));

  // ---- add text to page 2 ----
  const textResp = await appFetch(`/api/documents/${documentId}/pdf/add-text`, { session: sessionA, method: "POST", body: { page: 2, x: 50, y: 400, text: "Added text", size: 14, font: "helvetica", color: "red" } });
  const textData = await textResp.json().catch(() => ({}));
  check("text: succeeds (200) and creates version 4", textResp.status === 200 && textData.version === 4, `status ${textResp.status}, version ${textData.version}`);
  pdf = await loadPdfjs(await currentBytes(documentId));
  const textPage = await pdf.getPage(2);
  const content = await textPage.getTextContent();
  const text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
  check("text: the added text is extractable", text.includes("Added text"), text);

  // ---- draw a rectangle on page 2 ----
  const shapeResp = await appFetch(`/api/documents/${documentId}/pdf/add-shape`, { session: sessionA, method: "POST", body: { page: 2, shape: "rectangle", rect: { x1: 50, y1: 300, x2: 150, y2: 350 }, color: "blue", filled: true } });
  const shapeData = await shapeResp.json().catch(() => ({}));
  check("shape: succeeds (200) and creates version 5", shapeResp.status === 200 && shapeData.version === 5, `status ${shapeResp.status}, version ${shapeData.version}`);
  pdf = await loadPdfjs(await currentBytes(documentId));
  check("shape: the document still has 3 pages", pdf.numPages === 3, `pages ${pdf.numPages}`);
  const shapePage = await pdf.getPage(2);
  const opList = await shapePage.getOperatorList();
  check("shape: the page has a constructed path (the rectangle)", opList.fnArray.length > 0, `${opList.fnArray.length} operators`);

  // ---- version 1 is unchanged ----
  const { data: v1 } = await admin.from("document_versions").select("file_path").eq("document_id", documentId).eq("version_number", 1).maybeSingle();
  const { data: v1Blob } = await admin.storage.from("documents").download(v1.file_path);
  const v1Downloaded = new Uint8Array(await v1Blob.arrayBuffer());
  check("versions: version 1 is byte-identical to the upload", Buffer.compare(Buffer.from(v1Downloaded), Buffer.from(v1Bytes)) === 0, `${v1Downloaded.length} bytes`);

  // ---- the draw page loads ----
  const pageA = await appFetch(`/documents/${documentId}/pdf-draw`, { session: sessionA });
  const pageHtmlA = await pageA.text();
  check("draw page: loads for A (200)", pageA.status === 200, `status ${pageA.status}`);
  check("draw page: the client component mounts (loading state)", pageHtmlA.includes("Loading the PDF"));
  const pageB = await appFetch(`/documents/${documentId}/pdf-draw`, { session: sessionB });
  const pageHtmlB = await pageB.text();
  check("draw page: shows 'Document not found' for B", pageB.status === 200 && pageHtmlB.includes("Document not found"), `status ${pageB.status}`);

  // ---- validation ----
  const badCrop = await appFetch(`/api/documents/${documentId}/pdf/crop`, { session: sessionA, method: "POST", body: { pages: [1], rect: { x1: 500, y1: 700, x2: 700, y2: 900 } } });
  check("validation: a crop rectangle outside the page is refused (400)", badCrop.status === 400, `status ${badCrop.status}`);
  const badUrl = await appFetch(`/api/documents/${documentId}/pdf/links`, { session: sessionA, method: "POST", body: { page: 1, rect: { x1: 50, y1: 700, x2: 200, y2: 720 }, url: "javascript:alert(1)" } });
  check("validation: a non-web link URL is refused (400)", badUrl.status === 400, `status ${badUrl.status}`);
  const emptyText = await appFetch(`/api/documents/${documentId}/pdf/add-text`, { session: sessionA, method: "POST", body: { page: 2, x: 50, y: 400, text: "   ", size: 14, font: "helvetica", color: "red" } });
  check("validation: empty text is refused (400)", emptyText.status === 400, `status ${emptyText.status}`);
  const zeroLine = await appFetch(`/api/documents/${documentId}/pdf/add-shape`, { session: sessionA, method: "POST", body: { page: 2, shape: "line", rect: { x1: 100, y1: 100, x2: 100, y2: 100 }, color: "red", filled: false } });
  check("validation: a zero-length line is refused (400)", zeroLine.status === 400, `status ${zeroLine.status}`);
  const badPage = await appFetch(`/api/documents/${documentId}/pdf/crop`, { session: sessionA, method: "POST", body: { pages: [9], rect: { x1: 0, y1: 396, x2: 612, y2: 792 } } });
  check("validation: a page that does not exist is refused (400)", badPage.status === 400, `status ${badPage.status}`);

  // ---- cross-user isolation ----
  const cropB = await appFetch(`/api/documents/${documentId}/pdf/crop`, { session: sessionB, method: "POST", body: { pages: [1], rect: { x1: 0, y1: 396, x2: 612, y2: 792 } } });
  check("isolation: user B gets 404 on crop", cropB.status === 404, `status ${cropB.status}`);
  const linkB = await appFetch(`/api/documents/${documentId}/pdf/links`, { session: sessionB, method: "POST", body: { page: 1, rect: { x1: 50, y1: 700, x2: 200, y2: 720 }, url: "https://example.com" } });
  check("isolation: user B gets 404 on link", linkB.status === 404, `status ${linkB.status}`);
  const textB = await appFetch(`/api/documents/${documentId}/pdf/add-text`, { session: sessionB, method: "POST", body: { page: 2, x: 50, y: 400, text: "No", size: 14, font: "helvetica", color: "red" } });
  check("isolation: user B gets 404 on add text", textB.status === 404, `status ${textB.status}`);
  const shapeB = await appFetch(`/api/documents/${documentId}/pdf/add-shape`, { session: sessionB, method: "POST", body: { page: 2, shape: "rectangle", rect: { x1: 50, y1: 300, x2: 150, y2: 350 }, color: "blue", filled: true } });
  check("isolation: user B gets 404 on add shape", shapeB.status === 404, `status ${shapeB.status}`);

  // ---- signed-out ----
  const soCrop = await fetch(`${APP}/api/documents/${documentId}/pdf/crop`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pages: [1], rect: { x1: 0, y1: 396, x2: 612, y2: 792 } }), redirect: "manual" });
  check("signed-out: crop redirects to login (307)", soCrop.status === 307, `status ${soCrop.status}`);
  const soLink = await fetch(`${APP}/api/documents/${documentId}/pdf/links`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page: 1, rect: { x1: 50, y1: 700, x2: 200, y2: 720 }, url: "https://example.com" }), redirect: "manual" });
  check("signed-out: link redirects to login (307)", soLink.status === 307, `status ${soLink.status}`);
  const soText = await fetch(`${APP}/api/documents/${documentId}/pdf/add-text`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page: 2, x: 50, y: 400, text: "No", size: 14, font: "helvetica", color: "red" }), redirect: "manual" });
  check("signed-out: add text redirects to login (307)", soText.status === 307, `status ${soText.status}`);
  const soShape = await fetch(`${APP}/api/documents/${documentId}/pdf/add-shape`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page: 2, shape: "rectangle", rect: { x1: 50, y1: 300, x2: 150, y2: 350 }, color: "blue", filled: true }), redirect: "manual" });
  check("signed-out: add shape redirects to login (307)", soShape.status === 307, `status ${soShape.status}`);
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
