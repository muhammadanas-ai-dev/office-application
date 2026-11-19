// Home (Day 29, UI polish) — a WPS-style home: a "Create new"
// row (Document / Spreadsheet / Presentation, each a card that
// creates a blank file), then the recent documents.
//
// Creating a blank document is a server action (createDocument
// with a template type), so each card is a small form — the same
// action the library's "New" button uses.
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  FileSpreadsheet,
  FileText,
  FolderOpen,
  LayoutTemplate,
  Presentation,
} from "lucide-react";
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
import { createDocument, type ActionResult } from "@/features/library/actions";

export const metadata: Metadata = { title: "Home — Forma Office" };

/**
 * Create a blank document from the home page. The library's
 * createDocument is a useActionState action (it takes the
 * previous state), so this wrapper adapts it to a plain form
 * action. On success the user is taken to My files, where the
 * new document is at the top of the list (the action does not
 * return the new document id, so the editor cannot be opened
 * directly from here).
 */
async function createBlank(formData: FormData) {
  "use server";
  const idle: ActionResult = { ok: true };
  const result = await createDocument(idle, formData);
  if (!result.ok) return;
  redirect("/files");
}

const NEW_TYPES = [
  {
    type: "docx" as const,
    label: "Document",
    hint: "Blank Word document",
    icon: FileText,
    colour: "text-[#2b579a]",
    bg: "bg-[#e8effa]",
  },
  {
    type: "xlsx" as const,
    label: "Spreadsheet",
    hint: "Blank workbook",
    icon: FileSpreadsheet,
    colour: "text-[#217346]",
    bg: "bg-[#e6f4ea]",
  },
  {
    type: "pptx" as const,
    label: "Presentation",
    hint: "Blank slides",
    icon: Presentation,
    colour: "text-[#d24726]",
    bg: "bg-[#fdeee8]",
  },
];

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

      <div className="mt-6 flex flex-col gap-8">
        <section aria-label="Create new">
          <h2 className="mb-2 text-sm font-semibold text-[#202b3c]">
            Create new
          </h2>
          <ul className="grid gap-3 sm:grid-cols-3">
            {NEW_TYPES.map(({ type, label, hint, icon: Icon, colour, bg }) => (
              <li key={type}>
                <form action={createBlank}>
                  <input
                    type="hidden"
                    name="title"
                    value={`Untitled ${label}`}
                  />
                  <input type="hidden" name="type" value={type} />
                  <input type="hidden" name="folderId" value="" />
                  <button
                    type="submit"
                    className="flex w-full items-center gap-3 rounded-xl border border-[#dce3ec] bg-white p-4 text-left hover:border-[#3159c9] hover:shadow-sm"
                  >
                    <span className={`rounded-lg ${bg} p-2.5 ${colour}`}>
                      <Icon size={22} aria-hidden="true" />
                    </span>
                    <span>
                      <span className="block font-medium text-[#202b3c]">
                        {label}
                      </span>
                      <span className="block text-xs text-[#667389]">
                        {hint}
                      </span>
                    </span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <p className="mt-3">
            <Link
              href="/templates"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[#3159c9] hover:underline"
            >
              <LayoutTemplate size={16} aria-hidden="true" />
              Or start from a template
            </Link>
          </p>
        </section>

        <section aria-label="Recent documents">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-[#202b3c]">Recent</h2>
            <Link
              href="/recent"
              className="text-sm font-medium text-[#3159c9] hover:underline"
            >
              See all
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
        </section>
      </div>
    </div>
  );
}
