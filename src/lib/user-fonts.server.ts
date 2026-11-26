// User fonts (F33) — server side.
//
// The catalogue lives in the user_fonts table (RLS: own
// rows only); the font files live in the documents Storage
// bucket under fonts/<user id>/<font id>.<ext>, written
// and read through the admin client after the RLS-checked
// row proves ownership. A missing table (the F33 migration
// not applied yet) becomes a clear setup error.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { DOCUMENTS_BUCKET } from "@/lib/storage";
import { PdfEditError } from "@/lib/pdf-edit";
import {
  MAX_FONT_BYTES,
  MAX_USER_FONTS,
  detectFontFormat,
  validateFontName,
  type UserFontRow,
} from "@/lib/user-fonts";

type UserClient = Awaited<
  ReturnType<typeof import("@/lib/supabase/server").createClient>
>;

interface FontDbRow {
  id: string;
  name: string;
  file_path: string;
  format: string;
  size_bytes: number;
  is_favourite: boolean;
  last_used_at: string | null;
  created_at: string;
}

const FONT_COLUMNS =
  "id, name, file_path, format, size_bytes, is_favourite, last_used_at, created_at";

function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === "PGRST205" || error?.code === "42P01";
}

export function fontSetupError(): PdfEditError {
  return new PdfEditError(
    400,
    "Fonts are not set up yet — they arrive with the combined SQL file for this update (forma-checklist-completion-migrations.sql)."
  );
}

function toRow(row: FontDbRow): UserFontRow & { filePath: string } {
  return {
    id: row.id,
    name: row.name,
    format: row.format === "otf" ? "otf" : "ttf",
    sizeBytes: row.size_bytes,
    isFavourite: row.is_favourite,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    filePath: row.file_path,
  };
}

/** The signed-in user's fonts (unsorted — callers apply
 *  the picker order). */
export async function listUserFonts(
  userClient: UserClient,
  userId: string
): Promise<(UserFontRow & { filePath: string })[]> {
  const { data, error } = await userClient
    .from("user_fonts")
    .select(FONT_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingTable(error)) throw fontSetupError();
    throw new PdfEditError(500, "Could not load your fonts.");
  }
  return (data as FontDbRow[]).map(toRow);
}

/** One font owned by the user, or a 404. */
export async function fetchUserFont(
  userClient: UserClient,
  userId: string,
  fontId: string
): Promise<UserFontRow & { filePath: string }> {
  const { data, error } = await userClient
    .from("user_fonts")
    .select(FONT_COLUMNS)
    .eq("user_id", userId)
    .eq("id", fontId)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) throw fontSetupError();
    throw new PdfEditError(500, "Could not load the font.");
  }
  if (!data) throw new PdfEditError(404, "Font not found.");
  return toRow(data as FontDbRow);
}

/** Store an uploaded font: validate the bytes by magic,
 *  upload the file, insert the catalogue row. */
export async function createUserFont(
  userClient: UserClient,
  userId: string,
  input: { name: string; bytes: Uint8Array }
): Promise<UserFontRow> {
  const name = validateFontName(input.name);
  if (input.bytes.length === 0 || input.bytes.length > MAX_FONT_BYTES) {
    throw new PdfEditError(
      400,
      `The font file must be between 1 byte and ${MAX_FONT_BYTES / (1024 * 1024)} MB.`
    );
  }
  const format = detectFontFormat(input.bytes);
  if (!format) {
    throw new PdfEditError(
      400,
      "That file is not a single TTF or OTF font — check the file and try again. (Font collections are not supported.)"
    );
  }
  const existing = await listUserFonts(userClient, userId);
  if (existing.length >= MAX_USER_FONTS) {
    throw new PdfEditError(
      400,
      `You can keep at most ${MAX_USER_FONTS} uploaded fonts — delete one first.`
    );
  }
  const admin = createAdminClient();
  const { data: inserted, error: insertError } = await userClient
    .from("user_fonts")
    .insert({
      user_id: userId,
      name,
      file_path: "pending",
      format,
      size_bytes: input.bytes.length,
    })
    .select(FONT_COLUMNS)
    .single();
  if (insertError || !inserted) {
    if (isMissingTable(insertError)) throw fontSetupError();
    throw new PdfEditError(500, "Could not save the font.");
  }
  const row = inserted as FontDbRow;
  const filePath = `fonts/${userId}/${row.id}.${format}`;
  const { error: uploadError } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(filePath, input.bytes, {
      contentType: format === "otf" ? "font/otf" : "font/ttf",
      upsert: false,
    });
  if (uploadError) {
    await userClient.from("user_fonts").delete().eq("id", row.id);
    throw new PdfEditError(500, "Could not store the font file.");
  }
  const { error: updateError } = await userClient
    .from("user_fonts")
    .update({ file_path: filePath })
    .eq("id", row.id);
  if (updateError) {
    throw new PdfEditError(500, "Could not finish saving the font.");
  }
  return toRow({ ...row, file_path: filePath });
}

/** Download a font's bytes (after the RLS ownership check). */
export async function fetchUserFontBytes(
  font: UserFontRow & { filePath: string }
): Promise<Uint8Array> {
  const admin = createAdminClient();
  const { data: blob, error } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .download(font.filePath);
  if (error || !blob) {
    throw new PdfEditError(500, "Could not read the font file.");
  }
  return new Uint8Array(await blob.arrayBuffer());
}

/** Mark a font used just now (picker recency). */
export async function touchUserFont(
  userClient: UserClient,
  fontId: string
): Promise<void> {
  await userClient
    .from("user_fonts")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", fontId);
}

/** Delete a font: storage file first, then the row. */
export async function deleteUserFont(
  userClient: UserClient,
  userId: string,
  fontId: string
): Promise<void> {
  const font = await fetchUserFont(userClient, userId, fontId);
  const admin = createAdminClient();
  await admin.storage.from(DOCUMENTS_BUCKET).remove([font.filePath]);
  const { error } = await userClient
    .from("user_fonts")
    .delete()
    .eq("id", fontId)
    .eq("user_id", userId);
  if (error) throw new PdfEditError(500, "Could not delete the font.");
}
