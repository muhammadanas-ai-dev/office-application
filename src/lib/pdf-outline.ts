// PDF outline (bookmarks) resolution — pure helpers (F21).
//
// PDF.js returns an outline tree whose destinations are
// either named destinations (strings) or explicit arrays
// whose first entry is a page number or a page reference.
// This module resolves that tree to plain page numbers the
// viewer can navigate to. It depends only on a narrow
// structural interface, so it is unit-testable without a
// real PDF.

/** One outline (bookmark) entry, resolved to a page number. */
export interface OutlineItem {
  title: string;
  page: number | null;
  children: OutlineItem[];
}

/** The raw outline item shape PDF.js returns. */
export interface RawOutlineItem {
  title: string;
  dest: string | unknown[] | null;
  items: RawOutlineItem[];
}

/** The two PDF.js calls resolution needs. */
export interface OutlineResolver {
  getDestination(id: string): Promise<unknown[] | null>;
  getPageIndex(ref: object): Promise<number>;
}

/** Resolve a PDF.js outline tree to page numbers (F21). A
 *  destination is either a named destination (a string, looked
 *  up on the document) or an explicit array whose first entry
 *  is a page number or a page reference. Anything unresolvable
 *  keeps page = null and renders as plain text. */
export async function resolveOutline(
  pdf: OutlineResolver,
  items: RawOutlineItem[] | null
): Promise<OutlineItem[]> {
  const resolved: OutlineItem[] = [];
  for (const item of items ?? []) {
    let page: number | null = null;
    try {
      let dest: unknown = item.dest;
      if (typeof dest === "string") {
        dest = await pdf.getDestination(dest);
      }
      if (Array.isArray(dest) && dest.length > 0) {
        const ref: unknown = dest[0];
        if (typeof ref === "number") {
          page = ref + 1;
        } else if (ref !== null && typeof ref === "object") {
          page =
            (await pdf.getPageIndex(
              ref as object
            )) + 1;
        }
      }
    } catch {
      page = null;
    }
    resolved.push({
      title: item.title,
      page,
      children: await resolveOutline(pdf, item.items),
    });
  }
  return resolved;
}
