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

  function register(view, fn, o) { if (view && fn) REG[view] = { fn: fn, csv: (o && o.csv) || '', lazy: (o && o.lazy) || '' }; }
  function has(view) { return !!REG[view]; }
  function $(id) { return document.getElementById(id); }

  function titles(r) {
    var x = 'Download every table on this page as one Excel file, one tab per table';
    var c = r && r.csv ? 'Download the “' + r.csv + '” table as a CSV file (a CSV holds one table, so use XLSX for all of them)' : 'Download this page as a CSV file';
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
    var go = function () { return rexRun(r.fn, kind, btn); };
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

  window.TRSExport = { register: register, has: has, sync: sync, run: run, pop: openPop };

  // Pages that have a page-level export. Kate, 18 Nov 2026: Service Rankings first; other reports join only when she asks (each one needs its page-level fn to cover every table on it).
  // A new page: add its line here, or call TRSExport.register from its own file. [view id, global fn, name of the tab the CSV holds, script group to load first]
  [['services', 'srExportPage', 'Top services']
  ].forEach(function (p) { register(p[0], p[1], { csv: p[2] || '', lazy: p[3] || '' }); });
})();
