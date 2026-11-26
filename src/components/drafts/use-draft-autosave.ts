"use client";

// Draft auto-save hook (F35).
//
// Restores an unsent draft from local storage when the
// surface mounts (and reports when it was saved, so the
// UI can show "Draft restored"), then keeps the stored
// copy updated (debounced) as the value changes. Call
// clear() after the content is really saved.
import { useEffect, useRef, useState } from "react";
import {
  DRAFT_SAVE_DEBOUNCE_MS,
  clearDraft,
  readDraft,
  saveDraft,
} from "@/lib/draft-autosave";

export function useDraftAutosave({
  storageKey,
  value,
  onRestore,
}: {
  storageKey: string | null;
  value: string;
  onRestore: (text: string) => void;
}): {
  restoredAt: number | null;
  dismissRestored: () => void;
  clear: () => void;
} {
  const [restoredAt, setRestoredAt] = useState<number | null>(null);
  const hydratedRef = useRef(false);
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;

  // Restore once, on mount.
  useEffect(() => {
    if (!storageKey) return;
    const draft = readDraft(window.localStorage, storageKey, Date.now());
    if (draft) {
      onRestoreRef.current(draft.text);
      setRestoredAt(draft.savedAt);
    }
    hydratedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Save (debounced) as the value changes.
  useEffect(() => {
    if (!storageKey || !hydratedRef.current) return;
    const timer = window.setTimeout(() => {
      saveDraft(window.localStorage, storageKey, value, Date.now());
    }, DRAFT_SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [storageKey, value]);

  return {
    restoredAt,
    dismissRestored: () => setRestoredAt(null),
    clear: () => {
      if (storageKey) clearDraft(window.localStorage, storageKey);
      setRestoredAt(null);
    },
  };
}
