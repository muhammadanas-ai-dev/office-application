// OCR page (Phase C).
//
// One page per document: start an OCR run (English, Urdu or
// Arabic), watch its progress, and read the extracted text per
// page with its confidence score. The work itself is done by the
// worker (ocr/worker.ts) — this page only enqueues the job and
// polls its status. The document row comes through the signed-in
// user's client (RLS); the routes validate again server-side.
//
// A file that is not a PDF, PNG or JPEG shows an honest empty
// state instead of a fake OCR form. The original file is never
// changed — OCR only reads it.
import { redirect } from "next/navigation";
import { FileWarning } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { OcrClient } from "@/components/ocr/ocr-client";
import { isOcrAcceptedMimeType } from "@/lib/ocr.server";

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

export default async function OcrPage({
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
    redirect(`/auth/login?next=/documents/${encodeURIComponent(id)}/ocr`);

  const { data: document, error } = await supabase
    .from("documents")
    .select("id, title, workspace_id, file_path, mime_type, version")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    console.error("[ocr page]", error);
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
  if (!document.file_path || !isOcrAcceptedMimeType(document.mime_type)) {
    return (
      <EmptyState
        icon={FileWarning}
        title="OCR works on PDF, PNG and JPEG files"
        description="Open a scanned PDF or an image to read its text."
        action={<BackToFiles />}
      />
    );
  }

  // The user's OCR default language (from their preferences).
  // If the Day 24 migration has not been applied yet, the
  // column does not exist — fall back to English.
  const { data: profile } = await supabase
    .from("profiles")
    .select("ocr_language")
    .eq("id", user.id)
    .maybeSingle();
  const defaultLanguage =
    profile?.ocr_language === "urd" || profile?.ocr_language === "ara"
      ? profile.ocr_language
      : "eng";

  return (
    <OcrClient
      document={{
        id: document.id,
        title: document.title,
        version: document.version,
        mimeType: document.mime_type,
      }}
      defaultLanguage={defaultLanguage}
    />
  );
}
