// Pamper Packages Performance 2025 (Kate, 26 Nov 2026): the ten packages of the two "pamper" slides (posted on Facebook on 24 Apr 2025), in Active Deals
// Performance's format (same classes, css/active-deals.css). Numbers from pk_pamper_2025() (migrations/pk_pamper_2025.sql), Level 2 and above, no client names:
// one row per sale, the client is an opaque "Client 12". Fetched once and filtered here, so a Branch or Period change in the masthead redraws at once.
// Four packages have lines at the till; the other six have NO sale (most likely nobody bought them). There is no price test on this page.
// Self-contained: it needs sb, TRS_LEVEL, sel, dateFrom, dateTo, activePeriodKey(), dateToIso(), TRSD (drill.js), TRSheet (sheet-table.js), whyWall().
const PP_BR = [['KCA', 'Khalifa City A'], ['SAA', 'Saadiyat'], ['MC', 'Motor City'], ['AQ', 'Al Quoz']];
const PP_NS = 'No sale at the till, so most likely nobody bought it (staff key a package on the till only at checkout). ';
const PP_PK = [
  { k: 'MM', n: 'The maintenance makeover', pl: 'AED 580', price: 580, s: 1, th: 't1', dur: '2 hrs', cnt: true, c: 'na', ct: 'No sale', what: 'LVL or brow lamination, acrylic nails (full set), regular pedicure with colour. ' + PP_NS + 'We looked for a lamination, a nail extension and a pedicure in one sale and found none. The sales at exactly AED 580 are other things, such as a restyle cut and blowdry.' },
  { k: 'REV', n: 'Revive and rejuvenate', pl: 'AED 1,500', price: 1500, s: 1, th: 't2', dur: '2 hrs', cnt: true, c: 'na', ct: 'No sale', what: 'Three bespoke hydrafacials, 30 minute massage. ' + PP_NS + 'We looked for a sale with two or more hydrafacials and found none. The sales near AED 1,500 are hair and retail baskets.' },
  { k: 'WR', n: 'A woman’s retreat', pl: 'AED 799', price: 799, s: 1, th: 't3', dur: '2 hrs 30', cnt: true, c: 'na', ct: 'No sale', what: 'Hair treatment, regular manicure, regular pedicure, facial, blowdry. ' + PP_NS + 'We looked for a hair treatment, manicure, pedicure, facial and blowdry in one sale and found none.' },
  { k: 'TS', n: 'Time-saver treat', pl: 'AED 620', price: 620, s: 1, th: 't4', dur: '1 hr 30', cnt: true, c: 'na', ct: 'No sale', what: 'Facial, regular manicure, regular pedicure. ' + PP_NS + 'We looked for a short sale of a facial, a manicure and a pedicure and found none.' },
  { k: 'BB', n: 'Boss babe blowdry 10 package', pl: 'from AED 800', price: 800, s: 1, th: 't5', dur: 'from 1 hr', cnt: true, c: 'na', ct: 'No sale', what: 'Ten blowdries: short 800, medium 920, long 1,040, extra long 1,360. ' + PP_NS + 'No line has that name or a ten blowdry price. The till has other blowdry packages (5+1, 6+1 and 10+3) at other prices. They are a different offer, so they are not counted.' },
  { k: 'RR', n: 'Recharge ritual', pl: 'AED 450', price: 450, s: 2, th: '', dur: '90 mins', cnt: true, c: 'ok', ct: 'Exact', what: 'Manicure, pedicure, relaxation facial.' },
  { k: 'PP', n: 'Polish and pamper', pl: 'AED 350', price: 350, s: 2, th: '', dur: '90 mins', cnt: true, c: 'ok', ct: 'Exact', what: 'Biab manicure natural, gel pedicure, eyebrow shape, eyebrow tint.' },
  { k: 'GE', n: 'Gentle escape', pl: 'AED 420', price: 420, s: 2, th: '', dur: '90 mins', cnt: true, c: 'ok', ct: 'Exact', what: 'Gel manicure, gel pedicure, foot massage, head neck and shoulder massage.' },
  { k: 'PA', n: 'Peaceful pause', pl: 'AED 1,000', price: 1000, s: 2, th: '', dur: '3 hrs', cnt: true, c: 'ok', ct: 'Exact', what: 'Facial of choice, head neck and shoulder massage, spa manicure, spa pedicure, hair treatment, ultimate blowdry and style.' },
  { k: 'MIND', n: 'The mindful moment', pl: 'AED 750', price: 750, s: 2, th: '', dur: '2 hrs 30', cnt: true, c: 'na', ct: 'No sale', what: 'LVL or brow lamination, gel manicure, gel pedicure, paraffin hand, paraffin foot, ultimate blowdry and style. ' + PP_NS + 'One sale has a lamination, paraffin, a manicure and a pedicure (26 Mar 2025, AED 653), but at normal prices and before the launch post, so it is not counted.' }
];
const PP_KEYS = PP_PK.map(p => p.k);
// The slide pictures (Kate, 26 Nov 2026): slide 1 is cropped per package from the Facebook post of 24 Apr 2025; slide 2 has not been saved yet.
const ppSlide = p => p.th
  ? `<a class="pp-th" href="assets/pamper-2025/slide-1.jpg" target="_blank" rel="noopener" title="Open slide ${p.s}"><img src="assets/pamper-2025/slide-1-${p.th}.jpg" alt="${ppEsc(p.n)}, slide ${p.s}" loading="lazy" width="64" height="51"></a>`
  : `<span class="pp-th pp-ph" title="Slide ${p.s} is not saved yet"><span>Slide ${p.s}</span><em>not saved</em></span>`;
