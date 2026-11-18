// Restore one version of a document (Day 23).
//
// POST /api/documents/[id]/versions/[version]/restore
// Restoring downloads the old version's file and saves it as a
// NEW version (current + 1). It never overwrites and never
// deletes: the old versions stay, and the restore itself is a
// new version in the list. Returns { ok, version } (the new
// version number).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PdfEditError } from "@/lib/pdf-edit";
import { restoreVersion } from "@/lib/versions.server";

export async function POST(
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

  try {
    const newVersion = await restoreVersion(
      supabase,
      id,
      versionNumber,
      user.id
    );
    return NextResponse.json({ ok: true, version: newVersion });
  } catch (error) {
    if (error instanceof PdfEditError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("[version restore]", error);
    return NextResponse.json(
      { error: "Could not restore this version." },
      { status: 500 }
    );
  }
}
