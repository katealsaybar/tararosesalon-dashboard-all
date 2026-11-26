// Hair Colour Packages Performance (Kate, 26 Nov 2026): the three archived packages of the Phorest package category 1HAIR COLOR (BLEACHED ROOTS, GLOBAL BLEACHED,
// Hot Cocoa Kiss), in Active Deals Performance's format (same classes, css/active-deals.css). Numbers from pk_hair_colour() (migrations/pk_hair_colour.sql), Level 2
// and above, no client names: one row per sale, the client is an opaque "Client 12". Fetched once and filtered here, so a Branch or Period change in the masthead
// redraws at once. A price test (Hot Cocoa Kiss) is never inside a headline total: it sits beside it as "+N by price" (Kate's rule, 25 Nov 2026).
// Self-contained: it needs sb, TRS_LEVEL, sel, dateFrom, dateTo, activePeriodKey(), dateToIso(), TRSD (drill.js), TRSheet (sheet-table.js), whyWall().
const HC_BR = [['KCA', 'Khalifa City A'], ['SAA', 'Saadiyat'], ['MC', 'Motor City'], ['AQ', 'Al Quoz'], ['MRY', 'Marasy (closed)']];
const HC_PK = [
  { k: 'BR', n: 'BLEACHED ROOTS', pl: 'AED 590', price: 590, cnt: true, c: 'ok', ct: 'Exact name', what: 'Bleached roots and a toner at AED 0.' },
  { k: 'GB', n: 'GLOBAL BLEACHED', pl: 'AED 0', price: 0, cnt: true, c: 'ok', ct: 'Exact name', what: 'Global bleach, a toner on some sales, a 2 hr full head bleach from 2025. Priced per line.' },
  { k: 'HC', n: 'Hot Cocoa Kiss - Balayage Package', pl: 'AED 799', price: 799, cnt: false, c: 'warn', ct: 'Price test', what: 'No line carries this name. Found by price only.' }
];
const HC_KEYS = HC_PK.filter(p => p.cnt).map(p => p.k);
const HC_MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
let hcData = null, hcErr = '', hcBusy = false, hcM = null, hcResize = null, hcTs = {}, hcAllOnce = false;

const hcEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hcMoney = n => Math.round(Number(n) || 0).toLocaleString('en-US');
const hcAed = n => 'AED ' + hcMoney(n);
const hcPc = (a, b) => b ? Math.round(a / b * 100) + '%' : '0%';
const hcSum = (l, f) => l.reduce((a, r) => a + f(r), 0);
const hcOk = () => typeof TRS_LEVEL !== 'undefined' && TRS_LEVEL >= 2;
const hcDay = iso => { try { return new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return iso || ''; } };
const hcShort = iso => { try { return new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); } catch (e) { return iso || ''; } };
const hcWhen = iso => { try { return new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).replace(' at ', ', '); } catch (e) { return ''; } };
const hcOne = k => HC_PK.find(p => p.k === k) || { n: k };
const hcBrName = c => (HC_BR.find(b => b[0] === c) || [c, c])[1];
const hcCl = n => 'Client ' + n;
const hcPlural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

// ── THE MASTHEAD'S FILTERS ──────────────────────────────────────────────────
// Branch: ['all'] or codes. Marasy is closed and has no chip: it is in the numbers only under UAE Branches.
function hcCodes() {
  const all = HC_BR.map(b => b[0]);
  if (typeof sel === 'undefined' || !sel.branch || sel.branch.includes('all')) return all;
  return all.filter(c => sel.branch.includes(c));
}
function hcBranchLabel() {
  const c = hcCodes();
  if (typeof sel === 'undefined' || !sel.branch || sel.branch.includes('all') || c.length === HC_BR.length) return 'UAE Branches';
  return c.length ? c.map(hcBrName).join(' + ') : (sel.branch || []).join(' + ');
}
function hcRange() {
  const from = typeof dateFrom !== 'undefined' && dateFrom ? dateToIso(dateFrom) : '0000-01-01';
  const to = typeof dateTo !== 'undefined' && dateTo ? dateToIso(dateTo) : '9999-12-31';
  return { from, to };
}
function hcPeriodLabel() {
  const key = typeof activePeriodKey === 'function' ? activePeriodKey() : '';
  if (key && key !== 'Custom' && key !== 'Month' && key !== 'Year') return key;
  const r = hcRange();
  return r.from === r.to ? hcDay(r.from) : hcDay(r.from) + ' to ' + hcDay(r.to);
}

// ── THE SALES: one object per sale, built from the rows the function returns ────────────────────────────────
function hcPrep() {
  hcData.sales = (hcData.rows || []).map((r, i) => ({ id: i, o: r[0], b: r[1], d: String(r[2]).slice(0, 10), no: r[3], aed: +r[4], ci: +r[5], l: r[6] || [] }));
  const named = hcData.sales.filter(s => s.o !== 'HC');
  hcData.first = named.reduce((m, s) => !m || s.d < m ? s.d : m, '');
  hcData.last = named.reduce((m, s) => s.d > m ? s.d : m, '');
  const pkm = {}; (hcData.packages || []).forEach(p => { pkm[p.k] = p; });
  HC_PK.forEach(p => { const x = pkm[p.k] || {}; p.first = x.first || ''; p.last = x.last || ''; });
}
// o = { k: [package keys] (default: the counted ones), br: null (masthead) | '*' (all) | code, rng: {a, b} (default: the masthead's period), ci: a client }
function hcWr(o) {
  const w = hcRange(), r = o.rng || { a: w.from, b: w.to }, ks = o.k || HC_KEYS, codes = o.br === '*' ? HC_BR.map(b => b[0]) : o.br ? [o.br] : hcCodes();
  return (hcData ? hcData.sales : []).filter(s => ks.includes(s.o) && codes.includes(s.b) && s.d >= r.a && s.d <= r.b && (o.ci == null || s.ci === o.ci));
}
const hcCli = rs => new Set(rs.map(s => s.ci)).size;
const hcPk = (k, br) => { const rs = hcWr({ k: [k], br }); return { n: rs.length, aed: hcSum(rs, s => s.aed), cl: hcCli(rs) }; };

