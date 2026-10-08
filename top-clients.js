// Top Clients (Kate, 7 Oct 2026), rebuilt from Downloads/top-clients-mockup.html on the same
// footing as Client's Last Visit (lost-clients.js, which loads first and whose helpers
// lcEsc, lcNum, lcDayY, lcShortAed, lcTeam, lcStylist, lcPhone and lcDetailHtml this reuses).
//
// Two calls (migrations/top_clients_revamp.sql), both over sales_transaction_lines from
// Jan 2025 and both read-only:
//   top_clients        the ranked list for the window and filters picked here
//   top_clients_board  every branch's top N, split by when we last saw them, for the board
// The row panel is lost_client_detail, now able to answer for every branch at once.
//
// Own controls (branch, period, visits, spend, last seen), so the masthead filters are
// hidden on this page, as on Client's Last Visit. Revenue is ex VAT. The old page summed
// the VAT-inclusive total, so figures here are about 4.75% lower than it showed.
//
// Everyone signed in can see the list; only Level 2 and above can open a row (that is what
// lost_client_detail allows), and phone numbers come back for the owner login only,
// because client_contacts' own policy decides that, not this file.
const TC_STORE = 'trs-top-clients';
const TC = { branch: 'all', period: 'year', month: '', year: '', pfrom: '', pto: '', seg: 'all', spend: 0,
  last: 'any', lfrom: 61, lto: 120, top: 25, mode: 'rev', sortk: 'rev', sortdir: -1 };
let tcQ = '', tcData = null, tcBoard = null, tcBoardErr = false, tcSeq = 0, tcStamp = 0, tcNumsOpen = false;
const tcCache = {};

const tcIso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const tcToday = () => tcIso(new Date());
const TC_FIRST = '2021-08-01';   // sales_transaction_lines starts here (Aug 2021 at Khalifa City and Saadiyat)
try {
  const s = JSON.parse(localStorage.getItem(TC_STORE) || '{}');
  for (const k of Object.keys(TC)) if (s[k] !== undefined && typeof s[k] === typeof TC[k]) TC[k] = s[k];
} catch (e) {}
function tcSave() { try { localStorage.setItem(TC_STORE, JSON.stringify(TC)); } catch (e) {} }

const TC_PERIODS = [['this', 'This month'], ['last', 'Last month'], ['month', 'Month'], ['year', 'Year'], ['custom', 'Custom']];
const TC_LAST = [['any', 'Any'], ['now', '30 days'], ['cool', '31 to 60'], ['slip', '60+'], ['custom', 'Custom']];
const TC_LASTTXT = { now: 'in the last 30 days', cool: '31 to 60 days ago', slip: '60+ days ago' };
const TC_BUCKETS = [
  { k: 'now',  label: 'Seen in the last 30 days', short: 'Last 30 days',  color: 'var(--accent-mint)' },
  { k: 'cool', label: '31 to 60 days',            short: '31 to 60 days', color: 'var(--accent-butter)' },
  { k: 'slip', label: '60+ days',                 short: '60+ days',      color: 'var(--accent-coral)' },
];
const tcCanOpen = () => typeof TRS_LEVEL !== 'undefined' && TRS_LEVEL >= 2;
try { if (localStorage.getItem('trs-tc-board') === 'n') TC.mode = 'n'; } catch (e) {}

