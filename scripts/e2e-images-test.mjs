// Live end-to-end harness for PDF <-> image (Day 22).
// Run with the app on :3000:
//   node scripts/e2e-images-test.mjs
// Creates real test users and deletes them afterwards.
// Temporary harness — not part of the repo.
//
// Requires the fixtures /tmp/e2e/pdf1.pdf (3 pages),
// /tmp/e2e/urdu.png (a PNG) and /tmp/e2e/sample.docx (a
// non-image, for the refusal check). A JPEG is made from the
// PNG at runtime with PIL (a real JPEG, not a renamed PNG).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
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
const userA = { email: `forma-e2e-img-a-${suffix}@example.com`, password: "TestPass123!" };
const userB = { email: `forma-e2e-img-b-${suffix}@example.com`, password: "TestPass123!" };
let userAId = "", userBId = "", workspaceAId = "";
let sessionA = null, sessionB = null;
let pdfDocId = "", pngDocId = "", jpgDocId = "", docxDocId = "";

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
async function uploadDoc(id, bytes, fileName, mimeType) {
  const filePath = `${workspaceAId}/${id}/v1/${fileName}`;
  const { error } = await admin.storage.from("documents").upload(filePath, bytes, { contentType: mimeType });
  if (error) throw new Error(`upload ${fileName}: ${error.message}`);
  await admin.from("documents").insert({ id, workspace_id: workspaceAId, folder_id: null, title: fileName, file_path: filePath, mime_type: mimeType, size_bytes: bytes.length, version: 1, created_by: userAId });
  await admin.from("document_versions").insert({ document_id: id, workspace_id: workspaceAId, version_number: 1, file_path: filePath, mime_type: mimeType, size_bytes: bytes.length, created_by: userAId });
  return filePath;
}
// Read the ZIP's central directory (no dependency): list the
// entry names and their uncompressed sizes.
function listZipEntries(zip) {
  const entries = [];
  // The end-of-central-directory record is the last 22 bytes
  // (plus a comment, which we do not write). Walk the central
  // directory backwards from the EOCD.
  const eocd = zip.length - 22;
  const cdCount = zip.readUInt16LE(eocd + 10);
  let offset = zip.readUInt32LE(eocd + 16);
  for (let i = 0; i < cdCount; i++) {
    const nameLen = zip.readUInt16LE(offset + 28);
    const extraLen = zip.readUInt16LE(offset + 30);
    const commentLen = zip.readUInt16LE(offset + 32);
    const name = zip.subarray(offset + 46, offset + 46 + nameLen).toString("utf8");
    const size = zip.readUInt32LE(offset + 24);
    entries.push({ name, size });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

try {
  for (const f of ["/tmp/e2e/pdf1.pdf", "/tmp/e2e/urdu.png", "/tmp/e2e/sample.docx"]) {
    if (!existsSync(f)) {
      console.log(`MISSING FIXTURE ${f} — rebuild it with scripts/rebuild-fixtures.mjs first.`);
      process.exit(1);
    }
  }
  // A real JPEG from the PNG fixture (PIL re-encodes it).
  execSync(`python3 -c "
from PIL import Image
Image.open('/tmp/e2e/urdu.png').convert('RGB').save('/tmp/e2e/urdu.jpg', 'JPEG')
"`, { stdio: "pipe" });
  const jpgBytes = readFileSync("/tmp/e2e/urdu.jpg");

  // ---- setup ----
  const { data: cA } = await admin.auth.admin.createUser({ email: userA.email, password: userA.password, email_confirm: true });
  userAId = cA.user.id;
  const { data: cB } = await admin.auth.admin.createUser({ email: userB.email, password: userB.password, email_confirm: true });
  userBId = cB.user.id;
  await admin.from("profiles").upsert({ id: userAId, display_name: "E2E Images" }, { onConflict: "id" });
  const { data: wsA } = await admin.from("workspaces").insert({ name: "E2E img ws A", owner_id: userAId, plan_key: "free", is_personal: true }).select("id").single();
  workspaceAId = wsA.id;
  await admin.from("workspace_members").insert({ workspace_id: workspaceAId, user_id: userAId, role: "owner", status: "active" });
  const clientA = createClient(SUPA_URL, PUB, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: sA } = await clientA.auth.signInWithPassword(userA);
  sessionA = sA.session;
  const clientB = createClient(SUPA_URL, PUB, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: sB } = await clientB.auth.signInWithPassword(userB);
  sessionB = sB.session;

  pdfDocId = crypto.randomUUID();
  pngDocId = crypto.randomUUID();
  jpgDocId = crypto.randomUUID();
  docxDocId = crypto.randomUUID();
  const pdfBytes = readFileSync("/tmp/e2e/pdf1.pdf");
  await uploadDoc(pdfDocId, pdfBytes, "pdf1.pdf", "application/pdf");
  const pngBytes = readFileSync("/tmp/e2e/urdu.png");
  await uploadDoc(pngDocId, pngBytes, "urdu.png", "image/png");
  await uploadDoc(jpgDocId, jpgBytes, "urdu.jpg", "image/jpeg");
  const docxBytes = readFileSync("/tmp/e2e/sample.docx");
  await uploadDoc(docxDocId, docxBytes, "sample.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  check("setup: the PDF, PNG, JPEG and DOCX upload", true);

  // ---- PDF -> images (PNG, 150 DPI) ----
  const pngExport = await appFetch(`/api/documents/${pdfDocId}/pdf/export-images?format=png&dpi=150`, { session: sessionA });
  const pngZip = new Uint8Array(await pngExport.arrayBuffer());
  check("export-images: PNG export returns 200 + a ZIP", pngExport.status === 200 && pngExport.headers.get("Content-Type") === "application/zip", `status ${pngExport.status}, type ${pngExport.headers.get("Content-Type")}`);
  const pngEntries = listZipEntries(Buffer.from(pngZip));
  check("export-images: the ZIP has 3 pages (page-1..3.png)", pngEntries.length === 3 && pngEntries.map((e) => e.name).join(",") === "page-1.png,page-2.png,page-3.png", pngEntries.map((e) => e.name).join(","));
  check("export-images: each PNG entry is non-empty", pngEntries.every((e) => e.size > 1000), pngEntries.map((e) => e.size).join(","));
  check("export-images: the download is named after the document", (pngExport.headers.get("Content-Disposition") ?? "").includes("pdf1-images.zip"));

  // ---- PDF -> images (JPG) ----
  const jpgExport = await appFetch(`/api/documents/${pdfDocId}/pdf/export-images?format=jpg&dpi=72`, { session: sessionA });
  const jpgZip = new Uint8Array(await jpgExport.arrayBuffer());
  const jpgEntries = listZipEntries(Buffer.from(jpgZip));
  check("export-images: JPG export returns 200 + 3 .jpg entries", jpgExport.status === 200 && jpgEntries.length === 3 && jpgEntries.every((e) => e.name.endsWith(".jpg")), jpgEntries.map((e) => e.name).join(","));

  // ---- export refusals ----
  const badFormat = await appFetch(`/api/documents/${pdfDocId}/pdf/export-images?format=tiff`, { session: sessionA });
  check("export-images: an unknown format is refused (400)", badFormat.status === 400, `status ${badFormat.status}`);
  const badDpi = await appFetch(`/api/documents/${pdfDocId}/pdf/export-images?dpi=200`, { session: sessionA });
  check("export-images: a bad DPI is refused (400)", badDpi.status === 400, `status ${badDpi.status}`);

  // ---- images -> PDF ----
  const toPdf = await appFetch("/api/documents/images-to-pdf", { session: sessionA, method: "POST", body: { documentIds: [pngDocId, jpgDocId], title: "My photos" } });
  const toPdfData = await toPdf.json().catch(() => ({}));
  check("images-to-pdf: succeeds (200) and returns the new document", toPdf.status === 200 && toPdfData.document?.title === "My photos", `status ${toPdf.status}, ${JSON.stringify(toPdfData).slice(0, 80)}`);
  const newDocId = toPdfData.document?.id;
  if (newDocId) {
    const { data: newDoc } = await admin.from("documents").select("file_path").eq("id", newDocId).maybeSingle();
    const { data: newBlob } = await admin.storage.from("documents").download(newDoc.file_path);
    const newBytes = new Uint8Array(await newBlob.arrayBuffer());
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await (await pdfjs.getDocument({ data: newBytes.slice() })).promise;
    check("images-to-pdf: the new PDF has 2 pages (one per image)", pdf.numPages === 2, `pages ${pdf.numPages}`);
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    check("images-to-pdf: the page is A4", Math.abs(viewport.width - 595.28) < 1 && Math.abs(viewport.height - 841.89) < 1, `${viewport.width.toFixed(1)}x${viewport.height.toFixed(1)}`);
  }
  // The source images are untouched (version 1, same bytes).
  const { data: pngDoc } = await admin.from("documents").select("version, file_path").eq("id", pngDocId).maybeSingle();
  const { data: pngBlob } = await admin.storage.from("documents").download(pngDoc.file_path);
  check("images-to-pdf: the source PNG is untouched (version 1, same bytes)", pngDoc.version === 1 && Buffer.compare(Buffer.from(new Uint8Array(await pngBlob.arrayBuffer())), Buffer.from(pngBytes)) === 0);

  // ---- images-to-PDF refusals ----
  const notImage = await appFetch("/api/documents/images-to-pdf", { session: sessionA, method: "POST", body: { documentIds: [docxDocId] } });
  check("images-to-pdf: a non-image document is refused (400)", notImage.status === 400, `status ${notImage.status}`);
  const empty = await appFetch("/api/documents/images-to-pdf", { session: sessionA, method: "POST", body: { documentIds: [] } });
  check("images-to-pdf: an empty list is refused (400)", empty.status === 400, `status ${empty.status}`);

  // ---- the images-to-PDF page ----
  const pageA = await appFetch("/images-to-pdf", { session: sessionA });
  const pageHtml = await pageA.text();
  check("images-to-pdf page: loads for A (200) and shows Images to PDF", pageA.status === 200 && pageHtml.includes("Images to PDF"), `status ${pageA.status}`);
  const pageB = await appFetch("/images-to-pdf", { session: sessionB });
  check("images-to-pdf page: loads for B too (200, an empty list)", pageB.status === 200, `status ${pageB.status}`);

  // ---- cross-user isolation ----
  const exportB = await appFetch(`/api/documents/${pdfDocId}/pdf/export-images`, { session: sessionB });
  check("isolation: user B gets 404 on export-images", exportB.status === 404, `status ${exportB.status}`);
  const toPdfB = await appFetch("/api/documents/images-to-pdf", { session: sessionB, method: "POST", body: { documentIds: [pngDocId] } });
  check("isolation: user B gets 404 on images-to-pdf", toPdfB.status === 404, `status ${toPdfB.status}`);

  // ---- signed-out ----
  const soExport = await fetch(`${APP}/api/documents/${pdfDocId}/pdf/export-images`, { redirect: "manual" });
  check("signed-out: export-images redirects to login (307)", soExport.status === 307, `status ${soExport.status}`);
  const soToPdf = await fetch(`${APP}/api/documents/images-to-pdf`, { method: "POST", redirect: "manual" });
  check("signed-out: images-to-pdf redirects to login (307)", soToPdf.status === 307, `status ${soToPdf.status}`);
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
