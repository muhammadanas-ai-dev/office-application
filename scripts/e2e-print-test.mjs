// Live e2e for the print view (F31).
//   node scripts/e2e-print-test.mjs
// Page rendering is browser-side (PDF.js canvases); this
// harness proves the route, the access rules and that the
// page shell carries the print UI. The download + comments
// APIs it uses are covered by their own suites.
import {
  appFetch,
  check,
  finish,
  makeUser,
  uploadFixturePdf,
} from "./e2e-shared.mjs";

const userA = await makeUser("print-a");
const userB = await makeUser("print-b");
const documentId = await uploadFixturePdf(userA, "Print Fixture");

const page = await appFetch(`/documents/${documentId}/print`, {
  session: userA.session,
});
const html = await page.text();
check(
  "print: the page renders for the owner with the print UI",
  page.status === 200 &&
    html.includes("Print Fixture") &&
    html.includes("Print / Save as PDF"),
  `status ${page.status}`
);
check(
  "print: the page hides the app chrome when printing",
  html.includes("aside, header"),
  "print stylesheet present"
);

const cross = await appFetch(`/documents/${documentId}/print`, {
  session: userB.session,
});
const crossHtml = await cross.text();
check(
  "isolation: another user sees 'Document not found'",
  cross.status === 200 && crossHtml.includes("Document not found"),
  `status ${cross.status}`
);

const anon = await appFetch(`/documents/${documentId}/print`);
check(
  "signed-out: redirects to login (307)",
  anon.status === 307,
  `status ${anon.status}`
);

await finish("print view");
