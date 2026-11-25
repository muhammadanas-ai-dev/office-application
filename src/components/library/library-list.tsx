// Server-rendered library views (Day 4): folder tree, breadcrumb,
// toolbar and document list. Interactive bits live in
// library-forms.tsx; this file only renders data.
import Link from "next/link";
import { Folder, ChevronRight } from "lucide-react";
import { formatBytes } from "@/lib/storage";
import {
  FileTypeIcon,
  fileTypeLabel,
} from "@/components/library/file-type-icon";
import { getEditorDocumentType, getEditorFileType } from "@/lib/editor";
import { isExportableToPdf } from "@/lib/export";
import { isPdfMimeType } from "@/lib/pdf-tools";
import { isOcrAcceptedMimeType } from "@/lib/ocr";
import { getConvertibleTargets } from "@/lib/convert";
import { createClient } from "@/lib/supabase/server";
import { getExportImagesHref, withDefaultPreferences } from "@/lib/preferences";
import type { DocumentRow, FolderRow } from "@/features/library/queries";
import {
  DocumentActions,
  FolderActions,
} from "@/components/library/library-forms";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function Breadcrumb({
  chain,
  currentName,
}: {
  chain: FolderRow[];
  currentName: string;
}) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex flex-wrap items-center gap-1 text-sm"
    >
      <Link href="/files" className="text-[#3159c9] hover:underline">
        My files
      </Link>
      {chain.map((folder) => (
        <span key={folder.id} className="flex items-center gap-1">
          <ChevronRight
            size={14}
            className="text-[#667389]"
            aria-hidden="true"
          />
          <Link
            href={`/files?folder=${folder.id}`}
            className="text-[#3159c9] hover:underline"
          >
            {folder.name}
          </Link>
        </span>
      ))}
      {currentName ? (
        <span className="flex items-center gap-1">
          <ChevronRight
            size={14}
            className="text-[#667389]"
            aria-hidden="true"
          />
          <span aria-current="page" className="font-medium text-[#202b3c]">
            {currentName}
          </span>
        </span>
      ) : null}
    </nav>
  );
}

function buildTree(folders: FolderRow[]): Map<string | null, FolderRow[]> {
  const tree = new Map<string | null, FolderRow[]>();
  for (const folder of folders) {
    const list = tree.get(folder.parent_id) ?? [];
    list.push(folder);
    tree.set(folder.parent_id, list);
  }
  return tree;
}

