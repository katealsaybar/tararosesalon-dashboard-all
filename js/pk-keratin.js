// Keratin Packages Performance (Kate, 26 Nov 2026): the twelve archived packages of the Phorest package category 1TREATMENT - KERATIN (FRIZZ FREE, SMOOTH & DEFRIZZ,
// SUPREME STRAIGHT in Short, Medium, Long and Extra long), in Active Deals Performance's format (same classes, css/active-deals.css). Numbers from pk_keratin()
// (migrations/pk_keratin.sql), Level 2 and above, no client names: one row per sale, the client is an opaque "Client 12". Fetched once and filtered here, so a Branch or
// Period change in the masthead redraws at once. Every package here has its own name at the till, so nothing is a price test.
// Self-contained: it needs sb, TRS_LEVEL, sel, dateFrom, dateTo, activePeriodKey(), dateToIso(), TRSD (drill.js), TRSheet (sheet-table.js), whyWall().
const KR_BR = [['KCA', 'Khalifa City A'], ['SAA', 'Saadiyat'], ['MC', 'Motor City'], ['AQ', 'Al Quoz'], ['MRY', 'Marasy (closed)']];
const KR_TR = [['F', 'FRIZZ FREE', 'AED 885 to 1,450'], ['D', 'SMOOTH & DEFRIZZ', 'AED 885 to 1,450'], ['S', 'SUPREME STRAIGHT', 'AED 1,085 to 1,600']];
const KR_LN = [['S', 'Short', 'SHORT'], ['M', 'Medium', 'MEDIUM'], ['L', 'Long', 'LONG'], ['X', 'Extra long', 'EXTRA LONG']];
const KR_PRICE = { F: [885, 1095, 1250, 1450], D: [885, 1095, 1250, 1450], S: [1085, 1285, 1400, 1600] };
const KR_PK = [];
KR_TR.forEach(t => KR_LN.forEach((l, i) => KR_PK.push({ k: t[0] + l[0], tr: t[0], ln: l[0], n: t[1] + ' - ' + l[2], pl: 'AED ' + KR_PRICE[t[0]][i].toLocaleString('en-US'), price: KR_PRICE[t[0]][i], cnt: true, c: 'ok', ct: 'Exact name', what: 'Application and Ironing steps, rung as one sale.' })));
const KR_KEYS = KR_PK.map(p => p.k);
const KR_MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
let krData = null, krErr = '', krBusy = false, krM = null, krResize = null, krTs = {}, krAllOnce = false, krN = { pk: 10 };

const krEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const krMoney = n => Math.round(Number(n) || 0).toLocaleString('en-US');
const krAed = n => 'AED ' + krMoney(n);
const krPc = (a, b) => b ? Math.round(a / b * 100) + '%' : '0%';
const krSum = (l, f) => l.reduce((a, r) => a + f(r), 0);
const krOk = () => typeof TRS_LEVEL !== 'undefined' && TRS_LEVEL >= 2;
const krDay = iso => { try { return new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return iso || ''; } };
const krShort = iso => { try { return new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); } catch (e) { return iso || ''; } };
const krWhen = iso => { try { return new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).replace(' at ', ', '); } catch (e) { return ''; } };
const krOne = k => KR_PK.find(p => p.k === k) || { n: k, price: 0 };
const krTrName = c => (KR_TR.find(t => t[0] === c) || [c, c])[1];
const krBrName = c => (KR_BR.find(b => b[0] === c) || [c, c])[1];
const krCl = n => 'Client ' + n;
const krPlural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
const krPayOf = s => s.rf ? 'ref' : s.aed === 0 ? 'zero' : s.disc > 0 ? 'disc' : 'full';
const krPayName = { full: 'Paid full price', disc: 'Discounted', zero: 'AED 0 on the line' };

// ── THE MASTHEAD'S FILTERS ──────────────────────────────────────────────────
// Branch: ['all'] or codes. Marasy is closed and has no chip: it is in the numbers only under UAE Branches.
function krCodes() {
  const all = KR_BR.map(b => b[0]);
  if (typeof sel === 'undefined' || !sel.branch || sel.branch.includes('all')) return all;
  return all.filter(c => sel.branch.includes(c));
}
function krBranchLabel() {
  const c = krCodes();
  if (typeof sel === 'undefined' || !sel.branch || sel.branch.includes('all') || c.length === KR_BR.length) return 'UAE Branches';
  return c.length ? c.map(krBrName).join(' + ') : (sel.branch || []).join(' + ');
}
function krRange() {
  const from = typeof dateFrom !== 'undefined' && dateFrom ? dateToIso(dateFrom) : '0000-01-01';
  const to = typeof dateTo !== 'undefined' && dateTo ? dateToIso(dateTo) : '9999-12-31';
  return { from, to };
}
function krPeriodLabel() {
  const key = typeof activePeriodKey === 'function' ? activePeriodKey() : '';
  if (key && key !== 'Custom' && key !== 'Month' && key !== 'Year') return key;
  const r = krRange();
  return r.from === r.to ? krDay(r.from) : krDay(r.from) + ' to ' + krDay(r.to);
}

// ── THE SALES: one object per sale, built from the rows the function returns ────────────────────────────────
// x: 0 Application only, 1 Application and Ironing, 2 a refund (comes off the AED, is not a sale).
function krPrep() {
  krData.sales = (krData.rows || []).map((r, i) => ({ id: i, o: r[0], b: r[1], d: String(r[2]).slice(0, 10), no: r[3], aed: +r[4], ci: +r[5], disc: +r[6], x: +r[7], rf: +r[7] === 2, l: r[8] || [] }));
  const named = krData.sales.filter(s => !s.rf);
  krData.first = named.reduce((m, s) => !m || s.d < m ? s.d : m, '');
  krData.last = named.reduce((m, s) => s.d > m ? s.d : m, '');
  const pkm = {}; (krData.packages || []).forEach(p => { pkm[p.k] = p; });
  KR_PK.forEach(p => { const x = pkm[p.k] || {}; p.first = x.first || ''; p.last = x.last || ''; });   // all time, whatever the header says
}
const krCnt = rs => rs.filter(s => !s.rf).length;
const krCli = rs => new Set(rs.filter(s => !s.rf).map(s => s.ci)).size;
// o = { k: [package keys] (default: all twelve), br: null (masthead) | '*' (all) | code, rng: {a, b} (default: the masthead's period), ci: a client, pay: 'full' | 'disc' | 'zero' }
function krWr(o) {
  const w = krRange(), r = o.rng || { a: w.from, b: w.to }, ks = o.k || KR_KEYS, codes = o.br === '*' ? KR_BR.map(b => b[0]) : o.br ? [o.br] : krCodes();
  return (krData ? krData.sales : []).filter(s => ks.includes(s.o) && codes.includes(s.b) && s.d >= r.a && s.d <= r.b && (o.ci == null || s.ci === o.ci) && (!o.pay || krPayOf(s) === o.pay));
}
const krPk = (k, br) => { const rs = krWr({ k: [k], br }); return { n: krCnt(rs), aed: krSum(rs, s => s.aed), cl: krCli(rs) }; };

