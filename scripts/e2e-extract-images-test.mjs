// Live e2e for extracting embedded images (F22).
//   node scripts/e2e-extract-images-test.mjs
// Builds a PDF with one embedded PNG (pdf-lib), uploads it,
// and checks the ZIP download; the text-only fixture must be
// refused with a clear 400.
import { readFileSync } from "node:fs";
import {
  admin,
  appFetch,
  check,
  finish,
  makeUser,
  onCleanup,
  uploadFixturePdf,
} from "./e2e-shared.mjs";

const userA = await makeUser("extract-a");
const userB = await makeUser("extract-b");

// A document whose PDF carries an embedded image.
const imagePdfBytes = readFileSync("/tmp/imgtest/with-image.pdf");
const docId = crypto.randomUUID();
const filePath = `${userA.workspaceId}/${docId}/v1/with-image.pdf`;
await admin.storage
  .from("documents")
  .upload(filePath, imagePdfBytes, { contentType: "application/pdf" });
await admin.from("documents").insert({
  id: docId,
  workspace_id: userA.workspaceId,
  folder_id: null,
  title: "With Image",
  file_path: filePath,
  mime_type: "application/pdf",
  size_bytes: imagePdfBytes.length,
  version: 1,
  created_by: userA.id,
});
await admin.from("document_versions").insert({
  document_id: docId,
  workspace_id: userA.workspaceId,
  version_number: 1,
  file_path: filePath,
  mime_type: "application/pdf",
  size_bytes: imagePdfBytes.length,
  created_by: userA.id,
});
onCleanup(async () => {
  await admin.storage.from("documents").remove([filePath]);
  await admin.from("documents").delete().eq("id", docId);
});

const res = await appFetch(`/api/documents/${docId}/pdf/extract-images`, {
  session: userA.session,
});
const zipBytes = new Uint8Array(await res.arrayBuffer());
check(
  "extract: succeeds (200) with a ZIP download",
  res.status === 200 &&
    (res.headers.get("content-type") ?? "").includes("application/zip") &&
    zipBytes[0] === 0x50 &&
    zipBytes[1] === 0x4b,
  `status ${res.status}, ${zipBytes.length} bytes`
);
const zipText = new TextDecoder("latin1").decode(zipBytes);
check(
  "extract: the ZIP names the extracted image from page 1",
  zipText.includes("img-001-"),
  "img-001-* entry present"
);

const plainId = await uploadFixturePdf(userA, "Text Only");
const refused = await appFetch(
  `/api/documents/${plainId}/pdf/extract-images`,
  { session: userA.session }
);
const refusedJson = await refused.json();
check(
  "extract: a PDF with no embedded images is refused (400) with a reason",
  refused.status === 400 && /no embedded images/i.test(refusedJson.error ?? ""),
  `status ${refused.status}`
);

const cross = await appFetch(`/api/documents/${docId}/pdf/extract-images`, {
  session: userB.session,
});
check("isolation: another user gets 404", cross.status === 404, `status ${cross.status}`);

const anon = await appFetch(`/api/documents/${docId}/pdf/extract-images`);
check("signed-out: redirects to login (307)", anon.status === 307, `status ${anon.status}`);

await finish("extract images");
