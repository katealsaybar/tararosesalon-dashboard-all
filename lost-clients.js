// Lost Clients (Kate, 2 Oct 2026). Tara, in the coordinators' group: "we have lost
// a lot of regular clients this year … the issue is they don't book back in", and
// she wanted a list per branch for outreach. One call to lost_clients
// (migrations/create_lost_clients.sql) over sales_transaction_lines, which starts in
// January 2025, so "regular" and "gone" are judged on 2025+ visits only.
//
// Phone numbers come from client_contacts, matched from Phorest's New Clients report
// by "phorest data export/new clients/parse_new_clients.py". Only the owner login can
// read that table (Kate's choice, 2 Oct 2026), so for everyone else the server sends
// the rows without numbers and the Phone column doesn't draw. Nothing here decides
// who sees a number; the table's policy does.
//
// Level 2 and above only (Kate, 2 Oct 2026): index.html hides the menu entry and
// refuses the view for Level 1, and lost_clients itself refuses them
// (migrations/lost_clients_level2.sql).
//
// Clients seen at another branch inside the same window (now_at, from
// migrations/lost_clients_moved.sql) switched salons rather than left: about 8% of
// the list when Kate checked it. They are off the list and the tiles, on a line of
// their own with a "Show them" switch.
//
// Own controls (branch, who, gone for), so the masthead filters are hidden on this
// page. Borrows the Products page's card, tile and table styles (slv-*, w13-*).
let lcAll = null, lcRows = null, lcShowAll = false, lcQuery = '', lcMovedView = false;
let lcSel = { branch: 'SAA', seg: 'regular', days: 90 };
try { Object.assign(lcSel, JSON.parse(localStorage.getItem('trs-lost') || '{}')); } catch (e) {}

const LC_BRANCH = { SAA: 'Saadiyat', KCA: 'Khalifa City A', MC: 'Motor City', AQ: 'Al Quoz' };
// min/max visits per segment. Visits = days the client came in at that branch.
const LC_SEG = {
  regular: { label: 'Regulars (3+ visits)', short: '3+', min: 3, max: null },
  twice:   { label: 'Came twice',           short: '2',  min: 2, max: 2 },
  once:    { label: 'One visit only',       short: '1',  min: 1, max: 1 },
};
const LC_DAYS = [60, 90, 180];
const LC_LIMIT = 200;   // rows drawn before "Show all"; a branch can have 2,000+

const lcEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lcNum = v => Math.round(Number(v) || 0).toLocaleString('en-GB');
const lcDayY = d => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

function lcSave() { try { localStorage.setItem('trs-lost', JSON.stringify(lcSel)); } catch (e) {} }
function lcSet(k, v) { lcSel[k] = v; lcShowAll = false; lcMovedView = false; lcResetFilters(); lcSave(); renderLostClients(); }
function lcToggleMoved() { lcMovedView = !lcMovedView; lcShowAll = false; lcResetFilters(); lcPaint(); }

async function renderLostClients() {
  const el = document.getElementById('lostClientsContent');
  if (!el) return;
  const seg = LC_SEG[lcSel.seg] || LC_SEG.regular;
  el.innerHTML = lcShell('<p class="slv-muted">Loading clients…</p>');
  try {
    const { data, error } = await sb.rpc('lost_clients', {
      p_branch: lcSel.branch, p_min_visits: seg.min, p_max_visits: seg.max, p_days: Number(lcSel.days) });
    if (error || !Array.isArray(data)) throw error || new Error('no data');
    lcAll = data;
  } catch (e) {
    console.error(e);
    el.innerHTML = lcShell('<p class="slv-muted">The client list didn\'t load. Refresh to try again.</p>');
    return;
  }
  lcPaint();
}

function lcShell(body) {
  const seg = (key, opts) => `<div class="sc-seg" role="group">${opts.map(([k, l]) =>
    `<button type="button" class="${String(lcSel[key]) === String(k) ? 'on' : ''}" onclick="lcSet('${key}', ${typeof k === 'number' ? k : `'${k}'`})">${l}</button>`).join('')}</div>`;
  return `
    <section class="slv-intro">
      <h2>Lost Clients</h2>
      <p>Clients who used to come in and haven't been back, by branch, highest spend first. For reference and outreach planning.</p>
    </section>
    <div class="sc-bar w13-bar lc-bar">
      <div class="lc-grp lc-grp-branch"><div class="slv-eyebrow">Branch</div>${seg('branch', Object.entries(LC_BRANCH).map(([k]) => [k, k]))}</div>
      <div class="lc-grp"><div class="slv-eyebrow">Visits</div>${seg('seg', Object.entries(LC_SEG).map(([k, s]) => [k, s.short]))}</div>
      <div class="lc-grp"><div class="slv-eyebrow">Days away</div>${seg('days', LC_DAYS.map(d => [d, `${d}+`]))}</div>
    </div>
    <div id="lcBody">${body}</div>`;
}

