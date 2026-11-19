# Day 29 handoff — Vercel deployment preparation + WPS-style UI polish

Date: 2026-11-20. Owner instruction (01:21 PKT): "now i want
you to deploy this to the vercel until and make sure the ui
is also proper and highly followed like wps have deployed
it properly and all the credentials i want full proper
working application till this above feature".

## 0. What is done, and what is blocked

**Done.** The app is deployment-ready and the UI is polished
(§1–§3). The code is on GitHub (`main`, commit 1945a651 +
the Day 29 snapshot — see §4).

**Blocked — the deploy itself.** The Vercel connector is
connected, but every API call fails with 403: "Not
authorized: Trying to access resource under scope
`muhmmad-anas-projects`. You must re-authenticate to this
scope or use a token with access to this scope." The
recovery tool the error names (`authorize_team_access`)
is NOT in the connector's tool list, and `authorize-url`
refuses because the connection already exists ("disconnect
it before starting a new authorization flow"). The connector
doc says disconnect only when the owner asks. So the owner
must re-authorize Vercel team access (one of):
  (a) In the Vercel dashboard: disconnect the Muse
      integration and reconnect it, granting access to the
      `muhmmad-anas-projects` team.
  (b) Or import the GitHub repo from the Vercel dashboard
      directly (Import Git Repository → muhammadanas-ai-dev/
      office-application → set the env vars in §3 → Deploy).
Once the team scope is authorized, the deploy is: create
the project from the GitHub repo, set the env vars in §3,
deploy, and verify (§5).

## 1. UI polish (WPS-style)

- **Sidebar** (`src/components/layout/app-shell.tsx`): the
  nav is now grouped into sections (Workspace / Tools /
  System) with a small uppercase label, a prominent "New"
  button at the top (links to /home, where the Create new
  cards are), and the stale footer ("day-04 shell / the
  editor lands Day 5") replaced with the Forma tagline
  ("Documents, made precise.").
- **Home** (`src/app/(workspace)/home/page.tsx`): a proper
  WPS-style home — a "Create new" row of three cards
  (Document / Spreadsheet / Presentation, each with a
  coloured icon and a "Blank" hint) that create a blank
  file via the library's `createDocument` action (adapted
  by a `createBlank` inline server action — the docs in
  `node_modules/next/dist/docs/` confirm inline server
  actions are supported; the action takes the form, and
  on success redirects to /files where the new document
  is at the top), a "Or start from a template" link, and
  a "Recent" section with a "See all" link.
- **Library** (`src/components/library/library-list.tsx` +
  `src/components/library/file-type-icon.tsx`): each
  document now shows a coloured file-type icon (Word
  blue #2b579a, Spreadsheet green #217346, Presentation
  orange #d24726, PDF red #c0392b, image purple #7c3aed,
  other grey) and a type label (Word / Spreadsheet /
  Presentation / PDF / PNG / JPG / File) next to the size
  and version.

## 2. Deployment preparation

- **`vercel.json`**: the build command is
  `python3 scripts/vercel-setup.py && npm run build`
  (framework: nextjs).
- **`scripts/vercel-setup.py`** (new): regenerates the
  binary assets that cannot live in the GitHub snapshot
  (the snapshot push rejects binaries, and
  `create_or_update_file` double-encodes them — a
  favicon pushed that way landed as base64 text and was
  deleted; a 4-byte test file with a 0x89 byte landed as
  5 bytes, proving the UTF-8 corruption). The script
  pip-installs python-docx, openpyxl, python-pptx, Pillow
  (with `--break-system-packages`), runs
  `generate-blank-templates.py` (blank.docx/xlsx/pptx),
  builds the three template DOCX files + preview JSONs
  by loading `generate-templates.py` by file location
  (it has a hyphen, so it cannot be imported by name),
  and generates a clean branded PNG thumbnail per
  template with Pillow (LibreOffice is not on Vercel, so
  the real first-page render is not possible — the
  thumbnail is a card with the Forma blue bar, the
  template name and its headings/body lines as real
  text). Proven locally: the script regenerates all 9
  files from nothing, and the templates test passes
  (the first version drew only grey bars — 4.6–6.3 KB,
  under the test's 10 KB threshold — so the thumbnail
  now draws the preview text, 19.8–28.0 KB).

## 3. Environment variables for Vercel (set after re-auth)

Public (client-safe):
- `NEXT_PUBLIC_SUPABASE_URL` = https://pwncfcvnwudbvwcumado.supabase.co
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = the publishable key from .env.local
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the legacy anon key (fallback)
- `NEXT_PUBLIC_APP_URL` = the Vercel deployment URL (set after the first deploy)

Server-only (no NEXT_PUBLIC_ prefix):
- `SUPABASE_URL` = https://pwncfcvnwudbvwcumado.supabase.co
- `SUPABASE_SERVICE_ROLE_KEY` = the service-role key from .env.local
  (the admin client needs it; the secret values are never
  repeated in replies, reports or memory)
- `EDITOR_FILE_TOKEN_SECRET` = the editor file-token secret from .env.local
- `ONLYOFFICE_JWT_SECRET` = the docserver JWT secret (moot until a docserver exists)

## 4. GitHub

- The Days 26–28 snapshot push is done: `main` commit
  `1945a651bc809ceb8eeccae128c81e199d30a66e` (343 text files,
  3.77 MiB). The Day 29 files are pushed by a second
  snapshot (same command, same paths file) — see the commit
  in the Day 29 reply.
- The 13 binary files are NOT on GitHub (they cannot be
  pushed — see §2). They are regenerated at build time by
  `scripts/vercel-setup.py`.

## 5. What will and will not work on Vercel (honest)

**Works** (no system binary needed): auth, the library
(upload/download/list/folders/star/trash), sharing links,
versions, settings/preferences, templates, PDF tools that
use pdf-lib (merge/split/rotate/compress via pdf-lib,
editing, form fill/builder, annotations, page tools,
extract text), the health endpoint, the backup script
(metadata via REST).

**Will NOT work on Vercel serverless** (needs a system
binary or a long-running process that Vercel does not
provide):
- **The ONLYOFFICE editor, PDF export and the conversion
  hub** — they need a document server (`ONLYOFFICE_DOCSERVER_URL`).
  There is no docserver anywhere right now (the local one
  was wiped by VM resets and its .deb download is blocked
  403). The editor page will show "not configured". This
  needs an external docserver (a VPS, or ONLYOFFICE's
  hosted offering) — a separate decision and cost.
- **OCR** — needs Tesseract + pdftoppm (binaries) and the
  long-running worker (`ocr/worker.ts` polls the DB every
  5s; Vercel serverless has no always-on process). The OCR
  page will show its "not configured" state.
- **PDF security (encrypt/decrypt)** — needs qpdf. It is
  back locally (11.9.0, see §6) but Vercel has no qpdf;
  the feature returns its clear 503 there.
- **PDF→image / compress** — need pdftoppm / Ghostscript;
  same 503 story on Vercel.

So the Vercel deployment is a real, working app for the
library/PDF-tools surface, and an honest "not configured"
for the editor/OCR/security surface until the external
services exist. Do NOT present it as fully working.

## 6. qpdf is back (local)

The system's apt replay finally finished, and `sudo apt-get
install -y qpdf` landed qpdf 11.9.0. The Day 28 handoff's
2 failing unit tests now pass. **The full unit suite is
green: 386 passed, 0 failed, 9 skipped.** The hardening
e2e is 11/11 and the UX e2e is 9/9. The local PDF security
feature works again.

## 7. Tests

- Unit: 386 passed, 0 failed, 9 skipped (395 total).
- Live e2e (Day 28 UX): 9/9. Live e2e (Day 27 hardening):
  11/11. Typecheck + build pass.

## 8. Tomorrow's target

- The owner re-authorizes Vercel team access (or imports
  the repo from the Vercel dashboard). Then: create the
  project from GitHub, set the env vars in §3, deploy,
  set `NEXT_PUBLIC_APP_URL` to the deployment URL,
  redeploy, and verify the live URL (auth, library,
  sharing, a PDF tool) — and record the §5 limits
  honestly in the deployment reply.
- The external docserver decision (VPS vs ONLYOFFICE
  hosted) is the one that unlocks the editor/export/
  conversion on the live app.
