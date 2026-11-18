# Day 20 handoff — PDF security (password-protect, permissions, unlock)

Date: 2026-11-18. Owner instruction (16:53 PKT): "okay go head
implement this properly by using feature loop.md" — build audit
queue item 5 (`docs/project-brief/FEATURE_AUDIT.md` §16): PDF
security. (E-signatures stay deferred, legal.)

## 1. What was researched

- **The engine: qpdf (already on this VM).** qpdf 11.9.0 is
  installed (`/usr/bin/qpdf`). It is the standard open-source
  PDF encryption tool (Apache 2.0), and it is already used by
  this project for the e2e checks (`qpdf --check`). There is no
  well-maintained pure-JS PDF encryption library — **pdf-lib
  cannot encrypt or decrypt at all** (confirmed: `PDFDocument.
  load` throws "Input document to `PDFDocument.load` is
  encrypted" on an encrypted PDF, and `ignoreEncryption: true`
  throws too, because the trailer is unreadable). PDF.js can
  *read* an encrypted PDF with a password (for viewing) but
  cannot encrypt or write one. **The audit's §16 item 5 note
  ("pdf-lib supports encryption") was wrong — corrected in this
  day's audit update.**
- **The deployment caveat (honest).** qpdf is a system binary —
  installed via apt, so it does NOT survive a VM reset (like
  Ghostscript and Tesseract, which the app already shells out to
  for compress and OCR), and it will not be on a Vercel
  serverless function. Shelling out to qpdf is consistent with
  the established architecture. If qpdf is missing, the routes
  return a clear 503 and the page shows an unavailable state —
  never a silent failure. Reinstall after a reset: `sudo
  apt-get install qpdf`.
- **Encrypt** (verified in the proof script): `qpdf --encrypt
  --user-password=<user> --owner-password=<owner> --bits=256
  --print=full --extract=n --modify=none -- input.pdf
  output.pdf` (the flag form, qpdf 11.7+). Key lengths: 40 / 128
  / 256. 40-bit is insecure (needs `--allow-weak-crypto` — NOT
  offered). 256-bit is AES-256 (R=6); 128-bit uses AES with
  `--use-aes=y`. Permissions for 128/256-bit: `--print=none|low|
  full`, `--modify=none|assembly|form|annotate|all`,
  `--extract=y|n`, `--annotate=y|n`, `--form=y|n`,
  `--assemble=y|n`, `--accessibility=y|n`. The proof confirmed
  the permissions land in the file (R=6, P=-1340, extract not
  allowed, print allowed, modify not allowed, AESv3). **A user
  password equal to the owner password is accepted by qpdf**
  (exit 0) — so the owner password defaults to the user password
  when the user leaves it blank.
- **Decrypt / unlock** (verified): `qpdf --decrypt
  --password=<pass> input.pdf output.pdf`. A wrong password
  fails with exit code 2 and "invalid password" — mapped to a
  clear 400 ("The password is wrong."). The decrypted PDF loads
  in pdf-lib.
- **Detect + read permissions** (verified): `qpdf
  --show-encryption file.pdf` prints "File is not encrypted"
  for a plain PDF, and for an encrypted one prints `R = 6`,
  `P = -1340` and the permission lines (readable WITHOUT a
  password — it prints an "Incorrect password supplied" warning
  line first, which the parser ignores).
- **Passwords are never stored.** They arrive in the request
  body, are passed to qpdf as command-line arguments, and are
  never written to a file, a log, or the database. (A
  command-line argument is briefly visible in the process list
  — a known qpdf limitation, noted in the handoff; the risk is
  low on this single-user VM, and the passwords are never
  logged.) The server module never logs the qpdf command or its
  arguments.
- **What "permissions" means here.** Permissions are part of
  encryption — they only exist on an encrypted PDF. So
  "permissions" is the permission set chosen when protecting:
  **print** (full / low / none), **copy text** (extract y/n),
  **edit** (modify all / none), **annotate** (y/n). Form filling
  falls under edit (modify=all allows it). To change the
  permissions on an already-encrypted PDF, the user unlocks it
  first (a new version, unencrypted), then protects it with the
  new settings (another new version).

## 2. Completed functionality

- **The pure module** (`src/lib/pdf-security.ts`):
  `SecurityPermissions` (print / extract / modify / annotate),
  `PdfSecurityInfo` (`{encrypted: false}` or `{encrypted: true,
  bits, r, p, permissions}`), `parseShowEncryption(output)`
  (the R, P and permission lines → the info object; "File is not
  encrypted" → `{encrypted: false}`; unexpected output →
  `{encrypted: false}` rather than guessing), `isEncryptedPdf
  (bytes)` (a pdf-lib load that throws the encryption error — a
  corrupt file is reported as not encrypted, it is not — it is
  broken).
