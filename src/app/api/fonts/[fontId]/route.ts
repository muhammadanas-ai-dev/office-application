// One user font (F33).
//
// PATCH  /api/fonts/[fontId] — { "isFavourite": true|false }
// DELETE /api/fonts/[fontId] — removes the file and the row.
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getToolsClient,
  getToolsUser,
} from "@/lib/pdf-tools.server";
import { PdfEditError } from "@/lib/pdf-edit";
import {
  deleteUserFont,
  fetchUserFont,
} from "@/lib/user-fonts.server";
import { logError } from "@/lib/log";

const PatchBody = z.object({ isFavourite: z.boolean() });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ fontId: string }> }
) {
  const { fontId } = await params;
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }
  const parsed = PatchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Send isFavourite as true or false." },
      { status: 400 }
    );
  }
  try {
    const user = await getToolsUser();
    const userClient = await getToolsClient();
    await fetchUserFont(userClient, user.id, fontId);
    const { error } = await userClient
      .from("user_fonts")
      .update({ is_favourite: parsed.data.isFavourite })
      .eq("id", fontId)
      .eq("user_id", user.id);
    if (error) throw new PdfEditError(500, "Could not update the font.");
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof PdfEditError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    logError("fonts patch", error);
    return NextResponse.json(
      { error: "Could not update the font." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ fontId: string }> }
) {
  const { fontId } = await params;
  try {
    const user = await getToolsUser();
    const userClient = await getToolsClient();
    await deleteUserFont(userClient, user.id, fontId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof PdfEditError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    logError("fonts delete", error);
    return NextResponse.json(
      { error: "Could not delete the font." },
      { status: 500 }
    );
  }
}
