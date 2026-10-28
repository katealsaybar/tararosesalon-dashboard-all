// Discounts and Vouchers (Kate, 23 Oct 2026): Phorest's Discounts list and Client Vouchers list, archived included, in the Campaigns group beside
// Active Deals Performance, in that page's format (headline, tiles, a chart with a table behind it, a branch card, tables with a Total row).
// Numbers from discounts_vouchers_report() (migrations/discounts_vouchers.sql), Level 2 and above, no client names: vouchers by branch and issue month,
// and every UAE discount, fetched once and filtered here, so a Branch or Period change in the masthead redraws at once.
// Kate's rulings of 23 Oct 2026: no filter bar of its own (sel.branch and dateFrom/dateTo are the masthead's), phone first. The discount list is the list
// as it stands today, so Branch and Period cut the vouchers only. Self-contained: it needs sb, TRS_LEVEL, sel, dateFrom, dateTo, dateToIso() and, for
// Save as xlsx, the lgx group (ledger-export.js).
// Offered per salon (Kate, 28 Oct 2026, Belle asked): a block at the top with what each salon gives, active and inactive, from the SALON DISCOUNTS Google Sheet
// via salon_offers_report() (migrations/salon_offers.sql). The masthead Branch cuts it (Fratelli, closed, only on all of the UAE); Period does not.
const DV_BR = [['SAA', 'Saadiyat'], ['KCA', 'Khalifa City A'], ['MC', 'Motor City'], ['AQ', 'Al Quoz']];
const DV_CLOSED = [['MRY', 'Marasy (closed)'], ['FRA', 'Fratelli (closed)']];   // counted only when the masthead is all of the UAE
const DV_MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// vouchers row: [branch, issue month, issued, value issued, balance left, expired balance, expired with balance, live balance, expiring in 30 days, live with balance]
// discounts row: [name, kind, P or A, value, act or arc, ends, names a closed branch]
let dvData = null, dvErr = '', dvBusy = false, dvM = null, dvResize = null, dvFilter = 'act', dvQuery = '';
// offers row: [branch, offer, who, stylist, rule, state act / cf / off, phorest ok / no / arc / cf / empty]
let dvOff = null, dvOffAt = '', dvOffFilter = 'act';

const dvEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dvMoney = n => Math.round(Number(n) || 0).toLocaleString('en-US');
const dvAed = n => 'AED ' + dvMoney(n);
const dvPc = (a, b) => b ? Math.round(a / b * 100) + '%' : '0%';
const dvSum = (l, f) => l.reduce((a, r) => a + f(r), 0);
const dvOk = () => typeof TRS_LEVEL !== 'undefined' && TRS_LEVEL >= 2;
const dvMname = m => DV_MON[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4);
const dvWhen = iso => { try { return new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).replace(' at ', ', '); } catch (e) { return ''; } };
const dvDay = iso => { try { return new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return iso || ''; } };
function dvNiceMax(v) { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p; return (m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; }

// ── THE MASTHEAD'S FILTERS ──────────────────────────────────────────────────
// Branch: ['all'] or codes. Only the four open UAE branches are offered; the two closed ones count only on "all". Bahrain is a separate business
// in BHD and is not in these totals.
function dvCodes() {
  if (typeof sel === 'undefined' || !sel.branch || sel.branch.includes('all')) return DV_BR.map(b => b[0]);
  return DV_BR.map(b => b[0]).filter(c => sel.branch.includes(c));
}
const dvAll = () => dvCodes().length === DV_BR.length;
function dvBranchLabel() {
  const c = dvCodes();
  if (typeof sel === 'undefined' || !sel.branch || sel.branch.includes('all') || c.length === DV_BR.length) return 'UAE Branches';
  return c.length ? c.map(x => DV_BR.find(b => b[0] === x)[1]).join(' + ') : (sel.branch || []).join(' + ');
}
// Months, not days: a voucher is cut by the month it was issued, so a window that starts or ends mid-month takes the whole month.
function dvRange() {
  const from = typeof dateFrom !== 'undefined' && dateFrom ? dateToIso(dateFrom).slice(0, 7) : '0000-01';
  const to = typeof dateTo !== 'undefined' && dateTo ? dateToIso(dateTo).slice(0, 7) : '9999-12';
  return { from, to };
}
function dvPeriodLabel() {
  const key = typeof activePeriodKey === 'function' ? activePeriodKey() : '';
  if (key && key !== 'Custom' && key !== 'Month' && key !== 'Year') return key;
  const w = dvRange();
  return w.from === w.to ? dvMname(w.from + '-01') : dvMname(w.from + '-01') + ' to ' + dvMname(w.to + '-01');
}
const dvIsClosed = c => DV_CLOSED.some(x => x[0] === c);
const dvOn = code => dvCodes().includes(code) || (dvAll() && dvIsClosed(code));
const dvIn = r => { const w = dvRange(); return r[1] >= w.from && r[1] <= w.to && dvOn(r[0]); };

// ── LOAD ────────────────────────────────────────────────────────────────────
async function renderDiscountsVouchers(force) {
  const el = document.getElementById('discountsVouchersContent');
  if (!el || !dvOk()) return;
  if (dvData && !force) { dvPaint(); return; }
  if (dvBusy) return;
  dvBusy = true; dvErr = '';
  el.innerHTML = '<div class="dv-state">Reading the Phorest lists…</div>';
  try {
    const { data, error } = await sb.rpc('discounts_vouchers_report');
    if (error || !data || !Array.isArray(data.vouchers) || !Array.isArray(data.discounts)) throw error || new Error('no report');
    dvData = data;
    await dvLoadOffers();
  } catch (e) { console.error(e); dvErr = 'The report did not load. Press Refresh to try again.'; }
  dvBusy = false;
  dvPaint();
}

function dvMini(n, of) { return `<span class="dv-mini" aria-hidden="true"><i style="width:${Math.min(100, of ? n / of * 100 : 0)}%"></i></span>${dvPc(n, of)}`; }
const dvCount = (list, st) => list.filter(d => d[4] === st).length;

function dvDiscRows() {
  const q = dvQuery.toLowerCase();
  return dvData.discounts.filter(d => (dvFilter === 'all' || d[4] === dvFilter) && (!q || d[0].toLowerCase().includes(q) || d[1].toLowerCase().includes(q)));
}
function dvDiscTable() {
  const rows = dvDiscRows();
  return `<div class="dv-scroll"><table><thead><tr><th>Discount</th><th>Kind</th><th class="n">Off</th><th>Ends</th><th>Status</th></tr></thead><tbody>${
    rows.length ? rows.map(d => `<tr><td>${dvEsc(d[0])}${d[6] ? '<small>Names a closed branch</small>' : ''}</td><td>${dvEsc(d[1])}</td><td class="n">${d[2] === 'P' ? dvEsc(d[3]) + '%' : 'AED ' + dvEsc(d[3])}</td><td>${d[5] ? dvEsc(d[5]) : '<span class="dv-zero">no end date</span>'}</td><td><span class="dv-tag ${d[4] === 'act' ? 'ok' : ''}">${d[4] === 'act' ? 'Active' : 'Archived'}</span></td></tr>`).join('') : '<tr><td colspan="5" class="dv-empty">Nothing matches.</td></tr>'
  }</tbody></table></div><p class="dv-foot">${rows.length} of ${dvData.discounts.length} discounts shown.</p>`;
}
function dvSetFilter(f, btn) {
  dvFilter = f;
  btn.parentNode.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === btn));
  document.getElementById('dvTable').innerHTML = dvDiscTable();
}
function dvFind(v) { dvQuery = v; document.getElementById('dvTable').innerHTML = dvDiscTable(); }

