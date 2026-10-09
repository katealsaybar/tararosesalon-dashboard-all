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
// Clients who already have a booking (booked_on, from migrations/lost_clients_booked.sql,
// Kate 5 Oct 2026) are off the list the same way: the list only reads Sales
// Transactions, so a client booked for next week looked lost. Bookings come from
// Phorest's Staff Appointments report, matched on name, by
// scripts/phorest/parse_future_bookings.py. lcSide says which
// list is showing: '' the lost, 'moved' or 'booked'.
//
// Own controls (branch, who, gone for), so the masthead filters are hidden on this
// page. Borrows the Products page's card, tile and table styles (slv-*, w13-*).
let lcAll = null, lcRows = null, lcPage = 1, lcQuery = '', lcSide = '';
// Two tabs (Kate, 9 Oct 2026): Campaign lists (Emma's five outreach lists, lost-lists.js) and
// Lost clients (the board and list below, as before). The page opens on the lists.
let lcTab = 'lists';
try { lcTab = localStorage.getItem('trs-lost-tab') === 'clients' ? 'clients' : 'lists'; } catch (e) {}
function lcSetTab(t) { lcTab = t; try { localStorage.setItem('trs-lost-tab', t); } catch (e) {} renderLostClients(); }
const lcTabs = () => `<div class="cm-tabs" role="tablist">${[['lists', 'Campaign lists'], ['clients', 'Lost clients']].map(([k, l]) =>
  `<button type="button" role="tab" class="cm-tab${lcTab === k ? ' on' : ''}" aria-selected="${lcTab === k}" onclick="lcSetTab('${k}')">${l}</button>`).join('')}</div>`;
let lcSel = { branch: 'SAA', seg: 'regular', days: 90, cfrom: 0, cto: 60 };
try { Object.assign(lcSel, JSON.parse(localStorage.getItem('trs-lost') || '{}')); } catch (e) {}

const LC_BRANCH = { SAA: 'Saadiyat', KCA: 'Khalifa City A', MC: 'Motor City', AQ: 'Al Quoz' };
// Fratelli (Kate, 9 Oct 2026): a branch chip only for windows that end on or before its last day of sales,
// 22 May 2026. It is not in LC_BRANCH on purpose, so the boards and Lost Clients keep their four branches.
const LC_FRT_LAST = '2026-05-22';
const lcBranchName = b => LC_BRANCH[b] || (b === 'FRT' ? 'Fratelli' : b);
const lcBranchKeys = windowEnd => Object.keys(LC_BRANCH).concat(windowEnd && windowEnd <= LC_FRT_LAST ? ['FRT'] : []);
// "All" (Kate, 7 Oct 2026) asks the server for every branch at once: the RPCs take a null branch.
const lcBranchArg = () => lcSel.branch === 'all' ? null : lcSel.branch;
// min/max visits per segment. Visits = days the client came in at that branch.
const LC_SEG = {
  regular: { label: 'Regulars (3+ visits)', short: '3+', min: 3, max: null },
  twice:   { label: 'Came twice',           short: '2',  min: 2, max: 2 },
  once:    { label: 'One visit only',       short: '1',  min: 1, max: 1 },
};
const LC_DAYS = [30, 60, 90, 180];
// Custom (Kate, 7 Oct 2026): a From and To in days since the last visit, so the list can show
// who is still coming (0 to 60) as well as who is gone. From goes to the RPC as p_days; To is
// applied here, on the rows that come back.
const lcCustom = () => lcSel.days === 'custom';
const lcFrom = () => Math.max(0, Math.floor(Number(lcSel.cfrom)) || 0);
const lcTo = () => Math.max(lcFrom(), Math.floor(Number(lcSel.cto)) || 0);
const lcDaysFetch = () => lcCustom() ? lcFrom() : Number(lcSel.days);
const lcDaysTxt = () => lcCustom() ? `${lcNum(lcFrom())} to ${lcNum(lcTo())} days` : `${lcNum(lcSel.days)}+ days`;
// Pages (Kate, 2 Oct 2026): 10 a page by default, or 20, 50 or 100, with "Page 1 of N".
// Replaces the first-200-then-Show-all list. The choice is kept per browser.
const LC_PER = [10, 20, 50, 100];
let lcPer = 10;
try { const v = Number(localStorage.getItem('trs-lost-per10')); if (LC_PER.includes(v)) lcPer = v; } catch (e) {}

const lcEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lcNum = v => Math.round(Number(v) || 0).toLocaleString('en-GB');
const lcDayY = d => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

function lcSave() { try { localStorage.setItem('trs-lost', JSON.stringify(lcSel)); } catch (e) {} }
// Kate, 3 Oct 2026: the column filters, sort and search stay put when the branch,
// visits or days change (they used to clear), and are kept per browser like the rest.
function lcSet(k, v) { lcSel[k] = v; lcPage = 1; lcSide = ''; lcClosePop(); lcSave(); renderLostClients(); }
function lcSetCustom(k, v) {
  lcSel[k] = Math.max(0, Math.floor(Number(v)) || 0);
  if (lcSel.cto < lcSel.cfrom) { if (k === 'cfrom') lcSel.cto = lcSel.cfrom; else lcSel.cfrom = lcSel.cto; }
  lcPage = 1; lcSide = ''; lcSave(); renderLostClients();
}
function lcShowSide(s) {
  lcSide = lcSide === s ? '' : s; lcPage = 1; lcResetFilters();
  if (lcSide === 'booked') lcSort = { k: 'booked', dir: 1 };   // soonest booking first
  lcPaint();
}

// Speed (Kate, 2 Oct 2026): opened straight on this page, the list waited ~4.5s for
// the Pulse data it never uses, then the board's summary waited for the list. Both
// are asked for at sign-in now (lcPrefetch, from enterDashboard, before loadData)
// and side by side, so the page draws when its own two calls are back.
let lcListP = null, lcListKey = '', lcSumP = null;
function lcFetchList() {
  const seg = LC_SEG[lcSel.seg] || LC_SEG.regular;
  const key = [lcSel.branch, seg.min, seg.max, lcDaysFetch()].join('|');
  if (!lcListP || lcListKey !== key) {
    lcListKey = key;
    lcListP = Promise.resolve(sb.rpc('lost_clients', {
      p_branch: lcBranchArg(), p_min_visits: seg.min, p_max_visits: seg.max, p_days: lcDaysFetch() }));
  }
  return lcListP;
}
function lcFetchSummary() { return lcSumP || (lcSumP = Promise.resolve(sb.rpc('lost_clients_summary'))); }
function lcPrefetch() {
  if (!(typeof TRS_LEVEL !== 'undefined' && TRS_LEVEL >= 2)) return;
  lcFetchList(); lcFetchSummary();
}

