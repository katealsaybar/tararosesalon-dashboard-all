"""Front Desk + Call Centre -> Knowledge Base pages (Kate, 5 Oct 2026).

Four Team Home sections, built the same way as the Hair and Beauty converters:

  front-desk             Front Desk & Policies               (owner: Front Desk team)
  front-desk-induction   Front Desk Induction & Onboarding   (owner: Front Desk team)
  call-centre            Call Centre Scripts & Policies      (owner: Call Centre team)
  call-centre-induction  Call Centre Induction & Onboarding  (owner: Call Centre team)

Sources, all copied to Downloads/-/front-desk-src/ on 5 Oct 2026 (Kate's rule: NEWEST WINS,
the rest is flagged). Drive files the connector could only read as text were saved there as
"(drive text, <modified date>).txt".

  TR_Front Desk Operations Manual 2.docx             Jan 2025  main Front Desk structure
  TRS_Front_Desk_Manual_Open_Items.pdf               Jul 2026  the 6 open decisions
  TRS Booking & Deposit Policy - STAFF GUIDE v3      28 Sep 2026  THE deposit authority
  TRS Team Memo / Existing Client Deposit policy     28 / 25 Sep 2026
  TaraRoseSalon_Cancellation_Policy.docx             May 2026  cancellation authority
  Phases of appointment confirmation (drive text)    Nov 2025
  SERVICE BRIEFS RECEPTION .docx                     Oct 2025  services + stylist levels (newer than the manual)
  Reception Levelling (drive text)                   Oct 2025
  Client Advisor Course Workbook (drive text)        2022 course, Drive copy Mar 2026
  Reception Call Centre Training Doc.docx            May 2026  call centre main source
  reception-and-call-centre-training-guide.pdf       Aug 2025  older PDF; only the parts the May doc lacks
  Revised Flows.docx, general inquiries.docx,
  SUGGESTIONS FOR MESSAGES REGARDING DEPOSITS.docx,
  Follow_Up_Call_Procedure.docx                      May 2025  Emma's scripts
  Tara Rose Salon - Whatsapp Replies - 2026.pdf      Jul 2026  image-only; transcribed into front-desk-text.json

What changes on the way, all listed in out/CHANGES-front-desk.md:
  - prices, AED figures, service durations and KPI numbers removed (project omit rule)
  - booking-platform click paths become "the booking system" + a page note
  - client-facing script wording passes the trs-brand-guardian banned list (minimal edits)
  - old deposit rules everywhere are replaced by the Sep 2026 Staff Guide
  - Fratelli (closed) and Bahrain (separate) dropped; no staff phone numbers or client names

The dashboard repo is public, so this file holds code only (moved here 6 Oct 2026). All page
text (scripts, transcriptions, brand fixes) is in front-desk-text.json beside the sources,
as TXT[n]; outputs go to the private kb-content folder:

    KB_CONTENT=<path to claude-cowork-build/kb-content> py scripts/kb/build_front_desk.py
      -> $KB_CONTENT/out/front-desk-pages.json + CHANGES-front-desk.md + front-desk-preview.html
"""
import html as H, json, os, re, sys
from pathlib import Path
import mammoth, pymupdf

SRC = Path(r"C:/Users/user/Downloads/-/front-desk-src")
HERE = Path(os.environ.get("KB_CONTENT") or sys.exit("Set KB_CONTENT to the private kb-content folder."))
OUT = HERE / "out"

# The page text lives outside the repo (the dashboard repo is public): front-desk-text.json
# next to the sources, written by the one-off split on 6 Oct 2026.
TXT = json.load(open(SRC / "front-desk-text.json", encoding="utf-8"))
SECTIONS = {
    "front-desk": ("Front Desk & Policies", "Front Desk team"),
    "front-desk-induction": (TXT[0], "Front Desk team"),
    "call-centre": (TXT[1], "Call Centre team"),
    "call-centre-induction": (TXT[2], "Call Centre team"),
}
CHANGES, SCRIPT_CHANGES, CONFIRM = [], [], []
def change(kind, before, after=""): CHANGES.append((kind, before, after))
def text(s): return H.unescape(re.sub(r"<[^>]+>", "", s)).strip()
def esc(s): return H.escape(s, quote=False)
letters = lambda s: re.sub(r"[^a-z0-9]", "", s.lower())

# ================================================================================
# 0. Text helpers
# ================================================================================
def dedash(s):
    TXT[3]
    s = re.sub(r"\s*—\s*", ", ", s)
    return re.sub(r"\s+–\s+", ": ", s)

BRITISH = [("prioritize", "prioritise"), ("personalize", "personalise"), ("organize", "organise"),
           ("apologize", "apologise"), ("Apologize", "Apologise"), ("APOLOGIZE", "APOLOGISE"), ("apologizing", "apologising"),
           ("specialized", "specialised"), ("Specialized", "Specialised"), ("realize", "realise"),
           ("revitalizing", "revitalising"), ("analyze", "analyse"), ("honor ", "honour "), ("To honor", "To honour"),
           ("Exchange Center", "Exchange Centre"), ("favorite", "favourite"), ("color", "colour"),
           ("Fiber Clinix", "Fibre Clinix"), ("Empathize", "Empathise"), ("authorization", "authorisation"), ("organization", "organisation"), ("Personalize", "Personalise"), ("fulfills", "fulfils"), ("practice the", "practise the"),
           ("to practice an", "to practise an"), ("start practicing", "start practising")]

def fix(s):
    TXT[4]
    s = s.replace("\u2028", " ").replace("\t", " ")
    s = s.replace("‘’", "“").replace("’’", "”").replace("''", "”").replace("'", "’")
    s = re.sub(r"(^|\s)‘(?=[A-Z])", r"\1“", s)
    s = re.sub(r"Tara Rose [Ss]alon(?!s)", "Tara Rose Salons", s)
    for a, b in BRITISH: s = s.replace(a, b)
    s = s.replace("the ideal moment to upsell!", TXT[5])
    s = re.sub(r"\s+", " ", dedash(s)).strip()
    return s

# Client-facing script wording: trs-brand-guardian banned list, minimal edits.
BANNED = r"(?i)\b(transformations?|upsell\w*|premium|luxur\w*|guarantee\w*|pamper\w*|indulge|VIP|Glow Club|discount\w*|exclusive)\b|!|\d+\s*%\s*off|😊|🌹|\bfee\b"
GENERIC = [
    (r"\?!", "?"), (r"!+", "."), (r"\.\.(?!\.)", "."),
    (r"\bAmazing\b", "Lovely"), (r"\bamazing\b", "lovely"), (r"\bstunning\b", "beautiful"), (r"\bincredible\b", "wonderful"),
    (r"\bbig transformation\b", "big change"), (r"\bbigger transformation\b", "bigger change"), (r"\], ([A-Z])", r"]. \1"), (r"\bmajor transformation\b", "big change"),
    (r"\btransformations\b", "big changes"), (r"\btransformation\b", "big change"), (r"\bTransformation\b", "Big change"),
    (r"\bupsell\b", "recommend"), (r"\bpremium\b", "signature"),
    (r"\bluxurious\b", "restorative"), (r"\bluxury\b", "considered"),
    (r"\bpampering\b", "care"), (r"\bpampered\b", "cared for"), (r"\bpamper\b", "care for"),
    (r"\bIndulge in\b", "Enjoy"), (r"\bindulge in\b", "enjoy"), (r"\btreat yourself\b", "take time for yourself"),
    (r"\bexclusive\s+", "special "), (r"\s*😊", ""), (r"\s*🌹", ""),
    (r"\s+\.", "."),
]
_script_page = [None]
def S(orig, phrases=()):
    TXT[6]
    s = fix(orig)
    for a, b in phrases:
        a, b = a.replace("'", "’"), b.replace("'", "’")
        assert a in s, (a, s)
        s = s.replace(a, b)
    for a, b in GENERIC: s = re.sub(a, b, s)
    s = re.sub(r"^(Hi|Hey),?\s+name\s*,\s*", r"\1 [name], ", s)          # greeting placeholder
    s = re.sub(r"^Hi\s*,\s*", "Hi [name], ", s)
    s = re.sub(r"^((?:Hi|Hey) (?:\[name\]|lovely), )([A-Z])(?=[a-z])", lambda m: m.group(1) + m.group(2).lower(), s)
    s = re.sub(r"\s+", " ", s).strip()
    m = re.search(BANNED, s)
    assert not m, (m.group(0), s)
    if s != fix(orig): SCRIPT_CHANGES.append((_script_page[0], fix(orig), s))
    return s