// ── OFFERED PER SALON ───────────────────────────────────────────────────────
const DV_OFF_CODES = ['SAA', 'KCA', 'MC', 'AQ', 'FRA'];
const dvBrName = c => (DV_BR.concat(DV_CLOSED).find(b => b[0] === c) || [0, c])[1];
async function dvLoadOffers() {
  try {
    const { data, error } = await sb.rpc('salon_offers_report');
    if (error || !data || !Array.isArray(data.offers)) throw error || new Error('no offers');
    dvOff = data.offers; dvOffAt = data.at || '';
  } catch (e) { console.error(e); dvOff = null; }
}
const dvOffRows = () => (dvOff || []).filter(r => dvOn(r[0]));
function dvOffShown(rows) {
  return rows.filter(r => dvOffFilter === 'all' ? true : dvOffFilter === 'off' ? r[5] === 'off' : dvOffFilter === 'gap' ? r[5] !== 'off' && r[6] !== 'ok' : r[5] !== 'off');
}
function dvOffPhorest(r) {
  if (r[5] === 'off') return r[6] === 'ok' ? '<span class="dv-tag warn">Still active on Phorest</span>' : r[6] === 'arc' ? '<span class="dv-tag">Archived on Phorest</span>' : '<span class="dv-zero">–</span>';
  return r[6] === 'ok' ? '<span class="dv-tag ok">On Phorest</span>' : r[6] === 'no' ? '<span class="dv-tag warn">Not on Phorest</span>' : r[6] === 'arc' ? '<span class="dv-tag">Archived on Phorest</span>' : '<span class="dv-tag">To confirm</span>';
}
function dvOffBody() {
  const rows = dvOffShown(dvOffRows());
  const parts = DV_OFF_CODES.map(c => {
    const l = rows.filter(r => r[0] === c);
    if (!l.length) return '';
    return `<h3 class="dv-subh">${dvEsc(dvBrName(c))} · ${l.length} offer${l.length === 1 ? '' : 's'}</h3><div><table class="dv-stack"><thead><tr><th>Offer</th><th>Who</th><th>Stylist</th><th>Rule</th><th>Status</th><th>Phorest</th></tr></thead><tbody>${
      l.map(r => `<tr><td class="dv-off">${r[1] ? dvEsc(r[1]) : '<span class="dv-zero">–</span>'}</td><td>${dvEsc(r[2])}</td><td>${r[3] ? dvEsc(r[3]) : '<span class="dv-zero">all</span>'}</td><td>${dvEsc(r[4])}</td><td><span class="dv-tag ${r[5] === 'act' ? 'ok' : r[5] === 'cf' ? 'warn' : ''}">${r[5] === 'act' ? 'Active' : r[5] === 'cf' ? 'To confirm' : 'Inactive'}</span></td><td>${dvOffPhorest(r)}</td></tr>`).join('')
    }</tbody></table></div>`;
  }).join('');
  return parts || '<div class="dv-empty">Nothing matches.</div>';
}
function dvSetOff(f, btn) {
  dvOffFilter = f;
  btn.parentNode.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === btn));
  document.getElementById('dvOffBody').innerHTML = dvOffBody();
}
function dvOfferedSection() {
  if (!dvOff) return '<section class="dv-card" id="dv-offered"><h2>Offered per salon</h2><p class="dv-sub">The offers list did not load. Press Refresh to try again.</p></section>';
  const all = dvOffRows(), live = all.filter(r => r[5] !== 'off'), off = all.filter(r => r[5] === 'off');
  const on = live.filter(r => r[6] === 'ok').length, no = live.filter(r => r[6] === 'no').length;
  const tiles = [['Active offers', live.length, dvEsc(dvBranchLabel())], ['On Phorest', on, 'set up as a discount'], ['Not on Phorest', no, 'cannot be rung up as one'],
    ['To confirm or archived', live.length - on - no, 'needs a word'], ['Inactive', off.length, 'ended or off the 2026 list']];
  const seg = [['act', 'Active'], ['gap', 'Not on Phorest'], ['off', 'Inactive'], ['all', 'Both']];
  return `<section class="dv-card" id="dv-offered"><h2>Offered per salon</h2><p class="dv-sub">What each salon gives, from the SALON DISCOUNTS sheet${dvOffAt ? ', copied ' + dvEsc(dvDay(dvOffAt)) : ''}. The header Branch picks the salon; Period does not cut it. Inactive offers are kept and labelled.</p>
    <div class="dv-tiles" style="margin-top:12px">${tiles.map(t => `<div class="dv-tile"><div class="l">${t[0]}</div><div class="v">${t[1]}</div><div class="h">${t[2]}</div></div>`).join('')}</div>
    <div class="dv-seg" role="group" aria-label="Which offers">${seg.map(x => `<button type="button" onclick="dvSetOff('${x[0]}', this)" aria-pressed="${dvOffFilter === x[0]}">${x[1]}</button>`).join('')}</div>
    <div id="dvOffBody">${dvOffBody()}</div></section>`;
}

