"""Hair inductions -> Knowledge Base pages (Kate, 1 Oct 2026).

Reads Tara's two 2025 induction workbooks (Workbooks/Induction Docus on her Drive,
the Dec 2025 compressed copies). This repository is public, so the script holds no
workbook text: the PDFs, the page JSON and the page images live in a private folder
named by KB_CONTENT (its src/ and out/), never here:

  hairstylist-induction-v10.pdf   v10 2025 - Hairstylist Induction Development Program
  assistant-induction-v3.pdf      v3 2025 - Assistant Induction Development Program

and writes one page per chapter for the hair-induction section of kb_pages. The two
books share most of their chapters word for word, so a shared chapter is one page
(taken from the stylist book) and only the chapters that differ get a page each.

What changes on the way, all listed in out/CHANGES-hair-induction.md:
  - price lists and every AED figure are removed (project omit rule; 2025 prices are
    stale, the 2026 price list is the authority)
  - the Fratelli Barbershop page is left out (the branch is closed)
  - the beauty book, holistic menu, exclusive partners, QR-code and blank form pages
    are left out for now; they are listed for Kate and Tara to decide
  - HR pages (visa, salary, leave) carry a "being confirmed" note

    KB_CONTENT=<private kb-content folder> python scripts/kb/build_hair_induction.py
        -> $KB_CONTENT/out/hair-induction-pages.json

The JSON goes into kb_pages. 5 Oct 2026 (Kate): text only. The workbook pictures
(Workbook | Text on Team Home) are gone; every page is one document in the house style,
downloadable as a PDF. A question the workbook wrapped onto a second line is joined
back on (the second line used to be dropped as a capitals label: "...SERVICES IN THE"
lost "PAST?"), and the workbook's furniture ("N O T E S" boxes, "MORE INFO 86", the
loose step numbers of a drawn diagram) is left out.
"""
import html as H, json, re, sys
from pathlib import Path
import pymupdf

import os
HERE = Path(os.environ.get("KB_CONTENT") or sys.exit("Set KB_CONTENT to the private kb-content folder."))
SRC, OUT = HERE / "src", HERE / "out"
SECTION = "hair-induction"
STY, AST = "hairstylist-induction-v10.pdf", "assistant-induction-v3.pdf"
CHANGES = []

HR_NOTE = ("Being confirmed: these HR steps and policies are from the 2025 workbook. "
           "Check anything you are unsure of with HR or your coordinator.")

