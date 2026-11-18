// Read model for the document library (Day 4).
//
// All reads go through the signed-in user's server client, so RLS
// decides what is visible. A missing-table error (PGRST205) means
// the Day 3/Day 4 migrations have not been applied yet — pages turn
// that into an honest "setup pending" state instead of crashing.
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export type LibraryClient = SupabaseClient<Database>;

export type WorkspaceRow = Database["public"]["Tables"]["workspaces"]["Row"];
export type FolderRow = Database["public"]["Tables"]["folders"]["Row"];
export type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];

export class LibraryNotReady extends Error {
  constructor() {
    super("Library tables are not set up yet");
    this.name = "LibraryNotReady";
  }
}

export function isMissingTableError(error: { code?: string } | null): boolean {
  return error?.code === "PGRST205";
}

/** The user's first workspace: personal first, then oldest. */
export async function getCurrentWorkspace(
  supabase: LibraryClient,
  userId: string
): Promise<WorkspaceRow | null> {
  const { data, error } = await supabase
    .from("workspaces")
    .select("*")
    .eq("owner_id", userId)
    .order("is_personal", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) {
    if (isMissingTableError(error)) throw new LibraryNotReady();
    throw new Error(`Could not load the workspace: ${error.message}`);
  }
  return data?.[0] ?? null;
}

/** The user's role in a workspace (owner/admin/editor/...). */
export async function getUserRole(
  supabase: LibraryClient,
  workspaceId: string,
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) {
    if (isMissingTableError(error)) throw new LibraryNotReady();
    throw new Error(`Could not load your role: ${error.message}`);
  }
  return data?.role ?? null;
}

export type LibrarySort = "name" | "updated" | "size";
export type SortDirection = "asc" | "desc";

export interface FolderContents {
  folders: FolderRow[];
  documents: (DocumentRow & { starred: boolean })[];
}

/** The user's starred document ids (one small query, merged in JS). */
async function starredDocumentIds(
  supabase: LibraryClient,
  userId: string
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("document_stars")
    .select("document_id")
    .eq("user_id", userId);
  if (error) {
    if (isMissingTableError(error)) throw new LibraryNotReady();
    throw new Error(`Could not list starred documents: ${error.message}`);
  }
  return new Set((data ?? []).map((row) => row.document_id));
}

/** Folders + documents inside one folder (null = workspace root). */
export async function listFolderContents(
  supabase: LibraryClient,
  workspaceId: string,
  folderId: string | null,
  options: {
    query?: string;
    sort?: LibrarySort;
    direction?: SortDirection;
    userId: string;
  }
): Promise<FolderContents> {
  const { query, sort = "name", direction = "asc", userId } = options;

  let folderQuery = supabase
    .from("folders")
    .select("*")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);
  folderQuery =
    folderId === null
      ? folderQuery.is("parent_id", null)
      : folderQuery.eq("parent_id", folderId);
  if (query) folderQuery = folderQuery.ilike("name", `%${query}%`);
  const { data: folders, error: folderError } = await folderQuery.order(
    "name",
    { ascending: direction === "asc" }
  );
  if (folderError) {
    if (isMissingTableError(folderError)) throw new LibraryNotReady();
    throw new Error(`Could not list folders: ${folderError.message}`);
  }

  const orderColumn =
    sort === "updated"
      ? "updated_at"
      : sort === "size"
        ? "size_bytes"
        : "title";
  let docQuery = supabase
    .from("documents")
    .select("*")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);
  docQuery =
    folderId === null
      ? docQuery.is("folder_id", null)
      : docQuery.eq("folder_id", folderId);
  if (query) docQuery = docQuery.ilike("title", `%${query}%`);
  const { data: documents, error: docError } = await docQuery.order(
    orderColumn,
    { ascending: direction === "asc", nullsFirst: false }
  );
  if (docError) {
    if (isMissingTableError(docError)) throw new LibraryNotReady();
    throw new Error(`Could not list documents: ${docError.message}`);
  }

  const starred = await starredDocumentIds(supabase, userId);
  return {
    folders: folders ?? [],
    documents: (documents ?? []).map((row) => ({
      ...row,
      starred: starred.has(row.id),
    })),
  };
}

