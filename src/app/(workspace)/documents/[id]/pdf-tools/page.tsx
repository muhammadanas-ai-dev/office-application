// PDF tools page (Phase B, feature 2).
//
// One page per PDF document with four tools: merge, split, rotate,
// compress. The document row and the list of other PDFs come
// through the signed-in user's client (RLS); the page count is
// read server-side from the file itself (the forms also validate
// server-side, so a wrong page count can never corrupt a file).
import { redirect } from "next/navigation";
import { FileWarning } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DOCUMENTS_BUCKET } from "@/lib/storage";
import { EmptyState } from "@/components/ui/empty-state";
import { PdfToolsClient } from "@/components/pdf-tools/pdf-tools-client";
import { countPdfPages } from "@/lib/pdf-tools.server";
import Link from "next/link";

function BackToFiles() {
  return (
    <Link
      href="/files"
      className="inline-flex h-9 items-center rounded-lg bg-[#3159c9] px-3 text-sm font-medium text-white hover:bg-[#2a4cab]"
    >
      Back to files
    </Link>
  );
}

export default async function PdfToolsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    redirect(`/auth/login?next=/documents/${encodeURIComponent(id)}/pdf-tools`);

  const { data: document, error } = await supabase
    .from("documents")
    .select("id, title, workspace_id, file_path, mime_type")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    console.error("[pdf-tools page]", error);
    return (
      <EmptyState
        icon={FileWarning}
        title="Could not load this document"
        description="The document could not be read. Check the setup and try again."
        action={<BackToFiles />}
      />
    );
  }
  if (!document) {
    return (
      <EmptyState
        icon={FileWarning}
        title="Document not found"
        description="This document does not exist, or you do not have access to it."
        action={<BackToFiles />}
      />
    );
  }
  if (!document.file_path || document.mime_type !== "application/pdf") {
    return (
      <EmptyState
        icon={FileWarning}
        title="PDF tools only work on PDF files"
        description="Open a PDF document to merge, split, rotate or compress it."
        action={<BackToFiles />}
      />
    );
  }

  // Page count, read from the file itself (best effort — the forms
  // validate server-side even if this fails).
  let pageCount: number | null = null;
  try {
    const admin = createAdminClient();
    const { data: blob } = await admin.storage
      .from(DOCUMENTS_BUCKET)
      .download(document.file_path);
    if (blob) {
      pageCount = await countPdfPages(new Uint8Array(await blob.arrayBuffer()));
    }
  } catch (error) {
    console.error("[pdf-tools page] page count", error);
  }

  // Other PDFs in the same workspace, for merging.
  const { data: otherPdfs } = await supabase
    .from("documents")
    .select("id, title")
    .eq("workspace_id", document.workspace_id)
    .eq("mime_type", "application/pdf")
    .is("deleted_at", null)
    .neq("id", id)
    .not("file_path", "is", null)
    .order("title")
    .limit(50);

  return (
    <PdfToolsClient
      document={{ id: document.id, title: document.title }}
      pageCount={pageCount}
      otherPdfs={(otherPdfs ?? []).map((pdf) => ({
        id: pdf.id,
        title: pdf.title,
      }))}
    />
  );
}
