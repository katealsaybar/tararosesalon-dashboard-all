// Back to School Offer Performance (Kate, 26 Nov 2026): the one archived Phorest package named "Back to School Offer" (category PACKAGES, AED 399), in Active Deals
// Performance's format (same classes, css/active-deals.css). Numbers from pk_back_to_school() (migrations/pk_back_to_school.sql), Level 2 and above, no client names:
// one row per sale, the client is an opaque "Client 4". Fetched once and filtered here, so a Branch or Period change in the masthead redraws at once.
// It has its own name at the till (Exact) and no price test, so there is nothing beside the total. The offer is five till lines that add up to AED 399, so there is a
// By component table, and a sale also shows what else was rung on the same till sale (not counted in the offer).
// Self-contained: it needs sb, TRS_LEVEL, sel, dateFrom, dateTo, activePeriodKey(), dateToIso(), TRSD (drill.js), TRSheet (sheet-table.js), whyWall().
const BS_BR = [['KCA', 'Khalifa City A'], ['SAA', 'Saadiyat'], ['MC', 'Motor City'], ['AQ', 'Al Quoz'], ['MRY', 'Marasy (closed)']];
const BS_PK = { k: 'BTS', n: 'Back to School Offer', pl: 'AED 399', price: 399, c: 'ok', ct: 'Exact', what: 'Five lines: long blowdry, rest and relax (ABC), head, neck and shoulder massage (30 mins), pedicure, manicure.' };
// The five lines the till rings for every sale, keyed by the till name after "Back to School Offer - " in lower case.
const BS_CP = [
  { k: 'bd', n: 'Long Blowdry', p: 119, till: 'Long Blowdry' },
  { k: 'rr', n: 'Rest and Relax (ABC)', p: 80, till: 'Rest and Relax (ABC)' },
  { k: 'hn', n: 'Head, neck and shoulder massage (30 mins)', p: 70, till: '30 mins. Head, neck and shoulder massage 30' },
  { k: 'pd', n: 'Pedicure', p: 70, till: 'Pedicure' },
  { k: 'mn', n: 'Manicure', p: 60, till: 'manicure' }
];
const BS_MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
let bsData = null, bsErr = '', bsBusy = false, bsM = null, bsResize = null, bsTs = {}, bsAllOnce = false;

const bsEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const bsMoney = n => Math.round(Number(n) || 0).toLocaleString('en-US');
const bsAed = n => 'AED ' + bsMoney(n);
const bsPc = (a, b) => b ? Math.round(a / b * 100) + '%' : '0%';
const bsSum = (l, f) => l.reduce((a, r) => a + f(r), 0);
const bsOk = () => typeof TRS_LEVEL !== 'undefined' && TRS_LEVEL >= 2;
const bsDay = iso => { try { return new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return iso || ''; } };
const bsShort = iso => { try { return new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); } catch (e) { return iso || ''; } };
const bsWhen = iso => { try { return new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).replace(' at ', ', '); } catch (e) { return ''; } };
const bsBrName = c => (BS_BR.find(b => b[0] === c) || [c, c])[1];
const bsCl = n => 'Client ' + n;
const bsPlural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
// The component a till line belongs to: the name after "Back to School Offer - ", any capital letters.
const bsCpKey = item => { const t = String(item).replace(/^back to school offer - /i, '').trim().toLowerCase(); const c = BS_CP.find(x => x.till.toLowerCase() === t); return c ? c.k : t; };
const bsMonday = iso => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return dateToIso(d); };

// ── THE MASTHEAD'S FILTERS ──────────────────────────────────────────────────
// Branch: ['all'] or codes. Marasy is closed and has no chip: it is in the numbers only under UAE Branches.
function bsCodes() {
  const all = BS_BR.map(b => b[0]);
  if (typeof sel === 'undefined' || !sel.branch || sel.branch.includes('all')) return all;
  return all.filter(c => sel.branch.includes(c));
}
function bsBranchLabel() {
  const c = bsCodes();
  if (typeof sel === 'undefined' || !sel.branch || sel.branch.includes('all') || c.length === BS_BR.length) return 'UAE Branches';
  return c.length ? c.map(bsBrName).join(' + ') : (sel.branch || []).join(' + ');
}
function bsRange() {
  const from = typeof dateFrom !== 'undefined' && dateFrom ? dateToIso(dateFrom) : '0000-01-01';
  const to = typeof dateTo !== 'undefined' && dateTo ? dateToIso(dateTo) : '9999-12-31';
  return { from, to };
}
function bsPeriodLabel() {
  const key = typeof activePeriodKey === 'function' ? activePeriodKey() : '';
  if (key && key !== 'Custom' && key !== 'Month' && key !== 'Year') return key;
  const r = bsRange();
  return r.from === r.to ? bsDay(r.from) : bsDay(r.from) + ' to ' + bsDay(r.to);
}

// ── THE SALES: one object per sale, built from the rows the function returns ────────────────────────────────
function bsPrep() {
  bsData.sales = (bsData.rows || []).map((r, i) => {
    const x = r[7] || [];
    return { id: i, b: r[1], d: String(r[2]).slice(0, 10), no: r[3], aed: +r[4], ci: +r[5], l: r[6] || [], x, xa: bsSum(x, c => +c[1]) };
  });
  bsData.first = bsData.sales.reduce((m, s) => !m || s.d < m ? s.d : m, '');
  bsData.last = bsData.sales.reduce((m, s) => s.d > m ? s.d : m, '');
}
// o = { br: null (masthead) | '*' (all) | code, rng: {a, b} (default: the masthead's period), ci: a client, cp: a component, xo: only sales with more on them }
function bsWr(o) {
  const w = bsRange(), r = o.rng || { a: w.from, b: w.to }, codes = o.br === '*' ? BS_BR.map(b => b[0]) : o.br ? [o.br] : bsCodes();
  let rs = (bsData ? bsData.sales : []).filter(s => codes.includes(s.b) && s.d >= r.a && s.d <= r.b && (o.ci == null || s.ci === o.ci) && (!o.xo || s.xa > 0));
  // a component window shows only that line of each sale, at its own price; the sale it came from is kept for the last step
  if (o.cp) rs = rs.map(s => { const l = s.l.filter(c => bsCpKey(c[0]) === o.cp); return Object.assign({}, s, { aed: bsSum(l, c => +c[1]), l, full: s }); }).filter(s => s.l.length);
  return rs;
}
const bsCli = rs => new Set(rs.map(s => s.ci)).size;
const bsBr = br => { const rs = bsWr({ br }); return { n: rs.length, aed: bsSum(rs, s => s.aed), cl: bsCli(rs) }; };