async function renderLostClients() {
  const el = document.getElementById('lostClientsContent');
  if (!el) return;
  lcDetailCtx = null;
  if (lcTab === 'lists' && typeof renderLostLists === 'function' && typeof TRS_LEVEL !== 'undefined' && TRS_LEVEL >= 2) {
    el.innerHTML = `<section class="slv-intro"><h2>Client’s Last Visit</h2>
      <p>Coach Emma's outreach lists: who is lost, who is ready on WhatsApp and who is text only.</p></section>${lcTabs()}<div id="llHost"></div>`;
    renderLostLists(document.getElementById('llHost'));
    return;
  }
  el.innerHTML = lcShell('<p class="slv-muted">Loading clients…</p>');
  const listP = lcFetchList(); lcListP = null;   // used once; a later pick asks again
  lcFetchSummary();
  try {
    const { data, error } = await listP;
    if (error || !Array.isArray(data)) throw error || new Error('no data');
    lcAll = lcCustom() ? data.filter(r => Number(r.days_since) <= lcTo()) : data;
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
      <h2>Client’s Last Visit</h2>
      <p>Clients who used to come in and haven't been back, by branch, highest spend first. For reference and outreach planning.</p>
    </section>
    ${lcTabs()}
    <div class="sc-bar w13-bar lc-bar">
      <div class="lc-grp lc-grp-branch"><div class="slv-eyebrow">Branch</div>${seg('branch', [['all', 'All']].concat(Object.keys(LC_BRANCH).map(k => [k, k])))}</div>
      <div class="lc-grp"><div class="slv-eyebrow">Visits</div>${seg('seg', Object.entries(LC_SEG).map(([k, s]) => [k, s.short]))}</div>
      <div class="lc-grp"><div class="slv-eyebrow">Days away</div>${seg('days', LC_DAYS.map(d => [d, `${d}+`]).concat([['custom', 'Custom']]))}</div>
    </div>
    ${lcCustom() ? `<div class="lc-cust"><span>Last seen between</span><input type="number" min="0" inputmode="numeric" value="${lcFrom()}" aria-label="From days" onchange="lcSetCustom('cfrom', this.value)"><span>and</span><input type="number" min="0" inputmode="numeric" value="${lcTo()}" aria-label="To days" onchange="lcSetCustom('cto', this.value)"><span>days ago</span></div>` : ''}
    <div id="lcBody">${body}</div>`;
}

function lcPaint() {
  const el = document.getElementById('lostClientsContent');
  if (!el || !lcAll) return;
  const seg = LC_SEG[lcSel.seg] || LC_SEG.regular;
  const moved = lcAll.filter(r => r.now_at), booked = lcAll.filter(r => !r.now_at && r.booked_on);
  const lost = lcAll.filter(r => !r.now_at && !r.booked_on);
  if (!{ moved, booked }[lcSide]?.length) lcSide = '';
  lcRows = lcSide === 'moved' ? moved : lcSide === 'booked' ? booked : lost;
  // One line per group kept off the list, each with its own switch.
  const sideLine = (s, n, off, on) => n ? `<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:14px 0 0">
        <span class="slv-muted" style="margin:0">${lcSide === s ? on : off}</span>
        <button type="button" class="tglr lc-btn" onclick="lcShowSide('${s}')">${lcSide === s ? 'Back to the lost list' : 'Show them'}</button>
      </div>` : '';
  const phones = lcAll.some(r => r.mobile || r.landline);
  const spend = lost.reduce((a, r) => a + (Number(r.spend) || 0), 0);
  const withNo = lost.filter(r => r.mobile || r.landline).length;
  // Who most of them saw, hair and beauty apart (Kate, 2 Oct 2026), from the same
  // split as the table's Usual stylist and Usual beautician columns (lcTeam).
  const topOf = side => {
    const n = {};
    lost.forEach(r => { const who = lcTeam(r)[side][0]; if (who) n[who] = (n[who] || 0) + 1; });
    return Object.entries(n).sort((a, b) => b[1] - a[1])[0];
  };
  const topSt = topOf('hair'), topBt = topOf('beauty');
  const topTile = (label, t) => `<div class="w13-tile"><div class="slv-eyebrow">${label}</div><div class="w13-val lc-who">${t ? lcStylist(t[0]) : '–'}</div><div class="slv-note">${t ? 'usual for ' + lcNum(t[1]) + ' of them' : ''}</div></div>`;

  document.getElementById('lcBody').innerHTML = `
    <section class="slv-card lc-board" id="lcBoard"></section>
    <section class="slv-card">
      <div class="slv-head">
        <div><div class="slv-eyebrow">${lcSel.branch === 'all' ? 'All branches' : lcEsc(LC_BRANCH[lcSel.branch])}</div><h3>${lcEsc(seg.label)}, ${lcCustom() ? 'last seen ' + lcDaysTxt() + ' ago' : 'not back in ' + lcDaysTxt()}</h3></div>
        <p>Visits since 1 Jan 2025</p>
      </div>
      <div class="w13-tiles lc-tiles">
        <div class="w13-tile"><div class="slv-eyebrow">Clients</div><div class="w13-val">${lcNum(lost.length)}</div><div class="slv-note">haven't been back</div></div>
        <div class="w13-tile"><div class="slv-eyebrow">What they spent</div><div class="w13-val">AED ${lcNum(spend)}</div><div class="slv-note">since Jan 2025, ex VAT</div></div>
        ${phones ? `<div class="w13-tile"><div class="slv-eyebrow">With a phone number</div><div class="w13-val">${lcNum(withNo)}</div><div class="slv-note">${lost.length ? Math.round(100 * withNo / lost.length) : 0}% of the list</div></div>` : ''}
        ${topTile('Their stylist', topSt)}
        ${topTile('Their beautician', topBt)}
      </div>
      ${sideLine('moved', moved.length,
        `${lcNum(moved.length)} more came back at another branch in the last ${lcNum(lcCustom() ? lcFrom() : lcSel.days)} days, so they aren't counted as lost.`,
        `Showing the ${lcNum(moved.length)} who came back at another branch instead. They aren't counted above.`)}
      ${sideLine('booked', booked.length,
        `${lcNum(booked.length)} more already have a booking, so they aren't counted as lost.`,
        `Showing the ${lcNum(booked.length)} who already have a booking, soonest first. They aren't counted above.`)}
      <div class="lc-tools" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:16px 0 8px">
        <input type="search" id="lcSearch" placeholder="Search name or stylist" value="${lcEsc(lcQuery)}"
          oninput="lcQuery=this.value;lcPage=1;lcPaintTable()"
          style="flex:1;min-width:180px;max-width:320px;padding:8px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:inherit;font:inherit">
        <button type="button" class="tglr lc-btn" onclick="lcSaveFile('xlsx')" title="Download as Excel">XLSX</button>
        <button type="button" class="tglr lc-btn" onclick="lcSaveFile('csv')" title="Download as CSV">CSV</button>
        <span id="lcCopied" class="slv-note" style="display:inline"></span>
      </div>
      <div id="lcTable"></div>
    </section>
    <p class="slv-muted">From Phorest's Sales Transactions, which starts in January 2025: a client who was a regular in 2024 and stopped before then isn't on this list. Visits are days she came in at this branch (on All salons, at any branch); a deposit, a balance payment or a voucher bought on its own is not a visit; a client seen at another branch in the same window is counted on its own line, not as lost, and so is a client with a booking from today on in Phorest's Staff Appointments report (matched on her name, from the last time it was pulled). Usual stylist is whoever served most of her visits. "Last visit" is the newest day uploaded, so the last day or two can lag.${phones ? ' Phone numbers come from Phorest\'s New Clients report and are shown to your login only. The report doesn\'t say who opted out of marketing, so check consent in Phorest before anyone messages a client.' : ''}</p>`;
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
try {
  const s = JSON.parse(localStorage.getItem('trs-lost-filters') || 'null');
  if (s && s.f && typeof s.f === 'object') lcF = s.f;
  if (s && s.sort && typeof s.sort.k === 'string') lcSort = { k: s.sort.k, dir: s.sort.dir > 0 ? 1 : -1 };
} catch (e) {}
function lcSaveFilters() { try { localStorage.setItem('trs-lost-filters', JSON.stringify({ f: lcF, sort: lcSort })); } catch (e) {} }
const lcAvg = r => (Number(r.visits) || 0) ? Math.round((Number(r.spend) || 0) / Number(r.visits)) : 0;
const LC_COLS = [
  { k: 'client',  label: 'Client',              type: 'text', get: r => r.client_name || '' },
  { k: 'visits',  label: 'Visits',              type: 'num',  get: r => Number(r.visits) || 0 },
  { k: 'last',    label: 'Last visit',          type: 'date', get: r => r.last_visit || '' },
  // On screen the headings stay one line (Kate, 2 Oct 2026: "(AED)" stacked them three
  // deep); the files keep the unit in the heading (xl).
  { k: 'spend',   label: 'Total spend',   xl: 'Total spend (AED)',   type: 'num',  get: r => Math.round(Number(r.spend) || 0) },
  { k: 'avg',     label: 'Avg per visit', xl: 'Avg per visit (AED)', type: 'num',  get: lcAvg },
  // Hair and beauty apart (Kate, 2 Oct 2026): her usual stylist and her usual beautician,
  // each with the others she saw from that team in small type underneath (lcTeam).
  { k: 'stylist', label: 'Usual stylist',    type: 'pick', get: r => lcTeam(r).hair[0] || '' },
  { k: 'beauty',  label: 'Usual beautician', type: 'pick', get: r => lcTeam(r).beauty[0] || '' },
  { k: 'now',     label: 'Now at',              type: 'pick', get: r => r.now_at || '', side: 'moved' },
  { k: 'booked',  label: 'Booked',              type: 'date', get: r => r.booked_on || '', side: 'booked' },
  { k: 'phone',   label: 'Phone',               type: 'has',  get: r => r.mobile || r.landline || '', phones: true },
];
const lcHasPhones = () => (lcAll || []).some(r => r.mobile || r.landline);
const lcCols = () => LC_COLS.filter(c => (!c.side || c.side === lcSide) && (!c.phones || lcHasPhones()));
// "12 Oct 2026 at KCA" (the branch only when it isn't this list's) and who with.
const lcBookedAt = r => lcDayY(r.booked_on) + (r.booked_at && (lcSel.branch === 'all' || r.booked_at !== lcSel.branch) ? ' at ' + r.booked_at : '');
const lcColOf = k => LC_COLS.find(c => c.k === k);
function lcOn(k) {
  const f = lcF[k]; if (!f) return false;
  return !!(f.set || f.has || (f.rules || []).some(lcRuleOn));
}
// As many rules in one column as you like (Kate, 2 Oct 2026), joined by "or": spend
// under 500 or 2,000 to 3,000 or over 5,000, several date ranges, several names.
// f.rules is a list of { q } / { min, max } / { from, to }; empty ones are ignored.
function lcRuleOn(r) {
  return !!(r && (r.q || r.min != null || r.max != null || r.from || r.to));
}
function lcRuleOk(c, r, v) {
  if (c.type === 'text') return String(v).toLowerCase().includes(String(r.q || '').toLowerCase());
  if (c.type === 'num') return !((r.min != null && v < r.min) || (r.max != null && v > r.max));
  if (c.type === 'date') return !((r.from && v < r.from) || (r.to && v > r.to));
  return true;
}
function lcPass(r, skip) {
  const q = lcQuery.trim().toLowerCase();
  if (q && !`${r.client_name} ${r.stylist || ''} ${r.also_saw || ''}`.toLowerCase().includes(q)) return false;
  for (const c of LC_COLS) {
    if (c.k === skip || !lcOn(c.k)) continue;
    const f = lcF[c.k], v = c.get(r);
    if (c.type === 'text' || c.type === 'num' || c.type === 'date') {
      const on = (f.rules || []).filter(lcRuleOn);
      if (on.length && !on.some(r => lcRuleOk(c, r, v))) return false;
    }
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
  const ruled = c.type === 'text' || c.type === 'num' || c.type === 'date';
  if (ruled) body = `<div class="lc-rules"></div><button type="button" class="lc-or-add">+ Or another rule</button>`;
  if (c.type === 'has') body = ['', 'yes', 'no'].map((v, i) => `<label class="lc-chk"><input type="radio" name="lcHas" value="${v}"${(f.has || '') === v ? ' checked' : ''}> ${['Everyone', 'Has a number', 'No number'][i]}</label>`).join('');
  if (c.type === 'pick') {
    const cnt = {};
    (lcRows || []).filter(r => lcPass(r, k)).forEach(r => { const v = c.get(r); cnt[v] = (cnt[v] || 0) + 1; });
    const vals = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a] || a.localeCompare(b));
    body = `<input type="search" class="lc-in lc-pick-q" placeholder="Search…">
      <div class="lc-pick-acts"><button type="button" data-all="1">Select all</button><span aria-hidden="true">·</span><button type="button" data-all="0">None</button></div>
      <div class="lc-pick">${vals.map(v => `<label class="lc-chk" data-v="${lcEsc(v.toLowerCase())}"><input type="checkbox" value="${lcEsc(v)}"${!f.set || f.set.includes(v) ? ' checked' : ''}> <span>${lcEsc(v || '(blank)')}</span><em>${cnt[v]}</em></label>`).join('')}</div>`;
  }
  pop.innerHTML = `<div class="lc-pop-sort"><button type="button" data-dir="1">${words[0]}</button><button type="button" data-dir="-1">${words[1]}</button></div>
    <div class="slv-eyebrow" style="margin:10px 0 6px">Filter</div>${body}
    <div class="lc-pop-foot"><button type="button" data-clear="1">Clear filter</button><button type="button" data-done="1" class="on">Done</button></div>`;
  document.body.appendChild(pop);
  const th = ev.currentTarget.getBoundingClientRect();
  pop.style.top = Math.max(8, Math.min(th.bottom + 4, innerHeight - pop.offsetHeight - 8)) + 'px';
  pop.style.left = Math.max(8, Math.min(th.left, innerWidth - pop.offsetWidth - 8)) + 'px';
  const apply = () => { lcPage = 1; lcPaintTable(); };
  const set = (fk, v) => { lcF[k] = Object.assign({}, lcF[k], { [fk]: v }); apply(); };
  pop.addEventListener('click', e => e.stopPropagation());
  pop.querySelectorAll('[data-dir]').forEach(b => b.onclick = () => { lcSort = { k, dir: +b.dataset.dir }; apply(); lcClosePop(); });
  pop.querySelector('[data-clear]').onclick = () => { delete lcF[k]; apply(); lcClosePop(); };
  pop.querySelector('[data-done]').onclick = lcClosePop;
  // The rules list: one block per rule, "or" between them, × on all but the first.
  const rules = () => (lcF[k] && lcF[k].rules && lcF[k].rules.length ? lcF[k].rules : [{}]);
  const one = (r, i) => {
    const x = i ? `<div class="lc-or-word">or<button type="button" class="lc-or-x" data-x="${i}" aria-label="Remove this rule">×</button></div>` : '';
    if (c.type === 'text') return `<div class="lc-rule">${x}<input type="search" class="lc-in" data-i="${i}" data-f="q" placeholder="Contains…" value="${lcEsc(r.q || '')}"></div>`;
    if (c.type === 'num') return `<div class="lc-rule">${x}<div class="lc-two"><input type="number" inputmode="decimal" class="lc-in" data-i="${i}" data-f="min" placeholder="From" value="${r.min ?? ''}"><input type="number" inputmode="decimal" class="lc-in" data-i="${i}" data-f="max" placeholder="To" value="${r.max ?? ''}"></div></div>`;
    return `<div class="lc-rule">${x}<div class="lc-dates"><label>From<input type="date" class="lc-in" data-i="${i}" data-f="from" value="${r.from || ''}"></label><label>To<input type="date" class="lc-in" data-i="${i}" data-f="to" value="${r.to || ''}"></label></div></div>`;
  };
  const setRules = list => { lcF[k] = Object.assign({}, lcF[k], { rules: list }); apply(); };
  const drawRules = () => {
    const box = pop.querySelector('.lc-rules'); if (!box) return;
    box.innerHTML = rules().map(one).join('');
    box.querySelectorAll('.lc-in[data-f]').forEach(i => i.oninput = () => {
      const raw = i.value.trim(), list = rules().map(r => Object.assign({}, r));
      list[+i.dataset.i][i.dataset.f] = i.type === 'number' ? (raw === '' ? null : Number(raw)) : (raw || null);
      setRules(list);
    });
    box.querySelectorAll('[data-x]').forEach(b => b.onclick = () => { const list = rules().slice(); list.splice(+b.dataset.x, 1); setRules(list); drawRules(); });
  };
  drawRules();
  const orAdd = pop.querySelector('.lc-or-add');
  if (orAdd) orAdd.onclick = () => {
    lcF[k] = Object.assign({}, lcF[k], { rules: rules().concat([{}]) });
    drawRules();
    const ins = pop.querySelectorAll('.lc-rules .lc-in'); if (ins.length) ins[ins.length - (c.type === 'text' ? 1 : 2)].focus();
  };
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
let lcShown = [], lcDetailCtx = null;
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
  // Top Clients (top-clients.js) borrows this panel: its ctx names the branch (null = every
  // branch) and draws the panel with its own extras.
  const br = lcDetailCtx ? lcDetailCtx.branch() : lcBranchArg();
  const key = (br || 'all') + '|' + r.client_name;
  try {
    if (!lcDetailCache[key]) {
      const { data, error } = await sb.rpc('lost_client_detail', { p_branch: br, p_client: r.client_name });
      if (error) throw error;
      lcDetailCache[key] = data;
    }
    inner.innerHTML = lcDetailCtx ? lcDetailCtx.html(lcDetailCache[key], r) : lcDetailHtml(lcDetailCache[key]);
  } catch (e) {
    console.error(e);
    inner.innerHTML = '<p class="slv-muted" style="margin:0">Her visits did not load. Tap again to retry.</p>';
    host.classList.remove('lc-open');
    setTimeout(() => box.remove(), 2500);
  }
}
// Kate, 7 Oct 2026: the panel used to cut services at 12, which hid her latest visit. Now
// "Recent visits" (day by day) sits on top, and the services list shows everything:
// the first few, the rest under a "Show all" fold.
function lcFold(items, show, start, li, noun) {
  const rows = (arr, from) => `<ol class="lc-svc" start="${from}">${arr.map(li).join('')}</ol>`;
  if (items.length <= show) return rows(items, start);
  return rows(items.slice(0, show), start)
    + `<details class="lc-more"><summary>Show all ${lcNum(items.length)} ${noun}</summary>${rows(items.slice(show), start + show)}</details>`;
}
function lcDetailHtml(d, o) {
  o = o || {};   // extra: more HTML for the right-hand column; allBranches: say which salon each visit was at
  const svc = (d && d.services) || [], prod = (d && d.products) || [], st = (d && d.stylists) || [], vis = (d && d.visits) || [];
  const svcHtml = svc.length ? lcFold(svc, 12, 1, s => `<li><b>${lcEsc(s.item)}</b>
      <span>${lcNum(s.visits)} visit${s.visits === 1 ? '' : 's'} · last ${lcEsc(lcDayY(s.last_date))} · AED ${lcNum(s.spend)}${s.last_by ? ' · ' + lcStylist(s.last_by) : ''}</span></li>`, 'services')
    : '<p class="slv-muted" style="margin:0">No services on record.</p>';
  const visHtml = vis.length ? lcFold(vis, 5, 1, v => `<li><b>${lcEsc(lcDayY(v.date))}</b>${o.allBranches && v.at ? ` <span class="tc-at">${lcEsc(v.at)}</span>` : ''}
      <span>${(v.services || []).map(lcEsc).join(', ') || 'Retail only'}${v.products ? ' · ' + v.products + ' product' + (v.products === 1 ? '' : 's') : ''} · AED ${lcNum(v.total)}${(v.by_who || []).length ? ' · ' + v.by_who.map(lcStylist).join(', ') : ''}</span></li>`, 'visits') : '';
  return `<div class="lc-det-grid">
      <div>${visHtml ? `<div class="slv-eyebrow">Recent visits</div>${visHtml}<div class="slv-eyebrow" style="margin-top:16px">What she came in for</div>` : '<div class="slv-eyebrow">What she came in for</div>'}${svcHtml}</div>
      <div>
        ${prod.length ? `<div class="slv-eyebrow">Took home</div><ul class="lc-prod">${prod.map(p => `<li>${lcEsc(p.item)} <span>AED ${lcNum(p.spend)}${p.times > 1 ? ' · ' + p.times + 'x' : ''}</span></li>`).join('')}</ul>` : ''}
        ${st.length ? `<div class="slv-eyebrow" style="margin-top:${prod.length ? 14 : 0}px">Looked after by</div><div class="lc-sts">${st.map(s => `<span>${lcStylist(s.employee_name)} <em>${lcNum(s.visits)}</em></span>`).join('')}</div>` : ''}
        ${d && d.first_visit ? `<p class="slv-note" style="margin-top:12px">First visit ${o.allBranches ? 'since Jan 2025' : 'here'} ${lcEsc(lcDayY(d.first_visit))}</p>` : ''}
        ${o.extra || ''}
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
    const { data, error } = await lcFetchSummary();
    if (error) { lcSumP = null; throw error; }
    lcSum = data || [];
  } catch (e) { console.error(e); lcSumErr = true; }
  lcPaintBoard();
}
// The Custom board's own ask, kept for the From / To it was made for.
let lcCust = { key: '', data: null, err: false };
function lcLoadCustom() {
  const key = lcFrom() + '-' + lcTo();
  if (lcCust.key === key) return;
  lcCust = { key, data: null, err: false };
  Promise.resolve(sb.rpc('lost_clients_summary', { p_days: [lcFrom()], p_to: lcTo() })).then(({ data, error }) => {
    if (lcCust.key !== key) return;
    if (error) throw error;
    lcCust.data = data || []; lcPaintBoard();
  }).catch(e => { console.error(e); if (lcCust.key === key) { lcCust.err = true; lcPaintBoard(); } });
}
function lcOpenCell(b, s) { lcSel.seg = s; lcSet('branch', b); }
// The board as a picture (Kate, 2 Oct 2026: "I was expecting more of interactive visual
// dashboards"). A headline row, then one bar per branch split into who has not come
// back (regulars, twice, once), who moved to another branch and who is still coming,
// in clients or in what they had spent. Point at or tap a piece to read it, click it to
// open that list. The table it replaced is folded underneath ("Show the numbers").
let lcBoardMode = 'clients', lcBoardOpenNums = false;
try { lcBoardMode = localStorage.getItem('trs-lost-board') === 'spend' ? 'spend' : 'clients'; } catch (e) {}
const LC_SEGS = [
  { s: 'regular', label: 'Regulars (3+)', short: 'Regulars', color: 'var(--accent-coral)' },
  { s: 'twice',   label: 'Came twice',    short: 'Twice',    color: 'var(--accent-butter)' },
  { s: 'once',    label: 'One visit',     short: 'Once',     color: 'var(--accent-lavender)' },
];
function lcBoardSetMode(m) {
  lcBoardMode = m;
  try { localStorage.setItem('trs-lost-board', m); } catch (e) {}
  lcPaintBoard();
}
const lcShortAed = v => v >= 1e6 ? 'AED ' + (v / 1e6).toFixed(v >= 1e7 ? 1 : 2) + 'M' : v >= 1e3 ? 'AED ' + Math.round(v / 1e3) + 'k' : 'AED ' + lcNum(v);
function lcPaintBoard() {
  const el = document.getElementById('lcBoard');
  if (!el) return;
  if (lcSumErr) { el.innerHTML = '<p class="slv-muted">The board did not load. Refresh to try again.</p>'; return; }
  // Custom (Kate, 7 Oct 2026): the board follows the range too (clients last seen between From
  // and To days ago), from lost_clients_summary(p_days => [From], p_to => To). Only the clients
  // in the range are drawn: everyone else is outside it, so there is no "still coming" remainder.
  const cust = lcCustom();
  if (cust) {
    lcLoadCustom();
    if (lcCust.err) { el.innerHTML = '<p class="slv-muted">The board did not load. Refresh to try again.</p>'; return; }
    if (!lcCust.data) { el.innerHTML = '<p class="slv-muted">Counting every branch…</p>'; return; }
  } else if (!lcSum) { el.innerHTML = '<p class="slv-muted">Counting every branch…</p>'; return; }
  const src = cust ? lcCust.data : lcSum;
  const days = cust ? lcFrom() : Number(lcSel.days), spend = lcBoardMode === 'spend';
  const at = (b, s) => src.find(x => x.branch === b && x.seg === s && Number(x.days) === days) || { lost: 0, lost_spend: 0, active: 0, moved: 0 };
  const B = Object.keys(LC_BRANCH).map(b => {
    const segs = LC_SEGS.map(g => Object.assign({ b }, g, at(b, g.s)));
    const lost = segs.reduce((a, x) => a + x.lost, 0), lostSpend = segs.reduce((a, x) => a + Number(x.lost_spend), 0);
    const moved = segs.reduce((a, x) => a + x.moved, 0), active = segs.reduce((a, x) => a + x.active, 0);
    const booked = segs.reduce((a, x) => a + (x.booked || 0), 0);   // already inside active
    return { b, name: LC_BRANCH[b], segs, lost, lostSpend, moved, active, booked, all: lost + moved + active };
  });
  const tot = k => B.reduce((a, x) => a + x[k], 0);
  const allLost = tot('lost'), allSpend = tot('lostSpend'), allClients = tot('all');
  const worst = [...B].sort((a, b) => (b.lost / (b.all || 1)) - (a.lost / (a.all || 1)))[0];
  const byGroup = LC_SEGS.map(g => ({ g, n: B.reduce((a, x) => a + x.segs.find(y => y.s === g.s).lost, 0) }));
  const topGroup = [...byGroup].sort((a, b) => b.n - a.n)[0];
  // Clients: each bar is the branch's whole client book, so the lost share shows as
  // length. Spend: only what the lost clients had spent (the summary has no spend for
  // the rest), each bar against the biggest.
  const scale = spend || cust ? Math.max(...B.map(x => spend ? x.lostSpend : x.lost), 1) : Math.max(...B.map(x => x.all), 1);
  const bar = x => {
    const parts = LC_SEGS.map(g => {
      const seg = x.segs.find(y => y.s === g.s), v = spend ? Number(seg.lost_spend) : seg.lost;
      const read = `${x.name} · ${g.label}: ${lcNum(seg.lost)} ${cust ? 'in this range' : 'not back'} · ${lcShortAed(Number(seg.lost_spend))} · ${x.all ? Math.round(100 * seg.lost / x.all) : 0}% of their clients`;
      const on = x.b === lcSel.branch && g.s === lcSel.seg;
      return v > 0 ? `<button type="button" class="lc-seg${on ? ' on' : ''}" style="width:${(100 * v / scale).toFixed(2)}%;background:${g.color}"
        data-read="${lcEsc(read)}" aria-label="${lcEsc(read)}. Open this list" onclick="lcOpenCell('${x.b}','${g.s}')"></button>` : '';
    }).join('');
    const rest = spend || cust ? '' : [
      x.moved ? `<span class="lc-seg rest moved" style="width:${(100 * x.moved / scale).toFixed(2)}%" data-read="${lcEsc(`${x.name} · Moved branch: ${lcNum(x.moved)} now come to another salon`)}"></span>` : '',
      x.active ? `<span class="lc-seg rest" style="width:${(100 * x.active / scale).toFixed(2)}%" data-read="${lcEsc(`${x.name} · Still coming: ${lcNum(x.active)} seen in the last ${days} days${x.booked ? ` or booked in (${lcNum(x.booked)})` : ''}`)}"></span>` : '',
    ].join('');
    const fig = spend ? `<b>${lcShortAed(x.lostSpend)}</b><small>${lcNum(x.lost)} clients</small>`
                      : `<b>${lcNum(x.lost)}</b><small>${x.all ? Math.round(100 * x.lost / x.all) : 0}% of ${lcNum(x.all)}</small>`;
    return `<div class="lc-brow"><div class="lc-bname">${lcEsc(x.name)}</div><div class="lc-btrack">${parts}${rest}</div><div class="lc-bfig">${fig}</div></div>`;
  };
  const tile = (k, v, n) => `<div class="w13-tile"><div class="slv-eyebrow">${k}</div><div class="w13-val">${v}</div><div class="slv-note">${n}</div></div>`;
  el.innerHTML = `<div class="slv-head"><div><div class="slv-eyebrow">Every branch</div><h3>${cust ? 'Last seen ' + lcDaysTxt() + ' ago' : 'Not back in ' + days + '+ days'}</h3></div>
      <div class="sc-seg lc-mode" role="group" aria-label="Show">
        <button type="button" class="${spend ? '' : 'on'}" onclick="lcBoardSetMode('clients')">Clients</button>
        <button type="button" class="${spend ? 'on' : ''}" onclick="lcBoardSetMode('spend')">Spend</button></div></div>
    <div class="w13-tiles lc-btiles">
      ${tile(cust ? 'In this range' : 'Not back', lcNum(allLost), `${allClients ? Math.round(100 * allLost / allClients) : 0}% of ${lcNum(allClients)} clients`)}
      ${tile('They had spent', lcShortAed(allSpend), 'since Jan 2025, ex VAT')}
      ${tile(cust ? 'Most in range' : 'Most lost', lcEsc(worst.name), `${worst.all ? Math.round(100 * worst.lost / worst.all) : 0}% of its clients`)}
      ${tile('Biggest group', lcEsc(topGroup.g.label), `${allLost ? Math.round(100 * topGroup.n / allLost) : 0}% ${cust ? 'of this range' : 'of those not back'}`)}
    </div>
    <div class="lc-chart" onmouseover="lcBoardRead(event)" onfocusin="lcBoardRead(event)" onmouseleave="lcBoardRead(null)">
      ${B.map(bar).join('')}
    </div>
    <p class="lc-read" id="lcRead" aria-live="polite">Point at a bar, or tap it, to read it. Click to open that list.</p>
    <div class="lc-legend">${LC_SEGS.map(g => `<span><i style="background:${g.color}"></i>${g.label}</span>`).join('')}${spend || cust ? '' : '<span><i class="moved"></i>Moved branch</span><span><i class="rest"></i>Still coming</span>'}</div>
    <details class="lc-nums"${lcBoardOpenNums ? ' open' : ''} ontoggle="lcBoardOpenNums=this.open"><summary>Show the numbers</summary>${lcBoardTable(B, days)}</details>`;
}
function lcBoardRead(ev) {
  const out = document.getElementById('lcRead');
  if (!out) return;
  const t = ev && ev.target && ev.target.closest && ev.target.closest('[data-read]');
  out.textContent = t ? t.dataset.read : 'Point at a bar, or tap it, to read it. Click to open that list.';
}
// The table, folded under the chart: the same figures in rows, every cell but the
// totals opening its list.
function lcBoardTable(B, days) {
  const segs = LC_SEGS.map(g => g.s);
  const cell = (b, s, lost, sp) => {
    const on = b === lcSel.branch && s === lcSel.seg;
    const go = b && s ? ` onclick="lcOpenCell('${b}','${s}')" role="button" tabindex="0"` : '';
    return `<td class="${on ? 'on' : ''}${go ? ' go' : ''}"${go}><b>${lcNum(lost)}</b><small>AED ${lcNum(sp)}</small></td>`;
  };
  const row = x => `<tr><th>${lcEsc(x.name)}</th>${x.segs.map(s => cell(x.b, s.s, s.lost, s.lost_spend)).join('')}${cell(null, null, x.lost, x.lostSpend)}
    <td class="pct"><b>${x.all ? Math.round(100 * x.lost / x.all) : 0}%</b><small>of ${lcNum(x.all)}</small></td></tr>`;
  const all = { name: 'All salons', b: null, segs: segs.map(s => ({ s: null, lost: B.reduce((a, x) => a + x.segs.find(y => y.s === s).lost, 0), lost_spend: B.reduce((a, x) => a + Number(x.segs.find(y => y.s === s).lost_spend), 0) })),
    lost: B.reduce((a, x) => a + x.lost, 0), lostSpend: B.reduce((a, x) => a + x.lostSpend, 0), all: B.reduce((a, x) => a + x.all, 0) };
  return `<div class="slv-wrap"><table class="slv-table lc-board-t">
      <thead><tr><th>Branch</th><th>Regulars (3+)</th><th>Came twice</th><th>One visit</th><th>All lost</th><th>Of their clients</th></tr></thead>
      <tbody>${B.map(row).join('')}${row(all).replace('<tr>', '<tr class="tot">')}</tbody></table></div>
    <p class="slv-note" style="margin-top:8px">Clients since Jan 2025, total spend ex VAT. "Of their clients" is everyone who came to that branch since then. A client who has since been in at another branch, or who already has a booking, is not counted as lost.</p>`;
}

