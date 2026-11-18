# Day 12 plan — PDF form builder (Phase B, feature 5)

Date: 2026-11-18. Owner instruction (14:12 PKT): "okay now move
to the next feature find which feature which have in the wps see
and then implement them properly". This day follows the standing
loop (research → plan → small tasks → implement → test).

## 1. What WPS has (the feature being built)

The Day 1 WPS inventory (`docs/reverse-engineering/
day-01-wps-inventory.md`) records WPS's **online form builder**
as a WPS feature: add form fields to a PDF — text fields,
checkboxes, radio buttons, dropdowns — so the PDF becomes a
fillable form. That is the feature this day builds, as a Forma-own
clean-room implementation on pdf-lib.

WPS also has a "date field" type. pdf-lib has no native date
field (a date field is a text field with a date format in the
AcroForm model), so Forma's builder offers the five pdf-lib field
types — text, checkbox, radio group, dropdown, option list —
which cover the form builder's core. No native date field is
claimed.

## 2. Research — how to build it (pdf-lib, read from the source)

- **Creating fields** (PDFForm): `form.createTextField(name)`,
  `createCheckBox(name)`, `createDropdown(name)`,
  `createOptionList(name)`, `createRadioGroup(name)`.
  `createButton` exists but a pushbutton is not a fillable field
  — the builder does not offer it (same as the fill feature,
  which lists buttons as unsupported).
- **Placing a field** (`field.addToPage(page, options)`):
  options are FieldAppearanceOptions — `x`, `y`, `width`,
  `height` (PDF points, origin bottom-left), `textColor`,
  `backgroundColor`, `borderColor`, `borderWidth`, `rotate`,
  `font`, `hidden`. Defaults when omitted: x=0, y=0, width=200,
  height=50 (text field). The builder always passes explicit
  x/y/width/height. It creates the widget, registers it, adds it
  to the field, sets the appearance stream (default font
  Helvetica), and adds it to the page's `/Annots`.
- **Radio groups are special:** each option is its own widget,
  placed with `radioGroup.addOptionToPage(option, page, options)`.
  The builder lays the options out as a vertical column starting
  at the anchor point, 20 pt per option (16 pt box + 4 pt gap),
  going down (decreasing y in PDF coordinates). The whole column
  must fit on the page.
- **Field properties** (set before/after addToPage):
  `textField.enableMultiline()`, `textField.setMaxLength(n)`,
  `field.enableRequired()`, `field.enableReadOnly()`,
  `dropdown.addOptions([...])`, `optionList.addOptions([...])`,
  `optionList.enableMultiselect()`, `dropdown.enableEditing()`.
- **Removing a field** (`form.removeField(field)`): removes every
  widget from its page (`page.node.removeAnnot`), removes the
  field from the AcroForm, and deletes the field's objects from
  the document context. A complete removal.
- **Name rules** (from PDFForm's field-creation path): names are
  split on `.` into parts; an empty part (a leading/trailing dot
  or `..`) throws `InvalidFieldNamePartError`. A name that already
  exists throws `FieldAlreadyExistsError`. The server validates
  the name first (non-empty, no empty dot parts) and maps both
  pdf-lib errors to clear 400s.
- **XFA:** adding fields to an XFA form is meaningless, so the
  builder refuses XFA PDFs (same catalog check as the fill
  feature, before any getForm call). A PDF with NO form at all is
  fine — `getForm()` creates the AcroForm when the first field
  is added.
- **Coordinate conversion (UI):** PDF.js renders with origin
  top-left, y down; PDF coordinates have origin bottom-left, y
  up. For a click at CSS pixel (cx, cy) on a page rendered at
  scale s with page height H (PDF points): pdfX = cx / s,
  pdfY(top) = H - cy / s. The field's bottom-left y is
  pdfY(top) - height. The client computes the PDF rect and sends
  it; the server re-validates it against the real page size.

## 3. Small tasks (in order)

1. `src/lib/pdf-form-builder.ts` (pure ops, no I/O):
   `PdfFormBuilderError` (status), `addFormField(bytes, spec)`
   (validate name/page/rect/options, create + place, radio column
   layout), `removeFormField(bytes, name)`, reuse
   `listPdfFormFields` / `hasXfaForm` from pdf-form.ts.
2. `src/lib/pdf-form-builder.server.ts` (server-only): rate
   limiter (10/min), reuse `fetchFormDocument` /
   `fetchFormDocumentBytes` / `saveFilledVersion` from
   pdf-form.server.ts.
3. Routes: `POST /api/documents/[id]/pdf/add-field` (Zod spec:
   name, type, page, x, y, width, height, options, multiline,
   maxLength, required, readOnly) and
   `POST /api/documents/[id]/pdf/remove-field` (Zod: name).
   Both return `{ok, version, documentId, title}`.
4. UI: `/documents/[id]/pdf-builder` — server page (RLS load,
   page count + fields, honest empty states) + client (PDF.js
   viewer, toolbar to pick a field type, click-to-place with a
   default size, a pending-field outline, a properties panel for
   name/options/multiline/maxLength/required/readOnly, add and
   remove actions, a field list with remove buttons).
5. Library: "Build form" link for PDF documents (next to
   "Fill form" / "Edit PDF").
6. Unit tests: `src/lib/pdf-form-builder.test.ts` — every field
   type, radio column layout, duplicate/invalid name, out-of-
   bounds placement, page out of range, radio < 2 options,
   dropdown with no options, remove (field + widget gone),
   remove non-existent, XFA refused, input bytes untouched.
7. Live e2e: extend `scripts/e2e-edit-test.mjs` with a form-
   builder section — add a text field, add a dropdown, add a
   radio group, fill the new fields with the fill-form route,
   duplicate name refused, out-of-bounds refused, remove a
   field, cross-user 404, signed-out 307, builder page loads
   for A (200), B sees "Document not found".
8. Docs + commit + handoff + memory.

## 4. Acceptance

- A field added in the UI appears in the PDF at the placed
  position and is fillable by the form-fill feature (the Day 11
  routes) and by any PDF viewer.
- A field added by the builder is listed by the field list with
  its type, page and options.
- The original file is never overwritten — every add/remove
  creates a new version.
- A duplicate name, an invalid name, a placement outside the
  page, a page that does not exist, and an XFA PDF are all
  refused with a clear 400 and nothing is saved.
- Removing a field removes it from the field list and from the
  page (no orphan widget left behind).
