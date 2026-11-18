# Research Sources and Technical References

**Research snapshot:** 17 November 2026. Recheck all pricing, product features, supported formats, API behavior, licensing and framework guidance before implementation and before commercial launch. Region/platform can change subscription terms.

## WPS product scope and paid features

1. **WPS Feature directory** — Writer/Docs, Sheets, PDF, AI and other tools: https://www.wps.com/feature/  
   Useful for building the top-level benchmark inventory. It lists AI drafting, grammar, document translation, PDF edit/merge/split/compress/OCR and other features.
2. **WPS subscriptions and feature comparison** — https://www.wps.com/buy/  
   Use this to verify free vs paid capabilities, storage and plan entitlements. Prices vary by region, platform, promotion and billing interval.
3. **WPS product overview** — https://www.wps.com/office/  
   Describes the suite across Writer, Spreadsheet, Presentation and PDF, as well as cloud and utilities.
4. **WPS Writer** — https://www.wps.com/office/writer/  
   Writer file compatibility and document-editing workflow reference.
5. **WPS PDF features** — https://www.wps.com/feature/pdf/  
   PDF editing, merge, split, compression and OCR benchmark.
6. **WPS PDF OCR** — https://www.wps.com/feature/pdf-ocr/  
   OCR and searchable scanned-PDF workflow reference.
7. **WPS Premium overview / Academy** — https://www.wps.com/academy/how-to-download-wps-office-premium/about-wps/1886749/  
   Explains premium feature categories, including Writer, Presentation, Spreadsheet, PDF, AI and cloud storage.

## Office editor integration — ONLYOFFICE

8. **ONLYOFFICE Docs API — DocEditor** — https://api.onlyoffice.com/docs/docs-api/usage-api/doceditor  
   Editor integration, configuration and callback URL.
9. **ONLYOFFICE Docs API — security/JWT** — https://api.onlyoffice.com/docs/docs-api/get-started/how-it-works/security  
   Server-to-editor request validation using signed JWTs.
10. **ONLYOFFICE Docs API — callback handler** — https://api.onlyoffice.com/docs/docs-api/usage-api/callback-handler  
    Save statuses and callback payloads. Implement against the exact deployed version.
11. **ONLYOFFICE format repository** — https://github.com/ONLYOFFICE/document-formats  
    Distinguishes formats supported for viewing, editing, reviewing, commenting, filling and conversion.
12. **ONLYOFFICE Community Edition licensing FAQ** — https://helpcenter.onlyoffice.com/docs/faq/docs-community.aspx  
    Important AGPLv3/SaaS licensing guidance. Obtain legal review.
13. **ONLYOFFICE Community download** — https://www.onlyoffice.com/en/download-community  
    Current Community Edition package/version/license information; re-check at deployment time.

## Alternative editor conversion approach — Tiptap

14. **Tiptap document import/export** — https://tiptap.dev/docs/conversion/getting-started/overview  
    Describes DOCX import/export and other conversion formats. Notes that conversion is a bridge, not a document renderer, and that page layout/headers/footers require appropriate extensions. Pro package/subscription requirements apply.

## Supabase

15. **Supabase Next.js SSR client setup** — https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs  
    Cookie-based SSR setup, browser/server client separation and session refresh guidance.
16. **Supabase Storage access control** — https://supabase.com/docs/guides/storage/security/access-control  
    Storage RLS policies and access control.
17. **Supabase Storage schema guidance** — https://supabase.com/docs/guides/storage/schema/design  
    Storage metadata model and warning not to mutate internal Storage schema tables directly.
18. **Supabase signed URL keys** — https://supabase.com/docs/guides/storage/security/signing-keys  
    Signed URL expiry/revocation considerations.

## Vercel

19. **Deploying Git repositories** — https://vercel.com/docs/git  
    Branch/PR Preview deployments and production branch behavior.
20. **Vercel environments** — https://vercel.com/docs/deployments/environments  
    Local, Preview and Production environment separation and environment variables.
21. **Vercel Functions limitations** — https://vercel.com/docs/functions/limitations  
    Function runtime and duration constraints; a persistent office document server and long-running workers should be hosted separately.
22. **Vercel deployments** — https://vercel.com/docs/deployments  
    Deployment methods and unique deployment URLs.

## Notes for the researcher

- WPS pricing is dynamic and regional. Do not hardcode prices in the feature matrix without date, region, platform and billing period.
- Some WPS marketing pages describe feature availability broadly; confirm whether the specific feature is in the paid plan, device platform and current version being benchmarked.
- An office engine's “supported formats” list is not a guarantee of identical fidelity. Record the operation type and run fixture tests.
- The ONLYOFFICE Community license must be evaluated against the intended distribution model. For a proprietary product, do not launch on Community Edition without legal clearance or a commercial license.
- This source list is a starting point, not a substitute for current hands-on verification.
