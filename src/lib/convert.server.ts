// Conversion hub converter (Phase D) — server-only.
//
// Generalises the Day 7 PDF export (export.server.ts) from
// "always to PDF" to "to any supported output type": the same
// JWT-signed ConvertService call, the same download, and the
// same rule — the converted bytes are validated for the target
// format before they are returned, so a wrong-format or empty
// response is never stored or handed to the user. The document
// server's URL is never exposed to the browser: the route saves
// the bytes itself.
import "server-only";
import * as jose from "jose";
import {
  EXPORT_TIMEOUT_MS,
  MAX_EXPORT_BYTES,
  buildConvertRequest,
  parseConvertResponse,
  type ConvertRequestBody,
} from "@/lib/export";
import { validateConvertedBytes } from "@/lib/convert";
import { newDocumentKey } from "@/lib/editor";
import {
  getDocumentServerUrl,
  getOnlyOfficeJwtSecret,
} from "@/lib/editor.server";

/** A conversion failure with the HTTP status the route should return. */
export class ConvertError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ConvertError";
    this.status = status;
  }
}

/**
 * Convert a document (reachable at `fileUrl`, in `fileType` format)
 * to `outputType` through the document server. Returns the
 * converted bytes. Throws ConvertError on every failure path —
 * never returns partial or wrong-format bytes.
 */
export async function convertDocument(args: {
  fileUrl: string;
  fileType: string;
  outputType: string;
  title: string;
}): Promise<Uint8Array> {
  const docServerUrl = getDocumentServerUrl();
  if (!docServerUrl) {
    throw new ConvertError(
      503,
      "The document server is not configured, so this file cannot be converted yet."
    );
  }

  const body: ConvertRequestBody = buildConvertRequest({
    fileType: args.fileType,
    outputType: args.outputType,
    key: `forma-convert-${newDocumentKey()}`,
    title: args.title,
    fileUrl: args.fileUrl,
  });
  const token = await new jose.SignJWT(body as unknown as jose.JWTPayload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(getOnlyOfficeJwtSecret()));

  let convertResponse: Response;
  try {
    convertResponse = await fetch(`${docServerUrl}/ConvertService.ashx`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, token }),
      signal: AbortSignal.timeout(EXPORT_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new ConvertError(
        504,
        "The conversion timed out — the document server took too long to convert this file."
      );
    }
    throw new ConvertError(
      502,
      "The document server could not be reached for this conversion."
    );
  }
  if (!convertResponse.ok) {
    throw new ConvertError(502, "The document server refused this conversion.");
  }
  const parsed = parseConvertResponse(await convertResponse.text());
  if (!parsed.ok) {
    throw new ConvertError(502, parsed.error);
  }

  let downloaded: Response;
  try {
    downloaded = await fetch(parsed.fileUrl, {
      signal: AbortSignal.timeout(EXPORT_TIMEOUT_MS),
    });
  } catch {
    throw new ConvertError(
      502,
      "The converted file could not be downloaded from the document server."
    );
  }
  if (!downloaded.ok) {
    throw new ConvertError(
      502,
      "The converted file could not be downloaded from the document server."
    );
  }
  const bytes = new Uint8Array(await downloaded.arrayBuffer());
  const validationError = validateConvertedBytes(bytes, args.outputType);
  if (validationError) {
    throw new ConvertError(502, validationError);
  }
  if (bytes.length > MAX_EXPORT_BYTES) {
    throw new ConvertError(
      502,
      "The converted file is larger than the 50 MB limit."
    );
  }
  return bytes;
}
