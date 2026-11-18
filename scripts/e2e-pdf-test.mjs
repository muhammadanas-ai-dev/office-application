// Live end-to-end harness (dev only). Run with the app on :3000 and the docserver on :8083:
//   node scripts/e2e-pdf-test.mjs
// Creates real test users and deletes them afterwards.
// End-to-end test of the Forma PDF features (export + PDF tools +
// editor save) against the RUNNING app, as a real signed-in user.
// Temporary harness — not part of the repo. Run: node e2e-pdf-test.tmp.mjs
// Requires: the app on http://localhost:3000, the docserver on
// http://localhost:8083, and a file server on http://localhost:8899
// serving /tmp/e2e/e2e-edited.docx (for the editor callback test).
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";
import * as jose from "jose";

const APP = "http://localhost:3000";
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}
function fail(name, detail) {
  check(name, false, detail);
}

// ---- env ----
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
const OO_SECRET = env.ONLYOFFICE_JWT_SECRET;
if (!URL || !PUB || !SVC || !OO_SECRET) throw new Error("missing env");

const admin = createClient(SUPA_URL, SVC, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const suffix = Date.now().toString(36);
const userA = { email: `forma-e2e-a-${suffix}@example.com`, password: "TestPass123!" };
const userB = { email: `forma-e2e-b-${suffix}@example.com`, password: "TestPass123!" };
let userAId = "", userBId = "", workspaceAId = "";
let docxId = "", pdf1Id = "", pdf2Id = "", imgPdfId = "";
let sessionA = null, sessionB = null;

function cookieFor(session) {
  const json = JSON.stringify(session);
  return `sb-${REF}-auth-token=base64-${Buffer.from(json, "utf8").toString("base64url")}`;
}
async function appFetch(path, { session, method = "GET", body, contentType } = {}) {
  const headers = {};
  if (session) headers.Cookie = cookieFor(session);
  if (body !== undefined) {
    headers["Content-Type"] = contentType ?? "application/json";
  }
  return fetch(`${APP}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    redirect: "manual",
  });
}
function pdftotext(bytes) {
  const p = `/tmp/e2e/out-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`;
  writeFileSync(p, bytes);
  try {
    return execSync(`pdftotext ${p} -`, { encoding: "utf8" });
  } finally {
    execSync(`rm -f ${p}`);
  }
}
function pdfFonts(bytes) {
  const p = `/tmp/e2e/out-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`;
  writeFileSync(p, bytes);
  try {
    return execSync(`pdffonts ${p}`, { encoding: "utf8" });
  } finally {
    execSync(`rm -f ${p}`);
  }
}
/** Read one file out of a ZIP archive (a DOCX/XLSX/PPTX) with python. */
function zipRead(zipPath, innerPath) {
  return execSync(
    `python3 -c "import zipfile,sys; sys.stdout.write(zipfile.ZipFile('${zipPath}').read('${innerPath}').decode())"`,
    { encoding: "utf8" }
  );
}

try {
  // ---- 1. create users + provision A ----
  const { data: createdA, error: errA } = await admin.auth.admin.createUser({
    email: userA.email, password: userA.password, email_confirm: true,
  });
  if (errA) throw new Error("create user A: " + errA.message);
  userAId = createdA.user.id;
  const { data: createdB, error: errB } = await admin.auth.admin.createUser({
    email: userB.email, password: userB.password, email_confirm: true,
  });
  if (errB) throw new Error("create user B: " + errB.message);
  userBId = createdB.user.id;
  // Provision A exactly as ensureProfileAndWorkspace does.
  const { error: profErr } = await admin.from("profiles").upsert({ id: userAId, display_name: "E2E User" }, { onConflict: "id" });
  if (profErr) throw new Error("provision profile: " + profErr.message);
  const { data: ws, error: wsErr } = await admin.from("workspaces").insert({ name: "E2E workspace", owner_id: userAId, plan_key: "free", is_personal: true }).select("id").single();
  if (wsErr) throw new Error("provision workspace: " + wsErr.message);
  workspaceAId = ws.id;
  const { error: memErr } = await admin.from("workspace_members").insert({ workspace_id: workspaceAId, user_id: userAId, role: "owner", status: "active" });
  if (memErr) throw new Error("provision member: " + memErr.message);
  check("setup: users created and A provisioned", true);

  // ---- 2. sign in as A and B ----
  const clientA = createClient(SUPA_URL, PUB, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: signA, error: signErrA } = await clientA.auth.signInWithPassword(userA);
  if (signErrA) throw new Error("sign-in A: " + signErrA.message);
  sessionA = signA.session;
  const clientB = createClient(SUPA_URL, PUB, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: signB, error: signErrB } = await clientB.auth.signInWithPassword(userB);
  if (signErrB) throw new Error("sign-in B: " + signErrB.message);
  sessionB = signB.session;
  check("setup: A and B signed in (session cookies built)", true);

  // ---- 3. upload files as A (user client: Storage + REST, RLS applies) ----
  async function uploadAsA(localPath, title, mime) {
    const bytes = readFileSync(localPath);
    const docId = crypto.randomUUID();
    const fileName = localPath.split("/").pop().replace(/[^A-Za-z0-9._-]+/g, "_");
    const filePath = `${workspaceAId}/${docId}/v1/${fileName}`;
    const { error: upErr } = await clientA.storage.from("documents").upload(filePath, bytes, { contentType: mime });
    if (upErr) throw new Error(`upload ${title}: ${upErr.message}`);
    const { error: docErr } = await clientA.from("documents").insert({ id: docId, workspace_id: workspaceAId, title, file_path: filePath, mime_type: mime, size_bytes: bytes.length, version: 1, created_by: userAId });
    if (docErr) throw new Error(`insert doc ${title}: ${docErr.message}`);
    const { error: verErr } = await clientA.from("document_versions").insert({ document_id: docId, workspace_id: workspaceAId, version_number: 1, file_path: filePath, mime_type: mime, size_bytes: bytes.length, created_by: userAId });
    if (verErr) throw new Error(`insert version ${title}: ${verErr.message}`);
    return docId;
  }
  docxId = await uploadAsA("/tmp/e2e/e2e.docx", "E2E Report", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  pdf1Id = await uploadAsA("/tmp/e2e/pdf1.pdf", "PDF One", "application/pdf");
  pdf2Id = await uploadAsA("/tmp/e2e/pdf2.pdf", "PDF Two", "application/pdf");
  imgPdfId = await uploadAsA("/tmp/chrome-proof/img.pdf", "Image PDF", "application/pdf");
  check("setup: DOCX + 3 PDFs uploaded as A (Storage + RLS)", true);

  // ---- 4. PDF export ----
  const exp = await appFetch(`/api/documents/${docxId}/export?format=pdf`, { session: sessionA });
  if (exp.status === 200 && exp.headers.get("content-type")?.includes("application/pdf")) {
    const bytes = new Uint8Array(await exp.arrayBuffer());
    const text = pdftotext(bytes);
    check("export: DOCX exports to a real PDF as A", text.includes("Forma E2E export test") && text.includes("Second line for the export check"), `disposition: ${exp.headers.get("content-disposition")}`);
  } else {
    fail("export: DOCX exports to a real PDF as A", `status ${exp.status}: ${(await exp.text()).slice(0, 120)}`);
  }
  const expPdf = await appFetch(`/api/documents/${pdf1Id}/export?format=pdf`, { session: sessionA });
  check("export: a PDF source is refused with a clear 400", expPdf.status === 400, `status ${expPdf.status}`);
  const expBad = await appFetch(`/api/documents/${docxId}/export?format=docx`, { session: sessionA });
  check("export: a non-pdf format is refused with 400", expBad.status === 400, `status ${expBad.status}`);
  const expB = await appFetch(`/api/documents/${docxId}/export?format=pdf`, { session: sessionB });
  check("export: user B cannot export A's document (404)", expB.status === 404, `status ${expB.status}`);
  const expAnon = await appFetch(`/api/documents/${docxId}/export?format=pdf`);
  check("export: signed-out export redirects to login (307)", expAnon.status === 307, `status ${expAnon.status}`);

  // ---- 5. PDF tools ----
  async function postTool(tool, docId, body, session) {
    return appFetch(`/api/documents/${docId}/pdf/${tool}`, { session, method: "POST", body });
  }
  const merged = await postTool("merge", pdf1Id, { documentIds: [pdf1Id, pdf2Id] }, sessionA);
  if (merged.status === 200) {
    const bytes = new Uint8Array(await merged.arrayBuffer());
    const doc = await PDFDocument.load(bytes);
    const text = pdftotext(bytes);
    check("merge: two PDFs merge into one (5 pages, both texts)", doc.getPageCount() === 5 && text.includes("PDF One page 1") && text.includes("PDF Two page 2"), `pages ${doc.getPageCount()}`);
  } else fail("merge: two PDFs merge into one", `status ${merged.status}: ${(await merged.text()).slice(0, 120)}`);
  const mergedB = await postTool("merge", pdf1Id, { documentIds: [pdf1Id, pdf2Id] }, sessionB);
  check("merge: user B cannot merge A's PDFs (404)", mergedB.status === 404, `status ${mergedB.status}`);
  const mergedAnon = await postTool("merge", pdf1Id, { documentIds: [pdf1Id, pdf2Id] });
  check("merge: signed-out merge redirects to login (307)", mergedAnon.status === 307, `status ${mergedAnon.status}`);

  const split = await postTool("split", pdf1Id, { pages: "1-2" }, sessionA);
  if (split.status === 200) {
    const bytes = new Uint8Array(await split.arrayBuffer());
    const doc = await PDFDocument.load(bytes);
    const text = pdftotext(bytes);
    check("split: pages 1-2 extract to a 2-page PDF", doc.getPageCount() === 2 && text.includes("PDF One page 1") && text.includes("PDF One page 2") && !text.includes("PDF One page 3"), `pages ${doc.getPageCount()}`);
  } else fail("split: pages 1-2 extract to a 2-page PDF", `status ${split.status}: ${(await split.text()).slice(0, 120)}`);
  const splitBad = await postTool("split", pdf1Id, { pages: "99" }, sessionA);
  check("split: a page past the end is refused with 400", splitBad.status === 400, `status ${splitBad.status}`);

  const rotated = await postTool("rotate", pdf1Id, { pages: "1", degrees: 90 }, sessionA);
  if (rotated.status === 200) {
    const bytes = new Uint8Array(await rotated.arrayBuffer());
    const doc = await PDFDocument.load(bytes);
    check("rotate: page 1 rotates to 90, others stay 0", doc.getPage(0).getRotation().angle === 90 && doc.getPage(1).getRotation().angle === 0, `angles ${doc.getPage(0).getRotation().angle}/${doc.getPage(1).getRotation().angle}`);
  } else fail("rotate: page 1 rotates to 90", `status ${rotated.status}: ${(await rotated.text()).slice(0, 120)}`);
  const rotateBad = await postTool("rotate", pdf1Id, { pages: "1", degrees: 45 }, sessionA);
  check("rotate: 45 degrees is refused with 400", rotateBad.status === 400, `status ${rotateBad.status}`);

  const compressed = await postTool("compress", imgPdfId, { level: "ebook" }, sessionA);
  if (compressed.status === 200) {
    const bytes = new Uint8Array(await compressed.arrayBuffer());
    const doc = await PDFDocument.load(bytes);
    const saved = Number(compressed.headers.get("x-forma-compress-saved-bytes") ?? "0");
    const original = readFileSync("/tmp/chrome-proof/img.pdf").length;
    check("compress: image PDF shrinks with pages intact", bytes.length < original && doc.getPageCount() === 1 && saved === original - bytes.length, `${original} -> ${bytes.length} bytes (saved ${saved})`);
  } else fail("compress: image PDF shrinks", `status ${compressed.status}: ${(await compressed.text()).slice(0, 120)}`);
  const compressedB = await postTool("compress", pdf1Id, { level: "ebook" }, sessionB);
  check("compress: user B cannot compress A's PDF (404)", compressedB.status === 404, `status ${compressedB.status}`);

  // ---- 6. Editor: page + file route + save callback ----
  const editorPage = await appFetch(`/editor/${docxId}`, { session: sessionA });
  const editorHtml = await editorPage.text();
  check("editor: editor page loads for A (200)", editorPage.status === 200, `status ${editorPage.status}`);
  // The config sits in the RSC flight payload, where quotes are
  // escaped (\"key\":\"...\"). Match both escaped and plain quotes.
  const keyMatch = editorHtml.match(/key\\?":\\?"([0-9a-f]{20})/);
  // The file URL appears in the RSC flight payload, where slashes
  // may be escaped (\/). Match both forms.
  const fileMatch = editorHtml.match(/editor(?:\\?\/)file(?:\\?\/)([0-9a-f-]{36})(?:\\?\/)?\?t=([A-Za-z0-9._~-]+)/)
    ?? editorHtml.match(/editor\/file\/([0-9a-f-]{36})\?t=([A-Za-z0-9._~-]+)/);
  check("editor: config carries a document key + file URL", Boolean(keyMatch && fileMatch), keyMatch ? `key ${keyMatch[1].slice(0, 8)}…` : "no key in page");
  if (fileMatch) {
    const fileRes = await appFetch(`/api/editor/file/${fileMatch[1]}?t=${fileMatch[2]}`);
    const fileBytes = new Uint8Array(await fileRes.arrayBuffer());
    check("editor: file route serves the DOCX (HMAC token)", fileRes.status === 200 && fileBytes.length > 0 && fileBytes[0] === 0x50 && fileBytes[1] === 0x4b, `status ${fileRes.status}, ${fileBytes.length} bytes`);
  }
  if (keyMatch) {
    const token = await new jose.SignJWT({ key: keyMatch[1], status: 2, url: "http://localhost:8899/e2e-edited.docx", filetype: "docx", changesurl: null, history: null })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" }).setIssuedAt().setExpirationTime("5m")
      .sign(new TextEncoder().encode(OO_SECRET));
    const cb = await appFetch("/api/editor/callback", { method: "POST", body: JSON.stringify({ token }), contentType: "application/json" });
    const cbJson = await cb.json().catch(() => ({}));
    check("editor: save callback (status 2) is accepted", cb.status === 200 && cbJson.error === 0, `status ${cb.status}, body ${JSON.stringify(cbJson)}`);
    // Verify a new version exists.
    const { data: docRow } = await admin.from("documents").select("version").eq("id", docxId).single();
    const { data: versions } = await admin.from("document_versions").select("version_number").eq("document_id", docxId).order("version_number");
    check("editor: save created version 2", docRow?.version === 2 && versions?.length === 2, `version ${docRow?.version}, versions ${versions?.map((v) => v.version_number).join(",")}`);
    // The new version's file should be the edited text.
    const { data: v2 } = await admin.from("document_versions").select("file_path").eq("document_id", docxId).eq("version_number", 2).single();
    if (v2?.file_path) {
      const { data: blob } = await admin.storage.from("documents").download(v2.file_path);
      const buf = Buffer.from(await blob.arrayBuffer());
      // The DOCX is a ZIP (deflated), so the text lives inside
      // word/document.xml — read it out of the archive, don't grep
      // the compressed bytes.
      writeFileSync("/tmp/e2e/v2.docx", buf);
      const docXml = execSync("python3 -c \"import zipfile,sys; print(zipfile.ZipFile('/tmp/e2e/v2.docx').read('word/document.xml').decode())\"", { encoding: "utf8" });
      check("editor: version 2 contains the edited text", docXml.includes("Forma E2E edited version"));
    } else fail("editor: version 2 contains the edited text", "no v2 file_path");
  }
  const editorB = await appFetch(`/editor/${docxId}`, { session: sessionB });
  const editorBHtml = await editorB.text();
  // RLS hides A's document from B, so the page shows its
  // "Document not found" empty state (200) — never the editor.
  check("editor: user B cannot open A's document in the editor", editorB.status === 200 && editorBHtml.includes("Document not found") && !editorBHtml.includes("DocsAPI"), `status ${editorB.status}`);

  // ---- 7. Editing for every format: styled DOCX/XLSX/PPTX ----
  // Each styled file has a bold red line, an italic blue line and
  // a plain black line. The export must keep the text, the bold
  // and italic fonts, and the colours; the editor must open each
  // format with the right document type and save a new version.
  const styledDocxId = await uploadAsA("/tmp/e2e/styled.docx", "Styled Doc", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  const styledXlsxId = await uploadAsA("/tmp/e2e/styled.xlsx", "Styled Sheet", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  const styledPptxId = await uploadAsA("/tmp/e2e/styled.pptx", "Styled Slides", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
  async function styledExport(docId, label, lines) {
    const res = await appFetch(`/api/documents/${docId}/export?format=pdf`, { session: sessionA });
    if (res.status !== 200) {
      fail(`styled ${label}: export returns 200`, `status ${res.status}`);
      return;
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    const text = pdftotext(bytes);
    check(`styled ${label}: export keeps all three lines`, lines.every((l) => text.includes(l)), text.trim().split("\n").slice(0, 3).join(" | "));
    const fonts = pdfFonts(bytes);
    check(`styled ${label}: export keeps the bold font`, fonts.includes("LiberationSans-Bold") || fonts.includes("Liberation Sans-Bold"), fonts.split("\n").slice(2).join(" / "));
    check(`styled ${label}: export keeps the italic font`, fonts.includes("LiberationSerif-Italic") || fonts.includes("Liberation Serif-Italic"), fonts.split("\n").slice(2).join(" / "));
  }
  await styledExport(styledDocxId, "DOCX", ["Bold red heading", "Italic blue note", "Plain black body"]);
  await styledExport(styledXlsxId, "XLSX", ["Bold red total", "Italic blue note", "Plain 123"]);
  await styledExport(styledPptxId, "PPTX", ["Bold red title", "Italic blue subtitle", "Plain body"]);

  // The editor opens each format with the right document type,
  // and a simulated save (status 2) creates version 2.
  async function editorSave(docId, filetype, editedUrl, innerPath, label) {
    const page = await appFetch(`/editor/${docId}`, { session: sessionA });
    const html = await page.text();
    const typeMatch = html.match(/documentType\\?":\\?"([a-z]+)/);
    const want = filetype === "xlsx" ? "cell" : filetype === "pptx" ? "slide" : "word";
    check(`editor ${label}: page opens as documentType ${want}`, page.status === 200 && typeMatch?.[1] === want, `status ${page.status}, type ${typeMatch?.[1]}`);
    const key = html.match(/key\\?":\\?"([0-9a-f]{20})/)?.[1];
    if (!key) {
      fail(`editor ${label}: save callback accepted`, "no document key in page");
      return;
    }
    const token = await new jose.SignJWT({ key, status: 2, url: editedUrl, filetype, changesurl: null, history: null })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" }).setIssuedAt().setExpirationTime("5m")
      .sign(new TextEncoder().encode(OO_SECRET));
    const cb = await appFetch("/api/editor/callback", { method: "POST", body: JSON.stringify({ token }), contentType: "application/json" });
    const cbJson = await cb.json().catch(() => ({}));
    check(`editor ${label}: save callback (status 2) is accepted`, cb.status === 200 && cbJson.error === 0, `status ${cb.status}, body ${JSON.stringify(cbJson)}`);
    const { data: docRow } = await admin.from("documents").select("version").eq("id", docId).single();
    check(`editor ${label}: save created version 2`, docRow?.version === 2, `version ${docRow?.version}`);
    const { data: v2 } = await admin.from("document_versions").select("file_path").eq("document_id", docId).eq("version_number", 2).single();
    if (v2?.file_path) {
      const { data: blob } = await admin.storage.from("documents").download(v2.file_path);
      const tmp = `/tmp/e2e/v2-${filetype}.${filetype}`;
      writeFileSync(tmp, Buffer.from(await blob.arrayBuffer()));
      const inner = zipRead(tmp, innerPath);
      check(`editor ${label}: version 2 contains the edited text`, inner.includes("Edited by the live test"));
    } else fail(`editor ${label}: version 2 contains the edited text`, "no v2 file_path");
  }
  await editorSave(styledXlsxId, "xlsx", "http://localhost:8899/styled-edited.xlsx", "xl/worksheets/sheet1.xml", "XLSX");
  await editorSave(styledPptxId, "pptx", "http://localhost:8899/styled-edited.pptx", "ppt/slides/slide1.xml", "PPTX");
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
