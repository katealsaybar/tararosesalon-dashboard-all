// Dubai Daily Deals Performance (Kate, 26 Nov 2026): the seven offers on the August 2026 slides of the Dubai Daily Deals partner app (Dubai only: Al Quoz and Motor City),
// in Active Deals Performance's format (same classes, css/active-deals.css). Numbers from pk_dubai_deals() (migrations/pk_dubai_deals.sql), Level 2 and above, no client names:
// one row per sale, the client is an opaque "Client 12". Fetched once and filtered here, so a Branch or Period change in the masthead redraws at once.
// Only Tone Reset leaves its own name at the till; the other six leave none, so they show no sale. There is no price test on this page. The 7 packages of Phorest's DUBAI DEALS
// category are kept by Pamper Packages 2025 and Active Deals Performance (Kate, 26 Nov 2026): they show here only as a note ("others" in the function), never in a figure.
// Self-contained: it needs sb, TRS_LEVEL, sel, dateFrom, dateTo, activePeriodKey(), dateToIso(), TRSD (drill.js), TRSheet (sheet-table.js), whyWall().
const DUB_BR = [['MC', 'Motor City'], ['AQ', 'Al Quoz']];
const DUB_NS = 'No name at the till: an app voucher is rung as a discount, and a sale carries only the amount taken off, not the discount’s name. ';
const DUB_PK = [
  { k: 'TR', n: 'Tone Reset', pl: 'from AED 130', price: 130, s: 2, dur: 'junior stylists', cnt: true, c: 'ok', ct: 'Exact', what: 'Toner and blowdry. The till has it as “Tone reset (short)”.' },
  { k: 'BB', n: 'Blowdry Bundles', pl: 'from AED 240', price: null, s: 3, dur: 'junior stylists', cnt: true, c: 'na', ct: 'Not found', what: 'Blowdry Edit x3 (20% off) and Blowdry Series x5 (25% off). ' + DUB_NS + 'We looked for a line named Blowdry Edit or Blowdry Series, and for a sale at AED 240: none at Al Quoz or Motor City. The 5+1 and 10+3 blowdry packages at the till are other offers at other prices, so they are not counted.' },
  { k: 'KS', n: 'Keratin Smoothening Treatment', pl: 'from AED 620', price: null, s: 4, dur: 'junior stylists', cnt: true, c: 'na', ct: 'Not found', what: 'FrizFree, Entry Keratin Smoothening, Supreme, Advance Keratin Smoothening. ' + DUB_NS + 'We looked for a keratin sale at AED 620: none. Five keratin sales in August 2026 were charged below the list price, but the till shows no deal name, so none is counted.' },
  { k: 'CP', n: 'Colour Packages', pl: 'from AED 380', price: null, s: 5, dur: 'junior stylists', cnt: true, c: 'na', ct: 'Not found', what: 'Root Revival (root colour, colour locking, blowdry) and Colour Immersion (full colour, bond repair, blowdry). ' + DUB_NS + 'We looked for the Root Revival or Colour Immersion lines and for a total of AED 380: none. The one sale at AED 380 (29 Aug 2026, Al Quoz) is a toner and a medium blowdry, not a colour package.' },
  { k: 'TB', n: 'Treatment and Blowdry Sessions', pl: 'from AED 150', price: null, s: 6, dur: 'selected stylists', cnt: true, c: 'na', ct: 'Not found', what: 'Repair Ritual, Colour Lock, Restore Edit: a treatment and a blowdry. ' + DUB_NS + 'We looked for a treatment with a blowdry at AED 150: none. The only AED 150 sale in the window is a pedicure.' },
  { k: 'MM', n: 'Mix and Match', pl: 'AED 300', price: null, s: 7, dur: 'any 2 beauty services', cnt: true, c: 'na', ct: 'Not found', what: 'Pick any 2 of 11 beauty services. ' + DUB_NS + 'We looked for two of those services at exactly AED 300. One sale comes close (Al Quoz, 12 Aug 2026: Biab AED 100 and a manicure AED 200), but a plain manicure is not on the slide, so it is not counted. This is not the AED 499 Mix and Match on Active Deals.' },
  { k: 'NC', n: 'New clients 3 visit offer', pl: '25% off, then free toner, then free treatment', price: null, s: 8, dur: 'book within 8 weeks', cnt: true, c: 'na', ct: 'Not found', what: '1st visit 25% off, 2nd visit a free toner, 3rd visit a free treatment. The till has a discount called “25% off Dubai Deals - First visit”, but a sale carries only the amount taken off, not the discount’s name, and the same flat 25% runs on other offers, so first visits cannot be counted.' }
];
const DUB_KEYS = DUB_PK.map(p => p.k);
// The slide pictures (Kate's August 2026 design, 9 slides, 540 px copies in assets/dubai-deals/): each offer has its own slide.
const DUB_SL = [['cover', 'Cover: Dubai’s best hair deals'], ['TR', 'Tone Reset'], ['BB', 'Blowdry Bundles'], ['KS', 'Keratin Smoothening Treatment'], ['CP', 'Colour Packages'], ['TB', 'Treatment and Blowdry Sessions'], ['MM', 'Mix and Match'], ['NC', 'New clients 3 visit offer'], ['app', 'Download the free Dubai Daily Deals app']];
const dubSlide = p => `<a class="dub-th" href="assets/dubai-deals/slide-${p.s}.webp" target="_blank" rel="noopener" title="Open slide ${p.s}"><img src="assets/dubai-deals/slide-${p.s}-t.jpg" alt="${dubEsc(p.n)}, slide ${p.s}" loading="lazy" width="64" height="51"></a>`;
const dubGallery = () => `<div class="dub-gal">${DUB_SL.map((x, i) => `<a class="dub-gi" href="assets/dubai-deals/slide-${i + 1}.webp" target="_blank" rel="noopener"><img src="assets/dubai-deals/slide-${i + 1}-t.jpg" alt="Slide ${i + 1}, ${dubEsc(x[1])}" loading="lazy" width="96" height="77"><span>Slide ${i + 1}</span></a>`).join('')}</div>`;
const DUB_MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
let dubData = null, dubErr = '', dubBusy = false, dubM = null, dubResize = null, dubTs = {}, dubAllOnce = false;

const dubEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dubMoney = n => Math.round(Number(n) || 0).toLocaleString('en-US');
const dubAed = n => 'AED ' + dubMoney(n);
const dubPc = (a, b) => b ? Math.round(a / b * 100) + '%' : '0%';
const dubSum = (l, f) => Math.round(l.reduce((a, r) => a + f(r), 0) * 100) / 100;
const dubOk = () => typeof TRS_LEVEL !== 'undefined' && TRS_LEVEL >= 2;
const dubDay = iso => { try { return new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return iso || ''; } };
const dubShort = iso => { try { return new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); } catch (e) { return iso || ''; } };
const dubWhen = iso => { try { return new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).replace(' at ', ', '); } catch (e) { return ''; } };
const dubOne = k => DUB_PK.find(p => p.k === k) || { n: k };
const dubBrName = c => (DUB_BR.find(b => b[0] === c) || [c, c])[1];
const dubCl = n => 'Client ' + n;
const dubPlural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

// ── THE MASTHEAD'S FILTERS ──────────────────────────────────────────────────
// Branch: ['all'] or codes. Marasy is closed and has no chip: it is in the numbers only under UAE Branches.
function dubCodes() {
  const all = DUB_BR.map(b => b[0]);
  if (typeof sel === 'undefined' || !sel.branch || sel.branch.includes('all')) return all;
  return all.filter(c => sel.branch.includes(c));
}
function dubBranchLabel() {
  const c = dubCodes();
  if (typeof sel === 'undefined' || !sel.branch || sel.branch.includes('all')) return 'UAE Branches';
  return c.length ? c.map(dubBrName).join(' + ') : (sel.branch || []).join(' + ');
}
function dubRange() {
  const from = typeof dateFrom !== 'undefined' && dateFrom ? dateToIso(dateFrom) : '0000-01-01';
  const to = typeof dateTo !== 'undefined' && dateTo ? dateToIso(dateTo) : '9999-12-31';
  return { from, to };
}
function dubPeriodLabel() {
  const key = typeof activePeriodKey === 'function' ? activePeriodKey() : '';
  if (key && key !== 'Custom' && key !== 'Month' && key !== 'Year') return key;
  const r = dubRange();
  return r.from === r.to ? dubDay(r.from) : dubDay(r.from) + ' to ' + dubDay(r.to);
}

// ── THE SALES: one object per sale, built from the rows the function returns ────────────────────────────────
function dubPrep() {
  dubData.sales = (dubData.rows || []).map((r, i) => ({ id: i, o: r[0], b: r[1], d: String(r[2]).slice(0, 10), no: r[3], aed: +r[4], ci: +r[5], l: r[6] || [] }));
  const named = dubData.sales;
  dubData.first = named.reduce((m, s) => !m || s.d < m ? s.d : m, '');
  dubData.last = named.reduce((m, s) => s.d > m ? s.d : m, '');
  const pkm = {}; (dubData.packages || []).forEach(p => { pkm[p.k] = p; });
  DUB_PK.forEach(p => { const x = pkm[p.k] || {}; p.first = x.first || ''; p.last = x.last || ''; });
}
// o = { k: [package keys] (default: the counted ones), br: null (masthead) | '*' (all) | code, rng: {a, b} (default: the masthead's period), ci: a client }
function dubWr(o) {
  const w = dubRange(), r = o.rng || { a: w.from, b: w.to }, ks = o.k || DUB_KEYS, codes = o.br === '*' ? DUB_BR.map(b => b[0]) : o.br ? [o.br] : dubCodes();
  return (dubData ? dubData.sales : []).filter(s => ks.includes(s.o) && codes.includes(s.b) && s.d >= r.a && s.d <= r.b && (o.ci == null || s.ci === o.ci));
}
const dubCli = rs => new Set(rs.map(s => s.ci)).size;
const dubPk = (k, br) => { const rs = dubWr({ k: [k], br }); return { n: rs.length, aed: dubSum(rs, s => s.aed), cl: dubCli(rs) }; };

