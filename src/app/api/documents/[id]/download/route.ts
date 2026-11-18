// Signed download for a document file (Day 4).
//
// The document row is fetched through the signed-in user's client,
// so RLS decides access; the signed Storage URL is then minted for
// that same user and redirects the browser to it. The URL expires
// after one hour and reveals nothing about other workspaces.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DOCUMENTS_BUCKET } from "@/lib/storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: document, error } = await supabase
    .from("documents")
    .select("id, file_path")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    console.error("[download]", error);
    return NextResponse.json(
      { error: "Could not load the document" },
      { status: 500 }
    );
  }
  if (!document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }
  if (!document.file_path) {
    return NextResponse.json(
      { error: "This document has no file yet" },
      { status: 404 }
    );
  }

  const { data: signed, error: signError } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(document.file_path, 3600);
  if (signError || !signed) {
    console.error("[download]", signError);
    return NextResponse.json(
      { error: "Could not prepare the download" },
      { status: 500 }
    );
  }

  return NextResponse.redirect(signed.signedUrl);
}
