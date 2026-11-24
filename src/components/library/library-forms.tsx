// Client-side library forms (Day 4).
//
// Each form posts to a server action with useActionState and shows
// the action's error message. Delete is always soft-delete (the file
// can be restored from Trash), so no confirmation dialog is needed;
// permanent delete gets a browser confirm instead.
"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ALLOWED_UPLOAD_EXTENSIONS,
  SUPPORTED_UPLOAD_MESSAGE,
} from "@/lib/storage";
import { BLANK_TEMPLATE_TYPES } from "@/lib/blank-templates";
import {
  applyTemplate,
  applyUserTemplate,
  createDocument,
  createFolder,
  deleteDocument,
  deleteFolder,
  deleteUserTemplate,
  duplicateDocument,
  moveDocument,
  moveFolder,
  permanentDeleteDocument,
  permanentDeleteFolder,
  renameDocument,
  renameFolder,
  renameUserTemplate,
  restoreDocument,
  restoreFolder,
  saveAsTemplate,
  toggleStar,
  uploadDocument,
  type ActionResult,
} from "@/features/library/actions";
import type { FolderRow } from "@/features/library/queries";

const idle: ActionResult = { ok: true };

function FormError({ state }: { state: ActionResult }) {
  if (state.ok) return null;
  return (
    <p role="alert" className="mt-1 text-xs text-[#b3261e]">
      {state.error}
    </p>
  );
}

const inputClass =
  "h-9 rounded-lg border border-[#dce3ec] bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3159c9]";
const buttonClass =
  "inline-flex h-9 items-center rounded-lg bg-[#3159c9] px-3 text-sm font-medium text-white hover:bg-[#2a4cab] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3159c9] disabled:opacity-60";
const subtleButtonClass =
  "inline-flex h-8 items-center rounded-lg border border-[#dce3ec] bg-white px-2.5 text-xs font-medium text-[#202b3c] hover:bg-[#f4f6fa] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3159c9] disabled:opacity-60";
const dangerButtonClass =
  "inline-flex h-8 items-center rounded-lg border border-[#f3c2c0] bg-white px-2.5 text-xs font-medium text-[#b3261e] hover:bg-[#fdf0ef] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b3261e] disabled:opacity-60";

export function ApplyTemplateForm({
  templateId,
  templateName,
  folderId,
}: {
  templateId: string;
  templateName: string;
  folderId: string | null;
}) {
  const [state, formAction, isPending] = useActionState(applyTemplate, idle);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <input type="hidden" name="folderId" value={folderId ?? ""} />
        <input type="hidden" name="templateId" value={templateId} />
        <label className="sr-only" htmlFor={`apply-${templateId}-title`}>
          Title for your {templateName}
        </label>
        <input
          id={`apply-${templateId}-title`}
          name="title"
          required
          maxLength={200}
          placeholder={`My ${templateName.toLowerCase()}`}
          className={inputClass}
        />
        <button type="submit" disabled={isPending} className={buttonClass}>
          {isPending ? "Creating…" : "Use this template"}
        </button>
      </div>
      <FormError state={state} />
    </form>
  );
}

// Apply a user-created template (Day 31). The same form as
// ApplyTemplateForm, but the action copies the template file from
// Storage instead of reading a built-in template from disk.
export function ApplyUserTemplateForm({
  templateId,
  templateName,
  folderId,
}: {
  templateId: string;
  templateName: string;
  folderId: string | null;
}) {
  const [state, formAction, isPending] = useActionState(
    applyUserTemplate,
    idle
  );
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <input type="hidden" name="folderId" value={folderId ?? ""} />
        <input type="hidden" name="templateId" value={templateId} />
        <label className="sr-only" htmlFor={`apply-user-${templateId}-title`}>
          Title for your {templateName}
        </label>
        <input
          id={`apply-user-${templateId}-title`}
          name="title"
          required
          maxLength={200}
          placeholder={`My ${templateName.toLowerCase()}`}
          className={inputClass}
        />
        <button type="submit" disabled={isPending} className={buttonClass}>
          {isPending ? "Creating…" : "Use this template"}
        </button>
      </div>
      <FormError state={state} />
    </form>
  );
}

