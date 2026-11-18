// Unit tests for PDF security (Day 20) — the parser and the
// encryption detector. These tests are hermetic: the parser
// works on strings, and the detector uses a committed encrypted
// fixture (src/lib/__fixtures__/security-encrypted.pdf,
// encrypted with qpdf, 256-bit, password "test1234").
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isEncryptedPdf, parseShowEncryption } from "@/lib/pdf-security";

const SHOW_ENCRYPTION_256 = `Incorrect password supplied
R = 6
P = -1340
User password =
extract for accessibility: allowed
extract for any purpose: not allowed
print low resolution: allowed
print high resolution: allowed
modify document assembly: not allowed
modify forms: not allowed
modify annotations: not allowed
modify other: not allowed
modify anything: not allowed
stream encryption method: AESv3
string encryption method: AESv3
file encryption method: AESv3`;

const SHOW_ENCRYPTION_128 = `R = 4
P = -4
User password =
extract for accessibility: allowed
extract for any purpose: allowed
print low resolution: allowed
print high resolution: allowed
modify document assembly: allowed
modify forms: allowed
modify annotations: allowed
modify other: allowed
modify anything: allowed
stream encryption method: AESv2
string encryption method: AESv2
file encryption method: AESv2`;

describe("parseShowEncryption", () => {
  it("reports a plain PDF as not encrypted", () => {
    expect(parseShowEncryption("File is not encrypted")).toEqual({
      encrypted: false,
    });
  });

  it("parses a 256-bit (R=6) output", () => {
    const info = parseShowEncryption(SHOW_ENCRYPTION_256);
    expect(info).toEqual({
      encrypted: true,
      bits: 256,
      r: 6,
      p: -1340,
      permissions: {
        print: "full",
        extract: false,
        modify: "none",
        annotate: false,
      },
    });
  });

  it("parses a 128-bit (R=4) output with all permissions", () => {
    const info = parseShowEncryption(SHOW_ENCRYPTION_128);
    expect(info).toEqual({
      encrypted: true,
      bits: 128,
      r: 4,
      p: -4,
      permissions: {
        print: "full",
        extract: true,
        modify: "all",
        annotate: true,
      },
    });
  });

  it("parses a low-resolution-only print permission", () => {
    const info = parseShowEncryption(
      SHOW_ENCRYPTION_256.replace(
        "print high resolution: allowed",
        "print high resolution: not allowed"
      )
    );
    expect(info).toEqual({
      encrypted: true,
      bits: 256,
      r: 6,
      p: -1340,
      permissions: {
        print: "low",
        extract: false,
        modify: "none",
        annotate: false,
      },
    });
  });

  it("parses a partial modify permission", () => {
    const info = parseShowEncryption(
      SHOW_ENCRYPTION_256.replace(
        "modify document assembly: not allowed",
        "modify document assembly: allowed"
      )
    );
    expect(info).toEqual({
      encrypted: true,
      bits: 256,
      r: 6,
      p: -1340,
      permissions: {
        print: "full",
        extract: false,
        modify: "partial",
        annotate: false,
      },
    });
  });

  it("treats unexpected output as not encrypted rather than guessing", () => {
    expect(parseShowEncryption("something else entirely")).toEqual({
      encrypted: false,
    });
  });
});

describe("isEncryptedPdf", () => {
  it("detects the committed encrypted fixture", async () => {
    const bytes = readFileSync(
      join(__dirname, "__fixtures__", "security-encrypted.pdf")
    );
    expect(await isEncryptedPdf(new Uint8Array(bytes))).toBe(true);
  });

  it("reports a plain PDF as not encrypted", async () => {
    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([612, 792]);
    page.drawText("Plain", {
      x: 50,
      y: 700,
      size: 20,
      font,
      color: rgb(0, 0, 0),
    });
    expect(await isEncryptedPdf(await doc.save())).toBe(false);
  });

  it("reports a corrupt file as not encrypted", async () => {
    expect(
      await isEncryptedPdf(new TextEncoder().encode("not a pdf at all"))
    ).toBe(false);
  });
});
