// Live e2e for document properties / PDF metadata (F29).
//   node scripts/e2e-properties-test.mjs
import {
  appFetch,
  check,
  finish,
  makeUser,
  uploadFixturePdf,
} from "./e2e-shared.mjs";

const userA = await makeUser("props-a");
const userB = await makeUser("props-b");
const documentId = await uploadFixturePdf(userA, "Properties Fixture");

const get1 = await appFetch(`/api/documents/${documentId}/properties`, {
  session: userA.session,
});
const props1 = await get1.json();
check(
  "properties: returns the library facts and the PDF dictionary",
  get1.status === 200 &&
    props1.document?.title === "Properties Fixture" &&
    props1.pdf?.pageCount === 3,
  `status ${get1.status}, pages ${props1.pdf?.pageCount}`
);

const edit = await appFetch(`/api/documents/${documentId}/pdf/metadata`, {
  session: userA.session,
  method: "POST",
  body: {
    title: "In-file Title",
    author: "Muhammad Anas",
    subject: "Fixture subject",
    keywords: "alpha, beta",
  },
});
const editJson = await edit.json();
check(
  "metadata: the edit saves version 2",
  edit.status === 200 && editJson.version === 2,
  `status ${edit.status}, version ${editJson.version}`
);

const get2 = await appFetch(`/api/documents/${documentId}/properties`, {
  session: userA.session,
});
const props2 = await get2.json();
check(
  "metadata: the in-file title/author/keywords were written",
  props2.pdf?.title === "In-file Title" &&
    props2.pdf?.author === "Muhammad Anas" &&
    (props2.pdf?.keywords ?? "").includes("alpha"),
  JSON.stringify(props2.pdf)
);
check(
  "metadata: the library title is unchanged (separate from the file)",
  props2.document?.title === "Properties Fixture",
  props2.document?.title
);

const tooLong = await appFetch(`/api/documents/${documentId}/pdf/metadata`, {
  session: userA.session,
  method: "POST",
  body: { title: "x".repeat(301) },
});
check(
  "metadata: an over-long title is refused (400)",
  tooLong.status === 400,
  `status ${tooLong.status}`
);

const page = await appFetch(`/documents/${documentId}/properties`, {
  session: userA.session,
});
check(
  "properties: the page renders for the owner (200)",
  page.status === 200,
  `status ${page.status}`
);

const cross = await appFetch(`/api/documents/${documentId}/properties`, {
  session: userB.session,
});
check("isolation: another user gets 404", cross.status === 404, `status ${cross.status}`);

const anon = await appFetch(`/api/documents/${documentId}/properties`);
check(
  "signed-out: redirects to login (307)",
  anon.status === 307,
  `status ${anon.status}`
);

await finish("document properties");
