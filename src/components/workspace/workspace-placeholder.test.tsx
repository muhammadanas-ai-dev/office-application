import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FolderOpen } from "lucide-react";
import { WorkspacePlaceholder } from "@/components/workspace/workspace-placeholder";

describe("WorkspacePlaceholder", () => {
  it("states the area title and the day it lands", () => {
    render(
      <WorkspacePlaceholder
        icon={FolderOpen}
        title="My files"
        description="Your private document library."
        comingDay="on Day 4"
      />
    );
    expect(
      screen.getByRole("heading", { name: "My files" })
    ).toBeInTheDocument();
    expect(screen.getByText("My files is coming on Day 4")).toBeInTheDocument();
    expect(
      screen.getByText("Your private document library.")
    ).toBeInTheDocument();
  });
});
