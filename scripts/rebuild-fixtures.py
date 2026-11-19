#!/usr/bin/env python3
"""Rebuild the /tmp fixtures the unit tests need (Day 9/10).

The fixtures live in /tmp and are wiped by every VM reset.
This script rebuilds them exactly as the tests assert:

  /tmp/e2e/pdf1.pdf
      3 pages, Letter 612x792, Helvetica, size 20, x=50, y=700,
      text "PDF One page N" (pdf-lib, via the Node helper below).
  /tmp/e2e/debug-export.pdf
      Hand-built: a Type0/CID font with NO ToUnicode CMap, one
      text run at (50, 750), size 10. pdftotext shows only
      control characters. The pdf-content/pdf-edit tests assert
      the run is located by position (y > 700, fontSize 10).
  /tmp/chrome-proof/img.pdf
      1 page, one 1500x1500 seeded-noise PNG embedded at
      500x500. The pdf-edit tests assert one image on page 1
      and that replacing it keeps the frame.

Run from the project root:
    python3 scripts/rebuild-fixtures.py
"""

import os
import random
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def build_pdf1() -> None:
    """pdf1.pdf via pdf-lib (Node, in the project)."""
    helper = PROJECT_ROOT / "scripts" / "build-pdf1-helper.mjs"
    helper.write_text(
        "import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';\n"
        "import { writeFileSync } from 'node:fs';\n"
        "const doc = await PDFDocument.create();\n"
        "const font = await doc.embedFont(StandardFonts.Helvetica);\n"
        "for (let n = 1; n <= 3; n++) {\n"
        "  const page = doc.addPage([612, 792]);\n"
        "  page.drawText(`PDF One page ${n}`, { x: 50, y: 700, size: 20, font, color: rgb(0, 0, 0) });\n"
        "}\n"
        "writeFileSync('/tmp/e2e/pdf1.pdf', await doc.save());\n"
        "console.log('wrote /tmp/e2e/pdf1.pdf');\n"
    )
    subprocess.run(
        ["node", str(helper)], check=True, cwd=str(PROJECT_ROOT), timeout=120
    )


