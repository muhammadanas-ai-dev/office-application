import { cn } from "@/lib/utils";

/** Pulsing placeholder block for loading states. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-lg bg-[#edf1f6]", className)}
      aria-hidden="true"
    />
  );
}

/** Loading placeholder for a workspace page: title line + content rows. */
export function PageSkeleton() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8" aria-label="Loading">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="mt-3 h-4 w-96 max-w-full" />
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <Skeleton className="mt-4 h-48" />
    </div>
  );
}
