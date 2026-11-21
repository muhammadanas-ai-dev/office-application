// Templates gallery (Day 16, extended Day 30 + Day 31).
//
// Forma's own original templates — resume, letter, report,
// proposal, invoice, minutes, certificate, budget tracker,
// pitch deck. Each card shows the template's first-page
// thumbnail, what it is for, a preview of its real content,
// and a form to create a new document from it. Applying a
// template copies the template file into the user's library
// as a new document (version 1); the template itself is never
// changed.
//
// Day 31: a "My templates" section above the built-in
// templates lists the user's own custom templates (saved from
// one of their documents). A custom template has no thumbnail
// and no content preview — it shows the file-type icon, its
// name, description and file type, with a form to use it and
// forms to rename or delete it.
import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import {
  ApplyTemplateForm,
  ApplyUserTemplateForm,
  DeleteUserTemplateForm,
  RenameUserTemplateForm,
} from "@/components/library/library-forms";
import {
  FileTypeIcon,
  fileTypeLabel,
} from "@/components/library/file-type-icon";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/features/library/queries";
import { listUserTemplates } from "@/lib/user-templates.server";
import { TEMPLATES, type TemplatePreviewEntry } from "@/lib/templates";

export const metadata: Metadata = { title: "Templates — Forma Office" };

function PreviewEntry({ entry }: { entry: TemplatePreviewEntry }) {
  if (entry.style === "Title") {
    return <p className="text-base font-bold">{entry.text}</p>;
  }
  if (entry.style === "Heading1") {
    return <p className="mt-3 text-sm font-bold">{entry.text}</p>;
  }
  if (entry.style === "Heading2") {
    return <p className="mt-2 text-sm font-semibold">{entry.text}</p>;
  }
  if (entry.style === "Table") {
    return (
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        {entry.text}
      </p>
    );
  }
  return (
    <p className="text-sm text-neutral-600 dark:text-neutral-400">
      {entry.text}
    </p>
  );
}

export default async function TemplatesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/templates");

  // The user's own custom templates. If the user_templates table
  // does not exist yet (the Day 31 migration not applied), the
  // built-in gallery still renders and the section shows the
  // honest setup note instead of failing the whole page.
  let userTemplates: Awaited<ReturnType<typeof listUserTemplates>> = [];
  let setupError: string | null = null;
  try {
    const workspace = await getCurrentWorkspace(supabase, user.id);
    if (workspace) {
      userTemplates = await listUserTemplates(supabase, workspace.id);
    }
  } catch (err) {
    setupError =
      err instanceof Error ? err.message : "Could not load your templates.";
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-xl font-semibold">Templates</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Start from one of Forma&apos;s own templates. Applying one creates a new
        document in your files — the template itself never changes, and you
        replace the bracketed placeholders with your own details.
      </p>
      <h2 className="mt-8 text-base font-semibold">My templates</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Templates you saved from your own documents. Save one from a
        document&apos;s Manage menu in your files — it is a snapshot of the
        document at save time, so later edits to the document never change it.
      </p>
      {setupError ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Your templates are not set up yet — apply the Day 31 migration in the
          Supabase dashboard first.
        </p>
      ) : userTemplates.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-500">
          No custom templates yet. Save one from a document&apos;s Manage menu.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {userTemplates.map((template) => (
            <article
              key={template.id}
              className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div className="flex items-start gap-3">
                <FileTypeIcon mimeType={template.mime_type} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                    {fileTypeLabel(template.mime_type)} · Saved{" "}
                    {new Date(template.created_at).toLocaleDateString()}
                  </p>
                  <h3 className="mt-1 text-base font-semibold">
                    {template.name}
                  </h3>
                  {template.description ? (
                    <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                      {template.description}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="mt-4 border-t border-neutral-200 pt-4 dark:border-neutral-800">
                <ApplyUserTemplateForm
                  templateId={template.id}
                  templateName={template.name}
                  folderId={null}
                />
              </div>
              <details className="mt-4 text-xs">
                <summary className="cursor-pointer text-[#3159c9] hover:underline">
                  Manage this template
                </summary>
                <div className="mt-2 flex flex-col gap-2 rounded-lg border border-[#dce3ec] bg-white p-2">
                  <RenameUserTemplateForm
                    templateId={template.id}
                    templateName={template.name}
                    templateDescription={template.description}
                  />
                  <DeleteUserTemplateForm
                    templateId={template.id}
                    templateName={template.name}
                  />
                </div>
              </details>
            </article>
          ))}
        </div>
      )}
      <h2 className="mt-8 text-base font-semibold">Forma templates</h2>
      <div className="mt-6 flex flex-col gap-6">
        {TEMPLATES.map((template) => (
          <article
            key={template.id}
            className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="flex flex-col gap-4 sm:flex-row">
              <Image
                src={template.thumbnailPath}
                alt={`First page of the ${template.name} template`}
                width={425}
                height={550}
                className="w-full max-w-[220px] rounded-lg border border-neutral-200 dark:border-neutral-700"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  {template.category}
                </p>
                <h2 className="mt-1 text-lg font-semibold">{template.name}</h2>
                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                  {template.description}
                </p>
                <div className="mt-3">
                  {template.preview.slice(0, 8).map((entry, index) => (
                    <PreviewEntry key={index} entry={entry} />
                  ))}
                  {template.preview.length > 8 ? (
                    <p className="mt-2 text-sm text-neutral-500">
                      …and {template.preview.length - 8} more lines in the
                      template.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="mt-4 border-t border-neutral-200 pt-4 dark:border-neutral-800">
              <ApplyTemplateForm
                templateId={template.id}
                templateName={template.name}
                folderId={null}
              />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