const PP_MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
let ppData = null, ppErr = '', ppBusy = false, ppM = null, ppResize = null, ppTs = {}, ppAllOnce = false;

const ppEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ppMoney = n => Math.round(Number(n) || 0).toLocaleString('en-US');
const ppAed = n => 'AED ' + ppMoney(n);
const ppPc = (a, b) => b ? Math.round(a / b * 100) + '%' : '0%';
const ppSum = (l, f) => Math.round(l.reduce((a, r) => a + f(r), 0) * 100) / 100;
const ppOk = () => typeof TRS_LEVEL !== 'undefined' && TRS_LEVEL >= 2;
const ppDay = iso => { try { return new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return iso || ''; } };
const ppShort = iso => { try { return new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); } catch (e) { return iso || ''; } };
const ppWhen = iso => { try { return new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).replace(' at ', ', '); } catch (e) { return ''; } };
const ppOne = k => PP_PK.find(p => p.k === k) || { n: k };
const ppBrName = c => (PP_BR.find(b => b[0] === c) || [c, c])[1];
const ppCl = n => 'Client ' + n;
const ppPlural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

// ── THE MASTHEAD'S FILTERS ──────────────────────────────────────────────────
// Branch: ['all'] or codes. Marasy is closed and has no chip: it is in the numbers only under UAE Branches.
function ppCodes() {
  const all = PP_BR.map(b => b[0]);
  if (typeof sel === 'undefined' || !sel.branch || sel.branch.includes('all')) return all;
  return all.filter(c => sel.branch.includes(c));
}
function ppBranchLabel() {
  const c = ppCodes();
  if (typeof sel === 'undefined' || !sel.branch || sel.branch.includes('all') || c.length === PP_BR.length) return 'UAE Branches';
  return c.length ? c.map(ppBrName).join(' + ') : (sel.branch || []).join(' + ');
}
function ppRange() {
  const from = typeof dateFrom !== 'undefined' && dateFrom ? dateToIso(dateFrom) : '0000-01-01';
  const to = typeof dateTo !== 'undefined' && dateTo ? dateToIso(dateTo) : '9999-12-31';
  return { from, to };
}
function ppPeriodLabel() {
  const key = typeof activePeriodKey === 'function' ? activePeriodKey() : '';
  if (key && key !== 'Custom' && key !== 'Month' && key !== 'Year') return key;
  const r = ppRange();
  return r.from === r.to ? ppDay(r.from) : ppDay(r.from) + ' to ' + ppDay(r.to);
}

// ── THE SALES: one object per sale, built from the rows the function returns ────────────────────────────────
function ppPrep() {
  ppData.sales = (ppData.rows || []).map((r, i) => ({ id: i, o: r[0], b: r[1], d: String(r[2]).slice(0, 10), no: r[3], aed: +r[4], ci: +r[5], l: r[6] || [] }));
  const named = ppData.sales;
  ppData.first = named.reduce((m, s) => !m || s.d < m ? s.d : m, '');
  ppData.last = named.reduce((m, s) => s.d > m ? s.d : m, '');
  const pkm = {}; (ppData.packages || []).forEach(p => { pkm[p.k] = p; });
  PP_PK.forEach(p => { const x = pkm[p.k] || {}; p.first = x.first || ''; p.last = x.last || ''; });
}
// o = { k: [package keys] (default: the counted ones), br: null (masthead) | '*' (all) | code, rng: {a, b} (default: the masthead's period), ci: a client }
function ppWr(o) {
  const w = ppRange(), r = o.rng || { a: w.from, b: w.to }, ks = o.k || PP_KEYS, codes = o.br === '*' ? PP_BR.map(b => b[0]) : o.br ? [o.br] : ppCodes();
  return (ppData ? ppData.sales : []).filter(s => ks.includes(s.o) && codes.includes(s.b) && s.d >= r.a && s.d <= r.b && (o.ci == null || s.ci === o.ci));
}
const ppCli = rs => new Set(rs.map(s => s.ci)).size;
const ppPk = (k, br) => { const rs = ppWr({ k: [k], br }); return { n: rs.length, aed: ppSum(rs, s => s.aed), cl: ppCli(rs) }; };

