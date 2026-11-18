// PDF form-builder unit tests (Phase B, feature 5).
//
// Fixtures are built in-test with pdf-lib: a 2-page plain PDF
// (no form yet), an XFA PDF (low-level, with updateFieldAppearances
// disabled on save so pdf-lib does not strip the XFA entry), and
// a form PDF built with the builder itself.
//
// Every test asserts on the returned bytes via listPdfFormFields
// (the same list the UI shows) — never on the input bytes, which
// must stay untouched.
import { describe, expect, it } from "vitest";
import {
  PDFArray,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFString,
  StandardFonts,
  rgb,
  type PDFDict,
} from "pdf-lib";
import {
  addFormField,
  listPdfFormFields,
  removeFormField,
  type PdfFormBuilderFieldSpec,
} from "@/lib/pdf-form-builder";

async function makePlainPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const n of [1, 2]) {
    const page = doc.addPage([612, 792]);
    page.drawText(`Builder test page ${n}`, {
      x: 50,
      y: 700,
      size: 20,
      font,
      color: rgb(0, 0, 0),
    });
  }
  return doc.save();
}

async function makeXfaPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("XFA form", { x: 50, y: 700, size: 20, font });
  const form = doc.getForm();
  form.createTextField("xfa.field");
  // The XFA key is enough: hasXfaForm only checks for its presence.
  form.acroForm.dict.set(PDFName.of("XFA"), PDFString.of("dummy"));
  // The default save strips XFA (it calls getForm internally),
  // so save with appearances disabled to keep the XFA entry.
  return doc.save({ updateFieldAppearances: false });
}

/**
 * The widget's raw /Rect entry [x1, y1, x2, y2]. pdf-lib's
 * createWidget grows the rect by the border width (1 pt) and
 * centres the border on the requested edge, so the raw rect is
 * the requested rect expanded by half a point on every side:
 * x = requested x - 0.5, width = requested width + 1.
 */
function widgetRect(widget: { dict: PDFDict }): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const rect = widget.dict.lookup(PDFName.of("Rect"));
  if (!(rect instanceof PDFArray)) {
    throw new Error("Widget has no Rect entry.");
  }
  const nums = rect.asArray().map((entry) => {
    if (!(entry instanceof PDFNumber)) {
      throw new Error("Widget Rect entry is not a number.");
    }
    return entry.asNumber();
  });
  const [x1, y1, x2, y2] = nums;
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

function textSpec(
  overrides?: Partial<PdfFormBuilderFieldSpec>
): PdfFormBuilderFieldSpec {
  return {
    name: "Full Name",
    type: "text",
    page: 1,
    x: 50,
    y: 700,
    width: 200,
    height: 24,
    ...overrides,
  };
}

