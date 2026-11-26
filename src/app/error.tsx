"use client";

import { TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { logError } from "@/lib/log";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to the console for debugging. Never log document
    // contents, tokens or secrets here.
    logError("app error", error.message, { digest: error.digest });
  }, [error]);

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl items-center px-6 py-12">
      <div className="w-full">
        <EmptyState
          icon={TriangleAlert}
          title="Something went wrong"
          description="The page could not be loaded. Your documents are safe — this is a display error, not a data loss."
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
    </div>
  );
}
