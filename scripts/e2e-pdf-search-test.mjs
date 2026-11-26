// Live e2e for PDF text search (F20).
//   node scripts/e2e-pdf-search-test.mjs
import {
  appFetch,
  check,
  finish,
  makeUser,
  uploadFixturePdf,
} from "./e2e-shared.mjs";

const userA = await makeUser("search-a");
const userB = await makeUser("search-b");
const documentId = await uploadFixturePdf(userA, "Search Fixture");

// The fixture's pages carry "PDF One page 1/2/3".
const found = await appFetch(
  `/api/documents/${documentId}/pdf/search?q=${encodeURIComponent("PDF One")}`,
  { session: userA.session }
);
const foundJson = await found.json();
check("search: succeeds (200)", found.status === 200 && foundJson.ok === true, `status ${found.status}`);
check(
  "search: finds the text on all 3 pages",
  foundJson.total === 3 && foundJson.pages?.length === 3,
  `total ${foundJson.total}`
);
check(
  "search: the snippet carries the matched text",
  foundJson.pages?.[0]?.matches?.[0]?.match === "PDF One",
  foundJson.pages?.[0]?.matches?.[0]?.match ?? "none"
);

const caseMiss = await appFetch(
  `/api/documents/${documentId}/pdf/search?q=${encodeURIComponent("pdf one")}&case=1`,
  { session: userA.session }
);
const caseMissJson = await caseMiss.json();
check(
  "search: match-case is honoured (lowercase query, 0 hits)",
  caseMiss.status === 200 && caseMissJson.total === 0,
  `total ${caseMissJson.total}`
);

const empty = await appFetch(`/api/documents/${documentId}/pdf/search?q=`, {
  session: userA.session,
});
check("search: an empty query is refused (400)", empty.status === 400, `status ${empty.status}`);

const none = await appFetch(
  `/api/documents/${documentId}/pdf/search?q=zebra`,
  { session: userA.session }
);
const noneJson = await none.json();
check(
  "search: a missing word returns zero matches, not an error",
  none.status === 200 && noneJson.total === 0,
  `status ${none.status}`
);

const cross = await appFetch(
  `/api/documents/${documentId}/pdf/search?q=${encodeURIComponent("PDF One")}`,
  { session: userB.session }
);
check("isolation: another user cannot search the document (404)", cross.status === 404, `status ${cross.status}`);

const anon = await appFetch(
  `/api/documents/${documentId}/pdf/search?q=fox`
);
check("signed-out: the search route redirects to login (307)", anon.status === 307, `status ${anon.status}`);

const page = await appFetch(`/documents/${documentId}/pdf-annotate`, {
  session: userA.session,
});
check(
  // The search box itself renders only after PDF.js loads in the
  // browser (the component's loading state is what SSR returns),
  // so this checks the page shell; the API checks above prove
  // the feature itself.
  "page: the annotate page loads for the owner (200)",
  page.status === 200,
  `status ${page.status}`
);

await finish("pdf search");
