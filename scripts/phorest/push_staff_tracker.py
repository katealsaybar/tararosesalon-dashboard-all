r"""
Push parse_staff_tracker.py's JSON into Supabase phorest_staff_rebooking, replacing
per branch + date (delete then insert, the portal's overwrite rule). 5 Oct 2026.

Writes through push_delete / push_insert with the pushers' own pass, the same way
stock orders do (call() and creds() are borrowed from push_stock_orders.py so the
lock logic lives in one place).

    py push_staff_tracker.py 2026-10-04_staff_tracker.json           # dry run: counts only
    py push_staff_tracker.py 2026-10-04_staff_tracker.json --push
"""
import argparse
import json
import sys
import urllib.parse
from collections import defaultdict
from pathlib import Path

# The pass-gated push helper lives in the cowork folder this repo sits inside
# (claude-cowork-build/phorest data export/stock orders, with the gitignored .push-pass).
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "phorest data export" / "stock orders"))
from push_stock_orders import call, creds  # noqa: E402

COLS = ["branch", "date", "employee_name", "visits", "rebooked", "rebooked_pct",
        "care_factor_pct", "utilisation_pct", "services_ex_vat"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("json")
    ap.add_argument("--push", action="store_true")
    a = ap.parse_args()

    rows = [{c: r.get(c) for c in COLS} for r in json.loads(Path(a.json).read_text(encoding="utf-8"))]
    groups = defaultdict(list)
    for r in rows:
        groups[(r["branch"], r["date"])].append(r)
    print(f"{len(rows)} rows in {len(groups)} branch-days, "
          f"{sum(r['visits'] for r in rows)} visits, {sum(r['rebooked'] for r in rows)} rebooked")
    if not a.push:
        print("dry run; add --push to write")
        return

    base, key = creds()
    endpoint = f"{base}/rest/v1/phorest_staff_rebooking"
    for (b, d) in sorted(groups):
        call("DELETE", f"{endpoint}?{urllib.parse.urlencode({'branch': f'eq.{b}', 'date': f'eq.{d}'})}", key)
        call("POST", endpoint, key, groups[(b, d)])
    print(f"done, {len(groups)} branch-days")


if __name__ == "__main__":
    main()
