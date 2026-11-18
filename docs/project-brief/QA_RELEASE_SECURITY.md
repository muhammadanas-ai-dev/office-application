# QA, Security and Release Gates

## 1. Definition of done

A feature is not complete because the UI looks finished. A feature is complete only when the correct user can perform the workflow, the server persists the result, unauthorized users are denied, failure states are handled, and the deployed Preview build passes tests.

## 2. Required automated checks

Run the repository's actual scripts (do not invent package scripts). At minimum configure equivalents of:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

If the repository uses npm/yarn/bun, use the matching lockfile and frozen/immutable install command.

### Unit tests

- Zod schemas and API input validation.
- Role/entitlement checks.
- File extension, MIME, size and quota validation.
- Editor config generation and document-key generation.
- Callback signature/status handling.
- Format capability registry.
- Version numbering and idempotency helpers.

### Integration tests

- Supabase Auth/session behavior.
- RLS for every user-owned table.
- Storage read/write/delete policies.
- Workspace role and document share access.
- Upload and download through private buckets.
- Save callback writes new immutable version and updates metadata.
- Callback retry/duplicate callback behavior.
- Plan quota and usage metering.

### Playwright critical journeys

1. New user signs up and receives a personal workspace.
2. User creates a folder and blank document.
3. User uploads a DOCX fixture.
4. User opens the document in the office editor.
5. User applies bold, font size, heading, list, table and image changes supported by the engine.
6. User sees a real saving/saved status.
7. User reloads/reopens and verifies content persisted.
8. User downloads the edited DOCX and opens it again.
9. User exports PDF and verifies output.
10. User creates a template-based document.
11. Owner shares document as viewer; second account cannot edit.
12. Owner revokes share; second account loses access.
13. User restores a previous version; a new version is created.
14. Unauthorized user cannot guess a document UUID and read it.
15. AI action fails safely when quota is exhausted or provider is unavailable.

## 3. Document fixture regression pack

Keep synthetic, non-sensitive fixtures under a test-only fixture directory or separate private test bucket:

- `plain-docx.docx`
- `styles-and-headings.docx`
- `lists-and-numbering.docx`
- `complex-tables.docx`
- `images-and-anchors.docx`
- `headers-footers-page-numbers.docx`
- `sections-and-landscape.docx`
- `footnotes-toc-fields.docx`
- `comments-track-changes.docx`
- `unicode-rtl-urdu-arabic.docx`
- `large-document.docx`
- `sample.pdf`
- `scanned-sample.pdf` (for OCR only if implemented)
- representative XLSX/PPTX fixtures for later phases

Fixtures must be original or licensed for test use. Never upload customer files to a public test bucket.

For each claimed file format, test open, edit, save, reopen, export and visual/content comparison as relevant. Record exact engine version and file fixture hashes. A format is not “supported” merely because an upload succeeded.

## 4. Security checklist

### Secrets and environments

- [ ] `.env.local` and all secret-bearing `.env.*` files are ignored by Git.
- [ ] `.env.example` contains placeholders only.
- [ ] No `SUPABASE_SERVICE_ROLE_KEY`, Supabase secret key, office JWT secret, AI key, billing key or webhook secret is prefixed with `NEXT_PUBLIC_`.
- [ ] Server modules using privileged keys are server-only.
- [ ] Separate credentials exist for local, Preview and Production.
- [ ] Secret values are not present in logs, browser source, error messages, screenshots or AI prompts.
- [ ] Rotate any credential exposed accidentally.

### Identity and access

- [ ] Every user-owned table has RLS.
- [ ] Storage buckets are private unless a specific public asset is intentional.
- [ ] Storage policies enforce workspace/document membership.
- [ ] Server checks document permissions before generating editor config or URLs.
- [ ] Viewer/commenter/editor roles are enforced server-side and mapped to editor permissions.
- [ ] Share tokens are random, hashed at rest, expire and can be revoked.
- [ ] UUIDs are not treated as access controls.

### Office editor integration

- [ ] Editor config is created server-side.
- [ ] JWT secret is never sent to the browser.
- [ ] JWT token covers the appropriate config according to the exact editor version docs.
- [ ] Callback signature/JWT and status are validated.
- [ ] Callback document identity is matched to the expected document/workspace.
- [ ] Callback output URL is validated against the expected office-server host and scheme; prevent SSRF, redirect abuse and access to private network targets.
- [ ] Downloaded callback file is size-limited and stored using server-generated object paths.
- [ ] Callback writes are idempotent and race-safe.
- [ ] Old signed document URLs expire; access can be revoked.

