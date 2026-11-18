import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Folder, FileText, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentWorkspace,
  listTrash,
  LibraryNotReady,
} from "@/features/library/queries";
import { EmptyState } from "@/components/ui/empty-state";
import {
  LibrarySetupPending,
  NoWorkspaceYet,
} from "@/components/library/library-setup";
import { TrashActions } from "@/components/library/library-forms";
import { formatBytes } from "@/lib/storage";

export const metadata: Metadata = { title: "Trash — Forma Office" };

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function TrashPage() {
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

  let trash;
  try {
    trash = await listTrash(supabase, workspace.id);
  } catch (error) {
    if (error instanceof LibraryNotReady) return <LibrarySetupPending />;
    throw error;
  }

  const isEmpty = trash.folders.length === 0 && trash.documents.length === 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <h1 className="text-xl font-semibold text-[#17253b]">Trash</h1>
      <p className="mt-1 text-sm text-[#667389]">
        Deleted folders and documents. Restore them, or delete them forever —
        permanent delete removes the files and cannot be undone.
      </p>
      <div className="mt-6">
        {isEmpty ? (
          <EmptyState
            icon={Trash2}
            title="Trash is empty"
            description="Items you delete from My files can be restored from here."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {trash.folders.map((folder) => (
              <li
                key={`folder-${folder.id}`}
                className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-[#dce3ec] bg-white p-3"
              >
                <div className="flex items-start gap-2">
                  <Folder
                    size={18}
                    aria-hidden="true"
                    className="mt-0.5 shrink-0 text-[#667389]"
                  />
                  <div>
                    <p className="font-medium text-[#202b3c]">{folder.name}</p>
                    <p className="text-xs text-[#667389]">
                      Folder · Deleted{" "}
                      {folder.deleted_at ? formatDate(folder.deleted_at) : ""}
                    </p>
                  </div>
                </div>
                <TrashActions kind="folder" id={folder.id} />
              </li>
            ))}
            {trash.documents.map((document) => (
              <li
                key={`doc-${document.id}`}
                className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-[#dce3ec] bg-white p-3"
              >
                <div className="flex items-start gap-2">
                  <FileText
                    size={18}
                    aria-hidden="true"
                    className="mt-0.5 shrink-0 text-[#667389]"
                  />
                  <div>
                    <p className="font-medium text-[#202b3c]">
                      {document.title}
                    </p>
                    <p className="text-xs text-[#667389]">
                      {document.file_path
                        ? `${formatBytes(document.size_bytes)} · `
                        : "Blank document · "}
                      Deleted{" "}
                      {document.deleted_at
                        ? formatDate(document.deleted_at)
                        : ""}
                    </p>
                  </div>
                </div>
                <TrashActions kind="document" id={document.id} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
