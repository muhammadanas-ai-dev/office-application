// PDF form building (Phase B, feature 5).
//
// Adds form fields to a PDF and removes them, built on pdf-lib.
// This is the WPS "online form builder" feature, as a Forma-own
// clean-room implementation: a text field, checkbox, radio group,
// dropdown or option list is created and placed on a page, so the
// PDF becomes a fillable form (the Day 11 fill feature then fills
// it, as does any PDF viewer).
//
// Every function takes bytes in and returns bytes out; none
// touches storage or the database — the version bookkeeping (a new
// immutable version per add/remove, the original never
// overwritten) lives in pdf-form-builder.server.ts.
//
// pdf-lib facts this module is built on (all verified in the
// pdf-lib source before writing it):
// - `form.createTextField(name)` / `createCheckBox` /
//   `createDropdown` / `createOptionList` / `createRadioGroup`
//   create the field; `field.addToPage(page, options)` places
//   its widget (x, y, width, height in PDF points, origin
//   bottom-left) and sets its appearance stream.
// - A radio group is different: each option is its own widget,
//   placed with `radioGroup.addOptionToPage(option, page,
//   options)`. The builder lays the options out as a vertical
//   column starting at the anchor, 20 pt per option (16 pt box +
//   4 pt gap), going down (decreasing y).
// - `form.removeField(field)` removes every widget from its
//   page, removes the field from the AcroForm, and deletes the
//   field's objects — a complete removal.
// - Field names are split on "." into parts; an empty part (a
//   leading/trailing dot or "..") is refused, a name that already
//   exists is refused, and a name that already exists as a
//   non-terminal (a parent of another field, e.g. adding "a" when
//   "a.b" exists) is refused. All three are pre-validated here:
//   pdf-lib's error classes cannot be caught with instanceof
//   (they are built with the ES5 extends-Error pattern, whose
//   constructor returns a plain Error object and breaks the
//   prototype chain — verified by running it), so the code never
//   relies on catching them.
// - XFA is refused (adding AcroForm fields to an XFA form is
//   meaningless), checked on the catalog BEFORE any getForm()
//   call — getForm() silently deletes XFA. A PDF with NO form at
//   all is fine: getForm() creates the AcroForm when the first
//   field is added.
//
// Server-side by convention: pdf-lib runs in Node here and the
// helpers below are imported by server routes only. Do NOT import
// this module from a client component.
import { PDFDocument, rgb } from "pdf-lib";
import { encodeWinAnsi } from "@/lib/pdf-content";
import { hasXfaForm, listPdfFormFields } from "@/lib/pdf-form";
import { looksLikePdf } from "@/lib/pdf-tools";

/** A PDF-form-builder failure with the HTTP status the route should return. */
export class PdfFormBuilderError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "PdfFormBuilderError";
    this.status = status;
  }
}

export type PdfFormBuilderFieldType =
  "text" | "checkbox" | "radio" | "dropdown" | "optionList";

/** The smallest a field widget may be, in PDF points. */
const MIN_FIELD_SIZE = 8;
/** Vertical pitch of one radio option (16 pt box + 4 pt gap). */
const RADIO_OPTION_PITCH = 20;

export interface PdfFormBuilderFieldSpec {
  name: string;
  type: PdfFormBuilderFieldType;
  /** 1-based page number. */
  page: number;
  /** Bottom-left x of the field (or of the first radio option), in PDF points. */
  x: number;
  /** Bottom-left y of the field (or of the first radio option), in PDF points. */
  y: number;
  /** Width in PDF points (per radio option for a radio group). */
  width: number;
  /** Height in PDF points (per radio option for a radio group). */
  height: number;
  /** Options for radio, dropdown and optionList. */
  options?: string[];
  /** Text fields only. */
  multiline?: boolean;
  /** Text fields only: the maximum number of characters. */
  maxLength?: number;
  /** Dropdown and option list only: allow several options at once. */
  multiselect?: boolean;
  required?: boolean;
  readOnly?: boolean;
  /** Default value: a string for text, a boolean for checkbox,
   * one option for radio and dropdown, one or more options for
   * an option list. */
  defaultValue?: string | boolean | string[];
}

