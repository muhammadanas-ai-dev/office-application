import { describe, expect, it } from "vitest";
import {
  batchFileName,
  safeBatchBaseName,
} from "@/lib/pdf-batch";

describe("batch export naming (F28)", () => {
  it("strips the extension and unsafe characters", () => {
    expect(safeBatchBaseName("Quarterly Report.pdf")).toBe(
      "Quarterly Report"
    );
    expect(safeBatchBaseName('a/b:c*d?.pdf')).toBe("a b c d");
    expect(safeBatchBaseName("   ")).toBe("document");
  });

  it("builds the file name with the format extension", () => {
    const taken = new Set<string>();
    expect(batchFileName("Report.pdf", "xlsx", taken)).toBe("Report.xlsx");
    expect(batchFileName("Notes", "txt", taken)).toBe("Notes.txt");
  });

  it("de-duplicates names case-insensitively", () => {
    const taken = new Set<string>();
    expect(batchFileName("Report.pdf", "txt", taken)).toBe("Report.txt");
    expect(batchFileName("report.pdf", "txt", taken)).toBe("report (2).txt");
    expect(batchFileName("REPORT.pdf", "txt", taken)).toBe("REPORT (3).txt");
  });
});
