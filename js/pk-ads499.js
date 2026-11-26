// ADS 499 Packages Performance (Kate, 26 Nov 2026): the three AED 499 Meta-ads beauty packages of the Phorest package category ADS - PACKAGE (Skin: Hydrafacial + blow dry,
// Hands and Feet, Eyes), in Active Deals Performance's format (same classes, css/active-deals.css). It replaces the "ADS Hydrafacial + Blow dry (older 499)" row on Active Deals.
// Numbers from pk_ads499() (migrations/pk_ads499.sql), Level 2 and above, no client names: one row per sale, the client is an opaque "Client 12". Fetched once and filtered
// here, so a Branch or Period change in the masthead redraws at once. A price test (Hands and Feet) is never inside a headline total: it sits beside it as "+N by price".
// The Meta ads table is typed from Ads Manager (read 25 Nov 2026, all time), not filtered by the header. Self-contained: it needs sb, TRS_LEVEL, sel, dateFrom, dateTo,
// activePeriodKey(), dateToIso(), TRSD (drill.js), TRSheet (sheet-table.js), whyWall().
const A4_BR = [['KCA', 'Khalifa City A'], ['SAA', 'Saadiyat'], ['MC', 'Motor City'], ['AQ', 'Al Quoz'], ['MRY', 'Marasy (closed)']];
const A4_PK = [
  { k: 'skin', n: 'Skin: Hydrafacial + blow dry', s: 'Skin', pl: 'AED 499', price: 499, cnt: true, c: 'ok', ct: 'Exact', what: 'Named lines at the till: ADS -Hydrafacial + Blow dry.' },
  { k: 'hands', n: 'Hands and Feet: gel mani and pedi, foot massage, head neck and shoulder massage', s: 'Hands and Feet', pl: 'AED 499', price: 499, cnt: false, c: 'warn', ct: 'Price test', what: 'No package name at the till. A sale whose lines add up to exactly 499.00.' },
  { k: 'eyes', n: 'Eyes: LVL or brow lamination, gel pedi, blow dry', s: 'Eyes', pl: 'AED 499', price: 499, cnt: false, c: 'na', ct: 'Not found', what: 'No sale found by name or by price.' }
];
// The five Meta ads for this offer, typed from Ads Manager on 25 Nov 2026 (all time, all Off). lead form or messaging; rs = results.
const A4_ADS = [
  { n: '08 | video | UGC | 499 beauty', ty: 'Lead form', sp: 234.92, im: 4182, re: 2893, rs: 3, last: '1 Dec 2025', ed: '4 Dec 2025' },
  { n: '06 | video | UGC | 499 beauty', ty: 'Lead form', sp: 140.77, im: 2440, re: 2394, rs: 5, last: 'not read', ed: 'not read' },
  { n: '01 | video | UGC | 499 beauty', ty: 'Lead form', sp: 17.84, im: 413, re: 403, rs: 0, last: 'not read', ed: 'not read' },
  { n: '13 | video | Ugc | 499 beauty', ty: 'Messaging', sp: 3.22, im: 58, re: 44, rs: 0, last: 'not read', ed: '24 May 2025' },
  { n: '11 | video | Ugc | 499 beauty', ty: 'Messaging', sp: 0.24, im: 4, re: 2, rs: 0, last: 'not read', ed: '24 May 2025' }
];
const A4_KEYS = A4_PK.filter(p => p.cnt).map(p => p.k);
const A4_MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
let a4Data = null, a4Err = '', a4Busy = false, a4M = null, a4Resize = null, a4Ts = {}, a4AllOnce = false;

const a4Esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const a4Money = n => Math.round(Number(n) || 0).toLocaleString('en-US');
const a4Aed = n => 'AED ' + a4Money(n);
const a4Pc = (a, b) => b ? Math.round(a / b * 100) + '%' : '0%';
const a4Sum = (l, f) => l.reduce((a, r) => a + f(r), 0);
const a4Ok = () => typeof TRS_LEVEL !== 'undefined' && TRS_LEVEL >= 2;
const a4Day = iso => { try { return new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return iso || ''; } };
const a4Short = iso => { try { return new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); } catch (e) { return iso || ''; } };
const a4When = iso => { try { return new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).replace(' at ', ', '); } catch (e) { return ''; } };
const a4One = k => A4_PK.find(p => p.k === k) || { n: k };
const a4BrName = c => (A4_BR.find(b => b[0] === c) || [c, c])[1];
const a4Cl = n => 'Client ' + n;
const a4Plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

// ── THE MASTHEAD'S FILTERS ──────────────────────────────────────────────────
// Branch: ['all'] or codes. Marasy is closed and has no chip: it is in the numbers only under UAE Branches.
function a4Codes() {
  const all = A4_BR.map(b => b[0]);
  if (typeof sel === 'undefined' || !sel.branch || sel.branch.includes('all')) return all;
  return all.filter(c => sel.branch.includes(c));
}
function a4BranchLabel() {
  const c = a4Codes();
  if (typeof sel === 'undefined' || !sel.branch || sel.branch.includes('all') || c.length === A4_BR.length) return 'UAE Branches';
  return c.length ? c.map(a4BrName).join(' + ') : (sel.branch || []).join(' + ');
}
function a4Range() {
  const from = typeof dateFrom !== 'undefined' && dateFrom ? dateToIso(dateFrom) : '0000-01-01';
  const to = typeof dateTo !== 'undefined' && dateTo ? dateToIso(dateTo) : '9999-12-31';
  return { from, to };
}
function a4PeriodLabel() {
  const key = typeof activePeriodKey === 'function' ? activePeriodKey() : '';
  if (key && key !== 'Custom' && key !== 'Month' && key !== 'Year') return key;
  const r = a4Range();
  return r.from === r.to ? a4Day(r.from) : a4Day(r.from) + ' to ' + a4Day(r.to);
}

