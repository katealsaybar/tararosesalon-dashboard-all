/* Download this page (Kate, 18 Nov 2026): one XLSX and one CSV button in the sticky masthead for every page that can export.
   The per-table buttons inside a page stay for single tables; this one is the WHOLE page.

   How a page joins:
     TRSExport.register('<view id>', '<name of a global function>', { csv: '<name of the tab the CSV holds>', lazy: '<script group to load first>' });
   The function is the same kind report-export.js already runs (rexRun): it returns { name, csv, sheets } and may be async. For a page with several
   tables it returns ONE workbook, one sheet per table (Service Rankings: srExportPage). A page that is not registered shows no button.
   The function is looked up by name when the button is pressed, so a page's script need not be loaded yet when it is registered here. A model that lives in a
   script group the page does not load until its own button is pressed (the Pulse, Staff Dashboards, Google Reviews) names it in lazy; it is loaded first.
   showView() calls TRSExport.sync(view) on every page change; the button lives in index.html (.mast-dl on a computer, #mastDlM on a phone).
   The files are written by report-export.js + ledger-export.js, loaded on first press. */
(function () {
  'use strict';
  var REG = {}, cur = '', pop = null;

  function register(view, fn, o) { if (view && (fn || (o && o.custom))) REG[view] = { fn: fn, csv: (o && o.csv) || '', lazy: (o && o.lazy) || '', dom: !!(o && o.dom), custom: (o && o.custom) || null }; }
  function has(view) { return !!REG[view]; }
  function $(id) { return document.getElementById(id); }

  function titles(r) {
    var x = r && r.dom ? 'Download the tables on this page as one Excel file, one tab per table, as the page shows them' : 'Download every table on this page as one Excel file, one tab per table';
    var c = r && r.csv ? 'Download the “' + r.csv + '” table as a CSV file (a CSV holds one table, so use XLSX for all of them)'
      : r && r.dom ? 'Download the first table on this page as a CSV file (a CSV holds one table, so use XLSX for all of them)' : 'Download this page as a CSV file';
    return { x: x, c: c };
  }

  function closePop() {
    if (!pop) return;
    pop.remove(); pop = null;
    var b = $('mastDlM'); if (b) b.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', away, true);
    document.removeEventListener('keydown', esc, true);
  }
  function away(e) { if (pop && !pop.contains(e.target) && !(e.target.closest && e.target.closest('#mastDlM'))) closePop(); }
  function esc(e) { if (e.key === 'Escape') { closePop(); var b = $('mastDlM'); if (b) b.focus(); } }

  // A phone: one icon in the header opens a small card with the two files, so the header row keeps its room.
  function openPop(btn) {
    if (pop) { closePop(); return; }
    var r = REG[cur]; if (!r) return;
    var t = titles(r);
    pop = document.createElement('div');
    pop.className = 'mast-dl-pop'; pop.setAttribute('role', 'group'); pop.setAttribute('aria-label', 'Download this page');
    pop.innerHTML = '<span class="mast-dl-k">Download this page</span>' +
      '<button type="button" class="sc-btn mast-dl-pb" data-k="xlsx" title="' + t.x + '">XLSX<span>every table, one tab each</span></button>' +
      '<button type="button" class="sc-btn mast-dl-pb" data-k="csv" title="' + t.c + '">CSV<span>' + (r.csv ? 'the ' + r.csv + ' table' : 'the table') + '</span></button>';
    pop.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button[data-k]'); if (!b) return;
      run(b.getAttribute('data-k'), b).then(closePop, closePop);
    });
    document.body.appendChild(pop);
    var r0 = btn.getBoundingClientRect();
    pop.style.top = Math.round(r0.bottom + 6) + 'px';
    pop.style.right = Math.max(10, Math.round(innerWidth - r0.right)) + 'px';
    btn.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', esc, true);
  }

  function run(kind, btn) {
    var r = REG[cur]; if (!r) return Promise.resolve();
    // A page whose own save routine does more than the shared writer (Client's Last Visit adds each client's visits) runs that routine.
    if (r.custom) return Promise.resolve(r.custom(kind, btn));
    var go = function () { return Promise.resolve(rexRun(r.fn, kind, btn)).then(function () { if (r.dom && window.__trsDomPaged && typeof lgxToast === 'function') lgxToast('Saved as the page shows it: a table with pages gives the rows on the page showing.'); }); };
    var fail = function () { if (typeof lgxToast === 'function') lgxToast('The download did not load. Try again.', true); else alert('The download did not load. Try again.'); };
    // The shared writer (and, for a few pages, the model) ships in a script group; a page that opens before it has loaded fetches it now.
    var need = r.lazy || (typeof rexRun === 'function' ? '' : 'cmp');
    if (need && typeof trsLazy === 'function') return trsLazy(need).then(go, fail);
    if (typeof rexRun === 'function') return Promise.resolve(go());
    fail();
    return Promise.resolve();
  }

  // Draw or hide the control for the page now showing. Safe to call any time (no registered page = nothing shown).
  function sync(view) {
    cur = view || cur;
    var r = REG[cur], bar = $('mastDl'), m = $('mastDlM');
    closePop();
    if (bar) {
      bar.hidden = !r;
      if (r) { var t = titles(r), b = bar.querySelectorAll('button[data-k]'); b[0].title = t.x; b[1].title = t.c; }
    }
    if (m) m.hidden = !r;
    if (typeof sizeTopbar === 'function') { try { sizeTopbar(); } catch (e) { /* the bar re-measures on the next scroll */ } }
  }

  // ── Pages with no export function of their own (Kate, 18 Nov 2026: "lahat"): the tables as the page shows them ──────────────────────────────────────────────
  // domModel reads every visible <table> in the page's view into one workbook, one sheet per table, named after the heading above it. It is the fallback for a page whose
  // tables are drawn by the page and have no exporter of their own: figures are read from the cells (a plain number or percentage becomes a number, everything else stays text).
  // A table that shows ONE PAGE of its rows (Previous, Page 1 of 3, Next) gives the rows on that page only, and the sheet's subtitle says so. A page that has its own
  // exporter does not use this; it registers that function instead.
  var NUM = /^[-+]?\d{1,3}(,\d{3})*(\.\d+)?$|^[-+]?\d+(\.\d+)?$/;
  // A heading is read with textContent (innerText would give the capitals a heading is drawn in); a body cell with innerText, so hidden helper text is left out.
  function cellText(c, head) { return String(!head && c.innerText != null && c.offsetParent ? c.innerText : c.textContent).replace(/\s+/g, ' ').trim(); }
  function headingOf(t) {
    var cap = t.querySelector('caption'); if (cap && cap.textContent.trim()) return cap.textContent.trim();
    for (var n = t, hops = 0; n && hops < 12; hops++) {
      var p = n.previousElementSibling;
      while (p) {
        var h = p.matches && p.matches('h1,h2,h3,h4,.eyebrow,.section-label,.lg-head-k,.sr-h,.cm-h') ? p : (p.querySelector ? p.querySelector('h1,h2,h3,h4,.eyebrow,.section-label') : null);
        if (h && h.textContent.trim()) return h.textContent.replace(/\s+/g, ' ').trim();
        p = p.previousElementSibling;
      }
      n = n.parentElement; if (n && n.id && /^view-/.test(n.id)) break;
    }
    return '';
  }
  function domModel(view, label) {
    var root = document.getElementById('view-' + view); if (!root) return null;
    var tabs = [].slice.call(root.querySelectorAll('table')).filter(function (t) { return t.getClientRects().length && !t.closest('[hidden]') && t.rows.length > 1; });
    var paged = /Page\s+\d+\s+of\s+(\d+)/i.exec(root.innerText || ''), pagedMany = paged && Number(paged[1]) > 1;
    window.__trsDomPaged = !!pagedMany;
    var used = {}, sheets = [];
    tabs.forEach(function (t, i) {
      var rows = [].slice.call(t.rows).filter(function (r) { return r.getClientRects().length && r.cells.length; });
      if (rows.length < 2) return;
      var hd = rows[0], body = rows.slice(1);
      var heads = [].slice.call(hd.cells).map(function (c) { return cellText(c, true); });
      var data = body.map(function (r) { return [].slice.call(r.cells).map(cellText); }).filter(function (r) { return r.some(function (x) { return x !== ''; }); });
      if (!data.length) return;
      var w = Math.max(heads.length, data.reduce(function (m, r) { return Math.max(m, r.length); }, 0));
      var cols = [];
      for (var c = 0; c < w; c++) {
        var vals = data.map(function (r) { return r[c] == null ? '' : r[c]; }).filter(function (x) { return x !== ''; });
        var num = vals.length > 0 && vals.every(function (x) { return NUM.test(x.replace(/%$/, '').replace(/^AED\s*/i, '')); });
        var pct = num && vals.every(function (x) { return /%$/.test(x); });
        cols.push({ label: heads[c] || ('Column ' + (c + 1)), fmt: pct ? 'pct' : num ? 'num' : 'text', num: num });
      }
      var rowsOut = data.map(function (r) { return { cells: cols.map(function (col, c) { var x = r[c] == null ? '' : r[c]; return col.num && x !== '' ? Number(x.replace(/^AED\s*/i, '').replace(/,/g, '').replace(/%$/, '')) : x; }) }; });
      var title = headingOf(t) || (label || view) + ' table ' + (i + 1);
      var nm = title.replace(/[\\/?*\[\]:]/g, ' ').slice(0, 31).trim() || ('Table ' + (i + 1)), base = nm, k = 2;
      while (used[nm.toLowerCase()]) nm = base.slice(0, 28) + ' ' + (k++);
      used[nm.toLowerCase()] = 1;
      sheets.push({ name: nm, title: title, subtitle: (label || view) + ' as shown on the page' + (pagedMany ? '. A table with pages gives the rows on the page showing; use the page’s own buttons for a full list' : '') + '.',
        blocks: [{ cols: cols.map(function (c) { return { label: c.label, fmt: c.fmt }; }), rows: rowsOut }] });
    });
    if (!sheets.length) return null;
    return { name: view, csv: 0, sheets: sheets };
  }
  function registerDom(view, label) { var fn = '__domExport_' + view; window[fn] = function () { return domModel(view, label); }; register(view, fn, { dom: true }); }

  // A page with SEVERAL export functions, one per table (Orders and Receipts: ordExport, ordExportSup, ordExportLook): one workbook with all their sheets, in that order.
  // The CSV is the first tab. The page's own functions are not changed; a function that has nothing yet (null) is skipped.
  function registerMulti(view, fns, o) {
    var fn = '__multiExport_' + view;
    window[fn] = async function () {
      var ms = await Promise.all(fns.map(function (f) { return typeof window[f] === 'function' ? Promise.resolve(window[f]()) : null; }));
      var sheets = []; ms.forEach(function (m) { if (m && m.sheets) m.sheets.forEach(function (x) { sheets.push(x); }); });
      if (!sheets.length) return null;
      var first = ms.filter(Boolean)[0];
      return { name: first.name, csv: 0, sheets: sheets };
    };
    register(view, fn, o);
  }

  window.TRSExport = { register: register, registerDom: registerDom, registerMulti: registerMulti, has: has, sync: sync, run: run, pop: openPop };

  // Pages that have a page-level export. Each fn covers EVERY table on its page (a page with several tables returns one workbook, one sheet per table).
  // A new page: add its line here, or call TRSExport.register from its own file. [view id, global fn, name of the tab the CSV holds, script group to load first]
  [['services', 'srExportPage', 'Top services'],
   ['dashboard', 'pulseExportModel', null, 'px'], ['staffperf', 'spfExportModel', null, 'rx'], ['reviews', 'rvExportPage', 'Reviews'], ['dailyperf', 'dpExport'],
   ['overyears', 'otyExport'], ['quarterreport', 'qrExport'], ['compare', 'cmpExport'],
   ['staffweeks', 'w13Export'], ['stafflevels', 'slvExport'], ['clients', 'tcExport'], ['clientbook', 'cbExport'],
   ['complaints', 'cqExport'], ['complaintchats', 'ccExport'], ['complaintsdetail', 'cdExport'], ['recruitment', 'rctExport'],
   ['team', 'tpExport'], ['teamquad', 'tpQExport'],
   ['googleads', 'gadsExport'], ['metaads', 'madsExport'], ['website', 'webExport'], ['social', 'socExportPage', 'Daily numbers'], ['marketingspend', 'mspendExport'], ['toolspend', 'tsExport'],
   ['supplierspend', 'spendExport'], ['outofstock', 'oosExportPage', 'Order list'], ['supplierpay', 'supplierSpendExport'], ['stockcost', 'stockCostExport'],
   ['leavecal', 'lcExpAll', 'Leave'], ['servicecal', 'svcExportPage', 'Services'], ['dailyreports', 'drExport', 'This day'], ['sitetraffic', 'trfExportPage', 'Top pages'], ['campaignblasts', 'cblExport', 'Blasts'], ['novblasts', 'nvbExport', 'Plan']
  ].forEach(function (p) { register(p[0], p[1], { csv: p[2] || '', lazy: p[3] || '' }); });
  // One workbook from several of the page's own table exports.
  registerMulti('orders', ['ordExport', 'ordExportSup', 'ordExportLook'], { csv: 'Orders' });
  // The rest: no export of their own, so the tables as the page shows them (domModel above). Not here on purpose: the calendar grids themselves (the Service Calendar exports its List, Client types and Shifts tables),
  // Org Chart, Content Calendar, Find a Stylist, Landing Page Review and the complaint log form (no tables), and the Ledgers pages (their own toolbar writes the formulas).
  // Wellness Voucher Blasts draws five pages in one view (Overall, Blast 1 to 4). Blast 3's page holds the send list, which has its own save of every row the filters leave (wvSaveFile);
  // the others draw figures, so they get the tables on screen if there are any.
  window.__domExport_wvblast = function () { return domModel('wvblast', 'Wellness Voucher Blasts'); };
  register('wvblast', null, { custom: function (kind, btn) {
    if (document.getElementById('wvList') && typeof wvSaveFile === 'function') return wvSaveFile(kind);
    if (!domModel('wvblast', 'Wellness Voucher Blasts')) { var t = 'This page is figures, with no table to save. Blast 3: the 600 top spenders has the send list, and that one downloads.'; if (typeof lgxToast === 'function') lgxToast(t, true); else alert(t); return; }
    return typeof rexRun === 'function' ? rexRun('__domExport_wvblast', kind, btn) : undefined;
  } });
  // Pages whose own button runs a save routine of its own: Client's Last Visit saves the whole filtered list with each client's visits added (lcSaveFile), Retention saves both lists (retDownload).
  register('lostclients', null, { custom: function (kind) { return typeof lcSaveFile === 'function' ? lcSaveFile(kind) : undefined; } });
  register('retention', null, { custom: function (kind) {
    if (typeof retData === 'undefined' || !retData || !retData.ok) { var t = 'Nothing to download for this Period yet: Retention looks forward, so pick a Period that ended at least 2 months ago.'; if (typeof lgxToast === 'function') lgxToast(t, true); else alert(t); return; }
    return typeof retDownload === 'function' ? retDownload(kind) : undefined; } });
  // Client Mix draws family cards first, and tables only once a family is picked: the cards' figures (cmCards) as a Families tab, then whatever tables the page shows.
  window.__cmExport = function () {
    var c = typeof cmCards !== 'undefined' ? cmCards : null; if (!c || !(c.fams || []).length) return null;
    var tot = Number(c.total_clients) || 0, n = function (x) { return Number(x) || 0; };
    var fams = { name: 'Families', title: 'Client Mix by family', subtitle: 'Different clients, visits, units and revenue (AED) for each service family, for the Branch and Period picked at the top. Clients are counted once in each family they had, so the families do not add up to ' + tot + '.',
      blocks: [{ cols: [{ label: 'Family', fmt: 'text' }, { label: 'Clients', fmt: 'num' }, { label: 'Visits', fmt: 'num' }, { label: 'Units', fmt: 'num' }, { label: 'Revenue (AED)', fmt: 'aed' }],
        rows: c.fams.map(function (f) { return { cells: [typeof cmFam === 'function' ? cmFam(f.family).name : f.family, n(f.clients), n(f.visits), n(f.units), n(f.revenue)] }; }) }] };
    var d = domModel('clientmix', 'Client Mix');
    return { name: 'client-mix', csv: 0, sheets: [fams].concat(d ? d.sheets : []) };
  };
  register('clientmix', '__cmExport', { csv: 'Families' });
  // Checked on the live site 18 Nov 2026: each of these draws real tables, so domModel returns them. (Wellness Voucher Performance is a page inside a frame: its own buttons only.)
  [['lostlists', 'Lost Client Blasts'], ['stripedeposits', 'Stripe vs Phorest'], ['depositcheck', 'Deposit Checking'], ['glowclub', 'Glow Club Performance'],
   ['dealsperf', 'Active Deals Performance'], ['pkkeratin', 'Keratin Packages Performance'], ['pkpamper', 'Pamper Packages Performance 2025'], ['pkads499', 'ADS 499 Packages Performance'], ['pkhaircolour', 'Hair Colour Packages Performance'], ['pkschool', 'Back to School Offer Performance'], ['discountsvouchers', 'Discounts and Vouchers'], ['products', 'Products'], ['attrition', 'Attrition'], ['one2ones', '1-to-1s and Goals']
  ].forEach(function (p) { registerDom(p[0], p[1]); });
})();