// ── CLICKABLE FIGURES: every count and AED opens the sales behind it, and a figure inside a window opens the next step down, to one sale ──────────────
function hcSaleSpec(s) {
  const p = hcOne(s.o), diff = Math.round((s.aed - p.price) * 100) / 100;
  const how = s.o === 'HC' ? 'Price test, not exact: a plain basket of services that adds up to AED 799' : 'Exact: the till line starts with ' + (s.l[0] ? s.l[0][0].split(' - ')[0] : p.n);
  const steps = [['Package', p.n + (p.price ? ' (AED ' + p.price + ')' : ' (AED 0, each line carries its own price)')], ['How it was matched', how], ['Date', hcDay(s.d)], ['Salon', hcBrName(s.b)], ['Sale number', String(s.no)], ['Client', hcCl(s.ci)], ['Lines in the sale', String(s.l.length)]]
    .concat(s.l.map((c, i) => ['Line ' + (i + 1), c[0] + ' · AED ' + Number(c[1]).toFixed(2)]));
  const note = s.o === 'HC' ? 'Price test: shown because its lines add up to AED 799 and include a balayage and an express toner. Nothing at the till says it was the Hot Cocoa Kiss package. '
    : s.o === 'GB' ? 'This package is AED 0 in Phorest, so the paid amount is just the lines added up. '
    : (Math.abs(diff) < 0.005 ? 'Paid the full package price. ' : 'Paid AED ' + Math.abs(diff).toFixed(2) + (diff < 0 ? ' less' : ' more') + ' than the package price. The till does not say why. ');
  return { title: p.n + ', ' + hcDay(s.d), tip: 'See the sale', cur: 'AED', views: [{ id: 'sale', label: 'The sale', load: async () => ({
    sub: hcBrName(s.b) + ' · sale ' + s.no + ' · ' + hcCl(s.ci) + ' · paid AED ' + s.aed.toFixed(2),
    note: 'This is the last step: one sale has nothing behind it. ' + note + 'Line by line it adds up to the paid amount.',
    cols: [{ k: 's', l: 'Step' }, { k: 'd', l: 'Detail' }], rows: steps.map(x => ({ s: x[0], d: x[1] })), foot: { s: 'Paid by the client', d: 'AED ' + s.aed.toFixed(2) } }) }] };
}
function hcWin(o) {
  if (typeof TRSD === 'undefined' || !hcData) return null;
  const rs0 = () => hcWr(o), sub = () => { const rs = rs0(); return (o.br === '*' ? 'UAE Branches' : o.br ? hcBrName(o.br) : hcBranchLabel()) + ' · ' + (o.rng ? (o.rng.a === o.rng.b ? hcDay(o.rng.a) : hcDay(o.rng.a) + ' to ' + hcDay(o.rng.b)) : hcPeriodLabel()) + ' · ' + hcPlural(rs.length, 'sale') + ' · ' + hcAed(hcSum(rs, s => s.aed)) + ' · ' + hcPlural(hcCli(rs), 'client'); };
  const rs = rs0(), views = [], t = o.t || 'Hair colour packages sold';
  const kinds = x => new Set(x).size;
  const w = (p) => Object.assign({}, o, p);
  if (o.ci == null) views.push({ id: 'clients', label: 'Clients', load: async () => {
    const m = {}; rs0().forEach(s => { const c = m[s.ci] || (m[s.ci] = { ci: s.ci, n: 0, a: 0, last: '', br: {} }); c.n++; c.a += s.aed; if (s.d > c.last) c.last = s.d; c.br[hcBrName(s.b)] = 1; });
    const list = Object.values(m).sort((a, b) => b.n - a.n || b.a - a.a || a.ci - b.ci), sp = c => hcWin(w({ ci: c.ci, t: t + ', ' + hcCl(c.ci) }));
    return { sub: sub(), cols: [{ k: 'c', l: 'Client' }, { k: 's', l: 'Salon' }, { k: 'n', l: 'Packages bought', t: 'num' }, { k: 'l', l: 'Last bought', t: 'date' }, { k: 'a', l: 'AED', t: 'aed' }],
      rows: list.map(c => ({ c: hcCl(c.ci), s: Object.keys(c.br).join(', '), n: c.n, l: c.last, a: c.a, _dn: { c: sp(c), n: sp(c), a: sp(c) } })),
      foot: { c: 'Total: ' + hcPlural(list.length, 'client'), n: rs.length, a: hcSum(rs, s => s.aed) } };
  } });
  if (kinds(rs.map(s => s.o)) > 1) views.push({ id: 'package', label: 'By package', load: async () => {
    const tot = hcSum(rs0(), s => s.aed);
    return { sub: sub(), cols: [{ k: 'p', l: 'Package' }, { k: 'n', l: 'Sold', t: 'num' }, { k: 'a', l: 'AED', t: 'aed' }, { k: 'sh', l: 'Share', t: 'pct' }],
      rows: HC_PK.filter(p => rs.some(s => s.o === p.k)).map(p => { const x = rs0().filter(s => s.o === p.k), sp = hcWin(w({ k: [p.k], t: p.n })); return { p: p.n, n: x.length, a: hcSum(x, s => s.aed), sh: tot ? hcSum(x, s => s.aed) / tot * 100 : 0, _dn: { n: sp, a: sp } }; }),
      foot: { p: 'Total', n: rs.length, a: tot } };
  } });
  if (kinds(rs.map(s => s.b)) > 1) views.push({ id: 'branch', label: 'By salon', load: async () => {
    const tot = hcSum(rs0(), s => s.aed);
    return { sub: sub(), cols: [{ k: 'b', l: 'Salon' }, { k: 'n', l: 'Sold', t: 'num' }, { k: 'a', l: 'AED', t: 'aed' }, { k: 'sh', l: 'Share', t: 'pct' }],
      rows: HC_BR.filter(b => rs.some(s => s.b === b[0])).map(b => { const x = rs0().filter(s => s.b === b[0]), sp = hcWin(w({ br: b[0], t: t + ', ' + b[1] })); return { b: b[1], n: x.length, a: hcSum(x, s => s.aed), sh: tot ? hcSum(x, s => s.aed) / tot * 100 : 0, _dn: { n: sp, a: sp } }; }),
      foot: { b: 'Total', n: rs.length, a: tot } };
  } });
  if (kinds(rs.map(s => s.d)) > 1) views.push({ id: 'day', label: 'By day', load: async () => {
    const m = {}; rs0().forEach(s => { const k = s.d + s.o + s.b, c = m[k] || (m[k] = { d: s.d, o: s.o, b: s.b, n: 0, a: 0 }); c.n++; c.a += s.aed; });
    const list = Object.values(m).sort((a, b) => a.d < b.d ? 1 : a.d > b.d ? -1 : 0), sp = c => hcWin(w({ k: [c.o], br: c.b, rng: { a: c.d, b: c.d }, t: hcOne(c.o).n + ', ' + hcDay(c.d) }));
    return { sub: sub(), cols: [{ k: 'd', l: 'Date', t: 'date' }, { k: 'o', l: 'Package' }, { k: 'b', l: 'Salon' }, { k: 'n', l: 'Sold', t: 'num' }, { k: 'a', l: 'AED', t: 'aed' }],
      rows: list.map(c => ({ d: c.d, o: hcOne(c.o).n, b: hcBrName(c.b), n: c.n, a: c.a, _dn: { n: sp(c), a: sp(c) } })),
      foot: { d: 'Total', n: rs.length, a: hcSum(rs, s => s.aed) } };
  } });
  views.push({ id: 'sales', label: 'Sales', load: async () => {
    const list = rs0().slice().sort((a, b) => a.d < b.d ? 1 : a.d > b.d ? -1 : (a.no < b.no ? 1 : -1));
    return { sub: sub(), note: 'Tap a number to see what is behind it, down to one sale. Clients are numbered, never named.',
      cols: [{ k: 'd', l: 'Date', t: 'date' }, { k: 'b', l: 'Salon' }, { k: 'o', l: 'Package' }, { k: 'no', l: 'Sale no.' }, { k: 'c', l: 'Client' }, { k: 'l', l: 'Lines', t: 'num' }, { k: 'a', l: 'Paid (AED)', t: 'num' }],
      rows: list.map(s => { const sp = hcSaleSpec(s), cs = o.ci == null ? hcWin(w({ ci: s.ci, t: t + ', ' + hcCl(s.ci) })) : null; return { d: s.d, b: hcBrName(s.b), o: hcOne(s.o).n, no: s.no, c: hcCl(s.ci), l: s.l.length, a: s.aed, _dn: { no: sp, l: sp, a: sp, c: cs } }; }),
      foot: { d: 'Total: ' + hcPlural(rs.length, 'sale'), l: hcSum(rs, s => s.l.length), a: hcSum(rs, s => s.aed) } };
  } });
  return { title: t, tip: 'See the sales', cur: 'AED', views };
}
// A figure that opens its sales. Zero stays plain (nothing behind it), and so does a figure when drill.js is not on the page.
const hcN = (html, n, o) => (n && typeof TRSD !== 'undefined') ? TRSD.num(html, hcWin(o)) : html;

