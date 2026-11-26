// Share page (Day 25) — manage a document's share links.
//
// Lists the document's share links (newest first) with their
// expiry and a Revoke button, and a form to create a new link
// (pick the expiry). The document and its links come through
// the signed-in user's client (RLS).
import { redirect } from "next/navigation";
import { FileWarning } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { SharingClient } from "@/components/sharing/sharing-client";
import { listShares } from "@/lib/sharing.server";
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

export default async function SharePage({
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
    redirect(`/auth/login?next=/documents/${encodeURIComponent(id)}/share`);

  const { data: document, error } = await supabase
    .from("documents")
    .select("id, title, file_path")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    logError("share page", error);
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
  if (!document.file_path) {
    return (
      <EmptyState
        icon={FileWarning}
        title="Nothing to share yet"
        description="This is a blank document with no file yet. Add content first, then share it."
        action={<BackToFiles />}
      />
    );
  }

  // A missing table means the Day 25 migration has not been
  // applied yet — show the page with an empty list and a clear
  // notice instead of failing.
  let shares: Awaited<ReturnType<typeof listShares>> = [];
  let migrationApplied = true;
  try {
    shares = await listShares(supabase, id);
  } catch (e) {
    if (
      e instanceof Error &&
      e.message.includes("forma-shares-migration.sql")
    ) {
      migrationApplied = false;
    } else {
      throw e;
    }
  }

  return (
    <div className="px-4 py-8 sm:px-6 lg:px-10">
      <h1 className="text-xl font-semibold">Share “{document.title}”</h1>
      <p className="mt-1 text-sm text-[#667389]">
        Anyone with the link can download this document — no account needed. The
        link stops working when it expires or when you revoke it.
      </p>
      <div className="mt-8">
        <SharingClient
          documentId={document.id}
          shares={shares.map((s) => ({
            id: s.id,
            expiresAt: s.expires_at,
            createdAt: s.created_at,
            revokedAt: s.revoked_at,
          }))}
          migrationApplied={migrationApplied}
        />
      </div>
    </div>
  );
}
