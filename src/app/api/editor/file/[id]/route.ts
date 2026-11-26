// Controlled file fetch for the document server (Day 5).
//
// The document server has no user session, so the request carries a
// short-lived HMAC token minted when the editor config was built
// (see src/features/editor/config.ts). The token names one document
// version and expires within an hour; a token for another document,
// an expired token or a bad signature is rejected before any byte
// is read. The file itself is streamed from private Storage via the
// admin client — the token is the authorization.
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyFileToken } from "@/lib/editor";
import { getFileTokenSecret } from "@/lib/editor.server";
import { logError } from "@/lib/log";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = new URL(request.url).searchParams.get("t") ?? "";
  const verification = verifyFileToken(getFileTokenSecret(), token);
  if (!verification.ok) {
    return NextResponse.json({ error: verification.error }, { status: 403 });
  }
  if (verification.payload.documentId !== id) {
    return NextResponse.json(
      { error: "Token does not match this document" },
      { status: 403 }
    );
  }

  const admin = createAdminClient();
  const { data: document, error } = await admin
    .from("documents")
    .select("id, file_path, mime_type, title, version")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    logError("editor file", error);
    return NextResponse.json(
      { error: "Could not load the document" },
      { status: 500 }
    );
  }
  if (!document || !document.file_path) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }
  if (document.version !== verification.payload.version) {
    return NextResponse.json(
      { error: "Token is for an older version" },
      { status: 403 }
    );
  }

  const { data: file, error: downloadError } = await admin.storage
    .from("documents")
    .download(document.file_path);
  if (downloadError || !file) {
    logError("editor file", downloadError);
    return NextResponse.json(
      { error: "Could not read the file" },
      { status: 500 }
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "content-type": document.mime_type ?? "application/octet-stream",
      "content-disposition": `attachment; filename="${encodeURIComponent(document.title)}"`,
      "cache-control": "no-store",
    },
  });
}
