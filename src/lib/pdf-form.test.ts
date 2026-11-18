// @vitest-environment node
import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import {
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFString,
  StandardFonts,
  rgb,
} from "pdf-lib";
import { fillPdfForm, listPdfFormFields } from "@/lib/pdf-form";

/** Extract the visible text of a PDF with pdftotext (the viewer's view). */
function visibleText(bytes: Uint8Array): string {
  const path = `/tmp/e2e/form-test-${Date.now()}.pdf`;
  writeFileSync(path, bytes);
  try {
    return execSync(`pdftotext ${path} -`, { encoding: "utf8" });
  } finally {
    execSync(`rm -f ${path}`);
  }
}

/** True when qpdf finds no structural problem in the PDF. */
function qpdfOk(bytes: Uint8Array): boolean {
  const path = `/tmp/e2e/form-test-${Date.now()}-check.pdf`;
  writeFileSync(path, bytes);
  try {
    execSync(`qpdf --check ${path}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  } finally {
    execSync(`rm -f ${path}`);
  }
}

const box = {
  textColor: rgb(0, 0, 0),
  borderColor: rgb(0, 0, 0),
  backgroundColor: rgb(1, 1, 1),
};

/** A two-page PDF with one field of every type. */
async function formPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page1 = doc.addPage([600, 800]);
  const page2 = doc.addPage([600, 800]);
  const form = doc.getForm();

  const name = form.createTextField("Full Name");
  name.setText("Anas");
  name.addToPage(page1, { ...box, font, x: 50, y: 700, width: 200, height: 20 });

  const notes = form.createTextField("Notes");
  notes.enableMultiline();
  notes.addToPage(page1, { ...box, font, x: 50, y: 620, width: 200, height: 60 });

  const code = form.createTextField("Short Code");
  code.setMaxLength(5);
  code.addToPage(page1, { ...box, font, x: 50, y: 570, width: 100, height: 20 });

  const subscribe = form.createCheckBox("Subscribe");
  subscribe.check();
  subscribe.addToPage(page1, { x: 50, y: 520, width: 15, height: 15, ...box });

  const gender = form.createRadioGroup("Gender");
  gender.addOptionToPage("Male", page1, { x: 50, y: 470, width: 15, height: 15, ...box });
  gender.addOptionToPage("Female", page1, { x: 120, y: 470, width: 15, height: 15, ...box });
  gender.addOptionToPage("Other", page1, { x: 200, y: 470, width: 15, height: 15, ...box });
  gender.select("Male");

  const country = form.createDropdown("Country");
  country.addOptions(["Pakistan", "India", "Bangladesh"]);
  country.select("Pakistan");
  country.addToPage(page2, { ...box, font, x: 50, y: 700, width: 200, height: 20 });

  const langs = form.createOptionList("Languages");
  langs.addOptions(["English", "Urdu", "Arabic"]);
  langs.enableMultiselect();
  langs.select(["English", "Urdu"]);
  langs.addToPage(page2, { ...box, font, x: 50, y: 600, width: 200, height: 60 });

  const ref = form.createTextField("Reference");
  ref.setText("REF-001");
  ref.enableReadOnly();
  ref.addToPage(page1, { ...box, font, x: 50, y: 420, width: 200, height: 20 });

  const email = form.createTextField("Email");
  email.enableRequired();
  email.addToPage(page1, { ...box, font, x: 50, y: 370, width: 200, height: 20 });

  const submit = form.createButton("Submit");
  submit.addToPage("Submit", page1, { ...box, font, x: 50, y: 320, width: 100, height: 25 });

  return doc.save();
}

/** A PDF with a single digital signature field (pdf-lib has no
 * createSignature API, so the field is built with the low-level
 * objects). */
async function signaturePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([600, 800]);
  const form = doc.getForm();
  const sigDict = PDFDict.withContext(doc.context);
  sigDict.set(PDFName.of("FT"), PDFName.of("Sig"));
  sigDict.set(PDFName.of("T"), PDFString.of("Signature"));
  sigDict.set(PDFName.of("Type"), PDFName.of("Annot"));
  sigDict.set(PDFName.of("Subtype"), PDFName.of("Widget"));
  sigDict.set(
    PDFName.of("Rect"),
    doc.context.obj([
      PDFNumber.of(50),
      PDFNumber.of(300),
      PDFNumber.of(250),
      PDFNumber.of(340),
    ])
  );
  const sigRef = doc.context.register(sigDict);
  // addField takes the field's REF, not the field object — passing
  // the object breaks getFields() (it looks the ref up as a dict).
  form.acroForm.addField(sigRef);
  return doc.save();
}

/** A PDF whose AcroForm carries an XFA entry (the refusal path). */
async function xfaPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([600, 800]);
  const form = doc.getForm();
  form.createTextField("Name").addToPage(doc.getPage(0), {
    ...box,
    font: await doc.embedFont(StandardFonts.Helvetica),
    x: 50,
    y: 700,
    width: 200,
    height: 20,
  });
  // The XFA key is enough: hasXfaForm only checks for its presence.
  form.acroForm.dict.set(PDFName.of("XFA"), PDFString.of("dummy"));
  // Save WITHOUT updating field appearances: pdf-lib's default
  // save strips XFA (it calls getForm(), which deletes it).
  return doc.save({ updateFieldAppearances: false });
}

/** A plain one-page PDF with no form at all. */
async function plainPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 800]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("No form here", { x: 50, y: 700, size: 14, font });
  return doc.save();
}

describe("listPdfFormFields", () => {
  it("lists every field type with its value, options and page", async () => {
    const fields = await listPdfFormFields(await formPdf());
    const byName = new Map(fields.map((f) => [f.name, f]));
    expect(fields).toHaveLength(10);

    const name = byName.get("Full Name")!;
    expect(name.type).toBe("text");
    expect(name.value).toBe("Anas");
    expect(name.page).toBe(1);
    expect(name.maxLength).toBeNull();
    expect(name.multiline).toBe(false);

    expect(byName.get("Notes")!.multiline).toBe(true);
    expect(byName.get("Short Code")!.maxLength).toBe(5);
    expect(byName.get("Subscribe")!.type).toBe("checkbox");
    expect(byName.get("Subscribe")!.value).toBe(true);

    const gender = byName.get("Gender")!;
    expect(gender.type).toBe("radio");
    expect(gender.options).toEqual(["Male", "Female", "Other"]);
    expect(gender.value).toBe("Male");
    expect(gender.page).toBe(1);

    const country = byName.get("Country")!;
    expect(country.type).toBe("dropdown");
    expect(country.options).toEqual(["Pakistan", "India", "Bangladesh"]);
    expect(country.value).toEqual(["Pakistan"]);
    expect(country.page).toBe(2);

    const langs = byName.get("Languages")!;
    expect(langs.type).toBe("optionList");
    expect(langs.multiselect).toBe(true);
    expect(langs.value).toEqual(["English", "Urdu"]);
    expect(langs.page).toBe(2);

    expect(byName.get("Reference")!.readOnly).toBe(true);
    expect(byName.get("Reference")!.value).toBe("REF-001");
    expect(byName.get("Email")!.required).toBe(true);
    expect(byName.get("Submit")!.type).toBe("button");
    expect(byName.get("Submit")!.value).toBeNull();
  });

  it("lists a signature field as unsupported, not fillable", async () => {
    const fields = await listPdfFormFields(await signaturePdf());
    expect(fields).toHaveLength(1);
    expect(fields[0].name).toBe("Signature");
    expect(fields[0].type).toBe("signature");
    expect(fields[0].value).toBeNull();
  });

  it("returns an empty list for a PDF with no form fields", async () => {
    expect(await listPdfFormFields(await plainPdf())).toEqual([]);
  });

  it("refuses an XFA PDF instead of silently stripping it", async () => {
    await expect(listPdfFormFields(await xfaPdf())).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe("fillPdfForm", () => {
  it("fills every field type and the values survive a reopen", async () => {
    const input = await formPdf();
    const filled = await fillPdfForm(input, {
      "Full Name": "Muhammad Anas",
      Notes: "Hello\nWorld",
      "Short Code": "ABCDE",
      Subscribe: false,
      Gender: "Other",
      Country: "India",
      Languages: ["Arabic"],
      Email: "anas@example.com",
    });
    const fields = await listPdfFormFields(filled);
    const byName = new Map(fields.map((f) => [f.name, f]));
    expect(byName.get("Full Name")!.value).toBe("Muhammad Anas");
    expect(byName.get("Notes")!.value).toBe("Hello\nWorld");
    expect(byName.get("Short Code")!.value).toBe("ABCDE");
    expect(byName.get("Subscribe")!.value).toBe(false);
    expect(byName.get("Gender")!.value).toBe("Other");
    expect(byName.get("Country")!.value).toEqual(["India"]);
    expect(byName.get("Languages")!.value).toEqual(["Arabic"]);
    expect(byName.get("Email")!.value).toBe("anas@example.com");
    // The untouched read-only field keeps its value.
    expect(byName.get("Reference")!.value).toBe("REF-001");
  });

  it("makes the filled values visible (appearance streams are regenerated)", async () => {
    const filled = await fillPdfForm(await formPdf(), {
      "Full Name": "Muhammad Anas",
      Country: "Bangladesh",
    });
    const text = visibleText(filled);
    expect(text).toContain("Muhammad Anas");
    expect(text).toContain("Bangladesh");
  });

  it("does not modify the input bytes", async () => {
    const input = await formPdf();
    const before = await listPdfFormFields(input);
    await fillPdfForm(input, { "Full Name": "Changed" });
    const after = await listPdfFormFields(input);
    expect(after).toEqual(before);
  });

  it("is atomic: one bad value refuses the whole fill", async () => {
    const input = await formPdf();
    await expect(
      fillPdfForm(input, {
        "Full Name": "Changed",
        "Short Code": "TOOLONG",
      })
    ).rejects.toMatchObject({ status: 400 });
    const fields = await listPdfFormFields(input);
    expect(fields.find((f) => f.name === "Full Name")!.value).toBe("Anas");
  });

  it("refuses a value longer than the field's max length", async () => {
    await expect(
      fillPdfForm(await formPdf(), { "Short Code": "TOOLONG" })
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("at most 5 characters"),
    });
  });

  it("refuses an unknown field name", async () => {
    await expect(
      fillPdfForm(await formPdf(), { "No Such Field": "x" })
    ).rejects.toMatchObject({ status: 400 });
  });

  it("refuses a value of the wrong type", async () => {
    await expect(
      fillPdfForm(await formPdf(), { Subscribe: "yes" as never })
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      fillPdfForm(await formPdf(), { "Full Name": true as never })
    ).rejects.toMatchObject({ status: 400 });
  });

  it("refuses a read-only field", async () => {
    await expect(
      fillPdfForm(await formPdf(), { Reference: "CHANGED" })
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("read-only"),
    });
  });

  it("refuses an option that is not in the list", async () => {
    await expect(
      fillPdfForm(await formPdf(), { Country: "Mars" })
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("not an option"),
    });
    await expect(
      fillPdfForm(await formPdf(), { Gender: "Mars" })
    ).rejects.toMatchObject({ status: 400 });
  });

  it("refuses several options for a single-select field", async () => {
    await expect(
      fillPdfForm(await formPdf(), {
        Country: ["Pakistan", "India"],
      })
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("only one option"),
    });
  });

  it("refuses a button and a signature field", async () => {
    await expect(
      fillPdfForm(await formPdf(), { Submit: "x" })
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("button"),
    });
    await expect(
      fillPdfForm(await signaturePdf(), { Signature: "x" })
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("signature"),
    });
  });

  it("refuses a value the form's font cannot display", async () => {
    await expect(
      fillPdfForm(await formPdf(), { "Full Name": "محمد" })
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("cannot display"),
    });
  });

  it("refuses a PDF with no form fields", async () => {
    await expect(
      fillPdfForm(await plainPdf(), { "Full Name": "x" })
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("no form fields"),
    });
  });

  it("refuses an XFA PDF instead of silently stripping it", async () => {
    await expect(
      fillPdfForm(await xfaPdf(), { Name: "x" })
    ).rejects.toMatchObject({ status: 400 });
  });

  it("produces a structurally valid PDF (qpdf --check)", async () => {
    const filled = await fillPdfForm(await formPdf(), {
      "Full Name": "Muhammad Anas",
      Gender: "Female",
      Country: "India",
      Languages: ["English", "Arabic"],
    });
    expect(qpdfOk(filled)).toBe(true);
  });
});