/** All folders in a workspace, for the folder tree and move targets. */
export async function listAllFolders(
  supabase: LibraryClient,
  workspaceId: string
): Promise<FolderRow[]> {
  const { data, error } = await supabase
    .from("folders")
    .select("*")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("name", { ascending: true });
  if (error) {
    if (isMissingTableError(error)) throw new LibraryNotReady();
    throw new Error(`Could not list folders: ${error.message}`);
  }
  return data ?? [];
}

/** Breadcrumb chain for a folder: root first, the folder last. */
export async function getFolderBreadcrumb(
  supabase: LibraryClient,
  workspaceId: string,
  folderId: string
): Promise<FolderRow[]> {
  const chain: FolderRow[] = [];
  let currentId: string | null = folderId;
  for (let depth = 0; depth < 20 && currentId; depth += 1) {
    // Explicit result type: supabase-js's inferred query type loops
    // here (TS7022) — the same select() infers fine elsewhere.
    const {
      data,
      error,
    }: { data: FolderRow | null; error: PostgrestError | null } = await supabase
      .from("folders")
      .select("*")
      .eq("id", currentId)
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) {
      if (isMissingTableError(error)) throw new LibraryNotReady();
      throw new Error(`Could not load the folder: ${error.message}`);
    }
    if (!data) break;
    chain.unshift(data);
    currentId = data.parent_id;
  }
  return chain;
}

/** Newest documents across the workspace. */
export async function listRecentDocuments(
  supabase: LibraryClient,
  workspaceId: string,
  userId: string,
  limit = 10
): Promise<(DocumentRow & { starred: boolean })[]> {
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (isMissingTableError(error)) throw new LibraryNotReady();
    throw new Error(`Could not list recent documents: ${error.message}`);
  }
  const starred = await starredDocumentIds(supabase, userId);
  return (data ?? []).map((row) => ({
    ...row,
    starred: starred.has(row.id),
  }));
}

/** Documents the user starred in this workspace. */
export async function listStarredDocuments(
  supabase: LibraryClient,
  workspaceId: string,
  userId: string
): Promise<DocumentRow[]> {
  const { data, error } = await supabase
    .from("document_stars")
    .select("documents!inner(*)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingTableError(error)) throw new LibraryNotReady();
    throw new Error(`Could not list starred documents: ${error.message}`);
  }
  return (data ?? [])
    .map((row) => row.documents)
    .filter(
      (doc): doc is DocumentRow =>
        !!doc && doc.workspace_id === workspaceId && doc.deleted_at === null
    );
}

/** Soft-deleted folders and documents (the Trash page). */
export async function listTrash(
  supabase: LibraryClient,
  workspaceId: string
): Promise<{ folders: FolderRow[]; documents: DocumentRow[] }> {
  const { data: folders, error: folderError } = await supabase
    .from("folders")
    .select("*")
    .eq("workspace_id", workspaceId)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });
  if (folderError) {
    if (isMissingTableError(folderError)) throw new LibraryNotReady();
    throw new Error(`Could not list trash: ${folderError.message}`);
  }
  const { data: documents, error: docError } = await supabase
    .from("documents")
    .select("*")
    .eq("workspace_id", workspaceId)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });
  if (docError) {
    if (isMissingTableError(docError)) throw new LibraryNotReady();
    throw new Error(`Could not list trash: ${docError.message}`);
  }
  return { folders: folders ?? [], documents: documents ?? [] };
}

/** One document, only if it belongs to this workspace. */
export async function getDocumentInWorkspace(
  supabase: LibraryClient,
  workspaceId: string,
  documentId: string
): Promise<DocumentRow | null> {
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) {
    if (isMissingTableError(error)) throw new LibraryNotReady();
    throw new Error(`Could not load the document: ${error.message}`);
  }
  return data;
}

/** Counts for the Home page. */
export async function getWorkspaceCounts(
  supabase: LibraryClient,
  workspaceId: string
): Promise<{ documents: number; folders: number }> {
  const { count: docCount, error: docError } = await supabase
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);
  if (docError) {
    if (isMissingTableError(docError)) throw new LibraryNotReady();
    throw new Error(`Could not count documents: ${docError.message}`);
  }
  const { count: folderCount, error: folderError } = await supabase
    .from("folders")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);
  if (folderError) {
    if (isMissingTableError(folderError)) throw new LibraryNotReady();
    throw new Error(`Could not count folders: ${folderError.message}`);
  }
  return { documents: docCount ?? 0, folders: folderCount ?? 0 };
}
