"""
Mobile audit for the dashboard (Kate, 25 Sep 2026).

Loads every view at six sizes and records, per view and size:
  hscroll   page-level sideways scroll (documentElement.scrollWidth > innerWidth)
  taps      visible buttons / links / chips / selects / inputs under 44x44px
  text      visible text under 12px
  offhead   controls inside the fixed header that sit off-screen
  chrome    pinned chrome (fixed + sticky bars stacked from the top) as a share
            of the viewport, measured after scrolling down and back up a little,
            which is the worst case once the header comes back

Phones fail on any of them; pinned chrome fails over 15%. Desktop (1440x900)
is only screenshotted, for the before/after pixel comparison.

It serves this repo itself on a local port, so no dev server is needed. Data is
the live Supabase read, the same the site uses.

  python scripts/mobile-audit.py before            # writes mobile-audit/before/
  python scripts/mobile-audit.py after
  python scripts/mobile-audit.py --compare before after

Screenshots carry real figures and staff names, and this repo is a public Pages
site, so mobile-audit/ is gitignored. Needs: pip install playwright pillow;
python -m playwright install chromium.
"""
import functools, http.server, json, socketserver, sys, threading, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'mobile-audit'

VIEWS = ['dashboard', 'dashboard-open', 'branchperf', 'compare', 'team', 'staffperf',
         'stylists', 'orgchart', 'ledgerFinancials', 'ledgerTargets', 'ledgerActuals',
         'ledgerStylist', 'services', 'clients', 'reviews']
SIZES = [(320, 640), (375, 667), (390, 844), (430, 932), (844, 390), (1440, 900)]
PHONE_CHROME_MAX = 0.15

# Everything the page measures, in one pass. Returned as plain JSON.
PROBE = r"""
() => {
  const W = innerWidth, H = innerHeight;
  const vis = el => {
    if (!el.checkVisibility || !el.checkVisibility({checkOpacity:true, checkVisibilityCSS:true})) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const name = el => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    else if (el.classList.length) s += '.' + [...el.classList].slice(0,2).join('.');
    const t = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g,' ').slice(0,28);
    return t ? `${s} "${t}"` : s;
  };
  // Controls. Text links inside running prose are exempt (WCAG 2.5.8 inline exception).
  const ctl = [...document.querySelectorAll('button, a[href], [onclick], select, input:not([type=hidden]), [role=button], summary')]
    .filter(el => !el.closest('[aria-hidden="true"]'))
    .filter(vis)
    .filter(el => !(el.tagName === 'A' && el.closest('p, li') && !el.closest('nav, .side-nav')));
  const small = [];
  ctl.forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width < 44 || r.height < 44) small.push(`${name(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
  });
  // Text under 12px: elements that own a non-blank text node.
  const tiny = [];
  document.querySelectorAll('body *').forEach(el => {
    if (['SCRIPT','STYLE','NOSCRIPT','TEMPLATE'].includes(el.tagName)) return;
    const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (!own) return;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs >= 12 || !vis(el)) return;
    tiny.push(`${name(el)} ${fs}px`);
  });
  // Header controls off-screen.
  const bar = document.getElementById('topbar');
  const off = bar ? [...bar.querySelectorAll('button, a, select, input, [onclick]')].filter(vis)
    .filter(el => { const r = el.getBoundingClientRect(); return r.right > W + 1 || r.left < -1; })
    .map(el => { const r = el.getBoundingClientRect(); return `${name(el)} x=${Math.round(r.left)}-${Math.round(r.right)}`; }) : [];
  return {
    W, H,
    scrollW: document.documentElement.scrollWidth,
    hscroll: document.documentElement.scrollWidth > W,
    taps: [...new Set(small)], text: [...new Set(tiny)], offhead: off,
  };
}
"""