// ── CLICKABLE FIGURES: every count and AED opens the sales behind it, and a figure inside a window opens the next step down, to one sale ──────────────
function krSaleSpec(s) {
  const p = krOne(s.o), pay = krPayOf(s);
  const lines = s.l.length ? s.l : [['(no line)', s.aed]];
  const steps = [['Package', p.n + ' (Phorest price AED ' + krMoney(p.price) + ')'], ['Name at the till', lines[0][0].split(' - ').slice(0, 2).join(' - ')], ['Date', krDay(s.d)], ['Salon', krBrName(s.b)], ['Sale number', String(s.no)], ['Client', krCl(s.ci)], ['Lines in the sale', String(lines.length)]]
    .concat(lines.map((c, i) => ['Line ' + (i + 1), c[0].split(' - ').slice(2).join(' - ') + ' · AED ' + Number(c[1]).toFixed(2)]),
      [['Discount on the line', s.rf ? 'Not applicable' : s.disc ? 'AED ' + s.disc.toFixed(2) : 'None']]);
  const note = s.rf ? 'A refund comes off the day it was given and is not counted as a sale. '
    : pay === 'zero' ? 'AED 0 on the package line. The till does not say why. '
    : pay === 'disc' ? 'The till shows a discount of AED ' + s.disc.toFixed(2) + ' on this line. ' : 'Paid with no discount on the line. ';
  return { title: p.n + ', ' + krDay(s.d), tip: 'See the sale', cur: 'AED', views: [{ id: 'sale', label: 'The sale', load: async () => ({
    sub: krBrName(s.b) + ' · sale ' + s.no + ' · ' + krCl(s.ci) + ' · ' + (s.rf ? 'refund AED ' + Math.abs(s.aed).toFixed(2) : 'paid AED ' + s.aed.toFixed(2)),
    note: 'This is the last step: one sale has nothing behind it. ' + note + 'Line by line it adds up to the amount.',
    cols: [{ k: 's', l: 'Step' }, { k: 'd', l: 'Detail' }], rows: steps.map(x => ({ s: x[0], d: x[1] })), foot: { s: s.rf ? 'Taken off the day' : 'Paid by the client', d: 'AED ' + s.aed.toFixed(2) } }) }] };
}
function krWin(o) {
  if (typeof TRSD === 'undefined' || !krData) return null;
  const rs0 = () => krWr(o), sub = () => { const rs = rs0(); return (o.br === '*' ? 'UAE Branches' : o.br ? krBrName(o.br) : krBranchLabel()) + ' · ' + (o.rng ? (o.rng.a === o.rng.b ? krDay(o.rng.a) : krDay(o.rng.a) + ' to ' + krDay(o.rng.b)) : krPeriodLabel()) + ' · ' + krPlural(krCnt(rs), 'sale') + ' · ' + krAed(krSum(rs, s => s.aed)) + ' · ' + krPlural(krCli(rs), 'client'); };
  const rs = rs0(), views = [], t = o.t || 'Keratin packages sold';
  const kinds = x => new Set(x).size;
  const w = p => Object.assign({}, o, p);
  if (o.ci == null) views.push({ id: 'clients', label: 'Clients', load: async () => {
    const m = {}; rs0().forEach(s => { if (s.rf) return; const c = m[s.ci] || (m[s.ci] = { ci: s.ci, n: 0, a: 0, last: '', br: {} }); c.n++; c.a += s.aed; if (s.d > c.last) c.last = s.d; c.br[krBrName(s.b)] = 1; });
    const list = Object.values(m).sort((a, b) => b.n - a.n || b.a - a.a || a.ci - b.ci), sp = c => krWin(w({ ci: c.ci, t: t + ', ' + krCl(c.ci) }));
    return { sub: sub(), cols: [{ k: 'c', l: 'Client' }, { k: 's', l: 'Salon' }, { k: 'n', l: 'Packages bought', t: 'num' }, { k: 'l', l: 'Last bought', t: 'date' }, { k: 'a', l: 'AED', t: 'aed' }],
      rows: list.map(c => ({ c: krCl(c.ci), s: Object.keys(c.br).join(', '), n: c.n, l: c.last, a: c.a, _dn: { c: sp(c), n: sp(c), a: sp(c) } })),
      foot: { c: 'Total: ' + krPlural(list.length, 'client'), n: krCnt(rs), a: krSum(rs, s => s.aed) } };
  } });
  if (kinds(rs.map(s => s.o)) > 1) views.push({ id: 'package', label: 'By package', load: async () => {
    const tot = krSum(rs0(), s => s.aed);
    return { sub: sub(), cols: [{ k: 'p', l: 'Package' }, { k: 'n', l: 'Sold', t: 'num' }, { k: 'a', l: 'AED', t: 'aed' }, { k: 'sh', l: 'Share', t: 'pct' }],
      rows: KR_PK.filter(p => rs.some(s => s.o === p.k)).map(p => { const x = rs0().filter(s => s.o === p.k), sp = krWin(w({ k: [p.k], t: p.n })); return { p: p.n, n: krCnt(x), a: krSum(x, s => s.aed), sh: tot ? krSum(x, s => s.aed) / tot * 100 : 0, _dn: { n: sp, a: sp } }; }),
      foot: { p: 'Total', n: krCnt(rs), a: tot } };
  } });
  if (kinds(rs.map(s => s.b)) > 1) views.push({ id: 'branch', label: 'By salon', load: async () => {
    const tot = krSum(rs0(), s => s.aed);
    return { sub: sub(), cols: [{ k: 'b', l: 'Salon' }, { k: 'n', l: 'Sold', t: 'num' }, { k: 'a', l: 'AED', t: 'aed' }, { k: 'sh', l: 'Share', t: 'pct' }],
      rows: KR_BR.filter(b => rs.some(s => s.b === b[0])).map(b => { const x = rs0().filter(s => s.b === b[0]), sp = krWin(w({ br: b[0], t: t + ', ' + b[1] })); return { b: b[1], n: krCnt(x), a: krSum(x, s => s.aed), sh: tot ? krSum(x, s => s.aed) / tot * 100 : 0, _dn: { n: sp, a: sp } }; }),
      foot: { b: 'Total', n: krCnt(rs), a: tot } };
  } });
  if (kinds(rs.map(s => s.d)) > 1) views.push({ id: 'day', label: 'By day', load: async () => {
    const m = {}; rs0().forEach(s => { const k = s.d + s.o + s.b, c = m[k] || (m[k] = { d: s.d, o: s.o, b: s.b, n: 0, a: 0 }); if (!s.rf) c.n++; c.a += s.aed; });
    const list = Object.values(m).sort((a, b) => a.d < b.d ? 1 : a.d > b.d ? -1 : 0), sp = c => krWin(w({ k: [c.o], br: c.b, rng: { a: c.d, b: c.d }, t: krOne(c.o).n + ', ' + krDay(c.d) }));
    return { sub: sub(), cols: [{ k: 'd', l: 'Date', t: 'date' }, { k: 'o', l: 'Package' }, { k: 'b', l: 'Salon' }, { k: 'n', l: 'Sold', t: 'num' }, { k: 'a', l: 'AED', t: 'aed' }],
      rows: list.map(c => ({ d: c.d, o: krOne(c.o).n, b: krBrName(c.b), n: c.n, a: c.a, _dn: { n: c.n ? sp(c) : null, a: sp(c) } })),
      foot: { d: 'Total', n: krCnt(rs), a: krSum(rs, s => s.aed) } };
  } });
  views.push({ id: 'sales', label: 'Sales', load: async () => {
    const list = rs0().slice().sort((a, b) => a.d < b.d ? 1 : a.d > b.d ? -1 : (a.no < b.no ? 1 : -1));
    return { sub: sub(), note: 'Tap a number to see what is behind it, down to one sale. Clients are numbered, never named.',
      cols: [{ k: 'd', l: 'Date', t: 'date' }, { k: 'b', l: 'Salon' }, { k: 'o', l: 'Package' }, { k: 'no', l: 'Sale no.' }, { k: 'c', l: 'Client' }, { k: 'l', l: 'Lines', t: 'num' }, { k: 'a', l: 'Paid (AED)', t: 'num' }, { k: 'g', l: 'Discount (AED)', t: 'num' }],
      rows: list.map(s => { const sp = krSaleSpec(s), cs = o.ci == null && !s.rf ? krWin(w({ ci: s.ci, t: t + ', ' + krCl(s.ci) })) : null; return { d: s.d, b: krBrName(s.b), o: krOne(s.o).n + (s.rf ? ' (refund)' : ''), no: s.no, c: krCl(s.ci), l: s.l.length, a: s.aed, g: s.rf ? 0 : s.disc, _dn: { no: sp, l: sp, a: sp, c: cs } }; }),
      foot: { d: 'Total: ' + krPlural(krCnt(rs), 'sale'), l: krSum(rs.filter(s => !s.rf), s => s.l.length), a: krSum(rs, s => s.aed), g: Math.round(krSum(rs.filter(s => !s.rf), s => s.disc)) } };
  } });
  return { title: t, tip: 'See the sales', cur: 'AED', views };
}
// A figure that opens its sales. Zero stays plain (nothing behind it), and so does a figure when drill.js is not on the page.
const krN2 = (html, n, o) => (n && typeof TRSD !== 'undefined') ? TRSD.num(html, krWin(o)) : html;