function TreeBranch({
  tree,
  parentId,
  currentFolderId,
  depth,
}: {
  tree: Map<string | null, FolderRow[]>;
  parentId: string | null;
  currentFolderId: string | null;
  depth: number;
}) {
  const children = tree.get(parentId) ?? [];
  if (children.length === 0) return null;
  return (
    <ul className={depth > 0 ? "ml-4 border-l border-[#dce3ec] pl-2" : ""}>
      {children.map((folder) => {
        const active = folder.id === currentFolderId;
        return (
          <li key={folder.id}>
            <Link
              href={`/files?folder=${folder.id}`}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                active
                  ? "bg-[#edf1f6] font-semibold text-[#17253b]"
                  : "text-[#202b3c] hover:bg-[#f4f6fa]"
              }`}
            >
              <Folder
                size={15}
                aria-hidden="true"
                className="shrink-0 text-[#667389]"
              />
              <span className="truncate">{folder.name}</span>
            </Link>
            <TreeBranch
              tree={tree}
              parentId={folder.id}
              currentFolderId={currentFolderId}
              depth={depth + 1}
            />
          </li>
        );
      })}
    </ul>
  );
}

export function FolderTree({
  folders,
  currentFolderId,
}: {
  folders: FolderRow[];
  currentFolderId: string | null;
}) {
  const tree = buildTree(folders);
  return (
    <nav aria-label="Folders" className="flex flex-col gap-1">
      <Link
        href="/files"
        aria-current={currentFolderId === null ? "page" : undefined}
        className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
          currentFolderId === null
            ? "bg-[#edf1f6] font-semibold text-[#17253b]"
            : "text-[#202b3c] hover:bg-[#f4f6fa]"
        }`}
      >
        <Folder
          size={15}
          aria-hidden="true"
          className="shrink-0 text-[#667389]"
        />
        All files
      </Link>
      <TreeBranch
        tree={tree}
        parentId={null}
        currentFolderId={currentFolderId}
        depth={0}
      />
    </nav>
  );
}

export function LibraryToolbar({
  folderId,
  query,
  sort,
  direction,
}: {
  folderId: string | null;
  query: string;
  sort: string;
  direction: string;
}) {
  return (
    <form
      method="get"
      action="/files"
      className="flex flex-wrap items-center gap-2"
    >
      {folderId ? <input type="hidden" name="folder" value={folderId} /> : null}
      <label className="sr-only" htmlFor="library-search">
        Search documents and folders
      </label>
      <input
        id="library-search"
        name="q"
        type="search"
        defaultValue={query}
        placeholder="Search by name"
        className="h-9 min-w-0 flex-1 rounded-lg border border-[#dce3ec] bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3159c9] sm:max-w-xs"
      />
      <label className="sr-only" htmlFor="library-sort">
        Sort by
      </label>
      <select
        id="library-sort"
        name="sort"
        defaultValue={sort}
        className="h-9 rounded-lg border border-[#dce3ec] bg-white px-2 text-sm"
      >
        <option value="name">Name</option>
        <option value="updated">Last modified</option>
        <option value="size">Size</option>
      </select>
      <label className="sr-only" htmlFor="library-direction">
        Sort direction
      </label>
      <select
        id="library-direction"
        name="dir"
        defaultValue={direction}
        className="h-9 rounded-lg border border-[#dce3ec] bg-white px-2 text-sm"
      >
        <option value="asc">Ascending</option>
        <option value="desc">Descending</option>
      </select>
      <button
        type="submit"
        className="inline-flex h-9 items-center rounded-lg bg-[#3159c9] px-3 text-sm font-medium text-white hover:bg-[#2a4cab] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3159c9]"
      >
        Search
      </button>
    </form>
  );
}

export function FolderGrid({
  folders,
  allFolders,
}: {
  folders: FolderRow[];
  allFolders: FolderRow[];
}) {
  if (folders.length === 0) return null;
  return (
    <section aria-label="Folders">
      <h2 className="mb-2 text-sm font-semibold text-[#202b3c]">Folders</h2>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {folders.map((folder) => (
          <li
            key={folder.id}
            className="rounded-xl border border-[#dce3ec] bg-white p-3"
          >
            <Link
              href={`/files?folder=${folder.id}`}
              className="flex items-center gap-2 font-medium text-[#202b3c] hover:text-[#3159c9]"
            >
              <Folder
                size={18}
                aria-hidden="true"
                className="shrink-0 text-[#667389]"
              />
              <span className="truncate">{folder.name}</span>
            </Link>
            <p className="mt-1 text-xs text-[#667389]">
              Modified {formatDate(folder.updated_at)}
            </p>
            <div className="mt-2">
              <FolderActions folder={folder} folders={allFolders} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export async function DocumentTable({
  documents,
  folders,
}: {
  documents: (DocumentRow & { starred: boolean })[];
  folders: FolderRow[];
}) {
  // The user's image-export preferences (from their profile) —
  // the "Export images" link is built from them. If the Day 24
  // migration has not been applied yet, the columns do not exist
  // and the defaults are used.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let preferences = withDefaultPreferences({});
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("image_export_format, image_export_dpi")
      .eq("id", user.id)
      .maybeSingle();
    preferences = withDefaultPreferences({
      imageExportFormat: profile?.image_export_format,
      imageExportDpi: profile?.image_export_dpi,
    });
  }
  if (documents.length === 0) return null;
  return (
    <section aria-label="Documents">
      <h2 className="mb-2 text-sm font-semibold text-[#202b3c]">Documents</h2>
      <ul className="flex flex-col gap-2">
        {documents.map((document) => (
          <li
            key={document.id}
            className="rounded-xl border border-[#dce3ec] bg-white p-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 items-start gap-2">
                <FileTypeIcon mimeType={document.mime_type} />
                <div className="min-w-0">
                  <p className="truncate font-medium text-[#202b3c]">
                    {document.title}
                  </p>
                  <p className="text-xs text-[#667389]">
                    {document.file_path
                      ? `${fileTypeLabel(document.mime_type)} · ${formatBytes(document.size_bytes)} · v${document.version} · `
                      : "Blank document — no file yet · "}
                    Modified {formatDate(document.updated_at)}
                  </p>
                </div>
              </div>
              <DocumentActions
                document={document}
                folders={folders}
                starred={document.starred}
                hasFile={document.file_path !== null}
                openHref={
                  document.file_path !== null &&
                  getEditorDocumentType(document.mime_type) !== null
                    ? `/editor/${document.id}`
                    : null
                }
                exportHref={
                  document.file_path !== null &&
                  isExportableToPdf(document.mime_type)
                    ? `/api/documents/${document.id}/export?format=pdf`
                    : null
                }
                pdfToolsHref={
                  document.file_path !== null &&
                  isPdfMimeType(document.mime_type)
                    ? `/documents/${document.id}/pdf-tools`
                    : null
                }
                pdfEditHref={
                  document.file_path !== null &&
                  isPdfMimeType(document.mime_type)
                    ? `/documents/${document.id}/pdf-edit`
                    : null
                }
                pdfAnnotateHref={
                  document.file_path !== null &&
                  isPdfMimeType(document.mime_type)
                    ? `/documents/${document.id}/pdf-annotate`
                    : null
                }
                pdfDrawHref={
                  document.file_path !== null &&
                  isPdfMimeType(document.mime_type)
                    ? `/documents/${document.id}/pdf-draw`
                    : null
                }
                pdfStampHref={
                  document.file_path !== null &&
                  isPdfMimeType(document.mime_type)
                    ? `/documents/${document.id}/pdf-stamp`
                    : null
                }
                pdfSecurityHref={
                  document.file_path !== null &&
                  isPdfMimeType(document.mime_type)
                    ? `/documents/${document.id}/pdf-security`
                    : null
                }
                extractTextHref={
                  document.file_path !== null &&
                  isPdfMimeType(document.mime_type)
                    ? `/api/documents/${document.id}/pdf/extract-text`
                    : null
                }
                exportImagesHref={
                  document.file_path !== null &&
                  isPdfMimeType(document.mime_type)
                    ? getExportImagesHref(document.id, preferences)
                    : null
                }
                versionsHref={
                  document.file_path !== null
                    ? `/documents/${document.id}/versions`
                    : null
                }
                shareHref={
                  document.file_path !== null
                    ? `/documents/${document.id}/share`
                    : null
                }
                notesHref={`/documents/${document.id}/notes`}
                pdfFormHref={
                  document.file_path !== null &&
                  isPdfMimeType(document.mime_type)
                    ? `/documents/${document.id}/pdf-form`
                    : null
                }
                pdfBuilderHref={
                  document.file_path !== null &&
                  isPdfMimeType(document.mime_type)
                    ? `/documents/${document.id}/pdf-builder`
                    : null
                }
                ocrHref={
                  document.file_path !== null &&
                  isOcrAcceptedMimeType(document.mime_type)
                    ? `/documents/${document.id}/ocr`
                    : null
                }
                convertHref={
                  document.file_path !== null &&
                  getConvertibleTargets(getEditorFileType(document.mime_type))
                    .length > 0
                    ? `/documents/${document.id}/convert`
                    : null
                }
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
