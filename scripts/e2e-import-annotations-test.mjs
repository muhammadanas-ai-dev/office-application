// Live e2e for importing annotations from another PDF (F30).
//   node scripts/e2e-import-annotations-test.mjs
import {
  appFetch,
  check,
  finish,
  makeUser,
  uploadFixturePdf,
} from "./e2e-shared.mjs";

const userA = await makeUser("import-a");
const userB = await makeUser("import-b");
const targetId = await uploadFixturePdf(userA, "Import Target");
const sourceId = await uploadFixturePdf(userA, "Import Source");
const emptyId = await uploadFixturePdf(userA, "Import Empty");
const otherId = await uploadFixturePdf(userB, "Import Other");

// Put two comments on the source: pages 1 and 3.
const add = await appFetch(`/api/documents/${sourceId}/pdf/annotations`, {
  session: userA.session,
  method: "POST",
  body: {
    annotations: [
      {
        kind: "highlight",
        page: 1,
        quadPoints: [50, 714, 200, 714, 50, 694, 200, 694],
        contents: "imported highlight",
      },
      {
        kind: "note",
        page: 3,
        x: 100,
        y: 600,
        contents: "imported note",
      },
    ],
  },
});
check("setup: comments added to the source", add.status === 200, `status ${add.status}`);

const imported = await appFetch(
  `/api/documents/${targetId}/pdf/import-annotations`,
  {
    session: userA.session,
    method: "POST",
    body: { sourceDocumentId: sourceId },
  }
);
const importedJson = await imported.json();
check(
  "import: succeeds, saves version 2, imports both comments",
  imported.status === 200 &&
    importedJson.version === 2 &&
    importedJson.imported === 2 &&
    importedJson.skipped === 0,
  `status ${imported.status}, ${JSON.stringify(importedJson)}`
);

const list = await appFetch(`/api/documents/${targetId}/pdf/annotations`, {
  session: userA.session,
});
const listJson = await list.json();
check(
  "import: the target now lists the imported comments",
  list.status === 200 && listJson.annotations?.length === 2,
  `count ${listJson.annotations?.length}`
);

const empty = await appFetch(
  `/api/documents/${targetId}/pdf/import-annotations`,
  {
    session: userA.session,
    method: "POST",
    body: { sourceDocumentId: emptyId },
  }
);
check(
  "import: a source with no comments is refused (400)",
  empty.status === 400,
  `status ${empty.status}`
);

const self = await appFetch(
  `/api/documents/${targetId}/pdf/import-annotations`,
  {
    session: userA.session,
    method: "POST",
    body: { sourceDocumentId: targetId },
  }
);
check(
  "import: importing from itself is refused (400)",
  self.status === 400,
  `status ${self.status}`
);

const cross = await appFetch(
  `/api/documents/${targetId}/pdf/import-annotations`,
  {
    session: userA.session,
    method: "POST",
    body: { sourceDocumentId: otherId },
  }
);
check(
  "isolation: another user's PDF cannot be a source (404)",
  cross.status === 404,
  `status ${cross.status}`
);

const anon = await appFetch(
  `/api/documents/${targetId}/pdf/import-annotations`,
  { method: "POST", body: { sourceDocumentId: sourceId } }
);
check(
  "signed-out: redirects to login (307)",
  anon.status === 307,
  `status ${anon.status}`
);

await finish("import annotations");
