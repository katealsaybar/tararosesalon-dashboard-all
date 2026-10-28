"""Salon offers refresh (Kate, 28 Oct 2026). Reads the SALON DISCOUNTS Google Sheet and replaces the dashboard's Offered per salon list
(salon_offers, migrations/salon_offers.sql) through salon_offers_import(), on the same push pass as the other pushers.

The sheet is shared "anyone with the link can view", so nothing here needs a Google login: the tab names and gids come from the sheet's public
htmlview page and every tab is read as CSV. Standard library only. Pure ASCII on purpose, so it can also be run as `git show origin/main:<this file> | python - --push`.

  python pull_salon_offers.py              dry run: read the sheet, print what would be sent, send nothing
  python pull_salon_offers.py --push       send it
  python pull_salon_offers.py --json x.json   also write the shaped rows to x.json

What it makes of the sheet:
  - the four "2026 ..." tabs and the Affiliate program tab are the CURRENT list (state act; cf for "for confirmation");
  - an offer whose validity text says "until <date>" with the date in the past is inactive (off), whatever its status says;
  - the INACTIVE ... tabs and Fratelli are the old lists: anything not already on the current list is off (inactive);
  - the sheet's "Tara's Instagram promotion" block (names and phone numbers) is never read.
phorest: ok = set up as an active Phorest discount, arc = archived there only, no = not in Phorest, cf = to confirm, empty = no match (inactive rows).
The Phorest match is by name and lives in PHOREST_NAMES below: when an offer is added in Phorest, add its organisation here (the run prints every
ACTIVE offer tagged no, so a miss shows up). OVERRIDES holds the few facts that are not in the sheet.
It refuses to push a list that looks cut short (fewer than MIN_ROWS rows or MIN_ACTIVE active ones), so a half-loaded sheet cannot wipe the page.
"""
import argparse, csv, datetime, io, json, os, re, sys, urllib.parse, urllib.request

SHEET = '1bU9p5Aih2RDHGMhxc2acWkCCTJgAGs6nff9p_xVOOus'
URL = 'https://gvijxenafoowajqktqvd.supabase.co/rest/v1/rpc/salon_offers_import'
KEY = 'sb_publishable_e5o0vPayb-6552oARTeu7Q_KoqfT7xO'      # the public key the site already carries; the pass is what authorises the call
MIN_ROWS, MIN_ACTIVE = 100, 25
CURRENT = [('2026 KCA', 'KCA'), ('2026 Saadiyat', 'SAA'), ('2026 Motor City', 'MC'), ('2026 Al Quoz', 'AQ')]
OLD = [('INACTIVE KCA', 'KCA'), ('INACTIVE SAA', 'SAA'), ('INACTIVE MC', 'MC'), ('INACTIVE AQ', 'AQ'), ('Fratelli', 'FRA')]
AFFILIATE = 'Affiliate program'

# organisations that are set up in Phorest (names normalised by norm()); a miss shows as "Not on Phorest" on the page
PHOREST_NAMES = [
    'Aldar/Yasmeena Academy', 'The British International School of Abu Dhabi', 'British School of Al Khubairat', 'Irish Society Members',
    'Etihad Airways', 'Cleveland Clinic', 'Mamsha Al Saadiyat residents', 'New York University Abu Dhabi', 'Cranleigh Abu Dhabi', 'Ajwan residents',
    'Chloe Robyn Wilson', 'Gems Metropole', 'Victory Heights Primary School', 'JESS Arabian Ranches', 'Jebel Ali School', 'Ranches Primary',
    'Royal Grammar School Guildford', 'Emirates Airlines', 'Boopin Agency', 'TishTash employees', 'Mama Group - Eklektik Mama', 'Bodytree Studio',
    'BOXiQ', 'O Beach Dubai', 'Strada', 'Xo Property', 'Hyde Real Estate', 'Hoxton Wealth', 'Haus & Haus', 'Simba Investments',
    'Luma', 'Exclusive Links Real Estate Brokers', 'Cencorp', 'Leon Smith']
PHOREST_ARCHIVED = ['Marasy residents']
# facts that are not in the sheet, by normalised organisation: a note, and whether the offer is off
OVERRIDES = {'alanamccanalogue': ('stylist Alan resigned 21 Oct 2026, to confirm', True)}

MONTHS = {m: i + 1 for i, m in enumerate(['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'])}


