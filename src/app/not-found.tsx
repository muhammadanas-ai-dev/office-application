import { FileQuestion } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl items-center px-6 py-12">
      <div className="w-full">
        <EmptyState
          icon={FileQuestion}
          title="This page doesn't exist"
          description="The link may be mistyped, or the page may not have been built yet."
          action={
            <Link
              href="/"
              className="inline-flex h-10 items-center rounded-lg bg-[#3159c9] px-5 text-sm font-medium text-white"
            >
              Back to Forma Office home
            </Link>
          }
        />
      </div>
    </div>
  );
}