// The table on its own, so typing in the search box or changing a column filter
// redraws only this and keeps the cursor where it is.
function lcPaintTable() {
  lcSaveFilters();   // every filter, sort or clear change ends here
  const box = document.getElementById('lcTable');
  if (!box || !lcRows) return;
  const rows = lcFiltered(), cols = lcCols();
  const pages = Math.max(1, Math.ceil(rows.length / lcPer));
  lcPage = Math.min(Math.max(1, lcPage), pages);
  const shown = rows.slice((lcPage - 1) * lcPer, lcPage * lcPer);
  lcShown = shown;
  // "2 numbers?" (Kate, 2 Oct 2026: it read "check", which said nothing): Phorest has two
  // different numbers under this name, two people who share it or one client entered
  // twice, so look before calling.
  const check = r => r.match === 'check' ? ' <span class="lc-2nums" tabindex="0" title="Phorest has two different phone numbers under this name: two people who share it, or one client entered twice. Check in Phorest before you call.">2 numbers?</span>' : '';
  const td = (c, r) => {
    if (c.k === 'client') return `<td>${lcEsc(r.client_name)}${check(r)}<span class="lc-hint" aria-hidden="true">See her visits ›</span></td>`;
    if (c.k === 'visits') return `<td>${lcNum(r.visits)}</td>`;
    if (c.k === 'last') return `<td>${lcEsc(lcDayY(r.last_visit))}<div class="slv-note">${lcNum(r.days_since)} days ago</div></td>`;
    if (c.k === 'spend') return `<td>${lcNum(r.spend)}</td>`;
    if (c.k === 'avg') return `<td>${lcNum(lcAvg(r))}</td>`;
    if (c.k === 'stylist') return `<td class="lc-stc">${lcTeamCell(lcTeam(r).hair)}</td>`;
    if (c.k === 'beauty') return `<td class="lc-stc">${lcTeamCell(lcTeam(r).beauty)}</td>`;
    if (c.k === 'now') return `<td>${r.now_at ? `${lcEsc(r.now_at)}<div class="slv-note">${lcEsc(lcDayY(r.now_last))}</div>` : ''}</td>`;
    if (c.k === 'booked') return `<td>${r.booked_on ? `${lcEsc(lcBookedAt(r))}<div class="slv-note">${lcEsc(r.booked_with || '')}</div>` : ''}</td>`;
    if (c.k === 'phone') return `<td>${lcPhone(r)}</td>`;
    return '<td></td>';
  };
  const th = c => {
    // One small mark per heading (Kate, 2 Oct 2026: two arrows side by side looked off):
    // a chevron that opens the menu, which becomes an accent arrow when that column sorts.
    const sorted = lcSort.k === c.k ? `<svg class="lc-sort${lcSort.dir > 0 ? ' up' : ''}" viewBox="0 0 12 12" aria-label="${lcSort.dir > 0 ? 'sorted up' : 'sorted down'}"><path d="M6 2v8M2.5 6.5 6 10l3.5-3.5"/></svg>` : '';
    return `<th class="lc-th lc-c-${c.k}${lcOn(c.k) ? ' on' : ''}${c.k === 'stylist' || c.k === 'beauty' ? ' lc-l' : ''}"><button type="button" class="lc-thb" onclick="lcOpenFilter(event,'${c.k}')" aria-haspopup="dialog"${c.xl ? ` title="${lcEsc(c.xl)}, ex VAT, since Jan 2025"` : ''}>${lcEsc(c.label)}${sorted || '<svg class="lc-fn" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5l3-3"/></svg>'}</button></th>`;
  };
  const tr = shown.map((r, i) => `<tr class="lc-row" title="Click to see what she came in for, what she took home and who looked after her" onclick="lcToggleDetail(event,${i})">${cols.map(c => td(c, r)).join('')}</tr>`).join('');
  // Under 760px the table becomes a list, like Products: name and spend on one line,
  // visits / avg / last visit / stylist under it, the number last (tap to call). A tap
  // opens the same panel as a row.
  const cards = shown.map((r, i) => `<li class="prd-card lc-row" onclick="lcToggleDetail(event,${i})">
      <div class="prd-body">
        <div class="prd-top"><span class="prd-name">${lcEsc(r.client_name)}${check(r)}</span><span class="prd-spend">AED ${lcNum(r.spend)}</span></div>
        <div class="prd-meta">${lcNum(r.visits)} visits · avg AED ${lcNum(lcAvg(r))} · last ${lcEsc(lcDayY(r.last_visit))} (${lcNum(r.days_since)} days)${lcSide === 'moved' && r.now_at ? ' · now at ' + lcEsc(r.now_at) + ' (' + lcEsc(lcDayY(r.now_last)) + ')' : ''}${lcSide === 'booked' && r.booked_on ? ' · booked ' + lcEsc(lcBookedAt(r)) + (r.booked_with ? ' with ' + lcEsc(r.booked_with) : '') : ''}</div>
        ${['hair', 'beauty'].map(t => { const l = lcTeam(r)[t]; return l.length ? `<div class="prd-meta lc-also-line">${t === 'hair' ? 'Stylist' : 'Beautician'} ${lcStylist(l[0])}${l.length > 1 ? ' · also ' + l.slice(1, 3).map(lcStylist).join(', ') + (l.length > 3 ? ' +' + (l.length - 3) : '') : ''}</div>` : ''; }).join('')}
        ${lcHasPhones() && (r.mobile || r.landline) ? `<div class="prd-meta" style="margin-top:4px">${lcPhone(r)}</div>` : ''}
        <div class="lc-hint-m">Tap for her visits ›</div>
      </div>
    </li>`).join('');
  const filtered = Object.keys(lcF).some(lcOn);
  const note = filtered || lcQuery.trim()
    ? `<p class="slv-note lc-fnote">${lcNum(rows.length)} of ${lcNum(lcRows.length)} after filters. <button type="button" class="lc-more" onclick="lcClearAll()">Clear all</button></p>` : '';
  box.innerHTML = note + `<div class="slv-wrap prd-desk lc-wrap"><table class="slv-table">
      <thead><tr>${cols.map(th).join('')}</tr></thead>
      <tbody>${tr || `<tr><td colspan="${cols.length}" class="slv-muted">No one on this list matches those filters.</td></tr>`}</tbody></table></div>
      <ol class="prd-cards">${cards || '<li class="slv-muted">No one on this list matches those filters.</li>'}</ol>
      ${rows.length ? lcPager(rows.length, pages, shown.length) : ''}`;
}
function lcPager(total, pages, n) {
  const from = (lcPage - 1) * lcPer + 1;
  return `<div class="lc-pager">
      <div class="lc-pg-size"><span class="slv-note">Show</span><div class="sc-seg" role="group" aria-label="Rows per page">${LC_PER.map(v =>
        `<button type="button" class="${v === lcPer ? 'on' : ''}" onclick="lcSetPer(${v})">${v}</button>`).join('')}</div></div>
      <div class="lc-pg-nav">
        <span class="lc-pg-txt">Page <b>${lcPage}</b> of <b>${lcNum(pages)}</b><span class="slv-note"> · ${lcNum(from)}–${lcNum(from + n - 1)} of ${lcNum(total)}</span></span>
        <button type="button" class="tglr" onclick="lcGo(-1)"${lcPage <= 1 ? ' disabled' : ''} aria-label="Previous page">‹ Prev</button>
        <button type="button" class="tglr" onclick="lcGo(1)"${lcPage >= pages ? ' disabled' : ''} aria-label="Next page">Next ›</button>
      </div>
    </div>`;
}
function lcSetPer(v) { lcPer = v; lcPage = 1; try { localStorage.setItem('trs-lost-per10', v); } catch (e) {} lcPaintTable(); }
// A new page starts at its first row: back up to the table's top if it is above the screen.
function lcGo(d) {
  lcPage += d; lcPaintTable();
  const box = document.getElementById('lcTable');
  if (box && box.getBoundingClientRect().top < 0) scrollTo({ top: scrollY + box.getBoundingClientRect().top - 180 });
}
function lcClearAll() {
  lcResetFilters(); lcQuery = '';
  const q = document.getElementById('lcSearch'); if (q) q.value = '';
  lcPaintTable();
}

