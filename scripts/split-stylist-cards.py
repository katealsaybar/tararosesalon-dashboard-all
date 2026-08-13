"""Rebuild assets/stylist-cards/ from the Canva export, as one PDF per stylist.

Run from the dashboard root after re-exporting the deck:

    python scripts/split-stylist-cards.py

Kate, 2026-08-13: it has to be PDF, not an image, so the words on the card stay
selectable. _source/FINAL STYLIST CARD.pdf keeps its text as text, but it is one
110MB file for all 34 pages, so this splits it into one single-page PDF per
stylist. Single-page matters twice over: iOS Safari only renders the first page of
an inline PDF, and a one-page file has nothing to scroll, so the mouse wheel keeps
scrolling the dashboard instead of being trapped by the viewer.

The weight is all in the photos, embedded at ~535 DPI for print. Capping them at
600px wide and re-encoding as JPEG takes a page from ~3.3MB to well under 1MB and
leaves the text untouched (they still render 5x oversampled at the size the
dashboard shows them). The re-encode matters as much as the resize: Canva stores
some photos as Flate PNG, where a 576x768 costs 444KB against 31KB for the same
picture as JPEG. Only images with an alpha channel are left alone — that is the
90x90 Instagram glyph, which needs its transparency.

Which page belongs to which stylist comes from the sibling .zip: it holds the same
export as per-page PNGs named "NAME - ROLE.png", in page order, so entry index is
page index. That is asserted against each page's own text rather than trusted.
"""
import io
import os
import re
import zipfile

from PIL import Image
from pypdf import PdfReader, PdfWriter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_PDF = os.path.join(ROOT, "_source", "FINAL STYLIST CARD.pdf")
SRC_ZIP = os.path.join(ROOT, "_source", "FINAL STYLIST CARD.zip")
OUT = os.path.join(ROOT, "assets", "stylist-cards")
MAX_PHOTO_W, QUALITY = 600, 80

os.makedirs(OUT, exist_ok=True)

# page index -> stylist, from the zip's own page order
with zipfile.ZipFile(SRC_ZIP) as z:
    pages = {}
    for i, entry in enumerate(z.namelist()):
        m = re.match(r"^([A-Z]+)\s*-\s*.*\.png$", entry)
        if m:  # skips the contents page and the numbered branch dividers
            pages[i] = m.group(1)

reader = PdfReader(SRC_PDF)
written, warnings = [], []

for index, name in sorted(pages.items()):
    page = reader.pages[index]

    # Confirm this really is her page before writing a file under her name.
    flat = re.sub(r"[^A-Z]", "", (page.extract_text() or "").upper())
    if name not in flat:
        warnings.append(f"{name}: not found in the text of page {index + 1}")

    writer = PdfWriter()
    writer.add_page(page)
    for image in writer.pages[0].images:
        img = image.image
        if img.mode in ("RGBA", "LA", "PA") or "transparency" in img.info:
            continue
        if img.width > MAX_PHOTO_W:
            height = round(img.height * MAX_PHOTO_W / img.width)
            img = img.resize((MAX_PHOTO_W, height), Image.LANCZOS)
        image.replace(img.convert("RGB"), quality=QUALITY)

    path = os.path.join(OUT, name.lower() + ".pdf")
    with open(path, "wb") as fh:
        writer.write(fh)
    written.append((name.lower(), os.path.getsize(path)))

for slug, size in sorted(written):
    print(f"{slug:10s} {round(size / 1024):4d} KB")
print(f"\n{len(written)} cards, {sum(s for _, s in written) / 1048576:.1f} MB total")
for w in warnings:
    print(f"WARNING  {w}")