async function loadPdf(bytes: Uint8Array, label: string): Promise<PDFDocument> {
  if (!looksLikePdf(bytes)) {
    throw new PdfFormBuilderError(400, "This file is not a valid PDF.");
  }
  try {
    return await PDFDocument.load(bytes, { ignoreEncryption: false });
  } catch {
    throw new PdfFormBuilderError(400, `${label} is not a valid PDF.`);
  }
}

function assertXfaNotPresent(doc: PDFDocument): void {
  if (hasXfaForm(doc)) {
    throw new PdfFormBuilderError(
      400,
      "This PDF uses an XFA form, which Forma cannot build on. AcroForm PDFs work — XFA is a different form technology."
    );
  }
}

/** A field name is valid when it is non-empty and has no empty dot-parts. */
function assertValidFieldName(name: string): void {
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new PdfFormBuilderError(
      400,
      "Give the field a name — it is how the field is identified when it is filled."
    );
  }
  if (name.length > 200) {
    throw new PdfFormBuilderError(
      400,
      "The field name is too long — keep it under 200 characters."
    );
  }
  const parts = name.split(".");
  if (parts.some((part) => part.length === 0)) {
    throw new PdfFormBuilderError(
      400,
      `The field name "${name}" is not valid — it cannot start or end with a dot, or contain two dots in a row.`
    );
  }
}

function assertFiniteNumber(
  value: unknown,
  label: string
): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new PdfFormBuilderError(
      400,
      `The field's ${label} must be a number.`
    );
  }
}

function assertRect(
  spec: PdfFormBuilderFieldSpec,
  pageWidth: number,
  pageHeight: number
): void {
  assertFiniteNumber(spec.x, "x position");
  assertFiniteNumber(spec.y, "y position");
  assertFiniteNumber(spec.width, "width");
  assertFiniteNumber(spec.height, "height");
  if (spec.width < MIN_FIELD_SIZE || spec.height < MIN_FIELD_SIZE) {
    throw new PdfFormBuilderError(
      400,
      `The field is too small — make it at least ${MIN_FIELD_SIZE} by ${MIN_FIELD_SIZE} points.`
    );
  }
  if (spec.x < 0 || spec.y < 0) {
    throw new PdfFormBuilderError(
      400,
      "The field must sit on the page — its position cannot be negative."
    );
  }
  if (spec.x + spec.width > pageWidth || spec.y + spec.height > pageHeight) {
    throw new PdfFormBuilderError(
      400,
      "The field does not fit on the page — move it or make it smaller."
    );
  }
}

function assertOptions(
  spec: PdfFormBuilderFieldSpec
): asserts spec is PdfFormBuilderFieldSpec & { options: string[] } {
  const options = spec.options;
  if (!Array.isArray(options) || options.length === 0) {
    throw new PdfFormBuilderError(
      400,
      `The field "${spec.name}" needs at least one option.`
    );
  }
  if (spec.type === "radio" && options.length < 2) {
    throw new PdfFormBuilderError(
      400,
      `A radio group needs at least two options — one option is not a choice.`
    );
  }
  const seen = new Set<string>();
  for (const option of options) {
    if (typeof option !== "string" || option.trim().length === 0) {
      throw new PdfFormBuilderError(
        400,
        `The field "${spec.name}" has an empty option — every option needs a name.`
      );
    }
    if (option.length > 200) {
      throw new PdfFormBuilderError(
        400,
        `The option "${option}" is too long — keep each option under 200 characters.`
      );
    }
    if (seen.has(option)) {
      throw new PdfFormBuilderError(
        400,
        `The field "${spec.name}" lists "${option}" twice — each option must be different.`
      );
    }
    seen.add(option);
    if (encodeWinAnsi(option) === null) {
      throw new PdfFormBuilderError(
        400,
        `The option "${option}" contains characters the form's font cannot display. Latin letters, digits and common punctuation work.`
      );
    }
  }
}

