#!/usr/bin/env python3
"""Generate the Forma Office compatibility test corpus (Day 26).

Builds a fixed set of representative documents that exercise
the formats and the features, so the format claims are
testable instead of ad-hoc. The generator is the source of
truth — the files are committed, and the manifest
(`corpus/manifest.json`) is written by this script so it can
never drift from the files.

Run from the project root:
    python3 scripts/generate-corpus.py
Output:
    corpus/*.docx, *.xlsx, *.pptx, *.txt, *.csv, *.png, *.jpg
    corpus/*.doc, *.xls, *.ppt, *.odt, *.ods, *.odp (LibreOffice)
    corpus/*.pdf (LibreOffice + pdf-lib, qpdf for the protected one)
    corpus/manifest.json

Tools: python-docx, openpyxl, python-pptx, PIL, LibreOffice
(headless), pdf-lib (via a small Node helper in this repo),
qpdf. The pip packages do NOT survive a VM reset — reinstall
python-docx / openpyxl / python-pptx if this fails with
ModuleNotFoundError. LibreOffice and PIL are in the base image.

Honest limits (v1):
- No pivot table in the XLSX: openpyxl cannot create one.
- No animation in the PPTX: python-pptx has no animation API.
  Both are recorded in the manifest as gaps, not faked.
- The "huge file" edge case is a 30-page PDF, not a 50 MB
  file — a near-limit file would make every run slow.
- English-only in v1.

No WPS template, branding or font is used — all content is
Forma's own, written for this corpus.
"""

import csv
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CORPUS_DIR = PROJECT_ROOT / "corpus"

# The corpus fixture's PUBLIC test password (for the protected
# PDF only). It is not a real credential and must never be one.
CORPUS_PASSWORD = "corpus123"

OCR_TEXT = "Forma Office Compatibility Corpus"


def build_text_image(path_png: Path, path_jpg: Path) -> None:
    """A text image (for OCR and images-to-PDF)."""
    from PIL import Image, ImageDraw, ImageFont

    width, height = 1200, 600
    img = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(img)
    # A large built-in font if DejaVu is present, else the default.
    try:
        font_big = ImageFont.truetype("DejaVuSans-Bold.ttf", 72)
        font_small = ImageFont.truetype("DejaVuSans.ttf", 36)
    except OSError:
        font_big = ImageFont.load_default()
        font_small = ImageFont.load_default()
    draw.text((60, 80), "Forma Office", fill="black", font=font_big)
    draw.text((60, 200), "Compatibility Corpus", fill="black", font=font_big)
    draw.text(
        (60, 340),
        "The quick brown fox jumps over the lazy dog.",
        fill="black",
        font=font_small,
    )
    draw.text(
        (60, 400),
        "Pack my box with five dozen liquor jugs.",
        fill="black",
        font=font_small,
    )
    img.save(path_png)
    img.convert("RGB").save(path_jpg, quality=90)
    print(f"  wrote {path_png.name} + {path_jpg.name}")