// ── THE SALES: one object per sale, built from the rows the function returns ────────────────────────────────
function a4Prep() {
  a4Data.sales = (a4Data.rows || []).map((r, i) => ({ id: i, o: r[0], b: r[1], d: String(r[2]).slice(0, 10), no: r[3], aed: +r[4], ci: +r[5], l: r[6] || [] }));
  const named = a4Data.sales.filter(s => A4_KEYS.includes(s.o));
  a4Data.first = named.reduce((m, s) => !m || s.d < m ? s.d : m, '');
  a4Data.last = named.reduce((m, s) => s.d > m ? s.d : m, '');
  const pkm = {}; (a4Data.packages || []).forEach(p => { pkm[p.k] = p; });
  A4_PK.forEach(p => { const x = pkm[p.k] || {}; p.first = x.first || ''; p.last = x.last || ''; });
}
// o = { k: [package keys] (default: the counted ones), br: null (masthead) | '*' (all) | code, rng: {a, b} (default: the masthead's period), ci: a client }
function a4Wr(o) {
  const w = a4Range(), r = o.rng || { a: w.from, b: w.to }, ks = o.k || A4_KEYS, codes = o.br === '*' ? A4_BR.map(b => b[0]) : o.br ? [o.br] : a4Codes();
  return (a4Data ? a4Data.sales : []).filter(s => ks.includes(s.o) && codes.includes(s.b) && s.d >= r.a && s.d <= r.b && (o.ci == null || s.ci === o.ci));
}
const a4Cli = rs => new Set(rs.map(s => s.ci)).size;
const a4Pk = (k, br) => { const rs = a4Wr({ k: [k], br }); return { n: rs.length, aed: a4Sum(rs, s => s.aed), cl: a4Cli(rs) }; };

