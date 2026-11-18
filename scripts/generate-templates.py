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


def verify(docx_path, png_path, json_path, first_heading):
    with zipfile.ZipFile(docx_path) as zf:
        names = zf.namelist()
        assert "[Content_Types].xml" in names
        assert "word/document.xml" in names
        ElementTree.fromstring(zf.read("word/document.xml"))
    with open(png_path, "rb") as f:
        assert f.read(8) == b"\x89PNG\r\n\x1a\n", "not a PNG"
    with open(json_path) as f:
        preview = json.load(f)
    assert preview, "empty preview"
    assert preview[0]["text"] == first_heading, f"first heading is {preview[0]['text']!r}"
    print(
        f"  {os.path.basename(docx_path)}: {os.path.getsize(docx_path)} bytes, "
        f"thumbnail {os.path.getsize(png_path)} bytes, "
        f"preview {len(preview)} entries, first heading {first_heading!r}"
    )


TEMPLATES = [
    ("resume", build_resume, "[Your Full Name]"),
    ("letter", build_letter, "[Your Full Name]"),
    ("report", build_report, "[Report Title]"),
]

if __name__ == "__main__":
    for slug, builder, first_heading in TEMPLATES:
        docx_path = os.path.join(TEMPLATE_DIR, f"{slug}.docx")
        png_path = os.path.join(THUMB_DIR, f"{slug}.png")
        json_path = os.path.join(TEMPLATE_DIR, f"{slug}.preview.json")
        builder(docx_path)
        preview = extract_preview(docx_path)
        with open(json_path, "w") as f:
            json.dump(preview, f, indent=2)
        render_thumbnail(docx_path, png_path)
        verify(docx_path, png_path, json_path, first_heading)
    print("Templates generated.")
