import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FolderOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentWorkspace,
  getWorkspaceCounts,
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

export const metadata: Metadata = { title: "Home — Forma Office" };

export default async function WorkspaceHomePage() {
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

  let counts;
  let recent;
  let allFolders;
  try {
    [counts, recent, allFolders] = await Promise.all([
      getWorkspaceCounts(supabase, workspace.id),
      listRecentDocuments(supabase, workspace.id, user.id, 8),
      listAllFolders(supabase, workspace.id),
    ]);
  } catch (error) {
    if (error instanceof LibraryNotReady) return <LibrarySetupPending />;
    throw error;
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <h1 className="text-xl font-semibold text-[#17253b]">{workspace.name}</h1>
      <p className="mt-1 text-sm text-[#667389]">
        {counts.documents} {counts.documents === 1 ? "document" : "documents"} ·{" "}
        {counts.folders} {counts.folders === 1 ? "folder" : "folders"}
      </p>

      <div className="mt-6 flex flex-col gap-6">
        <div className="flex flex-wrap gap-2">
          <Link
            href="/files"
            className="inline-flex h-9 items-center rounded-lg bg-[#3159c9] px-4 text-sm font-medium text-white hover:bg-[#2a4cab]"
          >
            Open My files
          </Link>
          <Link
            href="/recent"
            className="inline-flex h-9 items-center rounded-lg border border-[#dce3ec] bg-white px-4 text-sm font-medium text-[#202b3c] hover:bg-[#f4f6fa]"
          >
            Recent
          </Link>
          <Link
            href="/starred"
            className="inline-flex h-9 items-center rounded-lg border border-[#dce3ec] bg-white px-4 text-sm font-medium text-[#202b3c] hover:bg-[#f4f6fa]"
          >
            Starred
          </Link>
        </div>

        {recent.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title="No documents yet"
            description="Create a blank document or upload a file from My files to see it here."
          />
        ) : (
          <DocumentTable documents={recent} folders={allFolders} />
        )}
      </div>
    </div>
  );
}