describe("addFormField", () => {
  it("adds a text field, listed with its page and properties", async () => {
    const bytes = await makePlainPdf();
    const out = await addFormField(bytes, textSpec({ required: true }));
    const fields = await listPdfFormFields(out);
    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({
      name: "Full Name",
      type: "text",
      page: 1,
      required: true,
      readOnly: false,
      value: "",
      multiline: false,
    });
    // The input bytes are untouched (no form in the original).
    expect(await listPdfFormFields(bytes)).toHaveLength(0);
  });

  it("adds a text field with multiline, max length and a default value", async () => {
    const bytes = await makePlainPdf();
    const out = await addFormField(
      bytes,
      textSpec({
        multiline: true,
        maxLength: 10,
        defaultValue: "Hello",
      })
    );
    const fields = await listPdfFormFields(out);
    expect(fields[0]).toMatchObject({
      multiline: true,
      maxLength: 10,
      value: "Hello",
    });
  });

  it("adds a checkbox, checked by default when asked", async () => {
    const bytes = await makePlainPdf();
    const out = await addFormField(bytes, {
      name: "Subscribe",
      type: "checkbox",
      page: 2,
      x: 50,
      y: 700,
      width: 18,
      height: 18,
      defaultValue: true,
    });
    const fields = await listPdfFormFields(out);
    expect(fields[0]).toMatchObject({
      name: "Subscribe",
      type: "checkbox",
      page: 2,
      value: true,
    });
  });

  it("adds a dropdown with its options and default selection", async () => {
    const bytes = await makePlainPdf();
    const out = await addFormField(bytes, {
      name: "Country",
      type: "dropdown",
      page: 1,
      x: 50,
      y: 700,
      width: 200,
      height: 24,
      options: ["Pakistan", "India", "Bangladesh"],
      defaultValue: "India",
    });
    const fields = await listPdfFormFields(out);
    expect(fields[0]).toMatchObject({
      name: "Country",
      type: "dropdown",
      options: ["Pakistan", "India", "Bangladesh"],
      value: ["India"],
    });
  });

  it("adds an option list, multi-select when asked", async () => {
    const bytes = await makePlainPdf();
    const out = await addFormField(bytes, {
      name: "Languages",
      type: "optionList",
      page: 1,
      x: 50,
      y: 700,
      width: 200,
      height: 72,
      options: ["Urdu", "English", "Arabic"],
      multiselect: true,
      defaultValue: ["Urdu", "English"],
    });
    const fields = await listPdfFormFields(out);
    expect(fields[0]).toMatchObject({
      name: "Languages",
      type: "optionList",
      multiselect: true,
      value: ["Urdu", "English"],
    });
  });

  it("adds a radio group with its options, laid out as a column", async () => {
    const bytes = await makePlainPdf();
    const out = await addFormField(bytes, {
      name: "Gender",
      type: "radio",
      page: 1,
      x: 50,
      y: 700,
      width: 16,
      height: 16,
      options: ["Male", "Female", "Other"],
      defaultValue: "Female",
    });
    const fields = await listPdfFormFields(out);
    expect(fields[0]).toMatchObject({
      name: "Gender",
      type: "radio",
      options: ["Male", "Female", "Other"],
      value: "Female",
    });
    // The widgets are a vertical column: 3 options at 20 pt pitch.
    const doc = await PDFDocument.load(out);
    const field = doc.getForm().getRadioGroup("Gender");
    const widgets = field.acroField.getWidgets();
    expect(widgets).toHaveLength(3);
    const rects = widgets.map((w) => widgetRect(w));
    expect(rects[0].y).toBeCloseTo(699.5, 0);
    expect(rects[1].y).toBeCloseTo(679.5, 0);
    expect(rects[2].y).toBeCloseTo(659.5, 0);
    expect(rects[0].x).toBeCloseTo(49.5, 0);
  });

  it("places the field at the given position", async () => {
    const bytes = await makePlainPdf();
    const out = await addFormField(
      bytes,
      textSpec({ x: 100, y: 500, width: 150, height: 30 })
    );
    const doc = await PDFDocument.load(out);
    const field = doc.getForm().getTextField("Full Name");
    const rect = widgetRect(field.acroField.getWidgets()[0]);
    expect(rect.x).toBeCloseTo(99.5, 0);
    expect(rect.y).toBeCloseTo(499.5, 0);
    expect(rect.width).toBeCloseTo(151, 0);
    expect(rect.height).toBeCloseTo(31, 0);
  });

  it("refuses a duplicate field name", async () => {
    const bytes = await makePlainPdf();
    const once = await addFormField(bytes, textSpec());
    await expect(addFormField(once, textSpec())).rejects.toThrow(
      /already a field named/
    );
  });

  it("refuses an invalid field name (empty, leading/trailing dot, double dot)", async () => {
    const bytes = await makePlainPdf();
    await expect(addFormField(bytes, textSpec({ name: "" }))).rejects.toThrow(
      /Give the field a name/
    );
    await expect(
      addFormField(bytes, textSpec({ name: ".Full Name" }))
    ).rejects.toThrow(/not valid/);
    await expect(
      addFormField(bytes, textSpec({ name: "Full..Name" }))
    ).rejects.toThrow(/not valid/);
  });

  it("refuses a placement outside the page and a page that does not exist", async () => {
    const bytes = await makePlainPdf();
    await expect(
      addFormField(bytes, textSpec({ x: 500, width: 200 }))
    ).rejects.toThrow(/does not fit on the page/);
    await expect(addFormField(bytes, textSpec({ y: -10 }))).rejects.toThrow(
      /cannot be negative/
    );
    await expect(addFormField(bytes, textSpec({ page: 3 }))).rejects.toThrow(
      /does not exist/
    );
    await expect(
      addFormField(bytes, textSpec({ width: 4, height: 4 }))
    ).rejects.toThrow(/too small/);
  });

  it("refuses a radio group with fewer than two options and a dropdown with none", async () => {
    const bytes = await makePlainPdf();
    await expect(
      addFormField(bytes, {
        name: "Gender",
        type: "radio",
        page: 1,
        x: 50,
        y: 700,
        width: 16,
        height: 16,
        options: ["Only"],
      })
    ).rejects.toThrow(/at least two options/);
    await expect(
      addFormField(bytes, {
        name: "Country",
        type: "dropdown",
        page: 1,
        x: 50,
        y: 700,
        width: 200,
        height: 24,
        options: [],
      })
    ).rejects.toThrow(/at least one option/);
  });

  it("refuses a radio column that does not fit on the page", async () => {
    const bytes = await makePlainPdf();
    await expect(
      addFormField(bytes, {
        name: "Gender",
        type: "radio",
        page: 1,
        x: 50,
        y: 30,
        width: 16,
        height: 16,
        options: ["Male", "Female", "Other"],
      })
    ).rejects.toThrow(/does not fit on the page/);
  });

  it("refuses a default value that is not an option, and a text default over the max length", async () => {
    const bytes = await makePlainPdf();
    await expect(
      addFormField(bytes, {
        name: "Country",
        type: "dropdown",
        page: 1,
        x: 50,
        y: 700,
        width: 200,
        height: 24,
        options: ["Pakistan", "India"],
        defaultValue: "France",
      })
    ).rejects.toThrow(/not an option/);
    await expect(
      addFormField(bytes, textSpec({ maxLength: 3, defaultValue: "Too long" }))
    ).rejects.toThrow(/longer than its maximum length/);
  });

  it("refuses an XFA PDF, never stripping it", async () => {
    const bytes = await makeXfaPdf();
    await expect(addFormField(bytes, textSpec())).rejects.toThrow(/XFA form/);
  });
});