function assertDefaultValue(spec: PdfFormBuilderFieldSpec): void {
  const value = spec.defaultValue;
  if (value === undefined) return;
  const name = spec.name;
  if (spec.type === "text") {
    if (typeof value !== "string") {
      throw new PdfFormBuilderError(
        400,
        `The field "${name}" takes text as its default value, not a ${typeof value}.`
      );
    }
    if (spec.maxLength !== undefined && value.length > spec.maxLength) {
      throw new PdfFormBuilderError(
        400,
        `The default value of "${name}" is longer than its maximum length of ${spec.maxLength} characters.`
      );
    }
    if (encodeWinAnsi(value) === null) {
      throw new PdfFormBuilderError(
        400,
        `The default value of "${name}" contains characters the form's font cannot display.`
      );
    }
  } else if (spec.type === "checkbox") {
    if (typeof value !== "boolean") {
      throw new PdfFormBuilderError(
        400,
        `The field "${name}" takes a yes/no default value, not a ${typeof value}.`
      );
    }
  } else if (spec.type === "radio") {
    if (typeof value !== "string") {
      throw new PdfFormBuilderError(
        400,
        `The field "${name}" takes one option as its default value, not a ${typeof value}.`
      );
    }
    if (!spec.options!.includes(value)) {
      throw new PdfFormBuilderError(
        400,
        `"${value}" is not an option of the field "${name}", so it cannot be its default value.`
      );
    }
  } else if (spec.type === "dropdown" || spec.type === "optionList") {
    const vals = Array.isArray(value) ? value : [value];
    if (vals.length > 1 && !spec.multiselect) {
      throw new PdfFormBuilderError(
        400,
        `The field "${name}" accepts only one default value — turn on "allow several options" to pick more than one.`
      );
    }
    for (const v of vals) {
      if (typeof v !== "string") {
        throw new PdfFormBuilderError(
          400,
          `The field "${name}" takes option names as its default value, not a ${typeof v}.`
        );
      }
      if (!spec.options!.includes(v)) {
        throw new PdfFormBuilderError(
          400,
          `"${v}" is not an option of the field "${name}", so it cannot be its default value.`
        );
      }
    }
  }
}

/**
 * Add one form field to a PDF, placed on the given page at the
 * given position. The returned bytes are a NEW document — the
 * input bytes are never modified, and the caller saves the result
 * as a new version.
 *
 * Validation is atomic: every part of the spec is checked BEFORE
 * anything is created, so a bad spec refuses the whole add and
 * the document is left exactly as it was.
 */
