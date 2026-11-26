// Versions page (Day 23).
//
// Lists a document's versions, newest first — the version
// number, when it was saved, its size, and whether it is the
// current version. Each version has a Download link; every
// version except the current one has a Restore button (restoring
// creates a NEW version from the old file — it never overwrites).
// The document and its versions come through the signed-in
// user's client (RLS).
import { redirect } from "next/navigation";
import { FileWarning } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { VersionsClient } from "@/components/versions/versions-client";
import { fetchDocumentVersions } from "@/lib/versions.server";
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

export default async function VersionsPage({
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
    redirect(`/auth/login?next=/documents/${encodeURIComponent(id)}/versions`);

  const { data: document, error } = await supabase
    .from("documents")
    .select("id, title, version")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    logError("versions page", error);
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
        description="This document does not exist or you do not have access to it."
        action={<BackToFiles />}
      />
    );
  }

  let versions;
  try {
    versions = await fetchDocumentVersions(supabase, id);
  } catch (error) {
    logError("versions page", error);
    return (
      <EmptyState
        icon={FileWarning}
        title="Could not load the versions"
        description="The versions could not be read. Check the setup and try again."
        action={<BackToFiles />}
      />
    );
  }

  return (
    <VersionsClient
      documentId={document.id}
      title={document.title}
      currentVersion={document.version}
      versions={versions.map((v) => ({
        versionNumber: v.version_number,
        sizeBytes: v.size_bytes,
        createdAt: v.created_at,
      }))}
    />
  );
}
