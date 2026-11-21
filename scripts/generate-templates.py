#!/usr/bin/env python3
"""Generate Forma's original document templates (Day 16).

Builds the three template DOCX files (resume, letter, report) with
python-docx — real, original content with bracketed placeholders
for personal details — then renders each one's first page to a PNG
thumbnail (LibreOffice headless -> PDF -> pdftoppm) and extracts
the structured text into a preview JSON.

Run from the project root:
    python3 scripts/generate-templates.py
Output:
    src/lib/templates/<slug>.docx        (the template file)
    public/templates/<slug>.png          (first-page thumbnail)
    src/lib/templates/<slug>.preview.json (headings + paragraphs)

LibreOffice and pdftoppm are used only at authoring time; the
generated files are committed. The javaldx warning from
LibreOffice is harmless (Java is not needed for the conversion).
No WPS template, branding or font is used — the content is
Forma's own.
"""
import json
import os
import shutil
import subprocess
import zipfile
from xml.etree import ElementTree

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
TEMPLATE_DIR = os.path.join(ROOT, "src", "lib", "templates")
THUMB_DIR = os.path.join(ROOT, "public", "templates")
os.makedirs(TEMPLATE_DIR, exist_ok=True)
os.makedirs(THUMB_DIR, exist_ok=True)

NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}


def build_resume(path):
    from docx import Document
    from docx.shared import Pt

    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(11)

    name = doc.add_heading("[Your Full Name]", level=0)
    name.alignment = 1  # centered
    contact = doc.add_paragraph(
        "[email@example.com]  |  [phone number]  |  [City, Country]"
    )
    contact.alignment = 1
    doc.add_heading("Professional Summary", level=1)
    doc.add_paragraph(
        "A results-driven software engineer with experience building "
        "reliable products and shipping them to users. Skilled at "
        "turning unclear requirements into working software, and at "
        "explaining technical trade-offs in plain language."
    )
    doc.add_heading("Experience", level=1)
    doc.add_heading("Software Engineer — [Company Name]", level=2)
    doc.add_paragraph("[Start date] — [End date]  |  [City, Country]")
    doc.add_paragraph(
        "Built and maintained the core product, improved reliability, "
        "and worked directly with users to turn feedback into the next "
        "release.",
        style="List Bullet",
    )
    doc.add_paragraph(
        "Led a small project from design to launch, including testing "
        "and documentation.",
        style="List Bullet",
    )
    doc.add_heading("Junior Developer — [Company Name]", level=2)
    doc.add_paragraph("[Start date] — [End date]  |  [City, Country]")
    doc.add_paragraph(
        "Shipped features, fixed bugs, and learned the team's stack by "
        "working through real tickets.",
        style="List Bullet",
    )
    doc.add_heading("Education", level=1)
    doc.add_paragraph("[Degree Name] — [University Name], [Year]")
    doc.add_heading("Skills", level=1)
    table = doc.add_table(rows=1, cols=2)
    table.style = "Light Grid Accent 1"
    table.rows[0].cells[0].text = "Programming"
    table.rows[0].cells[1].text = "[Language 1], [Language 2], [Language 3]"
    row = table.add_row()
    row.cells[0].text = "Tools"
    row.cells[1].text = "[Tool 1], [Tool 2], [Tool 3]"
    doc.save(path)


def build_letter(path):
    from docx import Document
    from docx.shared import Pt

    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(11)

    doc.add_paragraph("[Your Full Name]")
    doc.add_paragraph("[Your Address]")
    doc.add_paragraph("[City, Postal Code]")
    doc.add_paragraph("[Your Email]  |  [Your Phone]")
    doc.add_paragraph("")
    doc.add_paragraph("[Date]")
    doc.add_paragraph("")
    doc.add_paragraph("[Recipient Name]")
    doc.add_paragraph("[Recipient Title]")
    doc.add_paragraph("[Company Name]")
    doc.add_paragraph("[Company Address]")
    doc.add_paragraph("")
    subject = doc.add_paragraph()
    subject.add_run("Subject: ").bold = True
    subject.add_run("[Subject of the letter]")
    doc.add_paragraph("")
    doc.add_paragraph("Dear [Recipient Name],")
    doc.add_paragraph(
        "I am writing to [state the purpose of the letter in one clear "
        "sentence — for example, to apply for a role, to request "
        "information, or to follow up on a previous conversation]."
    )
    doc.add_paragraph(
        "In this paragraph, give the details that support your purpose: "
        "the background, the facts, and anything the reader needs to "
        "understand the request. Keep it short and specific — one idea "
        "per paragraph."
    )
    doc.add_paragraph(
        "In the final paragraph, say clearly what you would like the "
        "reader to do next, and thank them for their time and "
        "consideration."
    )
    doc.add_paragraph("")
    doc.add_paragraph("Sincerely,")
    doc.add_paragraph("")
    doc.add_paragraph("[Your Full Name]")
    doc.add_paragraph("[Your Title]")
    doc.save(path)


