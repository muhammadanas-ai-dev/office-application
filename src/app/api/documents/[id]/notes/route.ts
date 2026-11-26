// Local reviewer notes for a document (Day 34).
//
// GET /api/documents/[id]/notes — list the signed-in user's own
// notes for the document, newest first.
// POST /api/documents/[id]/notes — add a note (body:
// { "body": "..." }). Notes are stored in Forma only — never
// written into the file, never shown on share links. RLS makes
// them owner-only.
import { NextResponse } from "next/server";
import { z } from "zod";
import { PdfEditError } from "@/lib/pdf-edit";
import {
  createNote,
  getNotesClient,
  getNotesUser,
  listNotes,
} from "@/lib/document-notes.server";
import { logError } from "@/lib/log";

const CreateNoteBody = z.object({
  body: z.string(),
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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await getNotesUser();
    const client = await getNotesClient();
    const notes = await listNotes(client, id);
    return NextResponse.json({ ok: true, notes });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getNotesUser();
    const body = await request.json().catch(() => ({}));
    const parsed = CreateNoteBody.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Write a note first." },
        { status: 400 }
      );
    }
    const client = await getNotesClient();
    const note = await createNote(client, id, user.id, parsed.data.body);
    return NextResponse.json({ ok: true, note });
  } catch (error) {
    return errorResponse(error);
  }
}
