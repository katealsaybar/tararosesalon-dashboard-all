#!/usr/bin/env python3
"""Builds search-index.js: every word of text the dashboard can show, by page.

Kate, 8 Oct 2026: "every section, sub section that has 'conversion' in it must come
out". The universal search (search.js) could only find headings, labels and table
rows that a page had already drawn this session. This reads the text out of the
source instead, so it is findable whether or not the page has been opened:

  index.html            the static text of every page (#view-*), by section heading
  the page scripts      every sentence and label in their templates (hover tips,
                        notes, tile captions, table headings), attributed to the page
                        that draws it (see FILE_VIEWS and the rules below)
  performance/          the Staff Dashboards frame: its page and scripts
  hub/hub.js            Team Home's sections, so "where is the induction" has an answer

Run from the repo root after any change to page text, then bump the stamp on
search-index.js in index.html:

    python scripts/build-search-index.py

Nothing here is read at run time except the output. The output is data only.
"""
import bisect
import html
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'search-index.js'

# One page script, one page. A file that draws several pages is handled below.
FILE_VIEWS = {
    'compare.js': 'compare', 'google-ads.js': 'googleads', 'website.js': 'website',
    'social.js': 'social', 'products.js': 'products', 'org-chart.js': 'orgchart',
    'staff-weeks.js': 'staffweeks', 'stylist-levels.js': 'stafflevels',
    'top-clients.js': 'clients',
    'lost-clients.js': 'lostclients', 'pulse-narrative.js': 'dashboard',
    'branch-narrative.js': 'branchperf', 'ledger-targets.js': 'ledgerTargets',
}
# The Staff Dashboards frame is a page of its own with its own scripts.
FRAME_VIEWS = {'performance/index.html': 'staffperf'}
for p in (ROOT / 'performance').glob('*.js'):
    FRAME_VIEWS['performance/' + p.name] = 'staffperf'

# dashboard.js: Organisation Pulse unless the function is plainly another page's.
DASH_FN = [
    (re.compile(r'stylist', re.I), None),   # card names and bios: the Team results cover people
    (re.compile(r'svc|service', re.I), 'services'),
    (re.compile(r'cli(ent)?s?($|[A-Z_])|loadAndRenderClients|_renderClients', re.I), 'clients'),
    (re.compile(r'review', re.I), 'reviews'),
]
# branch-ledger.js: the page a lgHeader() call names holds everything after it.
LG_TITLES = {
    'Branch Performance': 'branchperf', 'Daily Target Sheet': 'ledgerTargets',
    'Actuals vs Targets': 'ledgerActuals', 'Financial Totals': 'ledgerFinancials',
    'Daily Stylist Target': 'ledgerStylist',
}
# team-performance.js draws two pages.
TEAM_FN = [(re.compile(r'quad', re.I), 'teamquad'), (re.compile(r'.*'), 'team')]

BLOCK = {'p', 'div', 'li', 'ul', 'ol', 'tr', 'td', 'th', 'table', 'thead', 'tbody', 'section',
         'article', 'header', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br', 'details',
         'summary', 'button', 'label', 'option', 'select', 'form', 'nav', 'aside', 'main',
         'caption', 'figure', 'figcaption', 'dl', 'dt', 'dd'}