// ── CLICKABLE FIGURES: every count and AED opens the sales behind it, and a figure inside a window opens the next step down, to one sale ──────────────
function dubSaleSpec(s) {
  const p = dubOne(s.o), diff = p.price == null ? 0 : Math.round((s.aed - p.price) * 100) / 100;
  const how = 'Exact: the till lines start with “Tone reset (short)”, the offer’s own name (' + p.pl + ')';
  const steps = [['Offer', p.n + ' (' + p.pl + ')'], ['How it was matched', how], ['Date', dubDay(s.d)], ['Salon', dubBrName(s.b)], ['Sale number', String(s.no)], ['Client', dubCl(s.ci)], ['Lines in the sale', String(s.l.length)]]
    .concat(s.l.map((c, i) => ['Line ' + (i + 1), c[0] + ' · AED ' + Number(c[1]).toFixed(2)]));
  const note = Math.abs(diff) < 0.005 ? 'Paid the full package price. ' : 'Paid AED ' + Math.abs(diff).toFixed(2) + (diff < 0 ? ' less' : ' more') + ' than the package price. The till does not say why. ';
  return { title: p.n + ', ' + dubDay(s.d), tip: 'See the sale', cur: 'AED', views: [{ id: 'sale', label: 'The sale', load: async () => ({
    sub: dubBrName(s.b) + ' · sale ' + s.no + ' · ' + dubCl(s.ci) + ' · paid AED ' + s.aed.toFixed(2),
    note: 'This is the last step: one sale has nothing behind it. ' + note + 'Line by line it adds up to the paid amount.',
    cols: [{ k: 's', l: 'Step' }, { k: 'd', l: 'Detail' }], rows: steps.map(x => ({ s: x[0], d: x[1] })), foot: { s: 'Paid by the client', d: 'AED ' + s.aed.toFixed(2) } }) }] };
}
function dubWin(o) {
  if (typeof TRSD === 'undefined' || !dubData) return null;
  const rs0 = () => dubWr(o), sub = () => { const rs = rs0(); return (o.br === '*' ? 'UAE Branches' : o.br ? dubBrName(o.br) : dubBranchLabel()) + ' · ' + (o.rng ? (o.rng.a === o.rng.b ? dubDay(o.rng.a) : dubDay(o.rng.a) + ' to ' + dubDay(o.rng.b)) : dubPeriodLabel()) + ' · ' + dubPlural(rs.length, 'sale') + ' · ' + dubAed(dubSum(rs, s => s.aed)) + ' · ' + dubPlural(dubCli(rs), 'client'); };
  const rs = rs0(), views = [], t = o.t || 'Dubai Daily Deals sold';
  const kinds = x => new Set(x).size;
  const w = (p) => Object.assign({}, o, p);
  if (o.ci == null) views.push({ id: 'clients', label: 'Clients', load: async () => {
    const m = {}; rs0().forEach(s => { const c = m[s.ci] || (m[s.ci] = { ci: s.ci, n: 0, a: 0, last: '', br: {} }); c.n++; c.a += s.aed; if (s.d > c.last) c.last = s.d; c.br[dubBrName(s.b)] = 1; });
    const list = Object.values(m).sort((a, b) => b.n - a.n || b.a - a.a || a.ci - b.ci), sp = c => dubWin(w({ ci: c.ci, t: t + ', ' + dubCl(c.ci) }));
    return { sub: sub(), cols: [{ k: 'c', l: 'Client' }, { k: 's', l: 'Salon' }, { k: 'n', l: 'Offers bought', t: 'num' }, { k: 'l', l: 'Last bought', t: 'date' }, { k: 'a', l: 'AED', t: 'aed' }],
      rows: list.map(c => ({ c: dubCl(c.ci), s: Object.keys(c.br).join(', '), n: c.n, l: c.last, a: c.a, _dn: { c: sp(c), n: sp(c), a: sp(c) } })),
      foot: { c: 'Total: ' + dubPlural(list.length, 'client'), n: rs.length, a: dubSum(rs, s => s.aed) } };
  } });
  if (kinds(rs.map(s => s.o)) > 1) views.push({ id: 'package', label: 'By offer', load: async () => {
    const tot = dubSum(rs0(), s => s.aed);
    return { sub: sub(), cols: [{ k: 'p', l: 'Offer' }, { k: 'n', l: 'Sold', t: 'num' }, { k: 'a', l: 'AED', t: 'aed' }, { k: 'sh', l: 'Share', t: 'pct' }],
      rows: DUB_PK.filter(p => rs.some(s => s.o === p.k)).map(p => { const x = rs0().filter(s => s.o === p.k), sp = dubWin(w({ k: [p.k], t: p.n })); return { p: p.n, n: x.length, a: dubSum(x, s => s.aed), sh: tot ? dubSum(x, s => s.aed) / tot * 100 : 0, _dn: { n: sp, a: sp } }; }),
      foot: { p: 'Total', n: rs.length, a: tot } };
  } });
  if (kinds(rs.map(s => s.b)) > 1) views.push({ id: 'branch', label: 'By salon', load: async () => {
    const tot = dubSum(rs0(), s => s.aed);
    return { sub: sub(), cols: [{ k: 'b', l: 'Salon' }, { k: 'n', l: 'Sold', t: 'num' }, { k: 'a', l: 'AED', t: 'aed' }, { k: 'sh', l: 'Share', t: 'pct' }],
      rows: DUB_BR.filter(b => rs.some(s => s.b === b[0])).map(b => { const x = rs0().filter(s => s.b === b[0]), sp = dubWin(w({ br: b[0], t: t + ', ' + b[1] })); return { b: b[1], n: x.length, a: dubSum(x, s => s.aed), sh: tot ? dubSum(x, s => s.aed) / tot * 100 : 0, _dn: { n: sp, a: sp } }; }),
      foot: { b: 'Total', n: rs.length, a: tot } };
  } });
  if (kinds(rs.map(s => s.d)) > 1) views.push({ id: 'day', label: 'By day', load: async () => {
    const m = {}; rs0().forEach(s => { const k = s.d + s.o + s.b, c = m[k] || (m[k] = { d: s.d, o: s.o, b: s.b, n: 0, a: 0 }); c.n++; c.a += s.aed; });
    const list = Object.values(m).sort((a, b) => a.d < b.d ? 1 : a.d > b.d ? -1 : 0), sp = c => dubWin(w({ k: [c.o], br: c.b, rng: { a: c.d, b: c.d }, t: dubOne(c.o).n + ', ' + dubDay(c.d) }));
    return { sub: sub(), cols: [{ k: 'd', l: 'Date', t: 'date' }, { k: 'o', l: 'Offer' }, { k: 'b', l: 'Salon' }, { k: 'n', l: 'Sold', t: 'num' }, { k: 'a', l: 'AED', t: 'aed' }],
      rows: list.map(c => ({ d: c.d, o: dubOne(c.o).n, b: dubBrName(c.b), n: c.n, a: c.a, _dn: { n: sp(c), a: sp(c) } })),
      foot: { d: 'Total', n: rs.length, a: dubSum(rs, s => s.aed) } };
  } });
  views.push({ id: 'sales', label: 'Sales', load: async () => {
    const list = rs0().slice().sort((a, b) => a.d < b.d ? 1 : a.d > b.d ? -1 : (a.no < b.no ? 1 : -1));
    return { sub: sub(), note: 'Tap a number to see what is behind it, down to one sale. Clients are numbered, never named.',
      cols: [{ k: 'd', l: 'Date', t: 'date' }, { k: 'b', l: 'Salon' }, { k: 'o', l: 'Offer' }, { k: 'no', l: 'Sale no.' }, { k: 'c', l: 'Client' }, { k: 'l', l: 'Lines', t: 'num' }, { k: 'a', l: 'Paid (AED)', t: 'num' }],
      rows: list.map(s => { const sp = dubSaleSpec(s), cs = o.ci == null ? dubWin(w({ ci: s.ci, t: t + ', ' + dubCl(s.ci) })) : null; return { d: s.d, b: dubBrName(s.b), o: dubOne(s.o).n, no: s.no, c: dubCl(s.ci), l: s.l.length, a: s.aed, _dn: { no: sp, l: sp, a: sp, c: cs } }; }),
      foot: { d: 'Total: ' + dubPlural(rs.length, 'sale'), l: dubSum(rs, s => s.l.length), a: dubSum(rs, s => s.aed) } };
  } });
  return { title: t, tip: 'See the sales', cur: 'AED', views };
}
// A figure that opens its sales. Zero stays plain (nothing behind it), and so does a figure when drill.js is not on the page.
const dubN = (html, n, o) => (n && typeof TRSD !== 'undefined') ? TRSD.num(html, dubWin(o)) : html;

