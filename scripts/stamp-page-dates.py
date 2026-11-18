#!/usr/bin/env python3
"""Date created / Date modified for every dashboard page and report (Kate, 16 Nov 2026).

The pages and reports are one list, js/pages.js (TRS_PAGES). This script keeps one pair of dates per page in
scripts/page-dates.json (the state, with a fingerprint of the page's own files) and writes js/page-dates.js, which
the dashboard, the Reports Hub and Team Home read.

    python scripts/stamp-page-dates.py --seed     first run only: created and modified are read from git history
    python scripts/stamp-page-dates.py            run before each deploy: a page whose own files changed gets today as
                                                  Date modified; a page that is new in pages.js gets today for both
    python scripts/stamp-page-dates.py --check    exit 1 and list what is stale (nothing is written)

A page's own files are listed in OWN below (the script that draws it, its stylesheet) plus its block in index.html. Shared
files (dashboard.js, report-export.js, the ledger and export helpers) are left out on purpose: touching one of them
changes every page, which would stamp 40 pages as modified for a change to none of them. The fingerprint ignores ?v= text
and line endings, the same way scripts/stamp-assets.py does, so a version-stamp bump alone is not a modification.

The seed skips repo-wide commits (more than BULK files in one commit, such as the 12 Nov 2026 tidy that moved every script)
so those do not count as anyone editing a page. The past dates are therefore best-effort; from the first stamped run on
they are exact to the day the files changed.

KB articles are not here: they live in Supabase (kb_pages) and carry their own created_at / updated_at.
"""
import datetime
import hashlib
import json
import os
import re
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
STATE = os.path.join(ROOT, 'scripts', 'page-dates.json')
OUT = os.path.join(ROOT, 'js', 'page-dates.js')
BULK = 40

# page id -> the files only that page (or its small family) uses.
OWN = {
    'dashboard': ['js/pulse-narrative.js', 'js/pulse-export.js', 'js/pulse-drill.js', 'js/count-up.js'],
    'quarterreport': ['js/quarterly-report.js'],
    'compare': ['js/compare.js'],
    'dailyperf': ['js/daily-performance.js', 'js/daily-addons.js'],
    'overyears': ['js/over-the-years.js'],
    'ledgerFinancials': ['js/branch-ledger.js', 'js/ledger-targets.js', 'js/ledger-targets-db.js'],
    'ledgerTargets': ['js/branch-ledger.js', 'js/ledger-targets.js', 'js/ledger-targets-db.js'],
    'ledgerStylist': ['js/branch-ledger.js', 'js/ledger-targets.js', 'js/ledger-targets-db.js'],
    'ledgerActuals': ['js/branch-ledger.js', 'js/ledger-targets.js', 'js/ledger-targets-db.js'],
    'team': ['js/team-performance.js', 'css/team-performance.css'],
    'teamquad': ['js/team-performance.js', 'css/team-performance.css'],
    'staffperf': ['performance/index.html', 'performance/performance.js', 'performance/performance.css', 'js/staff-dash-export.js'],
    'staffweeks': ['js/staff-weeks.js'],
    'stafflevels': ['js/stylist-levels.js'],
    'one2ones': ['js/one2ones.js'],
    'attrition': ['js/attrition.js'],
    'clients': ['js/top-clients.js'],
    'clientmix': ['js/client-mix.js', 'css/client-mix.css'],
    'retention': ['js/retention.js'],
    'clientbook': ['js/client-book.js'],
    'complaints': ['js/complaints.js', 'js/cmp-people.js'],
    'complaintlog': ['js/complaint-log.js'],
    'complaintchats': ['js/complaint-chats.js'],
    'complaintsdetail': ['js/complaints-detail.js'],
    'lostclients': ['js/lost-clients.js', 'js/lost-consults.js', 'js/lost-review-file.js'],
    'lostlists': ['js/lost-lists.js', 'js/lost-queue.js', 'js/lost-waves.js', 'js/lost-blast.js', 'js/lost-report.js',
                  'js/send-schedule.js', 'css/lost-lists.css', 'css/lost-queue.css', 'css/send-schedule.css'],
    'reviews': ['js/reviews-export.js'],
    'services': ['js/service-rankings.js', 'js/sheet-table.js', 'css/service-rankings.css', 'css/sheet-table.css'],
    'products': ['js/products.js', 'js/product-spend.js', 'css/product-spend.css'],
    'supplierspend': ['js/spend.js'],
    'supplierpay': ['js/supplier-spend.js'],
    'orders': ['js/orders.js', 'css/orders.css'],
    'stockcost': ['js/stock-cost.js'],
    'googleads': ['js/google-ads.js'],
    'metaads': ['js/meta-ads.js'],
    'marketingspend': ['js/marketing-spend.js', 'css/marketing-spend.css'],
    'toolspend': ['js/tool-spend.js', 'css/tool-spend.css'],
    'website': ['js/website.js'],
    'social': ['js/social.js'],
    'wvperf': ['wellness-voucher/index.html', 'js/wv-last.js', 'js/wv-depth.js', 'js/wv-lastsend.js', 'js/wv-remind.js', 'js/wv-messages.js', 'js/wv-blast.js', 'css/wv-blast.css'],
    'campaignblasts': ['js/campaign-blasts.js', 'css/campaign-blasts.css'],
    'contentcalendar': ['js/social-calendar.js', 'css/social-calendar.css'],
    'landingreview': ['js/landing-review.js', 'css/landing-review.css'],
    'recruitment': ['js/recruitment.js', 'css/recruitment.css'],
    'novblasts': ['js/nov-blasts.js', 'css/nov-blasts.css'],
    'stripedeposits': ['js/stripe-phorest.js'],
    'glowclub': ['js/glow-club.js', 'css/glow-club.css'],
    'dealsperf': ['js/active-deals.js', 'css/active-deals.css'],
    'discountsvouchers': ['js/discounts-vouchers.js', 'css/discounts-vouchers.css'],
    'stylists': ['js/stylist-cards.js'],
    'orgchart': ['js/org-chart.js'],
}
STAMP = re.compile(r"\?v=[A-Za-z0-9_.-]+")


