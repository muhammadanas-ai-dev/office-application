// Reviewer notes page (Day 34).
//
// One page per document: the owner's private notes on the
// document. Notes are stored in Forma only (the document_notes
// table) — they are never written into the file and never
// shown on a share link. The document row comes through the
// signed-in user's client (RLS); the notes themselves load
// through the notes API routes, which are owner-only.
import { redirect } from "next/navigation";
import { FileWarning } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { DocumentNotesClient } from "@/components/notes/document-notes-client";
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

export default async function DocumentNotesPage({
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
    redirect(`/auth/login?next=/documents/${encodeURIComponent(id)}/notes`);

  const { data: document, error } = await supabase
    .from("documents")
    .select("id, title")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    logError("notes page", error);
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
    <DocumentNotesClient
      document={{ id: document.id, title: document.title }}
      userId={user.id}
    />
  );
}