// Delete a user-created template (Day 31). The row and its Storage
// file are both removed; the document it was saved from is never
// touched.
export function DeleteUserTemplateForm({
  templateId,
  templateName,
}: {
  templateId: string;
  templateName: string;
}) {
  const [state, formAction, isPending] = useActionState(
    deleteUserTemplate,
    idle
  );
  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="templateId" value={templateId} />
      <button
        type="submit"
        disabled={isPending}
        aria-label={`Delete template ${templateName}`}
        className={dangerButtonClass}
      >
        Delete template
      </button>
      <FormError state={state} />
    </form>
  );
}

// Rename a user-created template (Day 31): the name + description.
// The file itself is never touched.
export function RenameUserTemplateForm({
  templateId,
  templateName,
  templateDescription,
}: {
  templateId: string;
  templateName: string;
  templateDescription: string | null;
}) {
  const [state, formAction, isPending] = useActionState(
    renameUserTemplate,
    idle
  );
  return (
    <form action={formAction} className="flex flex-col gap-1.5">
      <input type="hidden" name="templateId" value={templateId} />
      <input
        name="name"
        defaultValue={templateName}
        required
        maxLength={200}
        aria-label={`Template name for ${templateName}`}
        className="h-8 min-w-0 rounded-md border border-[#dce3ec] px-2 text-xs"
      />
      <input
        name="description"
        defaultValue={templateDescription ?? ""}
        maxLength={500}
        aria-label={`Template description for ${templateName}`}
        placeholder="Description (optional)"
        className="h-8 min-w-0 rounded-md border border-[#dce3ec] px-2 text-xs"
      />
      <button type="submit" disabled={isPending} className={subtleButtonClass}>
        Rename template
      </button>
      <FormError state={state} />
    </form>
  );
}

export function CreateFolderForm({ parentId }: { parentId: string | null }) {
  const [state, formAction, isPending] = useActionState(createFolder, idle);
  return (
    <form action={formAction} className="flex items-start gap-2">
      <input type="hidden" name="parentId" value={parentId ?? ""} />
      <label className="sr-only" htmlFor="new-folder-name">
        New folder name
      </label>
      <input
        id="new-folder-name"
        name="name"
        required
        maxLength={100}
        placeholder="New folder name"
        className={inputClass}
      />
      <button type="submit" disabled={isPending} className={buttonClass}>
        {isPending ? "Creating…" : "New folder"}
      </button>
      <FormError state={state} />
    </form>
  );
}

export function CreateDocumentForm({ folderId }: { folderId: string | null }) {
  const [state, formAction, isPending] = useActionState(createDocument, idle);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <input type="hidden" name="folderId" value={folderId ?? ""} />
        <label className="sr-only" htmlFor="new-document-title">
          New document title
        </label>
        <input
          id="new-document-title"
          name="title"
          required
          maxLength={200}
          placeholder="New document title"
          className={inputClass}
        />
        <button type="submit" disabled={isPending} className={buttonClass}>
          {isPending ? "Creating…" : "New blank document"}
        </button>
      </div>
      <fieldset className="flex flex-wrap items-center gap-3 text-sm">
        <legend className="sr-only">Document type</legend>
        {BLANK_TEMPLATE_TYPES.map((type, index) => (
          <label
            key={type.ext}
            className="flex cursor-pointer items-center gap-1"
          >
            <input
              type="radio"
              name="type"
              value={type.ext}
              defaultChecked={index === 0}
            />
            {type.label}
          </label>
        ))}
      </fieldset>
      <FormError state={state} />
    </form>
  );
}