# (book, pages, group, title, note). Page numbers are the PDF's own (1 = cover).
CHAPTERS = [
    (STY, [5, 6],       "Welcome to Tara Rose", "Mission, vision and values", None),
    (STY, [7],          "Welcome to Tara Rose", "Your role: hairstylist", None),
    (AST, [6],          "Welcome to Tara Rose", "Your role: assistant", None),
    (STY, [8],          "Welcome to Tara Rose", "Measuring success", None),
    (STY, [99],         "Welcome to Tara Rose", "Our history", None),
    (STY, [9],          "Joining the team", "Visa requirements", HR_NOTE),
    (STY, [10, 11],     "Joining the team", "Salary, holidays and leave", HR_NOTE),
    (STY, [12],         "Joining the team", "Staff services and discount", HR_NOTE),
    (STY, [13, 14],     "Standards", "Dress standard", None),
    (STY, [15],         "Standards", "Standard of conduct", None),
    (STY, [16, 18],     "The client journey", "Booking the appointment", None),
    (STY, [21],         "The client journey", "New clients' guide", None),
    (STY, [22],         "The client journey", "Welcoming the client", None),
    (STY, [23],         "The client journey", "At the backwash and the hair section", None),
    (STY, [25],         "The client journey", "Closing at reception", None),
    (STY, [26, 27],     "The hair journey", "The hair journey process", None),
    (STY, [29],         "The hair journey", "1. Welcome", None),
    (STY, [31],         "The hair journey", "2. Fact find", None),
    (STY, [33],         "The hair journey", "3. Recommend", None),
    (STY, [35],         "The hair journey", "4. Quote and agreement", None),
    (STY, [37],         "The hair journey", "5. Finishing the service", None),
    (STY, [39],         "The hair journey", "6. Follow up and referral", None),
    (STY, [66],         "The hair journey", "The 7-day guarantee", None),
    (STY, [67, 68],     "The hair journey", "The hair journey checklist", None),
    (STY, [46],         "Consultation scripts", "Welcoming a new client", None),
    (STY, list(range(47, 56)), "Consultation scripts", "Fact-find questions", None),
    (STY, [56, 57, 58], "Consultation scripts", "Cut, colour, tone and condition", None),
    (STY, [59, 60],     "Consultation scripts", "Home care and cross-selling", None),
    (STY, [61, 62],     "Consultation scripts", "The hair plan and water filters", None),
    (STY, [63, 64, 65], "Consultation scripts", "Quoting, agreement and checking she's happy", None),
    (STY, [40, 42, 43], "Building your clientele", "Top tips on building a clientele", None),
    (STY, [44],         "Building your clientele", "Essential knowledge areas", None),
    (STY, [140],        "Building your clientele", "Building your brand", None),
    (STY, [69, 72],     "Know the menu", "The welcome book and refreshments", None),
    (STY, [73, 74],     "Know the menu", "Cuts, colour, extensions and keratin", None),
    (STY, [75, 76, 77], "Know the menu", "Hair treatments", None),
    (STY, [78, 79, 80], "Know the menu", "Scalp, curly hair and Beauty Potion", None),
    (STY, [101],        "Know the menu", "Important information for clients", None),
    (STY, [118, 119],   "Know the menu", "Products and services", None),
    (STY, [126],        "Your development", "Goal setting", None),
    (STY, [130, 131],   "Your development", "Stylist development programme", None),
    (STY, [132],        "Your development", "Stylist skills 1-2: blow-dry and smoothing", None),
    (STY, [133, 134],   "Your development", "Stylist skills 3: treatments", None),
    (STY, [135, 136],   "Your development", "Stylist skills 4: theory", None),
    (STY, [137],        "Your development", "Stylist skills 5: cutting", None),
    (STY, [138],        "Your development", "Stylist skills 6: colour", None),
    (STY, [139],        "Your development", "Stylist skills 7: advanced", None),
    (AST, [118, 119],   "Your development", "Assistant development programme", None),
    (AST, [120, 121, 122], "Your development", "Assistant level 1: backwash and blast drying", None),
    (AST, [123, 124, 125], "Your development", "Assistant level 2: blow-dry and retail knowledge", None),
    (AST, [126, 127, 128], "Your development", "Assistant level 3: on the floor and rebooking", None),
    (AST, [129, 130, 131], "Your development", "Assistant theory: colour, scalp, skin tone", None),
    (AST, [132, 133],   "Your development", "Assistant level 4: classic balayage", None),
    (AST, [134, 135],   "Your development", "Head assistant: roles and responsibilities", None),
    (STY, [141],        "Checklists", "2-week induction checklist", None),
    (STY, [142, 143, 144], "Checklists", "Induction and skill set checklists", None),
]
LEFT_OUT = {
    STY: {1: "cover", 2: "cover", 3: "contents", 4: "contents", 17: "duplicate", 19: "duplicate", 20: "duplicate",
          24: "duplicate", 28: "duplicate", 30: "duplicate", 32: "duplicate", 34: "duplicate", 36: "duplicate",
          38: "duplicate", 41: "duplicate", 45: "duplicate", 70: "welcome book cover", 71: "welcome book cover",
          **{p: "beauty menu (prices; belongs with the beauty team)" for p in range(81, 86)},
          **{p: "holistic menu (prices, outside practitioners)" for p in range(86, 92)},
          **{p: "exclusive partners (outside offers)" for p in range(92, 97)},
          97: "Fratelli Barbershop (branch closed)", 98: "affiliate QR codes", 100: "social media QR codes",
          **{p: "beauty book (beauty team material)" for p in range(102, 118)},
          **{p: "price lists by level (pricing omitted; 2025 prices stale)" for p in range(120, 126)},
          **{p: "goal-setting forms (images, fill-in)" for p in range(127, 130)},
          **{p: "monthly one-to-one forms (blank, fill-in)" for p in range(145, 169)}},
}

def sz(b): return max((s["size"] for l in b["lines"] for s in l["spans"]), default=0)
def btext(b):
    out = []
    for l in b["lines"]:
        t = "".join(s["text"] for s in l["spans"])
        out.append(t)
    return out
def bold(b): return all("Bold" in s["font"] for l in b["lines"] for s in l["spans"] if s["text"].strip())

