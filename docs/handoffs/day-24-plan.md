# Day 24 plan — Settings / preferences

Owner instruction (2026-11-18 17:45 PKT): "okay go head
implement this properly by using feature loop.md" — build audit
queue item 9 (`docs/project-brief/FEATURE_AUDIT.md` §16):
Settings / preferences.

## 1. Research

- **The Settings page today** (`/settings`) only has the
  profile form (display name + email). Its copy says
  "Workspace settings and preferences land on later days." —
  this is that day. The Plan page (`/plan`) is separate
  (the plan/billing UI, which stays skipped) — preferences do
  NOT go there.
- **The profiles table is the natural home** (1:1 with the
  user, RLS: the user can SELECT and UPDATE their own row).
  It already has `display_name`, `avatar_path`, `locale`
  (default 'en'), `created_at`, `updated_at`. **The `locale`
  column is NOT used** — the app has no i18n, so a locale
  preference would be a fake setting (it would change
  nothing). It is NOT included.
- **Which preferences are real (they change behaviour)?**
  Only three, and they are the natural defaults for the
  features built so far:
  1. **OCR default language** (eng/urd/ara) — the OCR page
     has a language select; a default saves a click every
     time, and the OCR route uses it when no language is
     given.
  2. **Default image export format** (png/jpg) — the library
     "Export images" link uses the defaults (PNG, 150 DPI);
     a preference changes what that link downloads.
  3. **Default image export DPI** (72/150/300) — same link.
  Everything else a user might ask for (a default new-document
  format, a timezone) is marginal: the "New" button already
  lets the user pick the format, and dates use the browser's
  timezone. They are NOT included — a settings page with
  settings that do nothing (or that duplicate a picker the
  user already sees) is worse than a small honest one.
- **Storage: three columns on `profiles`** (not a new table —
  the profiles row is already 1:1 with the user and its RLS
  already allows the user to update it). Migration
  `20261118080000_forma_preferences.sql`:
  `ocr_language text not null default 'eng' check
  (ocr_language in ('eng','urd','ara'))`,
  `image_export_format text not null default 'png' check
  (image_export_format in ('png','jpg'))`,
  `image_export_dpi integer not null default 150 check
  (image_export_dpi in (72,150,300))`. A copy is saved to
  `~/workspace/your_files/forma-preferences-migration.sql`
  for the owner to run in the Dashboard (the Day 21 pattern).
  **If the migration is not applied yet**, the Settings page
  shows the preferences with the defaults and a notice ("Run
  the preferences migration to save these settings"), and the
  save action returns a clear error (PGRST204 → "run the
  migration") instead of a cryptic failure.
- **Where the preferences are used.** (1) The OCR page's
  language select defaults to the user's `ocr_language`
  (the OCR client takes a `defaultLanguage` prop). (2) The
  library "Export images" link is built from the user's
  `image_export_format` + `image_export_dpi` (the
  library-list passes them into the href). The export-images
  route itself is unchanged (it still takes the format/DPI as
  query params — the preference only changes what the link
  asks for).

## 2. Small tasks (in order)

1. **Verify the mechanism (proof of concept).** The script
   `scripts/prove-preferences.mjs` (in the project dir —
   keep it until the commit, then delete): create a test user,
   update their profile row (display_name + the three
   preferences) via the user client (RLS), read it back (the
   values stick), and confirm a second user cannot read or
   update the first user's profile (RLS — a 0-row select, an
   update that changes nothing). Verify the CHECK constraints
   reject a bad value (e.g. `ocr_language = 'fra'` → an error).
   *Test: the script prints PASS for every check.* (Note: this
   needs the migration applied — run the migration SQL via the
   Supabase REST API's `rpc`? No — DDL cannot run via REST.
   **The proof script checks the migration first and reports
   clearly if it is not applied** (like the Day 21 harness),
   so it can run before or after the owner applies it.)
2. **Pure module + unit tests.** `src/lib/preferences.ts`:
   `DEFAULT_PREFERENCES` (`{ocrLanguage: "eng",
   imageExportFormat: "png", imageExportDpi: 150}`),
   `isOcrLanguage(value)`, `isImageExportFormat(value)` (reuse
   from pdf-images), `isImageExportDpi(value)` (reuse),
   `getExportImagesHref(documentId, preferences)` (the library
   link, e.g. `/api/documents/<id>/pdf/export-images?
   format=jpg&dpi=300` — only the non-default params are
   included, so the default link stays clean).
   Tests in `src/lib/preferences.test.ts`: the defaults, the
   validators, the href (default vs non-default preferences).
   *Test: the new unit tests pass.*
3. **Migration + server action + Settings UI.**
   Migration `supabase/migrations/
   20261118080000_forma_preferences.sql` + the copy in
   `~/workspace/your_files/`. A server action
   `updatePreferences` (in `src/features/auth/actions.ts`,
   next to `updateProfile` — it updates the three columns on
   the user's profile row via the user client; a Zod schema
   in `src/features/auth/schemas.ts`; PGRST204 → a clear
   "run the migration" error). The Settings page gains a
   "Preferences" section (a `PreferencesForm` in
   `src/components/auth/preferences-form.tsx`, the
   `updateProfile` pattern: useActionState + Field + a select
   for each preference) below the profile form. The page loads
   the three columns (falling back to the defaults + a notice
   if the migration is not applied).
   *Test: the unit tests + the live e2e.*
4. **Use the preferences.** The OCR page passes the user's
   `ocr_language` as the `defaultLanguage` prop to the OCR
   client (the language select starts there). The library-list
   builds the "Export images" href from the user's
   `image_export_format` + `image_export_dpi` (via
   `getExportImagesHref`). The library-list needs the
   preferences — it loads the user's profile row (one extra
   select, RLS) and passes them down.
   *Test: the live e2e checks the OCR page defaults to the
   user's language and the library link carries their format/
   DPI.*