// One Google Sheets table (sheet-table.js): sort and filter on every heading, and it keeps its filters when the page redraws.
function hcMake(id, rows, cols, total, extra) {
  if (typeof TRSheet === 'undefined' || !document.getElementById(id)) return null;
  const old = hcTs[id];
  const T = TRSheet.table(Object.assign({ id, el: '#' + id, rows: () => rows, cols, total }, extra || {}));
  if (old) { T.f = old.f; T.sort = old.sort; }
  hcTs[id] = T; T.draw(); return T;
}
const hcPhoneBtn = id => `<button type="button" class="ad-btn ad-phone" data-sxcm="${id}" aria-label="Sort and filter">Sort or filter</button>`;
const hcCol = (k, l, t, raw, disp, cell) => ({ k, l, t, raw, disp, cell });
const hcBc = n => n ? n : '<span class="ad-zero">–</span>';

// ── LOAD ────────────────────────────────────────────────────────────────────
async function renderHairColour(force) {
  const el = document.getElementById('pkHairColourContent');
  if (!el || !hcOk()) return;
  if (hcData && !force) { hcPaint(); return; }
  if (hcBusy) return;
  hcBusy = true; hcErr = '';
  el.innerHTML = '<div class="ad-state">Reading the till…</div>';
  try {
    const { data, error } = await sb.rpc('pk_hair_colour', { p_summary: false });
    if (error || !data || !Array.isArray(data.rows)) throw error || new Error('no report');
    hcData = data; hcPrep();
  } catch (e) { console.error(e); hcErr = 'The report did not load. Press Refresh to try again.'; }
  hcBusy = false;
  hcPaint();
}

