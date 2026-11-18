// Live e2e for Single-user sharing (Day 25).
// Run with the app on :3000:
//   node scripts/e2e-sharing-test.mjs
// Focused harness (not the full suite). Temporary? No — this
// harness is kept, like the Day 13–24 harnesses.
//
// As user A: upload a PDF; create a share (7-day expiry) via
// the API (200, a URL is returned); open /s/<token> anonymously
// (200, the title + Download are shown); download via
// /s/<token>/download (the bytes match the upload); revoke the
// share (200); the page + download now refuse it; an expired
// share is refused; a bad token is refused; user B cannot
// create/list/revoke A's shares (404); signed-out gets 307 on
// the manage page and the create route.
//
// REQUIRES the Day 25 migration (the document_shares table) to
// be applied in Supabase first. If it is not applied, the
// harness reports it clearly and only runs the checks that do
// not need it (the Day 21/24 pattern).
//
// The session cookie holds the session as a JSON OBJECT, not
// an array (the Day 24 lesson — auth-js's _isValidSession
// checks for the access_token / refresh_token / expires_at
// properties, which an array does not have).
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

let passed = 0;
let failed = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`PASS  ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
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
const APP = "http://localhost:3000";
const SUPA_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const PUB = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SVC = env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(SUPA_URL, SVC, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const suffix = Date.now().toString(36);
const userA = {
  email: `forma-e2e-share-a-${suffix}@example.com`,
  password: "TestPass123!",
};
const userB = {
  email: `forma-e2e-share-b-${suffix}@example.com`,
  password: "TestPass123!",
};
let userAId = "";
let userBId = "";

async function makeUser(u) {
  const { data } = await admin.auth.admin.createUser({
    email: u.email,
    password: u.password,
    email_confirm: true,
  });
  await admin
    .from("profiles")
    .upsert(
      { id: data.user.id, display_name: "E2E Share" },
      { onConflict: "id" }
    );
  return data.user.id;
}

async function newSession(email, password) {
  const client = createClient(SUPA_URL, PUB, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await client.auth.signInWithPassword({ email, password });
  const cookie = `sb-pwncfcvnwudbvwcumado-auth-token=${encodeURIComponent(JSON.stringify(data.session))}`;
  return { cookie };
}

async function appFetch(
  path,
  { session, method = "GET", body, contentType } = {}
) {
  const headers = {};
  if (session) headers.Cookie = session.cookie;
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

try {
  userAId = await makeUser(userA);
  userBId = await makeUser(userB);
  const sessionA = await newSession(userA.email, userA.password);
  const sessionB = await newSession(userB.email, userB.password);

  // Is the Day 25 migration applied?
  const { error: probeError } = await admin
    .from("document_shares")
    .select("id")
    .limit(1);
  const migrationApplied = !probeError;
  check(
    "the Day 25 migration is applied (the document_shares table exists)",
    migrationApplied,
    probeError?.message ?? ""
  );
  if (!migrationApplied) {
    console.log(
      "MIGRATION NOT APPLIED — run forma-shares-migration.sql in the Supabase Dashboard SQL Editor, then re-run this harness. The checks below that need it are skipped."
    );
  }

  // The manage page loads for A (200) even without the migration
  // (it shows the setup notice), and signed-out gets 307.
  const { data: ws } = await admin
    .from("workspaces")
    .insert({
      name: "E2E share ws A",
      owner_id: userAId,
      plan_key: "free",
      is_personal: true,
    })
    .select("id")
    .single();
  await admin.from("workspace_members").insert({
    workspace_id: ws.id,
    user_id: userAId,
    role: "owner",
    status: "active",
  });
  const pdf = readFileSync("/tmp/e2e/pdf1.pdf");
  const docId = crypto.randomUUID();
  const path = `${ws.id}/${docId}/1/pdf1.pdf`;
  const { error: upErr } = await admin.storage
    .from("documents")
    .upload(path, pdf, { contentType: "application/pdf", upsert: true });
  if (upErr) throw new Error("upload failed: " + upErr.message);
  await admin.from("documents").insert({
    id: docId,
    workspace_id: ws.id,
    title: "Share E2E",
    mime_type: "application/pdf",
    file_path: path,
    size_bytes: pdf.length,
    version: 1,
    created_by: userAId,
  });
  await admin.from("document_versions").insert({
    document_id: docId,
    workspace_id: ws.id,
    version_number: 1,
    file_path: path,
    mime_type: "application/pdf",
    size_bytes: pdf.length,
    created_by: userAId,
  });

  let r = await appFetch(`/documents/${docId}/share`, { session: sessionA });
  let html = await r.text();
  if (!migrationApplied) {
    // Without the migration, the page shows the setup notice
    // instead of the create form (the form needs the table).
    check(
      "without the migration, the page shows the setup notice",
      html.includes("forma-shares-migration.sql"),
      "the notice is missing"
    );
  } else {
    check(
      "the Share manage page loads (200) and shows the create form",
      r.status === 200 && html.includes("Create a share link"),
      `status ${r.status}`
    );
  }

  r = await appFetch(`/documents/${docId}/share`);
  check(
    "signed-out: the manage page redirects to login (307)",
    r.status === 307,
    `status ${r.status}`
  );

  if (migrationApplied) {
    // ---- create a share (7-day expiry) ----
    r = await appFetch(`/api/documents/${docId}/shares`, {
      session: sessionA,
      method: "POST",
      body: { expiry: "7d" },
    });
    const created = await r.json().catch(() => ({}));
    const shareUrl = created.share?.url ?? "";
    const token = shareUrl.split("/s/")[1] ?? "";
    check(
      "creating a share returns a link URL",
      r.status === 200 && shareUrl.startsWith("/s/") && token.length === 32,
      `status ${r.status}, url ${shareUrl}`
    );
    check(
      "the link expires in 7 days",
      typeof created.share?.expiresAt === "string" &&
        new Date(created.share.expiresAt).getTime() >
          Date.now() + 6 * 24 * 60 * 60 * 1000,
      created.share?.expiresAt ?? "no expiry"
    );

    // ---- open the share page anonymously ----
    r = await appFetch(`/s/${token}`);
    html = await r.text();
    check(
      "the share page loads anonymously (200) and shows the document title",
      r.status === 200 && html.includes("Share E2E"),
      `status ${r.status}`
    );
    check(
      "the share page shows a Download button",
      html.includes(`/s/${token}/download`),
      "no download link"
    );

    // ---- download via the share link ----
    r = await appFetch(`/s/${token}/download`);
    check(
      "the share download redirects to a signed URL (302/307)",
      r.status === 302 || r.status === 307,
      `status ${r.status}`
    );
    const location = r.headers.get("location") ?? "";
    const fileRes = await fetch(location);
    const fileBytes = new Uint8Array(await fileRes.arrayBuffer());
    check(
      "the downloaded bytes match the upload",
      fileBytes.length === pdf.length &&
        fileBytes.every((b, i) => b === pdf[i]),
      `${fileBytes.length} bytes`
    );

    // ---- list the shares ----
    r = await appFetch(`/api/documents/${docId}/shares`, { session: sessionA });
    const listed = await r.json().catch(() => ({}));
    check(
      "listing the shares shows the new link",
      r.status === 200 &&
        listed.shares?.length === 1 &&
        listed.shares[0].id === created.share?.id,
      `status ${r.status}`
    );
    const shareId = created.share?.id;

    // ---- a bad expiry is refused ----
    r = await appFetch(`/api/documents/${docId}/shares`, {
      session: sessionA,
      method: "POST",
      body: { expiry: "1h" },
    });
    check(
      "a bad expiry choice is refused (400)",
      r.status === 400,
      `status ${r.status}`
    );

    // ---- user B cannot create/list/revoke A's shares ----
    r = await appFetch(`/api/documents/${docId}/shares`, {
      session: sessionB,
      method: "POST",
      body: { expiry: "7d" },
    });
    check(
      "user B cannot create a share for A's document (404)",
      r.status === 404,
      `status ${r.status}`
    );
    r = await appFetch(`/api/documents/${docId}/shares`, { session: sessionB });
    check(
      "user B cannot list A's shares (404)",
      r.status === 404,
      `status ${r.status}`
    );
    r = await appFetch(`/api/documents/${docId}/shares/${shareId}/revoke`, {
      session: sessionB,
      method: "POST",
    });
    check(
      "user B cannot revoke A's share (404 or 403)",
      r.status === 404 || r.status === 403,
      `status ${r.status}`
    );

    // ---- revoke the share ----
    r = await appFetch(`/api/documents/${docId}/shares/${shareId}/revoke`, {
      session: sessionA,
      method: "POST",
    });
    check(
      "revoking the share succeeds",
      r.status === 200,
      `status ${r.status}`
    );
    r = await appFetch(`/s/${token}`);
    html = await r.text();
    check(
      "a revoked share's page says it was revoked",
      r.status === 200 && html.includes("revoked"),
      `status ${r.status}`
    );
    r = await appFetch(`/s/${token}/download`);
    check(
      "a revoked share's download is refused (404)",
      r.status === 404,
      `status ${r.status}`
    );

    // ---- an expired share is refused ----
    const token2 = randomBytes(16).toString("hex");
    const hash2 = createHash("sha256").update(token2).digest("hex");
    await admin.from("document_shares").insert({
      document_id: docId,
      workspace_id: ws.id,
      token_hash: hash2,
      expires_at: new Date(Date.now() - 1000).toISOString(),
      created_by: userAId,
    });
    r = await appFetch(`/s/${token2}`);
    html = await r.text();
    check(
      "an expired share's page says it expired",
      r.status === 200 && html.includes("expired"),
      `status ${r.status}`
    );
    r = await appFetch(`/s/${token2}/download`);
    check(
      "an expired share's download is refused (404)",
      r.status === 404,
      `status ${r.status}`
    );

    // ---- a bad token is refused ----
    r = await appFetch(`/s/${"0".repeat(32)}`);
    html = await r.text();
    check(
      "a bad token's page says it is not valid",
      r.status === 200 && html.includes("not valid"),
      `status ${r.status}`
    );
    r = await appFetch(`/s/${"0".repeat(32)}/download`);
    check(
      "a bad token's download is refused (404)",
      r.status === 404,
      `status ${r.status}`
    );

    // ---- a never-expiring share works ----
    r = await appFetch(`/api/documents/${docId}/shares`, {
      session: sessionA,
      method: "POST",
      body: { expiry: "never" },
    });
    const neverCreated = await r.json().catch(() => ({}));
    check(
      "a never-expiring share has a null expiry",
      r.status === 200 && neverCreated.share?.expiresAt === null,
      `status ${r.status}`
    );
  }

  // Signed-out: the proxy redirects unauthenticated API
  // requests to login (307) before the route runs.
  r = await appFetch(`/api/documents/${docId}/shares`, {
    method: "POST",
    body: { expiry: "7d" },
  });
  check(
    "signed-out: creating a share redirects to login (307)",
    r.status === 307,
    `status ${r.status}`
  );
} catch (error) {
  console.error("HARNESS ERROR:", error);
  process.exitCode = 1;
} finally {
  if (userAId) await admin.auth.admin.deleteUser(userAId);
  if (userBId) await admin.auth.admin.deleteUser(userBId);
  console.log(
    `\n==== SUMMARY ====\n${passed}/${passed + failed} checks passed`
  );
  if (failures.length > 0) {
    console.log("FAILED:");
    for (const f of failures) console.log(" - " + f);
    process.exitCode = 1;
  }
}
