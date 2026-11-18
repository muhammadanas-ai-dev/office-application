// Templates gallery (Day 16).
//
// Forma's own original templates — resume, letter, report. Each
// card shows the template's first-page thumbnail, what it is for,
// a preview of its real content, and a form to create a new
// document from it. Applying a template copies the template file
// into the user's library as a new document (version 1); the
// template itself is never changed.
import type { Metadata } from "next";
import Image from "next/image";
import { ApplyTemplateForm } from "@/components/library/library-forms";
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

export default function TemplatesPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-xl font-semibold">Templates</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Start from one of Forma&apos;s own templates. Applying one creates a new
        document in your files — the template itself never changes, and you
        replace the bracketed placeholders with your own details.
      </p>
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
