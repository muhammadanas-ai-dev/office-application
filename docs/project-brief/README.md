# Forma Office — Muse AI Build Kit

**Purpose:** A research-led, 15-day implementation plan for a professional, WPS-inspired web office workspace built with Next.js, Supabase and Vercel.

**Working product name:** Forma Office  
**Tagline:** Documents, made precise.  
**Build agent:** Muse AI (the coding/research agent)  
**Target:** A production-minded Writer-first release with a credible path to a broader office suite.

> This project is a clean-room implementation of comparable office-product capabilities. It must not copy WPS source code, logos, proprietary icons, templates, text, or pixel-exact screen layouts. Do not use WPS trademarks as the product identity. Reproduce user value and documented workflows with original branding and implementation.

## Read these files in order

1. [`INSTRUCTIONS.md`](./INSTRUCTIONS.md) — persistent rules for Muse AI.
2. [`MASTER_PROMPT_FOR_MUSE.md`](./MASTER_PROMPT_FOR_MUSE.md) — paste this into Muse AI as the primary project prompt.
3. [`PRODUCT_SPEC.md`](./PRODUCT_SPEC.md) — product boundaries, feature inventory and acceptance criteria.
4. [`REVERSE_ENGINEERING_PLAYBOOK.md`](./REVERSE_ENGINEERING_PLAYBOOK.md) — how to research WPS responsibly and convert findings into implementation tickets.
5. [`ARCHITECTURE_AND_TECH_STACK.md`](./ARCHITECTURE_AND_TECH_STACK.md) — stack, architecture, database, storage, integrations and secrets.
6. [`BRAND_GUIDELINES.md`](./BRAND_GUIDELINES.md) — name, voice, visual design and typography.
7. [`ROADMAP_15_DAYS.md`](./ROADMAP_15_DAYS.md) — day-by-day 15-day delivery plan.
8. [`DAILY_PROMPTS.md`](./DAILY_PROMPTS.md) — exact daily prompts to run in Muse AI.
9. [`QA_RELEASE_SECURITY.md`](./QA_RELEASE_SECURITY.md) — definition of done, test strategy, daily deployment and security gates.
10. [`RESEARCH_SOURCES.md`](./RESEARCH_SOURCES.md) — authoritative starting references.

## Scope reality

WPS Office is a suite, not only a word processor: Writer, Spreadsheet, Presentation, PDF, cloud storage, templates and AI features are all part of its broader product offering. WPS lists premium capabilities such as advanced PDF editing/conversion, OCR, templates, cloud storage and AI tools. See the official WPS feature and plan pages in `RESEARCH_SOURCES.md`.

A complete WPS-equivalent suite with full file-format fidelity, all premium workflows, cross-platform apps, licensing, payments, collaboration and AI cannot honestly be promised in 15 days by one agent. The 15-day target in this kit is:

- A polished web workspace and document library.
- Reliable account/workspace permissions and private file storage.
- A real office editor integration for supported Word documents.
- Create, upload, edit, save, reopen and export representative documents.
- Core Writer workflows, templates, comments/review, version history and sharing where supported by the chosen editor engine.
- A PDF workflow with clearly stated supported operations.
- A production-like preview deployment every day, with a stable production release only after release gates pass.
- A verified feature-parity backlog for spreadsheets, presentations, deeper PDF editing, OCR, mail merge, advanced AI, and additional file formats.

Do not describe an unimplemented, unsupported or untested feature as complete.

## Critical architecture decision

Use **Next.js + Supabase** for the application platform, and a dedicated office document server for actual office-file editing.

Recommended route for a proprietary commercial product: evaluate and obtain the appropriate **ONLYOFFICE Developer/commercial license** before shipping a closed-source SaaS integration. ONLYOFFICE Docs Community Edition is AGPLv3; the vendor's licensing FAQ says network/SaaS use of AGPL products can require making the modified version and derivative work available under AGPL. Obtain legal review; do not assume the Community Edition can be embedded in a closed-source commercial product without obligations.

For a learning or open-source project, Community Edition may be evaluated subject to AGPL compliance. The editor server must run separately from Vercel (for example, on a managed VM/container host). Vercel hosts the Next.js app; it is not the place to run a persistent document-server container.

## How to use the kit

1. Create a project/repository and add these Markdown files at its root under `/docs/project-brief/` or keep them in the root during development.
2. Paste `MASTER_PROMPT_FOR_MUSE.md` into Muse AI.
3. Instruct Muse AI to read `INSTRUCTIONS.md` and every linked specification before coding.
4. Connect the Git repository to Vercel and configure separate Preview and Production environments.
5. Provide credentials only through local `.env.local` or the relevant hosted environment-variable manager. Never paste secrets into prompts, chat, source files, screenshots, or logs.
6. Start with Day 1. At the end of every day, require a Preview deployment, test report, screenshots, changelog and next-day handoff.

## Release naming

Use semantic versions for actual releases and day labels for previews:

- Day previews: `day-01`, `day-02`, … `day-15`
- Release candidates: `0.1.0-rc.1`, `0.1.0-rc.2`
- First stable milestone: `0.1.0`

A day number is not a quality certification. Only release a stable version when the QA and security gates pass.
