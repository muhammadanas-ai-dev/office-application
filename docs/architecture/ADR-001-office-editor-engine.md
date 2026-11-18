# ADR-001: Office document editing engine for Forma Office

- Status: Proposed (decision for the owner — see Decision below)
- Date: 2026-11-17
- Decision owner: Muhammad Anas (owner); research by Muse

## Context

Forma Office needs a real Word-compatible editor for DOCX files. Building
Word pagination, DOCX layout, comments, track changes and collaborative
editing from scratch in a 15-day Next.js sprint is not credible, and the
project brief forbids it. The platform (Next.js + Supabase + Vercel) is
already set up; the editor must run as a separate document server that the
app embeds, with a signed server callback for saves.

## Options considered

### Option A — ONLYOFFICE Docs (recommended engine, licence-gated)

- Technical fit: Browser editors for DOCX/XLSX/PPTX and PDF forms, real-time
  co-editing, track changes, comments, JWT-signed config and save callbacks,
  documented format matrix (view/edit/review/comment/fill/convert differ
  by format). Current release VERIFIED 2026-11-17 as v10.0.0 (12 Oct
  2026), Community Edition under GNU AGPLv3 (GitHub
  ONLYOFFICE/DocumentServer); v9.4.0 (May 2026) removed the
  20-simultaneous-connection cap in Community. Official Docker
  install page (the old .aspx URL is dead — Help Center
  restructured): https://helpcenter.onlyoffice.com/docs/installation/community/docker/installing/install
  — requirements dual-core 2 GHz, 4 GB RAM, 40 GB disk, 4 GB swap;
  JWT is enabled by default in 10.0 and the secret is set with
  `-e JWT_SECRET=...`. Editor config reference:
  https://api.onlyoffice.com/docs/docs-api/usage-api/config.
- Supported formats/features: DOCX/XLSX/PPTX editable; DOC, ODT, RTF, TXT,
  HTML and others viewable or convertible with possible loss — exact matrix
  must be re-verified on the deployed version.
- License/commercial terms: Community Edition is AGPLv3. The vendor FAQ
  (helpcenter.onlyoffice.com/docs/faq/docs-community.aspx, read 2026-11-17)
  states: if the app is distributed or made available over a network
  (SaaS), the modified version and any derivative work must be made
  available under AGPLv3; a commercial licence is required if the product
  is proprietary and source is not to be disclosed. No white-labelling in
  Community; no guaranteed support/SLA; Community is intended for testing,
  personal use, development and small-scale deployments, and a commercial
  licence is recommended for production. Developer Edition is the
  commercial licence for integrating editors into another application,
  priced by simultaneous connections.
- Hosting/operations: Separate persistent Linux/container host with HTTPS;
  cannot run inside Vercel Functions. Needs a JWT secret, server-only.
- Costs: Community $0 licence fee + host/ops cost; Developer Edition
  commercial pricing (quote required, not verified here).
- Risks: AGPL obligations for a closed SaaS; hosting is the schedule
  critical path; fonts must exist on the document server.

### Option B — Tiptap Pro DOCX conversion bridge

- Technical fit: Strong web content editor, but its DOCX package is a
  conversion bridge, not a full document renderer; page layout,
  headers/footers and collaboration need extra pieces. Pro subscription.
- Supported formats/features: DOCX import/export plus some other exports;
  not WPS-level Word fidelity without extensive fixture testing.
- License/commercial terms: Pro product/subscription; terms to verify.
- Hosting/operations: Runs in the app; no separate document server.
- Costs: Pro subscription (not quoted here).
- Risks: Would be presented as Word editing while actually being a
  conversion bridge — high fidelity risk; rejected as the primary engine.

### Option C — Build a custom DOCX editor in Next.js

- Technical fit: A rich-text editor can edit text, but not Word pagination,
  font metrics, tracked changes, or faithful DOCX round-tripping.
- Risks: Rejected. The brief forbids it and 15 days cannot deliver it.

### Option D — Collabora Online (not yet evaluated)

