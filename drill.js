// A figure that opens the list behind it (Kate, 27 Oct 2026: "every line that has figures should be clickable, same thing sa Lost Client Blasts").
// Same behaviour as the Lost Client Blasts report (lost-report.js lrNum / lrDrillOpen): a figure with a dotted underline and the title "See who", a
// window over the page with the list, Esc or the Close button to leave, focus back on the figure. Lost Client Blasts keeps its own copy; this one is for
// every other page, so the page only says WHAT a figure is and the list is built here.
//
//   TRSD.num(html, spec)   the figure as clickable HTML (or the plain html when spec is null: a figure with nothing behind it stays plain)
//   TRSD.open(spec)        opens the window straight away
//
// spec = { title, sub?, cur?, views: [{ id, label, load: async () => result }] }
//   result = { cols: [{ k, l, t }], rows: [{ ...cells, _cls? }], foot?: { ...cells }, sub?, note? }
//   col type t: 'text' (default), 'num', 'aed' (spec.cur prefix), 'date' (ISO to 17 Oct 2026), 'pct', 'html' (already safe html)
// Every window has Save as xlsx and Save as csv (Kate, 27 Oct 2026: "sa lahat"): the view on screen, its total row last, built with the same spreadsheet writer as the Lost
// Client Blasts log (ledger-export.js, loaded the first time a button is pressed).
// The window shows one view at a time (tabs when there are two or more), loads it when first picked and keeps it.
(function () {
  'use strict';
  if (window.TRSD) return;
  const REG = new Map();
  let seq = 0, box = null, from = null, spec = null, cache = null, cur = 0;
  // Each open list has its own address (Kate, 27 Oct 2026: "specific url slug per reports"): ?r=clients-by-staff, or a list opened from inside another one,
  // ?r=net-take.clients-handled-april-miraflor. Back goes up one list and then closes; a link or a reload reopens it once the page has drawn its figures.
  let chain = [], pushed = 0, origin = null, ignorePop = 0;   // ignorePop: the one popstate our own Close causes, which must not close whatever opens next
  const rUrl = list => { const u = new URL(location.href); if (list && list.length) u.searchParams.set('r', list.map(x => slug(x.title)).join('.')); else u.searchParams.delete('r'); return u.pathname + u.search + u.hash; };

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${+m[3]} ${MON[+m[2] - 1]} ${m[1]}` : esc(iso); };
  const n0 = v => Math.round(+v || 0).toLocaleString('en-GB');
  const FMT = {
    num: v => v == null || v === '' ? '' : (Math.round(+v * 100) / 100).toLocaleString('en-GB'),
    aed: (v, c) => v == null || v === '' ? '' : (c || 'AED') + ' ' + n0(v),
    date: v => { const f = day(v), m = /^(\d+ \w+) \d{4}$/.exec(f); return m ? `<span class="dt-l">${f}</span><span class="dt-s">${m[1]}</span>` : f; },   // the year is left off on a phone, where the window says it
    pct: v => v == null || v === '' || !isFinite(v) ? '–' : (Math.round(+v * 10) / 10) + '%',
  };
  function cell(col, row, foot) {
    const v = row[col.k];
    if (col.t === 'html') return v == null ? '' : v;
    const f = FMT[col.t];
    const txt = f ? f(v, spec && spec.cur) : esc(v);
    // A row can make one of its figures clickable too: row._dn = { column key: the spec it opens } (the Clients count on a staff row).
    return (row._dn && row._dn[col.k] && v != null && v !== '') ? num(txt, row._dn[col.k]) : txt;
  }

  // The figure. Zero and empty stay plain, as on Lost Client Blasts.
  function num(html, sp) {
    if (!sp) return html;
    const id = 'd' + (++seq);
    if (REG.size > 8000) REG.clear();
    REG.set(id, sp);
    return `<span class="dn" role="button" tabindex="0" data-dn="${id}" title="See who">${html}</span>`;
  }

  // For an element that is not a span (an SVG square): just the id, to put on it as data-dn with class dn-cell.
  function reg(sp) { const id = 'd' + (++seq); if (REG.size > 8000) REG.clear(); REG.set(id, sp); return id; }

  function hide() {
    if (box) box.remove();
    box = null; spec = null; cache = null;
    document.body.classList.remove('dr-open');
  }
  function close() {
    const n = pushed, f = origin || from;
    hide(); chain = []; pushed = 0; origin = null; from = null;
    if (f && document.contains(f)) f.focus();
    try {
      if (n > 0) { const tok = ignorePop = Date.now(); history.go(-n); setTimeout(() => { if (ignorePop === tok) ignorePop = 0; }, 800); }   // back to the address the page had before the list opened
      else if (new URL(location.href).searchParams.has('r')) history.replaceState(history.state, '', rUrl([]));
    } catch (e) {}
  }

  function paint(res, view) {
    const sub = box.querySelector('.dr-sub'), body = box.querySelector('.dr-body');
    box.querySelectorAll('[data-ds]').forEach(b => { b.disabled = !(res.rows && res.rows.length); });
    note('');
    sub.innerHTML = res.sub != null ? res.sub : (spec.sub || '');
    if (!res.rows || !res.rows.length) { body.innerHTML = `<p class="dr-empty">${esc(res.empty || 'Nothing to show.')}</p>${res.note ? `<p class="dr-note">${res.note}</p>` : ''}`; return; }
    drawTable(res);
  }

  // ── Filtering and sorting on every column, the way Google Sheets does it (Kate, 27 Oct 2026: "apply google sheets filtering logic for every pop up's header,
  // headers should be sticky"). Each header has a filter button: sort, filter by condition (contains, greater than, between, a date range) and filter by values
  // (a checklist with search). The state is kept per view; the figures, the saved file and the total row follow what is on screen.
  let fst = [], pop = null;
  const NUMT = c => c.t === 'num' || c.t === 'aed' || c.t === 'pct';
  const rawOf = (c, r) => { const v = r[c.k]; if (c.t === 'html') return plain(v); if (NUMT(c)) return v === '' || v == null || !isFinite(v) ? null : +v; if (c.t === 'date') return v || ''; return v == null ? '' : String(v); };
  const dispOf = (c, r) => { const v = r[c.k]; if (c.t === 'html') return plain(v); const f = FMT[c.t]; return f ? plain(f(v, spec && spec.cur)) : (v == null ? '' : plain(v)); };
  const isMuted = r => String(r._cls || '').indexOf('dr-muted') >= 0;
  function passes(c, r, f) {
    if (!f) return true;
    if (f.vals && !f.vals.has(dispOf(c, r))) return false;
    if (f.op) {
      const v = rawOf(c, r);
      if (NUMT(c)) {
        if (v == null) return false;
        const a = f.a, b = f.b;
        return f.op === 'eq' ? v === a : f.op === 'gt' ? v > a : f.op === 'ge' ? v >= a : f.op === 'lt' ? v < a : f.op === 'le' ? v <= a : f.op === 'bt' ? (v >= Math.min(a, b) && v <= Math.max(a, b)) : true;
      }
      if (c.t === 'date') { const d = String(v || '').slice(0, 10); return f.op === 'eq' ? d === f.a : f.op === 'af' ? d >= f.a : f.op === 'bf' ? d <= f.a : f.op === 'bt' ? (d >= f.a && d <= f.b) : true; }
      const t = String(v).toLowerCase(), q = String(f.a || '').toLowerCase();
      return f.op === 'ct' ? t.indexOf(q) >= 0 : f.op === 'nc' ? t.indexOf(q) < 0 : f.op === 'eq' ? t === q : f.op === 'sw' ? t.indexOf(q) === 0 : true;
    }
    return true;
  }
  function cmpBy(c, a, b) {
    const x = rawOf(c, a), y = rawOf(c, b);
    if (NUMT(c)) return (x == null ? -Infinity : x) - (y == null ? -Infinity : y) || 0;
    return String(x).localeCompare(String(y), undefined, { numeric: true });
  }
  // The rows, total row and counts for what is on screen.
  function viewOf(res) {
    const st = fst[cur] || {}, f = st.f || {}, filtered = Object.keys(f).length > 0;
    let rows = filtered ? res.rows.filter(r => res.cols.every(c => passes(c, r, f[c.k]))) : res.rows.slice();
    if (st.sort) {
      const c = res.cols.find(x => x.k === st.sort.k);
      if (c) { const keep = rows.filter(r => !isMuted(r)), tail = rows.filter(isMuted); keep.sort((a, b) => cmpBy(c, a, b) * st.sort.dir); rows = keep.concat(tail); }   // the grey "not matched" lines stay last
    }
    let foot = res.foot;
    if (filtered && res.foot) {
      foot = {};
      res.cols.forEach(c => { foot[c.k] = (NUMT(c) && !/avg|average|rate|%|per |requested/i.test(c.l)) ? rows.reduce((a, r) => a + (+r[c.k] || 0), 0) : ''; });
      const fc = res.cols.find(c => !NUMT(c) && c.t !== 'date') || res.cols[0];
      foot[fc.k] = 'Filtered: ' + rows.length.toLocaleString('en-GB') + ' of ' + res.rows.length.toLocaleString('en-GB') + ' rows';
    }
    return { rows, foot, filtered, active: filtered || !!st.sort, total: res.rows.length };
  }
  function drawTable(res) {
    const body = box.querySelector('.dr-body'), st = fst[cur] || (fst[cur] = { f: {}, sort: null }), cols = res.cols, vw = viewOf(res);
    const top = body.scrollTop, left = body.scrollLeft;
    const cls = c => NUMT(c) ? 'r' : c.t === 'date' ? 'nw' : '';
    const head = cols.map(c => {
      const sorted = st.sort && st.sort.k === c.k, on = sorted || !!st.f[c.k];
      return `<th class="${cls(c)}"><span class="dr-th"><span class="dr-tl">${esc(c.l)}${sorted ? (st.sort.dir > 0 ? ' ↑' : ' ↓') : ''}</span><button type="button" class="dr-fb${on ? ' on' : ''}" data-fc="${esc(c.k)}" aria-label="Filter ${esc(c.l)}" aria-haspopup="true"><svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"><path d="M1 2h10L7 6.5V10L5 9V6.5z" fill="currentColor"/></svg></button></span></th>`;
    }).join('');
    const line = (r, tag) => `<tr class="${r._cls || ''}">${cols.map(c => `<${tag} class="${cls(c)}">${cell(c, r)}</${tag}>`).join('')}</tr>`;
    const rowsHtml = vw.rows.length ? vw.rows.map(r => line(r, 'td')).join('') : `<tr><td colspan="${cols.length}" class="dr-empty">No rows match these filters.</td></tr>`;
    body.innerHTML = `<div class="dr-scroll"><table class="dr-tbl"><thead><tr>${head}</tr></thead><tbody>${rowsHtml}</tbody>${vw.foot ? `<tfoot>${line(vw.foot, 'td')}</tfoot>` : ''}</table></div>${res.note ? `<p class="dr-note">${res.note}</p>` : ''}`;
    body.scrollTop = top; body.scrollLeft = left;
    const fb = box.querySelector('.dr-fbar');
    if (fb) { fb.hidden = !vw.active; fb.querySelector('.dr-fcount').textContent = vw.filtered ? 'Showing ' + vw.rows.length.toLocaleString('en-GB') + ' of ' + vw.total.toLocaleString('en-GB') + ' rows' : 'Sorted'; }
  }
  function closePop() { if (pop) { pop.remove(); pop = null; } }
  function openPop(btn, key) {
    const was = pop && pop.dataset.k === key; closePop(); if (was) return;
    const res = cache && cache[cur], c = res && res.cols.find(x => x.k === key); if (!c) return;
    const st = fst[cur] || (fst[cur] = { f: {}, sort: null }), cur0 = st.f[key] || {};
    const map = new Map();
    res.rows.forEach(r => { const d = dispOf(c, r), x = map.get(d) || { d, n: 0, raw: rawOf(c, r) }; x.n++; map.set(d, x); });
    const list = [...map.values()].sort(NUMT(c) ? (a, b) => (a.raw == null ? -Infinity : a.raw) - (b.raw == null ? -Infinity : b.raw) : c.t === 'date' ? (a, b) => String(b.raw).localeCompare(String(a.raw)) : (a, b) => a.d.localeCompare(b.d, undefined, { numeric: true }));
    const sel = new Set(cur0.vals ? [...cur0.vals] : list.map(x => x.d));
    const ops = NUMT(c) ? [['', 'No condition'], ['eq', 'Is equal to'], ['gt', 'Greater than'], ['ge', 'Greater than or equal to'], ['lt', 'Less than'], ['le', 'Less than or equal to'], ['bt', 'Is between']]
      : c.t === 'date' ? [['', 'No condition'], ['eq', 'Is on'], ['af', 'Is on or after'], ['bf', 'Is on or before'], ['bt', 'Is between']]
      : [['', 'No condition'], ['ct', 'Contains'], ['nc', 'Does not contain'], ['eq', 'Is exactly'], ['sw', 'Starts with']];
    const it = c.t === 'date' ? 'date' : 'text', up = NUMT(c) ? 'smallest to largest' : c.t === 'date' ? 'oldest to newest' : 'A to Z', dn = NUMT(c) ? 'largest to smallest' : c.t === 'date' ? 'newest to oldest' : 'Z to A';
    pop = document.createElement('div'); pop.className = 'dr-pop'; pop.dataset.k = key; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Filter ' + c.l);
    pop.innerHTML = `<div class="dr-pop-sort"><button type="button" data-ps="1">Sort ${up}</button><button type="button" data-ps="-1">Sort ${dn}</button></div>
      <div class="dr-pop-l">Filter by condition</div>
      <select class="dr-pop-op">${ops.map(([v, l]) => `<option value="${v}"${(cur0.op || '') === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
      <div class="dr-pop-in"><input class="dr-pop-a" type="${it}" value="${esc(cur0.a == null ? '' : cur0.a)}"><input class="dr-pop-b" type="${it}" value="${esc(cur0.b == null ? '' : cur0.b)}"></div>
      <div class="dr-pop-l">Filter by values</div>
      <input class="dr-pop-q" type="search" placeholder="Search" aria-label="Search values">
      <div class="dr-pop-sel"><button type="button" data-pa="1">Select all</button><span>·</span><button type="button" data-pa="0">Clear</button></div>
      <div class="dr-pop-list"></div>
      <div class="dr-pop-act"><button type="button" data-pr>Reset</button><span></span><button type="button" data-pc>Cancel</button><button type="button" class="ok" data-pk>OK</button></div>`;
    box.appendChild(pop);
    const opEl = pop.querySelector('.dr-pop-op'), aEl = pop.querySelector('.dr-pop-a'), bEl = pop.querySelector('.dr-pop-b'), qEl = pop.querySelector('.dr-pop-q'), listEl = pop.querySelector('.dr-pop-list');
    const showIn = () => { aEl.hidden = !opEl.value; bEl.hidden = opEl.value !== 'bt'; };
    const drawList = () => {
      const q = qEl.value.trim().toLowerCase(), shown = list.filter(x => !q || x.d.toLowerCase().indexOf(q) >= 0);
      listEl.innerHTML = shown.slice(0, 400).map(x => `<label class="dr-pop-v"><input type="checkbox" data-v="${esc(x.d)}"${sel.has(x.d) ? ' checked' : ''}><span>${esc(x.d === '' ? '(blank)' : x.d)}</span><em>${x.n}</em></label>`).join('') + (shown.length > 400 ? `<p class="dr-pop-more">${shown.length - 400} more: search to narrow them down.</p>` : '') + (shown.length ? '' : '<p class="dr-pop-more">Nothing matches.</p>');
    };
    showIn(); drawList();
    // where it sits: under the button, kept on screen (the whole width on a phone)
    const rc = btn.getBoundingClientRect(), W = Math.min(300, window.innerWidth - 16), phone = window.innerWidth <= 760;
    pop.style.width = W + 'px'; pop.style.left = (phone ? 8 : Math.max(8, Math.min(rc.right - W, window.innerWidth - W - 8))) + 'px';
    pop.style.top = Math.min(rc.bottom + 4, Math.max(8, window.innerHeight - 220)) + 'px'; pop.style.maxHeight = Math.max(240, window.innerHeight - parseInt(pop.style.top, 10) - 12) + 'px';
    opEl.addEventListener('change', showIn);
    qEl.addEventListener('input', drawList);
    pop.addEventListener('change', e => { const cb = e.target.closest && e.target.closest('input[data-v]'); if (cb) { if (cb.checked) sel.add(cb.dataset.v); else sel.delete(cb.dataset.v); } });
    pop.addEventListener('click', e => {
      const t = e.target;
      const ps = t.closest('[data-ps]'); if (ps) { st.sort = { k: key, dir: +ps.dataset.ps }; closePop(); drawTable(res); return; }
      const pa = t.closest('[data-pa]'); if (pa) { const q = qEl.value.trim().toLowerCase(); list.forEach(x => { if (!q || x.d.toLowerCase().indexOf(q) >= 0) { if (pa.dataset.pa === '1') sel.add(x.d); else sel.delete(x.d); } }); drawList(); return; }
      if (t.closest('[data-pr]')) { delete st.f[key]; if (st.sort && st.sort.k === key) st.sort = null; closePop(); drawTable(res); return; }
      if (t.closest('[data-pc]')) { closePop(); return; }
      if (t.closest('[data-pk]')) {
        const op = opEl.value, a = aEl.value.trim(), b = bEl.value.trim(); let cond = null;
        if (op) {
          if (NUMT(c)) { const na = parseFloat(a.replace(/,/g, '')), nb = parseFloat(b.replace(/,/g, '')); if (isFinite(na) && (op !== 'bt' || isFinite(nb))) cond = { op, a: na, b: nb }; }
          else if (c.t === 'date') { if (a && (op !== 'bt' || b)) cond = { op, a, b }; }
          else if (a) cond = { op, a };
        }
        const vals = sel.size === list.length ? null : new Set(sel);   // everything ticked is no filter at all
        if (!cond && !vals) delete st.f[key]; else st.f[key] = Object.assign({}, cond || {}, { vals });
        closePop(); drawTable(res);
      }
    });
    qEl.focus();
  }


  const slug = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const FILEFMT = { aed: 'aed', num: 'num', pct: 'pct' };
  function plain(h) { return String(h == null ? '' : h).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim(); }
  function note(t) { const el = box && box.querySelector('.dr-saved'); if (el) el.textContent = t; }
  async function save(kind) {
    const res = cache && cache[cur], sp = spec;
    if (!res || !res.rows || !res.rows.length) return;
    note('Getting the file ready…');
    try {
      if (typeof lgxBuild !== 'function') await window.trsLazy('lgx');
    } catch (e) { console.error(e); note('The file could not be made. Try again.'); return; }
    if (typeof lgxBuild !== 'function') { note('The file could not be made. Try again.'); return; }
    const cols = res.cols;
    const val = (c, r) => { const v = r[c.k]; if (c.t === 'date') return v ? day(v) : ''; if (c.t === 'html') return plain(v); if (FILEFMT[c.t]) return v === '' || v == null || !isFinite(v) ? null : +v; return v == null ? '' : String(v); };
    const vw = viewOf(res);   // what is on screen: the filtered and sorted rows, and the total row that goes with them
    const rows = vw.rows.map(r => ({ cells: cols.map(c => val(c, r)) }));
    if (vw.foot) rows.push({ total: true, cells: cols.map(c => val(c, vw.foot)) });
    const view = sp.views[cur];
    const built = lgxBuild({ sheets: [{ name: view.label || 'List', title: sp.title, subtitle: plain(res.sub != null ? res.sub : sp.sub) + (vw.filtered ? ` Filtered: ${vw.rows.length} of ${vw.total} rows.` : ''), blocks: [{ note: plain(res.note), cols: cols.map(c => ({ label: c.l, fmt: FILEFMT[c.t] || 'text' })), rows }] }] });
    const name = [slug(sp.title), sp.views.length > 1 ? slug(view.label) : '', new Date().toISOString().slice(0, 10)].filter(Boolean).join('-');
    if (kind === 'xlsx') lgxSave(lgxXlsxBlob(built), name + '.xlsx');
    else lgxSave(new Blob(['﻿' + lgxCsv(built[0])], { type: 'text/csv;charset=utf-8' }), name + '.csv');
    note(`Saved ${vw.rows.length.toLocaleString('en-GB')} rows as ${kind.toUpperCase()}`);
  }

  async function pick(i) {
    if (!box) return;
    cur = i; closePop();
    const sp = spec, v = sp.views[i];
    box.querySelectorAll('.dr-tabs button').forEach((b, j) => b.setAttribute('aria-pressed', j === i ? 'true' : 'false'));
    const sub = box.querySelector('.dr-sub'), body = box.querySelector('.dr-body');
    if (cache[i]) { paint(cache[i], v); return; }
    sub.textContent = 'Loading…'; body.innerHTML = '';
    box.querySelectorAll('[data-ds]').forEach(b => { b.disabled = true; }); note('');
    let res;
    try {
      // one frame first, so "Loading…" is on screen before a long sum runs
      await new Promise(r => setTimeout(r, 30));
      res = await v.load();
    } catch (e) {
      console.error(e);
      if (box && spec === sp) { sub.textContent = 'The list did not load. Close this and try again.'; body.innerHTML = e && e.message && /Level|Sign in|login/i.test(e.message) ? `<p class="dr-empty">${esc(e.message)}</p>` : ''; }
      return;
    }
    if (!box || spec !== sp) return;   // closed, or another one opened, while it loaded
    cache[i] = res;
    if (cur === i) paint(res, v);
  }

  function open(sp, el, replay) {
    const nested = !!box;
    if (nested) hide(); else { chain = []; pushed = 0; origin = el || document.activeElement; }
    chain.push(sp);
    try {
      if (replay && !nested) history.replaceState(history.state, '', rUrl(chain));   // the address already carries it
      else { history.pushState({ dr: chain.length }, '', rUrl(chain)); pushed++; }
    } catch (e) {}
    show(sp);
  }
  function show(sp) {
    spec = sp; cache = []; cur = 0; fst = []; pop = null;
    box = document.createElement('div');
    box.className = 'dr-modal'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', sp.title);
    const tabs = sp.views.length > 1 ? `<div class="dr-tabs" role="group" aria-label="View">${sp.views.map((v, i) => `<button type="button" data-dv="${i}" aria-pressed="${i === 0}">${esc(v.label)}</button>`).join('')}</div>` : '<div></div>';
    box.innerHTML = `<div class="dr-box"><div class="dr-hd"><div>${chain.length > 1 ? `<button type="button" class="dr-back" data-db title="Back to the list you came from">‹ Back to ${esc(chain[chain.length - 2].title)}</button>` : ''}<h3>${esc(sp.title)}</h3><p class="dr-sub">Loading…</p></div><button type="button" class="dr-x" data-dx>Close</button></div><div class="dr-bar">${tabs}<div class="dr-fbar" hidden><span class="dr-fcount"></span><button type="button" class="dr-fclear" data-fclear>Clear filters</button></div><div class="dr-save"><span class="dr-saved" role="status"></span><button type="button" data-ds="xlsx" disabled>Save as xlsx</button><button type="button" data-ds="csv" disabled>Save as csv</button></div></div><div class="dr-body"></div></div>`;
    box.addEventListener('scroll', e => { if (pop && !pop.contains(e.target)) closePop(); }, true);
    box.addEventListener('click', e => {
      const fbn = e.target.closest('[data-fc]'); if (fbn) { openPop(fbn, fbn.dataset.fc); return; }
      if (pop && !e.target.closest('.dr-pop')) closePop();
      if (e.target.closest('[data-fclear]')) { fst[cur] = { f: {}, sort: null }; if (cache && cache[cur]) drawTable(cache[cur]); return; }
      if (e.target === box || e.target.closest('[data-dx]')) { close(); return; }
      if (e.target.closest('[data-db]')) { goBack(); return; }   // Kate, 27 Oct 2026: a way back up when a list was opened from another list
      const sb = e.target.closest('.dr-sub'); if (sb) { sb.classList.toggle('open'); return; }   // phone: the note is two lines until tapped
      const t = e.target.closest('[data-dv]'); if (t) { pick(+t.dataset.dv); return; }
      const d = e.target.closest('[data-ds]'); if (d && !d.disabled) save(d.dataset.ds);
    });
    document.body.appendChild(box); document.body.classList.add('dr-open');
    const b = box.querySelector('[data-dx]'); if (b) b.focus();
    pick(0);
  }
  function goBack() {
    if (chain.length < 2) return;
    if (pushed > 0) { history.back(); return; }   // the popstate handler below does the rest
    chain.pop(); hide(); show(chain[chain.length - 1]);
  }
  window.addEventListener('popstate', () => {
    if (ignorePop) { ignorePop = 0; return; }
    if (!box) return;
    if (pushed > 0) pushed--;
    if (chain.length > 1) { chain.pop(); hide(); show(chain[chain.length - 1]); }
    else { hide(); chain = []; pushed = 0; if (origin && document.contains(origin)) origin.focus(); origin = null; }
  });
  // A link with ?r=... : open that list as soon as the page has drawn the figure that holds it (and, for a list inside a list, the one inside).
  (function restore() {
    let want; try { want = (new URL(location.href).searchParams.get('r') || '').split('.').filter(Boolean); } catch (e) { return; }
    if (!want.length) return;
    let i = 0, tries = 0;
    const timer = setInterval(() => {
      if (++tries > 70 || (box && chain.length !== i)) { clearInterval(timer); return; }   // gave up, or the person opened something else
      let hit = null; REG.forEach(sp => { if (!hit && slug(sp.title) === want[i]) hit = sp; });
      if (!hit) return;
      if (i === 0) { try { history.replaceState(history.state, '', rUrl([])); } catch (e) {} }   // the page's own address first, so Back closes the list instead of leaving the page
      open(hit, null); i++;
      if (i >= want.length) clearInterval(timer);
    }, 700);
  })();

  document.addEventListener('click', e => {
    const n = e.target.closest && e.target.closest('[data-dn]');
    if (!n) return;
    e.stopPropagation(); e.preventDefault();
    const sp = REG.get(n.dataset.dn);
    if (sp) open(sp, n);
  }, true);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && box) { if (pop) { closePop(); return; } close(); return; }
    const n = e.target.closest && e.target.closest('[data-dn]');
    if (n && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); const sp = REG.get(n.dataset.dn); if (sp) open(sp, n); }
  });

  window.TRSD = { num, reg, open, close, esc, fmt: { n0, day } };
})();
