// Live e2e for draft auto-save (F35).
//   node scripts/e2e-drafts-test.mjs
// The draft logic itself (keying, expiry, round-trip) is
// unit-tested against a storage adapter; localStorage is
// browser-only, so this harness proves the two surfaces
// that use the hook render for the owner and stay gated.
import {
  appFetch,
  check,
  finish,
  makeUser,
  uploadFixturePdf,
} from "./e2e-shared.mjs";

const userA = await makeUser("drafts-a");
const userB = await makeUser("drafts-b");
const documentId = await uploadFixturePdf(userA, "Drafts Fixture");

const notes = await appFetch(`/documents/${documentId}/notes`, {
  session: userA.session,
});
check(
  "drafts: the notes page (auto-save surface 1) renders for the owner (200)",
  notes.status === 200,
  `status ${notes.status}`
);

const draw = await appFetch(`/documents/${documentId}/pdf-draw`, {
  session: userA.session,
});
check(
  "drafts: the draw page (auto-save surface 2) renders for the owner (200)",
  draw.status === 200,
  `status ${draw.status}`
);

const cross = await appFetch(`/documents/${documentId}/notes`, {
  session: userB.session,
});
const crossHtml = await cross.text();
check(
  "isolation: another user does not get the notes page content",
  cross.status === 200 && crossHtml.includes("Document not found"),
  `status ${cross.status}`
);

const anon = await appFetch(`/documents/${documentId}/notes`);
check(
  "signed-out: redirects to login (307)",
  anon.status === 307,
  `status ${anon.status}`
);

await finish("draft auto-save");
