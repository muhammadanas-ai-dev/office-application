// Revoke a share link (Day 25).
//
// POST /api/documents/[id]/shares/[shareId]/revoke — sets
// revoked_at on the link, so it stops working immediately.
// Only the person who created the link can revoke it.
import { NextResponse } from "next/server";
import { PdfEditError } from "@/lib/pdf-edit";
import {
  getSharingClient,
  getSharingUser,
  revokeShare,
} from "@/lib/sharing.server";
import { logError } from "@/lib/log";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; shareId: string }> }
) {
  try {
    const { id, shareId } = await params;
    const user = await getSharingUser();
    const client = await getSharingClient();
    await revokeShare(client, id, shareId, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof PdfEditError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    logError("share revoke", error);
    return NextResponse.json(
      { error: "Something went wrong." },
      { status: 500 }
    );
  }
}
