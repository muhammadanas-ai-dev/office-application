// Shared page (Day 28) — the share links the user created,
// across all their documents.
//
// Multi-user sharing ("Shared with me" — documents others
// shared with you) is skipped, so this page lists the links
// the user created themselves: the document, when the link
// expires, and whether it is live, expired or revoked, with
// a Revoke button per live link.
//
// The full link is NOT shown here. The token is returned ONCE,
// at creation, and the database only holds its hash — so the
// link cannot be reconstructed later. The page says this
// plainly: if the link is lost, revoke it and create a new one.
import { redirect } from "next/navigation";
import { Share2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { listMyShares } from "@/lib/sharing.server";
import { SharedListClient } from "@/components/sharing/shared-list-client";

export const metadata = {
  title: "Shared — Forma Office",
};

export default async function SharedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/shared");

  let shares: Awaited<ReturnType<typeof listMyShares>> = [];
  let setupError: string | null = null;
  try {
    shares = await listMyShares(supabase, user.id);
  } catch (err) {
    setupError =
      err instanceof Error ? err.message : "Could not load the share links.";
  }

  if (setupError) {
    return (
      <EmptyState
        icon={Share2}
        title="Sharing is not set up yet"
        description={setupError}
      />
    );
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-[#202b3c]">Shared</h1>
      <p className="mb-6 text-sm text-[#667389]">
        The share links you created. Anyone with a link can download that
        document — no account needed. A link stops working when it expires or
        when you revoke it.
      </p>
      <p className="mb-6 rounded-lg border border-[#dce3ec] bg-white p-3 text-sm text-[#5b6b7f]">
        The link itself is shown only once, when you create it — it cannot be
        shown again afterwards. If you lost a link, revoke it here and create a
        new one from the document.
      </p>
      {shares.length === 0 ? (
        <EmptyState
          icon={Share2}
          title="No share links yet"
          description="Create one from a document's Share page — pick how long it lasts, and copy the link when it is shown."
        />
      ) : (
        <SharedListClient shares={shares} />
      )}
    </div>
  );
}
