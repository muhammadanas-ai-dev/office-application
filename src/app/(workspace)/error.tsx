"use client";

import { TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { logError } from "@/lib/log";

export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logError("workspace error", error.message, { digest: error.digest });
  }, [error]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <EmptyState
        icon={TriangleAlert}
        title="This workspace page could not be loaded"
        description="Try again. If it keeps failing, return to Home and report what you were doing."
        action={
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-10 items-center rounded-lg bg-[#3159c9] px-5 text-sm font-medium text-white"
          >
            Try again
          </button>
        }
      />
    </div>
  );
}
