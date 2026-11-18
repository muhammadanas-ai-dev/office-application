import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FileText } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

describe("EmptyState", () => {
  it("renders its title and description", () => {
    render(
      <EmptyState
        icon={FileText}
        title="No documents yet"
        description="Create your first document to see it here."
      />
    );
    expect(screen.getByText("No documents yet")).toBeInTheDocument();
    expect(
      screen.getByText("Create your first document to see it here.")
    ).toBeInTheDocument();
  });

  it("renders an action when one is provided", () => {
    render(
      <EmptyState
        icon={FileText}
        title="No documents yet"
        description="Create your first document to see it here."
        action={<button type="button">Create a document</button>}
      />
    );
    expect(
      screen.getByRole("button", { name: "Create a document" })
    ).toBeInTheDocument();
  });
});
