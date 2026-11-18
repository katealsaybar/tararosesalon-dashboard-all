// First-time guide on every report (Kate, 18 Nov 2026: "para sa first time openers ng report, dapat may guide / how to navigate it, sila na lang mag cancel
// once maalam na sila, will keep appearing to teach them, and it won't appear again ever").
//
// ONE shared component, no per-page tours. When a page opens, showView() calls TRSGuide.maybe(view). It looks for the real parts of that page (the header
// filter, the Why wall, the "On this page" nav, a clickable figure, a table heading menu, the XLSX and CSV buttons), keeps the ones that are really there
// (up to six, never a blank), and shows them one at a time over a dimmed page. A page needs at least one real part of its own (besides the shell's Sections list and search) or it shows no guide.
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
  // Reading order. NAV steps first (where am I, how do I get to another report, how do I find anything), then the parts of THIS page. Kate, 18 Nov 2026: the
  // navigation instructions were not clear on some reports, because only the parts the page happened to have were explained and its own tabs, view buttons and
  // table menus were never found. Each step has a one-line plain instruction that says what to tap and what happens.
  var STEPS = [
    { id: 'sections', nav: 1, find: function (v) { var s = document.getElementById('sidebar'); if (s && s.getBoundingClientRect().left >= 0 && vis(s)) return s; var b = document.getElementById('navBtn'); return vis(b) ? b : null; },
      title: 'Your reports live here',
      text: function (el) { return el.id === 'sidebar' ? 'This list has every report. Tap a name to open it, or a group heading to fold or open the group.' : (window.innerWidth <= 760 ? 'Tap Menu to open the list of every report. Tap a name in it to open that report.' : 'Tap Sections to open the list of every report. Tap a name in it to open that report.'); } },
    { id: 'search', nav: 1, find: function (v) { var b = document.getElementById('gsTrig'); return vis(b) ? b : null; },
      title: 'Find anything fast', text: 'Type a report, a name or a question and jump straight to it. Press the / key to start typing from anywhere.' },
    { id: 'filters', find: function (v) { var w = document.getElementById('filtersWrap'); return vis(w) && !w.classList.contains('closed') ? w : null; },
      title: 'Pick a salon and a period', text: 'Choose them here and every number on this page changes with them. Hide filters tucks this bar away when you want more room.' },
    { id: 'why', find: function (v) { return first(v, '.why-wall, .ms-why'); },
      title: 'Start here', text: 'Three short lines: why this page matters, why now, and what happens if we do nothing. Then the one action for this week.' },
    { id: 'nav', find: function (v) { return firstGlobal('.lg-side .side-nav, .jn-rail .side-nav, .jn-rail .jn-nav, .jn-rail'); },
      title: 'Jump to any section',
      text: function (el) { return el.getBoundingClientRect().width < 260 ? 'The list on the side has every section of this page. Tap one to jump there. The one you are reading lights up.' : 'The chips under the title are every section of this page. Tap one to jump there. The one you are reading lights up.'; } },
    { id: 'switch', find: function (v) { return findSwitch(v); },
      title: 'Switch the view', text: 'This page has more than one view. Tap a button to switch. Your salon and period stay as they are.' },
    { id: 'figure', find: function (v) { return first(v, '.dn[data-dn], [data-drill], .fig'); },
      title: 'Numbers open up', text: 'Tap an underlined number to open the rows behind it, so you can see exactly who or what makes it. Esc or Back closes it.' },
    { id: 'menu', find: function (v) { return first(v, 'th button[aria-haspopup="true"], th .dr-fb, th [data-fc], th .lc-thb, th .lc-fn, th .lc-sort, th .w13-fb, th [class*="-fb"]'); },
      title: 'Every heading has a menu', text: 'Tap the little arrow on a heading to sort the column, or to filter it by value or by condition, the same way you would in Google Sheets.' },
    { id: 'export', find: function (v) { return first(v, '.rex-bar') || buttonByText(v, /^(save as )?(xlsx|csv)$/i); },
      title: 'Need it in a sheet?', text: 'Download this report as XLSX or CSV from here.' }
  ];
  // Pages whose real parts the generic finders cannot see: Service Calendar is drawn in a shadow root, Content Calendar is a frame with its own bar in the
  // masthead. Kate, 18 Nov 2026: "i-apply mo na rin sa Service Calendar", "wala rin sa content calendar". They keep the two navigation steps (and the
  // header filter for Service Calendar, whose Branch and Period are the shell's) and then explain what is really on that page. Texts follow the page's own
  // "How to read it" note.
  function inShadow(host, sel) {
    var h = document.getElementById(host), r = h && h.shadowRoot; if (!r) return null;
    var list = r.querySelectorAll(sel);
    for (var i = 0; i < list.length; i++) if (vis(list[i])) return list[i];
    return null;
  }
  var OWN = {
    servicecal: [
      { id: 'svc-view', find: function () { return inShadow('serviceCalContent', '#vbar'); },
        title: 'Day, Week or List', text: 'Switch the view here. Day shows every stylist for one day, Week shows one stylist across the days, List is every service in a table. Use the arrows to move to another day.' },
      { id: 'svc-tiles', find: function () { return inShadow('serviceCalContent', '#cards'); },
        title: 'The day at a glance', text: 'These tiles count the services, the chair time and the busiest moment. Tap a tile to jump to the services behind it.' },
      { id: 'svc-cal', find: function () { return inShadow('serviceCalContent', '#cal, #calMain'); },
        title: 'Read the calendar', text: 'Each block is one service. Solid is done and paid, striped is the client in the chair now, dashed is booked and still to come. Tap a block for the detail, or a stylist\u2019s name for her week.' },
      { id: 'svc-legend', find: function () { return inShadow('serviceCalContent', '#legend'); },
        title: 'Show or hide a kind', text: 'Tap a colour to hide or show that kind of service. Tap it again to bring it back.' }
    ],
    contentcalendar: [
      { id: 'cc-bar', find: function () { var b = document.getElementById('calRow'); return vis(b) ? b : null; },
        title: 'Months, days and views', text: 'Use the arrows to move between months and Today to come back. Daily, Week, Month and List change how the calendar is drawn.' },
      { id: 'cc-frame', find: function () { var f = document.getElementById('calFrame'); return vis(f) ? f : null; },
        title: 'Every post, on its day', text: 'Each coloured block is a post, on the day it went out. At the top of the calendar are Filters, the summary of the month, and Download XLSX and CSV.' }
    ]
  };
  // when there are more than MAX steps, the ones lowest in this list are dropped first (the reading order above is kept)
  var DROP = ['svc-legend', 'export', 'search', 'sections', 'menu', 'figure', 'switch', 'why', 'nav', 'filters'];
  var MAX = 6, MIN = 3;

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
  function buttonByText(v, re) {
    var root = document.getElementById('view-' + v) || document, list = root.querySelectorAll('button, a');
    for (var i = 0; i < list.length; i++) if (vis(list[i]) && re.test((list[i].textContent || '').trim()) && !list[i].closest('.dr-box, dialog, [hidden], .pg-box')) return list[i];
    return null;
  }
  // The page's own tabs or view buttons (not the shell's Branch and Period chips): a tab list, a segmented control, or a group of two or more
  // buttons that say which one is on (aria-pressed).
  function findSwitch(v) {
    var root = document.getElementById('view-' + v); if (!root) return null;
    var ok = function (el) { return vis(el) && el.querySelectorAll('button, [role="tab"], a').length >= 2 && !el.closest('#filtersWrap, #topbar, .dr-box, dialog, [hidden], .pg-box, th, table'); };
    var list = root.querySelectorAll('[role="tablist"], .seg, .tp-seg, [class*="-seg"], .tabs, [class*="tabbar"], [class*="tab-bar"], [class*="-tabs"]');
    for (var i = 0; i < list.length; i++) if (ok(list[i])) return list[i];
    var pr = root.querySelectorAll('button[aria-pressed]');
    for (var k = 0; k < pr.length; k++) { var g = pr[k].parentElement; if (g && ok(g) && g.querySelectorAll('button[aria-pressed]').length >= 2) return g; }
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
    var base = STEPS;
    if (OWN[v]) base = STEPS.filter(function (x) { return x.id === 'sections' || x.id === 'search' || (x.id === 'filters' && v !== 'contentcalendar'); }).concat(OWN[v]);
    var all = [];
    for (var i = 0; i < base.length; i++) { var el = base[i].find(v); if (el) all.push({ s: base[i], el: el }); }
    var drop = 0;
    while (all.length > MAX && drop < DROP.length) {
      var id = DROP[drop++];
      all = all.filter(function (x) { return x.s.id !== id || all.length <= MAX; });
    }
    return all;
  }
  function scroller(el) {
    var n = el;
    while (n) {
      if (n.nodeType === 1) {
        var cs = getComputedStyle(n);
        if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 4 && n !== document.body && n !== document.documentElement) return n;
      }
      n = n.parentElement || (n.getRootNode && n.getRootNode().host) || null;
    }
    return null;
  }
  function pageParts(steps) { return steps.filter(function (x) { return !x.s.nav; }).length; }

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
      if (!el.isConnected || !vis(el)) { var f = st.s.find(v); if (f) st.el = el = f; }
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
      root.querySelector('.pg-b').textContent = typeof st.s.text === 'function' ? st.s.text(st.el) : st.s.text;
      root.querySelector('[data-back]').hidden = self.i === 0;
      root.querySelector('[data-next]').textContent = self.i === n - 1 ? 'Done for now' : 'Next';
      // bring the part into view above the card, then place the spotlight; a part inside the fixed top bar needs no scroll
      var el = st.el, r = el.getBoundingClientRect();
      var fixedTop = !!el.closest('#topbar, .topbar, #sidebar, .sidebar, .lg-side');
      if (!fixedTop && (r.top < 90 || r.bottom > window.innerHeight * (window.innerWidth <= 760 ? 0.5 : 0.8))) {
        // the dashboard scrolls inside its own box on some pages (and a part can sit in a shadow root), so find the box that really scrolls
        var sc = scroller(el), want = r.height > window.innerHeight * 0.5 ? 130 : window.innerHeight * 0.3;
        try {
          if (sc) sc.scrollTo({ top: sc.scrollTop + r.top - sc.getBoundingClientRect().top - want, behavior: 'auto' });
          else window.scrollTo({ top: window.scrollY + r.top - want, behavior: 'auto' });
        } catch (e) {}
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
        if (steps.length >= MIN && pageParts(steps) >= 1) { if (!run || run.v !== v) setTimeout(function () { if (current() === v && !document.querySelector('.dr-box')) open(v, stepsFor(v).length >= MIN && pageParts(stepsFor(v)) >= 1 ? stepsFor(v) : steps); }, 650); return; }
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