HEADS = {'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'summary', 'caption'}
HEAD_CLASS = re.compile(r'(^|[\s_-])(title|heading|head|hd|eyebrow|ttl|lbl-title)($|[\s_-])', re.I)
ATTRS = ('title', 'aria-label', 'placeholder', 'data-tip', 'alt', 'data-title')
VOID = {'br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'col', 'area', 'base', 'wbr'}


def clean(s):
    s = html.unescape(s)
    s = s.replace(' ', ' ').replace('\x00', ' … ')
    s = re.sub(r'\s+', ' ', s).strip()
    s = re.sub(r'\s…\s?([,.;:)!?%])', r'\1', s)      # "180 days … , so" becomes "180 days, so"
    return re.sub(r'(…\s?){2,}', '… ', s)


def trim(t):
    return re.sub(r'^[\s·,.:;\-–—|/…]+|[\s·,:;\-–—|/…]+$', '', t)


def uiish(t, plain=False):
    """Does this read like text a person would see, rather than code or a class list?
    plain: a bare string in a script, where a lone word is as likely a key or a month
    as a label, so it needs two words (or a %) to count."""
    if len(t) < 3 or len(t) > 420:
        return False
    if len(re.findall(r'[A-Za-z]', t)) < (8 if plain else 3):
        return False
    if t[0] == '[' or t.startswith('http'):
        return False
    if re.search(r'[{};]|=>|&&|\|\||\\\\|https?://|^[#.@/]|\.(js|css|html|png|svg|json)\b', t):
        return False
    if re.search(r'\b(select|insert|update|delete)\b.*\b(from|into|set)\b', t, re.I):
        return False
    toks = t.split()
    if plain and len(toks) < 2 and '%' not in t:
        return False
    if plain and (t.isupper() or '_' in t or re.match(r'(?i)loading', t)):
        return False                      # a constant (TARA KIDD), a key or a status line
    if len(toks) == 1:
        # One word: only a plain capitalised or % label (Conversion, Retention %), nothing codey.
        return bool(re.fullmatch(r"[A-Z][a-z]{3,}[%]?|[A-Z][A-Za-z]+ ?%", t))
    codey = sum(1 for w in toks if re.search(r'[_#=]|[a-z][A-Z]|^[.#-]|\w-\w.*\w-\w|\d[a-z]+\d', w))
    if codey * 2 > len(toks):
        return False
    # A class list: lots of hyphenated lowercase words and nothing else.
    if all(re.fullmatch(r'[a-z0-9]+(-[a-z0-9]+)+', w) for w in toks):
        return False
    return True


class Markup(HTMLParser):
    """Text out of (possibly templated) HTML, with its nearest heading."""

    def __init__(self, section=''):
        super().__init__(convert_charrefs=False)
        self.out = []          # (section, text, is_heading)
        self.section = section
        self.buf = []
        self.stack = []        # (tag, is_head)
        self.skip = 0

    def flush(self):
        t = trim(clean(''.join(self.buf)))
        self.buf = []
        if not t or not uiish(t):
            return
        head = any(h for _, h in self.stack)
        if head:
            self.section = t
        self.out.append((self.section, t, head))

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ('script', 'style', 'svg', 'template'):
            self.skip += 1
        if tag in BLOCK:
            self.flush()
        for k in ATTRS:
            v = a.get(k)
            if v:
                v = trim(clean(v))
                if uiish(v):
                    self.out.append((self.section, v, False))
        if tag not in VOID:
            cls = a.get('class') or ''
            self.stack.append((tag, tag in HEADS or bool(HEAD_CLASS.search(cls))))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if tag in BLOCK or any(h for _, h in self.stack[-1:]):
            self.flush()
        if tag in ('script', 'style', 'svg', 'template') and self.skip:
            self.skip -= 1
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                del self.stack[i:]
                break

    def handle_data(self, d):
        if not self.skip:
            self.buf.append(d)

    def handle_entityref(self, name):
        if not self.skip:
            self.buf.append('&' + name + ';')

    def handle_charref(self, name):
        if not self.skip:
            self.buf.append('&#' + name + ';')

    def close(self):
        self.flush()
        super().close()


def markup_texts(s, section=''):
    p = Markup(section)
    try:
        p.feed(s)
        p.close()
    except Exception:
        pass
    return p.out, p.section


# ── JS: every string and template literal ──
def js_literals(src):
    """(position, text) of each string / template literal; ${...} becomes \\x00."""
    out = []
    n = len(src)

    def esc(s, i):
        c = s[i + 1] if i + 1 < len(s) else ''
        m = {'n': ' ', 't': ' ', 'r': ' ', 'b': '', 'f': '', 'v': '', '0': '\x00'}
        if c == 'u' and re.match(r'[0-9a-fA-F]{4}', s[i + 2:i + 6]):
            return chr(int(s[i + 2:i + 6], 16)), 6
        if c == 'x' and re.match(r'[0-9a-fA-F]{2}', s[i + 2:i + 4]):
            return chr(int(s[i + 2:i + 4], 16)), 4
        if c == '\n':
            return '', 2
        return m.get(c, c), 2

    def scan(i, until_brace):
        depth = 0
        prev = ''       # last significant character
        word = ''
        while i < n:
            c = src[i]
            if c == '/' and src[i + 1:i + 2] == '/':
                j = src.find('\n', i)
                i = n if j < 0 else j
                continue
            if c == '/' and src[i + 1:i + 2] == '*':
                j = src.find('*/', i + 2)
                i = n if j < 0 else j + 2
                continue
            if c in '\'"':
                j, buf = i + 1, []
                while j < n and src[j] != c and src[j] != '\n':
                    if src[j] == '\\':
                        ch, w = esc(src, j)
                        buf.append(ch)
                        j += w
                    else:
                        buf.append(src[j])
                        j += 1
                out.append((i, ''.join(buf)))
                i, prev, word = j + 1, 'a', ''
                continue
            if c == '`':
                j, buf, start = i + 1, [], i
                while j < n and src[j] != '`':
                    if src[j] == '\\':
                        ch, w = esc(src, j)
                        buf.append(ch)
                        j += w
                    elif src[j] == '$' and src[j + 1:j + 2] == '{':
                        buf.append('\x00')
                        j = scan(j + 2, True)
                    else:
                        buf.append(src[j])
                        j += 1
                out.append((start, ''.join(buf)))
                i, prev, word = j + 1, 'a', ''
                continue
            if c == '/' and (prev in '' or prev in '(,=:[!&|?{};+-*%<>~^' or word in ('return', 'typeof', 'case', 'in', 'of')):
                j, cls = i + 1, False
                while j < n and src[j] != '\n':
                    if src[j] == '\\':
                        j += 2
                        continue
                    if src[j] == '[':
                        cls = True
                    elif src[j] == ']':
                        cls = False
                    elif src[j] == '/' and not cls:
                        break
                    j += 1
                i, prev, word = j + 1, 'a', ''
                continue
            if until_brace:
                if c == '{':
                    depth += 1
                elif c == '}':
                    if depth == 0:
                        return i + 1
                    depth -= 1
            if c.isalnum() or c in '_$':
                word = (word + c) if (word and (src[i - 1].isalnum() or src[i - 1] in '_$')) else c
                prev = 'a'
            elif not c.isspace():
                prev, word = c, ''
            i += 1
        return i

    scan(0, False)
    return out


def fn_starts(src):
    pos, names = [], []
    for m in re.finditer(r'(?m)^(?:async\s+)?function\s+([A-Za-z0-9_$]+)', src):
        pos.append(m.start())
        names.append(m.group(1))
    return pos, names


def view_names():
    names = {}
    idx = (ROOT / 'index.html').read_text(encoding='utf-8')
    for m in re.finditer(r"showView\('([^']+)'[^>]*>([^<]+)<", idx):
        names.setdefault(m.group(1), clean(m.group(2)))
    return names


class Index:
    def __init__(self):
        self.seen = set()
        self.items = []

    def add(self, view, section, text, head=False):
        text = trim(clean(text))
        section = trim(clean(section))
        if not text:
            return
        k = (view, text.lower())
        if k in self.seen:
            return
        self.seen.add(k)
        self.items.append([view, section if section != text else '', text, 1 if head else 0])


def from_markup_text(ix, view, s, section=''):
    items, section = markup_texts(s, section)
    for sec, t, head in items:
        ix.add(view, sec, t, head)
    return section


def scan_js_file(ix, rel, pick_view, src=None):
    path = ROOT / rel
    if src is None:
        src = path.read_text(encoding='utf-8')
    fpos, fnames = fn_starts(src)
    cur_fn, section, cur_view = None, '', None
    for pos, text in js_literals(src):
        k = bisect.bisect_right(fpos, pos) - 1
        fn = fnames[k] if k >= 0 else ''
        if fn != cur_fn:
            cur_fn, section = fn, ''
        view = pick_view(fn, text, cur_view)
        if view is None:
            continue
        cur_view = view
        if '<' in text and '>' in text:
            section = from_markup_text(ix, view, text, section)
        else:
            t = trim(clean(text))
            if uiish(t, plain=True):
                ix.add(view, section, t)


def main():
    names = view_names()
    ix = Index()

    # 1. The static pages in index.html.
    idx = (ROOT / 'index.html').read_text(encoding='utf-8')
    starts = [(m.start(), m.group(1)) for m in re.finditer(r'<div id="view-([A-Za-z]+)"', idx)]
    for i, (pos, view) in enumerate(starts):
        end = starts[i + 1][0] if i + 1 < len(starts) else idx.find('<script', pos)
        chunk = re.sub(r'<!--.*?-->', '', idx[pos:end], flags=re.S)
        from_markup_text(ix, view, chunk)

    # 2. Page scripts.
    for rel, view in FILE_VIEWS.items():
        scan_js_file(ix, rel, lambda fn, t, cv, v=view: v)

    scan_js_file(ix, 'team-performance.js',
                 lambda fn, t, cv: next(v for rx, v in TEAM_FN if rx.search(fn or '')))

    def dash(fn, t, cv):
        for rx, v in DASH_FN:
            if rx.search(fn or ''):
                return v
        return 'dashboard'
    scan_js_file(ix, 'dashboard.js', dash)

    def ledger(fn, t, cv):
        m = re.fullmatch(r'(?:Ledgers\s*·\s*)?(.+)', clean(t))
        if m and m.group(1) in LG_TITLES:
            return LG_TITLES[m.group(1)]
        return cv or 'branchperf'
    scan_js_file(ix, 'branch-ledger.js', ledger)

    # 3. The Staff Dashboards frame.
    for rel, view in FRAME_VIEWS.items():
        if rel.endswith('.html'):
            page = (ROOT / rel).read_text(encoding='utf-8')
            page = re.sub(r'<!--.*?-->', '', page, flags=re.S)
            from_markup_text(ix, view, page)
        else:
            scan_js_file(ix, rel, lambda fn, t, cv, v=view: v)

    # 4. Team Home's sections (title and blurb), for "where is ...".
    kb = []
    hub = (ROOT / 'hub' / 'hub.js').read_text(encoding='utf-8')
    for blk in re.split(r'\n\s*\{\s*key:', hub)[1:]:
        g = lambda k: (re.search(k + r":\s*'((?:[^'\\]|\\.)*)'", blk) or [None, ''])[1]
        key = re.match(r"\s*'([^']+)'", blk)
        href, title, blurb, dept = g('href'), g('title'), g('blurb'), g('dept')
        if not title or href.startswith('/?view='):
            continue
        if not href and key:
            href = '/hub/kb.html?s=' + key.group(1)
        if href.startswith('http'):
            continue
        kb.append([clean(title.replace("\\'", "'")), clean(blurb.replace("\\'", "'")), dept, href])

    for it in ix.items:
        it[0] = it[0] if it[0] in names else it[0]
    data = {'built': __import__('datetime').date.today().isoformat(), 'items': ix.items, 'kb': kb}
    OUT.write_text('/* Built by scripts/build-search-index.py. Do not edit by hand. */\n'
                   'window.TRS_SEARCH_INDEX=' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n',
                   encoding='utf-8')
    per = {}
    for it in ix.items:
        per[it[0]] = per.get(it[0], 0) + 1
    print(f'{len(ix.items)} lines, {len(kb)} Team Home sections, {OUT.stat().st_size // 1024} KB')
    for v, c in sorted(per.items(), key=lambda x: -x[1]):
        print(f'  {v:18s} {c}')
    if len(sys.argv) > 1:
        q = sys.argv[1].lower()
        for v, s, t, h in ix.items:
            if q in t.lower():
                print(f'[{v}] {s[:40]!r} :: {t[:110]}')


if __name__ == '__main__':
    main()
