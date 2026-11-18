import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Star } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentWorkspace,
  listAllFolders,
  listStarredDocuments,
  LibraryNotReady,
} from "@/features/library/queries";
import { EmptyState } from "@/components/ui/empty-state";
import {
  LibrarySetupPending,
  NoWorkspaceYet,
} from "@/components/library/library-setup";
import { DocumentTable } from "@/components/library/library-list";

export const metadata: Metadata = { title: "Starred — Forma Office" };

export default async function StarredPage() {
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

  let starred;
  let allFolders;
  try {
    [starred, allFolders] = await Promise.all([
      listStarredDocuments(supabase, workspace.id, user.id),
      listAllFolders(supabase, workspace.id),
    ]);
  } catch (error) {
    if (error instanceof LibraryNotReady) return <LibrarySetupPending />;
    throw error;
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <h1 className="text-xl font-semibold text-[#17253b]">Starred</h1>
      <p className="mt-1 text-sm text-[#667389]">
        Documents you starred for quick access.
      </p>
      <div className="mt-6">
        {starred.length === 0 ? (
          <EmptyState
            icon={Star}
            title="No starred documents"
            description="Star a document from My files and it will show up here."
          />
        ) : (
          <DocumentTable
            documents={starred.map((doc) => ({ ...doc, starred: true }))}
            folders={allFolders}
          />
        )}
      </div>
    </div>
  );
}