// ── CLICKABLE FIGURES: every count and AED opens the sales behind it, and a figure inside a window opens the next step down, to one sale ──────────────
function a4SaleSpec(s) {
  const p = a4One(s.o), diff = Math.round((s.aed - p.price) * 100) / 100;
  const how = s.o === 'hands' ? 'Price test, not exact: a basket of services whose lines add up to exactly AED 499.00' : 'Exact: the till line starts with ADS -Hydrafacial + Blow dry';
  const steps = [['Package', p.n + ' (AED ' + p.price + ')'], ['How it was matched', how], ['Date', a4Day(s.d)], ['Salon', a4BrName(s.b)], ['Sale number', String(s.no)], ['Client', a4Cl(s.ci)], ['Lines in the sale', String(s.l.length)]]
    .concat(s.l.map((c, i) => ['Line ' + (i + 1), c[0] + ' · AED ' + Number(c[1]).toFixed(2)]));
  const late = s.l.some(c => /^Outstanding balance payment$/i.test(c[0]));
  const note = s.o === 'hands' ? 'Price test: shown because its lines add up to exactly AED 499.00 and include a foot massage, a neck and shoulder massage and a gel polish. It also has a long blow dry, so it may be this package plus a blow dry. Nothing at the till says it was this package. '
    : late ? 'The blow dry part of this package was paid later as an "Outstanding balance payment" of AED 112.45, the same amount as the blow dry line on the other sales, so it is added here. '
    : (Math.abs(diff) < 0.005 ? 'Paid the full package price. ' : 'Paid AED ' + Math.abs(diff).toFixed(2) + (diff < 0 ? ' less' : ' more') + ' than the package price. ');
  return { title: p.s + ', ' + a4Day(s.d), tip: 'See the sale', cur: 'AED', views: [{ id: 'sale', label: 'The sale', load: async () => ({
    sub: a4BrName(s.b) + ' · sale ' + s.no + ' · ' + a4Cl(s.ci) + ' · paid AED ' + s.aed.toFixed(2),
    note: 'This is the last step: one sale has nothing behind it. ' + note + 'Line by line it adds up to the paid amount.',
    cols: [{ k: 's', l: 'Step' }, { k: 'd', l: 'Detail' }], rows: steps.map(x => ({ s: x[0], d: x[1] })), foot: { s: 'Paid by the client', d: 'AED ' + s.aed.toFixed(2) } }) }] };
}
function a4Win(o) {
  if (typeof TRSD === 'undefined' || !a4Data) return null;
  const rs0 = () => a4Wr(o), sub = () => { const rs = rs0(); return (o.br === '*' ? 'UAE Branches' : o.br ? a4BrName(o.br) : a4BranchLabel()) + ' · ' + (o.rng ? (o.rng.a === o.rng.b ? a4Day(o.rng.a) : a4Day(o.rng.a) + ' to ' + a4Day(o.rng.b)) : a4PeriodLabel()) + ' · ' + a4Plural(rs.length, 'sale') + ' · ' + a4Aed(a4Sum(rs, s => s.aed)) + ' · ' + a4Plural(a4Cli(rs), 'client'); };
  const rs = rs0(), views = [], t = o.t || 'AED 499 packages sold';
  const kinds = x => new Set(x).size;
  const w = (p) => Object.assign({}, o, p);
  if (o.ci == null) views.push({ id: 'clients', label: 'Clients', load: async () => {
    const m = {}; rs0().forEach(s => { const c = m[s.ci] || (m[s.ci] = { ci: s.ci, n: 0, a: 0, last: '', br: {} }); c.n++; c.a += s.aed; if (s.d > c.last) c.last = s.d; c.br[a4BrName(s.b)] = 1; });
    const list = Object.values(m).sort((a, b) => b.n - a.n || b.a - a.a || a.ci - b.ci), sp = c => a4Win(w({ ci: c.ci, t: t + ', ' + a4Cl(c.ci) }));
    return { sub: sub(), cols: [{ k: 'c', l: 'Client' }, { k: 's', l: 'Salon' }, { k: 'n', l: 'Packages bought', t: 'num' }, { k: 'l', l: 'Last bought', t: 'date' }, { k: 'a', l: 'AED', t: 'aed' }],
      rows: list.map(c => ({ c: a4Cl(c.ci), s: Object.keys(c.br).join(', '), n: c.n, l: c.last, a: c.a, _dn: { c: sp(c), n: sp(c), a: sp(c) } })),
      foot: { c: 'Total: ' + a4Plural(list.length, 'client'), n: rs.length, a: a4Sum(rs, s => s.aed) } };
  } });
  if (kinds(rs.map(s => s.o)) > 1) views.push({ id: 'package', label: 'By package', load: async () => {
    const tot = a4Sum(rs0(), s => s.aed);
    return { sub: sub(), cols: [{ k: 'p', l: 'Package' }, { k: 'n', l: 'Sold', t: 'num' }, { k: 'a', l: 'AED', t: 'aed' }, { k: 'sh', l: 'Share', t: 'pct' }],
      rows: A4_PK.filter(p => rs.some(s => s.o === p.k)).map(p => { const x = rs0().filter(s => s.o === p.k), sp = a4Win(w({ k: [p.k], t: p.s })); return { p: p.s, n: x.length, a: a4Sum(x, s => s.aed), sh: tot ? a4Sum(x, s => s.aed) / tot * 100 : 0, _dn: { n: sp, a: sp } }; }),
      foot: { p: 'Total', n: rs.length, a: tot } };
  } });
  if (kinds(rs.map(s => s.b)) > 1) views.push({ id: 'branch', label: 'By salon', load: async () => {
    const tot = a4Sum(rs0(), s => s.aed);
    return { sub: sub(), cols: [{ k: 'b', l: 'Salon' }, { k: 'n', l: 'Sold', t: 'num' }, { k: 'a', l: 'AED', t: 'aed' }, { k: 'sh', l: 'Share', t: 'pct' }],
      rows: A4_BR.filter(b => rs.some(s => s.b === b[0])).map(b => { const x = rs0().filter(s => s.b === b[0]), sp = a4Win(w({ br: b[0], t: t + ', ' + b[1] })); return { b: b[1], n: x.length, a: a4Sum(x, s => s.aed), sh: tot ? a4Sum(x, s => s.aed) / tot * 100 : 0, _dn: { n: sp, a: sp } }; }),
      foot: { b: 'Total', n: rs.length, a: tot } };
  } });
  if (kinds(rs.map(s => s.d)) > 1) views.push({ id: 'day', label: 'By day', load: async () => {
    const m = {}; rs0().forEach(s => { const k = s.d + s.o + s.b, c = m[k] || (m[k] = { d: s.d, o: s.o, b: s.b, n: 0, a: 0 }); c.n++; c.a += s.aed; });
    const list = Object.values(m).sort((a, b) => a.d < b.d ? 1 : a.d > b.d ? -1 : 0), sp = c => a4Win(w({ k: [c.o], br: c.b, rng: { a: c.d, b: c.d }, t: a4One(c.o).s + ', ' + a4Day(c.d) }));
    return { sub: sub(), cols: [{ k: 'd', l: 'Date', t: 'date' }, { k: 'o', l: 'Package' }, { k: 'b', l: 'Salon' }, { k: 'n', l: 'Sold', t: 'num' }, { k: 'a', l: 'AED', t: 'aed' }],
      rows: list.map(c => ({ d: c.d, o: a4One(c.o).s, b: a4BrName(c.b), n: c.n, a: c.a, _dn: { n: sp(c), a: sp(c) } })),
      foot: { d: 'Total', n: rs.length, a: a4Sum(rs, s => s.aed) } };
  } });
  views.push({ id: 'sales', label: 'Sales', load: async () => {
    const list = rs0().slice().sort((a, b) => a.d < b.d ? 1 : a.d > b.d ? -1 : (a.no < b.no ? 1 : -1));
    return { sub: sub(), note: 'Tap a number to see what is behind it, down to one sale. Clients are numbered, never named.',
      cols: [{ k: 'd', l: 'Date', t: 'date' }, { k: 'b', l: 'Salon' }, { k: 'o', l: 'Package' }, { k: 'no', l: 'Sale no.' }, { k: 'c', l: 'Client' }, { k: 'l', l: 'Lines', t: 'num' }, { k: 'a', l: 'Paid (AED)', t: 'num' }],
      rows: list.map(s => { const sp = a4SaleSpec(s), cs = o.ci == null ? a4Win(w({ ci: s.ci, t: t + ', ' + a4Cl(s.ci) })) : null; return { d: s.d, b: a4BrName(s.b), o: a4One(s.o).s, no: s.no, c: a4Cl(s.ci), l: s.l.length, a: s.aed, _dn: { no: sp, l: sp, a: sp, c: cs } }; }),
      foot: { d: 'Total: ' + a4Plural(rs.length, 'sale'), l: a4Sum(rs, s => s.l.length), a: a4Sum(rs, s => s.aed) } };
  } });
  return { title: t, tip: 'See the sales', cur: 'AED', views };
}
// A figure that opens its sales. Zero stays plain (nothing behind it), and so does a figure when drill.js is not on the page.
const a4N = (html, n, o) => (n && typeof TRSD !== 'undefined') ? TRSD.num(html, a4Win(o)) : html;

// One Google Sheets table (sheet-table.js): sort and filter on every heading, and it keeps its filters when the page redraws.
function a4Make(id, rows, cols, total, extra) {
  if (typeof TRSheet === 'undefined' || !document.getElementById(id)) return null;
  const old = a4Ts[id];
  const T = TRSheet.table(Object.assign({ id, el: '#' + id, rows: () => rows, cols, total }, extra || {}));
  if (old) { T.f = old.f; T.sort = old.sort; }
  a4Ts[id] = T; T.draw(); return T;
}
const a4PhoneBtn = id => `<button type="button" class="ad-btn ad-phone" data-sxcm="${id}" aria-label="Sort and filter">Sort or filter</button>`;
const a4Col = (k, l, t, raw, disp, cell) => ({ k, l, t, raw, disp, cell });
const a4Bc = n => n ? n : '<span class="ad-zero">–</span>';