// ── THE WINDOW ──────────────────────────────────────────────────────────────
const tcMonthOf = iso => iso.slice(0, 7);
function tcYears() {   // newest first, back to the first year with sales lines
  const out = [];
  for (let y = new Date().getFullYear(); y >= Number(TC_FIRST.slice(0, 4)); y--) out.push(String(y));
  return out;
}
function tcMonths() {   // newest first, back to Aug 2021
  const out = [], now = new Date();
  for (let y = now.getFullYear(), m = now.getMonth(); y > 2021 || (y === 2021 && m >= 7);) {
    out.push(`${y}-${String(m + 1).padStart(2, '0')}`);
    if (--m < 0) { m = 11; y--; }
  }
  return out;
}
const tcMonthLabel = ym => new Date(ym + '-01T00:00:00').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
function tcRange() {
  const today = tcToday(), now = new Date(), y = now.getFullYear(), pad = n => String(n).padStart(2, '0');
  const lastDay = ym => { const [yy, mm] = ym.split('-').map(Number); return tcIso(new Date(yy, mm, 0)); };
  let a, b;
  if (TC.period === 'this') { a = `${y}-${pad(now.getMonth() + 1)}-01`; b = today; }
  else if (TC.period === 'last') { const p = new Date(y, now.getMonth() - 1, 1); const ym = tcMonthOf(tcIso(p)); a = ym + '-01'; b = lastDay(ym); }
  else if (TC.period === 'month') { const ym = /^\d{4}-\d{2}$/.test(TC.month) ? TC.month : tcMonthOf(today); a = ym + '-01'; b = lastDay(ym); }
  else if (TC.period === 'custom') { a = TC.pfrom || `${y}-01-01`; b = TC.pto || today; }
  else { const yy = /^\d{4}$/.test(TC.year) ? Number(TC.year) : y; a = `${yy}-01-01`; b = yy === y ? today : `${yy}-12-31`; }
  if (a < TC_FIRST) a = TC_FIRST;
  if (b > today) b = today;
  if (b < a) b = a;
  return [a, b];
}
const tcPeriodTxt = () => { const r = tcRange(); return lcDayY(r[0]) + ' to ' + lcDayY(r[1]); };
const tcAway = () => ({ any: [null, null], now: [0, 30], cool: [31, 60], slip: [61, null],
  custom: [Math.max(0, Math.floor(TC.lfrom) || 0), Math.max(0, Math.floor(TC.lto) || 0)] }[TC.last] || [null, null]);
const tcSeg = () => ({ all: [1, null], '3': [3, null], '2': [2, 2], '1': [1, 1] }[TC.seg] || [1, null]);
const tcBranchArg = () => TC.branch === 'all' ? null : TC.branch;
function tcListArgs() {
  const [a, b] = tcRange(), [v0, v1] = tcSeg(), [d0, d1] = tcAway();
  return { p_from: a, p_to: b, p_branch: tcBranchArg(), p_min_visits: v0, p_max_visits: v1, p_min_spend: Number(TC.spend) || 0,
    p_away_min: d0, p_away_max: d1, p_limit: Number(TC.top) || 25 };
}
function tcBoardArgs() {
  const [a, b] = tcRange(), [v0, v1] = tcSeg();
  return { p_from: a, p_to: b, p_min_visits: v0, p_max_visits: v1, p_min_spend: Number(TC.spend) || 0, p_limit: Number(TC.top) || 25 };
}
// One ask per distinct question, kept ten minutes (a changed pill asks again, a changed-back
// one does not).
function tcCall(name, args) {
  const key = name + JSON.stringify(args);
  if (!tcCache[key]) {
    tcCache[key] = Promise.resolve(sb.rpc(name, args)).then(r => {
      if (r.error) { delete tcCache[key]; throw r.error; }
      return r.data;
    }, e => { delete tcCache[key]; throw e; });
  }
  return tcCache[key];
}