// ── CLICKABLE FIGURES: every count and AED opens the sales behind it, and a figure inside a window opens the next step down, to one sale ──────────────
function bsSaleSpec(s0) {
  const s = s0.full || s0, p = BS_PK;
  const steps = [['Offer', p.n + ' (AED ' + p.price + ')'], ['How it was matched', 'Exact: every till line starts with “Back to School Offer - ”'], ['Date', bsDay(s.d)], ['Salon', bsBrName(s.b)], ['Sale number', String(s.no)], ['Client', bsCl(s.ci)], ['Lines in the offer', String(s.l.length)]]
    .concat(s.l.map((c, i) => ['Line ' + (i + 1), String(c[0]).replace(/^back to school offer - /i, '') + ' · AED ' + Number(c[1]).toFixed(2)]))
    .concat(s.x.map((c, i) => ['Also on the sale ' + (i + 1), c[0] + ' · AED ' + Number(c[1]).toFixed(2) + ' (not in the offer)']));
  const note = (Math.abs(s.aed - p.price) < 0.005 ? 'Paid the full offer price. ' : 'Paid AED ' + Math.abs(s.aed - p.price).toFixed(2) + (s.aed < p.price ? ' less' : ' more') + ' than the offer price. The till does not say why. ')
    + (s.x.length ? 'The client also bought AED ' + s.xa.toFixed(2) + ' of other things on this till sale: not part of the offer and not in its AED. ' : '');
  return { title: p.n + ', ' + bsDay(s.d), tip: 'See the sale', cur: 'AED', views: [{ id: 'sale', label: 'The sale', load: async () => ({
    sub: bsBrName(s.b) + ' · sale ' + s.no + ' · ' + bsCl(s.ci) + ' · paid AED ' + s.aed.toFixed(2) + ' for the offer',
    note: 'This is the last step: one sale has nothing behind it. ' + note + 'Line by line the offer adds up to the paid amount.',
    cols: [{ k: 's', l: 'Step' }, { k: 'd', l: 'Detail' }], rows: steps.map(x => ({ s: x[0], d: x[1] })), foot: { s: 'Paid by the client for the offer', d: 'AED ' + s.aed.toFixed(2) } }) }] };
}
function bsWin(o) {
  if (typeof TRSD === 'undefined' || !bsData) return null;
  const rs0 = () => bsWr(o), sub = () => { const rs = rs0(); return (o.br === '*' ? 'UAE Branches' : o.br ? bsBrName(o.br) : bsBranchLabel()) + ' · ' + (o.rng ? (o.rng.a === o.rng.b ? bsDay(o.rng.a) : bsDay(o.rng.a) + ' to ' + bsDay(o.rng.b)) : bsPeriodLabel()) + ' · ' + bsPlural(rs.length, 'sale') + ' · ' + bsAed(bsSum(rs, s => s.aed)) + ' · ' + bsPlural(bsCli(rs), 'client'); };
  const rs = rs0(), views = [], t = o.t || 'Back to School Offer sold';
  const kinds = x => new Set(x).size;
  const w = p => Object.assign({}, o, p);
  const cn = o.cp ? 'Lines' : 'Offers bought';
  if (o.ci == null) views.push({ id: 'clients', label: 'Clients', load: async () => {
    const m = {}; rs0().forEach(s => { const c = m[s.ci] || (m[s.ci] = { ci: s.ci, n: 0, a: 0, last: '', br: {} }); c.n++; c.a += s.aed; if (s.d > c.last) c.last = s.d; c.br[bsBrName(s.b)] = 1; });
    const list = Object.values(m).sort((a, b) => b.n - a.n || b.a - a.a || a.ci - b.ci), sp = c => bsWin(w({ ci: c.ci, t: t + ', ' + bsCl(c.ci) }));
    return { sub: sub(), cols: [{ k: 'c', l: 'Client' }, { k: 's', l: 'Salon' }, { k: 'n', l: cn, t: 'num' }, { k: 'l', l: 'Last bought', t: 'date' }, { k: 'a', l: 'AED', t: 'aed' }],
      rows: list.map(c => ({ c: bsCl(c.ci), s: Object.keys(c.br).join(', '), n: c.n, l: c.last, a: c.a, _dn: { c: sp(c), n: sp(c), a: sp(c) } })),
      foot: { c: 'Total: ' + bsPlural(list.length, 'client'), n: rs.length, a: bsSum(rs, s => s.aed) } };
  } });
  if (kinds(rs.map(s => s.b)) > 1) views.push({ id: 'branch', label: 'By salon', load: async () => {
    const tot = bsSum(rs0(), s => s.aed);
    return { sub: sub(), cols: [{ k: 'b', l: 'Salon' }, { k: 'n', l: 'Sold', t: 'num' }, { k: 'a', l: 'AED', t: 'aed' }, { k: 'sh', l: 'Share', t: 'pct' }],
      rows: BS_BR.filter(b => rs.some(s => s.b === b[0])).map(b => { const x = rs0().filter(s => s.b === b[0]), sp = bsWin(w({ br: b[0], t: t + ', ' + b[1] })); return { b: b[1], n: x.length, a: bsSum(x, s => s.aed), sh: tot ? bsSum(x, s => s.aed) / tot * 100 : 0, _dn: { n: sp, a: sp } }; }),
      foot: { b: 'Total', n: rs.length, a: tot } };
  } });
  if (kinds(rs.map(s => bsMonday(s.d))) > 1) views.push({ id: 'week', label: 'By week', load: async () => {
    const m = {}; rs0().forEach(s => { const k = bsMonday(s.d), c = m[k] || (m[k] = { d: k, n: 0, a: 0 }); c.n++; c.a += s.aed; });
    const list = Object.values(m).sort((a, b) => a.d < b.d ? 1 : -1), sp = c => { const e = new Date(c.d + 'T12:00:00'); e.setDate(e.getDate() + 6); return bsWin(w({ rng: { a: c.d, b: dateToIso(e) }, t: t + ', week of ' + bsShort(c.d) })); };
    return { sub: sub(), cols: [{ k: 'd', l: 'Week of', t: 'date' }, { k: 'n', l: 'Sold', t: 'num' }, { k: 'a', l: 'AED', t: 'aed' }],
      rows: list.map(c => ({ d: c.d, n: c.n, a: c.a, _dn: { n: sp(c), a: sp(c) } })), foot: { d: 'Total', n: rs.length, a: bsSum(rs, s => s.aed) } };
  } });
  if (kinds(rs.map(s => s.d)) > 1) views.push({ id: 'day', label: 'By day', load: async () => {
    const m = {}; rs0().forEach(s => { const k = s.d + s.b, c = m[k] || (m[k] = { d: s.d, b: s.b, n: 0, a: 0 }); c.n++; c.a += s.aed; });
    const list = Object.values(m).sort((a, b) => a.d < b.d ? 1 : a.d > b.d ? -1 : 0), sp = c => bsWin(w({ br: c.b, rng: { a: c.d, b: c.d }, t: t + ', ' + bsDay(c.d) }));
    return { sub: sub(), cols: [{ k: 'd', l: 'Date', t: 'date' }, { k: 'b', l: 'Salon' }, { k: 'n', l: 'Sold', t: 'num' }, { k: 'a', l: 'AED', t: 'aed' }],
      rows: list.map(c => ({ d: c.d, b: bsBrName(c.b), n: c.n, a: c.a, _dn: { n: sp(c), a: sp(c) } })),
      foot: { d: 'Total', n: rs.length, a: bsSum(rs, s => s.aed) } };
  } });
  if (!o.cp && rs.length > 1) views.push({ id: 'component', label: 'By component', load: async () => {
    const tot = bsSum(rs0(), s => s.aed);
    return { sub: sub(), cols: [{ k: 'c', l: 'Component' }, { k: 'n', l: 'Lines', t: 'num' }, { k: 'a', l: 'AED', t: 'aed' }, { k: 'sh', l: 'Share', t: 'pct' }],
      rows: BS_CP.map(c => { const x = bsWr(w({ cp: c.k })), sp = bsWin(w({ cp: c.k, t: t + ', ' + c.n })); return { c: c.n, n: x.length, a: bsSum(x, s => s.aed), sh: tot ? bsSum(x, s => s.aed) / tot * 100 : 0, _dn: { n: x.length ? sp : null, a: x.length ? sp : null } }; }),
      foot: { c: 'Total', n: bsSum(BS_CP, c => bsWr(w({ cp: c.k })).length), a: tot } };
  } });
  views.push({ id: 'sales', label: 'Sales', load: async () => {
    const list = rs0().slice().sort((a, b) => a.d < b.d ? 1 : a.d > b.d ? -1 : (a.no < b.no ? 1 : -1));
    return { sub: sub(), note: 'Tap a number to see what is behind it, down to one sale. Clients are numbered, never named.',
      cols: [{ k: 'd', l: 'Date', t: 'date' }, { k: 'b', l: 'Salon' }, { k: 'no', l: 'Sale no.' }, { k: 'c', l: 'Client' }, { k: 'l', l: 'Lines', t: 'num' }, { k: 'a', l: 'Paid (AED)', t: 'num' }, { k: 'x', l: 'Also on the sale (AED)', t: 'num' }],
      rows: list.map(s => { const sp = bsSaleSpec(s), cs = o.ci == null ? bsWin(w({ ci: s.ci, t: t + ', ' + bsCl(s.ci) })) : null; return { d: s.d, b: bsBrName(s.b), no: s.no, c: bsCl(s.ci), l: s.l.length, a: s.aed, x: (s.full || s).xa, _dn: { no: sp, l: sp, a: sp, x: sp, c: cs } }; }),
      foot: { d: 'Total: ' + bsPlural(rs.length, 'sale'), l: bsSum(rs, s => s.l.length), a: bsSum(rs, s => s.aed), x: bsSum(rs, s => (s.full || s).xa) } };
  } });
  return { title: t, tip: 'See the sales', cur: 'AED', views };
}
// A figure that opens its sales. Zero stays plain (nothing behind it), and so does a figure when drill.js is not on the page.
const bsN = (html, n, o) => (n && typeof TRSD !== 'undefined') ? TRSD.num(html, bsWin(o)) : html;

