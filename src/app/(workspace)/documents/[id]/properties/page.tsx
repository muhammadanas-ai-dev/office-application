// Document properties page (F29).
//
// One page per document: the library facts, and for a PDF
// the file's own information dictionary with an edit form.
// The document row comes through the signed-in user's
// client (RLS); the details load through the properties
// API route.
import { redirect } from "next/navigation";
import { FileWarning } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { DocumentPropertiesClient } from "@/components/properties/document-properties-client";
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

export default async function DocumentPropertiesPage({
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
      `/auth/login?next=/documents/${encodeURIComponent(id)}/properties`
    );

  const { data: document, error } = await supabase
    .from("documents")
    .select("id, title")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    logError("properties page", error);
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
  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-[#202b3c]">Properties</h1>
          <p className="text-sm text-[#667389]">{document.title}</p>
        </div>
        <BackToFiles />
      </div>
      <DocumentPropertiesClient documentId={document.id} />
    </main>
  );
}