def ordered_blocks(page):
    """Reading order: full-width blocks top to bottom; between two of them, the left
    column then the right one (the books are two-column in places)."""
    W = page.rect.width
    bs = [b for b in page.get_text("dict")["blocks"] if b["type"] == 0 and "".join(btext(b)).strip()]
    bs = [b for b in bs if not (b["bbox"][1] > page.rect.height - 50 and re.fullmatch(r"\s*\d+\s*", "".join(btext(b))))]
    full = lambda b: (b["bbox"][2] - b["bbox"][0]) > W * 0.55 or b["bbox"][0] < W * 0.4 < b["bbox"][2] and b["bbox"][2] > W * 0.6
    bs.sort(key=lambda b: b["bbox"][1])
    out, band = [], []
    def flush():
        band.sort(key=lambda b: (b["bbox"][0] >= W * 0.45, b["bbox"][1]))
        out.extend(band); band.clear()
    for b in bs:
        if full(b): flush(); out.append(b)
        else: band.append(b)
    flush()
    return out

def para(lines):
    # join wrapped lines; keep bullets ("- ", "●") as their own items
    items, cur = [], ""
    for raw in lines:
        t = raw.strip()
        if not t: continue
        if re.match(r"^([-–•●]|\d+\.)\s", t) and cur:
            items.append(cur); cur = t
        else:
            cur = (cur + ("" if cur.endswith("-") and not cur.endswith(" -") else " ") + t).strip() if cur else t
            if cur.endswith("-") and not cur.endswith(" -"): cur = cur  # hyphen split: joined next line
    if cur: items.append(cur)
    return [re.sub(r"\s+", " ", i.replace("- ", "-", 0)) for i in items]

# A bullet the workbook wrapped: "- WHAT HAS BEEN YOUR EXPERIENCE ... IN THE" then, as
# its own text block, "PAST?". The block is the rest of the bullet's sentence.
FURNITURE = re.compile(r"(?i)^(more info \d+|\d{1,2})$")
# Letter-spaced labels: the notes boxes and blank form lines go, the rest are headings.
SPACED = {"NOTES": None, "NAMEDATESIGNATURE": None, "NAMEDATE": None, "SIGNATURE": None, "FORSALONSTAFF": "For salon staff",
          "ESSENTIALKNOWLEDGEAREAS": None, "ASSISTANTDEVELOPMENTPROGRAM": None}   # the chapter's own title, already the page title
def wrapped_on(html, txt):
    t = re.sub(r"\s+", " ", txt).strip()
    if not t or FURNITURE.match(t):
        return bool(t)
    if re.fullmatch(r"(?:\w\s){2,}\w", t):
        word = t.replace(" ", "").upper()
        if word not in SPACED: print("  letter-spaced label kept as it is:", t, file=sys.stderr); return False
        if SPACED[word]: html.append(f"<h4>{SPACED[word]}</h4>")
        return True
    if not html or not html[-1].startswith("<ul>") or re.match(r"^([-–•●]|\d+\.)\s", t) or len(t) > 160:
        return False
    m = re.search(r"<li>([^<]*)</li></ul>$", html[-1])
    if not m: return False
    last = H.unescape(m.group(1))
    if re.search(r"[?.!:)\]”\"]$", last) or not (last.isupper() or t[0].islower()):
        return False
    joined = sentence((last + " " + t).upper()) if last.isupper() else last + " " + t
    html[-1] = html[-1][:m.start(1)] + H.escape(joined) + "</li></ul>"
    return True

PRICE = re.compile(r"AED\s*[\d,.]+(\s*[-–/]\s*(AED\s*)?[\d,.]+)?", re.I)