def git(*args):
    r = subprocess.run(['git', '-C', ROOT] + list(args), capture_output=True, text=True, encoding='utf-8', errors='replace')
    return r.stdout


def read_pages():
    src = open(os.path.join(ROOT, 'js', 'pages.js'), encoding='utf-8').read()
    m = re.search(r'/\*PAGES\*/(\[.*?\])/\*END\*/', src, re.S)
    pages = json.loads(m.group(1))
    # A retired page is another page now; one marked "inside" is a section of its parent, not a report of its own.
    return [p['id'] for p in pages if not p.get('retired') and not p.get('inside')]


def norm(raw):
    return STAMP.sub('?v=', raw.replace('\r\n', '\n'))


def view_block(index_text, pid):
    key = 'id="view-%s"' % pid
    i = index_text.find(key)
    if i < 0:
        return ''
    j = index_text.find('id="view-', i + len(key))
    return index_text[i:(j if j > 0 else i + 20000)]


def fingerprint(pid, index_text):
    h = hashlib.sha1()
    for rel in OWN.get(pid, []):
        p = os.path.join(ROOT, rel)
        if os.path.isfile(p):
            h.update(rel.encode())
            h.update(norm(open(p, encoding='utf-8', errors='replace').read()).encode('utf-8'))
    h.update(norm(view_block(index_text, pid)).encode('utf-8'))
    return h.hexdigest()[:12]


_bulk = {}


def is_bulk(sha):
    if sha not in _bulk:
        _bulk[sha] = len([x for x in git('show', '--name-only', '--format=', sha).splitlines() if x.strip()]) > BULK
    return _bulk[sha]


def commits(args):
    """[(sha, YYYY-MM-DD)] newest first, repo-wide commits dropped."""
    out = []
    for line in git('log', '--date=format:%Y-%m-%d', '--format=%H %cd', *args).splitlines():
        sha, d = line.split()
        if not is_bulk(sha):
            out.append((sha, d))
    return out


