// Live e2e for the settings pack (F32).
//   node scripts/e2e-appearance-test.mjs
// The appearance columns arrive with the combined SQL file
// at the end of the completion run; until then the settings
// page must show the setup notice and the app must keep
// working on defaults. Persistence itself is covered once
// the migration lands (the action + helpers are unit-tested).
import {
  appFetch,
  check,
  finish,
  makeUser,
} from "./e2e-shared.mjs";

const userA = await makeUser("appearance-a");

const settings = await appFetch("/settings", { session: userA.session });
const html = await settings.text();
check(
  "settings: the page renders (200)",
  settings.status === 200,
  `status ${settings.status}`
);
check(
  "settings: the Appearance & language section is present",
  html.includes("Appearance") && html.includes("Theme"),
  "section heading found"
);
check(
  "settings: the accessibility switches are present",
  html.includes("Reduce motion") &&
    html.includes("Larger text") &&
    html.includes("High contrast"),
  "three switches found"
);
check(
  "settings: the keyboard shortcut reference is present",
  html.includes("Keyboard shortcuts"),
  "shortcuts heading found"
);
check(
  "settings: pre-migration, the setup notice shows (columns land with the combined SQL)",
  html.includes("not set up yet"),
  "notice found"
);

const files = await appFetch("/files", { session: userA.session });
check(
  "workspace: the files page still renders with the appearance bootstrap (200)",
  files.status === 200,
  `status ${files.status}`
);

const anon = await appFetch("/settings");
check(
  "signed-out: settings redirects to login (307)",
  anon.status === 307,
  `status ${anon.status}`
);

await finish("settings pack");