def page_html(doc, pn, title):
    page = doc[pn - 1]
    # Real tables (the visa steps, the checklists) come out as tables; their text is
    # then left out of the running blocks.
    tables, boxes = [], []
    try:
        for tb in page.find_tables().tables:
            rows = [[re.sub(r"\s+", " ", c or "").strip() for c in r] for r in tb.extract()]
            rows = [[PRICE.sub("", c).strip() for c in r] for r in rows if any(c for c in r)]
            if len(rows) < 2 or max(len(r) for r in rows) < 2: continue
            # Menu pages are drawn in boxes that read as tables; a real one has a
            # header row of short labels.
            if sum(1 for c in rows[0] if c) < 2 or any(len(c) > 160 for r in rows for c in r): continue
            boxes.append(pymupdf.Rect(tb.bbox))
            head, *rest = rows
            tables.append("<table><thead><tr>" + "".join(f"<th>{H.escape(c)}</th>" for c in head) + "</tr></thead><tbody>" +
                          "".join("<tr>" + "".join(f"<td>{H.escape(c)}</td>" for c in r) + "</tr>" for r in rest) + "</tbody></table>")
    except Exception as e:
        print("tables failed on", pn, e, file=sys.stderr)
    bs = [b for b in ordered_blocks(page) if not any(pymupdf.Rect(b["bbox"]).intersects(r) for r in boxes)]
    if not bs and not tables: return ""
    sizes = sorted(sz(b) for b in bs) or [11]
    body = sizes[len(sizes) // 2]
    html = []
    for b in bs:
        lines = btext(b); s = sz(b); txt = " ".join(l.strip() for l in lines).strip()
        if wrapped_on(html, txt):
            continue
        if PRICE.search(txt):
            CHANGES.append(("removed price", f"{doc.name.split('/')[-1]} p{pn}", PRICE.findall(txt) and txt[:140]))
            txt2 = PRICE.sub("", txt).strip(" |·-")
            if not re.search(r"[A-Za-z]{3}", txt2): continue
            lines = [PRICE.sub("", l) for l in lines]
            txt = txt2
        if s >= body * 1.25 and len(txt) < 90 and (s >= 15 or bold(b)):
            t = re.sub(r"\s+", " ", txt)
            if t.lower().replace(" ", "") == title.lower().replace(" ", ""): continue
            html.append(f"<h3>{H.escape(t.title() if t.isupper() else t)}</h3>")
        elif bold(b) and len(txt) < 90 and len(lines) <= 2:
            t = re.sub(r"\s+", " ", txt)
            html.append(f"<h4>{H.escape(t.title() if t.isupper() and len(t) > 3 else t)}</h4>")
        else:
            items = para(lines)
            bullets = [i for i in items if re.match(r"^[-–•●]\s", i)]
            if bullets and len(bullets) >= len(items) - 1:
                pre = [i for i in items if i not in bullets]
                html += [f"<p>{H.escape(p)}</p>" for p in pre]
                html.append("<ul>" + "".join(f"<li>{H.escape(re.sub(r'^[-–•●]\s*', '', i))}</li>" for i in bullets) + "</ul>")
            else:
                for i in items:
                    html.append(f"<p>{H.escape(i)}</p>")
    out = "\n".join(tidy(tables + html))
    # Capitals list items in sentence case too, and one-item lists in a row as one list.
    out = re.sub(r"<li>([^<]+)</li>", lambda m: "<li>" + H.escape(sentence(H.unescape(m.group(1)))) + "</li>", out)
    # "IMPORTANCE OF TRUST" printed as a bullet with its paragraph run into it: a subheading.
    out = re.sub(r"<ul><li>(Importance of trust)\s*([^<]*)</li></ul>",
                 lambda m: f"<h4>{m.group(1)}</h4>" + (f"<p>{m.group(2)[0].upper() + m.group(2)[1:]}</p>" if m.group(2) else ""), out)
    out = re.sub(r"<h4>[-–•]\s*", "<h4>", out)
    out = re.sub(r":</h4>", "</h4>", out)
    # Lower-case "i" and quotes that open in lower case, left by the capitals styling.
    out = re.sub(r"(^|[\s\"“‘(;>]|&quot;)i(?=[\s’',!?])", r"\1I", out)
    out = re.sub(r"(<p>(?:&quot;|“))([a-z])", lambda m: m.group(1) + m.group(2).upper(), out)
    # British English (brand rule): the season is autumn. "Natural fall" in cutting stays.
    out = out.replace("for the fall season", "for autumn")
    return re.sub(r"</ul>\n<ul>", "", out)

# Menu pages are price grids. With the prices gone their size labels ("Short:",
# "Long/Thick:") and durations ("30 MIN", "1 HR") stand alone; both go (durations are
# omitted by the project rule too). Capitals-only copy reads as shouting on a phone, so
# it becomes sentence case; a heading said twice in a row is said once.
DUR = re.compile(r"(?i)^\s*([a-z/ ]+:\s*)?\d+(\.\d+)?\s*(min|mins|minutes|hr|hrs|hour|hours)\b\.?\s*$")
SIZE = re.compile(r"(?i)^\s*(short|medium|long|thick|fine|extra long)(/[a-z]+)?:?\s*$")
NAMES = ["Tara Rose", "Olaplex", "R2", "Caviar", "Alterna", "Authentic Beauty Concept", "Schwarzkopf", "Google", "Instagram",
         "Facebook", "UAE", "Abu Dhabi", "Dubai", "Khalifa City A", "Saadiyat", "Motor City", "Al Quoz", "MOHRE", "ILOE"]
def sentence(t):
    if not (t.isupper() and len(t) > 12): return t
    t = t.lower()
    t = re.sub(r"(^|[.!?:]\s+)([a-z])", lambda m: m.group(1) + m.group(2).upper(), t)
    for w in NAMES: t = re.sub(r"\b" + re.escape(w.lower()) + r"\b", w, t)
    return t
def tidy(html):
    out = []
    for h in html:
        m = re.match(r"<(h3|h4|p)>(.*)</\1>$", h, re.S)
        if m:
            tag, inner = m.groups(); t = H.unescape(inner).strip()
            if SIZE.match(t) or re.fullmatch(r"(?i)(hair )?treatment menu|menu|a s s i s t a n t d e v e l o p m e n t p r o g r a m|the hair|caviar vegan concern|please scan the qr code.*|scan me", t):
                continue
            # leftovers of a price grid: "From from from", and page labels like "THE BODY"
            if tag == "p" and (re.fullmatch(r"(?i)(from\s*)+", t) or (t.isupper() and len(t.split()) <= 2)):
                continue
            if DUR.match(t):
                CHANGES.append(("removed duration", "menu", t)); continue
            t = re.sub(r"(?i)\s*\b\d+\s*(min|mins|minutes|hr|hrs)\b", "", t) if re.search(r"(?i)^(short|medium|long)", t) else t
            # Service lengths written into a menu line, "(60minutes)" or "20 min.". A rule's
            # own timing ("no longer than 5 minutes", "for 24 hours") has neither form.
            t2 = re.sub(r"(?i)\s*\(\s*\d+\s*minutes?\s*\)|\s*\b\d+\s*min\.", "", t).strip()
            if t2 != t: CHANGES.append(("removed duration", "menu", t[:120])); t = t2
            if not t: continue
            t = re.sub(r"([’'])T(s?)\b", r"\1t\2", t)   # Title Case turned Don’ts into Don’Ts
            h = f"<{tag}>{H.escape(sentence(t))}</{tag}>"
        if out and out[-1] == h: continue
        out.append(h)
    return out

def slugify(s): return re.sub(r"[^a-z0-9]+", "-", s.lower().replace("&", "and")).strip("-")

# ── The workbook's own pages, as pictures (Kate, 1 Oct 2026; retired 5 Oct 2026) ──
# Kept so the images could be redrawn if ever wanted; nothing calls sheet() now.
# Team Home shows each chapter as Tara designed it, with the text version a tap away.
# Prices and service lengths are covered before the page is drawn, in the colour
# around them so the box doesn't read as a hole. The JPEGs go to the private
# kb-sheets bucket as <section>/<file>, never into git.
SHEETS = OUT / "sheets"
# Menu-style lengths only: "30 min.", "45 MIN", "(60minutes)". A rule written in words
# ("no longer than 5 minutes") keeps its "minutes" and is left alone.
COVER = re.compile(r"(?i)^(\(?\d+(minutes?|mins?|hrs?)\)?\.?|min\.?|mins?|hrs?\.?)$")
def redact(page):
    words = page.get_text("words")
    hits = []
    for i, w in enumerate(words):
        t = w[4]
        if re.fullmatch(r"(?i)aed[\d,.]*", t):
            r = pymupdf.Rect(w[:4])
            for v in words[i + 1:i + 4]:           # the figure after it, on the same line
                if v[5:7] == w[5:7] and re.fullmatch(r"[\d,.\-–/]+", v[4]): r |= pymupdf.Rect(v[:4])
                else: break
            hits.append(r)
        elif COVER.match(t) and (re.match(r"\(?\d", t) or (i and re.fullmatch(r"\d+", words[i - 1][4]) and words[i - 1][5:7] == w[5:7])):
            r = pymupdf.Rect(w[:4])
            if not re.match(r"\(?\d", t): r |= pymupdf.Rect(words[i - 1][:4])
            hits.append(r)
    for r in hits:
        r = r + (-1.5, -1.5, 1.5, 1.5)
        # the most common colour on a ring just outside the box is the background
        pix = page.get_pixmap(clip=r + (-4, -4, 4, 4), dpi=72)
        ring = [pix.pixel(x, y) for x in range(pix.width) for y in (0, pix.height - 1)] + \
               [pix.pixel(x, y) for y in range(pix.height) for x in (0, pix.width - 1)]
        c = max(set(ring), key=ring.count) if ring else (255, 255, 255)
        page.add_redact_annot(r, fill=tuple(x / 255 for x in c[:3]))
    if hits: page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE, graphics=pymupdf.PDF_REDACT_LINE_ART_NONE)
    return len(hits)

