# Day 28 handoff — UX gaps (audit queue item 13, the last one)

Date: 2026-11-20. Owner instruction (00:59 PKT): "okay go
head implement the next feature properly by using
feature loop.md i run the query". There is no pending
migration (Day 21/24/25 are all applied; Days 26/27 had
none) — "i run the query" is the owner's habitual go-ahead
phrasing. This is audit queue item 13
(`docs/project-brief/FEATURE_AUDIT.md` §16 + §14):
UX gaps — the last item in the queue. **The audit queue
is now empty** (items 1–13 all Done; AI, cloud, billing
and multi-user co-editing stay skipped per the owner).

## 0. VM reset recovery (done before the plan)

A VM reset happened between Day 27 (22:02 PKT) and 00:59
PKT: the app was down, qpdf was gone, /tmp was wiped.
Recovery: the /tmp fixtures were rebuilt in one command
(`scripts/rebuild-fixtures.py` — pdf1, debug-export, img,
scanned); the app was rebuilt + restarted on :3000 (200);
the OCR worker was restarted. **qpdf is NOT back yet:**
the system's own `apt-get update` (process 821) held the
apt lock for ~12 minutes while downloading a ~230 MB
package index at ~12 KB/s, then finished; a new system
apt process (5747, then 5850) took the dpkg lock to
install the replayed packages (logrotate etc.). Do NOT
kill these — they are the system's own processes. Retry
`sudo apt-get install -y qpdf` after they finish; until
then the Day 20 PDF security feature returns its clear
503 and the 2 qpdf-dependent unit tests fail. The Day 28
work does not need qpdf.

## 1. What was researched

### The four open items (audit §14)

| # | Item | Status before Day 28 | What Day 28 did |
|---|---|---|---|
| 1 | No dead controls | Three dead sidebar controls: Templates, Shared, Plan | Templates is REAL since Day 16 (a gallery). Shared is built (Task 1). Plan is removed from the sidebar (Task 2). |
| 2 | Drag-and-drop upload | Not started (upload is a file input) | Built on the library page (Task 3) |
| 3 | Responsive layout | Not started (desktop-first; not proven on small screens) | Verified + fixed on the key pages (Task 4) |
| 4 | Document tabs + active-document state | Not started | A tab strip for open documents (Task 5) |

### Task 1 — Build the Shared page

