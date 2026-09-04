"""Read the words off the cards in _source and print them as STYLIST_CARDS entries.

    python scripts/parse-card-text.py                 # every card in both decks
    python scripts/parse-card-text.py HELEN GRACE     # just these

Kate, 2026-08-12: the card layouts belong in the deck, not in hand-written HTML.
What stylist-cards.js holds is the WORDS, so a caption or a WhatsApp reply can be
lifted off a card without opening it - and words that are typed out by hand are
words that drift from the artwork. So they are parsed, never typed, and this is
what does the parsing. Paste its output into stylist-cards.js.

The two decks share one template, which is what makes this possible, but they do
not share sizes - the beauty cards set their body text at 14/15pt where the hair
cards use 12/16pt. So nothing here keys off a font size. It keys off the six
headings, which are the same words on every card:

    SPECIALISES IN | BEST FOR | THE VIBE          the three columns, at one y
    You'll love me if... | What matters most to me... | In my chair you can...

The columns' own x positions give the column boundaries; the three lower headings
give the y bands beneath them. Everything else follows from where a line sits.

Two things the text alone cannot tell you:

  - A BULLET FROM A WRAPPED LINE. Plain text flattens "Blow-dry & Waves: Long and
    / Extra-Long Hair" into two entries or one run-on, and the line spacing is
    identical either way. The deck draws its bullets as 8x8 squares, so a line
    that has one beside it starts a new bullet and a line that doesn't continues
    the one above.
  - WHOSE CARD IT IS. Not every card carries the name as text (Kate's is drawn),
    so the name comes from _source/<deck>.pages.txt, the same map the split uses.

ROLE is taken from staff-profiles.js rather than off the card, because the card
letter-spaces it ("S E N I O R  B E A U T Y  T H E R A P I S T") and the spaces
between letters and between words come through identically.
"""
import json
import os
import re
import sys

import pymupdf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, "_source")
DECKS = ["FINAL STYLIST CARD", "FINAL BEAUTICIAN CARD"]

COLUMNS = ["SPECIALISES IN", "BEST FOR", "THE VIBE"]
BANDS = ["You'll love me if...", "What matters most to me...", "In my chair you can..."]
FOOTER = ("Ready for the Tara Rose", "Confidence Promise?", "BOOK NOW")


def tidy(text):
    """Curly punctuation to straight, and no glyph the JS file cannot hold plainly.

    The soft hyphen (0xAD) is the exception, and is left in place for mend() to close
    up: it is a real hyphen the deck happens to have broken a line at, so dropping it
    gives "detailoriented" and turning it into a hyphen here gives "detail- oriented".
    """
    for a, b in [("’", "'"), ("‘", "'"), ("“", '"'), ("”", '"'),
                 ("–", "-"), ("—", "-"), ("�", "'")]:
        text = text.replace(a, b)
    text = "".join(c for c in text if c == "\n" or 32 <= ord(c) < 127 or c in "&/­")
    return re.sub(r"\s+", " ", text).strip()


def lines_of(page):
    """[(y, x0, text)], fragments that share a baseline joined left to right."""
    rows = []
    for block in page.get_text("dict")["blocks"]:
        if block["type"] != 0:
            continue
        for line in block["lines"]:
            text = tidy("".join(s["text"] for s in line["spans"]))
            if text:
                rows.append([line["bbox"][1], line["bbox"][0], text, line["bbox"][2]])

    merged = []
    for y, x, text, x1 in sorted(rows, key=lambda r: (round(r[0]), r[1])):
        # Same baseline and all but touching: a sentence in the review column comes
        # through as one fragment per word. Three columns also share a baseline, and
        # a gap of a whole column is what tells them apart.
        if merged and abs(merged[-1][0] - y) < 3 and 0 <= x - merged[-1][3] < 40:
            merged[-1][2] += " " + text
            merged[-1][3] = x1
        else:
            merged.append([y, x, text, x1])
    return [row[:3] for row in merged]


def mend(value):
    """Close up the words the deck hyphenated across a line break.

    "detail-oriented" is typed with a plain hyphen and wrapped by Canva at exactly
    that hyphen, so it arrives as two lines and joins back up as "detail- oriented".
    Six cards do it. A dash that is doing a dash's job has a space on BOTH sides, so
    only a hyphen sitting tight against the word before it is closed up.
    """
    if isinstance(value, list):
        return [mend(v) for v in value]
    if isinstance(value, str):
        value = re.sub(r"­\s*", "-", value)
        return re.sub(r"(\w)-\s+(\w)", r"\1-\2", value).strip()
    return value


def find(rows, text):
    for row in rows:
        if row[2] == text:
            return row
    return None


def bullets(rows, page, left, right, top, bottom):
    """The SPECIALISES IN column, split where the deck drew a bullet."""
    dots = [d["rect"] for d in page.get_drawings()
            if d["rect"].width < 15 and d["rect"].height < 15
            and left - 25 < d["rect"].x0 < left + 40 and top < d["rect"].y0 < bottom]

    items = []
    for y, x, text in rows:
        if not (left - 5 <= x < right and top < y < bottom):
            continue
        starts = any(y - 4 < dot.y0 + dot.height / 2 < y + 18 for dot in dots)
        if starts or not items:
            items.append(text)
        else:
            items[-1] += " " + text
    return items