// Who looked after her, split by team (Kate, 2 Oct 2026). lost_clients gives her usual
// person and everyone else she saw, most visits first; together that is one ranked list,
// cut into hair and beauty by role in staff-profiles.js (beauty, nail, lash, brow,
// therapist, aesthetics; anyone else counts as hair). Assistants and the BUSINESS
// (unassigned) bucket are left out: nobody books them.
function lcIsAssistant(name) {
  const P = typeof STAFF_PROFILES !== 'undefined' ? STAFF_PROFILES : {};
  const p = P[lcProfileKey(name)];
  return !!(p && /assistant/i.test(p.role || ''));
}
function lcIsBeauty(name) {
  const P = typeof STAFF_PROFILES !== 'undefined' ? STAFF_PROFILES : {};
  const p = P[lcProfileKey(name)];
  return !!(p && /beauty|nail|lash|brow|therap|aesthet/i.test(p.role || ''));
}
const lcAlsoNames = list => String(list || '').split(', ').filter(n => n && !/^\s*business\b/i.test(n) && !lcIsAssistant(n));
function lcTeam(r) {
  if (r._team) return r._team;
  const all = (r.stylist && !/^\s*business\b/i.test(r.stylist) && !lcIsAssistant(r.stylist) ? [r.stylist] : []).concat(lcAlsoNames(r.also_saw));
  return (r._team = { hair: all.filter(n => !lcIsBeauty(n)), beauty: all.filter(lcIsBeauty) });
}
// One cell: the usual person, then "also" and up to two more in small type, the rest
// counted, all of them on hover.
function lcTeamCell(list) {
  if (!list.length) return '<span class="slv-muted">–</span>';
  const rest = list.slice(1);
  return lcStylist(list[0]) + (rest.length ? `<div class="lc-others">also ${rest.slice(0, 2).map(lcStylist).join(', ')}${rest.length > 2
    ? ` <span title="${lcEsc(rest.slice(2).join(', '))}">+${rest.length - 2}</span>` : ''}</div>` : '');
}

