// PDF draw page (Day 19, part 2).
//
// One page per PDF document: the pages render in the browser
// (PDF.js), the user drags a rectangle to crop a page, add a
// hyperlink or draw a shape, or clicks a point to add text.
// Every change is sent to its API route, which creates a new
// version — the original file is never overwritten. The document
// row and page count come through the signed-in user's client
// (RLS); the routes validate again server-side.
import { redirect } from "next/navigation";
import { FileWarning } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DOCUMENTS_BUCKET } from "@/lib/storage";
import { EmptyState } from "@/components/ui/empty-state";
import { PdfDrawClient } from "@/components/pdf-draw/pdf-draw-client";
import { countPdfPages } from "@/lib/pdf-tools.server";
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

export default async function PdfDrawPage({
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
    redirect(`/auth/login?next=/documents/${encodeURIComponent(id)}/pdf-draw`);

  const { data: document, error } = await supabase
    .from("documents")
    .select("id, title, workspace_id, file_path, mime_type, version")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    logError("pdf-draw page", error);
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
        title="Drawing only works on PDF files"
        description="Open a PDF document to draw on it."
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
    logError("pdf-draw page file read", error);
  }

  // The user's uploaded fonts for the Add-text picker
  // (F33). A missing table (migration pending) simply means
  // no custom fonts yet.
  let userFonts: { id: string; name: string; isFavourite: boolean }[] = [];
  try {
    const { data: fontRows } = await supabase
      .from("user_fonts")
      .select("id, name, is_favourite, last_used_at")
      .eq("user_id", user.id)
      .order("is_favourite", { ascending: false })
      .order("last_used_at", { ascending: false, nullsFirst: false })
      .order("name")
      .limit(50);
    userFonts = (fontRows ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      isFavourite: row.is_favourite,
    }));
  } catch {
    userFonts = [];
  }

  // Image documents in this workspace, for Insert image
  // (F38). Missing rows simply mean an empty picker.
  const { data: imageRows } = await supabase
    .from("documents")
    .select("id, title")
    .eq("workspace_id", document.workspace_id)
    .in("mime_type", ["image/png", "image/jpeg", "image/webp", "image/tiff"])
    .is("deleted_at", null)
    .not("file_path", "is", null)
    .order("title")
    .limit(50);
  const imageDocs = (imageRows ?? []).map((row) => ({
    id: row.id,
    title: row.title,
  }));

  return (
    <PdfDrawClient
      images={imageDocs}
      userId={user.id}
      userFonts={userFonts}
      document={{
        id: document.id,
        title: document.title,
        version: document.version,
      }}
      pageCount={pageCount}
    />
  );
}
