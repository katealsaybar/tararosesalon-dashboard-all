// A table that behaves like Google Sheets, for any page (Kate, 18 Nov 2026: "madalas hindi nasusunod" on every heading menu).
// Built from the Service Rankings mockup (docs/mockups/service-rankings.html in the cowork repo) so the next page does not draw its own copy.
//
//   const T = TRSheet.table({ id, el, rows, cols, limit?, total?, after?, rowCls? })
//     id     unique name of the table on the page
//     el     CSS selector of the <table> element (its parent is the scroll box)
//     rows   () => the rows to show, before the heading filters
//     cols   [{ k, l, sub?, t: 'num' | 'txt', raw(r), disp(r), cell(r) => html, x?: 1 }]
//            raw   the value to sort and compare, disp the text the "Filter by values" list shows, cell the html drawn (a figure can be TRSD.num html)
//            x     tucked away until the "All columns" button is on; sub is a second line under the heading (a function is called on every draw)
//     limit  rows shown at first (T.shown), total(rowsAfterFilters) => { colKey: html } for the last row, after(T, rows, all) after each draw
//     root   a shadow root, when the table is drawn inside one (Service Calendar): the table is found there. Its heading buttons are heard at the document: composedPath() reaches into an open shadow root. The menu itself is drawn on the page,
//            under css/sheet-table.css, so a page in a shadow root adds that stylesheet to its root.
//     t: 'date' or 'time'  a column of ISO dates (2026-11-18) or 24 hour times (14:30) in raw(): the condition menu then says Is on, Is on or after, Is on or before, Is between.
//   T.draw()  T.rows()  T.active()  T.clear()  T.toggleMore()  T.f (filters)  T.sort  T.shown (rows on a page)  T.page (0 = first)  T.pages(n)  T.more
//   after() is where the page draws its pager: "1 to 10 of 27", the Rows choice, Previous, "Page 1 of 3", Next. A filter or a sort goes back to page 1.
//
// Every column has the same menu: Sort A to Z and Z to A (smallest and largest on numbers), Filter by condition (type, value, between),
// Filter by values (search, Select all, Clear, a tick list that shows only what the other columns leave, Reset, Cancel, OK), a green funnel on the heading
// when it is on, a sticky heading row and the first column frozen. On a phone the table is one labelled card per row and has no heading row,
// so TRSheet.colMenu(T, button) lists the columns and opens the same menu.
(function () {
  'use strict';
  if (window.TRSheet) return;
  const REG = {};
  let POP = null;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const $ = (s, r) => (r || document).querySelector(s);
  // The real target of an event, also when it came from inside a shadow root (the document only sees the host).
  const tg = e => (e.composedPath && e.composedPath()[0]) || e.target;
  const cl = (e, q) => { const t = tg(e); return t && t.closest ? t.closest(q) : null; };
  function closePop() { if (POP) { POP.remove(); POP = null; } }
  document.addEventListener('mousedown', e => { if (POP && !POP.contains(tg(e)) && !cl(e, '[data-sxf],[data-sxcm]')) closePop(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePop(); });

  function pass(c, r, f) {
    if (f.vals && !f.vals.has(String(c.disp(r)))) return false;
    if (f.op) {
      const v = c.raw(r);
      if (c.t === 'num') {
        const a = f.a, b = f.b;
        return f.op === 'eq' ? v === a : f.op === 'gt' ? v > a : f.op === 'ge' ? v >= a : f.op === 'lt' ? v < a : f.op === 'le' ? v <= a : f.op === 'bt' ? (v >= Math.min(a, b) && v <= Math.max(a, b)) : true;
      }
      if (c.t === 'date' || c.t === 'time') { const d = String(v || ''); return f.op === 'eq' ? d === f.a : f.op === 'af' ? d >= f.a : f.op === 'bf' ? d <= f.a : f.op === 'bt' ? (d >= f.a && d <= f.b) : true; }
      const t = String(v).toLowerCase(), q = String(f.a || '').toLowerCase();
      return f.op === 'ct' ? t.indexOf(q) >= 0 : f.op === 'nc' ? t.indexOf(q) < 0 : f.op === 'eq' ? t === q : f.op === 'sw' ? t.indexOf(q) === 0 : true;
    }
    return true;
  }

  function table(cfg) {
    const T = { cfg, id: cfg.id, f: {}, sort: null, shown: cfg.limit || 9999, page: 0, more: false };   // shown = rows on a page, page = which page (0 is the first)
    REG[cfg.id] = T;
    T.vis = () => cfg.cols.filter(c => (!c.x || T.more) && !(c.hide && c.hide()));
    T.rows = () => {
      const cols = cfg.cols;
      const rows = cfg.rows().filter(r => cols.every(c => !T.f[c.k] || pass(c, r, T.f[c.k])));
      if (T.sort) {
        const c = cols.find(x => x.k === T.sort.k);
        if (c) { const kx = c.sk || c.raw, num = c.t === 'num' || c.sk; rows.sort((a, b) => { const x = kx(a), y = kx(b); return (num ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * T.sort.dir; }); }
      }
      return rows;
    };
    T.active = () => !!T.sort || Object.keys(T.f).length > 0;
    T.clear = () => { T.f = {}; T.sort = null; T.page = 0; };
    T.pages = n => Math.max(1, Math.ceil(n / T.shown));
    T.toggleMore = () => {
      T.more = !T.more;
      if (!T.more) cfg.cols.forEach(c => { if (c.x) { delete T.f[c.k]; if (T.sort && T.sort.k === c.k) T.sort = null; } });
      T.draw();
    };
    T.draw = () => {
      const el = $(cfg.el, cfg.root); if (!el) return;
      const rows = T.rows(), all = cfg.rows(), cols = T.vis(), fi = cols.findIndex(c => !c.hd);   // a column with hd (its own heading, e.g. a select box) is never the frozen first column
      if (T.page > T.pages(rows.length) - 1) T.page = T.pages(rows.length) - 1;
      if (T.page < 0) T.page = 0;
      const shown = rows.slice(T.page * T.shown, (T.page + 1) * T.shown);
      const head = cols.map((c, i) => {
        const on = (T.sort && T.sort.k === c.k) || T.f[c.k];
        const sub = typeof c.sub === 'function' ? c.sub() : c.sub;
        const lab = typeof c.l === 'function' ? c.l() : c.l;
        if (c.hd) return `<th class="sx-hd">${c.hd()}</th>`;
        return `<th class="${c.t === 'num' ? 'r ' : ''}${i === fi ? 'fc' : ''}"><span class="sx-th"><span class="sx-tl">${esc(lab)}${T.sort && T.sort.k === c.k ? (T.sort.dir > 0 ? ' ↑' : ' ↓') : ''}${sub ? `<small>${esc(sub)}</small>` : ''}</span><button type="button" class="sx-fb${on ? ' on' : ''}" data-sxf="${c.k}" data-sxt="${cfg.id}" aria-label="Sort and filter ${esc(lab)}"><svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"><path d="M1 2h10L7 6.5V10L5 9V6.5z" fill="currentColor"/></svg></button></span></th>`;
      }).join('');
      const lab = c => esc(typeof c.l === 'function' ? c.l() : c.l);
      const body = shown.map(r => `<tr${cfg.rowCls ? ` class="${cfg.rowCls(r)}"` : ''}>${cols.map((c, i) => `<td data-l="${lab(c)}" class="${c.t === 'num' ? 'r ' : ''}${i === fi ? 'fc' : ''}">${c.cell(r)}</td>`).join('')}</tr>`).join('')
        || `<tr><td colspan="${cols.length}" class="sx-none">Nothing matches.</td></tr>`;
      let foot = '';
      if (cfg.total && rows.length) {
        const tt = cfg.total(rows);
        foot = `<tr class="tot">${cols.map((c, i) => `<td class="${c.t === 'num' ? 'r ' : ''}${i === fi ? 'fc' : ''}" data-l="${lab(c)}">${tt[c.k] == null ? '' : tt[c.k]}</td>`).join('')}</tr>`;
      }
      el.className = 'sx-t';
      el.innerHTML = `<thead><tr>${head}</tr></thead><tbody>${body}${foot}</tbody>`;
      const w = el.parentNode; w.classList.add('sx-wrap'); w.classList.remove('sc');
      if (el.scrollWidth > w.clientWidth + 1) w.classList.add('sc');
      if (cfg.after) cfg.after(T, rows, all);
    };
    return T;
  }

  function openPop(btn, T, key) {
    const was = POP && POP.dataset.k === key + T.id; closePop(); if (was) return;
    const c = T.cfg.cols.find(x => x.k === key); if (!c) return;
    const ord = c.t === 'date' || c.t === 'time';
    const cur0 = T.f[key] || {}, map = {}, order = [];
    // filters cascade: the values list shows only what the other columns' filters leave
    T.cfg.rows().filter(r => T.cfg.cols.every(o => o.k === key || !T.f[o.k] || pass(o, r, T.f[o.k]))).forEach(r => {
      const d = String(c.disp(r)); if (!map[d]) { map[d] = { d, n: 0, raw: c.sk ? c.sk(r) : c.raw(r) }; order.push(d); } map[d].n++;
    });
    const list = order.map(d => map[d]).sort((c.t === 'num' || c.sk) ? (a, b) => a.raw - b.raw : ord ? (a, b) => String(a.raw).localeCompare(String(b.raw)) : (a, b) => a.d.localeCompare(b.d, undefined, { numeric: true }));
    const sel = new Set(cur0.vals ? Array.from(cur0.vals) : list.map(x => x.d));
    const ops = c.t === 'num' ? [['', 'No condition'], ['eq', 'Is equal to'], ['gt', 'Greater than'], ['ge', 'Greater than or equal to'], ['lt', 'Less than'], ['le', 'Less than or equal to'], ['bt', 'Is between']]
      : c.t === 'date' ? [['', 'No condition'], ['eq', 'Is on'], ['af', 'Is on or after'], ['bf', 'Is on or before'], ['bt', 'Is between']]
      : c.t === 'time' ? [['', 'No condition'], ['eq', 'Is at'], ['af', 'Is at or after'], ['bf', 'Is at or before'], ['bt', 'Is between']]
      : [['', 'No condition'], ['ct', 'Contains'], ['nc', 'Does not contain'], ['eq', 'Is exactly'], ['sw', 'Starts with']];
    const it = c.t === 'date' ? 'date' : c.t === 'time' ? 'time' : 'text';
    const up = c.t === 'num' ? 'smallest to largest' : c.t === 'date' ? 'oldest to newest' : c.t === 'time' ? 'earliest to latest' : 'A to Z', dn = c.t === 'num' ? 'largest to smallest' : c.t === 'date' ? 'newest to oldest' : c.t === 'time' ? 'latest to earliest' : 'Z to A';
    const pop = document.createElement('div'); pop.className = 'sx-pop'; pop.dataset.k = key + T.id;
    pop.innerHTML = `<div class="sx-sort"><button type="button" data-ps="1">Sort ${up}</button><button type="button" data-ps="-1">Sort ${dn}</button></div><div class="sx-l">Filter by condition</div>`
      + `<select class="op">${ops.map(o => `<option value="${o[0]}"${(cur0.op || '') === o[0] ? ' selected' : ''}>${o[1]}</option>`).join('')}</select>`
      + `<input class="a" type="${it}" value="${esc(cur0.a == null ? '' : cur0.a)}"><input class="b" type="${it}" value="${esc(cur0.b == null ? '' : cur0.b)}">`
      + `<div class="sx-l">Filter by values</div><input class="q" type="search" placeholder="Search"><div class="sx-sel"><button type="button" data-pa="1">Select all</button><span>·</span><button type="button" data-pa="0">Clear</button></div><div class="sx-list"></div>`
      + `<div class="sx-act"><button type="button" data-pr>Reset</button><span></span><button type="button" data-pc>Cancel</button><button type="button" class="ok" data-pk>OK</button></div>`;
    document.body.appendChild(pop); POP = pop;
    const opE = $('.op', pop), aE = $('.a', pop), bE = $('.b', pop), qE = $('.q', pop), lE = $('.sx-list', pop);
    const showIn = () => { aE.hidden = !opE.value; bE.hidden = opE.value !== 'bt'; };
    const drawList = () => {
      const q = qE.value.trim().toLowerCase(), sh = list.filter(x => !q || x.d.toLowerCase().indexOf(q) >= 0);
      lE.innerHTML = sh.slice(0, 300).map(x => `<label class="sx-v"><input type="checkbox" data-v="${esc(x.d)}"${sel.has(x.d) ? ' checked' : ''}><span>${esc(x.d || '(blank)')}</span><em>${x.n}</em></label>`).join('') || '<p class="sx-none">Nothing matches.</p>';
    };
    showIn(); drawList();
    const rc = btn.getBoundingClientRect(), W = Math.min(300, innerWidth - 16), mh = Math.min(460, innerHeight - 16), tp = Math.max(8, Math.min(rc.bottom + 4, innerHeight - mh - 8));
    pop.style.width = W + 'px'; pop.style.left = (innerWidth <= 760 ? 8 : Math.max(8, Math.min(rc.right - W, innerWidth - W - 8))) + 'px'; pop.style.top = tp + 'px'; pop.style.maxHeight = Math.min(mh, innerHeight - tp - 8) + 'px';
    opE.addEventListener('change', showIn); qE.addEventListener('input', drawList);
    pop.addEventListener('change', e => { const cb = e.target.closest('input[data-v]'); if (cb) { cb.checked ? sel.add(cb.dataset.v) : sel.delete(cb.dataset.v); } });
    pop.addEventListener('click', e => {
      const t = e.target, ps = t.closest('[data-ps]'), pa = t.closest('[data-pa]');
      if (ps) { T.sort = { k: key, dir: +ps.dataset.ps }; T.page = 0; closePop(); T.draw(); return; }
      if (pa) { const q = qE.value.trim().toLowerCase(); list.forEach(x => { if (!q || x.d.toLowerCase().indexOf(q) >= 0) { pa.dataset.pa === '1' ? sel.add(x.d) : sel.delete(x.d); } }); drawList(); return; }
      if (t.closest('[data-pr]')) { delete T.f[key]; if (T.sort && T.sort.k === key) T.sort = null; T.page = 0; closePop(); T.draw(); return; }
      if (t.closest('[data-pc]')) { closePop(); return; }
      if (t.closest('[data-pk]')) {
        const op = opE.value, a = aE.value.trim(), b = bE.value.trim(); let cond = null;
        if (op) { if (c.t === 'num') { const na = parseFloat(a), nb = parseFloat(b); if (isFinite(na) && (op !== 'bt' || isFinite(nb))) cond = { op, a: na, b: nb }; } else if (ord) { if (a && (op !== 'bt' || b)) cond = { op, a, b }; } else if (a) cond = { op, a }; }
        const vals = sel.size === list.length ? null : new Set(sel);
        if (!cond && !vals) delete T.f[key]; else T.f[key] = Object.assign({}, cond || {}, { vals });
        T.page = 0; closePop(); T.draw();
      }
    });
    qE.focus();
  }
  function onTableClick(e) { const b = cl(e, '[data-sxf]'); if (!b) return; const T = REG[b.dataset.sxt]; if (T) openPop(b, T, b.dataset.sxf); }
  document.addEventListener('click', onTableClick);

  // On a phone the table is cards with no heading row: this lists the columns and opens the same menu.
  function colMenu(T, b) {
    const was = POP && POP.dataset.k === 'cm' + T.id; closePop(); if (was) return;
    const pop = document.createElement('div'); pop.className = 'sx-pop'; pop.dataset.k = 'cm' + T.id;
    const lab = c => esc(typeof c.l === 'function' ? c.l() : c.l);
    pop.innerHTML = '<div class="sx-l">Sort or filter by</div>' + T.vis().filter(c => !c.hd).map(c => `<div class="sx-sort"><button type="button" data-cm="${c.k}">${lab(c)}${T.f[c.k] ? ' (filter on)' : ''}</button></div>`).join('');
    document.body.appendChild(pop); POP = pop;
    const rc = b.getBoundingClientRect(), W = Math.min(300, innerWidth - 16);
    pop.style.width = W + 'px'; pop.style.left = '8px'; const tp = Math.max(8, Math.min(rc.bottom + 4, innerHeight - 340)); pop.style.top = tp + 'px'; pop.style.maxHeight = Math.min(420, innerHeight - tp - 8) + 'px';   // always fully on screen
    pop.addEventListener('click', ev => { const c = ev.target.closest('[data-cm]'); if (!c) return; closePop(); openPop(b, T, c.dataset.cm); });
  }
  function onColMenuClick(e) { const b = cl(e, '[data-sxcm]'); if (!b) return; const T = REG[b.dataset.sxcm]; if (T) colMenu(T, b); }
  document.addEventListener('click', onColMenuClick);

  window.TRSheet = { table, closePop, get: id => REG[id] };
})();
