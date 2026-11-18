# Day 20 plan — PDF security (password-protect, permissions, unlock)

Owner instruction (2026-11-18 16:53 PKT): "okay go head
implement this properly by using feature loop.md" — build audit
queue item 5 (`docs/project-brief/FEATURE_AUDIT.md` §16): PDF
security — password-protect, permissions, unlock. (E-signatures
stay deferred, legal.)

## 1. Research

### The engine: qpdf (already on this VM)
- **qpdf 11.9.0 is installed** (`/usr/bin/qpdf`). It is the
  standard open-source PDF encryption tool (Apache 2.0), and it
  is already used by this project for the e2e checks
  (`qpdf --check`). There is no well-maintained pure-JS PDF
  encryption library — pdf-lib cannot encrypt or decrypt at all
  (confirmed: `PDFDocument.load` throws "Input document to
  `PDFDocument.load` is encrypted" on an encrypted PDF, and
  `ignoreEncryption: true` throws too, because the trailer is
  unreadable). PDF.js can *read* an encrypted PDF with a password
  (for viewing) but cannot encrypt or write one.
- **The deployment caveat (honest).** qpdf is a system binary —
  it is installed via apt, so it does NOT survive a VM reset
  (like Ghostscript and Tesseract, which the app already shells
  out to for compress and OCR), and it will not be on a Vercel
  serverless function. Shelling out to qpdf is consistent with
  the established architecture (Ghostscript for compress,
  Tesseract for OCR, ONLYOFFICE for conversion). If qpdf is
  missing, the routes return a clear 503 and the page shows an
  unavailable state — never a silent failure. Reinstall after a
  reset: `sudo apt-get install qpdf`.
- **Encrypt** (verified in the proof script):
  `qpdf --encrypt --user-password=<user> --owner-password=
  <owner> --bits=256 --print=full --extract=n --modify=none --
  input.pdf output.pdf` (the flag form, qpdf 11.7+). Key lengths:
  40 / 128 / 256. 40-bit is insecure (needs
  `--allow-weak-crypto` — NOT offered). 256-bit is AES-256
  (R=6); 128-bit uses AES with `--use-aes=y`. Permissions for
  128/256-bit: `--print=none|low|full`,
  `--modify=none|assembly|form|annotate|all`,
  `--extract=y|n`, `--annotate=y|n`, `--form=y|n`,
  `--assemble=y|n`, `--accessibility=y|n`. The proof confirmed
  the permissions land in the file (R=6, P=-1340, extract not
  allowed, print allowed, modify not allowed, AESv3).
- **Decrypt / unlock** (verified): `qpdf --decrypt
  --password=<pass> input.pdf output.pdf`. A wrong password
  fails with exit code 2 and "invalid password" — mapped to a
  clear 400 ("The password is wrong."). The decrypted PDF loads
  in pdf-lib.
- **Detect + read permissions** (verified): `qpdf
  --show-encryption file.pdf` prints "File is not encrypted"
  for a plain PDF, and for an encrypted one prints `R = 6`,
  `P = -1340` and the permission lines (extract / print low /
  print high / modify assembly / forms / annotations / other /
  anything) — readable WITHOUT a password (it prints an
  "Incorrect password supplied" warning line first, which the
  parser ignores). The P bitmask is also parsed for the exact
  permission bits.
- **Passwords are never stored.** They arrive in the request
  body, are passed to qpdf as command-line arguments, and are
  never written to a file, a log, or the database. (A
  command-line argument is briefly visible in the process list
  — a known qpdf limitation, noted in the handoff; the risk is
  low on this single-user VM, and the passwords are never
  logged.) The server module never logs the qpdf command or its
  arguments.

### What "permissions" means here
- Permissions are part of encryption — they only exist on an
  encrypted PDF (an unencrypted PDF has no permission flags to
  set). So "permissions" is the permission set chosen when
  protecting: **print** (full / none), **copy text** (extract
  y/n), **edit** (modify all / none), **annotate** (y/n). Form
  filling falls under edit (modify=all allows it). To change the
  permissions on an already-encrypted PDF, the user unlocks it
  first (a new version, unencrypted), then protects it with the
  new settings (another new version).
- **The owner password** controls the permissions (opening with
  the owner password gives full access). If the user does not
  provide one, it defaults to the user password. The user
  password is required (a PDF that opens without a password is
  not protected). Minimum 4 characters for the user password
  (a reasonable floor; the UI recommends a strong password).

### Where it lives
- **A server module** `src/lib/pdf-security.server.ts`
  (`import "server-only"`): `getPdfSecurity(bytes)` (detect +
  read permissions, via `--show-encryption`), `protectPdf
  (bytes, {userPassword, ownerPassword, bits, permissions})`
  (via `--encrypt`), `unlockPdf(bytes, password)` (via
  `--decrypt`). qpdf works on files, so the module writes the
  input to a temp file (`fs.mkdtemp` in `os.tmpdir()`), runs
  qpdf with a timeout, reads the output, and deletes both files
  in a `finally`. A `PdfSecurityError` (status) is thrown for a
  wrong password (400), a missing qpdf binary (503), and a bad
  input (400). The qpdf binary path comes from `QPDF_BIN` (env)
  or the default `qpdf` on PATH.
- **The pure module** `src/lib/pdf-security.ts`: the types
  (`SecurityPermissions`, `PdfSecurityInfo`), the permission
  bit constants, `parseShowEncryption(output)` (the R, P and
  permission lines → the info object), `isEncryptedPdf` (a
  pdf-lib load that throws the encryption error — a pure-JS
  fallback detector, used by the routes to refuse editing an
  encrypted PDF with a clear message).
