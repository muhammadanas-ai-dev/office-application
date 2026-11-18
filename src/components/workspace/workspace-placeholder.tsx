import type { LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

type WorkspacePlaceholderProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Roadmap day this area is implemented on. */
  comingDay: string;
};

/**
 * Honest placeholder for a workspace area that is not built yet.
 * It is a real page (so navigation is never dead), and it states
 * plainly what will live here and when.
 */
export function WorkspacePlaceholder({
  icon,
  title,
  description,
  comingDay,
}: WorkspacePlaceholderProps) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold text-[#17253b]">{title}</h1>
      <p className="mt-1 text-sm text-[#667389]">{description}</p>
      <div className="mt-6">
        <EmptyState
          icon={icon}
          title={`${title} is coming ${comingDay}`}
          description="This area is part of the 15-day Forma Office plan. Nothing here is faked — it will appear when its day lands."
        />
      </div>
    </div>
  );
}