// One Google Sheets table (sheet-table.js): sort and filter on every heading, and it keeps its filters when the page redraws.
function dubMake(id, rows, cols, total, extra) {
  if (typeof TRSheet === 'undefined' || !document.getElementById(id)) return null;
  const old = dubTs[id];
  const T = TRSheet.table(Object.assign({ id, el: '#' + id, rows: () => rows, cols, total }, extra || {}));
  if (old) { T.f = old.f; T.sort = old.sort; }
  dubTs[id] = T; T.draw(); return T;
}
const dubPhoneBtn = id => `<button type="button" class="ad-btn ad-phone" data-sxcm="${id}" aria-label="Sort and filter">Sort or filter</button>`;
const dubCol = (k, l, t, raw, disp, cell) => ({ k, l, t, raw, disp, cell });
const dubBc = n => n ? n : '<span class="ad-zero">–</span>';

// ── LOAD ────────────────────────────────────────────────────────────────────
async function renderDubai(force) {
  const el = document.getElementById('pkDubaiContent');
  if (!el || !dubOk()) return;
  if (dubData && !force) { dubPaint(); return; }
  if (dubBusy) return;
  dubBusy = true; dubErr = '';
  el.innerHTML = '<div class="ad-state">Reading the till…</div>';
  try {
    const { data, error } = await sb.rpc('pk_dubai_deals', { p_summary: false });
    if (error || !data || !Array.isArray(data.rows)) throw error || new Error('no report');
    dubData = data; dubPrep();
  } catch (e) { console.error(e); dubErr = 'The report did not load. Press Refresh to try again.'; }
  dubBusy = false;
  dubPaint();
}

