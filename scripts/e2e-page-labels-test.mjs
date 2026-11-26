// Live e2e for PDF page labels (F37).
//   node scripts/e2e-page-labels-test.mjs
import {
  appFetch,
  check,
  currentBytes,
  finish,
  makeUser,
  uploadFixturePdf,
} from "./e2e-shared.mjs";

const userA = await makeUser("labels-a");
const userB = await makeUser("labels-b");
const documentId = await uploadFixturePdf(userA, "Labels Fixture");

const res = await appFetch(`/api/documents/${documentId}/pdf/page-labels`, {
  session: userA.session,
  method: "POST",
  body: {
    ranges: [
      { fromPage: 1, style: "roman-lower", prefix: "", start: 1 },
      { fromPage: 3, style: "decimal", prefix: "", start: 1 },
    ],
  },
});
const resJson = await res.json();
check(
  "labels: setting front-matter + body labels saves version 2",
  res.status === 200 && resJson.version === 2,
  `status ${res.status}, version ${resJson.version}`
);

const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
const pdf = await (
  await pdfjs.getDocument({ data: await currentBytes(documentId) })
).promise;
const labels = await pdf.getPageLabels();
check(
  "labels: PDF.js reads them back as i, ii, 1",
  JSON.stringify(labels) === JSON.stringify(["i", "ii", "1"]),
  JSON.stringify(labels)
);

const bad = await appFetch(`/api/documents/${documentId}/pdf/page-labels`, {
  session: userA.session,
  method: "POST",
  body: {
    ranges: [{ fromPage: 2, style: "decimal", prefix: "", start: 1 }],
  },
});
check(
  "labels: a first range not starting at page 1 is refused (400)",
  bad.status === 400,
  `status ${bad.status}`
);

const cross = await appFetch(`/api/documents/${documentId}/pdf/page-labels`, {
  session: userB.session,
  method: "POST",
  body: {
    ranges: [{ fromPage: 1, style: "decimal", prefix: "", start: 1 }],
  },
});
check("isolation: another user gets 404", cross.status === 404, `status ${cross.status}`);

const anon = await appFetch(`/api/documents/${documentId}/pdf/page-labels`, {
  method: "POST",
  body: {
    ranges: [{ fromPage: 1, style: "decimal", prefix: "", start: 1 }],
  },
});
check(
  "signed-out: redirects to login (307)",
  anon.status === 307,
  `status ${anon.status}`
);

await finish("page labels");