// ── PAINT ───────────────────────────────────────────────────────────────────
function dvPaint() {
  const el = document.getElementById('discountsVouchersContent');
  if (!el) return;
  const head = `<div class="dv-top"><div><h1 class="dv-t">Discounts and Vouchers</h1><p class="dv-sub">${dvData ? 'As of ' + dvEsc(dvWhen(dvData.at)) + '. Phorest Discounts and Client Vouchers lists, archived included. Vouchers are cut by the month they were issued.' : ''}</p></div>
    <div class="dv-toplinks"><button class="dv-btn" type="button" onclick="renderDiscountsVouchers(true)">Refresh</button>
    <button class="dv-btn" type="button" onclick="dvSave()">Save as xlsx</button></div></div>`;
  if (dvErr || !dvData) { el.innerHTML = head + `<div class="dv-state">${dvEsc(dvErr || 'No report yet.')}</div>`; dvRail(false); return; }

  const rs = dvData.vouchers.filter(dvIn);
  const issued = dvSum(rs, r => r[2]), orig = dvSum(rs, r => r[3]), rem = dvSum(rs, r => r[4]);
  const expRem = dvSum(rs, r => r[5]), expN = dvSum(rs, r => r[6]), liveRem = dvSum(rs, r => r[7]), liveN = dvSum(rs, r => r[9]), soon = dvSum(rs, r => r[8]);
  const used = orig ? 1 - rem / orig : 0;
  const disc = dvData.discounts, act = dvCount(disc, 'act'), arc = dvCount(disc, 'arc');
  let h = head + dvOfferedSection();
  if (!issued) {
    const key = typeof activePeriodKey === 'function' ? activePeriodKey() : '';
    const named = key && key !== 'Custom' && key !== 'Month' && key !== 'Year';
    h += `<section class="dv-card"><div class="dv-empty">${!dvCodes().length
      ? 'These totals are for the four UAE branches. Bahrain is a separate Phorest business in BHD and is not in them. Pick a UAE branch in the header.'
      : `No vouchers were issued at ${dvEsc(dvBranchLabel())} in ${dvEsc(named ? dvPeriodLabel().toLowerCase() : dvPeriodLabel())}. ${key !== 'All time'
        ? `<button type="button" class="dv-btn" style="margin-left:6px" onclick="document.querySelector('#periodChips .chip[data-v=&quot;All time&quot;]')?.click()">See all time instead</button>` : 'Widen the Branch in the header.'}`}</div></section>`;
    dvM = null;
  } else {
    const w = dvRange(), now = dateToIso(new Date()).slice(0, 7);
    const first = rs.reduce((a, r) => !a || r[1] < a ? r[1] : a, '');
    const start = w.from > first ? w.from : first, end = w.to < now ? w.to : now;
    const months = [];
    for (let [y, m] = [+start.slice(0, 4), +start.slice(5, 7)]; y + '-' + String(m).padStart(2, '0') <= end && months.length < 400; m === 12 ? (y++, m = 1) : m++) months.push(y + '-' + String(m).padStart(2, '0'));
    const byYear = months.length > 24;
    const keys = byYear ? [...new Set(months.map(m => m.slice(0, 4)))] : months;
    const series = keys.map(k => { const l = rs.filter(r => byYear ? r[1].slice(0, 4) === k : r[1] === k); return { k, n: dvSum(l, r => r[2]), a: dvSum(l, r => r[3]), rem: dvSum(l, r => r[4]) }; });
    const peak = series.slice().sort((a, b) => b.a - a.a)[0];
    const brs = DV_BR.concat(DV_CLOSED).map(b => {
      const l = dvData.vouchers.filter(r => r[0] === b[0] && r[1] >= w.from && r[1] <= w.to);
      return { code: b[0], name: b[1], on: dvOn(b[0]), n: dvSum(l, r => r[2]), o: dvSum(l, r => r[3]), rem: dvSum(l, r => r[4]), exp: dvSum(l, r => r[5]) };
    });
    const onl = brs.filter(b => b.on);
    const tn = dvSum(onl, b => b.n), to = dvSum(onl, b => b.o), tr = dvSum(onl, b => b.rem), te = dvSum(onl, b => b.exp);
    dvM = { series, byYear, brs };
    const warn = expRem > liveRem * 0.3;
    h += `<section class="dv-card" id="dv-headline"><div class="dv-hero"><div>
        <div class="dv-cap">Voucher balance still on the books</div><div class="dv-big">${dvAed(rem)} <small>on ${liveN + expN} vouchers</small></div>
        <div class="dv-track"><div class="dv-fill" style="width:${Math.round(used * 100)}%"></div></div>
        <div class="dv-cap">${Math.round(used * 100)}% of the ${dvAed(orig)} issued has been spent</div></div>
      <div class="dv-pace"><div class="dv-status ${warn ? 'warn' : 'good'}"><span aria-hidden="true">${warn ? '!' : '✓'}</span>${dvAed(expRem)} of it has expired</div>
        <div class="dv-row"><span>Still live</span><b>${dvAed(liveRem)} on ${liveN}</b></div>
        <div class="dv-row"><span>Expired, balance left</span><b>${dvAed(expRem)} on ${expN}</b></div>
        <div class="dv-row"><span>Expiring in 30 days</span><b>${soon} voucher${soon === 1 ? '' : 's'}</b></div>
        <div class="dv-row"><span>Biggest issue ${byYear ? 'year' : 'month'}</span><b>${peak ? dvEsc(byYear ? peak.k : dvMname(peak.k + '-01')) + ', ' + peak.n + ' vouchers' : 'none'}</b></div></div></div></section>`;
    h += `<div class="dv-tiles">${[
      ['Vouchers issued', issued, 'in this window'],
      ['Value issued', dvAed(orig), 'face value, VAT included'],
      ['Balance left', dvAed(rem), 'live and expired together'],
      ['Spent', Math.round(used * 100) + '%', 'of the value issued'],
      ['Discounts, active', act, arc + ' archived']
    ].map(t => `<div class="dv-tile"><div class="l">${t[0]}</div><div class="v">${t[1]}</div><div class="h">${t[2]}</div></div>`).join('')}</div>`;
    h += `<section class="dv-card" id="dv-issued"><h2>Vouchers issued ${byYear ? 'per year' : 'per month'}</h2><p class="dv-sub">Face value issued by the month of issue. Hover a bar for how many and how much of it is left.</p>
      <div class="dv-chart" id="dvIssChart"></div><details><summary>Show as table</summary><div id="dvIssTable"></div></details></section>`;
    h += `<section class="dv-card" id="dv-branch"><h2>By branch</h2><p class="dv-sub">Where the vouchers were issued and where the balance sits. Branches outside your header filter are shown faded; closed branches count only when the header is all of the UAE.</p>
      <div class="dv-chart" id="dvBrChart"></div>
      <details><summary>Show as table</summary><div><table><thead><tr><th>Branch</th><th class="n">Issued</th><th class="n">Value</th><th class="n">Balance left</th><th class="n">Expired</th><th>Spent</th></tr></thead><tbody>${
        brs.map(b => `<tr${b.on ? '' : ' style="opacity:.45"'}><td>${b.name}</td><td class="n">${b.n}</td><td class="n">${dvAed(b.o)}</td><td class="n">${dvAed(b.rem)}</td><td class="n">${dvAed(b.exp)}</td><td>${dvMini(b.o - b.rem, b.o)}</td></tr>`).join('')
      }<tr class="tot"><td>Total</td><td class="n">${tn}</td><td class="n">${dvAed(to)}</td><td class="n">${dvAed(tr)}</td><td class="n">${dvAed(te)}</td><td>${dvMini(to - tr, to)}</td></tr></tbody></table></div></details></section>`;
  }

  // Discounts: the list as it stands today, not cut by the masthead.
  const kinds = {};
  disc.forEach(d => { const k = kinds[d[1]] || (kinds[d[1]] = { n: d[1], a: 0, r: 0 }); if (d[4] === 'act') k.a++; else k.r++; });
  const kl = Object.values(kinds).sort((a, b) => b.a - a.a || b.r - a.r);
  h += `<section class="dv-card" id="dv-disc"><h2>Discounts</h2><p class="dv-sub">Every discount set up in Phorest, ${act} active and ${arc} archived. This is the list as it stands today, so the header Branch and Period do not cut it.</p>
    <div><table><thead><tr><th>Kind</th><th class="n">Active</th><th class="n">Archived</th><th>Share of active</th></tr></thead><tbody>${
      kl.map(k => `<tr><td>${dvEsc(k.n)}</td><td class="n"><b>${k.a}</b></td><td class="n">${k.r || '<span class="dv-zero">–</span>'}</td><td>${dvMini(k.a, act)}</td></tr>`).join('')
    }<tr class="tot"><td>Total</td><td class="n">${act}</td><td class="n">${arc}</td><td></td></tr></tbody></table></div>
    <h3 class="dv-subh">Every discount</h3>
    <div class="dv-seg" role="group" aria-label="Which discounts"><button type="button" onclick="dvSetFilter('act', this)" aria-pressed="${dvFilter === 'act'}">Active</button><button type="button" onclick="dvSetFilter('arc', this)" aria-pressed="${dvFilter === 'arc'}">Archived</button><button type="button" onclick="dvSetFilter('all', this)" aria-pressed="${dvFilter === 'all'}">Both</button></div>
    <input class="dv-find" type="search" placeholder="Search a discount or kind" value="${dvEsc(dvQuery)}" oninput="dvFind(this.value)" aria-label="Search discounts">
    <div id="dvTable">${dvDiscTable()}</div></section>`;

  const big = disc.filter(d => d[4] === 'act' && d[2] === 'P' && Number(d[3]) >= 100);
  const ends = disc.filter(d => d[4] === 'act' && d[5]);
  const clos = disc.filter(d => d[4] === 'act' && d[6]);
  const noEnd = act - ends.length;
  const allExp = dvSum(dvData.vouchers, r => r[5]), allExpN = dvSum(dvData.vouchers, r => r[6]);
  h += `<section class="dv-card" id="dv-look"><h2>Worth a look</h2><p class="dv-sub">Things the two lists show that someone should decide on. Voucher figures here are all UAE branches, all time.</p><ul class="dv-list">
      <li><b>${allExpN} expired voucher${allExpN === 1 ? '' : 's'} still carry ${dvAed(allExp)}</b>Expired but not archived or cleared. Finance may want them written off or honoured as goodwill.</li>
      <li><b>${big.length} active discount${big.length === 1 ? '' : 's'} take 100% off</b>${dvEsc(big.map(d => d[0]).join(', '))}. Fine for goodwill, but they have no end date and no limit.</li>
      <li><b>${clos.length} active discount${clos.length === 1 ? '' : 's'} still name a closed branch</b>${dvEsc(clos.map(d => d[0]).join(', ')) || 'None.'}</li>
      <li><b>${noEnd} of ${act} active discounts have no end date</b>${ends.length ? 'Only ' + ends.length + ' ' + (ends.length === 1 ? 'has one' : 'have one') + ': ' + dvEsc(ends.map(d => d[0].split(' - ')[0] + ' (' + d[5] + ')').join(' and ')) + '.' : 'None of them end.'}</li></ul></section>`;
  h += `<section class="dv-card" id="dv-ask"><h2>Waiting on a word</h2><p class="dv-sub">These need an answer before the numbers can be quoted outside the team.</p><ol class="dv-ask">
      <li><b>Emma:</b> Phorest names the branches differently. We read Turquoise 7 as Saadiyat and the plain Tara Rose Hair and Beauty Salon as Khalifa City A. Is that right?</li>
      <li><b>Kate:</b> the discount list does not say how often each discount was used. Do we also pull Phorest’s discount usage report, so this page can show uses and AED given away per discount?</li>
      <li><b>Kate:</b> Bahrain’s discounts page asks for a PIN, so only its 20 vouchers (BHD 4,390 left) are held, and they are not on this page. Add them under a Bahrain chip?</li>
      <li><b>Kate:</b> Offered per salon is a copy of the sheet taken on the date shown at the top of that block. Should it read the sheet again every day, or stay a copy that is refreshed when the sheet changes?</li></ol></section>
    <details class="more"><summary>How these numbers are counted</summary>
      <p class="dv-sub">Source: Phorest Discounts and Client Vouchers, both pulled with archived included. Value and balance are in AED, VAT included, as Phorest holds them. Spent is the share of the face value issued that has been redeemed.</p>
      <p class="dv-sub">Expired means past the expiry date with a balance left. Live means not expired with a balance left. No client names are held or shown.</p>
      <p class="dv-sub">Phorest keeps no history of these lists, so the page shows the copy taken at the time shown at the top. Bahrain is a separate Phorest business in BHD and is not in the UAE totals.</p>
      <p class="dv-sub">Offered per salon is a copy of the SALON DISCOUNTS Google Sheet (2026 tabs, the Affiliate program tab and the INACTIVE tabs); it does not update by itself. On Phorest is matched by name against the Phorest Discounts list. Inactive means the offer is not on the 2026 list any more or its validity has ended. Fratelli (closed) shows only when the header is all of the UAE.</p></details>`;

  el.innerHTML = h;
  dvCharts();
  dvRail(true);
}