def build_report(path):
    from docx import Document
    from docx.shared import Pt

    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(11)

    title = doc.add_heading("[Report Title]", level=0)
    title.alignment = 1
    subtitle = doc.add_paragraph("[Company Name]  |  [Date]")
    subtitle.alignment = 1
    doc.add_heading("Executive Summary", level=1)
    doc.add_paragraph(
        "This report summarises [what the report covers] and its main "
        "findings. The headline result is [one sentence stating the "
        "most important finding], and the recommendations at the end "
        "say what should happen next."
    )
    doc.add_heading("Findings", level=1)
    doc.add_heading("Finding 1: [Title]", level=2)
    doc.add_paragraph(
        "Describe the first finding here: what was observed, what the "
        "numbers say, and why it matters. Keep the evidence and the "
        "interpretation in the same paragraph so the reader does not "
        "have to guess the connection."
    )
    doc.add_heading("Finding 2: [Title]", level=2)
    doc.add_paragraph(
        "Describe the second finding here, in the same pattern: the "
        "evidence, then what it means."
    )
    doc.add_heading("Quarterly Results", level=2)
    table = doc.add_table(rows=1, cols=3)
    table.style = "Light Grid Accent 1"
    header = table.rows[0].cells
    header[0].text = "Quarter"
    header[1].text = "Revenue"
    header[2].text = "Growth"
    for quarter, revenue, growth in [
        ("Q1", "[Amount]", "[%]"),
        ("Q2", "[Amount]", "[%]"),
        ("Q3", "[Amount]", "[%]"),
    ]:
        row = table.add_row()
        row.cells[0].text = quarter
        row.cells[1].text = revenue
        row.cells[2].text = growth
    doc.add_heading("Conclusion", level=1)
    doc.add_paragraph(
        "In short, [restate the main finding in one or two sentences]. "
        "The evidence points to [the conclusion the reader should take "
        "away]."
    )
    doc.add_heading("Recommendations", level=1)
    doc.add_paragraph("1. [First recommended action].", style="List Number")
    doc.add_paragraph("2. [Second recommended action].", style="List Number")
    doc.add_paragraph("3. [Third recommended action].", style="List Number")
    doc.save(path)


def build_proposal(path):
    from docx import Document
    from docx.shared import Pt

    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(11)

    title = doc.add_heading("[Proposal Title]", level=0)
    title.alignment = 1
    subtitle = doc.add_paragraph("Prepared for [Client Name]  |  [Date]")
    subtitle.alignment = 1
    doc.add_paragraph("Prepared by [Your Name]  |  [Company Name]")
    doc.add_heading("Executive Summary", level=1)
    doc.add_paragraph(
        "This proposal describes [what you will deliver] for [Client Name], "
        "why it is the right approach, and what it costs. The work solves "
        "[the client's problem] by [the approach in one sentence]."
    )
    doc.add_heading("Scope", level=1)
    doc.add_paragraph(
        "The work covers [the deliverables in scope]. Out of scope: "
        "[what is explicitly not included], so there is no surprise later."
    )
    doc.add_heading("Deliverables", level=1)
    doc.add_paragraph("1. [First deliverable].", style="List Number")
    doc.add_paragraph("2. [Second deliverable].", style="List Number")
    doc.add_paragraph("3. [Third deliverable].", style="List Number")
    doc.add_heading("Timeline", level=1)
    table = doc.add_table(rows=1, cols=3)
    table.style = "Light Grid Accent 1"
    header = table.rows[0].cells
    header[0].text = "Phase"
    header[1].text = "Work"
    header[2].text = "Due"
    for phase, work, due in [
        ("Phase 1", "[First phase of work]", "[Date]"),
        ("Phase 2", "[Second phase of work]", "[Date]"),
        ("Phase 3", "[Final phase of work]", "[Date]"),
    ]:
        row = table.add_row()
        row.cells[0].text = phase
        row.cells[1].text = work
        row.cells[2].text = due
    doc.add_heading("Pricing", level=1)
    pricing = doc.add_table(rows=1, cols=2)
    pricing.style = "Light Grid Accent 1"
    pricing.rows[0].cells[0].text = "Item"
    pricing.rows[0].cells[1].text = "Amount"
    for item, amount in [
        ("[First item]", "[Amount]"),
        ("[Second item]", "[Amount]"),
        ("Total", "[Total amount]"),
    ]:
        row = pricing.add_row()
        row.cells[0].text = item
        row.cells[1].text = amount
    doc.add_heading("Terms", level=1)
    doc.add_paragraph(
        "Payment: [payment terms, e.g. 50% upfront, 50% on delivery]. "
        "Validity: this proposal is valid until [date]. Acceptance: "
        "sign below to accept."
    )
    doc.save(path)