export function UploadForm({ folderId }: { folderId: string | null }) {
  const [state, formAction, isPending] = useActionState(uploadDocument, idle);
  return (
    <DropZone folderId={folderId}>
      <form action={formAction} className="flex flex-col gap-1">
        <div className="flex flex-wrap items-start gap-2">
          <input type="hidden" name="folderId" value={folderId ?? ""} />
          <label className="sr-only" htmlFor="upload-file">
            Choose a file to upload
          </label>
          <input
            id="upload-file"
            name="file"
            type="file"
            required
            accept={ALLOWED_UPLOAD_EXTENSIONS.map((ext) => `.${ext}`).join(",")}
            className="h-9 max-w-64 rounded-lg border border-[#dce3ec] bg-white px-2 py-1.5 text-sm file:mr-2 file:rounded-md file:border-0 file:bg-[#edf1f6] file:px-2 file:py-1 file:text-xs file:font-medium"
          />
          <button type="submit" disabled={isPending} className={buttonClass}>
            {isPending ? "Uploading…" : "Upload"}
          </button>
        </div>
        <p className="text-xs text-[#667389]">{SUPPORTED_UPLOAD_MESSAGE}</p>
        <FormError state={state} />
      </form>
    </DropZone>
  );
}

/** One dropped file's upload status (for the drop zone). */
type DroppedFileStatus = {
  name: string;
  status: "uploading" | "done" | "error";
  error?: string;
};

/**
 * Drag-and-drop upload (Day 28) — wraps the UploadForm.
 *
 * Dropping files uploads each one through the same
 * `uploadDocument` server action the file input uses, so
 * the byte-signature check, the size limit and the role
 * check all apply unchanged. Multiple files are uploaded
 * one by one (the action takes one file) and each shows
 * its own status. The file input stays — drag-and-drop is
 * an addition, not a replacement.
 */