function lcPaint() {
  const el = document.getElementById('lostClientsContent');
  if (!el || !lcAll) return;
  const seg = LC_SEG[lcSel.seg] || LC_SEG.regular;
  const lost = lcAll.filter(r => !r.now_at), moved = lcAll.filter(r => r.now_at);
  if (!moved.length) lcMovedView = false;
  lcRows = lcMovedView ? moved : lost;
  const phones = lcAll.some(r => r.mobile || r.landline);
  const spend = lost.reduce((a, r) => a + (Number(r.spend) || 0), 0);
  const withNo = lost.filter(r => r.mobile || r.landline).length;
  const byStylist = {};
  lost.forEach(r => { if (r.stylist) byStylist[r.stylist] = (byStylist[r.stylist] || 0) + 1; });
  const topSt = Object.entries(byStylist).sort((a, b) => b[1] - a[1])[0];

  document.getElementById('lcBody').innerHTML = `
    <section class="slv-card lc-board" id="lcBoard"></section>
    <section class="slv-card">
      <div class="slv-head">
        <div><div class="slv-eyebrow">${lcEsc(LC_BRANCH[lcSel.branch])}</div><h3>${lcEsc(seg.label)}, not back in ${lcNum(lcSel.days)}+ days</h3></div>
        <p>Visits since 1 Jan 2025</p>
      </div>
      <div class="w13-tiles">
        <div class="w13-tile"><div class="slv-eyebrow">Clients</div><div class="w13-val">${lcNum(lost.length)}</div><div class="slv-note">haven't been back</div></div>
        <div class="w13-tile"><div class="slv-eyebrow">What they spent</div><div class="w13-val">AED ${lcNum(spend)}</div><div class="slv-note">since Jan 2025, ex VAT</div></div>
        ${phones ? `<div class="w13-tile"><div class="slv-eyebrow">With a phone number</div><div class="w13-val">${lcNum(withNo)}</div><div class="slv-note">${lost.length ? Math.round(100 * withNo / lost.length) : 0}% of the list</div></div>` : ''}
        <div class="w13-tile"><div class="slv-eyebrow">Most of them saw</div><div class="w13-val" style="font-size:20px">${lcEsc(topSt ? topSt[0] : '–')}</div><div class="slv-note">${topSt ? lcNum(topSt[1]) + ' clients' : ''}</div></div>
      </div>
      ${moved.length ? `<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:14px 0 0">
        <span class="slv-muted" style="margin:0">${lcMovedView
          ? `Showing the ${lcNum(moved.length)} who came back at another branch instead. They aren't counted above.`
          : `${lcNum(moved.length)} more came back at another branch in the last ${lcNum(lcSel.days)} days, so they aren't counted as lost.`}</span>
        <button type="button" class="tglr" onclick="lcToggleMoved()">${lcMovedView ? 'Back to the lost list' : 'Show them'}</button>
      </div>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:16px 0 8px">
        <input type="search" id="lcSearch" placeholder="Search name or stylist" value="${lcEsc(lcQuery)}"
          oninput="lcQuery=this.value;lcShowAll=false;lcPaintTable()"
          style="flex:1;min-width:180px;max-width:320px;padding:8px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:inherit;font:inherit">
        <button type="button" class="tglr" onclick="lcSaveFile('xlsx')">XLSX</button>
        <button type="button" class="tglr" onclick="lcSaveFile('csv')">CSV</button>
        <span id="lcCopied" class="slv-note" style="display:inline"></span>
      </div>
      <div id="lcTable"></div>
    </section>
    <p class="slv-muted">From Phorest's Sales Transactions, which starts in January 2025: a client who was a regular in 2024 and stopped before then isn't on this list. Visits are days she came in at this branch; a client seen at another branch in the same window is counted on its own line, not as lost. Usual stylist is whoever served most of her visits. "Last visit" is the newest day uploaded, so the last day or two can lag.${phones ? ' Phone numbers come from Phorest\'s New Clients report and are shown to your login only. The report doesn\'t say who opted out of marketing, so check consent in Phorest before anyone messages a client.' : ''}</p>`;
  lcPaintTable();
  lcStickHead();
  lcLoadSummary();
}

// The column heads stay put under the filter bar while the list scrolls (Kate, 2 Oct
// 2026). The bar is itself sticky and wraps to two rows on a narrow window, so its
// height is measured rather than typed into the CSS.
function lcStickHead() {
  const bar = document.querySelector('#lostClientsContent .lc-bar');
  if (bar) document.documentElement.style.setProperty('--lc-bar-h', bar.offsetHeight + 'px');
}
window.addEventListener('resize', lcStickHead);

// ── COLUMN FILTERS, LIKE A GOOGLE SHEET (Kate, 2 Oct 2026) ─────────────────
// Every heading opens a menu: sort both ways, and a filter that suits the column
// (contains for the name, a range for numbers and dates, a tick list for the stylist
// and the branch she moved to, has / has not for the phone). Filters stack with the
// search box and with each other, the heading of a filtered column is marked, and
// XLSX / CSV save exactly what the filters leave. Spend is her total since Jan 2025;
// Avg per visit is that over her visits (Kate asked which it was, same day).
let lcSort = { k: 'spend', dir: -1 };
let lcF = {};
const lcAvg = r => (Number(r.visits) || 0) ? Math.round((Number(r.spend) || 0) / Number(r.visits)) : 0;
const LC_COLS = [
  { k: 'client',  label: 'Client',              type: 'text', get: r => r.client_name || '' },
  { k: 'visits',  label: 'Visits',              type: 'num',  get: r => Number(r.visits) || 0 },
  { k: 'last',    label: 'Last visit',          type: 'date', get: r => r.last_visit || '' },
  { k: 'spend',   label: 'Total spend (AED)',   type: 'num',  get: r => Math.round(Number(r.spend) || 0) },
  { k: 'avg',     label: 'Avg per visit (AED)', type: 'num',  get: lcAvg },
  { k: 'stylist', label: 'Usual stylist',       type: 'pick', get: r => r.stylist || '' },
  { k: 'also',    label: 'Also saw',            type: 'text', get: r => lcAlsoNames(r.also_saw).join(', ') },
  { k: 'now',     label: 'Now at',              type: 'pick', get: r => r.now_at || '', moved: true },
  { k: 'phone',   label: 'Phone',               type: 'has',  get: r => r.mobile || r.landline || '', phones: true },
];
const lcHasPhones = () => (lcAll || []).some(r => r.mobile || r.landline);
const lcCols = () => LC_COLS.filter(c => (!c.moved || lcMovedView) && (!c.phones || lcHasPhones()));
const lcColOf = k => LC_COLS.find(c => c.k === k);
function lcOn(k) {
  const f = lcF[k]; if (!f) return false;
  return !!(f.q || f.min != null || f.max != null || f.from || f.to || f.set || f.has);
}
function lcPass(r, skip) {
  const q = lcQuery.trim().toLowerCase();
  if (q && !`${r.client_name} ${r.stylist || ''}`.toLowerCase().includes(q)) return false;
  for (const c of LC_COLS) {
    if (c.k === skip || !lcOn(c.k)) continue;
    const f = lcF[c.k], v = c.get(r);
    if (c.type === 'text' && f.q && !String(v).toLowerCase().includes(f.q.toLowerCase())) return false;
    if (c.type === 'num' && ((f.min != null && v < f.min) || (f.max != null && v > f.max))) return false;
    if (c.type === 'date' && ((f.from && v < f.from) || (f.to && v > f.to))) return false;
    if (c.type === 'pick' && f.set && !f.set.includes(v)) return false;
    if (c.type === 'has' && f.has && (f.has === 'yes') !== !!v) return false;
  }
  return true;
}
function lcFiltered() {
  const c = lcColOf(lcSort.k) || lcColOf('spend');
  return (lcRows || []).filter(r => lcPass(r)).sort((a, b) => {
    const x = c.get(a), y = c.get(b);
    return ((x < y ? -1 : x > y ? 1 : 0) * lcSort.dir) || ((Number(b.spend) || 0) - (Number(a.spend) || 0));
  });
}
function lcResetFilters() { lcF = {}; lcSort = { k: 'spend', dir: -1 }; lcClosePop(); }

let lcPopFor = null;
function lcClosePop() { const p = document.getElementById('lcPop'); if (p) p.remove(); lcPopFor = null; }
function lcOpenFilter(ev, k) {
  ev.stopPropagation();
  if (lcPopFor === k) { lcClosePop(); return; }
  lcClosePop();
  lcPopFor = k;
  const c = lcColOf(k), f = lcF[k] || {};
  const pop = document.createElement('div');
  pop.id = 'lcPop'; pop.className = 'lc-pop'; pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', c.label + ': sort and filter');
  const words = c.type === 'num' ? ['Smallest first', 'Largest first'] : c.type === 'date' ? ['Oldest first', 'Newest first'] : ['A to Z', 'Z to A'];
  let body = '';
  if (c.type === 'text') body = `<input type="search" class="lc-in" data-f="q" placeholder="Contains…" value="${lcEsc(f.q || '')}">`;
  if (c.type === 'num') body = `<div class="lc-two"><input type="number" class="lc-in" data-f="min" placeholder="From" value="${f.min ?? ''}"><input type="number" class="lc-in" data-f="max" placeholder="To" value="${f.max ?? ''}"></div>`;
  if (c.type === 'date') body = `<div class="lc-two"><input type="date" class="lc-in" data-f="from" value="${f.from || ''}"><input type="date" class="lc-in" data-f="to" value="${f.to || ''}"></div>`;
  if (c.type === 'has') body = ['', 'yes', 'no'].map((v, i) => `<label class="lc-chk"><input type="radio" name="lcHas" value="${v}"${(f.has || '') === v ? ' checked' : ''}> ${['Everyone', 'Has a number', 'No number'][i]}</label>`).join('');
  if (c.type === 'pick') {
    const cnt = {};
    (lcRows || []).filter(r => lcPass(r, k)).forEach(r => { const v = c.get(r); cnt[v] = (cnt[v] || 0) + 1; });
    const vals = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a] || a.localeCompare(b));
    body = `<input type="search" class="lc-in lc-pick-q" placeholder="Search…">
      <div class="lc-pick-acts"><button type="button" data-all="1">Select all</button><button type="button" data-all="0">Clear</button></div>
      <div class="lc-pick">${vals.map(v => `<label class="lc-chk" data-v="${lcEsc(v.toLowerCase())}"><input type="checkbox" value="${lcEsc(v)}"${!f.set || f.set.includes(v) ? ' checked' : ''}> <span>${lcEsc(v || '(blank)')}</span><em>${cnt[v]}</em></label>`).join('')}</div>`;
  }
  pop.innerHTML = `<div class="lc-pop-sort"><button type="button" data-dir="1">${words[0]}</button><button type="button" data-dir="-1">${words[1]}</button></div>
    <div class="slv-eyebrow" style="margin:10px 0 6px">Filter</div>${body}
    <div class="lc-pop-foot"><button type="button" data-clear="1">Clear filter</button><button type="button" data-done="1" class="on">Done</button></div>`;
  document.body.appendChild(pop);
  const th = ev.currentTarget.getBoundingClientRect();
  pop.style.top = Math.max(8, Math.min(th.bottom + 4, innerHeight - pop.offsetHeight - 8)) + 'px';
  pop.style.left = Math.max(8, Math.min(th.left, innerWidth - pop.offsetWidth - 8)) + 'px';
  const apply = () => { lcShowAll = false; lcPaintTable(); };
  const set = (fk, v) => { lcF[k] = Object.assign({}, lcF[k], { [fk]: v }); apply(); };
  pop.addEventListener('click', e => e.stopPropagation());
  pop.querySelectorAll('[data-dir]').forEach(b => b.onclick = () => { lcSort = { k, dir: +b.dataset.dir }; apply(); lcClosePop(); });
  pop.querySelector('[data-clear]').onclick = () => { delete lcF[k]; apply(); lcClosePop(); };
  pop.querySelector('[data-done]').onclick = lcClosePop;
  pop.querySelectorAll('.lc-in[data-f]').forEach(i => i.oninput = () => {
    const raw = i.value.trim();
    set(i.dataset.f, i.type === 'number' ? (raw === '' ? null : Number(raw)) : (raw || null));
  });
  pop.querySelectorAll('input[name=lcHas]').forEach(i => i.onchange = () => set('has', i.value || null));
  const picks = [...pop.querySelectorAll('.lc-pick input')];
  const readPicks = () => { const on = picks.filter(p => p.checked).map(p => p.value); set('set', on.length === picks.length ? null : on); };
  picks.forEach(p => p.onchange = readPicks);
  pop.querySelectorAll('[data-all]').forEach(b => b.onclick = () => { picks.forEach(p => { p.checked = b.dataset.all === '1'; }); readPicks(); });
  const pq = pop.querySelector('.lc-pick-q');
  if (pq) pq.oninput = () => pop.querySelectorAll('.lc-pick label').forEach(l => { l.style.display = l.dataset.v.includes(pq.value.toLowerCase()) ? '' : 'none'; });
  const first = pop.querySelector('input'); if (first && matchMedia('(hover:hover)').matches) first.focus();
}
document.addEventListener('click', () => { if (lcPopFor) lcClosePop(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && lcPopFor) lcClosePop(); });

// ── WHAT SHE CAME IN FOR (Kate, 2 Oct 2026) ────────────────────────────────
// Tap a client (a row, or a card on a phone) and the panel under it lists her usual
// services at this branch, what she took home and who looked after her, from
// lost_client_detail. Asked once per client and kept.
const lcDetailCache = {};
let lcShown = [];
async function lcToggleDetail(ev, i) {
  if (ev.target.closest('a,button,.who,input,label,.lc-det-box')) return;
  const r = lcShown[i];
  if (!r) return;
  const host = ev.currentTarget, phone = host.tagName === 'LI';
  const open = phone ? host.querySelector('.lc-det-box')
    : (host.nextElementSibling && host.nextElementSibling.classList.contains('lc-det') ? host.nextElementSibling : null);
  if (open) { (phone ? open : open).remove(); host.classList.remove('lc-open'); return; }
  host.classList.add('lc-open');
  const box = document.createElement(phone ? 'div' : 'tr');
  if (phone) box.className = 'lc-det-box';
  else { box.className = 'lc-det'; box.innerHTML = `<td colspan="${host.children.length}"><div class="lc-det-box"></div></td>`; }
  const inner = phone ? box : box.querySelector('.lc-det-box');
  inner.innerHTML = '<p class="slv-muted" style="margin:0">Loading her visits…</p>';
  if (phone) host.querySelector('.prd-body').appendChild(box); else host.after(box);
  const key = lcSel.branch + '|' + r.client_name;
  try {
    if (!lcDetailCache[key]) {
      const { data, error } = await sb.rpc('lost_client_detail', { p_branch: lcSel.branch, p_client: r.client_name });
      if (error) throw error;
      lcDetailCache[key] = data;
    }
    inner.innerHTML = lcDetailHtml(lcDetailCache[key]);
  } catch (e) {
    console.error(e);
    inner.innerHTML = '<p class="slv-muted" style="margin:0">Her visits did not load. Tap again to retry.</p>';
    host.classList.remove('lc-open');
    setTimeout(() => box.remove(), 2500);
  }
}
function lcDetailHtml(d) {
  const svc = (d && d.services) || [], prod = (d && d.products) || [], st = (d && d.stylists) || [];
  const svcHtml = svc.length ? `<ol class="lc-svc">${svc.map(s => `<li><b>${lcEsc(s.item)}</b>
      <span>${lcNum(s.visits)} visit${s.visits === 1 ? '' : 's'} · last ${lcEsc(lcDayY(s.last_date))} · AED ${lcNum(s.spend)}${s.last_by ? ' · ' + lcStylist(s.last_by) : ''}</span></li>`).join('')}</ol>`
    : '<p class="slv-muted" style="margin:0">No services on record.</p>';
  return `<div class="lc-det-grid">
      <div><div class="slv-eyebrow">What she came in for</div>${svcHtml}</div>
      <div>
        ${prod.length ? `<div class="slv-eyebrow">Took home</div><ul class="lc-prod">${prod.map(p => `<li>${lcEsc(p.item)} <span>AED ${lcNum(p.spend)}${p.times > 1 ? ' · ' + p.times + 'x' : ''}</span></li>`).join('')}</ul>` : ''}
        ${st.length ? `<div class="slv-eyebrow" style="margin-top:${prod.length ? 14 : 0}px">Looked after by</div><div class="lc-sts">${st.map(s => `<span>${lcStylist(s.employee_name)} <em>${lcNum(s.visits)}</em></span>`).join('')}</div>` : ''}
        ${d && d.first_visit ? `<p class="slv-note" style="margin-top:12px">First visit here ${lcEsc(lcDayY(d.first_visit))}</p>` : ''}
      </div>
    </div>`;
}

// ── THE BOARD (Kate, 2 Oct 2026) ───────────────────────────────────────────
// How many have not come back, every branch at once, for the days picked above:
// regulars, twice, once, and all of them, with what they had spent and the share of
// that branch's clients it is. From lost_clients_summary, the same rules as the
// list (moved-to-another-branch clients left out). Tap a cell to open that list.
let lcSum = null, lcSumErr = false;
async function lcLoadSummary() {
  if (lcSum || lcSumErr) { lcPaintBoard(); return; }
  try {
    const { data, error } = await sb.rpc('lost_clients_summary');
    if (error) throw error;
    lcSum = data || [];
  } catch (e) { console.error(e); lcSumErr = true; }
  lcPaintBoard();
}
function lcOpenCell(b, s) { lcSel.seg = s; lcSet('branch', b); }
function lcPaintBoard() {
  const el = document.getElementById('lcBoard');
  if (!el) return;
  if (lcSumErr) { el.innerHTML = '<p class="slv-muted">The board did not load. Refresh to try again.</p>'; return; }
  if (!lcSum) { el.innerHTML = '<p class="slv-muted">Counting every branch…</p>'; return; }
  const days = Number(lcSel.days), segs = ['regular', 'twice', 'once'];
  const at = (b, s) => lcSum.find(x => x.branch === b && x.seg === s && Number(x.days) === days) || { lost: 0, lost_spend: 0, active: 0, moved: 0 };
  const sum = (list, f) => list.reduce((a, x) => a + (Number(x[f]) || 0), 0);
  const cell = (b, s, x) => {
    const on = b === lcSel.branch && s === lcSel.seg;
    const go = b && s ? ` onclick="lcOpenCell('${b}','${s}')" role="button" tabindex="0"` : '';
    return `<td class="${on ? 'on' : ''}${go ? ' go' : ''}"${go}><b>${lcNum(x.lost)}</b><small>AED ${lcNum(x.lost_spend)}</small></td>`;
  };
  const row = (label, xs, b, cls) => {
    const tot = { lost: sum(xs, 'lost'), lost_spend: sum(xs, 'lost_spend') };
    const all = sum(xs, 'lost') + sum(xs, 'active') + sum(xs, 'moved');
    return `<tr${cls ? ` class="${cls}"` : ''}><th>${lcEsc(label)}</th>${segs.map((s, i) => cell(b, b ? s : null, xs[i])).join('')}${cell(null, null, tot)}
      <td class="pct"><b>${all ? Math.round(100 * tot.lost / all) : 0}%</b><small>of ${lcNum(all)}</small></td></tr>`;
  };
  const rows = Object.keys(LC_BRANCH).map(b => row(LC_BRANCH[b], segs.map(s => at(b, s)), b)).join('');
  const allXs = segs.map(s => { const l = Object.keys(LC_BRANCH).map(b => at(b, s));
    return { lost: sum(l, 'lost'), lost_spend: sum(l, 'lost_spend'), active: sum(l, 'active'), moved: sum(l, 'moved') }; });
  el.innerHTML = `<div class="slv-head"><div><div class="slv-eyebrow">Every branch</div><h3>Not back in ${days}+ days</h3></div>
      <p>Tap a number to open that list</p></div>
    <div class="slv-wrap"><table class="slv-table lc-board-t">
      <thead><tr><th>Branch</th><th>Regulars (3+)</th><th>Came twice</th><th>One visit</th><th>All lost</th><th>Of their clients</th></tr></thead>
      <tbody>${rows}${row('All salons', allXs, null, 'tot')}</tbody></table></div>
    <p class="slv-note" style="margin-top:8px">Clients since Jan 2025, total spend ex VAT. "Of their clients" is everyone who came to that branch since then. A client who has since been in at another branch is not counted as lost.</p>`;
}

// The table on its own, so typing in the search box or changing a column filter
// redraws only this and keeps the cursor where it is.
function lcPaintTable() {
  const box = document.getElementById('lcTable');
  if (!box || !lcRows) return;
  const rows = lcFiltered(), cols = lcCols();
  const shown = lcShowAll ? rows : rows.slice(0, LC_LIMIT);
  lcShown = shown;
  const check = r => r.match === 'check' ? ' <span class="slv-note" style="display:inline" title="Two different numbers under this name: two people, or one client entered twice in Phorest">check</span>' : '';
  const td = (c, r) => {
    if (c.k === 'client') return `<td>${lcEsc(r.client_name)}${check(r)}</td>`;
    if (c.k === 'visits') return `<td>${lcNum(r.visits)}</td>`;
    if (c.k === 'last') return `<td>${lcEsc(lcDayY(r.last_visit))}<div class="slv-note">${lcNum(r.days_since)} days ago</div></td>`;
    if (c.k === 'spend') return `<td>${lcNum(r.spend)}</td>`;
    if (c.k === 'avg') return `<td>${lcNum(lcAvg(r))}</td>`;
    if (c.k === 'stylist') return `<td>${lcStylist(r.stylist)}</td>`;
    if (c.k === 'also') return `<td class="lc-also">${lcAlso(r.also_saw)}</td>`;
    if (c.k === 'now') return `<td>${r.now_at ? `${lcEsc(r.now_at)}<div class="slv-note">${lcEsc(lcDayY(r.now_last))}</div>` : ''}</td>`;
    if (c.k === 'phone') return `<td>${lcPhone(r)}</td>`;
    return '<td></td>';
  };
  const th = c => {
    const sorted = lcSort.k === c.k ? (lcSort.dir > 0 ? ' ▲' : ' ▼') : '';
    return `<th class="lc-th${lcOn(c.k) ? ' on' : ''}"><button type="button" class="lc-thb" onclick="lcOpenFilter(event,'${c.k}')" aria-haspopup="dialog">${lcEsc(c.label)}<span class="lc-ar">${sorted}</span><span class="lc-fn" aria-hidden="true"></span></button></th>`;
  };
  const tr = shown.map((r, i) => `<tr class="lc-row" onclick="lcToggleDetail(event,${i})">${cols.map(c => td(c, r)).join('')}</tr>`).join('');
  // Under 760px the table becomes a list, like Products: name and spend on one line,
  // visits / avg / last visit / stylist under it, the number last (tap to call). A tap
  // opens the same panel as a row.
  const cards = shown.map((r, i) => `<li class="prd-card lc-row" onclick="lcToggleDetail(event,${i})">
      <div class="prd-body">
        <div class="prd-top"><span class="prd-name">${lcEsc(r.client_name)}${check(r)}</span><span class="prd-spend">AED ${lcNum(r.spend)}</span></div>
        <div class="prd-meta">${lcNum(r.visits)} visits · avg AED ${lcNum(lcAvg(r))} · last ${lcEsc(lcDayY(r.last_visit))} (${lcNum(r.days_since)} days)${r.stylist ? ' · ' + lcStylist(r.stylist) : ''}${lcMovedView && r.now_at ? ' · now at ' + lcEsc(r.now_at) + ' (' + lcEsc(lcDayY(r.now_last)) + ')' : ''}</div>
        ${lcAlsoNames(r.also_saw).length ? `<div class="prd-meta">Also saw ${lcAlso(r.also_saw)}</div>` : ''}
        ${lcHasPhones() && (r.mobile || r.landline) ? `<div class="prd-meta" style="margin-top:4px">${lcPhone(r)}</div>` : ''}
      </div>
    </li>`).join('');
  const filtered = Object.keys(lcF).some(lcOn);
  const note = filtered || lcQuery.trim()
    ? `<p class="slv-note lc-fnote">${lcNum(rows.length)} of ${lcNum(lcRows.length)} after filters · <button type="button" class="lc-more" onclick="lcClearAll()">clear all</button></p>` : '';
  box.innerHTML = note + `<div class="slv-wrap prd-desk lc-wrap"><table class="slv-table">
      <thead><tr>${cols.map(th).join('')}</tr></thead>
      <tbody>${tr || `<tr><td colspan="${cols.length}" class="slv-muted">No one on this list matches those filters.</td></tr>`}</tbody></table></div>
      <ol class="prd-cards">${cards || '<li class="slv-muted">No one on this list matches those filters.</li>'}</ol>
      ${rows.length > shown.length ? `<p style="margin-top:10px"><button type="button" class="tglr" onclick="lcShowAll=true;lcPaintTable()">Show all ${lcNum(rows.length)}</button></p>` : ''}`;
}
function lcClearAll() {
  lcResetFilters(); lcQuery = '';
  const q = document.getElementById('lcSearch'); if (q) q.value = '';
  lcPaintTable();
}

// "Also saw": the first two names as links, the rest counted ("+3"), all on hover.
// Assistants are left out (Kate, 2 Oct 2026): they help on a visit, they are not who a
// client books. The BUSINESS (unassigned) bucket is already gone in lost_clients.
function lcIsAssistant(name) {
  const up = String(name).trim().toUpperCase(), w = up.split(/\s+/);
  const P = typeof STAFF_PROFILES !== 'undefined' ? STAFF_PROFILES : {};
  const p = P[up] || P[w.slice(0, 2).join(' ')] || P[w[0]];
  return !!(p && /assistant/i.test(p.role || ''));
}
const lcAlsoNames = list => String(list || '').split(', ').filter(n => n && !/^\s*business\b/i.test(n) && !lcIsAssistant(n));
function lcAlso(list) {
  const names = lcAlsoNames(list);
  if (!names.length) return '–';
  return names.slice(0, 2).map(lcStylist).join(', ')
    + (names.length > 2 ? ` <span class="slv-note" style="display:inline" title="${lcEsc(names.slice(2).join(', '))}">+${names.length - 2}</span>` : '');
}

// Usual stylist as a link (Kate, 2 Oct 2026): the same hover / tap menu every other
// staff name has (staff-links.js: Staff card, Staff stats, Branch figures), in the
// hair or beauty accent by her role in staff-profiles.js, hair when unknown. The menu
// is handed her Staff Cards key (SHINE, not SHINE CASTILLO), or it cannot find her
// card. Someone marked resigned there is grey, like her faded card.
function lcStylist(name) {
  if (!name) return '–';
  const up = String(name).trim().toUpperCase(), w = up.split(/\s+/);
  const P = typeof STAFF_PROFILES !== 'undefined' ? STAFF_PROFILES : {};
  const key = [up, w.slice(0, 2).join(' '), w[0]].find(k => P[k]);
  const prof = key ? P[key] : null;
  const dept = prof && /beauty|nail|lash|brow|therap|aesthet/i.test(prof.role || '') ? 'beauty' : 'hair';
  const gone = prof && prof.resigned ? ' lc-st-gone' : '';
  const inner = `<span class="lc-st lc-st-${dept}${gone}"${gone ? ' title="Has left"' : ''}>${lcEsc(name)}</span>`;
  return typeof staffWho === 'function' ? staffWho(key || name, inner, { dept, branch: lcSel.branch }) : inner;
}

// One number per client on screen. A common name can carry up to ten (everyone in
// Phorest with that name), which stretched the column off the card. The rest sit
// behind "+N more", a button (Kate, 2 Oct 2026: it was only a hover title, so it
// could not be clicked); it opens them under the first, each one tap-to-call. The
// files carry them all.
function lcPhone(r) {
  const nums = String(r.mobile || r.landline || '').split(' / ').filter(Boolean);
  if (!nums.length) return '–';
  const tel = n => `<a href="tel:${lcEsc(n)}" style="color:inherit;white-space:nowrap">${lcEsc(n)}</a>`;
  return nums.length > 1
    ? `<span class="lc-ph">${tel(nums[0])} <button type="button" class="lc-more" aria-expanded="false"
        onclick="const p=this.parentNode,o=p.classList.toggle('open');this.setAttribute('aria-expanded',o);this.textContent=o?'fewer':'+${nums.length - 1} more'">+${nums.length - 1} more</button>
        <span class="lc-rest">${nums.slice(1).map(tel).join('<br>')}</span></span>`
    : tel(nums[0]);
}

// The list as filtered, all of it, not just the rows drawn: the header and one array
// per client, in the columns on screen (Last visit adds Days since, Now at adds its
// date). XLSX and CSV both read this, so the two never disagree.
function lcExportLines() {
  const rows = lcFiltered(), cols = lcCols();
  const head = [], pick = [];
  cols.forEach(c => {
    if (c.k === 'last') { head.push('Last visit', 'Days since'); pick.push(r => r.last_visit, r => Number(r.days_since) || 0); return; }
    if (c.k === 'now') { head.push('Now at', 'Last visit there'); pick.push(r => r.now_at || '', r => r.now_last || ''); return; }
    head.push(c.label); pick.push(c.get);
  });
  return { head, lines: rows.map(r => pick.map(f => f(r))), rows };
}

// XLSX and CSV (Kate, 2 Oct 2026), written by ledger-export.js's own writer (no
// library). Header row first, no title rows, so the file imports straight into a
// sheet or a CRM. File name: lost-clients-SAA-regulars-60d (plus -moved / -search).
function lcSaveFile(kind) {
  if (typeof lgxBuild !== 'function') return;
  const { head, lines } = lcExportLines();
  const nums = new Set(['Visits', 'Days since', 'Total spend (AED)', 'Avg per visit (AED)']);
  const cols = head.map(h => ({ label: h, fmt: /AED/.test(h) ? 'aed' : nums.has(h) ? 'num' : 'text' }));
  const built = lgxBuild({ sheets: [{ name: 'Lost clients ' + lcSel.branch, blocks: [{ cols, rows: lines.map(l => ({ cells: l })) }] }] });
  const name = ['lost-clients', lcSel.branch, lcSel.seg === 'regular' ? 'regulars' : lcSel.seg, lcSel.days + 'd']
    .concat(lcMovedView ? ['moved'] : []).concat(lcQuery.trim() || Object.keys(lcF).some(lcOn) ? ['filtered'] : []).join('-');
  if (kind === 'xlsx') lgxSave(lgxXlsxBlob(built), name + '.xlsx');
  else lgxSave(new Blob(['﻿' + lgxCsv(built[0])], { type: 'text/csv;charset=utf-8' }), name + '.csv');
  const s = document.getElementById('lcCopied');
  if (s) s.textContent = `Saved ${lcNum(lines.length)} rows as ${kind.toUpperCase()}`;
}
