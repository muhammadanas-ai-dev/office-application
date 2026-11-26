// Live e2e for inserting an image onto a PDF page (F38).
//   node scripts/e2e-insert-image-on-page-test.mjs
import {
  admin,
  appFetch,
  check,
  currentBytes,
  finish,
  makeUser,
  onCleanup,
  uploadFixturePdf,
} from "./e2e-shared.mjs";

const userA = await makeUser("insimg-a");
const userB = await makeUser("insimg-b");
const documentId = await uploadFixturePdf(userA, "Insert Image Target");

const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";
const pngBytes = new Uint8Array(Buffer.from(PNG_1PX, "base64"));
const imageId = crypto.randomUUID();
const imagePath = `${userA.workspaceId}/${imageId}/v1/dot.png`;
await admin.storage
  .from("documents")
  .upload(imagePath, pngBytes, { contentType: "image/png" });
await admin.from("documents").insert({
  id: imageId,
  workspace_id: userA.workspaceId,
  folder_id: null,
  title: "Dot",
  file_path: imagePath,
  mime_type: "image/png",
  size_bytes: pngBytes.length,
  version: 1,
  created_by: userA.id,
});
onCleanup(async () => {
  await admin.storage.from("documents").remove([imagePath]);
  await admin.from("documents").delete().eq("id", imageId);
});

const res = await appFetch(`/api/documents/${documentId}/pdf/insert-image`, {
  session: userA.session,
  method: "POST",
  body: { imageDocumentId: imageId, page: 1, x: 50, y: 500, width: 120 },
});
const resJson = await res.json();
check(
  "insert-image: succeeds and saves version 2",
  res.status === 200 && resJson.version === 2,
  `status ${res.status}, ${JSON.stringify(resJson).slice(0, 140)}`
);

const out = await currentBytes(documentId);
check(
  "insert-image: the new version's bytes were produced",
  out.length > 0,
  `${out.length} bytes`
);

const overflow = await appFetch(
  `/api/documents/${documentId}/pdf/insert-image`,
  {
    session: userA.session,
    method: "POST",
    body: { imageDocumentId: imageId, page: 1, x: 590, y: 500, width: 120 },
  }
);
check(
  "insert-image: an overflowing placement is refused (400)",
  overflow.status === 400,
  `status ${overflow.status}`
);

const cross = await appFetch(`/api/documents/${documentId}/pdf/insert-image`, {
  session: userB.session,
  method: "POST",
  body: { imageDocumentId: imageId, page: 1, x: 50, y: 500, width: 120 },
});
check(
  "isolation: another user gets 404",
  cross.status === 404,
  `status ${cross.status}`
);

const anon = await appFetch(`/api/documents/${documentId}/pdf/insert-image`, {
  method: "POST",
  body: { imageDocumentId: imageId, page: 1, x: 50, y: 500, width: 120 },
});
check(
  "signed-out: redirects to login (307)",
  anon.status === 307,
  `status ${anon.status}`
);

await finish("insert image on page");