- **Why "build" and not "remove".** The audit says the dead
  controls "must either be built or removed from the sidebar
  until they exist." Multi-user sharing ("Shared with me" —
  documents others shared with you) is SKIPPED per the
  owner's instruction, so that page cannot be built as-is.
  But Day 25 built single-user sharing (shareable links),
  and the user had no single place to see and manage them
  (only per-document, on each document's Share page). So
  the Shared page is built as the user's own share links.
- **The data.** A new `listMyShares(userClient, userId)` in
  `src/lib/sharing.server.ts` — all shares the user created
  (by `created_by`), newest first, joined to the document
  title via `documents!inner(title)`. Only the user's own
  links (RLS enforces it).
- **The link is NOT shown.** The token is returned ONCE,
  at creation, and the database only holds its hash, so
  the full URL cannot be reconstructed later. The page
  shows the document, the expiry, and the status (Live /
  Expired / Revoked — `shareStatusLabel` in
  `src/lib/sharing.ts`), with a Revoke button per live
  link (the existing revoke route). The page says plainly:
  "The link itself is shown only once, when you create it
  — if you lost a link, revoke it here and create a new one."
- **The sidebar label.** "Shared with me" is wrong for
  links the user created. Renamed to "Shared". The route
  stays `/shared`.

### Task 2 — Remove Plan from the sidebar

- **Why "remove" and not "build".** The owner decided
  "Plan page stays skipped (no plan UI)". There is no plan
  UI to build. So the Plan entry was deleted from
  `NAV_ITEMS` in `src/components/layout/app-shell.tsx`
  (and the now-unused `CreditCard` import). The `/plan`
  route itself is left in place (unreachable from the nav;
  deleting it is a follow-up if the owner wants it gone
  entirely).

### Task 3 — Drag-and-drop upload

- **Where it goes.** The library page (`/files`), on the
  UploadForm (`src/components/library/library-forms.tsx`).
  A `DropZone` client component wraps the form: dragging
  files over it highlights it ("Drop files here to upload");
  dropping them uploads each file through the same
  `uploadDocument` server action the file input uses (called
  directly with a FormData — `uploadDocument(idle, formData)`),
  so the byte-signature check, the size limit and the role
  check all apply unchanged. Multiple files are uploaded
  one by one (the action takes one file) and each shows its
  own status (Uploading… / Uploaded / the action's error).
  After a successful upload the list refreshes
  (`router.refresh()` — the library list is server-rendered).
- **The file input stays** — drag-and-drop is an addition,
  not a replacement (keyboard and screen-reader users still
  use the input). The UploadForm's row also changed from
  `flex` to `flex flex-wrap` so the file input + Upload
  button no longer overflow on a narrow screen.
- **Limits.** One file per action call (the action's shape).
  No per-file progress bar (the action is a single POST;
  progress would need a chunked upload). A dropped folder
  is not expanded (the browser gives files, not a folder
  walk, in v1).

### Task 4 — Responsive layout

- **What already exists.** The app shell has a desktop
  sidebar (`hidden lg:block`) and a mobile drawer (open/
  close buttons, `lg:hidden`). The header search box
  shrinks (`flex-1 min-w-0`) and the Create button shows
  only "Create" on small screens. The library list is a
  flex column with `flex-wrap`, `min-w-0` and `truncate`.
  The pages use `px-4 py-6 sm:px-6` with `max-w-6xl` and
  `flex-col lg:flex-row`. The tool page inputs are
  `w-full` (they fill a `min-w-0` container). The
  DocumentActions are `flex flex-wrap`.
- **Verification.** A live 390px render was NOT possible:
  the local Chromium (`/opt/meta-chromium/chrome`) refuses
  to start — "Hatch WebGL domain policy is required for
  browser startup" (a managed-browser policy) — and the
  cloud browser cannot reach localhost. A `check-responsive.mjs`
  script was written (CDP over the built-in Node WebSocket)
  and then DELETED (it cannot run in this environment).
  The verification is therefore an analytical class audit
  of the shell, library, and tool pages (above) — no fixed
  width larger than the viewport, no non-wrapping flex row
  holding a form control. The one concrete fix found is
  the UploadForm wrap (Task 3).
- **Honest note.** A live small-screen render is still
  owed — it needs a real browser that can reach the app
  (the owner's machine, or the app deployed somewhere
  reachable).

### Task 5 — Document tabs

- **What v1 is.** A tab strip (`DocumentTabs`, in the app
  shell, above the page content) showing the documents
  the user has opened, newest first, with the active one
  highlighted. Clicking a tab navigates to that document's
  editor. The close button removes the tab. The strip only
  renders when there is at least one open document.
- **The store.** localStorage under `forma-open-documents`
  (per browser — it is a UI preference, not shared data).
  Pure helpers in `src/lib/document-tabs.ts`: `parseTabs`
  (malformed values ignored), `serializeTabs`, `addTab`
  (moves an already-open document to the front, caps at
  `MAX_TABS = 10`, dropping the oldest), `closeTab`,
  `documentIdFromPath` (the editor `/editor/[id]` or a
  tool page `/documents/[id]/...`).
- **How a document registers.** The editor page renders
  `RegisterOpenDocument` (a client component, in the same
  file) with the document id + title — only when the
  editor actually loads (not on the error states). It adds
  the document to localStorage and dispatches a
  `forma:tabs-changed` event; the strip listens for it
  (and for the `storage` event, so another tab's change
  is picked up). Tool pages do NOT register themselves
  (they are tools, not open documents) — but if the
  document is already open, the strip still highlights it
  when the user is on its tool page (the active tab is
  the document id in the URL).
- **Limits.** The editor is an ONLYOFFICE iframe, so
  switching tabs reloads the editor (the editor state is
  per document, not kept alive in a background tab). At
  most 10 tabs. A tab's title is the document title at
  the time it was opened (it does not live-update on a
  rename).

## 2. Code and data changes

- `src/lib/sharing.server.ts` (`listMyShares` + `MyShare`)
  + `src/lib/sharing.ts` (`shareStatusLabel`,
  `formatShareExpiry`) + `src/lib/sharing.test.ts` (5 new
  tests) + `src/app/(workspace)/shared/page.tsx` (real,
  replaces the placeholder) +
  `src/components/sharing/shared-list-client.tsx` (new).
- `src/components/layout/app-shell.tsx` (the nav item
  renamed to "Shared"; the Plan entry + the `CreditCard`
  import removed; `<DocumentTabs />` rendered above
  `<main>`).
- `src/components/library/library-forms.tsx` (the
  `DropZone` client component wrapping the UploadForm;
  the form row now wraps).
- `src/lib/document-tabs.ts` (new, pure) +
  `src/lib/document-tabs.test.ts` (new, 8 tests) +
  `src/components/layout/document-tabs.tsx` (new:
  `DocumentTabs` + `RegisterOpenDocument`) +
  `src/app/(workspace)/editor/[id]/page.tsx` (renders
  `RegisterOpenDocument` when the editor loads).
- `scripts/e2e-ux-test.mjs` (new, the Day 28 harness).
- Docs: `docs/handoffs/day-28-plan.md`,
  `docs/feature-matrix.csv` (FORMA-037),
  `docs/known-limitations.md` (the UX limits),
  `CHANGELOG.md` (Day 28 entry),
  `docs/project-brief/FEATURE_AUDIT.md` (§14 + §16 item 13
  → Done), `docs/project-brief/FEATURE_LOOP.md` (queue:
  item 13 Done — the queue is empty), `~/MEMORY.md`
  (Day 28 entry).

## 3. Tests

- **Unit: 382 passed, 2 failed, 11 skipped (395 total).**
  13 new (sharing 5 + document-tabs 8). The 2 failures
  are the qpdf-dependent tests (`pdf-edit.test.ts` "keeps
  the original font and colour" and `pdf-form.test.ts`
  "produces a structurally valid PDF") — they fail with
  `qpdf: not found` because the VM reset wiped qpdf and
  the system apt replay was still running when the suite
  ran. They are NOT Day 28 regressions. Re-run the suite
  after qpdf is back — they should pass.
- **Live e2e (Day 28): 9/9** (`scripts/e2e-ux-test.mjs`).
  The sidebar has "Shared" (not "Shared with me") and no
  "Plan and usage"; /shared loads with the empty state; a
  share created via the API is listed (title + Live);
  revoking it shows Revoked; the drop zone text is on
  /files; the editor page loads. The first run failed on
  the Storage upload (RLS) — the harness's workspace
  insert was missing `owner_id`, `plan_key: "free"` and
  `is_personal: true` (the Day 25 harness pattern), and
  the workspace_members insert was missing
  `status: "active"`. Fixed to match Day 25 exactly.
- **Typecheck, lint, build: pass.** Prettier applied to
  the Day 28 files.

## 4. Deployment verification

- App rebuilt and restarted on :3000 (the Day 28 build);
  `/api/supabase-status` returns 200.
- **NOT PERFORMED:** no Vercel/Git remote access — no Preview
  deployment, as every day.

## 5. Security/licensing checks

- No new engine licence to clear. No secrets in code.
  The tab list is localStorage (per browser, no server
  data). The Shared page shows only the user's own links
  (RLS + the `created_by` query). The drop zone calls the
  same upload action, so the byte-signature check applies.

## 6b. Verification notes and fixes made during Day 28

- **The harness's workspace insert was incomplete.** The
  Storage upload failed with an RLS violation because the
  workspace row lacked `owner_id` / `plan_key` /
  `is_personal` and the membership row lacked
  `status: "active"`. **Fix: match the Day 25 harness
  pattern exactly** (insert the workspace with those
  fields, then the membership with `status: "active"`).
- **The local Chromium is blocked.** `/opt/meta-chromium/chrome`
  refuses to start ("Hatch WebGL domain policy is required
  for browser startup"). The `check-responsive.mjs` CDP
  script was written and then deleted — it cannot run
  here. The responsive verification is the class audit
  in §1 Task 4.
- **The apt lock is held by the system's own replay.**
  Process 821 (`apt-get update`) ran ~12 minutes at
  ~12 KB/s; then 5747/5850 took the dpkg lock to install
  the replayed packages. Do NOT kill these. qpdf is
  still missing at the time of writing.

## 7. Known defects and limitations

- The Shared page shows the links the user created, not
  documents others shared with them (multi-user sharing
  stays skipped). The full link cannot be shown again.
- Drag-and-drop uploads one file per action call, with no
  per-file progress bar, and a dropped folder is not
  expanded.
- Document tabs reload the editor when switching (the
  editor is an iframe); at most 10 tabs; the title is
  from when the tab was opened.
- The responsive layout was verified by a class audit, not
  a live 390px render (the local Chromium is blocked).
- The /plan route still exists (unreachable from the nav).
- qpdf is still missing (the system apt replay is running)
  — the Day 20 PDF security feature returns 503 and 2
  unit tests fail until it is back.

## 8. Tomorrow's target

- **The audit queue is empty.** What remains is the
  follow-up list, not a queue item: the remaining
  templates (proposal, invoice, minutes, certificate +
  spreadsheet/presentation templates), "save a custom
  template", stamps/watermarks, insert-pages-from-an-image,
  the Day 25 "export with comments" + "local reviewer
  notes" half, deleting the /plan route, a live 390px
  render, and the docserver reinstall (the .deb download
  is still blocked). The owner picks the next one — or
  the release (the hardening gate is done, so Forma is
  releasable as a local app once the docserver is back).
