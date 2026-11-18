import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Breadcrumb, FolderTree } from "@/components/library/library-list";
import type { FolderRow } from "@/features/library/queries";

// The vitest config does not set globals, so testing-library's
// auto-cleanup is not registered — unmount between tests here.
afterEach(() => cleanup());

const folders: FolderRow[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    workspace_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    parent_id: null,
    name: "Reports",
    created_by: null,
    created_at: "2026-11-17T00:00:00Z",
    updated_at: "2026-11-17T00:00:00Z",
    deleted_at: null,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    workspace_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    parent_id: "11111111-1111-4111-8111-111111111111",
    name: "Q3",
    created_by: null,
    created_at: "2026-11-17T00:00:00Z",
    updated_at: "2026-11-17T00:00:00Z",
    deleted_at: null,
  },
];

describe("FolderTree", () => {
  it("renders nested folders with links", () => {
    render(<FolderTree folders={folders} currentFolderId={null} />);
    expect(screen.getByRole("link", { name: "All files" })).toHaveAttribute(
      "href",
      "/files"
    );
    expect(screen.getByRole("link", { name: "Reports" })).toHaveAttribute(
      "href",
      "/files?folder=11111111-1111-4111-8111-111111111111"
    );
    expect(screen.getByRole("link", { name: "Q3" })).toHaveAttribute(
      "href",
      "/files?folder=22222222-2222-4222-8222-222222222222"
    );
  });
});

describe("Breadcrumb", () => {
  it("renders the chain with the current folder last", () => {
    render(<Breadcrumb chain={[folders[0]]} currentName="Q3" />);
    expect(screen.getByRole("link", { name: "My files" })).toHaveAttribute(
      "href",
      "/files"
    );
    expect(screen.getByRole("link", { name: "Reports" })).toBeInTheDocument();
    expect(screen.getByText("Q3")).toHaveAttribute("aria-current", "page");
  });
});
