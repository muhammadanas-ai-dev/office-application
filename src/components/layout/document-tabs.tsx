// The open-document tab strip (Day 28) — a client component
// rendered in the app shell, above the page content.
//
// It shows the documents the user has opened (from localStorage),
// newest first, with the active one highlighted. Clicking a tab
// navigates to that document's editor. The close button removes
// the tab. The strip only renders when there is at least one
// open document.
//
// The list is refreshed when a document page registers itself
// (the `forma:tabs-changed` event) or when another tab changes
// localStorage (the `storage` event). The active tab is the
// document id in the current URL.
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import {
  OPEN_DOCUMENTS_KEY,
  addTab,
  closeTab,
  documentIdFromPath,
  parseTabs,
  serializeTabs,
  type OpenDocumentTab,
} from "@/lib/document-tabs";

export const TABS_CHANGED_EVENT = "forma:tabs-changed";

export function DocumentTabs() {
  const pathname = usePathname();
  const [tabs, setTabs] = useState<OpenDocumentTab[]>([]);

  const load = useCallback(() => {
    try {
      setTabs(parseTabs(window.localStorage.getItem(OPEN_DOCUMENTS_KEY)));
    } catch {
      setTabs([]);
    }
  }, []);

  useEffect(() => {
    load();
    window.addEventListener(TABS_CHANGED_EVENT, load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener(TABS_CHANGED_EVENT, load);
      window.removeEventListener("storage", load);
    };
  }, [load]);

  function onClose(id: string) {
    const next = closeTab(tabs, id);
    setTabs(next);
    try {
      window.localStorage.setItem(OPEN_DOCUMENTS_KEY, serializeTabs(next));
    } catch {
      // localStorage is unavailable — the tab just stays.
    }
    window.dispatchEvent(new Event(TABS_CHANGED_EVENT));
  }

  if (tabs.length === 0) return null;
  const activeId = documentIdFromPath(pathname);

  return (
    <nav
      aria-label="Open documents"
      className="flex items-center gap-1 overflow-x-auto border-b border-[#dce3ec] bg-white px-3 py-1.5"
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <span
            key={tab.id}
            className={
              active
                ? "flex shrink-0 items-center gap-1 rounded-md bg-[#edf1fd] px-2 py-1 text-sm font-medium text-[#3159c9]"
                : "flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm text-[#5b6b7f] hover:bg-[#f2f5f8]"
            }
          >
            <Link href={`/editor/${tab.id}`} title={tab.title}>
              <span className="block max-w-40 truncate">{tab.title}</span>
            </Link>
            <button
              type="button"
              aria-label={`Close ${tab.title}`}
              onClick={() => onClose(tab.id)}
              className="rounded p-0.5 text-[#667389] hover:bg-white hover:text-[#202b3c]"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </span>
        );
      })}
    </nav>
  );
}

/**
 * Register a document as open (Day 28) — rendered by the
 * editor page with the document id + title. It adds the
 * document to the localStorage tab list (newest first) and
 * notifies the tab strip. It renders nothing.
 */
export function RegisterOpenDocument({
  id,
  title,
}: {
  id: string;
  title: string;
}) {
  useEffect(() => {
    try {
      const current = parseTabs(
        window.localStorage.getItem(OPEN_DOCUMENTS_KEY)
      );
      const next = addTab(current, { id, title });
      window.localStorage.setItem(OPEN_DOCUMENTS_KEY, serializeTabs(next));
    } catch {
      // localStorage is unavailable — no tabs.
    }
    window.dispatchEvent(new Event(TABS_CHANGED_EVENT));
  }, [id, title]);
  return null;
}
