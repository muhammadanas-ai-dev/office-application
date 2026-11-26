// Live e2e for extracting tables as CSV (F23).
//   node scripts/e2e-extract-tables-test.mjs
// Builds a PDF with an aligned 3x3 table (pdf-lib), uploads
// it, and checks the ZIP's CSV contents.
import {
  admin,
  appFetch,
  check,
  finish,
  makeUser,
  onCleanup,
  uploadFixturePdf,
} from "./e2e-shared.mjs";
import { PDFDocument, StandardFonts } from "pdf-lib";

const userA = await makeUser("tables-a");
const userB = await makeUser("tables-b");

// Build the table PDF.
const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
const page = doc.addPage([612, 792]);
const rows = [
  ["Item", "Qty", "Price"],
  ["Apples", "2", "3.50"],
  ["Pears", "5", "7.25"],
];
rows.forEach((row, ri) => {
  row.forEach((cell, ci) => {
    page.drawText(cell, {
      x: 50 + ci * 100,
      y: 700 - ri * 20,
      size: 10,
      font,
    });
  });
});
const tableBytes = await doc.save();

const docId = crypto.randomUUID();
const filePath = `${userA.workspaceId}/${docId}/v1/table-doc.pdf`;
await admin.storage
  .from("documents")
  .upload(filePath, tableBytes, { contentType: "application/pdf" });
await admin.from("documents").insert({
  id: docId,
  workspace_id: userA.workspaceId,
  folder_id: null,
  title: "Table Doc",
  file_path: filePath,
  mime_type: "application/pdf",
  size_bytes: tableBytes.length,
  version: 1,
  created_by: userA.id,
});
await admin.from("document_versions").insert({
  document_id: docId,
  workspace_id: userA.workspaceId,
  version_number: 1,
  file_path: filePath,
  mime_type: "application/pdf",
  size_bytes: tableBytes.length,
  created_by: userA.id,
});
onCleanup(async () => {
  await admin.storage.from("documents").remove([filePath]);
  await admin.from("documents").delete().eq("id", docId);
});

const res = await appFetch(`/api/documents/${docId}/pdf/extract-tables`, {
  session: userA.session,
});
const zipBytes = new Uint8Array(await res.arrayBuffer());
const zipText = new TextDecoder("latin1").decode(zipBytes);
check(
  "tables: succeeds (200) with a ZIP and one table reported",
  res.status === 200 &&
    zipBytes[0] === 0x50 &&
    zipBytes[1] === 0x4b &&
    res.headers.get("x-forma-tables") === "1",
  `status ${res.status}, tables header ${res.headers.get("x-forma-tables")}`
);
check(
  "tables: the ZIP contains table-1-page-1.csv",
  zipText.includes("table-1-page-1.csv"),
  "csv entry present"
);
check(
  "tables: the CSV carries the table's cells",
  zipText.includes("Item,Qty,Price") && zipText.includes("Apples,2,3.50"),
  "header + a data row found in the archive"
);

const plainId = await uploadFixturePdf(userA, "No Tables");
const refused = await appFetch(
  `/api/documents/${plainId}/pdf/extract-tables`,
  { session: userA.session }
);
check(
  "tables: a PDF with no aligned table is refused (400)",
  refused.status === 400,
  `status ${refused.status}`
);

const cross = await appFetch(`/api/documents/${docId}/pdf/extract-tables`, {
  session: userB.session,
});
check("isolation: another user gets 404", cross.status === 404, `status ${cross.status}`);

const anon = await appFetch(`/api/documents/${docId}/pdf/extract-tables`);
check("signed-out: redirects to login (307)", anon.status === 307, `status ${anon.status}`);

await finish("extract tables");
