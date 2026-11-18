// Convert page (Phase D).
//
// One page per document: it lists the formats the engine can
// convert this file to (from the conversion matrix — only
// conversions the engine actually performs), and converting
// creates a NEW document in the same workspace and folder. The
// original file is never modified or overwritten. The document
// row comes through the signed-in user's client (RLS); the
// route validates again server-side.
import { redirect } from "next/navigation";
import { FileWarning } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { ConvertClient } from "@/components/convert/convert-client";
import { getEditorFileType } from "@/lib/editor";
import { getConvertibleTargets, getFormatLabel } from "@/lib/convert";

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

export default async function ConvertPage({
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
    redirect(`/auth/login?next=/documents/${encodeURIComponent(id)}/convert`);

  const { data: document, error } = await supabase
    .from("documents")
    .select("id, title, workspace_id, file_path, mime_type, version")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    console.error("[convert page]", error);
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
  const sourceExt = getEditorFileType(document.mime_type);
  const targets = getConvertibleTargets(sourceExt);
  if (!document.file_path || targets.length === 0) {
    return (
      <EmptyState
        icon={FileWarning}
        title="This file cannot be converted"
        description="Only office documents and PDFs can be converted, and only to a format the conversion engine performs."
        action={<BackToFiles />}
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Convert {document.title}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Converting creates a new document in the same folder — the original
            file is never changed.
          </p>
        </div>
        <BackToFiles />
      </div>
      <ConvertClient
        documentId={document.id}
        title={document.title}
        sourceLabel={getFormatLabel(sourceExt ?? "")}
        targets={targets.map((ext) => ({
          ext,
          label: getFormatLabel(ext),
        }))}
      />
    </div>
  );
}
