// The JWT checks use jose + TextEncoder, which break under jsdom's
// realm (jose's Uint8Array instanceof check fails there). This file
// needs no DOM, so run it in Node. The production code runs in Node
// too — the live callback tests prove it works there.
// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as jose from "jose";
import {
  getEditorDocumentType,
  getEditorFileType,
  isEditableDocumentType,
  looksLikeDocx,
  looksLikeOfficeZip,
  newDocumentKey,
  signFileToken,
  verifyFileToken,
} from "@/lib/editor";

const SECRET = "test-secret-for-unit-tests-only";

describe("signFileToken / verifyFileToken", () => {
  it("round-trips a valid token", () => {
    const token = signFileToken(SECRET, {
      documentId: "11111111-1111-4111-8111-111111111111",
      version: 2,
      expiresAt: Date.now() + 60_000,
    });
    const result = verifyFileToken(SECRET, token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.documentId).toBe(
        "11111111-1111-4111-8111-111111111111"
      );
      expect(result.payload.version).toBe(2);
    }
  });

  it("rejects a tampered signature", () => {
    const token = signFileToken(SECRET, {
      documentId: "11111111-1111-4111-8111-111111111111",
      version: 1,
      expiresAt: Date.now() + 60_000,
    });
    const tampered = token.slice(0, -2) + "xx";
    expect(verifyFileToken(SECRET, tampered)).toEqual({
      ok: false,
      error: "Bad signature",
    });
  });

  it("rejects a token signed with a different secret", () => {
    const token = signFileToken("another-secret", {
      documentId: "11111111-1111-4111-8111-111111111111",
      version: 1,
      expiresAt: Date.now() + 60_000,
    });
    const result = verifyFileToken(SECRET, token);
    expect(result.ok).toBe(false);
  });

  it("rejects an expired token", () => {
    const token = signFileToken(SECRET, {
      documentId: "11111111-1111-4111-8111-111111111111",
      version: 1,
      expiresAt: Date.now() - 1_000,
    });
    expect(verifyFileToken(SECRET, token)).toEqual({
      ok: false,
      error: "Token expired",
    });
  });

  it("rejects a malformed token", () => {
    expect(verifyFileToken(SECRET, "not-a-token")).toEqual({
      ok: false,
      error: "Malformed token",
    });
    expect(verifyFileToken(SECRET, "")).toEqual({
      ok: false,
      error: "Malformed token",
    });
  });
});

describe("newDocumentKey", () => {
  it("is 20 hex characters and unique per call", () => {
    const a = newDocumentKey();
    const b = newDocumentKey();
    expect(a).toMatch(/^[0-9a-f]{20}$/);
    expect(a).not.toBe(b);
  });
});

describe("editor format mapping", () => {
  it("maps Word formats to word/docx and PDF to pdf", () => {
    expect(
      getEditorDocumentType(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      )
    ).toBe("word");
    expect(
      getEditorFileType(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      )
    ).toBe("docx");
    expect(getEditorDocumentType("application/pdf")).toBe("pdf");
    expect(getEditorFileType("application/pdf")).toBe("pdf");
    expect(getEditorDocumentType("application/msword")).toBe("word");
    expect(getEditorDocumentType("text/plain")).toBe("word");
  });

  it("maps spreadsheet formats to cell", () => {
    expect(
      getEditorDocumentType(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      )
    ).toBe("cell");
    expect(
      getEditorFileType(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      )
    ).toBe("xlsx");
    expect(getEditorDocumentType("application/vnd.ms-excel")).toBe("cell");
    expect(getEditorFileType("application/vnd.ms-excel")).toBe("xls");
    expect(getEditorDocumentType("text/csv")).toBe("cell");
    expect(getEditorFileType("text/csv")).toBe("csv");
    expect(
      getEditorDocumentType("application/vnd.oasis.opendocument.spreadsheet")
    ).toBe("cell");
    expect(
      getEditorFileType("application/vnd.oasis.opendocument.spreadsheet")
    ).toBe("ods");
  });

  it("maps presentation formats to slide", () => {
    expect(
      getEditorDocumentType(
        "application/vnd.openxmlformats-officedocument.presentationml.presentation"
      )
    ).toBe("slide");
    expect(
      getEditorFileType(
        "application/vnd.openxmlformats-officedocument.presentationml.presentation"
      )
    ).toBe("pptx");
    expect(getEditorDocumentType("application/vnd.ms-powerpoint")).toBe(
      "slide"
    );
    expect(getEditorFileType("application/vnd.ms-powerpoint")).toBe("ppt");
    expect(
      getEditorDocumentType("application/vnd.oasis.opendocument.presentation")
    ).toBe("slide");
    expect(
      getEditorFileType("application/vnd.oasis.opendocument.presentation")
    ).toBe("odp");
  });

  it("returns null for unsupported formats", () => {
    expect(getEditorDocumentType("image/png")).toBeNull();
    expect(getEditorFileType("image/png")).toBeNull();
    expect(getEditorDocumentType("application/zip")).toBeNull();
    expect(getEditorDocumentType(null)).toBeNull();
  });

  it("marks word, cell and slide editable and pdf view-only", () => {
    expect(isEditableDocumentType("word")).toBe(true);
    expect(isEditableDocumentType("cell")).toBe(true);
    expect(isEditableDocumentType("slide")).toBe(true);
    expect(isEditableDocumentType("pdf")).toBe(false);
    expect(isEditableDocumentType(null)).toBe(false);
  });
});

describe("ONLYOFFICE JWT contract (config + callback)", () => {
  const secret = new TextEncoder().encode("callback-test-secret");

  it("signs and verifies a callback payload, and rejects a tampered one", async () => {
    const payload = { key: "aaaaaaaaaaaaaaaaaaaa", status: 2 };
    const token = await new jose.SignJWT(payload)
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(secret);
    const { payload: verified } = await jose.jwtVerify(token, secret);
    expect(verified.key).toBe("aaaaaaaaaaaaaaaaaaaa");
    expect(verified.status).toBe(2);

    const tampered = token.slice(0, -3) + "xxx";
    await expect(jose.jwtVerify(tampered, secret)).rejects.toThrow();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await new jose.SignJWT({ key: "k", status: 2 })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode("another-secret"));
    await expect(jose.jwtVerify(token, secret)).rejects.toThrow();
  });
});

describe("looksLikeOfficeZip", () => {
  it("accepts ZIP magic bytes and rejects anything else", () => {
    expect(
      looksLikeOfficeZip(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14]))
    ).toBe(true);
    expect(looksLikeOfficeZip(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBe(
      false
    );
    expect(looksLikeOfficeZip(new Uint8Array([]))).toBe(false);
    // The Day 5 alias still works.
    expect(looksLikeDocx(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe(true);
  });
});