export async function addFormField(
  bytes: Uint8Array,
  spec: PdfFormBuilderFieldSpec
): Promise<Uint8Array> {
  const doc = await loadPdf(bytes, "This PDF");
  assertXfaNotPresent(doc);

  // ---- Validate everything first (atomic) ----
  assertValidFieldName(spec.name);
  const pageCount = doc.getPageCount();
  if (!Number.isInteger(spec.page) || spec.page < 1 || spec.page > pageCount) {
    throw new PdfFormBuilderError(
      400,
      `Page ${spec.page} does not exist — this PDF has ${pageCount} page${pageCount === 1 ? "" : "s"}.`
    );
  }
  const page = doc.getPage(spec.page - 1);
  const { width: pageWidth, height: pageHeight } = page.getSize();
  assertRect(spec, pageWidth, pageHeight);
  if (spec.maxLength !== undefined) {
    if (!Number.isInteger(spec.maxLength) || spec.maxLength < 1) {
      throw new PdfFormBuilderError(
        400,
        "The maximum length must be a whole number of at least 1 character."
      );
    }
  }
  if (
    spec.type === "radio" ||
    spec.type === "dropdown" ||
    spec.type === "optionList"
  ) {
    assertOptions(spec);
    // A radio group is a vertical column: the last option's
    // bottom must still sit on the page.
    if (spec.type === "radio") {
      const bottom = spec.y - (spec.options!.length - 1) * RADIO_OPTION_PITCH;
      if (bottom < 0) {
        throw new PdfFormBuilderError(
          400,
          `The radio group does not fit on the page — ${spec.options!.length} options need ${spec.options!.length * RADIO_OPTION_PITCH - 4} points of height. Move it up or use fewer options.`
        );
      }
    }
  } else if (spec.options !== undefined && spec.options.length > 0) {
    throw new PdfFormBuilderError(
      400,
      `The field "${spec.name}" is a ${spec.type} field and does not take options.`
    );
  }
  assertDefaultValue(spec);

  const form = doc.getForm();
  const existing = new Set(form.getFields().map((f) => f.getName()));
  if (existing.has(spec.name)) {
    throw new PdfFormBuilderError(
      400,
      `There is already a field named "${spec.name}" in this PDF — pick a different name.`
    );
  }
  // A name that is already a PARENT of another field (e.g. adding
  // "a" when "a.b" exists) is also taken — pdf-lib refuses it as
  // a non-terminal. Check it here, since pdf-lib's error classes
  // cannot be caught with instanceof (see below).
  const nonTerminals = new Set<string>();
  for (const name of existing) {
    const parts = name.split(".");
    for (let i = 1; i < parts.length; i += 1) {
      nonTerminals.add(parts.slice(0, i).join("."));
    }
  }
  if (nonTerminals.has(spec.name)) {
    throw new PdfFormBuilderError(
      400,
      `The name "${spec.name}" is already used as a group of fields in this PDF — pick a different name.`
    );
  }

  // ---- Create and place (the spec is already known good) ----
  const appearance = {
    textColor: rgb(0, 0, 0),
    backgroundColor: rgb(1, 1, 1),
    borderColor: rgb(0, 0, 0),
    borderWidth: 1,
  };
  try {
    if (spec.type === "text") {
      const field = form.createTextField(spec.name);
      if (spec.multiline) field.enableMultiline();
      if (spec.maxLength !== undefined) field.setMaxLength(spec.maxLength);
      if (spec.required) field.enableRequired();
      if (spec.readOnly) field.enableReadOnly();
      if (typeof spec.defaultValue === "string") {
        field.setText(spec.defaultValue);
      }
      field.addToPage(page, {
        x: spec.x,
        y: spec.y,
        width: spec.width,
        height: spec.height,
        ...appearance,
      });
    } else if (spec.type === "checkbox") {
      const field = form.createCheckBox(spec.name);
      if (spec.required) field.enableRequired();
      if (spec.readOnly) field.enableReadOnly();
      if (spec.defaultValue === true) field.check();
      field.addToPage(page, {
        x: spec.x,
        y: spec.y,
        width: spec.width,
        height: spec.height,
        ...appearance,
      });
    } else if (spec.type === "radio") {
      const field = form.createRadioGroup(spec.name);
      if (spec.required) field.enableRequired();
      if (spec.readOnly) field.enableReadOnly();
      spec.options!.forEach((option, index) => {
        field.addOptionToPage(option, page, {
          x: spec.x,
          y: spec.y - index * RADIO_OPTION_PITCH,
          width: spec.width,
          height: spec.height,
          ...appearance,
        });
      });
      if (typeof spec.defaultValue === "string") {
        field.select(spec.defaultValue);
      }
    } else if (spec.type === "dropdown") {
      const field = form.createDropdown(spec.name);
      field.addOptions(spec.options!);
      if (spec.multiselect) field.enableMultiselect();
      if (spec.required) field.enableRequired();
      if (spec.readOnly) field.enableReadOnly();
      if (spec.defaultValue !== undefined) {
        field.select(spec.defaultValue as string | string[]);
      }
      field.addToPage(page, {
        x: spec.x,
        y: spec.y,
        width: spec.width,
        height: spec.height,
        ...appearance,
      });
    } else {
      // optionList
      const field = form.createOptionList(spec.name);
      field.addOptions(spec.options!);
      if (spec.multiselect) field.enableMultiselect();
      if (spec.required) field.enableRequired();
      if (spec.readOnly) field.enableReadOnly();
      if (spec.defaultValue !== undefined) {
        field.select(
          Array.isArray(spec.defaultValue)
            ? spec.defaultValue
            : [spec.defaultValue as string]
        );
      }
      field.addToPage(page, {
        x: spec.x,
        y: spec.y,
        width: spec.width,
        height: spec.height,
        ...appearance,
      });
    }
  } catch (error) {
    // Safety net only — the spec is already fully validated
    // above, so this should not fire. pdf-lib's error classes
    // (FieldAlreadyExistsError, FieldExistsAsNonTerminalError,
    // InvalidFieldNamePartError) cannot be caught with instanceof:
    // they are built with the ES5 extends-Error pattern, whose
    // constructor returns a plain Error object, breaking the
    // prototype chain. Match on the message instead.
    if (error instanceof PdfFormBuilderError) throw error;
    const message = error instanceof Error ? error.message : "";
    if (message.includes("already exists with the specified name")) {
      throw new PdfFormBuilderError(
        400,
        `There is already a field named "${spec.name}" in this PDF — pick a different name.`
      );
    }
    if (message.includes("non-terminal field already exists")) {
      throw new PdfFormBuilderError(
        400,
        `The name "${spec.name}" is already used as a group of fields in this PDF — pick a different name.`
      );
    }
    if (message.includes("invalid component")) {
      throw new PdfFormBuilderError(
        400,
        `The field name "${spec.name}" is not valid — it cannot start or end with a dot, or contain two dots in a row.`
      );
    }
    throw error;
  }

  // Regenerate the appearance streams so the new field SHOWS in
  // viewers (same step as the fill feature).
  form.updateFieldAppearances();
  return doc.save();
}