def norm(s):
    s = (s or '').lower()
    s = re.sub(r'^affiliate\s*[-:]\s*', '', s)
    s = s.replace('yasmeen academy', 'yasmeena academy')
    s = re.sub(r'[:\s]+(clients|members|employees)$', '', s)
    return re.sub(r'[^a-z0-9]', '', s)


PH = {norm(n): 'ok' for n in PHOREST_NAMES}
PH.update({norm(n): 'arc' for n in PHOREST_ARCHIVED})


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode('utf-8')


def read_sheet():
    html = get('https://docs.google.com/spreadsheets/d/%s/htmlview' % SHEET)
    gids = dict(re.findall(r'items\.push\(\{name: "([^"]+)", pageUrl: "[^"]*", gid: "(\d+)"', html))
    want = [t for t, _ in CURRENT + OLD] + [AFFILIATE]
    missing = [t for t in want if t not in gids]
    if missing:
        raise SystemExit('tabs not found in the sheet: %s (found: %s)' % (missing, sorted(gids)))
    tabs = {}
    for t in want:
        csvtxt = get('https://docs.google.com/spreadsheets/d/%s/export?format=csv&gid=%s' % (SHEET, gids[t]))
        tabs[t] = list(csv.reader(io.StringIO(csvtxt)))
    return tabs


def cell(r, i):
    return re.sub('[\u2060\u200b]', '', r[i] if i < len(r) else '').strip()


def tidy(s):
    return re.sub(r'\s*\n\s*', '; ', s).strip('; ').strip()


def ended(text, today):
    """True when the text says 'until <date>' and that date is already past (a bare month means the end of that month)."""
    found = []
    for m in re.finditer(r'(?:until|till)\s+(?:the\s+)?(?:(\d{1,2})(?:st|nd|rd|th)?\s+)?([A-Za-z]{3,9})\.?\s+(\d{4})', text):
        mon = MONTHS.get(m.group(2)[:3].lower())
        if not mon:
            continue
        y = int(m.group(3))
        if m.group(1):
            found.append(datetime.date(y, mon, int(m.group(1))))
        else:
            nxt = datetime.date(y + (mon == 12), mon % 12 + 1, 1)
            found.append(nxt - datetime.timedelta(days=1))
    return bool(found) and max(found) < today


