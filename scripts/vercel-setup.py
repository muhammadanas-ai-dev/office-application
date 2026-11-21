#!/usr/bin/env python3
"""Vercel build setup (Day 29) — regenerate the binary assets
that cannot live in the GitHub snapshot.

The GitHub snapshot push rejects binary files, so the blank
templates, the template DOCX files and the template thumbnails
are NOT in the repo. This script regenerates them on Vercel's
build machine, before `npm run build`:

  1. pip-install python-docx, openpyxl, python-pptx, Pillow.
  2. Run scripts/generate-blank-templates.py
     (blank.docx / blank.xlsx / blank.pptx).
  3. Build the three template DOCX files + preview JSONs by
     importing the builders from scripts/generate-templates.py.
  4. Generate a clean branded PNG thumbnail per template with
     Pillow (LibreOffice is not on Vercel, so the real
     first-page render is not possible here — the thumbnail
     is a tidy card with the template name and its first
     heading, which the gallery shows).

Run from the project root:
    python3 scripts/vercel-setup.py
"""

import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)


def run(cmd, **kwargs):
    print(f"+ {' '.join(cmd)}", flush=True)
    subprocess.run(cmd, check=True, **kwargs)


def main():
    # 1. The Python Office libraries + Pillow. Vercel's build
    # machine is Debian-based, so pip needs --break-system-packages
    # (PEP 668) — the same flag the local recovery uses.
    run(
        [
            sys.executable,
            "-m",
            "pip",
            "install",
            "--quiet",
            "--break-system-packages",
            "python-docx",
            "openpyxl",
            "python-pptx",
            "Pillow",
        ]
    )

    # 2. The blank templates.
    run([sys.executable, os.path.join(HERE, "generate-blank-templates.py")])

    # 3. The template DOCX files + preview JSONs. The generator
    # is generate-templates.py (a hyphen, so it cannot be
    # imported by name) — load it by file location.
    import importlib.util

    spec = importlib.util.spec_from_file_location(
        "generate_templates",
        os.path.join(HERE, "generate-templates.py"),
    )
    gt = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(gt)

    templates = [
        ("resume", gt.build_resume, gt.extract_preview, "docx", "Resume"),
        ("letter", gt.build_letter, gt.extract_preview, "docx", "Letter"),
        ("report", gt.build_report, gt.extract_preview, "docx", "Report"),
        ("proposal", gt.build_proposal, gt.extract_preview, "docx", "Proposal"),
        ("invoice", gt.build_invoice, gt.extract_preview, "docx", "Invoice"),
        ("minutes", gt.build_minutes, gt.extract_preview, "docx", "Minutes"),
        (
            "certificate",
            gt.build_certificate,
            gt.extract_preview,
            "docx",
            "Certificate",
        ),
        ("budget", gt.build_budget, gt.extract_preview_xlsx, "xlsx", "Budget"),
        ("pitch", gt.build_pitch, gt.extract_preview_pptx, "pptx", "Pitch Deck"),
    ]
    docx_dir = os.path.join(ROOT, "src", "lib", "templates")
    png_dir = os.path.join(ROOT, "public", "templates")
    os.makedirs(docx_dir, exist_ok=True)
    os.makedirs(png_dir, exist_ok=True)
    for slug, builder, extractor, ext, title in templates:
        file_path = os.path.join(docx_dir, f"{slug}.{ext}")
        builder(file_path)
        preview = extractor(file_path)
        json_path = os.path.join(docx_dir, f"{slug}.preview.json")
        with open(json_path, "w", encoding="utf-8") as f:
            import json

            json.dump(preview, f, indent=2)
        # 4. A clean branded thumbnail (Pillow, not LibreOffice).
        make_thumbnail(
            os.path.join(png_dir, f"{slug}.png"), title, preview
        )
        print(f"built {slug}.{ext} + {slug}.preview.json + {slug}.png")


def make_thumbnail(png_path, title, preview):
    """A tidy thumbnail card: white page, the Forma blue bar,
    the template name, its headings and a few body lines as
    real text (so the thumbnail reads as a document page and
    is large enough to be a real preview, not a blank card)."""
    from PIL import Image, ImageDraw

    width, height = 600, 800
    img = Image.new("RGB", (width, height), "#ffffff")
    draw = ImageDraw.Draw(img)
    # The Forma blue top bar.
    draw.rectangle([0, 0, width, 56], fill="#3159c9")
    draw.text((24, 18), "Forma Office", fill="#ffffff")
    # The template name.
    draw.text((24, 96), title, fill="#202b3c")
    # The preview's paragraphs: headings in blue, body in grey,
    # wrapped to the card width. This is what makes the thumbnail
    # read as a document page rather than a blank card.
    y = 140
    for entry in preview[:14]:
        text = entry.get("text", "")
        if not text:
            continue
        style = entry.get("style", "")
        colour = "#3159c9" if style.startswith("Heading") else "#667389"
        # Wrap to ~70 characters per line.
        line = text[:70]
        draw.text((24, y), line, fill=colour)
        y += 22
        if y > height - 40:
            break
    # A few grey bars at the bottom (the rest of the page).
    while y < height - 40:
        draw.rectangle([24, y, width - 24, y + 10], fill="#e6ebf2")
        y += 26
    # A thin border.
    draw.rectangle([0, 0, width - 1, height - 1], outline="#dce3ec", width=2)
    img.save(png_path)


if __name__ == "__main__":
    main()
