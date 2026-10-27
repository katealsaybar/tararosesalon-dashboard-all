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
  let chain = [], pushed = 0, origin = null;
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
      if (n > 0) history.go(-n);   // back to the address the page had before the list opened
      else if (new URL(location.href).searchParams.has('r')) history.replaceState(history.state, '', rUrl([]));
    } catch (e) {}
  }

  function paint(res, view) {
    const sub = box.querySelector('.dr-sub'), body = box.querySelector('.dr-body');
    box.querySelectorAll('[data-ds]').forEach(b => { b.disabled = !(res.rows && res.rows.length); });
    note('');
    sub.innerHTML = res.sub != null ? res.sub : (spec.sub || '');
    if (!res.rows || !res.rows.length) { body.innerHTML = `<p class="dr-empty">${esc(res.empty || 'Nothing to show.')}</p>${res.note ? `<p class="dr-note">${res.note}</p>` : ''}`; return; }
    const cols = res.cols;
    const cls = c => c.t === 'num' || c.t === 'aed' || c.t === 'pct' ? 'r' : c.t === 'date' ? 'nw' : '';
    const head = cols.map(c => `<th class="${cls(c)}">${esc(c.l)}</th>`).join('');
    const line = (r, tag) => `<tr class="${r._cls || ''}">${cols.map(c => `<${tag} class="${cls(c)}">${cell(c, r)}</${tag}>`).join('')}</tr>`;
    body.innerHTML = `<div class="dr-scroll"><table class="dr-tbl"><thead><tr>${head}</tr></thead><tbody>${res.rows.map(r => line(r, 'td')).join('')}</tbody>${res.foot ? `<tfoot>${line(res.foot, 'td')}</tfoot>` : ''}</table></div>${res.note ? `<p class="dr-note">${res.note}</p>` : ''}`;
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
    const rows = res.rows.map(r => ({ cells: cols.map(c => val(c, r)) }));
    if (res.foot) rows.push({ total: true, cells: cols.map(c => val(c, res.foot)) });
    const view = sp.views[cur];
    const built = lgxBuild({ sheets: [{ name: view.label || 'List', title: sp.title, subtitle: plain(res.sub != null ? res.sub : sp.sub), blocks: [{ note: plain(res.note), cols: cols.map(c => ({ label: c.l, fmt: FILEFMT[c.t] || 'text' })), rows }] }] });
    const name = [slug(sp.title), sp.views.length > 1 ? slug(view.label) : '', new Date().toISOString().slice(0, 10)].filter(Boolean).join('-');
    if (kind === 'xlsx') lgxSave(lgxXlsxBlob(built), name + '.xlsx');
    else lgxSave(new Blob(['﻿' + lgxCsv(built[0])], { type: 'text/csv;charset=utf-8' }), name + '.csv');
    note(`Saved ${res.rows.length.toLocaleString('en-GB')} rows as ${kind.toUpperCase()}`);
  }

  async function pick(i) {
    if (!box) return;
    cur = i;
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
    spec = sp; cache = []; cur = 0;
    box = document.createElement('div');
    box.className = 'dr-modal'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', sp.title);
    const tabs = sp.views.length > 1 ? `<div class="dr-tabs" role="group" aria-label="View">${sp.views.map((v, i) => `<button type="button" data-dv="${i}" aria-pressed="${i === 0}">${esc(v.label)}</button>`).join('')}</div>` : '<div></div>';
    box.innerHTML = `<div class="dr-box"><div class="dr-hd"><div>${chain.length > 1 ? `<button type="button" class="dr-back" data-db title="Back to the list you came from">‹ Back to ${esc(chain[chain.length - 2].title)}</button>` : ''}<h3>${esc(sp.title)}</h3><p class="dr-sub">Loading…</p></div><button type="button" class="dr-x" data-dx>Close</button></div><div class="dr-bar">${tabs}<div class="dr-save"><span class="dr-saved" role="status"></span><button type="button" data-ds="xlsx" disabled>Save as xlsx</button><button type="button" data-ds="csv" disabled>Save as csv</button></div></div><div class="dr-body"></div></div>`;
    box.addEventListener('click', e => {
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
    if (e.key === 'Escape' && box) { close(); return; }
    const n = e.target.closest && e.target.closest('[data-dn]');
    if (n && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); const sp = REG.get(n.dataset.dn); if (sp) open(sp, n); }
  });

  window.TRSD = { num, reg, open, close, esc, fmt: { n0, day } };
})();