def shape(tabs, today):
    rows, seen = [], {}

    def add(branch, offer, who, stylist, rule, state, src):
        who = re.sub(r'^Affiliate\s*-\s*', 'Affiliate: ', who)
        if 'Affiliate program' in rule and not who.startswith('Affiliate'):
            who = 'Affiliate: ' + who
        k = (branch, norm(who))
        if k in seen:
            r = seen[k]
            if r['src'] == src and r['state'] == state and offer and offer not in r['offer']:
                r['offer'] = (r['offer'] + ' / ' + offer).strip(' /')
            return
        ph = PH.get(norm(who), '')
        if state == 'act' and not ph:
            ph = 'no'
        if state == 'cf':
            ph = 'cf'
        seen[k] = dict(branch=branch, offer=offer, who=who, stylist=stylist, rule=rule, state=state, phorest=ph, src=src)
        rows.append(seen[k])

    def state_of(s):
        s = s.lower()
        return 'cf' if 'confirm' in s else ('act' if s == 'active' else 'off')

    # 1) the 2026 tabs: the current list
    for tab, code in CURRENT:
        for r in tabs[tab][2:]:
            offer, who, sty, st, val, note = [cell(r, i) for i in range(6)]
            if not who and not offer:
                continue
            if not who:
                who = 'Stylist offer: ' + sty
            rule = '; '.join(x for x in [val, tidy(note)] if x)
            state = state_of(st)
            if state != 'off' and ended(val + ' ' + note, today):
                state = 'off'
                rule += ('; ' if rule else '') + 'ended'
            add(code, offer, who, sty, rule, state, 'new')
    # 2) the Affiliate program tab, current
    brmap = {'saadiyat': ['SAA'], 'kca': ['KCA'], 'khalifa city a': ['KCA'], 'all branches': ['SAA', 'KCA', 'MC', 'AQ'], 'al quoz': ['AQ'],
             'fratelli': ['FRA'], 'motorcity': ['MC'], 'motor city': ['MC']}
    for r in tabs[AFFILIATE][1:]:
        off, nm, sty, br, st = [cell(r, i) for i in range(5)]
        if not nm or nm.lower() == 'name':
            continue
        codes = []
        for part in re.split(r'\s+and\s+|,', br.lower()):
            codes += brmap.get(part.strip(), [])
        for b in codes:
            rule = 'Affiliate program' + (', all branches' if br.lower() == 'all branches' else '')
            state = 'off' if st and st.lower() != 'active' else 'act'
            note, off_ = OVERRIDES.get(norm(nm), ('', False))
            if off_:
                state, rule = 'off', rule + '; ' + note
            if b == 'FRA':
                state, rule = 'off', rule + '; Fratelli closed'
            add(b, off or '20% off', 'Affiliate: ' + nm, sty, rule, state, 'new')
    # 3) the old lists: whatever is not on the current list is inactive
    for tab, code in OLD:
        mode = 'old'
        for r in tabs[tab]:
            a = cell(r, 0)
            if not any(cell(r, i) for i in range(len(r))):
                continue
            if len([c for c in r if c.strip()]) == 1 and re.search(r',\s*(ABU DHABI|DUBAI)$', a):
                mode = 'new-hdr'
                continue
            if a.upper().startswith("TARA'S INSTAGRAM"):
                mode = 'skip'
                continue
            if mode == 'skip':
                continue
            if a in ('Discount', 'Discount/Offer'):
                mode = 'new' if a == 'Discount/Offer' else 'old'
                continue
            if mode == 'new-hdr':
                continue
            if mode == 'old':
                offer, who, sty, st, note = [cell(r, i) for i in range(5)]
                val, mark = '', 'From the 2024 list'
            else:
                offer, who, sty, st, val, note = [cell(r, i) for i in range(6)]
                mark = ''
            if not who or norm(who) == 'bisadbsak':
                continue
            rule = '; '.join(x for x in [mark, val, tidy(note)] if x)
            if st.lower() != 'inactive':
                rule += ('; ' if rule else '') + 'not on the 2026 list'
            if code == 'FRA':
                rule += ('; ' if rule else '') + 'Fratelli closed'
            add(code, offer, who, sty, rule, 'off', 'old')
    for r in rows:
        r['offer'] = ' / '.join(re.sub(r'^(\d+)%$', lambda m: m.group(1) + '% off', p.strip()) for p in r['offer'].split(' / '))
        r.pop('src', None)
    return rows


def pass_token():
    t = os.environ.get('TRS_PUSH_PASS')
    if t:
        return t.strip()
    here = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.getcwd()
    for f in (os.path.join(os.getcwd(), '..', '.push-pass'),
              os.path.join(here, '..', '..', '..', 'phorest data export', '.push-pass'),
              r'D:\WORK\Claude\claude-cowork-build\phorest data export\.push-pass'):
        if os.path.exists(f):
            return open(f, encoding='utf-8').read().strip()
    raise SystemExit('no push pass: set TRS_PUSH_PASS or keep it in "phorest data export/.push-pass"')


def push(rows, token):
    body = json.dumps({'p_pass': token, 'p_rows': rows}).encode()
    req = urllib.request.Request(URL, body, {'Content-Type': 'application/json', 'apikey': KEY, 'Authorization': 'Bearer ' + KEY})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--push', action='store_true', help='send the list (default is a dry run)')
    ap.add_argument('--json', help='also write the shaped rows to this file')
    a = ap.parse_args()
    rows = shape(read_sheet(), datetime.date.today())
    n = {s: sum(1 for r in rows if r['state'] == s) for s in ('act', 'cf', 'off')}
    print('%d offers: %d active, %d to confirm, %d inactive' % (len(rows), n['act'], n['cf'], n['off']))
    print('active offers NOT matched to Phorest (add to PHOREST_NAMES if they are set up there):')
    for r in rows:
        if r['state'] == 'act' and r['phorest'] == 'no':
            print('  %s | %s | %s' % (r['branch'], r['who'], r['offer']))
    if a.json:
        json.dump(rows, open(a.json, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    if len(rows) < MIN_ROWS or n['act'] < MIN_ACTIVE:
        raise SystemExit('refusing to push: the list looks cut short (%d rows, %d active; need %d and %d)' % (len(rows), n['act'], MIN_ROWS, MIN_ACTIVE))
    if a.push:
        print('pushed:', push(rows, pass_token()))
    else:
        print('dry run, nothing sent (use --push)')
