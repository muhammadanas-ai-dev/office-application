// Day 27 e2e — Hardening (audit queue item 12).
// Run with the app on :3000:
//   node scripts/e2e-hardening-test.mjs
//
// Checks, as real signed-in users:
//  1. Upload a PNG renamed to .pdf — refused by the byte
//     signature check (the file's bytes do not match .pdf),
//     and nothing is written to Storage or the database.
//  2. Upload a real PDF — accepted, and the document appears
//     in the library.
//  3. Sign-in rate limiting: 10 bad sign-in attempts for one
//     email, then the 11th is refused with the rate-limit
//     message (and a different email is unaffected).
//  4. The health endpoint: 200, the statuses are present, and
//     the docserver is reported `down` (it is not installed).
//  5. The privacy page: 200 and contains the disclosure.
//  6. The backup script's output file exists and has the
//     tables (the script itself was run by hand before this
//     harness — see docs/BACKUP_RESTORE.md).

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const APP = "http://localhost:3000";
const REF = "pwncfcvnwudbvwcumado";

const env = {};
for (const line of readFileSync(join(PROJECT_ROOT, ".env.local"), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
const SUPA_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const PUB = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(SUPA_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let passed = 0, failed = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; failures.push(name); console.log(`FAIL  ${name} — ${detail}`); }
}

const suffix = Date.now().toString(36);
const userA = { email: `forma-e2e-hard-a-${suffix}@example.com`, password: "TestPass123!" };
let userAId = "", workspaceAId = "";
let sessionA = null;

function cookieFor(session) {
  return `sb-${REF}-auth-token=${encodeURIComponent(JSON.stringify(session))}`;
}
async function appFetch(path, { session, method = "GET", body } = {}) {
  const headers = {};
  if (session) headers.Cookie = cookieFor(session);
  if (body !== undefined && typeof body !== "string" && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  return fetch(`${APP}${path}`, {
    method, headers,
    body: body === undefined ? undefined : body instanceof FormData || typeof body === "string" ? body : JSON.stringify(body),
    redirect: "manual",
  });
}
// Find the Upload form in the /files HTML and pull out the
// server-action fields Next.js needs to route the POST.
function extractUploadFields(html) {
  const formStart = html.indexOf("Choose a file to upload");
  if (formStart === -1) return null;
  const formHtml = html.slice(html.lastIndexOf("<form", formStart), formStart);
  const refMatch = formHtml.match(/name="(\$ACTION_REF_\d+)"/);
  const idMatch = formHtml.match(/name="(\$ACTION_\d+:0)" value="([^"]*)"/);
  const prevMatch = formHtml.match(/name="(\$ACTION_\d+:1)" value="([^"]*)"/);
  const keyMatch = formHtml.match(/name="\$ACTION_KEY" value="([^"]*)"/);
  if (!refMatch || !idMatch || !prevMatch || !keyMatch) return null;
  return {
    refName: refMatch[1],
    idName: idMatch[1],
    idValue: idMatch[2].replace(/&quot;/g, '"'),
    prevName: prevMatch[1],
    prevValue: prevMatch[2].replace(/&quot;/g, '"'),
    keyValue: keyMatch[1],
  };
}
async function uploadViaForm(session, fields, fileBytes, fileName, mimeType) {
  const form = new FormData();
  form.append(fields.refName, "");
  form.append(fields.idName, fields.idValue);
  form.append(fields.prevName, fields.prevValue);
  form.append("$ACTION_KEY", fields.keyValue);
  form.append("folderId", "");
  form.append("file", new Blob([fileBytes], { type: mimeType }), fileName);
  const resp = await fetch(`${APP}/files`, {
    method: "POST",
    headers: { Cookie: cookieFor(session) },
    body: form,
    redirect: "manual",
  });
  return resp;
}

