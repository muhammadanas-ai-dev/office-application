# Day 11 plan — PDF form fill (Phase B, feature 4)

Date: 2026-11-18. Status: research done, plan written, implementation
follows this plan task by task.

## Research (done before any code)

### What a PDF form is
- A PDF form is an **AcroForm**: a dictionary in the document
  catalog (`/AcroForm`) holding `/Fields` — a tree of field
  dictionaries. Each field has a type (`/FT`: `/Tx` text, `/Btn`
  button, `/Ch` choice, `/Sig` signature), a fully-qualified name
  (`/T`, nested by parent `/T` with dots), and one or more
  **widgets** (the visible boxes on pages, in each page's `/Annots`).
- Field types: text (single-line, multi-line, password, comb,
  file-select), checkbox (a button with an on/off state),
  radio group (one choice among options), dropdown (choice, single
  or multi-select, optionally editable), option list (list box),
  button (pushbutton — no value to fill), signature (digital
  signature — no fill API).
- A form can also be **XFA** (an XML form embedded in the AcroForm
  `/XFA` entry). XFA is a different technology; pdf-lib does not
  support it.

### The engine: pdf-lib's AcroForm API (read from node_modules/pdf-lib)
- `doc.getForm()` returns `PDFForm` with `getFields()`,
  `getTextField(name)`, `getCheckBox(name)`, `getDropdown(name)`,
  `getRadioGroup(name)`, `getOptionList(name)`, `getSignature(name)`,
  `getButton(name)`. Field type is found by `instanceof`.
- Values: text `getText()` / `setText(text)`; checkbox `isChecked()`
  / `check()` / `uncheck()`; dropdown `getOptions()` /
  `getSelected()` / `select(value)`; radio `getOptions()` /
  `getSelected()` / `select(option)`; option list `getOptions()` /
  `getSelected()` / `select(values)` (multi-select when enabled).
- `setText` **throws** `ExceededMaxLengthError` when the text is
  longer than the field's max length — the server must pre-check
  and return a clear 400.
- `form.updateFieldAppearances()` regenerates the appearance
  streams for every field marked dirty (set/check/select mark the
  field dirty). Without it, many viewers show the field as blank
  even though the value is stored. It draws with a standard font
  (Helvetica by default) — the filled value shows in a standard
  font, not the field's original font. Same honest limit as the
  PDF text edit.
- `form.flatten()` bakes the fields into the page content and
  destroys them — NOT used: the filled form stays editable.
- **Two traps, both verified in the source:**
  1. `doc.getForm()` **silently deletes XFA** (`console.warn`
     "Removing XFA form data...") and `getOrCreateForm` **creates**
     an AcroForm when none exists. So the XFA check must happen
     BEFORE any `getForm()` call, using the low-level catalog
     lookup (`doc.catalog.get(AcroForm)` -> `XFA` entry). An XFA
     PDF is refused with a clear 400, never silently stripped.
  2. A signature field has no fill API in pdf-lib — it is listed
     as type `signature` and shown as unsupported (signing is a
     deferred feature needing a legal decision, per the plan).
- `PDFField` gives `getName()`, `isReadOnly()`, `isRequired()`,
  `isExported()`. Read-only fields are listed but refused on fill.
- Widget pages: the field's widgets live in page `/Annots`. The
  page number is found by scanning each page's Annots for the
  widget's ref (same low-level pattern as `listPdfImages`).

### The alternative: ONLYOFFICE pdf/form
- ONLYOFFICE Docs has a `pdf` document type with form filling in
  its editor UI. It was NOT chosen for the fill itself: the fill
  must be testable here without a browser (the browser UI
  round-trip is unproven in this environment), and pdf-lib gives
  full control over values, validation and versions. The
  ONLYOFFICE editor remains the document viewer/editor; a user
  can also fill a form in it, but the Forma-own fill is the
  tested, production path.

### Decisions
- Forma-own implementation on pdf-lib 1.17.1 (already a
  dependency). No new dependency.
- Fill by field name, one request fills many fields at once
  (atomic: any invalid value refuses the whole request, nothing
  is saved).
- Every fill creates a NEW immutable version; the original is
  never overwritten (same as the text edit and the editor save).
- The UI is a form-fill page (`/documents/[id]/pdf-form`): the
  PDF renders with PDF.js and a side panel lists every field with
  the right input (text, textarea, checkbox, radio, select). A
  PDF with no fields reports that honestly on the page instead of
  showing a fake form. The library shows a "Fill form" link for
  PDF documents.

## Small tasks (in order)

1. **Fixture PDFs.** Build with pdf-lib in the test file: a form
   PDF (text, multiline text, text with max length 5, checkbox,
   radio group, dropdown, option list, a read-only text field, a
   required text field, a signature field); a plain PDF with no
   form fields; an XFA PDF (hand-built AcroForm dict with an XFA
   entry — refuse path only).
2. **`src/lib/pdf-form.ts` (pure logic).** `PdfFormError` (carries
   HTTP status). `listPdfFormFields(bytes)` -> field list
   (name, type, page, required, readOnly, value, options,
   maxLength, multiline). `fillPdfForm(bytes, values)` ->
   filled bytes: XFA check first (refuse 400), per-field
   validation (unknown field, wrong type, read-only, max length,
   dropdown/radio value not in options), `updateFieldAppearances`,
   no flatten. `hasXfaForm(bytes)` helper (catalog lookup, no
   getForm call).
3. **`src/lib/pdf-form.server.ts` (server wiring).**
   `pdfFormRateLimiter` (10/min per user, same constants as the
   PDF tools), `fetchFormDocument(userClient, id)` (RLS, 404/400
   like `fetchEditableDocument`), `saveNewVersion` reuse from
   `pdf-edit.server.ts`, `formJsonResponse`.
4. **Routes.** `GET /api/documents/[id]/pdf/form-fields`
   (lists the fields, 200 with `{fields: [...]}` or
   `{fields: [], hasForm: false}`) and `POST
   /api/documents/[id]/pdf/fill-form` (JSON `{values: {name:
   value}}`, Zod-validated, returns `{ok, version, documentId,
   title}`).
5. **UI page.** `src/app/(workspace)/documents/[id]/pdf-form/
   page.tsx` (server: RLS load, honest empty states) +
   `src/components/pdf-form/pdf-form-client.tsx` (PDF.js render
   at scale 1.5 + field panel with the right input per type +
   save button + success message with the new version).
   Worker reuse: the same vendored `public/pdf.worker.min.mjs`.
6. **Library link.** `DocumentActions` gains a "Fill form" link
   for PDF documents (`/documents/<id>/pdf-form`).
7. **Unit tests** (`src/lib/pdf-form.test.ts`): list all field
   types with values/options/pages; fill text/checkbox/radio/
   dropdown/option-list and re-read the values; max-length
   refusal; unknown-field and wrong-type refusal; read-only
   refusal; option-not-in-list refusal; XFA refusal; no-fields
   empty list; signature field listed as unsupported; the
   original bytes are untouched by a fill (list the fields of the
   input again); `qpdf --check` on a filled PDF.
8. **Live e2e** (extend `scripts/e2e-edit-test.mjs`): upload a
   form PDF; list fields via the route; fill it as user A (text +
   checkbox + dropdown); version 2; re-list shows the new values;
   the filled PDF's text (pdftotext) shows the entered values;
   cross-user 404; signed-out 307; a no-form PDF lists empty and
   the fill route refuses it with 400; the form page loads for A
   and shows "Document not found" for B.
9. **Docs + commit + handoff + memory + reply.** Plan, feature
   matrix (FORMA-020), known limitations, changelog, Day 11
   handoff, commit on `day-11-pdf-form-fill`, MEMORY.md, reply.

## Acceptance (from the plan)
- A filled field shows the entered value and survives a reopen.
- The original file is never overwritten — a new version is
  created.
- A PDF with no form fields reports that honestly instead of
  faking a form.
- An XFA PDF is refused with a clear message, never silently
  stripped. A signature field is listed as unsupported, never
  faked as fillable.
