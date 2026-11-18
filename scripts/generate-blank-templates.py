#!/usr/bin/env python3
"""Generate the minimal blank Office templates Forma uses for
"New blank document" (Day 15).

The three files are real Office files made by the standard Python
Office libraries (python-docx, openpyxl, python-pptx) — a blank
document with one empty paragraph, a blank workbook with one empty
sheet, a blank presentation with one blank slide. ONLYOFFICE opens
each as word / cell / slide.

Run from the project root:
    python3 scripts/generate-blank-templates.py
Output: src/lib/blank-templates/blank.docx, blank.xlsx, blank.pptx.

These libraries do not survive a VM reset (pip packages are wiped),
but the generated files do — they are committed. If the files ever
need regenerating, reinstall the libraries first:
    pip install --break-system-packages python-docx openpyxl python-pptx
"""
import os
import zipfile
from xml.etree import ElementTree

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "src", "lib", "blank-templates")
os.makedirs(OUT, exist_ok=True)


def build_docx(path):
    from docx import Document

    doc = Document()
    doc.add_paragraph("")
    doc.save(path)


def build_xlsx(path):
    from openpyxl import Workbook

    wb = Workbook()
    wb.active.title = "Sheet1"
    wb.save(path)


def build_pptx(path):
    from pptx import Presentation

    prs = Presentation()
    # Layout 6 is the blank layout in the default template.
    prs.slides.add_slide(prs.slide_layouts[6])
    prs.save(path)


def verify(path, main_part):
    with zipfile.ZipFile(path) as zf:
        names = zf.namelist()
        assert "[Content_Types].xml" in names, f"{path}: no [Content_Types].xml"
        assert main_part in names, f"{path}: no {main_part}"
        ElementTree.fromstring(zf.read("[Content_Types].xml"))
        ElementTree.fromstring(zf.read(main_part))
    size = os.path.getsize(path)
    print(f"  {os.path.basename(path)}: {size} bytes, {len(names)} parts, main part {main_part} OK")
    return size


if __name__ == "__main__":
    docx_path = os.path.join(OUT, "blank.docx")
    xlsx_path = os.path.join(OUT, "blank.xlsx")
    pptx_path = os.path.join(OUT, "blank.pptx")
    build_docx(docx_path)
    build_xlsx(xlsx_path)
    build_pptx(pptx_path)
    print("Blank templates generated in", OUT)
    verify(docx_path, "word/document.xml")
    verify(xlsx_path, "xl/workbook.xml")
    verify(pptx_path, "ppt/presentation.xml")
