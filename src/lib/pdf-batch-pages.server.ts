// Batch page operations (F36) — server side.
//
// Runs one page operation (rotate all pages, or compress)
// over several PDFs, saving a NEW VERSION of each. One
// document's failure never fails the batch — it is
// reported per document, like the batch export (F28).
import "server-only";
import {
  fetchEditableDocument,
  saveNewVersion,
} from "@/lib/pdf-edit.server";
import { fetchDocumentPdf } from "@/lib/pdf-tools.server";
import { compressPdf, countPdfPages, rotatePdf } from "@/lib/pdf-ops";
import type { CompressLevel } from "@/lib/pdf-tools";

export type BatchPageOperation =
  | { kind: "rotate"; degrees: 90 | 180 | 270 }
  | { kind: "compress"; level: CompressLevel };

export interface BatchPageResult {
  documentId: string;
  title: string | null;
  ok: boolean;
  version?: number;
  detail?: string;
  error?: string;
}

type UserClient = Awaited<
  ReturnType<typeof import("@/lib/supabase/server").createClient>
>;

async function applyOperation(
  bytes: Uint8Array,
  operation: BatchPageOperation
): Promise<{ bytes: Uint8Array; detail: string }> {
  if (operation.kind === "rotate") {
    const count = await countPdfPages(bytes);
    const pages = Array.from({ length: count }, (_, i) => i + 1);
    const rotated = await rotatePdf(bytes, pages, operation.degrees);
    return {
      bytes: rotated,
      detail: `rotated ${operation.degrees}° (${count} page${count === 1 ? "" : "s"})`,
    };
  }
  const { bytes: compressed, savedBytes } = await compressPdf(
    bytes,
    operation.level
  );
  return {
    bytes: compressed,
    detail:
      savedBytes > 0
        ? `compressed, saved ${Math.round(savedBytes / 1024)} KB`
        : "already as small as it gets — saved unchanged",
  };
}

export async function runBatchPageOperation(
  userClient: UserClient,
  userId: string,
  documentIds: string[],
  operation: BatchPageOperation
): Promise<BatchPageResult[]> {
  const results: BatchPageResult[] = [];
  for (const documentId of documentIds) {
    try {
      const document = await fetchEditableDocument(userClient, documentId);
      const { bytes } = await fetchDocumentPdf(userClient, documentId);
      const applied = await applyOperation(bytes, operation);
      const version = await saveNewVersion(document, userId, applied.bytes);
      results.push({
        documentId,
        title: document.title,
        ok: true,
        version,
        detail: applied.detail,
      });
    } catch (error) {
      results.push({
        documentId,
        title: null,
        ok: false,
        error:
          error instanceof Error ? error.message : "Operation failed.",
      });
    }
  }
  return results;
}
