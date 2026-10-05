"""Beauty induction -> Knowledge Base pages (Kate, 1 Oct 2026).

Reads Tara's v2 2025 Beauty Induction Development Program (Workbooks/Induction Docus,
the Dec 2025 compressed copy, in the private KB_CONTENT folder, never this public repo) and
writes one page per chapter for the beauty-induction section of kb_pages. The PDF
reading, price and duration removal and tidying are build_hair_induction.py's, so the
two sections come out the same way.

What changes on the way, all listed in out/CHANGES-beauty-induction.md:
  - every AED figure and the menu durations are removed (project omit rule)
  - the hair menu, the backwash page, Fratelli (closed), the holistic menu, outside
    partners, QR-code pages and blank forms are left out
  - the beauty book is kept: it is this team's own material (photos of shapes are not
    carried over, only the text)
  - HR pages (visa, salary, leave) carry a "being confirmed" note

    KB_CONTENT=<private kb-content folder> python scripts/kb/build_beauty_induction.py
        -> $KB_CONTENT/out/beauty-induction-pages.json

5 Oct 2026 (Kate): text only, like the hair book (see build_hair_induction.py).
"""
import html as H, json, re
from itertools import groupby
import pymupdf
import build_hair_induction as K

BOOK = "beauty-induction-v2.pdf"
SECTION = "beauty-induction"
HR = K.HR_NOTE
PHOTOS = "The workbook shows photos here (shapes and styles); ask your senior therapist to walk you through them."

CHAPTERS = [
    ([4, 5],        "Welcome to Tara Rose", "Mission, vision and values", None),
    ([6],           "Welcome to Tara Rose", "Your role: beauty therapist", None),
    ([7],           "Welcome to Tara Rose", "Measuring success", None),
    ([91],          "Welcome to Tara Rose", "Our history", None),
    ([8],           "Joining the team", "Visa requirements", HR),
    ([9, 10],       "Joining the team", "Salary, holidays and leave", HR),
    ([11],          "Joining the team", "Staff services and discount", HR),
    ([12, 13],      "Standards", "Dress standard", None),
    ([14],          "Standards", "Standard of conduct", None),
    ([15, 16],      "The client journey", "Booking the appointment", None),
    ([17],          "The client journey", "New clients' guide", None),
    ([18],          "The client journey", "Welcoming the client", None),
    ([20],          "The client journey", "Closing at reception", None),
    ([21, 22],      "The beauty journey", "The beauty journey process", None),
    ([23],          "The beauty journey", "1. Welcome", None),
    ([24],          "The beauty journey", "2. Fact find", None),
    ([25],          "The beauty journey", "3. Recommend", None),
    ([26],          "The beauty journey", "4. Quote and agreement", None),
    ([27],          "The beauty journey", "5. Finishing the service", None),
    ([28],          "The beauty journey", "6. Follow up and referral", None),
    ([58],          "The beauty journey", "The 24-hour guarantee", None),
    ([59],          "The beauty journey", "Rebooking the next appointment", None),
    ([60],          "The beauty journey", "The beauty journey checklist", None),
    ([34],          "Consultation scripts", "Welcoming a new client", None),
    (list(range(35, 42)), "Consultation scripts", "Fact-find questions", None),
    ([42, 43],      "Consultation scripts", "Nail colours and skin concerns", None),
    ([44, 45],      "Consultation scripts", "Lashes and brows", None),
    ([46, 47],      "Consultation scripts", "Home care and cross-selling the hair team", None),
    ([48, 49, 50],  "Consultation scripts", "The beauty plan, packages and water filters", None),
    ([51, 52, 53],  "Consultation scripts", "Quoting before you start", None),
    ([54, 56, 57],  "Consultation scripts", "Agreement and checking she's happy", None),
    ([29, 30, 31],  "Building your clientele", "Top tips on building a clientele", None),
    ([32],          "Building your clientele", "Essential knowledge areas", None),
    ([124],         "Building your clientele", "Building your brand", None),
    ([94, 96],      "The beauty book", "Beauty on demand", None),
    ([97, 98],      "The beauty book", "Hydrafacials", None),
    ([99, 100, 101], "The beauty book", "Nails", PHOTOS),
    ([102, 103, 104], "The beauty book", "Lashes", PHOTOS),
    ([105],         "The beauty book", "Eyebrows", None),
    ([106, 107],    "The beauty book", "Waxing", None),
    ([108, 109],    "The beauty book", "Massage", None),
    ([61, 64],      "Know the menu", "The welcome book and refreshments", None),
    ([73, 74],      "Know the menu", "Waxing, threading and the body", None),
    ([75, 76, 77],  "Know the menu", "Hands and feet, add-ons and extensions", None),
    ([93],          "Know the menu", "Important information for clients", None),
    ([110, 111],    "Know the menu", "Products and services", None),
    ([112],         "Your development", "Goal setting", None),
    ([116, 117],    "Your development", "Beauty development programme", None),
    ([118],         "Your development", "Skills: nails", None),
    ([119],         "Your development", "Skills: facials", None),
    ([120],         "Your development", "Skills: waxing", None),
    ([121],         "Your development", "Skills: massage", None),
    ([122],         "Your development", "Skills: lashes", None),
    ([123],         "Your development", "Skills: brows", None),
    ([125],         "Checklists", "2-week induction checklist", None),
    ([126, 127, 128], "Checklists", "Induction and skill set checklists", None),
]
LEFT_OUT = {1: "cover", 2: "contents", 3: "contents", 19: "at the backwash (hair team's page)", 33: "duplicate",
            55: "duplicate", 62: "welcome book cover", 63: "welcome book cover",
            **{p: "hair menu (the hair team's)" for p in range(65, 73)},
            **{p: "holistic menu (prices, outside practitioners)" for p in range(78, 84)},
            **{p: "exclusive partners (outside offers)" for p in range(84, 89)},
            89: "Fratelli Barbershop (branch closed)", 90: "affiliate QR codes", 92: "social media QR codes",
            95: "beauty book cover", **{p: "goal-setting forms (images, fill-in)" for p in range(113, 116)},
            **{p: "monthly one-to-one forms (blank, fill-in)" for p in range(129, 141)}}