// ── LOAD ────────────────────────────────────────────────────────────────────
async function renderAds499(force) {
  const el = document.getElementById('pkAds499Content');
  if (!el || !a4Ok()) return;
  if (a4Data && !force) { a4Paint(); return; }
  if (a4Busy) return;
  a4Busy = true; a4Err = '';
  el.innerHTML = '<div class="ad-state">Reading the till…</div>';
  try {
    const { data, error } = await sb.rpc('pk_ads499', { p_summary: false });
    if (error || !data || !Array.isArray(data.rows)) throw error || new Error('no report');
    a4Data = data; a4Prep();
  } catch (e) { console.error(e); a4Err = 'The report did not load. Press Refresh to try again.'; }
  a4Busy = false;
  a4Paint();
}

// Day, Monday-start week, calendar month or quarter buckets between two ISO dates.
function a4Buckets(a, b, unit) {
  const out = [], iso = d => dateToIso(d);
  let d = new Date(a + 'T12:00:00'); const stop = new Date(b + 'T12:00:00');
  if (unit === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  if (unit === 'month') d = new Date(d.getFullYear(), d.getMonth(), 1, 12);
  if (unit === 'quarter') d = new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1, 12);
  const step = unit === 'day' ? [0, 0, 1] : unit === 'week' ? [0, 0, 7] : unit === 'quarter' ? [0, 3, 0] : [0, 1, 0];
  for (let g = 0; d <= stop && g < 400; g++) {
    const nx = new Date(d.getFullYear() + step[0], d.getMonth() + step[1], d.getDate() + step[2], 12);
    out.push({ a: iso(d), b: iso(new Date(nx.getFullYear(), nx.getMonth(), nx.getDate() - 1, 12)), n: 0, t: 0, ci: 0, top: '' });
    d = nx;
  }
  return out;
}
function a4BucketLabel(b, unit) {
  if (!b) return '';
  const [y, m] = b.a.split('-').map(Number);
  if (unit === 'quarter') return 'Q' + (Math.floor((m - 1) / 3) + 1) + ' ' + y;
  if (unit === 'month') return A4_MON[m - 1] + ' ' + y;
  if (unit === 'week') return 'Week of ' + a4Short(b.a);
  return a4Short(b.a);
}
function a4Axis(b, unit) {
  const [y, m] = b.a.split('-').map(Number);
  if (unit === 'quarter') return 'Q' + (Math.floor((m - 1) / 3) + 1) + ' ’' + String(y).slice(2);
  if (unit === 'month') return A4_MON[m - 1].slice(0, 3);
  return a4Short(b.a);
}