// ── CLICKABLE FIGURES: every count and AED opens the sales behind it, and a figure inside a window opens the next step down, to one sale ──────────────
function ppSaleSpec(s) {
  const p = ppOne(s.o), diff = Math.round((s.aed - p.price) * 100) / 100;
  const how = 'Exact: the till lines start with ' + p.n + ' (' + p.pl + ')';
  const steps = [['Package', p.n + ' (' + p.pl + ')'], ['How it was matched', how], ['Date', ppDay(s.d)], ['Salon', ppBrName(s.b)], ['Sale number', String(s.no)], ['Client', ppCl(s.ci)], ['Lines in the sale', String(s.l.length)]]
    .concat(s.l.map((c, i) => ['Line ' + (i + 1), c[0] + ' · AED ' + Number(c[1]).toFixed(2)]));
  const note = Math.abs(diff) < 0.005 ? 'Paid the full package price. ' : 'Paid AED ' + Math.abs(diff).toFixed(2) + (diff < 0 ? ' less' : ' more') + ' than the package price. The till does not say why. ';
  return { title: p.n + ', ' + ppDay(s.d), tip: 'See the sale', cur: 'AED', views: [{ id: 'sale', label: 'The sale', load: async () => ({
    sub: ppBrName(s.b) + ' · sale ' + s.no + ' · ' + ppCl(s.ci) + ' · paid AED ' + s.aed.toFixed(2),
    note: 'This is the last step: one sale has nothing behind it. ' + note + 'Line by line it adds up to the paid amount.',
    cols: [{ k: 's', l: 'Step' }, { k: 'd', l: 'Detail' }], rows: steps.map(x => ({ s: x[0], d: x[1] })), foot: { s: 'Paid by the client', d: 'AED ' + s.aed.toFixed(2) } }) }] };
}
function ppWin(o) {
  if (typeof TRSD === 'undefined' || !ppData) return null;
  const rs0 = () => ppWr(o), sub = () => { const rs = rs0(); return (o.br === '*' ? 'UAE Branches' : o.br ? ppBrName(o.br) : ppBranchLabel()) + ' · ' + (o.rng ? (o.rng.a === o.rng.b ? ppDay(o.rng.a) : ppDay(o.rng.a) + ' to ' + ppDay(o.rng.b)) : ppPeriodLabel()) + ' · ' + ppPlural(rs.length, 'sale') + ' · ' + ppAed(ppSum(rs, s => s.aed)) + ' · ' + ppPlural(ppCli(rs), 'client'); };
  const rs = rs0(), views = [], t = o.t || 'Pamper packages sold';
  const kinds = x => new Set(x).size;
  const w = (p) => Object.assign({}, o, p);
  if (o.ci == null) views.push({ id: 'clients', label: 'Clients', load: async () => {
    const m = {}; rs0().forEach(s => { const c = m[s.ci] || (m[s.ci] = { ci: s.ci, n: 0, a: 0, last: '', br: {} }); c.n++; c.a += s.aed; if (s.d > c.last) c.last = s.d; c.br[ppBrName(s.b)] = 1; });
    const list = Object.values(m).sort((a, b) => b.n - a.n || b.a - a.a || a.ci - b.ci), sp = c => ppWin(w({ ci: c.ci, t: t + ', ' + ppCl(c.ci) }));
    return { sub: sub(), cols: [{ k: 'c', l: 'Client' }, { k: 's', l: 'Salon' }, { k: 'n', l: 'Packages bought', t: 'num' }, { k: 'l', l: 'Last bought', t: 'date' }, { k: 'a', l: 'AED', t: 'aed' }],
      rows: list.map(c => ({ c: ppCl(c.ci), s: Object.keys(c.br).join(', '), n: c.n, l: c.last, a: c.a, _dn: { c: sp(c), n: sp(c), a: sp(c) } })),
      foot: { c: 'Total: ' + ppPlural(list.length, 'client'), n: rs.length, a: ppSum(rs, s => s.aed) } };
  } });
  if (kinds(rs.map(s => s.o)) > 1) views.push({ id: 'package', label: 'By package', load: async () => {
    const tot = ppSum(rs0(), s => s.aed);
    return { sub: sub(), cols: [{ k: 'p', l: 'Package' }, { k: 'n', l: 'Sold', t: 'num' }, { k: 'a', l: 'AED', t: 'aed' }, { k: 'sh', l: 'Share', t: 'pct' }],
      rows: PP_PK.filter(p => rs.some(s => s.o === p.k)).map(p => { const x = rs0().filter(s => s.o === p.k), sp = ppWin(w({ k: [p.k], t: p.n })); return { p: p.n, n: x.length, a: ppSum(x, s => s.aed), sh: tot ? ppSum(x, s => s.aed) / tot * 100 : 0, _dn: { n: sp, a: sp } }; }),
      foot: { p: 'Total', n: rs.length, a: tot } };
  } });
  if (kinds(rs.map(s => s.b)) > 1) views.push({ id: 'branch', label: 'By salon', load: async () => {
    const tot = ppSum(rs0(), s => s.aed);
    return { sub: sub(), cols: [{ k: 'b', l: 'Salon' }, { k: 'n', l: 'Sold', t: 'num' }, { k: 'a', l: 'AED', t: 'aed' }, { k: 'sh', l: 'Share', t: 'pct' }],
      rows: PP_BR.filter(b => rs.some(s => s.b === b[0])).map(b => { const x = rs0().filter(s => s.b === b[0]), sp = ppWin(w({ br: b[0], t: t + ', ' + b[1] })); return { b: b[1], n: x.length, a: ppSum(x, s => s.aed), sh: tot ? ppSum(x, s => s.aed) / tot * 100 : 0, _dn: { n: sp, a: sp } }; }),
      foot: { b: 'Total', n: rs.length, a: tot } };
  } });
  if (kinds(rs.map(s => s.d)) > 1) views.push({ id: 'day', label: 'By day', load: async () => {
    const m = {}; rs0().forEach(s => { const k = s.d + s.o + s.b, c = m[k] || (m[k] = { d: s.d, o: s.o, b: s.b, n: 0, a: 0 }); c.n++; c.a += s.aed; });
    const list = Object.values(m).sort((a, b) => a.d < b.d ? 1 : a.d > b.d ? -1 : 0), sp = c => ppWin(w({ k: [c.o], br: c.b, rng: { a: c.d, b: c.d }, t: ppOne(c.o).n + ', ' + ppDay(c.d) }));
    return { sub: sub(), cols: [{ k: 'd', l: 'Date', t: 'date' }, { k: 'o', l: 'Package' }, { k: 'b', l: 'Salon' }, { k: 'n', l: 'Sold', t: 'num' }, { k: 'a', l: 'AED', t: 'aed' }],
      rows: list.map(c => ({ d: c.d, o: ppOne(c.o).n, b: ppBrName(c.b), n: c.n, a: c.a, _dn: { n: sp(c), a: sp(c) } })),
      foot: { d: 'Total', n: rs.length, a: ppSum(rs, s => s.aed) } };
  } });
  views.push({ id: 'sales', label: 'Sales', load: async () => {
    const list = rs0().slice().sort((a, b) => a.d < b.d ? 1 : a.d > b.d ? -1 : (a.no < b.no ? 1 : -1));
    return { sub: sub(), note: 'Tap a number to see what is behind it, down to one sale. Clients are numbered, never named.',
      cols: [{ k: 'd', l: 'Date', t: 'date' }, { k: 'b', l: 'Salon' }, { k: 'o', l: 'Package' }, { k: 'no', l: 'Sale no.' }, { k: 'c', l: 'Client' }, { k: 'l', l: 'Lines', t: 'num' }, { k: 'a', l: 'Paid (AED)', t: 'num' }],
      rows: list.map(s => { const sp = ppSaleSpec(s), cs = o.ci == null ? ppWin(w({ ci: s.ci, t: t + ', ' + ppCl(s.ci) })) : null; return { d: s.d, b: ppBrName(s.b), o: ppOne(s.o).n, no: s.no, c: ppCl(s.ci), l: s.l.length, a: s.aed, _dn: { no: sp, l: sp, a: sp, c: cs } }; }),
      foot: { d: 'Total: ' + ppPlural(rs.length, 'sale'), l: ppSum(rs, s => s.l.length), a: ppSum(rs, s => s.aed) } };
  } });
  return { title: t, tip: 'See the sales', cur: 'AED', views };
}
// A figure that opens its sales. Zero stays plain (nothing behind it), and so does a figure when drill.js is not on the page.
const ppN = (html, n, o) => (n && typeof TRSD !== 'undefined') ? TRSD.num(html, ppWin(o)) : html;

