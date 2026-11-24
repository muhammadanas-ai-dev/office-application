// Live end-to-end harness for PDF stamps / watermarks (Day 32).
// Run with the app on :3000:
//   node scripts/e2e-pdf-stamp-test.mjs
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
const userA = { email: `forma-e2e-st-a-${suffix}@example.com`, password: "TestPass123!" };
const userB = { email: `forma-e2e-st-b-${suffix}@example.com`, password: "TestPass123!" };
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
  // plain Uint8Array (a Buffer IS a Uint8Array subclass, so the
  // instanceof check alone would not catch it).
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

async function pageHasImage(bytes) {
  const { PDFDocument, PDFName } = await import("pdf-lib");
  const doc = await PDFDocument.load(bytes);
  for (let i = 0; i < doc.getPageCount(); i++) {
    const resources = doc.getPage(i).node.get(PDFName.of("Resources"));
    if (!resources) continue;
    const xObject = resources.lookup(PDFName.of("XObject"));
    if (xObject) return true;
  }
  return false;
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
  await admin.from("profiles").upsert({ id: userAId, display_name: "E2E Stamp" }, { onConflict: "id" });
  const { data: wsA } = await admin.from("workspaces").insert({ name: "E2E st ws A", owner_id: userAId, plan_key: "free", is_personal: true }).select("id").single();
  workspaceAId = wsA.id;
  await admin.from("workspace_members").insert({ workspace_id: workspaceAId, user_id: userAId, role: "owner", status: "active" });
  const { data: wsB } = await admin.from("workspaces").insert({ name: "E2E st ws B", owner_id: userBId, plan_key: "free", is_personal: true }).select("id").single();
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
  const filePath = `${workspaceAId}/${documentId}/v1/stamp-test.pdf`;
  const { error: upErr } = await admin.storage.from("documents").upload(filePath, pdfBytes, { contentType: "application/pdf" });
  check("setup: the PDF uploads to Storage", !upErr, upErr?.message ?? "");
  await admin.from("documents").insert({ id: documentId, workspace_id: workspaceAId, folder_id: null, title: "Stamp test", file_path: filePath, mime_type: "application/pdf", size_bytes: pdfBytes.length, version: 1, created_by: userAId });
  await admin.from("document_versions").insert({ document_id: documentId, workspace_id: workspaceAId, version_number: 1, file_path: filePath, mime_type: "application/pdf", size_bytes: pdfBytes.length, created_by: userAId });
  const v1Bytes = pdfBytes;

  // ---- the stamp page loads for the owner ----
  const pageResp = await appFetch(`/documents/${documentId}/pdf-stamp`, { session: sessionA });
  const pageHtml = await pageResp.text();
  check("page: the stamp page loads (200) with the three tabs", pageResp.status === 200 && pageHtml.includes("Text watermark") && pageHtml.includes("Image watermark") && pageHtml.includes("Stamp"), `status ${pageResp.status}`);
  const filesHtml = await (await appFetch(`/files`, { session: sessionA })).text();
  check("page: the library lists the Stamps & watermarks link", filesHtml.includes("Stamps &amp; watermarks") || filesHtml.includes("Stamps"), "link not found in the library HTML");

  // ---- text watermark on all pages ----
  const wmResp = await appFetch(`/api/documents/${documentId}/pdf/add-watermark`, { session: sessionA, method: "POST", body: { kind: "text", text: "E2E WATERMARK", pages: "all", position: "centre-diagonal", size: 48, color: "red", opacity: 0.3, rotation: 45 } });
  const wmData = await wmResp.json().catch(() => ({}));
  check("text watermark: succeeds (200) and creates version 2", wmResp.status === 200 && wmData.version === 2, `status ${wmResp.status}, version ${wmData.version}`);
  let texts = await pageTexts(await currentBytes(documentId));
  check("text watermark: the text is on all three pages", texts.every((t) => t.includes("E2E WATERMARK")), texts.map((t) => t.slice(0, 40)).join(" | "));
  const v1Texts = await pageTexts(v1Bytes);
  check("text watermark: version 1 is untouched", !v1Texts.some((t) => t.includes("E2E WATERMARK")), "v1 changed");

  // ---- text watermark on one page only ----
  const wm2Resp = await appFetch(`/api/documents/${documentId}/pdf/add-watermark`, { session: sessionA, method: "POST", body: { kind: "text", text: "PAGE TWO ONLY", pages: "2", position: "centre", size: 36, color: "grey", opacity: 0.5, rotation: 0 } });
  const wm2Data = await wm2Resp.json().catch(() => ({}));
  check("text watermark (page 2): succeeds and creates version 3", wm2Resp.status === 200 && wm2Data.version === 3, `status ${wm2Resp.status}, version ${wm2Data.version}`);
  texts = await pageTexts(await currentBytes(documentId));
  check("text watermark (page 2): only page 2 carries it", !texts[0].includes("PAGE TWO ONLY") && texts[1].includes("PAGE TWO ONLY") && !texts[2].includes("PAGE TWO ONLY"), texts.map((t) => t.slice(0, 30)).join(" | "));

  // ---- stamp ----
  const stResp = await appFetch(`/api/documents/${documentId}/pdf/add-stamp`, { session: sessionA, method: "POST", body: { text: "CONFIDENTIAL", pages: "all", position: "top-centre", color: "red" } });
  const stData = await stResp.json().catch(() => ({}));
  check("stamp: succeeds (200) and creates version 4", stResp.status === 200 && stData.version === 4, `status ${stResp.status}, version ${stData.version}`);
  texts = await pageTexts(await currentBytes(documentId));
  check("stamp: the stamp text is on all three pages", texts.every((t) => t.includes("CONFIDENTIAL")), texts.map((t) => t.slice(0, 40)).join(" | "));

  // ---- image watermark ----
  const form = new FormData();
  form.append("kind", "image");
  form.append("image", new Blob([readFileSync("/tmp/e2e/watermark.png")], { type: "image/png" }), "watermark.png");
  form.append("pages", "all");
  form.append("position", "centre");
  form.append("scale", "0.5");
  form.append("opacity", "0.3");
  form.append("rotation", "0");
  const imResp = await appFetch(`/api/documents/${documentId}/pdf/add-watermark`, { session: sessionA, method: "POST", form });
  const imData = await imResp.json().catch(() => ({}));
  check("image watermark: succeeds (200) and creates version 5", imResp.status === 200 && imData.version === 5, `status ${imResp.status}, version ${imData.version}, error ${imData.error ?? ""}`);
  const imBytes = await currentBytes(documentId);
  check("image watermark: the image is embedded on a page", await pageHasImage(imBytes), "no XObject found");

  // ---- bad input is refused ----
  const badResp = await appFetch(`/api/documents/${documentId}/pdf/add-watermark`, { session: sessionA, method: "POST", body: { kind: "text", text: "   ", pages: "all", position: "centre", size: 36, color: "red", opacity: 0.3, rotation: 0 } });
  check("bad input: empty watermark text is refused (400)", badResp.status === 400, `status ${badResp.status}`);
  const bad2Resp = await appFetch(`/api/documents/${documentId}/pdf/add-stamp`, { session: sessionA, method: "POST", body: { text: "CONFIDENTIAL", pages: "9", position: "top-centre", color: "red" } });
  check("bad input: a page past the end is refused (400)", bad2Resp.status === 400, `status ${bad2Resp.status}`);
  const badForm = new FormData();
  badForm.append("kind", "image");
  badForm.append("image", new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }), "not-an-image.png");
  badForm.append("pages", "all");
  badForm.append("position", "centre");
  badForm.append("scale", "0.5");
  badForm.append("opacity", "0.3");
  badForm.append("rotation", "0");
  const bad3Resp = await appFetch(`/api/documents/${documentId}/pdf/add-watermark`, { session: sessionA, method: "POST", form: badForm });
  check("bad input: a non-image watermark file is refused (400)", bad3Resp.status === 400, `status ${bad3Resp.status}`);

  // ---- cross-user isolation + signed-out ----
  const crossResp = await appFetch(`/api/documents/${documentId}/pdf/add-stamp`, { session: sessionB, method: "POST", body: { text: "CONFIDENTIAL", pages: "all", position: "top-centre", color: "red" } });
  check("isolation: another user cannot stamp the document (404)", crossResp.status === 404, `status ${crossResp.status}`);
  const signedOutResp = await appFetch(`/api/documents/${documentId}/pdf/add-stamp`, { method: "POST", body: { text: "CONFIDENTIAL", pages: "all", position: "top-centre", color: "red" } });
  check("signed-out: the stamp route redirects to login (307)", signedOutResp.status === 307, `status ${signedOutResp.status}`);
  const signedOutPage = await appFetch(`/documents/${documentId}/pdf-stamp`, {});
  check("signed-out: the stamp page redirects to login (307)", signedOutPage.status === 307, `status ${signedOutPage.status}`);
} catch (error) {
  console.error("HARNESS ERROR", error);
  results.push({ name: "harness completed without throwing", ok: false, detail: String(error) });
} finally {
  // ---- cleanup ----
  if (documentId) {
    await admin.from("document_versions").delete().eq("document_id", documentId);
    await admin.from("documents").delete().eq("id", documentId);
    await admin.storage.from("documents").remove([`${workspaceAId}/${documentId}`].flatMap((p) => [1, 2, 3, 4, 5].map((v) => `${p}/v${v}/stamp-test.pdf`)));
  }
  if (userAId) await admin.auth.admin.deleteUser(userAId);
  if (userBId) await admin.auth.admin.deleteUser(userBId);
  if (workspaceAId) await admin.from("workspaces").delete().eq("id", workspaceAId);
  if (workspaceBId) await admin.from("workspaces").delete().eq("id", workspaceBId);
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed${failed.length ? ` — FAILED: ${failed.map((r) => r.name).join("; ")}` : ""}`);
  process.exit(failed.length ? 1 : 0);
}
