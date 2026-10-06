#!/usr/bin/env python
"""Parse Phorest's Staff Performance Tracker PDFs into rows for phorest_staff_rebooking.

Built 5 Oct 2026 for My Numbers' Phorest switch: this is the one Phorest report we
found with a per-staff Rebooked % (the figure the Phorest app's My Numbers shows,
e.g. "48 Rebooked clients 69.6%"). One PDF per branch per day, from
bulk_download.py --report staff-performance-tracker.

    py parse_staff_tracker.py "<cowork>/phorest data export/staff performance tracker/downloads/ae/"*-2026-10-04.pdf --out 2026-10-04_staff_tracker.json

The PDFs come from the cowork folder's "phorest data export/staff performance tracker"
(a launcher for the shared bulk_download.py); they stay there, out of this public repo.

The page is landscape and stored rotated, so the text comes out of order (an "NA"
can land after the next person's name). Every figure is placed by position instead:
a row is the words sharing one band, a column is the header word it sits under.
The report only gives a percentage; rebooked = round(visits * Rebooked % / 100),
which gives back Phorest's own count (69 visits at 69.6% = 48).
"""
import argparse
import json
import re
import sys
from pathlib import Path

import pymupdf

PREFIX_BRANCH = {"al-quoz": "AQ", "khalifa-city": "KCA", "motor-city": "MC", "saadiyat": "SAA",
                 "bahrain": "BAH"}  # separate Phorest business, --country bh (6 Oct 2026)
FILE_RE = re.compile(r"^(?P<prefix>[a-z-]+?)-staff-performance-tracker-(?P<date>\d{4}-\d{2}-\d{2})\.pdf$")

# Header word -> field. On the rotated page a column is a y position; the header
# word's own y0 is where that column's figures start too.
SINGLE = {"Visits": "visits", "Utilisation": "utilisation_pct", "Rebooked": "rebooked_pct", "Factor": "care_factor_pct"}


def num(s):
    s = s.replace(",", "").replace("%", "")
    if s in ("", "NA"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def columns(words):
    """y0 of each column, read off the header band (rows above the first person)."""
    cols = {}
    for w in words:
        if w[4] in SINGLE:
            cols[SINGLE[w[4]]] = w[1]
    # "Ex VAT" / "Total" pairs under Services, Products, Total and Avg. Bill. The
    # pairs run Services, Products, Total, Avg. Bill from high y to low y.
    ex = sorted((w[1] for w in words if w[4] == "Ex" and w[0] < 190), reverse=True)
    tot = sorted((w[1] for w in words if w[4] == "Total" and 170 < w[0] < 190), reverse=True)
    for i, f in enumerate(["services", "products", "total", "avg_bill"]):
        if i < len(ex):
            cols[f + "_ex_vat"] = ex[i]
        if i < len(tot):
            cols[f + "_total"] = tot[i]
    return cols


def parse_pdf(path: Path):
    m = FILE_RE.match(path.name)
    if not m or m["prefix"] not in PREFIX_BRANCH:
        raise ValueError(f"unexpected file name {path.name}")
    branch, date = PREFIX_BRANCH[m["prefix"]], m["date"]
    doc = pymupdf.open(path)
    rows, cols = [], None
    for page in doc:
        words = page.get_text("words")
        emp = [w for w in words if w[4] == "Employee"]
        if not emp:
            continue
        cols = columns(words)
        # names fill everything above the highest figure column (Utilisation)
        name_y = max(cols.values()) + 50
        head_x = max(w[2] for w in words if w[4] in ("Ex", "VAT", "Visits"))
        body = sorted((w for w in words if w[0] > head_x + 2), key=lambda w: w[0])
        bands = []
        for w in body:
            if bands and abs(w[0] - bands[-1][0][0]) < 4:
                bands[-1].append(w)
            else:
                bands.append([w])
        for band in bands:
            name = " ".join(w[4] for w in sorted(band, key=lambda w: -w[1]) if w[1] >= name_y)
            name = re.sub(r"\s+", " ", name).strip()
            if not name or name == "Total" or name.startswith("Page"):
                continue
            vals = {}
            for w in band:
                if w[1] >= name_y:
                    continue
                f = min(cols, key=lambda k: abs(cols[k] - w[1]))
                if abs(cols[f] - w[1]) < 25:
                    vals[f] = num(w[4])
            visits = int(vals.get("visits") or 0)
            pct = vals.get("rebooked_pct")
            rows.append({
                "branch": branch, "date": date, "employee_name": name,
                "visits": visits,
                "rebooked": round(visits * pct / 100) if pct is not None else 0,
                "rebooked_pct": pct,
                "care_factor_pct": vals.get("care_factor_pct"),
                "utilisation_pct": vals.get("utilisation_pct"),
                "services_ex_vat": vals.get("services_ex_vat"),
            })
    if cols is None:
        raise ValueError(f"{path.name}: no Employee header found")
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdfs", nargs="+")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    out, bad = [], 0
    for p in a.pdfs:
        try:
            r = parse_pdf(Path(p))
            out += r
            print(f"{Path(p).name}: {len(r)} staff, {sum(x['visits'] for x in r)} visits, {sum(x['rebooked'] for x in r)} rebooked")
        except Exception as e:
            bad += 1
            print(f"FAILED {p}: {e}", file=sys.stderr)
    Path(a.out).write_text(json.dumps(out, indent=1), encoding="utf-8")
    print(f"{len(out)} rows -> {a.out}" + (f" ({bad} file(s) failed, left out)" if bad else ""))


if __name__ == "__main__":
    main()