def column(rows, left, right, top, bottom):
    return [r[2] for r in rows if left - 5 <= r[1] < right and top < r[0] < bottom]


def parse(page, name, role):
    rows = lines_of(page)
    heads = [find(rows, c) for c in COLUMNS]
    if any(h is None for h in heads):
        raise ValueError(f"{name}: the three column headings are not all on the page")
    top = heads[0][0] + 15
    edges = [h[1] for h in heads] + [10_000]
    band = [find(rows, b) for b in BANDS]
    if any(b is None for b in band):
        raise ValueError(f"{name}: the three lower headings are not all on the page")
    lower = min(b[0] for b in band)

    # -- the header: name, quote, bio. The quote is the last thing set in Playfair
    # before the body copy starts; a couple of cards have no quote of their own and
    # open straight into the bio, which is why this is taken by position and not by
    # looking for quote marks (Emma's and Robyn's carry none).
    header = [r for r in rows if r[0] < top - 15 and "TA R A R O S E" not in r[2]
              and r[2] != "S A L O N" and not re.fullmatch(r"[A-Z][A-Z \-]+", r[2])]
    header = [r for r in header if r[2].lower() != name.lower()]
    quote, bio = [], []
    fonts = {}
    for block in page.get_text("dict")["blocks"]:
        if block["type"] != 0:
            continue
        for line in block["lines"]:
            fonts[round(line["bbox"][1])] = line["spans"][0]["font"]
    for y, x, text in header:
        (quote if "Playfair" in fonts.get(round(y), "") else bio).append(text)

    # Each of the three lower headings owns everything in the left column between it
    # and the next one; the last one owns the rest of the card, because the footer it
    # would otherwise run into ("Ready for the Tara Rose") sits in the right column
    # and can sit LOWER than the last line of the answer (Grace's does).
    body = {}
    for index, head in enumerate(band):
        end = min([b[0] for b in band if b[0] > head[0]] + [10_000])
        body[BANDS[index]] = " ".join(
            t for t in column(rows, 0, edges[1] - 20, head[0] + 5, end) if t not in FOOTER)

    # -- the review sits to the right of the lower headings, and ends at the name of
    # whoever left it: the only line there that opens with a dash.
    review, by = [], ""
    for y, x, text in rows:
        # Below the first lower heading, not merely near it: Areanne's card leaves a
        # stray "S" from "Switch off" sitting at x=326, inside the review's column.
        if x < edges[1] - 20 or y < lower or text in FOOTER or text.startswith("@"):
            continue
        if re.match(r"^[-*]\s*\w", text):
            by = text.lstrip("-* ").strip()
            break
        if re.fullmatch(r"[\W_]+", text):  # the row of stars on the beauty cards
            continue
        review.append(text)

    entry = {
        "role": role,
        "quote": " ".join(quote).strip('"'),
        "bio": " ".join(bio),
        "specialises": bullets(rows, page, edges[0], edges[1] - 20, top, lower - 200),
        "bestFor": " ".join(column(rows, edges[1], edges[2] - 20, top, lower - 200)).strip('"'),
        "vibe": column(rows, edges[2], edges[3], top, lower - 200),
        "loveMeIf": body[BANDS[0]],
        "mattersMost": body[BANDS[1]],
        "inMyChair": body[BANDS[2]],
        "review": " ".join(review).strip('"'),
        "reviewBy": by,
    }
    works = len([f for f in os.listdir(os.path.join(ROOT, "assets", "staff", "work"))
                 if f.lower().startswith(name.lower().replace(" ", "-") + "-")])
    if works:
        entry["works"] = works
    return {k: mend(v) for k, v in entry.items()}


def roles():
    src = open(os.path.join(ROOT, "staff-profiles.js"), encoding="utf-8").read()
    return dict(re.findall(r"'([A-Z ]+)':\s*\{[^}]*?role:\s*'([^']+)'", src))


def main(wanted):
    role_of = roles()
    out = {}
    for deck in DECKS:
        doc = pymupdf.open(os.path.join(SOURCE, deck + ".pdf"))
        with open(os.path.join(SOURCE, deck + ".pages.txt"), encoding="utf-8") as fh:
            for line in fh:
                line = line.split("#", 1)[0].strip()
                if not line:
                    continue
                number, name = line.split(None, 1)
                name = name.strip()
                if wanted and name not in wanted:
                    continue
                out[name] = parse(doc[int(number) - 1], name, role_of.get(name, ""))

    for name, entry in out.items():
        print(f' "{name}": ' + json.dumps(entry, indent=1, ensure_ascii=False)
              .replace("\n", "\n ") + ",")


main([a.upper() for a in sys.argv[1:]])
