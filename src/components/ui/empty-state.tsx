import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Optional action (button or link) shown under the description. */
  action?: ReactNode;
};

/** Centered empty state used for empty lists and not-yet-built areas. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-[#dce3ec] bg-white px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#edf1f6] text-[#3159c9]">
        <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-base font-semibold text-[#17253b]">{title}</h2>
      <p className="mt-1 max-w-sm text-sm text-[#667389]">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