# Pinned chrome: chain fixed/sticky bars down from the top edge.
CHROME = r"""
() => {
  const W = innerWidth, H = innerHeight;
  const els = [...document.querySelectorAll('body *')].filter(el => {
    const p = getComputedStyle(el).position;
    if (p !== 'fixed' && p !== 'sticky') return false;
    if (!el.checkVisibility || !el.checkVisibility({checkOpacity:true, checkVisibilityCSS:true})) return false;
    const r = el.getBoundingClientRect();
    return r.width > W * 0.5 && r.height > 0 && r.bottom > 0 && r.top < H * 0.9;
  }).map(el => { const r = el.getBoundingClientRect(); return {n: el.id || el.className, t: r.top, b: r.bottom}; })
    .sort((a, b) => a.t - b.t);
  let bottom = 0; const hit = [];
  els.forEach(e => { if (e.t <= bottom + 2 && e.b > bottom) { bottom = e.b; hit.push(String(e.n).slice(0,30)); } });
  return {px: Math.round(bottom), share: +(bottom / H).toFixed(3), bars: hit};
}
"""


def serve():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
    handler.log_message = lambda *a, **k: None
    httpd = socketserver.ThreadingTCPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, httpd.server_address[1]


def open_view(page, view):
    base = 'dashboard' if view == 'dashboard-open' else view
    page.evaluate("""v => { const el = document.querySelector(`.nav-sub[onclick*="'${v}'"]`);
                            showView(v, el); }""", base)
    if view == 'dashboard-open':
        page.evaluate("() => { document.body.classList.add('revealed'); sizeTopbar(); }")
    page.evaluate("() => scrollTo(0, 0)")
    # Renderers fetch on first open; give them their round trip. The page polls
    # for fresh data, so it rarely goes fully idle: cap the wait short.
    try:
        page.wait_for_load_state('networkidle', timeout=4000)
    except Exception:
        pass
    page.wait_for_timeout(800)


def run(tag):
    from playwright.sync_api import sync_playwright
    out = OUT / tag
    (out / 'shots').mkdir(parents=True, exist_ok=True)
    httpd, port = serve()
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for w, h in SIZES:
            phone = w < 900
            ctx = browser.new_context(viewport={'width': w, 'height': h},
                                      device_scale_factor=1 if not phone else 2,
                                      is_mobile=phone, has_touch=phone,
                                      color_scheme='light')
            page = ctx.new_page()
            page.goto(f'http://127.0.0.1:{port}/index.html', wait_until='domcontentloaded')
            page.wait_for_function("() => { const h = document.getElementById('pulseHeadline');"
                                   " return h && !/Reading the numbers/.test(h.textContent); }", timeout=60000)
            page.wait_for_timeout(1500)
            for view in VIEWS:
                open_view(page, view)
                shot = out / 'shots' / f'{view}-{w}x{h}.png'
                page.screenshot(path=str(shot), full_page=not phone)
                row = {'view': view, 'size': f'{w}x{h}', 'phone': phone}
                if phone:
                    row.update(page.evaluate(PROBE))
                    sh = page.evaluate('() => document.documentElement.scrollHeight')
                    if sh > h + 900:
                        page.mouse.wheel(0, 900); page.wait_for_timeout(500)
                        page.mouse.wheel(0, -300); page.wait_for_timeout(700)
                        row['chrome'] = page.evaluate(CHROME)
                        page.screenshot(path=str(out / 'shots' / f'{view}-{w}x{h}-scrolled.png'))
                    else:
                        row['chrome'] = None
                results.append(row)
                print(f"{tag} {view:16} {w}x{h}", summarise_row(row), flush=True)
            ctx.close()
        browser.close()
    httpd.shutdown()
    (out / 'results.json').write_text(json.dumps(results, indent=1), encoding='utf-8')
    (out / 'summary.md').write_text(summary_md(results, tag), encoding='utf-8')
    fails = sum(1 for r in results if row_fails(r))
    print(f'\n{tag}: {fails} of {sum(r["phone"] for r in results)} phone checks fail. See {out / "summary.md"}')
    return 1 if fails else 0


