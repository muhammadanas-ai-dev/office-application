// ONLYOFFICE DocEditor host (Day 5) — client component.
//
// Loads the document server's api.js in the browser and instantiates
// DocsAPI.DocEditor with the signed config the server page minted.
// If the script cannot load, or the editor fails to start, the page
// shows an error — never a fake editor.
"use client";

import { useEffect, useRef, useState } from "react";
import { logError } from "@/lib/log";

declare global {
  interface Window {
    DocsAPI?: {
      DocEditor: new (
        placeholderId: string,
        config: Record<string, unknown>
      ) => { destroy?: () => void };
    };
  }
}

export function EditorClient({
  docServerUrl,
  config,
  token,
}: {
  docServerUrl: string;
  config: Record<string, unknown>;
  token: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let editor: { destroy?: () => void } | undefined;
    let cancelled = false;
    const script = document.createElement("script");
    script.src = `${docServerUrl.replace(/\/$/, "")}/web-apps/apps/api/documents/api.js`;
    script.async = true;
    script.onload = () => {
      if (cancelled) return;
      if (!window.DocsAPI) {
        setError("The document server did not provide an editor.");
        return;
      }
      try {
        editor = new window.DocsAPI.DocEditor("forma-editor", {
          ...config,
          token,
          width: "100%",
          height: "100%",
        });
      } catch (err) {
        logError("editor", err);
        setError("The editor failed to start.");
      }
    };
    script.onerror = () => {
      if (!cancelled) {
        setError(
          "Could not reach the document server. Check that it is running and reachable from this browser."
        );
      }
    };
    document.body.appendChild(script);
    return () => {
      cancelled = true;
      editor?.destroy?.();
      script.remove();
    };
    // The config is minted once per page load; do not re-init.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-[#f5c6cb] bg-[#fdecea] p-4 text-sm text-[#7a1f1f]"
      >
        <p className="font-semibold">The editor could not start</p>
        <p className="mt-1">{error}</p>
      </div>
    );
  }

  return (
    <div
      id="forma-editor"
      ref={containerRef}
      className="min-h-[480px] flex-1 rounded-xl border border-[#dce3ec] bg-white"
      style={{ height: "calc(100dvh - 11rem)" }}
    />
  );
}
