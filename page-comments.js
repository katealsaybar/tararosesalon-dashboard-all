/* Page comments (Kate, 30 Oct 2026). Coach Emma and Kate click a spot on a campaign landing page (/campaigns/<page>/), leave a comment there,
   see each other's and mark them resolved. The pages are public, so this file does nothing at all unless the browser already holds a dashboard
   sign-in (same trk-salon-os.com origin, so the session is shared) AND page_comments_get() answers for that person (old Levels 3 and 5,
   migrations/page_comments.sql checks again). A client never downloads supabase-js, never sees a button and the page is not changed.
   It also stays off inside a frame: the Campaign Blasts preview is that page in an iframe. Everything it draws sits in one shadow root, so the
   page's own CSS cannot touch it and it cannot touch the page. Comments live only in Supabase (the repo is public). */
(function () {
  'use strict';
  if (window.__pcmLoaded) return;
  window.__pcmLoaded = true;
  try { if (window.top !== window.self) return; } catch (e) { return; }

  var URL = 'https://gvijxenafoowajqktqvd.supabase.co';
  var KEY = 'sb_publishable_e5o0vPayb-6552oARTeu7Q_KoqfT7xO';
  var STORE = 'sb-gvijxenafoowajqktqvd-auth-token';
  var SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0';

  var m = location.pathname.match(/^\/campaigns\/([a-z0-9-]+)\/?(?:index\.html)?$/);
  if (!m) return;
  var PAGE = m[1];
  var signed = false;
  try { signed = !!localStorage.getItem(STORE); } catch (e) { /* blocked storage: public view */ }
  if (!signed) return;

  function ready(fn) {
    if (window.supabase && window.supabase.createClient) return fn();
    var s = document.createElement('script');
    s.src = SDK; s.async = true; s.onload = fn; s.onerror = function () { /* stay silent */ };
    document.head.appendChild(s);
  }

  var sb = null, S = { me: '', level: 0, items: [], panel: false, mode: false, show: true, tab: 'open', cur: null, draft: null, err: '' };
  var root, host, absL, fixL, hover, card, panelEl, bar, fab, hint;
  var pins = [], raf = 0;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clamp(n) { n = Number(n); return n < 0 ? 0 : n > 1 ? 1 : (n || 0); }
  function fat(iso) {
    try { return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)); }
    catch (e) { return iso; }
  }
  async function rpc(name, args) {
    var r = await sb.rpc(name, args || {});
    if (r.error) throw new Error(r.error.message);
    return r.data;
  }

  /* ── finding the spot again ─────────────────────────────────────────────────────────────────────────────────────── */
  function txt(el) { return (el.textContent || '').replace(/\s+/g, ' ').trim(); }
  function cssPath(el) {
    var parts = [];
    while (el && el.nodeType === 1 && el !== document.body && el !== document.documentElement) {
      if (el.id && /^[A-Za-z][\w-]*$/.test(el.id) && document.getElementById(el.id) === el) { parts.unshift('#' + el.id); return parts.join(' > '); }
      var i = 1, s = el;
      while ((s = s.previousElementSibling)) if (s.tagName === el.tagName) i++;
      parts.unshift(el.tagName.toLowerCase() + ':nth-of-type(' + i + ')');
      el = el.parentElement;
    }
    return 'body' + (parts.length ? ' > ' + parts.join(' > ') : '');
  }
  function blockish(el) {
    while (el && el.parentElement && el !== document.body) {
      var d = getComputedStyle(el).display;
      if (d === 'inline' || d === 'contents') el = el.parentElement; else break;
    }
    return el;
  }
  function dyn(el) {
    for (var n = el; n && n.nodeType === 1; n = n.parentElement) { var p = getComputedStyle(n).position; if (p === 'fixed' || p === 'sticky') return true; }
    return false;
  }
  function byText(tx) {
    var best = null, len = 1e9, all = document.body.querySelectorAll('h1,h2,h3,h4,h5,p,li,a,button,label,span,div,small,strong,em,td,th,summary,figcaption,dt,dd');
    for (var i = 0; i < all.length; i++) {
      var t = txt(all[i]);
      if (t.indexOf(tx) === 0 && t.length < len) { best = all[i]; len = t.length; }
    }
    return best;
  }
  function locate(a) {
    var el = null;
    try { el = document.querySelector(a.sel); } catch (e) { el = null; }
    if (a.tx) {
      var same = el && txt(el).indexOf(a.tx.slice(0, 24)) === 0;
      if (!same) { var alt = byText(a.tx); if (alt) el = alt; }
    }
    return el;
  }
  function anchorFrom(x, y, target) {
    var el = blockish(target), r = el.getBoundingClientRect(), d = document.documentElement;
    return {
      sel: cssPath(el), tx: txt(el).slice(0, 60),
      x: r.width ? clamp((x - r.left) / r.width) : 0.5, y: r.height ? clamp((y - r.top) / r.height) : 0.5,
      pxf: clamp((x + scrollX) / Math.max(d.scrollWidth, innerWidth)), pyf: clamp((y + scrollY) / Math.max(d.scrollHeight, document.body.scrollHeight)),
      vw: innerWidth, ph: innerWidth < 700
    };
  }

  /* ── data ───────────────────────────────────────────────────────────────────────────────────────────────────────── */
  function tops() { return S.items.filter(function (c) { return !c.parent; }); }
  function repliesOf(id) { return S.items.filter(function (c) { return c.parent === id; }); }
  function byId(id) { return S.items.filter(function (c) { return c.id === id; })[0]; }
  async function reload() {
    try {
      var d = await rpc('page_comments_get', { p_page: PAGE });
      S.me = d.me; S.level = d.level; S.items = d.comments || [];
    } catch (e) { S.err = 'Could not refresh: ' + e.message; }
  }
  async function act(fn) {
    S.err = '';
    try { await fn(); } catch (e) { S.err = 'Not saved: ' + e.message; }
    await reload(); draw();
  }

  /* ── shell ──────────────────────────────────────────────────────────────────────────────────────────────────────── */
  var CSS = [
    ':host{all:initial}',
    '*{box-sizing:border-box}',
    '[hidden]{display:none !important}',
    '.w{font:14px/1.45 Inter,system-ui,-apple-system,"Segoe UI",sans-serif;color:#2D2E37}',
    'button,textarea{font:inherit;color:inherit}',
    'button{cursor:pointer}',
    '.abs{position:absolute;left:0;top:0;width:0;height:0;z-index:2147483000}',
    '.fix{position:fixed;left:0;top:0;width:0;height:0;z-index:2147483001}',
    '.pin{position:absolute;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50% 50% 50% 4px;transform:rotate(-45deg);border:2px solid #fff;background:#1C7563;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.35);padding:0;display:grid;place-items:center}',
    '.pin::before{content:"";position:absolute;inset:-8px}',
    '.pin>span{transform:rotate(45deg);font-weight:700;font-size:12px;line-height:1}',
    '.pin.emma{background:#8A5A0C}',
    '.pin.done{background:#74747B}',
    '.pin.sel{outline:3px solid #99F6E4;outline-offset:2px}',
    '.pin.draft{background:#1C1B18;animation:p 1.2s ease-in-out infinite}',
    '@keyframes p{50%{transform:rotate(-45deg) scale(1.15)}}',
    '.hov{position:fixed;pointer-events:none;border:2px solid #1C7563;background:rgba(153,246,228,.18);border-radius:4px;z-index:2147483002;display:none}',
    '.bar{position:fixed;right:14px;bottom:18px;z-index:2147483003;display:flex;flex-direction:column;gap:8px;align-items:flex-end}',
    '.fab{min-height:44px;border:0;border-radius:999px;padding:0 18px;font-weight:600;background:#1C1B18;color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.3);display:flex;align-items:center;gap:8px}',
    '.fab.go{background:#1C7563}',
    '.fab.on{background:#99F6E4;color:#1C1B18}',
    '.fab b{background:#fff;color:#1C1B18;border-radius:999px;min-width:22px;height:22px;display:inline-grid;place-items:center;font-size:12px;padding:0 6px}',
    '.hint{position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:2147483003;background:#1C1B18;color:#fff;border-radius:999px;padding:6px 8px 6px 18px;box-shadow:0 4px 14px rgba(0,0,0,.35);width:max-content;max-width:calc(100vw - 20px);display:flex;align-items:center;gap:10px}',
    '.hint button{border:1px solid #fff;background:transparent;color:#fff;border-radius:999px;padding:4px 12px;min-height:32px}',
    '.card,.panel{position:fixed;z-index:2147483004;background:#fff;color:#2D2E37;border:1px solid rgba(45,46,55,.15);border-radius:14px;box-shadow:0 12px 36px rgba(0,0,0,.28)}',
    '.card{width:320px;max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);overflow:auto;padding:14px}',
    '.panel{right:14px;top:14px;bottom:78px;width:370px;max-width:calc(100vw - 28px);display:flex;flex-direction:column;overflow:hidden}',
    '.ph{padding:14px 16px 10px;border-bottom:1px solid rgba(45,46,55,.1)}',
    '.ph h2{margin:0;font:600 17px/1.2 "Playfair Display",Georgia,serif}',
    '.ph p{margin:4px 0 10px;color:#5b5b63;font-size:13px}',
    '.tabs{display:flex;gap:6px;align-items:center}',
    '.tab{border:1px solid rgba(45,46,55,.2);background:#fff;border-radius:999px;padding:6px 14px;min-height:36px;font-weight:600;font-size:13px}',
    '.tab.on{background:#1C1B18;color:#fff;border-color:#1C1B18}',
    '.tog{margin-left:auto;font-size:13px;display:flex;gap:6px;align-items:center;min-height:36px}',
    '.list{overflow:auto;padding:10px 12px;display:flex;flex-direction:column;gap:8px;flex:1}',
    '.it{display:flex;gap:10px;text-align:left;width:100%;border:1px solid rgba(45,46,55,.14);border-radius:12px;background:#FAF8F4;padding:10px 12px}',
    '.it:hover{border-color:#1C7563}',
    '.it.emma{border-left:4px solid #E0A43A}',
    '.n{flex:none;width:26px;height:26px;border-radius:50%;background:#1C7563;color:#fff;font-weight:700;font-size:12px;display:grid;place-items:center}',
    '.it.done .n{background:#74747B}',
    '.it p{margin:2px 0 0;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
    '.meta{font-size:12.5px;color:#5b5b63}',
    '.meta b{color:#2D2E37}',
    '.chip{display:inline-block;font-size:11.5px;border-radius:999px;padding:1px 8px;background:#EFEBE3;color:#5b5b63;margin-left:4px}',
    '.chip.warn{background:#FAEEDA;color:#8A5A0C}',
    '.none{color:#5b5b63;padding:18px 6px;text-align:center}',
    '.pf{padding:10px 16px;border-top:1px solid rgba(45,46,55,.1);font-size:13px}',
    '.pf a{color:#1C7563;font-weight:600}',
    '.cm{border:1px solid rgba(45,46,55,.14);border-radius:12px;padding:8px 12px;background:#FAF8F4;margin-bottom:8px}',
    '.cm.emma{border-left:4px solid #E0A43A}',
    '.cm p{margin:2px 0 0;white-space:pre-wrap;overflow-wrap:anywhere}',
    '.cmh{display:flex;justify-content:space-between;gap:8px;font-size:12.5px;color:#5b5b63}',
    '.cmh b{color:#2D2E37}',
    '.lnk{border:0;background:transparent;text-decoration:underline;color:#5b5b63;font-size:12.5px;padding:2px 4px;min-height:28px}',
    'textarea{width:100%;min-height:78px;border:1px solid rgba(45,46,55,.3);border-radius:10px;padding:9px 11px;resize:vertical;background:#fff}',
    'textarea:focus-visible,button:focus-visible{outline:3px solid #1C7563;outline-offset:2px}',
    '.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px}',
    '.btn{min-height:40px;border-radius:999px;border:1px solid rgba(45,46,55,.25);background:#fff;padding:0 16px;font-weight:600}',
    '.btn.pri{background:#1C7563;color:#fff;border-color:#1C7563}',
    '.btn.ok{background:#E1F5EE;color:#0F6E56;border-color:#0F6E56}',
    '.err{color:#B3261E;margin:8px 0 0;font-size:13px}',
    '.ct{display:flex;justify-content:space-between;align-items:center;margin:0 0 8px;font-weight:600}',
    '.x{border:0;background:transparent;font-size:20px;line-height:1;width:36px;height:36px;border-radius:50%}',
    '@media (max-width:640px){.bar{bottom:calc(86px + env(safe-area-inset-bottom))}.panel{left:8px;right:8px;top:auto;bottom:8px;width:auto;max-width:none;max-height:72vh}.card{left:8px!important;right:8px;top:auto!important;bottom:8px;width:auto;max-width:none;max-height:72vh}}',
    '@media (prefers-reduced-motion:reduce){.pin.draft{animation:none}}'
  ].join('');

  function build() {
    host = document.createElement('div');
    host.setAttribute('data-pcm', '');
    host.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;z-index:2147483000';
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<style>' + CSS + '</style><div class="w"><div class="abs" id="abs"></div><div class="fix" id="fix"></div><div class="hov" id="hov"></div>' +
      '<div class="hint" id="hint" hidden></div><div class="bar" id="bar"></div><div class="panel" id="panel" hidden role="dialog" aria-label="Comments on this page"></div>' +
      '<div class="card" id="card" hidden role="dialog"></div></div>';
    document.documentElement.appendChild(host);
    absL = root.getElementById('abs'); fixL = root.getElementById('fix'); hover = root.getElementById('hov');
    hint = root.getElementById('hint'); bar = root.getElementById('bar'); panelEl = root.getElementById('panel'); card = root.getElementById('card');
    root.addEventListener('click', onUi);
    root.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.target.tagName === 'TEXTAREA') { e.preventDefault(); post(); }
    });
    root.addEventListener('input', function (e) { if (e.target.id === 'txt' && S.draft) S.draft.text = e.target.value; if (e.target.id === 'rep') S.reply = e.target.value; });
  }

  /* ── drawing ────────────────────────────────────────────────────────────────────────────────────────────────────── */
  function isEmma(c) { return /^emma/i.test(c.by || ''); }
  function counts() { var t = tops(); return { open: t.filter(function (c) { return !c.resolved; }).length, done: t.filter(function (c) { return c.resolved; }).length }; }

  function drawBar() {
    var n = counts().open;
    bar.innerHTML = '<button type="button" class="fab ' + (S.mode ? 'on' : 'go') + '" data-a="mode" aria-pressed="' + S.mode + '">' + (S.mode ? 'Stop commenting' : '+ Add a comment') + '</button>' +
      '<button type="button" class="fab" data-a="panel" aria-expanded="' + S.panel + '">Comments' + (n ? ' <b>' + n + '</b>' : '') + '</button>';
    hint.hidden = !S.mode;
    if (S.mode) hint.innerHTML = '<span>' + (innerWidth < 641 ? 'Tap where to comment' : 'Click the spot you want to comment on') + '</span><button type="button" data-a="mode">Done</button>';
  }

  function listHtml() {
    var all = tops(), c = counts();
    var shown = all.filter(function (t) { return S.tab === 'open' ? !t.resolved : t.resolved; });
    var rows = shown.map(function (t) {
      var rs = repliesOf(t.id), p = pins.filter(function (x) { return x.c.id === t.id; })[0];
      var warn = p && p.st === 'hidden' ? '<span class="chip warn">not on this screen size</span>' : p && p.st === 'approx' ? '<span class="chip warn">spot may have moved</span>' : '';
      return '<button type="button" class="it' + (t.resolved ? ' done' : '') + (isEmma(t) ? ' emma' : '') + '" data-a="open" data-id="' + t.id + '"><span class="n">' + (t.resolved ? '✓' : t.num) + '</span><span><span class="meta"><b>' + esc(t.by) + '</b> · ' + esc(fat(t.at)) +
        (rs.length ? ' · ' + rs.length + (rs.length === 1 ? ' reply' : ' replies') : '') + warn + '</span><p>' + esc(t.body) + '</p></span></button>';
    }).join('');
    return '<div class="ph"><div class="ct" style="margin:0"><h2>Comments on this page</h2><button type="button" class="x" data-a="panel" aria-label="Close">×</button></div>' +
      '<p>Only you, Kate and Coach Emma can see these. Visitors see nothing.</p>' +
      '<div class="tabs"><button type="button" class="tab' + (S.tab === 'open' ? ' on' : '') + '" data-a="tab" data-t="open">Open ' + c.open + '</button>' +
      '<button type="button" class="tab' + (S.tab === 'done' ? ' on' : '') + '" data-a="tab" data-t="done">Resolved ' + c.done + '</button>' +
      '<label class="tog"><input type="checkbox" data-a="show"' + (S.show ? ' checked' : '') + '> Show pins</label></div></div>' +
      '<div class="list">' + (rows || '<p class="none">' + (S.tab === 'open' ? 'Nothing open. Tap “Add a comment”, then tap the spot on the page.' : 'Nothing resolved yet.') + '</p>') + '</div>' +
      '<div class="pf">All pages in one list: <a href="/?view=campaignblasts">Campaign Blasts</a></div>';
  }

  function thread(t) {
    var rs = repliesOf(t.id), a = t.anchor || {}, here = innerWidth < 700;
    var h = '<div class="ct"><span>Comment ' + t.num + (t.resolved ? ' <span class="chip">Resolved</span>' : '') + (a.ph !== undefined && a.ph !== here ? '<span class="chip warn">placed on ' + (a.ph ? 'a phone' : 'desktop') + '</span>' : '') + '</span><button type="button" class="x" data-a="close" aria-label="Close">×</button></div>';
    [t].concat(rs).forEach(function (c) {
      h += '<div class="cm' + (isEmma(c) ? ' emma' : '') + '"><div class="cmh"><b>' + esc(c.by) + '</b><span>' + esc(fat(c.at)) +
        (c.mine || S.level === 5 ? ' <button type="button" class="lnk" data-a="del" data-id="' + c.id + '">Delete</button>' : '') + '</span></div><p>' + esc(c.body) + '</p></div>';
    });
    h += '<textarea id="rep" maxlength="2000" placeholder="Reply" aria-label="Reply">' + esc(S.reply || '') + '</textarea>' +
      (S.err ? '<p class="err" role="alert">' + esc(S.err) + '</p>' : '') +
      '<div class="row"><button type="button" class="btn pri" data-a="reply" data-id="' + t.id + '">Reply</button>' +
      '<button type="button" class="btn ' + (t.resolved ? '' : 'ok') + '" data-a="resolve" data-id="' + t.id + '">' + (t.resolved ? 'Reopen' : 'Mark resolved') + '</button></div>' +
      (t.resolved && t.resolved_by ? '<p class="meta" style="margin:8px 0 0">Resolved by ' + esc(t.resolved_by) + ', ' + esc(fat(t.resolved_at)) + '</p>' : '');
    return h;
  }
  function compose() {
    return '<div class="ct"><span>New comment</span><button type="button" class="x" data-a="cancel" aria-label="Cancel">×</button></div>' +
      '<textarea id="txt" maxlength="2000" placeholder="What should change here?" aria-label="Comment">' + esc(S.draft.text || '') + '</textarea>' +
      (S.err ? '<p class="err" role="alert">' + esc(S.err) + '</p>' : '') +
      '<div class="row"><button type="button" class="btn pri" data-a="post">Post comment</button><button type="button" class="btn" data-a="cancel">Cancel</button><span class="meta">Posting as ' + esc(S.me) + '</span></div>';
  }

  function placeCard(vx, vy) {
    if (innerWidth < 641) { card.style.left = ''; card.style.top = ''; return; }
    var w = 320, h = Math.min(card.offsetHeight || 260, innerHeight - 24);
    var x = Math.min(Math.max(12, vx + 18), innerWidth - w - 12), y = Math.min(Math.max(12, vy - 20), innerHeight - h - 12);
    card.style.left = x + 'px'; card.style.top = y + 'px';
  }
  function drawCard() {
    var focus = root.activeElement && root.activeElement.id;
    if (S.draft) { card.hidden = false; card.innerHTML = compose(); placeCard(S.draft.cx, S.draft.cy); }
    else if (S.cur && byId(S.cur)) {
      var p = pins.filter(function (x) { return x.c.id === S.cur; })[0], vx = innerWidth / 2, vy = 120;
      if (p && p.ok) { vx = p.fixed ? p.vx : p.px - scrollX; vy = p.fixed ? p.vy : p.py - scrollY; }
      card.hidden = false; card.innerHTML = thread(byId(S.cur)); placeCard(vx, vy);
    } else { card.hidden = true; card.innerHTML = ''; }
    if (!card.hidden && focus) { var f = root.getElementById(focus); if (f) { f.focus(); } }
  }
  function drawPanel() { panelEl.hidden = !S.panel; if (S.panel) { var y = (panelEl.querySelector('.list') || {}).scrollTop || 0; panelEl.innerHTML = listHtml(); var l = panelEl.querySelector('.list'); if (l) l.scrollTop = y; } }

  function measure() {
    pins.forEach(function (p) {
      var a = p.c.anchor || {}, el = locate(a), d = document.documentElement;
      p.el = el; p.st = 'ok'; p.ok = false;
      if (el) {
        var r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && el.getClientRects().length) {
          var x = r.left + clamp(a.x) * r.width, y = r.top + clamp(a.y) * r.height;
          if (dyn(el)) { p.fixed = true; p.vx = x; p.vy = y; } else { p.fixed = false; p.px = x + scrollX; p.py = y + scrollY; }
          p.ok = true;
        } else p.st = 'hidden';
      } else if (typeof a.pyf === 'number') {
        p.fixed = false; p.px = clamp(a.pxf) * Math.max(d.scrollWidth, innerWidth); p.py = clamp(a.pyf) * Math.max(d.scrollHeight, document.body.scrollHeight);
        p.ok = true; p.st = 'approx';
      } else p.st = 'hidden';
    });
  }
  function drawPins() {
    absL.innerHTML = ''; fixL.innerHTML = '';
    var W = Math.max(document.documentElement.scrollWidth, innerWidth);
    pins = tops().map(function (c) { return { c: c }; });
    measure();
    pins.forEach(function (p) {
      if (!p.ok || !S.show) return;
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'pin' + (p.c.resolved ? ' done' : isEmma(p.c) ? ' emma' : '') + (S.cur === p.c.id ? ' sel' : '');
      b.setAttribute('data-a', 'open'); b.setAttribute('data-id', p.c.id);
      b.setAttribute('aria-label', 'Comment ' + p.c.num + ' by ' + p.c.by + (p.c.resolved ? ', resolved' : ''));
      b.innerHTML = '<span>' + (p.c.resolved ? '✓' : p.c.num) + '</span>';
      if (p.fixed) { b.style.left = p.vx + 'px'; b.style.top = p.vy + 'px'; fixL.appendChild(b); }
      else { b.style.left = Math.min(Math.max(p.px, 16), W - 16) + 'px'; b.style.top = Math.max(p.py, 16) + 'px'; absL.appendChild(b); }
      p.node = b;
    });
    if (S.draft) {
      var d = document.createElement('div'); d.className = 'pin draft'; d.style.left = S.draft.px + 'px'; d.style.top = S.draft.py + 'px'; d.innerHTML = '<span>+</span>'; absL.appendChild(d);
    }
  }
  function draw() { drawPins(); drawBar(); drawPanel(); drawCard(); }
  function relayout() { cancelAnimationFrame(raf); raf = requestAnimationFrame(function () { drawPins(); }); }

  /* ── actions ────────────────────────────────────────────────────────────────────────────────────────────────────── */
  function setMode(on) {
    S.mode = on; S.draft = on ? S.draft : null; hover.style.display = 'none';
    var st = document.getElementById('pcm-cursor');
    if (on) {
      S.cur = null; S.panel = false;
      if (!st) { st = document.createElement('style'); st.id = 'pcm-cursor'; st.textContent = 'html.pcm-on,html.pcm-on *{cursor:crosshair !important}'; document.head.appendChild(st); }
      document.documentElement.classList.add('pcm-on');
    } else { document.documentElement.classList.remove('pcm-on'); if (st) st.remove(); }
    draw();
  }
  async function post() {
    var ta = root.getElementById('txt'), text = ta ? ta.value.trim() : '';
    if (!text) { S.err = 'Write a comment first.'; drawCard(); return; }
    var a = S.draft.anchor, newId = null;
    await act(async function () { var r = await rpc('page_comment_add', { p_page: PAGE, p_anchor: a, p_body: text, p_parent: null }); newId = r && r.id; S.draft = null; });
    if (!S.err && newId) { S.cur = newId; S.mode = false; setMode(false); } else draw();
  }
  function open(id) {
    S.cur = id; S.reply = ''; S.draft = null; S.err = ''; if (innerWidth < 641) S.panel = false;
    var p = pins.filter(function (x) { return x.c.id === id; })[0];
    if (p && p.ok && !p.fixed) {
      var top = p.py - innerHeight / 2;
      var off = function () { return p.py < scrollY + 60 || p.py > scrollY + innerHeight - 60; };
      if (off()) {
        window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
        setTimeout(function () { if (off()) window.scrollTo({ top: Math.max(0, top), behavior: 'instant' }); }, 900);   // a browser that skips smooth scrolling still lands there
      }
    }
    draw();
    setTimeout(relayout, 450);
  }

  function onUi(e) {
    var t = e.target.closest && e.target.closest('[data-a]'); if (!t) return;
    var a = t.getAttribute('data-a'), id = Number(t.getAttribute('data-id'));
    if (a === 'mode') setMode(!S.mode);
    else if (a === 'panel') { S.panel = !S.panel; if (S.panel) { S.cur = null; S.draft = null; } if (S.panel && S.mode) setMode(false); else draw(); }
    else if (a === 'tab') { S.tab = t.getAttribute('data-t'); drawPanel(); }
    else if (a === 'show') { S.show = t.checked; drawPins(); }
    else if (a === 'open') open(id);
    else if (a === 'close') { S.cur = null; S.err = ''; draw(); }
    else if (a === 'cancel') { S.draft = null; S.err = ''; draw(); }
    else if (a === 'post') post();
    else if (a === 'reply') {
      var ta = root.getElementById('rep'), text = ta ? ta.value.trim() : '';
      if (!text) { S.err = 'Write a reply first.'; drawCard(); return; }
      act(async function () { await rpc('page_comment_add', { p_page: PAGE, p_anchor: null, p_body: text, p_parent: id }); S.reply = ''; });
    }
    else if (a === 'resolve') { var c = byId(id); act(function () { return rpc('page_comment_resolve', { p_id: id, p_resolved: !(c && c.resolved) }); }); }
    else if (a === 'del') {
      if (!confirm('Delete this comment?')) return;
      act(async function () { await rpc('page_comment_delete', { p_comment_id: id }); if (!byId(S.cur) || S.cur === id) S.cur = null; });
    }
  }

  /* the page itself: while "Add a comment" is on, a click picks the spot instead of doing what it normally does */
  function inUi(e) { var p = e.composedPath ? e.composedPath() : []; return p.indexOf(host) >= 0; }
  document.addEventListener('click', function (e) {
    if (!S.mode || inUi(e)) return;
    e.preventDefault(); e.stopPropagation();
    var el = e.target; if (!el || el.nodeType !== 1) return;
    var a = anchorFrom(e.clientX, e.clientY, el);
    S.draft = { anchor: a, text: '', cx: e.clientX, cy: e.clientY, px: e.clientX + scrollX, py: e.clientY + scrollY }; S.err = '';
    hover.style.display = 'none';
    draw();
    if (innerWidth < 641 && e.clientY > innerHeight * 0.4) window.scrollBy({ top: e.clientY - innerHeight * 0.22, behavior: 'smooth' });   // the sheet sits at the bottom: bring the spot up above it
    setTimeout(function () { var ta = root.getElementById('txt'); if (ta) ta.focus(); }, 30);
  }, true);
  document.addEventListener('mouseover', function (e) {
    if (!S.mode || S.draft || inUi(e)) { if (!S.mode) hover.style.display = 'none'; return; }
    var el = blockish(e.target); if (!el || el === document.body || el === document.documentElement) { hover.style.display = 'none'; return; }
    var r = el.getBoundingClientRect();
    hover.style.cssText = 'display:block;left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px';
  }, true);
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (S.draft) { S.draft = null; draw(); } else if (S.cur) { S.cur = null; draw(); } else if (S.mode) setMode(false); else if (S.panel) { S.panel = false; draw(); }
  });
  window.addEventListener('resize', relayout);
  window.addEventListener('scroll', function () { if (pins.some(function (p) { return p.fixed; })) relayout(); }, { passive: true });

  /* ── start: only draws anything after the database has said yes to this person ─────────────────────────────────────── */
  ready(async function () {
    try {
      sb = window.supabase.createClient(URL, KEY, { auth: { detectSessionInUrl: false } });
      var d = await rpc('page_comments_get', { p_page: PAGE });
      S.me = d.me; S.level = d.level; S.items = d.comments || [];
    } catch (e) { return; }   // signed out, or not Level 3 or 5: the page stays exactly as the public sees it
    build(); draw();
    if (window.ResizeObserver) new ResizeObserver(relayout).observe(document.body);
    window.addEventListener('load', relayout);
    [600, 1800, 4000].forEach(function (ms) { setTimeout(relayout, ms); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
    var q = (location.search.match(/[?&]pc=(\d+)/) || [])[1];
    if (q && byId(Number(q))) setTimeout(function () { open(Number(q)); }, 700);
  });
})();
