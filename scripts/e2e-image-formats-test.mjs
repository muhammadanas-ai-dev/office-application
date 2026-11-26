// Live e2e for WEBP/TIFF images to PDF (F34).
//   node scripts/e2e-image-formats-test.mjs
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import {
  admin,
  appFetch,
  check,
  currentBytes,
  finish,
  makeUser,
  onCleanup,
} from "./e2e-shared.mjs";

const userA = await makeUser("imgfmt-a");

async function uploadImage(user, title, bytes, mimeType, ext) {
  const id = crypto.randomUUID();
  const filePath = `${user.workspaceId}/${id}/v1/${title.replace(/\s+/g, "-").toLowerCase()}.${ext}`;
  // NOTE: until the F34 bucket SQL runs, Storage refuses
  // image/webp and image/tiff uploads (the bucket allowlist).
  // The harness stores the object with a permitted content
  // type; the documents row carries the real mime type,
  // which is what the conversion route reads. The bucket
  // gate itself is checked separately below.
  const { error: upErr } = await admin.storage
    .from("documents")
    .upload(filePath, bytes, { contentType: "image/png" });
  if (upErr) throw new Error(`upload failed: ${upErr.message}`);
  await admin.from("documents").insert({
    id,
    workspace_id: user.workspaceId,
    folder_id: null,
    title,
    file_path: filePath,
    mime_type: mimeType,
    size_bytes: bytes.length,
    version: 1,
    created_by: user.id,
  });
  await admin.from("document_versions").insert({
    document_id: id,
    workspace_id: user.workspaceId,
    version_number: 1,
    file_path: filePath,
    mime_type: mimeType,
    size_bytes: bytes.length,
    created_by: user.id,
  });
  onCleanup(async () => {
    await admin.storage.from("documents").remove([filePath]);
    await admin.from("documents").delete().eq("id", id);
  });
  return id;
}

const base = await sharp({
  create: {
    width: 8,
    height: 6,
    channels: 3,
    background: { r: 180, g: 40, b: 40 },
  },
})
  .png()
  .toBuffer();
const webpId = await uploadImage(
  userA,
  "Webp Pic",
  new Uint8Array(await sharp(base).webp().toBuffer()),
  "image/webp",
  "webp"
);
const tiffId = await uploadImage(
  userA,
  "Tiff Pic",
  new Uint8Array(await sharp(base).tiff().toBuffer()),
  "image/tiff",
  "tiff"
);

// The bucket gate: a direct WEBP upload is refused until
// the F34 SQL extends the bucket allowlist.
{
  const probePath = `${userA.workspaceId}/probe/v1/probe.webp`;
  const { error: probeError } = await admin.storage
    .from("documents")
    .upload(probePath, new Uint8Array(await sharp(base).webp().toBuffer()), {
      contentType: "image/webp",
    });
  check(
    "bucket: WEBP uploads are gated by the bucket allowlist until the F34 SQL runs",
    probeError !== null &&
      (probeError?.message ?? "").includes("mime type image/webp is not supported"),
    probeError ? probeError.message : "upload unexpectedly succeeded"
  );
  if (!probeError) {
    await admin.storage.from("documents").remove([probePath]);
  }
}

const res = await appFetch("/api/documents/images-to-pdf", {
  session: userA.session,
  method: "POST",
  body: { documentIds: [webpId, tiffId], title: "Formats Combined" },
});
const resJson = await res.json();
check(
  "images-to-pdf: WEBP + TIFF convert into a new PDF document",
  res.status === 200 && resJson.ok === true && !!resJson.document?.id,
  `status ${res.status}, ${JSON.stringify(resJson).slice(0, 160)}`
);

if (resJson.document?.id) {
  const pdf = await PDFDocument.load(await currentBytes(resJson.document.id));
  check(
    "images-to-pdf: the result has 2 pages (one per image)",
    pdf.getPageCount() === 2,
    `pages ${pdf.getPageCount()}`
  );
}

const page = await appFetch("/images-to-pdf", { session: userA.session });
const html = await page.text();
check(
  "images-to-pdf: the picker page lists WEBP/TIFF support",
  page.status === 200 && html.includes("WEBP"),
  `status ${page.status}`
);

await finish("webp/tiff images to pdf");
