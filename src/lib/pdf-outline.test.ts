import { describe, expect, it } from "vitest";
import {
  resolveOutline,
  type OutlineResolver,
  type RawOutlineItem,
} from "@/lib/pdf-outline";

const REF_A = { num: 10, gen: 0 };
const REF_B = { num: 22, gen: 0 };

const resolver: OutlineResolver = {
  async getDestination(id: string) {
    if (id === "chapter-2") return [REF_B, { name: "XYZ" }];
    return null;
  },
  async getPageIndex(ref: object) {
    if (ref === REF_A) return 0;
    if (ref === REF_B) return 4;
    throw new Error("unknown ref");
  },
};

describe("resolveOutline", () => {
  it("resolves page references, page numbers and named destinations", async () => {
    const items: RawOutlineItem[] = [
      { title: "Chapter 1", dest: [REF_A], items: [] },
      { title: "Chapter 2", dest: "chapter-2", items: [] },
      { title: "Appendix", dest: [7, { name: "Fit" }], items: [] },
    ];
    const resolved = await resolveOutline(resolver, items);
    expect(resolved.map((i) => i.page)).toEqual([1, 5, 8]);
    expect(resolved.map((i) => i.title)).toEqual([
      "Chapter 1",
      "Chapter 2",
      "Appendix",
    ]);
  });

  it("resolves children recursively", async () => {
    const items: RawOutlineItem[] = [
      {
        title: "Part I",
        dest: [REF_A],
        items: [{ title: "Section 1.1", dest: [REF_B], items: [] }],
      },
    ];
    const resolved = await resolveOutline(resolver, items);
    expect(resolved[0].children[0].page).toBe(5);
  });

  it("keeps unresolvable entries as page = null instead of failing", async () => {
    const items: RawOutlineItem[] = [
      { title: "External", dest: null, items: [] },
      { title: "Missing", dest: "nope", items: [] },
    ];
    const resolved = await resolveOutline(resolver, items);
    expect(resolved.map((i) => i.page)).toEqual([null, null]);
  });

  it("handles a null outline", async () => {
    expect(await resolveOutline(resolver, null)).toEqual([]);
  });
});
