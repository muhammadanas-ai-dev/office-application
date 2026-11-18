// PDF form filling (Phase B, feature 4).
//
// Lists the AcroForm fields of a PDF and fills them, built on
// pdf-lib. Every function takes bytes in and returns bytes (or a
// field list) out; none of them touches storage or the database
// — the version bookkeeping (a new immutable version per fill,
// the original never overwritten) lives in pdf-form.server.ts.
//
// Two traps this module is built around (both verified in the
// pdf-lib source before writing it):
// 1. `doc.getForm()` SILENTLY DELETES XFA form data (and creates
//    an AcroForm when none exists). So the XFA check happens
//    FIRST, via the low-level catalog lookup, before any
//    getForm() call. An XFA PDF is refused with a clear 400,
//    never silently stripped.
// 2. A filled value only SHOWS in most viewers when its
//    appearance stream is regenerated (`form.updateFieldAppearances()`).
//    That draws with a standard font (Helvetica), so the filled
//    value shows in a standard font, not the field's original
//    font — and a value the standard font cannot render is
//    refused with a clear message instead of producing a broken
//    appearance.
//
// Server-side by convention: pdf-lib runs in Node here and the
// helpers below are imported by server routes only. Do NOT import
// this module from a client component.
import {
  PDFCheckBox,
  PDFDict,
  PDFDocument,
  PDFDropdown,
  PDFName,
  PDFOptionList,
  PDFRadioGroup,
  PDFSignature,
  PDFTextField,
  type PDFField,
} from "pdf-lib";
import { encodeWinAnsi } from "@/lib/pdf-content";
import { looksLikePdf } from "@/lib/pdf-tools";

/** A PDF-form failure with the HTTP status the route should return. */
export class PdfFormError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "PdfFormError";
    this.status = status;
  }
}

export type PdfFormFieldType =
  | "text"
  | "checkbox"
  | "radio"
  | "dropdown"
  | "optionList"
  | "button"
  | "signature";

export interface PdfFormField {
  name: string;
  type: PdfFormFieldType;
  /** 1-based page number of the field's first widget, or null. */
  page: number | null;
  required: boolean;
  readOnly: boolean;
  /** Current value: text for text fields, a boolean for
   * checkboxes, the selected option for radio buttons, the
   * selected options for dropdowns and option lists, null for
   * buttons and signatures. */
  value: string | boolean | string[] | null;
  /** The available options (radio, dropdown, option list), or null. */
  options: string[] | null;
  /** Max length for text fields, or null. */
  maxLength: number | null;
  /** True for multi-line text fields. */
  multiline: boolean;
  /** True when a dropdown or option list accepts several options. */
  multiselect: boolean;
}

/** A value a caller may fill a field with. */
export type PdfFormValue = string | boolean | string[];

async function loadPdf(bytes: Uint8Array, label: string): Promise<PDFDocument> {
  if (!looksLikePdf(bytes)) {
    throw new PdfFormError(400, "This file is not a valid PDF.");
  }
  try {
    return await PDFDocument.load(bytes, { ignoreEncryption: false });
  } catch {
    throw new PdfFormError(400, `${label} is not a valid PDF.`);
  }
}

/**
 * True when the document carries XFA form data. Checked via the
 * catalog, BEFORE any getForm() call — getForm() silently deletes
 * XFA, so calling it first would destroy the form it is meant to
 * detect.
 */
export function hasXfaForm(doc: PDFDocument): boolean {
  const acroFormRef = doc.catalog.get(PDFName.of("AcroForm"));
  if (!acroFormRef) return false;
  const acroForm = doc.context.lookup(acroFormRef);
  if (!(acroForm instanceof PDFDict)) return false;
  return acroForm.has(PDFName.of("XFA"));
}

/** The 1-based page of a field's first widget, or null. */
function fieldPage(doc: PDFDocument, field: PDFField): number | null {
  const widgets = field.acroField.getWidgets();
  const pages = doc.getPages();
  for (const widget of widgets) {
    // Most producers record the page in the widget's /P entry.
    const pageRef = widget.P();
    if (pageRef) {
      const idx = pages.findIndex((p) => p.ref === pageRef);
      if (idx >= 0) return idx + 1;
    }
    // Otherwise find the page whose /Annots holds this widget.
    const widgetRef = doc.context.getObjectRef(widget.dict);
    if (widgetRef) {
      const page = doc.findPageForAnnotationRef(widgetRef);
      if (page) return pages.indexOf(page) + 1;
    }
  }
  return null;
}