def build_invoice(path):
    from docx import Document
    from docx.shared import Pt

    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(11)

    title = doc.add_heading("Invoice", level=0)
    title.alignment = 1
    doc.add_paragraph("[Your Business Name]")
    doc.add_paragraph("[Your address]  |  [Your email]  |  [Your phone]")
    doc.add_heading("Bill To", level=1)
    doc.add_paragraph("[Client Name]")
    doc.add_paragraph("[Client address]")
    doc.add_heading("Invoice Details", level=1)
    details = doc.add_table(rows=1, cols=2)
    details.style = "Light Grid Accent 1"
    details.rows[0].cells[0].text = "Field"
    details.rows[0].cells[1].text = "Value"
    for field, value in [
        ("Invoice number", "[INV-0001]"),
        ("Invoice date", "[Date]"),
        ("Due date", "[Date]"),
        ("Payment method", "[Bank transfer / cash / card]"),
    ]:
        row = details.add_row()
        row.cells[0].text = field
        row.cells[1].text = value
    doc.add_heading("Line Items", level=1)
    items = doc.add_table(rows=1, cols=4)
    items.style = "Light Grid Accent 1"
    header = items.rows[0].cells
    header[0].text = "Description"
    header[1].text = "Quantity"
    header[2].text = "Rate"
    header[3].text = "Amount"
    for description, qty, rate, amount in [
        ("[First item or service]", "[1]", "[Rate]", "[Amount]"),
        ("[Second item or service]", "[1]", "[Rate]", "[Amount]"),
    ]:
        row = items.add_row()
        row.cells[0].text = description
        row.cells[1].text = qty
        row.cells[2].text = rate
        row.cells[3].text = amount
    doc.add_heading("Totals", level=1)
    totals = doc.add_table(rows=1, cols=2)
    totals.style = "Light Grid Accent 1"
    totals.rows[0].cells[0].text = "Subtotal"
    totals.rows[0].cells[1].text = "[Amount]"
    for label, amount in [
        ("Tax ([Rate]%)", "[Amount]"),
        ("Total due", "[Total amount]"),
    ]:
        row = totals.add_row()
        row.cells[0].text = label
        row.cells[1].text = amount
    doc.add_heading("Payment Terms", level=1)
    doc.add_paragraph(
        "Payment is due by [due date]. Please include the invoice number "
        "with your payment. Late payments may incur a [late fee]."
    )
    doc.save(path)


def build_minutes(path):
    from docx import Document
    from docx.shared import Pt

    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(11)

    title = doc.add_heading("[Meeting Title] — Minutes", level=0)
    title.alignment = 1
    doc.add_paragraph("Date: [Date]  |  Time: [Time]  |  Location: [Location]")
    doc.add_heading("Attendees", level=1)
    doc.add_paragraph("[Name 1], [Name 2], [Name 3]")
    doc.add_heading("Agenda", level=1)
    doc.add_paragraph("1. [First agenda item].", style="List Number")
    doc.add_paragraph("2. [Second agenda item].", style="List Number")
    doc.add_paragraph("3. [Third agenda item].", style="List Number")
    doc.add_heading("Discussion", level=1)
    doc.add_heading("[First agenda item]", level=2)
    doc.add_paragraph(
        "What was discussed: [a short summary of the discussion and the "
        "points raised]."
    )
    doc.add_heading("[Second agenda item]", level=2)
    doc.add_paragraph(
        "What was discussed: [a short summary of the discussion and the "
        "points raised]."
    )
    doc.add_heading("Decisions", level=1)
    doc.add_paragraph("1. [First decision].", style="List Number")
    doc.add_paragraph("2. [Second decision].", style="List Number")
    doc.add_heading("Action Items", level=1)
    actions = doc.add_table(rows=1, cols=3)
    actions.style = "Light Grid Accent 1"
    header = actions.rows[0].cells
    header[0].text = "Action"
    header[1].text = "Owner"
    header[2].text = "Due"
    for action, owner, due in [
        ("[First action]", "[Owner]", "[Date]"),
        ("[Second action]", "[Owner]", "[Date]"),
    ]:
        row = actions.add_row()
        row.cells[0].text = action
        row.cells[1].text = owner
        row.cells[2].text = due
    doc.save(path)


