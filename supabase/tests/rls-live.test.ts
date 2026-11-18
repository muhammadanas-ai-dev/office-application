// Live RLS test against the Supabase project.
//
// SKIPPED by default. Run only after the Day 3 AND Day 4 migrations
// have been applied in the Supabase dashboard:
//
//   npm run test:live
//
// It creates two real auth users via the admin API, then proves over
// the REST/Data API (the same path the app uses) that user B cannot
// read or mutate user A's workspace, while user A can. Test users are
// deleted afterwards; deleting a user cascades their profile,
// memberships and owned workspaces.
// @vitest-environment node
import { describe, expect, it, afterAll, beforeAll, vi } from "vitest";
import dotenv from "dotenv";

// The admin client module carries `import "server-only"`, which
// unconditionally throws outside a React Server Component. This
// test runs in plain Node (not a client component), so the guard
// is neutralised here — the keys it protects stay server-side.
vi.mock("server-only", () => ({}));

dotenv.config({ path: ".env.local" });

const live = process.env.FORMA_LIVE_DB === "1";

describe.skipIf(!live)("live RLS: cross-workspace denial", () => {
  const suffix = Date.now().toString(36);
  const userA = {
    email: `forma-rls-a-${suffix}@example.com`,
    password: "TestPass123!",
  };
  const userB = {
    email: `forma-rls-b-${suffix}@example.com`,
    password: "TestPass123!",
  };
  let userAId = "";
  let userBId = "";
  let workspaceAId = "";
  let documentAId = "";
  let filePathA = "";

  beforeAll(async () => {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();

    const createdA = await admin.auth.admin.createUser({
      email: userA.email,
      password: userA.password,
      email_confirm: true,
    });
    const createdB = await admin.auth.admin.createUser({
      email: userB.email,
      password: userB.password,
      email_confirm: true,
    });
    if (createdA.error || !createdA.data.user) {
      throw new Error(
        `could not create test user A: ${createdA.error?.message}`
      );
    }
    if (createdB.error || !createdB.data.user) {
      throw new Error(
        `could not create test user B: ${createdB.error?.message}`
      );
    }
    userAId = createdA.data.user.id;
    userBId = createdB.data.user.id;

    const { data: workspace, error } = await admin
      .from("workspaces")
      .insert({
        name: "RLS test workspace",
        owner_id: userAId,
        plan_key: "free",
      })
      .select("id")
      .single();
    if (error || !workspace) {
      throw new Error(`could not create test workspace: ${error?.message}`);
    }
    workspaceAId = workspace.id;

    const { error: memberError } = await admin
      .from("workspace_members")
      .insert({
        workspace_id: workspaceAId,
        user_id: userAId,
        role: "owner",
        status: "active",
      });
    if (memberError) {
      throw new Error(`could not add test member: ${memberError.message}`);
    }
    await admin
      .from("profiles")
      .upsert({ id: userAId, display_name: "User A" });
    await admin
      .from("profiles")
      .upsert({ id: userBId, display_name: "User B" });

    // Day 4: a document + stored file in A's workspace (admin bypasses
    // RLS to set the scene up; the tests below use user clients).
    const { data: document, error: docError } = await admin
      .from("documents")
      .insert({
        workspace_id: workspaceAId,
        title: "RLS test document",
        created_by: userAId,
      })
      .select("id")
      .single();
    if (docError || !document) {
      throw new Error(`could not create test document: ${docError?.message}`);
    }
    documentAId = document.id;
    filePathA = `${workspaceAId}/${documentAId}/v1/rls-test.txt`;
    const { error: uploadError } = await admin.storage
      .from("documents")
      .upload(filePathA, new Blob(["rls test file"], { type: "text/plain" }), {
        contentType: "text/plain",
      });
    if (uploadError) {
      throw new Error(`could not upload test file: ${uploadError.message}`);
    }
    const { error: linkError } = await admin
      .from("documents")
      .update({ file_path: filePathA, mime_type: "text/plain", size_bytes: 13 })
      .eq("id", documentAId);
    if (linkError) {
      throw new Error(`could not link test file: ${linkError.message}`);
    }
  }, 60_000);

  afterAll(async () => {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    if (userAId) await admin.auth.admin.deleteUser(userAId);
    if (userBId) await admin.auth.admin.deleteUser(userBId);
  }, 60_000);

  async function clientFor(email: string, password: string) {
    // A plain supabase-js client, not the app's browser client:
    // createBrowserClient needs cookie handlers and throws in a
    // non-browser runtime when sign-in persists the session. This
    // client keeps the session in memory, which is all the test
    // needs to prove RLS over the REST API.
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error("Supabase URL/key missing from .env.local");
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
    return client;
  }

  it("user A can read their own workspace", async () => {
    const client = await clientFor(userA.email, userA.password);
    const { data, error } = await client
      .from("workspaces")
      .select("id")
      .eq("id", workspaceAId);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
  });

  it("user B cannot see user A's workspace", async () => {
    const client = await clientFor(userB.email, userB.password);
    const { data, error } = await client
      .from("workspaces")
      .select("id")
      .eq("id", workspaceAId);
    expect(error).toBeNull();
    expect(data?.length).toBe(0);
  });

  it("user B cannot add a member to user A's workspace", async () => {
    const client = await clientFor(userB.email, userB.password);
    const { error } = await client.from("workspace_members").insert({
      workspace_id: workspaceAId,
      user_id: userBId,
      role: "viewer",
      status: "active",
    });
    expect(error).not.toBeNull();
  });

  it("user B cannot read user A's profile", async () => {
    const client = await clientFor(userB.email, userB.password);
    const { data, error } = await client
      .from("profiles")
      .select("id")
      .eq("id", userAId);
    expect(error).toBeNull();
    expect(data?.length).toBe(0);
  });

  it("user A can read their own document", async () => {
    const client = await clientFor(userA.email, userA.password);
    const { data, error } = await client
      .from("documents")
      .select("id")
      .eq("id", documentAId);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
  });

  it("user B cannot see user A's document", async () => {
    const client = await clientFor(userB.email, userB.password);
    const { data, error } = await client
      .from("documents")
      .select("id")
      .eq("id", documentAId);
    expect(error).toBeNull();
    expect(data?.length).toBe(0);
  });

  it("user B cannot insert a document into user A's workspace", async () => {
    const client = await clientFor(userB.email, userB.password);
    const { error } = await client.from("documents").insert({
      workspace_id: workspaceAId,
      title: "Hijacked document",
    });
    expect(error).not.toBeNull();
  });

  it("user A can download their own file", async () => {
    const client = await clientFor(userA.email, userA.password);
    const { data, error } = await client.storage
      .from("documents")
      .download(filePathA);
    expect(error).toBeNull();
    expect(data).not.toBeNull();
  });

  it("user B cannot download user A's file", async () => {
    const client = await clientFor(userB.email, userB.password);
    const { error } = await client.storage
      .from("documents")
      .download(filePathA);
    expect(error).not.toBeNull();
  });
});