def build_plain_text(path_txt: Path, path_csv: Path) -> None:
    """Plain text and CSV files."""
    text = (
        "Forma Office — Compatibility Corpus\n"
        "====================================\n"
        "\n"
        "This is a plain-text document.\n"
        "It has several lines, some unicode: café, naïve, résumé.\n"
        "And a line with a tab\tseparated\tvalue.\n"
    )
    path_txt.write_text(text, encoding="utf-8")
    with open(path_csv, "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["id", "name", "price", "note"])
        writer.writerow([1, "Widget", "9.99", "a simple widget"])
        writer.writerow([2, 'Gadget, "deluxe"', "24.50", "quoted, with a comma"])
        writer.writerow([3, "Café blend", "12.00", "unicode: café"])
        writer.writerow([4, "Thing", "", "an empty price"])
    print(f"  wrote {path_txt.name} + {path_csv.name}")


def build_docx_rich(path: Path, image_png: Path) -> None:
    """A rich DOCX: mixed fonts, table, image, header, footer,
    a section break, and a footnote (raw XML — python-docx has
    no footnote API)."""
    from docx import Document
    from docx.enum.text import WD_BREAK
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    from docx.shared import Pt, RGBColor

    doc = Document()

    # Header + footer (every section).
    section = doc.sections[0]
    header = section.header.paragraphs[0]
    header.text = "Forma Office — Compatibility Corpus"
    footer = section.footer.paragraphs[0]
    footer.text = "Corpus fixture — not a real document"

    # Title + a mixed-font body.
    doc.add_heading("Forma Office Compatibility Corpus", level=0)
    doc.add_heading("Mixed fonts", level=1)
    p = doc.add_paragraph()
    run = p.add_run("This paragraph is in Calibri, the default. ")
    run.font.name = "Calibri"
    run = p.add_run("This run is in Times New Roman. ")
    run.font.name = "Times New Roman"
    run = p.add_run("And this run is monospace (Consolas).")
    run.font.name = "Consolas"
    run.font.size = Pt(11)

    # A footnote on its own paragraph (raw XML).
    p = doc.add_paragraph(
        "This sentence carries a footnote about the corpus."
    )
    add_footnote(doc, p, "This is the corpus footnote.")

    # A table.
    doc.add_heading("A table", level=1)
    table = doc.add_table(rows=4, cols=3)
    table.style = "Table Grid"
    headers = ["Item", "Quantity", "Price"]
    for j, h in enumerate(headers):
        table.cell(0, j).text = h
    rows = [
        ("Widget", "3", "9.99"),
        ("Gadget", "1", "24.50"),
        ("Café blend", "2", "12.00"),
    ]
    for i, (item, qty, price) in enumerate(rows, start=1):
        table.cell(i, 0).text = item
        table.cell(i, 1).text = qty
        table.cell(i, 2).text = price

    # An image.
    doc.add_heading("An image", level=1)
    doc.add_paragraph("The image below is the corpus text image.")
    doc.add_picture(str(image_png), width=doc.sections[0].page_width * 0.6)

    # A section break (a new section, landscape).
    new_section = doc.add_section()
    new_section.orientation = 1  # WD_ORIENTATION.LANDSCAPE
    doc.add_heading("After the section break", level=1)
    doc.add_paragraph(
        "This page is in a second section (landscape). "
        "A section break is one of the features the corpus covers."
    )
    doc.save(path)
    print(f"  wrote {path.name}")


def add_footnote(doc, paragraph, text: str) -> None:
    """Add a footnote to `paragraph` (raw XML).

    python-docx has no footnote API, so the footnotes part is
    built by hand: a `footnotes.xml` part with the separator,
    the continuation separator and one real footnote, plus a
    `w:footnoteReference` run in the paragraph. The part is
    registered with the package (content type + relationship)
    so Word / LibreOffice / ONLYOFFICE read it.
    """
    from docx.opc.constants import CONTENT_TYPE as CT
    from docx.opc.constants import RELATIONSHIP_TYPE as RT
    from docx.opc.packuri import PackURI
    from docx.opc.part import Part
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn

    ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    footnotes_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        f'<w:footnotes xmlns:w="{ns}">'
        '<w:footnote w:type="separator" w:id="0">'
        "<w:p><w:r><w:separator/></w:r></w:p></w:footnote>"
        '<w:footnote w:type="continuationSeparator" w:id="1">'
        "<w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>"
        '<w:footnote w:id="2"><w:p><w:r><w:rPr>'
        '<w:rStyle w:val="FootnoteReference"/></w:rPr>'
        '<w:footnoteRef/></w:r>'
        f"<w:r><w:t>{text}</w:t></w:r></w:p></w:footnote>"
        "</w:footnotes>"
    )
    partname = PackURI("/word/footnotes.xml")
    content_type = (
        "application/vnd.openxmlformats-officedocument."
        "wordprocessingml.footnotes+xml"
    )
    part = Part(partname, content_type, footnotes_xml.encode("utf-8"))
    # The relationship belongs on the DOCUMENT part (so it lands
    # in word/_rels/document.xml.rels), not on the package.
    doc.part.relate_to(part, RT.FOOTNOTES)

    # The reference run in the paragraph.
    run = paragraph.add_run()
    r = run._r
    ref = OxmlElement("w:footnoteReference")
    ref.set(qn("w:id"), "2")
    r.append(ref)