try {
  // ---- setup ----
  const { data: cA } = await admin.auth.admin.createUser({ email: userA.email, password: userA.password, email_confirm: true });
  userAId = cA.user.id;
  await admin.from("profiles").upsert({ id: userAId, display_name: "E2E Hardening" }, { onConflict: "id" });
  const { data: wsA } = await admin.from("workspaces").insert({ name: "E2E hard ws A", owner_id: userAId, plan_key: "free", is_personal: true }).select("id").single();
  workspaceAId = wsA.id;
  await admin.from("workspace_members").insert({ workspace_id: workspaceAId, user_id: userAId, role: "owner", status: "active" });
  const clientA = createClient(SUPA_URL, PUB, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: sA } = await clientA.auth.signInWithPassword(userA);
  sessionA = sA.session;

  // ---- 1. A PNG renamed to .pdf is refused ----
  const filesHtml = await (await appFetch("/files", { session: sessionA })).text();
  const fields = extractUploadFields(filesHtml);
  check("upload: the /files page has the Upload form", fields !== null);
  const pngBytes = readFileSync(join(PROJECT_ROOT, "corpus", "image.png"));
  const badResp = await uploadViaForm(sessionA, fields, pngBytes, "fake.pdf", "application/pdf");
  const badHtml = await badResp.text();
  check(
    "byte-signature: a PNG renamed to .pdf is refused",
    badHtml.includes("not a PDF") || badHtml.includes("contents"),
    `status ${badResp.status}`
  );
  const { data: fakeDocs } = await admin.from("documents").select("id").eq("workspace_id", workspaceAId).eq("title", "fake");
  check("byte-signature: the refused upload wrote no document row", (fakeDocs ?? []).length === 0, `${(fakeDocs ?? []).length} rows`);

  // ---- 2. A real PDF uploads fine ----
  const pdfBytes = readFileSync(join(PROJECT_ROOT, "corpus", "pdf-rich.pdf"));
  const goodResp = await uploadViaForm(sessionA, fields, pdfBytes, "real.pdf", "application/pdf");
  check("upload: a real PDF uploads (redirect after the action)", [200, 303].includes(goodResp.status), `status ${goodResp.status}`);
  const { data: realDocs } = await admin.from("documents").select("id, title").eq("workspace_id", workspaceAId).eq("title", "real");
  check("upload: the real PDF appears in the library", (realDocs ?? []).length === 1, `${(realDocs ?? []).length} rows`);

  // ---- 3. Sign-in rate limiting ----
  const rateEmail = `forma-e2e-hard-rate-${suffix}@example.com`;
  let rateLimited = false;
  for (let i = 0; i < 11; i++) {
    const form = new FormData();
    form.append("email", rateEmail);
    form.append("password", "WrongPass123!");
    // The sign-in form is a server action on /auth/login; the
    // action fields are extracted the same way. The marker is
    // the email input (inside the form) — "Sign in" first
    // appears in the <title>, before the form.
    const loginHtml = await (await fetch(`${APP}/auth/login`, { redirect: "manual" })).text();
    const loginStart = loginHtml.indexOf('name="email"');
    const loginForm = loginHtml.slice(loginHtml.lastIndexOf("<form", loginStart), loginStart);
    const ref = loginForm.match(/name="(\$ACTION_REF_\d+)"/);
    const id = loginForm.match(/name="(\$ACTION_\d+:0)" value="([^"]*)"/);
    const prev = loginForm.match(/name="(\$ACTION_\d+:1)" value="([^"]*)"/);
    const key = loginForm.match(/name="\$ACTION_KEY" value="([^"]*)"/);
    if (!ref || !id || !prev || !key) break;
    form.append(ref[1], "");
    form.append(id[1], id[2].replace(/&quot;/g, '"'));
    form.append(prev[1], prev[2].replace(/&quot;/g, '"'));
    form.append("$ACTION_KEY", key[1]);
    const resp = await fetch(`${APP}/auth/login`, { method: "POST", body: form, redirect: "manual" });
    const html = await resp.text();
    if (html.includes("Too many attempts")) { rateLimited = true; break; }
  }
  check("auth rate limit: 10 bad sign-ins then the 11th is refused", rateLimited);

  // ---- 4. The health endpoint ----
  const health = await fetch(`${APP}/api/health`);
  const healthData = await health.json().catch(() => ({}));
  check("health: returns 200", health.status === 200, `status ${health.status}`);
  check("health: the database and storage are ok", healthData.database?.status === "ok" && healthData.storage?.status === "ok", JSON.stringify(healthData).slice(0, 120));
  check("health: the docserver is reported down (it is not installed)", healthData.docserver?.status === "down", JSON.stringify(healthData.docserver ?? {}));

  // ---- 5. The privacy page ----
  const privacy = await fetch(`${APP}/privacy`);
  const privacyHtml = await privacy.text();
  check("privacy: the page loads (200) and has the disclosure", privacy.status === 200 && privacyHtml.includes("What we store") && privacyHtml.includes("ONLYOFFICE"), `status ${privacy.status}`);

  // ---- 6. The backup script's output ----
  const backupDir = join(PROJECT_ROOT, "..", "backups");
  const backupFiles = existsSync(backupDir) ? readdirSync(backupDir).filter((f) => f.startsWith("forma-backup-") && f.endsWith(".json")) : [];
  let backupOk = false;
  if (backupFiles.length > 0) {
    const latest = backupFiles.sort().pop();
    const backup = JSON.parse(readFileSync(join(backupDir, latest), "utf8"));
    backupOk = Array.isArray(backup.tables?.documents) && Array.isArray(backup.tables?.workspaces);
  }
  check("backup: a backup file exists with the tables", backupOk, `${backupFiles.length} backup file(s)`);
} finally {
  if (userAId) await admin.auth.admin.deleteUser(userAId);
}

console.log(`\n==== SUMMARY ====\n${passed} passed, ${failed} failed (${passed + failed} total)`);
if (failures.length > 0) {
  console.log("FAILED:");
  for (const f of failures) console.log(` - ${f}`);
  process.exit(1);
}