describe("removeFormField", () => {
  it("removes the field and its widget — the list is empty again", async () => {
    const bytes = await makePlainPdf();
    const withField = await addFormField(bytes, textSpec());
    expect(await listPdfFormFields(withField)).toHaveLength(1);
    const out = await removeFormField(withField, "Full Name");
    expect(await listPdfFormFields(out)).toHaveLength(0);
    // No orphan widget left on the page.
    const doc = await PDFDocument.load(out);
    const page = doc.getPage(0);
    expect(page.node.Annots()?.size() ?? 0).toBe(0);
    // The input bytes are untouched.
    expect(await listPdfFormFields(withField)).toHaveLength(1);
  });

  it("removes a radio group and all of its option widgets", async () => {
    const bytes = await makePlainPdf();
    const withField = await addFormField(bytes, {
      name: "Gender",
      type: "radio",
      page: 1,
      x: 50,
      y: 700,
      width: 16,
      height: 16,
      options: ["Male", "Female"],
    });
    const out = await removeFormField(withField, "Gender");
    expect(await listPdfFormFields(out)).toHaveLength(0);
    const doc = await PDFDocument.load(out);
    expect(doc.getPage(0).node.Annots()?.size() ?? 0).toBe(0);
  });

  it("refuses to remove a field that does not exist", async () => {
    const bytes = await makePlainPdf();
    await expect(removeFormField(bytes, "Nope")).rejects.toThrow(
      /no form field named/
    );
  });

  it("refuses an XFA PDF", async () => {
    const bytes = await makeXfaPdf();
    await expect(removeFormField(bytes, "xfa.field")).rejects.toThrow(
      /XFA form/
    );
  });
});
