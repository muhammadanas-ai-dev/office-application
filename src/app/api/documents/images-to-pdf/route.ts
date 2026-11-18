// Create a PDF from images (Day 22).
//
// POST /api/documents/images-to-pdf
// Body: { documentIds: string[] (1-20, the images, in order),
//         title?: string }
// A library-level action — it takes several images, not one
// document. Each image becomes one page (fit within A4, centred,
// aspect kept). The result is a NEW document in the library
// (the conversion hub pattern); the source images are never
// touched. Returns { ok, document: {id, title, mimeType} }.
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { DOCUMENTS_BUCKET, buildStoragePath } from "@/lib/storage";
import { PdfEditError } from "@/lib/pdf-edit";
import {
  buildImagesPdf,
  getImagesToPdfFileName,
  MAX_IMAGES_TO_PDF,
  IMAGE_TO_PDF_MIME_TYPES,
} from "@/lib/pdf-images";

const ImagesToPdfBody = z.object({
  documentIds: z
    .array(z.string().uuid("Each image must be a document id."))
    .min(1, "Choose at least one image.")
    .max(MAX_IMAGES_TO_PDF, `Choose at most ${MAX_IMAGES_TO_PDF} images.`),
  title: z.string().trim().min(1).max(200).optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "The request body must be valid JSON." },
      { status: 400 }
    );
  }
  const parsed = ImagesToPdfBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }
  const { documentIds, title } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // Load the image documents (RLS — the user's own images
  // only), in the order the user chose them.
  const { data: documents, error: loadError } = await supabase
    .from("documents")
    .select("id, workspace_id, folder_id, title, file_path, mime_type")
    .in("id", documentIds);
  if (loadError) {
    return NextResponse.json(
      { error: "Could not load the chosen images." },
      { status: 500 }
    );
  }
  const byId = new Map((documents ?? []).map((d) => [d.id, d]));
  const ordered = documentIds.map((id) => byId.get(id));
  if (ordered.some((d) => !d)) {
    return NextResponse.json(
      { error: "One of the chosen images was not found." },
      { status: 404 }
    );
  }
  // Validate and narrow in one place: every chosen document is
  // an image with a file. From here on file_path and mime_type
  // are strings (not null) — the type carries that.
  const imageDocs: {
    id: string;
    workspace_id: string;
    folder_id: string | null;
    title: string;
    file_path: string;
    mime_type: string;
  }[] = [];
  for (const d of ordered) {
    const doc = d!;
    if (
      !doc.file_path ||
      !doc.mime_type ||
      !(IMAGE_TO_PDF_MIME_TYPES as readonly string[]).includes(doc.mime_type)
    ) {
      return NextResponse.json(
        { error: `"${doc.title}" is not a PNG or JPEG image.` },
        { status: 400 }
      );
    }
    imageDocs.push({
      id: doc.id,
      workspace_id: doc.workspace_id,
      folder_id: doc.folder_id,
      title: doc.title,
      file_path: doc.file_path,
      mime_type: doc.mime_type,
    });
  }
  // All images must be in one workspace (the new document lives
  // there).
  const workspaceId = imageDocs[0].workspace_id;
  if (imageDocs.some((d) => d.workspace_id !== workspaceId)) {
    return NextResponse.json(
      { error: "All images must be in the same workspace." },
      { status: 400 }
    );
  }

  // Download each image and build the PDF.
  let pdfBytes: Uint8Array;
  try {
    const images: { bytes: Uint8Array; mimeType: string }[] = [];
    for (const d of imageDocs) {
      const { data: blob, error: downloadError } = await supabase.storage
        .from(DOCUMENTS_BUCKET)
        .download(d.file_path);
      if (downloadError || !blob) {
        return NextResponse.json(
          { error: `Could not download "${d.title}".` },
          { status: 500 }
        );
      }
      images.push({
        bytes: new Uint8Array(await blob.arrayBuffer()),
        mimeType: d.mime_type,
      });
    }
    pdfBytes = await buildImagesPdf(images);
  } catch (error) {
    if (error instanceof PdfEditError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("[images-to-pdf] build", error);
    return NextResponse.json(
      { error: "Could not build the PDF from these images." },
      { status: 500 }
    );
  }

  // Save the result as a NEW document in the same workspace and
  // folder as the first image. The source images are never
  // touched.
  const newId = crypto.randomUUID();
  const newTitle =
    title ?? imageDocs[0].title.replace(/\.[^.]+$/, "") + " to PDF";
  const fileName = getImagesToPdfFileName(newTitle);
  const filePath = buildStoragePath(workspaceId, newId, 1, fileName);
  const { error: uploadError } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(filePath, pdfBytes.buffer as ArrayBuffer, {
      contentType: "application/pdf",
      upsert: false,
    });
  if (uploadError) {
    console.error("[images-to-pdf] upload", uploadError);
    return NextResponse.json(
      { error: "Could not save the PDF" },
      { status: 500 }
    );
  }
  const { error: insertError } = await supabase.from("documents").insert({
    id: newId,
    workspace_id: workspaceId,
    folder_id: imageDocs[0].folder_id,
    title: newTitle,
    file_path: filePath,
    mime_type: "application/pdf",
    size_bytes: pdfBytes.length,
    version: 1,
    created_by: user.id,
  });
  if (insertError) {
    await supabase.storage.from(DOCUMENTS_BUCKET).remove([filePath]);
    console.error("[images-to-pdf] insert", insertError);
    return NextResponse.json(
      { error: "Could not save the PDF" },
      { status: 500 }
    );
  }
  const { error: versionError } = await supabase
    .from("document_versions")
    .insert({
      document_id: newId,
      workspace_id: workspaceId,
      version_number: 1,
      file_path: filePath,
      mime_type: "application/pdf",
      size_bytes: pdfBytes.length,
      created_by: user.id,
    });
  if (versionError) {
    await supabase.storage.from(DOCUMENTS_BUCKET).remove([filePath]);
    console.error("[images-to-pdf] version", versionError);
    return NextResponse.json(
      { error: "Could not save the PDF" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    document: { id: newId, title: newTitle, mimeType: "application/pdf" },
  });
}