def sheet(doc, tag, pn, section):
    """Draw one workbook page (prices covered) and return its path in the bucket."""
    page = doc[pn - 1]
    n = redact(page)
    if n: CHANGES.append(("covered on the page image", f"{tag} p{pn}", f"{n} price or duration figure(s)"))
    path = f"{section}/{tag}-p{pn:03d}.jpg"
    (SHEETS / section).mkdir(parents=True, exist_ok=True)
    (SHEETS / path).write_bytes(page.get_pixmap(matrix=pymupdf.Matrix(1.8, 1.8)).tobytes("jpeg", jpg_quality=72))
    return path

def body_of(text_html):
    """The page body (5 Oct 2026): the text alone, one document for screen and PDF."""
    return text_html

if __name__ == "__main__":
    docs = {STY: pymupdf.open(SRC / STY), AST: pymupdf.open(SRC / AST)}
    out, seen = [], set()
    for i, (book, pns, group, title, note) in enumerate(CHAPTERS):
        parts, last = [], None
        for pn in pns:
            h = page_html(docs[book], pn, title)
            if h and h != last: parts.append(h)
            last = h
        body = "\n".join(parts)
        slug = "hair-ind-" + slugify(title)
        assert slug not in seen, slug; seen.add(slug)
        plain = re.sub(r"\s+", " ", H.unescape(re.sub(r"<[^>]+>", " ", body))).strip()
        out.append({"slug": slug, "section": SECTION, "group_name": group, "sort": i * 10, "title": title,
                    "body_html": body_of(body), "body_text": plain, "note": note,
                    "owner": "Hair team" if book == STY else "Hair team (assistants)"})

    used = {(b, p) for b, ps, *_ in CHAPTERS for p in ps}
    missing = [p for p in range(1, docs[STY].page_count + 1) if (STY, p) not in used and p not in LEFT_OUT[STY]]
    OUT.mkdir(exist_ok=True)
    json.dump(out, open(OUT / "hair-induction-pages.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    with open(OUT / "CHANGES-hair-induction.md", "w", encoding="utf-8") as f:
        f.write("# Hair inductions: what changed on the way to the Knowledge Base\n\n"
                f"Sources: `{STY}` (v10 2025) and `{AST}` (v3 2025), Tara's Workbooks/Induction Docus. "
                "Generated by `build_hair_induction.py`.\n\n"
                "The two books share most chapters word for word; shared chapters are one page, taken from the "
                "stylist book. The assistant book adds its own role page and its four-level development programme.\n\n"
                "## Left out of the stylist book (pages)\n\n")
        from itertools import groupby
        for why, grp in groupby(sorted(LEFT_OUT[STY].items()), key=lambda kv: kv[1]):
            ps = [p for p, _ in grp]; f.write(f"- {why}: {', '.join(map(str, ps))}\n")
        f.write("\n**To decide (Kate and Tara):** the beauty book, holistic menu, exclusive partners and the HR pages. "
                "Everything left out can come back as a page.\n\n## Prices removed\n\n")
        for kind, where, txt in CHANGES: f.write(f"- {where}: {txt}\n")
        f.write("\n## Notes added\n\n")
        for o in out:
            if o["note"]: f.write(f"- **{o['title']}**: {o['note']}\n")
    LEAK = r"AED\s*\d|Fratelli|salary package|commission"
    leaks = [(o["slug"], re.search(LEAK, o["body_text"], re.I).group(0)) for o in out if re.search(LEAK, o["body_text"], re.I)]
    print(f"{len(out)} pages, {sum(len(o['body_html']) for o in out)//1024} KB, {len(CHANGES)} price blocks, unmapped stylist pages: {missing}, leaks: {leaks}")
    for o in out: print(f"  {o['group_name']:<26} {o['title']:<50} {len(o['body_text']):>6} chars")