def build_certificate(path):
    from docx import Document
    from docx.shared import Pt

    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(11)

    title = doc.add_heading("Certificate of Achievement", level=0)
    title.alignment = 1
    doc.add_paragraph("This certificate is proudly presented to", style="Normal")
    name = doc.add_heading("[Recipient Full Name]", level=1)
    name.alignment = 1
    doc.add_paragraph(
        "In recognition of [the achievement — for example, completing "
        "[course or project name] with distinction, or outstanding "
        "contribution to [team or organisation]]."
    )
    doc.add_heading("Details", level=1)
    details = doc.add_table(rows=1, cols=2)
    details.style = "Light Grid Accent 1"
    details.rows[0].cells[0].text = "Field"
    details.rows[0].cells[1].text = "Value"
    for field, value in [
        ("Awarded by", "[Organisation Name]"),
        ("Date", "[Date]"),
        ("Certificate ID", "[ID]"),
    ]:
        row = details.add_row()
        row.cells[0].text = field
        row.cells[1].text = value
    doc.add_heading("Signatures", level=1)
    doc.add_paragraph("Issued by: ______________________    [Name], [Title]")
    doc.add_paragraph("Date: ______________________")
    doc.save(path)


def build_budget(path):
    from openpyxl import Workbook
    from openpyxl.styles import Font

    wb = Workbook()
    ws = wb.active
    ws.title = "Budget"
    bold = Font(bold=True)
    ws["A1"] = "Monthly Budget Tracker"
    ws["A1"].font = Font(bold=True, size=14)
    ws["A2"] = "[Month Year]"
    headers = ["Category", "Budget", "Actual", "Difference"]
    for col, header in enumerate(headers, start=1):
        cell = ws.cell(row=4, column=col, value=header)
        cell.font = bold
    # Income rows (rows 6-7), then a totals row.
    income = [("Salary", "[Amount]", "[Amount]"), ("Other income", "[Amount]", "[Amount]")]
    row = 5
    ws.cell(row=row, column=1, value="Income").font = bold
    row += 1
    income_start = row
    for category, budget, actual in income:
        ws.cell(row=row, column=1, value=category)
        ws.cell(row=row, column=2, value=budget)
        ws.cell(row=row, column=3, value=actual)
        ws.cell(row=row, column=4, value=f"=B{row}-C{row}")
        row += 1
    ws.cell(row=row, column=1, value="Total income").font = bold
    ws.cell(row=row, column=2, value=f"=SUM(B{income_start}:B{row - 1})")
    ws.cell(row=row, column=3, value=f"=SUM(C{income_start}:C{row - 1})")
    ws.cell(row=row, column=4, value=f"=B{row}-C{row}")
    total_income_row = row
    row += 2
    # Expense rows, then a totals row.
    ws.cell(row=row, column=1, value="Expenses").font = bold
    row += 1
    expense_start = row
    expenses = [
        ("Rent", "[Amount]", "[Amount]"),
        ("Groceries", "[Amount]", "[Amount]"),
        ("Transport", "[Amount]", "[Amount]"),
        ("Utilities", "[Amount]", "[Amount]"),
        ("Entertainment", "[Amount]", "[Amount]"),
    ]
    for category, budget, actual in expenses:
        ws.cell(row=row, column=1, value=category)
        ws.cell(row=row, column=2, value=budget)
        ws.cell(row=row, column=3, value=actual)
        ws.cell(row=row, column=4, value=f"=B{row}-C{row}")
        row += 1
    ws.cell(row=row, column=1, value="Total expenses").font = bold
    ws.cell(row=row, column=2, value=f"=SUM(B{expense_start}:B{row - 1})")
    ws.cell(row=row, column=3, value=f"=SUM(C{expense_start}:C{row - 1})")
    ws.cell(row=row, column=4, value=f"=B{row}-C{row}")
    total_expenses_row = row
    row += 2
    # The bottom line: what is left after expenses.
    ws.cell(row=row, column=1, value="Remaining").font = bold
    ws.cell(row=row, column=2, value=f"=B{total_income_row}-B{total_expenses_row}")
    ws.cell(row=row, column=3, value=f"=C{total_income_row}-C{total_expenses_row}")
    ws.cell(row=row, column=4, value=f"=B{row}-C{row}")
    ws.column_dimensions["A"].width = 22
    ws.column_dimensions["B"].width = 14
    ws.column_dimensions["C"].width = 14
    ws.column_dimensions["D"].width = 14
    wb.save(path)


