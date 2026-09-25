/* ══════════════════════════════════════════════════════════════
   PHONE LAYER (Kate, 25 Sep 2026) — the behaviour half of mobile.css.
   Loaded after the page's own script, so showView, sizeTopbar, spy, sel,
   dateFrom/dateTo, FILTERED_VIEWS and LEDGER_VIEWS all exist.

   Nothing here runs above 760px except the undo: every node it moves goes back
   to exactly where it came from, so the desktop page is the page it always was.
   It moves nodes rather than copying them, so every id, listener and renderer
   that writes into them keeps working unchanged.
   ══════════════════════════════════════════════════════════════ */
(function () {
  const PHONE = matchMedia('(max-width:760px)');
  const $ = id => document.getElementById(id);
  const topbar = $('topbar');
  const labelRow = $('headerSectionLabel') && $('headerSectionLabel').parentElement;
  const labelHome = labelRow && labelRow.parentElement;
  const mast = document.querySelector('.mast');
  const rule = document.querySelector('.mast-rule');
  const tbIn = document.querySelector('.topbar-in');
  const fw = $('filtersWrap');
  const mastBody = $('mastBody'), sheetBody = $('fSheetBody');
  const sheetBtn = $('fSheetBtn');
  if (!topbar || !labelRow || !mast || !rule || !tbIn || !fw || !mastBody || !sheetBody) return;

  // ── 1. THE HEADER: what leaves it on a phone, and comes back above 760 ──
  let wasClosed = false, placed = false;
  function place(on) {
    if (on === placed) return;
    placed = on;
    if (on) {
      mastBody.append(labelRow, rule);
      wasClosed = fw.classList.contains('closed');
      fw.classList.remove('closed');          // the sheet is the open/close now
      sheetBody.append(fw);
    } else {
      closeSheet();
      labelHome.append(labelRow);             // after the wordmark, as it was
      mast.append(rule);                      // after .mast-top
      tbIn.append(fw);                        // after .mast
      fw.classList.toggle('closed', wasClosed);
      topbar.classList.remove('tb-hide');
    }
    document.body.classList.toggle('phone-chrome', on);
    if (typeof sizeTopbar === 'function') sizeTopbar();
  }

  // ── The filters sheet ──
  function openSheet() {
    document.body.classList.add('fsheet-open');
    if (sheetBtn) sheetBtn.setAttribute('aria-expanded', 'true');
    topbar.classList.remove('tb-hide');
  }
  function closeSheet() {
    if (!document.body.classList.contains('fsheet-open')) return;
    document.body.classList.remove('fsheet-open');
    if (sheetBtn) { sheetBtn.setAttribute('aria-expanded', 'false'); }
  }
  window.openFilterSheet = openSheet;
  window.closeFilterSheet = closeSheet;
  addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

  // "All · Aug–Sep": what the page is reading, on the button that changes it.
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function rangeShort(a, b) {
    if (!a || !b) return '';
    const sameY = a.getFullYear() === b.getFullYear();
    const yy = d => "'" + String(d.getFullYear()).slice(2);
    if (sameY && a.getMonth() === b.getMonth()) {
      const last = new Date(b.getFullYear(), b.getMonth() + 1, 0).getDate();
      return (a.getDate() === 1 && (b.getDate() === last || b >= new Date(new Date().toDateString())))
        ? MON[a.getMonth()] : `${a.getDate()}–${b.getDate()} ${MON[b.getMonth()]}`;
    }
    return sameY ? `${MON[a.getMonth()]}–${MON[b.getMonth()]}`
                 : `${MON[a.getMonth()]} ${yy(a)}–${MON[b.getMonth()]} ${yy(b)}`;
  }
  function paintSum() {
    const out = $('fSheetSum');
    if (!out || typeof sel === 'undefined') return;
    const all = sel.branch.includes('all');
    const info = typeof BRANCH_INFO !== 'undefined' ? BRANCH_INFO : {};
    const br = all ? 'All' : sel.branch.length === 1
      ? ((info[sel.branch[0]] && info[sel.branch[0]].name) || sel.branch[0])
      : `${sel.branch.length} branches`;
    const f = typeof dateFrom !== 'undefined' ? dateFrom : null;
    const t = typeof dateTo !== 'undefined' ? dateTo : null;
    const rg = rangeShort(f, t);
    out.textContent = rg ? `${br} · ${rg}` : br;
  }
  ['branchChips', 'periodChips', 'mastRange'].forEach(id => {
    const el = $(id);
    if (el) new MutationObserver(paintSum).observe(el, {childList: true, subtree: true, characterData: true, attributes: true});
  });

  // ── Hide on the way down, back on the way up ──
  let lastY = scrollY;
  addEventListener('scroll', () => {
    const y = scrollY, dy = y - lastY;
    if (!PHONE.matches) { lastY = y; return; }
    if (Math.abs(dy) < 6) return;
    const held = document.body.classList.contains('nav-open') || document.body.classList.contains('fsheet-open');
    const hide = !held && dy > 0 && y > topbar.offsetHeight + 40;
    if (hide !== topbar.classList.contains('tb-hide')) {
      topbar.classList.toggle('tb-hide', hide);
      // The floated ledger headers read the bar's bottom edge: re-read it once
      // the bar has finished moving (and at once, for reduced motion).
      requestAnimationFrame(() => typeof spy === 'function' && spy());
    }
    lastY = y;
  }, {passive: true});
  topbar.addEventListener('transitionend', e => {
    if (e.propertyName === 'transform' && typeof spy === 'function') spy();
  });

  // ── Every view switch ──
  const baseShowView = window.showView;
  window.showView = function () {
    const r = baseShowView.apply(this, arguments);
    afterView();
    return r;
  };
  function afterView() {
    const v = typeof CURRENT_VIEW !== 'undefined' ? CURRENT_VIEW : '';
    const filtered = typeof FILTERED_VIEWS !== 'undefined' && FILTERED_VIEWS.has(v)
      && !(typeof LEDGER_VIEWS !== 'undefined' && LEDGER_VIEWS.has(v));
    if (sheetBtn) sheetBtn.classList.toggle('off', !filtered);
    closeSheet();
    topbar.classList.remove('tb-hide');
    paintSum();
  }

  function apply() {
    place(PHONE.matches);
    afterView();
  }
  PHONE.addEventListener('change', apply);
  apply();

  function esc(s) {
    return String(s).replace(/[&<>"]/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[ch]));
  }
})();
