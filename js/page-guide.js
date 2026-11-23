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
  // What a tapped number opens, by page (Kate, 18 Nov 2026: "yung navigation guide must be specific din to what is being represented / reported / shown").
  // Only where it is certain; any other page says "rows". Everything else in a step is read from the page itself: its name and group (pages.js), the real
  // section names in its list, the real labels on its view buttons, a real figure and the real column headings.
  var OPENS = {
    clients: 'clients', clientmix: 'clients', retention: 'clients', clientbook: 'clients', lostclients: 'clients', lostlists: 'clients', novblasts: 'clients',
    complaints: 'complaints', complaintsdetail: 'complaints', complaintchats: 'chats', reviews: 'reviews', services: 'services', products: 'products', outofstock: 'products',
    supplierpay: 'invoices', orders: 'invoices', recruitment: 'applicants', glowclub: 'members', stripedeposits: 'deposits', depositcheck: 'deposits',
    team: 'staff', teamquad: 'staff', staffperf: 'staff', attrition: 'staff', stafflevels: 'stylists', wvperf: 'redemptions', wvblast: 'messages', campaignblasts: 'messages'
  };
  function info(v) {
    var o = null, list = window.TRS_PAGES || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === v) { o = list[i]; break; }
    var label = o ? o.label : 'this page', where = o && o.group ? o.group + (o.sub ? ', ' + o.sub : '') : '';
    return { label: label, where: where, opens: OPENS[v] || 'rows' };
  }
  function names(el, sel, n) {
    var out = [], list = el.querySelectorAll(sel);
    for (var i = 0; i < list.length && out.length < n; i++) {
      var t = (list[i].textContent || '').replace(/[\u2191\u2193\u25be\u25bc]/g, '').replace(/\s+/g, ' ').trim();
      if (t && t.length <= 28 && !/^on this page$/i.test(t) && out.indexOf(t) < 0) out.push(t);
    }
    return out;
  }
  function orList(a) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' or ' + a[a.length - 1]; }

  // Reading order. NAV steps first (where am I, how do I get to another report, how do I find anything), then the parts of THIS page. Each step is one plain
  // instruction that says what to tap and what happens, worded with this page's own name and contents.
  var STEPS = [
    { id: 'sections', nav: 1, find: function (v) { var s = document.getElementById('sidebar'); if (s && s.getBoundingClientRect().left >= 0 && vis(s)) return s; var b = document.getElementById('navBtn'); return vis(b) ? b : null; },
      title: 'Your reports live here',
      text: function (el, c) {
        var where = c.where ? c.label + ' is in ' + c.where + '. ' : '';
        return where + (el.id === 'sidebar' ? 'This list has every report. Tap a name to open it, or a group heading to fold or open the group.'
          : (window.innerWidth <= 760 ? 'Tap Menu to open the list of every report, then a name to open it.' : 'Tap Sections to open the list of every report, then a name to open it.'));
      } },
    { id: 'search', nav: 1, find: function (v) { var b = document.getElementById('gsTrig'); return vis(b) ? b : null; },
      title: 'Find anything fast', text: function (el, c) { return 'Looking for something that is not on ' + c.label + '? Type a report, a name or a question and jump straight to it. Press the / key to start typing from anywhere.'; } },
    { id: 'filters', find: function (v) { var w = document.getElementById('filtersWrap'); return vis(w) && !w.classList.contains('closed') ? w : null; },
      title: 'Pick a salon and a period', text: function (el, c) { return 'Choose them here and every number on ' + c.label + ' changes with them. Hide filters tucks this bar away when you want more room.'; } },
    { id: 'why', find: function (v) { return first(v, '.why-wall, .ms-why'); },
      title: 'Start here', text: function (el, c) { return 'Why ' + c.label + ' matters, why now, and what happens if we do nothing. Then the one action for this week.'; } },
    { id: 'nav', find: function (v) { return firstGlobal('.lg-side .side-nav, .jn-rail .side-nav, .jn-rail .jn-nav, .jn-rail'); },
      title: 'Jump to any section',
      text: function (el, c) {
        var n = names(el, 'a, button', 5), list = n.length >= 2 ? ' (' + orList(n.slice(0, 4)) + (n.length > 4 ? ' and more' : '') + ')' : '';
        return (el.getBoundingClientRect().width < 260 ? 'The list on the side shows' : 'The chips under the title show') + ' the sections of ' + c.label + list + '. Tap one to jump there. The one you are reading lights up.';
      } },
    { id: 'switch', find: function (v) { return findSwitch(v); },
      title: 'Switch the view',
      text: function (el, c) {
        var n = names(el, 'button, [role="tab"], a', 4);
        return (n.length >= 2 ? 'Tap ' + orList(n) + ' to see ' + c.label + ' another way.' : c.label + ' has more than one view. Tap a button to switch.') + ' Your salon and period stay as they are.';
      } },
    { id: 'figure', find: function (v) { return first(v, '.dn[data-dn], [data-drill], .fig'); },
      title: 'Numbers open up',
      text: function (el, c) {
        var t = (el.textContent || '').trim(), ex = t && t.length <= 12 && /\d/.test(t) ? ', like ' + t + ',' : '';
        return 'Tap an underlined number' + ex + ' to open the ' + c.opens + ' behind it, so you can see exactly what makes it. Esc or Back closes it.';
      } },
    { id: 'menu', find: function (v) { return first(v, 'th button[aria-haspopup="true"], th .dr-fb, th [data-fc], th .lc-thb, th .lc-fn, th .lc-sort, th .w13-fb, th [class*="-fb"]'); },
      title: 'Every heading has a menu',
      text: function (el) {
        var tb = el.closest('table'), n = tb ? names(tb, 'th', 3) : [];
        return 'Tap the little arrow on a heading' + (n.length ? ', such as ' + orList(n) + ',' : '') + ' to sort the column, or to filter it by value or by condition, the same way you would in Google Sheets.';
      } },
    { id: 'export', find: function (v) { return first(v, '.rex-bar') || buttonByText(v, /^(save as )?(xlsx|csv)$/i); },
      title: 'Need it in a sheet?', text: function (el, c) { return 'Download ' + c.label + ' as XLSX or CSV from here.'; } }
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
  function inFrame(frameId, sel) {
    var f = document.getElementById(frameId), d = null;
    try { d = f && f.contentDocument; } catch (e) { return null; }
    if (!d || !d.body) return null;
    var list = d.querySelectorAll(sel);
    for (var i = 0; i < list.length; i++) if (vis(list[i])) return list[i];
    return null;
  }
  var NAVSTEP = STEPS.filter(function (x) { return x.id === 'nav'; })[0];
  function nth(v, sel, n) {
    var root = document.getElementById('view-' + v), list = root ? root.querySelectorAll(sel) : [];
    return list[n] && vis(list[n]) ? list[n] : null;
  }
  var OWN = {
    // Org Chart (Kate, 18 Nov 2026: "i-apply mo na rin sa Org Chart"): one box per team, a box per person with photo, name and role, lines for who reports to whom, and zoom buttons.
    orgchart: [
      { id: 'oc-teams', need: 1, find: function (v) { return first(v, '.oc-section'); },
        title: 'The whole group on one chart',
        text: function (el) {
          var root = document.getElementById('view-orgchart'), n = root ? names(root, '.section-label', 1) : [];
          return 'The chart shows the whole ' + (n[0] || 'group') + '. Scroll to see every team and the people in it, or zoom out to fit more on the screen.';
        } },
      { id: 'oc-node', find: function (v) { return first(v, '.oc-node'); },
        title: 'Who is who', text: 'Each box is one person, with a photo, a name and a role.' },
      { id: 'oc-zoom', find: function (v) { return first(v, '.oc-zoom-controls'); },
        title: 'Zoom', text: 'Tap − to zoom out and see a whole team at once, or + to zoom in and read the names.' }
    ],
    // Quarterly Report (Kate, 18 Nov 2026: "i-apply mo na rin sa Quarterly Report"): its own Quarter and Branch chips (the header filter is not used), the seven numbers
    // with target, last year and the share of target, the same seven branch by branch, the Reflect and Think questions, then Save as PDF and the downloads.
    quarterreport: [
      { id: 'qr-pick', need: 1, find: function (v) { return first(v, '.qr-filters'); },
        title: 'Pick the quarter and the salon',
        text: function (el) {
          var q = el.querySelector('.qr-fg'), n = q ? names(q, '.qr-chip', 20) : [];
          return 'Choose the quarter' + (n.length > 1 ? ', from ' + n[0] + ' back to ' + n[n.length - 1] + ',' : '') + ' and then All branches or one salon. The seven numbers change with them. A quarter that is still open shows its target to date, not the whole quarter.';
        } },
      { id: 'qr-nav', find: NAVSTEP.find, title: NAVSTEP.title, text: NAVSTEP.text },
      { id: 'qr-numbers', need: 1, find: function (v) { return nth(v, '.qr-jt', 0); },
        title: 'The seven numbers', text: 'These are the seven numbers for the quarter you picked. Each shows the figure, its target, the same dates last year and how far it is from target. Tap any figure to open the list behind it.' },
      { id: 'qr-branches', find: function (v) { return nth(v, '.qr-jt', 1); },
        title: 'Branch by branch',
        text: function (el) {
          var n = names(el, 'th', 8).filter(function (x) { return !/^number$/i.test(x); });
          return 'The same seven numbers side by side' + (n.length ? ': read across to compare ' + orList(n) : '') + '. Tap any figure here to open the list behind it too.';
        } },
      { id: 'qr-reflect', find: function (v) { return first(v, '.qr-reflect'); },
        title: 'Before you decide anything', text: 'Answer What did you notice? in your own words, then write one sentence on what you know now that you did not know last quarter. Your commitment comes last.' },
      { id: 'qr-tools', find: function (v) { return first(v, '.qr-tools'); },
        title: 'Take it with you', text: 'Save this report as a PDF, or download it as XLSX or CSV.' }
    ],
    // Find a Stylist (Kate, 18 Nov 2026: "i-apply mo na rin sa Find a Stylist"): the Team Home page in a same-origin frame, three questions about the client, then names.
    findstylist: [
      { id: 'fs-card', need: 1, find: function () { return inFrame('findStylistFrame', '.mx-doc'); },
        title: 'Three quick questions', text: 'Tell it which salon she is booking, what she is booking, and what kind of appointment she wants. Tap an option to move on. At the end you get the stylists to offer her.' },
      { id: 'fs-skip', find: function () { return inFrame('findStylistFrame', '.mx-skip'); },
        title: 'Not sure yet?', text: 'If she has not said which salon, tap Any salon works for her to skip that question. You can change an answer later from the chips that appear above the question.' },
      { id: 'fs-checklist', find: function () { return inFrame('findStylistFrame', '.mx-lead a'); },
        title: 'Who does what', text: 'Just want to check what a stylist does? The full checklist lists every stylist and what she does. It opens on its own page.' }
    ],
    servicecal: [
      { id: 'svc-rail', find: function () { return inShadow('serviceCalContent', '#rail'); },
        title: 'Jump to a section', text: 'On a computer this list sits on the left, on a phone it is a row of chips under the header. Tap Client types, Shifts and overtime, The calendar or About this page to jump there. The one you are reading lights up.' },
      { id: 'svc-view', find: function () { return inShadow('serviceCalContent', '#vbar'); },
        title: 'Day, Week or List', text: 'Switch the view here. Day shows every stylist for one day, Week shows one stylist across the days, List is every service in a table. Use the arrows to move to another day.' },
      { id: 'svc-tiles', find: function () { return inShadow('serviceCalContent', '#cards'); },
        title: 'The day at a glance', text: 'These tiles count the services, the chair time and the busiest moment. Tap a tile to jump to the services behind it.' },
      { id: 'svc-cal', need: 1, find: function () { return inShadow('serviceCalContent', '#cal'); },
        title: 'Read the calendar', text: 'Each block is one service. A full block is done and paid, a block with a dot is the client in the chair now, a paler block is booked and still to come. Tap a block for the detail, or a stylist\u2019s name for her week.' },
      { id: 'svc-types', need: 1, find: function () { return inShadow('serviceCalContent', '#sec-types'); },
        title: 'Client types and Shifts', text: 'These two tables start closed. Tap the heading to open one: it shows 10 stylists a page, and Rows lets you pick 20, 50 or 100. Tap a number to see who those clients were.' },
      { id: 'svc-legend', find: function () { return inShadow('serviceCalContent', '#legend'); },
        title: 'Show or hide a kind', text: 'Tap a colour to hide or show that kind of service. Tap it again to bring it back.' }
    ],
    // Leave & Holiday Calendar (Kate, 18 Nov 2026: "i-apply mo na rin sa Leave Calendar"): drawn in a shadow root with its own filter bar, its own
    // "On this page" list, tiles, a calendar where a tap on a day shows who is off, and tables with Sheets-style heading menus.
    leavecal: [
      { id: 'lv-filters', need: 1, find: function () { return inShadow('leaveCalContent', '#filters'); },
        title: 'Choose who and when', text: 'Branch and Year follow the filters at the top of the dashboard. Here you pick present or resigned staff, a department and the view. Everything on the page follows them. Hide filters tucks the bar away.' },
      { id: 'lv-rail', find: function () { return inShadow('leaveCalContent', '.rail'); },
        title: 'Jump to any section', text: 'These are the sections of this page: the calendar, sick leave and absences, usual day offs and public holidays. Tap one to jump there. The one you are reading lights up.' },
      { id: 'lv-tiles', need: 1, find: function () { return inShadow('leaveCalContent', '#tiles'); },
        title: 'Quick answers', text: 'These tiles answer the quick questions: who is off today, the next public holiday, and what is still waiting for approval in Bayzat.' },
      { id: 'lv-cal', need: 1, find: function () { return inShadow('leaveCalContent', '#cal'); },
        title: 'Tap a day', text: 'Each day shows who is off. Tap a day to see the names and the reason in the panel beside it. Use the arrows to change month and Today to come back.' },
      { id: 'lv-menu', find: function () { return inShadow('leaveCalContent', '#det-sick > summary'); },
        title: 'Sick leave and day offs', text: 'These two tables start closed. Tap the heading to open one: it shows 10 people a page, Rows lets you pick 20, 50 or 100, and every table heading has a menu like Google Sheets.' },
      { id: 'lv-export', find: function () { return inShadow('leaveCalContent', '.rex-bar'); },
        title: 'Need it in a sheet?', text: 'Each section has its own XLSX and CSV download.' }
    ],
    contentcalendar: [
      { id: 'cc-bar', find: function () { var b = document.getElementById('calRow'); return vis(b) ? b : null; },
        title: 'Months, days and views', text: 'Use the arrows to move between months and Today to come back. Daily, Week, Month and List change how the calendar is drawn.' },
      { id: 'cc-frame', need: 1, find: function () { var f = document.getElementById('calFrame'); return vis(f) ? f : null; },
        title: 'Every post, on its day', text: 'Each coloured block is a post, on the day it went out. At the top of the calendar are Filters, the summary of the month, and Download XLSX and CSV.' }
    ]
  };
  // when there are more than MAX steps, the ones lowest in this list are dropped first (the reading order above is kept)
  var DROP = ['svc-legend', 'lv-export', 'export', 'qr-tools', 'search', 'lv-tiles', 'search', 'sections', 'menu', 'figure', 'switch', 'why', 'nav', 'filters'];
  var MAX = 6, MIN = 3;

  function vis(el) { var w = el && el.ownerDocument && el.ownerDocument.defaultView || window; return !!(el && el.getClientRects().length && w.getComputedStyle(el).visibility !== 'hidden'); }
  // The rectangle of a part on the dashboard page. A part inside a same-origin frame (Find a Stylist) reports its place inside the frame, so the frame's own place is added.
  function rectOf(el) {
    var r = el.getBoundingClientRect(), w = el.ownerDocument && el.ownerDocument.defaultView, fe = w && w !== window ? w.frameElement : null;
    if (!fe) return r;
    var f = fe.getBoundingClientRect();
    return { left: r.left + f.left, top: r.top + f.top, right: r.right + f.left, bottom: r.bottom + f.top, width: r.width, height: r.height };
  }
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
    if (OWN[v]) base = STEPS.filter(function (x) { return x.id === 'sections' || x.id === 'search' || (x.id === 'filters' && v !== 'contentcalendar' && v !== 'leavecal' && v !== 'findstylist'); }).concat(OWN[v]);
    var all = [];
    for (var i = 0; i < base.length; i++) { var el = base[i].find(v); if (el) all.push({ s: base[i], el: el }); }
    var drop = 0;
    while (all.length > MAX && drop < DROP.length) {
      var id = DROP[drop++];
      all = all.filter(function (x) { return x.s.id !== id || all.length <= MAX; });
    }
    return all;
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
      var r = rectOf(el), pad = 6, vw = window.innerWidth, vh = window.innerHeight;
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
      var body = ''; try { body = typeof st.s.text === 'function' ? st.s.text(st.el, info(v)) : st.s.text; } catch (e) { body = ''; }   // a wording problem must never break the card
      root.querySelector('.pg-b').textContent = body;
      root.querySelector('[data-back]').hidden = self.i === 0;
      root.querySelector('[data-next]').textContent = self.i === n - 1 ? 'Done for now' : 'Next';
      // bring the part into view above the card, then place the spotlight; a part inside the fixed top bar needs no scroll
      var el = st.el;
      if (!el.isConnected || !vis(el)) { var f2 = st.s.find(v); if (f2) st.el = el = f2; }   // a page that redraws its parts (the Service Calendar does) leaves the old element behind
      var r = rectOf(el);
      var fixedTop = !!el.closest('#topbar, .topbar, #sidebar, .sidebar, .lg-side');
      if (!fixedTop && (r.top < 90 || r.bottom > window.innerHeight * (window.innerWidth <= 760 ? 0.5 : 0.8))) {
        // the page itself scrolls (the dashboard has no inner scroll box), so scroll the window; a tall part goes just under the sticky bars
        var want = r.height > window.innerHeight * 0.5 ? 130 : window.innerHeight * 0.3;
        try { window.scrollTo({ top: window.scrollY + r.top - want, behavior: 'instant' }); } catch (e) {}
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
        if (OWN[v] && tries < 45 && OWN[v].some(function (x) { return x.need && !x.find(v); })) { tries++; setTimeout(wait, 400); return; }   // the calendar draws after its data arrives
        if (steps.length >= MIN && pageParts(steps) >= 1) { if (!run || run.v !== v) setTimeout(function () { if (current() === v && !document.querySelector('.dr-box')) open(v, stepsFor(v).length >= MIN && pageParts(stepsFor(v)) >= 1 ? stepsFor(v) : steps); }, 650); return; }
        if (tries++ < 45) setTimeout(wait, 400);
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
