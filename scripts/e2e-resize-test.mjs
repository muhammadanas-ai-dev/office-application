// Live e2e for page resize (F27).
//   node scripts/e2e-resize-test.mjs
// Resizes the fixture (3 Letter pages) to A4 and verifies the
// new version's page boxes directly from storage.
import { PDFDocument } from "pdf-lib";
import {
  appFetch,
  check,
  currentBytes,
  finish,
  makeUser,
  uploadFixturePdf,
} from "./e2e-shared.mjs";

const userA = await makeUser("resize-a");
const userB = await makeUser("resize-b");
const documentId = await uploadFixturePdf(userA, "Resize Fixture");

const res = await appFetch(`/api/documents/${documentId}/pdf/resize-pages`, {
  session: userA.session,
  method: "POST",
  body: { pages: [], target: { kind: "preset", preset: "a4" } },
});
const resJson = await res.json();
check(
  "resize: preset A4 succeeds and saves version 2",
  res.status === 200 && resJson.ok === true && resJson.version === 2,
  `status ${res.status}, version ${resJson.version}`
);

const doc = await PDFDocument.load(await currentBytes(documentId));
const sizes = doc.getPages().map((p) => [p.getWidth(), p.getHeight()]);
check(
  "resize: all 3 pages are now A4 (595.28 x 841.89)",
  sizes.length === 3 &&
    sizes.every(
      ([w, h]) => Math.abs(w - 595.28) < 0.5 && Math.abs(h - 841.89) < 0.5
    ),
  JSON.stringify(sizes)
);

const scaled = await appFetch(`/api/documents/${documentId}/pdf/resize-pages`, {
  session: userA.session,
  method: "POST",
  body: { pages: [1], target: { kind: "scale", percent: 50 } },
});
const scaledJson = await scaled.json();
check(
  "resize: scaling page 1 by 50% saves version 3",
  scaled.status === 200 && scaledJson.version === 3,
  `status ${scaled.status}, version ${scaledJson.version}`
);
const doc2 = await PDFDocument.load(await currentBytes(documentId));
const [w1, h1] = [doc2.getPage(0).getWidth(), doc2.getPage(0).getHeight()];
const [w2] = [doc2.getPage(1).getWidth()];
check(
  "resize: page 1 halved, page 2 untouched",
  Math.abs(w1 - 595.28 / 2) < 0.5 &&
    Math.abs(h1 - 841.89 / 2) < 0.5 &&
    Math.abs(w2 - 595.28) < 0.5,
  `p1 ${w1}x${h1}, p2 width ${w2}`
);

const badScale = await appFetch(`/api/documents/${documentId}/pdf/resize-pages`, {
  session: userA.session,
  method: "POST",
  body: { pages: [], target: { kind: "scale", percent: 5 } },
});
check(
  "resize: a 5% scale is refused (400)",
  badScale.status === 400,
  `status ${badScale.status}`
);

const badPage = await appFetch(`/api/documents/${documentId}/pdf/resize-pages`, {
  session: userA.session,
  method: "POST",
  body: { pages: [99], target: { kind: "preset", preset: "a4" } },
});
check(
  "resize: a missing page is refused (400)",
  badPage.status === 400,
  `status ${badPage.status}`
);

const cross = await appFetch(`/api/documents/${documentId}/pdf/resize-pages`, {
  session: userB.session,
  method: "POST",
  body: { pages: [], target: { kind: "preset", preset: "a4" } },
});
check("isolation: another user gets 404", cross.status === 404, `status ${cross.status}`);

const anon = await appFetch(`/api/documents/${documentId}/pdf/resize-pages`, {
  method: "POST",
  body: { pages: [], target: { kind: "preset", preset: "a4" } },
});
check("signed-out: redirects to login (307)", anon.status === 307, `status ${anon.status}`);

await finish("page resize");
