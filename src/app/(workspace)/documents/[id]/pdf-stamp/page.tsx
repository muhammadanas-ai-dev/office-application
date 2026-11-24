// Stamps / watermarks page (Day 32).
//
// One page per PDF document: three tabs — a text watermark, an
// image watermark, and a rubber stamp. Each tab is a form that
// posts to its API route, which creates a new version — the
// original file is never overwritten. The document row and page
// count come through the signed-in user's client (RLS); the
// routes validate again server-side.
//
// A watermark or a stamp is drawn INTO the page content, so it
// is permanent — removing one later means restoring an earlier
// version. The page says so.
import { redirect } from "next/navigation";
import { FileWarning } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DOCUMENTS_BUCKET } from "@/lib/storage";
import { EmptyState } from "@/components/ui/empty-state";
import { PdfStampClient } from "@/components/pdf-stamp/pdf-stamp-client";
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

export default async function PdfStampPage({
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
    redirect(`/auth/login?next=/documents/${encodeURIComponent(id)}/pdf-stamp`);

  const { data: document, error } = await supabase
    .from("documents")
    .select("id, title, workspace_id, file_path, mime_type, version")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    console.error("[pdf-stamp page]", error);
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
        title="Stamps and watermarks only work on PDF files"
        description="Open a PDF document to stamp or watermark it."
        action={<BackToFiles />}
      />
    );
  }

  // Page count, read from the file itself (best effort — the
  // routes validate server-side even if this fails).
  let pageCount: number | null = null;
  try {
    const admin = createAdminClient();
    const { data: blob } = await admin.storage
      .from(DOCUMENTS_BUCKET)
      .download(document.file_path);
    if (blob) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      pageCount = await countPdfPages(bytes);
    }
  } catch (error) {
    console.error("[pdf-stamp page] file read", error);
  }

  return (
    <PdfStampClient
      document={{
        id: document.id,
        title: document.title,
        version: document.version,
      }}
      pageCount={pageCount}
    />
  );
}