doc = pymupdf.open(K.SRC / BOOK)
out, seen = [], set()
for i, (pns, group, title, note) in enumerate(CHAPTERS):
    parts, last = [], None
    for pn in pns:
        h = K.page_html(doc, pn, title)
        if h and h != last: parts.append(h)
        last = h
    body = "\n".join(parts)
    slug = "beauty-ind-" + K.slugify(title)
    assert slug not in seen, slug; seen.add(slug)
    plain = re.sub(r"\s+", " ", H.unescape(re.sub(r"<[^>]+>", " ", body))).strip()
    out.append({"slug": slug, "section": SECTION, "group_name": group, "sort": i * 10, "title": title,
                "body_html": K.body_of(body), "body_text": plain, "note": note, "owner": "Beauty team"})

used = {p for ps, *_ in CHAPTERS for p in ps}
missing = [p for p in range(1, doc.page_count + 1) if p not in used and p not in LEFT_OUT]
json.dump(out, open(K.OUT / "beauty-induction-pages.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
with open(K.OUT / "CHANGES-beauty-induction.md", "w", encoding="utf-8") as f:
    f.write("# Beauty induction: what changed on the way to the Knowledge Base\n\n"
            f"Source: `{BOOK}` (v2 2025), Tara's Workbooks/Induction Docus. Generated by `build_beauty_induction.py`.\n\n"
            "## Left out (pages)\n\n")
    for why, grp in groupby(sorted(LEFT_OUT.items()), key=lambda kv: kv[1]):
        f.write(f"- {why}: {', '.join(str(p) for p, _ in grp)}\n")
    f.write("\n**To decide (Kate and Tara):** the holistic menu, exclusive partners and the HR pages. "
            "Everything left out can come back as a page.\n\n## Prices and durations removed\n\n")
    for kind, where, txt in K.CHANGES: f.write(f"- {kind} ({where}): {txt}\n")
    f.write("\n## Notes added\n\n")
    for o in out:
        if o["note"]: f.write(f"- **{o['title']}**: {o['note']}\n")
LEAK = r"AED\s*\d|Fratelli|salary package|commission|\b\d+\s*(min|mins|minutes)\b"
leaks = [(o["slug"], re.search(LEAK, o["body_text"], re.I).group(0)) for o in out if re.search(LEAK, o["body_text"], re.I)]
print(f"{len(out)} pages, {sum(len(o['body_html']) for o in out)//1024} KB, {len(K.CHANGES)} removals, unmapped pages: {missing}, leaks: {leaks}")
for o in out: print(f"  {o['group_name']:<26} {o['title']:<46} {len(o['body_text']):>6} chars")
