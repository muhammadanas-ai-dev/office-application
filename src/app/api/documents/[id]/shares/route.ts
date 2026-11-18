// Share links for a document (Day 25).
//
// POST /api/documents/[id]/shares — create a link (body:
// { expiry: "1d" | "7d" | "30d" | "never" }). Returns the
// link URL once — the token is never stored, only its hash,
// so the link must be copied when it is shown.
// GET /api/documents/[id]/shares — list the document's links,
// newest first. Both are signed-in only (RLS decides access).
import { NextResponse } from "next/server";
import { PdfEditError } from "@/lib/pdf-edit";
import {
  createShare,
  getSharingClient,
  getSharingUser,
  listShares,
  parseShareExpiry,
} from "@/lib/sharing.server";

function errorResponse(error: unknown): NextResponse {
  if (error instanceof PdfEditError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status }
    );
  }
  console.error("[shares]", error);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getSharingUser();
    const body = await request.json().catch(() => ({}));
    const expiry = parseShareExpiry(body?.expiry);
    const client = await getSharingClient();
    const share = await createShare(client, id, expiry, user.id);
    return NextResponse.json({
      ok: true,
      share: { id: share.id, url: share.url, expiresAt: share.expiresAt },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await getSharingUser();
    const client = await getSharingClient();
    const shares = await listShares(client, id);
    return NextResponse.json({
      ok: true,
      shares: shares.map((s) => ({
        id: s.id,
        expiresAt: s.expires_at,
        createdAt: s.created_at,
        revokedAt: s.revoked_at,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
