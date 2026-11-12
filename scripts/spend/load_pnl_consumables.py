"""Load Accounts' P&L Consumables into the Stock Cost page (Kate, 12 Nov 2026).

Reads the P&L workbook ("2026 Profit and Loss.xlsx"): one tab per salon (KCA, SAA, MC, "Ladies - AQ"), a header row of months ("Jan 2026", "Sept 2026", ...)
and the line "Total for Consumables" (hair and beauty products + kitchen and bathroom supplies + supplies and materials). Sends salon x month to
stock_cost_cons_import(). A month with no figure yet (the P&L only holds closed months) is skipped; a month already loaded is replaced.

  python scripts/spend/load_pnl_consumables.py "C:/Users/user/Downloads/2026 Profit and Loss.xlsx" [--dry-run]

The pass is the Phorest pushers' (push_passes): read from --pass-file, default "phorest data export/.push-pass" next to this repo's sibling cowork folder,
or the TRS_PUSH_PASS environment variable. Needs openpyxl. The figures are never written into this repo.
"""
import argparse, json, os, re, sys, urllib.request
import openpyxl

URL = 'https://gvijxenafoowajqktqvd.supabase.co/rest/v1/rpc/stock_cost_cons_import'
KEY = 'sb_publishable_e5o0vPayb-6552oARTeu7Q_KoqfT7xO'   # the public key the site already carries; the pass is what authorises this call
TABS = {'KCA': 'KCA', 'SAA': 'SAA', 'MC': 'MC', 'LADIES - AQ': 'AQ'}
MONTHS = {'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6, 'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12}


def month_of(h):
    """'Sept 2026' -> (2026, 9); anything else -> None."""
    m = re.match(r'^\s*([A-Za-z]{3,})\.?\s+(\d{4})\s*$', str(h or ''))
    if not m or m.group(1)[:3].lower() not in MONTHS:
        return None
    return int(m.group(2)), MONTHS[m.group(1)[:3].lower()]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('file')
    ap.add_argument('--pass-file')
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()
    wb = openpyxl.load_workbook(a.file, data_only=True)
    rows = []
    for ws in wb.worksheets:
        b = TABS.get(ws.title.strip().upper())
        if not b:
            continue
        head = None
        for r in range(1, 12):
            cells = {}
            for c in range(2, 30):                       # the first run of month headers only: the block to its right repeats them as % of income
                ym = month_of(ws.cell(row=r, column=c).value)
                if not ym:
                    break
                cells[c] = ym
            if len(cells) >= 3:
                head = cells
                break
        line = next((r for r in range(1, ws.max_row + 1) if str(ws.cell(row=r, column=1).value or '').strip().lower().startswith('total for consumables')), None)
        if not head or not line:
            raise SystemExit('tab "%s": no month header or no "Total for Consumables" line' % ws.title)
        for c, ym in head.items():
            v = ws.cell(row=line, column=c).value
            if ym and isinstance(v, (int, float)) and not isinstance(v, bool) and v != 0:
                rows.append({'month': '%d-%02d-01' % ym, 'branch': b, 'amount': round(float(v), 2)})
    print('%d salon-months read: %s' % (len(rows), sorted({r['month'][:7] for r in rows})))
    if a.dry_run:
        return
    pf = a.pass_file or os.environ.get('TRS_PUSH_PASS_FILE') or os.path.join(os.path.dirname(__file__), '..', '..', '..', 'phorest data export', '.push-pass')
    tok = os.environ.get('TRS_PUSH_PASS') or (open(pf).read().strip() if os.path.exists(pf) else '')
    if not tok:
        raise SystemExit('no pass: set TRS_PUSH_PASS or --pass-file')
    body = json.dumps({'p_pass': tok, 'p_rows': rows}).encode()
    req = urllib.request.Request(URL, data=body, headers={'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json'})
    print(json.load(urllib.request.urlopen(req)))


if __name__ == '__main__':
    sys.exit(main())
