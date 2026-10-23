// Active Deals Performance (Kate, 23 Oct 2026): how many times each deal on the active deals brochure (promo.tararosesalon.com/active-deals-brochure)
// was bought at the till, in the Campaigns group beside Wellness Voucher Performance, in that page's format (headline, tiles, charts with a table
// behind them, a branch card, tables with a Total row). Numbers from active_deals_performance() (migrations/active_deals_performance.sql), Level 2 and
// above, no client names: one row per offer, branch and day, fetched once and filtered here, so a Branch or Period change in the masthead redraws at once.
// Kate's rulings of 23 Oct 2026: no filter bar of its own (sel.branch and dateFrom/dateTo are the masthead's), phone first. Self-contained: it needs sb,
// TRS_LEVEL, sel, dateFrom, dateTo, activePeriodKey(), dateToIso() and, for Save as xlsx, the lgx group (ledger-export.js).
const AD_BR = [['SAA', 'Saadiyat'], ['KCA', 'Khalifa City A'], ['MC', 'Motor City'], ['AQ', 'Al Quoz']];
// The nine deals on the brochure that leave a name at the till, best first by sales is worked out on the fly. cat groups them for By type.
// c/ct = how sure the match is: Blonding and Balayage are Phorest's Full Blonde / Full Balayage Package until Emma confirms the name.
const AD_OFFERS = [
  { k: 'Blonding', n: 'Blonding Package', p: '999', s: 4, cat: 'Hair colour', ph: 'Phorest: Full Blonde Package', c: 'warn', ct: 'Confirm name' },
  { k: 'Balayage', n: 'Classic Balayage Package', p: '999', s: 5, cat: 'Hair colour', ph: 'Phorest: Full Balayage Package', c: 'warn', ct: 'Confirm name' },
  { k: 'P599', n: '599 Package: deep cleansing facial + gel mani and pedi', p: '599', s: 13, cat: 'Beauty', c: 'ok', ct: 'Exact' },
  { k: 'Brunette', n: 'Brunette Package', p: '599', s: 6, cat: 'Hair colour', c: 'ok', ct: 'Exact' },
  { k: 'RefreshBlonde', n: 'Refresh Blonde Package', p: '599', s: 3, cat: 'Hair colour', c: 'ok', ct: 'Exact' },
  { k: 'Sunkissed', n: 'Signature Sunkissed Brunette', p: '799', s: 7, cat: 'Hair colour', c: 'ok', ct: 'Exact' },
  { k: 'P350', n: '350 Package: gel mani and pedi + blow dry', p: '350', s: 12, cat: 'Beauty', c: 'ok', ct: 'Exact' },
  { k: 'P450', n: '450 Package: cut, finish, treatment', p: '450', s: 11, cat: 'Hair treatment', c: 'ok', ct: 'Exact' },
  { k: 'P300', n: '300 Package: treatment + blow dry', p: '300', s: 10, cat: 'Hair treatment', c: 'ok', ct: 'Exact' }
];
const AD_OLDER = [
  { k: 'Polish350', n: 'Polish and Pamper (older 350)', p: '350', c: 'warn', ct: 'Check KCA' },
  { k: 'ADS499', n: 'ADS Hydrafacial + Blow dry (older 499)', p: '499', c: 'na', ct: 'Older offer' }
];
const AD_CANT = [
  ['Refresh Balayage Package, AED 499', 'No line under that name. It may be sold as plain services with a discount.'],
  ['Extension Care Package, free', 'A free treatment and trim, so there is no sale line to count.'],
  ['Mix and Match 499, new design', 'Nothing sold under it yet. It starts counting from its first sale.'],
  ['25% off beauty services, new clients', 'The 25% leaves no item name, and the same flat 25% runs on hair lines every month since Jun 2025, so it cannot be told apart from a standing discount. Not quoted.']
];
const AD_CATS = [['Hair colour', 'var(--c1)'], ['Hair treatment', 'var(--c2)'], ['Beauty', 'var(--c3)']];
const AD_TOTAL_DEALS = 13;
const AD_MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
let adData = null, adErr = '', adBusy = false, adM = null, adResize = null;

const adEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const adMoney = n => Math.round(Number(n) || 0).toLocaleString('en-US');
const adAed = n => 'AED ' + adMoney(n);
const adPc = (a, b) => b ? Math.round(a / b * 100) + '%' : '0%';
const adSum = (l, f) => l.reduce((a, r) => a + f(r), 0);
const adOk = () => typeof TRS_LEVEL !== 'undefined' && TRS_LEVEL >= 2;
const adDay = iso => { try { return new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return iso || ''; } };
const adShort = iso => { try { return new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); } catch (e) { return iso || ''; } };
const adWhen = iso => { try { return new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).replace(' at ', ', '); } catch (e) { return ''; } };
function adNiceMax(v) { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p; return (m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; }

// ── THE MASTHEAD'S FILTERS ──────────────────────────────────────────────────
// Branch: ['all'] or codes. Only the four open UAE branches have deals, so Bahrain or a closed branch alone gives an empty window.
function adCodes() {
  if (typeof sel === 'undefined' || !sel.branch || sel.branch.includes('all')) return AD_BR.map(b => b[0]);
  return AD_BR.map(b => b[0]).filter(c => sel.branch.includes(c));
}
function adBranchLabel() {
  const c = adCodes();
  if (typeof sel === 'undefined' || !sel.branch || sel.branch.includes('all') || c.length === AD_BR.length) return 'UAE Branches';
  return c.length ? c.map(x => AD_BR.find(b => b[0] === x)[1]).join(' + ') : (sel.branch || []).join(' + ');
}
function adRange() {
  const from = typeof dateFrom !== 'undefined' && dateFrom ? dateToIso(dateFrom) : '0000-01-01';
  const to = typeof dateTo !== 'undefined' && dateTo ? dateToIso(dateTo) : '9999-12-31';
  return { from, to };
}
function adPeriodLabel() {
  const key = typeof activePeriodKey === 'function' ? activePeriodKey() : '';
  if (key && key !== 'Custom' && key !== 'Month' && key !== 'Year') return key;
  const r = adRange();
  return r.from === r.to ? adDay(r.from) : adDay(r.from) + ' to ' + adDay(r.to);
}
const adIn = r => { const w = adRange(), c = adCodes(); return r[2] >= w.from && r[2] <= w.to && c.includes(r[1]); };
const adRowsOf = k => (adData ? adData.rows : []).filter(r => r[0] === k && adIn(r));
const adSold = k => adSum(adRowsOf(k), r => r[3]);
const adPaid = k => adSum(adRowsOf(k), r => r[4]);
const adBrOf = (k, b) => adSum(adRowsOf(k).filter(r => r[1] === b), r => r[3]);

// ── LOAD ────────────────────────────────────────────────────────────────────
async function renderDealsPerf(force) {
  const el = document.getElementById('dealsPerfContent');
  if (!el || !adOk()) return;
  if (adData && !force) { adPaint(); return; }
  if (adBusy) return;
  adBusy = true; adErr = '';
  el.innerHTML = '<div class="ad-state">Reading the till…</div>';
  try {
    const { data, error } = await sb.rpc('active_deals_performance');
    if (error || !data || !Array.isArray(data.rows)) throw error || new Error('no report');
    adData = data;
  } catch (e) { console.error(e); adErr = 'The report did not load. Press Refresh to try again.'; }
  adBusy = false;
  adPaint();
}

function adMini(n, of) { return `<span class="ad-mini" aria-hidden="true"><i style="width:${Math.min(100, of ? n / of * 100 : 0)}%"></i></span>${adPc(n, of)}`; }
const adBc = n => n ? n : '<span class="ad-zero">–</span>';
function adTop(offs) { return offs.slice().sort((a, b) => b.sold - a.sold)[0]; }

// ── PAINT ───────────────────────────────────────────────────────────────────
function adPaint() {
  const el = document.getElementById('dealsPerfContent');
  if (!el) return;
  const head = `<div class="ad-top"><div><h1 class="ad-t">Active Deals Performance</h1><p class="ad-sub">${adData ? 'As of ' + adEsc(adWhen(adData.at)) + '. Phorest sales, deals on the brochure.' : ''}</p></div>
    <div class="ad-toplinks"><button class="ad-btn" type="button" onclick="renderDealsPerf(true)">Refresh</button>
    <button class="ad-btn" type="button" onclick="adSave()">Save as xlsx</button>
    <a class="ad-btn" href="https://promo.tararosesalon.com/active-deals-brochure" target="_blank" rel="noopener">Open the brochure</a></div></div>`;
  if (adErr || !adData) { el.innerHTML = head + `<div class="ad-state">${adEsc(adErr || 'No report yet.')}</div>`; adRail(false); return; }

  const offs = AD_OFFERS.map(o => Object.assign({ sold: adSold(o.k), paid: adPaid(o.k) }, o));
  const total = adSum(offs, o => o.sold), cash = adSum(offs, o => o.paid);
  if (!total) {
    const key = typeof activePeriodKey === 'function' ? activePeriodKey() : '';
    const named = key && key !== 'Custom' && key !== 'Month' && key !== 'Year';
    el.innerHTML = head + `<section class="ad-card"><div class="ad-empty">No brochure deals were sold at ${adEsc(adBranchLabel())} in ${adEsc(named ? adPeriodLabel().toLowerCase() : adPeriodLabel())}.
      ${key !== 'All time' ? `<button type="button" class="ad-btn" style="margin-left:6px" onclick="document.querySelector('#periodChips .chip[data-v=&quot;All time&quot;]')?.click()">See all time instead</button>` : 'Widen the Branch in the header.'}</div></section>`;
    adM = null; adRail(false); return;
  }
  const w = adRange(), today = dateToIso(new Date());
  const brochure = r => AD_OFFERS.some(o => o.k === r[0]);
  const allB = adData.rows.filter(brochure);
  const firstSale = allB.reduce((a, r) => !a || r[2] < a ? r[2] : a, '');
  const inRows = allB.filter(adIn);
  const lastSale = inRows.reduce((a, r) => r[3] > 0 && r[2] > a ? r[2] : a, '');
  // The chart: days up to a month, weeks up to about four months, months after that; from the first brochure sale inside the window to the end of it.
  const start = w.from > firstSale ? w.from : firstSale, end = w.to < today ? w.to : today;
  const spanDays = Math.max(1, Math.round((new Date(end + 'T12:00:00') - new Date(start + 'T12:00:00')) / 86400000) + 1);
  const unit = spanDays <= 31 ? 'day' : spanDays <= 140 ? 'week' : 'month';
  const buckets = adBuckets(start, end, unit);
  const codes = adCodes();
  buckets.forEach(b => { const rs = allB.filter(r => r[2] >= b.a && r[2] <= b.b && codes.includes(r[1])); b.n = adSum(rs, r => r[3]); b.t = adSum(rs, r => r[4]); });
  const best = adTop(offs), busy = buckets.slice().sort((a, b) => b.n - a.n)[0];
  const withSale = offs.filter(o => o.sold > 0).length;
  const perMonth = total / (spanDays / 30.44);

  const brs = AD_BR.map(b => {
    const rs = allB.filter(r => r[1] === b[0] && r[2] >= w.from && r[2] <= w.to);
    const top = AD_OFFERS.map(o => ({ n: o.n, v: adSum(rs.filter(r => r[0] === o.k), r => r[3]) })).sort((x, y) => y.v - x.v)[0];
    return { code: b[0], name: b[1], on: codes.includes(b[0]), n: adSum(rs, r => r[3]), a: adSum(rs, r => r[4]), top: top && top.v ? top.n.split(':')[0] : '' };
  });
  const brN = adSum(brs, b => b.n), brA = adSum(brs, b => b.a);
  const rowsO = offs.slice().sort((a, b) => b.sold - a.sold || b.paid - a.paid);
  const cats = AD_CATS.map(c => { const l = offs.filter(o => o.cat === c[0]); return { name: c[0], color: c[1], n: adSum(l, o => o.sold), a: adSum(l, o => o.paid), d: l.length }; });
  adM = { buckets, unit, brs, cats, cash, total, offs, rowsO };

  const unitName = { day: 'day', week: 'week', month: 'month' }[unit];
  let h = head;
  h += `<section class="ad-card" id="ad-headline"><div class="ad-hero"><div>
      <div class="ad-cap">Brochure deals sold</div><div class="ad-big">${total} <small>sales, ${adAed(cash)}</small></div>
      <div class="ad-track"><div class="ad-fill" style="width:${Math.round(withSale / AD_TOTAL_DEALS * 100)}%"></div></div>
      <div class="ad-cap">${withSale} of ${AD_TOTAL_DEALS} deals on the brochure have a sale in this window</div></div>
    <div class="ad-pace"><div class="ad-status warn"><span aria-hidden="true">!</span>Counts ${withSale} of ${AD_TOTAL_DEALS} deals, 4 cannot be traced</div>
      <div class="ad-row"><span>Averaging so far</span><b>${perMonth.toFixed(1)} sales a month</b></div>
      <div class="ad-row"><span>Busiest ${unitName}</span><b>${adEsc(adBucketLabel(busy, unit))}, ${busy.n} sale${busy.n === 1 ? '' : 's'}</b></div>
      <div class="ad-row"><span>Latest sale</span><b>${lastSale ? adEsc(adDay(lastSale)) : 'none'}</b></div>
      <div class="ad-row"><span>Best seller</span><b>${adEsc(best.n.split(':')[0])}</b></div></div></div></section>`;

  h += `<div class="ad-tiles">${[
    ['Deals sold', `${total} <small style="font-family:var(--sans);font-size:13px;color:var(--muted);font-weight:500">sales</small>`, 'brochure deals, at the till', ''],
    ['AED sold', adAed(cash), 'paid by clients, VAT included', ''],
    ['Average sale', adAed(cash / total), 'per sale', ''],
    ['Best seller', adEsc(best.n.split(':')[0]), best.sold + ' sales', 'txt'],
    ['Deals with a sale', `${withSale} of ${AD_TOTAL_DEALS}`, (AD_TOTAL_DEALS - withSale) + ' without one', '']
  ].map(t => `<div class="ad-tile"><div class="l">${t[0]}</div><div class="v ${t[3]}">${t[1]}</div><div class="h">${t[2]}</div></div>`).join('')}</div>`;

  h += `<section class="ad-card" id="ad-month"><h2>Sales per ${unitName}</h2><p class="ad-sub">Whether the deals keep selling: brochure deals bought each ${unitName}, by the date of the sale.</p>
    <div class="ad-chart" id="adMonChart"></div>
    <details><summary>Show as table</summary><div id="adMonTable"></div></details></section>`;

  h += `<section class="ad-card" id="ad-branch"><h2>By branch</h2><p class="ad-sub">Which salon is selling the deals: the cash taken at each one. Branches outside your header filter are shown faded.</p>
    <div class="ad-chart" id="adBrChart"></div>
    <details><summary>Show as table</summary><div><table><thead><tr><th>Branch</th><th class="n">Sold</th><th class="n">AED</th><th class="n">Share</th><th>Best seller</th></tr></thead><tbody>${
      brs.map(b => `<tr${b.on ? '' : ' style="opacity:.45"'}><td>${b.name}</td><td class="n">${b.n}</td><td class="n">${adAed(b.a)}</td><td class="n">${adPc(b.a, brA)}</td><td>${adEsc(b.top)}</td></tr>`).join('')
    }<tr class="tot"><td>Total</td><td class="n">${brN}</td><td class="n">${adAed(brA)}</td><td class="n">100%</td><td></td></tr></tbody></table></div></details></section>`;

  const brHead = AD_BR.map(b => `<th class="n">${b[1]}</th>`).join('');
  h += `<section class="ad-card" id="ad-offer"><h2>By offer</h2><p class="ad-sub">How each deal on the brochure is doing: the sales at each branch, the cash, and how sure we are of the match.</p>
    <details class="more"><summary>How this is counted</summary><p class="ad-sub">A package is rung as one sale made of lines named after the offer, so we count sales, not lines. Blonding and Balayage on the brochure are Phorest’s Full Blonde Package and Full Balayage Package, matched by price and components, so they carry a Confirm name tag until Emma says yes.</p></details>
    <div><table><thead><tr><th>Offer</th>${brHead}<th class="n">Sold</th><th class="n">AED</th><th>Share</th><th>Match</th></tr></thead><tbody>${
      rowsO.map(o => `<tr><td>${adEsc(o.n)}<small>Slide ${o.s} · AED ${o.p}${o.ph ? ' · ' + adEsc(o.ph) : ''}</small></td>${AD_BR.map(b => `<td class="n">${adBc(adBrOf(o.k, b[0]))}</td>`).join('')}<td class="n"><b>${o.sold}</b></td><td class="n">${adAed(o.paid)}</td><td>${adMini(o.paid, cash)}</td><td><span class="ad-tag ${o.c}">${o.ct}</span></td></tr>`).join('')
    }<tr class="tot"><td>Total</td>${AD_BR.map(b => `<td class="n">${adBc(adSum(offs, o => adBrOf(o.k, b[0])))}</td>`).join('')}<td class="n">${total}</td><td class="n">${adAed(cash)}</td><td>${adMini(cash, cash)}</td><td></td></tr></tbody></table></div>
    <h3 class="ad-subh">Older look-alike offers</h3><p class="ad-sub">Not on the brochure, shown so they are not mixed in.</p>
    <div><table><thead><tr><th>Offer</th>${brHead}<th class="n">Sold</th><th class="n">AED</th><th>Match</th></tr></thead><tbody>${
      AD_OLDER.map(o => `<tr><td>${adEsc(o.n)}<small>AED ${o.p}</small></td>${AD_BR.map(b => `<td class="n">${adBc(adBrOf(o.k, b[0]))}</td>`).join('')}<td class="n"><b>${adSold(o.k)}</b></td><td class="n">${adAed(adPaid(o.k))}</td><td><span class="ad-tag ${o.c}">${o.ct}</span></td></tr>`).join('')
    }</tbody></table></div></section>`;

  h += `<div class="ad-grid2" id="ad-type"><section class="ad-card"><h2>By type</h2><p class="ad-sub">What kind of deal is selling: the share of cash for hair colour, hair treatment and beauty.</p>
      <div class="ad-chart" id="adCatChart"></div><div class="ad-legend">${cats.map(c => `<span><i style="background:${c.color}"></i>${c.name} · ${c.n} sold · ${adPc(c.a, cash)}</span>`).join('')}</div>
      <div style="margin-top:14px"><table><thead><tr><th>Type</th><th class="n">Deals</th><th class="n">Sold</th><th class="n">AED</th></tr></thead><tbody>${
        cats.map(c => `<tr><td><span class="ad-dot" style="background:${c.color}"></span>${c.name}</td><td class="n">${c.d}</td><td class="n">${c.n}</td><td class="n">${adAed(c.a)}</td></tr>`).join('')
      }<tr class="tot"><td>Total</td><td class="n">${offs.length}</td><td class="n">${total}</td><td class="n">${adAed(cash)}</td></tr></tbody></table></div></section>
    <section class="ad-card" id="ad-cant"><h2>Cannot be traced</h2><p class="ad-sub">Four deals on the brochure leave nothing to count at the till.</p>
      <ul class="ad-list">${AD_CANT.map(c => `<li><b>${adEsc(c[0])}</b>${adEsc(c[1])}</li>`).join('')}</ul></section></div>`;

  h += `<section class="ad-card" id="ad-ask"><h2>Waiting on a word</h2><p class="ad-sub">These need an answer before the numbers can be quoted outside the team.</p><ol class="ad-ask">
      <li><b>Emma:</b> are Blonding 999 and Classic Balayage 999 on the slides the same as Phorest’s Full Blonde Package and Full Balayage Package? They hold most of the sales.</li>
      <li><b>Tara or Emma:</b> which colour slides priced over the 30% ceiling are still active? No slide has an end date.</li>
      <li><b>Reception:</b> Polish and Pamper 350 at Khalifa City A shows 34 sales from 7 clients. Were components rung as separate sales?</li></ol></section>
    <details class="more"><summary>How these numbers are counted</summary>
      <p class="ad-sub">Sold is distinct sales (branch, date, sale id). AED is what the client paid for the offer’s own lines, VAT included, with a refund taken off the day it was given.</p>
      <p class="ad-sub">A later single line from a package (a redemption) is not counted as a sale. A refunded package still counts as one sale.</p>
      <p class="ad-sub">Bahrain has no lines for any of these. Fratelli and Marasy are closed and not shown. Data comes from the daily Phorest Sales Transactions upload, so today’s sales appear after the nightly run.</p></details>`;

  el.innerHTML = h;
  adCharts();
  adRail(true);
}

// Day, Monday-start week or calendar month buckets between two ISO dates.
function adBuckets(a, b, unit) {
  const out = [], iso = d => dateToIso(d);
  let d = new Date(a + 'T12:00:00'); const stop = new Date(b + 'T12:00:00');
  if (unit === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  if (unit === 'month') d = new Date(d.getFullYear(), d.getMonth(), 1, 12);
  for (let g = 0; d <= stop && g < 400; g++) {
    const s = new Date(d);
    let e;
    if (unit === 'day') e = new Date(d);
    else if (unit === 'week') e = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 6, 12);
    else e = new Date(d.getFullYear(), d.getMonth() + 1, 0, 12);
    out.push({ a: iso(s), b: iso(e), n: 0, t: 0 });
    d = unit === 'day' ? new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 12) : unit === 'week' ? new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7, 12) : new Date(d.getFullYear(), d.getMonth() + 1, 1, 12);
  }
  return out;
}
function adBucketLabel(b, unit) {
  if (!b) return '';
  if (unit === 'month') { const [y, m] = b.a.split('-').map(Number); return AD_MON[m - 1] + ' ' + y; }
  if (unit === 'week') return 'Week of ' + adShort(b.a);
  return adShort(b.a);
}
function adAxis(b, unit) {
  if (unit === 'month') return AD_MON[+b.a.slice(5, 7) - 1].slice(0, 3);
  return adShort(b.a);
}