- **The server module** (`src/lib/pdf-security.server.ts`,
  `import "server-only"`): `PdfSecurityError` (status),
  `getPdfSecurity(bytes)` (via `--show-encryption`),
  `protectPdf(bytes, {userPassword, ownerPassword, bits,
  permissions})` (via `--encrypt`; the owner password defaults
  to the user password; 128-bit adds `--use-aes=y`),
  `unlockPdf(bytes, password)` (via `--decrypt`). qpdf works on
  files, so the module writes the input to a temp file
  (`fs.mkdtemp` in `os.tmpdir()`), runs qpdf with a 60 s
  timeout, reads the output, and deletes both files in a
  `finally`. A wrong password (exit 2 + "invalid password") is
  a 400; a missing binary (ENOENT) is a 503. The qpdf binary
  path comes from `QPDF_BIN` (env) or the default `qpdf` on PATH.
- **The routes** (`src/app/api/documents/[id]/pdf/protect/` +
  `.../unlock/`, each a POST): Zod bodies (the user password
  4–128 chars; the bits "128"|"256"; the permissions enum),
  the pdf-edit rate limiter, `fetchEditableDocument` +
  `fetchDocumentPdf`, `saveNewVersion`. The protect route refuses
  an already-encrypted PDF (400, "unlock it first") and confirms
  the result is really encrypted before saving it (a
  `getPdfSecurity` check). The unlock route refuses a PDF that
  is not encrypted (400) and confirms the result is really
  unencrypted before saving it. Both catch `PdfEditError`,
  `PdfToolsError` and `PdfSecurityError`.
- **The UI** (the new page `/documents/[id]/pdf-security` +
  client `src/components/pdf-security/pdf-security-client.tsx`):
  the server component runs `getPdfSecurity` on the file (the
  admin client download, the annotate-page pattern) and passes
  the state to the client; if qpdf is missing it passes the
  error instead of guessing. If the PDF is not protected, the
  client shows the Protect form (the passwords, the strength
  256/128, the four permission checkboxes). If it is protected,
  the client shows the current state (the strength, the four
  permissions) and the Unlock form (a password), plus the plain
  warning that there is no password recovery and that changing
  the permissions means unlocking first, then protecting again.
  Library "PDF security" link (PDFs only).

## 3. Code and data changes

- `src/lib/pdf-security.ts` (new, pure) +
  `src/lib/pdf-security.test.ts` (new, 9 tests) +
  `src/lib/__fixtures__/security-encrypted.pdf` (new, committed
  — a small PDF encrypted with qpdf, 256-bit, password
  "test1234", so the detector test is hermetic and does not
  depend on the qpdf binary).
- `src/lib/pdf-security.server.ts` (new, server-only).
- `src/app/api/documents/[id]/pdf/protect/route.ts` (new) +
  `src/app/api/documents/[id]/pdf/unlock/route.ts` (new).
- `src/app/(workspace)/documents/[id]/pdf-security/page.tsx`
  (new) + `src/components/pdf-security/pdf-security-client.tsx`
  (new).
- `src/components/library/library-forms.tsx` + `library-list.tsx`
  (the "PDF security" link, `pdfSecurityHref` prop).
- `scripts/e2e-security-test.mjs` (new, focused harness).
  `scripts/prove-security.mjs` was temporary and deleted.
- Docs: `docs/handoffs/day-20-plan.md`,
  `WPS_LEVEL_PLAN.md` (the security row → Done),
  `docs/feature-matrix.csv` (FORMA-029),
  `docs/known-limitations.md` (the security limits),
  `CHANGELOG.md` (Day 20 entry),
  `docs/project-brief/FEATURE_AUDIT.md` (§6.5 + §16 item 5 →
  Done, with the pdf-lib correction, §17 next step = searchable
  PDF + extract text), `docs/project-brief/FEATURE_LOOP.md`
  (queue: item 5 Done, searchable PDF next),
  `~/MEMORY.md` (Day 20 entry).

## 4. Tests

- **Proof of concept (task 1): all checks pass**
  (`scripts/prove-security.mjs`, deleted after use). A 1-page
  PDF; encrypted with qpdf (256-bit, user + owner passwords,
  print full, extract n, modify none); `qpdf --show-encryption`
  reads the permissions back (R=6, P=-1340, AESv3); pdf-lib
  throws on the encrypted PDF; `qpdf --decrypt` with the right
  password produces a PDF that loads in pdf-lib; a wrong
  password fails with exit code 2 ("invalid password");
  `--show-encryption` on the plain PDF says "File is not
  encrypted". A user password equal to the owner password is
  accepted (exit 0) — verified separately.
- **Unit: 282/282 (22 files passed, 1 skipped, 9 tests skipped —
  the pre-existing skips).** 9 new: the parser on a 256-bit
  output, a 128-bit output with all permissions, a low-only
  print permission, a partial modify permission, "File is not
  encrypted", unexpected output (treated as not encrypted);
  the detector on the committed encrypted fixture, on a plain
  PDF, and on a corrupt file (not encrypted).