// One Google Sheets table (sheet-table.js): sort and filter on every heading, and it keeps its filters when the page redraws.
function ppMake(id, rows, cols, total, extra) {
  if (typeof TRSheet === 'undefined' || !document.getElementById(id)) return null;
  const old = ppTs[id];
  const T = TRSheet.table(Object.assign({ id, el: '#' + id, rows: () => rows, cols, total }, extra || {}));
  if (old) { T.f = old.f; T.sort = old.sort; }
  ppTs[id] = T; T.draw(); return T;
}
const ppPhoneBtn = id => `<button type="button" class="ad-btn ad-phone" data-sxcm="${id}" aria-label="Sort and filter">Sort or filter</button>`;
const ppCol = (k, l, t, raw, disp, cell) => ({ k, l, t, raw, disp, cell });
const ppBc = n => n ? n : '<span class="ad-zero">–</span>';

// ── LOAD ────────────────────────────────────────────────────────────────────
async function renderPamper(force) {
  const el = document.getElementById('pkPamperContent');
  if (!el || !ppOk()) return;
  if (ppData && !force) { ppPaint(); return; }
  if (ppBusy) return;
  ppBusy = true; ppErr = '';
  el.innerHTML = '<div class="ad-state">Reading the till…</div>';
  try {
    const { data, error } = await sb.rpc('pk_pamper_2025', { p_summary: false });
    if (error || !data || !Array.isArray(data.rows)) throw error || new Error('no report');
    ppData = data; ppPrep();
  } catch (e) { console.error(e); ppErr = 'The report did not load. Press Refresh to try again.'; }
  ppBusy = false;
  ppPaint();
}

