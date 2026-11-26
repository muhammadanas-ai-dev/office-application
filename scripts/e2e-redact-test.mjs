// Live e2e for redaction (F26).
//   node scripts/e2e-redact-test.mjs
// Redacts page 1's text on the fixture, then proves via the
// F20 search that the text is GONE from the new version (not
// merely covered).
import {
  appFetch,
  check,
  finish,
  makeUser,
  uploadFixturePdf,
} from "./e2e-shared.mjs";

const userA = await makeUser("redact-a");
const userB = await makeUser("redact-b");
const documentId = await uploadFixturePdf(userA, "Redact Fixture");

// The fixture's text sits at (50, 700), size 20.
const res = await appFetch(`/api/documents/${documentId}/pdf/redact`, {
  session: userA.session,
  method: "POST",
  body: { regions: [{ page: 1, x: 40, y: 688, width: 320, height: 34 }] },
});
const resJson = await res.json();
check(
  "redact: succeeds and saves version 2",
  res.status === 200 && resJson.ok === true && resJson.version === 2,
  `status ${res.status}, version ${resJson.version}`
);
check(
  "redact: reports the removed text run(s)",
  (resJson.removed?.textRuns ?? 0) >= 1,
  `textRuns ${resJson.removed?.textRuns}`
);

const search = await appFetch(
  `/api/documents/${documentId}/pdf/search?q=${encodeURIComponent("PDF One")}`,
  { session: userA.session }
);
const searchJson = await search.json();
check(
  "redact: the redacted page's text no longer exists (search finds 2, not 3)",
  search.status === 200 && searchJson.total === 2,
  `total ${searchJson.total}`
);
check(
  "redact: page 1 has no matches left",
  !(searchJson.pages ?? []).some((p) => p.page === 1),
  "page 1 absent from results"
);

const badPage = await appFetch(`/api/documents/${documentId}/pdf/redact`, {
  session: userA.session,
  method: "POST",
  body: { regions: [{ page: 99, x: 0, y: 0, width: 10, height: 10 }] },
});
check(
  "redact: a region on a missing page is refused (400)",
  badPage.status === 400,
  `status ${badPage.status}`
);

const empty = await appFetch(`/api/documents/${documentId}/pdf/redact`, {
  session: userA.session,
  method: "POST",
  body: { regions: [] },
});
check(
  "redact: an empty region list is refused (400)",
  empty.status === 400,
  `status ${empty.status}`
);

const cross = await appFetch(`/api/documents/${documentId}/pdf/redact`, {
  session: userB.session,
  method: "POST",
  body: { regions: [{ page: 1, x: 0, y: 0, width: 10, height: 10 }] },
});
check("isolation: another user gets 404", cross.status === 404, `status ${cross.status}`);

const anon = await appFetch(`/api/documents/${documentId}/pdf/redact`, {
  method: "POST",
  body: { regions: [{ page: 1, x: 0, y: 0, width: 10, height: 10 }] },
});
check("signed-out: redirects to login (307)", anon.status === 307, `status ${anon.status}`);

await finish("redaction");
