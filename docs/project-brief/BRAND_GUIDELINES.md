# Brand Guidelines — Forma Office

**Working name:** Forma Office  
**Tagline:** Documents, made precise.  
**Positioning:** A calm, capable workspace for professional documents and everyday office work.

> This is an original provisional identity. Do not use WPS or Microsoft Office logos, icons, proprietary templates, naming patterns or copied visual assets. Check trademark availability before public launch or domain registration.

## 1. Brand personality

- Professional, calm and precise.
- Capable without feeling intimidating.
- Trustworthy around important work and files.
- Clear about what is saved, shared, supported and paid.
- Helpful without filling the interface with AI prompts or upsells.

## 2. Logo direction

Create an original geometric mark built from two offset page/sheet outlines that create a subtle `F`/fold motif. Avoid copying the familiar office-suite letter tiles or WPS red/orange mark. The wordmark uses `Forma` in a medium/semi-bold weight and `Office` in regular weight.

Required assets:
- Horizontal full logo (SVG).
- Square app icon (SVG and PNG).
- Monochrome mark for dark/light backgrounds.
- Favicon.
- Wordmark only.

Do not embed text as paths unless necessary. Keep the mark simple enough to work at 16–24 px.

## 3. Color system

| Token | Hex | Usage |
|---|---|---|
| `--forma-ink` | `#17253B` | Main wordmark, headings |
| `--forma-primary` | `#3159C9` | Primary actions, focus and active state |
| `--forma-primary-hover` | `#2548AA` | Hover/pressed primary action |
| `--forma-teal` | `#2B8C83` | Success/connected states used sparingly |
| `--forma-accent` | `#E5A94B` | Small highlights, template category accent |
| `--surface` | `#FFFFFF` | Editor canvas and cards |
| `--app-bg` | `#F4F6FA` | Workspace background |
| `--surface-muted` | `#EDF1F6` | Secondary panels |
| `--border` | `#DCE3EC` | Dividers and input borders |
| `--text` | `#202B3C` | Body text |
| `--text-muted` | `#667389` | Secondary text |
| `--danger` | `#C83F4D` | Destructive/error state |
| `--warning` | `#A96A13` | Warning state |

Use color for meaning. Keep the document page white and visually separate from the application chrome. Avoid large gradients, glassmorphism and excessive saturated surfaces.

## 4. Typography

### Application UI

- Primary UI font: **Inter** (SIL Open Font License; verify the downloaded package/license and retain notices).
- Fallback: system UI stack.
- UI scale: 12 px micro labels, 13–14 px dense controls, 14–16 px body, 20–24 px section headings, 28–36 px marketing page headings.

### Document fonts

Offer a practical font library only when the font files are legally redistributable and installed on the document server:
- Noto Sans / Noto Serif.
- Source Sans 3 / Source Serif 4.
- Liberation Sans / Liberation Serif.
- Carlito and Caladea where appropriate for common Office metric compatibility (verify respective licenses).
- Additional fonts can be added after license and rendering tests.

Important: the font picker must show the fonts actually available to the selected editing engine. A web font that is not present on the editor server may be substituted during rendering/export. Test every document font in both the editor and exported DOCX/PDF.

## 5. Spacing, shape and components

- Base spacing unit: 4 px.
- Common gaps: 8, 12, 16, 24 and 32 px.
- Main app border radius: 8–12 px.
- Inputs/buttons: 8 px radius, 36–40 px standard height.
- Cards: white surface, subtle 1 px border, minimal shadow.
- Editor canvas: white page on muted neutral background, with clear page shadows/bounds.
- Use a compact desktop layout because users need room for the editor canvas. Collapse side navigation at tablet/mobile widths.
- Tooltips on icon-only controls; visible labels for core actions.
- Every interactive element needs keyboard focus and accessible name.

## 6. Iconography

Use Lucide icons consistently:
- 16 px for dense toolbar controls.
- 18 px for navigation.
- 20 px for larger actions.
- Consistent 1.75–2 px stroke width.

Do not manually trace/copy proprietary WPS icons.

## 7. Voice and microcopy

Use clear, direct product language:
- “Saved” / “Saving…” / “Couldn’t save. Retry” rather than vague animated status.
- “Download as PDF” rather than “Export magic”.
- “This file is view-only in this format” when editing is unsupported.
- “Your font may be substituted when this file is opened on another device” when appropriate.
- “AI suggestion” and “Apply suggestion” rather than silently editing user content.

Avoid fake urgency, misleading unlimited claims and unqualified “100% compatible” claims.

## 8. UX principles

1. The document canvas is the product's center of gravity.
2. Save status must be real and visible.
3. Formatting controls must affect the active document, not just their own button state.
4. Use progressive disclosure for advanced options.
5. Make file-format support visible before import/edit.
6. Give users control over AI and sharing.
7. Maintain consistency without copying WPS's exact visual design.

## 9. Homepage message draft

**Headline:** Your work deserves a better document workspace.  
**Subhead:** Create, edit, organize and share professional documents in one clear workspace.  
**Primary action:** Create a document  
**Secondary action:** Upload a file

Do not promise every office format, native desktop parity, or advanced PDF editing until those capabilities have been implemented and tested.
