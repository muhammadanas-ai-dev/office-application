// Live e2e for the text-based PDF → XLSX export (F24).
//   node scripts/e2e-pdf-xlsx-test.mjs
// Reads the produced workbook back with ExcelJS and checks
// the sheets and cells.
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
import ExcelJS from "exceljs";

const userA = await makeUser("xlsx-a");
const userB = await makeUser("xlsx-b");

async function uploadPdf(user, title, bytes) {
  const id = crypto.randomUUID();
  const filePath = `${user.workspaceId}/${id}/v1/${title.replace(/\s+/g, "-").toLowerCase()}.pdf`;
  await admin.storage
    .from("documents")
    .upload(filePath, bytes, { contentType: "application/pdf" });
  await admin.from("documents").insert({
    id,
    workspace_id: user.workspaceId,
    folder_id: null,
    title,
    file_path: filePath,
    mime_type: "application/pdf",
    size_bytes: bytes.length,
    version: 1,
    created_by: user.id,
  });
  await admin.from("document_versions").insert({
    document_id: id,
    workspace_id: user.workspaceId,
    version_number: 1,
    file_path: filePath,
    mime_type: "application/pdf",
    size_bytes: bytes.length,
    created_by: user.id,
  });
  onCleanup(async () => {
    await admin.storage.from("documents").remove([filePath]);
    await admin.from("documents").delete().eq("id", id);
  });
  return id;
}

// A PDF with a heading line and an aligned table.
const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
const page = doc.addPage([612, 792]);
page.drawText("Quarterly figures", { x: 50, y: 740, size: 14, font });
const rows = [
  ["Item", "Qty", "Price"],
  ["Apples", "2", "3.50"],
  ["Pears", "5", "7.25"],
];
rows.forEach((row, ri) => {
  row.forEach((cell, ci) => {
    page.drawText(cell, { x: 50 + ci * 100, y: 700 - ri * 20, size: 10, font });
  });
});
const tableDocId = await uploadPdf(userA, "Table Doc", await doc.save());

const res = await appFetch(`/api/documents/${tableDocId}/pdf/to-xlsx`, {
  session: userA.session,
});
check(
  "xlsx: succeeds (200) with the spreadsheet MIME type",
  res.status === 200 &&
    (res.headers.get("content-type") ?? "").includes("spreadsheetml"),
  `status ${res.status}`
);
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(await res.arrayBuffer());
const sheetNames = workbook.worksheets.map((w) => w.name);
check(
  "xlsx: the workbook has a Page 1 text sheet and a P1 Table 1 sheet",
  sheetNames.includes("Page 1") && sheetNames.includes("P1 Table 1"),
  sheetNames.join(", ")
);
const tableSheet = workbook.getWorksheet("P1 Table 1");
check(
  "xlsx: the table sheet carries the cells in a grid",
  tableSheet?.getCell("A1").text === "Item" &&
    tableSheet?.getCell("B2").text === "2" &&
    tableSheet?.getCell("C3").text === "7.25",
  `A1=${tableSheet?.getCell("A1").text}`
);

// The text fixture exports too (text sheets, no table sheets).
const plainId = await uploadFixturePdf(userA, "Plain Text");
const plainRes = await appFetch(`/api/documents/${plainId}/pdf/to-xlsx`, {
  session: userA.session,
});
const plainWb = new ExcelJS.Workbook();
await plainWb.xlsx.load(await plainRes.arrayBuffer());
check(
  "xlsx: the text fixture exports its 3 page sheets",
  plainRes.status === 200 && plainWb.worksheets.length === 3,
  `sheets ${plainWb.worksheets.length}`
);

// A blank PDF (no text at all) is refused with the OCR hint.
const blankDoc = await PDFDocument.create();
blankDoc.addPage([612, 792]);
const blankId = await uploadPdf(userA, "Blank", await blankDoc.save());
const blankRes = await appFetch(`/api/documents/${blankId}/pdf/to-xlsx`, {
  session: userA.session,
});
const blankJson = await blankRes.json();
check(
  "xlsx: a text-less PDF is refused (400) pointing at OCR",
  blankRes.status === 400 && /OCR/i.test(blankJson.error ?? ""),
  `status ${blankRes.status}`
);

const cross = await appFetch(`/api/documents/${tableDocId}/pdf/to-xlsx`, {
  session: userB.session,
});
check("isolation: another user gets 404", cross.status === 404, `status ${cross.status}`);

const anon = await appFetch(`/api/documents/${tableDocId}/pdf/to-xlsx`);
check("signed-out: redirects to login (307)", anon.status === 307, `status ${anon.status}`);

await finish("pdf to xlsx");
