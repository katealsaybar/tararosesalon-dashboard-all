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
  // Same band as mobile.css: portrait phones by width, landscape ones by height.
  const PHONE = matchMedia('(max-width:760px),(hover:none) and (max-height:480px)');
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
    // The wordmark's tap area becomes the whole 44px row it sits in.
    const logo = document.querySelector('.mast-logo'), hitBox = labelHome;
    if (logo && hitBox) {
      if (on) { hitBox._logoClick = logo.getAttribute('onclick'); logo.removeAttribute('onclick');
                hitBox.classList.add('m-logo-hit'); hitBox.onclick = () => backToTop(); }
      else if (hitBox._logoClick) { logo.setAttribute('onclick', hitBox._logoClick);
                hitBox.classList.remove('m-logo-hit'); hitBox.onclick = null; }
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
  // ── 6. TOP: shown two screens down, and not while the page is moving ──
  let still = null;
  addEventListener('scroll', () => {
    if (!PHONE.matches) return;
    document.body.classList.toggle('m-deep', scrollY > innerHeight * 2);
    document.body.classList.add('m-scrolling');
    clearTimeout(still);
    still = setTimeout(() => document.body.classList.remove('m-scrolling'), 450);
  }, {passive: true});
  // The Team tray is fixed at the foot; while it is up the page reserves its height.
  function trayRoom() {
    const tray = document.querySelector('#view-team .tp-tray');
    const h = tray && tray.classList.contains('up') && PHONE.matches ? tray.offsetHeight : 0;
    document.documentElement.style.setProperty('--tray-h', h + 'px');
  }
  const team = $('view-team');
  if (team) new MutationObserver(trayRoom).observe(team, {subtree: true, attributes: true, attributeFilter: ['class'], childList: true});

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
    trayRoom();
    schedule();
  }

  // ── 10. THE DRAWER ──
  // Its items are <div onclick>: make each one a keyboard button at every width
  // (focusable, Enter and Space), without changing how any of them looks.
  document.querySelectorAll('aside.sidebar .nav-sub[onclick]').forEach(d => {
    if (!d.hasAttribute('role')) d.setAttribute('role', 'button');
    if (!d.hasAttribute('tabindex')) d.tabIndex = 0;
    d.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); d.click(); }
    });
  });
  // Swipe it closed on a phone: a mostly-sideways drag to the left of 60px or more.
  const side = document.querySelector('aside.sidebar');
  if (side) {
    let x0 = null, y0 = 0;
    side.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, {passive: true});
    side.addEventListener('touchend', e => {
      if (x0 === null || !PHONE.matches) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if (dx < -60 && Math.abs(dx) > Math.abs(dy) * 1.5 && typeof toggleNav === 'function') toggleNav(false);
    }, {passive: true});
  }

  // ── 3. TABLES: swipe hint, and cards for the widest ones ──
  let seen = new WeakSet();
  function tables() {
    if (!PHONE.matches) return;
    const v = typeof CURRENT_VIEW !== 'undefined' ? $('view-' + CURRENT_VIEW) : null;
    if (!v) return;
    v.querySelectorAll('.lg-wrap > table.lg').forEach(tbl => {
      if (seen.has(tbl)) return;
      const wrap = tbl.parentElement;
      if (!wrap.clientWidth) return;           // not laid out yet; next pass
      seen.add(tbl);
      const frame = wrap.parentElement.classList.contains('lg-sx') ? wrap.parentElement : wrap;
      // Cards only where the table cannot work on a phone at all: Daily Stylist
      // Target (31 days across) and Branch Performance's compact ledgers. The rest
      // stay tables, with the label column capped so the figures show.
      const wide = CURRENT_VIEW === 'ledgerStylist'
        || (CURRENT_VIEW === 'branchperf' && tbl.classList.contains('lg-compact'));
      if (wide && tbl.scrollWidth > wrap.clientWidth + 4 && tbl.tBodies[0] && tbl.tBodies[0].rows.length) {
        cards(tbl, frame);
      } else if (tbl.scrollWidth > wrap.clientWidth + 4 && frame !== wrap) {
        const hint = document.createElement('span');
        hint.className = 'm-swipe';
        hint.textContent = 'Swipe for more →';
        frame.appendChild(hint);
        wrap.addEventListener('scroll', () => hint.classList.add('gone'), {once: true, passive: true});
      }
    });
  }

  // One label per column, read off the header rows with their spans resolved.
  function headGrid(tbl) {
    const rows = tbl.tHead ? [...tbl.tHead.rows] : [];
    const grid = rows.map(() => []);
    rows.forEach((tr, ri) => {
      let c = 0;
      [...tr.cells].forEach(cell => {
        while (grid[ri][c] !== undefined) c++;
        const cs = cell.colSpan || 1, rs = cell.rowSpan || 1;
        for (let r = 0; r < rs; r++) for (let k = 0; k < cs; k++) {
          if (grid[ri + r]) grid[ri + r][c + k] = {text: cell.textContent.trim(), wide: cs > 1};
        }
        c += cs;
      });
    });
    const n = Math.max(0, ...grid.map(r => r.length));
    const cols = [];
    for (let c = 0; c < n; c++) {
      const band = grid.slice(0, -1).map(r => r[c]).filter(x => x && x.wide).map(x => x.text).join(' · ');
      const leaf = grid.length ? (grid[grid.length - 1][c] || {}).text || '' : '';
      cols.push({band, leaf});
    }
    return cols;
  }

  function cards(tbl, frame) {
    const cols = headGrid(tbl);
    const box = document.createElement('div');
    box.className = 'm-cards';
    let html = '';
    // Rows the page's "On this page" rail points at, by id (Daily Stylist Target's
    // branch rows). Hidden, they measure zero: the rail lit its last entry and a
    // jump went nowhere. The card built for the row holds the id while Cards is on.
    const anchored = [];
    const mid = tr => tr.id ? (anchored.push(tr), ` data-mid="${esc(tr.id)}"`) : '';
    [...tbl.tBodies].forEach(tb => [...tb.rows].forEach(tr => {
      const cells = [...tr.cells];
      if (!cells.length) return;
      if (tr.classList.contains('lg-grp') || (cells.length === 1 && cells[0].colSpan > 1)) {
        html += `<div class="m-grp"${mid(tr)}>${esc(tr.textContent.trim())}</div>`;
        return;
      }
      let c = 0, band = null, dl = '';
      cells.forEach((cell, i) => {
        const col = cols[c] || {band: '', leaf: ''};
        c += cell.colSpan || 1;
        if (i === 0) return;
        const val = cell.textContent.trim();
        if (col.band && col.band !== band) { dl += `<dt class="band">${esc(col.band)}</dt>`; band = col.band; }
        dl += `<dt>${esc(col.leaf || '—')}</dt><dd>${esc(val || '—')}</dd>`;
      });
      const tot = tr.classList.contains('lg-tot') ? ' tot' : '';
      html += `<details class="m-card${tot}"${mid(tr)}><summary>${esc(cells[0].textContent.trim())}</summary><dl>${dl}</dl></details>`;
    }));
    box.innerHTML = html;
    const pairs = anchored.map(tr => [tr, box.querySelector(`[data-mid="${CSS.escape(tr.id)}"]`), tr.id]);
    const holdIds = cardsOn => pairs.forEach(([tr, card, id]) => {
      if (!card) return;
      if (cardsOn) { tr.removeAttribute('id'); card.id = id; }
      else { card.removeAttribute('id'); tr.id = id; }
    });
    box._holdIds = holdIds;
    const tv = document.createElement('div');
    tv.className = 'm-tv';
    tv.setAttribute('role', 'group');
    tv.setAttribute('aria-label', 'Show as');
    tv.innerHTML = '<button type="button" aria-pressed="true" data-m="cards">Cards</button>'
                 + '<button type="button" aria-pressed="false" data-m="table">Table</button>';
    tv.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      const on = b.dataset.m === 'cards';
      tv.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      box.hidden = !on;
      frame.style.display = on ? 'none' : '';
      holdIds(on);
      if (typeof spy === 'function') spy();
    });
    frame.before(tv, box);
    frame.style.display = 'none';
    frame.dataset.mCards = '1';
    holdIds(true);
    if (typeof spy === 'function') spy();
  }

  function undoTables() {
    document.querySelectorAll('.m-cards').forEach(n => n._holdIds && n._holdIds(false));
    document.querySelectorAll('.m-tv,.m-cards,.m-swipe').forEach(n => n.remove());
    document.querySelectorAll('[data-m-cards]').forEach(n => { n.style.display = ''; delete n.dataset.mCards; });
    seen = new WeakSet();
  }

  // ── 4. ORG CHART: tap a card with a team under it to fold the team ──
  function orgChart() {
    if (!PHONE.matches) return;
    document.querySelectorAll('#view-orgchart .oc-tree li').forEach(li => {
      li.classList.toggle('m-kids', !!li.querySelector(':scope > ul > li'));
    });
  }
  document.addEventListener('click', e => {
    if (!PHONE.matches || document.body.classList.contains('orgchart-pop')) return;
    const node = e.target.closest('#view-orgchart .oc-tree li.m-kids > .oc-node');
    if (node) node.parentElement.classList.toggle('m-fold');
  });

  // ── 8. CHARTS ──
  // The Group avg label, above the columns. Rebuilt from the line's own text on
  // every render, so it can never say a different figure from the dashed line.
  function charts() {
    if (!PHONE.matches) return;
    document.querySelectorAll('.cols-plot').forEach(plot => {
      const lbl = plot.querySelector('.avgline b');
      let cap = plot.previousElementSibling;
      if (!cap || !cap.classList.contains('m-avg')) {
        if (!lbl) return;
        cap = document.createElement('div');
        cap.className = 'm-avg';
        plot.before(cap);
      }
      const txt = lbl ? lbl.textContent : '';
      // Only on a change: this runs from the page's MutationObserver, and an
      // identical write is still a mutation, which would loop.
      if (cap.textContent !== txt) cap.textContent = txt;
    });
  }
  // Canvas charts (Chart.js) draw their own text: 12px floor on a phone.
  function chartFont() {
    if (typeof Chart === 'undefined' || !Chart.defaults || !Chart.defaults.font) return;
    if (chartFont.base === undefined) chartFont.base = Chart.defaults.font.size;
    Chart.defaults.font.size = PHONE.matches ? Math.max(12, chartFont.base || 12) : chartFont.base;
  }

  // Renderers write their views after a fetch, so watch for them rather than guess.
  let t = null;
  function schedule() { clearTimeout(t); t = setTimeout(() => { tables(); orgChart(); charts(); }, 250); }
  const main = $('mainScrollArea');
  if (main) new MutationObserver(schedule).observe(main, {childList: true, subtree: true});

  function apply() {
    place(PHONE.matches);
    chartFont();
    if (!PHONE.matches) undoTables();
    afterView();
  }
  PHONE.addEventListener('change', apply);
  apply();

  function esc(s) {
    return String(s).replace(/[&<>"]/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[ch]));
  }
})();