// ── CHARTS (hand-drawn SVG, the Wellness Voucher page's style) ──────────────
function dvTipHost() {
  const c = document.getElementById('discountsVouchersContent');
  let t = document.getElementById('dvTip');
  if (!t && c) { t = document.createElement('div'); t.id = 'dvTip'; t.className = 'dv-tip'; c.appendChild(t); }
  return t;
}
function dvHover(host, selector, fn) {
  const tip = dvTipHost(), box = document.getElementById('discountsVouchersContent');
  host.querySelectorAll(selector).forEach(h => {
    h.addEventListener('mousemove', e => {
      const br = box.getBoundingClientRect(), tw = tip.offsetWidth;
      tip.innerHTML = fn(+h.dataset.i); tip.style.opacity = 1;
      let left = e.clientX - br.left + 12; if (left + tw > br.width - 4) left = e.clientX - br.left - tw - 12;
      tip.style.left = Math.max(4, left) + 'px'; tip.style.top = (e.clientY - br.top - 10) + 'px';
    });
    h.addEventListener('mouseleave', () => { tip.style.opacity = 0; });
  });
}
function dvCharts() {
  if (!dvM || !document.getElementById('dvIssChart')) return;
  const { series: pm, byYear, brs } = dvM;
  let host = document.getElementById('dvIssChart'), W = Math.max(300, host.clientWidth), H = 210, L = 44, R = 8, T = 10, B = 26;
  const ymax = dvNiceMax(Math.max(1, ...pm.map(x => x.a))), bw = (W - L - R) / pm.length;
  const Y = v => T + (1 - v / ymax) * (H - T - B);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Voucher value issued">`;
  for (let g = 0; g <= ymax + 1e-9; g += ymax / 4) s += `<line class="gl" x1="${L}" x2="${W - R}" y1="${Y(g)}" y2="${Y(g)}"/><text class="ax" x="${L - 6}" y="${Y(g) + 4}" text-anchor="end">${g >= 1000 ? Math.round(g / 1000) + 'k' : Math.round(g)}</text>`;
  const every = pm.length > 14 ? Math.ceil(pm.length / 10) : 1;
  pm.forEach((x, i) => {
    const bx = L + i * bw + 2, bwi = Math.max(2, bw - 4), h = Y(0) - Y(x.a), hl = Y(0) - Y(x.rem), rr = Math.min(3, h, bwi / 2);
    if (x.a) s += `<path d="M${bx} ${Y(0)} v${-(h - rr)} q0 -${rr} ${rr} -${rr} h${bwi - 2 * rr} q${rr} 0 ${rr} ${rr} v${h - rr}Z" fill="var(--series)" opacity=".45"/>`;
    if (x.rem) s += `<rect x="${bx}" y="${Y(0) - hl}" width="${bwi}" height="${hl}" fill="var(--series)"/>`;
    if (i % every === 0) s += `<text class="ax" x="${bx + bwi / 2}" y="${H - 6}" text-anchor="middle">${byYear ? x.k : DV_MON[+x.k.slice(5) - 1].slice(0, 3) + (x.k.slice(5) === '01' || i === 0 ? ' ' + x.k.slice(2, 4) : '')}</text>`;
    s += `<rect x="${L + i * bw}" y="${T}" width="${bw}" height="${H - T - B}" fill="transparent" data-i="${i}"/>`;
  });
  host.innerHTML = s + '</svg><div class="dv-legend"><span><i style="background:var(--series);opacity:.45"></i>Value issued</span><span><i style="background:var(--series)"></i>Balance still left</span></div>';
  dvHover(host, 'rect[data-i]', i => { const x = pm[i]; return `<b>${dvEsc(byYear ? x.k : dvMname(x.k + '-01'))}</b><br>${x.n} vouchers · ${dvAed(x.a)} issued<br>${dvAed(x.rem)} left`; });
  document.getElementById('dvIssTable').innerHTML = `<table><thead><tr><th>${byYear ? 'Year' : 'Month'}</th><th class="n">Issued</th><th class="n">Value</th><th class="n">Balance left</th></tr></thead><tbody>${
    pm.slice().reverse().map(x => `<tr><td>${dvEsc(byYear ? x.k : dvMname(x.k + '-01'))}</td><td class="n">${x.n}</td><td class="n">${dvAed(x.a)}</td><td class="n">${dvAed(x.rem)}</td></tr>`).join('')}</tbody></table>`;

  host = document.getElementById('dvBrChart'); W = Math.max(300, host.clientWidth);
  const narrow = W < 460, rowH = 34, H2 = brs.length * rowH + 4, L2 = narrow ? 100 : 130, R2 = narrow ? 120 : 160, mx = Math.max(1, ...brs.map(r => r.rem));
  s = `<svg viewBox="0 0 ${W} ${H2}" role="img" aria-label="Voucher balance left by branch">`;
  brs.forEach((r, i) => {
    const y = i * rowH + 6, w = r.rem > 0 ? Math.max(4, r.rem / mx * (W - L2 - R2)) : 0;
    s += `<g opacity="${r.on ? 1 : .35}"><text class="ax" x="0" y="${y + 15}" style="fill:var(--ink2);font-size:12px">${r.name}</text>`;
    if (w) s += `<rect x="${L2}" y="${y}" width="${w}" height="20" rx="4" fill="var(--series)"/>`;
    s += `<text class="ax" x="${L2 + w + 8}" y="${y + 15}" style="fill:var(--ink);font-size:12px">${dvAed(r.rem)} left</text></g><rect x="0" y="${y - 5}" width="${W}" height="${rowH}" fill="transparent" data-i="${i}"/>`;
  });
  host.innerHTML = s + '</svg>';
  dvHover(host, 'rect[data-i]', i => { const r = brs[i]; return `<b>${r.name}</b><br>${r.n} issued · ${dvAed(r.o)}<br>${dvAed(r.rem)} left, ${dvAed(r.exp)} of it expired`; });
}
window.addEventListener('resize', () => {
  clearTimeout(dvResize);
  dvResize = setTimeout(() => { const v = document.getElementById('view-discountsvouchers'); if (v && v.offsetParent) dvCharts(); }, 120);
});

