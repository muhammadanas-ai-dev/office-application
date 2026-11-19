// Live e2e for Day 28 (UX gaps) — as real signed-in users.
//
// Checks:
//  1. The sidebar has "Shared" (not "Shared with me") and no
//     "Plan and usage" (the Plan nav item was removed).
//  2. The /shared page loads and shows the empty state for a
//     fresh user.
//  3. Creating a share makes it appear on /shared (with the
//     document title and a Live status); revoking it makes it
//     show Revoked.
//  4. The /files page has the drag-and-drop zone text.
//  5. The editor page loads (the tab strip registers the
//     document client-side; the tab helpers are unit-tested).
//
// The session cookie is the OBJECT form (the Day 24 lesson —
// the array form no longer loads). The test user is deleted in
// `finally`. Run: node scripts/e2e-ux-test.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const APP = "http://localhost:3000";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error("Missing Supabase env.");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let passed = 0;
let failed = 0;
const failures = [];

function check(name, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`PASS  ${name}`);
  } else {
    failed++;
    console.log(`FAIL  ${name} — ${detail}`);
    failures.push(name);
  }
}

async function main() {
  const email = `forma-e2e-ux-${Date.now()}@example.com`;
  const password = "UxTestPass123!";
  const { data: user, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !user?.user) {
    console.error("Could not create the test user:", createError?.message);
    process.exit(1);
  }
  const userId = user.user.id;
  try {
    const { data: ws } = await admin
      .from("workspaces")
      .insert({
        name: "E2E UX ws",
        owner_id: userId,
        plan_key: "free",
        is_personal: true,
      })
      .select("id")
      .single();
    const workspaceId = ws.id;
    await admin
      .from("workspace_members")
      .insert({
        workspace_id: workspaceId,
        user_id: userId,
        role: "owner",
        status: "active",
      });

    const { data: sessionData, error: signInError } =
      await admin.auth.signInWithPassword({ email, password });
    if (signInError || !sessionData?.session) {
      throw new Error(`Sign-in failed: ${signInError?.message}`);
    }
    const session = sessionData.session;
    const storageKey = `sb-${new URL(supabaseUrl).host.split(".")[0]}-auth-token`;
    const cookie = `${storageKey}=${encodeURIComponent(JSON.stringify(session))}`;
    const headers = { Cookie: cookie };

    // 1. The sidebar: "Shared" (not "Shared with me"), no Plan.
    const filesHtml = await (await fetch(`${APP}/files`, { headers })).text();
    check(
      "sidebar: has Shared (not Shared with me)",
      filesHtml.includes(">Shared<") && !filesHtml.includes("Shared with me"),
      "the nav item was not renamed"
    );
    check(
      "sidebar: no Plan and usage",
      !filesHtml.includes("Plan and usage"),
      "the Plan nav item is still there"
    );

    // 2. The /shared page loads and shows the empty state.
    const sharedResp = await fetch(`${APP}/shared`, { headers });
    const sharedHtml = await sharedResp.text();
    check(
      "shared page: loads (200) with the empty state",
      sharedResp.status === 200 && sharedHtml.includes("No share links yet"),
      `status ${sharedResp.status}`
    );

    // 3. Create a share (via the API), then the page lists it.
    const pdf = readFileSync("/tmp/e2e/pdf1.pdf");
    const docId = crypto.randomUUID();
    const filePath = `${workspaceId}/${docId}/1/pdf1.pdf`;
    const { error: uploadError } = await admin.storage
      .from("documents")
      .upload(filePath, pdf, { contentType: "application/pdf", upsert: true });
    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
    await admin.from("documents").insert({
      id: docId,
      workspace_id: workspaceId,
      title: "UX test doc",
      file_path: filePath,
      mime_type: "application/pdf",
      size_bytes: pdf.length,
      version: 1,
    });
    await admin.from("document_versions").insert({
      document_id: docId,
      workspace_id: workspaceId,
      version_number: 1,
      file_path: filePath,
      mime_type: "application/pdf",
      size_bytes: pdf.length,
      created_by: userId,
    });

    const createResp = await fetch(`${APP}/api/documents/${docId}/shares`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ expiry: "7d" }),
    });
    const created = await createResp.json();
    check(
      "share: created via the API",
      createResp.status === 200 && Boolean(created?.share?.id),
      `status ${createResp.status}: ${JSON.stringify(created).slice(0, 120)}`
    );
    const shareId = created?.share?.id;

    const sharedAfter = await (
      await fetch(`${APP}/shared`, { headers })
    ).text();
    check(
      "shared page: lists the new link (title + Live)",
      sharedAfter.includes("UX test doc") && sharedAfter.includes("Live"),
      "the share is not listed"
    );

    // Revoke it — the page then shows Revoked.
    const revokeResp = await fetch(
      `${APP}/api/documents/${docId}/shares/${shareId}/revoke`,
      { method: "POST", headers }
    );
    check(
      "share: revoked via the API",
      revokeResp.status === 200,
      `status ${revokeResp.status}`
    );
    const sharedRevoked = await (
      await fetch(`${APP}/shared`, { headers })
    ).text();
    check(
      "shared page: the revoked link shows Revoked",
      sharedRevoked.includes("UX test doc") &&
        sharedRevoked.includes("Revoked"),
      "the revoked status is not shown"
    );

    // 4. The /files page has the drag-and-drop zone text.
    check(
      "upload: the drag-and-drop zone is on the page",
      filesHtml.includes("drag files here to upload"),
      "the drop zone text is missing"
    );

    // 5. The editor page loads (the tab strip registers the
    // document client-side; the tab helpers are unit-tested).
    const editorResp = await fetch(`${APP}/editor/${docId}`, { headers });
    const editorHtml = await editorResp.text();
    check(
      "editor: the page loads (the tab registers client-side)",
      editorResp.status === 200 &&
        (editorHtml.includes("UX test doc") ||
          editorHtml.includes("editor server is not configured")),
      `status ${editorResp.status}`
    );
  } finally {
    await admin.auth.admin.deleteUser(userId);
  }

  console.log(
    `\n==== SUMMARY ====\n${passed} passed, ${failed} failed (${passed + failed} total)`
  );
  if (failures.length > 0) {
    console.log("FAILED:");
    for (const name of failures) console.log(` - ${name}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
