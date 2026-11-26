"use client";

// Document properties client (F29): library facts for every
// document, plus the PDF information dictionary with an
// edit form (edits are written into the file as a new
// version).
import { useEffect, useState } from "react";

interface PropertiesData {
  document: {
    id: string;
    title: string;
    mimeType: string;
    sizeBytes: number | null;
    version: number;
    createdAt: string;
    updatedAt: string;
    hasFile: boolean;
  };
  pdf: {
    title: string;
    author: string;
    subject: string;
    keywords: string;
    creator: string;
    producer: string;
    createdAt: string | null;
    modifiedAt: string | null;
    pageCount: number;
  } | null;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("en-GB");
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap gap-2 py-1.5">
      <dt className="w-36 shrink-0 text-xs font-medium text-[#667389]">
        {label}
      </dt>
      <dd className="min-w-0 text-sm break-words text-[#202b3c]">{value}</dd>
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-[#dce3ec] px-2 py-1.5 text-sm";

export function DocumentPropertiesClient({
  documentId,
}: {
  documentId: string;
}) {
  const [data, setData] = useState<PropertiesData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [subject, setSubject] = useState("");
  const [keywords, setKeywords] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function load() {
    const response = await fetch(`/api/documents/${documentId}/properties`);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      throw new Error(body?.error ?? "Could not load the properties.");
    }
    const json = (await response.json()) as PropertiesData;
    setData(json);
    if (json.pdf) {
      setTitle(json.pdf.title);
      setAuthor(json.pdf.author);
      setSubject(json.pdf.subject);
      setKeywords(json.pdf.keywords);
    }
  }

  useEffect(() => {
    load().catch((loadFailure) =>
      setLoadError(
        loadFailure instanceof Error
          ? loadFailure.message
          : "Could not load the properties."
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  async function onSave(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(
        `/api/documents/${documentId}/pdf/metadata`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, author, subject, keywords }),
        }
      );
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        version?: number;
      } | null;
      if (!response.ok) {
        throw new Error(body?.error ?? "Could not save the properties.");
      }
      setSuccess(
        `Properties saved into the PDF as version ${body?.version}. The earlier version is unchanged.`
      );
      await load();
    } catch (saveFailure) {
      setError(
        saveFailure instanceof Error
          ? saveFailure.message
          : "Could not save the properties."
      );
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <p role="alert" className="text-sm text-red-700">
        {loadError}
      </p>
    );
  }
  if (!data) {
    return <p className="text-sm text-[#667389]">Loading properties…</p>;
  }
  const doc = data.document;
  const pdf = data.pdf;
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-[#dce3ec] bg-white p-4">
        <h2 className="text-sm font-semibold text-[#202b3c]">In Forma</h2>
        <dl className="mt-2 divide-y divide-[#eef1f6]">
          <Row label="Title" value={doc.title} />
          <Row label="Type" value={doc.mimeType} />
          <Row label="Size" value={formatBytes(doc.sizeBytes)} />
          <Row label="Version" value={String(doc.version)} />
          <Row label="Created" value={formatDate(doc.createdAt)} />
          <Row label="Last modified" value={formatDate(doc.updatedAt)} />
        </dl>
      </section>
      {pdf ? (
        <section className="rounded-xl border border-[#dce3ec] bg-white p-4">
          <h2 className="text-sm font-semibold text-[#202b3c]">
            Inside the PDF file
          </h2>
          <dl className="mt-2 divide-y divide-[#eef1f6]">
            <Row label="Pages" value={String(pdf.pageCount)} />
            <Row label="Creator" value={pdf.creator || "—"} />
            <Row label="Producer" value={pdf.producer || "—"} />
            <Row label="File created" value={formatDate(pdf.createdAt)} />
            <Row label="File modified" value={formatDate(pdf.modifiedAt)} />
          </dl>
          <form onSubmit={onSave} className="mt-3 space-y-2">
            <p className="text-xs text-[#667389]">
              These fields are stored inside the PDF itself and travel with
              the file when you share or download it. Saving writes them as a
              new version.
            </p>
            <label className="block">
              <span className="text-xs font-medium text-[#667389]">
                Title in the file
              </span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={300}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-[#667389]">Author</span>
              <input
                value={author}
                onChange={(event) => setAuthor(event.target.value)}
                maxLength={200}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-[#667389]">
                Subject
              </span>
              <input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                maxLength={500}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-[#667389]">
                Keywords (comma separated)
              </span>
              <input
                value={keywords}
                onChange={(event) => setKeywords(event.target.value)}
                maxLength={500}
                className={inputClass}
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-[#3159c9] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save into the PDF"}
            </button>
            {error ? (
              <p role="alert" className="text-xs text-red-700">
                {error}
              </p>
            ) : null}
            {success ? (
              <p className="text-xs text-[#667389]">{success}</p>
            ) : null}
          </form>
        </section>
      ) : (
        <p className="text-sm text-[#667389]">
          {doc.hasFile
            ? "This is not a PDF, so there is no in-file property set to show."
            : "This document has no file yet, so there are no in-file properties."}
        </p>
      )}
    </div>
  );
}
