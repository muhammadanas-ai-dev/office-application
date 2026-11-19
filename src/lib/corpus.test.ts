// Compatibility test corpus (Day 26) — unit tests for the
// pure manifest module.
import { describe, expect, it } from "vitest";
import {
  CorpusManifestError,
  checksForFile,
  formatCorpusResult,
  formatCorpusSummary,
  isCorpusCheck,
  needsDocserver,
  parseCorpusManifest,
  summariseCorpusResults,
  type CorpusFile,
  type CorpusManifest,
} from "@/lib/corpus";

function validManifest(): CorpusManifest {
  return {
    version: 1,
    files: [
      {
        id: "docx-rich",
        file: "docx-rich.docx",
        format: "docx",
        title: "Rich Word document",
        features: ["table", "image", "header"],
        checks: ["upload", "pdf-export", "round-trip"],
      },
      {
        id: "pdf-protected",
        file: "pdf-protected.pdf",
        format: "pdf",
        title: "Password-protected PDF",
        features: ["password-protected"],
        checks: ["upload", "security"],
        password: "corpus123",
      },
      {
        id: "image-png",
        file: "image.png",
        format: "png",
        title: "Text image",
        features: ["text"],
        checks: ["upload", "ocr", "images-to-pdf"],
        expectedText: "Forma Office",
      },
    ],
  };
}

describe("isCorpusCheck", () => {
  it("accepts every known check", () => {
    for (const check of [
      "upload",
      "pdf-tools",
      "ocr",
      "security",
      "corrupt",
      "images-to-pdf",
      "pdf-export",
      "round-trip",
      "page-count",
    ]) {
      expect(isCorpusCheck(check)).toBe(true);
    }
  });

  it("rejects unknown checks and non-strings", () => {
    expect(isCorpusCheck("edit")).toBe(false);
    expect(isCorpusCheck("")).toBe(false);
    expect(isCorpusCheck(42)).toBe(false);
    expect(isCorpusCheck(null)).toBe(false);
  });
});

describe("needsDocserver", () => {
  it("is true only for pdf-export and round-trip", () => {
    expect(needsDocserver("pdf-export")).toBe(true);
    expect(needsDocserver("round-trip")).toBe(true);
    expect(needsDocserver("upload")).toBe(false);
    expect(needsDocserver("pdf-tools")).toBe(false);
    expect(needsDocserver("ocr")).toBe(false);
  });
});

describe("parseCorpusManifest", () => {
  it("accepts the real committed manifest (corpus/manifest.json)", async () => {
    // The generator writes the manifest, so the committed file
    // must always parse. This test fails if the generator and
    // the module ever disagree about the format.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const raw = fs.readFileSync(
      path.join(process.cwd(), "corpus", "manifest.json"),
      "utf-8"
    );
    const manifest = parseCorpusManifest(JSON.parse(raw));
    expect(manifest.version).toBe(1);
    expect(manifest.files.length).toBeGreaterThan(0);
    // Every file in the manifest must exist in corpus/.
    for (const file of manifest.files) {
      expect(
        fs.existsSync(path.join(process.cwd(), "corpus", file.file)),
        `missing corpus file: ${file.file}`
      ).toBe(true);
    }
  });

  it("accepts a valid manifest and returns it unchanged", () => {
    const manifest = validManifest();
    expect(parseCorpusManifest(manifest)).toEqual(manifest);
  });

  it("rejects a non-object", () => {
    expect(() => parseCorpusManifest(null)).toThrow(CorpusManifestError);
    expect(() => parseCorpusManifest("x")).toThrow(CorpusManifestError);
    expect(() => parseCorpusManifest([])).toThrow(CorpusManifestError);
  });

  it("rejects an unsupported version", () => {
    const manifest = { ...validManifest(), version: 2 };
    expect(() => parseCorpusManifest(manifest)).toThrow(
      /Unsupported manifest version/
    );
  });

  it("rejects an empty files list", () => {
    const manifest = { version: 1, files: [] };
    expect(() => parseCorpusManifest(manifest)).toThrow(/at least one file/);
  });

  it("rejects a duplicate file id", () => {
    const manifest = validManifest();
    manifest.files.push({ ...manifest.files[0] });
    expect(() => parseCorpusManifest(manifest)).toThrow(/Duplicate file id/);
  });

  it("rejects a file name with a path separator", () => {
    const manifest = validManifest();
    manifest.files[0] = { ...manifest.files[0], file: "../secret.txt" };
    expect(() => parseCorpusManifest(manifest)).toThrow(
      /must not contain a path/
    );
  });

  it("rejects an unknown check", () => {
    const manifest = validManifest();
    manifest.files[0] = {
      ...manifest.files[0],
      checks: ["upload", "edit"] as never,
    };
    expect(() => parseCorpusManifest(manifest)).toThrow(
      /at least one known check/
    );
  });

  it("rejects a file with no checks", () => {
    const manifest = validManifest();
    manifest.files[0] = { ...manifest.files[0], checks: [] };
    expect(() => parseCorpusManifest(manifest)).toThrow(
      /at least one known check/
    );
  });

  it("rejects a missing id, file, format or title", () => {
    const manifest = validManifest();
    for (const field of ["id", "file", "format", "title"] as const) {
      const bad = validManifest();
      bad.files[0] = { ...bad.files[0], [field]: "" };
      expect(() => parseCorpusManifest(bad)).toThrow(CorpusManifestError);
    }
    expect(manifest.files[0].id).toBe("docx-rich");
  });
});

describe("checksForFile", () => {
  it("returns the file's checks in order", () => {
    const file: CorpusFile = validManifest().files[0];
    expect(checksForFile(file)).toEqual(["upload", "pdf-export", "round-trip"]);
  });
});

describe("formatCorpusResult and summariseCorpusResults", () => {
  it("formats pass, fail and skip lines", () => {
    expect(
      formatCorpusResult({
        fileId: "docx-rich",
        check: "upload",
        status: "pass",
      })
    ).toBe("PASS  docx-rich  upload");
    expect(
      formatCorpusResult({
        fileId: "pdf-protected",
        check: "security",
        status: "fail",
        detail: "the password was refused",
      })
    ).toBe("FAIL  pdf-protected  security — the password was refused");
    expect(
      formatCorpusResult({
        fileId: "docx-rich",
        check: "round-trip",
        status: "skip",
        detail: "docserver down",
      })
    ).toBe("SKIP  docx-rich  round-trip — docserver down");
  });

  it("counts a run and formats the summary", () => {
    const results = [
      { fileId: "a", check: "upload", status: "pass" },
      { fileId: "a", check: "ocr", status: "pass" },
      { fileId: "b", check: "upload", status: "fail" },
      { fileId: "b", check: "round-trip", status: "skip" },
    ] as const;
    const summary = summariseCorpusResults([...results]);
    expect(summary).toEqual({ pass: 2, fail: 1, skip: 1, total: 4 });
    expect(formatCorpusSummary(summary)).toBe("2/4 checks passed (1 skipped)");
  });

  it("omits the skipped note when nothing was skipped", () => {
    expect(formatCorpusSummary({ pass: 3, fail: 0, skip: 0, total: 3 })).toBe(
      "3/3 checks passed"
    );
  });
});
