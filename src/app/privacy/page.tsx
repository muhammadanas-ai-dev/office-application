// Privacy — what Forma Office stores and where it goes.
// A public page (no sign-in needed). This is a disclosure in
// plain language, not a legal review — the owner should have a
// lawyer read it before a public release (noted on the page).

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy — Forma Office",
  description:
    "What Forma Office stores, where it is stored, and which external services process your documents.",
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="mb-2 text-lg font-semibold text-[#202b3c]">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-[#3d4b5e]">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="mb-2 text-2xl font-bold text-[#202b3c]">Privacy</h1>
      <p className="mb-8 text-sm text-[#5b6b7f]">
        What Forma Office stores, where it is stored, and which services process
        your documents. Last updated 19 November 2026.
      </p>

      <Section title="What we store">
        <p>
          Your account (email address and display name), your workspace and
          folders, your documents and their version history, and the results of
          the work you ask for: OCR text, share links, and your preferences (OCR
          language, image export format and DPI). That is all — there is no
          analytics, no advertising, and no tracking.
        </p>
      </Section>

      <Section title="Where it is stored">
        <p>
          Your data lives in Supabase (database, authentication and file
          storage), in the ap-southeast-1 region. Your documents are stored as
          private files — only members of your workspace can read them, and a
          share link works only for the document it was made for, until it
          expires or you revoke it.
        </p>
      </Section>

      <Section title="Which services process your documents">
        <p>
          Editing and conversion send the document to the ONLYOFFICE document
          server (the editor you see in the app). The document server processes
          the file so you can edit it and export it — it is not an advertising
          or analytics service.
        </p>
        <p>
          Text recognition (OCR) runs locally on the app server with Tesseract.
          The image never leaves the server for OCR.
        </p>
        <p>Nothing is sent to an AI service. The app has no AI features.</p>
      </Section>

      <Section title="How long we keep it">
        <p>
          Until you delete it. Deleting a document moves it to Trash, where you
          can restore it; deleting it from Trash removes it. There is no
          automatic expiry of your documents.
        </p>
      </Section>

      <Section title="Deleting your data">
        <p>
          Delete a document from Trash to remove it and its versions. To delete
          your whole account (and everything in your workspace), contact the
          workspace owner — there is no self-service account deletion yet.
        </p>
      </Section>

      <Section title="A note on this page">
        <p>
          This page is a plain-language disclosure, not a legal review. It will
          be reviewed by a lawyer before any public release.
        </p>
      </Section>

      <p className="text-sm">
        <Link href="/home" className="text-[#3159c9] underline">
          Back to Forma Office
        </Link>
      </p>
    </main>
  );
}