// ── PAINT ───────────────────────────────────────────────────────────────────
function a4Paint() {
  const el = document.getElementById('pkAds499Content');
  if (!el) return;
  const head = `<div class="ad-top"><div><h1 class="ad-t">ADS 499 Packages Performance</h1><p class="ad-sub">${a4Data ? 'As of ' + a4Esc(a4When(a4Data.at)) + '. Phorest sales, the three AED 499 packages of the Meta ads (category ADS - PACKAGE).' : ''}</p></div>
    <div class="ad-toplinks"><button class="ad-btn" type="button" onclick="renderAds499(true)">Refresh</button>
    <a class="ad-btn" href="/?view=pkdir" onclick="if(trsPlain(event)){event.preventDefault();showView('pkdir', null)}">All package pages</a></div></div>`;
  if (a4Err || !a4Data) { el.innerHTML = head + `<div class="ad-state">${a4Esc(a4Err || 'No report yet.')}</div>`; a4Rail(false); return; }

  const rs = a4Wr({}), n = rs.length, aed = a4Sum(rs, s => s.aed), nc = a4Cli(rs);
  if (!n) {
    const key = typeof activePeriodKey === 'function' ? activePeriodKey() : '';
    const named = key && key !== 'Custom' && key !== 'Month' && key !== 'Year';
    el.innerHTML = head + `<section class="ad-card"><div class="ad-empty">No AED 499 package named at the till was sold at ${a4Esc(a4BranchLabel())} in ${a4Esc(named ? a4PeriodLabel().toLowerCase() : a4PeriodLabel())}. These are archived offers: the named sales run from ${a4Esc(a4Day(a4Data.first))} to ${a4Esc(a4Day(a4Data.last))}.
      ${key !== 'All time' ? `<button type="button" class="ad-btn" style="margin-left:6px" onclick="document.querySelector('#periodChips .chip[data-v=&quot;All time&quot;]')?.click()">See all time instead</button>` : 'Widen the Branch in the header.'}</div></section>`;
    a4M = null; a4Rail(false);
    if (!a4AllOnce && key !== 'All time') { a4AllOnce = true; document.querySelector('#periodChips .chip[data-v="All time"]')?.click(); }
    return;
  }
  a4AllOnce = true;
  const w = a4Range();
  const byK = A4_PK.map(p => { const s = a4Pk(p.k); return Object.assign({ n: s.n, aed: s.aed, cl: s.cl }, { p }); });
  const withSale = byK.filter(x => x.p.cnt && x.n > 0).length;
  const start = w.from > a4Data.first ? w.from : a4Data.first, end = w.to < a4Data.last ? w.to : a4Data.last;
  const span = Math.max(1, Math.round((new Date(end + 'T12:00:00') - new Date(start + 'T12:00:00')) / 864e5) + 1);
  const unit = span <= 31 ? 'day' : span <= 140 ? 'week' : span <= 900 ? 'month' : 'quarter';
  const bk = a4Buckets(start, end, unit);
  bk.forEach(b => { const x = a4Wr({ rng: { a: b.a, b: b.b } }); b.n = x.length; b.t = a4Sum(x, s => s.aed); b.ci = a4Cli(x); const m = {}; x.forEach(s => { m[s.o] = (m[s.o] || 0) + 1; }); const tk = Object.keys(m).sort((p, q) => m[q] - m[p])[0]; b.top = tk ? a4One(tk).s : ''; });
  const busy = bk.slice().sort((a, b) => b.n - a.n)[0];
  const per = n / (span / 30.44), last = rs.reduce((m, s) => s.d > m ? s.d : m, '');
  const brs = A4_BR.map(b => { const q = a4Wr({ br: b[0] }), m = {}; q.forEach(s => { m[s.o] = (m[s.o] || 0) + 1; }); const tk = Object.keys(m).sort((p, q2) => m[q2] - m[p])[0]; return { code: b[0], name: b[1], on: a4Codes().includes(b[0]), n: q.length, aed: a4Sum(q, s => s.aed), cl: a4Cli(q), top: tk ? a4One(tk).s : '' }; });
  const hRs = a4Wr({ k: ['hands'] });
  a4M = { bk, unit, brs, byK, aed, n, nc };
  const unitName = unit;
  const dAll = { t: 'AED 499 packages sold' }, dH = { k: ['hands'], t: 'Hands and Feet, price test' };
  const topB = brs.slice().sort((a, b) => b.n - a.n)[0];
  const allN = a4Data.sales.filter(s => A4_KEYS.includes(s.o)).length, adSp = A4_ADS.reduce((a, x) => a + x.sp, 0);

  let h = head + whyWall([
    ['Why this page', 'It shows what the three AED 499 beauty packages from the Meta ads sold at the till, beside what the five ads cost.'],
    ['Why now', 'All five ads are Off, and the old 499 row on Active Deals mixes this offer in with the 2026 brochure. It gets its own page before anyone runs it again.'],
    ['If we do nothing', 'We could switch the ads on again without knowing that only three sales carry the package name at the till, and two of the three packages barely show.']]);
  h += `<section class="ad-card" id="a4-headline"><div class="ad-hero"><div>
      <div class="ad-cap">AED 499 packages named at the till</div><div class="ad-big">${a4N(`${n} <small>sale${n === 1 ? '' : 's'}, ${a4Aed(aed)}</small>`, n, dAll)}</div>
      <div class="ad-track"><div class="ad-fill" style="width:${Math.round(withSale / A4_KEYS.length * 100)}%"></div></div>
      <div class="ad-cap">Only Skin has its name at the till${hRs.length ? ' · ' + a4N(`+${hRs.length} by price, not exact`, hRs.length, dH) + ', Hands and Feet, shown apart and not in the total' : ''}</div></div>
    <div class="ad-pace"><div class="ad-status warn"><span aria-hidden="true">!</span>Hands and Feet is a price test, Eyes was not found</div>
      <div class="ad-row"><span>Averaging, while it sold</span><b>${per.toFixed(1)} sales a month</b></div>
      <div class="ad-row"><span>Busiest ${unitName}</span><b>${a4Esc(a4BucketLabel(busy, unit))}, ${a4Plural(busy.n, 'sale')}</b></div>
      <div class="ad-row"><span>Latest sale</span><b>${a4Esc(a4Day(last))}</b></div>
      <div class="ad-row"><span>Meta ad spend, all time</span><b>AED ${adSp.toFixed(2)}</b></div>
      <div class="ad-row"><span>Different clients</span><b>${a4N(String(nc), nc, dAll)}</b></div></div></div></section>`;
  h += `<div class="ad-tiles">${[
    ['Packages sold', a4N(`${n} <small style="font-family:var(--sans);font-size:13px;color:var(--muted);font-weight:500">sales</small>`, n, dAll), 'named sales at the till' + (hRs.length ? '. ' + a4N(`+${hRs.length} by price`, hRs.length, dH) + ', not in this' : ''), ''],
    ['AED sold', a4N(a4Aed(aed), n, dAll), 'paid by clients, VAT included', ''],
    ['Average sale', a4Aed(aed / n), 'per package sale', ''],
    ['Different clients', a4N(String(nc), nc, dAll), 'across the named sales', ''],
    ['Spend per sale', 'AED ' + Math.round(adSp / (allN || 1)).toLocaleString('en-US'), 'all spend ÷ the ' + allN + ' named sales. Not proof an ad made them', '']
  ].map(t => `<div class="ad-tile"><div class="l">${t[0]}</div><div class="v ${t[3]}">${t[1]}</div><div class="h">${t[2]}</div></div>`).join('')}</div>`;
  h += `<p class="ad-sub"><b>What to watch.</b> Skin is Exact and is the whole total. Hands and Feet is ${hRs.length ? '+' + hRs.length + ' by price' : 'a price test'}, greyed and not in the total. Eyes shows none. ${a4Esc(topB.name)} has ${a4N(`${topB.n} of the ${n} sales`, topB.n, { br: topB.code, t: topB.name })}.</p>`;

  const qn = bk.filter(b => !b.n).length;
  h += `<section class="ad-card" id="a4-month"><h2>Sales over time</h2><p class="ad-sub">When the packages sold: sales each ${unitName}, by the date of the sale. They are archived, so the bars stop. <b>What to watch.</b> ${a4Esc(a4BucketLabel(busy, unit))} is the busiest ${unitName}, with ${a4Plural(busy.n, 'sale')}. ${qn ? `${qn} of ${bk.length} ${unitName}s have no sale at all.` : `Every ${unitName} in this window has at least one sale.`}</p>
    <div class="ad-chart" id="a4MonChart"></div>
    <details><summary>Show as table</summary><div id="a4MonTable"></div></details></section>`;
  h += `<section class="ad-card" id="a4-branch"><h2>By branch</h2><p class="ad-sub">Which salon is selling the packages: the cash taken at each one. Branches outside your header filter are shown faded. Marasy is closed and only has history.</p>
    <div class="ad-chart" id="a4BrChart"></div>
    <details><summary>Show as table</summary><div>${a4PhoneBtn('a4br')}<table id="a4br"></table></div></details></section>`;
  h += `<section class="ad-card" id="a4-package"><h2>By package</h2><p class="ad-sub">The three packages, oldest first, with the salons that sold each and the cash. Tap a heading to sort or filter another way. <b>What to watch.</b> Skin is the only package with its name at the till. Hands and Feet is greyed: it is a price test and is not in the Total.</p>
    <div>${a4PhoneBtn('a4pk')}<table id="a4pk"></table></div></section>`;
  h += `<section class="ad-card" id="a4-ads"><h2>The Meta ads</h2><p class="ad-sub">The five Meta ads for this offer, read from Ads Manager on 25 Nov 2026. All five are Off. <b>What to watch.</b> Ad 06 got 5 leads at AED 28 each, ad 08 got 3 at AED 78. What was different?</p>
    <div>${a4PhoneBtn('a4ads')}<table id="a4ads"></table></div>
    <p class="ad-sub" style="margin-top:10px">All time, typed from Ads Manager. The header Branch and Period do not filter this table, and no list sits behind these figures, so they stay plain.</p></section>`;
  h += `<section class="ad-card" id="a4-notcounted"><h2>Not traced yet</h2><p class="ad-sub">What the till and Ads Manager could not tell us.</p><ul class="ad-list">${a4NotCounted()}</ul>
    <details class="more"><summary>How these numbers are counted</summary>
      <p class="ad-sub">Sold is distinct sales (branch, date, sale id): a package is one sale made of lines named after it, so we count sales, not lines. AED is what the client paid for the package’s own lines, VAT included, a refund taken off. A sale counts only when its package lines add up to more than AED 0.</p>
      <p class="ad-sub">Skin is named at the till (“ADS -Hydrafacial + Blow dry”). On one sale the blow dry part was paid later as an “Outstanding balance payment” of AED 112.45, and it is added to that sale.</p>
      <p class="ad-sub">Hands and Feet is a price test: a sale whose lines add up to exactly AED 499.00 and include a foot massage, a neck and shoulder massage and a gel polish. It is shown beside the total as “+N by price, not exact” and is in no total. Eyes was searched by name and by price and nothing was found.</p>
      <p class="ad-sub">Clients are numbered inside the report, never named: “Client 12” is the same person everywhere on this page. Sale lines are in the dashboard from 23 May 2021. Data comes from the daily Phorest Sales Transactions upload, so today’s sales appear after the nightly run.</p></details></section>`;
  el.innerHTML = h;
  a4Charts(); a4Tables(); a4Rail(true);
}
function a4NotCounted() {
  const hs = a4Data.sales.filter(x => x.o === 'hands'), all = { rng: { a: '0000-01-01', b: '9999-12-31' }, br: '*' };
  const hsS = a4N(`${hs.length} receipt${hs.length === 1 ? '' : 's'}, ${a4Aed(a4Sum(hs, x => x.aed))}`, hs.length, Object.assign({ k: ['hands'], t: 'Hands and Feet, price test' }, all));
  const th = (a, b) => `<span class="ad-th ad-ph" aria-hidden="true"><span>${a}</span><em>${b}</em></span>`;
  return [
    [th('Eyes', 'none'), '<b>Eyes package</b> No sale found by its name or by its price. The three parts never add up to 499.00 on one receipt.'],
    [th('Price', 'test'), `<b>Hands and Feet</b> ${hs.length ? hsS + ' (Saadiyat, 16 May 2025) adds up to 499.00, so it is shown beside the total as +' + hs.length + ' by price, not in it. It also has a blow dry, so it may not be exactly this package.' : 'No receipt adds up to 499.00.'}`],
    [th('Ad to', 'sale'), '<b>Ad to sale</b> The till does not say which sale came from which ad, so spend per sale is a rough guide only.'],
    [th('Ad', 'dates'), '<b>Ad dates</b> Only ad 08 has its last delivery read (1 Dec 2025). The dates of ads 01, 06, 11 and 13 are not read yet.'],
    [th('2025', 'spend'), '<b>2025 ad spend</b> The dashboard holds Meta spend only from 25 Sep 2025, so the run is typed in from Ads Manager.']
  ].map(x => `<li class="ad-of">${x[0]}<div>${x[1]}</div></li>`).join('');
}

