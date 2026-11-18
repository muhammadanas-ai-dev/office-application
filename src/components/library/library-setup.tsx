// Shared loading + setup-pending states for library pages (Day 4).
import { Database, FolderOpen } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

/** Shown when the Day 3/Day 4 migrations have not been applied yet. */
export function LibrarySetupPending() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <EmptyState
        icon={Database}
        title="Library setup is pending"
        description="The database tables for workspaces and documents do not exist yet. Apply the Day 3 migration (supabase/migrations/20261117010000_forma_auth_workspace.sql) and then the Day 4 migration (supabase/migrations/20261117020000_forma_documents_library.sql) in the Supabase dashboard SQL Editor, in that order, and this page will load your library."
      />
    </div>
  );
}

/** Shown when a signed-in user has no workspace yet. */
export function NoWorkspaceYet() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <EmptyState
        icon={FolderOpen}
        title="No workspace yet"
        description="Your account is signed in but has no workspace. Sign out and sign in again — the workspace is created on sign-in — or apply the Day 3 and Day 4 migrations first if they are still pending."
      />
    </div>
  );
}