// Phorest's full name → her staff-profiles.js key (Kate, 3 Oct 2026). The surname has
// to agree, or May Manguiat lands on May Fernandez's card; and a nickname under the
// same surname counts (LUCY for Lucia Gonzalez Rodriguez, KIM for Kimberly Casas, MJ
// for Mary Joy Galos, AREANNE for Princess Areanne Miranda), as long as only one fits.
function lcProfileKey(name) {
  const P = typeof STAFF_PROFILES !== 'undefined' ? STAFF_PROFILES : {};
  const up = String(name).trim().toUpperCase().replace(/\./g, '');
  const w = up.split(/\s+/).filter(Boolean);
  if (!w.length) return '';
  const surname = w.length > 1 ? w[w.length - 1] : '';
  const lastOf = k => String(P[k].last || '').toUpperCase().split(/\s+/).pop();
  const fits = k => !surname || !P[k].last || lastOf(k) === surname;
  const direct = [up, w.slice(0, 2).join(' '), w[0]].find(k => P[k] && fits(k));
  if (direct || !surname) return direct || '';
  const given = w.slice(0, -1), initials = given.map(x => x[0]).join('');
  const hits = Object.keys(P).filter(k => P[k].last && lastOf(k) === surname
    && (given.includes(k) || k === initials || given.some(g => g.length >= 3 && k.slice(0, 3) === g.slice(0, 3))));
  return hits.length === 1 ? hits[0] : '';
}
// Usual stylist as a link (Kate, 2 Oct 2026): the same hover / tap menu every other
// staff name has (staff-links.js: Staff card, Staff stats, Branch figures), in the
// hair or beauty accent by her role in staff-profiles.js, hair when unknown. The menu
// is handed her Staff Cards key (SHINE, not SHINE CASTILLO), or it cannot find her
// card. Someone marked resigned there is grey, like her faded card.
function lcStylist(name) {
  if (!name) return '–';
  const P = typeof STAFF_PROFILES !== 'undefined' ? STAFF_PROFILES : {};
  const key = lcProfileKey(name);
  const prof = key ? P[key] : null;
  const dept = prof && /beauty|nail|lash|brow|therap|aesthet/i.test(prof.role || '') ? 'beauty' : 'hair';
  const gone = prof && prof.resigned ? ' lc-st-gone' : '';
  const inner = `<span class="lc-st lc-st-${dept}${gone}"${gone ? ' title="Has left"' : ''}>${lcEsc(name)}</span>`;
  return typeof staffWho === 'function' ? staffWho(key || name, inner, { dept, branch: lcBranchArg() || undefined }) : inner;
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
    if (c.k === 'booked') {
      head.push('Booked for', 'Booked at', 'Booked with', 'Booked services');
      pick.push(r => r.booked_on || '', r => r.booked_at || '', r => r.booked_with || '', r => r.booked_for || ''); return;
    }
    if (c.k === 'stylist') { head.push('Usual stylist', 'Also saw (hair)'); pick.push(r => lcTeam(r).hair[0] || '', r => lcTeam(r).hair.slice(1).join(', ')); return; }
    if (c.k === 'beauty') { head.push('Usual beautician', 'Also saw (beauty)'); pick.push(r => lcTeam(r).beauty[0] || '', r => lcTeam(r).beauty.slice(1).join(', ')); return; }
    head.push(c.xl || c.label); pick.push(c.get);
    if (c.k === 'client') { head.push('Branch'); pick.push(() => LC_BRANCH[lcSel.branch] || 'All branches'); }
  });
  return { head, lines: rows.map(r => pick.map(f => f(r))), rows };
}

