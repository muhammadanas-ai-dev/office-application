// One local reviewer note (Day 34).
//
// PATCH /api/documents/[id]/notes/[noteId] — resolve / reopen a
// note (body: { "resolved": true | false }) or edit its text
// (body: { "body": "..." }).
// DELETE /api/documents/[id]/notes/[noteId] — delete the note.
// Only the note's owner can change it (RLS + an explicit owner
// check); anyone else gets a 404.
import { NextResponse } from "next/server";
import { z } from "zod";
import { PdfEditError } from "@/lib/pdf-edit";
import {
  deleteNote,
  getNotesClient,
  getNotesUser,
  updateNote,
} from "@/lib/document-notes.server";
import { logError } from "@/lib/log";

const PatchNoteBody = z.object({
  resolved: z.boolean().optional(),
  body: z.string().optional(),
});

function errorResponse(error: unknown): NextResponse {
  if (error instanceof PdfEditError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status }
    );
  }
  logError("notes", error);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  try {
    const { id, noteId } = await params;
    const user = await getNotesUser();
    const body = await request.json().catch(() => ({}));
    const parsed = PatchNoteBody.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body." },
        { status: 400 }
      );
    }
    const client = await getNotesClient();
    const note = await updateNote(client, id, noteId, user.id, parsed.data);
    return NextResponse.json({ ok: true, note });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  try {
    const { id, noteId } = await params;
    const user = await getNotesUser();
    const client = await getNotesClient();
    await deleteNote(client, id, noteId, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