# ---- HTML builders --------------------------------------------------------------
def p(*ls): return "".join(f"<p>{esc(x)}</p>" for x in ls if x)
def h3(t): return f"<h3>{esc(t)}</h3>"
def h4(t): return f"<h4>{esc(t)}</h4>"
def ul(items): return "<ul>" + "".join(f"<li>{esc(i)}</li>" for i in items if i) + "</ul>"
def ol(items): return "<ol>" + "".join(f"<li>{esc(i)}</li>" for i in items if i) + "</ol>"
def say(*ls): return "".join(f"<p>“{esc(x.strip('“”"'))}”</p>" for x in ls if x)
def table(head, rows):
    th = "".join(f"<th>{esc(c)}</th>" for c in head)
    return f"<table><thead><tr>{th}</tr></thead><tbody>" + "".join(
        "<tr>" + "".join(f"<td>{esc(c)}</td>" for c in r) + "</tr>" for r in rows) + "</tbody></table>"
def kv(rows): return "<table><tbody>" + "".join(f"<tr><th>{esc(a)}</th><td>{esc(b)}</td></tr>" for a, b in rows) + "</tbody></table>"

# ---- sources ---------------------------------------------------------------------
class Src:
    def __init__(self, name, lines):
        self.name, self.L = name, [l.strip() for l in lines if l.strip()]
        self.all = letters(" ".join(self.L))
    def idx(self, prefix, start=0):
        for i in range(start, len(self.L)):
            if self.L[i].replace("\u2028", " ").replace("'", "\u2019").startswith(prefix.replace("'", "\u2019")): return i
        raise KeyError(f"{self.name}: {prefix!r}")
    def line(self, prefix, start=0): return self.L[self.idx(prefix, start)]
    def lines(self, *prefixes): return [self.line(x) for x in prefixes]
    def between(self, a, b, start=0):
        i = self.idx(a, start); j = self.idx(b, i + 1); return self.L[i + 1:j]
    def has(self, s):                                  # guard for transcribed text
        assert letters(s) in self.all, f"{self.name}: not in source: {s[:70]}"
        return s
def docx(name): return Src(name, mammoth.extract_raw_text(open(SRC / name, "rb")).value.split("\n"))
def pdf(name): return Src(name, "\n".join(pg.get_text() for pg in pymupdf.open(SRC / name)).split("\n"))
def txt(name): return Src(name, (SRC / name).read_text(encoding="utf-8").split("\n"))

MAN = docx(TXT[7])
DEP = docx(TXT[8])
MEMO = docx(TXT[9])
CANC = docx("TaraRoseSalon_Cancellation_Policy.docx")
BRIEF = docx(TXT[10])
CCT = docx(TXT[11])
GUIDE = pdf("reception-and-call-centre-training-guide.pdf")
FLOWS = docx("Revised Flows.docx")
GEN = docx("general inquiries.docx")
DEPMSG = docx(TXT[12])
FUP = docx("Follow_Up_Call_Procedure.docx")
PHASES = txt(TXT[13])
LEVELS = txt(TXT[14])
ADVISOR = txt(TXT[15])
OPEN = pdf("TRS_Front_Desk_Manual_Open_Items.pdf")
assert TXT[16] in " ".join(OPEN.L)

pages = []
def page(section, group, title, html, note=None, audience="staff"):
    pages.append({"section": section, "group": group, "title": title, "html": html.strip(), "note": note, "audience": audience})
    if note: CONFIRM.append((SECTIONS[section][0], title, note))

SYS_NOTE = TXT[17]
def M(prefix, start=0): return fix(MAN.line(prefix, start))
def ann(prefix, start=0):
    TXT[18]
    raw = MAN.line(prefix, start)
    m = re.search(r"\s*(\*\s*(?:IF WE CAN|ADD|CHANGE|REMOVE|DEPOSIT|IT CAN)|-\s*(?:REMOVE|CHANGE) THIS).*$", raw, re.I)
    assert m, raw
    change("review note kept for Tara", raw[:m.start()].strip(), "proposed: " + raw[m.start():].strip(" *-"))
    return fix(raw[:m.start()])

# ================================================================================
# FRONT DESK & POLICIES
# ================================================================================
FD = "front-desk"

# ---- About -----------------------------------------------------------------------
_script_page[0] = "Welcome to the front desk"
html = h3("Welcome") + p(M(TXT[19]), M(TXT[20]))
html += h3("Why we have these procedures") + p(
    TXT[21],
    M(TXT[22]), M("SOP’s are important to create").replace("SOP’s", "SOPs"))
html += ul(fix(x) for x in MAN.between("SOP’s are important to create", TXT[23]))
html += p(TXT[24]
          
          ,
          TXT[25]
          ,
          TXT[26])
change("rewritten", MAN.line(TXT[27]), TXT[28])
change("rewritten (branches)", MAN.line(TXT[29]),
       TXT[30])
change("rewritten", MAN.line(TXT[31]), TXT[32])
html += h3("Our mission") + p(M("We are your home to unlock")) + h3("Our vision") + p(M("To be the Middle-East"))
vals = []
for v, first in [("Accountability", "Be the best version"), ("Passion", "Passion is the fuel"), ("Teamwork", "Think of the team"),
                 ("Respect", "We promise to treat everyone"), ("Development", "Development is a must")]:
    body = M(first) + (" " + M("Always respect your clients") if v == "Respect" else "")
    vals.append((v, body))
html += h3("Our core values") + kv(vals)
html += h3("Our salon culture") + p(M("We commit to inspire"))
html += h3("Our clients") + p(M("Our clients range from")) + ul([M("Social Status"), "Age group: 16 to 60+"])
change("removed (price figures)", TXT[33])
page(FD, "About Tara Rose Salons", "Welcome to the front desk", html,
     note=TXT[34])
ann("Age Group")

# ---- Daily operations --------------------------------------------------------------
html = h3("Before the first client") + ul([
    M("Prepare the reception area"), M("Check retail displays"), M("Turn on PC"), M("Plug in terminal"),
    TXT[35],
    M(TXT[36]), M(TXT[37]),
    M(TXT[38]), M(TXT[39]),
    M("Check the daily logbook"), M(TXT[40]).replace("make all boxes", "make sure all boxes"),
    M(TXT[41])])
change("removed (cash figures)", TXT[42], TXT[43])
html += h4(TXT[44]) + ul(fix(x) for x in MAN.between(TXT[45], TXT[46]))
html += ul([M(TXT[47])])
change("review note kept for Tara", "(opening process)", "proposed: " + MAN.line(TXT[48]).strip(" *"))
page(FD, "Daily operations", "Opening the salon", html,
     note=TXT[49])

_script_page[0] = "At the desk through the day"
html = h3("Every client") + ul([M("If a first-time hair client"), M("Monitor the service providers"), M("When clients leave a tip")])
html += h3("Consultation is key") + ul([
    TXT[50],
    M(TXT[51]), M(TXT[52]),
    ann(TXT[53]), M(TXT[54])])
change("replaced (deposit)", MAN.line(TXT[55]),
       TXT[56])
html += h3("The desk") + ul([
    M(TXT[57]), ann(TXT[58]),
    M(TXT[59]), M(TXT[60]),
    M(TXT[61]), ann("Never book breaktimes")])
change("review note kept for Tara", "(important topics)", "proposed: " + MAN.line(TXT[62]).strip(" *"))
page(FD, "Daily operations", "At the desk through the day", html,
     note=TXT[63]
          )

html = ul([M(TXT[64]), M(TXT[65]),
           M(TXT[66]), M("Check of end of day report").replace("Check of end", "Check the end").replace("are tally", "tally"),
           M("Check if Visa and Mastercard"), M("Print the batch report"),
           TXT[67],
           M("Staple end of day report"), M(TXT[68]),
           M("Complete the Logbook"), M("Ensure the salon is clean")])
change("rewritten (names)", MAN.line("Print the end of day report"), TXT[69])
page(FD, "Daily operations", "Closing the salon", html,
     note=TXT[70])

html = h3("Daily logbook") + p("Record:") + ul(fix(x) for x in MAN.between("Topics to be recorded", "All entries must be dated"))
html += ul(fix(x) for x in MAN.between(TXT[71], "Daily Targets Policy"))
html += h3("Daily targets") + p(M("Upon the start of each shift"), M(TXT[72])) + ul([
    M("Scheduled bookings"), M(TXT[73]), M(TXT[74]),
    M(TXT[75]), M("Pick the product of the day")])
html += ul([M(TXT[76]), M(TXT[77]),
            M(TXT[78])])
html += h3("Products used in services") + ul(fix(x) for x in MAN.between("Consumption Adjustment Policy", "Daily Logbook Policy"))
page(FD, "Daily operations", TXT[79], html)

html = h3("Every day") + p(M(TXT[80])) + ul(fix(x) for x in MAN.between(TXT[81], "Any maintenance issue"))
html += ul([M(TXT[82]), M(TXT[83])])
html += h3("Every month") + ul([M(TXT[84]), M("For major defects")])
html += p(TXT[85], M("NB: All maintenance requests"))
change("removed (personal contact)", TXT[86], TXT[87])
page(FD, "Daily operations", "Salon maintenance", html, note=TXT[88])

html = h3("When an inspector visits") + ul(fix(x) for x in MAN.between("Municipality visits", "Corporate discounts"))
html += h3(TXT[89]) + ul(fix(x) for x in MAN.between(TXT[90], "Petty Cash Fund Policy"))
page(FD, "Daily operations", TXT[91], html,
     note=TXT[92])
change("left out", "Corporate discounts", TXT[93])

# ---- Bookings and confirmations ------------------------------------------------------
_script_page[0] = "Taking bookings by phone"
html = h3("On the phone") + ul([M(TXT[94]), M(TXT[95]),
    M("Have a high level of energy"), M("Speak loud enough"), M("Sit up straight or stand up"), M("Eliminate fillers"),
    M(TXT[96]), M("Always hold a pencil"), M(TXT[97]),
    M(TXT[98])])
html += h3("How to start the call") + p(TXT[99])
html += say(S(MAN.line(TXT[100]), [(TXT[101], TXT[102])]))
html += h3("Managing the conversation") + p(M(TXT[103]))
html += p(TXT[104]) + say(S(TXT[105],
          [("different level of stylists", "different levels of stylist")]))
html += ol([S(MAN.line("1. Are you thinking")[3:]), S(MAN.line("2. What type of stylist")[3:]),
            S(MAN.line("3. Are you looking for advise")[3:], [("advise on", "advice on")])])
html += p(M(TXT[106]))
html += ol([S(MAN.line(TXT[107])[3:]), S(MAN.line(TXT[108])[3:])])
html += p(M(TXT[109]), M(TXT[110]))
html += say(S(TXT[111]))
html += ul([M(TXT[112]), M("Once you have fixed a time"), M(TXT[113])])
html += say(S(TXT[114]))
html += ul([M(TXT[115])])
html += say(S(TXT[116]))
html += p("If she is a new client, add:") + say(S(TXT[117]))
html += h3("How to end the call") + p(M(TXT[118])) + say(S(TXT[119]))
html += h3("Know the salon first") + p(M(TXT[120])) + ul(fix(x) for x in MAN.between(TXT[121], TXT[122]))
html += h3(TXT[123]) + p(fix(MAN.line(TXT[124])).replace(TXT[125], ""),
          TXT[126])
html += say(S(TXT[127]))
page(FD, "Bookings and confirmations", "Taking bookings by phone", html)

_script_page[0] = TXT[128]
html = h3("When there is no availability") + ul([fix(MAN.line(TXT[129])).split(" *ADD")[0]])
change("review note kept for Tara", "Waiting list", TXT[130])
html += h3("Calling a waiting list client") + say(S(TXT[131]))
html += p("If it is not a good time:") + say(S(TXT[132]))
html += p("If it is:") + say(S(TXT[133]))
html += p(M(TXT[134]))
html += h3("When a client calls to cancel") + say(S(TXT[135]))
html += p(TXT[136])
page(FD, "Bookings and confirmations", TXT[137], html,
     note=TXT[138])

_script_page[0] = "Appointment confirmations"
html = p(fix(PHASES.line("REMEMBER")).replace("REMEMBER : ", "Remember: "))
html += h3(TXT[139]) + p(
    TXT[140])
html += kv([("Date and time", TXT[141]),
            ("Service booked", TXT[142]),
            ("Location", TXT[143]),
            ("Cancellation policy", TXT[144])])
html += h3(TXT[145]) + ul([
    TXT[146],
    TXT[147],
    TXT[148]])
html += h3("3. No reply") + ul([
    TXT[149],
    TXT[150],
    TXT[151],
    TXT[152]])
html += h3("4. Late changes and no-shows") + ul([
    TXT[153],
    TXT[154],
    TXT[155]])
change("replaced", TXT[156] + MAN.line(TXT[157]),
       TXT[158])
change("replaced", PHASES.line(TXT[159]), TXT[160])
change("replaced (deposit)", PHASES.line(TXT[161]), TXT[162])
change("removed (platform mechanics)", TXT[163], "In the booking system")
page(FD, "Bookings and confirmations", "Appointment confirmations", html,
     note=TXT[164]
           + SYS_NOTE)

# -- Deposit policy: Staff Guide v3 (28 Sep 2026) is the authority
def dep(s):
    s = fix(s)
    s = s.replace(TXT[165], TXT[166]).replace("in Phorest", "in the booking system")
    s = s.replace("in her Phorest client notes", "in her client notes").replace("Phorest shows", "The booking system shows").replace("Phorest", "the booking system")
    s = s.replace(TXT[167], TXT[168]).replace("(page 4 tells you how much)", TXT[169])
    s = s.replace("Check her history (page 3).", TXT[170]).replace(", page 6)", TXT[171])
    s = s.replace("“it’s always 400”", "“it’s always the same”").replace('"it’s always 400"', '"it’s always the same"')
    s = s.replace("over AED 800", "over the higher-value amount").replace("AED 200 / 400", "the smaller or bigger amount")
    s = re.sub(TXT[172], TXT[173], s)
    s = s.replace("AED 200", "the smaller amount").replace("AED 400", "the bigger amount").replace("“it's always 400”", "“it's always the same”")
    s = s.replace('"it\'s always 400"', '"it\'s always the same"').replace("“it’s always 400”", "“it’s always the same”")
    assert "AED" not in s, s
    return s
def rows(lines, n): return [[dep(c) for c in lines[i:i + n]] for i in range(0, len(lines), n)]
_script_page[0] = "Booking and deposit policy"
html = p(TXT[174])
html += h3("The one rule to remember") + p(dep(DEP.line("A deposit protects her time")), dep(DEP.line(TXT[175])))
html += h3("Send clients the policy") + p(TXT[176]) + ul([
    TXT[177],
    TXT[178]])
html += h3(TXT[179]) + p(dep(DEP.line(TXT[180])))
html += table(["Ask", "If yes", "If no"], rows(DEP.between("IF NO", "REAL EXAMPLE"), 3))
html += h4("Real example") + ul(dep(x) for x in DEP.between("REAL EXAMPLE", "BEFORE ANY BIG CHANGE"))
html += p("Before any big change: " + dep(DEP.line(TXT[181])))
html += h3("When a deposit is needed") + p(dep(DEP.line(TXT[182])))
html += table(["Situation", "New client", "Existing client"], rows(DEP.between("EXISTING CLIENT", "HOW TO DECIDE"), 3))
html += h4(TXT[183]) + ul(dep(x) for x in DEP.between("HOW TO DECIDE", "REAL EXAMPLE", DEP.idx("HOW TO DECIDE") - 1))
html += h4("Real example") + ul(dep(x) for x in DEP.between("REAL EXAMPLE", "2   How much", DEP.idx("HOW TO DECIDE")))
i2 = DEP.idx("2   How much")
html += h3("How much to take") + p(dep(DEP.line(TXT[184])))
html += table(["Booking", "New client", "Existing client"], rows(DEP.between("EXISTING CLIENT", "NEW CLIENTS IN PRACTICE", i2), 3))
html += p(*(dep(x) for x in DEP.between("NEW CLIENTS IN PRACTICE", "NEVER", i2)))
html += h4("Never") + ul(dep(x) for x in DEP.between("NEVER", "3   Changes", i2))
i3 = DEP.idx("3   Changes")
html += h3(TXT[185]) + p(dep(DEP.line(TXT[186])))
html += table(["She tells us", "What happens to the deposit"], rows(DEP.between("WHAT HAPPENS TO THE DEPOSIT", "REAL EXAMPLE", i3), 2))
html += h4("Real example") + ul(dep(x) for x in DEP.between("REAL EXAMPLE", "YOUR ONE JOB HERE", i3))
html += h4("Your one job here") + p(*(dep(x) for x in DEP.between("YOUR ONE JOB HERE", "4   Same-day", i3)))
i4 = DEP.idx("4   Same-day")
html += h3(TXT[187]) + p(dep(DEP.line(TXT[188])))
html += table(["Her appointment is", "Deposit rule"], rows(DEP.between("DEPOSIT RULE", "REAL EXAMPLE", i4), 2))
html += h4("Real example") + ul(dep(x) for x in DEP.between("Four short-notice bookings:", "REMEMBER", i4))
html += h4("How refunds work") + table(["She paid by", "How the refund works"], rows(DEP.between("HOW THE REFUND WORKS", "5   When there is", i4), 2))
html += p(dep(MEMO.line(TXT[189])).split(". ")[-1])
i5 = DEP.idx("5   When there is")
html += h3(TXT[190]) + p(dep(DEP.line(TXT[191])))
html += p(*(dep(x) for x in DEP.between("THE RULE", "What to do, step by step", i5)))
html += ol(re.sub(r"^\d\.\s+", "", dep(x)) for x in DEP.between("What to do, step by step", "ACCEPTED BEFORE", i5))
html += table(["Accepted before", "Outcome"], rows(DEP.between("OUTCOME", "IF A STYLIST IS UPSET", i5), 2))
html += h4("If a stylist is upset") + p(*(dep(x) for x in DEP.between("IF A STYLIST IS UPSET", "6   Taking the deposit", i5)))
i6 = DEP.idx("6   Taking the deposit")
html += h3(TXT[192]) + p(dep(DEP.line(TXT[193])))
html += ol(re.sub(r"^\d\.\s+", "", dep(x)) for x in DEP.between(TXT[194], "THE LINE TO SAY", i6))
html += h4("The line to say") + say(S(DEP.line(TXT[195])))
obj = DEP.between("THE LINE TO SAY", "★", i6)[1:]
assert len(obj) % 6 == 0, obj
orows = []
for k in range(0, len(obj), 6):
    she, means, you = obj[k + 1], obj[k + 3], obj[k + 5]
    orows.append([dep(she), dep(means), S(you)])
html += table(["She says", "What it means", "You say"], orows)
html += h3("One-page cheat sheet") + table(["Question", "Answer"], rows(DEP.between("ANSWER", "STATUS", DEP.idx("★")), 2))
html += p(TXT[196])
change("authority", TXT[197], "Converted as the staff rules; the client page is linked (?client=new / ?client=existing), not copied")
change("removed (AED figures)", TXT[198],
       TXT[199])
change("replaced (platform name)", TXT[200], "the booking system")
change("superseded", TXT[201], TXT[202])
for old in [TXT[203],
            TXT[204], TXT[205],
            TXT[206], TXT[207],
            TXT[208]]:
    change("replaced by Staff Guide v3", old)
page(FD, "Bookings and confirmations", "Booking and deposit policy", html,
     note=TXT[209]
           + SYS_NOTE)

_script_page[0] = TXT[210]
html = p(TXT[211])
html += h3(fix(CANC.line("We respect your time")))
html += h4("Giving us notice") + say(S(CANC.line("Life happens"), [("Life happens, we get it.", "Life happens, we understand.")]), S(CANC.line("You can reach us on WhatsApp")))
html += h4("Appointment reminders") + say(S(CANC.line("We send a reminder")), S(CANC.line("A quick reply")))
html += h4("Rescheduling and no-shows") + say(S(CANC.line("Need to move things around")),
    S(CANC.line("That said, if cancellations"), [(TXT[212], TXT[213])]))
html += h4("Emergencies and exceptions") + say(S(CANC.line("If something unexpected")), S(CANC.line(TXT[214])))
html += h3("For the team") + ul([TXT[215],
                                 TXT[216],
                                 TXT[217]])
change("authority", TXT[218], TXT[219])
page(FD, "Bookings and confirmations", TXT[220], html)

html = ul(fix(x) for x in MAN.between("Client Booking Policy", "Consumption Adjustment Policy"))
page(FD, "Bookings and confirmations", "Booking columns and revenue", html,
     note=TXT[221])

# ---- Welcome and checkout ---------------------------------------------------------------
_script_page[0] = "Welcoming clients"
html = p(M(TXT[222]))
html += h3("Looking after the client") + ul([M("If you are seated, stand up"), M("Make eye contact and welcome"), M("Do a temperature check")])
html += h3("Checking in a booked client") + ul([M(TXT[223]), M(TXT[224]), M("Personalize your welcome").replace("Personalize", "Personalise")])
html += say(S(TXT[225]), S(TXT[226]))
html += p("If you don’t know her name:") + say(S("May I know your name please?"))
html += p(TXT[227]) + say(S(TXT[228]))
html += p(TXT[229]) + say(S(TXT[230]))
html += ul([M(TXT[231]), M(TXT[232]),
            M(TXT[233]), M(TXT[234]).replace("about the about", "about"),
            M(TXT[235]), M(TXT[236])])
html += say(S(TXT[237]))
html += ul([M(TXT[238]), M(TXT[239])])
w = MAN.idx("Walk in client")
html += h3("Walk-in client") + say(S(TXT[240])) + p(TXT[241]) + say(S("May I ask your name please?"))
html += p(TXT[242]) + h4("A slot is free") + say(S(TXT[243]), S(TXT[244]))
html += p(TXT[245])
html += say(S(TXT[246])) + ul([M(TXT[247], w)])
html += h4("No slot is free") + say(S(TXT[248], [(TXT[249], TXT[250])]))
page(FD, "Welcome and checkout", "Welcoming clients", html)

_script_page[0] = TXT[251]
html = h3("Client feedback") + say(S(TXT[252])) + p("If she is happy:") + say(S(TXT[253]))
html += ul([M(TXT[254]), M(TXT[255])])
html += h4("If she is unhappy") + p(M(TXT[256])) + ul(fix(x) for x in MAN.between(TXT[257], "Say ”I truly understand Tina".replace("”", "‘’")))
html += say(S(TXT[258]))
html += ul([M(TXT[259]), M(TXT[260]), M(TXT[261]), M(TXT[262])])
html += h3("Rebooking") + p(M(TXT[263]))
html += say(S(TXT[264]),
            S(TXT[265],
              [("Your skin looks lovely.", "Your skin looks lovely.")] if False else []))
html += p(M(TXT[266]), M(TXT[267]), M(TXT[268]), M("If the client says: "))
html += h3("Aftercare") + p(M(TXT[269]))
html += h3("Retail") + p(M(TXT[270]), M(TXT[271]))
html += h3("Payment") + ul([M("Repeat the price agreed"), M(TXT[272]), TXT[273]])
html += h3("Reviews") + p(TXT[274])
change("removed (figures)", TXT[275], TXT[276])
html += h3("Saying goodbye") + p(M(TXT[277])) + ul([M(TXT[278]), M("Thank her with a smile")])
html += say(S(TXT[279]))
html += h3(TXT[280]) + p(M(TXT[281]))
html += say(S(TXT[282],
              [(TXT[283], TXT[284])]))
html += p(M(TXT[285]), TXT[286])
page(FD, "Welcome and checkout", TXT[287], html)

html = h3("Loyalty card") + p(M(TXT[288]), M(TXT[289]), M(TXT[290]))
html += ul([M(TXT[291]), M(TXT[292]).replace("card get", "card gets")])
html += h4("Terms") + kv([("Hair", TXT[293]),
                          ("Mani or pedi", TXT[294])])
html += h3("Refer a friend") + p(M(TXT[295]), M(TXT[296]))
html += ul([TXT[297],
            TXT[298],
            "Valid for new clients only.", M(TXT[299])])
change("removed (promo figures)", TXT[300], TXT[301])
change("removed (promo figures)", TXT[302], "the current referral reward")
page(FD, "Welcome and checkout", TXT[303], html,
     note=TXT[304])

# ---- Complaints ---------------------------------------------------------------------------
_script_page[0] = "Handling complaints"
CH = MAN.between("CUSTOMER COMPLAINT HANDELING", "POLICIES & PROCEDURES")
HEADS3 = {TXT[305], "STEP 2: IDENTIFY THE CAUSE", "STEP 3: SOLVE THE PROBLEM", TXT[306],
          TXT[307], TXT[308], TXT[309]}
HEADS4 = {"LISTEN", "APOLOGIZE", "ASSURE", "RECAP", "DISPLAY EMPATHY", "INVESTIGATE THE SITUATION", TXT[310],
          "APOLOGIZE AGAIN IF NECESSARY", "EXPLAIN WHAT HAPPENED", "Offer your best solution", "Focus on what you can do", "Never assign blame",
          "Show compassion", "Offer an alternative solution", TXT[311], "Offer something extra",
          "Make a follow up call", "Analyse what went wrong", "Fix the problem", "Make things better"}
def tc(s): return s[0] + s[1:].lower() if s.isupper() or s.startswith("STEP") else s
html, buf = "", []
def flush():
    global html, buf
    if buf: html += ul(buf) if all(len(b) < 160 for b in buf) and len(buf) > 2 else p(*buf); buf = []
steps = [x for x in CH if re.match(r"STEP \d:? \w", x) and not x.isupper()]
for l in CH:
    l2 = fix(l)
    if l in steps: continue
    if l.strip() in HEADS3: flush(); html += h3(fix(tc(l.strip())).replace("Apologize", "Apologise")); continue
    if l.strip() in HEADS4: flush(); html += h4(fix(tc(l.strip())).replace("Apologize", "Apologise").replace("APOLOGIZE", "Apologise")); continue
    if l.startswith(TXT[312]):
        flush(); html += p(l2.replace("practice", "practise")) + ol(fix(re.sub(r"STEP \d:?\s*", "", s)).replace("Retore", "Restore") for s in steps); continue
    l2 = l2.replace("ALWAYS STAY CALM! ", "Always stay calm. ").replace("got to the root cause", "get to the root cause").replace("tour resolution", "your resolution").replace("you get of easy", "you get off easy")
    buf.append(l2)
flush()
html = h3("Why it matters") + html
page(FD, "Complaints", "Handling complaints", html)

# ---- Services and products ---------------------------------------------------------------
_script_page[0] = "Stylist levels"
html = p(fix(BRIEF.line("This guide is designed")).replace(TXT[313], TXT[314]))
change("rewritten", TXT[315], "'recommend the right service'")
lv = BRIEF.between("Stylist Levels at Tara Rose", "✨ Reception Team Tip")
html += kv([(lv[0], " ".join(fix(x)[2:] for x in lv[1:4])), (lv[4], " ".join(fix(x)[2:] for x in lv[5:8])),
            (lv[8], " ".join(fix(x)[2:] for x in lv[9:12])),
            (lv[12], " ".join(fix(x)[2:] for x in lv[13:16]) + TXT[316])])
change("rewritten", TXT[317], TXT[318])
html += h3("Reception tip") + p(TXT[319])
html += say(S(TXT[320]))
change("superseded", TXT[321],
       TXT[322])
ann(TXT[323])
page(FD, "Services and products", "Stylist levels", html,
     note=TXT[324]
          )

def brief_html(a, b, start=0):
    TXT[325]
    out, items = "", []
    def fl():
        nonlocal out, items
        if items: out += ul(items); items = []
    for l in BRIEF.between(a, b, start):
        f = fix(l)
        if re.search(TXT[326], f):
            change("removed (duration)", f); continue
        if f in ("• 1 row – 30 to 45 minutes", "• 2 rows – 1 to 1.5 hours", "• 3 rows – 2 to 2.5 hours") or re.match(r"^• \d rows?:", f):
            change("removed (duration)", f); continue
        if f.startswith(("Tape Extensions", "Micro Bonds", "Wefts", "Removal/Refit", "Toning:")) or (len(f) < 60 and not f.endswith(".") and not f.startswith(("•", "-")) and l in HEADS_B):
            fl(); out += h4(f.rstrip(":")); continue
        if f.startswith(("- ", "• ")): items.append(f[2:]); continue
        if l.startswith(("Flat,", "Lightweight", "Reusable", "Easily removed", "Maintenance required", "Micro rings use", "Both are applied", "Nano rings are",
                         "Recommended for shorter", "Easy to remove", "Instantly add", "Lay flat", "Fully versatile", "Require a", "Aftercare:")):
            items.append(f); continue
        fl(); out += p(f)
    fl(); return out
HEADS_B = set()
bh = mammoth.convert_to_html(open(SRC / TXT[327], "rb")).value
for m in re.finditer(r"<h[12]>(.*?)</h[12]>", bh): HEADS_B.add(text(m.group(1)).strip())
HEADS_B |= {TXT[328]}  # unused guard
html = h3("Cutting and styling") + brief_html("Cutting & Styling:", "Colouring:")
html += h3("Colouring") + brief_html("Colouring:", "Balayage:")
html += h3("Balayage") + brief_html("Balayage:", "Highlights")
html += h3("Highlights and toning") + brief_html("Highlights", "Bleach & Colour Change:")
html += h3("Bleach and colour change") + brief_html("Bleach & Colour Change:", "Treatments & Keratin")
html += h3("Treatments and keratin") + brief_html("Treatments & Keratin", "Hair Extensions")
html += h3("Hair extensions") + brief_html("Hair Extensions", "Reception Team Notes")
html += h3("Reception notes") + ul(fix(x)[2:] if fix(x).startswith("- ") else fix(x) for x in BRIEF.L[BRIEF.idx("Reception Team Notes") + 1:])
html += h3(TXT[329]) + ul([
    TXT[330],
    TXT[331],
    TXT[332],
    M(TXT[333]).replace(TXT[334], TXT[335]).replace(TXT[336], TXT[337]),
    TXT[338],
    TXT[339],
    TXT[340],
    TXT[341],
    TXT[342],
    TXT[343],
    TXT[344]])
for d in [TXT[345], TXT[346], TXT[347], TXT[348]]:
    change("removed (duration/price)", d)
change("removed (staff names)", MAN.line("Done by Nicola only"), TXT[349])
change("removed (staff names)", MAN.line(TXT[350]), TXT[351])
change("superseded", TXT[352],
       TXT[353])
for pre in [TXT[354], "T Section Foils", "Note:  All", TXT[355], TXT[356],
            "Note: Roots to Ends is mainly", "Colour Remover", "Express Toner", "There are different ranges", "Hair Up *ADD", TXT[357],
            TXT[358], "Brand = Amazone", TXT[359]]:
    try: ann(pre)
    except AssertionError:
        raw = MAN.line(pre); change("review note kept for Tara", raw)
html += p(TXT[360])
page(FD, "Services and products", "Hair services guide", html,
     note=TXT[361]
          )

_script_page[0] = "Beauty services guide"
html = h3("Manicure and pedicure") + ul([M("Essie: Nail Polishes"), M("E.Mi: Nail Polishes"), M("Alessandro: Spa Treatments")])
html += h3("Nail extensions (E.Mi)") + kv([("Acrygel", M("Acrygel is a combination")), ("Overlay", M(TXT[362])),
                                           ("Refill", M("When we speak of the Refill")), ("Sculpting", M(TXT[363]))])
html += h3(TXT[364]) + kv([("Hard wax", M("A type of wax that adheres")), ("Strip wax", M("A runny wax"))])
html += h3("Lashes and brows") + kv([("LVL Lashes (Nouveau Lashes)", M("LVL stands for length") + " " + M(TXT[365])),
                                     ("Brow Lamination (Hi Brow)", M("Brow lamination is basically")),
                                     (TXT[366], M(TXT[367])),
                                     ("Infill", M(TXT[368])),
                                     ("Tinting (Reflectocil)", M("Slightly changing the colour"))])
html += p(TXT[369])
change("left out", TXT[370], TXT[371])
page(FD, "Services and products", "Beauty services guide", html,
     note=TXT[372])

html = h3("Hair") + kv([("Schwarzkopf", TXT[373]),
                        ("Kevin Murphy", "Treatment, and retail only"), ("Olaplex", TXT[374]),
                        ("Pure Blue", "Shower filter"), ("Cloud Nine", "Styling tools"), ("Tangle Teezer", "Brushes"),
                        ("PopMask", TXT[375]),
                        ("Hair extensions", TXT[376])])
html += h3("Skin and nails") + kv([("PCA", "Skincare (Saadiyat and KCA)"), ("Matis", "Skincare (Al Quoz)"), ("Essie, E.Mi", "Nail polish and gel polish"), ("Alessandro", TXT[377])])
change("added", "Matis for Al Quoz", TXT[378])
ann("PCA = Skin care brand") if False else None
change("review note kept for Tara", "PCA = Skin care brand", TXT[379])
page(FD, "Services and products", "Brands we use", html, note=TXT[380])

# ---- Payments, cash and stock ------------------------------------------------------------
def policy(a, b, heads, start=0, skip=()):
    out, buf = "", []
    def fl():
        nonlocal out, buf
        if buf: out += ul(buf); buf = []
    for l in MAN.between(a, b, start):
        f = fix(l)
        if l.strip() in heads: fl(); out += h4(f); continue
        if any(l.startswith(s) for s in skip): continue
        buf.append(f.lstrip("- "))
    fl(); return out
html = policy(TXT[381], "Sales Exchange Policy",
              {"Collection", "Deposit (Banking)", "Reporting", "Collection – Transaction", "Collection - Safe Keeping", "Cash", "Credit Cards/Debit Cards",
               "Changing shift", TXT[382], "1st Option", "2nd Option"})
html = html.replace("Furless Bank Account", TXT[383])
change("rewritten", TXT[384], TXT[385])
page(FD, "Payments, cash and stock", "Taking payment and banking", html,
     note=TXT[386])
html = policy("Till Float Policy", "WAIVERS", {"New Till Float Issuance", "Overages/Shortages", "Safekeeping", "Staff Changing Shift", "Permanent Change of Custodian", "Salon Closure"})
page(FD, "Payments, cash and stock", "Till float", html)
html = policy("Manual Invoice Policy", "Maintenance Policy", {"Usage", "Reporting", "For Example:", "Business Date: March 1", "Current Date: March 3"})
page(FD, "Payments, cash and stock", "Manual invoices", html)
html = policy("Sales Exchange Policy", "Stock Rotation Policy", set())
page(FD, "Payments, cash and stock", "Exchanges", html)
html = h3("Orders and deliveries") + ul([fix(x).replace("Orders will be places", "Orders are placed").replace("will be send", "will be sent").replace("to be send", "to be sent")
                                        for x in MAN.between("Purchase Process Policy", TXT[387])] + [TXT[388]])
change("removed (platform mechanics)", MAN.line(TXT[389]), TXT[390])
html += h3("Stock rotation") + policy("Stock Rotation Policy", "Till Float Policy", set())
page(FD, "Payments, cash and stock", TXT[391], html, note=SYS_NOTE)
html = policy("Petty Cash Fund Policy", "Purchase Process Policy", {"New Petty Cash Issuance", "Overages/Shortages", "Safekeeping", "Permanent Change of Custodian", "Salon Closure"})
page(FD, "Payments, cash and stock", "Petty cash (managers)", html, audience="manager")
fa = MAN.between("Fixed Asset Policy", "Loyalty Program Policy")
tstart = fa.index("CATEGORY"); tend = fa.index("Disposal of Assets")
cells = fa[tstart:tend]
trows = [cells[i:i + 3] for i in range(3, len(cells), 3)]
html = ""
heads = {"Purchase of Assets", "Movement of Assets", "Recording"}
buf = []
for l in fa[:tstart]:
    if l in heads: html += (ul(buf) if buf else ""); buf = []; html += h4(l); continue
    buf.append(fix(l))
html += ul(buf) + table(["Field", "New asset", "Transfer of assets"], [[fix(c) for c in r] for r in trows])
buf = []
for l in fa[tend:]:
    if l in ("Disposal of Assets", "Recording"): html += (ul(buf) if buf else ""); buf = []; html += h4(l); continue
    if l.startswith((TXT[392], "Assets below these values")): continue
    buf.append(fix(l))
html += ul(buf)
change("left out", TXT[393], TXT[394])
page(FD, "Payments, cash and stock", "Fixed assets (managers)", html, audience="manager")

# ---- Waivers ---------------------------------------------------------------------------------
_script_page[0] = "Waivers and consent forms"
html = p(TXT[395])
def wv(title, a, b, start=0):
    ls = [fix(x) for x in MAN.between(a, b, start)]
    ls = [x for x in ls if "____" not in x and not x.startswith(("Date:", "To: Tara", "Subject: Waiver", "To whom it may concern", "Please read carefully", "Treatment:", "Stylist Name", "Client Name", "Client Signature", "Therapist Name"))]
    ls = [re.sub(r"I,?\s*_+,?", "I", x) for x in ls]
    return h3(title) + p(*ls)
iw = MAN.idx("WAIVERS")
html += h3("Generic waiver") + p(fix(re.sub(r"I _+ ", "I ", MAN.line(TXT[396], iw))))
html += h3("Skin test (colour)") + p(M(TXT[397]))
html += ul(["Is she under 16?", TXT[398], TXT[399],
            TXT[400], TXT[401]])
html += p(M(TXT[402]))
html += h3("Eyelash extensions") + p(*(fix(x) for x in MAN.between("Unless agreed otherwise", "Date:", iw)), ) if False else ""
ie = MAN.idx("Unless agreed otherwise", iw)
html += h3("Eyelash extensions") + p(*(fix(x) for x in MAN.L[ie:MAN.idx("Date:", ie)]))
ih = MAN.idx(TXT[403], iw)
html += h3("Hair extensions") + p(fix(re.sub(r"I, _+, ", "I ", MAN.L[ih])))
ik = MAN.idx(TXT[404], iw)
html += h3(TXT[405]) + p(fix(re.sub(r"I, _+, ", "I ", MAN.L[ik])))
it = MAN.idx(TXT[406], iw)
html += h3("Tinting") + p(fix(re.sub(r"I _+ ", "I ", MAN.L[it])))
iwx = MAN.idx(TXT[407], iw)
html += h3("Waxing") + ul(fix(x) for x in MAN.L[iwx:MAN.idx("Date:", iwx)])
change("left out", TXT[408],
       TXT[409])
page(FD, "Waivers", "Waivers and consent forms", html,
     note=TXT[410])

change("left out", TXT[411], TXT[412])
change("left out", TXT[413], TXT[414])

# ================================================================================
# FRONT DESK INDUCTION & ONBOARDING
# ================================================================================
FI = "front-desk-induction"
html = h3("When a new receptionist joins") + ul([
    TXT[415],
    TXT[416],
    TXT[417],
    TXT[418],
    TXT[419],
    TXT[420]])
html += h3("Before she answers the phone") + p(M(TXT[421])) + ul(fix(x) for x in MAN.between(TXT[422], TXT[423]))
html += h3("Her first weeks") + p(TXT[424]
                                 )
change("rewritten", MAN.line(TXT[425]), TXT[426])
page(FI, "Getting started", "Onboarding a new receptionist", html, note=SYS_NOTE)

lv = LEVELS.L
def lvl(a, b): return [fix(x.lstrip("• ")) for x in LEVELS.between(a, b)]
L1, L2, L3 = lvl("LEVEL 1:", "LEVEL 2:"), lvl("LEVEL 2:", "LEVEL 3:"), [fix(x.lstrip("• ")) for x in LEVELS.L[LEVELS.idx("LEVEL 3:") + 1:]]
L1 = [x.replace(TXT[427], "Can use the booking system").replace(TXT[428], TXT[429]) for x in L1]
assert not any("Phorest" in x or "Respond" in x for x in L1), L1
change("replaced (platform names)", TXT[430], TXT[431])
html = p(TXT[432])
html += h3("Level 1") + ul(L1) + h3("Level 2") + ul(L2) + h3("Level 3") + ul(L3)
page(FI, "Getting started", "Reception levels", html, note=TXT[433] + SYS_NOTE)

_script_page[0] = TXT[434]
A = ADVISOR
html = p(TXT[435]
         )
html += h3("Advising: what it means") + p(fix(A.line(TXT[436])).replace(TXT[437],
          TXT[438]),
          fix(A.line(TXT[439])))
change("rewritten", TXT[440],
       TXT[441])
jr = [fix(x) for x in A.between("THE CLIENT JOURNEY (page 4)", "WHEN DO WE MAXIMISE?")]
jr = [re.sub(r"^\d\d ", "", x).replace(TXT[442], TXT[443]).replace("IMMEDIATELY!", "immediately.")
      .replace(TXT[444], TXT[445]).replace("are 100% satisfied", "are completely happy") for x in jr]
html += h3(TXT[446]) + ol(jr)
for stage, a in [(TXT[447], "AT WELCOME"), ("At check-in: what she sees", "AT CHECK-IN"),
                 (TXT[448], "AT CONSULTATION"), (TXT[449], "DURING TREATMENT"), ("At checkout: know your client", "AT CHECK OUT")]:
    ln = A.L[A.idx(a) + 1]
    ln = fix(ln).replace(" (Let's practice an example)", "").replace(TXT[450], TXT[451])
    ln = ln.replace("helps your sales game", "helps her see what we offer").replace(TXT[452], TXT[453])
    html += h4(stage) + p(ln)
change("rewritten", TXT[454], TXT[455])
html += h3("Techniques") + ul([
    TXT[456],
    TXT[457],
    TXT[458]])
html += h3("Strategies to remember") + ul([
    TXT[459],
    TXT[460],
    TXT[461],
    fix(A.line("- Be helpful and be honest"))[2:], fix(A.line("- KNOW your stuff"))[2:].replace("KNOW your stuff!", "Know your stuff."),
    fix(A.line(TXT[462]))[2:]])
change("left out", TXT[463],
       TXT[464])
change("removed (price figures)", TXT[465], TXT[466])
change("left out", TXT[467], TXT[468])
page(FI, "Client experience", TXT[469], html,
     note=TXT[470])

# ================================================================================
# CALL CENTRE SCRIPTS & POLICIES
# ================================================================================
CC = "call-centre"
GLOW = []
def cct(prefix): return fix(CCT.line(prefix))
_script_page[0] = "The 6-step sales process"
html = p(cct(TXT[471]).replace("journey and", "journey, and"))
steps = []
for name, pre in [("Welcome", "Welcome – Make"), ("Fact find", "Fact Find –"), ("Recommendation", "Recommendation –"), ("Quote", "Quote –"),
                  ("Confirm", "Confirm –"), ("Follow-up and referral", "Follow-Up & Referral –")]:
    t = cct(pre).split(": ", 1)[1]
    t = t.replace("(the 8-step hair plan)", "(the 8-Step Hair Plan)").replace("Attach cancellation policy.", "Send the cancellation policy.")
    t = t.replace(TXT[472], TXT[473])
    steps.append((name, t.strip()))
html += kv(steps) + p("On a quote, say:") + say(S(TXT[474]))
change("renamed", TXT[475], "(the 8-Step Hair Plan)")
html += p(cct("✨ Why This Matters").replace("✨ Why This Matters: ", "Why this matters: ").replace("a luxury, expert-led salon", TXT[476]))
html += h3(TXT[477]) + kv([
    ("She is unsure about the price", TXT[478]),
    ("She is hesitant to book", TXT[479]),
    (TXT[480], TXT[481]),
    ("No-show or late cancellation", TXT[482])])
page(CC, "How we sell", "The 6-step sales process", html)

def wf(title, a, b, steps_spec):
    return None
_script_page[0] = TXT[483]
o = CCT.idx(TXT[484])
html = h3(TXT[485]) + say(S(TXT[486]))
html += p(TXT[487])
html += h3("Step 2: Fact finding") + p(TXT[488]) + ul(S(x) for x in CCT.between("STEP 2: FACT FINDING", "STEP 3: RECOMMENDATION", o))
html += h3(TXT[489]) + say(S(TXT[490],
                                                                                      [("To be 100% sure on the price", "To be sure of the price")]))
html += p(TXT[491])
html += h3(TXT[492]) + h4(TXT[493]) + say(S(TXT[494],
          [(TXT[495], "For a change like this")]))
html += h4("Beauty services") + say(S(TXT[496],
          [(TXT[497], TXT[498])]))
html += h4("If she is hesitant") + say(S(TXT[499]))
html += h4(TXT[500]) + say(S(TXT[501],
          [("advice would you prefer that?", TXT[502])]))
html += h3("Step 5: Booking confirmation") + say(S(TXT[503]))
html += p("Add the policy reminder:") + say(S(TXT[504],
          [(TXT[505], TXT[506])]))
html += h3(TXT[507]) + say(S(TXT[508]),
          S(TXT[509],
            [("referral program if a friend", TXT[510]), (TXT[511], TXT[512])]))
page(CC, "How we sell", TXT[513], html)

_script_page[0] = "Paid ads WhatsApp workflow"
pa = CCT.idx("🟡 Paid Ads WhatsApp Workflow")
html = h3("Step 1: Welcome and rapport") + say(S(TXT[514],
          [(TXT[515], "guide you to the right result")]))
html += p(TXT[516])
fq = CCT.between("STEP 2: FACT FINDING", "STEP 3: RECOMMENDATION", pa)
html += h3("Step 2: Fact finding") + p("Choose 2 to 4 questions:") + kv([(x.split(":")[0], S(x.split(":", 1)[1].strip())) for x in fq])
html += h3(TXT[517]) + say(S(TXT[518],
          [(TXT[519], TXT[520]),
           ("give a 100% tailored plan", TXT[521])]))
html += p(TXT[522])
html += h3(TXT[523]) + h4("A big change") + say(S(TXT[524]))
html += h4("A single service") + say(S(TXT[525],
          [(TXT[526], "our [service]")]))
html += h4("If she is hesitant") + say(S(TXT[527]))
html += h4(TXT[528]) + say(S(TXT[529]))
html += h3(TXT[530]) + say(S(TXT[531]))
html += say(S(TXT[532], [("to avoid a fee", TXT[533])]))
html += h3(TXT[534]) + say(S(TXT[535]),
          S(TXT[536],
            [("referral program", "referral programme"), (TXT[537], TXT[538])]))
change("removed (retired name)", TXT[539], TXT[540])
change("removed (promo figures)", TXT[541], "[the current referral reward]")
page(CC, "How we sell", "Paid ads WhatsApp workflow", html)

_script_page[0] = TXT[542]
html = p(fix(GUIDE.line(TXT[543])) + " " + fix(GUIDE.line(TXT[544])) if False else "")
html = p(TXT[545])
html += h3("Step 1: Welcome") + ul([TXT[546], TXT[547],
                                     TXT[548]])
html += h4(TXT[549]) + say(S(GUIDE.has(TXT[550])),
                                                      S(GUIDE.has(TXT[551])))
html += h4(TXT[552]) + say(S(GUIDE.has(TXT[553])),
                                                        S(GUIDE.has(TXT[554])))
html += h3(TXT[555]) + h4("Returning client") + say(S(GUIDE.has(TXT[556])),
          S(GUIDE.has(TXT[557])),
          S(GUIDE.has(TXT[558])))
html += h4("New client") + ul([S(GUIDE.has(TXT[559])), S(GUIDE.has(TXT[560])) + "?",
                               S(GUIDE.has(TXT[561]))])
html += h4("Asking for pictures") + say(S(GUIDE.has(TXT[562])) + " "
                                        + S(GUIDE.has(TXT[563])))
html += p(TXT[564])
html += h3("Step 3: Recommendation") + h4("Returning client") + say(S(GUIDE.has(TXT[565])))
html += h4("New client") + say(S(GUIDE.has(TXT[566])),
          S(GUIDE.has(TXT[567]),
            [("a personalised 8-Step Plan", TXT[568])]))
html += h4("Recommending extras") + say(S(GUIDE.has(TXT[569])),
          S(GUIDE.has(TXT[570]), [("mani/pedi it’s", "mani-pedi: it’s")]) + ".",
          S(GUIDE.has(TXT[571]), [("complete your look shall I", "complete your look. Shall I")]))
change("renamed", TXT[572], TXT[573])
html += h3("Step 4: Quote and agreement") + h4("Returning client") + say(S(GUIDE.has(TXT[574])))
html += h4("New client, a big change") + say(S(GUIDE.has(TXT[575]),
          [("This kind of transformation", "This kind of change")]))
html += h4(TXT[576]) + p(TXT[577]) + say(S(DEP.line(TXT[578])))
change("replaced (deposit)", TXT[579],
       TXT[580])
html += h3("Step 5: Booking confirmation") + say(S(GUIDE.has(TXT[581])),
          S(TXT[582], [("to avoid a fee", TXT[583])]))
html += ul([TXT[584], TXT[585], TXT[586]])
html += h3("Step 6: Follow-up") + say(S(GUIDE.has(TXT[587])))
html += p("If she doesn’t reply:") + say(S(GUIDE.has(TXT[588]), [("any questions I’m happy", "any questions. I’m happy")]))
html += ul([TXT[589],
            TXT[590],
            TXT[591]])
page(CC, "How we sell", TXT[592], html,
     note=TXT[593] + SYS_NOTE)

_script_page[0] = TXT[594]
WA = [  # transcribed from the image-only PDF (Jul 2026), verbatim
    ("Message 1: instant reply", TXT[595],
     ["Hi {{first_name}} 🌿", TXT[596],
      TXT[597],
      TXT[598], "tararosesalon.com"],
     TXT[599],
     TXT[600]),
    ("Message 2: Day 3, the hook", "No reply after 2 to 3 hours.",
     ["Hi {{first_name}} ✨", TXT[601],
      TXT[602],
      TXT[603],
      TXT[604], "tararosesalon.com"],
     TXT[605],
     TXT[606]),
    (TXT[607], "No reply after Day 2.",
     ["Hi {{first_name}} 💛", TXT[608],
      TXT[609],
      TXT[610],
      TXT[611], "www.tararosesalon.com"],
     TXT[612],
     TXT[613]),
    ("Message 4: Day 7, final touch", TXT[614],
     ["Hi {{first_name}} 🌸", "Happy weekend!", TXT[615],
      TXT[616],
      TXT[617], TXT[618], "www.tararosesalon.com"],
     TXT[619],
     TXT[620]),
]
html = p(TXT[621]
         )
for title, when, lines, buttons, sq in WA:
    html += h3(title) + p("When: " + when) + say(*(S(l) for l in lines)) + p(buttons, sq)
change("left out", TXT[622], TXT[623])
change("transcribed", TXT[624], TXT[625])
page(CC, "How we sell", TXT[626], html,
     note=TXT[627] + SYS_NOTE)

# ---- Enquiries --------------------------------------------------------------------------------
_script_page[0] = TXT[628]
html = ul([M(TXT[629]).replace("responded immediately", "answered immediately").replace("to secure the client", "while the client"),
           M(TXT[630]), M(TXT[631]), M("Avoid spelling or grammatical"),
           M(TXT[632]).replace("advise", "advice").replace("inquiries", "enquiries").split(" For example:")[0]])
html += say(S(TXT[633]))
html += ul([M(TXT[634]), M(TXT[635]), M(TXT[636])])
page(CC, "Enquiries", TXT[637], html,
     note=TXT[638])

_script_page[0] = TXT[639]
G = GEN
html = p(TXT[640])
html += h3("Welcome menu") + say(S(TXT[641])) + ul(["Book an appointment", "Services or price list", "Branches", "Other enquiries"])
html += h4("Book an appointment") + say(S(G.line("To assist you effectively")), S(G.line(TXT[642])), S(G.line("To finalise your profile")),
                                        S(G.line(TXT[643])))
html += ul(["Khalifa City A", "Mamsha al Saadiyat", "Motor City", "Al Quoz"])
html += say(S(G.line(TXT[644])))
html += ul(x[2:] for x in G.between("Which category of service", "We’ve assigned you"))
html += say(S(G.line(TXT[645])))
html += h4("Services or price list") + say(S(G.line(TXT[646])) + " [service menu link]", S(G.line("Still unsure?")))
nothanks = S(TXT[647])
html += p("If she says no:") + say(nothanks)
html += h4("Branches") + kv([(b, f"Google Maps: {u}") for b, u in [("Khalifa City A", "https://maps.app.goo.gl/yLLpG2eTKyN2sa789"), ("Mamsha al Saadiyat", "https://maps.app.goo.gl/T11TgyQUnNwHuqHx6"),
                                                                  ("Motor City", "https://maps.app.goo.gl/X6gaSQwwbrv63Dta7"), ("Al Quoz", "https://maps.app.goo.gl/1UXahYng1Kj54LQE9")]])
[G.has(u) for u in ["yLLpG2eTKyN2sa789", "T11TgyQUnNwHuqHx6", "X6gaSQwwbrv63Dta7", "1UXahYng1Kj54LQE9"]]
html += say(S(TXT[648]))
FAQ = [
    (TXT[649], TXT[650], [("A restyle cut, means", "A restyle cut means")]),
    (TXT[651], TXT[652], [("Mamsha Al Saadiyat", "Mamsha al Saadiyat")]),
    ("What is a balayage?", TXT[653], []),
    (TXT[654], TXT[655], []),
    (TXT[656], TXT[657],
     [(TXT[658], TXT[659])]),
    (TXT[660], TXT[661],
     [(TXT[662], TXT[663])]),
    ("What are your timings?", TXT[664], []),
    (TXT[665], TXT[666], []),
    (TXT[667], TXT[668], []),
    (TXT[669], TXT[670], []),
    (TXT[671], TXT[672], [("Salon Stylists", "Stylists")]),
    (TXT[673], TXT[674], []),
    (TXT[675], TXT[676], []),
    ("Do you cut kids’ hair?", TXT[677], [(TXT[678], TXT[679])]),
    ("Do you have a payment link?", TXT[680],
     [(TXT[681], TXT[682])]),
    ("Do you have free parking?", TXT[683],
     [("Mamsha Al Saadiyat", "Mamsha al Saadiyat"), (TXT[684], TXT[685])]),
    ("", TXT[686], []),
    ("", TXT[687], []),
    ("", TXT[688], []),
    (TXT[689], TXT[690], []),
    ("Can I use my own colour?", TXT[691], [("we exclusively utilise", "we only use")]),
    ("Do you offer henna services?", TXT[692], []),
    (TXT[693], TXT[694], []),
]
html += h3("Answers to common questions")
for q, a, ph in FAQ:
    G.has(a.replace("AED335", "AED335"))
    if q: html += h4(q)
    html += say(S(a, ph))
html += p(TXT[695]) + say(S(TXT[696], [(TXT[697], "a free hair consultation")]))
html += p(TXT[698]) + say(S(G.line(TXT[699]))) + p("If no:") + say(nothanks)
change("removed (Fratelli, closed)", G.line(TXT[700]), TXT[701])
change("removed (Fratelli)", G.line(TXT[702]), TXT[703])
page(CC, "Enquiries", TXT[704], html,
     note=TXT[705]
          )

# ---- Deposits ---------------------------------------------------------------------------------
_script_page[0] = "Deposit messages"
html = p(TXT[706]
         )
html += h3("Reception messages") + h4(TXT[707]) + say(S(DEPMSG.has(
    TXT[708]),
    [("Hi name, We’re so excited", "Hi [name], we’re so excited"), (TXT[709], TXT[710]),
     (TXT[711], TXT[712])]))
html += h4(TXT[713]) + say(S(DEPMSG.has(
    TXT[714]),
    [("Hi name, To honour", "Hi [name], to honour"), (TXT[715], TXT[716])]))
html += h3("Replying to concerns")
for t, m in [("General disappointment", TXT[717]),
             (TXT[718], TXT[719]),
             ("“Don’t you trust me?”", TXT[720]),
             ("The policy feels unfair", TXT[721])]:
    html += h4(t) + say(S(DEPMSG.has(m), [("Hi name, ", "Hi [name], ")] if m.startswith("Hi name") else []))
html += h3("Messages from stylists")
for t, m, ph in [
    (TXT[722], TXT[723],
     [("Hey name, Just", "Hey [name], just"), ("asking for a 50% deposit", "asking for a deposit")]),
    (TXT[724], TXT[725], [("Hi name, ", "Hi [name], ")]),
    (TXT[726], TXT[727], [("Hey name, ", "Hey [name], ")]),
    ("Gentle reminder with warmth", TXT[728],
     [("Hi name, Just", "Hi [name], just"), ("a 50% deposit is now needed", "a deposit is now needed"), (TXT[729], "I’m excited to see you soon")]),
    (TXT[730], TXT[731],
     [("Hey name, Got", "Hey [name], got"), ("take a 50% deposit", "take a deposit")]),
    (TXT[732], TXT[733], [])]:
    html += h4(t) + say(S(DEPMSG.has(m), ph))
change("replaced (deposit)", TXT[734], TXT[735])
change("left out", TXT[736])
page(CC, "Deposits", "Deposit messages", html)

# ---- Follow-ups and rebooking --------------------------------------------------------------------
_script_page[0] = "Follow-up call procedure"
F = FUP
html = p(fix(F.line(TXT[737])))
html += h3("When to follow up") + kv([("New clients", TXT[738]), ("Big colour changes", "Within 48 to 72 hours"),
                                     ("Redos or adjustments", "Within 24 hours of the redo"), ("Clients who raised concerns", TXT[739]),
                                     (TXT[740], TXT[741])])
F.has(TXT[742]); F.has(TXT[743])
change("renamed", TXT[744], TXT[745])
html += h3("How to follow up") + ul([TXT[746],
                                    TXT[747],
                                    TXT[748]])
html += h3("What to say") + say(S(F.has(TXT[749])))
kq = re.findall(r"\d+\.(.*?)(?=\d+\.|$)", fix(F.line("Key Questions to Ask")).replace("Key Questions to Ask:", ""))
assert len(kq) == 11, kq
html += h4("Key questions") + ol(S(q.strip()) for q in kq)
html += h4("Close the call") + say(S(fix(F.line("Close the call with")).replace("Close the call with:", "").strip()))
html += h3("Notes for the team") + ul([TXT[750], TXT[751],
                                      TXT[752]])
page(CC, "Follow-ups and rebooking", "Follow-up call procedure", html)

_script_page[0] = "After-visit messages"
fl_ = FLOWS
html = p(TXT[753])
html += h3(TXT[754]) + say(*(S(fl_.has(x), ph) for x, ph in [
    (TXT[755], [(TXT[756], TXT[757])]),
    (TXT[758], [("Hi name, It", "Hi [name], it")]),
    (TXT[759],
     [(TXT[760],
       TXT[761])]),
    (TXT[762],
     [(TXT[763], TXT[764])]),
    (TXT[765], []),
    (TXT[766], [])]))
html += h3("5 days after the appointment") + say(*(S(fl_.has(x), ph) for x, ph in [
    (TXT[767], [(TXT[768], TXT[769])]),
    (TXT[770],
     [("Hi name, We", "Hi [name], we"), (TXT[771], TXT[772])]),
    (TXT[773], []),
    (TXT[774],
     [(TXT[775], TXT[776]), (TXT[777], "our monthly giveaway")]),
    (TXT[778], []),
    (TXT[779], [])]))
html += h3(TXT[780]) + say(*(S(fl_.has(x), ph) for x, ph in [
    (TXT[781], []),
    (TXT[782],
     [("Hi name, We", "Hi [name], we"), (TXT[783], TXT[784]), (TXT[785], TXT[786])]),
    (TXT[787], [(TXT[788], TXT[789])]),
    (TXT[790], []),
    (TXT[791], [])]))
html += h3(TXT[792]) + say(*(S(fl_.has(x), ph) for x, ph in [
    (TXT[793], []),
    (TXT[794], [("Hi name, It’s", "Hi [name], it’s")]),
    (TXT[795],
     [(TXT[796], TXT[797])]),
    (TXT[798], [("together, Ready to book?", "together. Ready to book?")])]))
html += h3(TXT[799]) + say(*(S(fl_.has(x), ph) for x, ph in [
    (TXT[800], [(TXT[801], TXT[802])]),
    (TXT[803], [("Hi, name, We miss you", "Hi [name], we miss you"), (TXT[804], TXT[805])]),
    (TXT[806], [(TXT[807], TXT[808])]),
    (TXT[809], []),
    ("Ready to claim your offer?", [])]))
change("superseded", TXT[810], TXT[811])
change("rewritten (brand)", TXT[812], TXT[813])
page(CC, "Follow-ups and rebooking", "After-visit messages", html,
     note=TXT[814] + SYS_NOTE)

_script_page[0] = "Rebooking reminders"
RB = [(TXT[815], [TXT[816], TXT[817]]),
      (TXT[818], [TXT[819], TXT[820], TXT[821]]),
      (TXT[822], [TXT[823], TXT[824]]),
      ("1 week after due: check-in", [TXT[825], TXT[826], TXT[827]]),
      (TXT[828], [TXT[829], TXT[830], TXT[831]]),
      (TXT[832], [TXT[833]])]
html = p(TXT[834])
for t, ms in RB:
    html += h3(t) + say(*(S(fl_.has(m), [("A grounding ritual", "A grounding moment")] if "ritual" in m else []) for m in ms))
change("superseded", TXT[835], TXT[836])
change("rewritten (brand)", "'A grounding ritual'", TXT[837])
page(CC, "Follow-ups and rebooking", "Rebooking reminders", html)

_script_page[0] = "Clients who cancel"
CX = [(TXT[838], [TXT[839], TXT[840], TXT[841]]),
      ("7 days after", [TXT[842], TXT[843], TXT[844]]),
      ("14 days after", [TXT[845], TXT[846], TXT[847]]),
      (TXT[848], [TXT[849], TXT[850], TXT[851]])]
html = p(TXT[852])
for t, ms in CX:
    html += h3(t) + say(*(S(fl_.has(m), [(TXT[853], TXT[854])] if "transformation" in m else
                           [(TXT[855], TXT[856])] if "Just say the word" in m else []) for m in ms))
change("superseded", TXT[857], TXT[858])
page(CC, "Follow-ups and rebooking", "Clients who cancel", html)

def offer_msgs(title, intro, items, src_note):
    _script_page[0] = title
    html = p(intro)
    for t, ms in items:
        html += h3(t) + say(*(S(fl_.has(m), ph) for m, ph in ms))
    return html
HB = [
    ("Busy professionals", [(TXT[859],
                             [("Hi name, Your", "Hi [name], your"), (TXT[860], " [Current offer, if any.]")]),
                            (TXT[861],
                             [(TXT[862], TXT[863])]),
                            (TXT[864], [(TXT[865], "[Current offer, if any.]")]),
                            ("Ready to Book?", [])]),
    ("Busy mums", [(TXT[866], [("Hi name, You", "Hi [name], you")]),
                   (TXT[867], []),
                   (TXT[868], []),
                   (TXT[869], [])]),
    ("Care and relaxation", [(TXT[870],
                              [("Hi name, You’ve", "Hi [name], you’ve"), (TXT[871], TXT[872]), (TXT[873], ".")]),
                             (TXT[874], [("a luxury facial", "a facial")]),
                             (TXT[875],
                              [(TXT[876], TXT[877]), (TXT[878], "[Book now]")])]),
    ("Introducing beauty services", [(TXT[879], [("Hi name, Let’s", "Hi [name], let’s")]),
                                     (TXT[880], [("luxury facials", "facials")]),
                                     (TXT[881], [])]),
    ("Quick care", [(TXT[882], [("Hi name, Your", "Hi [name], your"), (TXT[883], ".")]),
                    (TXT[884], []),
                    (TXT[885], [(TXT[886], "[Current offer, if any.]")])]),
    ("The full beauty experience", [(TXT[887],
                                     [("Hi name, Your", "Hi [name], your"), (TXT[888], TXT[889])]),
                                    (TXT[890], [(TXT[891], ". [Current offer, if any.]")])]),
]
html = offer_msgs(TXT[892], TXT[893], HB, "")
change("superseded", TXT[894], TXT[895])
page(CC, "Follow-ups and rebooking", TXT[896], html,
     note=TXT[897] + SYS_NOTE)

BH = [
    ("Whole-self beauty", [(TXT[898], [("Hi name, You", "Hi [name], you"), (TXT[899], ".")]),
                           (TXT[900], [("complete your transformation", "complete the picture")]),
                           (TXT[901], [(TXT[902], "[Current offer, if any.]")])]),
    ("Confidence", [(TXT[903], [("Hi name , Beauty", "Hi [name], beauty")]),
                    (TXT[904], [("a hair transformation", "a hair change")]),
                    (TXT[905], [])]),
    ("Self-care", [(TXT[906],
                    [("Hi name, You’ve", "Hi [name], you’ve"), (TXT[907], TXT[908])]),
                   (TXT[909], [(TXT[910], "Let’s complete the picture")]),
                   (TXT[911], [])]),
    ("Reconnecting with confidence", [(TXT[912], [("Hi name, You’ve", "Hi [name], you’ve")]),
                                      (TXT[913], []),
                                      (TXT[914], [])]),
    ("Hair as the missing piece", [(TXT[915], [("Hi name, You’ve", "Hi [name], you’ve"), (" with a very special 20% off.", ".")]),
                                   (TXT[916], []),
                                   (TXT[917],
                                    [(TXT[918], TXT[919])])]),
]
html = offer_msgs(TXT[920], TXT[921], BH, "")
change("superseded", TXT[922], TXT[923])
page(CC, "Follow-ups and rebooking", TXT[924], html,
     note=TXT[925] + SYS_NOTE)

# ================================================================================
# CALL CENTRE INDUCTION & ONBOARDING (drafted, Kate's call)
# ================================================================================
CI = "call-centre-induction"
DRAFT = TXT[926]
html = h3("Reframing reception") + p(TXT[927])
html += p(TXT[928])
GUIDE.has(TXT[929])
html += p(TXT[930]
          )
html += h3(TXT[931]) + p(TXT[932]
          )
html += h3("What this training gives you") + kv([("A new mindset", TXT[933]),
    ("A confident voice", TXT[934]),
    ("Product and service knowledge", TXT[935]),
    ("Visual and emotional tools", TXT[936]),
    ("Sales flow", TXT[937]),
    ("Handling objections", TXT[938])])
html += h3("The Tara Rose difference") + p(TXT[939]
          )
change("rewritten", TXT[940], TXT[941])
page(CI, "Getting started", "Why this role matters", html, note=DRAFT)

html = h3(TXT[942]) + ol(fix(x) for x in CCT.between(TXT[943], "Your job is to guide them"))
html += p(TXT[944]) + ul(fix(x) for x in CCT.between("Your job is to guide them", "🔻 If even one"))
html += h3(TXT[945]) + ul(fix(x) for x in CCT.between("🔻 If even one", "✨ This is why education"))
html += p(TXT[946]) + p(TXT[947])
page(CI, "Getting started", "Success principles", html, note=DRAFT)

def cl(a, b, start=0): return [fix(x) for x in CCT.between(a, b, start)]
s1 = cl(TXT[948], "2. 💬")
s2 = cl(TXT[949], "3. 🧠")
s3 = [x for x in cl(TXT[950], "4. 🎥") if "Glow Club" not in x]
s4 = [x for x in cl(TXT[951], "5. 📅") if "Glow Club" not in x]
s1 = [x.replace(TXT[952], TXT[953]) for x in s1]
s3 = [x.replace(TXT[954], TXT[955]) for x in s3]
html = p(TXT[956])
html += h3(TXT[957]) + ul(s1)
html += h3(TXT[958]) + ul(s2)
html += h3("3. Service knowledge") + ul(s3)
html += h3("4. Visual and media tools") + ul(s4)
html += h3(TXT[959]) + p(TXT[960])
html += kv([("Lead source", TXT[961]), ("Service interest", TXT[962]),
            ("Client type", TXT[963])])
html += p(TXT[964])
html += ul([TXT[965], TXT[966],
            TXT[967], TXT[968],
            TXT[969], TXT[970],
            TXT[971], TXT[972], TXT[973]])
html += p(TXT[974])
html += h3(TXT[975]) + p(TXT[976])
change("rewritten", TXT[977], TXT[978])
change("removed (platform mechanics)", TXT[979], TXT[980])
page(CI, "Training", "Training checklist", html, note=DRAFT + " " + SYS_NOTE)

weeks = []
for wk, a, b in [(TXT[981], TXT[982], "WEEK 2"), ("Week 2: the WhatsApp scripts", TXT[983], "WEEK 3"),
                 (TXT[984], TXT[985], "WEEK 4"), (TXT[986], TXT[987], "📌 Monthly Review")]:
    items = [fix(x).replace(TXT[988], TXT[989]).replace(TXT[990], TXT[991])
             for x in CCT.between(a, b)]
    assert not any("Glow Club" in x for x in items), items
    weeks.append(h3(wk) + ul(items))
html = p(TXT[992]) + "".join(weeks)
html += h3("Monthly review") + ul([TXT[993], TXT[994],
                                   TXT[995]])
html += p(TXT[996])
change("left out", TXT[997], TXT[998])
page(CI, "Training", "Four-week learning pathway", html, note=DRAFT)

# ================================================================================
# Things not converted
# ================================================================================
for name, why in [
    (TXT[999], TXT[1000]),
    (TXT[1001], TXT[1002]),
    ("Front Desk manual images", TXT[1003]),
    (TXT[1004], TXT[1005]),
]: change("not converted", name, why)

# ================================================================================
# Write out
# ================================================================================
ORDER = {
    FD: ["About Tara Rose Salons", "Daily operations", "Bookings and confirmations", "Welcome and checkout", "Complaints", "Services and products", "Payments, cash and stock", "Waivers"],
    FI: ["Getting started", "Client experience"],
    CC: ["How we sell", "Enquiries", "Deposits", "Follow-ups and rebooking"],
    CI: ["Getting started", "Training"],
}
secs = list(SECTIONS)
pages.sort(key=lambda p: (secs.index(p["section"]), ORDER[p["section"]].index(p["group"])))
def slugify(s): return re.sub(r"[^a-z0-9]+", "-", s.lower().replace("&", "and")).strip("-")
out, seen, counter = [], set(), {}
for p_ in pages:
    sec = p_["section"]; n = counter.get(sec, 0); counter[sec] = n + 1
    slug = sec + "-" + slugify(p_["title"].split(":")[0] if len(p_["title"]) > 40 else p_["title"])
    assert slug not in seen, slug; seen.add(slug)
    spaced = re.sub(r"</(p|li|h3|h4|td|th|tr)>|<br\s*/?>", " ", p_["html"])
    out.append({"slug": slug, "section": sec, "group_name": p_["group"], "sort": n * 10, "title": p_["title"],
                "body_html": p_["html"], "body_text": re.sub(r"\s+", " ", text(spaced)).strip(),
                "note": p_["note"], "audience": p_["audience"], "owner": SECTIONS[sec][1]})

# ---- /brand-review fixes (Kate, 6 Oct 2026): client lines, applied after conversion ----
BRAND_FIXES = [
    (TXT[1006],
     TXT[1007]),
    (TXT[1008],
     TXT[1009]),
    (TXT[1010], TXT[1011]),
    (TXT[1012],
     TXT[1013]),
    (TXT[1014], TXT[1015]),
    (TXT[1016],
     TXT[1017]),
    (TXT[1018], "Just let us know what works"),
    (TXT[1019], "[Current offer, if any.]"),
    (TXT[1020], "[Current offer, if any.]"),
    (TXT[1021], "[Current offer, if any.]"),
    (TXT[1022], "[Current offer, if any.]"),
    (TXT[1023], "[Current offer, if any.]"),
    (TXT[1024],
     "[Current offer, if any.]"),
    (TXT[1025],
     TXT[1026]),
    (TXT[1027], ""),
    ("cancelations", "cancellations"),
    ("re-do you polish", "redo your polish"),
    (TXT[1028], TXT[1029]),
]
FIX_HITS = {}
for o in out:
    for a, b in BRAND_FIXES:
        for k in ("body_html", "body_text"):
            if a in o[k]:
                o[k] = o[k].replace(a, b); FIX_HITS[a] = FIX_HITS.get(a, 0) + 1
    if o["slug"] == "call-centre-general-enquiries-menu-and-answers":
        o["note"] = ((o["note"] + " ") if o["note"] else "") + TXT[1030]
missed = [a[:50] for a, b in BRAND_FIXES if a not in FIX_HITS and "&amp;" not in a and "& tint" not in a]
print("brand fixes applied:", len(FIX_HITS), "missed:", missed)


# Plain URLs become links that open in a new tab (Kate, 6 Oct 2026: deposit links clickable).
URL_RE = re.compile(r'(?<!href=")(?<!">)(https?://[^\s<>"]+[^\s<>".,;:)])')
for o in out:
    o["body_html"] = URL_RE.sub(lambda m: f'<a href="{m.group(1)}" target="_blank" rel="noopener">{m.group(1)}</a>', o["body_html"])

LEAK = (r"AED\s*\d|\d\s*AED|—|8-[Ss]tep [Cc]onsultation|8-Step Plan\b|8 [Ss]tep|Eight-Step|Ten-Step|5-Step|Glow Club|Circle|Fratelli|Bahrain|Al Marasy|"
        r"\d+\s*%\s*(off|discount)|\d+\s*minutes? treatment|Total Duration|Phorest|respond\.io|use Respond\b|GHL|Shortcuts|Rezwan|\+971|Furless|Jumera|Dhs\b|Sadiyaat")
leaks = [(o["slug"], m.group(0)) for o in out for m in [re.search(LEAK, o["body_text"] + " " + o["title"])] if m]
OUT.mkdir(exist_ok=True)
json.dump(out, open(OUT / "front-desk-pages.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)

SOURCES = [
    (TXT[1031], "Jan 2025", "Front Desk main structure"),
    ("TRS_Front_Desk_Manual_Open_Items.pdf", "Jul 2026", TXT[1032]),
    (TXT[1033], "28 Sep 2026", "deposit authority"),
    (TXT[1034], "28 Sep 2026", "effective date, refunds line"),
    (TXT[1035], "25 Sep 2026", TXT[1036]),
    ("Client deposit page promo.tararosesalon.com/deposit-policy (?client=new / ?client=existing)", "live", "linked, not copied"),
    ("TaraRoseSalon_Cancellation_Policy.docx", "May 2026", "cancellation authority"),
    (TXT[1037], "18 Nov 2025", "confirmation steps"),
    (TXT[1038], "24 Oct 2025", TXT[1039]),
    (TXT[1040], "24 Oct 2025", "reception levels"),
    (TXT[1041], TXT[1042], "one induction page"),
    (TXT[1043], "27 May 2026", "call centre main source"),
    (TXT[1044], "Aug 2025", TXT[1045]),
    ("Revised Flows.docx", "15 May 2025", TXT[1046]),
    ("⭐ general inquiries.docx", "27 May 2025", "menu and FAQ answers"),
    (TXT[1047], "15 May 2025", TXT[1048]),
    ("Follow_Up_Call_Procedure.docx", "27 May 2025", "follow-up calls"),
    (TXT[1049], "Jul 2026", TXT[1050]),
]
OPEN_ITEMS = [
    ("1 Deposit policy", TXT[1051]),
    ("2 No-show / no-confirm", TXT[1052]),
    ("3 New client discount", TXT[1053]),
    ("4 Loyalty programme", TXT[1054]),
    ("5 Municipality section", TXT[1055]),
    ("6 Other removals", TXT[1056]),
]
with open(OUT / "CHANGES-front-desk.md", "w", encoding="utf-8") as f:
    f.write(TXT[1057]
            )
    f.write("## Sections\n\n" + "".join(f"- `{k}`: {t} ({sum(1 for o in out if o['section'] == k)} pages, owner {ow})\n" for k, (t, ow) in SECTIONS.items()))
    f.write("\n## Sources used\n\n" + "".join(f"- {n} ({d}): {u}\n" for n, d, u in SOURCES))
    f.write(TXT[1058] + "".join(f"- **{a}**: {b}\n" for a, b in OPEN_ITEMS))
    f.write(TXT[1059] + "".join(f"- **{s} / {t}**: {n}\n" for s, t, n in CONFIRM))
    for kind_set, head in [({"review note kept for Tara"}, TXT[1060]),
                           (None, TXT[1061])]:
        f.write(f"\n## {head}\n\n")
        for kind, before, after in CHANGES:
            if (kind_set is None and kind in {"review note kept for Tara", "not converted"}) or (kind_set and kind not in kind_set): continue
            f.write(f"- **{kind}**: {before}" + (f"\n  - {after}" if after else "") + "\n")
    f.write("\n## Not converted\n\n")
    for kind, before, after in CHANGES:
        if kind == "not converted": f.write(f"- {before}: {after}\n")
    f.write(TXT[1062]
            
            )
    last = None
    for pg, before, after in SCRIPT_CHANGES:
        if pg != last: f.write(f"\n### {pg}\n\n"); last = pg
        f.write(f"- before: {before}\n  - after: {after}\n")
with open(OUT / "front-desk-preview.html", "w", encoding="utf-8") as f:
    f.write("<meta charset=utf-8><style>body{font:15px system-ui;max-width:820px;margin:auto}"
            "table{border-collapse:collapse}th,td{border:1px solid #ccc;padding:4px 8px;text-align:left;vertical-align:top}.n{background:#fff4d6;padding:6px}h1{margin-top:2em}</style>")
    last = None
    for o in out:
        if o["section"] != last: f.write(f"<h1>{esc(SECTIONS[o['section']][0])}</h1>"); last = o["section"]
        f.write(f"<hr><small>{esc(o['group_name'])} · {o['audience']} · {o['slug']}</small><h2>{esc(o['title'])}</h2>"
                + (f"<p class=n>{esc(o['note'])}</p>" if o["note"] else "") + o["body_html"])
print(f"{len(out)} pages, {sum(len(o['body_html']) for o in out)//1024} KB, {len(CHANGES)} changes, {len(SCRIPT_CHANGES)} script edits, leaks: {leaks}")
last = None
for o in out:
    if o["section"] != last: print(f"\n[{o['section']}] {SECTIONS[o['section']][0]}"); last = o["section"]
    print(f"  {o['group_name']:<26} {o['title']:<52} {len(o['body_html'])/1024:>5.1f} KB {o['audience']:<7}{'  NOTE' if o['note'] else ''}")
