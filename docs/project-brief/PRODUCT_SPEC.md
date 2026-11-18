# Product Specification — Forma Office

**Status:** Initial product brief  
**Benchmark:** WPS Office (functional benchmark only)  
**Primary surface:** Browser-based office workspace  
**First milestone:** Writer-first, 15-day vertical slice

## 1. Product vision

Forma Office is a professional web workspace for creating, editing, organizing and collaborating on office documents. Its value is not simply a text box with a toolbar. The product must manage real files, preserve document formatting, support common office workflows and give users confidence that their work is saved, secure and portable.

### Target users

- Students and educators preparing assignments, notes and reports.
- Freelancers and small businesses preparing proposals, invoices, contracts and client documents.
- Office teams reviewing reports, policies and operational documents.
- People who need to open, edit and export Word-compatible documents without installing desktop software.

### Core jobs to be done

1. Start a professional document quickly from a blank page or template.
2. Open an existing document without losing its layout.
3. Edit text, tables, images, page layout and styles.
4. Save reliably and recover from accidental edits or interruptions.
5. Share a document with the correct permissions.
6. Review, comment on and approve changes.
7. Export a portable file that looks correct on another device.
8. Use optional AI assistance without losing control of document content or privacy.

## 2. Product boundaries

WPS Office includes Writer, Spreadsheet, Presentation, PDF and additional features. This project should build a coherent suite shell, but feature parity must be proven module by module.

### Day-15 target

- Workspace and file library.
- Authentication, personal workspace and secure sharing model.
- Writer editor integration for documented supported formats.
- Create, upload, open, edit, save, reopen and download.
- Core text and page formatting supported by the embedded editor.
- Tables, images, hyperlinks and page elements supported by the embedded editor.
- Comments/review/collaboration to the extent enabled by the selected editor edition and verified in the integration.
- Version history and recovery workflow owned by the app where feasible.
- Template gallery with original sample templates.
- PDF export and preview for tested cases.
- Basic plans/entitlements and usage metering (payment launch may remain gated).
- Responsive, accessible application shell.

### Explicitly not promised by Day 15

- Pixel-perfect recreation of WPS.
- Every premium WPS feature on every platform.
- Perfect editing fidelity for every legacy format.
- Full spreadsheet formula engine, pivot tables, macros and advanced charts built from scratch.
- Full presentation animation and transition engine built from scratch.
- Full PDF object-level editing, OCR for every language, digital signature compliance or enterprise e-signature workflow unless separately integrated and tested.
- Native Windows, macOS, Linux, iOS and Android apps.
- Unlimited users, storage or AI usage.

## 3. Feature inventory and priority

Priority definitions:
- **P0:** Required for a credible Day-15 product.
- **P1:** High-value next milestone.
- **P2:** Advanced parity or enterprise capability.

| Module | Feature | Priority | Acceptance evidence |
|---|---|---:|---|
| Identity | Sign up, sign in, sign out, reset password | P0 | Auth E2E tests; sessions handled securely |
| Workspace | Personal workspace, profile, roles | P0 | Member-role tests and RLS tests |
| Library | Create folders, list files, search, sort, rename, move | P0 | UI + DB integration tests |
| Files | Upload/download supported file types | P0 | MIME/size validation; private bucket; round trip |
| Writer | Create blank DOCX and open existing supported DOCX | P0 | Open/edit/save/reopen test fixtures |
| Writer | Bold, italic, underline, font, size, color, alignment, lists | P0 | Each toolbar action changes saved file |
| Writer | Paragraph styles and headings | P0 | Export/reopen fixture tests |
| Writer | Page size, margins, orientation, page breaks | P0 | Visual export checks |
| Writer | Tables, images and hyperlinks | P0 | Add/edit/save/reopen fixtures |
| Writer | Header/footer/page number | P0/P1 | Engine capability verified; exported PDF checked |
| Persistence | Autosave state and save callback | P0 | Save/reopen and network-error tests |
| Versions | Snapshot history, restore previous version | P0/P1 | Restore creates new version; no destructive overwrite |
| Sharing | Invite/share, viewer/editor roles | P1 | Unauthorized access tests |
| Review | Comments and track changes | P1 | Two-user collaboration test where licensed/enabled |
| Templates | Resume, letter, report, proposal, minutes, invoice | P1 | Create-from-template produces editable file |
| Fonts | Font selector for server-installed fonts | P1 | Browser/exported output consistency tests |
| PDF | Export DOCX to PDF, preview and download | P0 | Text/layout comparison on fixture set |
| PDF | Merge/split/rotate/compress | P1 | Output integrity and page-count tests |
| PDF | OCR and searchable scans | P2 | Language-specific benchmark and confidence reporting |
| AI | Rewrite, summarize, proofread, translate | P1 | Explicit consent, quota enforcement, human review |
| Spreadsheet | Open/edit/save supported XLSX | P1 | Formula/format fixture suite |
| Presentation | Open/edit/save supported PPTX | P1 | Slide/layout fixture suite |
| PDF | Edit existing text/images and fill forms | P2 | Feature-specific fixtures; never claim unsupported |
| Enterprise | SSO, SCIM, audit export, retention, DLP | P2 | Security/operations acceptance tests |

## 4. Main application information architecture

### Main navigation

- Home
- Recent
- My files
- Shared with me
- Starred
- Templates
- Trash (only if soft-delete/restore is implemented)
- Settings
- Plan and usage

### Editor shell

