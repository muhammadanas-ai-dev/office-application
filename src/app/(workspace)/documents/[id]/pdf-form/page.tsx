// PDF form-fill page (Phase B, feature 4).
//
// One page per PDF document: the pages render in the browser
// (PDF.js) and a side panel lists every form field with the right
// input for its type. Saving fills the fields and creates a new
// version — the original file is never overwritten. The document
// row and field list come through the signed-in user's client
// (RLS); the routes validate again server-side.
//
// A PDF with no form fields shows an honest empty state instead
// of a fake form. An XFA PDF is refused with a clear message.
import { redirect } from "next/navigation";
import { FileWarning } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DOCUMENTS_BUCKET } from "@/lib/storage";
import { EmptyState } from "@/components/ui/empty-state";
import { PdfFormClient } from "@/components/pdf-form/pdf-form-client";
import { countPdfPages } from "@/lib/pdf-tools.server";
import { listPdfFormFields, type PdfFormField } from "@/lib/pdf-form.server";
import Link from "next/link";
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

export default async function PdfFormPage({
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
    redirect(`/auth/login?next=/documents/${encodeURIComponent(id)}/pdf-form`);

  const { data: document, error } = await supabase
    .from("documents")
    .select("id, title, workspace_id, file_path, mime_type, version")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    logError("pdf-form page", error);
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
        title="Form filling only works on PDF files"
        description="Open a PDF document to fill its form fields."
        action={<BackToFiles />}
      />
    );
  }

  // Page count and field list, read from the file itself (best
  // effort — the routes validate server-side even if this fails).
  let pageCount: number | null = null;
  let fields: PdfFormField[] = [];
  let fieldsError: string | null = null;
  try {
    const admin = createAdminClient();
    const { data: blob } = await admin.storage
      .from(DOCUMENTS_BUCKET)
      .download(document.file_path);
    if (blob) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      pageCount = await countPdfPages(bytes);
      fields = await listPdfFormFields(bytes);
    }
  } catch (error) {
    logError("pdf-form page file read", error);
    fieldsError =
      error instanceof Error ? error.message : "Could not read this PDF.";
  }

  return (
    <PdfFormClient
      document={{
        id: document.id,
        title: document.title,
        version: document.version,
      }}
      pageCount={pageCount}
      initialFields={fields}
      fieldsError={fieldsError}
    />
  );
}
