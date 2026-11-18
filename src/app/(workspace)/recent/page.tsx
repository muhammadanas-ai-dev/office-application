import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentWorkspace,
  listAllFolders,
  listRecentDocuments,
  LibraryNotReady,
} from "@/features/library/queries";
import { EmptyState } from "@/components/ui/empty-state";
import {
  LibrarySetupPending,
  NoWorkspaceYet,
} from "@/components/library/library-setup";
import { DocumentTable } from "@/components/library/library-list";

export const metadata: Metadata = { title: "Recent — Forma Office" };

export default async function RecentPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  let workspace;
  try {
    workspace = await getCurrentWorkspace(supabase, user.id);
  } catch (error) {
    if (error instanceof LibraryNotReady) return <LibrarySetupPending />;
    throw error;
  }
  if (!workspace) return <NoWorkspaceYet />;

  let recent;
  let allFolders;
  try {
    [recent, allFolders] = await Promise.all([
      listRecentDocuments(supabase, workspace.id, user.id, 30),
      listAllFolders(supabase, workspace.id),
    ]);
  } catch (error) {
    if (error instanceof LibraryNotReady) return <LibrarySetupPending />;
    throw error;
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <h1 className="text-xl font-semibold text-[#17253b]">Recent</h1>
      <p className="mt-1 text-sm text-[#667389]">
        Documents you modified most recently.
      </p>
      <div className="mt-6">
        {recent.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="Nothing recent"
            description="Documents you create or upload will show up here."
          />
        ) : (
          <DocumentTable documents={recent} folders={allFolders} />
        )}
      </div>
    </div>
  );
}