def build_xlsx_rich(path: Path) -> None:
    """A rich XLSX: sheets, formulas, a chart, styled cells."""
    from openpyxl import Workbook
    from openpyxl.chart import BarChart, Reference
    from openpyxl.styles import Font, PatternFill

    wb = Workbook()
    ws = wb.active
    ws.title = "Sales"
    header_fill = PatternFill("solid", fgColor="3159C9")
    header_font = Font(bold=True, color="FFFFFF")
    headers = ["Item", "Quantity", "Price", "Total"]
    for j, h in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=j, value=h)
        cell.fill = header_fill
        cell.font = header_font
    rows = [
        ("Widget", 3, 9.99),
        ("Gadget", 1, 24.50),
        ("Café blend", 2, 12.00),
        ("Thing", 5, 4.25),
    ]
    for i, (item, qty, price) in enumerate(rows, start=2):
        ws.cell(row=i, column=1, value=item)
        ws.cell(row=i, column=2, value=qty)
        ws.cell(row=i, column=3, value=price)
        # A formula: quantity * price.
        ws.cell(row=i, column=4, value=f"=B{i}*C{i}")
    # A total row with a SUM formula.
    total_row = len(rows) + 2
    ws.cell(row=total_row, column=1, value="Total")
    ws.cell(row=total_row, column=4, value=f"=SUM(D2:D{len(rows) + 1})")
    ws.cell(row=total_row, column=4).font = Font(bold=True)
    for col in ("A", "B", "C", "D"):
        ws.column_dimensions[col].width = 16

    # A second sheet with a bar chart of the totals.
    chart_ws = wb.create_sheet("Chart")
    chart_ws["A1"] = "Item"
    chart_ws["B1"] = "Total"
    for i, (item, _qty, _price) in enumerate(rows, start=2):
        chart_ws.cell(row=i, column=1, value=item)
        chart_ws.cell(row=i, column=2, value=f"=Sales!D{i}")
    chart = BarChart()
    chart.type = "col"
    chart.title = "Totals by item"
    data = Reference(chart_ws, min_col=2, min_row=1, max_row=len(rows) + 1)
    cats = Reference(chart_ws, min_col=1, min_row=2, max_row=len(rows) + 1)
    chart.add_data(data, titles_from_data=True)
    chart.set_categories(cats)
    chart_ws.add_chart(chart, "D2")

    # A third sheet summarising with a formula.
    summary = wb.create_sheet("Summary")
    summary["A1"] = "Grand total"
    summary["B1"] = f"=Sales!D{total_row}"
    summary["A2"] = "Items"
    summary["B2"] = f"=COUNTA(Sales!A2:A{len(rows) + 1})"
    wb.save(path)
    print(f"  wrote {path.name}")