// XLSX and CSV (Kate, 2 Oct 2026), written by ledger-export.js's own writer (no
// library). Header row first, no title rows, so the file imports straight into a
// sheet or a CRM. File name: lost-clients-SAA-regulars-60d (plus -moved / -search).
// Her visits in the files too (Kate, 2 Oct 2026: the panel a click opens wasn't in
// them). lost_clients_detail_bulk (migrations/create_lost_clients_detail_bulk.sql)
// gives first visit, services, products and retail spend, 400 clients a call, a few
// calls side by side; kept per branch and name so a second save is instant.
const lcBulkCache = {};
async function lcFetchDetails(rows) {
  const key = n => lcSel.branch + '|' + n;
  const need = [...new Set(rows.map(r => r.client_name).filter(n => !(key(n) in lcBulkCache)))];
  const chunks = [];
  for (let i = 0; i < need.length; i += 400) chunks.push(need.slice(i, i + 400));
  let next = 0;
  const worker = async () => {
    while (next < chunks.length) {
      const part = chunks[next++];
      const { data, error } = await sb.rpc('lost_clients_detail_bulk', { p_branch: lcBranchArg(), p_clients: part });
      if (error) throw error;
      part.forEach(n => { lcBulkCache[key(n)] = null; });
      (data || []).forEach(d => { lcBulkCache[key(d.client_name)] = d; });
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return n => lcBulkCache[key(n)] || {};
}
let lcSaving = false;
async function lcSaveFile(kind) {
  if (typeof lgxBuild !== 'function' || lcSaving) return;
  const { head, lines, rows } = lcExportLines();
  const s = document.getElementById('lcCopied');
  lcSaving = true;
  if (s) s.textContent = `Adding her visits to ${lcNum(rows.length)} rows…`;
  try {
    const det = await lcFetchDetails(rows);
    head.push('First visit', 'Usual services', 'Products bought', 'Retail spend (AED)');
    rows.forEach((r, i) => { const d = det(r.client_name); lines[i].push(d.first_visit || '', d.services || '', d.products || '', Number(d.retail_spend) || 0); });
  } catch (e) {
    console.error(e);
    lcSaving = false;
    if (s) s.textContent = 'Her visits did not load, so the file was not saved. Try again.';
    return;
  }
  lcSaving = false;
  const nums = new Set(['Visits', 'Days since', 'Total spend (AED)', 'Avg per visit (AED)', 'Retail spend (AED)']);
  const cols = head.map(h => ({ label: h, fmt: /AED/.test(h) ? 'aed' : nums.has(h) ? 'num' : 'text' }));
  // Excel reads +971501234567 in a CSV as a number and shows 9.72E+11 (Kate, 2 Oct
  // 2026). In the CSV the number goes in as ="+971…", which Excel and Google Sheets
  // both show as the number itself, as text. The XLSX already has it as text.
  const pi = head.indexOf('Phone');
  const out = kind === 'csv' && pi >= 0 ? lines.map(l => l.map((v, j) => j === pi && v ? `="${v}"` : v)) : lines;
  const built = lgxBuild({ sheets: [{ name: 'Lost clients ' + lcSel.branch, blocks: [{ cols, rows: out.map(l => ({ cells: l })) }] }] });
  const name = ['lost-clients', lcSel.branch, lcSel.seg === 'regular' ? 'regulars' : lcSel.seg, (lcCustom() ? lcFrom() + '-' + lcTo() : lcSel.days) + 'd']
    .concat(lcSide ? [lcSide] : []).concat(lcQuery.trim() || Object.keys(lcF).some(lcOn) ? ['filtered'] : []).join('-');
  if (kind === 'xlsx') lgxSave(lgxXlsxBlob(built), name + '.xlsx');
  else lgxSave(new Blob(['﻿' + lgxCsv(built[0])], { type: 'text/csv;charset=utf-8' }), name + '.csv');
  if (s) s.textContent = `Saved ${lcNum(lines.length)} rows as ${kind.toUpperCase()}`;
}
