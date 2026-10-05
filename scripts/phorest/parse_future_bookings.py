"""
Future bookings -> client_bookings, so the Lost Clients page stops listing clients
who already have an appointment (Kate, 5 Oct 2026).

Lost Clients reads Sales Transactions only, so a client booked for next week shows
as lost until she comes in and pays. Phorest's Staff Appointments report
(Additional reports > Staff > Staff Appointments) lists every appointment between two
dates, per staff member: date, start time, client name, service. It has no client
id, so a booking is matched to the list on the client's name, the same key the list
uses (stl_client_key: lowercase, spaces collapsed).

Export it per branch as CSV ("Download CSV"), from today to about 90 days ahead.
The files land in Downloads as "Staff Appointments.csv", "Staff Appointments (1).csv"
and so on. This script:

1. Collect: works out each file's branch from its salon line (the same lines as the
   New Clients exports, in client-contacts/raw/branch-map.json) and moves it to
   client-contacts/bookings/<BRANCH>/staff-appointments-<BRANCH>-<from date>.csv in
   this repo. That folder's .gitignore is *: the repo is public, client names never go in.
2. Parse: one row per client per branch per day, with the staff and services.
3. Push: replaces each branch's rows in client_bookings through push_delete /
   push_insert (the pass in the cowork folder's phorest data export/.push-pass).

Usage:
    py scripts/phorest/parse_future_bookings.py              # collect, parse the newest file per branch, push
    py scripts/phorest/parse_future_bookings.py --no-collect # re-read what's already filed
    py scripts/phorest/parse_future_bookings.py --no-push    # parse and report only
"""

import argparse
import csv
import io
import json
import re
import shutil
import sys
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
# The pass-gated push helper lives in the cowork folder this repo sits inside
# (claude-cowork-build/phorest data export/stock orders, with the gitignored .push-pass).
sys.path.insert(0, str(HERE.parents[2] / "phorest data export" / "stock orders"))
from push_stock_orders import call, creds  # noqa: E402

DOWNLOADS = Path.home() / "Downloads"
ROOT = HERE.parents[1] / "client-contacts"
DEST = ROOT / "bookings"
MAP_FILE = ROOT / "raw" / "branch-map.json"
BRANCHES = ["SAA", "KCA", "MC", "AQ"]
TODAY = date.today()

TIME = re.compile(r"^\d{1,2}:\d{2}\s*[AP]M$", re.I)
RANGE = re.compile(r"^(\d{2}/\d{2}/\d{2})\s*-\s*(\d{2}/\d{2}/\d{2})")


def squash(s):
    return re.sub(r"\s+", " ", (s or "").strip())


def client_key(name):
    # Same as public.stl_client_key: lower(regexp_replace(trim(name), '\s+', ' ', 'g')).
    return squash(name).lower()


def read_text(path):
    raw = path.read_bytes()
    for enc in ("utf-8-sig", "cp1252"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("latin-1")


def parse(path):
    """-> dict(salon, start, end, rows=[(date, staff, time, client, service)])"""
    info = {"salon": "", "start": None, "end": None, "rows": []}
    day = staff = None
    for i, row in enumerate(csv.reader(io.StringIO(read_text(path)))):
        cells = [c.strip() for c in row] + ["", "", ""]
        a, b, c = cells[0], cells[1], cells[2]
        if i == 1:
            info["salon"] = squash(a)
            continue
        m = RANGE.match(a)
        if m and not info["start"]:
            info["start"], info["end"] = (datetime.strptime(x, "%d/%m/%y").date() for x in m.groups())
            continue
        if TIME.match(a):
            if day and b and not re.match(r"^\s*walk[\s-]*in\b", b, re.I):
                info["rows"].append((day, staff, a, squash(b), squash(c)))
            continue
        if b or c or not a or a == "Start Time" or a.startswith("Page ") or i == 0:
            continue
        try:
            day = datetime.strptime(a, "%d %B %Y").date()
            staff = None
        except ValueError:
            staff = squash(a)
    return info


def collect(bmap):
    for p in sorted(DOWNLOADS.glob("Staff Appointments*.csv")):
        info = parse(p)
        b = bmap.get(info["salon"])
        if not b or not info["start"]:
            print(f"  {p.name}: unknown salon line {info['salon'][:60]!r} or no dates, left in Downloads")
            continue
        out = DEST / b / f"staff-appointments-{b}-{info['start']}.csv"
        out.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(p), out)
        print(f"  {p.name} -> {out.relative_to(ROOT)}  ({info['start']} to {info['end']}, {len(info['rows'])} lines)")


def main():
    sys.stdout.reconfigure(encoding="utf-8")   # the salon line carries Arabic
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-collect", action="store_true")
    ap.add_argument("--no-push", action="store_true")
    args = ap.parse_args()

    bmap = json.loads(MAP_FILE.read_text(encoding="utf-8"))
    bmap = {squash(k): v for k, v in bmap.items()}
    if not args.no_collect:
        collect(bmap)

    pushed = {}
    for b in BRANCHES:
        files = sorted((DEST / b).glob(f"staff-appointments-{b}-*.csv"))
        if not files:
            print(f"{b}: no export filed yet")
            continue
        f = files[-1]                               # newest pull wins
        info = parse(f)
        days = defaultdict(lambda: {"names": [], "staff": [], "services": []})
        for d, staff, _t, client, service in info["rows"]:
            if d < TODAY:
                continue
            x = days[(client_key(client), d)]
            x["names"].append(client)
            if staff and staff not in x["staff"]:
                x["staff"].append(staff)
            if service and service not in x["services"]:
                x["services"].append(service)
        rows = [{"branch": b, "client_key": k, "client_name": x["names"][0], "date": d.isoformat(),
                 "staff": ", ".join(x["staff"]) or None, "services": ", ".join(x["services"]) or None,
                 "pulled_on": TODAY.isoformat()}
                for (k, d), x in sorted(days.items(), key=lambda kv: (kv[0][1], kv[0][0]))]
        pushed[b] = rows
        print(f"{b}: {f.name}  {info['start']} to {info['end']}  "
              f"{len(rows)} client-days, {len({r['client_key'] for r in rows})} clients")

    if args.no_push:
        return
    url, k = creds()
    for b, rows in pushed.items():
        call("DELETE", f"{url}/rest/v1/client_bookings?branch=eq.{b}", k)
        for i in range(0, len(rows), 500):
            call("POST", f"{url}/rest/v1/client_bookings", k, rows[i:i + 500])
        print(f"  pushed {len(rows)} {b} rows to client_bookings")


if __name__ == "__main__":
    main()
