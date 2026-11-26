// Live e2e for batch PDF export (F28).
//   node scripts/e2e-batch-test.mjs
import {
  appFetch,
  check,
  finish,
  makeUser,
  uploadFixturePdf,
} from "./e2e-shared.mjs";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const userA = await makeUser("batch-a");
const userB = await makeUser("batch-b");
const doc1 = await uploadFixturePdf(userA, "Batch One");
const doc2 = await uploadFixturePdf(userA, "Batch Two");
const docB = await uploadFixturePdf(userB, "Batch Other");

async function batch(session, documentIds, format = "txt") {
  const response = await fetch("http://localhost:3000/api/batch/pdf-export", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `sb-pwncfcvnwudbvwcumado-auth-token=${encodeURIComponent(JSON.stringify(session))}`,
    },
    body: JSON.stringify({ documentIds, format }),
    redirect: "manual",
  });
  return response;
}

function zipList(bytes) {
  const dir = mkdtempSync(join(tmpdir(), "forma-batch-"));
  const path = join(dir, "batch.zip");
  writeFileSync(path, bytes);
  return execFileSync("unzip", ["-Z1", path], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

const res = await batch(userA.session, [doc1, doc2]);
const zipBytes = new Uint8Array(await res.arrayBuffer());
const names = res.status === 200 ? zipList(zipBytes) : [];
check(
  "batch: two PDFs export as one ZIP (200)",
  res.status === 200 &&
    (res.headers.get("content-type") ?? "").includes("application/zip"),
  `status ${res.status}`
);
check(
  "batch: the ZIP holds one .txt per PDF",
  names.includes("Batch One.txt") && names.includes("Batch Two.txt"),
  names.join(", ")
);
check(
  "batch: headers report 2 succeeded, 0 failures",
  res.headers.get("x-forma-batch-succeeded") === "2" &&
    res.headers.get("x-forma-batch-failures") === "0",
  `succeeded ${res.headers.get("x-forma-batch-succeeded")}, failures ${res.headers.get("x-forma-batch-failures")}`
);

const mixed = await batch(userA.session, [doc1, docB]);
const mixedNames =
  mixed.status === 200
    ? zipList(new Uint8Array(await mixed.arrayBuffer()))
    : [];
check(
  "batch: another user's PDF is listed in batch-errors.txt, not exported",
  mixed.status === 200 &&
    mixed.headers.get("x-forma-batch-failures") === "1" &&
    mixedNames.includes("batch-errors.txt") &&
    !mixedNames.some((n) => n.includes("Batch Other")),
  `status ${mixed.status}, entries ${mixedNames.join(", ")}`
);

const allFail = await batch(userA.session, [docB]);
check(
  "batch: a batch where everything fails returns 400",
  allFail.status === 400,
  `status ${allFail.status}`
);

const empty = await appFetch("/api/batch/pdf-export", {
  session: userA.session,
  method: "POST",
  body: { documentIds: [], format: "txt" },
});
check(
  "batch: an empty selection is refused (400)",
  empty.status === 400,
  `status ${empty.status}`
);

const xlsx = await batch(userA.session, [doc1], "xlsx");
check(
  "batch: xlsx format also exports (200, 1 succeeded)",
  xlsx.status === 200 &&
    xlsx.headers.get("x-forma-batch-succeeded") === "1",
  `status ${xlsx.status}`
);

const anon = await fetch("http://localhost:3000/api/batch/pdf-export", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ documentIds: [doc1], format: "txt" }),
  redirect: "manual",
});
check(
  "signed-out: redirects to login (307)",
  anon.status === 307,
  `status ${anon.status}`
);

await finish("batch export");
