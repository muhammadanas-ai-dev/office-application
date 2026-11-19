// Open-document tabs (Day 28) — the pure helpers.
//
// The tab strip shows the documents the user has opened, with
// the active one highlighted. The open list is stored in
// localStorage (per browser — it is a UI preference, not
// shared data), under OPEN_DOCUMENTS_KEY. The editor is an
// ONLYOFFICE iframe, so switching tabs reloads the editor —
// the tabs are navigation, not kept-alive editors.
//
// The list holds at most MAX_TABS entries; opening an 11th
// document drops the oldest one. A tab's title is the document
// title at the time it was opened (it does not live-update if
// the document is renamed elsewhere).
export const OPEN_DOCUMENTS_KEY = "forma-open-documents";
export const MAX_TABS = 10;

export interface OpenDocumentTab {
  id: string;
  title: string;
}

/** Parse the stored tab list (from localStorage). Anything
 *  malformed or not an array of {id, title} is ignored. */
export function parseTabs(value: unknown): OpenDocumentTab[] {
  if (typeof value !== "string") return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(
      (entry): entry is OpenDocumentTab =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as { id?: unknown }).id === "string" &&
        typeof (entry as { title?: unknown }).title === "string"
    )
    .slice(0, MAX_TABS);
}

/** Serialise the tab list for localStorage. */
export function serializeTabs(tabs: OpenDocumentTab[]): string {
  return JSON.stringify(tabs);
}

/**
 * Add a document to the tab list (or move it to the front if
 * it is already open). The newest tab is first. The list is
 * capped at MAX_TABS — the oldest drops off.
 */
export function addTab(
  tabs: OpenDocumentTab[],
  tab: OpenDocumentTab
): OpenDocumentTab[] {
  const rest = tabs.filter((t) => t.id !== tab.id);
  return [tab, ...rest].slice(0, MAX_TABS);
}

/** Close a tab (remove it from the list). */
export function closeTab(
  tabs: OpenDocumentTab[],
  id: string
): OpenDocumentTab[] {
  return tabs.filter((t) => t.id !== id);
}

/**
 * The document id in the current pathname, if the page is a
 * document page: the editor (`/editor/[id]`) or a tool page
 * (`/documents/[id]/...`). Anything else returns null.
 */
export function documentIdFromPath(pathname: string): string | null {
  const editor = pathname.match(/^\/editor\/([^/]+)$/);
  if (editor) return editor[1];
  const tool = pathname.match(/^\/documents\/([^/]+)\//);
  if (tool) return tool[1];
  return null;
}
