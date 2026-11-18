// PDF security (Day 20) — server-only qpdf wrapper.
//
// qpdf is the engine: it encrypts, decrypts and reports the
// encryption state. It works on files, so this module writes the
// input to a temp file, runs qpdf with a timeout, reads the
// output, and deletes both files in a `finally`. The passwords
// are passed to qpdf as command-line arguments and are never
// written to a file, a log, or the database — and this module
// never logs the qpdf command or its arguments.
//
// qpdf is a system binary (installed via apt). It does NOT
// survive a VM reset — reinstall it (`sudo apt-get install
// qpdf`) if the routes report it missing. The qpdf binary path
// comes from QPDF_BIN (env) or the default `qpdf` on PATH.
import "server-only";

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  parseShowEncryption,
  type PdfSecurityInfo,
  type SecurityPermissions,
} from "@/lib/pdf-security";

const execFileAsync = promisify(execFile);

const QPDF_TIMEOUT_MS = 60_000;
const QPDF_MAX_BUFFER_BYTES = 10 * 1024 * 1024;

export class PdfSecurityError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function qpdfBin(): string {
  return process.env.QPDF_BIN?.trim() || "qpdf";
}

/** Map a qpdf failure to a PdfSecurityError. A wrong password
 *  (exit code 2 + "invalid password") is a 400; a missing
 *  binary (ENOENT) is a 503; anything else is a 500. */
function toSecurityError(error: unknown, action: string): PdfSecurityError {
  const err = error as { code?: unknown; stderr?: unknown } | null;
  const code = err?.code;
  const stderr = typeof err?.stderr === "string" ? err.stderr : "";
  if (code === "ENOENT") {
    return new PdfSecurityError(
      503,
      "PDF security is unavailable — the qpdf tool is not installed on this server."
    );
  }
  if (code === 2 && stderr.includes("invalid password")) {
    return new PdfSecurityError(400, "The password is wrong.");
  }
  return new PdfSecurityError(500, `Could not ${action}.`);
}

/** Run qpdf on a temp input file and return the temp output
 *  file's bytes (or, for `--show-encryption`, the stdout).
 *  The temp directory is always removed. */
async function runQpdf(
  args: string[],
  inputBytes: Uint8Array,
  action: string
): Promise<{ stdout: string; outputBytes: Uint8Array | null }> {
  const dir = await mkdtemp(join(tmpdir(), "forma-pdf-security-"));
  const inputPath = join(dir, "input.pdf");
  const outputPath = join(dir, "output.pdf");
  try {
    await writeFile(inputPath, inputBytes);
    const { stdout } = await execFileAsync(
      qpdfBin(),
      [...args, inputPath, outputPath],
      {
        timeout: QPDF_TIMEOUT_MS,
        maxBuffer: QPDF_MAX_BUFFER_BYTES,
      }
    );
    let outputBytes: Uint8Array | null = null;
    try {
      outputBytes = new Uint8Array(await readFile(outputPath));
    } catch {
      // No output file (e.g. --show-encryption, which only prints).
    }
    return { stdout: stdout as string, outputBytes };
  } catch (error) {
    throw toSecurityError(error, action);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Run qpdf --show-encryption and return stdout only (it takes
 *  no output file). */
async function showEncryption(inputBytes: Uint8Array): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "forma-pdf-security-"));
  const inputPath = join(dir, "input.pdf");
  try {
    await writeFile(inputPath, inputBytes);
    const { stdout } = await execFileAsync(
      qpdfBin(),
      ["--show-encryption", inputPath],
      { timeout: QPDF_TIMEOUT_MS, maxBuffer: QPDF_MAX_BUFFER_BYTES }
    );
    return stdout as string;
  } catch (error) {
    throw toSecurityError(error, "read the PDF's security");
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Detect whether a PDF is encrypted and, if so, read its
 *  strength and permissions. */
export async function getPdfSecurity(
  bytes: Uint8Array
): Promise<PdfSecurityInfo> {
  const output = await showEncryption(bytes);
  return parseShowEncryption(output);
}

export interface ProtectOptions {
  userPassword: string;
  /** Defaults to the user password (so the user can always open
   *  with full permissions using the same password). */
  ownerPassword?: string;
  bits: 128 | 256;
  permissions: SecurityPermissions;
}

function permissionFlags(
  bits: 128 | 256,
  permissions: SecurityPermissions
): string[] {
  const flags: string[] = [];
  if (bits === 128) flags.push("--use-aes=y");
  flags.push(
    `--print=${permissions.print}`,
    `--extract=${permissions.extract ? "y" : "n"}`,
    `--modify=${permissions.modify === "all" ? "all" : permissions.modify === "partial" ? "annotate" : "none"}`,
    `--annotate=${permissions.annotate ? "y" : "n"}`
  );
  return flags;
}

/** Encrypt a PDF. Returns the encrypted bytes. The passwords are
 *  used only for this call and are never stored. */
export async function protectPdf(
  bytes: Uint8Array,
  options: ProtectOptions
): Promise<Uint8Array> {
  const userPassword = options.userPassword;
  const ownerPassword = options.ownerPassword?.trim()
    ? options.ownerPassword
    : userPassword;
  const args = [
    "--encrypt",
    `--user-password=${userPassword}`,
    `--owner-password=${ownerPassword}`,
    `--bits=${options.bits}`,
    ...permissionFlags(options.bits, options.permissions),
    "--",
  ];
  const { outputBytes } = await runQpdf(args, bytes, "protect this PDF");
  if (!outputBytes || outputBytes.length === 0) {
    throw new PdfSecurityError(500, "Could not protect this PDF.");
  }
  return outputBytes;
}

/** Decrypt a PDF with its password. Returns the unencrypted
 *  bytes. A wrong password throws a 400. */
export async function unlockPdf(
  bytes: Uint8Array,
  password: string
): Promise<Uint8Array> {
  const { outputBytes } = await runQpdf(
    ["--decrypt", `--password=${password}`],
    bytes,
    "unlock this PDF"
  );
  if (!outputBytes || outputBytes.length === 0) {
    throw new PdfSecurityError(500, "Could not unlock this PDF.");
  }
  return outputBytes;
}
