// Live end-to-end harness for OCR (Phase C, Day 13). Run with the
// app on :3000 AND the worker running (node ocr/worker.ts):
//   node scripts/e2e-ocr-test.mjs
// Creates real test users and deletes them afterwards.
// Temporary harness — not part of the repo.
// Requires the app on http://localhost:3000.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const APP = "http://localhost:3000";
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`
  );
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
  email: `forma-e2e-ocr-a-${suffix}@example.com`,
  password: "TestPass123!",
};
const userB = {
  email: `forma-e2e-ocr-b-${suffix}@example.com`,
  password: "TestPass123!",
};
let userAId = "",
  userBId = "",
  workspaceAId = "";
let sessionA = null,
  sessionB = null;

function cookieFor(session) {
  return `sb-${REF}-auth-token=base64-${Buffer.from(JSON.stringify(session), "utf8").toString("base64url")}`;
}
async function appFetch(
  path,
  { session, method = "GET", body, contentType } = {}
) {
  const headers = {};
  if (session) headers.Cookie = cookieFor(session);
  if (body !== undefined)
    headers["Content-Type"] = contentType ?? "application/json";
  return fetch(`${APP}${path}`, {
    method,
    headers,
    body:
      body === undefined
        ? undefined
        : typeof body === "string"
          ? body
          : JSON.stringify(body),
    redirect: "manual",
  });
}
async function downloadVersion(docId, version) {
  const { data: v } = await admin
    .from("document_versions")
    .select("file_path")
    .eq("document_id", docId)
    .eq("version_number", version)
    .single();
  if (!v) return null;
  const { data: blob } = await admin.storage
    .from("documents")
    .download(v.file_path);
  return new Uint8Array(await blob.arrayBuffer());
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
    .upsert({ id: userAId, display_name: "E2E OCR" }, { onConflict: "id" });
  const { data: ws } = await admin
    .from("workspaces")
    .insert({
      name: "E2E ocr ws",
      owner_id: userAId,
      plan_key: "free",
      is_personal: true,
    })
    .select("id")
    .single();
  workspaceAId = ws.id;
  await admin
    .from("workspace_members")
    .insert({
      workspace_id: workspaceAId,
      user_id: userAId,
      role: "owner",
      status: "active",
    });
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
  async function uploadAsA(localPath, title, mime) {
    const bytes = readFileSync(localPath);
    const docId = crypto.randomUUID();
    const fileName = localPath
      .split("/")
      .pop()
      .replace(/[^A-Za-z0-9._-]+/g, "_");
    const filePath = `${workspaceAId}/${docId}/v1/${fileName}`;
    const { error: upErr } = await clientA.storage
      .from("documents")
      .upload(filePath, bytes, { contentType: mime });
    if (upErr) throw new Error(`upload ${title}: ${upErr.message}`);
    await clientA
      .from("documents")
      .insert({
        id: docId,
        workspace_id: workspaceAId,
        title,
        file_path: filePath,
        mime_type: mime,
        size_bytes: bytes.length,
        version: 1,
        created_by: userAId,
      });
    await clientA
      .from("document_versions")
      .insert({
        document_id: docId,
        workspace_id: workspaceAId,
        version_number: 1,
        file_path: filePath,
        mime_type: mime,
        size_bytes: bytes.length,
        created_by: userAId,
      });
    return docId;
  }
  const scannedId = await uploadAsA(
    "/tmp/e2e/scanned.pdf",
    "Scanned PDF",
    "application/pdf"
  );
  const urduId = await uploadAsA(
    "/tmp/e2e/urdu.png",
    "Urdu image",
    "image/png"
  );
  const noteId = await uploadAsA(
    "/tmp/e2e/note.txt",
    "Plain note",
    "text/plain"
  );
  check("setup: users + scanned PDF + Urdu image + text file ready", true);

  async function ocrStatus(docId, session) {
    const resp = await appFetch(`/api/documents/${docId}/ocr`, { session });
    return { status: resp.status, body: await resp.json().catch(() => ({})) };
  }
  async function waitForOcr(docId, session, timeoutMs = 90_000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const { body } = await ocrStatus(docId, session);
      if (
        body.job &&
        (body.job.status === "done" || body.job.status === "failed")
      )
        return body;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 2000));
    }
    return (await ocrStatus(docId, session)).body;
  }

  // Before any job, the status is empty.
  let oc = await ocrStatus(scannedId, sessionA);
  check(
    "ocr: a never-OCR'd document reports job null",
    oc.status === 200 && oc.body.job === null,
    `status ${oc.status}`
  );
  // Enqueue the English scan.
  let r = await appFetch(`/api/documents/${scannedId}/ocr`, {
    session: sessionA,
    method: "POST",
    body: { language: "eng" },
  });
  let j = await r.json().catch(() => ({}));
  check(
    "ocr: enqueueing the scan returns 200 + a pending job",
    r.status === 200 &&
      j.job &&
      (j.job.status === "pending" || j.job.status === "processing"),
    `status ${r.status}, job ${j.job?.status}`
  );
  // A second enqueue while one is in progress is refused.
  r = await appFetch(`/api/documents/${scannedId}/ocr`, {
    session: sessionA,
    method: "POST",
    body: { language: "eng" },
  });
  check(
    "ocr: a second job while one is in progress is refused (409)",
    r.status === 409,
    `status ${r.status}`
  );
  // Wait for the worker, then check the text.
  const scannedResult = await waitForOcr(scannedId, sessionA);
  check(
    "ocr: the scan job finishes done",
    scannedResult.job?.status === "done",
    `status ${scannedResult.job?.status}, error ${scannedResult.job?.error ?? ""}`
  );
  const scannedPages = Array.isArray(scannedResult.results)
    ? scannedResult.results
    : [];
  const page1 = scannedPages.find((p) => p.page === 1);
  const page2 = scannedPages.find((p) => p.page === 2);
  check(
    "ocr: 2 pages of results",
    scannedPages.length === 2,
    `pages ${scannedPages.length}`
  );
  check(
    "ocr: page 1 text reads the scan",
    page1 &&
      page1.text.includes("Forma Office OCR test") &&
      page1.text.includes("The quick brown fox jumps") &&
      page1.text.includes("over the lazy dog"),
    page1 ? page1.text.split("\n")[0] : "no page 1"
  );
  check(
    "ocr: page 2 text reads the scan",
    page2 &&
      page2.text.includes("Second page of the scan") &&
      page2.text.includes("Pack my box with five dozen") &&
      page2.text.includes("liquor jugs"),
    page2 ? page2.text.split("\n")[0] : "no page 2"
  );
  check(
    "ocr: page 1 confidence is high",
    page1 && typeof page1.confidence === "number" && page1.confidence > 80,
    `confidence ${page1?.confidence}`
  );
  // The original file is untouched: still version 1, same bytes.
  const { data: scannedDoc } = await admin
    .from("documents")
    .select("version")
    .eq("id", scannedId)
    .single();
  check(
    "ocr: the document is still version 1 (original untouched)",
    scannedDoc?.version === 1,
    `version ${scannedDoc?.version}`
  );
  const scannedV1 = await downloadVersion(scannedId, 1);
  const scannedOriginal = readFileSync("/tmp/e2e/scanned.pdf");
  check(
    "ocr: version 1 bytes are identical to the upload",
    scannedV1 ? Buffer.from(scannedV1).equals(scannedOriginal) : false
  );
  // Urdu image.
  r = await appFetch(`/api/documents/${urduId}/ocr`, {
    session: sessionA,
    method: "POST",
    body: { language: "urd" },
  });
  check(
    "ocr: enqueueing the Urdu image returns 200",
    r.status === 200,
    `status ${r.status}`
  );
  const urduResult = await waitForOcr(urduId, sessionA);
  check(
    "ocr: the Urdu job finishes done",
    urduResult.job?.status === "done",
    `status ${urduResult.job?.status}, error ${urduResult.job?.error ?? ""}`
  );
  const urduPage = (
    Array.isArray(urduResult.results) ? urduResult.results : []
  )[0];
  check(
    "ocr: the Urdu text reads (second line exactly)",
    urduPage && urduPage.text.includes("یہ ایک اردو جانچ ہے"),
    urduPage ? urduPage.text : "no result"
  );
  // A non-OCR file is refused.
  r = await appFetch(`/api/documents/${noteId}/ocr`, {
    session: sessionA,
    method: "POST",
    body: { language: "eng" },
  });
  check(
    "ocr: a plain-text file is refused (400)",
    r.status === 400,
    `status ${r.status}`
  );
  // A bad language is refused.
  r = await appFetch(`/api/documents/${scannedId}/ocr`, {
    session: sessionA,
    method: "POST",
    body: { language: "fra" },
  });
  check(
    "ocr: an unsupported language is refused (400)",
    r.status === 400,
    `status ${r.status}`
  );
  // Cross-user + signed-out.
  r = await appFetch(`/api/documents/${scannedId}/ocr`, {
    session: sessionB,
    method: "POST",
    body: { language: "eng" },
  });
  check(
    "ocr: user B cannot enqueue on A's document (404)",
    r.status === 404,
    `status ${r.status}`
  );
  oc = await ocrStatus(scannedId, sessionB);
  check(
    "ocr: user B cannot read A's OCR status (404)",
    oc.status === 404,
    `status ${oc.status}`
  );
  r = await appFetch(`/api/documents/${scannedId}/ocr`, {
    method: "POST",
    body: { language: "eng" },
  });
  check(
    "ocr: signed-out enqueue redirects to login (307)",
    r.status === 307,
    `status ${r.status}`
  );
  oc = await ocrStatus(scannedId, undefined);
  check(
    "ocr: signed-out status redirects to login (307)",
    oc.status === 307,
    `status ${oc.status}`
  );
  const ocrPage = await appFetch(`/documents/${scannedId}/ocr`, {
    session: sessionA,
  });
  const ocrPageHtml = await ocrPage.text();
  check(
    "ocr page: loads for A (200) and shows the OCR page",
    ocrPage.status === 200 && ocrPageHtml.includes("OCR"),
    `status ${ocrPage.status}`
  );
  const ocrPageB = await appFetch(`/documents/${scannedId}/ocr`, {
    session: sessionB,
  });
  const ocrPageBHtml = await ocrPageB.text();
  check(
    "ocr page: user B sees 'Document not found', not the OCR page",
    ocrPageB.status === 200 && ocrPageBHtml.includes("Document not found"),
    `status ${ocrPageB.status}`
  );
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