function fieldType(field: PDFField): PdfFormFieldType {
  if (field instanceof PDFTextField) return "text";
  if (field instanceof PDFCheckBox) return "checkbox";
  if (field instanceof PDFRadioGroup) return "radio";
  if (field instanceof PDFDropdown) return "dropdown";
  if (field instanceof PDFOptionList) return "optionList";
  if (field instanceof PDFSignature) return "signature";
  // PDFButton (a pushbutton) and anything unrecognised: listed,
  // never fillable.
  return "button";
}

function fieldOptions(
  field: PDFField,
  type: PdfFormFieldType
): string[] | null {
  if (type === "radio") return (field as PDFRadioGroup).getOptions();
  if (type === "dropdown") return (field as PDFDropdown).getOptions();
  if (type === "optionList") return (field as PDFOptionList).getOptions();
  return null;
}

function fieldValue(
  field: PDFField,
  type: PdfFormFieldType
): string | boolean | string[] | null {
  switch (type) {
    case "text":
      return (field as PDFTextField).getText() ?? "";
    case "checkbox":
      return (field as PDFCheckBox).isChecked();
    case "radio":
      return (field as PDFRadioGroup).getSelected() ?? null;
    case "dropdown":
      return (field as PDFDropdown).getSelected();
    case "optionList":
      return (field as PDFOptionList).getSelected();
    default:
      return null;
  }
}

/**
 * List the form fields of a PDF, in document order. A PDF with
 * no AcroForm (or an empty one) returns an empty list — the
 * caller reports that honestly instead of faking a form. An XFA
 * PDF is refused (it is not an AcroForm and cannot be filled by
 * this module).
 */
export async function listPdfFormFields(
  bytes: Uint8Array
): Promise<PdfFormField[]> {
  const doc = await loadPdf(bytes, "This PDF");
  if (hasXfaForm(doc)) {
    throw new PdfFormError(
      400,
      "This PDF uses an XFA form, which Forma cannot fill. AcroForm PDFs work — XFA is a different form technology."
    );
  }
  const form = doc.getForm();
  return form.getFields().map((field) => {
    const type = fieldType(field);
    return {
      name: field.getName(),
      type,
      page: fieldPage(doc, field),
      required: field.isRequired(),
      readOnly: field.isReadOnly(),
      value: fieldValue(field, type),
      options: fieldOptions(field, type),
      maxLength:
        type === "text"
          ? ((field as PDFTextField).getMaxLength() ?? null)
          : null,
      multiline:
        type === "text" ? (field as PDFTextField).isMultiline() : false,
      multiselect:
        type === "dropdown"
          ? (field as PDFDropdown).isMultiselect()
          : type === "optionList"
            ? (field as PDFOptionList).isMultiselect()
            : false,
    };
  });
}

/**
 * Fill a PDF's form fields. `values` maps field names to values:
 * a string for text and radio fields, a boolean for checkboxes,
 * a string (or array of strings) for dropdowns and option lists.
 *
 * Validation is atomic: every value is checked BEFORE anything
 * is changed, so one bad value refuses the whole fill and the
 * document is left exactly as it was. The filled form stays
 * editable (it is NOT flattened). The caller saves the returned
 * bytes as a new version — the input bytes are never modified.
 */
