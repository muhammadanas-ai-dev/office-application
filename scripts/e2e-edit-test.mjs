// Live end-to-end harness for PDF editing (dev only). Run with the app on :3000:
//   node scripts/e2e-edit-test.mjs
// Creates real test users and deletes them afterwards.
// End-to-end test of the Forma PDF editing routes (Phase B,
// feature 3) against the RUNNING app, as a real signed-in user.
// Temporary harness — not part of the repo.
// Requires the app on http://localhost:3000.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";

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
  email: `forma-e2e-edit-a-${suffix}@example.com`,
  password: "TestPass123!",
};
const userB = {
  email: `forma-e2e-edit-b-${suffix}@example.com`,
  password: "TestPass123!",
};
let userAId = "",
  userBId = "",
  workspaceAId = "";
let pdf1Id = "",
  ooId = "",
  imgId = "",
  styledId = "",
  formId = "";
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
function visibleText(bytes) {
  const p = `/tmp/e2e/edit-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`;
  writeFileSync(p, bytes);
  try {
    return execSync(`pdftotext ${p} -`, { encoding: "utf8" });
  } finally {
    execSync(`rm -f ${p}`);
  }
}
/** Expand a PDF with qpdf so its content streams are readable text. */
function qdfText(bytes) {
  const inP = `/tmp/e2e/edit-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}-in.pdf`;
  const outP = `/tmp/e2e/edit-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}-out.pdf`;
  writeFileSync(inP, bytes);
  try {
    execSync(`qpdf --qdf --object-streams=disable ${inP} ${outP}`, {
      stdio: "pipe",
    });
    return readFileSync(outP, "latin1");
  } finally {
    execSync(`rm -f ${inP} ${outP}`);
  }
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
    .upsert({ id: userAId, display_name: "E2E Edit" }, { onConflict: "id" });
  const { data: ws } = await admin
    .from("workspaces")
    .insert({
      name: "E2E edit ws",
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
  pdf1Id = await uploadAsA("/tmp/e2e/pdf1.pdf", "PDF One", "application/pdf");
  ooId = await uploadAsA(
    "/tmp/e2e/debug-export.pdf",
    "OO Report",
    "application/pdf"
  );
  imgId = await uploadAsA(
    "/tmp/chrome-proof/img.pdf",
    "Image PDF",
    "application/pdf"
  );
  styledId = await uploadAsA(
    "/tmp/e2e/styled.pdf",
    "Styled PDF",
    "application/pdf"
  );
  formId = await uploadAsA("/tmp/e2e/form.pdf", "Form PDF", "application/pdf");
  check("setup: users + 5 PDFs ready", true);

  // ---- 1. edit text (exact match, pdf-lib PDF) ----
  let r = await appFetch(`/api/documents/${pdf1Id}/pdf/edit-text`, {
    session: sessionA,
    method: "POST",
    body: {
      page: 1,
      text: "PDF One page 1",
      replacement: "Edited by the live test",
    },
  });
  let j = await r.json().catch(() => ({}));
  check(
    "edit-text: exact match returns 200 + version 2",
    r.status === 200 && j.version === 2,
    `status ${r.status}, version ${j.version}`
  );
  let v2 = await downloadVersion(pdf1Id, 2);
  let text = v2 ? visibleText(v2) : "";
  check(
    "edit-text: version 2 shows the new text, old text gone",
    text.includes("Edited by the live test") &&
      !text.includes("PDF One page 1"),
    text.trim().split("\n")[0]
  );
  let v1 = await downloadVersion(pdf1Id, 1);
  check(
    "edit-text: version 1 (the original) is untouched",
    v1 ? visibleText(v1).includes("PDF One page 1") : false
  );
  // A second edit on the same document goes to version 3.
  r = await appFetch(`/api/documents/${pdf1Id}/pdf/edit-text`, {
    session: sessionA,
    method: "POST",
    body: { page: 2, text: "PDF One page 2", replacement: "Second edit" },
  });
  j = await r.json().catch(() => ({}));
  check(
    "edit-text: a second edit becomes version 3",
    r.status === 200 && j.version === 3,
    `status ${r.status}, version ${j.version}`
  );

  // ---- 2. edit text (position match, ONLYOFFICE PDF) ----
  // The debug-export fixture is a hand-built CID PDF (the VM reset
  // wiped the ONLYOFFICE export); its run sits at (50, 750), size 10.
  r = await appFetch(`/api/documents/${ooId}/pdf/edit-text`, {
    session: sessionA,
    method: "POST",
    body: {
      page: 1,
      text: "Forma E2E export test - the quick brown fox.",
      replacement: "Replaced live by the editor.",
      position: { x: 50, y: 750, fontSize: 10 },
    },
  });
  j = await r.json().catch(() => ({}));
  check(
    "edit-text (CID): position match returns 200 + version 2",
    r.status === 200 && j.version === 2,
    `status ${r.status}, version ${j.version} ${JSON.stringify(j)}`
  );
  v2 = await downloadVersion(ooId, 2);
  text = v2 ? visibleText(v2) : "";
  check(
    "edit-text (CID): version 2 shows the replacement",
    text.includes("Replaced live by the editor."),
    text.trim().split("\n")[0]
  );
  check(
    "edit-text (CID): the old line is gone from version 2",
    !text.includes("Forma E2E export test"),
    text.trim().split("\n").slice(0, 2).join(" | ")
  );

  // ---- 2b. edit text keeps the font and colour (styled PDF) ----
  r = await appFetch(`/api/documents/${styledId}/pdf/edit-text`, {
    session: sessionA,
    method: "POST",
    body: {
      page: 1,
      text: "Bold red heading",
      replacement: "New bold heading",
    },
  });
  j = await r.json().catch(() => ({}));
  check(
    "edit-text (styled): bold red edit returns 200 + version 2",
    r.status === 200 && j.version === 2,
    `status ${r.status}, version ${j.version} ${JSON.stringify(j)}`
  );
  v2 = await downloadVersion(styledId, 2);
  text = v2 ? visibleText(v2) : "";
  check(
    "edit-text (styled): version 2 shows the new heading",
    text.includes("New bold heading") && !text.includes("Bold red heading"),
    text.trim().split("\n")[0]
  );
  const qdf = v2 ? qdfText(v2) : "";
  check(
    "edit-text (styled): replacement is drawn in the bold font",
    qdf.includes("/Helvetica-Bold"),
    "Helvetica-Bold in content"
  );
  check(
    "edit-text (styled): replacement is drawn in red",
    qdf.includes("1 0 0 rg"),
    "1 0 0 rg in content"
  );
  r = await appFetch(`/api/documents/${styledId}/pdf/edit-text`, {
    session: sessionA,
    method: "POST",
    body: { page: 1, text: "Italic blue note", replacement: "New italic note" },
  });
  j = await r.json().catch(() => ({}));
  check(
    "edit-text (styled): italic blue edit returns 200 + version 3",
    r.status === 200 && j.version === 3,
    `status ${r.status}, version ${j.version}`
  );
  const v3 = await downloadVersion(styledId, 3);
  const qdf3 = v3 ? qdfText(v3) : "";
  check(
    "edit-text (styled): replacement is drawn in the italic font",
    qdf3.includes("/Times-Italic"),
    "Times-Italic in content"
  );
  check(
    "edit-text (styled): replacement is drawn in blue",
    qdf3.includes("0 0 1 rg"),
    "0 0 1 rg in content"
  );
  check(
    "edit-text (styled): the plain black line is untouched",
    v3 ? visibleText(v3).includes("Plain black body") : false
  );

  // ---- 3. replace image ----
  // Build a 1x1 red PNG.
  const { deflateSync } = await import("node:zlib");
  const crcTable = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })();
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td), 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.from([0, 255, 0, 0]))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  const form = new FormData();
  form.set("page", "1");
  form.set("imageIndex", "0");
  form.set("file", new Blob([png], { type: "image/png" }), "red.png");
  r = await fetch(`${APP}/api/documents/${imgId}/pdf/edit-image`, {
    method: "POST",
    headers: { Cookie: cookieFor(sessionA) },
    body: form,
    redirect: "manual",
  });
  j = await r.json().catch(() => ({}));
  check(
    "edit-image: replacement returns 200 + version 2",
    r.status === 200 && j.version === 2,
    `status ${r.status}, version ${j.version} ${JSON.stringify(j)}`
  );
  v2 = await downloadVersion(imgId, 2);
  const imgDoc = v2 ? await PDFDocument.load(v2) : null;
  check(
    "edit-image: version 2 is still a valid 1-page PDF",
    imgDoc ? imgDoc.getPageCount() === 1 : false
  );

  // ---- 4. delete + reorder pages ----
  r = await appFetch(`/api/documents/${pdf1Id}/pdf/edit-pages`, {
    session: sessionA,
    method: "POST",
    body: { action: "delete", pages: [3] },
  });
  j = await r.json().catch(() => ({}));
  check(
    "edit-pages: delete page 3 returns 200 + version 4",
    r.status === 200 && j.version === 4,
    `status ${r.status}, version ${j.version}`
  );
  v2 = await downloadVersion(pdf1Id, 4);
  const delDoc = v2 ? await PDFDocument.load(v2) : null;
  check(
    "edit-pages: version 4 has 2 pages",
    delDoc ? delDoc.getPageCount() === 2 : false
  );
  r = await appFetch(`/api/documents/${pdf1Id}/pdf/edit-pages`, {
    session: sessionA,
    method: "POST",
    body: { action: "reorder", order: [2, 1] },
  });
  j = await r.json().catch(() => ({}));
  check(
    "edit-pages: reorder returns 200 + version 5",
    r.status === 200 && j.version === 5,
    `status ${r.status}, version ${j.version}`
  );
  v2 = await downloadVersion(pdf1Id, 5);
  text = v2 ? visibleText(v2) : "";
  check(
    "edit-pages: version 5 has the pages swapped",
    text.indexOf("PDF One page 3") < text.indexOf("Edited by the live test") ||
      (text.includes("PDF One page 3") &&
        text.includes("Edited by the live test")),
    text.trim().split("\n").join(" | ")
  );

  // ---- 5. validation + cross-user + signed-out ----
  r = await appFetch(`/api/documents/${pdf1Id}/pdf/edit-text`, {
    session: sessionA,
    method: "POST",
    body: { page: 1, text: "No such line anywhere", replacement: "x" },
  });
  check(
    "edit-text: missing text is refused with 400",
    r.status === 400,
    `status ${r.status}`
  );
  r = await appFetch(`/api/documents/${pdf1Id}/pdf/edit-pages`, {
    session: sessionA,
    method: "POST",
    body: { action: "delete", pages: [1, 2] },
  });
  check(
    "edit-pages: deleting every page is refused with 400",
    r.status === 400,
    `status ${r.status}`
  );
  r = await appFetch(`/api/documents/${pdf1Id}/pdf/edit-text`, {
    session: sessionB,
    method: "POST",
    body: { page: 1, text: "Edited by the live test", replacement: "hacked" },
  });
  check(
    "edit-text: user B cannot edit A's document (404)",
    r.status === 404,
    `status ${r.status}`
  );
  r = await appFetch(`/api/documents/${pdf1Id}/pdf/edit-pages`, {
    session: sessionB,
    method: "POST",
    body: { action: "delete", pages: [1] },
  });
  check(
    "edit-pages: user B cannot change A's pages (404)",
    r.status === 404,
    `status ${r.status}`
  );
  r = await appFetch(`/api/documents/${pdf1Id}/pdf/edit-text`, {
    method: "POST",
    body: { page: 1, text: "x", replacement: "y" },
  });
  check(
    "edit-text: signed-out edit redirects to login (307)",
    r.status === 307,
    `status ${r.status}`
  );
  const editPage = await appFetch(`/documents/${pdf1Id}/pdf-edit`, {
    session: sessionA,
  });
  check(
    "edit page: loads for A (200)",
    editPage.status === 200,
    `status ${editPage.status}`
  );
  const editPageB = await appFetch(`/documents/${pdf1Id}/pdf-edit`, {
    session: sessionB,
  });
  const editPageBHtml = await editPageB.text();
  check(
    "edit page: user B sees 'Document not found', not the editor",
    editPageB.status === 200 && editPageBHtml.includes("Document not found"),
    `status ${editPageB.status}`
  );

  // ---- 6. PDF form fill (Phase B, feature 4) ----
  r = await appFetch(`/api/documents/${formId}/pdf/form-fields`, {
    session: sessionA,
  });
  j = await r.json().catch(() => ({}));
  const formFields = Array.isArray(j.fields) ? j.fields : [];
  const byName = new Map(formFields.map((f) => [f.name, f]));
  check(
    "form-fields: lists the form's fields (200, hasForm)",
    r.status === 200 && j.hasForm === true && formFields.length === 5,
    `status ${r.status}, fields ${formFields.length}`
  );
  check(
    "form-fields: text field carries its value and page",
    byName.get("Full Name")?.type === "text" &&
      byName.get("Full Name")?.value === "Anas" &&
      byName.get("Full Name")?.page === 1,
    JSON.stringify(byName.get("Full Name"))
  );
  check(
    "form-fields: dropdown carries its options and selection",
    byName.get("Country")?.type === "dropdown" &&
      JSON.stringify(byName.get("Country")?.options) ===
        JSON.stringify(["Pakistan", "India", "Bangladesh"]) &&
      JSON.stringify(byName.get("Country")?.value) ===
        JSON.stringify(["Pakistan"]),
    JSON.stringify(byName.get("Country"))
  );
  check(
    "form-fields: radio and checkbox are listed",
    byName.get("Gender")?.type === "radio" &&
      byName.get("Subscribe")?.type === "checkbox",
    `gender ${byName.get("Gender")?.type}, subscribe ${byName.get("Subscribe")?.type}`
  );
  check(
    "form-fields: max length is reported",
    byName.get("Short Code")?.maxLength === 5,
    `maxLength ${byName.get("Short Code")?.maxLength}`
  );

  r = await appFetch(`/api/documents/${formId}/pdf/fill-form`, {
    session: sessionA,
    method: "POST",
    body: {
      values: {
        "Full Name": "Muhammad Anas",
        "Short Code": "ABCDE",
        Subscribe: true,
        Country: "India",
        Gender: "Female",
      },
    },
  });
  j = await r.json().catch(() => ({}));
  check(
    "fill-form: filling returns 200 + version 2",
    r.status === 200 && j.version === 2,
    `status ${r.status}, version ${j.version} ${JSON.stringify(j)}`
  );
  v2 = await downloadVersion(formId, 2);
  text = v2 ? visibleText(v2) : "";
  check(
    "fill-form: version 2 shows the filled name and country",
    text.includes("Muhammad Anas") && text.includes("India"),
    text.trim().split("\n")[0]
  );
  r = await appFetch(`/api/documents/${formId}/pdf/form-fields`, {
    session: sessionA,
  });
  j = await r.json().catch(() => ({}));
  const after = new Map(
    (Array.isArray(j.fields) ? j.fields : []).map((f) => [f.name, f])
  );
  check(
    "fill-form: re-listing shows the new values (reopen)",
    after.get("Full Name")?.value === "Muhammad Anas" &&
      after.get("Country")?.value?.[0] === "India" &&
      after.get("Subscribe")?.value === true &&
      after.get("Gender")?.value === "Female",
    JSON.stringify([...after.entries()].map(([k, v]) => [k, v.value]))
  );
  v1 = await downloadVersion(formId, 1);
  check(
    "fill-form: version 1 (the original) is untouched",
    v1
      ? visibleText(v1).includes("Anas") &&
          !visibleText(v1).includes("Muhammad Anas")
      : false
  );

  // Validation: one bad value refuses the whole fill.
  r = await appFetch(`/api/documents/${formId}/pdf/fill-form`, {
    session: sessionA,
    method: "POST",
    body: { values: { "Full Name": "Changed", "Short Code": "TOOLONG" } },
  });
  check(
    "fill-form: a value over the max length is refused (400)",
    r.status === 400,
    `status ${r.status}`
  );
  r = await appFetch(`/api/documents/${formId}/pdf/fill-form`, {
    session: sessionA,
    method: "POST",
    body: { values: { Country: "Mars" } },
  });
  check(
    "fill-form: an option not in the list is refused (400)",
    r.status === 400,
    `status ${r.status}`
  );
  r = await appFetch(`/api/documents/${formId}/pdf/fill-form`, {
    session: sessionA,
    method: "POST",
    body: { values: { "No Such Field": "x" } },
  });
  check(
    "fill-form: an unknown field is refused (400)",
    r.status === 400,
    `status ${r.status}`
  );
  // A PDF with no form fields reports that honestly.
  r = await appFetch(`/api/documents/${pdf1Id}/pdf/form-fields`, {
    session: sessionA,
  });
  j = await r.json().catch(() => ({}));
  check(
    "form-fields: a plain PDF reports hasForm false, no fields",
    r.status === 200 &&
      j.hasForm === false &&
      Array.isArray(j.fields) &&
      j.fields.length === 0,
    `status ${r.status}, hasForm ${j.hasForm}`
  );
  r = await appFetch(`/api/documents/${pdf1Id}/pdf/fill-form`, {
    session: sessionA,
    method: "POST",
    body: { values: { "Full Name": "x" } },
  });
  check(
    "fill-form: a PDF with no fields is refused (400)",
    r.status === 400,
    `status ${r.status}`
  );
  // Cross-user + signed-out.
  r = await appFetch(`/api/documents/${formId}/pdf/form-fields`, {
    session: sessionB,
  });
  check(
    "form-fields: user B cannot list A's fields (404)",
    r.status === 404,
    `status ${r.status}`
  );
  r = await appFetch(`/api/documents/${formId}/pdf/fill-form`, {
    session: sessionB,
    method: "POST",
    body: { values: { "Full Name": "hacked" } },
  });
  check(
    "fill-form: user B cannot fill A's form (404)",
    r.status === 404,
    `status ${r.status}`
  );
  r = await appFetch(`/api/documents/${formId}/pdf/form-fields`);
  check(
    "form-fields: signed-out list redirects to login (307)",
    r.status === 307,
    `status ${r.status}`
  );
  r = await appFetch(`/api/documents/${formId}/pdf/fill-form`, {
    method: "POST",
    body: { values: { "Full Name": "x" } },
  });
  check(
    "fill-form: signed-out fill redirects to login (307)",
    r.status === 307,
    `status ${r.status}`
  );
  const formPage = await appFetch(`/documents/${formId}/pdf-form`, {
    session: sessionA,
  });
  check(
    "form page: loads for A (200)",
    formPage.status === 200,
    `status ${formPage.status}`
  );
  const formPageB = await appFetch(`/documents/${formId}/pdf-form`, {
    session: sessionB,
  });
  const formPageBHtml = await formPageB.text();
  check(
    "form page: user B sees 'Document not found', not the form",
    formPageB.status === 200 && formPageBHtml.includes("Document not found"),
    `status ${formPageB.status}`
  );
  const plainFormPage = await appFetch(`/documents/${pdf1Id}/pdf-form`, {
    session: sessionA,
  });
  const plainFormPageHtml = await plainFormPage.text();
  check(
    "form page: a plain PDF says it has no form fields",
    plainFormPage.status === 200 &&
      plainFormPageHtml.includes("no form fields"),
    `status ${plainFormPage.status}`
  );

  // ---- 7. PDF form builder (Phase B, feature 5) ----
  // pdf1Id is a plain PDF (no form yet) at version 5 — the blank
  // canvas the builder is for.
  r = await appFetch(`/api/documents/${pdf1Id}/pdf/add-field`, {
    session: sessionA,
    method: "POST",
    body: {
      name: "Builder Name",
      type: "text",
      page: 1,
      x: 50,
      y: 650,
      width: 200,
      height: 24,
      required: true,
    },
  });
  j = await r.json().catch(() => ({}));
  check(
    "add-field: adding a text field returns 200 + version 6",
    r.status === 200 && j.version === 6,
    `status ${r.status}, version ${j.version} ${JSON.stringify(j)}`
  );
  r = await appFetch(`/api/documents/${pdf1Id}/pdf/form-fields`, {
    session: sessionA,
  });
  j = await r.json().catch(() => ({}));
  const built = new Map(
    (Array.isArray(j.fields) ? j.fields : []).map((f) => [f.name, f])
  );
  check(
    "add-field: the new field is listed (text, page 1, required)",
    built.get("Builder Name")?.type === "text" &&
      built.get("Builder Name")?.page === 1 &&
      built.get("Builder Name")?.required === true,
    JSON.stringify(built.get("Builder Name"))
  );
  r = await appFetch(`/api/documents/${pdf1Id}/pdf/add-field`, {
    session: sessionA,
    method: "POST",
    body: {
      name: "Builder Country",
      type: "dropdown",
      page: 2,
      x: 50,
      y: 650,
      width: 200,
      height: 24,
      options: ["Pakistan", "India"],
      defaultValue: "Pakistan",
    },
  });
  j = await r.json().catch(() => ({}));
  check(
    "add-field: adding a dropdown returns 200 + version 7",
    r.status === 200 && j.version === 7,
    `status ${r.status}, version ${j.version}`
  );
  r = await appFetch(`/api/documents/${pdf1Id}/pdf/add-field`, {
    session: sessionA,
    method: "POST",
    body: {
      name: "Builder Gender",
      type: "radio",
      page: 1,
      x: 50,
      y: 600,
      width: 16,
      height: 16,
      options: ["Male", "Female"],
    },
  });
  j = await r.json().catch(() => ({}));
  check(
    "add-field: adding a radio group returns 200 + version 8",
    r.status === 200 && j.version === 8,
    `status ${r.status}, version ${j.version}`
  );
  r = await appFetch(`/api/documents/${pdf1Id}/pdf/form-fields`, {
    session: sessionA,
  });
  j = await r.json().catch(() => ({}));
  const builtAll = Array.isArray(j.fields) ? j.fields : [];
  check(
    "add-field: all three built fields are listed",
    builtAll.length === 3,
    `fields ${builtAll.length}`
  );
  // The built fields are fillable by the Day 11 fill feature.
  r = await appFetch(`/api/documents/${pdf1Id}/pdf/fill-form`, {
    session: sessionA,
    method: "POST",
    body: {
      values: {
        "Builder Name": "Built and filled",
        "Builder Country": "India",
        "Builder Gender": "Female",
      },
    },
  });
  j = await r.json().catch(() => ({}));
  check(
    "add-field: filling the built fields returns 200 + version 9",
    r.status === 200 && j.version === 9,
    `status ${r.status}, version ${j.version}`
  );
  v2 = await downloadVersion(pdf1Id, 9);
  text = v2 ? visibleText(v2) : "";
  check(
    "add-field: the filled built value shows in the PDF",
    text.includes("Built and filled") && text.includes("India"),
    text.trim().split("\n")[0]
  );
  // Validation: duplicate name, out-of-bounds, missing page.
  r = await appFetch(`/api/documents/${pdf1Id}/pdf/add-field`, {
    session: sessionA,
    method: "POST",
    body: {
      name: "Builder Name",
      type: "text",
      page: 1,
      x: 50,
      y: 500,
      width: 200,
      height: 24,
    },
  });
  check(
    "add-field: a duplicate name is refused (400)",
    r.status === 400,
    `status ${r.status}`
  );
  r = await appFetch(`/api/documents/${pdf1Id}/pdf/add-field`, {
    session: sessionA,
    method: "POST",
    body: {
      name: "Off Page",
      type: "text",
      page: 1,
      x: 500,
      y: 700,
      width: 200,
      height: 24,
    },
  });
  check(
    "add-field: a placement outside the page is refused (400)",
    r.status === 400,
    `status ${r.status}`
  );
  r = await appFetch(`/api/documents/${pdf1Id}/pdf/add-field`, {
    session: sessionA,
    method: "POST",
    body: {
      name: "No Page",
      type: "text",
      page: 9,
      x: 50,
      y: 700,
      width: 200,
      height: 24,
    },
  });
  check(
    "add-field: a page that does not exist is refused (400)",
    r.status === 400,
    `status ${r.status}`
  );
  // Remove the dropdown; the field list no longer has it.
  r = await appFetch(`/api/documents/${pdf1Id}/pdf/remove-field`, {
    session: sessionA,
    method: "POST",
    body: { name: "Builder Country" },
  });
  j = await r.json().catch(() => ({}));
  check(
    "remove-field: removing returns 200 + version 10",
    r.status === 200 && j.version === 10,
    `status ${r.status}, version ${j.version}`
  );
  r = await appFetch(`/api/documents/${pdf1Id}/pdf/form-fields`, {
    session: sessionA,
  });
  j = await r.json().catch(() => ({}));
  const afterRemove = new Map(
    (Array.isArray(j.fields) ? j.fields : []).map((f) => [f.name, f])
  );
  check(
    "remove-field: the field is gone from the list, the others stay",
    !afterRemove.has("Builder Country") &&
      afterRemove.has("Builder Name") &&
      afterRemove.has("Builder Gender"),
    `fields ${[...afterRemove.keys()].join(", ")}`
  );
  const v10 = await downloadVersion(pdf1Id, 10);
  const removedDoc = v10 ? await PDFDocument.load(v10) : null;
  check(
    "remove-field: version 10 is still a valid 2-page PDF",
    removedDoc ? removedDoc.getPageCount() === 2 : false
  );
  r = await appFetch(`/api/documents/${pdf1Id}/pdf/remove-field`, {
    session: sessionA,
    method: "POST",
    body: { name: "No Such Field" },
  });
  check(
    "remove-field: removing a field that does not exist is refused (400)",
    r.status === 400,
    `status ${r.status}`
  );
  // Cross-user + signed-out.
  r = await appFetch(`/api/documents/${pdf1Id}/pdf/add-field`, {
    session: sessionB,
    method: "POST",
    body: {
      name: "Hacked",
      type: "text",
      page: 1,
      x: 50,
      y: 500,
      width: 200,
      height: 24,
    },
  });
  check(
    "add-field: user B cannot add to A's document (404)",
    r.status === 404,
    `status ${r.status}`
  );
  r = await appFetch(`/api/documents/${pdf1Id}/pdf/remove-field`, {
    session: sessionB,
    method: "POST",
    body: { name: "Builder Name" },
  });
  check(
    "remove-field: user B cannot remove from A's document (404)",
    r.status === 404,
    `status ${r.status}`
  );
  r = await appFetch(`/api/documents/${pdf1Id}/pdf/add-field`, {
    method: "POST",
    body: {
      name: "Hacked",
      type: "text",
      page: 1,
      x: 50,
      y: 500,
      width: 200,
      height: 24,
    },
  });
  check(
    "add-field: signed-out add redirects to login (307)",
    r.status === 307,
    `status ${r.status}`
  );
  r = await appFetch(`/api/documents/${pdf1Id}/pdf/remove-field`, {
    method: "POST",
    body: { name: "Builder Name" },
  });
  check(
    "remove-field: signed-out remove redirects to login (307)",
    r.status === 307,
    `status ${r.status}`
  );
  const builderPage = await appFetch(`/documents/${pdf1Id}/pdf-builder`, {
    session: sessionA,
  });
  const builderPageHtml = await builderPage.text();
  check(
    "builder page: loads for A (200) and shows the builder",
    builderPage.status === 200 && builderPageHtml.includes("Build form"),
    `status ${builderPage.status}`
  );
  const builderPageB = await appFetch(`/documents/${pdf1Id}/pdf-builder`, {
    session: sessionB,
  });
  const builderPageBHtml = await builderPageB.text();
  check(
    "builder page: user B sees 'Document not found', not the builder",
    builderPageB.status === 200 &&
      builderPageBHtml.includes("Document not found"),
    `status ${builderPageB.status}`
  );

  // ---- 8. OCR (Phase C) ----
  // A true scanned PDF (image-only pages, no text layer) + a Urdu
  // image + a plain-text file (not OCR-able). The worker must be
  // running (node ocr/worker.ts) — the job is polled until done.
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
  r = await appFetch(`/api/documents/${scannedId}/ocr`, {
    session: sessionA,
    method: "POST",
    body: { language: "eng" },
  });
  j = await r.json().catch(() => ({}));
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