// One Google Sheets table (sheet-table.js): sort and filter on every heading, and it keeps its filters when the page redraws.
function krMake(id, rows, cols, total, extra) {
  if (typeof TRSheet === 'undefined' || !document.getElementById(id)) return null;
  const old = krTs[id];
  const T = TRSheet.table(Object.assign({ id, el: '#' + id, rows: () => rows, cols, total }, extra || {}));
  if (old) { T.f = old.f; T.sort = old.sort; T.more = old.more; T.shown = old.shown; }
  krTs[id] = T; T.draw(); return T;
}
const krPhoneBtn = id => `<button type="button" class="ad-btn ad-phone" data-sxcm="${id}" aria-label="Sort and filter">Sort or filter</button>`;
const krCol = (k, l, t, raw, disp, cell, x) => ({ k, l, t, raw, disp, cell, x });
const krBc = n => n ? n : '<span class="ad-zero">–</span>';

// ── LOAD ────────────────────────────────────────────────────────────────────
async function renderKeratin(force) {
  const el = document.getElementById('pkKeratinContent');
  if (!el || !krOk()) return;
  if (krData && !force) { krPaint(); return; }
  if (krBusy) return;
  krBusy = true; krErr = '';
  el.innerHTML = '<div class="ad-state">Reading the till…</div>';
  try {
    const { data, error } = await sb.rpc('pk_keratin', { p_summary: false });
    if (error || !data || !Array.isArray(data.rows)) throw error || new Error('no report');
    krData = data; krPrep();
  } catch (e) { console.error(e); krErr = 'The report did not load. Press Refresh to try again.'; }
  krBusy = false;
  krPaint();
}