// ── CONTROLS ────────────────────────────────────────────────────────────────
function tcSet(k, v) {
  if (['spend', 'top', 'lfrom', 'lto'].includes(k)) v = Math.max(0, Math.floor(Number(v)) || 0);
  TC[k] = v;
  if (k === 'pfrom' && TC.pto && TC.pto < v) TC.pto = v;
  if (k === 'pto' && TC.pfrom && TC.pfrom > v) TC.pfrom = v;
  if (k === 'lfrom' && TC.lto < v) TC.lto = v;
  if (k === 'lto' && TC.lto < TC.lfrom) TC.lfrom = TC.lto;
  tcSave(); renderTopClients();
}
function tcClear() {
  Object.assign(TC, { branch: 'all', seg: 'all', last: 'any', spend: 0 }); tcQ = '';
  tcSave(); renderTopClients();
}
function tcSetMode(m) { TC.mode = m; try { localStorage.setItem('trs-tc-board', m); } catch (e) {} tcPaintBoard(); }
function tcOpenCell(b, l) {
  TC.branch = b; TC.last = l; tcSave(); renderTopClients();
  const h = document.getElementById('tcListHead'); if (h) h.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function tcSort(k) {
  if (TC.sortk === k) TC.sortdir = -TC.sortdir; else { TC.sortk = k; TC.sortdir = k === 'name' ? 1 : -1; }
  tcSave(); tcPaintTable();
}
// Search's "Top Clients" hits land on a list narrowed to that name.
function tcSearchFor(name) { tcQ = name || ''; const i = document.getElementById('tcSearch'); if (i) i.value = tcQ; if (tcData) tcPaintTable(); }

function tcShell(body) {
  const seg = (key, opts) => `<div class="sc-seg" role="group">${opts.map(([k, l]) =>
    `<button type="button" class="${String(TC[key]) === String(k) ? 'on' : ''}" onclick="tcSet('${key}', ${typeof k === 'number' ? k : `'${k}'`})">${l}</button>`).join('')}</div>`;
  let sub = '';
  if (TC.period === 'year') sub += `<div class="lc-cust"><span>Year</span><select aria-label="Year" onchange="tcSet('year', this.value)">${tcYears().map(y =>
    `<option value="${y}"${tcRange()[0].slice(0, 4) === y ? ' selected' : ''}>${y}</option>`).join('')}</select></div>`;
  if (TC.period === 'month') sub += `<div class="lc-cust"><span>Month</span><select aria-label="Month" onchange="tcSet('month', this.value)">${tcMonths().map(m =>
    `<option value="${m}"${tcRange()[0].slice(0, 7) === m ? ' selected' : ''}>${tcMonthLabel(m)}</option>`).join('')}</select></div>`;
  if (TC.period === 'custom') { const [a, b] = tcRange(); sub += `<div class="lc-cust"><span>Revenue from</span><input type="date" style="width:auto" value="${a}" min="${TC_FIRST}" max="${tcToday()}" aria-label="From date" onchange="tcSet('pfrom', this.value || '')"><span>to</span><input type="date" style="width:auto" value="${b}" min="${TC_FIRST}" max="${tcToday()}" aria-label="To date" onchange="tcSet('pto', this.value || '')"></div>`; }
  if (TC.last === 'custom') sub += `<div class="lc-cust"><span>Last seen between</span><input type="number" min="0" inputmode="numeric" value="${tcAway()[0]}" aria-label="From days" onchange="tcSet('lfrom', this.value)"><span>and</span><input type="number" min="0" inputmode="numeric" value="${tcAway()[1]}" aria-label="To days" onchange="tcSet('lto', this.value)"><span>days ago</span></div>`;
  return `
    <section class="slv-intro">
      <h2>Top Clients</h2>
      <p>Who spends the most, by branch, and when we last saw them. For reference and for knowing who to look after first.</p>
    </section>
    <div class="sc-bar w13-bar lc-bar tc-bar">
      <div class="lc-grp lc-grp-branch"><div class="slv-eyebrow">Branch</div>${seg('branch', [['all', 'All']].concat(lcBranchKeys(tcRange()[1]).map(k => [k, k])))}</div>
      <div class="lc-grp lc-grp-branch"><div class="slv-eyebrow">Period</div>${seg('period', TC_PERIODS)}</div>
      <div class="lc-grp"><div class="slv-eyebrow">Visits</div>${seg('seg', [['all', 'All'], ['3', '3+'], ['2', '2'], ['1', '1']])}</div>
      <div class="lc-grp"><div class="slv-eyebrow">Spend (AED)</div>${seg('spend', [[0, 'Any'], [2000, '2k+'], [5000, '5k+'], [10000, '10k+']])}</div>
      <div class="lc-grp lc-grp-branch"><div class="slv-eyebrow">Last seen</div>${seg('last', TC_LAST)}</div>
    </div>
    ${sub}
    <div id="tcBody">${body}</div>`;
}

// ── DRAW ────────────────────────────────────────────────────────────────────
async function renderTopClients() {
  const el = document.getElementById('topClientsContent');
  if (!el) return;
  if (TC.branch === 'FRT' && tcRange()[1] > LC_FRT_LAST) { TC.branch = 'all'; tcSave(); }   // Fratelli goes with windows past 22 May 2026
  if (Date.now() - tcStamp > 600000) { Object.keys(tcCache).forEach(k => delete tcCache[k]); tcStamp = Date.now(); }
  lcDetailCtx = { branch: () => tcBranchArg(), html: tcDetailHtml };
  const seq = ++tcSeq;
  el.innerHTML = tcShell('<p class="slv-muted">Loading clients…</p>');
  tcBoard = null; tcBoardErr = false;
  const listP = tcCall('top_clients', tcListArgs()), boardP = tcCall('top_clients_board', tcBoardArgs());
  boardP.then(b => { if (seq === tcSeq) { tcBoard = b || []; tcPaintBoard(); } },
    e => { console.error(e); if (seq === tcSeq) { tcBoardErr = true; tcPaintBoard(); } });
  try {
    const d = await listP;
    if (seq !== tcSeq) return;
    if (!d || !Array.isArray(d.rows)) throw new Error('no data');
    tcData = d;
  } catch (e) {
    console.error(e);
    if (seq === tcSeq) document.getElementById('tcBody').innerHTML = '<p class="slv-muted">The client list didn\'t load. Refresh to try again.</p>';
    return;
  }
  tcPaint();
}

function tcPaint() {
  const body = document.getElementById('tcBody');
  if (!body || !tcData) return;
  const rows = tcData.rows.map((r, i) => Object.assign(r, { _rank: i }));
  const rev = rows.reduce((a, r) => a + (Number(r.rev) || 0), 0);
  const total = Number(tcData.total_rev) || 0;
  const share = total ? Math.round(100 * rev / total) : 0;
  const phones = rows.some(r => r.mobile || r.landline);
  const withNo = rows.filter(r => r.mobile || r.landline).length;
  const slip = rows.filter(r => Number(r.days_since) >= 61);
  const topOf = side => {
    const n = {};
    rows.forEach(r => { const w = lcTeam(r)[side][0]; if (w) n[w] = (n[w] || 0) + 1; });
    return Object.entries(n).sort((a, b) => b[1] - a[1])[0];
  };
  const th = topOf('hair'), tb = topOf('beauty');
  const tile = (k, v, n) => `<div class="w13-tile"><div class="slv-eyebrow">${k}</div><div class="w13-val">${v}</div><div class="slv-note">${n}</div></div>`;
  const who = (label, t) => `<div class="w13-tile"><div class="slv-eyebrow">${label}</div><div class="w13-val lc-who">${t ? lcStylist(t[0]) : '–'}</div><div class="slv-note">${t ? 'usual for ' + lcNum(t[1]) + ' of them' : ''}</div></div>`;
  const slipTile = `<button type="button" class="w13-tile tc-slip${slip.length ? ' warn' : ''}" onclick="tcSet('last','slip')"><div class="slv-eyebrow">Not back in 60+ days</div><div class="w13-val">${lcNum(slip.length)}</div><div class="slv-note">${slip.length ? 'AED ' + lcNum(slip.reduce((a, r) => a + (Number(r.rev) || 0), 0)) + ' at stake. Tap to show them.' : 'none in this list'}</div></button>`;
  const matched = Number(tcData.matched) || 0;
  body.innerHTML = `
    <section class="slv-card lc-board" id="tcBoard"></section>
    <section class="slv-card">
      <div class="slv-head" id="tcListHead">
        <div><div class="slv-eyebrow">${TC.branch === 'all' ? 'All branches' : lcEsc(lcBranchName(TC.branch))}</div><h3>Top ${lcNum(rows.length)} client${rows.length === 1 ? '' : 's'} by revenue${TC.last !== 'any' ? ', last seen ' + (TC.last === 'custom' ? `${lcNum(tcAway()[0])} to ${lcNum(tcAway()[1])} days ago` : TC_LASTTXT[TC.last]) : ''}</h3></div>
        <p>${lcEsc(tcPeriodTxt())}</p>
      </div>
      <div class="w13-tiles lc-tiles">
        ${tile('Clients', lcNum(rows.length), matched > rows.length ? `top ${lcNum(rows.length)} of ${lcNum(matched)} who match` : 'who match these filters')}
        ${tile('Combined revenue', 'AED ' + lcNum(rev), `ex VAT, ${share}% of ${TC.branch === 'all' ? 'all' : 'this branch’s'} named-client revenue (walk-ins and unnamed sales are not in it)`)}
        ${phones ? tile('With a phone number', lcNum(withNo), `${rows.length ? Math.round(100 * withNo / rows.length) : 0}% of the list`) : ''}
        ${who('Their stylist', th)}
        ${who('Their beautician', tb)}
        ${slipTile}
      </div>
      <div class="lc-tools" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:16px 0 8px">
        <input type="search" id="tcSearch" placeholder="Search name or stylist" value="${lcEsc(tcQ)}" aria-label="Search name or stylist"
          oninput="tcQ=this.value;tcPaintTable()"
          style="flex:1;min-width:180px;max-width:320px;padding:8px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:inherit;font:inherit">
      </div>
      <div id="tcTable"></div>
    </section>
    <p class="slv-muted">From Phorest's Sales Transactions, which starts in August 2021. Revenue is ex VAT; deposits and vouchers are left out. Visits are days she came in. Last seen is her newest visit at the branch picked (or at any branch on All), whatever the dates above, so the last day or two can lag. Usual stylist is whoever served most of her visits.${phones ? ' Phone numbers come from Phorest\'s New Clients report and are shown to your login only. The report doesn\'t say who opted out of marketing, so check consent in Phorest before anyone messages a client.' : ''}</p>`;
  tcPaintBoard();
  tcPaintTable();
}

// The board: each branch's top N, split by when she was last at that branch. Point at or
// tap a piece to read it, click it to open that list.
function tcPaintBoard() {
  const el = document.getElementById('tcBoard');
  if (!el) return;
  if (tcBoardErr) { el.innerHTML = '<p class="slv-muted">The every-branch board did not load. Refresh to try again.</p>'; return; }
  if (!tcBoard) { el.innerHTML = '<p class="slv-muted">Counting every branch…</p>'; return; }
  const rev = TC.mode === 'rev';
  const B = Object.keys(LC_BRANCH).map(b => {
    const x = tcBoard.find(y => y.branch === b) || {};
    const g = {}; TC_BUCKETS.forEach(u => { g[u.k] = { n: Number(x[u.k + '_n']) || 0, r: Number(x[u.k + '_rev']) || 0 }; });
    return { b, name: LC_BRANCH[b], g, n: Number(x.n) || 0, r: Number(x.rev) || 0, total: Number(x.total_rev) || 0 };
  });
  const T = { n: B.reduce((a, x) => a + x.n, 0), r: B.reduce((a, x) => a + x.r, 0), g: {} };
  TC_BUCKETS.forEach(u => { T.g[u.k] = { n: B.reduce((a, x) => a + x.g[u.k].n, 0), r: B.reduce((a, x) => a + x.g[u.k].r, 0) }; });
  const scale = Math.max(1, ...B.map(x => rev ? x.r : x.n));
  const bar = x => {
    const parts = TC_BUCKETS.map(u => {
      const v = rev ? x.g[u.k].r : x.g[u.k].n;
      if (!v) return '';
      const read = `${x.name} · ${u.short}: ${lcNum(x.g[u.k].n)} of the top ${lcNum(TC.top)} · ${lcShortAed(x.g[u.k].r)}`;
      const on = TC.branch === x.b && TC.last === u.k;
      return `<button type="button" class="lc-seg${on ? ' on' : ''}" style="width:${(100 * v / scale).toFixed(2)}%;background:${u.color}"
        data-read="${lcEsc(read)}" aria-label="${lcEsc(read)}. Open this list" onclick="tcOpenCell('${x.b}','${u.k}')"></button>`;
    }).join('');
    const fig = rev ? `<b>${lcShortAed(x.r)}</b><small>${lcNum(x.n)} clients</small>` : `<b>${lcNum(x.n)}</b><small>${lcShortAed(x.r)}</small>`;
    return `<div class="lc-brow"><div class="lc-bname">${lcEsc(x.name)}</div><div class="lc-btrack">${parts}</div><div class="lc-bfig">${fig}</div></div>`;
  };
  const cell = (n, r, b, k) => {
    const go = b && k ? ` class="go" onclick="tcOpenCell('${b}','${k}')" role="button" tabindex="0"` : '';
    return `<td${go}><b>${lcNum(n)}</b><small>AED ${lcNum(r)}</small></td>`;
  };
  const row = x => `<tr><th>${lcEsc(x.name)}</th>${TC_BUCKETS.map(u => cell(x.g[u.k].n, x.g[u.k].r, x.b, u.k)).join('')}${cell(x.n, x.r)}<td class="pct"><b>${x.total ? Math.round(100 * x.r / x.total) : 0}%</b><small>of named-client revenue</small></td></tr>`;
  el.innerHTML = `<div class="slv-head"><div><div class="slv-eyebrow">Every branch</div><h3>Top ${lcNum(TC.top)} at each salon, by when we last saw them</h3></div>
      <div class="sc-seg lc-mode" role="group" aria-label="Show">
        <button type="button" class="${rev ? 'on' : ''}" onclick="tcSetMode('rev')">Revenue</button>
        <button type="button" class="${rev ? '' : 'on'}" onclick="tcSetMode('n')">Clients</button></div></div>
    <p class="slv-note" style="margin:0 0 12px">${lcEsc(tcPeriodTxt())}. ${T.g.slip.n ? `${lcNum(T.g.slip.n)} of these ${lcNum(T.n)} top clients have not been in for 60+ days (a client who is top at two salons counts at each).` : 'No top client is 60+ days away.'}</p>
    <div class="lc-chart" onmouseover="lcBoardRead(event)" onfocusin="lcBoardRead(event)" onmouseleave="lcBoardRead(null)">${B.map(bar).join('')}</div>
    <p class="lc-read" id="lcRead" aria-live="polite">Point at a bar, or tap it, to read it. Click to open that list.</p>
    <div class="lc-legend">${TC_BUCKETS.map(u => `<span><i style="background:${u.color}"></i>${u.label}</span>`).join('')}</div>
    <details class="lc-nums"${tcNumsOpen ? ' open' : ''} ontoggle="tcNumsOpen=this.open"><summary>Show the numbers</summary>
      <div class="slv-wrap"><table class="slv-table lc-board-t"><thead><tr><th>Branch</th><th>Last 30 days</th><th>31 to 60</th><th>60+</th><th>Top ${lcNum(TC.top)}</th><th>Their share</th></tr></thead>
        <tbody>${B.map(row).join('')}<tr class="tot"><th>All salons</th>${TC_BUCKETS.map(u => cell(T.g[u.k].n, T.g[u.k].r)).join('')}${cell(T.n, T.r)}<td></td></tr></tbody></table></div></details>`;
}

// ── THE LIST ────────────────────────────────────────────────────────────────
const tcAvg = r => (Number(r.visits) || 0) ? (Number(r.rev) || 0) / Number(r.visits) : 0;
const TC_SORTVAL = { name: r => String(r.client_name || '').toLowerCase(), rev: r => Number(r.rev) || 0,
  n: r => Number(r.visits) || 0, avg: tcAvg, away: r => Number(r.days_since) || 0 };
function tcPaintTable() {
  const box = document.getElementById('tcTable');
  if (!box || !tcData) return;
  const q = tcQ.trim().toLowerCase();
  const shown = tcData.rows.filter(r => !q || (r.client_name + ' ' + (r.stylist || '') + ' ' + (r.also_saw || '')).toLowerCase().includes(q))
    .slice().sort((a, b) => {
      const f = TC_SORTVAL[TC.sortk] || TC_SORTVAL.rev, x = f(a), y = f(b);
      return ((x < y ? -1 : x > y ? 1 : 0) * TC.sortdir) || (a._rank - b._rank);
    });
  lcShown = shown;
  const open = tcCanOpen(), phones = tcData.rows.some(r => r.mobile || r.landline);
  const cls = open ? 'lc-row' : 'tc-flat';
  const click = i => open ? ` onclick="lcToggleDetail(event,${i})"` : '';
  const rank = r => `<span class="top3-rank ${_rankCls(r._rank)}">${r._rank + 1}</span>`;
  const bucket = d => d <= 30 ? '' : d <= 60 ? '<span class="tc-pill cool">Cooling</span>' : '<span class="tc-pill slip">Slipping</span>';
  const cols = [
    ['rank', '#', null], ['client', 'Client', 'name'], ['rev', 'Revenue', 'rev'], ['visits', 'Visits', 'n'], ['avg', 'Avg / visit', 'avg'],
    ['last', 'Last seen', 'away'], ['stylist', 'Usual stylist', null], ['beauty', 'Usual beautician', null],
  ].concat(phones ? [['phone', 'Phone', null]] : []);
  const head = ([c, label, k]) => {
    const left = ['rank', 'client', 'stylist', 'beauty', 'phone'].includes(c) ? ' lc-l' : '';
    if (!k) return `<th class="lc-th tc-c-${c}${left}">${label}</th>`;
    const sorted = TC.sortk === k ? `<svg class="lc-sort${TC.sortdir > 0 ? ' up' : ''}" viewBox="0 0 12 12" aria-label="${TC.sortdir > 0 ? 'sorted up' : 'sorted down'}"><path d="M6 2v8M2.5 6.5 6 10l3.5-3.5"/></svg>` : '<svg class="lc-fn" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5l3-3"/></svg>';
    return `<th class="lc-th tc-c-${c}${left}${TC.sortk === k ? ' on' : ''}"><button type="button" class="lc-thb" onclick="tcSort('${k}')">${label}${sorted}</button></th>`;
  };
  const tr = shown.map((r, i) => `<tr class="${cls}"${open ? ' title="Click to see what she comes in for and who looks after her"' : ''}${click(i)}>
      <td class="lc-stc">${rank(r)}</td>
      <td class="lc-stc"><span class="tc-name">${lcEsc(r.client_name)}</span>${open ? '<span class="lc-hint" aria-hidden="true">See her visits ›</span>' : ''}${r.fav ? `<div class="slv-note">${lcEsc(r.fav)}</div>` : ''}</td>
      <td class="tc-rev">${lcNum(r.rev)}</td>
      <td>${lcNum(r.visits)}</td>
      <td>${lcNum(tcAvg(r))}</td>
      <td>${lcEsc(lcDayY(r.last_visit))}<div class="slv-note">${lcNum(r.days_since)} days ago</div>${bucket(Number(r.days_since))}</td>
      <td class="lc-stc">${lcTeamCell(lcTeam(r).hair)}</td>
      <td class="lc-stc">${lcTeamCell(lcTeam(r).beauty)}</td>
      ${phones ? `<td>${lcPhone(r)}</td>` : ''}
    </tr>`).join('');
  const cards = shown.map((r, i) => `<li class="prd-card ${cls}"${click(i)}>
      <div class="prd-body">
        <div class="prd-top"><span class="prd-name">${rank(r)} ${lcEsc(r.client_name)}</span><span class="prd-spend">AED ${lcNum(r.rev)}</span></div>
        <div class="prd-meta">${lcNum(r.visits)} visit${Number(r.visits) === 1 ? '' : 's'} · avg AED ${lcNum(tcAvg(r))} · last ${lcEsc(lcDayY(r.last_visit))} (${lcNum(r.days_since)} days)</div>
        ${r.fav ? `<div class="prd-meta">${lcEsc(r.fav)}</div>` : ''}
        ${['hair', 'beauty'].map(t => { const l = lcTeam(r)[t]; return l.length ? `<div class="prd-meta lc-also-line">${t === 'hair' ? 'Stylist' : 'Beautician'} ${lcStylist(l[0])}${l.length > 1 ? ' · also ' + l.slice(1, 3).map(lcStylist).join(', ') + (l.length > 3 ? ' +' + (l.length - 3) : '') : ''}</div>` : ''; }).join('')}
        ${phones && (r.mobile || r.landline) ? `<div class="prd-meta" style="margin-top:4px">${lcPhone(r)}</div>` : ''}
        ${open ? '<div class="lc-hint-m">Tap for her visits ›</div>' : ''}
      </div>
    </li>`).join('');
  const filtered = TC.branch !== 'all' || TC.seg !== 'all' || TC.last !== 'any' || TC.spend || q;
  const empty = 'No one matches those filters. Try a wider period, or clear a filter.';
  box.innerHTML = `<p class="slv-note lc-fnote">${lcNum(shown.length)} shown. Revenue is in AED. # is her rank by revenue within these filters.${filtered ? ' <button type="button" class="lc-more" onclick="tcClear()">Clear filters</button>' : ''}</p>
    <div class="slv-wrap prd-desk lc-wrap tc-wrap"><table class="slv-table"><thead><tr>${cols.map(head).join('')}</tr></thead>
      <tbody>${tr || `<tr><td colspan="${cols.length}" class="slv-muted">${empty}</td></tr>`}</tbody></table></div>
    <ol class="prd-cards">${cards || `<li class="slv-muted">${empty}</li>`}</ol>`;
}

// ── THE ROW PANEL ───────────────────────────────────────────────────────────
// lcDetailHtml (recent visits, services, products, stylists) plus what only this page
// adds: her spend month by month, the other salons she comes to, and a nudge for anyone
// 60+ days away. Called from lcToggleDetail through lcDetailCtx.
function tcDetailHtml(d, r) {
  const mo = {}; ((d && d.months) || []).forEach(x => { mo[x.m] = Number(x.spend) || 0; });
  const now = new Date(), cols = [];
  for (let i = 11; i >= 0; i--) { const t = new Date(now.getFullYear(), now.getMonth() - i, 1); const m = tcMonthOf(tcIso(t)); cols.push({ m, v: Math.max(0, mo[m] || 0), l: t.toLocaleDateString('en-GB', { month: 'short' }) }); }
  const mx = Math.max(1, ...cols.map(c => c.v));
  const bars = `<div class="slv-eyebrow" style="margin-top:14px">Spend by month, last 12</div>
    <div class="tc-months">${cols.map((c, i) => `<div class="${i === 11 ? 'cur' : ''}" title="${c.l} ${c.m.slice(0, 4)}: AED ${lcNum(c.v)}"><i style="height:${Math.max(2, Math.round(100 * c.v / mx * .46))}px"></i>${c.l[0]}</div>`).join('')}</div>`;
  const others = ((d && d.branches) || []).filter(b => TC.branch === 'all' || b.branch !== TC.branch);
  const otherTxt = others.length && (TC.branch !== 'all' || others.length > 1)
    ? `<p class="slv-note" style="margin-top:6px">${TC.branch === 'all' ? 'Came to ' : 'Also came to '}${others.map(b => `${lcEsc(lcBranchName(b.branch))} (${lcNum(b.visits)} visit${Number(b.visits) === 1 ? '' : 's'})`).join(', ')}</p>` : '';
  const person = lcTeam(r).hair[0] || lcTeam(r).beauty[0];
  const call = Number(r.days_since) >= 61
    ? `<div class="tc-call">Last seen ${lcNum(r.days_since)} days ago. Worth a call from ${person ? lcStylist(person) : 'her usual team'}, one person, this week.</div>` : '';
  return lcDetailHtml(d, { extra: bars + otherTxt + call, allBranches: TC.branch === 'all' && ((d && d.branches) || []).length > 1 });
}