5. **Live e2e harness.** `scripts/e2e-preferences-test.mjs`
   (focused, the Day 13–23 pattern): as user A, the Settings
   page loads (200) and shows the Preferences section; save
   the preferences (OCR language urd, format jpg, DPI 300) via
   the server action (a form POST, the Day 15 pattern — or a
   direct POST to the action); the profile row now has those
   values; the OCR page's language select defaults to urd;
   the library "Export images" link for a PDF carries
   `format=jpg&dpi=300`; a bad value is refused (400); user B
   cannot read or change A's preferences (their own Settings
   page shows their own defaults); signed-out gets 307 on
   /settings. **If the migration is not applied, the harness
   reports it clearly and only runs the checks that do not
   need it** (the Day 21 pattern).
   *Test: the harness passes end to end (after the migration).*
6. **Checks + docs + commit.** Typecheck, lint, Prettier,
   build, restart the app. Update `WPS_LEVEL_PLAN.md` (the
   settings row → Done), `feature-matrix.csv` (FORMA-033),
   `known-limitations.md` (the preferences limits),
   `CHANGELOG.md` (Day 24 entry), `FEATURE_AUDIT.md` (§6.6 +
   §16 item 9 → Done), `docs/handoffs/day-24.md`. Commit on
   branch `day-24-settings-preferences`. Update `~/MEMORY.md`.
   Reply to the owner (including the migration step).

## 3. What is NOT in this feature

- No locale / language preference (the app has no i18n — a
  locale setting would change nothing, so it is not offered).
- No default new-document format (the "New" button already
  lets the user pick) and no timezone preference (dates use
  the browser's timezone).
- No workspace-level settings (the workspace name/plan stay
  where they are; this is per-user preferences).
- No avatar upload (the profiles table has `avatar_path`,
  but uploading an avatar is a separate feature).
- No change to the editor, the upload flow, or the other PDF
  tools. No WPS feature, branding or font is used; the
  implementation is Forma's own on the profiles table.