- **Live e2e: 24/24 (`scripts/e2e-security-test.mjs`).** As a
  real signed-in user A: the PDF uploads (v1); the security page
  loads (200) for A showing the protect form, and shows
  "Document not found" for B; protecting it (256-bit, print
  full, copy off, edit off, annotate off) succeeds (version 2),
  and `qpdf --show-encryption` on the stored file confirms R=6
  / AESv3, copying not allowed, printing allowed, editing not
  allowed, and PDF.js refuses the file without a password;
  the security page then shows the protected state and the
  256-bit strength; protecting again is refused (400); a wrong
  password is refused (400, "The password is wrong."); unlocking
  with the right password succeeds (version 3), the stored file
  says "File is not encrypted" and loads in PDF.js with 3 pages;
  unlocking an unprotected PDF and a password under 4 characters
  are refused (400); version 1 stays byte-identical to the
  upload; user B gets 404 on both routes; signed-out gets 307
  on both.
- **Typecheck, lint, build: pass.** Prettier applied to the Day
  20 TS files.

## 5. Deployment verification

- App rebuilt and restarted on :3000 (new build, the two
  security routes + the security page included);
  `/api/supabase-status` returns 200.
- **NOT PERFORMED:** no Vercel/Git remote access — no Preview
  deployment, as every day.
- **Docserver:** still wiped, .deb download still 403. The
  editor browser round-trip and the conversion proof still wait
  on it. The OCR worker is still running. qpdf 11.9.0 is
  installed on this VM (it does NOT survive a reset — reinstall
  with `sudo apt-get install qpdf`).

## 6. Security/licensing checks

- No new engine licence to clear: qpdf is Apache 2.0, already
  on the VM and already used by the project. No WPS security
  feature, branding or font is used.
- No secrets in code. The passwords arrive in the request body,
  are passed to qpdf as command-line arguments, and are never
  stored, logged, or written to a file. The server module never
  logs the qpdf command or its arguments. The user password is
  at least 4 characters (Zod); the owner password defaults to
  the user password when left blank.
- **The honest limits:** a command-line argument is briefly
  visible in the process list (a known qpdf limitation — the
  risk is low on this single-user VM); there is no password
  recovery (if the password is forgotten, the PDF cannot be
  opened — that is the point of encryption, and the UI says so).

## 6b. Verification notes and fixes made during Day 20

- **The typecheck caught a real type error before the tests
  did.** In `toSecurityError`, `err.code` was typed as
  `NodeJS.ErrnoException & {code?: number | string}` — the
  intersection resolves `code` to `string`, so comparing it to
  the number `2` (the qpdf exit code for a wrong password) was
  flagged (TS2367). Fixed by typing the error as `{code?:
  unknown; stderr?: unknown}` and narrowing with `code === 2`
  and `code === "ENOENT"`.
- **The live e2e caught a wrong harness check, not a bug.**
  The "shows the 256-bit strength" check looked for the literal
  string "256-bit AES" in the server-rendered HTML, but React
  inserts `<!-- -->` between adjacent text/expression nodes
  (`256<!-- -->-bit AES`), so the literal string never appears.
  The page renders correctly in the browser. The harness now
  strips the `<!-- -->` comments before checking. 24/24 after
  the fix.
- **The audit was corrected.** Its §16 item 5 said "pdf-lib
  supports encryption" — that is wrong (pdf-lib cannot encrypt
  or decrypt). The audit now says qpdf is the engine, with the
  correction noted.

## 7. Known defects and limitations

- **No 40-bit encryption** (insecure — not offered).
- **No password recovery** — if the password is forgotten, the
  PDF cannot be opened. The UI says so plainly.
- **To change the password or permissions** on a protected PDF,
  unlock it first, then protect it again (two new versions).
- **qpdf is a system binary** — it does NOT survive a VM reset
  (reinstall with `sudo apt-get install qpdf`), and it will not
  be on a Vercel serverless function. The security page reports
  it as unavailable instead of failing silently.
- **The editor browser round-trip is still unproven** (the
  docserver is down). The security page loads (200); a human
  protecting and unlocking a PDF in it is the missing proof,
  same as for every other editor feature.

## 8. Tomorrow's target

- **Next feature in the queue: searchable PDF after OCR +
  extract text (#6).** Two parts: (1) after OCR, embed the
  recognised text as an invisible text layer in the scanned PDF
  (so the PDF becomes searchable — the standard "searchable PDF"
  approach, pdf-lib + the OCR word boxes); (2) an extract-text
  action that returns the PDF's text (the extractor from Day 9
  already exists — expose it as a route + a download). The
  searchable-PDF part needs the OCR word positions (the TSV
  gives them) and a decision on whether the invisible text is
  drawn in the same font size as the word boxes.
