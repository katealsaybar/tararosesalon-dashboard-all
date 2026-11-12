/* Notifications (Kate, 9 Nov 2026). A bell in the header of every signed-in page, a list under it, and one popup for an important notice.
   One file, one <script> line per page. It does nothing at all unless the browser already holds a dashboard sign-in (same trk-salon-os.com origin, so
   the session is shared) AND notices_my() answers for that person (migrations/site_notices.sql decides who sees what, by level, team and salon).
   Not drawn inside a frame (the View as and Campaign Blasts previews are pages in a frame). The bell sits in the page's own header actions row
   (see HOSTS); a page with none gets a small round button in its top right corner. Everything it draws sits in a shadow root, so the page's CSS
   cannot touch it; it only reads the site's colour tokens (--bg, --surface, --border, --text, --muted, --accent), so light and dark follow the page.
   Notices live only in Supabase. Phone and WhatsApp are NOT part of this file: this is the in-site bell. */
(function () {
  'use strict';
  if (window.__trsNotif) return;
  window.__trsNotif = true;
  try { if (window.top !== window.self) return; } catch (e) { return; }

  var URL = 'https://gvijxenafoowajqktqvd.supabase.co';
  var KEY = 'sb_publishable_e5o0vPayb-6552oARTeu7Q_KoqfT7xO';
  var STORE = 'sb-gvijxenafoowajqktqvd-auth-token';
  var SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0';
  // Where the bell goes, first match wins: the row of small buttons in each kind of page header.
  var HOSTS = ['.mast-acts', '.kb-account', '.top-acts', '.header-right', '.ps-head'];
  var POLL_MS = 60000;

  var ICON = {
    podium: '<path d="M3 21h18M5 21v-7h4v7M10 21V8h4v13M15 21v-10h4v10"/>',
    complaint: '<path d="M4 5h16v11H9l-5 4z"/><path d="M12 8.5v3M12 14v.01"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    reply: '<path d="M9 14L4 9l5-5"/><path d="M4 9h9a7 7 0 0 1 7 7v3"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
    pay: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h3l8 4V6L7 10H4a1 1 0 0 0-1 1z"/><path d="M19 9a4 4 0 0 1 0 6"/>'
  };
  function svg(name, size) {
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICON[name] || ICON.megaphone) + '</svg>';
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function safeLink(l) { return (typeof l === 'string' && /^\/(?!\/)/.test(l)) ? l : ''; }

  var sb = null, S = { items: [], unread: 0, filter: 'all', open: false, shown: {}, ok: false }, started = false, timer = 0;
  var bellHost, bellRoot, bellBtn, layerHost, layerRoot, panel, scrim;

  /* ── time: Dubai, Today / Yesterday / Earlier ─────────────────────────────────────── */
  var dayF = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit' });
  var hmF = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit', hour12: false });
  var dmF = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short' });
  function dayKey(d) { return dayF.format(d); }
  function when(iso) {
    var d = new Date(iso), now = new Date(), k = dayKey(d), t = dayKey(now), y = dayKey(new Date(now.getTime() - 864e5));
    if (k === t) return { g: 'Today', t: hmF.format(d) };
    if (k === y) return { g: 'Yesterday', t: hmF.format(d) };
    return { g: 'Earlier', t: dmF.format(d) };
  }

  /* ── the Supabase client: the page's own if it has one, else one made from the stored sign-in ──────── */
  function pageClient() {
    try { if (window.KB && window.KB.client && window.KB.client.rpc) return window.KB.client; } catch (e) {}
    try { if (window.__trsSb && window.__trsSb.rpc) return window.__trsSb; } catch (e) {}
    try { if (typeof sb !== 'undefined' && sb && sb.rpc && sb !== null) return sb; } catch (e) {}   // eslint-disable-line no-undef
    return null;
  }
  var own = null;
  function getClient(cb) {
    var c = pageClient(); if (c) return cb(c);
    if (own) return cb(own);
    function make() {
      try {
        own = window.supabase.createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false } });
        cb(own);
      } catch (e) { /* stay silent */ }
    }
    if (window.supabase && window.supabase.createClient) return make();
    var s = document.createElement('script'); s.src = SDK; s.async = true; s.onload = make; s.onerror = function () {};
    document.head.appendChild(s);
  }
  function rpc(name, args) {
    return new Promise(function (ok, bad) {
      getClient(function (c) { c.rpc(name, args || {}).then(function (r) { if (r.error) bad(new Error(r.error.message)); else ok(r.data); }, bad); });
    });
  }

  /* ── styles (inside the shadow roots) ───────────────────────────────────────────── */
  var CSS = [
    ':host{all:initial;font:14px/1.4 Inter,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--text,#1A1A1A)}',
    '*{box-sizing:border-box}',
    'button{font:inherit;color:inherit;cursor:pointer}',
    ':focus-visible{outline:2px solid var(--accent,#1A1A1A);outline-offset:2px}',
    '.bell{position:relative;width:36px;height:36px;padding:0;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--border,#E8E2D6);background:var(--surface,#fff);color:var(--text,#1A1A1A);border-radius:999px}',
    '.bell:hover,.bell[aria-expanded="true"]{border-color:var(--text,#1A1A1A)}',
    '.bell .n{position:absolute;top:-5px;right:-5px;min-width:19px;height:19px;padding:0 5px;border-radius:999px;background:#B3261E;color:#fff;font-size:11px;font-weight:600;line-height:19px;text-align:center;border:2px solid var(--bg,#FAF7F0)}',
    '.bell .n[hidden]{display:none}',
    '.panel{position:fixed;z-index:2147483000;width:420px;max-width:calc(100vw - 20px);max-height:min(560px,calc(100vh - 80px));display:flex;flex-direction:column;background:var(--surface,#fff);color:var(--text,#1A1A1A);border:1px solid var(--border,#E8E2D6);border-radius:12px;box-shadow:0 1px 2px rgba(26,26,26,.05),0 14px 34px -8px rgba(26,26,26,.28)}',
    '.panel[hidden]{display:none}',
    '.panel.sheet{inset:0;width:auto;max-width:none;max-height:none;border-radius:0;border:0;padding-top:env(safe-area-inset-top)}',
    '.ph{display:flex;align-items:center;gap:10px;padding:14px 16px 10px}',
    '.ph h2{margin:0;font-size:16px;font-weight:600}',
    '.ph .g{margin-left:auto;display:flex;gap:8px;align-items:center}',
    '.lnk{border:0;background:none;color:var(--muted,#565049);font-size:13px;text-decoration:underline;text-underline-offset:3px;padding:4px 2px}',
    '.lnk:disabled{opacity:.45;cursor:default;text-decoration:none}',
    '.x{display:none;width:36px;height:36px;border:1px solid var(--border,#E8E2D6);background:var(--surface,#fff);border-radius:999px;align-items:center;justify-content:center;padding:0}',
    '.sheet .x{display:inline-flex}',
    '.tabs{display:flex;gap:6px;padding:0 16px 10px;border-bottom:1px solid var(--border,#E8E2D6)}',
    '.tabs button{border:1px solid var(--border,#E8E2D6);background:none;border-radius:999px;padding:5px 12px;font-size:13px;color:var(--muted,#565049)}',
    '.tabs button[aria-pressed="true"]{background:var(--accent,#1A1A1A);color:var(--accent-fg,#FBF7F0);border-color:transparent}',
    '.list{overflow:auto;flex:1;padding:4px 0 6px;overscroll-behavior:contain}',
    '.grp{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted2,#77706A);padding:12px 16px 4px}',
    '.it{display:grid;grid-template-columns:36px 1fr auto;gap:0 12px;align-items:start;width:100%;text-align:left;border:0;border-top:1px solid var(--border2,#F0ECE3);background:none;padding:10px 16px}',
    '.grp+.it{border-top:0}',
    '.it:hover{background:var(--surface2,#F4F1E9)}',
    '.ico{width:36px;height:36px;border-radius:10px;background:var(--surface2,#F4F1E9);display:flex;align-items:center;justify-content:center}',
    '.it.imp .ico{background:color-mix(in srgb,#E0A526 24%,var(--surface,#fff))}',
    '.t{display:block;font-size:14px;font-weight:500;line-height:1.35}',
    '.it.read .t{font-weight:400;color:var(--muted,#565049)}',
    '.s{display:block;font-size:13px;color:var(--muted,#565049);line-height:1.4;margin-top:2px;overflow-wrap:anywhere}',
    '.go{display:inline-block;margin-top:5px;font-size:12px;border:1px solid var(--border,#E8E2D6);border-radius:999px;padding:2px 10px}',
    '.m{display:flex;flex-direction:column;align-items:flex-end;gap:8px;font-size:12px;color:var(--muted2,#77706A);white-space:nowrap;padding-top:2px}',
    '.dot{width:9px;height:9px;border-radius:50%;background:#B3261E}',
    '.it.read .dot{visibility:hidden}',
    '.empty{padding:34px 16px;text-align:center;color:var(--muted,#565049)}',
    '.pf{border-top:1px solid var(--border,#E8E2D6);padding:10px 16px;font-size:12px;color:var(--muted2,#77706A)}',
    '.scrim{position:fixed;inset:0;z-index:2147483001;background:rgba(26,26,26,.5);display:flex;align-items:center;justify-content:center;padding:16px}',
    '.scrim[hidden]{display:none}',
    '.modal{width:100%;max-width:440px;background:var(--surface,#fff);color:var(--text,#1A1A1A);border:1px solid var(--border,#E8E2D6);border-radius:16px;padding:24px 24px 20px;box-shadow:0 14px 40px -8px rgba(0,0,0,.4)}',
    '.modal .k{display:flex;align-items:center;gap:8px;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted2,#77706A)}',
    '.modal h3{font-size:20px;line-height:1.25;margin:8px 0;font-weight:600}',
    '.modal p{margin:0;color:var(--muted,#565049);overflow-wrap:anywhere;white-space:pre-line}',
    '.btns{display:flex;gap:8px;margin-top:18px}',
    '.btn{flex:1;border:1px solid var(--border,#E8E2D6);background:var(--surface,#fff);border-radius:999px;padding:10px 18px;font-size:14px;text-align:center}',
    '.btn.pri{background:var(--accent,#1A1A1A);color:var(--accent-fg,#FBF7F0);border-color:transparent}',
    '@media (max-width:640px){.modal{padding:22px 18px 18px}.btns{flex-direction:column}}'
  ].join('\n');

  /* ── mounting ─────────────────────────────────────────────────────────────────────── */
  function makeBell() {
    bellHost = document.createElement('span');
    bellHost.id = 'trs-bell-host';
    bellHost.style.cssText = 'display:inline-flex;align-items:center;flex:0 0 auto;margin:0 2px';
    bellRoot = bellHost.attachShadow({ mode: 'open' });
    bellRoot.innerHTML = '<style>' + CSS + '</style><button class="bell" type="button" aria-haspopup="dialog" aria-expanded="false" aria-label="Notifications">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9"/><path d="M10 19a2 2 0 0 0 4 0"/></svg>' +
      '<span class="n" aria-hidden="true" hidden>0</span></button>';
    bellBtn = bellRoot.querySelector('.bell');
    bellBtn.addEventListener('click', function (e) { e.stopPropagation(); toggle(!S.open); });
  }
  function makeLayer() {
    layerHost = document.createElement('div');
    layerHost.id = 'trs-notif-layer';
    layerRoot = layerHost.attachShadow({ mode: 'open' });
    layerRoot.innerHTML = '<style>' + CSS + '</style>' +
      '<div class="panel" role="dialog" aria-label="Notifications" hidden>' +
        '<div class="ph"><h2>Notifications</h2><div class="g"><button class="lnk" data-a="all" type="button">Mark all as read</button>' +
        '<button class="x" data-a="close" type="button" aria-label="Close notifications"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div></div>' +
        '<div class="tabs" role="group" aria-label="Filter"><button data-f="all" aria-pressed="true" type="button">All</button><button data-f="unread" aria-pressed="false" type="button">Unread</button></div>' +
        '<div class="list" role="list"></div><div class="pf">Kept for 30 days. Only you see yours.</div></div>' +
      '<div class="scrim" hidden><div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="pt"><div class="k"></div><h3 id="pt"></h3><p></p><div class="btns"></div></div></div>';
    panel = layerRoot.querySelector('.panel');
    scrim = layerRoot.querySelector('.scrim');
    layerRoot.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-a],[data-f],.it') : null;
      if (!t) return;
      if (t.dataset.f) { S.filter = t.dataset.f; draw(); return; }
      if (t.dataset.a === 'close') { toggle(false); return; }
      if (t.dataset.a === 'all') { markAll(); return; }
      if (t.classList.contains('it')) { openItem(t.dataset.id); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (!scrim.hidden) { closePopup(); } else if (S.open) { toggle(false); }
    });
    document.addEventListener('click', function (e) {
      if (!S.open || panel.classList.contains('sheet')) return;
      var p = e.composedPath ? e.composedPath() : [];
      if (p.indexOf(layerHost) < 0 && p.indexOf(bellHost) < 0) toggle(false);
    });
    window.addEventListener('resize', place);
    document.body.appendChild(layerHost);
  }
  function mount() {
    if (!bellHost) return;
    var c = null;
    for (var i = 0; i < HOSTS.length && !c; i++) c = document.querySelector(HOSTS[i]);
    var d = S.ok ? 'inline-flex' : 'none';   // nothing is drawn until the first answer: someone with no access never sees a bell
    if (c) {
      if (bellHost.parentElement !== c) {
        bellHost.style.cssText = 'display:' + d + ';align-items:center;flex:0 0 auto;margin:0 2px';
        var save = c.querySelector(':scope > .ps-save');
        c.insertBefore(bellHost, c.classList.contains('ps-head') ? save : c.firstChild);
      }
    } else if (!bellHost.isConnected && floatOk) {
      bellHost.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147482000;align-items:center;display:' + d;
      document.body.appendChild(bellHost);
    }
  }
  var floatOk = false;

  /* ── panel ────────────────────────────────────────────────────────────────────────── */
  function place() {
    if (!panel || !S.open) return;
    var sheet = window.innerWidth <= 640;
    panel.classList.toggle('sheet', sheet);
    if (sheet) { panel.style.top = panel.style.left = panel.style.right = ''; return; }
    var r = bellHost.getBoundingClientRect();
    panel.style.top = Math.max(8, Math.round(r.bottom + 8)) + 'px';
    panel.style.left = 'auto';
    panel.style.right = Math.max(10, Math.round(window.innerWidth - r.right)) + 'px';
  }
  function toggle(open) {
    S.open = open;
    panel.hidden = !open;
    bellBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      place(); draw();
      var f = panel.classList.contains('sheet') ? panel.querySelector('.x') : panel.querySelector('.lnk');
      if (f) f.focus();
      refresh();
    } else { bellBtn.focus(); }
  }
  function paintBadge() {
    var n = bellRoot.querySelector('.n');
    n.textContent = S.unread > 9 ? '9+' : String(S.unread);
    n.hidden = !S.unread;
    bellBtn.setAttribute('aria-label', 'Notifications' + (S.unread ? ', ' + S.unread + ' unread' : ''));
  }
  function draw() {
    paintBadge();
    if (!panel) return;
    panel.querySelectorAll('.tabs button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.f === S.filter ? 'true' : 'false'); });
    panel.querySelector('.lnk').disabled = !S.unread;
    var shown = S.items.filter(function (i) { return S.filter === 'all' || !i.read; });
    var out = '', last = '';
    shown.forEach(function (i) {
      var w = when(i.at);
      if (w.g !== last) { out += '<div class="grp" role="presentation">' + w.g + '</div>'; last = w.g; }
      out += '<button class="it' + (i.read ? ' read' : '') + (i.popup ? ' imp' : '') + '" data-id="' + esc(i.id) + '" type="button" role="listitem">' +
        '<span class="ico">' + svg(i.icon, 18) + '</span>' +
        '<span><span class="t">' + esc(i.title) + '</span>' + (i.body ? '<span class="s">' + esc(i.body) + '</span>' : '') +
        (safeLink(i.link) ? '<span class="go">' + esc(i.label || 'Open') + '</span>' : '') + '</span>' +
        '<span class="m"><span>' + esc(w.t) + '</span><span class="dot" aria-hidden="true"></span></span></button>';
    });
    panel.querySelector('.list').innerHTML = out || '<div class="empty">' + (S.filter === 'unread' ? 'You are all caught up.' : 'Nothing here yet.') + '</div>';
  }

  /* ── actions ──────────────────────────────────────────────────────────────────────── */
  function find(id) { return S.items.filter(function (i) { return String(i.id) === String(id); })[0]; }
  function setRead(id) {
    var it = find(id);
    if (it && !it.read) { it.read = true; S.unread = Math.max(0, S.unread - 1); }
  }
  function openItem(id) {
    var it = find(id); if (!it) return;
    setRead(id); draw();
    rpc('notices_mark_read', { p_ids: [Number(id)] }).catch(function () {});
    var l = safeLink(it.link);
    if (l) location.href = l;
  }
  function markAll() {
    S.items.forEach(function (i) { i.read = true; }); S.unread = 0; draw();
    rpc('notices_mark_all_read').catch(function () {});
  }

  /* ── the popup ────────────────────────────────────────────────────────────────────── */
  var popId = null;
  function showPopup(p) {
    if (!p || S.shown[p.id] || !scrim.hidden) return;
    S.shown[p.id] = true; popId = p.id;
    scrim.querySelector('.k').innerHTML = svg(p.icon, 16) + '<span>Important</span>';
    scrim.querySelector('h3').textContent = p.title;
    var body = scrim.querySelector('p'); body.textContent = p.body || ''; body.hidden = !p.body;
    var l = safeLink(p.link);
    scrim.querySelector('.btns').innerHTML = (l ? '<button class="btn pri" data-p="go" type="button">' + esc(p.label || 'Open') + '</button>' : '') +
      '<button class="btn' + (l ? '' : ' pri') + '" data-p="ok" type="button">Got it</button>';
    scrim.hidden = false;
    var go = scrim.querySelector('[data-p="go"]'), ok = scrim.querySelector('[data-p="ok"]');
    if (go) go.onclick = function () { var link = l; closePopup(); location.href = link; };
    ok.onclick = closePopup;
    ok.focus();
  }
  function closePopup() {
    if (scrim.hidden) return;
    scrim.hidden = true;
    var id = popId; popId = null;
    if (id != null) { setRead(id); draw(); rpc('notices_popup_seen', { p_id: Number(id) }).catch(function () {}); }
    if (bellBtn) bellBtn.focus();
  }

  /* ── fetching ─────────────────────────────────────────────────────────────────────── */
  function refresh() {
    return rpc('notices_my').then(function (d) {
      if (!d) return;
      S.ok = true; S.items = d.items || []; S.unread = d.unread || 0;
      if (bellHost) bellHost.style.display = 'inline-flex';
      draw();
      if (d.popup) setTimeout(function () { showPopup(d.popup); }, 700);
    }).catch(function () { /* not allowed, offline or signed out: keep the last list, say nothing */ });
  }
  function tick() {
    if (!signedIn()) { teardown(); return; }
    if (!document.hidden) refresh();
  }
  function signedIn() { try { return !!localStorage.getItem(STORE); } catch (e) { return false; } }
  function teardown() {
    if (bellHost && bellHost.parentElement) bellHost.remove();
    if (layerHost && layerHost.parentElement) layerHost.remove();
    clearInterval(timer); timer = 0; started = false; bellHost = layerHost = null; S.ok = false; S.items = []; S.unread = 0;
  }
  function start() {
    if (started) return; started = true;
    makeBell(); makeLayer(); mount();
    // A page that draws its header later, or draws it again (Team Home does), gets the bell put back in the row.
    var mo = new MutationObserver(function () { if (bellHost && (!bellHost.isConnected || bellHost.style.position === 'fixed')) mount(); });
    mo.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () { floatOk = true; mount(); }, 4000);
    refresh();
    timer = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });
    window.addEventListener('focus', tick);
  }

  function boot() {
    if (signedIn()) { start(); return; }
    // The sign-in happens on the page itself (no reload) on the dashboard: look again every few seconds for a while.
    var n = 0, w = setInterval(function () { n++; if (signedIn()) { clearInterval(w); start(); } else if (n > 200) clearInterval(w); }, 3000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
