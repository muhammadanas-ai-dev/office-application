// Live e2e for user fonts (F33).
//   node scripts/e2e-fonts-test.mjs
// The user_fonts table lands with the combined SQL file at
// the end of the completion run; until then the API must
// answer with the clear setup message (never a 500), and
// the Settings section must render. The font engine itself
// (magic detection, picker order, drawing with an uploaded
// TTF) is unit-tested.
import {
  appFetch,
  check,
  finish,
  makeUser,
  uploadFixturePdf,
} from "./e2e-shared.mjs";

const userA = await makeUser("fonts-a");
const documentId = await uploadFixturePdf(userA, "Fonts Fixture");

const list = await appFetch("/api/fonts", { session: userA.session });
const listJson = await list.json();
check(
  "fonts: pre-migration, the list answers with the setup message (400, not 500)",
  list.status === 400 && (listJson.error ?? "").includes("not set up yet"),
  `status ${list.status}, ${listJson.error ?? ""}`
);

const settings = await appFetch("/settings", { session: userA.session });
const settingsHtml = await settings.text();
check(
  "fonts: the Settings page has the Your fonts section",
  settings.status === 200 && settingsHtml.includes("Your fonts"),
  `status ${settings.status}`
);

const draw = await appFetch(`/documents/${documentId}/pdf-draw`, {
  session: userA.session,
});
check(
  "fonts: the draw page still renders without the fonts table (200)",
  draw.status === 200,
  `status ${draw.status}`
);

// A bad fontId must fail cleanly (setup message or 404), not 500.
const badUse = await appFetch(`/api/documents/${documentId}/pdf/add-text`, {
  session: userA.session,
  method: "POST",
  body: {
    page: 1,
    x: 50,
    y: 500,
    text: "hello",
    size: 14,
    font: "custom",
    fontId: "00000000-0000-4000-8000-000000000000",
    color: "black",
  },
});
check(
  "fonts: using a custom font pre-migration fails cleanly (400/404, not 500)",
  badUse.status === 400 || badUse.status === 404,
  `status ${badUse.status}`
);

const anon = await appFetch("/api/fonts");
check(
  "signed-out: redirects to login (307)",
  anon.status === 307,
  `status ${anon.status}`
);

await finish("user fonts");