- Top bar: back to library, document title, sync status, sharing, account.
- Ribbon/menu: File, Home, Insert, Layout, References, Review, View, Help (only show tabs with implemented functions).
- Toolbar: context-sensitive groups, tooltips, accessible controls.
- Document canvas: editor-owned page layout, page boundaries and zoom.
- Right panel: comments, document outline or optional AI assistant.
- Bottom status: page count, word count, language, zoom, connection/save state where available.

Do not duplicate the office engine's toolbar controls with a second independent formatting state. If the engine owns the document canvas, use its supported APIs/customization points or present its native editor UI. A decorative outer toolbar that does not control the document is unacceptable.

## 5. Core user flows

### Flow A — first session

1. User visits landing page.
2. User creates account or signs in.
3. Server creates profile and personal workspace.
4. User lands on Home with create/import actions.
5. User creates a blank document or selects an original template.
6. App opens the editor with a server-signed editor configuration.
7. User edits the document; editor calls the save callback.
8. Backend validates callback, writes a new version/file and updates metadata.
9. User returns to the library and sees the updated title/time/status.

### Flow B — upload and edit

1. User selects a file.
2. Server checks membership, allowed extension, MIME signature, file size and quota.
3. File is uploaded to a private Supabase Storage path.
4. Metadata row is inserted only after successful authorization.
5. App checks whether the chosen engine supports editing the format.
6. If supported, app opens editor; if view-only/convertible/unsupported, show a truthful explanation and safe conversion option where available.
7. User saves; callback produces a new version.
8. App provides download of original/current/previous version as permitted.

### Flow C — share and collaborate

1. Owner opens Share.
2. Owner selects a role (viewer/commenter/editor) and enters an invited user or uses a secure invite link.
3. Server validates owner/admin rights and creates a share record with hashed token if a link is used.
4. Recipient authenticates or validates the invite.
5. Server checks workspace/document membership on every access.
6. Editor config contains only the current user's allowed permissions.
7. Revocation invalidates access immediately; test already-open editor behavior and document-server session expiry.

### Flow D — version recovery

1. A saved edit creates a version snapshot or editor-engine version entry.
2. User opens history and sees version, author, timestamp and source.
3. User previews a version.
4. Restore writes a new current version copied from the selected version; it does not delete newer versions.
5. Audit event is recorded.

### Flow E — template creation

1. User browses categories and previews an original template.
2. User selects Use template.
3. Backend copies a template fixture to a user/workspace-owned document object.
4. User edits placeholders and saves a new document.
5. Template metadata remains separate from the user's copy.

### Flow F — AI edit assistance

1. User highlights text and opens an AI action.
2. UI shows the selected scope and provider/privacy notice.
3. Server validates user, plan entitlement, quota, input size and model/provider config.
4. Provider receives only the requested selected text unless the user explicitly asks for whole-document processing.
5. App displays a proposed result in a diff/preview.
6. User chooses Insert/Replace/Discard.
7. Accepted change is written through the editor's supported API or user paste action.
8. Usage event is recorded without storing sensitive document text in logs.

## 6. File format policy

Do not promise “all formats” as a single checkbox. Every file type must have one explicit capability state:

- `editable`: edit and save supported without known unacceptable loss for the tested fixture/profile.
- `view_only`: open/view only.
- `convertible`: convert to a supported editable format; warn about possible conversion loss.
- `unsupported`: reject with a clear message and keep the original safe.
- `tested`: a separate QA flag indicating that representative fixtures have passed.

Initial engine research must use the current official supported-format matrix. For ONLYOFFICE Docs, consult its official format repository/docs. The currently surfaced matrix distinguishes viewing, editing, reviewing, commenting, filling and conversion; these are not interchangeable.

Recommended initial matrix (must be re-verified on the exact deployed engine version):

| Format | Initial target | Important note |
|---|---|---|
| DOCX | Editable | Primary Word format; test layout fidelity |
| DOCM/DOTX/DOTM | Conditional editable | Check macro/template behavior and security |
| DOC | View/convert depending on engine | Legacy format; do not assume edit fidelity |
| RTF/ODT/TXT/HTML/MD | Convert or limited edit | Conversion may change layout/styles |
| PDF | Separate PDF workflow | PDF editing differs from Word editing |
| XLSX | Later spreadsheet module | Do not treat as Writer document |
| PPTX | Later presentation module | Verify media/animation fidelity separately |
| WPS/WPT | View/convert only if verified | Proprietary/legacy format support must be tested |

## 7. Plans and entitlements (initial design)

These are suggested product tiers, not a claim about WPS pricing:

| Capability | Free | Pro | Team |
|---|---|---|---|
| Basic DOCX editing | Yes | Yes | Yes |
| Personal storage | Configurable low quota | Higher quota | Shared pooled quota |
| Templates | Starter set | Full library | Full library + team templates |
| PDF export | Limited or standard | Higher limits | Higher limits |
| Advanced PDF/OCR | Metered/limited | Included quota | Shared quota/admin controls |
| AI writing actions | Small monthly quota | Higher monthly quota | Shared/admin-managed quota |
| Collaboration | Basic sharing | Advanced sharing | Roles, seats and audit history |
| Version history | Short retention | Longer retention | Team retention policy |

All limits must be enforced on the server and measured via usage events. Keep numeric quotas in database/configuration, not spread through UI components. Avoid misleading “unlimited” plans when the underlying service has usage costs.

## 8. Product analytics to add later

Collect privacy-minimizing product events:
- `document_created`, `document_uploaded`, `document_opened`, `document_saved`, `document_exported`.
- `editor_load_failed`, `save_failed`, `conversion_failed`.
- `share_created`, `share_revoked`, `version_restored`.
- `template_used`, `ai_action_requested`, `ai_action_accepted`.

Never include full document text, access tokens or signed file URLs in analytics.