### Uploads and processing

- [ ] Allowlist file formats; do not trust browser-provided MIME.
- [ ] Check file signature where feasible and reject malformed/oversized files.
- [ ] Use randomized server-generated storage names.
- [ ] Add rate limits for upload, conversion, editor-config, callback and AI endpoints.
- [ ] Consider malware scanning before allowing download/share for higher-risk deployments.
- [ ] Run conversion/OCR in isolated workers with resource and timeout limits.
- [ ] Prevent zip bombs, path traversal, parser exploits and unbounded image expansion in file-processing workers.

### Privacy and AI

- [ ] AI processing requires a user action and clear disclosure.
- [ ] Send only selected text unless the user explicitly opts into full-document processing.
- [ ] Verify provider retention/training settings and data-processing terms.
- [ ] Do not log raw document contents or prompts by default.
- [ ] Provide quotas, rate limits and maximum input sizes.
- [ ] Show proposed edits and require user approval.

### Web application

- [ ] Use HTTPS in Preview/Production.
- [ ] Restrict CORS to required origins.
- [ ] Apply appropriate Content Security Policy for app and editor domains.
- [ ] Use secure session cookies via the supported Supabase SSR pattern.
- [ ] Protect state-changing routes from CSRF where cookie auth is used.
- [ ] Validate redirects and invite return URLs.
- [ ] Redact tokens, cookies, document URLs and PII in telemetry.

## 5. Daily Vercel release process

The requested “daily deployment” should mean a daily **Preview deployment** for each day's candidate. It must not mean blindly pushing unfinished code to the public Production domain.

Recommended Git flow:

- `main`: latest stable production release.
- `day-01-...`, `day-02-...`, etc.: daily feature branches.
- Pull request to `main` only after tests pass.
- Vercel generates a Preview URL for each branch/PR.
- Run smoke tests on the Preview URL.
- Promote/merge to Production only after release gates and owner authorization.

Vercel's Git integration supports Preview deployments for branches/PRs and Production deployments from the configured production branch. Keep Preview and Production environment variables separate.

### Daily release checklist

- [ ] Feature branch created from last passing baseline.
- [ ] No uncommitted/unrelated user changes overwritten.
- [ ] Migrations reviewed and safe.
- [ ] Lint/typecheck/unit/integration/E2E/build pass.
- [ ] Vercel Preview deployment status is READY.
- [ ] Health check and main UI load.
- [ ] Login/logout works.
- [ ] Document create/open/save/reopen test passes for touched area.
- [ ] No critical browser console/network errors.
- [ ] Screenshots/test evidence saved.
- [ ] Changelog and feature matrix updated.
- [ ] Handoff includes actual Preview URL, commit SHA and test results.

If Muse AI has no Vercel/Git authorization, it must not claim deployment. It should provide the exact commands and state `DEPLOYMENT NOT PERFORMED — ACCESS REQUIRED`.

## 6. Operational metrics

Track basic service health without collecting document content:

- Editor initialization success rate.
- Median and p95 document open time by file-size band.
- Save callback success/failure rate.
- Save latency and callback retry count.
- Conversion job success/failure and duration.
- Upload/download error rate.
- Storage usage and quota rejections.
- AI action counts, usage cost and quota rejection count.
- Unauthorized access attempts and rate-limit events.

Set alert thresholds after a baseline is measured; do not invent SLOs before observing performance.

## 7. Release policy

- **Daily Preview:** expected every day.
- **Production:** only from the stable branch after all checks pass and the owner authorizes it.
- **Rollback:** Vercel rollback or revert to previous stable commit; ensure database migrations are backward-compatible or include a tested recovery plan.
- **Hotfix:** branch from current production, fix/test/deploy Preview, then promote.
- **Database:** do not rely on a frontend rollback to reverse a destructive DB migration.

## 8. Day-15 release report template

```md
# Forma Office v0.1.0 Release Report
- Commit SHA:
- Preview URL:
- Production URL (only if actually promoted):
- Editor engine/version/edition:
- License status:

## Working and tested
- [feature] — [test/evidence]

## Integrated with limitations
- [feature] — [limitation]

## Not implemented
- [feature]

## File format matrix
| Format | Capability | Tested | Notes |
|---|---|---|---|

## QA
- Lint:
- Typecheck:
- Unit tests:
- Integration tests:
- E2E:
- Build:
- Preview smoke test:

## Security and privacy
- RLS:
- Storage RLS:
- Editor JWT/callback:
- Secret scan:
- Known risks:

## Known limitations
- ...

## Next 30 days
- ...
```
