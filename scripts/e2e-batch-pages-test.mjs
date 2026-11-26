// Live e2e for batch page operations + PDF repair (F36).
//   node scripts/e2e-batch-pages-test.mjs
import { PDFDocument } from "pdf-lib";
import {
  appFetch,
  check,
  currentBytes,
  finish,
  makeUser,
  uploadFixturePdf,
} from "./e2e-shared.mjs";

const userA = await makeUser("batchpages-a");
const userB = await makeUser("batchpages-b");
const doc1 = await uploadFixturePdf(userA, "Batch Rotate One");
const doc2 = await uploadFixturePdf(userA, "Batch Rotate Two");
const docB = await uploadFixturePdf(userB, "Batch Rotate Other");

const res = await appFetch("/api/batch/pdf-pages", {
  session: userA.session,
  method: "POST",
  body: {
    documentIds: [doc1, doc2],
    operation: { kind: "rotate", degrees: 90 },
  },
});
const resJson = await res.json();
check(
  "batch pages: rotating two PDFs succeeds for both (version 2 each)",
  res.status === 200 &&
    Array.isArray(resJson.results) &&
    resJson.results.every((r) => r.ok && r.version === 2),
  `status ${res.status}, ${JSON.stringify(resJson.results ?? resJson).slice(0, 200)}`
);

const rotated = await PDFDocument.load(await currentBytes(doc1));
check(
  "batch pages: page 1 of the first PDF is really rotated 90°",
  rotated.getPage(0).getRotation().angle === 90,
  `angle ${rotated.getPage(0).getRotation().angle}`
);

const mixed = await appFetch("/api/batch/pdf-pages", {
  session: userA.session,
  method: "POST",
  body: {
    documentIds: [doc1, docB],
    operation: { kind: "rotate", degrees: 180 },
  },
});
const mixedJson = await mixed.json();
check(
  "batch pages: another user's PDF fails per-item, the batch still succeeds",
  mixed.status === 200 &&
    mixedJson.results?.find((r) => r.documentId === doc1)?.ok === true &&
    mixedJson.results?.find((r) => r.documentId === docB)?.ok === false,
  `status ${mixed.status}`
);

const repair = await appFetch(`/api/documents/${doc2}/pdf/repair`, {
  session: userA.session,
  method: "POST",
});
const repairJson = await repair.json();
check(
  "repair: a healthy PDF is checked (200 — either already healthy or rebuilt as a new version)",
  repair.status === 200 &&
    repairJson.ok === true &&
    (repairJson.repaired === false || typeof repairJson.version === "number"),
  `status ${repair.status}, ${JSON.stringify(repairJson).slice(0, 160)}`
);

const repairCross = await appFetch(`/api/documents/${doc2}/pdf/repair`, {
  session: userB.session,
  method: "POST",
});
check(
  "isolation: another user cannot repair the PDF (404)",
  repairCross.status === 404,
  `status ${repairCross.status}`
);

const anon = await appFetch("/api/batch/pdf-pages", {
  method: "POST",
  body: { documentIds: [doc1], operation: { kind: "rotate", degrees: 90 } },
});
check(
  "signed-out: redirects to login (307)",
  anon.status === 307,
  `status ${anon.status}`
);

await finish("batch pages + repair");
