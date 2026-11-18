import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Suspense } from "react";
import { FormaLogo } from "@/components/brand/forma-logo";

// With Cache Components on, the request-time Supabase check lives
// inside a <Suspense> boundary so only that part streams at request
// time and the rest of the page can prerender.
async function ConnectionStatus() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const configured = url.startsWith("https://") && url.includes(".supabase.co");
  let reachable = false;
  let error: string | null = null;

  if (configured) {
    try {
      const supabase = await createClient();
      const { error: sessionError } = await supabase.auth.getSession();
      if (sessionError) error = sessionError.message;
      else reachable = true;
    } catch (err) {
      error = err instanceof Error ? err.message : "Unknown error";
    }
  }

  return (
    <p>
      Supabase:{" "}
      {reachable ? (
        <span className="font-semibold text-[#2b8c83]">Connected</span>
      ) : (
        <span className="font-semibold text-[#c83f4d]">
          Not connected{error ? ` — ${error}` : ""}
        </span>
      )}{" "}
      · Region: {process.env.SUPABASE_REGION ?? "—"} ·{" "}
      <a className="underline" href="/api/supabase-status">
        JSON check
      </a>
    </p>
  );
}

// Forma Office — Day 1 wireframe. No fake functionality: actions that
// are not built yet are disabled and labelled with the day they land.
export default function Home() {
  return (
    <div className="min-h-screen bg-[#f4f6fa] font-sans text-[#202b3c]">
      <header className="border-b border-[#dce3ec] bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-4">
          <FormaLogo />
          <span className="ml-2 rounded-full border border-[#dce3ec] bg-[#edf1f6] px-2 py-0.5 text-xs text-[#667389]">
            Day 3 · day-03
          </span>
          <nav className="ml-auto flex gap-4 text-sm" aria-label="Workspace">
            <Link
              href="/"
              aria-current="page"
              className="font-semibold text-[#3159c9]"
            >
              Home
            </Link>
            <Link href="/files" className="text-[#667389] hover:text-[#202b3c]">
              My files
            </Link>
            <Link
              href="/templates"
              className="text-[#667389] hover:text-[#202b3c]"
            >
              Templates
            </Link>
            <Link
              href="/auth/login"
              className="text-[#667389] hover:text-[#202b3c]"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="max-w-2xl text-3xl font-semibold leading-tight text-[#17253b] sm:text-4xl">
          Your work deserves a better document workspace.
        </h1>
        <p className="mt-3 max-w-xl text-base text-[#667389]">
          Create, edit, organize and share professional documents in one clear
          workspace. Writer-first — documents, made precise.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/home"
            className="inline-flex h-10 items-center rounded-lg bg-[#3159c9] px-5 text-sm font-medium text-white"
          >
            Open workspace
          </Link>
          <button
            type="button"
            disabled
            className="h-10 rounded-lg border border-[#dce3ec] bg-white px-5 text-sm font-medium opacity-60"
            title="Coming Day 4–5: document creation needs auth, library and the editor engine"
          >
            Create a document — coming Day 4–5
          </button>
          <button
            type="button"
            disabled
            className="h-10 rounded-lg border border-[#dce3ec] bg-white px-5 text-sm font-medium opacity-60"
            title="Coming Day 4: upload needs auth, library and private storage"
          >
            Upload a file — coming Day 4
          </button>
        </div>

        <section
          className="mt-10 grid gap-4 sm:grid-cols-3"
          aria-label="Day 1 status"
        >
          <div className="rounded-xl border border-[#dce3ec] bg-white p-5">
            <h2 className="text-sm font-semibold">Platform</h2>
            <p className="mt-2 text-sm text-[#667389]">
              Next.js 16 · TypeScript · Supabase · Tailwind + shadcn/ui
            </p>
            <div className="mt-3 text-sm">
              <Suspense fallback={<p>Checking Supabase…</p>}>
                <ConnectionStatus />
              </Suspense>
            </div>
          </div>
          <div className="rounded-xl border border-[#dce3ec] bg-white p-5">
            <h2 className="text-sm font-semibold">Editor engine</h2>
            <p className="mt-2 text-sm text-[#667389]">
              ONLYOFFICE Docs, licence-gated. No document server deployed yet.
              Commercial launch is blocked until the owner decides — see
              ADR-001.
            </p>
            <p className="mt-3 text-sm">
              <a className="underline" href="/api/db-status">
                Direct Postgres check
              </a>{" "}
              · direct DB does not connect from this machine; REST does.
            </p>
          </div>
          <div className="rounded-xl border border-[#dce3ec] bg-white p-5">
            <h2 className="text-sm font-semibold">Day 3 — in progress</h2>
            <p className="mt-2 text-sm text-[#667389]">
              Supabase Auth (sign up, sign in, reset password), profiles,
              workspaces and membership with row-level security. The migration
              still needs applying in the Supabase dashboard — see
              docs/architecture/schema-and-rls.md.
            </p>
            <p className="mt-3 text-sm">
              Next: Day 4 — document library and private storage.
            </p>
          </div>
        </section>

        <p className="mt-8 max-w-2xl text-xs leading-relaxed text-[#667389]">
          Forma Office is an original, clean-room product. It does not use WPS
          logos, trademarks, proprietary templates or copied screens. No feature
          is claimed complete until it is implemented, tested and evidenced. See
          docs/known-limitations.md.
        </p>
      </main>
    </div>
  );
}
