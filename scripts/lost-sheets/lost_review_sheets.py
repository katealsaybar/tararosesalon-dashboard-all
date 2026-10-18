r"""
Lost Clients reception Sheets (Kate, 12 Oct 2026, from the coordinators' meeting).

Reception cannot open the dashboard but answers most of the replies and knows who is a regular, so each branch gets a
Google Sheet of its lost clients with a "Take out?" dropdown (the same five reasons the dashboard uses) and a Note column.
This script makes the sheets, fills them from the dashboard's database and reads the dropdowns back; a client taken out
here is out of every group, To message, Copy numbers and the files, exactly as if a coordinator had taken her out on the page.

    py lost_review_sheets.py auth                  # once: Google sign-in for Sheets (opens a browser), saves token.json
    py lost_review_sheets.py create [--branch SAA] # new sheet per branch, filled; ids go into sheets.json
    py lost_review_sheets.py sync [--dry] [--force]# dropdowns and notes -> dashboard, and what was changed on the dashboard -> just those
                                                   # Take out? and Note cells (what the 15-minute task runs)
    py lost_review_sheets.py update [--branch SAA] # the daily upkeep (what the 06:30 task runs): sync, then refresh the dates, next
                                                   # appointment and Status of existing rows IN PLACE, and add new clients at the
                                                   # bottom. Never rewrites, moves or renames a row.
    py lost_review_sheets.py upgrade               # one-off for a sheet made before the Status column
    py lost_review_sheets.py refresh [--branch SAA]# sync first, then REWRITE every row (rows may move: use only when nobody is editing)
    py lost_review_sheets.py rebuild [--branch SAA]# rewrite the rows and layout WITHOUT syncing (only when nobody has filled anything in)
    py lost_review_sheets.py rows [--branch SAA]   # just count what the database would put in a sheet (no Google)

What a sync does, per branch: reads every row's Take out?, Note and hidden client key. A reason or note that was not there
at the last sync (state.json) is written to the database; a cell that held a reason at the last sync and is now blank
puts her back. A row that has been deleted from the sheet changes nothing. More than 300 changes in one sync stops
(someone pasted over the column) unless --force. The writes go through lost_sheet_apply (migrations/lost_sheet.sql and
lost_review_notes.sql in the dashboard repo), gated by the push pass in "phorest data export/.push-pass".

Columns: A Client, B Last visit, C Last service, D Last smoothing, E Usual stylist / beautician, F Next appointment, G Take out?, H Note, I key (hidden), J Status, K Phone, L Which number?, M Area
(13 Oct 2026: Last smoothing moved in beside Last service and Area went to the end, so G to L did not move).
Phone numbers ARE on the sheets since 12 Oct 2026 (Kate: Cristine asked for them; K, plain text), so share a sheet only with people who may see them. sheets.json, state.json and token.json stay out of git (see .gitignore here).
"""
import argparse
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

# This script lives in the dashboard repo (scripts/lost-sheets, moved from the cowork folder 14 Oct 2026). The repo is public, so
# everything private stays OUTSIDE it, in the cowork folder the checkout sits inside: token.json, state.json, sheets.json, added.json,
# sync.log in "phorest data export/lost review sheets", and the pass-gated push helper + .push-pass in "phorest data export".
HERE = Path(__file__).resolve().parent
COWORK = Path(os.environ.get("TRS_COWORK_DIR") or HERE.parents[2])
DATA = COWORK / "phorest data export" / "lost review sheets"
sys.path.insert(0, str(COWORK / "phorest data export" / "stock orders"))
from push_stock_orders import creds, push_pass  # noqa: E402

BRANCHES = {"SAA": "Saadiyat", "KCA": "Khalifa City A", "MC": "Motor City", "AQ": "Al Quoz"}
REASONS = ["Visiting regularly", "Stylist knows her", "Do not contact", "Wrong number", "Other"]
SHEETS_JSON = DATA / "sheets.json"
STATE_JSON = DATA / "state.json"
TOKEN_JSON = DATA / "token.json"
CLIENT_SECRET = Path(os.environ.get("LOST_REVIEW_CLIENT_SECRET", r"D:\gmail-mcp\credentials\client_secret.json"))
SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]
MAX_CHANGES = 300
TAB = "Review"
HEAD = ["Client", "Last visit", "Last service", "Last smoothing", "Usual stylist / beautician", "Next appointment", "Take out?", "Note", "key", "Status (updates by itself)", "Phone"]
WIDTHS = [210, 100, 100, 120, 190, 130, 170, 260, 100, 250, 150]
FORMAT_ROWS = 6000      # validation, colours and protection reach this far down, so a client added at the bottom has them too


