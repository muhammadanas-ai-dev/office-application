// Download one version of a document (Day 23).
//
// GET /api/documents/[id]/versions/[version]/download
// The version row is fetched through the signed-in user's
// client, so RLS decides access; a signed Storage URL is then
// minted for that same user and the browser is redirected to
// it (the Day 4 download pattern). The URL expires after one
// hour. The version's file is never modified.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DOCUMENTS_BUCKET } from "@/lib/storage";
import { logError } from "@/lib/log";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; version: string }> }
) {
  const { id, version } = await params;
  const versionNumber = Number(version);
  if (!Number.isInteger(versionNumber) || versionNumber < 1) {
    return NextResponse.json(
      { error: "The version must be a positive whole number." },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: versionRow, error } = await supabase
    .from("document_versions")
    .select("file_path")
    .eq("document_id", id)
    .eq("version_number", versionNumber)
    .maybeSingle();
  if (error) {
    logError("version download", error);
    return NextResponse.json(
      { error: "Could not load this version" },
      { status: 500 }
    );
  }
  if (!versionRow) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }

  const { data: signed, error: signError } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(versionRow.file_path, 3600);
  if (signError || !signed) {
    logError("version download", signError);
    return NextResponse.json(
      { error: "Could not prepare the download" },
      { status: 500 }
    );
  }

  return NextResponse.redirect(signed.signedUrl);
}