def build_pitch(path):
    from pptx import Presentation
    from pptx.util import Pt

    prs = Presentation()
    title_layout = prs.slide_layouts[0]  # Title slide
    content_layout = prs.slide_layouts[1]  # Title and content
    slides = [
        ("[Product Name]", "[One-line pitch: what it does and who it is for.]"),
        ("The Problem", "[The problem your users face, in one or two sentences. Make it concrete — a real situation, not a vague complaint.]"),
        ("The Solution", "[How your product solves it, in one or two sentences. What changes for the user.]"),
        ("The Market", "[Who the customers are and how big the opportunity is. One or two numbers, with their source.]"),
        ("The Product", "[What the product does today: the three things a user can do with it. Keep it to what exists, not what might exist.]"),
        ("Business Model", "[How you make money: who pays, how much, and how often. One sentence per revenue stream.]"),
        ("Team & Ask", "[Who is building it, and what you are asking for: the amount, what it funds, and what it unlocks.]"),
    ]
    for index, (title, body) in enumerate(slides):
        layout = title_layout if index == 0 else content_layout
        slide = prs.slides.add_slide(layout)
        slide.shapes.title.text = title
        if index == 0:
            # The title slide's subtitle placeholder (type SUBTITLE,
            # not BODY — the title layout has no body placeholder).
            for shape in slide.placeholders:
                if shape.placeholder_format.type in (2, 4):  # body / subtitle
                    shape.text = body
        else:
            body_shape = slide.placeholders[1]
            body_shape.text = body
            for paragraph in body_shape.text_frame.paragraphs:
                for run in paragraph.runs:
                    run.font.size = Pt(18)
    prs.save(path)


def extract_preview(docx_path):
    """The structured text of a DOCX: paragraphs in order, with
    their style name, plus table rows as plain lines."""
    with zipfile.ZipFile(docx_path) as zf:
        xml = zf.read("word/document.xml")
    root = ElementTree.fromstring(xml)
    entries = []
    for para in root.iter(f"{{{NS['w']}}}p"):
        style_el = para.find(f"{{{NS['w']}}}pPr/{{{NS['w']}}}pStyle")
        style = style_el.get(f"{{{NS['w']}}}val") if style_el is not None else "Normal"
        text = "".join(
            t.text or "" for t in para.iter(f"{{{NS['w']}}}t")
        ).strip()
        if text:
            entries.append({"style": style, "text": text})
    # Tables: append each row as a single line so the preview shows
    # the table's content.
    for table in root.iter(f"{{{NS['w']}}}tbl"):
        for row in table.iter(f"{{{NS['w']}}}tr"):
            cells = []
            for cell in row.iter(f"{{{NS['w']}}}tc"):
                cells.append(
                    " ".join(
                        t.text or ""
                        for t in cell.iter(f"{{{NS['w']}}}t")
                    ).strip()
                )
            line = " | ".join(c for c in cells if c)
            if line:
                entries.append({"style": "Table", "text": line})
    return entries


def extract_preview_xlsx(xlsx_path):
    """The structured text of an XLSX: the sheet name as a
    heading, then the first rows' cell values as lines. The
    budget tracker's Budget/Actual/Difference columns read as
    "Category | Budget | Actual | Difference"."""
    from openpyxl import load_workbook

    wb = load_workbook(xlsx_path, data_only=False)
    entries = []
    for ws in wb.worksheets:
        entries.append({"style": "Heading1", "text": ws.title})
        count = 0
        for row in ws.iter_rows(values_only=True):
            values = [str(v) for v in row if v is not None and str(v).strip()]
            if not values:
                continue
            entries.append({"style": "Normal", "text": " | ".join(values)})
            count += 1
            if count >= 20:
                break
    return entries


