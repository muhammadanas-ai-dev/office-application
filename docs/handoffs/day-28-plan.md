# Day 28 plan — UX gaps (audit queue item 13, the last one)

Date: 2026-11-20. Owner instruction (00:59 PKT): "okay go
head implement the next feature properly by using
feature loop.md i run the query". There is no pending
migration (Day 21/24/25 are all applied; Days 26/27 had
none) — "i run the query" is the owner's habitual go-ahead
phrasing. This is audit queue item 13
(`docs/project-brief/FEATURE_AUDIT.md` §16 + §14):
UX gaps — the last item in the queue.

## 0. VM reset recovery (done before the plan)

A VM reset happened between Day 27 (22:02 PKT) and 00:59
PKT: the app was down, qpdf was gone, /tmp was wiped.
Recovery: the /tmp fixtures were rebuilt in one command
(`scripts/rebuild-fixtures.py` — pdf1, debug-export, img,
scanned); the app was rebuilt + restarted on :3000 (200);
the OCR worker was restarted. **qpdf is NOT back yet:**
the system's own `apt-get update` (process 821) holds the
apt lock and has been sleeping for several minutes (the
package index download is hanging on the egress proxy).
Do NOT kill it (it is the system's process). Retry
`sudo apt-get update && sudo apt-get install -y qpdf`
later; until then the Day 20 PDF security feature returns
its clear 503 (the app handles a missing qpdf gracefully).
The Day 28 work does not need qpdf.

## 1. What was researched

### The four open items (audit §14)

| # | Item | Status before Day 28 | What Day 28 does |
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
  and the user has no single place to see and manage them
  (today they are only per-document, on each document's
  Share page). So the Shared page is built as the user's
  own share links — the documents THEY shared, with the
  link, the expiry, and a revoke button.
- **The data.** The `document_shares` table (Day 25) has
  `document_id`, `token_hash`, `expires_at`, `created_by`,
  `revoked_at`. The page lists the current user's live
  shares (not revoked, not expired) joined to the document
  title, newest first. Each entry shows the document title
  (a link to the document), the share URL (`/s/<token>` —
  the token itself is NOT stored, so the page shows the
  URL only for links created in this session… no. The
  token is returned ONCE at creation and the database only
  holds its hash, so the full URL CANNOT be reconstructed
  later. The page therefore shows the document, the
  expiry, and the status — NOT the link (the link was
  shown once, at creation). The page says this plainly:
  "The link was shown once when you created it. If you
  lost it, revoke this link and create a new one."
  Each entry has a Revoke button (the existing revoke
  route). This is honest about what the database holds.
- **The sidebar label.** "Shared with me" is wrong for
  links the user created. Rename the nav item to "Shared"
  (the page title is "Shared"). The route stays `/shared`.

### Task 2 — Remove Plan from the sidebar

- **Why "remove" and not "build".** The owner decided
  "Plan page stays skipped (no plan UI)" (Day 24 scope +
  the audit queue note). There is no plan UI to build.
  So the Plan nav item is removed from the sidebar
  (`NAV_ITEMS` in `src/components/layout/app-shell.tsx`).
  The `/plan` route itself is left in place (it is
  unreachable from the nav; deleting the route is a
  follow-up if the owner wants it gone entirely).
  The audit's "built or removed" is satisfied by removal.

### Task 3 — Drag-and-drop upload

- **Where it goes.** The library page (`/files`), on the
  UploadForm (`src/components/library/library-forms.tsx`).
  A drop zone wraps the form: dragging files over it
  shows a "Drop files here to upload" state; dropping
  them uploads each file through the existing
  `uploadDocument` server action (the same action the
  file input uses, so the byte-signature check, the
  size limit and the role check all apply unchanged).
- **How it works.** A client component (`DropZone`) with
  `onDragOver` / `onDragLeave` / `onDrop`. On drop, for
  each file it builds a FormData (`folderId` + the file)
  and calls the `uploadDocument` action. Multiple files
  are uploaded one by one (the action takes one file);
  the zone shows a per-file status (uploading / done /
  error with the action's message). Files that fail the
  byte-signature check show the action's clear error.
  The file input stays (drag-and-drop is an addition,
  not a replacement — keyboard and screen-reader users
  still use the input).
- **Limits.** One file per action call (the action's
  shape). No progress bar per file (the action is a
  single POST; progress would need a chunked upload —
  a follow-up). A dropped folder is not expanded (the
  browser gives files, not a folder walk, in v1).

### Task 4 — Responsive layout

- **What already exists.** The app shell has a desktop
  sidebar (`hidden lg:block`) and a mobile drawer (open/
  close buttons, `lg:hidden`). The header search box
  shrinks (`flex-1 sm:max-w-sm`). The library list is a
  flex column with `flex-wrap` (not a table), so it
  already stacks.
- **What Day 28 verifies and fixes.** Render the key
  pages at a narrow viewport (390px, a phone) and fix
  what actually breaks. The candidates: the header (the
  search box + the nav button crowding), the UploadForm
  (the file input + Upload button overflowing), the
  document action links (many links wrapping badly),
  and the tool pages (the PDF tools / editor pages).
  The verification is a real render (a headless browser
  screenshot at 390px), not a guess. Only the breaks
  found are fixed; the rest is left alone.
- **How it is verified.** A headless Chromium screenshot
  of `/files` (signed in) at 390px wide, before and after
  the fix, plus a check that no horizontal scrollbar
  appears (the page does not overflow the viewport).

### Task 5 — Document tabs

- **What v1 is.** A tab strip showing the documents the
  user has opened, with the active one highlighted.
  The open-documents list is stored in `localStorage`
  (per browser — it is a UI preference, not server data).
  Opening a document (the editor page, or a tool page
  for a document) adds it to the strip (title + a close
  button). Clicking a tab navigates to that document's
  editor. Closing a tab removes it. The active tab is
  the document in the current URL. The strip renders in
  the app shell (above the page content) so it is visible
  on every workspace page, but only when there is at
  least one open document.
- **Why localStorage and not the database.** The open
  documents are a per-browser UI state (which tabs this
  browser has open), not shared data. Storing it in the
  database would sync tabs across devices, which is
  surprising. localStorage is the honest store for it.
- **Limits.** The editor is an ONLYOFFICE iframe, so
  switching tabs reloads the editor (the editor state
  is per document, not kept alive in a background tab).
  The strip holds at most 10 tabs (older ones drop off
  the end). A tab's title is the document title at the
  time it was opened (it does not live-update if the
  document is renamed elsewhere).

## 2. Tasks (small, in order)

1. **Shared page (Task 1):** a server component at
   `src/app/(workspace)/shared/page.tsx` (replacing the
   placeholder) that lists the user's live shares with
   the document title + expiry + a Revoke button (the
   existing revoke route), plus the "link shown once"
   note. Rename the nav item to "Shared". A unit test
   for the expiry/status helper; a live e2e check (create
   a share, the page lists it; revoke it, the page no
   longer lists it).
2. **Remove Plan from the sidebar (Task 2):** delete the
   Plan entry from `NAV_ITEMS`. Verify the sidebar no
   longer shows it (a live e2e check on the /files HTML).
3. **Drag-and-drop upload (Task 3):** a `DropZone`
   client component wrapping the UploadForm; per-file
   status; the file input stays. A unit test for the
   file-acceptance helper (which files are uploadable);
   a live e2e check (drop a real PDF via the form POST
   — the harness simulates the drop by POSTing the same
   FormData the drop handler builds).
4. **Responsive layout (Task 4):** render `/files` at
   390px, find the breaks, fix them (the header, the
   upload form, the document actions). Re-render and
   confirm no horizontal overflow.
5. **Document tabs (Task 5):** a `DocumentTabs` client
   component in the app shell (localStorage, max 10,
   active = the current document id). A unit test for
   the tab-list helpers (add/close/dedupe/cap). A live
   e2e check (open a document, the tab appears in the
   SSR HTML? No — it is localStorage, so the harness
   checks the component renders and the tab list helpers
   work; the live check is the editor page loading with
   the tab strip present).
6. **Full test:** unit suite, the Day 28 e2e harness
   (`scripts/e2e-ux-test.mjs`) as real signed-in users,
   typecheck, lint, build.
7. **Docs + commit + handoff + reply:** update
   `docs/feature-matrix.csv` (FORMA-037),
   `docs/known-limitations.md` (the UX limits),
   `CHANGELOG.md` (Day 28 entry), `docs/project-brief/FEATURE_AUDIT.md`
   (§14 + §16 item 13 → Done), `docs/project-brief/FEATURE_LOOP.md`
   (queue: item 13 Done — the queue is empty), `~/MEMORY.md`
   (Day 28 entry). Write `docs/handoffs/day-28.md`.
   Commit on `day-28-ux-gaps`. **Retry qpdf at the end**
   and record whether it is back.

## 3. Limits (recorded, not faked)

- The Shared page shows the user's own share links, not
  documents others shared with them (multi-user sharing
  stays skipped). The full link cannot be shown again
  (the token is returned once at creation).
- The Plan page is removed from the nav, not built.
- Drag-and-drop uploads one file per action call; no
  per-file progress bar; a dropped folder is not expanded.
- Document tabs reload the editor when switching (the
  editor is an iframe); at most 10 tabs; the title is
  from when the tab was opened.
- Responsive fixes cover the pages verified at 390px;
  the editor itself is ONLYOFFICE's own UI (its mobile
  behaviour is the engine's, not Forma's).