// ── CHARTS (hand-drawn SVG, the Wellness Voucher page's style) ──────────────
function adTipHost() {
  const c = document.getElementById('dealsPerfContent');
  let t = document.getElementById('adTip');
  if (!t && c) { t = document.createElement('div'); t.id = 'adTip'; t.className = 'ad-tip'; c.appendChild(t); }
  return t;
}
function adHover(host, selector, fn) {
  const tip = adTipHost(), box = document.getElementById('dealsPerfContent');
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
function adCharts() {
  if (!adM || !document.getElementById('adMonChart')) return;
  const { buckets, unit, brs, cats, cash } = adM;
  let host = document.getElementById('adMonChart'), W = Math.max(300, host.clientWidth), H = 210, L = 38, R = 8, T = 14, B = 26;
  const ymax = Math.max(4, Math.ceil(Math.max(...buckets.map(x => x.n)) / 4) * 4), bw = (W - L - R) / buckets.length;   // counts: whole-number gridlines
  const Y = v => T + (1 - v / ymax) * (H - T - B);
  const every = Math.max(1, Math.ceil(buckets.length / Math.floor((W - L) / 54)));
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Brochure deals sold per ${unit}">`;
  for (let g = 0; g <= ymax + 1e-9; g += ymax / 4) s += `<line class="gl" x1="${L}" x2="${W - R}" y1="${Y(g)}" y2="${Y(g)}"/><text class="ax" x="${L - 6}" y="${Y(g) + 4}" text-anchor="end">${Math.round(g)}</text>`;
  buckets.forEach((x, i) => {
    const gap = Math.min(3, bw / 4), bx = L + i * bw + gap, bwi = Math.max(2, bw - gap * 2), h = Y(0) - Y(x.n), rr = Math.min(4, h, bwi / 2);
    if (x.n) {
      s += `<path d="M${bx} ${Y(0)} v${-(h - rr)} q0 -${rr} ${rr} -${rr} h${bwi - 2 * rr} q${rr} 0 ${rr} ${rr} v${h - rr}Z" fill="var(--series)"/>`;
      if (bw > 20) s += `<text class="ax" x="${bx + bwi / 2}" y="${Y(x.n) - 5}" text-anchor="middle" style="fill:var(--ink);font-weight:600">${x.n}</text>`;
    }
    if (i % every === 0) s += `<text class="ax" x="${bx + bwi / 2}" y="${H - 6}" text-anchor="middle">${adAxis(x, unit)}</text>`;
    s += `<rect x="${L + i * bw}" y="${T}" width="${bw}" height="${H - T - B}" fill="transparent" data-i="${i}"/>`;
  });
  host.innerHTML = s + '</svg>';
  adHover(host, 'rect[data-i]', i => { const x = buckets[i]; return `<b>${adEsc(adBucketLabel(x, unit))}</b><br>${x.n} sale${x.n === 1 ? '' : 's'} · ${adAed(x.t)}`; });
  document.getElementById('adMonTable').innerHTML = `<table><thead><tr><th>${unit === 'month' ? 'Month' : unit === 'week' ? 'Week of' : 'Day'}</th><th class="n">Sales</th><th class="n">AED</th></tr></thead><tbody>${
    buckets.map(x => `<tr><td>${adEsc(adBucketLabel(x, unit).replace('Week of ', ''))}</td><td class="n">${x.n}</td><td class="n">${adAed(x.t)}</td></tr>`).join('')}</tbody></table>`;

  host = document.getElementById('adBrChart'); W = Math.max(300, host.clientWidth);
  const narrow = W < 460, rowH = 34, H2 = brs.length * rowH + 4, L2 = narrow ? 88 : 104, R2 = narrow ? 118 : 150, mx = Math.max(...brs.map(r => r.a)) || 1;
  s = `<svg viewBox="0 0 ${W} ${H2}" role="img" aria-label="Cash taken by branch">`;
  brs.forEach((r, i) => {
    const y = i * rowH + 6, w = r.a > 0 ? Math.max(4, r.a / mx * (W - L2 - R2)) : 0;
    s += `<g opacity="${r.on ? 1 : .35}"><text class="ax" x="0" y="${y + 15}" style="fill:var(--ink2);font-size:12px">${r.name}</text>`;
    if (w) s += `<rect x="${L2}" y="${y}" width="${w}" height="20" rx="4" fill="var(--series)"/>`;
    s += `<text class="ax" x="${L2 + w + 8}" y="${y + 15}" style="fill:var(--ink);font-size:12px">${adAed(r.a)} · ${r.n} sold</text></g><rect x="0" y="${y - 5}" width="${W}" height="${rowH}" fill="transparent" data-i="${i}"/>`;
  });
  host.innerHTML = s + '</svg>';
  adHover(host, 'rect[data-i]', i => { const r = brs[i]; return `<b>${r.name}</b><br>${r.n} sales · ${adAed(r.a)}<br>${r.top ? 'Best seller: ' + adEsc(r.top) : 'No sales'}`; });

  host = document.getElementById('adCatChart'); W = Math.max(300, host.clientWidth);
  const parts = cats.filter(c => c.a > 0); let x0 = 0; const tot = cash || 1;
  s = `<svg viewBox="0 0 ${W} 30" role="img" aria-label="Cash by type of deal">`;
  parts.forEach((c, i) => { const w = c.a / tot * W - (i < parts.length - 1 ? 2 : 0); s += `<rect x="${x0}" y="0" width="${Math.max(0, w)}" height="30" rx="4" fill="${c.color}" data-i="${i}"/>`; x0 += w + 2; });
  host.innerHTML = s + '</svg>';
  adHover(host, 'rect[data-i]', i => { const c = parts[i]; return `<b>${c.name}</b><br>${c.n} sold · ${adAed(c.a)} (${adPc(c.a, tot)})`; });
}
window.addEventListener('resize', () => {
  clearTimeout(adResize);
  adResize = setTimeout(() => { const v = document.getElementById('view-dealsperf'); if (v && v.offsetParent) adCharts(); }, 120);
});

// ── ON THIS PAGE rail (the same shell as Wellness Voucher Performance's) ────
const AD_RAIL = [['ad-headline', 'Headline'], ['ad-month', 'Sales over time'], ['ad-branch', 'By branch'], ['ad-offer', 'By offer'], ['ad-type', 'Type and not traced'], ['ad-ask', 'Waiting on a word']];
function adRail(on) {
  const shell = document.getElementById('adShell'), side = document.getElementById('adSide');
  if (!shell || !side) return;
  shell.classList.toggle('rv-norail', !on);
  const nav = side.querySelector('.side-nav');
  if (nav && on && !nav.dataset.sig) {
    nav.dataset.sig = '1';
    nav.innerHTML = '<div class="side-k">On this page</div>' + AD_RAIL.map(r => `<a href="#${r[0]}" onclick="lgJump(event,'${r[0]}')">${r[1]}</a>`).join('');
  }
  if (typeof spy === 'function') spy();
}

// ── SAVE AS XLSX (what the page shows now: the window, the offers, the days) ─
function adSave() {
  if (!adData || typeof lgxBuild !== 'function') return;
  const w = adRange(), codes = adCodes();
  const offerCols = [{ label: 'Offer', fmt: 'text' }, { label: 'Slide', fmt: 'text' }, { label: 'Price (AED)', fmt: 'text' }, ...AD_BR.map(b => ({ label: b[1], fmt: 'num' })), { label: 'Sold', fmt: 'num' }, { label: 'AED', fmt: 'aed' }, { label: 'Match', fmt: 'text' }];
  const offerRow = (o, slide) => ({ cells: [o.n, slide || '', o.p, ...AD_BR.map(b => adBrOf(o.k, b[0])), adSold(o.k), Math.round(adPaid(o.k)), o.ct] });
  const days = adData.rows.filter(adIn).sort((a, b) => a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0).map(r => {
    const o = AD_OFFERS.concat(AD_OLDER).find(x => x.k === r[0]);
    return { cells: [r[2], o ? o.n : r[0], AD_BR.find(b => b[0] === r[1])[1], r[3], Math.round(r[4])] };
  });
  const built = lgxBuild({ sheets: [
    { name: 'Summary', blocks: [{ cols: [{ label: 'Active Deals Performance', fmt: 'text' }, { label: '', fmt: 'text' }], rows: [
      { cells: ['Branches', adBranchLabel()] }, { cells: ['Period', adPeriodLabel()] }, { cells: ['From', w.from === '0000-01-01' ? 'first sale' : w.from] }, { cells: ['To', w.to] },
      { cells: ['Report made', adWhen(adData.at)] }, { cells: ['Counted', 'Distinct sales (branch, date, sale id). AED is the till total, VAT included, a refund off the day it was given.'] }] }] },
    { name: 'By offer', blocks: [{ cols: offerCols, rows: AD_OFFERS.map(o => offerRow(o, 'Slide ' + o.s)).concat(AD_OLDER.map(o => offerRow(o, 'Older offer'))) }] },
    { name: 'By day', blocks: [{ cols: [{ label: 'Date', fmt: 'text' }, { label: 'Offer', fmt: 'text' }, { label: 'Branch', fmt: 'text' }, { label: 'Sales', fmt: 'num' }, { label: 'AED', fmt: 'aed' }], rows: days }] }
  ] });
  const stamp = dateToIso(new Date());
  lgxSave(lgxXlsxBlob(built), 'active-deals-performance-' + stamp + '.xlsx');
}
