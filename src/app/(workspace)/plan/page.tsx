import type { Metadata } from "next";
import { CreditCard } from "lucide-react";
import { WorkspacePlaceholder } from "@/components/workspace/workspace-placeholder";

export const metadata: Metadata = {
  title: "Plan and usage — Forma Office",
};

export default function PlanPage() {
  return (
    <WorkspacePlaceholder
      icon={CreditCard}
      title="Plan and usage"
      description="Your plan, storage usage and feature limits — enforced on the server, not just shown here."
      comingDay="on Day 13"
    />
  );
}
