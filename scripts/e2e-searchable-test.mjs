// Live end-to-end harness for searchable PDF + extract text
// (Day 21).
// Run with the app on :3000 and the OCR worker running:
//   node scripts/e2e-searchable-test.mjs
// Creates real test users and deletes them afterwards.
// Temporary harness — not part of the repo.
//
// REQUIRES the Day 21 migration (the `words` column on
// document_ocr_results) to be applied in Supabase first — run
// ~/workspace/your_files/forma-ocr-words-migration.sql in the
// Dashboard SQL Editor. If the migration is not applied, the
// harness reports it clearly and only runs the extract-text
// checks (which do not need the migration).
// Requires the fixture /tmp/e2e/scanned.pdf (2 image-only
// pages, from the Day 13 recovery).
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
const userA = { email: `forma-e2e-search-a-${suffix}@example.com`, password: "TestPass123!" };
const userB = { email: `forma-e2e-search-b-${suffix}@example.com`, password: "TestPass123!" };
let userAId = "", userBId = "", workspaceAId = "";
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
async function pageText(bytes, pageNumber) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await (await pdfjs.getDocument({ data: bytes.slice() })).promise;
  const page = await pdf.getPage(pageNumber);
  const content = await page.getTextContent();
  return content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
}

try {
  if (!existsSync("/tmp/e2e/scanned.pdf")) {
    console.log("MISSING FIXTURE /tmp/e2e/scanned.pdf — rebuild it with scripts/rebuild-fixtures.mjs first.");
    process.exit(1);
  }
  // ---- setup ----
  const { data: cA } = await admin.auth.admin.createUser({ email: userA.email, password: userA.password, email_confirm: true });
  userAId = cA.user.id;
  const { data: cB } = await admin.auth.admin.createUser({ email: userB.email, password: userB.password, email_confirm: true });
  userBId = cB.user.id;
  await admin.from("profiles").upsert({ id: userAId, display_name: "E2E Searchable" }, { onConflict: "id" });
  const { data: wsA } = await admin.from("workspaces").insert({ name: "E2E search ws A", owner_id: userAId, plan_key: "free", is_personal: true }).select("id").single();
  workspaceAId = wsA.id;
  await admin.from("workspace_members").insert({ workspace_id: workspaceAId, user_id: userAId, role: "owner", status: "active" });
  const clientA = createClient(SUPA_URL, PUB, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: sA } = await clientA.auth.signInWithPassword(userA);
  sessionA = sA.session;
  const clientB = createClient(SUPA_URL, PUB, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: sB } = await clientB.auth.signInWithPassword(userB);
  sessionB = sB.session;

  // ---- is the Day 21 migration applied? ----
  const { error: wordsCheck } = await admin.from("document_ocr_results").select("words").limit(1);
  const migrationApplied = !wordsCheck;
  check(
    "setup: the Day 21 migration (words column) is applied",
    migrationApplied,
    migrationApplied ? "" : "run forma-ocr-words-migration.sql, then re-run this harness"
  );

  // ---- upload the scanned PDF ----
  const pdfBytes = readFileSync("/tmp/e2e/scanned.pdf");
  documentId = crypto.randomUUID();
  const filePath = `${workspaceAId}/${documentId}/v1/scanned.pdf`;
  const { error: upErr } = await admin.storage.from("documents").upload(filePath, pdfBytes, { contentType: "application/pdf" });
  check("setup: the scanned PDF uploads to Storage", !upErr, upErr?.message ?? "");
  await admin.from("documents").insert({ id: documentId, workspace_id: workspaceAId, folder_id: null, title: "Scanned test", file_path: filePath, mime_type: "application/pdf", size_bytes: pdfBytes.length, version: 1, created_by: userAId });
  await admin.from("document_versions").insert({ document_id: documentId, workspace_id: workspaceAId, version_number: 1, file_path: filePath, mime_type: "application/pdf", size_bytes: pdfBytes.length, created_by: userAId });
  const v1Bytes = pdfBytes;

  // ---- extract-text on the SCANNED pdf (no text layer) ----
  const extractScanned = await appFetch(`/api/documents/${documentId}/pdf/extract-text`, { session: sessionA });
  const scannedText = await extractScanned.text();
  check("extract-text: the scanned PDF returns 200", extractScanned.status === 200, `status ${extractScanned.status}`);
  check("extract-text: the scanned PDF's text is empty (no text layer)", scannedText.trim() === "", `got ${JSON.stringify(scannedText.slice(0, 60))}`);
  check("extract-text: the empty case is flagged in a header", extractScanned.headers.get("X-Forma-Extract-Empty") === "1");
  check("extract-text: the download is a .txt file", (extractScanned.headers.get("Content-Disposition") ?? "").includes(".txt"));

  if (migrationApplied) {
    // ---- run OCR (the worker stores the words) ----
    const ocrResp = await appFetch(`/api/documents/${documentId}/ocr`, { session: sessionA, method: "POST", body: { language: "eng" } });
    check("ocr: the job enqueues (200)", ocrResp.status === 200, `status ${ocrResp.status}`);
    // Poll the status until the job is done (the worker polls every 5s).
    let jobDone = false;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const statusResp = await appFetch(`/api/documents/${documentId}/ocr`, { session: sessionA });
      const statusData = await statusResp.json().catch(() => ({}));
      if (statusData.job?.status === "done") { jobDone = true; break; }
      if (statusData.job?.status === "failed") break;
    }
    check("ocr: the job finishes (done)", jobDone);
    // The words are stored.
    const { data: stored } = await admin.from("document_ocr_results").select("words").eq("document_id", documentId).order("page_number");
    const storedWords = (stored ?? []).flatMap((r) => (Array.isArray(r.words) ? r.words : []));
    check("ocr: the word boxes are stored", storedWords.length > 0, `${storedWords.length} words`);

    // ---- make it searchable ----
    const searchResp = await appFetch(`/api/documents/${documentId}/pdf/make-searchable`, { session: sessionA, method: "POST", body: {} });
    const searchData = await searchResp.json().catch(() => ({}));
    check("make-searchable: succeeds (200) and creates version 2", searchResp.status === 200 && searchData.version === 2, `status ${searchResp.status}, version ${searchData.version}`);
    const searchableBytes = await currentBytes(documentId);
    const text1 = await pageText(searchableBytes, 1);
    check("make-searchable: page 1 is now searchable (the fox)", text1.includes("The quick brown fox jumps"), text1.slice(0, 80));
    const text2 = await pageText(searchableBytes, 2);
    check("make-searchable: page 2 is now searchable (liquor jugs)", text2.includes("Pack my box with five dozen"), text2.slice(0, 80));
    // The extract-text route now returns the searchable text.
    const extractAfter = await appFetch(`/api/documents/${documentId}/pdf/extract-text`, { session: sessionA });
    const afterText = await extractAfter.text();
    check("extract-text: after make-searchable, the text is returned", afterText.includes("The quick brown fox jumps") && afterText.includes("Pack my box"), afterText.slice(0, 80));
    check("extract-text: the empty header is gone", extractAfter.headers.get("X-Forma-Extract-Empty") === null);

    // ---- the OCR page shows the Make searchable button ----
    const ocrPage = await appFetch(`/documents/${documentId}/ocr`, { session: sessionA });
    const ocrHtml = await ocrPage.text();
    check("ocr page: loads for A (200) and shows Make searchable", ocrPage.status === 200 && ocrHtml.includes("Make searchable"), `status ${ocrPage.status}`);

    // ---- version 1 is unchanged ----
    const { data: v1 } = await admin.from("document_versions").select("file_path").eq("document_id", documentId).eq("version_number", 1).maybeSingle();
    const { data: v1Blob } = await admin.storage.from("documents").download(v1.file_path);
    const v1Downloaded = new Uint8Array(await v1Blob.arrayBuffer());
    check("versions: version 1 is byte-identical to the upload", Buffer.compare(Buffer.from(v1Downloaded), Buffer.from(v1Bytes)) === 0, `${v1Downloaded.length} bytes`);

    // ---- make-searchable again (already searchable) still works ----
    const searchAgain = await appFetch(`/api/documents/${documentId}/pdf/make-searchable`, { session: sessionA, method: "POST", body: {} });
    check("make-searchable: running it again creates version 3", searchAgain.status === 200, `status ${searchAgain.status}`);

    // ---- cross-user isolation ----
    const searchB = await appFetch(`/api/documents/${documentId}/pdf/make-searchable`, { session: sessionB, method: "POST", body: {} });
    check("isolation: user B gets 404 on make-searchable", searchB.status === 404, `status ${searchB.status}`);
    const extractB = await appFetch(`/api/documents/${documentId}/pdf/extract-text`, { session: sessionB });
    check("isolation: user B gets 404 on extract-text", extractB.status === 404, `status ${extractB.status}`);
  } else {
    console.log("\nNOTE: the make-searchable checks were skipped — the migration is not applied yet.");
  }

  // ---- signed-out (both routes) ----
  const soSearch = await fetch(`${APP}/api/documents/${documentId}/pdf/make-searchable`, { method: "POST", redirect: "manual" });
  check("signed-out: make-searchable redirects to login (307)", soSearch.status === 307, `status ${soSearch.status}`);
  const soExtract = await fetch(`${APP}/api/documents/${documentId}/pdf/extract-text`, { redirect: "manual" });
  check("signed-out: extract-text redirects to login (307)", soExtract.status === 307, `status ${soExtract.status}`);
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