// Day, Monday-start week, calendar month or quarter buckets between two ISO dates.
function hcBuckets(a, b, unit) {
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
function hcBucketLabel(b, unit) {
  if (!b) return '';
  const [y, m] = b.a.split('-').map(Number);
  if (unit === 'quarter') return 'Q' + (Math.floor((m - 1) / 3) + 1) + ' ' + y;
  if (unit === 'month') return HC_MON[m - 1] + ' ' + y;
  if (unit === 'week') return 'Week of ' + hcShort(b.a);
  return hcShort(b.a);
}
function hcAxis(b, unit) {
  const [y, m] = b.a.split('-').map(Number);
  if (unit === 'quarter') return 'Q' + (Math.floor((m - 1) / 3) + 1) + ' ’' + String(y).slice(2);
  if (unit === 'month') return HC_MON[m - 1].slice(0, 3);
  return hcShort(b.a);
}

// ── PAINT ───────────────────────────────────────────────────────────────────
function hcPaint() {
  const el = document.getElementById('pkHairColourContent');
  if (!el) return;
  const head = `<div class="ad-top"><div><h1 class="ad-t">Hair Colour Packages Performance</h1><p class="ad-sub">${hcData ? 'As of ' + hcEsc(hcWhen(hcData.at)) + '. Phorest sales, the archived packages of the 1HAIR COLOR category.' : ''}</p></div>
    <div class="ad-toplinks"><button class="ad-btn" type="button" onclick="renderHairColour(true)">Refresh</button>
    <a class="ad-btn" href="/?view=pkdir" onclick="if(trsPlain(event)){event.preventDefault();showView('pkdir', null)}">Campaigns Directory</a></div></div>`;
  if (hcErr || !hcData) { el.innerHTML = head + `<div class="ad-state">${hcEsc(hcErr || 'No report yet.')}</div>`; hcRail(false); return; }

  const rs = hcWr({}), n = rs.length, aed = hcSum(rs, s => s.aed), nc = hcCli(rs);
  if (!n) {
    const key = typeof activePeriodKey === 'function' ? activePeriodKey() : '';
    const named = key && key !== 'Custom' && key !== 'Month' && key !== 'Year';
    el.innerHTML = head + `<section class="ad-card"><div class="ad-empty">No hair colour package was sold at ${hcEsc(hcBranchLabel())} in ${hcEsc(named ? hcPeriodLabel().toLowerCase() : hcPeriodLabel())}. These are archived offers: they sold from ${hcEsc(hcDay(hcData.first))} to ${hcEsc(hcDay(hcData.last))}.
      ${key !== 'All time' ? `<button type="button" class="ad-btn" style="margin-left:6px" onclick="document.querySelector('#periodChips .chip[data-v=&quot;All time&quot;]')?.click()">See all time instead</button>` : 'Widen the Branch in the header.'}</div></section>`;
    hcM = null; hcRail(false);
    if (!hcAllOnce && key !== 'All time') { hcAllOnce = true; document.querySelector('#periodChips .chip[data-v="All time"]')?.click(); }
    return;
  }
  hcAllOnce = true;
  const w = hcRange(), today = dateToIso(new Date());
  const byK = HC_PK.map(p => { const s = hcPk(p.k); return Object.assign({ n: s.n, aed: s.aed, cl: s.cl }, { p }); });
  const counted = byK.filter(x => x.p.cnt), best = counted.slice().sort((a, b) => b.n - a.n || b.aed - a.aed)[0], withSale = counted.filter(x => x.n > 0).length;
  const start = w.from > hcData.first ? w.from : hcData.first, end = w.to < hcData.last ? w.to : hcData.last;
  const span = Math.max(1, Math.round((new Date(end + 'T12:00:00') - new Date(start + 'T12:00:00')) / 864e5) + 1);
  const unit = span <= 31 ? 'day' : span <= 140 ? 'week' : span <= 900 ? 'month' : 'quarter';
  const bk = hcBuckets(start, end, unit);
  bk.forEach(b => { const x = hcWr({ rng: { a: b.a, b: b.b } }); b.n = x.length; b.t = hcSum(x, s => s.aed); b.ci = hcCli(x); const m = {}; x.forEach(s => { m[s.o] = (m[s.o] || 0) + 1; }); const tk = Object.keys(m).sort((p, q) => m[q] - m[p])[0]; b.top = tk ? hcOne(tk).n : ''; });
  const busy = bk.slice().sort((a, b) => b.n - a.n)[0], cnt = {}; rs.forEach(s => { cnt[s.ci] = (cnt[s.ci] || 0) + 1; });
  const again = Object.keys(cnt).filter(c => cnt[c] > 1).length, per = n / (span / 30.44), last = rs.reduce((m, s) => s.d > m ? s.d : m, '');
  const brs = HC_BR.map(b => { const q = hcWr({ br: b[0] }), m = {}; q.forEach(s => { m[s.o] = (m[s.o] || 0) + 1; }); const tk = Object.keys(m).sort((p, q2) => m[q2] - m[p])[0]; return { code: b[0], name: b[1], on: hcCodes().includes(b[0]), n: q.length, aed: hcSum(q, s => s.aed), cl: hcCli(q), top: tk ? hcOne(tk).n : '' }; });
  const hcRs = hcWr({ k: ['HC'] }), hcA = hcSum(hcRs, s => s.aed);
  hcM = { bk, unit, brs, byK, aed, n, nc };
  const unitName = unit;
  const dAll = { t: 'Hair colour packages sold' }, dHC = { k: ['HC'], t: 'Hot Cocoa Kiss, price test' };
  const topB = brs.slice().sort((a, b) => b.n - a.n)[0];

  let h = head + whyWall([
    ['Why this page', 'Three colour packages were archived in Phorest: Bleached Roots, Global Bleached and Hot Cocoa Kiss. This page shows what each one sold, where, and to how many clients.'],
    ['Why now', 'Active Deals Performance counts only the 2026 brochure. These older colour offers had no page, and once they are archived their sales are easy to forget.'],
    ['If we do nothing', 'We price the next bleach or balayage package without knowing that one client bought Bleached Roots ten times, and that Hot Cocoa Kiss left no name at the till.']]);
  h += `<section class="ad-card" id="hc-headline"><div class="ad-hero"><div>
      <div class="ad-cap">Hair colour packages sold</div><div class="ad-big">${hcN(`${n} <small>sale${n === 1 ? '' : 's'}, ${hcAed(aed)}</small>`, n, dAll)}</div>
      <div class="ad-track"><div class="ad-fill" style="width:${Math.round(withSale / HC_KEYS.length * 100)}%"></div></div>
      <div class="ad-cap">${withSale} of ${HC_KEYS.length} packages with a name at the till have a sale in this window${hcRs.length ? ' · ' + hcN(`+${hcRs.length} by price`, hcRs.length, dHC) + ', Hot Cocoa Kiss, not in the total' : ''}</div></div>
    <div class="ad-pace"><div class="ad-status warn"><span aria-hidden="true">!</span>Hot Cocoa Kiss: price test only, not counted</div>
      <div class="ad-row"><span>Averaging, while it sold</span><b>${per.toFixed(1)} sales a month</b></div>
      <div class="ad-row"><span>Busiest ${unitName}</span><b>${hcEsc(hcBucketLabel(busy, unit))}, ${hcPlural(busy.n, 'sale')}</b></div>
      <div class="ad-row"><span>Latest sale</span><b>${hcEsc(hcDay(last))}</b></div>
      <div class="ad-row"><span>Best seller</span><b>${hcEsc(best.p.n)}</b></div>
      <div class="ad-row"><span>Bought more than once</span><b>${hcN(`${again} of ${nc} clients`, again, dAll)}</b></div></div></div></section>`;
  h += `<div class="ad-tiles">${[
    ['Packages sold', hcN(`${n} <small style="font-family:var(--sans);font-size:13px;color:var(--muted);font-weight:500">sales</small>`, n, dAll), 'at the till, by package name', ''],
    ['AED sold', hcN(hcAed(aed), n, dAll), 'paid by clients, VAT included', ''],
    ['Average sale', hcAed(aed / n), 'per package sale', ''],
    ['Different clients', hcN(String(nc), nc, dAll), again + ' bought more than once', ''],
    ['Best seller', hcN(hcEsc(best.p.n), best.n, { k: [best.p.k], t: best.p.n }), hcN(hcPlural(best.n, 'sale'), best.n, { k: [best.p.k], t: best.p.n }), 'txt']
  ].map(t => `<div class="ad-tile"><div class="l">${t[0]}</div><div class="v ${t[3]}">${t[1]}</div><div class="h">${t[2]}</div></div>`).join('')}</div>`;
  h += `<p class="ad-sub"><b>What to watch.</b> ${hcEsc(topB.name)} has ${hcN(`${topB.n} of the ${n} sales`, topB.n, { br: topB.code, t: topB.name })} and ${n - topB.n ? 'the other salons share ' + (n - topB.n) + '.' : 'the other salons have none.'}</p>`;

  const qn = bk.filter(b => !b.n).length;
  h += `<section class="ad-card" id="hc-month"><h2>Sales over time</h2><p class="ad-sub">When the packages sold: sales each ${unitName}, by the date of the sale. They are archived, so the bars stop. <b>What to watch.</b> ${hcEsc(hcBucketLabel(busy, unit))} is the busiest ${unitName}, with ${hcPlural(busy.n, 'sale')}. ${qn ? `${qn} of ${bk.length} ${unitName}s have no sale at all.` : `Every ${unitName} in this window has at least one sale.`}</p>
    <div class="ad-chart" id="hcMonChart"></div>
    <details><summary>Show as table</summary><div id="hcMonTable"></div></details></section>`;
  h += `<section class="ad-card" id="hc-branch"><h2>By branch</h2><p class="ad-sub">Which salon is selling the packages: the cash taken at each one. Branches outside your header filter are shown faded. Marasy is closed and only has history.</p>
    <div class="ad-chart" id="hcBrChart"></div>
    <details><summary>Show as table</summary><div>${hcPhoneBtn('hcbr')}<table id="hcbr"></table></div></details></section>`;
  h += `<section class="ad-card" id="hc-package"><h2>By package</h2><p class="ad-sub">The three archived packages, oldest first, with the salons that sold each and the cash. Tap a heading to sort or filter another way. <b>What to watch.</b> ${hcEsc(best.p.n)} is ${hcN(`${best.n} of the ${n} sales`, best.n, { k: [best.p.k], t: best.p.n })}. Hot Cocoa Kiss has no name at the till and is shown by price only: see Not counted.</p>
    <div>${hcPhoneBtn('hcpk')}<table id="hcpk"></table></div></section>`;
  h += `<section class="ad-card" id="hc-notcounted"><h2>Not counted</h2><p class="ad-sub">What we found but kept out of the totals, and what we could not trace.</p><ul class="ad-list">${hcNotCounted()}</ul>
    <h3 class="ad-subh">Waiting on a word</h3><ol class="ad-ask">
      <li><b>Kate:</b> was “Bleached Roots and Toner” ever sold as the AED 590 package under an older name? If yes, it adds 247 sales and AED 137,415.</li>
      <li><b>Kate:</b> is the Motor City AED 799 run (Feb to Jun 2023) Hot Cocoa Kiss? Only you or the colour team can say.</li>
      <li><b>Kate:</b> do you have a slide or an ad for any of the three? Save the image and it goes in a Slide column.</li></ol></section>
    <details class="more"><summary>How these numbers are counted</summary>
      <p class="ad-sub">Sold is distinct sales (branch, date, sale id): a package is one sale made of lines named after it, so we count sales, not lines. AED is what the client paid for the package’s own lines, VAT included, a refund taken off. A sale counts only when its package lines add up to more than AED 0.</p>
      <p class="ad-sub">Spelling variants (BLEACHED ROOTAS, GLOBAL BLEACH) are counted. Plain services with a similar name, such as Bleached Roots and Toner (247 sales), are not packages and are not counted. Active Deals Performance covers the 2026 brochure and none of its names is here, so nothing is counted twice.</p>
      <p class="ad-sub">Hot Cocoa Kiss is a price test: a sale of exactly AED 799 with a balayage line and an express toner line. It is shown beside the total as “+N by price” and is in no total.</p>
      <p class="ad-sub">Clients are numbered inside the report, never named: “Client 12” is the same person everywhere on this page. Sale lines are in the dashboard from 23 May 2021. Bahrain has no lines for these packages. Data comes from the daily Phorest Sales Transactions upload, so today’s sales appear after the nightly run.</p></details>`;
  el.innerHTML = h;
  hcCharts(); hcTables(); hcRail(true);
}
function hcNotCounted() {
  const hc = hcData.sales.filter(s => s.o === 'HC'), mc = hc.filter(s => s.b === 'MC');
  const all = { rng: { a: '0000-01-01', b: '9999-12-31' }, br: '*' };
  const hcS = hcN(`${hc.length} sales, ${hcAed(hcSum(hc, s => s.aed))}`, hc.length, Object.assign({ k: ['HC'], t: 'Hot Cocoa Kiss, price test' }, all));
  const hcMC = hcN(`${mc.length} at Motor City`, mc.length, Object.assign({ k: ['HC'], t: 'Hot Cocoa Kiss, price test, Motor City' }, all, { br: 'MC' }));
  const hf = hc.reduce((m, s) => !m || s.d < m ? s.d : m, ''), hl = hc.reduce((m, s) => s.d > m ? s.d : m, '');
  const th = (a, b) => `<span class="ad-th ad-ph" aria-hidden="true"><span>${a}</span><em>${b}</em></span>`;
  return [
    [th('Price', 'test'), `<b>Hot Cocoa Kiss - Balayage Package, AED 799</b> Price test, not exact, in no total. No line at the till carries this name. By price only: ${hcS} of a balayage and an express toner adding up to AED 799, from ${hcEsc(hcDay(hf))} to ${hcEsc(hcDay(hl))}, ${hcMC}. Weak: at Motor City these lines are at normal menu prices that happen to add up to 799, so it may be an ordinary balayage basket and not this package.`],
    [th('AED 0', 'line'), '<b>Free lines on their own, 3</b> A toner or a redo rung up at AED 0 with nothing else from the package: Saadiyat 17 Apr 2022, Khalifa City A 28 Mar 2025 and 10 May 2025. No payment, so not a sale. (Read 25 Nov 2026.)'],
    [th('Service', 'only'), '<b>The same colour sold as a plain service</b> Not a package, not counted. Bleached Roots and Toner, 247 sales, AED 137,415 (1 Jul 2021 to 23 Nov 2024). Bleached Roots NO TONER 45 mins, 89 sales, AED 47,555 (2 Dec 2024 to 11 Nov 2025). Global Bleach Application - Toner, 42 sales, AED 25,730 (6 Oct 2021 to 6 Nov 2024). Bleached Roots by size, 82 sales since 12 Nov 2025, is today’s menu service. (Read 25 Nov 2026.)'],
    [th('Slide', 'none'), '<b>Slides and ads, none found</b> Searched 25 Nov 2026. No brochure slide and no Meta ad for these three. The Meta posts held (Instagram, Facebook, TikTok) have no caption for Hot Cocoa, Bleached Roots or Global Bleach.']
  ].map(x => `<li class="ad-of">${x[0]}<div>${x[1]}</div></li>`).join('');
}

// ── CHARTS (hand-drawn SVG, the Active Deals page's style) ──────────────────
function hcTipHost() {
  const c = document.getElementById('pkHairColourContent');
  let t = document.getElementById('hcTip');
  if (!t && c) { t = document.createElement('div'); t.id = 'hcTip'; t.className = 'ad-tip'; c.appendChild(t); }
  return t;
}
function hcHover(host, selector, fn) {
  const tip = hcTipHost(), box = document.getElementById('pkHairColourContent');
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
function hcCharts() {
  if (!hcM || !document.getElementById('hcMonChart')) return;
  const { bk, unit, brs } = hcM;
  let host = document.getElementById('hcMonChart'), W = Math.max(300, host.clientWidth), H = 210, L = 38, R = 8, T = 14, B = 26;
  const ymax = Math.max(4, Math.ceil(Math.max(...bk.map(x => x.n)) / 4) * 4), bw = (W - L - R) / bk.length;
  const Y = v => T + (1 - v / ymax) * (H - T - B);
  const every = Math.max(1, Math.ceil(bk.length / Math.floor((W - L) / 54)));
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Hair colour packages sold per ${unit}">`;
  for (let g = 0; g <= ymax + 1e-9; g += ymax / 4) s += `<line class="gl" x1="${L}" x2="${W - R}" y1="${Y(g)}" y2="${Y(g)}"/><text class="ax" x="${L - 6}" y="${Y(g) + 4}" text-anchor="end">${Math.round(g)}</text>`;
  bk.forEach((x, i) => {
    const gap = Math.min(3, bw / 4), bx = L + i * bw + gap, bwi = Math.max(2, bw - gap * 2), h = Y(0) - Y(x.n), rr = Math.min(4, h, bwi / 2);
    if (x.n) {
      s += `<path d="M${bx} ${Y(0)} v${-(h - rr)} q0 -${rr} ${rr} -${rr} h${bwi - 2 * rr} q${rr} 0 ${rr} ${rr} v${h - rr}Z" fill="var(--series)"/>`;
      if (bw > 20) s += `<text class="ax" x="${bx + bwi / 2}" y="${Y(x.n) - 5}" text-anchor="middle" style="fill:var(--ink);font-weight:600">${x.n}</text>`;
    }
    if (i % every === 0) s += `<text class="ax" x="${bx + bwi / 2}" y="${H - 6}" text-anchor="middle">${hcAxis(x, unit)}</text>`;
    s += `<rect x="${L + i * bw}" y="${T}" width="${bw}" height="${H - T - B}" fill="transparent" data-i="${i}"/>`;
  });
  host.innerHTML = s + '</svg>';
  hcHover(host, 'rect[data-i]', i => { const x = bk[i]; return `<b>${hcEsc(hcBucketLabel(x, unit))}</b><br>${hcPlural(x.n, 'sale')} · ${hcAed(x.t)}${x.n ? `<br>${hcPlural(x.ci, 'client')}. Most sold: ${hcEsc(x.top)}` : ''}`; });
  hcMonthTbl();

  host = document.getElementById('hcBrChart'); W = Math.max(300, host.clientWidth);
  const narrow = W < 460, rowH = 34, H2 = brs.length * rowH + 4, L2 = narrow ? 88 : 116, R2 = narrow ? 118 : 150, mx = Math.max(...brs.map(r => r.aed)) || 1;
  s = `<svg viewBox="0 0 ${W} ${H2}" role="img" aria-label="Cash taken by branch">`;
  brs.forEach((r, i) => {
    const y = i * rowH + 6, w = r.aed > 0 ? Math.max(4, r.aed / mx * (W - L2 - R2)) : 0;
    s += `<g opacity="${r.on ? 1 : .35}"><text class="ax" x="0" y="${y + 15}" style="fill:var(--ink2);font-size:12px">${r.name}</text>`;
    if (w) s += `<rect x="${L2}" y="${y}" width="${w}" height="20" rx="4" fill="var(--series)"/>`;
    s += `<text class="ax" x="${L2 + w + 8}" y="${y + 15}" style="fill:var(--ink);font-size:12px">${hcAed(r.aed)} · ${r.n} sold</text></g><rect x="0" y="${y - 5}" width="${W}" height="${rowH}" fill="transparent" data-i="${i}"/>`;
  });
  host.innerHTML = s + '</svg>';
  hcHover(host, 'rect[data-i]', i => { const r = brs[i]; return `<b>${r.name}</b><br>${hcPlural(r.n, 'sale')} · ${hcAed(r.aed)} · ${hcPlural(r.cl, 'client')}<br>${r.top ? 'Most sold: ' + hcEsc(r.top) : 'No sales'}`; });
}
window.addEventListener('resize', () => {
  clearTimeout(hcResize);
  hcResize = setTimeout(() => { const v = document.getElementById('view-pkhaircolour'); if (v && v.offsetParent) hcCharts(); }, 120);
});

// ── THE TABLES, Google Sheets style (sheet-table.js): a menu on every heading ───────────────────────────────────────────────────
function hcMonthTbl() {
  const host = document.getElementById('hcMonTable'); if (!host || !hcM) return;
  const { bk, unit } = hcM;
  host.innerHTML = hcPhoneBtn('hcmon') + '<table id="hcmon"></table>';
  const lab = x => hcBucketLabel(x, unit), ttl = x => 'Hair colour packages sold · ' + hcBucketLabel(x, unit), rg = x => ({ a: x.a, b: x.b });
  hcMake('hcmon', bk, [
    { k: 'p', l: unit === 'quarter' ? 'Quarter' : unit === 'month' ? 'Month' : unit === 'week' ? 'Week of' : 'Day', t: 'txt', raw: x => x.a, disp: lab, cell: x => hcEsc(lab(x)) },
    hcCol('n', 'Sold', 'num', x => x.n, x => String(x.n), x => hcN(String(x.n), x.n, { t: ttl(x), rng: rg(x) })),
    hcCol('a', 'AED', 'num', x => x.t, x => hcAed(x.t), x => hcN(hcAed(x.t), x.n, { t: ttl(x), rng: rg(x) }))
  ], rows => ({ p: 'Total', n: hcN(String(hcSum(rows, x => x.n)), hcSum(rows, x => x.n), { t: 'Hair colour packages sold' }), a: hcAed(hcSum(rows, x => x.t)) }));
}
function hcTables() {
  if (!hcM) return;
  const { brs, byK, aed } = hcM;
  hcMake('hcbr', brs, [
    { k: 'name', l: 'Salon', t: 'txt', raw: b => b.name, disp: b => b.name, cell: b => hcEsc(b.name) },
    hcCol('n', 'Sold', 'num', b => b.n, b => String(b.n), b => hcN(String(b.n), b.n, { br: b.code, t: b.name })),
    hcCol('a', 'AED', 'num', b => b.aed, b => hcAed(b.aed), b => hcN(hcAed(b.aed), b.n, { br: b.code, t: b.name })),
    hcCol('cl', 'Clients', 'num', b => b.cl, b => String(b.cl), b => hcN(String(b.cl), b.cl, { br: b.code, t: b.name })),
    hcCol('s', 'Share of AED', 'num', b => aed ? b.aed / aed : 0, b => hcPc(b.aed, aed), b => hcPc(b.aed, aed)),
    { k: 'top', l: 'Most sold', t: 'txt', raw: b => b.top, disp: b => b.top, cell: b => hcEsc(b.top) }
  ], rows => { const n = hcSum(rows, b => b.n); return { name: 'Total', n: hcN(String(n), n, { br: '*', t: 'Hair colour packages sold' }), a: hcAed(hcSum(rows, b => b.aed)), cl: String(hcCli(hcWr({ br: '*' }))) }; }, { rowCls: b => b.on ? '' : 'ad-off' });
  // By package: counted ones first, oldest first, the price test last
  const rows = byK.slice().sort((a, b) => (b.p.cnt - a.p.cnt) || a.p.first.localeCompare(b.p.first));
  const brCols = HC_BR.map(b => hcCol('b' + b[0], b[1], 'num', r => hcPk(r.p.k, b[0]).n, r => String(hcPk(r.p.k, b[0]).n), r => { const n = hcPk(r.p.k, b[0]).n; return n ? hcN(String(n), n, { k: [r.p.k], br: b[0], t: r.p.n }) : hcBc(0); }));
  hcMake('hcpk', rows, [
    { k: 'n', l: 'Package', t: 'txt', raw: r => r.p.n, disp: r => r.p.n, cell: r => `<b title="${hcEsc(r.p.what)}">${hcEsc(r.p.n)}</b><small>${r.p.pl}${r.p.cnt ? '' : ' · not in the total'}</small>` }
  ].concat(brCols, [
    hcCol('sold', 'Sold', 'num', r => r.n, r => String(r.n), r => r.n ? `<b>${hcN(String(r.n), r.n, { k: [r.p.k], t: r.p.n })}</b>` : hcBc(0)),
    hcCol('aed', 'AED', 'num', r => r.aed, r => hcAed(r.aed), r => r.n ? hcN(hcAed(r.aed), r.n, { k: [r.p.k], t: r.p.n }) : hcBc(0)),
    hcCol('cl', 'Clients', 'num', r => r.cl, r => String(r.cl), r => r.n ? hcN(String(r.cl), r.cl, { k: [r.p.k], t: r.p.n }) : hcBc(0)),
    { k: 'fs', l: 'First sold', t: 'txt', raw: r => r.p.first, disp: r => hcDay(r.p.first), cell: r => hcDay(r.p.first) },
    { k: 'ls', l: 'Last sold', t: 'txt', raw: r => r.p.last, disp: r => hcDay(r.p.last), cell: r => hcDay(r.p.last) },
    { k: 'match', l: 'Match', t: 'txt', raw: r => r.p.ct, disp: r => r.p.ct, cell: r => `<span class="ad-tag ${r.p.c}">${r.p.ct}</span>` }
  ]), rs0 => {
    const rs = rs0.filter(r => r.p.cnt), keys = rs.map(r => r.p.k), n = hcSum(rs, r => r.n), t = { n: 'Total: ' + hcPlural(rs.length, 'package') + (rs0.length > rs.length ? ' (price test left out)' : ''), sold: hcN(String(n), n, { k: keys, t: 'Hair colour packages sold' }), aed: hcAed(hcSum(rs, r => r.aed)), cl: String(hcCli(hcWr({ k: keys }))) };
    HC_BR.forEach(b => { const q = hcWr({ k: keys, br: b[0] }).length; t['b' + b[0]] = q ? hcN(String(q), q, { k: keys, br: b[0], t: 'Hair colour packages sold' }) : hcBc(0); });
    return t;
  });
}

// ── ON THIS PAGE rail (the same shell as Active Deals Performance's) ────────
const HC_RAIL = [['hc-headline', 'Headline'], ['hc-month', 'Sales over time'], ['hc-branch', 'By branch'], ['hc-package', 'By package'], ['hc-notcounted', 'Not counted']];
function hcRail(on) {
  const shell = document.getElementById('hcShell'), side = document.getElementById('hcSide');
  if (!shell || !side) return;
  shell.classList.toggle('rv-norail', !on);
  const nav = side.querySelector('.side-nav');
  if (nav && on && !nav.dataset.sig) {
    nav.dataset.sig = '1';
    nav.innerHTML = '<div class="side-k">On this page</div>' + HC_RAIL.map(r => `<a href="#${r[0]}" onclick="lgJump(event,'${r[0]}')">${r[1]}</a>`).join('');
  }
  if (typeof spy === 'function') spy();
}
