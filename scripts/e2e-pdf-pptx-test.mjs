// Live e2e for the text-based PDF → PPTX export (F25).
//   node scripts/e2e-pdf-pptx-test.mjs
// Verifies the deck by listing the PPTX (a ZIP) entries and
// reading the first slide's XML.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import {
  admin,
  appFetch,
  check,
  finish,
  makeUser,
  onCleanup,
  uploadFixturePdf,
} from "./e2e-shared.mjs";
import { PDFDocument } from "pdf-lib";

const userA = await makeUser("pptx-a");
const userB = await makeUser("pptx-b");

const documentId = await uploadFixturePdf(userA, "Deck Source");

const res = await appFetch(`/api/documents/${documentId}/pdf/to-pptx`, {
  session: userA.session,
});
const bytes = new Uint8Array(await res.arrayBuffer());
check(
  "pptx: succeeds (200) with the presentation MIME type and a ZIP body",
  res.status === 200 &&
    (res.headers.get("content-type") ?? "").includes("presentationml") &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b,
  `status ${res.status}, ${bytes.length} bytes`
);
writeFileSync("/tmp/forma-e2e-deck.pptx", bytes);
const listing = execFileSync("unzip", ["-l", "/tmp/forma-e2e-deck.pptx"], {
  encoding: "utf8",
});
const slideCount = (listing.match(/ppt\/slides\/slide\d+\.xml/g) ?? []).length;
check(
  "pptx: one slide per PDF page (3)",
  slideCount === 3,
  `slides ${slideCount}`
);
const slide1 = execFileSync(
  "unzip",
  ["-p", "/tmp/forma-e2e-deck.pptx", "ppt/slides/slide1.xml"],
  { encoding: "utf8" }
);
check(
  "pptx: slide 1 carries the page's text as its title",
  slide1.includes("PDF One page 1"),
  "page text found in slide XML"
);

// A blank PDF (no text) is refused with the OCR hint.
const blankDoc = await PDFDocument.create();
blankDoc.addPage([612, 792]);
const blankBytes = await blankDoc.save();
const blankId = crypto.randomUUID();
const blankPath = `${userA.workspaceId}/${blankId}/v1/blank.pdf`;
await admin.storage
  .from("documents")
  .upload(blankPath, blankBytes, { contentType: "application/pdf" });
await admin.from("documents").insert({
  id: blankId,
  workspace_id: userA.workspaceId,
  folder_id: null,
  title: "Blank",
  file_path: blankPath,
  mime_type: "application/pdf",
  size_bytes: blankBytes.length,
  version: 1,
  created_by: userA.id,
});
onCleanup(async () => {
  await admin.storage.from("documents").remove([blankPath]);
  await admin.from("documents").delete().eq("id", blankId);
});
const blankRes = await appFetch(`/api/documents/${blankId}/pdf/to-pptx`, {
  session: userA.session,
});
const blankJson = await blankRes.json();
check(
  "pptx: a text-less PDF is refused (400) pointing at OCR",
  blankRes.status === 400 && /OCR/i.test(blankJson.error ?? ""),
  `status ${blankRes.status}`
);

const cross = await appFetch(`/api/documents/${documentId}/pdf/to-pptx`, {
  session: userB.session,
});
check("isolation: another user gets 404", cross.status === 404, `status ${cross.status}`);

const anon = await appFetch(`/api/documents/${documentId}/pdf/to-pptx`);
check("signed-out: redirects to login (307)", anon.status === 307, `status ${anon.status}`);

await finish("pdf to pptx");
