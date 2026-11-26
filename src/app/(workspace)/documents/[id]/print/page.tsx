// Print view for a reviewed PDF (F31).
//
// Renders the PDF's pages at print resolution with an
// optional comments list, ready for the browser's print
// dialog. Access follows the annotate page's rules: the
// document row comes through the signed-in user's client
// (RLS) and only PDFs with a file qualify.
import { redirect } from "next/navigation";
import { FileWarning } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { DocumentPrintClient } from "@/components/print/document-print-client";
import { logError } from "@/lib/log";

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

export default async function DocumentPrintPage({
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
    redirect(`/auth/login?next=/documents/${encodeURIComponent(id)}/print`);

  const { data: document, error } = await supabase
    .from("documents")
    .select("id, title, file_path, mime_type")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    logError("print page", error);
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
        title="Printing works on PDF files"
        description="Open a PDF document to print it. Other formats print from their editor."
        action={<BackToFiles />}
      />
    );
  }
  return (
    <DocumentPrintClient
      document={{ id: document.id, title: document.title }}
    />
  );
}
