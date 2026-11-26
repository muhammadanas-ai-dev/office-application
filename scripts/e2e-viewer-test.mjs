// Live regression e2e for the F21 viewer rework: the annotate
// surface (page load, annotation add/list) and the F20 search
// must still work after the viewer gained zoom, thumbnails,
// outline, and read modes.
//   node scripts/e2e-viewer-test.mjs
import {
  appFetch,
  check,
  finish,
  makeUser,
  uploadFixturePdf,
} from "./e2e-shared.mjs";

const userA = await makeUser("viewer-a");
const documentId = await uploadFixturePdf(userA, "Viewer Fixture");

const page = await appFetch(`/documents/${documentId}/pdf-annotate`, {
  session: userA.session,
});
check("page: the annotate page loads (200)", page.status === 200, `status ${page.status}`);

const add = await appFetch(`/api/documents/${documentId}/pdf/annotations`, {
  session: userA.session,
  method: "POST",
  body: {
    annotations: [
      {
        kind: "highlight",
        page: 1,
        quadPoints: [50, 714, 200, 714, 50, 694, 200, 694],
        contents: "viewer regression",
      },
    ],
  },
});
const addJson = await add.json();
check(
  "annotate: adding a highlight still creates version 2",
  add.status === 200 && addJson.version === 2,
  `status ${add.status}, version ${addJson.version}`
);

const list = await appFetch(`/api/documents/${documentId}/pdf/annotations`, {
  session: userA.session,
});
const listJson = await list.json();
check(
  "annotate: the highlight is listed back",
  list.status === 200 && listJson.annotations?.length === 1,
  `count ${listJson.annotations?.length}`
);

const search = await appFetch(
  `/api/documents/${documentId}/pdf/search?q=${encodeURIComponent("PDF One")}`,
  { session: userA.session }
);
const searchJson = await search.json();
check(
  "search: still finds the fixture text on 3 pages",
  search.status === 200 && searchJson.total === 3,
  `total ${searchJson.total}`
);

await finish("viewer regression");