- Technical fit: Self-hosted browser editor, OOXML-compatible, co-editing.
- Status: Not researched in depth on Day 1. Keep as a fallback to evaluate
  on Day 5 if ONLYOFFICE licensing/hosting is blocked.

## Decision

**Proceed with Option A for evaluation only, with the commercial launch
BLOCKED until the owner decides.**

- Days 1–4 proceed on engine-independent platform work (brand/shell,
  Supabase Auth, schema/RLS, library and private storage). None of that
  depends on the editor licence.
- Day 5 integration may use ONLYOFFICE Docs Community Edition only as a
  learning/evaluation deployment, with AGPLv3 obligations honoured
  (retain branding/notices, publish modified source as required, no
  white-labelling). It must NOT be shipped as a closed-source commercial
  SaaS on Community Edition.
- For a proprietary commercial launch, the owner must obtain the
  ONLYOFFICE Developer Edition (or another validated engine) and legal
  review before Day 5 integration is promoted. If that is not obtained,
  Day 5 produces a blocker/decision report instead of a fake editor.
- **Owner decision received 2026-11-17 (Day 5 start):** Muhammad Anas
  says he knows the licence and not to worry — Forma takes
  inspiration from WPS features and builds a better version, NOT a
  clone of WPS (clean-room, inspiration-only; no WPS code, logos,
  templates or pixel-exact screens — consistent with the project
  rule). Day 5 proceeds on that basis with ONLYOFFICE Docs
  Community as the evaluation integration. The commercial-launch
  question stays open: a proprietary launch still needs the
  Developer licence + legal review before the Day 5 integration is
  promoted to a closed-source SaaS; if he later chooses an
  open/learning product, the AGPL obligations (publish modified
  source, no white-labelling) apply instead.
- **Hosting decision (Day 5, resolved for evaluation):** the
  document server runs from the DEB package on this VM (Docker pull
  failed — the egress proxy cuts large registry downloads; see the
  Day 5 handoff). It does not survive a VM restart and the VM is
  below the official 4 GB RAM / 40 GB disk requirement, so a
  persistent host is still needed for anything beyond evaluation.
- **Owner direction received 2026-11-17 23:33 PKT (Day 6 start):**
  build Forma to the WPS level, properly — all the features WPS
  has (every editor, every format, proper OCR, all the paid
  features as Forma's own clean-room features), and **no Docker
  files for now** (no Dockerfile, no docker-compose, no container
  image for the app or the document server). Recorded in
  `docs/project-brief/WPS_LEVEL_PLAN.md`, which replaces the
  Writer-first scope as the project's scope document. The
  clean-room rule stands: inspiration only, never a clone, and
  paid-feature equivalents are built on open-source engines
  (Tesseract for OCR, pdf-lib for PDF tools, ONLYOFFICE for the
  core editors), never by copying or unlocking WPS.

## Consequences

- Positive: Real DOCX fidelity, co-editing, track changes and callbacks
  without rebuilding Word; platform work is not blocked by the licence.
- Negative/trade-offs: Commercial launch cannot proceed on Community;
  a separate host, HTTPS, JWT secret and callback hardening are required;
  font/rendering fidelity must be fixture-tested per engine version.
- Follow-up tasks: Owner licence/hosting decision before Day 5; verify
  the exact deployed engine version and format matrix; draft the
  callback/JWT contract; evaluate Option D only if Option A is blocked.

## Evidence

- Official sources (read 2026-11-17):
  - https://www.wps.com/feature/
  - https://www.wps.com/buy/ (plan table not extractable from text fetch;
    pricing in the inventory is secondary-source, region-dependent)
  - https://helpcenter.onlyoffice.com/docs/faq/docs-community.aspx
  - https://api.onlyoffice.com/docs/docs-api/usage-api/doceditor
  - https://github.com/ONLYOFFICE/document-formats
  - https://www.onlyoffice.com/blog/2026/05/onlyoffice-license-and-trademark-policy
- Research skill used: comprehensive_research (Standard mode, 3 searches
  - 3 official page reads). No WPS account/trial session was available;
    no decompilation or bypass was used. REA skill was NOT used — clean-room
    observation of public documentation only.
- Tested version: none yet — no document server is deployed on Day 1.
