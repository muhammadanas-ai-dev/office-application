// User fonts (F33).
//
// GET  /api/fonts — the signed-in user's fonts in picker
//      order (favourites, then recent, then A–Z).
// POST /api/fonts — upload a font (multipart: `file`, and
//      an optional `name`). The bytes are validated by
//      magic (TTF/OTF only), never by file name.
import { NextResponse } from "next/server";
import {
  getToolsClient,
  getToolsUser,
} from "@/lib/pdf-tools.server";
import { PdfEditError } from "@/lib/pdf-edit";
import {
  createUserFont,
  listUserFonts,
} from "@/lib/user-fonts.server";
import {
  fontNameFromFileName,
  sortFontsForPicker,
} from "@/lib/user-fonts";
import { logError } from "@/lib/log";

export async function GET() {
  try {
    const user = await getToolsUser();
    const userClient = await getToolsClient();
    const fonts = await listUserFonts(userClient, user.id);
    return NextResponse.json(
      {
        ok: true,
        fonts: sortFontsForPicker(fonts).map((font) => ({
          id: font.id,
          name: font.name,
          format: font.format,
          sizeBytes: font.sizeBytes,
          isFavourite: font.isFavourite,
          lastUsedAt: font.lastUsedAt,
          createdAt: font.createdAt,
        })),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof PdfEditError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    logError("fonts list", error);
    return NextResponse.json(
      { error: "Could not load your fonts." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getToolsUser();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Choose a font file to upload." },
        { status: 400 }
      );
    }
    const nameField = form.get("name");
    const name =
      typeof nameField === "string" && nameField.trim().length > 0
        ? nameField
        : fontNameFromFileName(file.name);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const userClient = await getToolsClient();
    const font = await createUserFont(userClient, user.id, { name, bytes });
    return NextResponse.json({ ok: true, font });
  } catch (error) {
    if (error instanceof PdfEditError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    logError("fonts upload", error);
    return NextResponse.json(
      { error: "Could not upload the font." },
      { status: 500 }
    );
  }
}
