// PDF repair (F36) — server side.
//
// qpdf rebuilds a PDF's cross-reference tables and object
// streams when it copies a file, which repairs the common
// corruptions (broken xref, bad offsets, damaged object
// streams). Exit codes: 0 = the file was fine (the copy is
// still a clean rebuild), 3 = problems were found and
// fixed as far as possible (the output is valid; qpdf's
// messages say what was wrong), 2 = qpdf could not read
// the file at all.
import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { PdfEditError } from "@/lib/pdf-edit";
import { looksLikePdf } from "@/lib/pdf-tools";

const execFileAsync = promisify(execFile);

export interface RepairResult {
  bytes: Uint8Array;
  /** qpdf's own messages about what was wrong (exit 3). */
  warnings: string[];
  /** True when qpdf reported problems it repaired. */
  hadProblems: boolean;
  /** True when the rebuilt bytes differ from the input. */
  changed: boolean;
}

export async function repairPdfBytes(
  bytes: Uint8Array
): Promise<RepairResult> {
  const dir = await mkdtemp(join(tmpdir(), "forma-pdf-repair-"));
  const inputPath = join(dir, "input.pdf");
  const outputPath = join(dir, "output.pdf");
  try {
    await writeFile(inputPath, bytes);
    let exitCode = 0;
    let stderr = "";
    try {
      const result = await execFileAsync(
        process.env.QPDF_BIN?.trim() || "qpdf",
        [inputPath, outputPath],
        { timeout: 60_000, maxBuffer: 10 * 1024 * 1024 }
      );
      stderr = typeof result.stderr === "string" ? result.stderr : "";
    } catch (error) {
      const err = error as {
        code?: unknown;
        stderr?: unknown;
      } | null;
      if (err?.code === "ENOENT") {
        throw new PdfEditError(
          503,
          "PDF repair needs qpdf on the server — it is not installed."
        );
      }
      exitCode = typeof err?.code === "number" ? err.code : 2;
      stderr = typeof err?.stderr === "string" ? err.stderr : "";
    }
    const warnings = stderr
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("qpdf:"))
      .slice(0, 20);
    if (exitCode === 2) {
      throw new PdfEditError(
        400,
        "This PDF could not be repaired — qpdf cannot read it (it may be encrypted, or damaged beyond repair)." +
          (warnings[0] ? ` First problem: ${warnings[0]}` : "")
      );
    }
    if (exitCode !== 0 && exitCode !== 3) {
      throw new PdfEditError(500, "PDF repair failed unexpectedly.");
    }
    const output = new Uint8Array(await readFile(outputPath));
    if (!looksLikePdf(output)) {
      throw new PdfEditError(500, "Repair produced an invalid PDF.");
    }
    return {
      bytes: output,
      warnings,
      hadProblems: exitCode === 3,
      changed:
        output.length !== bytes.length ||
        !output.every((value, index) => value === bytes[index]),
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
