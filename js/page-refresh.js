/* PAGE UPDATED, REFRESH (Kate, 19 Nov 2026).
   When a dashboard or report is edited behind the scenes and pushed, the people who have it open are still on the old copy until they refresh.
   This watches for that and offers the refresh, for the page they are on and no other.

   How it knows: scripts/stamp-page-dates.py gives every page a short version (the fingerprint of the files that page owns plus its block in
   index.html; `--bump <page>` moves it on for a change that is not in a file, such as a database function). It writes that two ways:
     window.TRS_PAGE_VERS   in js/page-dates.js, the version this tab was loaded with
     page-versions.json     at the site root, the version live now
   Every 90 seconds while the tab is visible, and the moment it is looked at again, the second is read fresh (a unique address, so neither the
   browser nor the CDN answers from its cache). When the page on screen has a different version in it, a card offers Refresh.

   It never reloads by itself: someone may be half way through typing a message or a note. Later folds the card to a pill (same as the
   "Newer data has landed" card), and a page nobody edited never shows anything. Shared files (dashboard.js, report-export.js ...) are not in
   a page's version on purpose, the same rule as Date modified: touching one would prompt all 56 pages for a change to none of them. */
(function () {
  'use strict';
  var POLL_MS = 90000;
  var loaded = {}, latest = null, timer = null, started = false, current = null;
  var dismissed = {};   // "page:version" the person waved off with Later; the pill stays, the card does not reopen by itself
  try { var src = window.TRS_PAGE_VERS || {}; Object.keys(src).forEach(function (k) { loaded[k] = src[k]; }); } catch (e) {}

  function el(id) { return document.getElementById(id); }
  function live(id) { return typeof window.trsLive === 'function' ? window.trsLive(id) : id; }
  function labelOf(id) {
    try { if (typeof window.trsPageLabel === 'function') return window.trsPageLabel(id) || 'This page'; } catch (e) {}
    return 'This page';
  }

  function hide() {
    var box = el('verNotice');
    if (box) { box.hidden = true; box.classList.remove('mini'); }
  }

  function show(id, ver) {
    var box = el('verNotice'), full = el('verFull'), pill = el('verPill');
    if (!box || !full) return;
    var name = labelOf(id);
    if (pill) pill.textContent = 'Page updated. Refresh';
    full.textContent = '';
    function add(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; full.appendChild(n); return n; }
    add('div', 'upd-eye', 'This page was updated');
    var lead = add('p', 'upd-lead');
    var b = document.createElement('b'); b.textContent = name; lead.appendChild(b);
    lead.appendChild(document.createTextNode(' was changed while you had it open. Refresh to get the latest version.'));
    add('p', 'upd-foot', 'You stay on this page. If you are typing something that is not saved yet, save it first.');
    var acts = add('div', 'upd-acts');
    var go = document.createElement('button'); go.type = 'button'; go.className = 'upd-btn'; go.id = 'verGo'; go.textContent = 'Refresh page';
    go.onclick = function () { window.trsVerRefresh(go); };
    var later = document.createElement('button'); later.type = 'button'; later.className = 'upd-btn ghost'; later.textContent = 'Later';
    later.onclick = function () { dismissed[id + ':' + ver] = true; box.classList.add('mini'); };
    acts.appendChild(go); acts.appendChild(later);
    if (dismissed[id + ':' + ver]) box.classList.add('mini'); else box.classList.remove('mini');
    box.hidden = false;
  }

  function check() {
    if (!latest || !current) return hide();
    var id = live(current);
    var a = loaded[id], b = latest[id];
    if (!a || !b || a === b) return hide();
    show(id, b);
  }

  function read() {
    if (typeof fetch !== 'function') return Promise.resolve();
    return fetch('page-versions.json?_=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j && j.v) { latest = j.v; check(); } })
      .catch(function () { /* offline or a bad read: say nothing, try again next tick */ });
  }

  function start() {
    if (started) return;
    started = true;
    read();
    timer = setInterval(function () { if (!document.hidden) read(); }, POLL_MS);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) read(); });
  }

  // Called by showView() with the page that just opened. The first call (after sign-in) starts the watch.
  window.trsVerCheck = function (view) { current = view; start(); check(); };

  // Refresh: fetch this address past the browser cache first, so the reload is handed the new index.html, then reload.
  window.trsVerRefresh = function (btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'Refreshing…'; }
    var done = function () { location.reload(); };
    try { fetch(location.href, { cache: 'reload' }).then(done, done); } catch (e) { done(); }
  };

  // Test hook (no effect on the page): lets a check feed in a manifest and see what would show.
  window.trsVerDebug = function () { return { loaded: loaded, latest: latest, current: current }; };
})();
