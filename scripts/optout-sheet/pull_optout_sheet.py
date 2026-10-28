"""Opt-out sheet refresh (Kate, 28 Oct 2026). Reads Belle's CLIENT MARKETING OPT-OUT LIST and adds any number that is not yet in
lost_send_optout, through optout_sheet_import() (migrations/optout_sheet_import.sql), so the Lost blasts never queue them.

The file is an uploaded .xlsx shared "anyone with the link can view", so nothing here needs a Google login: it is downloaded from the public link
and read straight out of the zip (standard library only). Pure ASCII on purpose, so it can also be run as `git show origin/main:<this file> | python - --push`.

  python pull_optout_sheet.py              dry run: read the sheet, ask the database what it would add, add nothing
  python pull_optout_sheet.py --push       add them
  python pull_optout_sheet.py --json x.json   also write the shaped rows to x.json

Insert only. A number already there is left alone, and a name taken off the sheet stays opted out (clear it by hand if that was meant).
Numbers on the sheet are 05x local, 971 or other countries without the plus; all become digits with 971 in front of a local 10-digit 0 number.
The example row ("E.g ...") and any row without a usable number are skipped and listed. It refuses a file with fewer than MIN_ROWS usable rows,
so a bad download (a Google sign-in page, an empty file) can never be mistaken for the list.
"""
import argparse, io, json, os, re, sys, urllib.request, zipfile

FILE_ID = '1cMSJHcGBaH7FLuMxFj3PPD4WCgIQJmfH'
DOWNLOAD = 'https://drive.google.com/uc?export=download&id=' + FILE_ID
URL = 'https://gvijxenafoowajqktqvd.supabase.co/rest/v1/rpc/optout_sheet_import'
KEY = 'sb_publishable_e5o0vPayb-6552oARTeu7Q_KoqfT7xO'      # the public key the site already carries; the pass is what authorises the call
MIN_ROWS = 30


def download():
    req = urllib.request.Request(DOWNLOAD, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
    if data[:2] != b'PK':
        raise SystemExit('the download is not an xlsx file (first bytes %r): is the link still shared?' % data[:20])
    return data


def read_rows(data):
    z = zipfile.ZipFile(io.BytesIO(data))
    ss = []
    if 'xl/sharedStrings.xml' in z.namelist():
        for si in re.findall(r'<si>(.*?)</si>', z.read('xl/sharedStrings.xml').decode('utf-8'), re.S):
            ss.append(re.sub(r'<[^>]+>', '', si).replace('&amp;', '&').replace('&apos;', "'").replace('&quot;', '"').replace('&lt;', '<').replace('&gt;', '>'))
    x = z.read('xl/worksheets/sheet1.xml').decode('utf-8')
    out = []
    for rn, body in re.findall(r'<row [^>]*?r="(\d+)"[^>]*>(.*?)</row>', x, re.S):
        cells = {}
        for col, attrs, inner in re.findall(r'<c r="([A-Z]+)\d+"([^>]*?)(?:/>|>(.*?)</c>)', body, re.S):
            m = re.search(r'<v>(.*?)</v>', inner or '')
            if not m:
                m2 = re.search(r'<t[^>]*>(.*?)</t>', inner or '', re.S)   # inline string
                if m2:
                    cells[col] = m2.group(1).strip()
                continue
            v = m.group(1)
            cells[col] = ss[int(v)].strip() if 't="s"' in attrs else v.strip()
        out.append((int(rn), cells))
    return out


def digits_of(raw):
    raw = (raw or '').strip()
    if re.fullmatch(r'\d+(\.\d+)?[eE]\+?\d+', raw):          # a number saved in scientific form: expand it exactly
        raw = '%d' % round(float(raw))
    d = re.sub(r'\D', '', raw)
    if d.startswith('00'):
        d = d[2:]
    elif d.startswith('0') and len(d) == 10:
        d = '971' + d[1:]
    return d


def shape(rows):
    keep, skipped = [], []
    head = False
    for rn, c in rows:
        name, phone, branch = c.get('A', ''), c.get('B', ''), c.get('C', '')
        if not head:
            head = name.lower().startswith('client name')   # rows above the header are the title and the note
            continue
        if not name and not phone:
            continue
        if re.match(r'^e\.?g\b', name.lower()):
            skipped.append('row %d: example row (%s)' % (rn, re.sub(r'\s+', ' ', name)))
            continue
        d = digits_of(phone)
        if len(d) < 9 or len(d) > 15:
            skipped.append('row %d: %s has no usable number (%r)' % (rn, name or '(no name)', phone))
            continue
        keep.append({'name': re.sub(r'\s+', ' ', name), 'phone': d, 'branch': branch})
    return keep, skipped


def pass_token():
    t = os.environ.get('TRS_PUSH_PASS')
    if t:
        return t.strip()
    here = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.getcwd()
    for f in (os.path.join(os.getcwd(), '..', '.push-pass'),
              os.path.join(here, '..', '..', '..', 'phorest data export', '.push-pass'),
              r'D:\WORK\Claude\claude-cowork-build\phorest data export\.push-pass'):
        if os.path.exists(f):
            return open(f).read().strip()
    raise SystemExit('no push pass: set TRS_PUSH_PASS or keep it in "phorest data export/.push-pass"')


def call(rows, token, dry):
    body = json.dumps({'p_pass': token, 'p_rows': rows, 'p_dry': dry}).encode()
    req = urllib.request.Request(URL, data=body, method='POST', headers={
        'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode('utf-8'))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--push', action='store_true')
    ap.add_argument('--json')
    a = ap.parse_args()
    rows, skipped = shape(read_rows(download()))
    print('sheet: %d usable rows, %d skipped' % (len(rows), len(skipped)))
    for s in skipped:
        print('  skipped', s)
    if len(rows) < MIN_ROWS:
        raise SystemExit('only %d usable rows (needs %d): not sending, the file looks cut short' % (len(rows), MIN_ROWS))
    if a.json:
        with open(a.json, 'w', encoding='utf-8') as f:
            json.dump(rows, f, indent=1)
    res = call(rows, pass_token(), not a.push)
    print(('pushed' if a.push else 'dry run'), '-> already there:', res['already_there'], '| added:' if a.push else '| would add:', res['added'])
    for n in res['names']:
        print('  +', n)


if __name__ == '__main__':
    main()