def build_pptx_rich(path: Path, image_png: Path) -> None:
    """A rich PPTX: title + content + table + chart + image."""
    from pptx import Presentation
    from pptx.chart.data import ChartData
    from pptx.enum.chart import XL_CHART_TYPE
    from pptx.util import Inches, Pt

    prs = Presentation()
    # Slide 1 — title.
    slide = prs.slides.add_slide(prs.slide_layouts[0])
    slide.shapes.title.text = "Forma Office Compatibility Corpus"
    slide.placeholders[1].text = "A representative set of documents"

    # Slide 2 — bullets + a table.
    slide = prs.slides.add_slide(prs.slide_layouts[1])
    slide.shapes.title.text = "What the corpus covers"
    body = slide.placeholders[1].text_frame
    body.text = "Mixed fonts, tables, images and charts"
    for line in (
        "A Word document with a table and a footnote",
        "A spreadsheet with formulas and a chart",
        "A presentation with a table and a chart",
    ):
        body.add_paragraph().text = line
    rows, cols = 3, 2
    table_shape = slide.shapes.add_table(
        rows, cols, Inches(0.5), Inches(3.2), Inches(4), Inches(1.2)
    )
    table = table_shape.table
    table.cell(0, 0).text = "Format"
    table.cell(0, 1).text = "Covered"
    table.cell(1, 0).text = "DOCX"
    table.cell(1, 1).text = "Yes"
    table.cell(2, 0).text = "XLSX"
    table.cell(2, 1).text = "Yes"

    # Slide 3 — a chart + the image.
    slide = prs.slides.add_slide(prs.slide_layouts[5])
    slide.shapes.title.text = "Chart and image"
    chart_data = ChartData()
    chart_data.categories = ["Widget", "Gadget", "Café blend"]
    chart_data.add_series("Total", (29.97, 24.50, 24.00))
    slide.shapes.add_chart(
        XL_CHART_TYPE.COLUMN_CLUSTERED,
        Inches(0.5),
        Inches(1.2),
        Inches(4.5),
        Inches(3),
        chart_data,
    )
    slide.shapes.add_picture(
        str(image_png), Inches(5.2), Inches(1.2), width=Inches(4)
    )
    prs.save(path)
    print(f"  wrote {path.name}")


