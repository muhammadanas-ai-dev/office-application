// Editor page (Day 5) — opens a document in the ONLYOFFICE editor.
//
// The document is loaded through the signed-in user's client, so RLS
// decides access before any config is built. The signed config is
// minted server-side (see src/features/editor/config.ts). If the
// document server is not configured, or the file cannot be opened,
// the page says so honestly — it never shows a fake editor.
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  EditorNotConfigured,
  buildEditorConfig,
} from "@/features/editor/config";
import { getEditorDocumentType } from "@/lib/editor";
import { getDocumentServerUrl } from "@/lib/editor.server";
import { EditorClient } from "@/components/editor/editor-client";
import { RegisterOpenDocument } from "@/components/layout/document-tabs";
import { FileWarning } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { logError } from "@/lib/log";

function BackToFiles() {
  return (
    <a
      href="/files"
      className="inline-flex h-9 items-center rounded-lg bg-[#3159c9] px-4 text-sm font-medium text-white hover:bg-[#2548a8]"
    >
      Back to My files
    </a>
  );
}

export default async function EditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/login?next=/editor/${encodeURIComponent(id)}`);

  const { data: document, error } = await supabase
    .from("documents")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    logError("editor page", error);
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

  const docServerUrl = getDocumentServerUrl();
  if (!docServerUrl) {
    return (
      <EmptyState
        icon={FileWarning}
        title="The editor server is not configured"
        description="Forma Office needs a document server to open files for editing. Ask the workspace owner to set ONLYOFFICE_DOCSERVER_URL — the editor is not faked with a text box."
        action={<BackToFiles />}
      />
    );
  }

  if (!document.file_path) {
    return (
      <EmptyState
        icon={FileWarning}
        title="This document has no file yet"
        description="Blank documents have nothing to open until the editor saves a first version."
        action={<BackToFiles />}
      />
    );
  }

  if (getEditorDocumentType(document.mime_type) === null) {
    return (
      <EmptyState
        icon={FileWarning}
        title="This file cannot be opened in the editor"
        description="Word documents (DOCX, DOC, ODT, TXT), spreadsheets (XLSX, XLS, CSV, ODS), presentations (PPTX, PPT, ODP) and PDF files open in the editor."
        action={<BackToFiles />}
      />
    );
  }

  let editor;
  try {
    editor = await buildEditorConfig(document, {
      id: user.id,
      name:
        (user.user_metadata?.display_name as string | undefined) ??
        user.email ??
        "Anonymous",
    });
  } catch (error) {
    if (error instanceof EditorNotConfigured) {
      return (
        <EmptyState
          icon={FileWarning}
          title="The editor server is not configured"
          description="Forma Office needs a document server to open files for editing."
          action={<BackToFiles />}
        />
      );
    }
    logError("editor page", error);
    return (
      <EmptyState
        icon={FileWarning}
        title="Could not start the editor"
        description={
          error instanceof Error ? error.message : "The editor could not start."
        }
        action={<BackToFiles />}
      />
    );
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <RegisterOpenDocument id={document.id} title={document.title} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-[#202b3c]">
            {document.title}
          </h1>
          <p className="text-xs text-[#667389]">
            {editor.mode === "edit"
              ? "Editing — saves create a new version."
              : "View only — this format cannot be edited."}{" "}
            Version {document.version}
          </p>
        </div>
        <a
          href="/files"
          className="rounded-lg border border-[#dce3ec] px-3 py-1.5 text-xs font-medium text-[#202b3c] hover:bg-[#f4f6fa]"
        >
          Back to My files
        </a>
      </div>
      <EditorClient
        docServerUrl={editor.docServerUrl}
        config={editor.config}
        token={editor.token}
      />
    </div>
  );
}
