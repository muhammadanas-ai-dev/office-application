// Server-only provisioning: profile + personal workspace for a user.
//
// Runs with the admin client (service_role), which bypasses RLS — that
// is the legitimate provisioning path, and the reason the migration
// does NOT use a SECURITY DEFINER trigger on auth.users and does NOT
// force RLS. Called after sign-up, after sign-in, and in the auth
// callback, so it is idempotent: a second call finds the existing rows
// and does nothing.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export async function ensureProfileAndWorkspace(
  userId: string,
  displayName?: string | null
): Promise<{ workspaceId: string }> {
  const admin = createAdminClient();
  const name = (displayName ?? "").trim();

  const { error: profileError } = await admin
    .from("profiles")
    .upsert({ id: userId, display_name: name || null }, { onConflict: "id" });
  if (profileError) {
    throw new Error(`Could not create profile: ${profileError.message}`);
  }

  const { data: existing, error: lookupError } = await admin
    .from("workspaces")
    .select("id")
    .eq("owner_id", userId)
    // The personal workspace first: a user with several workspaces
    // (e.g. from the Day 3 race) lands in their personal one.
    .order("is_personal", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1);
  if (lookupError) {
    throw new Error(`Could not look up workspaces: ${lookupError.message}`);
  }
  if (existing && existing.length > 0) {
    return { workspaceId: existing[0].id };
  }

  const { data: workspace, error: workspaceError } = await admin
    .from("workspaces")
    .insert({
      name: name ? `${name}'s workspace` : "My workspace",
      owner_id: userId,
      plan_key: "free",
      is_personal: true,
    })
    .select("id")
    .single();
  if (workspaceError || !workspace) {
    // Two concurrent first sign-ins can both reach the insert; the
    // partial unique index on (owner_id) WHERE is_personal rejects
    // the second one. The first call's workspace already exists, so
    // look it up again instead of failing the sign-in.
    if (workspaceError?.code === "23505") {
      const { data: raced, error: racedError } = await admin
        .from("workspaces")
        .select("id")
        .eq("owner_id", userId)
        .eq("is_personal", true)
        .order("created_at", { ascending: true })
        .limit(1);
      if (!racedError && raced && raced.length > 0) {
        return { workspaceId: raced[0].id };
      }
    }
    throw new Error(
      `Could not create workspace: ${workspaceError?.message ?? "unknown error"}`
    );
  }

  const { error: memberError } = await admin.from("workspace_members").insert({
    workspace_id: workspace.id,
    user_id: userId,
    role: "owner",
    status: "active",
  });
  if (memberError) {
    throw new Error(`Could not add workspace member: ${memberError.message}`);
  }

  return { workspaceId: workspace.id };
}