// One Google Sheets table (sheet-table.js): sort and filter on every heading, and it keeps its filters when the page redraws.
function bsMake(id, rows, cols, total, extra) {
  if (typeof TRSheet === 'undefined' || !document.getElementById(id)) return null;
  const old = bsTs[id];
  const T = TRSheet.table(Object.assign({ id, el: '#' + id, rows: () => rows, cols, total }, extra || {}));
  if (old) { T.f = old.f; T.sort = old.sort; }
  bsTs[id] = T; T.draw(); return T;
}
const bsPhoneBtn = id => `<button type="button" class="ad-btn ad-phone" data-sxcm="${id}" aria-label="Sort and filter">Sort or filter</button>`;
const bsCol = (k, l, t, raw, disp, cell) => ({ k, l, t, raw, disp, cell });
const bsBc = n => n ? n : '<span class="ad-zero">–</span>';

// ── LOAD ────────────────────────────────────────────────────────────────────
async function renderBackToSchool(force) {
  const el = document.getElementById('pkBackToSchoolContent');
  if (!el || !bsOk()) return;
  if (bsData && !force) { bsPaint(); return; }
  if (bsBusy) return;
  bsBusy = true; bsErr = '';
  el.innerHTML = '<div class="ad-state">Reading the till…</div>';
  try {
    const { data, error } = await sb.rpc('pk_back_to_school', { p_summary: false });
    if (error || !data || !Array.isArray(data.rows)) throw error || new Error('no report');
    bsData = data; bsPrep();
  } catch (e) { console.error(e); bsErr = 'The report did not load. Press Refresh to try again.'; }
  bsBusy = false;
  bsPaint();
}

