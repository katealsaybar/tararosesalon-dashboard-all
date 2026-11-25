// Active Deals Performance (Kate, 23 Oct 2026): how many times each deal on the active deals brochure (www.tararosesalon.com/en/ae/active-deals/)
// was bought at the till, in the Campaigns group beside Wellness Voucher Performance, in that page's format (headline, tiles, charts with a table
// behind them, a branch card, tables with a Total row). Numbers from active_deals_performance() (migrations/active_deals_performance.sql), Level 2 and
// above, no client names: one row per offer, branch and day, fetched once and filtered here, so a Branch or Period change in the masthead redraws at once.
// Kate's rulings of 23 Oct 2026: no filter bar of its own (sel.branch and dateFrom/dateTo are the masthead's), phone first. Self-contained: it needs sb,
// TRS_LEVEL, sel, dateFrom, dateTo, activePeriodKey(), dateToIso() and, for Save as xlsx, the lgx group (ledger-export.js).
const AD_BR = [['SAA', 'Saadiyat'], ['KCA', 'Khalifa City A'], ['MC', 'Motor City'], ['AQ', 'Al Quoz']];
// The twelve deals on the brochure that can be counted: nine leave a name at the till, three are counted by price. Best first by sales is worked out on the fly. cat groups them for By type.
// c/ct = how sure the match is: Blonding and Balayage are Phorest's Full Blonde / Full Balayage Package (name confirmed, Kate 25 Nov 2026).
const AD_OFFERS = [
  { k: 'Blonding', n: 'Blonding Package', p: '999', s: 4, cat: 'Hair colour', ph: 'Phorest: Full Blonde Package', c: 'ok', ct: 'Exact' },
  { k: 'Balayage', n: 'Classic Balayage Package', p: '999', s: 5, cat: 'Hair colour', ph: 'Phorest: Full Balayage Package', c: 'ok', ct: 'Exact' },
  { k: 'P599', n: '599 Package: deep cleansing facial + gel mani and pedi', p: '599', s: 13, cat: 'Beauty', c: 'ok', ct: 'Exact' },
  { k: 'Brunette', n: 'Brunette Package', p: '599', s: 6, cat: 'Hair colour', c: 'ok', ct: 'Exact' },
  { k: 'RefreshBlonde', n: 'Refresh Blonde Package', p: '599', s: 3, cat: 'Hair colour', c: 'ok', ct: 'Exact' },
  { k: 'Sunkissed', n: 'Signature Sunkissed Brunette', p: '799', s: 7, cat: 'Hair colour', c: 'ok', ct: 'Exact' },
  { k: 'P350', n: '350 Package: gel mani and pedi + blow dry', p: '350', s: 12, cat: 'Beauty', c: 'ok', ct: 'Exact' },
  { k: 'P450', n: '450 Package: cut, finish, treatment', p: '450', s: 11, cat: 'Hair treatment', c: 'ok', ct: 'Exact' },
  { k: 'P300', n: '300 Package: treatment + blow dry', p: '300', s: 10, cat: 'Hair treatment', c: 'ok', ct: 'Exact' },
  // Traced by PRICE (Kate, 24 Nov 2026): no package line at the till, so these count a sale whose lines make the brochure price. See the SQL header.
  { k: 'RefreshBalayage', n: 'Refresh Balayage Package', p: '499', s: 2, cat: 'Hair colour', ph: 'Price test: face frame + toner + treatment = 499', c: 'warn', ct: 'Price test' },
  { k: 'MixMatch', n: 'Mix and Match: any 3 beauty services', p: '499', s: 9, cat: 'Beauty', ph: 'Price test: 3 of the 7 services = 499', c: 'warn', ct: 'Price test' },
  { k: 'New25', n: '25% off beauty, new clients', p: '25%', pl: '25% off, min AED 200', s: 15, cat: 'Beauty', ph: 'Price test: first visit, beauty at exactly 25% off', c: 'warn', ct: 'Price test' }
];
const AD_OLDER = [
  { k: 'Polish350', n: 'Polish and Pamper (older 350)', p: '350', c: 'warn', ct: 'Check KCA' },
  { k: 'ADS499', n: 'ADS Hydrafacial + Blow dry (older 499)', p: '499', c: 'na', ct: 'Older offer' }
];
// Upper bound only (Kate, 24 Nov 2026): the till rings a free line as "(Treat)" at AED 0 for any gift, so this over-counts. Kept out of every total, shown apart.
const AD_UB = [
  { k: 'ExtCare', n: 'Extension Care Package', p: 'Free', pl: 'Free treatment and trim', s: 8, ct: 'Upper bound' }
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
// The brochure slide for a deal (Kate, 25 Nov 2026): assets/active-deals/<k>.webp, tap to open it full size.
const adSlide = (k, alt) => `<a class="ad-th" href="assets/active-deals/${k}.webp" target="_blank" rel="noopener" title="Open the slide"><img src="assets/active-deals/${k}.webp" alt="${adEsc(alt)} slide" loading="lazy" width="44" height="78"></a>`;
// ── CLICKABLE FIGURES (Kate, 25 Nov 2026: "values should be clickable, always") ─────────────────────────────────────────────────
// Every count and AED on this page opens the rows behind it (drill.js, TRSD): by offer, by branch and by day, and a figure inside a window opens the next one down.
// br: null = the masthead's branches, '*' = all four, a code = that branch alone. rng {a, b} = a chart bucket instead of the masthead's period.
// The last step is a day: the till lines behind a day (sale id, paid) are not on this page yet, so a day's figures stay plain and the window says so.
const AD_KEYS = AD_OFFERS.map(o => o.k);
const adOne = k => AD_OFFERS.concat(AD_OLDER, AD_UB).find(x => x.k === k) || { n: k };
const adBrName = c => (AD_BR.find(b => b[0] === c) || [c, c])[1];
function adWin(keys, br, base, rng) {
  if (typeof TRSD === 'undefined' || !adData) return null;
  const w = adRange(), codes = br === '*' ? AD_BR.map(b => b[0]) : br ? [br] : adCodes();
  const one = br && br !== '*';
  const rows = () => adData.rows.filter(r => keys.includes(r[0]) && codes.includes(r[1]) && (rng ? r[2] >= rng.a && r[2] <= rng.b : r[2] >= w.from && r[2] <= w.to));
  const sum = (l, i) => l.reduce((a, r) => a + r[i], 0);
  const multiO = keys.length > 1, multiB = codes.length > 1;
  const where = one ? adBrName(br) : codes.length === AD_BR.length ? 'UAE Branches' : codes.map(adBrName).join(' + ');
  const when = rng ? (rng.a === rng.b ? adDay(rng.a) : adDay(rng.a) + ' to ' + adDay(rng.b)) : adPeriodLabel();
  const sub = where + ' · ' + when;
  const views = [];
  if (multiO) views.push({ id: 'offer', label: 'By offer', load: async () => {
    const rs = rows(), cash = sum(rs, 4);
    const list = keys.map(k => { const x = rs.filter(r => r[0] === k); return { k, n: sum(x, 3), a: sum(x, 4) }; }).sort((a, b) => b.n - a.n || b.a - a.a);
    return { sub, cols: [{ k: 'o', l: 'Offer' }, { k: 'n', l: 'Sold', t: 'num' }, { k: 'a', l: 'AED', t: 'aed' }, { k: 'p', l: 'Share', t: 'pct' }],
      rows: list.map(x => { const sp = x.n ? adWin([x.k], br, adOne(x.k).n, rng) : null; return { o: adOne(x.k).n, n: x.n, a: x.a, p: cash ? x.a / cash * 100 : 0, _dn: sp ? { n: sp, a: sp } : null }; }),
      foot: { o: 'Total', n: sum(rs, 3), a: cash, p: cash ? 100 : 0 } };
  } });
  if (multiB) views.push({ id: 'branch', label: 'By branch', load: async () => {
    const rs = rows(), cash = sum(rs, 4);
    return { sub, cols: [{ k: 'b', l: 'Branch' }, { k: 'n', l: 'Sold', t: 'num' }, { k: 'a', l: 'AED', t: 'aed' }, { k: 'p', l: 'Share', t: 'pct' }],
      rows: codes.map(c => { const x = rs.filter(r => r[1] === c), n = sum(x, 3), sp = n ? adWin(keys, c, base, rng) : null; return { b: adBrName(c), n, a: sum(x, 4), p: cash ? sum(x, 4) / cash * 100 : 0, _dn: sp ? { n: sp, a: sp } : null }; }),
      foot: { b: 'Total', n: sum(rs, 3), a: cash, p: cash ? 100 : 0 } };
  } });
  views.push({ id: 'day', label: 'By day', load: async () => {
    const rs = rows().filter(r => r[3] || r[4]).sort((a, b) => a[2] < b[2] ? 1 : a[2] > b[2] ? -1 : 0);
    return { sub, note: 'A day is the last step here: the till lines behind it (sale id, what was paid) are not on this page yet.',
      cols: [{ k: 'd', l: 'Date', t: 'date' }].concat(multiO ? [{ k: 'o', l: 'Offer' }] : [], multiB ? [{ k: 'b', l: 'Branch' }] : [], [{ k: 'n', l: 'Sold', t: 'num' }, { k: 'a', l: 'AED', t: 'aed' }]),
      rows: rs.map(r => ({ d: r[2], o: adOne(r[0]).n, b: adBrName(r[1]), n: r[3], a: r[4] })),
      foot: { d: 'Total', n: sum(rs, 3), a: sum(rs, 4) } };
  } });
  return { title: base + (one ? ' · ' + adBrName(br) : ''), tip: 'See the sales', cur: 'AED', views };
}
// A figure that opens its sales. Zero stays plain (nothing behind it), and so does a figure when drill.js is not on the page.
const adN = (html, n, keys, br, base, rng) => (n && keys && keys.length && typeof TRSD !== 'undefined') ? TRSD.num(html, adWin(keys, br, base, rng)) : html;
let adTs = {};
// One Google Sheets table (sheet-table.js): sort and filter on every heading, and it keeps its filters when the page redraws.
function adMake(id, rows, cols, total, extra) {
  if (typeof TRSheet === 'undefined' || !document.getElementById(id)) return null;
  const old = adTs[id];
  const T = TRSheet.table(Object.assign({ id, el: '#' + id, rows: () => rows, cols, total }, extra || {}));
  if (old) { T.f = old.f; T.sort = old.sort; }
  adTs[id] = T; T.draw(); return T;
}
const adPhoneBtn = id => `<button type="button" class="ad-btn ad-phone" data-sxcm="${id}" aria-label="Sort and filter">Sort or filter</button>`;
const adCol = (k, l, t, raw, disp, cell, x) => ({ k, l, t, raw, disp, cell, x });
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
    <button class="ad-btn" type="button" onclick="adSave()">Save as xlsx</button> <button class="ad-btn" type="button" onclick="adSave('csv')" title="The By offer tab as a CSV">Save as csv</button>
    <a class="ad-btn" href="https://www.tararosesalon.com/en/ae/active-deals/" target="_blank" rel="noopener">Open the brochure</a></div></div>`;
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
  let h = head + whyWall([
    ['Why this page', 'It counts how many times each deal on the active deals brochure was bought at the till, so we see which deals sell and which do not.'],
    ['Why now', 'No deal on the slides has an end date, so this is how we see whether they keep selling.'],
    ['If we do nothing', 'A deal that sells nothing stays on the brochure, and a good one never gets more push.']]);
  h += `<section class="ad-card" id="ad-headline"><div class="ad-hero"><div>
      <div class="ad-cap">Brochure deals sold</div><div class="ad-big">${adN(`${total} <small>sales, ${adAed(cash)}</small>`, total, AD_KEYS, null, 'Brochure deals sold')}</div>
      <div class="ad-track"><div class="ad-fill" style="width:${Math.round(withSale / AD_TOTAL_DEALS * 100)}%"></div></div>
      <div class="ad-cap">${withSale} of ${AD_TOTAL_DEALS} deals on the brochure have a sale in this window</div></div>
    <div class="ad-pace"><div class="ad-status warn"><span aria-hidden="true">!</span>Counts ${withSale} of ${AD_TOTAL_DEALS} deals, Extension Care shown apart</div>
      <div class="ad-row"><span>Averaging so far</span><b>${perMonth.toFixed(1)} sales a month</b></div>
      <div class="ad-row"><span>Busiest ${unitName}</span><b>${adEsc(adBucketLabel(busy, unit))}, ${busy.n} sale${busy.n === 1 ? '' : 's'}</b></div>
      <div class="ad-row"><span>Latest sale</span><b>${lastSale ? adEsc(adDay(lastSale)) : 'none'}</b></div>
      <div class="ad-row"><span>Best seller</span><b>${adEsc(best.n.split(':')[0])}</b></div></div></div></section>`;

  h += `<div class="ad-tiles">${[
    ['Deals sold', adN(`${total} <small style="font-family:var(--sans);font-size:13px;color:var(--muted);font-weight:500">sales</small>`, total, AD_KEYS, null, 'Brochure deals sold'), 'brochure deals, at the till', ''],
    ['AED sold', adN(adAed(cash), total, AD_KEYS, null, 'Brochure deals sold'), 'paid by clients, VAT included', ''],
    ['Average sale', adAed(cash / total), 'per sale', ''],
    ['Best seller', adN(adEsc(best.n.split(':')[0]), best.sold, [best.k], null, best.n), adN(best.sold + ' sales', best.sold, [best.k], null, best.n), 'txt'],
    ['Deals with a sale', adN(`${withSale} of ${AD_TOTAL_DEALS}`, total, AD_KEYS, null, 'Brochure deals sold'), (AD_TOTAL_DEALS - withSale) + ' without one', '']
  ].map(t => `<div class="ad-tile"><div class="l">${t[0]}</div><div class="v ${t[3]}">${t[1]}</div><div class="h">${t[2]}</div></div>`).join('')}</div>`;

  h += `<section class="ad-card" id="ad-month"><h2>Sales per ${unitName}</h2><p class="ad-sub">Whether the deals keep selling: brochure deals bought each ${unitName}, by the date of the sale.</p>
    <div class="ad-chart" id="adMonChart"></div>
    <details><summary>Show as table</summary><div id="adMonTable"></div></details></section>`;

  h += `<section class="ad-card" id="ad-branch"><h2>By branch</h2><p class="ad-sub">Which salon is selling the deals: the cash taken at each one. Branches outside your header filter are shown faded.</p>
    <div class="ad-chart" id="adBrChart"></div>
    <details><summary>Show as table</summary><div>${adPhoneBtn('adbr')}<table id="adbr"></table></div></details></section>`;

  h += `<section class="ad-card" id="ad-offer"><h2>By offer</h2><p class="ad-sub">How each deal on the brochure is doing: the sales at each branch, the cash, and how sure we are of the match.</p>
    <details class="more"><summary>How this is counted</summary><p class="ad-sub">A package is rung as one sale made of lines named after the offer, so we count sales, not lines. Blonding and Balayage on the brochure are Phorest’s Full Blonde Package and Full Balayage Package, matched by price and components, and the names are confirmed.</p></details>
    <div>${adPhoneBtn('adoffer')}<table id="adoffer"></table></div>
    <h3 class="ad-subh">Older look-alike offers</h3><p class="ad-sub">Not on the brochure, shown so they are not mixed in.</p>
    <div>${adPhoneBtn('adolder')}<table id="adolder"></table></div></section>`;

  h += `<div class="ad-grid2" id="ad-type"><section class="ad-card"><h2>By type</h2><p class="ad-sub">What kind of deal is selling: the share of cash for hair colour, hair treatment and beauty.</p>
      <div class="ad-chart" id="adCatChart"></div><div class="ad-legend">${cats.map(c => `<span><i style="background:${c.color}"></i>${c.name} · ${c.n} sold · ${adPc(c.a, cash)}</span>`).join('')}</div>
      <div style="margin-top:14px">${adPhoneBtn('adcat')}<table id="adcat"></table></div></section>
    <section class="ad-card" id="ad-cant"><h2>Upper bound only</h2><p class="ad-sub">One deal on the brochure cannot be counted exactly, and three are counted by their price.</p>
      <ul class="ad-list">${AD_UB.map(u => {
        const n = adSold(u.k), by = AD_BR.map(b => [b[1], adBrOf(u.k, b[0])]).filter(x => x[1]);
        return `<li class="ad-of">${adSlide(u.k, u.n)}<div><b>${adEsc(u.n)}, ${adEsc(u.pl.toLowerCase())}: ${adN(`up to ${n} sale${n === 1 ? '' : 's'}`, n, [u.k], null, u.n)}</b>${by.length ? adEsc(by.map(x => x[0] + ' ' + x[1]).join(', ') + '. ') : ''}These are extension maintenance sales with a free treatment line. The till rings any gift that way, so some are not this deal, and no sale shows the trim free as well. Left out of every total above.</div></li>`;
      }).join('')}</ul></section></div>`;

  h += `<section class="ad-card" id="ad-ask"><h2>Waiting on a word</h2><p class="ad-sub">These need an answer before the numbers can be quoted outside the team.</p><ol class="ad-ask">
      <li><b>Tara or Emma:</b> which colour slides priced over the 30% ceiling are still active? No slide has an end date.</li>
      <li><b>Reception:</b> Polish and Pamper 350 at Khalifa City A shows 34 sales from 7 clients. Were components rung as separate sales?</li></ol></section>
    <details class="more"><summary>How these numbers are counted</summary>
      <p class="ad-sub">Sold is distinct sales (branch, date, sale id). AED is what the client paid for the offer’s own lines, VAT included, with a refund taken off the day it was given.</p>
      <p class="ad-sub">A later single line from a package (a redemption) is not counted as a sale. A refunded package still counts as one sale.</p>
      <p class="ad-sub">Price test deals have no package line at the till, so a sale counts when its lines make the brochure price. Refresh Balayage: one face frame, one toner and one treatment that add up to AED 499. Mix and Match: three or more of the seven listed beauty services that add up to AED 499. 25% off for new clients: a client’s first visit (a client record at most 45 days old, no earlier sale), beauty worth AED 200 or more, with a beauty line at exactly 25% off. AED for that one is what the beauty lines were paid after the discount. Refresh Balayage and Mix and Match show none sold when nothing at the till matches, and start counting the day a sale does.</p>
      <p class="ad-sub">Extension Care is an upper bound, not a count: a maintenance sale (extension removal, refit or maintenance line) with a free “(Treat)” line, from 1 Sep 2026. It is kept out of every total on this page.</p>
      <p class="ad-sub">Bahrain has no lines for any of these. Fratelli and Marasy are closed and not shown. Data comes from the daily Phorest Sales Transactions upload, so today’s sales appear after the nightly run.</p></details>`;

  el.innerHTML = h;
  adCharts();
  adTables();
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
  adMonthTbl();

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

// ── THE TABLES, Google Sheets style (sheet-table.js): a menu on every heading ───────────────────────────────────────────────────
function adMonthTbl() {
  const host = document.getElementById('adMonTable'); if (!host || !adM) return;
  const { buckets, unit } = adM;
  host.innerHTML = adPhoneBtn('admon') + '<table id="admon"></table>';
  const lab = x => adBucketLabel(x, unit).replace('Week of ', '');
  const ttl = x => 'Brochure deals sold · ' + adBucketLabel(x, unit), rg = x => ({ a: x.a, b: x.b });
  adMake('admon', buckets, [
    { k: 'p', l: unit === 'month' ? 'Month' : unit === 'week' ? 'Week of' : 'Day', t: 'date', raw: x => x.a, disp: lab, cell: lab },
    adCol('n', 'Sold', 'num', x => x.n, x => String(x.n), x => adN(String(x.n), x.n, AD_KEYS, null, ttl(x), rg(x))),
    adCol('a', 'AED', 'num', x => x.t, x => adAed(x.t), x => adN(adAed(x.t), x.n, AD_KEYS, null, ttl(x), rg(x)))
  ], rows => { const n = adSum(rows, x => x.n); return { p: 'Total', n: String(n), a: adAed(adSum(rows, x => x.t)) }; });
}
function adTables() {
  if (!adM) return;
  const { rowsO, brs, cats, cash } = adM;
  const brCols = () => AD_BR.map(b => adCol('b' + b[0], b[1], 'num', o => adBrOf(o.k, b[0]), o => String(adBrOf(o.k, b[0])), o => { const n = adBrOf(o.k, b[0]); return n ? adN(String(n), n, [o.k], b[0], o.n) : adBc(0); }));
  const match = { k: 'match', l: 'Match', t: 'txt', raw: o => o.ct, disp: o => o.ct, cell: o => `<span class="ad-tag ${o.c}">${o.ct}</span>` };
  // By offer
  adMake('adoffer', rowsO, [
    { k: 'pic', l: 'Slide', hd: () => 'Slide', t: 'txt', raw: () => '', disp: () => '', cell: o => adSlide(o.k, o.n) },
    { k: 'name', l: 'Offer', t: 'txt', raw: o => o.n, disp: o => o.n, cell: o => `${adEsc(o.n)}<small>Slide ${o.s} · ${o.pl || 'AED ' + o.p}${o.ph ? ' · ' + adEsc(o.ph) : ''}</small>` }
  ].concat(brCols(), [
    adCol('sold', 'Sold', 'num', o => o.sold, o => String(o.sold), o => `<b>${adN(String(o.sold), o.sold, [o.k], null, o.n)}</b>`),
    adCol('aed', 'AED', 'num', o => o.paid, o => adAed(o.paid), o => adN(adAed(o.paid), o.sold, [o.k], null, o.n)),
    adCol('share', 'Share', 'num', o => cash ? o.paid / cash : 0, o => adPc(o.paid, cash), o => adMini(o.paid, cash)),
    match
  ]), rows => {
    const keys = rows.map(o => o.k), sold = adSum(rows, o => o.sold), paid = adSum(rows, o => o.paid);
    const t = { name: 'Total', sold: adN(String(sold), sold, keys, null, 'Brochure deals sold'), aed: adN(adAed(paid), sold, keys, null, 'Brochure deals sold'), share: adMini(paid, cash) };
    AD_BR.forEach(b => { const n = adSum(rows, o => adBrOf(o.k, b[0])); t['b' + b[0]] = n ? adN(String(n), n, keys, b[0], 'Brochure deals sold') : adBc(0); });
    return t;
  });
  // Older look-alike offers
  const older = AD_OLDER.map(o => Object.assign({ sold: adSold(o.k), paid: adPaid(o.k) }, o));
  adMake('adolder', older, [
    { k: 'name', l: 'Offer', t: 'txt', raw: o => o.n, disp: o => o.n, cell: o => `${adEsc(o.n)}<small>AED ${o.p}</small>` }
  ].concat(brCols(), [
    adCol('sold', 'Sold', 'num', o => o.sold, o => String(o.sold), o => `<b>${adN(String(o.sold), o.sold, [o.k], null, o.n)}</b>`),
    adCol('aed', 'AED', 'num', o => o.paid, o => adAed(o.paid), o => adN(adAed(o.paid), o.sold, [o.k], null, o.n)),
    match
  ]));
  // By branch: all four, whatever the masthead says, the ones outside it faded
  const ba = adSum(brs, b => b.a);
  adMake('adbr', brs, [
    { k: 'name', l: 'Branch', t: 'txt', raw: b => b.name, disp: b => b.name, cell: b => b.name },
    adCol('n', 'Sold', 'num', b => b.n, b => String(b.n), b => adN(String(b.n), b.n, AD_KEYS, b.code, 'Brochure deals sold')),
    adCol('a', 'AED', 'num', b => b.a, b => adAed(b.a), b => adN(adAed(b.a), b.n, AD_KEYS, b.code, 'Brochure deals sold')),
    adCol('s', 'Share', 'num', b => ba ? b.a / ba : 0, b => adPc(b.a, ba), b => adPc(b.a, ba)),
    { k: 'top', l: 'Best seller', t: 'txt', raw: b => b.top, disp: b => b.top, cell: b => adEsc(b.top) }
  ], rows => { const n = adSum(rows, b => b.n), a = adSum(rows, b => b.a); return { name: 'Total', n: adN(String(n), n, AD_KEYS, '*', 'Brochure deals sold'), a: adN(adAed(a), n, AD_KEYS, '*', 'Brochure deals sold'), s: adPc(a, ba) }; }, { rowCls: b => b.on ? '' : 'ad-off' });
  // By type
  const keysOf = c => AD_OFFERS.filter(o => o.cat === c.name).map(o => o.k);
  adMake('adcat', cats, [
    { k: 'name', l: 'Type', t: 'txt', raw: c => c.name, disp: c => c.name, cell: c => `<span class="ad-dot" style="background:${c.color}"></span>${c.name}` },
    adCol('d', 'Deals', 'num', c => c.d, c => String(c.d), c => adN(String(c.d), c.n, keysOf(c), null, c.name + ' deals')),
    adCol('n', 'Sold', 'num', c => c.n, c => String(c.n), c => adN(String(c.n), c.n, keysOf(c), null, c.name + ' deals')),
    adCol('a', 'AED', 'num', c => c.a, c => adAed(c.a), c => adN(adAed(c.a), c.n, keysOf(c), null, c.name + ' deals'))
  ], rows => { const keys = [].concat(...rows.map(keysOf)), n = adSum(rows, c => c.n); return { name: 'Total', d: adN(String(adSum(rows, c => c.d)), n, keys, null, 'Brochure deals sold'), n: adN(String(n), n, keys, null, 'Brochure deals sold'), a: adN(adAed(adSum(rows, c => c.a)), n, keys, null, 'Brochure deals sold') }; });
}

// ── ON THIS PAGE rail (the same shell as Wellness Voucher Performance's) ────
const AD_RAIL = [['ad-headline', 'Headline'], ['ad-month', 'Sales over time'], ['ad-branch', 'By branch'], ['ad-offer', 'By offer'], ['ad-type', 'Type and upper bound'], ['ad-ask', 'Waiting on a word']];
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
function adSave(kind) {
  if (!adData || typeof lgxBuild !== 'function') return;
  const w = adRange(), codes = adCodes();
  const offerCols = [{ label: 'Offer', fmt: 'text' }, { label: 'Slide', fmt: 'text' }, { label: 'Price (AED)', fmt: 'text' }, ...AD_BR.map(b => ({ label: b[1], fmt: 'num' })), { label: 'Sold', fmt: 'num' }, { label: 'AED', fmt: 'aed' }, { label: 'Match', fmt: 'text' }];
  const offerRow = (o, slide) => ({ cells: [o.n, slide || '', o.pl || o.p, ...AD_BR.map(b => adBrOf(o.k, b[0])), adSold(o.k), Math.round(adPaid(o.k)), o.ct] });
  const days = adData.rows.filter(adIn).sort((a, b) => a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0).map(r => {
    const o = AD_OFFERS.concat(AD_OLDER, AD_UB).find(x => x.k === r[0]);
    return { cells: [r[2], o ? o.n : r[0], AD_BR.find(b => b[0] === r[1])[1], r[3], Math.round(r[4])] };
  });
  const built = lgxBuild({ sheets: [
    { name: 'Summary', blocks: [{ cols: [{ label: 'Active Deals Performance', fmt: 'text' }, { label: '', fmt: 'text' }], rows: [
      { cells: ['Branches', adBranchLabel()] }, { cells: ['Period', adPeriodLabel()] }, { cells: ['From', w.from === '0000-01-01' ? 'first sale' : w.from] }, { cells: ['To', w.to] },
      { cells: ['Report made', adWhen(adData.at)] }, { cells: ['Counted', 'Distinct sales (branch, date, sale id). AED is the till total, VAT included, a refund off the day it was given.'] }] }] },
    { name: 'By offer', blocks: [{ cols: offerCols, rows: AD_OFFERS.map(o => offerRow(o, 'Slide ' + o.s)).concat(AD_OLDER.map(o => offerRow(o, 'Older offer')).concat(AD_UB.map(o => offerRow(o, 'Slide ' + o.s)))) }] },
    { name: 'By day', blocks: [{ cols: [{ label: 'Date', fmt: 'text' }, { label: 'Offer', fmt: 'text' }, { label: 'Branch', fmt: 'text' }, { label: 'Sales', fmt: 'num' }, { label: 'AED', fmt: 'aed' }], rows: days }] }
  ] });
  const stamp = dateToIso(new Date());
  // Kate, 10 Nov 2026: a CSV holds one tab, so it is By offer, the page's own report (the XLSX has every tab).
  if (kind === 'csv') lgxSave(new Blob(['﻿' + lgxCsv(built[1])], { type: 'text/csv;charset=utf-8' }), 'active-deals-performance-' + stamp + '-by-offer.csv');
  else lgxSave(lgxXlsxBlob(built), 'active-deals-performance-' + stamp + '.xlsx');
}
