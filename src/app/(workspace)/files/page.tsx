import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FolderOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentWorkspace,
  getFolderBreadcrumb,
  listAllFolders,
  listFolderContents,
  LibraryNotReady,
} from "@/features/library/queries";
import { EmptyState } from "@/components/ui/empty-state";
import {
  LibrarySetupPending,
  NoWorkspaceYet,
} from "@/components/library/library-setup";
import {
  Breadcrumb,
  DocumentTable,
  FolderGrid,
  FolderTree,
  LibraryToolbar,
} from "@/components/library/library-list";
import {
  CreateDocumentForm,
  CreateFolderForm,
  UploadForm,
} from "@/components/library/library-forms";
import { SUPPORTED_UPLOAD_MESSAGE } from "@/lib/storage";

export const metadata: Metadata = { title: "My files — Forma Office" };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function FilesPage({
  searchParams,
}: {
  searchParams: Promise<{
    folder?: string;
    q?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const params = await searchParams;
  const folderId =
    params.folder && UUID_PATTERN.test(params.folder) ? params.folder : null;
  const query = (params.q ?? "").trim().slice(0, 100);
  const sort =
    params.sort === "updated" || params.sort === "size" ? params.sort : "name";
  const direction = params.dir === "desc" ? "desc" : "asc";

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

  let contents;
  let breadcrumb: Awaited<ReturnType<typeof getFolderBreadcrumb>> = [];
  let allFolders: Awaited<ReturnType<typeof listAllFolders>> = [];
  try {
    [contents, allFolders] = await Promise.all([
      listFolderContents(supabase, workspace.id, folderId, {
        query: query || undefined,
        sort,
        direction,
        userId: user.id,
      }),
      listAllFolders(supabase, workspace.id),
    ]);
    if (folderId) {
      breadcrumb = await getFolderBreadcrumb(supabase, workspace.id, folderId);
    }
  } catch (error) {
    if (error instanceof LibraryNotReady) return <LibrarySetupPending />;
    throw error;
  }

  const isEmpty =
    contents.folders.length === 0 && contents.documents.length === 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="w-full shrink-0 lg:w-56">
          <h2 className="mb-2 px-2 text-xs font-semibold tracking-wide text-[#667389] uppercase">
            Folders
          </h2>
          <FolderTree folders={allFolders} currentFolderId={folderId} />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <Breadcrumb
            chain={breadcrumb}
            currentName={
              folderId ? (breadcrumb[breadcrumb.length - 1]?.name ?? "") : ""
            }
          />
          <LibraryToolbar
            folderId={folderId}
            query={query}
            sort={sort}
            direction={direction}
          />

          <div className="flex flex-wrap gap-4">
            <CreateFolderForm parentId={folderId} />
            <CreateDocumentForm folderId={folderId} />
          </div>
          <UploadForm folderId={folderId} />
          <p className="text-xs text-[#667389]">
            {SUPPORTED_UPLOAD_MESSAGE} Word, spreadsheet and presentation files
            open editable in the editor; PDF uploads are view-only. Files are
            stored privately — only members of this workspace can open them.
          </p>

          {isEmpty ? (
            <EmptyState
              icon={FolderOpen}
              title={
                query
                  ? "Nothing matches that search"
                  : folderId
                    ? "This folder is empty"
                    : "No files yet"
              }
              description={
                query
                  ? "Try a different name, or clear the search."
                  : "Create a folder or a blank document, or upload a file to get started."
              }
            />
          ) : (
            <>
              <FolderGrid folders={contents.folders} allFolders={allFolders} />
              <DocumentTable
                documents={contents.documents}
                folders={allFolders}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
