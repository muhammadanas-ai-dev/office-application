// PDF security (Day 20) — pure helpers.
//
// This module parses qpdf's `--show-encryption` output and
// detects an encrypted PDF. It does NOT call qpdf (that is the
// server module, `pdf-security.server.ts`, which shells out to
// the qpdf binary). Nothing here touches the filesystem or a
// network, so it is safe to import from anywhere, including
// tests.
import { PDFDocument } from "pdf-lib";

/** The four permissions the protect form offers. */
export interface SecurityPermissions {
  /** Printing: full (low + high resolution), low only, or none. */
  print: "none" | "low" | "full";
  /** Copying text / graphics out of the PDF. */
  extract: boolean;
  /** Editing: all, some kinds only, or none. */
  modify: "none" | "partial" | "all";
  /** Commenting / annotating. */
  annotate: boolean;
}

export type PdfSecurityInfo =
  | { encrypted: false }
  | {
      encrypted: true;
      /** The key length in bits (40, 128 or 256). */
      bits: 40 | 128 | 256;
      /** The R value from the encryption dictionary (6 = AES-256). */
      r: number;
      /** The P bitmask from the encryption dictionary. */
      p: number;
      permissions: SecurityPermissions;
    };

export const DEFAULT_SECURITY_PERMISSIONS: SecurityPermissions = {
  print: "full",
  extract: true,
  modify: "all",
  annotate: true,
};

/** Parse qpdf's `--show-encryption` output into the security
 *  info. A plain PDF prints "File is not encrypted". An
 *  encrypted one prints `R = 6`, `P = -1340` and the permission
 *  lines (readable without a password — the "Incorrect password
 *  supplied" warning line is ignored). */
export function parseShowEncryption(output: string): PdfSecurityInfo {
  if (output.includes("File is not encrypted")) {
    return { encrypted: false };
  }
  const rMatch = output.match(/^R = (\d+)$/m);
  const pMatch = output.match(/^P = (-?\d+)$/m);
  if (!rMatch || !pMatch) {
    // Not the output we expected — treat it as unencrypted
    // rather than guessing (the caller shows the raw state).
    return { encrypted: false };
  }
  const r = Number(rMatch[1]);
  const p = Number(pMatch[1]);
  const bits: 40 | 128 | 256 =
    r === 5 || r === 6 ? 256 : r === 3 || r === 4 ? 128 : 40;

  const allowed = (label: string) =>
    new RegExp(`^${label}: allowed$`, "m").test(output);
  const printLow = allowed("print low resolution");
  const printHigh = allowed("print high resolution");
  const print: SecurityPermissions["print"] =
    printLow && printHigh ? "full" : printLow ? "low" : "none";
  const extract = allowed("extract for any purpose");
  const modifyAnything = allowed("modify anything");
  const modifySome =
    allowed("modify document assembly") ||
    allowed("modify forms") ||
    allowed("modify annotations") ||
    allowed("modify other");
  const modify: SecurityPermissions["modify"] = modifyAnything
    ? "all"
    : modifySome
      ? "partial"
      : "none";
  const annotate = allowed("modify annotations");

  return {
    encrypted: true,
    bits,
    r,
    p,
    permissions: { print, extract, modify, annotate },
  };
}

/** Detect whether a PDF is encrypted, by trying to load it with
 *  pdf-lib. pdf-lib throws a specific error for an encrypted
 *  document ("Input document to `PDFDocument.load` is encrypted").
 *  A corrupt PDF throws a different error and is reported as not
 *  encrypted (it is not — it is broken). */
export async function isEncryptedPdf(bytes: Uint8Array): Promise<boolean> {
  try {
    await PDFDocument.load(bytes);
    return false;
  } catch (error) {
    return error instanceof Error && error.message.includes("is encrypted");
  }
}