// Day, Monday-start week, calendar month or quarter buckets between two ISO dates.
function dubBuckets(a, b, unit) {
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
function dubBucketLabel(b, unit) {
  if (!b) return '';
  const [y, m] = b.a.split('-').map(Number);
  if (unit === 'quarter') return 'Q' + (Math.floor((m - 1) / 3) + 1) + ' ' + y;
  if (unit === 'month') return DUB_MON[m - 1] + ' ' + y;
  if (unit === 'week') return 'Week of ' + dubShort(b.a);
  return dubShort(b.a);
}
function dubAxis(b, unit) {
  const [y, m] = b.a.split('-').map(Number);
  if (unit === 'quarter') return 'Q' + (Math.floor((m - 1) / 3) + 1) + ' ’' + String(y).slice(2);
  if (unit === 'month') return DUB_MON[m - 1].slice(0, 3);
  return dubShort(b.a);
}

// ── PAINT ───────────────────────────────────────────────────────────────────
function dubPaint() {
  const el = document.getElementById('pkDubaiContent');
  if (!el) return;
  const head = `<div class="ad-top"><div><h1 class="ad-t">Dubai Daily Deals Performance</h1><p class="ad-sub">${dubData ? 'As of ' + dubEsc(dubWhen(dubData.at)) + '. Phorest sales at Al Quoz and Motor City, the seven offers of the August 2026 Dubai Daily Deals slides.' : ''}</p></div>
    <div class="ad-toplinks"><button class="ad-btn" type="button" onclick="renderDubai(true)">Refresh</button>
    <a class="ad-btn" href="/?view=pkdir" onclick="if(trsPlain(event)){event.preventDefault();showView('pkdir', null)}">All package pages</a></div></div>`;
  if (dubErr || !dubData) { el.innerHTML = head + `<div class="ad-state">${dubEsc(dubErr || 'No report yet.')}</div>`; dubRail(false); return; }

  const rs = dubWr({}), n = rs.length, aed = dubSum(rs, s => s.aed), nc = dubCli(rs);
  if (!n) {
    const key = typeof activePeriodKey === 'function' ? activePeriodKey() : '';
    const named = key && key !== 'Custom' && key !== 'Month' && key !== 'Year';
    el.innerHTML = head + `<section class="ad-card"><div class="ad-empty">No Dubai Daily Deals offer was sold at ${dubEsc(dubBranchLabel())} in ${dubEsc(named ? dubPeriodLabel().toLowerCase() : dubPeriodLabel())}. The only named sale so far is on ${dubEsc(dubDay(dubData.first))}. Dubai Daily Deals runs at Motor City and Al Quoz only.
      ${key !== 'All time' ? `<button type="button" class="ad-btn" style="margin-left:6px" onclick="document.querySelector('#periodChips .chip[data-v=&quot;All time&quot;]')?.click()">See all time instead</button>` : 'Widen the Branch in the header.'}</div></section>`;
    dubM = null; dubRail(false);
    if (!dubAllOnce && key !== 'All time') { dubAllOnce = true; document.querySelector('#periodChips .chip[data-v="All time"]')?.click(); }
    return;
  }
  dubAllOnce = true;
  const w = dubRange(), today = dateToIso(new Date());
  const byK = DUB_PK.map(p => { const s = dubPk(p.k); return Object.assign({ n: s.n, aed: s.aed, cl: s.cl }, { p }); });
  const best = byK.slice().sort((a, b) => b.n - a.n || b.aed - a.aed)[0], withSale = byK.filter(x => x.n > 0).length, noSaleEver = DUB_PK.filter(p => !p.first).length;
  const start = w.from > dubData.first ? w.from : dubData.first, end = w.to < dubData.last ? w.to : dubData.last;
  const span = Math.max(1, Math.round((new Date(end + 'T12:00:00') - new Date(start + 'T12:00:00')) / 864e5) + 1);
  const unit = span <= 31 ? 'day' : span <= 140 ? 'week' : span <= 900 ? 'month' : 'quarter';
  const bk = dubBuckets(start, end, unit);
  bk.forEach(b => { const x = dubWr({ rng: { a: b.a, b: b.b } }); b.n = x.length; b.t = dubSum(x, s => s.aed); b.ci = dubCli(x); const m = {}; x.forEach(s => { m[s.o] = (m[s.o] || 0) + 1; }); const tk = Object.keys(m).sort((p, q) => m[q] - m[p])[0]; b.top = tk ? dubOne(tk).n : ''; });
  const busy = bk.slice().sort((a, b) => b.n - a.n)[0], cnt = {}; rs.forEach(s => { cnt[s.ci] = (cnt[s.ci] || 0) + 1; });
  const again = Object.keys(cnt).filter(c => cnt[c] > 1).length, per = n / (span / 30.44), last = rs.reduce((m, s) => s.d > m ? s.d : m, '');
  const brs = DUB_BR.map(b => { const q = dubWr({ br: b[0] }), m = {}; q.forEach(s => { m[s.o] = (m[s.o] || 0) + 1; }); const tk = Object.keys(m).sort((p, q2) => m[q2] - m[p])[0]; return { code: b[0], name: b[1], on: dubCodes().includes(b[0]), n: q.length, aed: dubSum(q, s => s.aed), cl: dubCli(q), top: tk ? dubOne(tk).n : '' }; });
  dubM = { bk, unit, brs, byK, aed, n, nc };
  const unitName = unit;
  const dAll = { t: 'Dubai Daily Deals sold' };
  const topB = brs.slice().sort((a, b) => b.n - a.n)[0];

  const of = (k, tot) => k === tot ? (tot === 1 ? 'the 1 sale' : 'all ' + tot + ' sales') : k + ' of the ' + tot + ' sales';
  let h = head + whyWall([
    ['Why this page', 'Dubai Daily Deals is a partner app. In August 2026 Tara Rose put seven offers on it for Dubai. This page shows which of them were bought at the till, where, and by how many clients.'],
    ['Why now', 'The offers ended on 31 Aug 2026 and Motor City still lists a 20% hair deal for the app, marked to confirm. Now is the time to see what the app brought in before the next set is agreed.'],
    ['If we do nothing', 'We agree the next set without knowing that ' + noSaleEver + ' of these ' + DUB_KEYS.length + ' offers left no name at the till in Dubai, so we cannot tell whether the app pays for itself.']]);
  h += `<section class="ad-card" id="dub-headline"><div class="ad-hero"><div>
      <div class="ad-cap">Dubai Daily Deals sold</div><div class="ad-big">${dubN(`${n} <small>sale${n === 1 ? '' : 's'}, ${dubAed(aed)}</small>`, n, dAll)}</div>
      <div class="ad-track"><div class="ad-fill" style="width:${Math.round(withSale / DUB_KEYS.length * 100)}%"></div></div>
      <div class="ad-cap">${withSale} of ${DUB_KEYS.length} offers have a named sale in this window. No price tests: every sale is matched by its name at the till.</div></div>
    <div class="ad-pace"><div class="ad-status warn"><span aria-hidden="true">!</span>${noSaleEver} of ${DUB_KEYS.length} offers: no name at the till</div>
      ${n >= 3 && span >= 28 ? `<div class="ad-row"><span>Averaging, while it sold</span><b>${per.toFixed(1)} sales a month</b></div>` : ''}
      <div class="ad-row"><span>Busiest ${unitName}</span><b>${dubEsc(dubBucketLabel(busy, unit))}, ${dubPlural(busy.n, 'sale')}</b></div>
      <div class="ad-row"><span>Latest sale</span><b>${dubEsc(dubDay(last))}</b></div>
      <div class="ad-row"><span>Best seller</span><b>${dubEsc(best.p.n)}</b></div>
      <div class="ad-row"><span>Bought more than once</span><b>${dubN(`${again} of ${nc} clients`, again, dAll)}</b></div></div></div></section>`;
  h += `<div class="ad-tiles">${[
    ['Offers sold', dubN(`${n} <small style="font-family:var(--sans);font-size:13px;color:var(--muted);font-weight:500">sales</small>`, n, dAll), 'at the till, by offer name', ''],
    ['AED sold', dubN(dubAed(aed), n, dAll), 'paid by clients, VAT included', ''],
    ['Average sale', dubAed(aed / n), 'per sale', ''],
    ['Different clients', dubN(String(nc), nc, dAll), again + ' bought more than once', ''],
    ['Best seller', dubN(dubEsc(best.p.n), best.n, { k: [best.p.k], t: best.p.n }), dubN(dubPlural(best.n, 'sale'), best.n, { k: [best.p.k], t: best.p.n }), 'txt']
  ].map(t => `<div class="ad-tile"><div class="l">${t[0]}</div><div class="v ${t[3]}">${t[1]}</div><div class="h">${t[2]}</div></div>`).join('')}</div>`;
  h += `<p class="ad-sub"><b>What to watch.</b> ${dubEsc(topB.name)} has ${dubN(of(topB.n, n), topB.n, { br: topB.code, t: topB.name })} and ${n - topB.n ? 'the other salon has ' + (n - topB.n) + '.' : 'the other salon has none.'}</p>`;

  const qn = bk.filter(b => !b.n).length;
  h += `<section class="ad-card" id="dub-month"><h2>Sales over time</h2><p class="ad-sub">When the offers sold: sales each ${unitName}, by the date of the sale. <b>What to watch.</b> ${dubEsc(dubBucketLabel(busy, unit))} is the busiest ${unitName}, with ${dubPlural(busy.n, 'sale')}. ${qn ? `${qn} of ${bk.length} ${unitName}s have no sale at all.` : `Every ${unitName} in this window has at least one sale.`}</p>
    <div class="ad-chart" id="dubMonChart"></div>
    <details><summary>Show as table</summary><div id="dubMonTable"></div></details></section>`;
  h += `<section class="ad-card" id="dub-branch"><h2>By branch</h2><p class="ad-sub">Which salon is selling the offers: the cash taken at each one. Branches outside your header filter are shown faded.</p>
    <div class="ad-chart" id="dubBrChart"></div>
    <details><summary>Show as table</summary><div>${dubPhoneBtn('dubbr')}<table id="dubbr"></table></div></details></section>`;
  h += `<section class="ad-card" id="dub-package"><h2>By offer</h2><p class="ad-sub">The seven offers, the ones with a named sale first (oldest first), then the rest in slide order. Tap a heading to sort or filter another way. <b>What to watch.</b> ${dubEsc(best.p.n)} is ${dubN(of(best.n, n), best.n, { k: [best.p.k], t: best.p.n })}. ${noSaleEver} offers have no name at the till: see Not traced.</p>
    <div>${dubPhoneBtn('dubpk')}<table id="dubpk"></table></div>
    <details><summary>See all 9 slides</summary>${dubGallery()}</details></section>`;
  h += `<section class="ad-card" id="dub-notcounted"><h2>Not traced</h2><p class="ad-sub">The offers with no name at the till, and what we searched at Al Quoz and Motor City (1 Jul to 15 Sep 2026). This does not mean nobody bought them: an app voucher is rung as a plain price or a discount.</p><ul class="ad-list">${dubNotCounted()}</ul>
    <h3 class="ad-subh">Waiting on a word</h3><ol class="ad-ask">
      <li><b>Kate:</b> how does reception ring an August app voucher at the till: a deal name, a discount or a plain price? Only Tone Reset left its own name.</li>
      <li><b>Kate:</b> can we get the partner’s own report (vouchers sold and redeemed, per salon)? It is the only count that can fill the six empty rows.</li>
      <li><b>Kate or Tara:</b> do the offers carry on after 31 Aug? Motor City still lists 20% off hair for the app, marked to confirm.</li></ol></section>`;
  h += `<section class="ad-card" id="dub-others"><h2>On other pages</h2><p class="ad-sub">Seven Phorest packages used to sit in the DUBAI DEALS category. Two other pages keep them, so they are a note here and in no figure, no total and no Directory line.</p><ul class="ad-list">${dubOthers()}</ul>
    <details class="more"><summary>How these numbers are counted</summary>
      <p class="ad-sub">Sold is distinct sales (branch, date, sale id): an offer is one sale made of lines named after it, so we count sales, not lines. AED is what the client paid for the offer’s own lines, VAT included, a refund taken off. A sale counts only when its lines add up to more than AED 0. Dubai only: Al Quoz and Motor City.</p>
      <p class="ad-sub">Only Tone Reset has lines at the till under its name. The other six were searched by their components and their price and nothing matched, so they show no sale and add nothing to the total. There are no price tests on this page.</p>
      <p class="ad-sub">Clients are numbered inside the report, never named: “Client 12” is the same person everywhere on this page. Data comes from the daily Phorest Sales Transactions upload, so today’s sales appear after the nightly run.</p></details></section>`;
  el.innerHTML = h;
  dubCharts(); dubTables(); dubRail(true);
}
function dubNotCounted() {
  const none = DUB_PK.filter(p => !p.first);
  return none.map(p => `<li class="ad-of">${dubSlide(p)}<div><b>${dubEsc(p.n)}, ${dubEsc(p.pl)} <span class="ad-tag">No name at the till</span></b>${dubEsc(p.what)}</div></li>`).join('');
}
// The seven packages kept by other pages: a plain note (Al Quoz and Motor City, all time).
function dubOthers() {
  const o = (dubData && dubData.others) || [];
  return o.map(x => `<li class="ad-of"><span class="dub-th dub-ph" aria-hidden="true"><span>${dubEsc(x.pl)}</span></span><div><b>${dubEsc(x.n)}</b>Also counted on ${dubEsc(x.page)}. ${x.sales ? 'Bought ' + x.sales + ' time' + (x.sales === 1 ? '' : 's') + ' at Al Quoz and Motor City, ' + dubAed(x.aed) + ', all time.' : 'No sale at Al Quoz or Motor City.'} Not in any figure on this page.</div></li>`).join('');
}

// ── CHARTS (hand-drawn SVG, the Active Deals page's style) ──────────────────
function dubTipHost() {
  const c = document.getElementById('pkDubaiContent');
  let t = document.getElementById('dubTip');
  if (!t && c) { t = document.createElement('div'); t.id = 'dubTip'; t.className = 'ad-tip'; c.appendChild(t); }
  return t;
}
function dubHover(host, selector, fn) {
  const tip = dubTipHost(), box = document.getElementById('pkDubaiContent');
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
function dubCharts() {
  if (!dubM || !document.getElementById('dubMonChart')) return;
  const { bk, unit, brs } = dubM;
  let host = document.getElementById('dubMonChart'), W = Math.max(300, host.clientWidth), H = 210, L = 38, R = 8, T = 14, B = 26;
  const ymax = Math.max(4, Math.ceil(Math.max(...bk.map(x => x.n)) / 4) * 4), bw = (W - L - R) / bk.length;
  const Y = v => T + (1 - v / ymax) * (H - T - B);
  const every = Math.max(1, Math.ceil(bk.length / Math.floor((W - L) / 54)));
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Dubai Daily Deals sold per ${unit}">`;
  for (let g = 0; g <= ymax + 1e-9; g += ymax / 4) s += `<line class="gl" x1="${L}" x2="${W - R}" y1="${Y(g)}" y2="${Y(g)}"/><text class="ax" x="${L - 6}" y="${Y(g) + 4}" text-anchor="end">${Math.round(g)}</text>`;
  bk.forEach((x, i) => {
    const gap = Math.min(3, bw / 4), bx = L + i * bw + gap, bwi = Math.max(2, bw - gap * 2), h = Y(0) - Y(x.n), rr = Math.min(4, h, bwi / 2);
    if (x.n) {
      s += `<path d="M${bx} ${Y(0)} v${-(h - rr)} q0 -${rr} ${rr} -${rr} h${bwi - 2 * rr} q${rr} 0 ${rr} ${rr} v${h - rr}Z" fill="var(--series)"/>`;
      if (bw > 20) s += `<text class="ax" x="${bx + bwi / 2}" y="${Y(x.n) - 5}" text-anchor="middle" style="fill:var(--ink);font-weight:600">${x.n}</text>`;
    }
    if (i % every === 0) s += `<text class="ax" x="${bx + bwi / 2}" y="${H - 6}" text-anchor="middle">${dubAxis(x, unit)}</text>`;
    s += `<rect x="${L + i * bw}" y="${T}" width="${bw}" height="${H - T - B}" fill="transparent" data-i="${i}"/>`;
  });
  host.innerHTML = s + '</svg>';
  dubHover(host, 'rect[data-i]', i => { const x = bk[i]; return `<b>${dubEsc(dubBucketLabel(x, unit))}</b><br>${dubPlural(x.n, 'sale')} · ${dubAed(x.t)}${x.n ? `<br>${dubPlural(x.ci, 'client')}. Most sold: ${dubEsc(x.top)}` : ''}`; });
  dubMonthTbl();

  host = document.getElementById('dubBrChart'); W = Math.max(300, host.clientWidth);
  const narrow = W < 460, rowH = 34, H2 = brs.length * rowH + 4, L2 = narrow ? 88 : 116, R2 = narrow ? 118 : 150, mx = Math.max(...brs.map(r => r.aed)) || 1;
  s = `<svg viewBox="0 0 ${W} ${H2}" role="img" aria-label="Cash taken by branch">`;
  brs.forEach((r, i) => {
    const y = i * rowH + 6, w = r.aed > 0 ? Math.max(4, r.aed / mx * (W - L2 - R2)) : 0;
    s += `<g opacity="${r.on ? 1 : .35}"><text class="ax" x="0" y="${y + 15}" style="fill:var(--ink2);font-size:12px">${r.name}</text>`;
    if (w) s += `<rect x="${L2}" y="${y}" width="${w}" height="20" rx="4" fill="var(--series)"/>`;
    s += `<text class="ax" x="${L2 + w + 8}" y="${y + 15}" style="fill:var(--ink);font-size:12px">${dubAed(r.aed)} · ${r.n} sold</text></g><rect x="0" y="${y - 5}" width="${W}" height="${rowH}" fill="transparent" data-i="${i}"/>`;
  });
  host.innerHTML = s + '</svg>';
  dubHover(host, 'rect[data-i]', i => { const r = brs[i]; return `<b>${r.name}</b><br>${dubPlural(r.n, 'sale')} · ${dubAed(r.aed)} · ${dubPlural(r.cl, 'client')}<br>${r.top ? 'Most sold: ' + dubEsc(r.top) : 'No sales'}`; });
}
window.addEventListener('resize', () => {
  clearTimeout(dubResize);
  dubResize = setTimeout(() => { const v = document.getElementById('view-pkdubai'); if (v && v.offsetParent) dubCharts(); }, 120);
});

// ── THE TABLES, Google Sheets style (sheet-table.js): a menu on every heading ───────────────────────────────────────────────────
function dubMonthTbl() {
  const host = document.getElementById('dubMonTable'); if (!host || !dubM) return;
  const { bk, unit } = dubM;
  host.innerHTML = dubPhoneBtn('dubmon') + '<table id="dubmon"></table>';
  const lab = x => dubBucketLabel(x, unit), ttl = x => 'Dubai Daily Deals sold · ' + dubBucketLabel(x, unit), rg = x => ({ a: x.a, b: x.b });
  dubMake('dubmon', bk, [
    { k: 'p', l: unit === 'quarter' ? 'Quarter' : unit === 'month' ? 'Month' : unit === 'week' ? 'Week of' : 'Day', t: 'txt', raw: x => x.a, disp: lab, cell: x => dubEsc(lab(x)) },
    dubCol('n', 'Sold', 'num', x => x.n, x => String(x.n), x => dubN(String(x.n), x.n, { t: ttl(x), rng: rg(x) })),
    dubCol('a', 'AED', 'num', x => x.t, x => dubAed(x.t), x => dubN(dubAed(x.t), x.n, { t: ttl(x), rng: rg(x) }))
  ], rows => ({ p: 'Total', n: dubN(String(dubSum(rows, x => x.n)), dubSum(rows, x => x.n), { t: 'Dubai Daily Deals sold' }), a: dubAed(dubSum(rows, x => x.t)) }));
}
function dubTables() {
  if (!dubM) return;
  const { brs, byK, aed } = dubM;
  dubMake('dubbr', brs, [
    { k: 'name', l: 'Salon', t: 'txt', raw: b => b.name, disp: b => b.name, cell: b => dubEsc(b.name) },
    dubCol('n', 'Sold', 'num', b => b.n, b => String(b.n), b => dubN(String(b.n), b.n, { br: b.code, t: b.name })),
    dubCol('a', 'AED', 'num', b => b.aed, b => dubAed(b.aed), b => dubN(dubAed(b.aed), b.n, { br: b.code, t: b.name })),
    dubCol('cl', 'Clients', 'num', b => b.cl, b => String(b.cl), b => dubN(String(b.cl), b.cl, { br: b.code, t: b.name })),
    dubCol('s', 'Share of AED', 'num', b => aed ? b.aed / aed : 0, b => dubPc(b.aed, aed), b => dubPc(b.aed, aed)),
    { k: 'top', l: 'Most sold', t: 'txt', raw: b => b.top, disp: b => b.top, cell: b => dubEsc(b.top) }
  ], rows => { const n = dubSum(rows, b => b.n); return { name: 'Total', n: dubN(String(n), n, { br: '*', t: 'Dubai Daily Deals sold' }), a: dubAed(dubSum(rows, b => b.aed)), cl: String(dubCli(dubWr({ br: '*' }))) }; }, { rowCls: b => b.on ? '' : 'ad-off' });
  // By offer: the ones with a named sale first, oldest first sale at the top, then the rest in slide order
  const rows = byK.slice().sort((a, b) => (!a.p.first - !b.p.first) || (a.p.first && b.p.first ? a.p.first.localeCompare(b.p.first) : 0));
  const brCols = DUB_BR.map(b => dubCol('b' + b[0], b[1], 'num', r => dubPk(r.p.k, b[0]).n, r => String(dubPk(r.p.k, b[0]).n), r => { const n = dubPk(r.p.k, b[0]).n; return n ? dubN(String(n), n, { k: [r.p.k], br: b[0], t: r.p.n }) : dubBc(0); }));
  const dd = iso => iso ? dubDay(iso) : '–';
  dubMake('dubpk', rows, [
    { k: 'pic', l: 'Slide', hd: () => 'Slide', t: 'txt', raw: () => '', disp: () => '', cell: r => dubSlide(r.p) },
    { k: 'n', l: 'Offer', t: 'txt', raw: r => r.p.n, disp: r => r.p.n, cell: r => `<b title="${dubEsc(r.p.what)}">${dubEsc(r.p.n)}</b><small>Slide ${r.p.s} · ${r.p.pl} · ${r.p.dur}</small>` }
  ].concat(brCols, [
    dubCol('sold', 'Sold', 'num', r => r.n, r => String(r.n), r => r.n ? `<b>${dubN(String(r.n), r.n, { k: [r.p.k], t: r.p.n })}</b>` : '<span class="ad-zero">None</span>'),
    dubCol('aed', 'AED', 'num', r => r.aed, r => dubAed(r.aed), r => r.n ? dubN(dubAed(r.aed), r.n, { k: [r.p.k], t: r.p.n }) : dubBc(0)),
    dubCol('cl', 'Clients', 'num', r => r.cl, r => String(r.cl), r => r.n ? dubN(String(r.cl), r.cl, { k: [r.p.k], t: r.p.n }) : dubBc(0)),
    { k: 'fs', l: 'First sold', t: 'txt', raw: r => r.p.first, disp: r => dd(r.p.first), cell: r => dd(r.p.first) },
    { k: 'ls', l: 'Last sold', t: 'txt', raw: r => r.p.last, disp: r => dd(r.p.last), cell: r => dd(r.p.last) },
    { k: 'match', l: 'Match', t: 'txt', raw: r => r.p.ct, disp: r => r.p.ct, cell: r => `<span class="ad-tag ${r.p.c}">${r.p.ct}</span>` }
  ]), rs => {
    const keys = rs.map(r => r.p.k), n = dubSum(rs, r => r.n), t = { n: 'Total: ' + dubPlural(rs.length, 'package'), sold: dubN(String(n), n, { k: keys, t: 'Dubai Daily Deals sold' }), aed: dubAed(dubSum(rs, r => r.aed)), cl: String(dubCli(dubWr({ k: keys }))) };
    DUB_BR.forEach(b => { const q = dubWr({ k: keys, br: b[0] }).length; t['b' + b[0]] = q ? dubN(String(q), q, { k: keys, br: b[0], t: 'Dubai Daily Deals sold' }) : dubBc(0); });
    return t;
  });
}

// ── ON THIS PAGE rail (the same shell as Active Deals Performance's) ────────
const DUB_RAIL = [['dub-headline', 'Headline'], ['dub-month', 'Sales over time'], ['dub-branch', 'By branch'], ['dub-package', 'By offer'], ['dub-notcounted', 'Not traced'], ['dub-others', 'On other pages']];
function dubRail(on) {
  const shell = document.getElementById('dubShell'), side = document.getElementById('dubSide');
  if (!shell || !side) return;
  shell.classList.toggle('rv-norail', !on);
  const nav = side.querySelector('.side-nav');
  if (nav && on && !nav.dataset.sig) {
    nav.dataset.sig = '1';
    nav.innerHTML = '<div class="side-k">On this page</div>' + DUB_RAIL.map(r => `<a href="#${r[0]}" onclick="lgJump(event,'${r[0]}')">${r[1]}</a>`).join('');
  }
  if (typeof spy === 'function') spy();
}
