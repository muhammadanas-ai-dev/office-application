// PDF export converter (Phase B, feature 1) — server-only.
//
// Calls the ONLYOFFICE ConvertService with a JWT-signed request
// (the same contract as the editor callback, Day 5), downloads the
// converted PDF server-side, and validates it before returning the
// bytes. The document server's URL is never exposed to the browser:
// the route streams the bytes back itself.
import "server-only";
import { ConvertError, convertDocument } from "@/lib/convert.server";

/** An export failure with the HTTP status the route should return. */
export class ExportError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ExportError";
    this.status = status;
  }
}

/**
 * Convert a document (reachable at `fileUrl`, in `fileType` format)
 * to PDF through the document server. Returns the PDF bytes.
 * Throws ExportError on every failure path — never returns partial
 * or wrong-format bytes. Implemented on top of the general
 * converter (convert.server.ts) with outputtype "pdf"; the export
 * behaviour is unchanged.
 */
export async function convertToPdf(args: {
  fileUrl: string;
  fileType: string;
  title: string;
}): Promise<Uint8Array> {
  try {
    return await convertDocument({
      fileUrl: args.fileUrl,
      fileType: args.fileType,
      outputType: "pdf",
      title: args.title,
    });
  } catch (error) {
    if (error instanceof ConvertError) {
      throw new ExportError(error.status, error.message);
    }
    throw error;
  }
}