/**
 * Remove one form field from a PDF, by name. The returned bytes
 * are a NEW document — the input bytes are never modified, and
 * the caller saves the result as a new version.
 *
 * pdf-lib's `form.removeField()` removes the field from the
 * AcroForm and deletes its objects, but it does NOT remove the
 * widget annotations from the pages: its page cleanup removes
 * the widget's APPEARANCE ref and the FIELD ref from /Annots,
 * neither of which is ever in /Annots — the WIDGET ref is. Left
 * alone, the page keeps a dangling reference to a deleted
 * widget. So this function removes the widget refs from their
 * pages itself, after removeField runs.
 */
export async function removeFormField(
  bytes: Uint8Array,
  name: string
): Promise<Uint8Array> {
  const doc = await loadPdf(bytes, "This PDF");
  assertXfaNotPresent(doc);
  assertValidFieldName(name);
  const form = doc.getForm();
  // getFieldMaybe returns undefined instead of throwing — the
  // throwing getField uses NoSuchFieldError, which cannot be
  // caught with instanceof (see addFormField above).
  const field = form.getFieldMaybe(name);
  if (!field) {
    throw new PdfFormBuilderError(
      400,
      `There is no form field named "${name}" in this PDF.`
    );
  }
  // The widget refs and their pages, collected BEFORE removeField
  // deletes the widget objects.
  const widgetPages = new Map<
    Awaited<ReturnType<typeof doc.findPageForAnnotationRef>>,
    { ref: NonNullable<ReturnType<typeof doc.context.getObjectRef>> }[]
  >();
  for (const widget of field.acroField.getWidgets()) {
    const ref = doc.context.getObjectRef(widget.dict);
    if (!ref) continue;
    const page = doc.findPageForAnnotationRef(ref);
    if (!page) continue;
    const list = widgetPages.get(page) ?? [];
    list.push({ ref });
    widgetPages.set(page, list);
  }
  try {
    form.removeField(field);
  } catch {
    throw new PdfFormBuilderError(
      400,
      `The field "${name}" could not be removed — its placement in the PDF is missing or broken.`
    );
  }
  // Remove the (now dangling) widget refs from the pages.
  for (const [page, refs] of widgetPages) {
    if (!page) continue;
    for (const { ref } of refs) page.node.removeAnnot(ref);
  }
  return doc.save();
}

/** Re-exported so builder callers list fields through one module. */
export { listPdfFormFields };
