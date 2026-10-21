"""Load Accounts' Supplier Balance files into the Stock and Supplier Spend page (Kate, 21 Oct 2026).

Reads the monthly summary sheet ("September 2026", "October 2026", ...) of the three files Accounts keeps:
  ALL (Tara Rose Salon Accounts)  Saadiyat and Khalifa City A   columns KCA, Saadiyat
  Motor City Tara Rose Salon LLC  Motor City                    column Motor City
  Al Quoz Dubai Branch            Al Quoz                       columns Ladies + Gents + Specialized
and sends supplier x branch x month to spend_import(). The sheet follows what Accounts paid in the month, not invoice dates (migrations/stock_spend_report.sql). Every supplier named on a
sheet is sent too, so one with no spend that month is still listed. A month already loaded is replaced; the supplier
tags and brand links set on the page are not touched.

  python scripts/spend/load_supplier_months.py --dir "C:/Users/user/Downloads/acc and admin" --months 2026-09 2026-10 [--dry-run]

The pass is the Phorest pushers' (push_passes): read from --pass-file, default "phorest data export/.push-pass" next to this
repo's sibling cowork folder, or the TRS_PUSH_PASS environment variable. Needs openpyxl.
"""
import argparse, glob, json, os, re, sys, urllib.request
import openpyxl

URL = 'https://gvijxenafoowajqktqvd.supabase.co/rest/v1/rpc/spend_import'
KEY = 'sb_publishable_e5o0vPayb-6552oARTeu7Q_KoqfT7xO'   # the public key the site already carries; the pass is what authorises this call
MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
ALIAS = {'COSMO LINE': 'COSMOLINE', 'COSMOLNE': 'COSMOLINE', 'JENNIFFER': 'JENNIFER', 'I AM RAFUNZEL': 'I AM RAPUNZEL',
         'WELL BE': 'WELLBE', 'SUKHOON': 'SUKOON'}
# (file name contains, branch for each header)
FILES = [
    ('ALL (', {'KCA': 'KCA', 'SAADIYAT': 'SAA'}),
    ('Motor City', {'MOTOR CITY': 'MC'}),
    ('Al Quoz', {'LADIES': 'AQ', 'GENTS': 'AQ', 'SPECIALIZED': 'AQ'}),
]


def norm(n):
    n = re.sub(r'\s+', ' ', str(n).strip().upper())
    return ALIAS.get(n, n)


def num(x):
    return float(x) if isinstance(x, (int, float)) and not isinstance(x, bool) else 0.0


def find_sheet(wb, year, month):
    want = '%s %d' % (MONTHS[month - 1], year)
    for ws in wb.worksheets:
        if re.sub(r'\s+', ' ', ws.title.strip().lower()) == want:
            return ws
    return None


def read_sheet(ws, heads):
    """{supplier: {branch: amount}} and every supplier name on the sheet, from the first table (up to the first blank header)."""
    cols = {}
    for c in range(2, 20):
        h = ws.cell(row=1, column=c).value
        if h is None:
            break
        b = heads.get(str(h).strip().upper())
        if b:
            cols[c] = b
    if not cols:
        raise SystemExit('no known branch columns on sheet "%s" (row 1: %s)' % (ws.title, [c.value for c in ws[1]][:8]))
    out, names = {}, set()
    for r in range(2, ws.max_row + 1):
        n = ws.cell(row=r, column=1).value
        if n is None:
            continue
        if str(n).strip().lower() == 'total':
            break
        names.add(norm(n))
        for c, b in cols.items():
            v = num(ws.cell(row=r, column=c).value)
            if v:
                out.setdefault(norm(n), {}).setdefault(b, 0.0)
                out[norm(n)][b] += v
    return out, names


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dir', required=True)
    ap.add_argument('--months', nargs='+', required=True, help='YYYY-MM, one or more')
    ap.add_argument('--pass-file')
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()

    rows, names = [], set()
    for ym in a.months:
        y, m = [int(x) for x in ym.split('-')]
        for token, heads in FILES:
            f = [p for p in glob.glob(os.path.join(a.dir, '*Supplier Balance*.xlsx')) if token.lower() in os.path.basename(p).lower()]
            if len(f) != 1:
                raise SystemExit('expected one Supplier Balance file with "%s" in %s, found %d' % (token, a.dir, len(f)))
            ws = find_sheet(openpyxl.load_workbook(f[0], data_only=True), y, m)
            if ws is None:
                raise SystemExit('no "%s %d" sheet in %s' % (MONTHS[m - 1], y, os.path.basename(f[0])))
            got, nm = read_sheet(ws, heads)
            names |= nm
            for s, bs in got.items():
                for b, v in bs.items():
                    rows.append({'month': '%04d-%02d-01' % (y, m), 'supplier': s, 'branch': b, 'amount': round(v, 2)})
        tot = {}
        for r in rows:
            if r['month'].startswith(ym):
                tot[r['branch']] = tot.get(r['branch'], 0) + r['amount']
        print(ym, {b: round(v) for b, v in sorted(tot.items())})
    print('%d rows, %d suppliers' % (len(rows), len(names)))
    if a.dry_run:
        return

    pf = a.pass_file or os.environ.get('TRS_PUSH_PASS_FILE') or os.path.join(os.path.dirname(__file__), '..', '..', '..', 'phorest data export', '.push-pass')
    tok = os.environ.get('TRS_PUSH_PASS') or (open(pf).read().strip() if os.path.exists(pf) else '')
    if not tok:
        raise SystemExit('no pass: set TRS_PUSH_PASS or --pass-file')
    body = json.dumps({'p_pass': tok, 'p_rows': rows, 'p_suppliers': sorted(names)}).encode()
    req = urllib.request.Request(URL, data=body, headers={'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json'})
    print(json.load(urllib.request.urlopen(req)))


if __name__ == '__main__':
    main()