function DropZone({
  folderId,
  children,
}: {
  folderId: string | null;
  children: React.ReactNode;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploads, setUploads] = useState<DroppedFileStatus[]>([]);
  const router = useRouter();

  function onDragOver(event: React.DragEvent) {
    event.preventDefault();
    setIsDragging(true);
  }

  function onDragLeave(event: React.DragEvent) {
    // Only clear the highlight when the pointer really leaves
    // the zone (not when it moves between children).
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDragging(false);
    }
  }

  async function onDrop(event: React.DragEvent) {
    event.preventDefault();
    setIsDragging(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length === 0) return;
    setUploads(files.map((file) => ({ name: file.name, status: "uploading" })));
    let anyDone = false;
    for (const file of files) {
      const formData = new FormData();
      formData.set("folderId", folderId ?? "");
      formData.set("file", file);
      const result = await uploadDocument(idle, formData);
      anyDone = anyDone || result.ok;
      setUploads((prev) =>
        prev.map((u) =>
          u.name === file.name
            ? result.ok
              ? { name: file.name, status: "done" }
              : { name: file.name, status: "error", error: result.error }
            : u
        )
      );
    }
    // The library list is server-rendered — refresh it so the
    // new documents appear.
    if (anyDone) router.refresh();
  }

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={
        isDragging
          ? "rounded-xl border-2 border-dashed border-[#3159c9] bg-[#edf1fd] p-3"
          : "rounded-xl border-2 border-dashed border-transparent p-1"
      }
    >
      {children}
      {isDragging ? (
        <p className="mt-2 text-sm font-medium text-[#3159c9]">
          Drop files here to upload
        </p>
      ) : (
        <p className="mt-1 text-xs text-[#667389]">
          Or drag files here to upload them.
        </p>
      )}
      {uploads.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1" aria-live="polite">
          {uploads.map((upload) => (
            <li key={upload.name} className="text-sm">
              <span className="font-medium">{upload.name}</span>{" "}
              {upload.status === "uploading" ? (
                <span className="text-[#667389]">Uploading…</span>
              ) : upload.status === "done" ? (
                <span className="text-[#1a7f37]">Uploaded</span>
              ) : (
                <span className="text-[#b3261e]">
                  {upload.error ?? "Could not upload."}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function FolderActions({
  folder,
  folders,
}: {
  folder: FolderRow;
  folders: FolderRow[];
}) {
  const [renameState, renameAction, renamePending] = useActionState(
    renameFolder,
    idle
  );
  const [moveState, moveAction, movePending] = useActionState(moveFolder, idle);
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteFolder,
    idle
  );
  const moveTargets = folders.filter((f) => f.id !== folder.id);
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-[#3159c9] hover:underline">
        Manage
      </summary>
      <div className="mt-2 flex flex-col gap-2 rounded-lg border border-[#dce3ec] bg-white p-2">
        <form action={renameAction} className="flex items-center gap-1.5">
          <input type="hidden" name="folderId" value={folder.id} />
          <input
            name="name"
            defaultValue={folder.name}
            required
            maxLength={100}
            aria-label={`Rename folder ${folder.name}`}
            className="h-8 min-w-0 flex-1 rounded-md border border-[#dce3ec] px-2 text-xs"
          />
          <button
            type="submit"
            disabled={renamePending}
            className={subtleButtonClass}
          >
            Rename
          </button>
        </form>
        <FormError state={renameState} />
        <form action={moveAction} className="flex items-center gap-1.5">
          <input type="hidden" name="folderId" value={folder.id} />
          <label className="sr-only" htmlFor={`move-folder-${folder.id}`}>
            Move folder to
          </label>
          <select
            id={`move-folder-${folder.id}`}
            name="targetParentId"
            defaultValue={folder.parent_id ?? ""}
            className="h-8 min-w-0 flex-1 rounded-md border border-[#dce3ec] bg-white px-2 text-xs"
          >
            <option value="">Workspace root</option>
            {moveTargets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={movePending}
            className={subtleButtonClass}
          >
            Move
          </button>
        </form>
        <FormError state={moveState} />
        <form action={deleteAction}>
          <input type="hidden" name="folderId" value={folder.id} />
          <button
            type="submit"
            disabled={deletePending}
            className={dangerButtonClass}
          >
            Move to Trash
          </button>
        </form>
        <FormError state={deleteState} />
      </div>
    </details>
  );
}

export function DocumentActions({
  document,
  folders,
  starred,
  hasFile,
  openHref,
  exportHref,
  pdfToolsHref,
  pdfEditHref,
  pdfAnnotateHref,
  pdfDrawHref,
  pdfStampHref,
  pdfSecurityHref,
  pdfFormHref,
  pdfBuilderHref,
  ocrHref,
  convertHref,
  extractTextHref,
  exportImagesHref,
  versionsHref,
  shareHref,
}: {
  document: { id: string; title: string; folder_id: string | null };
  folders: FolderRow[];
  starred: boolean;
  hasFile: boolean;
  /** Link to the editor page, or null when the file cannot be opened. */
  openHref: string | null;
  /** Link to the PDF export route, or null when the file cannot be exported. */
  exportHref: string | null;
  /** Link to the PDF tools page, or null when the file is not a PDF. */
  pdfToolsHref: string | null;
  /** Link to the PDF edit page, or null when the file is not a PDF. */
  pdfEditHref: string | null;
  /** Link to the PDF annotation page, or null when the file is not a PDF. */
  pdfAnnotateHref: string | null;
  /** Link to the PDF draw page, or null when the file is not a PDF. */
  pdfDrawHref: string | null;
  /** Link to the stamps & watermarks page, or null when the file is not a PDF. */
  pdfStampHref: string | null;
  /** Link to the PDF security page, or null when the file is not a PDF. */
  pdfSecurityHref: string | null;
  /** Link to the PDF form-fill page, or null when the file is not a PDF. */
  pdfFormHref: string | null;
  /** Link to the PDF form-builder page, or null when the file is not a PDF. */
  pdfBuilderHref: string | null;
  /** Link to the OCR page, or null when the file is not a PDF, PNG or JPEG. */
  ocrHref: string | null;
  /** Link to the convert page, or null when the file cannot be converted. */
  convertHref: string | null;
  /** Link to the extract-text download, or null when the file is not a PDF. */
  extractTextHref: string | null;
  /** Link to the export-images download, or null when the file is not a PDF. */
  exportImagesHref: string | null;
  /** Link to the versions page, or null when the file has no versions yet. */
  versionsHref: string | null;
  /** Link to the share page, or null when the document has no file yet. */
  shareHref: string | null;
}) {
  const [renameState, renameAction, renamePending] = useActionState(
    renameDocument,
    idle
  );
  const [moveState, moveAction, movePending] = useActionState(
    moveDocument,
    idle
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteDocument,
    idle
  );
  const [duplicateState, duplicateAction, duplicatePending] = useActionState(
    duplicateDocument,
    idle
  );
  const [saveTemplateState, saveTemplateAction, saveTemplatePending] =
    useActionState(saveAsTemplate, idle);
  const [starState, starAction, starPending] = useActionState(toggleStar, idle);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <form action={starAction}>
        <input type="hidden" name="documentId" value={document.id} />
        <input
          type="hidden"
          name="starred"
          value={starred ? "false" : "true"}
        />
        <button
          type="submit"
          disabled={starPending}
          aria-label={
            starred ? `Unstar ${document.title}` : `Star ${document.title}`
          }
          title={starred ? "Remove star" : "Star"}
          className={subtleButtonClass}
        >
          {starred ? "★ Starred" : "☆ Star"}
        </button>
      </form>
      {hasFile ? (
        <a
          href={`/api/documents/${document.id}/download`}
          className={subtleButtonClass}
        >
          Download
        </a>
      ) : null}
      {exportHref ? (
        <a href={exportHref} className={subtleButtonClass}>
          Export as PDF
        </a>
      ) : null}
      {pdfToolsHref ? (
        <a href={pdfToolsHref} className={subtleButtonClass}>
          PDF tools
        </a>
      ) : null}
      {pdfEditHref ? (
        <a href={pdfEditHref} className={subtleButtonClass}>
          Edit PDF
        </a>
      ) : null}
      {pdfAnnotateHref ? (
        <a href={pdfAnnotateHref} className={subtleButtonClass}>
          Annotate
        </a>
      ) : null}
      {pdfDrawHref ? (
        <a href={pdfDrawHref} className={subtleButtonClass}>
          Draw on PDF
        </a>
      ) : null}
      {pdfStampHref ? (
        <a href={pdfStampHref} className={subtleButtonClass}>
          Stamps &amp; watermarks
        </a>
      ) : null}
      {pdfSecurityHref ? (
        <a href={pdfSecurityHref} className={subtleButtonClass}>
          PDF security
        </a>
      ) : null}
      {extractTextHref ? (
        <a href={extractTextHref} className={subtleButtonClass}>
          Extract text
        </a>
      ) : null}
      {exportImagesHref ? (
        <a href={exportImagesHref} className={subtleButtonClass}>
          Export images
        </a>
      ) : null}
      {versionsHref ? (
        <a href={versionsHref} className={subtleButtonClass}>
          Versions
        </a>
      ) : null}
      {shareHref ? (
        <a href={shareHref} className={subtleButtonClass}>
          Share
        </a>
      ) : null}
      {pdfFormHref ? (
        <a href={pdfFormHref} className={subtleButtonClass}>
          Fill form
        </a>
      ) : null}
      {pdfBuilderHref ? (
        <a href={pdfBuilderHref} className={subtleButtonClass}>
          Build form
        </a>
      ) : null}
      {ocrHref ? (
        <a href={ocrHref} className={subtleButtonClass}>
          OCR
        </a>
      ) : null}
      {convertHref ? (
        <a href={convertHref} className={subtleButtonClass}>
          Convert
        </a>
      ) : null}
      {openHref ? (
        <a
          href={openHref}
          className="inline-flex h-8 items-center rounded-lg bg-[#3159c9] px-2.5 text-xs font-medium text-white hover:bg-[#2548a8]"
        >
          Open in editor
        </a>
      ) : (
        <button
          type="button"
          disabled
          title={
            hasFile
              ? "This file format cannot be opened in the editor."
              : "This document has no file to open yet."
          }
          className="inline-flex h-8 cursor-not-allowed items-center rounded-lg border border-[#dce3ec] bg-[#f4f6fa] px-2.5 text-xs font-medium text-[#667389] opacity-70"
        >
          Open
        </button>
      )}
      <details className="text-xs">
        <summary className="cursor-pointer text-[#3159c9] hover:underline">
          Manage
        </summary>
        <div className="mt-2 flex flex-col gap-2 rounded-lg border border-[#dce3ec] bg-white p-2">
          <form action={renameAction} className="flex items-center gap-1.5">
            <input type="hidden" name="documentId" value={document.id} />
            <input
              name="title"
              defaultValue={document.title}
              required
              maxLength={200}
              aria-label={`Rename document ${document.title}`}
              className="h-8 min-w-0 flex-1 rounded-md border border-[#dce3ec] px-2 text-xs"
            />
            <button
              type="submit"
              disabled={renamePending}
              className={subtleButtonClass}
            >
              Rename
            </button>
          </form>
          <FormError state={renameState} />
          <form action={moveAction} className="flex items-center gap-1.5">
            <input type="hidden" name="documentId" value={document.id} />
            <label className="sr-only" htmlFor={`move-doc-${document.id}`}>
              Move document to
            </label>
            <select
              id={`move-doc-${document.id}`}
              name="targetFolderId"
              defaultValue={document.folder_id ?? ""}
              className="h-8 min-w-0 flex-1 rounded-md border border-[#dce3ec] bg-white px-2 text-xs"
            >
              <option value="">Workspace root</option>
              {folders.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={movePending}
              className={subtleButtonClass}
            >
              Move
            </button>
          </form>
          <FormError state={moveState} />
          <form action={duplicateAction}>
            <input type="hidden" name="documentId" value={document.id} />
            <button
              type="submit"
              disabled={duplicatePending}
              className={subtleButtonClass}
            >
              Duplicate
            </button>
          </form>
          <FormError state={duplicateState} />
          {hasFile ? (
            <>
              <form
                action={saveTemplateAction}
                className="flex flex-col gap-1.5"
              >
                <input type="hidden" name="documentId" value={document.id} />
                <input
                  name="name"
                  defaultValue={document.title}
                  required
                  maxLength={200}
                  aria-label={`Template name for ${document.title}`}
                  placeholder="Template name"
                  className="h-8 min-w-0 flex-1 rounded-md border border-[#dce3ec] px-2 text-xs"
                />
                <input
                  name="description"
                  maxLength={500}
                  aria-label={`Template description for ${document.title}`}
                  placeholder="Description (optional)"
                  className="h-8 min-w-0 flex-1 rounded-md border border-[#dce3ec] px-2 text-xs"
                />
                <button
                  type="submit"
                  disabled={saveTemplatePending}
                  className={subtleButtonClass}
                >
                  Save as template
                </button>
              </form>
              <FormError state={saveTemplateState} />
            </>
          ) : null}
          <form action={deleteAction}>
            <input type="hidden" name="documentId" value={document.id} />
            <button
              type="submit"
              disabled={deletePending}
              className={dangerButtonClass}
            >
              Move to Trash
            </button>
          </form>
          <FormError state={deleteState} />
        </div>
      </details>
      <FormError state={starState} />
    </div>
  );
}

export function TrashActions({
  kind,
  id,
}: {
  kind: "folder" | "document";
  id: string;
}) {
  const [restoreState, restoreAction, restorePending] = useActionState(
    kind === "folder" ? restoreFolder : restoreDocument,
    idle
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    kind === "folder" ? permanentDeleteFolder : permanentDeleteDocument,
    idle
  );
  const field = kind === "folder" ? "folderId" : "documentId";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <form action={restoreAction}>
        <input type="hidden" name={field} value={id} />
        <button
          type="submit"
          disabled={restorePending}
          className={subtleButtonClass}
        >
          Restore
        </button>
      </form>
      <form
        action={deleteAction}
        onSubmit={(event) => {
          if (
            !window.confirm(
              "Permanently delete this item? Its files are removed and cannot be recovered."
            )
          ) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name={field} value={id} />
        <button
          type="submit"
          disabled={deletePending}
          className={dangerButtonClass}
        >
          Delete forever
        </button>
      </form>
      <FormError state={restoreState} />
      <FormError state={deleteState} />
    </div>
  );
}
