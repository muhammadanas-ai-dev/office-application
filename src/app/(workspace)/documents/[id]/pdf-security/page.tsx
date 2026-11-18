// PDF security page (Day 20).
//
// One page per PDF document: if the PDF is not protected, the
// user sets a password and permissions; if it is protected, the
// page shows its strength and permissions and offers to unlock
// it. Every change is sent to its API route, which creates a new
// version — the original file is never overwritten. The document
// row comes through the signed-in user's client (RLS); the
// security state is read from the file itself (via qpdf, the
// admin client download, the annotate-page pattern); the routes
// validate again server-side.
import { redirect } from "next/navigation";
import { FileWarning } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DOCUMENTS_BUCKET } from "@/lib/storage";
import { EmptyState } from "@/components/ui/empty-state";
import { PdfSecurityClient } from "@/components/pdf-security/pdf-security-client";
import { getPdfSecurity } from "@/lib/pdf-security.server";
import type { PdfSecurityInfo } from "@/lib/pdf-security";
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

export default async function PdfSecurityPage({
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
    redirect(
      `/auth/login?next=/documents/${encodeURIComponent(id)}/pdf-security`
    );

  const { data: document, error } = await supabase
    .from("documents")
    .select("id, title, workspace_id, file_path, mime_type, version")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    console.error("[pdf-security page]", error);
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
        title="PDF security only works on PDF files"
        description="Open a PDF document to protect or unlock it."
        action={<BackToFiles />}
      />
    );
  }

  // The security state, read from the file itself (best effort —
  // the routes validate server-side even if this fails). If qpdf
  // is not installed, the page reports it instead of guessing.
  let security: PdfSecurityInfo | null = null;
  let securityError: string | null = null;
  try {
    const admin = createAdminClient();
    const { data: blob } = await admin.storage
      .from(DOCUMENTS_BUCKET)
      .download(document.file_path);
    if (blob) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      security = await getPdfSecurity(bytes);
    }
  } catch (error) {
    console.error("[pdf-security page] security read", error);
    securityError =
      error instanceof Error
        ? error.message
        : "Could not read this PDF's security.";
  }
  if (!security && !securityError) {
    securityError = "Could not read this PDF's security.";
  }

  return (
    <PdfSecurityClient
      document={{
        id: document.id,
        title: document.title,
        version: document.version,
      }}
      security={security}
      securityError={securityError}
    />
  );
}