// Day, Monday-start week, calendar month or quarter buckets between two ISO dates.
function krBuckets(a, b, unit) {
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
function krBucketLabel(b, unit) {
  if (!b) return '';
  const [y, m] = b.a.split('-').map(Number);
  if (unit === 'quarter') return 'Q' + (Math.floor((m - 1) / 3) + 1) + ' ' + y;
  if (unit === 'month') return KR_MON[m - 1] + ' ' + y;
  if (unit === 'week') return 'Week of ' + krShort(b.a);
  return krShort(b.a);
}
function krAxis(b, unit) {
  const [y, m] = b.a.split('-').map(Number);
  if (unit === 'quarter') return 'Q' + (Math.floor((m - 1) / 3) + 1) + ' ’' + String(y).slice(2);
  if (unit === 'month') return KR_MON[m - 1].slice(0, 3);
  return krShort(b.a);
}
const krTop = rs => { const m = {}; rs.forEach(s => { if (!s.rf) m[s.o[0]] = (m[s.o[0]] || 0) + 1; }); const k = Object.keys(m).sort((p, q) => m[q] - m[p])[0]; return k ? krTrName(k) : ''; };

// ── PAINT ───────────────────────────────────────────────────────────────────
function krPaint() {
  const el = document.getElementById('pkKeratinContent');
  if (!el) return;
  const head = `<div class="ad-top"><div><h1 class="ad-t">Keratin Packages Performance</h1><p class="ad-sub">${krData ? 'As of ' + krEsc(krWhen(krData.at)) + '. Phorest sales, the archived packages of the 1TREATMENT - KERATIN category.' : ''}</p></div>
    <div class="ad-toplinks"><button class="ad-btn" type="button" onclick="renderKeratin(true)">Refresh</button>
    <a class="ad-btn" href="/?view=pkdir" onclick="if(trsPlain(event)){event.preventDefault();showView('pkdir', null)}">All archived package pages</a></div></div>`;
  if (krErr || !krData) { el.innerHTML = head + `<div class="ad-state">${krEsc(krErr || 'No report yet.')}</div>`; krRail(false); return; }

  const rs = krWr({}), n = krCnt(rs), aed = krSum(rs, s => s.aed), nc = krCli(rs);
  if (!n) {
    const key = typeof activePeriodKey === 'function' ? activePeriodKey() : '';
    const named = key && key !== 'Custom' && key !== 'Month' && key !== 'Year';
    el.innerHTML = head + `<section class="ad-card"><div class="ad-empty">No keratin package was sold at ${krEsc(krBranchLabel())} in ${krEsc(named ? krPeriodLabel().toLowerCase() : krPeriodLabel())}. These are archived offers: they sold from ${krEsc(krDay(krData.first))} to ${krEsc(krDay(krData.last))}.
      ${key !== 'All time' ? `<button type="button" class="ad-btn" style="margin-left:6px" onclick="document.querySelector('#periodChips .chip[data-v=&quot;All time&quot;]')?.click()">See all time instead</button>` : 'Widen the Branch in the header.'}</div></section>`;
    krM = null; krRail(false);
    if (!krAllOnce && key !== 'All time') { krAllOnce = true; document.querySelector('#periodChips .chip[data-v="All time"]')?.click(); }
    return;
  }
  krAllOnce = true;
  const w = krRange();
  const byK = KR_PK.map(p => { const s = krPk(p.k); return { n: s.n, aed: s.aed, cl: s.cl, p }; });
  const best = byK.slice().sort((a, b) => b.n - a.n || b.aed - a.aed)[0], withSale = byK.filter(x => x.n > 0).length;
  const start = w.from > krData.first ? w.from : krData.first, end = w.to < krData.last ? w.to : krData.last;
  const span = Math.max(1, Math.round((new Date(end + 'T12:00:00') - new Date(start + 'T12:00:00')) / 864e5) + 1);
  const unit = span <= 31 ? 'day' : span <= 140 ? 'week' : span <= 900 ? 'month' : 'quarter';
  const bk = krBuckets(start, end, unit);
  bk.forEach(b => { const x = krWr({ rng: { a: b.a, b: b.b } }); b.n = krCnt(x); b.t = krSum(x, s => s.aed); b.ci = krCli(x); b.top = krTop(x); });
  const busy = bk.slice().sort((a, b) => b.n - a.n)[0], cnt = {}; rs.forEach(s => { if (!s.rf) cnt[s.ci] = (cnt[s.ci] || 0) + 1; });
  const again = Object.keys(cnt).filter(c => cnt[c] > 1).length, per = n / (span / 30.44), last = rs.reduce((m, s) => !s.rf && s.d > m ? s.d : m, '');
  const brs = KR_BR.map(b => { const q = krWr({ br: b[0] }); return { code: b[0], name: b[1], on: krCodes().includes(b[0]), n: krCnt(q), aed: krSum(q, s => s.aed), cl: krCli(q), top: krTop(q) }; });
  krM = { bk, unit, brs, byK, aed, n, nc };
  const dAll = { t: 'Keratin packages sold' };
  const topB = brs.slice().sort((a, b) => b.n - a.n)[0];
  const rfs = rs.filter(s => s.rf);

  let h = head + whyWall([
    ['Why this page', 'Twelve keratin packages sat in Phorest under 1TREATMENT - KERATIN and are now archived. This page shows what each one sold, where, and to how many clients.'],
    ['Why now', 'Active Deals Performance counts only the 2026 brochure. These older packages had no page, and the plain keratin services live in Service Rankings.'],
    ['If we do nothing', 'We price the next smoothing or straightening offer without knowing that Supreme Straight was two thirds of every package sold, or that package sales faded to almost nothing in 2026.']]);
  h += `<section class="ad-card" id="kr-headline"><div class="ad-hero"><div>
      <div class="ad-cap">Keratin packages sold</div><div class="ad-big">${krN2(`${n} <small>sale${n === 1 ? '' : 's'}, ${krAed(aed)}</small>`, n, dAll)}</div>
      <div class="ad-track"><div class="ad-fill" style="width:${Math.round(withSale / KR_KEYS.length * 100)}%"></div></div>
      <div class="ad-cap">${withSale} of ${KR_KEYS.length} packages have a sale in this window${rfs.length ? ' · one refund of ' + krAed(Math.abs(krSum(rfs, s => s.aed))) + ' is taken off' : ''}</div></div>
    <div class="ad-pace"><div class="ad-status ok"><span aria-hidden="true">✓</span>Every package has its own name at the till</div>
      <div class="ad-row"><span>Averaging, while it sold</span><b>${per.toFixed(1)} sales a month</b></div>
      <div class="ad-row"><span>Busiest ${unit}</span><b>${krEsc(krBucketLabel(busy, unit))}, ${krPlural(busy.n, 'sale')}</b></div>
      <div class="ad-row"><span>Latest sale</span><b>${krEsc(krDay(last))}</b></div>
      <div class="ad-row"><span>Best seller</span><b>${krEsc(best.p.n)}</b></div>
      <div class="ad-row"><span>Bought more than once</span><b>${krN2(`${again} of ${nc} clients`, again, dAll)}</b></div></div></div></section>`;
  h += `<div class="ad-tiles">${[
    ['Packages sold', krN2(`${n} <small style="font-family:var(--sans);font-size:13px;color:var(--muted);font-weight:500">sales</small>`, n, dAll), 'at the till, by package name', ''],
    ['AED sold', krN2(krAed(aed), n, dAll), 'paid by clients, VAT included', ''],
    ['Average sale', krAed(aed / n), 'per package sale', ''],
    ['Different clients', krN2(String(nc), nc, dAll), again + ' bought more than once', ''],
    ['Best seller', krN2(krEsc(best.p.n), best.n, { k: [best.p.k], t: best.p.n }), krN2(krPlural(best.n, 'sale'), best.n, { k: [best.p.k], t: best.p.n }), 'txt']
  ].map(t => `<div class="ad-tile"><div class="l">${t[0]}</div><div class="v ${t[3]}">${t[1]}</div><div class="h">${t[2]}</div></div>`).join('')}</div>`;
  h += `<p class="ad-sub"><b>What to watch.</b> ${krEsc(topB.name)} has ${krN2(`${topB.n} of the ${n} sales`, topB.n, { br: topB.code, t: topB.name })} and ${n - topB.n ? 'the other salons share ' + (n - topB.n) + '.' : 'the other salons have none.'}</p>`;

  const qn = bk.filter(b => !b.n).length;
  h += `<section class="ad-card" id="kr-month"><h2>Sales over time</h2><p class="ad-sub">When the packages sold: sales each ${unit}, by the date of the sale. They are archived, so the bars thin out. <b>What to watch.</b> ${krEsc(krBucketLabel(busy, unit))} is the busiest ${unit}, with ${krPlural(busy.n, 'sale')}. ${qn ? `${qn} of ${bk.length} ${unit}s have no sale at all.` : `Every ${unit} in this window has at least one sale.`}</p>
    <div class="ad-chart" id="krMonChart"></div>
    <details><summary>Show as table</summary><div id="krMonTable"></div></details></section>`;
  h += `<section class="ad-card" id="kr-branch"><h2>By branch</h2><p class="ad-sub">Which salon is selling the packages: the cash taken at each one. Branches outside your header filter are shown faded. Marasy is closed and only has history. Motor City, Al Quoz and Bahrain have no keratin package at the till.</p>
    <div class="ad-chart" id="krBrChart"></div>
    <details><summary>Show as table</summary><div>${krPhoneBtn('krbr')}<table id="krbr"></table></div></details></section>`;
  h += `<section class="ad-card" id="kr-treat"><h2>By treatment and length</h2><p class="ad-sub">The three treatments against the four hair lengths: how many sales each one made. Tap a number to see the sales behind it.</p>
    <div>${krPhoneBtn('krtr')}<table id="krtr"></table></div></section>`;
  h += `<section class="ad-card" id="kr-package"><h2>By package</h2><p class="ad-sub">All twelve packages, oldest first, with the salons that sold each and the cash. Tap a heading to sort or filter another way, or All columns for Last sold. <b>What to watch.</b> ${krEsc(best.p.n)} is ${krN2(`${best.n} of the ${n} sales`, best.n, { k: [best.p.k], t: best.p.n })}.</p>
    <div class="ad-tools"><button type="button" class="ad-btn" id="krMore" onclick="krToggleMore()">All columns</button></div>
    <div>${krPhoneBtn('krpk')}<table id="krpk"></table></div>
    <div class="kr-pager" id="krPager"></div></section>`;
  h += `<section class="ad-card" id="kr-price"><h2>Price paid</h2><p class="ad-sub">Did clients pay the full package price? Sales split by what the till shows on the Application line: full price, a discount, or AED 0. The till does not say why a line was discounted. <b>What to watch.</b> ${krPriceWatch()}</p>
    <div>${krPhoneBtn('krpr')}<table id="krpr"></table></div></section>`;
  h += `<section class="ad-card" id="kr-plain"><h2>Plain services</h2><p class="ad-sub">The same treatments rung as a plain service, with no package name. They are not packages and are not in any total above. They stay in Service Rankings and Client Mix. By year, for the Branch you picked.</p>
    <div>${krPhoneBtn('krpl')}<table id="krpl"></table></div></section>`;
  h += `<section class="ad-card" id="kr-notcounted"><h2>Not counted</h2><p class="ad-sub">What we found but kept out of the totals, and what we could not trace.</p><ul class="ad-list">${krNotCounted()}</ul>
    <h3 class="ad-subh">Waiting on a word</h3><ol class="ad-ask">
      <li><b>Kate:</b> do you know when these twelve packages were archived in Phorest? The dashboard cannot see it.</li>
      <li><b>Kate:</b> why were 19 package sales rung at AED 0 on the Application line? The till does not say.</li>
      <li><b>Kate:</b> do you have a slide or an ad for any of the three? Save the image and it goes in a Slide column.</li></ol></section>
    <details class="more"><summary>How these numbers are counted</summary>
      <p class="ad-sub">Sold is distinct sales (branch, date, sale number): a package is one sale made of lines named after it, such as FRIZZ FREE - LONG, so we count sales, not lines. A sale counts only when its Application line is there; 15 sales with only the Ironing step are not counted. AED is what the client paid for the package’s own lines, VAT included, a refund taken off.</p>
      <p class="ad-sub">A refund is not a sale: it comes off the AED of the day it was given. There is one, at Marasy, AED 625. Spelling variants (SMOOTH & DEFRZZ) are counted.</p>
      <p class="ad-sub">Clients are numbered inside the report, never named: “Client 12” is the same person everywhere on this page. Sale lines are in the dashboard from July 2021. Data comes from the daily Phorest Sales Transactions upload, so today’s sales appear after the nightly run.</p></details>`;
  el.innerHTML = h;
  krCharts(); krTables(); krRail(true);
}
function krPriceWatch() {
  const rs = krWr({}).filter(s => !s.rf), f = rs.filter(s => krPayOf(s) === 'full').length, d = rs.filter(s => krPayOf(s) === 'disc').length, z = rs.filter(s => krPayOf(s) === 'zero').length;
  return `${krN2(krPlural(f, 'sale'), f, { pay: 'full', t: 'Paid full price' })} paid full price, ${krN2(String(d), d, { pay: 'disc', t: 'Discounted' })} had a discount and ${krN2(String(z), z, { pay: 'zero', t: 'AED 0 on the line' })} were AED 0.`;
}
function krNotCounted() {
  const all = { rng: { a: '0000-01-01', b: '9999-12-31' }, br: '*' };
  const rf = krData.sales.filter(s => s.rf), z = krData.sales.filter(s => !s.rf && krPayOf(s) === 'zero');
  const rfS = rf.length ? krN2(`${rf.length} refund, ${krAed(Math.abs(krSum(rf, s => s.aed)))}`, rf.length, Object.assign({ k: KR_KEYS, t: 'Keratin packages sold' }, all, { rng: { a: rf[0].d, b: rf[0].d }, br: rf[0].b })) : 'none';
  const zS = krN2(`${z.length} sales`, z.length, Object.assign({ k: KR_KEYS, pay: 'zero', t: 'Keratin packages, AED 0 on the line' }, all));
  const th = (a, b) => `<span class="ad-th ad-ph" aria-hidden="true"><span>${a}</span><em>${b}</em></span>`;
  return [
    [th('Ironing', 'only'), '<b>Ironing line with no Application, 15 sales</b> Only the Ironing step was rung under a package name; the Application was rung as a plain service. Not a package sale, not counted. (Read 25 Nov 2026.)'],
    [th('Refund', 'line'), `<b>A refund is not a sale</b> ${rfS}, Marasy, ${rf[0] ? krEsc(krDay(rf[0].d)) : ''}. It comes off the AED and is not counted as a sale.`],
    [th('AED 0', 'line'), `<b>Package sold at AED 0 on the Application line</b> ${zS} are counted as sales with AED 0. The till does not say why: only Kate or the salon can say.`],
    [th('Service', 'only'), '<b>The same treatments sold as a plain service</b> Not a package, not counted. See Plain services above.'],
    [th('Slide', 'none'), '<b>Slides and ads, none found</b> Searched 25 Nov 2026. No brochure slide and no Meta ad shows these packages. The keratin posts held are humidity and smoothing content, not an offer.']
  ].map(x => `<li class="ad-of">${x[0]}<div>${x[1]}</div></li>`).join('');
}

// ── CHARTS (hand-drawn SVG, the Active Deals page's style) ──────────────────
function krTipHost() {
  const c = document.getElementById('pkKeratinContent');
  let t = document.getElementById('krTip');
  if (!t && c) { t = document.createElement('div'); t.id = 'krTip'; t.className = 'ad-tip'; c.appendChild(t); }
  return t;
}
function krHover(host, selector, fn) {
  const tip = krTipHost(), box = document.getElementById('pkKeratinContent');
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
function krCharts() {
  if (!krM || !document.getElementById('krMonChart')) return;
  const { bk, unit, brs } = krM;
  let host = document.getElementById('krMonChart'), W = Math.max(300, host.clientWidth), H = 210, L = 38, R = 8, T = 14, B = 26;
  const ymax = Math.max(4, Math.ceil(Math.max(...bk.map(x => x.n)) / 4) * 4), bw = (W - L - R) / bk.length;
  const Y = v => T + (1 - v / ymax) * (H - T - B);
  const every = Math.max(1, Math.ceil(bk.length / Math.floor((W - L) / 54)));
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Keratin packages sold per ${unit}">`;
  for (let g = 0; g <= ymax + 1e-9; g += ymax / 4) s += `<line class="gl" x1="${L}" x2="${W - R}" y1="${Y(g)}" y2="${Y(g)}"/><text class="ax" x="${L - 6}" y="${Y(g) + 4}" text-anchor="end">${Math.round(g)}</text>`;
  bk.forEach((x, i) => {
    const gap = Math.min(3, bw / 4), bx = L + i * bw + gap, bwi = Math.max(2, bw - gap * 2), h = Y(0) - Y(x.n), rr = Math.min(4, h, bwi / 2);
    if (x.n) {
      s += `<path d="M${bx} ${Y(0)} v${-(h - rr)} q0 -${rr} ${rr} -${rr} h${bwi - 2 * rr} q${rr} 0 ${rr} ${rr} v${h - rr}Z" fill="var(--series)"/>`;
      if (bw > 20) s += `<text class="ax" x="${bx + bwi / 2}" y="${Y(x.n) - 5}" text-anchor="middle" style="fill:var(--ink);font-weight:600">${x.n}</text>`;
    }
    if (i % every === 0) s += `<text class="ax" x="${bx + bwi / 2}" y="${H - 6}" text-anchor="middle">${krAxis(x, unit)}</text>`;
    s += `<rect x="${L + i * bw}" y="${T}" width="${bw}" height="${H - T - B}" fill="transparent" data-i="${i}"/>`;
  });
  host.innerHTML = s + '</svg>';
  krHover(host, 'rect[data-i]', i => { const x = bk[i]; return `<b>${krEsc(krBucketLabel(x, unit))}</b><br>${krPlural(x.n, 'sale')} · ${krAed(x.t)}${x.n ? `<br>${krPlural(x.ci, 'client')}. Most sold: ${krEsc(x.top)}` : ''}`; });
  krMonthTbl();

  host = document.getElementById('krBrChart'); W = Math.max(300, host.clientWidth);
  const narrow = W < 460, rowH = 34, H2 = brs.length * rowH + 4, L2 = narrow ? 88 : 116, R2 = narrow ? 118 : 150, mx = Math.max(...brs.map(r => r.aed)) || 1;
  s = `<svg viewBox="0 0 ${W} ${H2}" role="img" aria-label="Cash taken by branch">`;
  brs.forEach((r, i) => {
    const y = i * rowH + 6, w = r.aed > 0 ? Math.max(4, r.aed / mx * (W - L2 - R2)) : 0;
    s += `<g opacity="${r.on ? 1 : .35}"><text class="ax" x="0" y="${y + 15}" style="fill:var(--ink2);font-size:12px">${r.name}</text>`;
    if (w) s += `<rect x="${L2}" y="${y}" width="${w}" height="20" rx="4" fill="var(--series)"/>`;
    s += `<text class="ax" x="${L2 + w + 8}" y="${y + 15}" style="fill:var(--ink);font-size:12px">${krAed(r.aed)} · ${r.n} sold</text></g><rect x="0" y="${y - 5}" width="${W}" height="${rowH}" fill="transparent" data-i="${i}"/>`;
  });
  host.innerHTML = s + '</svg>';
  krHover(host, 'rect[data-i]', i => { const r = brs[i]; return `<b>${r.name}</b><br>${krPlural(r.n, 'sale')} · ${krAed(r.aed)} · ${krPlural(r.cl, 'client')}<br>${r.top ? 'Most sold: ' + krEsc(r.top) : 'No sales'}`; });
}
window.addEventListener('resize', () => {
  clearTimeout(krResize);
  krResize = setTimeout(() => { const v = document.getElementById('view-pkkeratin'); if (v && v.offsetParent) krCharts(); }, 120);
});

// ── THE TABLES, Google Sheets style (sheet-table.js): a menu on every heading ───────────────────────────────────────────────────
function krMonthTbl() {
  const host = document.getElementById('krMonTable'); if (!host || !krM) return;
  const { bk, unit } = krM;
  host.innerHTML = krPhoneBtn('krmon') + '<table id="krmon"></table>';
  const lab = x => krBucketLabel(x, unit), ttl = x => 'Keratin packages sold · ' + krBucketLabel(x, unit), rg = x => ({ a: x.a, b: x.b });
  krMake('krmon', bk, [
    { k: 'p', l: unit === 'quarter' ? 'Quarter' : unit === 'month' ? 'Month' : unit === 'week' ? 'Week of' : 'Day', t: 'txt', raw: x => x.a, disp: lab, cell: x => krEsc(lab(x)) },
    krCol('n', 'Sold', 'num', x => x.n, x => String(x.n), x => krN2(String(x.n), x.n, { t: ttl(x), rng: rg(x) })),
    krCol('a', 'AED', 'num', x => x.t, x => krAed(x.t), x => krN2(krAed(x.t), x.n, { t: ttl(x), rng: rg(x) }))
  ], rows => ({ p: 'Total', n: krN2(String(krSum(rows, x => x.n)), krSum(rows, x => x.n), { t: 'Keratin packages sold' }), a: krAed(krSum(rows, x => x.t)) }));
}
function krTables() {
  if (!krM) return;
  const { brs, byK, aed } = krM;
  krMake('krbr', brs, [
    { k: 'name', l: 'Salon', t: 'txt', raw: b => b.name, disp: b => b.name, cell: b => krEsc(b.name) },
    krCol('n', 'Sold', 'num', b => b.n, b => String(b.n), b => krN2(String(b.n), b.n, { br: b.code, t: b.name })),
    krCol('a', 'AED', 'num', b => b.aed, b => krAed(b.aed), b => krN2(krAed(b.aed), b.n, { br: b.code, t: b.name })),
    krCol('cl', 'Clients', 'num', b => b.cl, b => String(b.cl), b => krN2(String(b.cl), b.cl, { br: b.code, t: b.name })),
    krCol('s', 'Share of AED', 'num', b => aed ? b.aed / aed : 0, b => krPc(b.aed, aed), b => krPc(b.aed, aed)),
    { k: 'top', l: 'Most sold', t: 'txt', raw: b => b.top, disp: b => b.top, cell: b => krEsc(b.top) }
  ], rows => { const n = krSum(rows, b => b.n); return { name: 'Total', n: krN2(String(n), n, { br: '*', t: 'Keratin packages sold' }), a: krAed(krSum(rows, b => b.aed)), cl: String(krCli(krWr({ br: '*' }))) }; }, { rowCls: b => b.on ? '' : 'ad-off' });

  // By treatment and length
  const trs = KR_TR.map(t => { const rs = krWr({ k: KR_LN.map(l => t[0] + l[0]) }); return { t, n: krCnt(rs), aed: krSum(rs, s => s.aed), cl: krCli(rs) }; });
  krMake('krtr', trs, [{ k: 'n', l: 'Treatment', t: 'txt', raw: r => r.t[1], disp: r => r.t[1], cell: r => `<b>${krEsc(r.t[1])}</b><small>${krEsc(r.t[2])}</small>` }].concat(
    KR_LN.map(l => krCol('l' + l[0], l[1], 'num', r => krPk(r.t[0] + l[0]).n, r => String(krPk(r.t[0] + l[0]).n), r => { const x = krPk(r.t[0] + l[0]).n; return x ? krN2(String(x), x, { k: [r.t[0] + l[0]], t: krOne(r.t[0] + l[0]).n }) : krBc(0); })),
    [krCol('sold', 'Sold', 'num', r => r.n, r => String(r.n), r => r.n ? `<b>${krN2(String(r.n), r.n, { k: KR_LN.map(l => r.t[0] + l[0]), t: r.t[1] })}</b>` : krBc(0)),
     krCol('aed', 'AED', 'num', r => r.aed, r => krAed(r.aed), r => r.n ? krN2(krAed(r.aed), r.n, { k: KR_LN.map(l => r.t[0] + l[0]), t: r.t[1] }) : krBc(0)),
     krCol('cl', 'Clients', 'num', r => r.cl, r => String(r.cl), r => r.n ? krN2(String(r.cl), r.cl, { k: KR_LN.map(l => r.t[0] + l[0]), t: r.t[1] }) : krBc(0)),
     krCol('sh', 'Share', 'num', r => aed ? r.aed / aed : 0, r => krPc(r.aed, aed), r => krPc(r.aed, aed))]
  ), rows => { const n = krSum(rows, r => r.n), ks = [].concat(...rows.map(r => KR_LN.map(l => r.t[0] + l[0]))), t = { n: 'Total', sold: krN2(String(n), n, { k: ks, t: 'Keratin packages sold' }), aed: krAed(krSum(rows, r => r.aed)), cl: String(krCli(krWr({ k: ks }))) };
    KR_LN.forEach(l => { const q = krSum(rows, r => krPk(r.t[0] + l[0]).n); t['l' + l[0]] = q ? krN2(String(q), q, { k: rows.map(r => r.t[0] + l[0]), t: 'Keratin packages, ' + l[1] }) : krBc(0); });
    return t; });

  // By package: oldest first, with First sold up front and Last sold under All columns
  const rows = byK.slice();
  const brCols = KR_BR.map((b, i) => krCol('b' + b[0], b[1], 'num', r => krPk(r.p.k, b[0]).n, r => String(krPk(r.p.k, b[0]).n), r => { const x = krPk(r.p.k, b[0]).n; return x ? krN2(String(x), x, { k: [r.p.k], br: b[0], t: r.p.n }) : krBc(0); }, b[0] === 'MC' || b[0] === 'AQ' ? 1 : 0));
  const T = krMake('krpk', rows, [
    { k: 'n', l: 'Package', t: 'txt', raw: r => r.p.n, disp: r => r.p.n, cell: r => `<b title="${krEsc(r.p.what)}">${krEsc(r.p.n)}</b><small>${r.p.pl}</small>` },
    { k: 'fs', l: 'First sold', t: 'date', raw: r => r.p.first, disp: r => krDay(r.p.first), cell: r => krDay(r.p.first) },
    { k: 'ls', l: 'Last sold', t: 'date', x: 1, raw: r => r.p.last, disp: r => krDay(r.p.last), cell: r => krDay(r.p.last) }
  ].concat(brCols, [
    krCol('sold', 'Sold', 'num', r => r.n, r => String(r.n), r => r.n ? `<b>${krN2(String(r.n), r.n, { k: [r.p.k], t: r.p.n })}</b>` : krBc(0)),
    krCol('aed', 'AED', 'num', r => r.aed, r => krAed(r.aed), r => r.n ? krN2(krAed(r.aed), r.n, { k: [r.p.k], t: r.p.n }) : krBc(0)),
    krCol('cl', 'Clients', 'num', r => r.cl, r => String(r.cl), r => r.n ? krN2(String(r.cl), r.cl, { k: [r.p.k], t: r.p.n }) : krBc(0)),
    krCol('sh', 'Share', 'num', r => aed ? r.aed / aed : 0, r => krPc(r.aed, aed), r => krPc(r.aed, aed)),
    { k: 'match', l: 'Match', t: 'txt', raw: r => r.p.ct, disp: r => r.p.ct, cell: r => `<span class="ad-tag ${r.p.c}">${r.p.ct}</span>` }
  ]), rs0 => {
    const keys = rs0.map(r => r.p.k), n = krSum(rs0, r => r.n), t = { n: 'Total: ' + krPlural(rs0.length, 'package'), sold: krN2(String(n), n, { k: keys, t: 'Keratin packages sold' }), aed: krAed(krSum(rs0, r => r.aed)), cl: String(krCli(krWr({ k: keys }))) };
    KR_BR.forEach(b => { const q = krCnt(krWr({ k: keys, br: b[0] })); t['b' + b[0]] = q ? krN2(String(q), q, { k: keys, br: b[0], t: 'Keratin packages sold' }) : krBc(0); });
    return t;
  }, { limit: krN.pk, after: krPkAfter });
  if (T && !T.sort) T.sort = { k: 'fs', dir: 1 }, T.draw();

  // Price paid
  const pr = byK.map(x => { const c = pay => krCnt(krWr({ k: [x.p.k], pay })); return { p: x.p, n: x.n, full: c('full'), disc: c('disc'), zero: c('zero'), given: krSum(krWr({ k: [x.p.k] }).filter(s => !s.rf), s => s.disc) }; });
  const payC = (k, pay, v, t) => v ? krN2(String(v), v, { k: [k], pay, t }) : krBc(0);
  krMake('krpr', pr, [
    { k: 'n', l: 'Package', t: 'txt', raw: r => r.p.n, disp: r => r.p.n, cell: r => `<b>${krEsc(r.p.n)}</b><small>${r.p.pl}</small>` },
    krCol('sold', 'Sold', 'num', r => r.n, r => String(r.n), r => r.n ? krN2(String(r.n), r.n, { k: [r.p.k], t: r.p.n }) : krBc(0)),
    krCol('full', 'Paid full price', 'num', r => r.full, r => String(r.full), r => payC(r.p.k, 'full', r.full, r.p.n + ', paid full price')),
    krCol('disc', 'Discounted', 'num', r => r.disc, r => String(r.disc), r => payC(r.p.k, 'disc', r.disc, r.p.n + ', discounted')),
    krCol('zero', 'AED 0', 'num', r => r.zero, r => String(r.zero), r => payC(r.p.k, 'zero', r.zero, r.p.n + ', AED 0 on the line')),
    krCol('given', 'Discount given (AED)', 'num', r => r.given, r => krAed(r.given), r => r.given ? krN2(krAed(r.given), r.disc, { k: [r.p.k], pay: 'disc', t: r.p.n + ', discounted' }) : krBc(0))
  ], rs0 => { const ks = rs0.map(r => r.p.k), c = (pay, v) => v ? krN2(String(v), v, { k: ks, pay, t: 'Keratin packages' }) : krBc(0), n = krSum(rs0, r => r.n);
    return { n: 'Total', sold: krN2(String(n), n, { k: ks, t: 'Keratin packages sold' }), full: c('full', krSum(rs0, r => r.full)), disc: c('disc', krSum(rs0, r => r.disc)), zero: c('zero', krSum(rs0, r => r.zero)), given: krAed(krSum(rs0, r => r.given)) }; });

  // Plain services by year (the Branch and Period of the masthead)
  const w = krRange(), cd = krCodes(), plain = (krData.plain || []).filter(r => cd.includes(r[1]) && String(r[2]).slice(0, 10) >= w.from && String(r[2]).slice(0, 10) <= w.to);
  const yrs = {}; plain.forEach(r => { const y = String(r[2]).slice(0, 4), o = yrs[y] || (yrs[y] = { y, pk: 0, pn: 0, pa: 0 }); o.pn += +r[3]; o.pa += +r[4]; });
  krWr({}).forEach(s => { if (s.rf) return; const y = s.d.slice(0, 4), o = yrs[y] || (yrs[y] = { y, pk: 0, pn: 0, pa: 0 }); o.pk++; });
  const yl = Object.values(yrs).sort((a, b) => a.y < b.y ? -1 : 1);
  krMake('krpl', yl, [
    { k: 'y', l: 'Year', t: 'txt', raw: r => r.y, disp: r => r.y, cell: r => r.y },
    krCol('pk', 'Package sales', 'num', r => r.pk, r => String(r.pk), r => r.pk ? krN2(String(r.pk), r.pk, { rng: { a: r.y + '-01-01', b: r.y + '-12-31' }, t: 'Keratin packages sold in ' + r.y }) : krBc(0)),
    krCol('pn', 'Plain-service sales', 'num', r => r.pn, r => String(r.pn), r => krBc(r.pn)),
    krCol('pa', 'Plain AED', 'num', r => r.pa, r => krAed(r.pa), r => r.pa ? krAed(r.pa) : krBc(0))
  ], rs0 => ({ y: 'Total', pk: String(krSum(rs0, r => r.pk)), pn: String(krSum(rs0, r => r.pn)), pa: krAed(krSum(rs0, r => r.pa)) }));
}
function krPkAfter(T, rows) {
  const pager = document.getElementById('krPager'); if (!pager) return;
  const pages = T.pages(rows.length), from = rows.length ? T.page * T.shown + 1 : 0, to = Math.min(rows.length, (T.page + 1) * T.shown);
  if (rows.length <= 10 && T.shown >= 10 && T.page === 0) { pager.innerHTML = rows.length ? `<span class="kr-pgt">${from} to ${to} of ${rows.length} packages</span>` : ''; return; }
  pager.innerHTML = `<span class="kr-pgt">${from} to ${to} of ${rows.length} packages</span><span class="kr-sp"></span><span class="ad-cap">Rows</span><select id="krPgSel" aria-label="Rows to show" onchange="krSetN(+this.value)">${[10, 20, 50, 100].map(n => `<option value="${n}"${T.shown === n ? ' selected' : ''}>${n}</option>`).join('')}</select>
    <button type="button" class="ad-btn" id="krPrev" onclick="krPage(-1)"${T.page <= 0 ? ' disabled' : ''}>‹ Previous</button><span class="kr-pgn">Page ${T.page + 1} of ${pages}</span><button type="button" class="ad-btn" id="krNext" onclick="krPage(1)"${T.page >= pages - 1 ? ' disabled' : ''}>Next ›</button>`;
  if (window.TRSPillSelect && TRSPillSelect.enhance) { const s = document.getElementById('krPgSel'); if (s) TRSPillSelect.enhance(s); }
}
function krSetN(n) { const T = krTs.krpk; if (!T) return; krN.pk = n; T.shown = n; T.page = 0; T.draw(); }
function krPage(d) { const T = krTs.krpk; if (!T) return; T.page += d; T.draw(); }
function krToggleMore() { const T = krTs.krpk; if (!T) return; T.toggleMore(); const b = document.getElementById('krMore'); if (b) b.classList.toggle('on', T.more); }

// ── ON THIS PAGE rail (the same shell as Active Deals Performance's) ────────
const KR_RAIL = [['kr-headline', 'Headline'], ['kr-month', 'Sales over time'], ['kr-branch', 'By branch'], ['kr-treat', 'By treatment and length'], ['kr-package', 'By package'], ['kr-price', 'Price paid'], ['kr-plain', 'Plain services'], ['kr-notcounted', 'Not counted']];
function krRail(on) {
  const shell = document.getElementById('krShell'), side = document.getElementById('krSide');
  if (!shell || !side) return;
  shell.classList.toggle('rv-norail', !on);
  const nav = side.querySelector('.side-nav');
  if (nav && on && !nav.dataset.sig) {
    nav.dataset.sig = '1';
    nav.innerHTML = '<div class="side-k">On this page</div>' + KR_RAIL.map(r => `<a href="#${r[0]}" onclick="lgJump(event,'${r[0]}')">${r[1]}</a>`).join('');
  }
  if (typeof spy === 'function') spy();
}
