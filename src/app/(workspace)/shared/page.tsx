import type { Metadata } from "next";
import { Users } from "lucide-react";
import { WorkspacePlaceholder } from "@/components/workspace/workspace-placeholder";

export const metadata: Metadata = {
  title: "Shared with me — Forma Office",
};

export default function SharedPage() {
  return (
    <WorkspacePlaceholder
      icon={Users}
      title="Shared with me"
      description="Documents other people shared with you, with your viewer, commenter or editor role on each."
      comingDay="on Day 10"
    />
  );
}