- **The routes** follow the pdf-edit route pattern (Zod, the
  pdf-edit server module, the rate limiter, both error classes
  caught, `{ok, version, documentId, title}`):
  `POST /api/documents/[id]/pdf/protect` (the passwords + bits
  + permissions) and `POST /api/documents/[id]/pdf/unlock`
  (the password). **Both create a NEW immutable version** —
  never an overwrite. The protect route refuses an already-
  encrypted PDF (400, "unlock it first"); the unlock route
  refuses a PDF that is not encrypted (400).
- **The UI** is a new page (`/documents/[id]/pdf-security`,
  "PDF security" in the library, PDFs only). The server
  component runs `getPdfSecurity` on the file (via the admin
  client download, the annotate-page pattern) and passes the
  state to the client. If the PDF is not encrypted, the client
  shows the Protect form (user password, owner password
  optional, strength 256/128, the four permission checkboxes).
  If it is encrypted, the client shows the current state (the
  strength, the permissions) and the Unlock form (a password).
  The page also says plainly that changing the permissions
  means unlocking first, then protecting again.
- **No migration.** Nothing new is stored — the encryption lives
  in the file itself (the new version).

## 2. Small tasks (in order)

1. **Verify the mechanism (proof of concept).** The script
   `scripts/prove-security.mjs` (already run, in the project
   dir — keep it until the commit, then delete): a 1-page PDF;
   encrypt it with qpdf (256-bit, user + owner passwords,
   print full, extract n, modify none); `qpdf --show-encryption`
   reads the permissions back (R=6, P=-1340, AESv3); pdf-lib
   throws on the encrypted PDF; `qpdf --decrypt` with the right
   password produces a PDF that loads in pdf-lib; a wrong
   password fails with exit code 2 ("invalid password");
   `--show-encryption` on the plain PDF says "File is not
   encrypted". **Done: all checks pass.**
   *Test: the script prints PASS for every check (it prints the
   results directly — the output above is the proof).*
2. **Pure module + unit tests.** `src/lib/pdf-security.ts`:
   the types, the P-bit constants, `parseShowEncryption` (the R,
   P and permission lines → the info object; "File is not
   encrypted" → `{encrypted: false}`), `isEncryptedPdf` (a
   pdf-lib load that throws the encryption error). Tests in
   `src/lib/pdf-security.test.ts`: parse a real
   `--show-encryption` output (the one from the proof), parse
   "File is not encrypted", parse a 128-bit output, detect an
   encrypted PDF (the proof's encrypted file — committed as a
   fixture? No: the test encrypts a fixture PDF with qpdf in the
   test? That would make the unit test depend on the qpdf
   binary. Instead: the test builds an encrypted PDF with the
   *server* module's protect function only if qpdf is available,
   else it skips — no, unit tests must not depend on external
   binaries. So the unit test uses a *committed* encrypted
   fixture (a small PDF encrypted with qpdf at authoring time,
   password "test1234", stored in `src/lib/__fixtures__/
   security-encrypted.pdf`) for the detection test, and plain
   strings for the parser tests. The fixture is a real file,
   committed, so the test is hermetic.
   *Test: the new unit tests pass.*
3. **Server module + routes.** `src/lib/pdf-security.server.ts`
   (the qpdf wrapper, temp files, timeout, cleanup, the
   `PdfSecurityError` class) + the two POST routes above.
   *Test: the routes are covered by the live e2e.*
4. **UI.** The new page `/documents/[id]/pdf-security` + client
   `src/components/pdf-security/pdf-security-client.tsx`: the
   state (encrypted or not, the strength, the permissions), the
   Protect form (the passwords, the strength, the four
   permission checkboxes) or the Unlock form (a password).
   Library "PDF security" link (PDFs only).
   *Test: the page loads (checked in the live e2e).*
5. **Live e2e harness.** `scripts/e2e-security-test.mjs`
   (focused, the Day 13–19 pattern): as user A, upload a PDF;
   the security page loads (200) for A and shows "Document not
   found" for B; protect it (256-bit, a user password, print
   full, copy off, edit off, annotate off) — succeeds (version
   2), and `qpdf --show-encryption` on the stored file confirms
   it is encrypted (R=6, extract not allowed); protect it again
   (already encrypted) is refused (400); unlock with a wrong
   password is refused (400); unlock with the right password
   succeeds (version 3) and the stored file loads in pdf-lib
   and says "File is not encrypted"; version 1 is unchanged;
   user B gets 404 on both routes; signed-out gets 307.
   *Test: the harness passes end to end.*
6. **Checks + docs + commit.** Typecheck, lint, Prettier,
   build, restart the app. Update `WPS_LEVEL_PLAN.md` (the
   security row → Done), `feature-matrix.csv` (FORMA-029),
   `known-limitations.md` (the security limits),
   `CHANGELOG.md` (Day 20 entry), `FEATURE_AUDIT.md` (§6.5 +
   §16 item 5 → Done), `docs/handoffs/day-20.md`. Commit on
   branch `day-20-pdf-security`. Update `~/MEMORY.md`. Reply to
   the owner.

## 3. What is NOT in this feature

- No 40-bit encryption (insecure — not offered).
- No e-signatures (deferred, legal).
- No "change permissions" on an encrypted PDF without unlocking
  first (the flow is unlock → protect again).
- No password recovery — if the user forgets the password, the
  PDF cannot be opened (that is the point of encryption). The UI
  says so plainly.
- No change to the editor, the upload flow, or the other PDF
  tools. No migration. No WPS security feature, branding or font
  is used; the implementation is Forma's own on qpdf.