// Day, Monday-start week or calendar month buckets between two ISO dates.
function bsBuckets(a, b, unit) {
  const out = [], iso = d => dateToIso(d);
  let d = new Date(a + 'T12:00:00'); const stop = new Date(b + 'T12:00:00');
  if (unit === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  if (unit === 'month') d = new Date(d.getFullYear(), d.getMonth(), 1, 12);
  const step = unit === 'day' ? [0, 0, 1] : unit === 'week' ? [0, 0, 7] : [0, 1, 0];
  for (let g = 0; d <= stop && g < 400; g++) {
    const nx = new Date(d.getFullYear() + step[0], d.getMonth() + step[1], d.getDate() + step[2], 12);
    out.push({ a: iso(d), b: iso(new Date(nx.getFullYear(), nx.getMonth(), nx.getDate() - 1, 12)), n: 0, t: 0, ci: 0, top: '' });
    d = nx;
  }
  return out;
}
function bsBucketLabel(b, unit) {
  if (!b) return '';
  const [y, m] = b.a.split('-').map(Number);
  if (unit === 'month') return BS_MON[m - 1] + ' ' + y;
  if (unit === 'week') return 'Week of ' + bsShort(b.a);
  return bsShort(b.a);
}
function bsAxis(b, unit) {
  const [, m] = b.a.split('-').map(Number);
  if (unit === 'month') return BS_MON[m - 1].slice(0, 3);
  return bsShort(b.a);
}

// ── PAINT ───────────────────────────────────────────────────────────────────
function bsPaint() {
  const el = document.getElementById('pkBackToSchoolContent');
  if (!el) return;
  const head = `<div class="ad-top"><div><h1 class="ad-t">Back to School Offer Performance</h1><p class="ad-sub">${bsData ? 'As of ' + bsEsc(bsWhen(bsData.at)) + '. Phorest sales, the archived package Back to School Offer (AED 399).' : ''}</p></div>
    <div class="ad-toplinks"><button class="ad-btn" type="button" onclick="renderBackToSchool(true)">Refresh</button>
    <a class="ad-btn" href="/?view=pkdir" onclick="if(trsPlain(event)){event.preventDefault();showView('pkdir', null)}">All archived package pages</a></div></div>`;
  if (bsErr || !bsData) { el.innerHTML = head + `<div class="ad-state">${bsEsc(bsErr || 'No report yet.')}</div>`; bsRail(false); return; }

  const rs = bsWr({}), n = rs.length, aed = bsSum(rs, s => s.aed), nc = bsCli(rs);
  if (!n) {
    const key = typeof activePeriodKey === 'function' ? activePeriodKey() : '';
    const named = key && key !== 'Custom' && key !== 'Month' && key !== 'Year';
    el.innerHTML = head + `<section class="ad-card"><div class="ad-empty">No Back to School Offer was sold at ${bsEsc(bsBranchLabel())} in ${bsEsc(named ? bsPeriodLabel().toLowerCase() : bsPeriodLabel())}. It is an archived offer: it sold from ${bsEsc(bsDay(bsData.first))} to ${bsEsc(bsDay(bsData.last))}.
      ${key !== 'All time' ? `<button type="button" class="ad-btn" style="margin-left:6px" onclick="document.querySelector('#periodChips .chip[data-v=&quot;All time&quot;]')?.click()">See all time instead</button>` : 'Widen the Branch in the header.'}</div></section>`;
    bsM = null; bsRail(false);
    if (!bsAllOnce && key !== 'All time') { bsAllOnce = true; document.querySelector('#periodChips .chip[data-v="All time"]')?.click(); }
    return;
  }
  bsAllOnce = true;
  const w = bsRange();
  const start = w.from > bsData.first ? w.from : bsData.first, end = w.to < bsData.last ? w.to : bsData.last;
  const span = Math.max(1, Math.round((new Date(end + 'T12:00:00') - new Date(start + 'T12:00:00')) / 864e5) + 1);
  const unit = span <= 31 ? 'day' : span <= 140 ? 'week' : 'month';
  const bk = bsBuckets(start, end, unit);
  bk.forEach(b => { const x = bsWr({ rng: { a: b.a, b: b.b } }); b.n = x.length; b.t = bsSum(x, s => s.aed); b.ci = bsCli(x); const m = {}; x.forEach(s => { m[s.b] = (m[s.b] || 0) + 1; }); b.top = Object.keys(m).map(c => bsBrName(c) + ' ' + m[c]).join(', '); });
  const busy = bk.slice().sort((a, b) => b.n - a.n)[0], cnt = {}; rs.forEach(s => { cnt[s.ci] = (cnt[s.ci] || 0) + 1; });
  const again = Object.keys(cnt).filter(c => cnt[c] > 1).length, per = n / span, first = rs.reduce((m, s) => !m || s.d < m ? s.d : m, ''), last = rs.reduce((m, s) => s.d > m ? s.d : m, '');
  const days = new Set(rs.map(s => s.d)).size, xs = rs.filter(s => s.xa > 0), xaed = bsSum(rs, s => s.xa);
  const brs = BS_BR.map(b => { const q = bsWr({ br: b[0] }); return { code: b[0], name: b[1], on: bsCodes().includes(b[0]), n: q.length, aed: bsSum(q, s => s.aed), cl: bsCli(q), last: q.reduce((m, s) => s.d > m ? s.d : m, '') }; });
  bsM = { bk, unit, brs, aed, n, nc, first, last, xa: xaed, xn: xs.length };
  const dAll = { t: 'Back to School Offer sold' }, dX = { t: 'Back to School Offer sold, sales with more on them', xo: true };
  const topB = brs.slice().sort((a, b) => b.n - a.n)[0];

  let h = head + whyWall([
    ['Why this page', 'The Back to School Offer is an archived Phorest package at AED 399. This page shows when it sold, where, and to how many clients.'],
    ['Why now', 'Active Deals Performance only covers the 2026 brochure. Schools go back every August, and this is the one past run we can look at before planning the next.'],
    ['If we do nothing', 'We plan an August offer without knowing the last one sold ' + bsData.sales.length + ' times in ' + (Math.round((new Date(bsData.last + 'T12:00:00') - new Date(bsData.first + 'T12:00:00')) / 864e5) + 1) + ' days, to ' + bsData.clients + ' different clients, and that ' + bsData.sales.filter(s => s.xa > 0).length + ' of the ' + bsData.sales.length + ' spent more on the same sale.']]);
  h += `<section class="ad-card" id="bs-headline"><div class="ad-hero"><div>
      <div class="ad-cap">Back to School Offer sold</div><div class="ad-big">${bsN(`${n} <small>sale${n === 1 ? '' : 's'}, ${bsAed(aed)}</small>`, n, dAll)}</div>
      <div class="ad-track"><div class="ad-fill" style="width:${Math.round(days / span * 100)}%"></div></div>
      <div class="ad-cap">${days} of ${span} day${span === 1 ? '' : 's'} in this window had a sale · exact name at the till, no price test</div></div>
    <div class="ad-pace"><div class="ad-status warn"><span aria-hidden="true">!</span>Closed offer: last sale ${bsEsc(bsDay(bsData.last))}</div>
      <div class="ad-row"><span>Averaging in the run</span><b>${per.toFixed(1)} sales a day</b></div>
      <div class="ad-row"><span>Busiest ${unit}</span><b>${bsN(`${bsEsc(bsBucketLabel(busy, unit))}, ${bsPlural(busy.n, 'sale')}`, busy.n, { rng: { a: busy.a, b: busy.b }, t: 'Back to School Offer sold, ' + bsBucketLabel(busy, unit) })}</b></div>
      <div class="ad-row"><span>First sale</span><b>${bsEsc(bsDay(first))}</b></div>
      <div class="ad-row"><span>Latest sale</span><b>${bsEsc(bsDay(last))}</b></div>
      <div class="ad-row"><span>Best salon</span><b>${bsN(bsEsc(topB.name), topB.n, { br: topB.code, t: topB.name })}</b></div>
      <div class="ad-row"><span>Bought more than once</span><b>${bsN(`${again} of ${nc} clients`, again, dAll)}</b></div></div></div></section>`;
  h += `<div class="ad-tiles">${[
    ['Offers sold', bsN(`${n} <small style="font-family:var(--sans);font-size:13px;color:var(--muted);font-weight:500">sales</small>`, n, dAll), 'at the till, one offer', ''],
    ['AED sold', bsN(bsAed(aed), n, dAll), 'paid by clients, VAT included', ''],
    ['Different clients', bsN(String(nc), nc, dAll), again + ' bought more than once', ''],
    ['Also spent on the sale', xaed ? bsN(bsAed(xaed), xs.length, dX) : bsAed(0), 'in ' + xs.length + ' of ' + n + ' sales, on top of the offer', ''],
    ['Best salon', bsN(bsEsc(topB.name), topB.n, { br: topB.code, t: topB.name }), bsN(bsPlural(topB.n, 'sale'), topB.n, { br: topB.code, t: topB.name }), 'txt']
  ].map(t => `<div class="ad-tile"><div class="l">${t[0]}</div><div class="v ${t[3]}">${t[1]}</div><div class="h">${t[2]}</div></div>`).join('')}</div>`;
  h += `<p class="ad-sub"><b>What to watch.</b> ${bsEsc(topB.name)} has ${bsN(`${topB.n} of the ${n} sales`, topB.n, { br: topB.code, t: topB.name })} and ${n - topB.n ? 'the other salons share ' + (n - topB.n) + '.' : 'the other salons have none.'} ${again ? '' : 'Nobody bought it twice.'}</p>`;

  const qn = bk.filter(b => !b.n).length;
  h += `<section class="ad-card" id="bs-month"><h2>Sales over time</h2><p class="ad-sub">When the offer sold: sales each ${unit}, by the date of the sale. It is archived, so the bars stop. <b>What to watch.</b> ${bsEsc(bsBucketLabel(busy, unit))} is the busiest ${unit}, with ${bsPlural(busy.n, 'sale')}. ${qn ? `${qn} of ${bk.length} ${unit}${bk.length === 1 ? '' : 's'} ${qn === 1 ? 'has' : 'have'} no sale at all.` : `Every ${unit} in this window has at least one sale.`}</p>
    <div class="ad-chart" id="bsMonChart"></div>
    <details><summary>Show as table</summary><div id="bsMonTable"></div></details></section>`;
  h += `<section class="ad-card" id="bs-branch"><h2>By branch</h2><p class="ad-sub">Which salon is selling the offer: the cash taken at each one. Branches outside your header filter are shown faded. Marasy is closed and only has history. Motor City and Al Quoz have no till lines in 2021.</p>
    <div class="ad-chart" id="bsBrChart"></div>
    <details><summary>Show as table</summary><div>${bsPhoneBtn('bsbr')}<table id="bsbr"></table></div></details></section>`;
  h += `<section class="ad-card" id="bs-package"><h2>By offer</h2><p class="ad-sub">The one archived package, with the salons that sold it and the cash. Every sale is five till lines that add up to AED 399. Tap a heading to sort or filter another way. <b>What to watch.</b> ${bsN(`${n} sales`, n, dAll)} came to ${bsN(bsAed(aed), n, dAll)}. No slide was found for it.</p>
    <div>${bsPhoneBtn('bspk')}<table id="bspk"></table></div></section>`;
  h += `<section class="ad-card" id="bs-component"><h2>By component</h2><p class="ad-sub">The five lines of the offer, each one tappable down to the sales it was rung on. <b>What to watch.</b> Long Blowdry is the biggest line at AED 119, ${bsPc(119, 399)} of the price, and manicure the smallest at AED 60. The five prices add up to AED 399 and stay plain: a price has no sale behind it.</p>
    <div>${bsPhoneBtn('bscp')}<table id="bscp"></table></div></section>`;
  h += `<section class="ad-card" id="bs-notcounted"><h2>Not traced</h2><p class="ad-sub">What we looked for and did not find. Nothing here is in the totals.</p><ul class="ad-list">${bsNotCounted()}</ul>
    <h3 class="ad-subh">Waiting on a word</h3><ol class="ad-ask">
      <li><b>Kate:</b> do you have the slide or an ad for it? Save the image and it goes in the Slide column.</li>
      <li><b>Kate:</b> Marasy is closed but sold 2 of the 9. It stays inside UAE Branches on this page. Is that fine?</li></ol></section>
    <details class="more"><summary>How these numbers are counted</summary>
      <p class="ad-sub">Sold is distinct sales (branch, date, sale id): the offer is one sale made of five lines named “Back to School Offer - …”, so we count sales, not lines. AED is what the client paid for the offer’s own five lines, VAT included, a refund taken off. A sale counts only when its lines add up to more than AED 0. None was refunded.</p>
      <p class="ad-sub">Also spent on the sale is what else was rung on the same till sale. It is not part of the offer and not in its AED.</p>
      <p class="ad-sub">Exact means the offer has its own name at the till. There is no price test on this page, because no sale of AED 399 with these lines was found outside the August 2021 run.</p>
      <p class="ad-sub">Clients are numbered inside the report, never named: “Client 4” is the same person everywhere on this page. Sale lines are in the dashboard from 23 May 2021. Bahrain has no lines for this offer. Data comes from the daily Phorest Sales Transactions upload, so today’s sales appear after the nightly run.</p></details>`;
  el.innerHTML = h;
  bsCharts(); bsTables(); bsRail(true);
}
function bsNotCounted() {
  const th = (a, b) => `<span class="ad-th ad-ph" aria-hidden="true"><span>${a}</span><em>${b}</em></span>`;
  return [
    [th('Later', 'runs'), '<b>Later runs, 2022 to 2026</b> Looked for the same five lines in one sale, with or without the name, from July 2021 to December 2022. Then looked for any sale of AED 399 with three or more lines in July to September of 2022, 2023, 2024, 2025 and 2026. None has these components, so no price test is shown.'],
    [th('Slide', 'none'), '<b>The slide or the ad</b> Instagram and Facebook posts in the dashboard start in 2025, and Ads Manager has no ad with “school” in its name. A September 2025 reel says “back to school” but sells a blonde refresh. It is another offer and is not counted.'],
    [th('What’s', 'in it'), '<b>What is in the package</b> The Phorest Packages screen lists name, category and price only: PACKAGES, AED 399, archived. The five components come from the lines at the till.']
  ].map(x => `<li class="ad-of">${x[0]}<div>${x[1]}</div></li>`).join('');
}

// ── CHARTS (hand-drawn SVG, the Active Deals page's style) ──────────────────
function bsTipHost() {
  const c = document.getElementById('pkBackToSchoolContent');
  let t = document.getElementById('bsTip');
  if (!t && c) { t = document.createElement('div'); t.id = 'bsTip'; t.className = 'ad-tip'; c.appendChild(t); }
  return t;
}
function bsHover(host, selector, fn) {
  const tip = bsTipHost(), box = document.getElementById('pkBackToSchoolContent');
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
function bsCharts() {
  if (!bsM || !document.getElementById('bsMonChart')) return;
  const { bk, unit, brs } = bsM;
  let host = document.getElementById('bsMonChart'), W = Math.max(300, host.clientWidth), H = 210, L = 38, R = 8, T = 14, B = 26;
  const ymax = Math.max(4, Math.ceil(Math.max(...bk.map(x => x.n)) / 4) * 4), bw = (W - L - R) / bk.length;
  const Y = v => T + (1 - v / ymax) * (H - T - B);
  const every = Math.max(1, Math.ceil(bk.length / Math.floor((W - L) / 54)));
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Back to School Offer sold per ${unit}">`;
  for (let g = 0; g <= ymax + 1e-9; g += ymax / 4) s += `<line class="gl" x1="${L}" x2="${W - R}" y1="${Y(g)}" y2="${Y(g)}"/><text class="ax" x="${L - 6}" y="${Y(g) + 4}" text-anchor="end">${Math.round(g)}</text>`;
  bk.forEach((x, i) => {
    const gap = Math.min(3, bw / 4), bx = L + i * bw + gap, bwi = Math.max(2, bw - gap * 2), h = Y(0) - Y(x.n), rr = Math.min(4, h, bwi / 2);
    if (x.n) {
      s += `<path d="M${bx} ${Y(0)} v${-(h - rr)} q0 -${rr} ${rr} -${rr} h${bwi - 2 * rr} q${rr} 0 ${rr} ${rr} v${h - rr}Z" fill="var(--series)"/>`;
      if (bw > 20) s += `<text class="ax" x="${bx + bwi / 2}" y="${Y(x.n) - 5}" text-anchor="middle" style="fill:var(--ink);font-weight:600">${x.n}</text>`;
    }
    if (i % every === 0) s += `<text class="ax" x="${bx + bwi / 2}" y="${H - 6}" text-anchor="middle">${bsAxis(x, unit)}</text>`;
    s += `<rect x="${L + i * bw}" y="${T}" width="${bw}" height="${H - T - B}" fill="transparent" data-i="${i}"/>`;
  });
  host.innerHTML = s + '</svg>';
  bsHover(host, 'rect[data-i]', i => { const x = bk[i]; return `<b>${bsEsc(bsBucketLabel(x, unit))}</b><br>${bsPlural(x.n, 'sale')} · ${bsAed(x.t)}${x.n ? `<br>${bsPlural(x.ci, 'client')}. ${bsEsc(x.top)}` : ''}`; });
  bsMonthTbl();

  host = document.getElementById('bsBrChart'); W = Math.max(300, host.clientWidth);
  const narrow = W < 460, rowH = 34, H2 = brs.length * rowH + 4, L2 = narrow ? 88 : 116, R2 = narrow ? 118 : 150, mx = Math.max(...brs.map(r => r.aed)) || 1;
  s = `<svg viewBox="0 0 ${W} ${H2}" role="img" aria-label="Cash taken by branch">`;
  brs.forEach((r, i) => {
    const y = i * rowH + 6, w = r.aed > 0 ? Math.max(4, r.aed / mx * (W - L2 - R2)) : 0;
    s += `<g opacity="${r.on ? 1 : .35}"><text class="ax" x="0" y="${y + 15}" style="fill:var(--ink2);font-size:12px">${r.name}</text>`;
    if (w) s += `<rect x="${L2}" y="${y}" width="${w}" height="20" rx="4" fill="var(--series)"/>`;
    s += `<text class="ax" x="${L2 + w + 8}" y="${y + 15}" style="fill:var(--ink);font-size:12px">${bsAed(r.aed)} · ${r.n} sold</text></g><rect x="0" y="${y - 5}" width="${W}" height="${rowH}" fill="transparent" data-i="${i}"/>`;
  });
  host.innerHTML = s + '</svg>';
  bsHover(host, 'rect[data-i]', i => { const r = brs[i]; return `<b>${r.name}</b><br>${bsPlural(r.n, 'sale')} · ${bsAed(r.aed)} · ${bsPlural(r.cl, 'client')}<br>${r.n ? 'Last sale ' + bsEsc(bsDay(r.last)) : 'No sales'}`; });
}
window.addEventListener('resize', () => {
  clearTimeout(bsResize);
  bsResize = setTimeout(() => { const v = document.getElementById('view-pkschool'); if (v && v.offsetParent) bsCharts(); }, 120);
});

// ── THE TABLES, Google Sheets style (sheet-table.js): a menu on every heading ───────────────────────────────────────────────────
function bsMonthTbl() {
  const host = document.getElementById('bsMonTable'); if (!host || !bsM) return;
  const { bk, unit } = bsM;
  host.innerHTML = bsPhoneBtn('bsmon') + '<table id="bsmon"></table>';
  const lab = x => bsBucketLabel(x, unit), ttl = x => 'Back to School Offer sold, ' + bsBucketLabel(x, unit), rg = x => ({ a: x.a, b: x.b });
  bsMake('bsmon', bk, [
    { k: 'p', l: unit === 'month' ? 'Month' : unit === 'week' ? 'Week of' : 'Day', t: 'txt', raw: x => x.a, disp: lab, cell: x => bsEsc(lab(x)) },
    bsCol('n', 'Sold', 'num', x => x.n, x => String(x.n), x => bsN(String(x.n), x.n, { t: ttl(x), rng: rg(x) })),
    bsCol('a', 'AED', 'num', x => x.t, x => bsAed(x.t), x => bsN(bsAed(x.t), x.n, { t: ttl(x), rng: rg(x) }))
  ], rows => ({ p: 'Total', n: bsN(String(bsSum(rows, x => x.n)), bsSum(rows, x => x.n), { t: 'Back to School Offer sold' }), a: bsAed(bsSum(rows, x => x.t)) }));
}
function bsTables() {
  if (!bsM) return;
  const { brs, aed, n, nc, first, last, xa, xn } = bsM;
  bsMake('bsbr', brs, [
    { k: 'name', l: 'Salon', t: 'txt', raw: b => b.name, disp: b => b.name, cell: b => bsEsc(b.name) },
    bsCol('n', 'Sold', 'num', b => b.n, b => String(b.n), b => bsN(String(b.n), b.n, { br: b.code, t: b.name })),
    bsCol('a', 'AED', 'num', b => b.aed, b => bsAed(b.aed), b => bsN(bsAed(b.aed), b.n, { br: b.code, t: b.name })),
    bsCol('cl', 'Clients', 'num', b => b.cl, b => String(b.cl), b => bsN(String(b.cl), b.cl, { br: b.code, t: b.name })),
    bsCol('s', 'Share of AED', 'num', b => aed ? b.aed / aed : 0, b => bsPc(b.aed, aed), b => bsPc(b.aed, aed)),
    { k: 'last', l: 'Last sale', t: 'txt', raw: b => b.last, disp: b => b.last ? bsDay(b.last) : '–', cell: b => b.last ? bsDay(b.last) : '–' }
  ], rows => { const q = bsSum(rows, b => b.n); return { name: 'Total', n: bsN(String(q), q, { br: '*', t: 'Back to School Offer sold' }), a: bsAed(bsSum(rows, b => b.aed)), cl: String(bsCli(bsWr({ br: '*' }))) }; }, { rowCls: b => b.on ? '' : 'ad-off' });
  // By offer: one row, the same columns as Active Deals Performance's By offer, with a Slide column in front
  const rows = [{ p: BS_PK, n, aed, cl: nc, first, last, xa, xn }];
  const brCols = BS_BR.map(b => bsCol('b' + b[0], b[1], 'num', () => bsBr(b[0]).n, () => String(bsBr(b[0]).n), () => { const q = bsBr(b[0]).n; return q ? bsN(String(q), q, { br: b[0], t: 'Back to School Offer sold, ' + b[1] }) : bsBc(0); }));
  bsMake('bspk', rows, [
    { k: 'sl', l: 'Slide', t: 'txt', raw: () => 'No slide', disp: () => 'No slide', cell: () => '<span class="ad-zero">No slide</span>' },
    { k: 'n', l: 'Offer', t: 'txt', raw: r => r.p.n, disp: r => r.p.n, cell: r => `<b title="${bsEsc(r.p.what)}">${bsEsc(r.p.n)}</b><small>${r.p.pl} · Phorest PACKAGES, archived</small>` }
  ].concat(brCols, [
    { k: 'fs', l: 'First sold', t: 'txt', raw: r => r.first, disp: r => bsDay(r.first), cell: r => bsDay(r.first) },
    bsCol('sold', 'Sold', 'num', r => r.n, r => String(r.n), r => r.n ? `<b>${bsN(String(r.n), r.n, { t: 'Back to School Offer sold' })}</b>` : bsBc(0)),
    bsCol('aed', 'AED', 'num', r => r.aed, r => bsAed(r.aed), r => r.n ? bsN(bsAed(r.aed), r.n, { t: 'Back to School Offer sold' }) : bsBc(0)),
    bsCol('cl', 'Clients', 'num', r => r.cl, r => String(r.cl), r => r.n ? bsN(String(r.cl), r.cl, { t: 'Back to School Offer sold' }) : bsBc(0)),
    { k: 'ls', l: 'Last sold', t: 'txt', raw: r => r.last, disp: r => bsDay(r.last), cell: r => bsDay(r.last) },
    bsCol('xa', 'Also on the sale (AED)', 'num', r => r.xa, r => bsMoney(r.xa), r => r.xa ? bsN(bsAed(r.xa), r.xn, { t: 'Back to School Offer, sales with more on them', xo: true }) : bsBc(0)),
    { k: 'match', l: 'Match', t: 'txt', raw: r => r.p.ct, disp: r => r.p.ct, cell: r => `<span class="ad-tag ${r.p.c}">${r.p.ct}</span>` }
  ]), rs0 => {
    const q = bsSum(rs0, r => r.n), t = { n: 'Total: ' + bsPlural(rs0.length, 'offer'), sold: bsN(String(q), q, { t: 'Back to School Offer sold' }), aed: bsAed(bsSum(rs0, r => r.aed)), cl: String(bsCli(bsWr({}))), xa: bsSum(rs0, r => r.xa) ? bsN(bsAed(bsSum(rs0, r => r.xa)), bsSum(rs0, r => r.xn), { t: 'Back to School Offer, sales with more on them', xo: true }) : '' };
    BS_BR.forEach(b => { const c = bsWr({ br: b[0] }).length; t['b' + b[0]] = c ? bsN(String(c), c, { br: b[0], t: 'Back to School Offer sold, ' + b[1] }) : bsBc(0); });
    return t;
  });
  // By component: the five lines, each one opens the sales it was rung on
  const crow = BS_CP.map(c => { const q = bsWr({ cp: c.k }); return { c, n: q.length, aed: bsSum(q, s => s.aed), cl: bsCli(q) }; });
  bsMake('bscp', crow, [
    { k: 'n', l: 'Component', t: 'txt', raw: r => r.c.n, disp: r => r.c.n, cell: r => `<b>${bsEsc(r.c.n)}</b><small>Till line: Back to School Offer - ${bsEsc(r.c.till)}</small>` },
    bsCol('p', 'Price (AED)', 'num', r => r.c.p, r => String(r.c.p), r => r.c.p + '.00'),
    bsCol('sold', 'Lines', 'num', r => r.n, r => String(r.n), r => r.n ? bsN(String(r.n), r.n, { cp: r.c.k, t: 'Back to School Offer, ' + r.c.n }) : bsBc(0)),
    bsCol('aed', 'AED', 'num', r => r.aed, r => bsAed(r.aed), r => r.n ? bsN(bsAed(r.aed), r.n, { cp: r.c.k, t: 'Back to School Offer, ' + r.c.n }) : bsBc(0)),
    bsCol('sh', 'Share of AED', 'num', r => aed ? r.aed / aed : 0, r => bsPc(r.aed, aed), r => r.n ? bsPc(r.aed, aed) : bsBc(0)),
    bsCol('cl', 'Clients', 'num', r => r.cl, r => String(r.cl), r => r.n ? bsN(String(r.cl), r.cl, { cp: r.c.k, t: 'Back to School Offer, ' + r.c.n }) : bsBc(0))
  ], rs0 => {
    const q = bsSum(rs0, r => r.n), all = rs0.length === BS_CP.length;
    return { n: 'Total: ' + bsPlural(rs0.length, 'component'), p: bsSum(rs0, r => r.c.p) + '.00', sold: q ? (all ? bsN(String(q), q, { t: 'Back to School Offer sold' }) : String(q)) : bsBc(0), aed: bsAed(bsSum(rs0, r => r.aed)), sh: aed ? bsPc(bsSum(rs0, r => r.aed), aed) : '', cl: q ? String(nc) : bsBc(0) };
  });
}

// ── ON THIS PAGE rail (the same shell as Active Deals Performance's) ────────
const BS_RAIL = [['bs-headline', 'Headline'], ['bs-month', 'Sales over time'], ['bs-branch', 'By branch'], ['bs-package', 'By offer'], ['bs-component', 'By component'], ['bs-notcounted', 'Not traced']];
function bsRail(on) {
  const shell = document.getElementById('bsShell'), side = document.getElementById('bsSide');
  if (!shell || !side) return;
  shell.classList.toggle('rv-norail', !on);
  const nav = side.querySelector('.side-nav');
  if (nav && on && !nav.dataset.sig) {
    nav.dataset.sig = '1';
    nav.innerHTML = '<div class="side-k">On this page</div>' + BS_RAIL.map(r => `<a href="#${r[0]}" onclick="lgJump(event,'${r[0]}')">${r[1]}</a>`).join('');
  }
  if (typeof spy === 'function') spy();
}
