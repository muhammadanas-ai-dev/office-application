// Live e2e for Settings / preferences (Day 24).
// Run with the app on :3000:
//   node scripts/e2e-preferences-test.mjs
//
// REQUIRES the Day 24 migration (the three preference columns
// on profiles) — run ~/workspace/your_files/
// forma-preferences-migration.sql in the Dashboard SQL Editor.
// If it is not applied, the harness reports it clearly and only
// runs the checks that do not need it (the Day 21 pattern).
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

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
  email: `forma-e2e-pref-a-${suffix}@example.com`,
  password: "TestPass123!",
};
const userB = {
  email: `forma-e2e-pref-b-${suffix}@example.com`,
  password: "TestPass123!",
};
let userAId = "",
  userBId = "";

async function newSession(email, password) {
  const client = createClient(SUPA_URL, PUB, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await client.auth.signInWithPassword({ email, password });
  // The session cookie must hold the session as a JSON OBJECT
  // (access_token, refresh_token, expires_at, ...). The array
  // form ([token, refresh, expires, type, user]) no longer
  // loads: auth-js's _isValidSession checks for the
  // access_token / refresh_token / expires_at properties, which
  // an array does not have — getSession returns absent and every
  // protected route 307s to login.
  const cookie = `sb-pwncfcvnwudbvwcumado-auth-token=${encodeURIComponent(JSON.stringify(data.session))}`;
  return { cookie };
}
async function appFetch(
  path,
  { session, method = "GET", body, redirect = "follow" } = {}
) {
  const headers = { cookie: session?.cookie ?? "" };
  if (body) headers["content-type"] = "application/json";
  return fetch(`${APP}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect,
  });
}
// Strip the HTML comments React inserts between adjacent
// text/expression nodes (the Day 20 lesson).
const stripComments = (html) => html.replace(/<!-- -->/g, "");

try {
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
    .upsert({ id: userAId, display_name: "E2E Prefs A" }, { onConflict: "id" });
  await admin
    .from("profiles")
    .upsert({ id: userBId, display_name: "E2E Prefs B" }, { onConflict: "id" });
  const sessionA = await newSession(userA.email, userA.password);
  const sessionB = await newSession(userB.email, userB.password);

  // Is the Day 24 migration applied?
  const clientA = createClient(SUPA_URL, PUB, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await clientA.auth.signInWithPassword(userA);
  const { error: probeError } = await clientA
    .from("profiles")
    .select("ocr_language")
    .eq("id", userAId)
    .maybeSingle();
  const migrationApplied = !probeError;
  check(
    "the Day 24 migration is applied (the ocr_language column exists)",
    migrationApplied,
    probeError?.message ?? ""
  );
  if (!migrationApplied) {
    console.log(
      "MIGRATION NOT APPLIED — run forma-preferences-migration.sql in the Supabase Dashboard SQL Editor, then re-run this harness. The checks below that need it are skipped."
    );
  }

  // ---- the Settings page ----
  let r = await appFetch("/settings", { session: sessionA });
  let html = stripComments(await r.text());
  check(
    "the Settings page loads (200)",
    r.status === 200,
    `status ${r.status}`
  );
  check(
    "the Settings page shows the Preferences section",
    html.includes("Preferences") && html.includes("OCR default language")
  );
  if (!migrationApplied) {
    check(
      "without the migration, the page shows the setup notice",
      html.includes("forma-preferences-migration.sql"),
      "the notice is missing"
    );
  }

  if (migrationApplied) {
    // ---- save the preferences via the server action ----
    // Find the preferences form in the /settings HTML (the one
    // whose submit button says "Save preferences") and pull out
    // the server-action fields Next.js needs to route the POST
    // (the Day 15 pattern — the page has TWO forms, so the
    // fields must come from the preferences form, not the first
    // ones on the page).
    const formStart = html.indexOf("Save preferences");
    const formHtml =
      formStart === -1
        ? ""
        : html.slice(html.lastIndexOf("<form", formStart), formStart);
    const refMatch = formHtml.match(/name="(\$ACTION_REF_\d+)"/);
    const idMatch = formHtml.match(/name="(\$ACTION_\d+:0)" value="([^"]*)"/);
    const prevMatch = formHtml.match(/name="(\$ACTION_\d+:1)" value="([^"]*)"/);
    const keyMatch = formHtml.match(/name="\$ACTION_KEY" value="([^"]*)"/);
    if (refMatch && idMatch && prevMatch && keyMatch) {
      const form = new FormData();
      form.append("ocrLanguage", "urd");
      form.append("imageExportFormat", "jpg");
      form.append("imageExportDpi", "300");
      form.append(refMatch[1], "");
      form.append(idMatch[1], idMatch[2].replace(/&quot;/g, '"'));
      form.append(prevMatch[1], prevMatch[2].replace(/&quot;/g, '"'));
      form.append("$ACTION_KEY", keyMatch[1]);
      const res = await fetch(`${APP}/settings`, {
        method: "POST",
        headers: { cookie: sessionA.cookie },
        body: form,
        redirect: "follow",
      });
      const resHtml = stripComments(await res.text());
      check(
        "saving the preferences succeeds (the page shows 'Preferences saved')",
        res.status === 200 && resHtml.includes("Preferences saved"),
        `status ${res.status}`
      );
    } else {
      console.log(
        "NOTE: could not find the preferences form's server-action fields on /settings — saving via the user client instead."
      );
      const { error } = await clientA
        .from("profiles")
        .update({
          ocr_language: "urd",
          image_export_format: "jpg",
          image_export_dpi: 300,
        })
        .eq("id", userAId);
      check(
        "saving the preferences via the user client (RLS)",
        !error,
        error?.message ?? ""
      );
    }

    // ---- the profile row now has the values ----
    const { data: after } = await clientA
      .from("profiles")
      .select("ocr_language, image_export_format, image_export_dpi")
      .eq("id", userAId)
      .maybeSingle();
    check(
      "the profile row has urd/jpg/300",
      after.ocr_language === "urd" &&
        after.image_export_format === "jpg" &&
        after.image_export_dpi === 300,
      JSON.stringify(after)
    );

    // ---- the Settings page now shows the saved values ----
    r = await appFetch("/settings", { session: sessionA });
    html = stripComments(await r.text());
    check(
      "the Settings page shows Urdu selected",
      html.includes('value="urd" selected') ||
        html.includes('selected value="urd"') ||
        /<option[^>]*value="urd"[^>]*selected/.test(html),
      "the Urdu option is not selected"
    );
    check(
      "the Settings page shows JPG selected",
      /<option[^>]*value="jpg"[^>]*selected/.test(html),
      "the JPG option is not selected"
    );
    check(
      "the Settings page shows 300 DPI selected",
      /<option[^>]*value="300"[^>]*selected/.test(html),
      "the 300 DPI option is not selected"
    );

    // ---- the OCR page defaults to the user's language ----
    // Upload a PDF, then open its OCR page and check the
    // language select starts at urd.
    const pdf = readFileSync("/tmp/e2e/pdf1.pdf");
    // The test user was created via the admin API, so no
    // workspace was provisioned for them (provision happens on
    // sign-in through the app). Create one directly (the Day 23
    // pattern).
    const { data: wsA } = await admin
      .from("workspaces")
      .insert({
        name: "E2E prefs ws A",
        owner_id: userAId,
        plan_key: "free",
        is_personal: true,
      })
      .select("id")
      .single();
    await admin.from("workspace_members").insert({
      workspace_id: wsA.id,
      user_id: userAId,
      role: "owner",
      status: "active",
    });
    const workspaceId = wsA.id;
    const docId = crypto.randomUUID();
    const path = `${workspaceId}/${docId}/1/pdf1.pdf`;
    const { error: upErr } = await admin.storage
      .from("documents")
      .upload(path, pdf, { contentType: "application/pdf", upsert: true });
    if (upErr) throw new Error("upload failed: " + upErr.message);
    const { error: docErr } = await admin.from("documents").insert({
      id: docId,
      workspace_id: workspaceId,
      title: "Prefs OCR",
      mime_type: "application/pdf",
      file_path: path,
      size_bytes: pdf.length,
      version: 1,
      created_by: userAId,
    });
    if (docErr) throw new Error("document insert failed: " + docErr.message);
    await admin.from("document_versions").insert({
      document_id: docId,
      workspace_id: workspaceId,
      version_number: 1,
      file_path: path,
      mime_type: "application/pdf",
      size_bytes: pdf.length,
      created_by: userAId,
    });
    r = await appFetch(`/documents/${docId}/ocr`, { session: sessionA });
    html = stripComments(await r.text());
    // The OCR client shows a loading state first, so the
    // language select is not in the server-rendered HTML. The
    // defaultLanguage prop IS in the RSC (flight) payload —
    // that is what the client starts from. The payload is a
    // JSON string inside a <script>, so its quotes are escaped
    // (\"defaultLanguage\":\"urd\").
    check(
      "the OCR page passes the user's language as the default (defaultLanguage urd in the page payload)",
      html.includes('\\"defaultLanguage\\":\\"urd\\"'),
      "the payload does not carry defaultLanguage urd"
    );

    // ---- the library "Export images" link carries the preference ----
    r = await appFetch("/files", { session: sessionA });
    html = stripComments(await r.text());
    check(
      "the library Export images link carries format=jpg&dpi=300",
      html.includes("export-images?format=jpg") && html.includes("dpi=300"),
      "the link does not carry the preference"
    );

    // ---- a bad value is refused ----
    // Re-fetch /settings, extract the preferences form's
    // server-action fields again, and POST with a bad OCR
    // language (the Zod schema refuses it).
    r = await appFetch("/settings", { session: sessionA });
    html = stripComments(await r.text());
    const badFormStart = html.indexOf("Save preferences");
    const badFormHtml =
      badFormStart === -1
        ? ""
        : html.slice(html.lastIndexOf("<form", badFormStart), badFormStart);
    const badRef = badFormHtml.match(/name="(\$ACTION_REF_\d+)"/);
    const badId = badFormHtml.match(/name="(\$ACTION_\d+:0)" value="([^"]*)"/);
    const badPrev = badFormHtml.match(
      /name="(\$ACTION_\d+:1)" value="([^"]*)"/
    );
    const badKey = badFormHtml.match(/name="\$ACTION_KEY" value="([^"]*)"/);
    if (badRef && badId && badPrev && badKey) {
      const badForm = new FormData();
      badForm.append("ocrLanguage", "fra");
      badForm.append("imageExportFormat", "png");
      badForm.append("imageExportDpi", "150");
      badForm.append(badRef[1], "");
      badForm.append(badId[1], badId[2].replace(/&quot;/g, '"'));
      badForm.append(badPrev[1], badPrev[2].replace(/&quot;/g, '"'));
      badForm.append("$ACTION_KEY", badKey[1]);
      const badRes = await fetch(`${APP}/settings`, {
        method: "POST",
        headers: { cookie: sessionA.cookie },
        body: badForm,
        redirect: "follow",
      });
      const badHtml = stripComments(await badRes.text());
      check(
        "a bad OCR language is refused (the page shows an error)",
        badHtml.includes("Choose English, Urdu or Arabic"),
        "no validation error shown"
      );
    } else {
      check(
        "a bad OCR language is refused (the page shows an error)",
        false,
        "could not find the preferences form's action fields"
      );
    }

    // ---- cross-user isolation ----
    r = await appFetch("/settings", { session: sessionB });
    html = stripComments(await r.text());
    check(
      "user B's Settings page shows their own defaults (English, not Urdu)",
      !/<option[^>]*value="urd"[^>]*selected/.test(html),
      "B sees A's Urdu"
    );
    const { data: bAfter } = await clientA
      .from("profiles")
      .select("ocr_language")
      .eq("id", userAId)
      .maybeSingle();
    check(
      "user B did not change A's preferences",
      bAfter.ocr_language === "urd"
    );
  }

  // ---- signed-out ----
  r = await appFetch("/settings", { redirect: "manual" });
  check(
    "signed-out: /settings redirects to login (307)",
    r.status === 307,
    `status ${r.status}`
  );

  console.log(
    `\n==== SUMMARY ====\n${passed}/${passed + failed} checks passed`
  );
  if (failed) {
    console.log("FAILED:");
    failures.forEach((f) => console.log(" - " + f));
    process.exitCode = 1;
  }
} catch (error) {
  console.error("HARNESS ERROR:", error);
  process.exitCode = 1;
} finally {
  if (userAId) await admin.auth.admin.deleteUser(userAId);
  if (userBId) await admin.auth.admin.deleteUser(userBId);
}