def extract_preview_pptx(pptx_path):
    """The structured text of a PPTX: each slide's title as a
    heading, then its body text. The first slide's title is the
    template's first heading."""
    from pptx import Presentation

    prs = Presentation(pptx_path)
    entries = []
    for slide in prs.slides:
        title = slide.shapes.title.text if slide.shapes.title else ""
        if title:
            entries.append({"style": "Heading1", "text": title})
        for shape in slide.shapes:
            if not shape.has_text_frame or shape == slide.shapes.title:
                continue
            text = shape.text.strip()
            if text:
                entries.append({"style": "Normal", "text": text})
    return entries


def render_thumbnail(docx_path, png_path):
    """DOCX -> PDF (LibreOffice headless) -> first-page PNG (pdftoppm)."""
    tmpdir = "/tmp/forma-template-render"
    os.makedirs(tmpdir, exist_ok=True)
    base = os.path.splitext(os.path.basename(docx_path))[0]
    pdf_path = os.path.join(tmpdir, f"{base}.pdf")
    for stale in (pdf_path,):
        if os.path.exists(stale):
            os.remove(stale)
    subprocess.run(
        [
            "libreoffice", "--headless", "--convert-to", "pdf",
            "--outdir", tmpdir, docx_path,
        ],
        check=True,
        capture_output=True,
        timeout=180,
    )
    prefix = os.path.join(tmpdir, base)
    subprocess.run(
        ["pdftoppm", "-png", "-r", "100", "-f", "1", "-l", "1", pdf_path, prefix],
        check=True,
        capture_output=True,
        timeout=60,
    )
    rendered = f"{prefix}-1.png"
    # /tmp and the project live on different filesystems, so a rename
    # fails — copy the file instead.
    shutil.copyfile(rendered, png_path)
    os.remove(rendered)
    if os.path.exists(pdf_path):
        os.remove(pdf_path)


# The main part of an Office file, by its extension — the
# verify step checks the right one per template type.
MAIN_PART = {
    "docx": "word/document.xml",
    "xlsx": "xl/workbook.xml",
    "pptx": "ppt/presentation.xml",
}


def verify(file_path, png_path, json_path, first_heading):
    ext = os.path.splitext(file_path)[1].lstrip(".")
    main_part = MAIN_PART[ext]
    with zipfile.ZipFile(file_path) as zf:
        names = zf.namelist()
        assert "[Content_Types].xml" in names
        assert main_part in names
        ElementTree.fromstring(zf.read(main_part))
    with open(png_path, "rb") as f:
        assert f.read(8) == b"\x89PNG\r\n\x1a\n", "not a PNG"
    with open(json_path) as f:
        preview = json.load(f)
    assert preview, "empty preview"
    assert preview[0]["text"] == first_heading, f"first heading is {preview[0]['text']!r}"
    print(
        f"  {os.path.basename(file_path)}: {os.path.getsize(file_path)} bytes, "
        f"thumbnail {os.path.getsize(png_path)} bytes, "
        f"preview {len(preview)} entries, first heading {first_heading!r}"
    )


# (slug, builder, preview extractor, extension, first heading).
TEMPLATES = [
    ("resume", build_resume, extract_preview, "docx", "[Your Full Name]"),
    ("letter", build_letter, extract_preview, "docx", "[Your Full Name]"),
    ("report", build_report, extract_preview, "docx", "[Report Title]"),
    ("proposal", build_proposal, extract_preview, "docx", "[Proposal Title]"),
    ("invoice", build_invoice, extract_preview, "docx", "Invoice"),
    ("minutes", build_minutes, extract_preview, "docx", "[Meeting Title] — Minutes"),
    ("certificate", build_certificate, extract_preview, "docx", "Certificate of Achievement"),
    ("budget", build_budget, extract_preview_xlsx, "xlsx", "Budget"),
    ("pitch", build_pitch, extract_preview_pptx, "pptx", "[Product Name]"),
]

if __name__ == "__main__":
    for slug, builder, extractor, ext, first_heading in TEMPLATES:
        file_path = os.path.join(TEMPLATE_DIR, f"{slug}.{ext}")
        png_path = os.path.join(THUMB_DIR, f"{slug}.png")
        json_path = os.path.join(TEMPLATE_DIR, f"{slug}.preview.json")
        builder(file_path)
        preview = extractor(file_path)
        with open(json_path, "w") as f:
            json.dump(preview, f, indent=2)
        render_thumbnail(file_path, png_path)
        verify(file_path, png_path, json_path, first_heading)
    print("Templates generated.")