export async function fillPdfForm(
  bytes: Uint8Array,
  values: Record<string, PdfFormValue>
): Promise<Uint8Array> {
  const doc = await loadPdf(bytes, "This PDF");
  if (hasXfaForm(doc)) {
    throw new PdfFormError(
      400,
      "This PDF uses an XFA form, which Forma cannot fill. AcroForm PDFs work — XFA is a different form technology."
    );
  }
  const form = doc.getForm();
  const fields = form.getFields();
  if (fields.length === 0) {
    throw new PdfFormError(400, "This PDF has no form fields to fill.");
  }
  const byName = new Map(fields.map((f) => [f.getName(), f]));

  // ---- Validate everything first (atomic) ----
  for (const [name, value] of Object.entries(values)) {
    const field = byName.get(name);
    if (!field) {
      throw new PdfFormError(
        400,
        `There is no form field named "${name}" in this PDF.`
      );
    }
    const type = fieldType(field);
    if (field.isReadOnly()) {
      throw new PdfFormError(
        400,
        `The field "${name}" is read-only and cannot be filled.`
      );
    }
    if (type === "button") {
      throw new PdfFormError(
        400,
        `The field "${name}" is a button, not a value field — it cannot be filled.`
      );
    }
    if (type === "signature") {
      throw new PdfFormError(
        400,
        `The field "${name}" is a digital signature field. Signing is not supported yet.`
      );
    }
    if (type === "text") {
      if (typeof value !== "string") {
        throw new PdfFormError(
          400,
          `The field "${name}" takes text, not a ${typeof value}.`
        );
      }
      const max = (field as PDFTextField).getMaxLength();
      if (max !== undefined && value.length > max) {
        throw new PdfFormError(
          400,
          `The field "${name}" accepts at most ${max} characters (you entered ${value.length}).`
        );
      }
      if (encodeWinAnsi(value) === null) {
        throw new PdfFormError(
          400,
          `The field "${name}" contains characters the form's font cannot display. Latin letters, digits and common punctuation work.`
        );
      }
    } else if (type === "checkbox") {
      if (typeof value !== "boolean") {
        throw new PdfFormError(
          400,
          `The field "${name}" takes a yes/no value, not a ${typeof value}.`
        );
      }
    } else if (type === "radio") {
      if (typeof value !== "string") {
        throw new PdfFormError(
          400,
          `The field "${name}" takes one option, not a ${typeof value}.`
        );
      }
      const options = (field as PDFRadioGroup).getOptions();
      if (!options.includes(value)) {
        throw new PdfFormError(
          400,
          `"${value}" is not an option of the field "${name}".`
        );
      }
    } else if (type === "dropdown" || type === "optionList") {
      const choice =
        type === "dropdown"
          ? (field as PDFDropdown)
          : (field as PDFOptionList);
      const options = choice.getOptions();
      const vals = Array.isArray(value) ? value : [value];
      if (vals.length === 0) {
        throw new PdfFormError(
          400,
          `The field "${name}" needs at least one option.`
        );
      }
      if (
        vals.length > 1 &&
        type === "dropdown" &&
        !(field as PDFDropdown).isMultiselect()
      ) {
        throw new PdfFormError(
          400,
          `The field "${name}" accepts only one option.`
        );
      }
      if (
        vals.length > 1 &&
        type === "optionList" &&
        !(field as PDFOptionList).isMultiselect()
      ) {
        throw new PdfFormError(
          400,
          `The field "${name}" accepts only one option.`
        );
      }
      const editable =
        type === "dropdown" && (field as PDFDropdown).isEditable();
      for (const v of vals) {
        if (typeof v !== "string") {
          throw new PdfFormError(
            400,
            `The field "${name}" takes option names, not a ${typeof v}.`
          );
        }
        if (!editable && !options.includes(v)) {
          throw new PdfFormError(
            400,
            `"${v}" is not an option of the field "${name}".`
          );
        }
      }
    }
  }

  // ---- Apply (every value is already known good) ----
  for (const [name, value] of Object.entries(values)) {
    const field = byName.get(name)!;
    const type = fieldType(field);
    if (type === "text") {
      (field as PDFTextField).setText(value as string);
    } else if (type === "checkbox") {
      if (value) (field as PDFCheckBox).check();
      else (field as PDFCheckBox).uncheck();
    } else if (type === "radio") {
      (field as PDFRadioGroup).select(value as string);
    } else if (type === "dropdown") {
      (field as PDFDropdown).select(value as string | string[]);
    } else if (type === "optionList") {
      (field as PDFOptionList).select(value as string | string[]);
    }
  }
  // Regenerate the appearance streams so the filled values SHOW
  // in viewers (without this, most viewers render blank fields).
  form.updateFieldAppearances();
  return doc.save();
}

/** Validate that a PDF can be form-filled at all (loadable, has pages). */
export async function assertFormFillablePdf(bytes: Uint8Array): Promise<number> {
  const doc = await loadPdf(bytes, "This PDF");
  const count = doc.getPageCount();
  if (count < 1) throw new PdfFormError(400, "This PDF has no pages.");
  return count;
}