// ── CHARTS (hand-drawn SVG, the Active Deals page's style) ──────────────────
function a4TipHost() {
  const c = document.getElementById('pkAds499Content');
  let t = document.getElementById('a4Tip');
  if (!t && c) { t = document.createElement('div'); t.id = 'a4Tip'; t.className = 'ad-tip'; c.appendChild(t); }
  return t;
}
function a4Hover(host, selector, fn) {
  const tip = a4TipHost(), box = document.getElementById('pkAds499Content');
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
function a4Charts() {
  if (!a4M || !document.getElementById('a4MonChart')) return;
  const { bk, unit, brs } = a4M;
  let host = document.getElementById('a4MonChart'), W = Math.max(300, host.clientWidth), H = 210, L = 38, R = 8, T = 14, B = 26;
  const ymax = Math.max(4, Math.ceil(Math.max(...bk.map(x => x.n)) / 4) * 4), bw = (W - L - R) / bk.length;
  const Y = v => T + (1 - v / ymax) * (H - T - B);
  const every = Math.max(1, Math.ceil(bk.length / Math.floor((W - L) / 54)));
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="AED 499 packages sold per ${unit}">`;
  for (let g = 0; g <= ymax + 1e-9; g += ymax / 4) s += `<line class="gl" x1="${L}" x2="${W - R}" y1="${Y(g)}" y2="${Y(g)}"/><text class="ax" x="${L - 6}" y="${Y(g) + 4}" text-anchor="end">${Math.round(g)}</text>`;
  bk.forEach((x, i) => {
    const gap = Math.min(3, bw / 4), bx = L + i * bw + gap, bwi = Math.max(2, bw - gap * 2), h = Y(0) - Y(x.n), rr = Math.min(4, h, bwi / 2);
    if (x.n) {
      s += `<path d="M${bx} ${Y(0)} v${-(h - rr)} q0 -${rr} ${rr} -${rr} h${bwi - 2 * rr} q${rr} 0 ${rr} ${rr} v${h - rr}Z" fill="var(--series)"/>`;
      if (bw > 20) s += `<text class="ax" x="${bx + bwi / 2}" y="${Y(x.n) - 5}" text-anchor="middle" style="fill:var(--ink);font-weight:600">${x.n}</text>`;
    }
    if (i % every === 0) s += `<text class="ax" x="${bx + bwi / 2}" y="${H - 6}" text-anchor="middle">${a4Axis(x, unit)}</text>`;
    s += `<rect x="${L + i * bw}" y="${T}" width="${bw}" height="${H - T - B}" fill="transparent" data-i="${i}"/>`;
  });
  host.innerHTML = s + '</svg>';
  a4Hover(host, 'rect[data-i]', i => { const x = bk[i]; return `<b>${a4Esc(a4BucketLabel(x, unit))}</b><br>${a4Plural(x.n, 'sale')} · ${a4Aed(x.t)}${x.n ? `<br>${a4Plural(x.ci, 'client')}. Most sold: ${a4Esc(x.top)}` : ''}`; });
  a4MonthTbl();

  host = document.getElementById('a4BrChart'); W = Math.max(300, host.clientWidth);
  const narrow = W < 460, rowH = 34, H2 = brs.length * rowH + 4, L2 = narrow ? 88 : 116, R2 = narrow ? 118 : 150, mx = Math.max(...brs.map(r => r.aed)) || 1;
  s = `<svg viewBox="0 0 ${W} ${H2}" role="img" aria-label="Cash taken by branch">`;
  brs.forEach((r, i) => {
    const y = i * rowH + 6, w = r.aed > 0 ? Math.max(4, r.aed / mx * (W - L2 - R2)) : 0;
    s += `<g opacity="${r.on ? 1 : .35}"><text class="ax" x="0" y="${y + 15}" style="fill:var(--ink2);font-size:12px">${r.name}</text>`;
    if (w) s += `<rect x="${L2}" y="${y}" width="${w}" height="20" rx="4" fill="var(--series)"/>`;
    s += `<text class="ax" x="${L2 + w + 8}" y="${y + 15}" style="fill:var(--ink);font-size:12px">${a4Aed(r.aed)} · ${r.n} sold</text></g><rect x="0" y="${y - 5}" width="${W}" height="${rowH}" fill="transparent" data-i="${i}"/>`;
  });
  host.innerHTML = s + '</svg>';
  a4Hover(host, 'rect[data-i]', i => { const r = brs[i]; return `<b>${r.name}</b><br>${a4Plural(r.n, 'sale')} · ${a4Aed(r.aed)} · ${a4Plural(r.cl, 'client')}<br>${r.top ? 'Most sold: ' + a4Esc(r.top) : 'No sales'}`; });
}
window.addEventListener('resize', () => {
  clearTimeout(a4Resize);
  a4Resize = setTimeout(() => { const v = document.getElementById('view-pkads499'); if (v && v.offsetParent) a4Charts(); }, 120);
});

// ── THE TABLES, Google Sheets style (sheet-table.js): a menu on every heading ───────────────────────────────────────────────────
function a4MonthTbl() {
  const host = document.getElementById('a4MonTable'); if (!host || !a4M) return;
  const { bk, unit } = a4M;
  host.innerHTML = a4PhoneBtn('a4mon') + '<table id="a4mon"></table>';
  const lab = x => a4BucketLabel(x, unit), ttl = x => 'AED 499 packages sold · ' + a4BucketLabel(x, unit), rg = x => ({ a: x.a, b: x.b });
  a4Make('a4mon', bk, [
    { k: 'p', l: unit === 'quarter' ? 'Quarter' : unit === 'month' ? 'Month' : unit === 'week' ? 'Week of' : 'Day', t: 'txt', raw: x => x.a, disp: lab, cell: x => a4Esc(lab(x)) },
    a4Col('n', 'Sold', 'num', x => x.n, x => String(x.n), x => a4N(String(x.n), x.n, { t: ttl(x), rng: rg(x) })),
    a4Col('a', 'AED', 'num', x => x.t, x => a4Aed(x.t), x => a4N(a4Aed(x.t), x.n, { t: ttl(x), rng: rg(x) }))
  ], rows => ({ p: 'Total', n: a4N(String(a4Sum(rows, x => x.n)), a4Sum(rows, x => x.n), { t: 'AED 499 packages sold' }), a: a4Aed(a4Sum(rows, x => x.t)) }));
}
function a4Tables() {
  if (!a4M) return;
  const { brs, byK, aed } = a4M;
  a4Make('a4br', brs, [
    { k: 'name', l: 'Salon', t: 'txt', raw: b => b.name, disp: b => b.name, cell: b => a4Esc(b.name) },
    a4Col('n', 'Sold', 'num', b => b.n, b => String(b.n), b => a4N(String(b.n), b.n, { br: b.code, t: b.name })),
    a4Col('a', 'AED', 'num', b => b.aed, b => a4Aed(b.aed), b => a4N(a4Aed(b.aed), b.n, { br: b.code, t: b.name })),
    a4Col('cl', 'Clients', 'num', b => b.cl, b => String(b.cl), b => a4N(String(b.cl), b.cl, { br: b.code, t: b.name })),
    a4Col('s', 'Share of AED', 'num', b => aed ? b.aed / aed : 0, b => a4Pc(b.aed, aed), b => a4Pc(b.aed, aed)),
    { k: 'top', l: 'Most sold', t: 'txt', raw: b => b.top, disp: b => b.top, cell: b => a4Esc(b.top) }
  ], rows => { const n = a4Sum(rows, b => b.n); return { name: 'Total', n: a4N(String(n), n, { br: '*', t: 'AED 499 packages sold' }), a: a4Aed(a4Sum(rows, b => b.aed)), cl: String(a4Cli(a4Wr({ br: '*' }))) }; }, { rowCls: b => b.on ? '' : 'ad-off' });
  // By package: counted ones first, oldest first, the price test last
  const rows = byK.slice().sort((a, b) => (b.p.cnt - a.p.cnt) || ((!a.p.first) - (!b.p.first)) || a.p.first.localeCompare(b.p.first));
  const brCols = A4_BR.map(b => a4Col('b' + b[0], b[1], 'num', r => a4Pk(r.p.k, b[0]).n, r => String(a4Pk(r.p.k, b[0]).n), r => { const n = a4Pk(r.p.k, b[0]).n; return n ? a4N(String(n), n, { k: [r.p.k], br: b[0], t: r.p.s }) : a4Bc(0); }));
  a4AdsTable();
  a4Make('a4pk', rows, [
    { k: 'n', l: 'Package', t: 'txt', raw: r => r.p.s, disp: r => r.p.s, cell: r => `<b title="${a4Esc(r.p.what)}">${a4Esc(r.p.s)}</b>${r.p.cnt ? '' : '<small><b>Not in the total</b></small>'}` }
  ].concat(brCols, [
    a4Col('sold', 'Sold', 'num', r => r.n, r => String(r.n), r => r.n ? `<b>${a4N(String(r.n), r.n, { k: [r.p.k], t: r.p.s })}</b>` : a4Bc(0)),
    a4Col('aed', 'AED', 'num', r => r.aed, r => a4Aed(r.aed), r => r.n ? a4N(a4Aed(r.aed), r.n, { k: [r.p.k], t: r.p.s }) : a4Bc(0)),
    a4Col('cl', 'Clients', 'num', r => r.cl, r => String(r.cl), r => r.n ? a4N(String(r.cl), r.cl, { k: [r.p.k], t: r.p.s }) : a4Bc(0)),
    { k: 'fs', l: 'First sold', t: 'txt', raw: r => r.p.first, disp: r => r.p.first ? a4Day(r.p.first) : '–', cell: r => r.p.first ? a4Day(r.p.first) : '<span class="ad-zero">–</span>' },
    { k: 'ls', l: 'Last sold', t: 'txt', raw: r => r.p.last, disp: r => r.p.last ? a4Day(r.p.last) : '–', cell: r => r.p.last ? a4Day(r.p.last) : '<span class="ad-zero">–</span>' },
    { k: 'match', l: 'Match', t: 'txt', raw: r => r.p.ct, disp: r => r.p.ct, cell: r => `<span class="ad-tag ${r.p.c}">${r.p.ct}</span>` }
  ]), rs0 => {
    const rs = rs0.filter(r => r.p.cnt), keys = rs.map(r => r.p.k), n = a4Sum(rs, r => r.n), t = { n: 'Total: ' + a4Plural(rs.length, 'package') + (rs0.length > rs.length ? ' (price test apart)' : ''), sold: a4N(String(n), n, { k: keys, t: 'AED 499 packages sold' }), aed: a4Aed(a4Sum(rs, r => r.aed)), cl: String(a4Cli(a4Wr({ k: keys }))) };
    A4_BR.forEach(b => { const q = a4Wr({ k: keys, br: b[0] }).length; t['b' + b[0]] = q ? a4N(String(q), q, { k: keys, br: b[0], t: 'AED 499 packages sold' }) : a4Bc(0); });
    return t;
  }, { rowCls: r => r.p.cnt ? '' : 'ad-pt' });
}

// The Meta ads table: typed from Ads Manager, all time, not driven by the masthead. Plain figures (nothing behind them).
function a4AdsTable() {
  const m2 = n => (Math.round(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), z = n => n ? String(n) : '<span class="ad-zero">–</span>';
  a4Make('a4ads', A4_ADS, [
    { k: 'n', l: 'Ad', t: 'txt', raw: r => r.n, disp: r => r.n, cell: r => a4Esc(r.n) },
    { k: 'ty', l: 'Type', t: 'txt', raw: r => r.ty, disp: r => r.ty, cell: r => a4Esc(r.ty) },
    a4Col('sp', 'Spend (AED)', 'num', r => r.sp, r => m2(r.sp), r => m2(r.sp)),
    a4Col('im', 'Impressions', 'num', r => r.im, r => a4Money(r.im), r => a4Money(r.im)),
    a4Col('re', 'Reach', 'num', r => r.re, r => a4Money(r.re), r => a4Money(r.re)),
    a4Col('rs', 'Results', 'num', r => r.rs, r => String(r.rs), r => z(r.rs)),
    a4Col('cp', 'Cost per result (AED)', 'num', r => r.rs ? r.sp / r.rs : 0, r => r.rs ? m2(r.sp / r.rs) : '–', r => r.rs ? m2(r.sp / r.rs) : '<span class="ad-zero">–</span>'),
    { k: 'last', l: 'Last delivery', t: 'txt', raw: r => r.last, disp: r => r.last, cell: r => a4Esc(r.last) },
    { k: 'ed', l: 'Last edit', t: 'txt', raw: r => r.ed, disp: r => r.ed, cell: r => a4Esc(r.ed) }
  ], rows => { const sp = a4Sum(rows, r => r.sp), rs = a4Sum(rows, r => r.rs); return { n: 'Total of ' + rows.length + ' ads', sp: m2(sp), im: a4Money(a4Sum(rows, r => r.im)), re: '', rs: String(rs), cp: rs ? m2(sp / rs) : '' }; });
}


// ── ON THIS PAGE rail (the same shell as Active Deals Performance's) ────────
const A4_RAIL = [['a4-headline', 'Headline'], ['a4-month', 'Sales over time'], ['a4-branch', 'By branch'], ['a4-package', 'By package'], ['a4-ads', 'The Meta ads'], ['a4-notcounted', 'Not traced yet']];
function a4Rail(on) {
  const shell = document.getElementById('a4Shell'), side = document.getElementById('a4Side');
  if (!shell || !side) return;
  shell.classList.toggle('rv-norail', !on);
  const nav = side.querySelector('.side-nav');
  if (nav && on && !nav.dataset.sig) {
    nav.dataset.sig = '1';
    nav.innerHTML = '<div class="side-k">On this page</div>' + A4_RAIL.map(r => `<a href="#${r[0]}" onclick="lgJump(event,'${r[0]}')">${r[1]}</a>`).join('');
  }
  if (typeof spy === 'function') spy();
}