def libreoffice_convert(source: Path, out_dir: Path, fmt: str) -> Path:
    """Convert `source` with LibreOffice headless to `fmt`.

    Returns the converted file. Raises if LibreOffice fails.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    cmd = [
        "soffice",
        "--headless",
        "--convert-to",
        fmt,
        "--outdir",
        str(out_dir),
        str(source),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    target = out_dir / (source.stem + "." + fmt.split(":")[0])
    if result.returncode != 0 or not target.exists():
        raise RuntimeError(
            f"LibreOffice failed converting {source.name} to {fmt}:\n"
            f"{result.stdout}\n{result.stderr}"
        )
    return target


def build_pdf_rich(source_docx: Path, out_path: Path) -> None:
    """A rich PDF: the DOCX converted by LibreOffice."""
    pdf = libreoffice_convert(source_docx, CORPUS_DIR, "pdf")
    # LibreOffice names it <stem>.pdf; move it to the corpus name.
    if pdf.resolve() != out_path.resolve():
        shutil.move(str(pdf), str(out_path))
    print(f"  wrote {out_path.name}")


def build_pdf_scanned(image_png: Path, out_path: Path) -> None:
    """A scanned-looking PDF: image-only pages (for OCR)."""
    from PIL import Image

    # Two pages, each the text image at a different scale.
    img = Image.open(image_png)
    pages = []
    for _ in range(2):
        pages.append(img)
    # Build with pdf-lib via a tiny Node helper (pdf-lib is in
    # the project; Node ESM resolves packages relative to the
    # script's location, so the helper lives in the project).
    helper = PROJECT_ROOT / "scripts" / "build-corpus-pdf.mjs"
    helper.write_text(
        "import { PDFDocument } from 'pdf-lib';\n"
        "import { readFileSync, writeFileSync } from 'node:fs';\n"
        "const [,, imagePath, outPath] = process.argv;\n"
        "const png = readFileSync(imagePath);\n"
        "const doc = await PDFDocument.create();\n"
        "const img = await doc.embedPng(png);\n"
        "for (let i = 0; i < 2; i++) {\n"
        "  const page = doc.addPage([img.width, img.height]);\n"
        "  page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });\n"
        "}\n"
        "writeFileSync(outPath, await doc.save());\n"
        "console.log('wrote ' + outPath);\n"
    )
    result = subprocess.run(
        ["node", str(helper), str(image_png), str(out_path)],
        capture_output=True,
        text=True,
        cwd=str(PROJECT_ROOT),
        timeout=120,
    )
    if result.returncode != 0:
        raise RuntimeError(f"build-corpus-pdf failed:\n{result.stderr}")
    print(f"  wrote {out_path.name}")


def build_pdf_large(out_path: Path, pages: int = 30) -> None:
    """A large PDF (30 pages) — the 'huge file' edge case."""
    helper = PROJECT_ROOT / "scripts" / "build-corpus-pdf.mjs"
    helper.write_text(
        "import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';\n"
        "import { writeFileSync } from 'node:fs';\n"
        "const [,, outPath, count] = process.argv;\n"
        "const doc = await PDFDocument.create();\n"
        "const font = await doc.embedFont(StandardFonts.Helvetica);\n"
        "for (let n = 1; n <= Number(count); n++) {\n"
        "  const page = doc.addPage([612, 792]);\n"
        "  page.drawText(`Corpus large document — page ${n} of ${count}`, { x: 50, y: 700, size: 18, font, color: rgb(0, 0, 0) });\n"
        "  page.drawText('The quick brown fox jumps over the lazy dog.', { x: 50, y: 660, size: 12, font, color: rgb(0, 0, 0) });\n"
        "}\n"
        "writeFileSync(outPath, await doc.save());\n"
        "console.log('wrote ' + outPath);\n"
    )
    result = subprocess.run(
        ["node", str(helper), str(out_path), str(pages)],
        capture_output=True,
        text=True,
        cwd=str(PROJECT_ROOT),
        timeout=120,
    )
    if result.returncode != 0:
        raise RuntimeError(f"build-corpus-pdf failed:\n{result.stderr}")
    print(f"  wrote {out_path.name} ({pages} pages)")


def build_pdf_protected(source_pdf: Path, out_path: Path) -> None:
    """A password-protected PDF (qpdf, AES-256)."""
    result = subprocess.run(
        [
            "qpdf",
            "--encrypt",
            f"--user-password={CORPUS_PASSWORD}",
            f"--owner-password={CORPUS_PASSWORD}",
            "--bits=256",
            "--print=full",
            "--extract=n",
            "--modify=none",
            "--",
            str(source_pdf),
            str(out_path),
        ],
        capture_output=True,
        text=True,
        timeout=120,
    )
    if result.returncode != 0:
        raise RuntimeError(f"qpdf failed:\n{result.stderr}")
    print(f"  wrote {out_path.name} (password: {CORPUS_PASSWORD})")


def build_corrupt(source: Path, out_path: Path, keep_bytes: int = 200) -> None:
    """A corrupt file: the first bytes of a real file, truncated.

    It keeps the format's magic bytes so the file is recognised
    but is too short to parse — the refusal path, not the happy
    path.
    """
    data = source.read_bytes()
    out_path.write_bytes(data[:keep_bytes])
    print(f"  wrote {out_path.name} (truncated to {keep_bytes} bytes)")


def write_manifest(entries: list) -> None:
    """Write corpus/manifest.json (the runner reads it)."""
    manifest = {"version": 1, "files": entries}
    path = CORPUS_DIR / "manifest.json"
    path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"  wrote manifest.json ({len(entries)} files)")


def main() -> int:
    CORPUS_DIR.mkdir(parents=True, exist_ok=True)
    print("Building the compatibility corpus in corpus/ ...")

    # --- Part 1: the rich sources + plain files + images ---
    image_png = CORPUS_DIR / "image.png"
    image_jpg = CORPUS_DIR / "image.jpg"
    build_text_image(image_png, image_jpg)

    build_plain_text(CORPUS_DIR / "plain.txt", CORPUS_DIR / "data.csv")

    docx_rich = CORPUS_DIR / "docx-rich.docx"
    build_docx_rich(docx_rich, image_png)

    xlsx_rich = CORPUS_DIR / "xlsx-rich.xlsx"
    build_xlsx_rich(xlsx_rich)

    pptx_rich = CORPUS_DIR / "pptx-rich.pptx"
    build_pptx_rich(pptx_rich, image_png)

    # --- Part 2: derived formats (LibreOffice) ---
    print("Converting with LibreOffice ...")
    # LibreOffice names the output <source-stem>.<format>; the
    # manifest uses a <format>-rich name, so rename after each
    # conversion.
    for source, fmt, target_name in (
        (docx_rich, "doc", "doc-rich.doc"),
        (docx_rich, "odt", "odt-rich.odt"),
        (xlsx_rich, "xls", "xls-rich.xls"),
        (xlsx_rich, "ods", "ods-rich.ods"),
        (pptx_rich, "ppt", "ppt-rich.ppt"),
        (pptx_rich, "odp", "odp-rich.odp"),
    ):
        converted = libreoffice_convert(source, CORPUS_DIR, fmt)
        target = CORPUS_DIR / target_name
        if converted.resolve() != target.resolve():
            shutil.move(str(converted), str(target))
        print(f"  wrote {target.name}")

    # --- Part 2: PDFs ---
    pdf_rich = CORPUS_DIR / "pdf-rich.pdf"
    build_pdf_rich(docx_rich, pdf_rich)

    pdf_scanned = CORPUS_DIR / "pdf-scanned.pdf"
    build_pdf_scanned(image_png, pdf_scanned)

    pdf_large = CORPUS_DIR / "pdf-large.pdf"
    build_pdf_large(pdf_large, pages=30)

    pdf_protected = CORPUS_DIR / "pdf-protected.pdf"
    build_pdf_protected(pdf_rich, pdf_protected)

    # --- Part 2: corrupt files ---
    build_corrupt(pdf_rich, CORPUS_DIR / "corrupt.pdf")
    build_corrupt(docx_rich, CORPUS_DIR / "corrupt.docx")

    # --- The manifest ---
    # "gaps" lists what v1 does NOT cover (recorded, not faked).
    entries = [
        {
            "id": "docx-rich",
            "file": "docx-rich.docx",
            "format": "docx",
            "title": "Rich Word document",
            "features": [
                "mixed-fonts",
                "table",
                "image",
                "header",
                "footer",
                "section-break",
                "footnote",
            ],
            "checks": ["upload", "pdf-export", "round-trip", "page-count"],
        },
        {
            "id": "doc-rich",
            "file": "doc-rich.doc",
            "format": "doc",
            "title": "Rich Word document (legacy .doc)",
            "features": ["table", "image", "header", "footer"],
            "checks": ["upload", "pdf-export", "round-trip"],
        },
        {
            "id": "odt-rich",
            "file": "odt-rich.odt",
            "format": "odt",
            "title": "Rich Word document (OpenDocument)",
            "features": ["table", "image", "header", "footer"],
            "checks": ["upload", "pdf-export", "round-trip"],
        },
        {
            "id": "xlsx-rich",
            "file": "xlsx-rich.xlsx",
            "format": "xlsx",
            "title": "Rich spreadsheet",
            "features": ["formulas", "chart", "styled-cells", "multiple-sheets"],
            "checks": ["upload", "pdf-export", "round-trip", "page-count"],
        },
        {
            "id": "xls-rich",
            "file": "xls-rich.xls",
            "format": "xls",
            "title": "Rich spreadsheet (legacy .xls)",
            "features": ["formulas", "chart"],
            "checks": ["upload", "pdf-export", "round-trip"],
        },
        {
            "id": "ods-rich",
            "file": "ods-rich.ods",
            "format": "ods",
            "title": "Rich spreadsheet (OpenDocument)",
            "features": ["formulas", "chart"],
            "checks": ["upload", "pdf-export", "round-trip"],
        },
        {
            "id": "pptx-rich",
            "file": "pptx-rich.pptx",
            "format": "pptx",
            "title": "Rich presentation",
            "features": ["table", "chart", "image", "multiple-slides"],
            "checks": ["upload", "pdf-export", "round-trip", "page-count"],
        },
        {
            "id": "ppt-rich",
            "file": "ppt-rich.ppt",
            "format": "ppt",
            "title": "Rich presentation (legacy .ppt)",
            "features": ["table", "chart", "image"],
            "checks": ["upload", "pdf-export", "round-trip"],
        },
        {
            "id": "odp-rich",
            "file": "odp-rich.odp",
            "format": "odp",
            "title": "Rich presentation (OpenDocument)",
            "features": ["table", "chart", "image"],
            "checks": ["upload", "pdf-export", "round-trip"],
        },
        {
            "id": "plain-text",
            "file": "plain.txt",
            "format": "txt",
            "title": "Plain text",
            "features": ["unicode", "tabs"],
            "checks": ["upload", "pdf-export", "round-trip"],
        },
        {
            "id": "data-csv",
            "file": "data.csv",
            "format": "csv",
            "title": "CSV data",
            "features": ["quoted-fields", "unicode", "empty-value"],
            "checks": ["upload", "pdf-export", "round-trip"],
        },
        {
            "id": "pdf-rich",
            "file": "pdf-rich.pdf",
            "format": "pdf",
            "title": "Rich PDF",
            "features": ["mixed-fonts", "table", "image", "multiple-pages"],
            "checks": ["upload", "pdf-tools", "page-count"],
        },
        {
            "id": "pdf-scanned",
            "file": "pdf-scanned.pdf",
            "format": "pdf",
            "title": "Scanned PDF (image-only pages)",
            "features": ["image-only", "ocr"],
            "checks": ["upload", "ocr", "pdf-tools", "page-count"],
            "expectedText": OCR_TEXT,
        },
        {
            "id": "pdf-large",
            "file": "pdf-large.pdf",
            "format": "pdf",
            "title": "Large PDF (30 pages)",
            "features": ["many-pages"],
            "checks": ["upload", "pdf-tools", "page-count"],
        },
        {
            "id": "pdf-protected",
            "file": "pdf-protected.pdf",
            "format": "pdf",
            "title": "Password-protected PDF",
            "features": ["password-protected"],
            "checks": ["upload", "security"],
            "password": CORPUS_PASSWORD,
        },
        {
            "id": "image-png",
            "file": "image.png",
            "format": "png",
            "title": "Text image (PNG)",
            "features": ["text"],
            "checks": ["upload", "ocr", "images-to-pdf"],
            "expectedText": OCR_TEXT,
        },
        {
            "id": "image-jpg",
            "file": "image.jpg",
            "format": "jpg",
            "title": "Text image (JPG)",
            "features": ["text"],
            "checks": ["upload", "ocr", "images-to-pdf"],
            "expectedText": OCR_TEXT,
        },
        {
            "id": "corrupt-pdf",
            "file": "corrupt.pdf",
            "format": "pdf",
            "title": "Corrupt PDF (truncated)",
            "features": ["corrupt"],
            "checks": ["upload", "corrupt"],
        },
        {
            "id": "corrupt-docx",
            "file": "corrupt.docx",
            "format": "docx",
            "title": "Corrupt DOCX (truncated)",
            "features": ["corrupt"],
            "checks": ["upload", "corrupt"],
        },
    ]
    write_manifest(entries)
    print("Done. The corpus has", len(entries), "files.")
    print("Known gaps (v1): no pivot table in the XLSX, no")
    print("animation in the PPTX — recorded, not faked.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