// Day, Monday-start week, calendar month or quarter buckets between two ISO dates.
function ppBuckets(a, b, unit) {
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
function ppBucketLabel(b, unit) {
  if (!b) return '';
  const [y, m] = b.a.split('-').map(Number);
  if (unit === 'quarter') return 'Q' + (Math.floor((m - 1) / 3) + 1) + ' ' + y;
  if (unit === 'month') return PP_MON[m - 1] + ' ' + y;
  if (unit === 'week') return 'Week of ' + ppShort(b.a);
  return ppShort(b.a);
}
function ppAxis(b, unit) {
  const [y, m] = b.a.split('-').map(Number);
  if (unit === 'quarter') return 'Q' + (Math.floor((m - 1) / 3) + 1) + ' ’' + String(y).slice(2);
  if (unit === 'month') return PP_MON[m - 1].slice(0, 3);
  return ppShort(b.a);
}

// ── PAINT ───────────────────────────────────────────────────────────────────
function ppPaint() {
  const el = document.getElementById('pkPamperContent');
  if (!el) return;
  const head = `<div class="ad-top"><div><h1 class="ad-t">Pamper Packages Performance 2025</h1><p class="ad-sub">${ppData ? 'As of ' + ppEsc(ppWhen(ppData.at)) + '. Phorest sales, the ten packages of the two pamper slides posted on Facebook on 24 Apr 2025.' : ''}</p></div>
    <div class="ad-toplinks"><button class="ad-btn" type="button" onclick="renderPamper(true)">Refresh</button>
    <a class="ad-btn" href="/?view=pkdir" onclick="if(trsPlain(event)){event.preventDefault();showView('pkdir', null)}">All package pages</a></div></div>`;
  if (ppErr || !ppData) { el.innerHTML = head + `<div class="ad-state">${ppEsc(ppErr || 'No report yet.')}</div>`; ppRail(false); return; }

  const rs = ppWr({}), n = rs.length, aed = ppSum(rs, s => s.aed), nc = ppCli(rs);
  if (!n) {
    const key = typeof activePeriodKey === 'function' ? activePeriodKey() : '';
    const named = key && key !== 'Custom' && key !== 'Month' && key !== 'Year';
    el.innerHTML = head + `<section class="ad-card"><div class="ad-empty">No pamper package was sold at ${ppEsc(ppBranchLabel())} in ${ppEsc(named ? ppPeriodLabel().toLowerCase() : ppPeriodLabel())}. These packages sold from ${ppEsc(ppDay(ppData.first))} to ${ppEsc(ppDay(ppData.last))}.
      ${key !== 'All time' ? `<button type="button" class="ad-btn" style="margin-left:6px" onclick="document.querySelector('#periodChips .chip[data-v=&quot;All time&quot;]')?.click()">See all time instead</button>` : 'Widen the Branch in the header.'}</div></section>`;
    ppM = null; ppRail(false);
    if (!ppAllOnce && key !== 'All time') { ppAllOnce = true; document.querySelector('#periodChips .chip[data-v="All time"]')?.click(); }
    return;
  }
  ppAllOnce = true;
  const w = ppRange(), today = dateToIso(new Date());
  const byK = PP_PK.map(p => { const s = ppPk(p.k); return Object.assign({ n: s.n, aed: s.aed, cl: s.cl }, { p }); });
  const best = byK.slice().sort((a, b) => b.n - a.n || b.aed - a.aed)[0], withSale = byK.filter(x => x.n > 0).length, noSaleEver = PP_PK.filter(p => !p.first).length;
  const start = w.from > ppData.first ? w.from : ppData.first, end = w.to < ppData.last ? w.to : ppData.last;
  const span = Math.max(1, Math.round((new Date(end + 'T12:00:00') - new Date(start + 'T12:00:00')) / 864e5) + 1);
  const unit = span <= 31 ? 'day' : span <= 140 ? 'week' : span <= 900 ? 'month' : 'quarter';
  const bk = ppBuckets(start, end, unit);
  bk.forEach(b => { const x = ppWr({ rng: { a: b.a, b: b.b } }); b.n = x.length; b.t = ppSum(x, s => s.aed); b.ci = ppCli(x); const m = {}; x.forEach(s => { m[s.o] = (m[s.o] || 0) + 1; }); const tk = Object.keys(m).sort((p, q) => m[q] - m[p])[0]; b.top = tk ? ppOne(tk).n : ''; });
  const busy = bk.slice().sort((a, b) => b.n - a.n)[0], cnt = {}; rs.forEach(s => { cnt[s.ci] = (cnt[s.ci] || 0) + 1; });
  const again = Object.keys(cnt).filter(c => cnt[c] > 1).length, per = n / (span / 30.44), last = rs.reduce((m, s) => s.d > m ? s.d : m, '');
  const brs = PP_BR.map(b => { const q = ppWr({ br: b[0] }), m = {}; q.forEach(s => { m[s.o] = (m[s.o] || 0) + 1; }); const tk = Object.keys(m).sort((p, q2) => m[q2] - m[p])[0]; return { code: b[0], name: b[1], on: ppCodes().includes(b[0]), n: q.length, aed: ppSum(q, s => s.aed), cl: ppCli(q), top: tk ? ppOne(tk).n : '' }; });
  ppM = { bk, unit, brs, byK, aed, n, nc };
  const unitName = unit;
  const dAll = { t: 'Pamper packages sold' };
  const topB = brs.slice().sort((a, b) => b.n - a.n)[0];

  let h = head + whyWall([
    ['Why this page', 'Ten pamper packages were put on two slides and posted on Facebook on 24 Apr 2025. This page shows which of them actually sold at the till, where, and to how many clients.'],
    ['Why now', 'Active Deals Performance counts only the 2026 brochure. These 2025 packages had no page, and one of them, Polish and pamper, kept selling to ' + ppDay(ppData.last) + '.'],
    ['If we do nothing', 'We build the next pamper package without knowing that ' + noSaleEver + ' of these ' + PP_KEYS.length + ' left no sale at the till, and that one of them carries almost every sale.']]);
  h += `<section class="ad-card" id="pp-headline"><div class="ad-hero"><div>
      <div class="ad-cap">Pamper packages sold</div><div class="ad-big">${ppN(`${n} <small>sale${n === 1 ? '' : 's'}, ${ppAed(aed)}</small>`, n, dAll)}</div>
      <div class="ad-track"><div class="ad-fill" style="width:${Math.round(withSale / PP_KEYS.length * 100)}%"></div></div>
      <div class="ad-cap">${withSale} of ${PP_KEYS.length} packages have a sale in this window. No price tests: every sale is matched by its name at the till.</div></div>
    <div class="ad-pace"><div class="ad-status warn"><span aria-hidden="true">!</span>${noSaleEver} of ${PP_KEYS.length} packages: no sale at the till</div>
      <div class="ad-row"><span>Averaging, while it sold</span><b>${per.toFixed(1)} sales a month</b></div>
      <div class="ad-row"><span>Busiest ${unitName}</span><b>${ppEsc(ppBucketLabel(busy, unit))}, ${ppPlural(busy.n, 'sale')}</b></div>
      <div class="ad-row"><span>Latest sale</span><b>${ppEsc(ppDay(last))}</b></div>
      <div class="ad-row"><span>Best seller</span><b>${ppEsc(best.p.n)}</b></div>
      <div class="ad-row"><span>Bought more than once</span><b>${ppN(`${again} of ${nc} clients`, again, dAll)}</b></div></div></div></section>`;
  h += `<div class="ad-tiles">${[
    ['Packages sold', ppN(`${n} <small style="font-family:var(--sans);font-size:13px;color:var(--muted);font-weight:500">sales</small>`, n, dAll), 'at the till, by package name', ''],
    ['AED sold', ppN(ppAed(aed), n, dAll), 'paid by clients, VAT included', ''],
    ['Average sale', ppAed(aed / n), 'per package sale', ''],
    ['Different clients', ppN(String(nc), nc, dAll), again + ' bought more than once', ''],
    ['Best seller', ppN(ppEsc(best.p.n), best.n, { k: [best.p.k], t: best.p.n }), ppN(ppPlural(best.n, 'sale'), best.n, { k: [best.p.k], t: best.p.n }), 'txt']
  ].map(t => `<div class="ad-tile"><div class="l">${t[0]}</div><div class="v ${t[3]}">${t[1]}</div><div class="h">${t[2]}</div></div>`).join('')}</div>`;
  h += `<p class="ad-sub"><b>What to watch.</b> ${ppEsc(topB.name)} has ${ppN(`${topB.n} of the ${n} sales`, topB.n, { br: topB.code, t: topB.name })} and ${n - topB.n ? 'the other salons share ' + (n - topB.n) + '.' : 'the other salons have none.'}</p>`;

  const qn = bk.filter(b => !b.n).length;
  h += `<section class="ad-card" id="pp-month"><h2>Sales over time</h2><p class="ad-sub">When the packages sold: sales each ${unitName}, by the date of the sale. <b>What to watch.</b> ${ppEsc(ppBucketLabel(busy, unit))} is the busiest ${unitName}, with ${ppPlural(busy.n, 'sale')}. ${qn ? `${qn} of ${bk.length} ${unitName}s have no sale at all.` : `Every ${unitName} in this window has at least one sale.`}</p>
    <div class="ad-chart" id="ppMonChart"></div>
    <details><summary>Show as table</summary><div id="ppMonTable"></div></details></section>`;
  h += `<section class="ad-card" id="pp-branch"><h2>By branch</h2><p class="ad-sub">Which salon is selling the packages: the cash taken at each one. Branches outside your header filter are shown faded.</p>
    <div class="ad-chart" id="ppBrChart"></div>
    <details><summary>Show as table</summary><div>${ppPhoneBtn('ppbr')}<table id="ppbr"></table></div></details></section>`;
  h += `<section class="ad-card" id="pp-package"><h2>By package</h2><p class="ad-sub">The ten packages, the ones that sold first (oldest first), then the ones with no sale in slide order. Tap a heading to sort or filter another way. <b>What to watch.</b> ${ppEsc(best.p.n)} is ${ppN(`${best.n} of the ${n} sales`, best.n, { k: [best.p.k], t: best.p.n })}. ${noSaleEver} packages have no sale at the till: see No sale.</p>
    <div>${ppPhoneBtn('pppk')}<table id="pppk"></table></div></section>`;
  h += `<section class="ad-card" id="pp-notcounted"><h2>No sale</h2><p class="ad-sub">The packages with no sale at the till, and what we searched. Most likely nobody bought them: staff key a package on the till only when a client checks out.</p><ul class="ad-list">${ppNotCounted()}</ul>
    <h3 class="ad-subh">Waiting on a word</h3><ol class="ad-ask">
      <li><b>Kate:</b> save the second slide (Recharge ritual, Polish and pamper, Gentle escape, Peaceful pause, The mindful moment) to Downloads and say so, and it goes in the Slide column.</li>
      <li><b>Kate:</b> should the 2026 sales of Polish and pamper (to ${ppEsc(ppDay(ppData.last))}) also show on Active Deals Performance, or stay only here?</li></ol></section>
    <details class="more"><summary>How these numbers are counted</summary>
      <p class="ad-sub">Sold is distinct sales (branch, date, sale id): a package is one sale made of lines named after it, so we count sales, not lines. AED is what the client paid for the package’s own lines, VAT included, a refund taken off. A sale counts only when its package lines add up to more than AED 0.</p>
      <p class="ad-sub">Four packages have lines at the till under their name: Polish and pamper, Recharge ritual, Gentle escape and Peaceful pause. The other six were searched by their components and their price and nothing matched, so they show no sale and add nothing to the total. There are no price tests on this page.</p>
      <p class="ad-sub">The first sales are dated 31 Mar to 8 Apr 2025, before the Facebook post of 24 Apr 2025, so the page counts from the first sale. Clients are numbered inside the report, never named: “Client 12” is the same person everywhere on this page. Data comes from the daily Phorest Sales Transactions upload, so today’s sales appear after the nightly run.</p></details>`;
  el.innerHTML = h;
  ppCharts(); ppTables(); ppRail(true);
}
function ppNotCounted() {
  const none = PP_PK.filter(p => !p.first);
  const near = [
    ['Blowdry', 'packs', '<b>Other blowdry packages at the till, not counted</b> “Blowdry package (Long) 5+1 with Junior stylist” and “(6+1)” at AED 650 to 925, “5+1 Blow dry” at AED 625 to 960, and “10+3 Blowdry Package” at AED 1,800. They are different offers from the Boss babe blowdry 10 package, so they are not counted. (Read 25 Nov 2026.)'],
    ['Before', 'launch', '<b>One sale that looks like The mindful moment, 1</b> SAA, 26 Mar 2025, AED 653: a lamination, paraffin, a manicure and a pedicure at normal menu prices, before the Facebook post. Not counted. (Read 25 Nov 2026.)']
  ];
  const th = (a, b) => `<span class="pp-th pp-ph" aria-hidden="true"><span>${a}</span><em>${b}</em></span>`;
  return none.map(p => `<li class="ad-of">${ppSlide(p)}<div><b>${ppEsc(p.n)}, ${ppEsc(p.pl)} <span class="ad-tag">No sale</span></b>${ppEsc(p.what)}</div></li>`)
    .concat(near.map(x => `<li class="ad-of">${th(x[0], x[1])}<div>${x[2]}</div></li>`)).join('');
}

// ── CHARTS (hand-drawn SVG, the Active Deals page's style) ──────────────────
function ppTipHost() {
  const c = document.getElementById('pkPamperContent');
  let t = document.getElementById('ppTip');
  if (!t && c) { t = document.createElement('div'); t.id = 'ppTip'; t.className = 'ad-tip'; c.appendChild(t); }
  return t;
}
function ppHover(host, selector, fn) {
  const tip = ppTipHost(), box = document.getElementById('pkPamperContent');
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
function ppCharts() {
  if (!ppM || !document.getElementById('ppMonChart')) return;
  const { bk, unit, brs } = ppM;
  let host = document.getElementById('ppMonChart'), W = Math.max(300, host.clientWidth), H = 210, L = 38, R = 8, T = 14, B = 26;
  const ymax = Math.max(4, Math.ceil(Math.max(...bk.map(x => x.n)) / 4) * 4), bw = (W - L - R) / bk.length;
  const Y = v => T + (1 - v / ymax) * (H - T - B);
  const every = Math.max(1, Math.ceil(bk.length / Math.floor((W - L) / 54)));
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Pamper packages sold per ${unit}">`;
  for (let g = 0; g <= ymax + 1e-9; g += ymax / 4) s += `<line class="gl" x1="${L}" x2="${W - R}" y1="${Y(g)}" y2="${Y(g)}"/><text class="ax" x="${L - 6}" y="${Y(g) + 4}" text-anchor="end">${Math.round(g)}</text>`;
  bk.forEach((x, i) => {
    const gap = Math.min(3, bw / 4), bx = L + i * bw + gap, bwi = Math.max(2, bw - gap * 2), h = Y(0) - Y(x.n), rr = Math.min(4, h, bwi / 2);
    if (x.n) {
      s += `<path d="M${bx} ${Y(0)} v${-(h - rr)} q0 -${rr} ${rr} -${rr} h${bwi - 2 * rr} q${rr} 0 ${rr} ${rr} v${h - rr}Z" fill="var(--series)"/>`;
      if (bw > 20) s += `<text class="ax" x="${bx + bwi / 2}" y="${Y(x.n) - 5}" text-anchor="middle" style="fill:var(--ink);font-weight:600">${x.n}</text>`;
    }
    if (i % every === 0) s += `<text class="ax" x="${bx + bwi / 2}" y="${H - 6}" text-anchor="middle">${ppAxis(x, unit)}</text>`;
    s += `<rect x="${L + i * bw}" y="${T}" width="${bw}" height="${H - T - B}" fill="transparent" data-i="${i}"/>`;
  });
  host.innerHTML = s + '</svg>';
  ppHover(host, 'rect[data-i]', i => { const x = bk[i]; return `<b>${ppEsc(ppBucketLabel(x, unit))}</b><br>${ppPlural(x.n, 'sale')} · ${ppAed(x.t)}${x.n ? `<br>${ppPlural(x.ci, 'client')}. Most sold: ${ppEsc(x.top)}` : ''}`; });
  ppMonthTbl();

  host = document.getElementById('ppBrChart'); W = Math.max(300, host.clientWidth);
  const narrow = W < 460, rowH = 34, H2 = brs.length * rowH + 4, L2 = narrow ? 88 : 116, R2 = narrow ? 118 : 150, mx = Math.max(...brs.map(r => r.aed)) || 1;
  s = `<svg viewBox="0 0 ${W} ${H2}" role="img" aria-label="Cash taken by branch">`;
  brs.forEach((r, i) => {
    const y = i * rowH + 6, w = r.aed > 0 ? Math.max(4, r.aed / mx * (W - L2 - R2)) : 0;
    s += `<g opacity="${r.on ? 1 : .35}"><text class="ax" x="0" y="${y + 15}" style="fill:var(--ink2);font-size:12px">${r.name}</text>`;
    if (w) s += `<rect x="${L2}" y="${y}" width="${w}" height="20" rx="4" fill="var(--series)"/>`;
    s += `<text class="ax" x="${L2 + w + 8}" y="${y + 15}" style="fill:var(--ink);font-size:12px">${ppAed(r.aed)} · ${r.n} sold</text></g><rect x="0" y="${y - 5}" width="${W}" height="${rowH}" fill="transparent" data-i="${i}"/>`;
  });
  host.innerHTML = s + '</svg>';
  ppHover(host, 'rect[data-i]', i => { const r = brs[i]; return `<b>${r.name}</b><br>${ppPlural(r.n, 'sale')} · ${ppAed(r.aed)} · ${ppPlural(r.cl, 'client')}<br>${r.top ? 'Most sold: ' + ppEsc(r.top) : 'No sales'}`; });
}
window.addEventListener('resize', () => {
  clearTimeout(ppResize);
  ppResize = setTimeout(() => { const v = document.getElementById('view-pkpamper'); if (v && v.offsetParent) ppCharts(); }, 120);
});

// ── THE TABLES, Google Sheets style (sheet-table.js): a menu on every heading ───────────────────────────────────────────────────
function ppMonthTbl() {
  const host = document.getElementById('ppMonTable'); if (!host || !ppM) return;
  const { bk, unit } = ppM;
  host.innerHTML = ppPhoneBtn('ppmon') + '<table id="ppmon"></table>';
  const lab = x => ppBucketLabel(x, unit), ttl = x => 'Pamper packages sold · ' + ppBucketLabel(x, unit), rg = x => ({ a: x.a, b: x.b });
  ppMake('ppmon', bk, [
    { k: 'p', l: unit === 'quarter' ? 'Quarter' : unit === 'month' ? 'Month' : unit === 'week' ? 'Week of' : 'Day', t: 'txt', raw: x => x.a, disp: lab, cell: x => ppEsc(lab(x)) },
    ppCol('n', 'Sold', 'num', x => x.n, x => String(x.n), x => ppN(String(x.n), x.n, { t: ttl(x), rng: rg(x) })),
    ppCol('a', 'AED', 'num', x => x.t, x => ppAed(x.t), x => ppN(ppAed(x.t), x.n, { t: ttl(x), rng: rg(x) }))
  ], rows => ({ p: 'Total', n: ppN(String(ppSum(rows, x => x.n)), ppSum(rows, x => x.n), { t: 'Pamper packages sold' }), a: ppAed(ppSum(rows, x => x.t)) }));
}
function ppTables() {
  if (!ppM) return;
  const { brs, byK, aed } = ppM;
  ppMake('ppbr', brs, [
    { k: 'name', l: 'Salon', t: 'txt', raw: b => b.name, disp: b => b.name, cell: b => ppEsc(b.name) },
    ppCol('n', 'Sold', 'num', b => b.n, b => String(b.n), b => ppN(String(b.n), b.n, { br: b.code, t: b.name })),
    ppCol('a', 'AED', 'num', b => b.aed, b => ppAed(b.aed), b => ppN(ppAed(b.aed), b.n, { br: b.code, t: b.name })),
    ppCol('cl', 'Clients', 'num', b => b.cl, b => String(b.cl), b => ppN(String(b.cl), b.cl, { br: b.code, t: b.name })),
    ppCol('s', 'Share of AED', 'num', b => aed ? b.aed / aed : 0, b => ppPc(b.aed, aed), b => ppPc(b.aed, aed)),
    { k: 'top', l: 'Most sold', t: 'txt', raw: b => b.top, disp: b => b.top, cell: b => ppEsc(b.top) }
  ], rows => { const n = ppSum(rows, b => b.n); return { name: 'Total', n: ppN(String(n), n, { br: '*', t: 'Pamper packages sold' }), a: ppAed(ppSum(rows, b => b.aed)), cl: String(ppCli(ppWr({ br: '*' }))) }; }, { rowCls: b => b.on ? '' : 'ad-off' });
  // By package: the ones that sold first, oldest first sale at the top, then the ones with no sale in slide order
  const rows = byK.slice().sort((a, b) => (!a.p.first - !b.p.first) || (a.p.first && b.p.first ? a.p.first.localeCompare(b.p.first) : 0));
  const brCols = PP_BR.map(b => ppCol('b' + b[0], b[1], 'num', r => ppPk(r.p.k, b[0]).n, r => String(ppPk(r.p.k, b[0]).n), r => { const n = ppPk(r.p.k, b[0]).n; return n ? ppN(String(n), n, { k: [r.p.k], br: b[0], t: r.p.n }) : ppBc(0); }));
  const dd = iso => iso ? ppDay(iso) : '–';
  ppMake('pppk', rows, [
    { k: 'pic', l: 'Slide', hd: () => 'Slide', t: 'txt', raw: () => '', disp: () => '', cell: r => ppSlide(r.p) },
    { k: 'n', l: 'Package', t: 'txt', raw: r => r.p.n, disp: r => r.p.n, cell: r => `<b title="${ppEsc(r.p.what)}">${ppEsc(r.p.n)}</b><small>Slide ${r.p.s} · ${r.p.pl} · ${r.p.dur}</small>` }
  ].concat(brCols, [
    ppCol('sold', 'Sold', 'num', r => r.n, r => String(r.n), r => r.n ? `<b>${ppN(String(r.n), r.n, { k: [r.p.k], t: r.p.n })}</b>` : '<span class="ad-zero">No sale</span>'),
    ppCol('aed', 'AED', 'num', r => r.aed, r => ppAed(r.aed), r => r.n ? ppN(ppAed(r.aed), r.n, { k: [r.p.k], t: r.p.n }) : ppBc(0)),
    ppCol('cl', 'Clients', 'num', r => r.cl, r => String(r.cl), r => r.n ? ppN(String(r.cl), r.cl, { k: [r.p.k], t: r.p.n }) : ppBc(0)),
    { k: 'fs', l: 'First sold', t: 'txt', raw: r => r.p.first, disp: r => dd(r.p.first), cell: r => dd(r.p.first) },
    { k: 'ls', l: 'Last sold', t: 'txt', raw: r => r.p.last, disp: r => dd(r.p.last), cell: r => dd(r.p.last) },
    { k: 'match', l: 'Match', t: 'txt', raw: r => r.p.ct, disp: r => r.p.ct, cell: r => `<span class="ad-tag ${r.p.c}">${r.p.ct}</span>` }
  ]), rs => {
    const keys = rs.map(r => r.p.k), n = ppSum(rs, r => r.n), t = { n: 'Total: ' + ppPlural(rs.length, 'package'), sold: ppN(String(n), n, { k: keys, t: 'Pamper packages sold' }), aed: ppAed(ppSum(rs, r => r.aed)), cl: String(ppCli(ppWr({ k: keys }))) };
    PP_BR.forEach(b => { const q = ppWr({ k: keys, br: b[0] }).length; t['b' + b[0]] = q ? ppN(String(q), q, { k: keys, br: b[0], t: 'Pamper packages sold' }) : ppBc(0); });
    return t;
  });
}

// ── ON THIS PAGE rail (the same shell as Active Deals Performance's) ────────
const PP_RAIL = [['pp-headline', 'Headline'], ['pp-month', 'Sales over time'], ['pp-branch', 'By branch'], ['pp-package', 'By package'], ['pp-notcounted', 'No sale']];
function ppRail(on) {
  const shell = document.getElementById('ppShell'), side = document.getElementById('ppSide');
  if (!shell || !side) return;
  shell.classList.toggle('rv-norail', !on);
  const nav = side.querySelector('.side-nav');
  if (nav && on && !nav.dataset.sig) {
    nav.dataset.sig = '1';
    nav.innerHTML = '<div class="side-k">On this page</div>' + PP_RAIL.map(r => `<a href="#${r[0]}" onclick="lgJump(event,'${r[0]}')">${r[1]}</a>`).join('');
  }
  if (typeof spy === 'function') spy();
}
