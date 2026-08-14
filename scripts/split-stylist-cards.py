"""Rebuild assets/stylist-cards/ from the Canva export, as one PDF per stylist.

Run from the dashboard root after re-exporting the deck:

    python scripts/split-stylist-cards.py

or, when only a single card has been redrawn (see SINGLE-CARD UPDATES below):

    python scripts/split-stylist-cards.py --updates-only

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
import sys
import zipfile

from PIL import Image
from pypdf import PdfReader, PdfWriter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_PDF = os.path.join(ROOT, "_source", "FINAL STYLIST CARD.pdf")
SRC_ZIP = os.path.join(ROOT, "_source", "FINAL STYLIST CARD.zip")
UPDATES = os.path.join(ROOT, "_source", "card-updates")
OUT = os.path.join(ROOT, "assets", "stylist-cards")
MAX_PHOTO_W, QUALITY = 600, 80

os.makedirs(OUT, exist_ok=True)

written, warnings = [], []


def squeeze(page, name, source):
    """One page as its own single-page PDF, photos capped and re-encoded.

    `name` is only used to confirm the page really is hers before a file is written
    under her name — a mis-ordered export would otherwise put one stylist's card
    behind another's face, which is the one failure here nobody would spot.
    """
    flat = re.sub(r"[^A-Z]", "", (page.extract_text() or "").upper())
    if name not in flat:
        warnings.append(f"{name}: not found in the text of {source}")

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
    return writer


def emit(name, writer):
    path = os.path.join(OUT, name.lower() + ".pdf")
    with open(path, "wb") as fh:
        writer.write(fh)
    written.append((name.lower(), os.path.getsize(path)))


def split_deck():
    # page index -> stylist, from the zip's own page order
    with zipfile.ZipFile(SRC_ZIP) as z:
        pages = {}
        for i, entry in enumerate(z.namelist()):
            m = re.match(r"^([A-Z]+)\s*-\s*.*\.png$", entry)
            if m:  # skips the contents page and the numbered branch dividers
                pages[i] = m.group(1)

    reader = PdfReader(SRC_PDF)
    for index, name in sorted(pages.items()):
        emit(name, squeeze(reader.pages[index], name, f"page {index + 1}"))


# ── SINGLE-CARD UPDATES ──────────────────────────────
# Kate, 2026-08-14: Katie's card was redrawn on its own — "Precision cutting" added
# to SPECIALISES IN — and arrived as one A3 PDF rather than a new 34-page deck.
#
# So any single-page PDF dropped in _source/card-updates/, named the way the zip
# names its pages ("KATIE - SENIOR STYLIST.pdf"), is applied AFTER the deck split
# and overwrites that stylist's card. The ordering is the whole point: the deck is
# still the bulk source, but it is now the OLDER one, and without this pass the next
# full re-export would quietly revert every card that had been updated since.
#
# It goes through the same photo squeeze as the deck — Katie's arrived at 4.2MB
# against ~800KB for the card it replaces, all of it photo weight.
def apply_updates():
    if not os.path.isdir(UPDATES):
        return
    for entry in sorted(os.listdir(UPDATES)):
        m = re.match(r"^([A-Z]+)\s*-\s*.*\.pdf$", entry)
        if not m:
            continue
        name = m.group(1)
        reader = PdfReader(os.path.join(UPDATES, entry))
        if len(reader.pages) != 1:
            warnings.append(f"{name}: {entry} has {len(reader.pages)} pages, expected 1")
            continue
        emit(name, squeeze(reader.pages[0], name, entry))


updates_only = "--updates-only" in sys.argv
if not updates_only:
    split_deck()
apply_updates()

for slug, size in sorted(written):
    print(f"{slug:10s} {round(size / 1024):4d} KB")
print(f"\n{len(written)} card{'' if len(written) == 1 else 's'} written, "
      f"{sum(s for _, s in written) / 1048576:.1f} MB total")
for w in warnings:
    print(f"WARNING  {w}")