// ── ON THIS PAGE rail (the same shell as Wellness Voucher Performance's) ────
const DV_RAIL = [['dv-offered', 'Offered per salon'], ['dv-headline', 'Headline'], ['dv-issued', 'Issued'], ['dv-branch', 'By branch'], ['dv-disc', 'Discounts'], ['dv-look', 'Worth a look'], ['dv-ask', 'Waiting on a word']];
function dvRail(on) {
  const shell = document.getElementById('dvShell'), side = document.getElementById('dvSide');
  if (!shell || !side) return;
  shell.classList.toggle('rv-norail', !on);
  const nav = side.querySelector('.side-nav');
  if (nav && on) {
    const live = DV_RAIL.filter(r => document.getElementById(r[0])), sig = live.map(r => r[0]).join();
    if (nav.dataset.sig !== sig) {
      nav.dataset.sig = sig;
      nav.innerHTML = '<div class="side-k">On this page</div>' + live.map(r => `<a href="#${r[0]}" onclick="lgJump(event,'${r[0]}')">${r[1]}</a>`).join('');
    }
  }
  if (typeof spy === 'function') spy();
}

// ── SAVE AS XLSX (what the page shows now: the window, the branches, the discount list) ─
function dvSave() {
  if (!dvData || typeof lgxBuild !== 'function') return;
  const w = dvRange();
  const brs = DV_BR.concat(DV_CLOSED).map(b => { const l = dvData.vouchers.filter(r => r[0] === b[0] && r[1] >= w.from && r[1] <= w.to); return { b, on: dvOn(b[0]), l }; }).filter(x => x.on);
  const built = lgxBuild({ sheets: [
    { name: 'Summary', blocks: [{ cols: [{ label: 'Discounts and Vouchers', fmt: 'text' }, { label: '', fmt: 'text' }], rows: [
      { cells: ['Branches', dvBranchLabel()] }, { cells: ['Period', dvPeriodLabel()] }, { cells: ['Vouchers cut by', 'the month they were issued'] },
      { cells: ['Report made', dvWhen(dvData.at)] }, { cells: ['Counted', 'AED, VAT included, as Phorest holds it. Expired = past the expiry date with a balance left. Archived discounts and vouchers are included. No client names.'] }] }] },
    { name: 'Vouchers by month', blocks: [{ cols: [{ label: 'Month', fmt: 'text' }, { label: 'Branch', fmt: 'text' }, { label: 'Issued', fmt: 'num' }, { label: 'Value issued', fmt: 'aed' }, { label: 'Balance left', fmt: 'aed' }, { label: 'Expired balance', fmt: 'aed' }, { label: 'Expired with balance', fmt: 'num' }, { label: 'Live balance', fmt: 'aed' }],
      rows: dvData.vouchers.filter(dvIn).sort((a, b) => a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0).map(r => ({ cells: [r[1], (DV_BR.concat(DV_CLOSED).find(b => b[0] === r[0]) || [0, r[0]])[1], r[2], r[3], r[4], r[5], r[6], r[7]] })) }] },
    { name: 'By branch', blocks: [{ cols: [{ label: 'Branch', fmt: 'text' }, { label: 'Issued', fmt: 'num' }, { label: 'Value issued', fmt: 'aed' }, { label: 'Balance left', fmt: 'aed' }, { label: 'Expired balance', fmt: 'aed' }],
      rows: brs.map(x => ({ cells: [x.b[1], dvSum(x.l, r => r[2]), dvSum(x.l, r => r[3]), dvSum(x.l, r => r[4]), dvSum(x.l, r => r[5])] })) }] },
    { name: 'Discounts', blocks: [{ cols: [{ label: 'Discount', fmt: 'text' }, { label: 'Kind', fmt: 'text' }, { label: 'Type', fmt: 'text' }, { label: 'Off', fmt: 'num' }, { label: 'Ends', fmt: 'text' }, { label: 'Status', fmt: 'text' }],
      rows: dvData.discounts.map(d => ({ cells: [d[0], d[1], d[2] === 'P' ? 'Percent' : 'AED', Number(d[3]), d[5] || 'no end date', d[4] === 'act' ? 'Active' : 'Archived'] })) }] },
    { name: 'Offered per salon', blocks: [{ cols: [{ label: 'Branch', fmt: 'text' }, { label: 'Offer', fmt: 'text' }, { label: 'Who', fmt: 'text' }, { label: 'Stylist', fmt: 'text' }, { label: 'Rule', fmt: 'text' }, { label: 'Status', fmt: 'text' }, { label: 'On Phorest', fmt: 'text' }],
      rows: dvOffRows().map(r => ({ cells: [dvBrName(r[0]), r[1], r[2], r[3] || 'all', r[4], r[5] === 'act' ? 'Active' : r[5] === 'cf' ? 'To confirm' : 'Inactive', { ok: 'On Phorest', no: 'Not on Phorest', arc: 'Archived on Phorest', cf: 'To confirm' }[r[6]] || ''] })) }] }
  ] });
  lgxSave(lgxXlsxBlob(built), 'discounts-and-vouchers-' + dateToIso(new Date()) + '.xlsx');
}
