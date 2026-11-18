// Download a document through a public share link (Day 25).
//
// GET /s/[token]/download — no sign-in (the token itself is
// the credential). The token is hashed, the share row is
// looked up, and revocation + expiry are checked. If the link
// is live, a signed Storage URL is minted for the document's
// CURRENT version (the Day 4 pattern, 1 hour) and the browser
// is redirected to it. A dead link returns 404 — it does not
// say whether the token ever existed.
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DOCUMENTS_BUCKET } from "@/lib/storage";
import { resolveShare } from "@/lib/sharing.server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const resolved = await resolveShare(token);
  if (!resolved.ok) {
    return NextResponse.json(
      { error: "This link is not valid." },
      { status: 404 }
    );
  }
  const admin = createAdminClient();
  const { data: signed, error: signError } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(resolved.document.file_path, 3600);
  if (signError || !signed) {
    console.error("[share download]", signError);
    return NextResponse.json(
      { error: "Could not prepare the download." },
      { status: 500 }
    );
  }
  return NextResponse.redirect(signed.signedUrl);
}
