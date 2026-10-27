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
// The window shows one view at a time (tabs when there are two or more), loads it when first picked and keeps it.
(function () {
  'use strict';
  if (window.TRSD) return;
  const REG = new Map();
  let seq = 0, box = null, from = null, spec = null, cache = null, cur = 0;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${+m[3]} ${MON[+m[2] - 1]} ${m[1]}` : esc(iso); };
  const n0 = v => Math.round(+v || 0).toLocaleString('en-GB');
  const FMT = {
    num: v => v == null || v === '' ? '' : (Math.round(+v * 100) / 100).toLocaleString('en-GB'),
    aed: (v, c) => v == null || v === '' ? '' : (c || 'AED') + ' ' + n0(v),
    date: v => day(v),
    pct: v => v == null || v === '' || !isFinite(v) ? '–' : (Math.round(+v * 10) / 10) + '%',
  };
  function cell(col, row, foot) {
    const v = row[col.k];
    if (col.t === 'html') return v == null ? '' : v;
    const f = FMT[col.t];
    return f ? f(v, spec && spec.cur) : esc(v);
  }

  // The figure. Zero and empty stay plain, as on Lost Client Blasts.
  function num(html, sp) {
    if (!sp) return html;
    const id = 'd' + (++seq);
    if (REG.size > 600) REG.clear();
    REG.set(id, sp);
    return `<span class="dn" role="button" tabindex="0" data-dn="${id}" title="See who">${html}</span>`;
  }

  function close() {
    if (box) box.remove();
    box = null; spec = null; cache = null;
    document.body.classList.remove('dr-open');
    if (from && document.contains(from)) from.focus();
    from = null;
  }

  function paint(res, view) {
    const sub = box.querySelector('.dr-sub'), body = box.querySelector('.dr-body');
    sub.innerHTML = res.sub != null ? res.sub : (spec.sub || '');
    if (!res.rows || !res.rows.length) { body.innerHTML = `<p class="dr-empty">${esc(res.empty || 'Nothing to show.')}</p>${res.note ? `<p class="dr-note">${res.note}</p>` : ''}`; return; }
    const cols = res.cols;
    const cls = c => c.t === 'num' || c.t === 'aed' || c.t === 'pct' ? 'r' : c.t === 'date' ? 'nw' : '';
    const head = cols.map(c => `<th class="${cls(c)}">${esc(c.l)}</th>`).join('');
    const line = (r, tag) => `<tr class="${r._cls || ''}">${cols.map(c => `<${tag} class="${cls(c)}">${cell(c, r)}</${tag}>`).join('')}</tr>`;
    body.innerHTML = `<div class="dr-scroll"><table class="dr-tbl"><thead><tr>${head}</tr></thead><tbody>${res.rows.map(r => line(r, 'td')).join('')}</tbody>${res.foot ? `<tfoot>${line(res.foot, 'td')}</tfoot>` : ''}</table></div>${res.note ? `<p class="dr-note">${res.note}</p>` : ''}`;
  }

  async function pick(i) {
    if (!box) return;
    cur = i;
    const sp = spec, v = sp.views[i];
    box.querySelectorAll('.dr-tabs button').forEach((b, j) => b.setAttribute('aria-pressed', j === i ? 'true' : 'false'));
    const sub = box.querySelector('.dr-sub'), body = box.querySelector('.dr-body');
    if (cache[i]) { paint(cache[i], v); return; }
    sub.textContent = 'Loading…'; body.innerHTML = '';
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

  function open(sp, el) {
    close();
    from = el || document.activeElement;
    spec = sp; cache = []; cur = 0;
    box = document.createElement('div');
    box.className = 'dr-modal'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', sp.title);
    const tabs = sp.views.length > 1 ? `<div class="dr-tabs" role="group" aria-label="View">${sp.views.map((v, i) => `<button type="button" data-dv="${i}" aria-pressed="${i === 0}">${esc(v.label)}</button>`).join('')}</div>` : '';
    box.innerHTML = `<div class="dr-box"><div class="dr-hd"><div><h3>${esc(sp.title)}</h3><p class="dr-sub">Loading…</p></div><button type="button" class="dr-x" data-dx>Close</button></div>${tabs}<div class="dr-body"></div></div>`;
    box.addEventListener('click', e => {
      if (e.target === box || e.target.closest('[data-dx]')) { close(); return; }
      const t = e.target.closest('[data-dv]'); if (t) pick(+t.dataset.dv);
    });
    document.body.appendChild(box); document.body.classList.add('dr-open');
    const b = box.querySelector('[data-dx]'); if (b) b.focus();
    pick(0);
  }

  document.addEventListener('click', e => {
    const n = e.target.closest && e.target.closest('.dn');
    if (!n) return;
    e.stopPropagation(); e.preventDefault();
    const sp = REG.get(n.dataset.dn);
    if (sp) open(sp, n);
  }, true);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && box) { close(); return; }
    const n = e.target.closest && e.target.closest('.dn');
    if (n && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); const sp = REG.get(n.dataset.dn); if (sp) open(sp, n); }
  });

  window.TRSD = { num, open, close, esc, fmt: { n0, day } };
})();