# ── database ───────────────────────────────────────────────────────────────────────────────
def rpc(fn, payload):
    url, key = creds()
    pw = push_pass()
    if not pw:
        sys.exit("no push pass: put it in 'phorest data export/.push-pass'")
    body = dict(payload, p_pass=pw)
    req = urllib.request.Request(f"{url}/rest/v1/rpc/{fn}", data=json.dumps(body).encode(), method="POST",
                                 headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            return json.loads(r.read().decode() or "null")
    except urllib.error.HTTPError as e:
        sys.exit(f"{fn} -> {e.code}: {e.read().decode()[:400]}")


def db_rows(branch):
    return rpc("lost_sheet_rows", {"p_branch": branch})


# ── google ─────────────────────────────────────────────────────────────────────────────────
def google_creds(interactive=False):
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    creds_ = None
    if TOKEN_JSON.exists():
        creds_ = Credentials.from_authorized_user_file(str(TOKEN_JSON), SCOPES)
    if creds_ and creds_.expired and creds_.refresh_token:
        creds_.refresh(Request())
        TOKEN_JSON.write_text(creds_.to_json(), encoding="utf-8")
    if creds_ and creds_.valid:
        return creds_
    if not interactive:
        sys.exit("Not signed in to Google yet. Run:  py lost_review_sheets.py auth")
    flow = InstalledAppFlow.from_client_secrets_file(str(CLIENT_SECRET), SCOPES)
    creds_ = flow.run_local_server(port=0, prompt="consent")
    TOKEN_JSON.write_text(creds_.to_json(), encoding="utf-8")
    return creds_


def service():
    from googleapiclient.discovery import build
    return build("sheets", "v4", credentials=google_creds(), cache_discovery=False)


def load(path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def save(path, obj):
    path.write_text(json.dumps(obj, indent=1, ensure_ascii=False), encoding="utf-8")


def day(d):
    return d[:10] if d else ""


def service_text(r):
    """Last service, or "Retail only, <date>" for a client whose visits since 1 Jan 2025 were all retail (no service to show)."""
    if r.get("last_service"):
        return day(r["last_service"])
    if r.get("last_visit"):
        try:
            return "Retail only, " + date.fromisoformat(r["last_visit"][:10]).strftime("%d %b %Y").lstrip("0")
        except Exception:
            return "Retail only"
    return ""


def as_state(v):
    """state.json holds {"r": reason, "n": note} per client; the first version held just the reason."""
    return v if isinstance(v, dict) else {"r": v, "n": ""}


# ── building a sheet ──────────────────────────────────────────────────────────────────────
# Usual stylist AND usual beautician in one cell (Kate, 12 Oct 2026). Hair or beauty comes from the dashboard's own staff list
# (staff-profiles.js on origin/main, role word: beauty, nail, lash, brow, therap, aesthet), found the way lost-clients.js
# lcProfileKey finds it (surname has to agree; a first name or a nickname under the same surname counts); someone it does not
# know is hair, and assistants and "Business" are left out, as on the page.
DASH = HERE.parents[1]  # the dashboard repo this script sits in
_PROF = None


def profiles():
    global _PROF
    if _PROF is not None:
        return _PROF
    roles, last = {}, {}
    try:
        txt = subprocess.check_output(["git", "-C", str(DASH), "show", "origin/main:staff-profiles.js"], text=True, encoding="utf-8", stderr=subprocess.DEVNULL)
        for m_ in re.finditer(r"^\s*'([^']+)':\s*\{[^}]*?role:\s*'([^']*)'", txt, re.M):
            roles[m_.group(1)] = m_.group(2)
        tail = txt[txt.index("const STAFF_SURNAMES"):]
        for m_ in re.finditer(r"^\s*'([^']+)':\s*'([^']+)'", tail, re.M):
            last[m_.group(1)] = m_.group(2)
    except Exception as e:  # no staff list: everyone reads as hair, and the sheet still works
        print("note: staff-profiles.js not read, everyone shown as a stylist:", str(e)[:80])
    _PROF = (roles, last)
    return _PROF


def profile_key(name):
    roles, last = profiles()
    up = re.sub(r"\.", "", name.strip().upper())
    w = [x for x in up.split() if x]
    if not w:
        return ""
    sur = w[-1] if len(w) > 1 else ""
    last_of = lambda k: (last.get(k) or "").upper().split()[-1] if last.get(k) else ""
    fits = lambda k: not sur or not last.get(k) or last_of(k) == sur
    for k in (up, " ".join(w[:2]), w[0]):
        if k in roles and fits(k):
            return k
    if not sur:
        return ""
    given = w[:-1]
    initials = "".join(x[0] for x in given)
    hits = [k for k in roles if last.get(k) and last_of(k) == sur and (k in given or k == initials or any(len(g) >= 3 and k[:3] == g[:3] for g in given))]
    return hits[0] if len(hits) == 1 else ""


def team_text(r):
    names = [n for n in ([r.get("stylist") or ""] + [x for x in (r.get("also_saw") or "").split(", ")]) if n.strip() and not re.match(r"^\s*business\b", n, re.I)]
    roles, _ = profiles()
    hair = beauty = None
    for n in names:
        role = roles.get(profile_key(n), "")
        if re.search(r"assistant", role, re.I):
            continue
        if re.search(r"beauty|nail|lash|brow|therap|aesthet", role, re.I):
            beauty = beauty or n.strip()
        else:
            hair = hair or n.strip()
    return " · ".join(x for x in (hair, f"Beauty: {beauty}" if beauty else None) if x)


OPTED_OUT = "Opted out based on respond.io (not messaged)"


def status_for(r, added=None, opted_out=False):
    """What the Status column says about a client the database knows (r) or no longer knows (None; opted_out says she asked respond.io to stop)."""
    if r is None:
        return OPTED_OUT if opted_out else "Off the list now (not messaged)"
    new = f"New, added {added}. " if added else ""
    if r.get("excluded"):
        return new + f"Taken out: {r['excluded']} (not messaged)"
    if not (r.get("mobile") or "").strip():
        return new + "No number on file (cannot be messaged)"
    if r.get("wa") == "nonum":  # every number she has was refused by respond.io as malformed (HTTP 400), so none can be messaged
        return new + "No valid number (cannot be messaged)"
    if r.get("wa") in ("optout", "blocked"):
        return new + OPTED_OUT
    if r.get("booked_on"):
        return new + f"Booked {nice(r['booked_on'])} (not messaged)"
    if r.get("recent"):
        return new + "Recent visit (not messaged)"
    if r.get("check_numbers"):
        return new + "Check numbers (not messaged)"
    if r.get("still_smoothing"):
        return new + "Still visiting (smoothing due), in the blast"
    return new + "In the blast"


def nice(d):
    try:
        return date.fromisoformat(d[:10]).strftime("%d %b").lstrip("0")
    except Exception:
        return d or ""


def phone_text(r):
    """The number(s) Phorest has for her. A name that matches more than one client carries every number, so it says so."""
    m_ = (r.get("mobile") or "").strip()
    pick = (r.get("phone_pick") or "").strip()
    if pick and m_:
        others = [x.strip() for x in m_.split(" / ") if x.strip() and x.strip() != pick]
        why = "picked by reception" if r.get("phone_chosen") else "the number active on WhatsApp"
        return pick + (f"  (will message this one, {why}; also on file: " + ", ".join(others) + ")" if others else "")
    if m_ and (r.get("n_numbers") or 0) > 1:
        m_ += "  (2+ numbers, none or several active on WhatsApp: pick hers in Which number?)"
    return m_


def row_values(r, added=None):
    return [r["client_name"], day(r.get("last_visit")), service_text(r), day(r.get("last_smoothing")), team_text(r),
            day(r.get("booked_on")), r.get("excluded") or "", r.get("excluded_note") or "", r["client_key"], status_for(r, added), phone_text(r)]


def fill(svc, sheet_id, tab_id, rows, branch):
    """Write every row from scratch (create, rebuild, refresh). Day to day the sheet is NOT rewritten: see update()."""
    rows = [r for r in rows if not r.get("recent")]
    values = [HEAD + [NUM_HEAD, AREA_HEAD]] + [row_values(r) + ["", r.get("area") or ""] for r in rows]
    format_sheet(svc, sheet_id, tab_id)
    svc.spreadsheets().values().clear(spreadsheetId=sheet_id, range=f"{TAB}!A1:Z20000").execute()
    svc.spreadsheets().values().update(spreadsheetId=sheet_id, range=f"{TAB}!A1", valueInputOption="USER_ENTERED",
                                       body={"values": values}).execute()


def format_sheet(svc, sheet_id, tab_id):
    """Layout, dropdown, colours, protection: safe to run again (it removes the old rules first), and it never touches values."""
    meta = svc.spreadsheets().get(spreadsheetId=sheet_id, fields="sheets(properties.sheetId,protectedRanges.protectedRangeId,conditionalFormats)").execute()
    mine = next(s_ for s_ in meta["sheets"] if s_["properties"]["sheetId"] == tab_id)
    clean = [{"deleteProtectedRange": {"protectedRangeId": p["protectedRangeId"]}} for p in mine.get("protectedRanges", [])]
    clean += [{"deleteConditionalFormatRule": {"sheetId": tab_id, "index": 0}} for _ in mine.get("conditionalFormats", [])]
    if clean:
        svc.spreadsheets().batchUpdate(spreadsheetId=sheet_id, body={"requests": clean}).execute()
    last = FORMAT_ROWS
    rng = lambda c0, c1, r0=1, r1=last: {"sheetId": tab_id, "startRowIndex": r0, "endRowIndex": r1, "startColumnIndex": c0, "endColumnIndex": c1}
    req = [
        {"updateSheetProperties": {"properties": {"sheetId": tab_id, "gridProperties": {"frozenRowCount": 1, "frozenColumnCount": 1, "rowCount": max(last, 6000)}}, "fields": "gridProperties.frozenRowCount,gridProperties.frozenColumnCount,gridProperties.rowCount"}},
        {"repeatCell": {"range": rng(0, 11, 0, 1), "cell": {"userEnteredFormat": {"textFormat": {"bold": True}, "backgroundColor": {"red": .93, "green": .91, "blue": .97}}}, "fields": "userEnteredFormat(textFormat,backgroundColor)"}},
        {"repeatCell": {"range": rng(1, 4), "cell": {"userEnteredFormat": {"numberFormat": {"type": "DATE", "pattern": "d mmm yyyy"}}}, "fields": "userEnteredFormat.numberFormat"}},
        {"repeatCell": {"range": rng(5, 6), "cell": {"userEnteredFormat": {"numberFormat": {"type": "DATE", "pattern": "d mmm yyyy"}}}, "fields": "userEnteredFormat.numberFormat"}},
        {"setDataValidation": {"range": rng(6, 7), "rule": {"condition": {"type": "ONE_OF_LIST", "values": [{"userEnteredValue": x} for x in REASONS]},
                                                              "showCustomUi": True, "strict": True}}},
        {"repeatCell": {"range": rng(10, 11), "cell": {"userEnteredFormat": {"numberFormat": {"type": "TEXT"}}}, "fields": "userEnteredFormat.numberFormat"}},
        {"setBasicFilter": {"filter": {"range": rng(0, 11, 0, last)}}},
        {"updateDimensionProperties": {"range": {"sheetId": tab_id, "dimension": "COLUMNS", "startIndex": 0, "endIndex": 8}, "properties": {"hiddenByUser": False}, "fields": "hiddenByUser"}},
        {"updateDimensionProperties": {"range": {"sheetId": tab_id, "dimension": "COLUMNS", "startIndex": 8, "endIndex": 9}, "properties": {"hiddenByUser": True}, "fields": "hiddenByUser"}},
        {"updateDimensionProperties": {"range": {"sheetId": tab_id, "dimension": "COLUMNS", "startIndex": 9, "endIndex": 11}, "properties": {"hiddenByUser": False}, "fields": "hiddenByUser"}},
    ]
    for i, w in enumerate(WIDTHS):
        req.append({"updateDimensionProperties": {"range": {"sheetId": tab_id, "dimension": "COLUMNS", "startIndex": i, "endIndex": i + 1}, "properties": {"pixelSize": w}, "fields": "pixelSize"}})
    cond = lambda formula, fmt: {"addConditionalFormatRule": {"index": 0, "rule": {"ranges": [rng(0, 11)], "booleanRule": {"condition": {"type": "CUSTOM_FORMULA", "values": [{"userEnteredValue": formula}]}, "format": fmt}}}}
    # the order below is the reverse of how they win: the first one added ends up on top
    req.append(cond('=LEFT($J2,3)="New"', {"backgroundColor": {"red": .87, "green": .96, "blue": .87}}))                            # a client added since
    req.append(cond('=OR(LEFT($J2,3)="Off",LEFT($J2,6)="Recent")', {"textFormat": {"foregroundColor": {"red": .5, "green": .5, "blue": .5}, "italic": True}}))
    req.append(cond('=$F2<>""', {"textFormat": {"foregroundColor": {"red": .5, "green": .5, "blue": .5}}}))                         # booked: grey
    req.append(cond('=$G2<>""', {"backgroundColor": {"red": .99, "green": .88, "blue": .88}}))                                     # taken out: pink
    req.append({"addProtectedRange": {"protectedRange": {"range": rng(0, 6, 0, last), "warningOnly": True, "description": "Only Take out? and Note are yours to change"}}})
    req.append({"addProtectedRange": {"protectedRange": {"range": rng(8, 11, 0, last), "warningOnly": True, "description": "The client key, Status and Phone are kept up to date automatically"}}})
    svc.spreadsheets().batchUpdate(spreadsheetId=sheet_id, body={"requests": req}).execute()


def how_to(branch):
    return [
        [f"Lost Clients review: {BRANCHES[branch]}"],
        [""],
        ["What this is"],
        ["Clients who have not been in for 6+ months and are about to get a WhatsApp or text from Tara Rose. Before it goes out, we take off anyone who should not get it."],
        [""],
        ["What to do"],
        ["1. On the Review tab, find the clients you know: already coming in, known to a stylist, or someone who asked not to be contacted."],
        ["2. In the Take out? column, pick the reason from the dropdown. Add a short note on why in Note if it helps. Leave Take out? empty to keep her in the blast."],
        ["3. Changed your mind? Clear the Take out? cell and she goes back in."],
        ["4. Anyone with a date in Next appointment already has a booking and is not messaged anyway."],
        ["5. Status says Check numbers when a client has 2+ numbers and we cannot tell which is hers. Pick her number in Which number? (the cell is amber until you do). Clear it to go back to the automatic choice."],
        ["6. Status says No number on file when Phorest has no phone number for her. She cannot be messaged until a number is added in Phorest. Status says No valid number when Phorest has a number for her but it is wrong (too short, too long or made up), so WhatsApp refuses it. Fix the number in Phorest and she comes back in."],
        ["7. Last smoothing (beside Last service) shows the date of her last keratin or Supreme Straighten. Filter that column to see the smoothing clients. Status says Still visiting (smoothing due) when she still comes in for other services."],
        ["8. After our message (far right, next to Area) shows what came of the WhatsApp we sent her: Replied, Opted out (STOP / DND), Blocked us, Rebooked with or without a deposit paid, No reply yet, or Waiting to be sent, with the day it went. It updates by itself. Filter it to find the clients to chase: for example Rebooked, deposit not paid yet."],
        ["9. Tell your coordinator when you are done."],
        [""],
        ["Your choices reach the dashboard within a few minutes. Please do not change the other columns, and do not delete rows."],
    ]


def create(branches):
    svc = service()
    ids = load(SHEETS_JSON, {})
    state = load(STATE_JSON, {})
    for b in branches:
        if b in ids:
            print(f"{b}: already has a sheet ({ids[b]['url']}); use refresh")
            continue
        rows = db_rows(b)
        sp = svc.spreadsheets().create(body={"properties": {"title": f"Lost Clients review: {BRANCHES[b]}", "locale": "en_GB"},
                                             "sheets": [{"properties": {"title": TAB}}, {"properties": {"title": "How to"}}]}).execute()
        sid = sp["spreadsheetId"]
        tabs = {s["properties"]["title"]: s["properties"]["sheetId"] for s in sp["sheets"]}
        svc.spreadsheets().values().update(spreadsheetId=sid, range="How to!A1", valueInputOption="RAW", body={"values": how_to(b)}).execute()
        svc.spreadsheets().batchUpdate(spreadsheetId=sid, body={"requests": [
            {"repeatCell": {"range": {"sheetId": tabs["How to"], "startRowIndex": 0, "endRowIndex": 1}, "cell": {"userEnteredFormat": {"textFormat": {"bold": True, "fontSize": 14}}}, "fields": "userEnteredFormat.textFormat"}},
            {"updateDimensionProperties": {"range": {"sheetId": tabs["How to"], "dimension": "COLUMNS", "startIndex": 0, "endIndex": 1}, "properties": {"pixelSize": 900}, "fields": "pixelSize"}}]}).execute()
        fill(svc, sid, tabs[TAB], rows, b)
        ids[b] = {"id": sid, "url": f"https://docs.google.com/spreadsheets/d/{sid}/edit", "tab_id": tabs[TAB], "created": str(date.today())}
        state[b] = {r["client_key"]: {"r": r["excluded"], "n": r.get("excluded_note") or ""} for r in rows if r.get("excluded") and not r.get("recent")}
        save(SHEETS_JSON, ids)
        save(STATE_JSON, state)
        print(f"{b}: {len(rows)} clients -> {ids[b]['url']}")


def read_sheet(svc, b, ids):
    got = svc.spreadsheets().values().get(spreadsheetId=ids[b]["id"], range=f"{TAB}!G2:I20000").execute().get("values", [])
    # A client key can appear twice (someone copied a row). One decision per client: a row with a reason beats a blank one, and of
    # two rows with a reason the lower one (the later edit) wins. The log says when two rows disagree.
    cur, present, seen, where = {}, set(), {}, {}
    for i, row in enumerate(got):
        key = row[2].strip() if len(row) > 2 else ""
        reason = row[0].strip() if row else ""
        note = row[1].strip()[:200] if len(row) > 1 else ""
        if not key:
            continue
        present.add(key)
        where.setdefault(key, []).append(i + 2)   # sheet row number (the data starts on row 2)
        seen[key] = seen.get(key, 0) + 1
        if reason in REASONS:
            if key in cur and cur[key]["r"] != reason:
                print(f"{b}: {key} is on the sheet twice with different reasons ({cur[key]['r']} / {reason}); using the lower row")
            cur[key] = {"r": reason, "n": note}
    dups = [k for k, n in seen.items() if n > 1]
    if dups:
        print(f"{b}: {len(dups)} client(s) appear on the sheet more than once ({', '.join(dups[:5])}{'...' if len(dups) > 5 else ''})")
    return cur, present, where


def db_labels():
    """Every client taken out on the dashboard (or a sheet): {client_key: {"r": reason, "n": note}}."""
    return {x["k"]: {"r": x["r"], "n": x["n"] or ""} for x in rpc("lost_sheet_labels", {})}


def sync(dry=False, force=False, only=None):
    svc = service()
    ids = load(SHEETS_JSON, {})
    state = load(STATE_JSON, {})
    if not ids:
        sys.exit("No sheets yet: run  py lost_review_sheets.py create")
    for b in [x for x in BRANCHES if x in ids and (not only or x == only)]:
        cur, present, where = read_sheet(svc, b, ids)
        old = {k: as_state(v) for k, v in state.get(b, {}).items()}
        old_before = dict(old)
        to_set = [{"k": k, "r": v["r"], "n": v["n"]} for k, v in cur.items() if old.get(k) != v]
        to_clear = [k for k in old if k in present and k not in cur]
        print(f"{b}: {len(present)} rows on the sheet, {len(cur)} taken out; changes since last sync: {len(to_set)} out or changed, {len(to_clear)} back in")
        if len(to_set) + len(to_clear) > MAX_CHANGES and not force:
            print(f"{b}: more than {MAX_CHANGES} changes at once, not applied (use --force if that is right)")
            continue
        if not dry and (to_set or to_clear):
            res = rpc("lost_sheet_apply", {"p_set": to_set, "p_clear": to_clear, "p_by": f"Sheet: {BRANCHES[b]} reception"})
            print(f"{b}: applied {res}")
            old.update(cur)
            for k in to_clear:
                old.pop(k, None)
            state[b] = old
            save(STATE_JSON, state)
        push_back(svc, b, ids, cur, present, where, old_before, old, state, dry)
        numbers_sync(svc, b, ids, state, dry)


def push_back(svc, b, ids, cur, present, where, old_before, old, state, dry):
    """The other direction (Kate, 12 Oct 2026: "the quick sync"): a client taken out, put back, or re-noted on the dashboard is
    written into just her Take out? and Note cells on the sheet, without rewriting the sheet. Only a row the sheet has NOT changed
    since the last sync is touched (a cell someone edited just now was already applied above, and the sheet wins there), so
    nobody's typing is overwritten and nothing is lost: the label lives in the database either way."""
    labels = db_labels()
    data, moved = [], {}
    for key in present:
        sheet_val, was = cur.get(key), old_before.get(key)
        if sheet_val != was:
            continue                      # edited on the sheet since the last sync: already applied, the sheet won
        want = labels.get(key)
        if want == sheet_val:
            continue
        for row in where.get(key, []):
            data.append({"range": f"{TAB}!G{row}:H{row}", "values": [[want["r"] if want else "", want["n"] if want else ""]]})
        moved[key] = want
    if not moved:
        return
    print(f"{b}: {len(moved)} change(s) made on the dashboard written to the sheet")
    if dry:
        return
    for i in range(0, len(data), 400):
        svc.spreadsheets().values().batchUpdate(spreadsheetId=ids[b]["id"], body={"valueInputOption": "RAW", "data": data[i:i + 400]}).execute()
    for k, v in moved.items():
        if v:
            old[k] = v
        else:
            old.pop(k, None)
    state[b] = old
    save(STATE_JSON, state)


NUM_HEAD = "Which number?"      # column L: a dropdown of her numbers for a client with 2+ (Kate, 13 Oct 2026); sync writes the pick to lost_phone_choice


def numbers_sync(svc, b, ids, state, dry):
    """Reception's pick in Which number? goes to the dashboard (lost_sheet_phone_apply); clearing it puts her back on the automatic rule.
    Same rule as Take out?: a cell that differs from the last sync is applied, a cell that held a pick and is now blank is cleared.
    The database ignores a number that is not one of hers."""
    got = svc.spreadsheets().values().get(spreadsheetId=ids[b]["id"], range=f"{TAB}!I2:L20000").execute().get("values", [])
    cur, present = {}, set()
    for row in got:
        key = row[0].strip() if row else ""
        if not key:
            continue
        present.add(key)
        v = row[3].strip() if len(row) > 3 else ""
        if v.startswith("+"):
            cur[key] = v
    sk = "_num_" + b
    old = state.get(sk, {})
    to_set = [{"k": k, "p": v} for k, v in cur.items() if old.get(k) != v]
    to_clear = [k for k in old if k in present and k not in cur]
    if not (to_set or to_clear):
        return
    print(f"{b}: Which number? {len(to_set)} picked or changed, {len(to_clear)} cleared")
    if dry or len(to_set) + len(to_clear) > MAX_CHANGES:
        return
    res = rpc("lost_sheet_phone_apply", {"p_set": to_set, "p_clear": to_clear, "p_by": f"Sheet: {BRANCHES[b]} reception"})
    print(f"{b}: numbers applied {res}")
    old.update(cur)
    for k in to_clear:
        old.pop(k, None)
    state[sk] = old
    save(STATE_JSON, state)


def number_dropdowns(svc, b, ids, rows, with_how_to=False):
    """Column L on the sheet: header, width, and for each client with 2+ numbers a strict dropdown of her numbers (a client added since
    gets one too), plus the current pick if the cell is empty. Never touches any other column and never overwrites a typed cell."""
    sid = ids[b]["id"]
    meta = svc.spreadsheets().get(spreadsheetId=sid, fields="sheets(properties(sheetId,title),conditionalFormats.ranges)").execute()
    tab = next(s_ for s_ in meta["sheets"] if s_["properties"]["title"] == TAB)
    tab_id = tab["properties"]["sheetId"]
    got = svc.spreadsheets().values().get(spreadsheetId=sid, range=f"{TAB}!I2:L20000").execute().get("values", [])
    where = {}
    for i, row in enumerate(got):
        k = row[0].strip() if row else ""
        if k:
            where.setdefault(k, []).append((i + 2, row[3].strip() if len(row) > 3 else ""))
    multi = [r for r in rows if (r.get("n_numbers") or 0) > 1 and r["client_key"] in where]
    reqs, vals = [], []
    for r in multi:
        nums = [x.strip() for x in (r.get("mobile") or "").split(" / ") if x.strip()]
        for rown, cell in where[r["client_key"]]:
            reqs.append({"setDataValidation": {"range": {"sheetId": tab_id, "startRowIndex": rown - 1, "endRowIndex": rown, "startColumnIndex": 11, "endColumnIndex": 12},
                                               "rule": {"condition": {"type": "ONE_OF_LIST", "values": [{"userEnteredValue": x} for x in nums]},
                                                        "showCustomUi": True, "strict": True}}})
            if not cell and r.get("phone_chosen"):
                vals.append({"range": f"{TAB}!L{rown}", "values": [[r["phone_chosen"]]]})
    head = [
        {"repeatCell": {"range": {"sheetId": tab_id, "startRowIndex": 0, "endRowIndex": 1, "startColumnIndex": 11, "endColumnIndex": 12},
                        "cell": {"userEnteredFormat": {"textFormat": {"bold": True}, "backgroundColor": {"red": .93, "green": .91, "blue": .97}}},
                        "fields": "userEnteredFormat(textFormat,backgroundColor)"}},
        {"repeatCell": {"range": {"sheetId": tab_id, "startRowIndex": 1, "endRowIndex": FORMAT_ROWS, "startColumnIndex": 11, "endColumnIndex": 12},
                        "cell": {"userEnteredFormat": {"numberFormat": {"type": "TEXT"}}}, "fields": "userEnteredFormat.numberFormat"}},
        {"updateDimensionProperties": {"range": {"sheetId": tab_id, "dimension": "COLUMNS", "startIndex": 11, "endIndex": 12}, "properties": {"pixelSize": 190}, "fields": "pixelSize"}},
    ]
    has_rule = any(11 in (rg.get("startColumnIndex"), rg.get("endColumnIndex", 0) - 1) for cf in tab.get("conditionalFormats", []) for rg in cf.get("ranges", []))
    if not has_rule:       # amber until reception has picked: Status says Check numbers and the cell is empty
        head.append({"addConditionalFormatRule": {"index": 0, "rule": {"ranges": [{"sheetId": tab_id, "startRowIndex": 1, "endRowIndex": FORMAT_ROWS, "startColumnIndex": 11, "endColumnIndex": 12}],
                     "booleanRule": {"condition": {"type": "CUSTOM_FORMULA", "values": [{"userEnteredValue": '=AND(LEFT($J2,5)="Check",$L2="")'}]},
                                     "format": {"backgroundColor": {"red": 1, "green": .93, "blue": .7}}}}}})
    svc.spreadsheets().values().update(spreadsheetId=sid, range=f"{TAB}!L1", valueInputOption="RAW", body={"values": [[NUM_HEAD]]}).execute()
    svc.spreadsheets().batchUpdate(spreadsheetId=sid, body={"requests": head}).execute()
    for i in range(0, len(reqs), 150):
        svc.spreadsheets().batchUpdate(spreadsheetId=sid, body={"requests": reqs[i:i + 150]}).execute()
    if vals:
        svc.spreadsheets().values().batchUpdate(spreadsheetId=sid, body={"valueInputOption": "RAW", "data": vals}).execute()
    if with_how_to:
        svc.spreadsheets().values().update(spreadsheetId=sid, range="How to!A1", valueInputOption="RAW", body={"values": how_to(b)}).execute()
    print(f"{b}: Which number? dropdown on {len(multi)} client(s)")


AREA_HEAD = "Area"   # column M (Kate, 13 Oct 2026: Last smoothing took Area's place beside Last service, Area moved to the end)


def area_column(svc, b, ids, rows):
    """Column M on the sheet: header, text format, width, protection, the filter widened to take in L and M (so a sort moves them with
    the row), and each listed client's area, matched by the hidden key. Never touches another column; a client the database no longer
    lists keeps what M says."""
    sid = ids[b]["id"]
    meta = svc.spreadsheets().get(spreadsheetId=sid, fields="sheets(properties(sheetId,title),basicFilter,protectedRanges.range)").execute()
    tab = next(s_ for s_ in meta["sheets"] if s_["properties"]["title"] == TAB)
    tab_id = tab["properties"]["sheetId"]
    got = svc.spreadsheets().values().get(spreadsheetId=sid, range=f"{TAB}!I2:M20000").execute().get("values", [])
    by_key = {r["client_key"]: r for r in rows}
    col = []
    for row in got:
        key = row[0].strip() if row else ""
        old = row[4] if len(row) > 4 else ""
        r = by_key.get(key)
        col.append([(r.get("area") or "") if r else old])
    reqs = [
        {"repeatCell": {"range": {"sheetId": tab_id, "startRowIndex": 0, "endRowIndex": 1, "startColumnIndex": 12, "endColumnIndex": 13},
                        "cell": {"userEnteredFormat": {"textFormat": {"bold": True}, "backgroundColor": {"red": .93, "green": .91, "blue": .97}}},
                        "fields": "userEnteredFormat(textFormat,backgroundColor)"}},
        {"repeatCell": {"range": {"sheetId": tab_id, "startRowIndex": 1, "endRowIndex": FORMAT_ROWS, "startColumnIndex": 12, "endColumnIndex": 13},
                        "cell": {"userEnteredFormat": {"numberFormat": {"type": "TEXT"}}}, "fields": "userEnteredFormat.numberFormat"}},
        {"updateDimensionProperties": {"range": {"sheetId": tab_id, "dimension": "COLUMNS", "startIndex": 12, "endIndex": 13}, "properties": {"pixelSize": 90}, "fields": "pixelSize"}},
    ]
    bf = tab.get("basicFilter")
    if bf and bf.get("range", {}).get("endColumnIndex", 0) < 13:       # keep her criteria and sort, just take in L and M
        bf["range"]["endColumnIndex"] = 13
        reqs.append({"setBasicFilter": {"filter": bf}})
    if not any(pr.get("range", {}).get("startColumnIndex") == 12 for pr in tab.get("protectedRanges", [])):
        reqs.append({"addProtectedRange": {"protectedRange": {"range": {"sheetId": tab_id, "startRowIndex": 0, "endRowIndex": FORMAT_ROWS, "startColumnIndex": 12, "endColumnIndex": 13},
                                                              "warningOnly": True, "description": "Area is kept up to date automatically"}}})
    svc.spreadsheets().values().update(spreadsheetId=sid, range=f"{TAB}!M1", valueInputOption="RAW", body={"values": [[AREA_HEAD]]}).execute()
    svc.spreadsheets().batchUpdate(spreadsheetId=sid, body={"requests": reqs}).execute()
    if col:
        svc.spreadsheets().values().update(spreadsheetId=sid, range=f"{TAB}!M2:M{len(col) + 1}", valueInputOption="RAW", body={"values": col}).execute()
    print(f"{b}: Area filled for {sum(1 for c in col if c[0])} client(s)")


OUTCOME_HEAD = "After our message"   # column N (Kate, 18 Oct 2026): what came of the WhatsApp we sent her


def outcome_column(svc, b, ids, outcomes):
    """Column N on the sheet: what happened after our message, from lost_sheet_outcomes() (migrations/lost_sheet_outcomes.sql): Replied,
    Opted out (STOP / DND), Blocked us, Rebooked with or without a deposit, No reply yet, Waiting to be sent, each with the day it was sent.
    Header, width, protection, the filter widened to take N in, colours on the key states, and the text matched by the hidden key
    (a client who was never messaged is blank). Never touches another column."""
    sid = ids[b]["id"]
    meta = svc.spreadsheets().get(spreadsheetId=sid, fields="sheets(properties(sheetId,title),basicFilter,protectedRanges.range,conditionalFormats.ranges)").execute()
    tab = next(s_ for s_ in meta["sheets"] if s_["properties"]["title"] == TAB)
    tab_id = tab["properties"]["sheetId"]
    got = svc.spreadsheets().values().get(spreadsheetId=sid, range=f"{TAB}!I2:N20000").execute().get("values", [])
    col = []
    for row in got:
        key = row[0].strip() if row else ""
        col.append([outcomes.get(key, "") if key else ""])
    rng = lambda r0, r1: {"sheetId": tab_id, "startRowIndex": r0, "endRowIndex": r1, "startColumnIndex": 13, "endColumnIndex": 14}
    reqs = [
        {"repeatCell": {"range": rng(0, 1), "cell": {"userEnteredFormat": {"textFormat": {"bold": True}, "backgroundColor": {"red": .93, "green": .91, "blue": .97}}},
                        "fields": "userEnteredFormat(textFormat,backgroundColor)"}},
        {"repeatCell": {"range": rng(1, FORMAT_ROWS), "cell": {"userEnteredFormat": {"numberFormat": {"type": "TEXT"}}}, "fields": "userEnteredFormat.numberFormat"}},
        {"updateDimensionProperties": {"range": {"sheetId": tab_id, "dimension": "COLUMNS", "startIndex": 13, "endIndex": 14}, "properties": {"pixelSize": 270}, "fields": "pixelSize"}},
    ]
    bf = tab.get("basicFilter")
    if bf and bf.get("range", {}).get("endColumnIndex", 0) < 14:       # keep her criteria and sort, just take in N
        bf["range"]["endColumnIndex"] = 14
        reqs.append({"setBasicFilter": {"filter": bf}})
    if not any(pr.get("range", {}).get("startColumnIndex") == 13 for pr in tab.get("protectedRanges", [])):
        reqs.append({"addProtectedRange": {"protectedRange": {"range": rng(0, FORMAT_ROWS), "warningOnly": True, "description": "After our message is kept up to date automatically"}}})
    if not any(rg.get("startColumnIndex") == 13 for cf in tab.get("conditionalFormats", []) for rg in cf.get("ranges", [])):
        cond = lambda formula, fmt: {"addConditionalFormatRule": {"index": 0, "rule": {"ranges": [rng(1, FORMAT_ROWS)], "booleanRule": {
            "condition": {"type": "CUSTOM_FORMULA", "values": [{"userEnteredValue": formula}]}, "format": fmt}}}}
        # added in reverse of how they win (the first added ends up on top): rebooked without a deposit, then with one, then the bad news
        reqs.append(cond('=LEFT($N2,8)="Rebooked"', {"backgroundColor": {"red": 1, "green": .95, "blue": .8}}))
        reqs.append(cond('=LEFT($N2,22)="Rebooked, deposit paid"', {"backgroundColor": {"red": .85, "green": .95, "blue": .87}}))
        reqs.append(cond('=OR(LEFT($N2,9)="Opted out",LEFT($N2,10)="Blocked us")', {"backgroundColor": {"red": .99, "green": .88, "blue": .88}}))
    svc.spreadsheets().values().update(spreadsheetId=sid, range=f"{TAB}!N1", valueInputOption="RAW", body={"values": [[OUTCOME_HEAD]]}).execute()
    svc.spreadsheets().batchUpdate(spreadsheetId=sid, body={"requests": reqs}).execute()
    if col:
        svc.spreadsheets().values().update(spreadsheetId=sid, range=f"{TAB}!N2:N{len(col) + 1}", valueInputOption="RAW", body={"values": col}).execute()
    tally = {}
    for c in col:
        if c[0]:
            k = c[0].split(" · ")[0]
            tally[k] = tally.get(k, 0) + 1
    print(f"{b}: After our message filled for {sum(tally.values())} client(s): " + ", ".join(f"{k} {n}" for k, n in sorted(tally.items(), key=lambda kv: -kv[1])))


def relayout(only=None, dry=False):
    """One-off (13 Oct 2026) for the sheets as they were: A Client, B Area, C Last visit, D Last service ... M Last smoothing. Moves to
    B Last visit, C Last service, D Last smoothing, M Area. Only B to D and M change, row by row, so G to L (Take out?, Note, key,
    Status, Phone, Which number?) are never touched and the sync is not affected. Does nothing on a sheet whose M already says Area."""
    svc, ids = service(), load(SHEETS_JSON, {})
    for b in [x for x in BRANCHES if x in ids and (not only or x == only)]:
        sid, tab_id = ids[b]["id"], ids[b]["tab_id"]
        head = svc.spreadsheets().values().get(spreadsheetId=sid, range=f"{TAB}!A1:M1").execute().get("values", [[]])[0]
        head = head + [""] * (13 - len(head))
        if head[12] == AREA_HEAD:
            print(f"{b}: already laid out")
            continue
        if head[1] != "Area" or head[12] != "Last smoothing":
            sys.exit(f"{b}: header is not the layout this expects ({head[:4]} ... {head[12]!r})")
        raw = svc.spreadsheets().values().get(spreadsheetId=sid, range=f"{TAB}!A2:M20000", valueRenderOption="FORMATTED_VALUE").execute().get("values", [])
        raw = [r + [""] * (13 - len(r)) for r in raw]
        # new B:D = last visit, last service, last smoothing (old C, D, M); new M = area (old B)
        bd = [[r[2], r[3], r[12]] for r in raw]
        mm = [[r[1]] for r in raw]
        print(f"{b}: {len(raw)} rows: B:D and M re-laid out" + (" (dry)" if dry else ""))
        if dry:
            continue
        n = len(raw)
        reqs = [
            {"repeatCell": {"range": {"sheetId": tab_id, "startRowIndex": 1, "endRowIndex": FORMAT_ROWS, "startColumnIndex": 1, "endColumnIndex": 4},
                            "cell": {"userEnteredFormat": {"numberFormat": {"type": "DATE", "pattern": "d mmm yyyy"}}}, "fields": "userEnteredFormat.numberFormat"}},
            {"repeatCell": {"range": {"sheetId": tab_id, "startRowIndex": 1, "endRowIndex": FORMAT_ROWS, "startColumnIndex": 12, "endColumnIndex": 13},
                            "cell": {"userEnteredFormat": {"numberFormat": {"type": "TEXT"}}}, "fields": "userEnteredFormat.numberFormat"}},
        ] + [{"updateDimensionProperties": {"range": {"sheetId": tab_id, "dimension": "COLUMNS", "startIndex": i, "endIndex": i + 1}, "properties": {"pixelSize": w}, "fields": "pixelSize"}}
             for i, w in ((1, 100), (2, 100), (3, 120), (12, 90))]
        svc.spreadsheets().batchUpdate(spreadsheetId=sid, body={"requests": reqs}).execute()
        svc.spreadsheets().values().batchUpdate(spreadsheetId=sid, body={"valueInputOption": "USER_ENTERED", "data": [
            {"range": f"{TAB}!B1:D1", "values": [HEAD[1:4]]},
            {"range": f"{TAB}!B2:D{n + 1}", "values": bd}]}).execute()
        svc.spreadsheets().values().update(spreadsheetId=sid, range=f"{TAB}!M1:M{n + 1}", valueInputOption="RAW", body={"values": [[AREA_HEAD]] + mm}).execute()
        # check: every row still has the same client, stylist, Take out?, Note, key, Status and Phone, and M holds the old Area
        after = svc.spreadsheets().values().get(spreadsheetId=sid, range=f"{TAB}!A2:M20000", valueRenderOption="FORMATTED_VALUE").execute().get("values", [])
        bad = 0
        for r0, r1 in zip(raw, after):
            r1 = r1 + [""] * (13 - len(r1))
            if [r0[0], *r0[4:11]] != [r1[0], *r1[4:11]] or r1[12] != r0[1]:
                bad += 1
        print(f"{b}: checked {len(after)} rows, {bad} differ")


ADDED_JSON = DATA / "added.json"
NEW_DAYS = 7


def add_new_enabled():
    """The Stop button on the dashboard (Kate, 18 Oct 2026, migrations/lost_sheet_adding.sql): False once someone has stopped new clients
    being added to the sheets. If the function is not there yet or the read fails, carry on as before (add them)."""
    try:
        cfg = rpc("lost_sheet_config", {})
    except SystemExit:
        return True
    return not (isinstance(cfg, dict) and cfg.get("add_new") is False)


def update(only=None, dry=False):
    """The daily upkeep (Kate, 12 Oct 2026: "you can't change the client names in column A: someone may already be editing"). Nothing is
    rewritten and no client row is ever removed, moved or renamed. After a sync (so what was typed is safe), for each existing row only
    Last visit, Last service, Usual stylist, Next appointment and Status are refreshed, matched by the hidden client key; a client the
    database no longer lists keeps her row and says "Off the list now"; a client who has joined the lists since is added at the BOTTOM
    with Status "New, added <date>". Take out? and Note are left to sync / push_back."""
    sync(only=only, dry=dry)
    svc = service()
    ids = load(SHEETS_JSON, {})
    state = load(STATE_JSON, {})
    added = load(ADDED_JSON, {})
    optouts = set(rpc("lost_sheet_optouts", {}) or [])      # opted out or blocked in respond.io, listed or not (lost_sheet_optouts)
    outcomes = rpc("lost_sheet_outcomes", {}) or {}         # what came of our message, per client key (column N)
    adding = add_new_enabled()                              # False after Stop on the dashboard: no new clients at the bottom
    for b in [x for x in BRANCHES if x in ids and (not only or x == only)]:
        rows = db_rows(b)
        by_key = {r["client_key"]: r for r in rows}
        sid = ids[b]["id"]
        if not dry:
            svc.spreadsheets().values().update(spreadsheetId=sid, range=f"{TAB}!A1:K1", valueInputOption="RAW", body={"values": [HEAD]}).execute()
        got = svc.spreadsheets().values().get(spreadsheetId=sid, range=f"{TAB}!A2:K20000").execute().get("values", [])
        on_sheet = set()
        block, stat, phones = [], [], []
        today = date.today()
        mine = added.setdefault(b, {})
        for row in got:
            row = row + [""] * (11 - len(row))
            key = row[8].strip()
            on_sheet.add(key)
            r = by_key.get(key)
            if r is None:
                block.append([row[1], row[2], row[3], row[4], ""])   # keep what it says, clear a stale next appointment
                stat.append([status_for(None, opted_out=key in optouts)])
                phones.append([row[10]])
                continue
            tag = None
            if key in mine and (today - date.fromisoformat(mine[key])).days < NEW_DAYS:
                tag = nice(mine[key])
            block.append([day(r.get("last_visit")), service_text(r), day(r.get("last_smoothing")), team_text(r), day(r.get("booked_on"))])
            stat.append([status_for(r, tag)])
            phones.append([phone_text(r)])
        n = len(got)
        if n and not dry:
            svc.spreadsheets().values().batchUpdate(spreadsheetId=sid, body={"valueInputOption": "USER_ENTERED", "data": [
                {"range": f"{TAB}!B2:F{n + 1}", "values": block}, {"range": f"{TAB}!J2:J{n + 1}", "values": stat}]}).execute()
            svc.spreadsheets().values().update(spreadsheetId=sid, range=f"{TAB}!K2:K{n + 1}", valueInputOption="RAW", body={"values": phones}).execute()   # RAW: +971... stays text
        fresh = [r for r in rows if r["client_key"] not in on_sheet and not r.get("recent")]
        if fresh and not adding:
            print(f"{b}: adding new clients is stopped (dashboard button); {len(fresh)} client(s) not added")
            fresh = []
        if fresh and not dry:
            svc.spreadsheets().values().append(spreadsheetId=sid, range=f"{TAB}!A{n + 2}", valueInputOption="USER_ENTERED", insertDataOption="OVERWRITE",
                                               body={"values": [row_values(r, nice(str(today)))[:10] for r in fresh]}).execute()
            svc.spreadsheets().values().update(spreadsheetId=sid, range=f"{TAB}!K{n + 2}:K{n + 1 + len(fresh)}", valueInputOption="RAW",
                                               body={"values": [[phone_text(r)] for r in fresh]}).execute()
            for r in fresh:
                mine[r["client_key"]] = str(today)
                if r.get("excluded"):
                    state.setdefault(b, {})[r["client_key"]] = {"r": r["excluded"], "n": r.get("excluded_note") or ""}
        off = sum(1 for k in on_sheet if k not in by_key)
        print(f"{b}: refreshed {n} rows in place; {len(fresh)} new client(s) added at the bottom; {off} no longer on the list")
        if not dry:
            number_dropdowns(svc, b, ids, rows)
            area_column(svc, b, ids, rows)
            outcome_column(svc, b, ids, outcomes)
    if not dry:
        save(ADDED_JSON, added)
        save(STATE_JSON, state)


def upgrade(only=None):
    """One-off for sheets made before the Status column: sync, then format (Status column, rules reaching row 6000), then update."""
    sync(only=only)
    svc = service()
    ids = load(SHEETS_JSON, {})
    for b in [x for x in BRANCHES if x in ids and (not only or x == only)]:
        svc.spreadsheets().values().update(spreadsheetId=ids[b]["id"], range=f"{TAB}!A1:K1", valueInputOption="RAW", body={"values": [HEAD]}).execute()
        format_sheet(svc, ids[b]["id"], ids[b]["tab_id"])
        print(f"{b}: Status column and formatting in place")
    update(only=only)


def rewrite(only=None):
    svc = service()
    ids = load(SHEETS_JSON, {})
    state = load(STATE_JSON, {})
    for b in [x for x in BRANCHES if x in ids and (not only or x == only)]:
        rows = db_rows(b)
        fill(svc, ids[b]["id"], ids[b]["tab_id"], rows, b)
        state[b] = {r["client_key"]: {"r": r["excluded"], "n": r.get("excluded_note") or ""} for r in rows if r.get("excluded") and not r.get("recent")}
        print(f"{b}: rewrote {len([r for r in rows if not r.get('recent')])} rows")
    save(STATE_JSON, state)


def refresh(only=None):
    sync(only=only)
    rewrite(only=only)


def rebuild(only=None):
    """Rewrite without reading the sheet first: for a layout change, and only if nobody has filled anything in yet."""
    svc = service()
    ids = load(SHEETS_JSON, {})
    state = load(STATE_JSON, {})
    for b in [x for x in BRANCHES if x in ids and (not only or x == only)]:
        col = svc.spreadsheets().values().get(spreadsheetId=ids[b]["id"], range=f"{TAB}!G2:G20000").execute().get("values", [])
        filled = [r[0] for r in col if r and r[0].strip()]
        if len(filled) > len(state.get(b, {})):
            sys.exit(f"{b}: {len(filled)} rows have a reason on the sheet but only {len(state.get(b, {}))} were synced; run sync first (rebuild would lose them)")
    rewrite(only=only)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["auth", "create", "sync", "update", "upgrade", "refresh", "rebuild", "rows", "numbers", "relayout"])
    ap.add_argument("--branch", choices=list(BRANCHES))
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    bs = [a.branch] if a.branch else list(BRANCHES)
    if a.cmd == "auth":
        google_creds(interactive=True)
        print("Signed in. token.json saved.")
    elif a.cmd == "rows":
        for b in bs:
            rows = db_rows(b)
            print(f"{b}: {len(rows)} clients ({sum(1 for r in rows if r.get('booked_on'))} booked, {sum(1 for r in rows if r.get('excluded'))} already taken out)")
    elif a.cmd == "create":
        create(bs)
    elif a.cmd == "sync":
        sync(dry=a.dry, force=a.force, only=a.branch)
    elif a.cmd == "relayout":
        relayout(only=a.branch, dry=a.dry)
    elif a.cmd == "numbers":
        svc, ids = service(), load(SHEETS_JSON, {})
        for b in [x for x in bs if x in ids]:
            rows_b = db_rows(b)
            number_dropdowns(svc, b, ids, rows_b, with_how_to=True)
            area_column(svc, b, ids, rows_b)
            outcome_column(svc, b, ids, rpc("lost_sheet_outcomes", {}) or {})
    elif a.cmd == "update":
        update(only=a.branch, dry=a.dry)
    elif a.cmd == "upgrade":
        upgrade(only=a.branch)
    elif a.cmd == "refresh":
        refresh(only=a.branch)
    elif a.cmd == "rebuild":
        rebuild(only=a.branch)


if __name__ == "__main__":
    main()