def seed_from_git(pid):
    created, modified = [], []
    for rel in OWN.get(pid, []):
        if not os.path.isfile(os.path.join(ROOT, rel)):
            continue
        cs = commits(['--follow', '--', rel])
        if cs:
            created.append(cs[-1][1])
            modified.append(cs[0][1])
    # The page's block in index.html: first appearance of its container, and the commits that mention it.
    first = commits(['-S', 'id="view-%s"' % pid, '--', 'index.html'])
    if first:
        created.append(first[-1][1])
    mention = commits(['-G', r'view-%s\b' % pid, '--', 'index.html'])
    if mention:
        modified.append(mention[0][1])
    if not created:
        return None
    # Never earlier than the first commit that has the page in pages.js when nothing older was found.
    c = min(created)
    m = max(modified) if modified else c
    return c, max(m, c)


def dirty(pid):
    """True when one of the page's own files has uncommitted changes."""
    files = [f for f in OWN.get(pid, []) if os.path.isfile(os.path.join(ROOT, f))]
    return bool(files) and bool(git('status', '--porcelain', '--', *files).strip())


def write_js(state, ids):
    rows = ',\n'.join('  %s: [%s, %s]' % (json.dumps(i), json.dumps(state[i]['created']), json.dumps(state[i]['modified']))
                      for i in ids if i in state)
    open(OUT, 'w', encoding='utf-8', newline='\n').write(
        '/* GENERATED by scripts/stamp-page-dates.py (Kate, 16 Nov 2026). Do not edit by hand. { pageId: [Date created, Date modified] }, ISO days.\n'
        '   The words "03 May 2026" are drawn from these by trsDateLabel (pages.js); the banner under each page title is trsDatesBanner (page-status.js). */\n'
        'window.TRS_PAGE_DATES = /*DATES*/{\n' + rows + '\n}/*END*/;\n')


def main():
    seed, check = '--seed' in sys.argv, '--check' in sys.argv
    today = datetime.date.today().isoformat()
    ids = read_pages()
    index_text = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
    state = json.load(open(STATE, encoding='utf-8')) if os.path.isfile(STATE) else {}
    stale = []
    for pid in ids:
        fp = fingerprint(pid, index_text)
        cur = state.get(pid)
        if cur is None:
            # A new page: committed files give their real dates (seed, or a page that was committed before this ran); otherwise today.
            got = seed_from_git(pid) if (seed or not dirty(pid)) else None
            c, m = got if got else (today, today)
            state[pid] = {'created': c, 'modified': m, 'fp': fp}
            stale.append('%s: new (%s, %s)' % (pid, c, m))
        elif cur['fp'] != fp:
            if seed:
                cur['fp'] = fp
            else:
                # Edited and not yet committed: today. Already committed (this checkout was behind, or someone else shipped it): the day it was committed.
                got = None if dirty(pid) else seed_from_git(pid)
                new = max(got[1], cur['modified']) if got else today
                stale.append('%s: files changed, modified %s -> %s' % (pid, cur['modified'], new))
                cur['modified'] = new
                cur['fp'] = fp
    for pid in list(state):
        if pid not in ids:
            del state[pid]
            stale.append('%s: no longer a page' % pid)
    if check:
        have = open(OUT, encoding='utf-8').read() if os.path.isfile(OUT) else ''
        if stale or not have:
            print('Page dates are stale. Run: python scripts/stamp-page-dates.py\n  ' + '\n  '.join(stale or ['js/page-dates.js missing']))
            return 1
        print('Page dates are current (%d pages).' % len(ids))
        return 0
    json.dump(state, open(STATE, 'w', encoding='utf-8', newline='\n'), indent=1, sort_keys=True)
    write_js(state, ids)
    print('%d pages. %s' % (len(ids), ('Changed: ' + '; '.join(stale)) if stale else 'Nothing changed.'))
    return 0


if __name__ == '__main__':
    sys.exit(main())