def row_fails(r):
    if not r['phone']:
        return False
    c = r.get('chrome')
    return bool(r['hscroll'] or r['taps'] or r['text'] or r['offhead']
                or (c and c['share'] > PHONE_CHROME_MAX))


def summarise_row(r):
    if not r['phone']:
        return 'shot'
    c = r.get('chrome')
    return (f"hscroll={'Y' if r['hscroll'] else '-'}({r['scrollW']}) taps={len(r['taps'])} "
            f"text={len(r['text'])} offhead={len(r['offhead'])} "
            f"chrome={c['share'] if c else 'n/a'}")


def summary_md(results, tag):
    lines = [f'# Mobile audit: {tag}', '',
             '| View | Size | H-scroll | Taps <44 | Text <12px | Header off-screen | Pinned chrome |',
             '|---|---|---|---|---|---|---|']
    for r in results:
        if not r['phone']:
            continue
        c = r.get('chrome')
        lines.append(f"| {r['view']} | {r['size']} | {'FAIL ' + str(r['scrollW']) if r['hscroll'] else 'ok'} | "
                     f"{len(r['taps'])} | {len(r['text'])} | {len(r['offhead'])} | "
                     f"{(str(round(c['share'] * 100)) + '%') if c else 'n/a'} |")
    lines += ['', '## Detail', '']
    for r in results:
        if r['phone'] and row_fails(r):
            lines.append(f"### {r['view']} {r['size']}")
            for k in ('offhead', 'taps', 'text'):
                if r[k]:
                    lines.append(f"- **{k}**: " + '; '.join(r[k][:25]) + (' …' if len(r[k]) > 25 else ''))
            if r.get('chrome'):
                lines.append(f"- **chrome**: {r['chrome']}")
            lines.append('')
    return '\n'.join(lines)


def compare(a, b):
    from PIL import Image, ImageChops
    ra = {(r['view'], r['size']): r for r in json.loads((OUT / a / 'results.json').read_text(encoding='utf-8'))}
    rb = {(r['view'], r['size']): r for r in json.loads((OUT / b / 'results.json').read_text(encoding='utf-8'))}
    lines = [f'# {a} vs {b}', '', '| View | Size | H-scroll | Taps <44 | Text <12px | Header off | Chrome |',
             '|---|---|---|---|---|---|---|']
    for k, x in ra.items():
        y = rb.get(k)
        if not y or not x['phone']:
            continue
        ch = lambda r: (str(round(r['chrome']['share'] * 100)) + '%') if r.get('chrome') else 'n/a'
        lines.append(f"| {k[0]} | {k[1]} | {x['scrollW']}→{y['scrollW']} | {len(x['taps'])}→{len(y['taps'])} | "
                     f"{len(x['text'])}→{len(y['text'])} | {len(x['offhead'])}→{len(y['offhead'])} | {ch(x)}→{ch(y)} |")
    lines += ['', '## Desktop 1440x900, pixel diff', '']
    for v in VIEWS:
        pa, pb = OUT / a / 'shots' / f'{v}-1440x900.png', OUT / b / 'shots' / f'{v}-1440x900.png'
        if not (pa.exists() and pb.exists()):
            continue
        ia, ib = Image.open(pa).convert('RGB'), Image.open(pb).convert('RGB')
        if ia.size != ib.size:
            lines.append(f'- {v}: size changed {ia.size} → {ib.size}')
            continue
        box = ImageChops.difference(ia, ib).getbbox()
        lines.append(f'- {v}: ' + ('identical' if not box else f'differs in box {box}'))
    text = '\n'.join(lines)
    (OUT / f'compare-{a}-{b}.md').write_text(text, encoding='utf-8')
    print(text)


if __name__ == '__main__':
    if len(sys.argv) >= 4 and sys.argv[1] == '--compare':
        compare(sys.argv[2], sys.argv[3])
    else:
        sys.exit(run(sys.argv[1] if len(sys.argv) > 1 else 'run'))
