// First-time guide on every report (Kate, 18 Nov 2026: "para sa first time openers ng report, dapat may guide / how to navigate it, sila na lang mag cancel
// once maalam na sila, will keep appearing to teach them, and it won't appear again ever").
//
// ONE shared component, no per-page tours. When a page opens, showView() calls TRSGuide.maybe(view). It looks for the real parts of that page (the header
// filter, the Why wall, the "On this page" nav, a clickable figure, a table heading menu, the XLSX and CSV buttons), keeps the ones that are really there
// (three to five, never a blank), and shows them one at a time over a dimmed page. A page with fewer than two of them shows no guide.
//   Next / Back                  move through the steps
//   Got it, do not show again    the ONLY thing that hides it for good: per person and per page, stored in Supabase (page_guide_seen via page_guide_get,
//                                page_guide_dismiss, page_guide_reset; migrations/page_guide.sql), with localStorage as the fast copy so it does not flash
//   X or Esc                     close for now only, so a stray tap cannot hide it forever; it shows again on the next open
//   "Show the guide for this page again" in the page footer: TRSGuide.again()
// While previewing another level (View as) nothing is shown or written. If the database call fails, the local copy decides and the page never breaks.
(function () {
  'use strict';
  if (window.TRSGuide) return;

  var LS = 'trs-guide-done:';
  var STEPS = [
    { id: 'filters', find: function (v) { var w = document.getElementById('filtersWrap'); return vis(w) && !w.classList.contains('closed') ? w : null; },
      title: 'Pick a salon and a period', text: 'Choose them here and every number on this page changes with it.' },
    { id: 'why', find: function (v) { return first(v, '.why-wall, .ms-why'); },
      title: 'Start here', text: 'Three short lines: why this page matters, why now, and what happens if we do nothing. Then this week’s one action.' },
    { id: 'nav', find: function (v) { return firstGlobal('.lg-side .side-nav, .jn-rail .side-nav, .jn-rail .jn-nav, .jn-rail'); },
      title: 'Jump to any section', text: 'Tap a name to go straight to it. The one you are reading lights up.' },
    { id: 'figure', find: function (v) { return first(v, '.dn[data-dn], [data-drill]'); },
      title: 'Numbers open up', text: 'An underlined number opens the rows behind it, so you can see exactly who or what makes it.' },
    { id: 'menu', find: function (v) { return first(v, 'th button[aria-haspopup="true"], th .dr-fb, th [data-fc]'); },
      title: 'Every heading has a menu', text: 'Sort it, or filter it by value or by condition, the same way you would in Google Sheets.' },
    { id: 'export', find: function (v) { return first(v, '.rex-bar'); },
      title: 'Need it in a sheet?', text: 'Download this report as XLSX or CSV from here.' }
  ];
  var MAX = 5, MIN = 2;

  function vis(el) { return !!(el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden'); }
  function first(v, sel) {
    var root = document.getElementById('view-' + v) || document, list = root.querySelectorAll(sel);
    for (var i = 0; i < list.length; i++) if (vis(list[i]) && !list[i].closest('.dr-box, dialog, [hidden], .pg-box')) return list[i];
    return null;
  }
  function firstGlobal(sel) {
    var list = document.querySelectorAll(sel);
    for (var i = 0; i < list.length; i++) if (vis(list[i])) return list[i];
    return null;
  }

  var done = null, email = '', loading = null, run = null, forced = false;

  function who() {
    try { if (typeof sb !== 'undefined' && sb.auth) return sb.auth.getSession().then(function (r) { return ((r.data && r.data.session && r.data.session.user && r.data.session.user.email) || '').toLowerCase(); }); } catch (e) {}
    return Promise.resolve('');
  }
  function readLocal() { try { return JSON.parse(localStorage.getItem(LS + email) || '[]'); } catch (e) { return []; } }
  function writeLocal() { try { localStorage.setItem(LS + email, JSON.stringify(Object.keys(done))); } catch (e) {} }
  function load() {
    if (loading) return loading;
    loading = who().then(function (e) {
      email = e || 'anon';
      done = {};
      readLocal().forEach(function (p) { done[p] = 1; });
      if (!e || typeof sb === 'undefined') return;
      return Promise.resolve(sb.rpc('page_guide_get')).then(function (r) {
        if (r && !r.error && Array.isArray(r.data)) { r.data.forEach(function (p) { done[p] = 1; }); writeLocal(); }
      }).catch(function () {});
    }).catch(function () { done = done || {}; });
    return loading;
  }
  function rpc(name, args) { try { if (typeof sb !== 'undefined') return Promise.resolve(sb.rpc(name, args)).catch(function () {}); } catch (e) {} return Promise.resolve(); }
  function previewing() { try { return typeof trsViewAs === 'function' && !!trsViewAs(); } catch (e) { return false; } }
  function current() { try { return typeof CURRENT_VIEW !== 'undefined' ? CURRENT_VIEW : null; } catch (e) { return null; } }

  function stepsFor(v) {
    var out = [];
    for (var i = 0; i < STEPS.length && out.length < MAX; i++) {
      var el = STEPS[i].find(v);
      if (el) out.push({ s: STEPS[i], el: el });
    }
    return out;
  }

  // ---- the card ----
  function close() {
    if (!run) return;
    run.stop = true;
    window.removeEventListener('resize', run.pos); window.removeEventListener('scroll', run.pos, true);
    document.removeEventListener('keydown', run.key, true);
    if (run.root && run.root.parentNode) run.root.parentNode.removeChild(run.root);
    var back = run.from; run = null;
    try { if (back && back.focus) back.focus(); } catch (e) {}
  }
  function open(v, steps) {
    close();
    var root = document.createElement('div');
    root.className = 'pg-root';
    root.innerHTML = '<div class="pg-veil"></div><div class="pg-spot" aria-hidden="true"></div>' +
      '<div class="pg-box" role="dialog" aria-modal="true" aria-labelledby="pgT" tabindex="-1">' +
      '<button type="button" class="pg-x" aria-label="Close the guide for now">×</button>' +
      '<div class="pg-k"></div><h2 class="pg-t" id="pgT"></h2><p class="pg-b" id="pgB" aria-live="polite"></p>' +
      '<div class="pg-nav"><button type="button" class="pg-btn" data-back>Back</button><button type="button" class="pg-btn pg-main" data-next>Next</button></div>' +
      '<button type="button" class="pg-got">Got it, do not show again</button></div>';
    document.body.appendChild(root);
    var box = root.querySelector('.pg-box'), spot = root.querySelector('.pg-spot');
    run = { root: root, v: v, i: 0, steps: steps, from: document.activeElement };
    var self = run;

    function pos() {
      if (self.stop) return;
      var st = self.steps[self.i], el = st.el;
      if (!document.contains(el) || !vis(el)) { var f = st.s.find(v); if (f) st.el = el = f; }
      var r = el.getBoundingClientRect(), pad = 6, vw = window.innerWidth, vh = window.innerHeight;
      spot.style.cssText = 'left:' + (r.left - pad) + 'px;top:' + (r.top - pad) + 'px;width:' + (r.width + pad * 2) + 'px;height:' + (r.height + pad * 2) + 'px';
      if (vw <= 760) { box.style.left = ''; box.style.top = ''; box.classList.add('pg-phone'); return; }   // on a phone the card is a bottom sheet (CSS)
      box.classList.remove('pg-phone');
      var bw = box.offsetWidth, bh = box.offsetHeight, below = r.bottom + 14, x = Math.min(Math.max(12, r.left), vw - bw - 12);
      var y = below + bh + 12 <= vh ? below : (r.top - bh - 14 >= 12 ? r.top - bh - 14 : Math.min(Math.max(12, r.bottom + 14), vh - bh - 12));
      box.style.left = x + 'px'; box.style.top = y + 'px';
    }
    self.pos = pos;
    function draw() {
      var st = self.steps[self.i], n = self.steps.length;
      root.querySelector('.pg-k').textContent = 'How this page works · ' + (self.i + 1) + ' of ' + n;
      root.querySelector('.pg-t').textContent = st.s.title;
      root.querySelector('.pg-b').textContent = st.s.text;
      root.querySelector('[data-back]').hidden = self.i === 0;
      root.querySelector('[data-next]').textContent = self.i === n - 1 ? 'Done for now' : 'Next';
      // bring the part into view above the card, then place the spotlight; a part inside the fixed top bar needs no scroll
      var el = st.el, r = el.getBoundingClientRect();
      var fixedTop = !!el.closest('#topbar, .topbar, #sidebar, .sidebar, .lg-side');
      if (!fixedTop && (r.top < 90 || r.bottom > window.innerHeight * (window.innerWidth <= 760 ? 0.5 : 0.8))) {
        try { window.scrollTo({ top: window.scrollY + r.top - window.innerHeight * 0.28, behavior: 'smooth' }); } catch (e) {}
      }
      pos(); setTimeout(pos, 320); setTimeout(pos, 700);
    }
    self.draw = draw;
    self.key = function (e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === 'Tab') {   // keep focus inside the card
        var f = box.querySelectorAll('button:not([hidden])'), a = f[0], z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    };
    document.addEventListener('keydown', self.key, true);
    window.addEventListener('resize', pos); window.addEventListener('scroll', pos, true);
    root.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.classList.contains('pg-x')) close();
      else if (b.hasAttribute('data-back')) { if (self.i > 0) { self.i--; draw(); } }
      else if (b.hasAttribute('data-next')) { if (self.i < self.steps.length - 1) { self.i++; draw(); } else close(); }
      else if (b.classList.contains('pg-got')) { dismiss(v); close(); }
    });
    draw();
    try { box.focus({ preventScroll: true }); } catch (e) {}
  }

  function dismiss(v) {
    done = done || {}; done[v] = 1; writeLocal();
    rpc('page_guide_dismiss', { p_page: v });
  }

  // Called by showView() after a page is drawn. Pages draw asynchronously, so it waits (up to about 7 seconds) until two real parts are on screen.
  function maybe(v, again) {
    if (previewing() || !v) return;
    forced = !!again;
    load().then(function () {
      if (!forced && done[v]) return;
      var tries = 0;
      (function wait() {
        if (current() !== v) return;                        // the person has already moved on
        if (document.querySelector('.dr-box')) { if (tries++ < 20) setTimeout(wait, 400); return; }
        var steps = stepsFor(v);
        if (steps.length >= MIN) { if (!run || run.v !== v) setTimeout(function () { if (current() === v && !document.querySelector('.dr-box')) open(v, stepsFor(v).length >= MIN ? stepsFor(v) : steps); }, 650); return; }
        if (tries++ < 18) setTimeout(wait, 400);
      })();
    });
  }
  function again() {
    var v = current(); if (!v) return;
    load().then(function () { if (done) delete done[v]; writeLocal(); return rpc('page_guide_reset', { p_page: v }); }).then(function () { maybe(v, true); });
  }

  window.TRSGuide = { maybe: maybe, again: again, close: close };
  document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('[data-guide-again]')) { e.preventDefault(); again(); } });
})();