def build_debug_export() -> None:
    """debug-export.pdf — hand-built Type0/CID, no ToUnicode.

    A minimal PDF written object by object, with a correct xref
    table. The font is Type0 (Encoding /Identity-H) with a
    CIDFontType2 descendant and NO /ToUnicode entry — so a text
    extractor cannot decode the glyph codes (pdftotext shows
    control characters), but the content stream still has the
    text-showing operation the pdf-content parser locates by
    position. One run: size 10 at (50, 750).
    """
    out = Path("/tmp/e2e/debug-export.pdf")
    # The glyph codes are arbitrary 2-byte CIDs (no ToUnicode
    # maps them to characters, so they decode to nothing).
    content = b"BT /F1 10 Tf 1 0 0 1 50 750 Tm <0001000200030004> Tj ET"
    objects = []
    objects.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    objects.append(b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
    objects.append(
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>"
    )
    objects.append(
        b"<< /Length " + str(len(content)).encode() + b" >>\n"
        b"stream\n" + content + b"\nendstream"
    )
    objects.append(
        b"<< /Type /Font /Subtype /Type0 /BaseFont /ABCDEE+Calibri "
        b"/Encoding /Identity-H /DescendantFonts [6 0 R] >>"
    )
    objects.append(
        b"<< /Type /Font /Subtype /CIDFontType2 /BaseFont /ABCDEE+Calibri "
        b"/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> "
        b"/FontDescriptor 7 0 R /DW 1000 >>"
    )
    objects.append(
        b"<< /Type /FontDescriptor /FontName /ABCDEE+Calibri /Flags 32 "
        b"/FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 900 "
        b"/Descent -200 /CapHeight 700 /StemV 80 >>"
    )
    pdf = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for i, body in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf += str(i).encode() + b" 0 obj\n" + body + b"\nendobj\n"
    xref_pos = len(pdf)
    pdf += b"xref\n0 " + str(len(objects) + 1).encode() + b"\n"
    pdf += b"0000000000 65535 f \n"
    for off in offsets[1:]:
        pdf += f"{off:010d} 00000 n \n".encode()
    pdf += (
        b"trailer\n<< /Size "
        + str(len(objects) + 1).encode()
        + b" /Root 1 0 R >>\nstartxref\n"
        + str(xref_pos).encode()
        + b"\n%%EOF\n"
    )
    out.write_bytes(bytes(pdf))
    print(f"wrote {out} ({len(pdf)} bytes)")


def build_img_pdf() -> None:
    """img.pdf — a 1500x1500 seeded-noise PNG at 500x500."""
    from PIL import Image

    rng = random.Random(42)
    size = 1500
    img = Image.new("RGB", (size, size))
    pixels = img.load()
    for y in range(size):
        for x in range(size):
            pixels[x, y] = (
                rng.randrange(256),
                rng.randrange(256),
                rng.randrange(256),
            )
    png_path = Path("/tmp/chrome-proof/img.png")
    img.save(png_path)
    helper = PROJECT_ROOT / "scripts" / "build-img-helper.mjs"
    helper.write_text(
        "import { PDFDocument } from 'pdf-lib';\n"
        "import { readFileSync, writeFileSync } from 'node:fs';\n"
        "const png = readFileSync('/tmp/chrome-proof/img.png');\n"
        "const doc = await PDFDocument.create();\n"
        "const img = await doc.embedPng(png);\n"
        "const page = doc.addPage([612, 792]);\n"
        "page.drawImage(img, { x: 56, y: 146, width: 500, height: 500 });\n"
        "writeFileSync('/tmp/chrome-proof/img.pdf', await doc.save());\n"
        "console.log('wrote /tmp/chrome-proof/img.pdf');\n"
    )
    subprocess.run(
        ["node", str(helper)], check=True, cwd=str(PROJECT_ROOT), timeout=120
    )


def build_scanned_pdf() -> None:
    """scanned.pdf — 2 image-only pages (for OCR / searchable).

    Page 1 carries "The quick brown fox jumps over the lazy
    dog." and page 2 carries "Pack my box with five dozen
    liquor jugs." — the two lines the Day 21 harness checks
    for after "Make searchable". Each page is a text image, so
    the PDF has no text layer (extract-text returns empty)
    until OCR adds one.
    """
    from PIL import Image, ImageDraw, ImageFont

    lines = [
        "The quick brown fox jumps over the lazy dog.",
        "Pack my box with five dozen liquor jugs.",
    ]
    png_paths = []
    for i, line in enumerate(lines, start=1):
        img = Image.new("RGB", (1200, 400), "white")
        draw = ImageDraw.Draw(img)
        try:
            font = ImageFont.truetype("DejaVuSans.ttf", 48)
        except OSError:
            font = ImageFont.load_default()
        draw.text((60, 150), line, fill="black", font=font)
        png_path = Path(f"/tmp/e2e/scanned-page-{i}.png")
        img.save(png_path)
        png_paths.append(png_path)
    helper = PROJECT_ROOT / "scripts" / "build-scanned-helper.mjs"
    helper.write_text(
        "import { PDFDocument } from 'pdf-lib';\n"
        "import { readFileSync, writeFileSync } from 'node:fs';\n"
        "const doc = await PDFDocument.create();\n"
        "for (const p of ['/tmp/e2e/scanned-page-1.png', '/tmp/e2e/scanned-page-2.png']) {\n"
        "  const png = readFileSync(p);\n"
        "  const img = await doc.embedPng(png);\n"
        "  const page = doc.addPage([img.width, img.height]);\n"
        "  page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });\n"
        "}\n"
        "writeFileSync('/tmp/e2e/scanned.pdf', await doc.save());\n"
        "console.log('wrote /tmp/e2e/scanned.pdf');\n"
    )
    subprocess.run(
        ["node", str(helper)], check=True, cwd=str(PROJECT_ROOT), timeout=120
    )


def main() -> int:
    Path("/tmp/e2e").mkdir(parents=True, exist_ok=True)
    Path("/tmp/chrome-proof").mkdir(parents=True, exist_ok=True)
    build_pdf1()
    build_debug_export()
    build_img_pdf()
    build_scanned_pdf()
    return 0


if __name__ == "__main__":
    sys.exit(main())
