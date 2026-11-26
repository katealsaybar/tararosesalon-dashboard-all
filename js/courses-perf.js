// Courses Performance (Kate, 26 Nov 2026): the prepaid courses of Phorest's Courses list, from the till, in Active Deals Performance's format (same classes, css/courses-perf.css).
// Numbers from courses_performance() (migrations/courses_performance.sql), Level 2 and above, no client names and no client ids. Fetched once and filtered here, so a Branch or
// Period change in the masthead redraws at once. A course is BOUGHT on one day (a till line named exactly like the course, AED = what was paid) and USED on many (a later visit with
// a line "<course> - <service>" at AED 0). The two are kept apart and never added. Glow Club (ci 24 to 26) is kept apart again: it has its own page, Glow Club Performance.
// Self-contained: it needs sb, TRS_LEVEL, sel, dateFrom, dateTo, activePeriodKey(), dateToIso(), TRSD (drill.js), TRSheet (sheet-table.js), whyWall().
const CP_BR = [['KCA', 'Khalifa City A'], ['SAA', 'Saadiyat'], ['MC', 'Motor City'], ['AQ', 'Al Quoz'], ['MRY', 'Marasy (closed)']];
const CP_NC = 24;   // courses 0 to 23 are packs; 24 to 26 are Glow Club
// The courses. ci is fixed in courses_performance(). n name at the till, g group (list = on Phorest's Courses list, arch = archived there, old = sold at the till, not on the list now,
// mem = Glow Club), st Phorest status, p Phorest total price, pk sessions in the pack (read from the name), h Phorest client courses [held, still in use]: counts read from Phorest's
// Client courses tab on 25 Nov 2026, never names.
const CP_CR = [
  { n: 'Facial of Choice (buy 3 and get 1)', g: 'list', st: 'In use', p: 1500, pk: 4, h: [91, 11] },
  { n: 'INFRARED LIGHT (buy 6 and get 1)', g: 'list', st: 'In use', p: 720, pk: 7, h: [35, 0] },
  { n: 'FIBRE CLINIX (buy 3 and get 1)', g: 'list', st: 'In use', p: 750, pk: 4, h: [15, 1] },
  { n: 'Blowdry Package (6+1) w/ Junior Stylist', g: 'list', st: 'In use', p: 650, pk: 7, h: [27, 4] },
  { n: 'Full Body Massage (buy 5 and get 1)', g: 'list', st: 'In use', p: 1375, pk: 6, h: [7, 1] },
  { n: 'Eyebrows and upperlip (buy 5 and get 1)', g: 'list', st: 'In use', p: 375, pk: 6, h: [5, 1] },
  { n: 'Hollywood (buy 5 and get 1)', g: 'list', st: 'In use', p: 600, pk: 6, h: [2, 0] },
  { n: 'Head, neck and shoulder massage (buy 5 and get 1)', g: 'list', st: 'In use', p: 425, pk: 6, h: [1, 0] },
  { n: 'Eyebrows shape and tint (buy 5 and get 1)', g: 'list', st: 'In use', p: 475, pk: 6, h: [0, 0] },
  { n: 'SPOIL ME ROTTEN', g: 'list', st: 'In use', p: 650, pk: null, h: [0, 0] },
  { n: 'Ultimate Relaxation', g: 'list', st: 'Not yet purchased', p: 970, pk: null, h: [0, 0] },
  { n: 'AUGUST 15 - 30 PROMOTIONS', g: 'arch', st: 'Archived', p: 399, pk: null, h: [0, 0] },
  { n: 'blowdry promo', g: 'arch', st: 'Archived', p: 650, pk: null, h: [1, 0] },
  { n: '5+1 Blow-dry for 780 AED', g: 'old', st: 'Not on the list', p: null, pk: 6, h: [9, 3] },
  { n: '5+1 Blow dry', g: 'old', st: 'Not on the list', p: null, pk: 6, h: [8, 2] },
  { n: '5+1 Blow dry Session', g: 'old', st: 'Not on the list', p: null, pk: 6, h: [4, 0] },
  { n: '5+1 Blow dry with hair extension', g: 'old', st: 'Not on the list', p: null, pk: 6, h: [6, 1] },
  { n: '10 Session- Extension Blowdry', g: 'old', st: 'Not on the list', p: null, pk: 10, h: [11, 1] },
  { n: '10 session Blow dry', g: 'old', st: 'Not on the list', p: null, pk: 10, h: [17, 0] },
  { n: 'Iron 10 session', g: 'old', st: 'Not on the list', p: null, pk: 10, h: [9, 0] },
  { n: '10+3 Blowdry Package', g: 'old', st: 'Not on the list', p: null, pk: 13, h: [2, 0] },
  { n: '10+3 Blowdry package ( with sam )', g: 'old', st: 'Not on the list', p: null, pk: 13, h: [1, 0] },
  { n: 'Blowdry package (Long) 5+1 with Junior stylist', g: 'old', st: 'Earlier name', p: null, pk: 6, h: null, note: 'Phorest now lists this course as Blowdry Package (6+1): 27 client courses under the new name, which is the 15 sold under this name plus the 12 sold since Jan 2026.' },
  { n: 'Ashleigh Course', g: 'old', st: 'Not on the list', p: null, pk: null, h: [0, 0] },
  { n: 'Glow Club, Silver', g: 'mem', st: 'In use', p: 1250, pk: null, h: [27, 7] },
  { n: 'Glow Club, Gold', g: 'mem', st: 'In use', p: 1750, pk: null, h: [8, 1] },
  { n: 'Glow Club, Platinum', g: 'mem', st: 'In use', p: 2800, pk: null, h: [7, 0] }
];
const CP_PH = { held: 294, use: 33, other: 'One course name in Phorest that is not on the Courses list (bought May 2021)' };   // 293 held in the rows above, plus that one
const CP_LIST = CP_CR.filter(c => c.g === 'list' || c.g === 'arch').length;   // 13 names on Phorest's Courses list (11 in use, 2 archived)
const CP_MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
let cpData = null, cpErr = '', cpBusy = false, cpM = null, cpResize = null, cpTs = {}, cpAllOnce = false, cpShowAll = false;

const cpEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cpMoney = n => Math.round(Number(n) || 0).toLocaleString('en-US');
const cpAed = n => (n < 0 ? '−' : '') + 'AED ' + cpMoney(Math.abs(n));
const cpPc = (a, b) => b ? Math.round(a / b * 100) + '%' : '0%';
const cpSum = (l, f) => l.reduce((a, r) => a + f(r), 0);
const cpR2 = n => Math.round(n * 100) / 100;
const cpOk = () => typeof TRS_LEVEL !== 'undefined' && TRS_LEVEL >= 2;
const cpDay = iso => { try { return new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return iso || ''; } };
const cpShort = iso => { try { return new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); } catch (e) { return iso || ''; } };
const cpWhen = iso => { try { return new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).replace(' at ', ', '); } catch (e) { return iso || ''; } };
const cpBrName = c => (CP_BR.find(b => b[0] === c) || [c, c])[1];
const cpName = ci => CP_CR[ci] ? CP_CR[ci].n : 'Course ' + ci;
const cpPlural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
const cpIso = d => dateToIso(d);

// ── THE MASTHEAD'S FILTERS ──────────────────────────────────────────────────
// Branch: ['all'] or codes. Marasy is closed and has no chip: it is in the numbers only under UAE Branches. Bahrain is its own Phorest business with no course lines.
function cpCodes() {
  const all = CP_BR.map(b => b[0]);
  if (typeof sel === 'undefined' || !sel.branch || sel.branch.includes('all')) return all;
  return all.filter(c => sel.branch.includes(c));
}
function cpAllBranches() { return typeof sel === 'undefined' || !sel.branch || sel.branch.includes('all'); }
function cpBranchLabel() {
  const c = cpCodes();
  if (cpAllBranches() || c.length === CP_BR.length) return 'UAE Branches';
  return c.length ? c.map(cpBrName).join(' + ') : (sel.branch || []).join(' + ');
}
function cpRange() {
  const from = typeof dateFrom !== 'undefined' && dateFrom ? dateToIso(dateFrom) : '0000-01-01';
  const to = typeof dateTo !== 'undefined' && dateTo ? dateToIso(dateTo) : '9999-12-31';
  return { from, to };
}
const cpKey = () => (typeof activePeriodKey === 'function' ? activePeriodKey() : '');
function cpPeriodLabel() {
  const key = cpKey();
  if (key && key !== 'Custom' && key !== 'Month' && key !== 'Year') return key;
  const r = cpRange();
  return r.from === r.to ? cpDay(r.from) : cpDay(r.from) + ' to ' + cpDay(r.to);
}
const cpPw = () => { const k = cpKey(); return k === 'All time' ? 'all time' : k === 'This month' ? 'this month' : k === 'Last month' ? 'last month' : cpPeriodLabel(); };
// "Used of bought" is only fair on All time and all salons: a course can be used at another salon or in a later month.
const cpUsedOk = () => cpKey() === 'All time' && cpAllBranches();

// ── THE ROWS: sales (one per sale) and sessions (one per visit) ─────────────────────────────────────────────
function cpPrep() {
  cpData.S = (cpData.sales || []).map((r, i) => ({ i, ci: +r[0], b: r[1], d: String(r[2]).slice(0, 10), no: String(r[3]), aed: +r[4], ref: +r[5] }));
  cpData.E = (cpData.sess || []).map((r, i) => ({ i, ci: +r[0], b: r[1], d: String(r[2]).slice(0, 10), no: String(r[3]), sv: r[4] || '' }));
  const pk = cpData.S.filter(s => s.ci < CP_NC && !s.ref);
  cpData.first = pk.reduce((m, s) => !m || s.d < m ? s.d : m, '');
  cpData.lastSale = pk.reduce((m, s) => s.d > m ? s.d : m, '');
  cpData.lastSess = cpData.E.filter(e => e.ci < CP_NC).reduce((m, e) => e.d > m ? e.d : m, '');
}
// o = { ci: a course, mem: Glow Club only (default: the packs), br: null (masthead) | '*' (all) | code, rng: {a, b} (default: the masthead's period), sv: a service }
function cpPick(list, o) {
  const w = cpRange(), r = o.rng || { a: w.from, b: w.to }, codes = o.br === '*' ? CP_BR.map(b => b[0]) : o.br ? [o.br] : cpCodes();
  return list.filter(x => (o.ci != null ? x.ci === o.ci : o.mem ? x.ci >= CP_NC : x.ci < CP_NC) && codes.includes(x.b) && x.d >= r.a && x.d <= r.b && (o.sv == null || x.sv == null || x.sv === o.sv));
}
const cpWS = o => cpData ? cpPick(cpData.S, o) : [];
const cpWE = o => cpData ? cpPick(cpData.E, o) : [];
function cpMeas(o) {
  const s = cpWS(o), e = cpWE(o), buy = s.filter(x => !x.ref);
  return { n: buy.length, a: cpR2(cpSum(s, x => x.aed)), e: e.length, rf: s.length - buy.length, first: buy.reduce((m, x) => !m || x.d < m ? x.d : m, ''), last: buy.reduce((m, x) => x.d > m ? x.d : m, '') };
}
const cpStat = (ci, o) => Object.assign({ ci }, cpMeas(Object.assign({}, o || {}, { ci })));
function cpUsedPct(s) { const c = CP_CR[s.ci]; return (cpUsedOk() && c.pk && s.n > 0) ? 100 * s.e / (s.n * c.pk) : null; }
function cpUsedTot(st) { let sb = 0, se = 0; st.forEach(s => { const c = CP_CR[s.ci]; if (c.pk && s.n > 0) { sb += s.n * c.pk; se += s.e; } }); return { sold: sb, used: se, pct: sb ? 100 * se / sb : null }; }

// ── CLICKABLE FIGURES: every count and AED opens the sales or sessions behind it, and a figure inside a window opens the next step down, to one sale or one visit ──────────────
function cpSaleSpec(s) {
  const c = CP_CR[s.ci], st = [['Course', c.n], ['Phorest', c.st + (c.p ? ' · AED ' + cpMoney(c.p) + ' in Phorest' : '')], ['Date', cpDay(s.d)], ['Salon', cpBrName(s.b)], ['Sale number', s.no],
    ['What it is', s.ref ? 'A refund line: it comes off the day it was given' : 'A sale of the course itself, a till line named exactly like it']];
  return { title: c.n + ', ' + cpDay(s.d), tip: 'See the sale', cur: 'AED', views: [{ id: 'sale', label: 'The sale', load: async () => ({
    sub: cpBrName(s.b) + ' · sale ' + s.no + ' · ' + cpAed(s.aed),
    note: 'This is the last step: one sale has nothing behind it. The till does not say who bought it on this page: client names are not shown here.',
    cols: [{ k: 's', l: 'Step' }, { k: 'd', l: 'Detail' }], rows: st.map(x => ({ s: x[0], d: x[1] })), foot: { s: 'Paid at the till', d: cpAed(s.aed) } }) }] };
}
function cpSessSpec(e) {
  const c = CP_CR[e.ci], st = [['Course', c.n], ['Service used', e.sv || '–'], ['Date', cpDay(e.d)], ['Salon', cpBrName(e.b)], ['Visit (sale number)', e.no], ['What it is', 'A later visit with a line named after the course, at AED 0, that took one session off it']];
  return { title: c.n + ', ' + cpDay(e.d), tip: 'See the session', cur: 'AED', views: [{ id: 'sess', label: 'The session', load: async () => ({
    sub: cpBrName(e.b) + ' · visit ' + e.no + ' · AED 0',
    note: 'This is the last step: one session has nothing behind it. It is AED 0 at the till, so no price is put on it. Client names are not shown on this page.',
    cols: [{ k: 's', l: 'Step' }, { k: 'd', l: 'Detail' }], rows: st.map(x => ({ s: x[0], d: x[1] })), foot: { s: 'Charge at the till', d: 'AED 0' } }) }] };
}
// Phorest's own counts (Client courses tab). Counts only: this window has nothing behind it.
function cpPhWin(ci) {
  if (typeof TRSD === 'undefined') return null;
  const rows = CP_CR.map((c, i) => ({ i, c })).filter(x => ci == null || x.i === ci);
  return { title: ci == null ? 'Phorest client courses' : CP_CR[ci].n + ', in Phorest', tip: 'See the Phorest counts', cur: 'AED', views: [{ id: 'ph', label: 'Client courses', load: async () => {
    const out = rows.map(x => ({ c: x.c.n, h: x.c.h ? x.c.h[0] : null, u: x.c.h ? x.c.h[1] : null, s: cpMeas({ ci: x.i, br: '*', rng: { a: '0000-01-01', b: '9999-12-31' } }).n }));
    if (ci == null) out.push({ c: CP_PH.other, h: 1, u: 0, s: 0 });
    return { sub: (ci == null ? cpMoney(CP_PH.held) + ' client courses, ' + cpMoney(CP_PH.use) + ' still in use · ' : '') + 'Counts from Phorest’s Client courses tab, read 25 Nov 2026 · all time, all salons',
      note: 'This is the last step: Phorest gives these as counts. Client names are not on this page, and the sessions left on each client course are only in Phorest. ' + (ci != null && CP_CR[ci].note ? CP_CR[ci].note : ''),
      cols: [{ k: 'c', l: 'Course' }, { k: 'h', l: 'Held, all time', t: 'num' }, { k: 'u', l: 'Still in use', t: 'num' }, { k: 's', l: 'Bought at the till, all time', t: 'num' }],
      rows: out, foot: ci == null ? { c: 'All', h: CP_PH.held, u: CP_PH.use, s: cpSum(out, x => x.s) } : undefined };
  } }] };
}
// m: 'sold' (what was bought), 'sess' (what was used) or 'both' (a course's own window).
function cpWin(o) {
  if (typeof TRSD === 'undefined' || !cpData) return null;
  const m = o.m || 'sold', t = o.t || (o.mem ? 'Glow Club' : m === 'sess' ? 'Sessions used' : 'Courses bought');
  const w0 = cpRange(), wa = o.rng ? o.rng.a : w0.from, wb = o.rng ? o.rng.b : w0.to;
  const lab = () => o.br === '*' ? 'UAE Branches' : o.br ? cpBrName(o.br) : cpBranchLabel();
  const per = () => o.rng ? (o.rng.a === o.rng.b ? cpDay(o.rng.a) : cpDay(o.rng.a) + ' to ' + cpDay(o.rng.b)) : cpPeriodLabel();
  const S = () => m === 'sess' ? [] : cpWS(o), E = () => m === 'sold' ? [] : cpWE(o);
  const sub = () => { const x = cpMeas(o); return lab() + ' · ' + per() + ' · ' + (m !== 'sess' ? cpMoney(x.n) + ' bought, ' + cpAed(x.a) : '') + (m === 'both' ? ' · ' : '') + (m !== 'sold' ? cpMoney(x.e) + ' sessions used' : ''); };
  const w = p => Object.assign({}, o, p);
  const mcols = first => [first].concat(m !== 'sess' ? [{ k: 'n', l: 'Bought', t: 'num' }, { k: 'a', l: 'AED paid', t: 'aed' }] : [], m !== 'sold' ? [{ k: 'e', l: 'Sessions used', t: 'num' }] : []);
  const rowOf = (extra, q, ttl) => {
    const x = cpMeas(q), r = Object.assign({}, extra, { n: x.n, a: x.a, e: x.e }), dn = {};
    if (m !== 'sess' && (x.n || x.a)) { const s = cpWin(Object.assign({}, q, { m: 'sold', t: ttl })); dn.n = s; dn.a = s; }
    if (m !== 'sold' && x.e) dn.e = cpWin(Object.assign({}, q, { m: 'sess', t: ttl }));
    r._dn = dn; return { r, x };
  };
  const foot = (rows, k, label) => { const f = { [k]: label }; if (m !== 'sess') { f.n = cpSum(rows, x => x.n); f.a = cpR2(cpSum(rows, x => x.a)); } if (m !== 'sold') f.e = cpSum(rows, x => x.e); return f; };
  const views = [], sp = S(), ep = E(), all = sp.concat(ep), kinds = a => new Set(a).size;
  if (o.ci == null && kinds(all.map(x => x.ci)) > 1) views.push({ id: 'course', label: 'By course', load: async () => {
    const ids = [...new Set(all.map(x => x.ci))].sort((a, b) => a - b), rows = ids.map(ci => rowOf({ c: cpName(ci) }, w({ ci }), t + ', ' + cpName(ci)).r);
    rows.sort((a, b) => (b.a - a.a) || (b.e - a.e));
    return { sub: sub(), cols: mcols({ k: 'c', l: 'Course' }), rows, foot: foot(rows, 'c', 'Total: ' + cpPlural(rows.length, 'course')) };
  } });
  if (kinds(all.map(x => x.b)) > 1) views.push({ id: 'salon', label: 'By salon', load: async () => {
    const rows = CP_BR.filter(b => all.some(x => x.b === b[0])).map(b => rowOf({ b: b[1] }, w({ br: b[0] }), t + ', ' + b[1]).r);
    return { sub: sub(), cols: mcols({ k: 'b', l: 'Salon' }), rows, foot: foot(rows, 'b', 'Total') };
  } });
  const months = [...new Set(all.map(x => x.d.slice(0, 7)))].sort();
  if (months.length > 1) views.push({ id: 'month', label: 'By month', load: async () => {
    const rows = months.map(k => {
      const [y, mo] = k.split('-').map(Number), a0 = k + '-01', b0 = k + '-' + String(new Date(y, mo, 0).getDate()).padStart(2, '0');
      return rowOf({ d: k + '-01', mo: CP_MON[mo - 1] + ' ' + y }, w({ rng: { a: a0 < wa ? wa : a0, b: b0 > wb ? wb : b0 } }), t + ', ' + CP_MON[mo - 1] + ' ' + y).r;
    });
    rows.forEach(r => { r.mo = r.mo; });
    return { sub: sub(), cols: mcols({ k: 'mo', l: 'Month' }), rows, foot: foot(rows, 'mo', 'Total') };
  } });
  if (m !== 'sold' && o.ci != null && kinds(ep.map(x => x.sv)) > 1) views.push({ id: 'service', label: 'By service', load: async () => {
    const svs = [...new Set(ep.map(x => x.sv))], rows = svs.map(sv => { const q = w({ sv }), n = cpWE(q).length, r = { sv: sv || '–', e: n, _dn: {} }; if (n) r._dn.e = cpWin(Object.assign({}, q, { m: 'sess', t: t + ', ' + (sv || 'service') })); return r; }).sort((a, b) => b.e - a.e);
    return { sub: sub(), cols: [{ k: 'sv', l: 'Service used' }, { k: 'e', l: 'Sessions used', t: 'num' }], rows, foot: { sv: 'Total', e: ep.length } };
  } });
  if (m !== 'sold' && o.ci != null && CP_CR[o.ci].g !== 'mem') views.push({ id: 'used', label: 'Used of bought', load: async () => {
    const c = CP_CR[o.ci], x = cpMeas(Object.assign({}, o, { br: o.br })), st = { n: x.n, e: x.e, ci: o.ci }, u = cpUsedPct(st), dn = {};
    if (x.n) dn.v = cpWin(Object.assign({}, o, { m: 'sold', t: c.n + ', bought' })); const de = (x.e && m === 'both') ? cpWin(Object.assign({}, o, { m: 'sess', t: c.n + ', sessions used' })) : null;   // in a sessions window the same list is the Sessions tab: no repeat
    const rows = [{ s: 'Courses bought', v: x.n, _dn: x.n ? { v: dn.v } : {} }, { s: 'Sessions in one pack (from the name)', v: c.pk || null }, { s: 'Sessions bought', v: c.pk ? x.n * c.pk : null },
      { s: 'Sessions used', v: x.e, _dn: de ? { v: de } : {} }, { s: 'Used of bought', v: u == null ? null : Math.round(u), p: u != null }];
    return { sub: sub(), note: (c.pk ? 'Sessions bought = courses bought × the sessions in one pack, read from the course name. ' : 'The pack size is not in the name, so this course has no "used of bought". ') +
      (u == null && c.pk ? 'Pick All time and UAE Branches in the header to read it: a course can be used at another salon or in a later month. ' : '') + (c.h ? 'Phorest: ' + c.h[0] + ' client courses held, ' + c.h[1] + ' still in use (all time, all salons, counts only). ' : '') + (c.note || ''),
      cols: [{ k: 's', l: 'Worked out' }, { k: 'v', l: 'Figure', t: 'num' }], rows: rows.map(r => ({ s: r.s, v: r.v == null ? '–' : r.p ? r.v + '%' : r.v, _dn: r._dn })) };
  } });
  if (m !== 'sess') views.push({ id: 'sales', label: 'Sales', load: async () => {
    const list = S().slice().sort((a, b) => a.d < b.d ? 1 : a.d > b.d ? -1 : (a.no < b.no ? 1 : -1)), buy = list.filter(x => !x.ref).length, ref = list.length - buy;
    const rows = list.map(s => { const sp1 = cpSaleSpec(s); return { d: s.d, b: cpBrName(s.b), c: cpName(s.ci), no: s.no, a: s.aed, nt: s.ref ? 'Refund' : (s.aed === 0 ? 'No charge' : ''), _dn: { no: sp1, a: sp1 } }; });
    return { sub: sub(), note: 'Tap a sale number to see the sale. Each row is one sale at the till. Client names are not shown on this page.',
      cols: [{ k: 'd', l: 'Date', t: 'date' }, { k: 'b', l: 'Salon' }].concat(o.ci == null ? [{ k: 'c', l: 'Course' }] : [], [{ k: 'no', l: 'Sale no.' }, { k: 'a', l: 'AED paid', t: 'aed' }, { k: 'nt', l: 'Note' }]),
      rows, foot: { d: 'Total: ' + cpPlural(buy, 'sale') + (ref ? ', ' + cpPlural(ref, 'refund') : ''), a: cpR2(cpSum(list, x => x.aed)) } };
  } });
  if (m !== 'sold') views.push({ id: 'sessions', label: 'Sessions', load: async () => {
    const list = E().slice().sort((a, b) => a.d < b.d ? 1 : a.d > b.d ? -1 : (a.no < b.no ? 1 : -1));
    const rows = list.map(e => ({ d: e.d, b: cpBrName(e.b), c: cpName(e.ci), no: e.no, sv: e.sv || '–', _dn: { no: cpSessSpec(e) } }));
    return { sub: sub(), note: 'Tap a visit number to see the session. Each row is one visit that took one session off a course, at AED 0. Client names are not shown on this page.',
      cols: [{ k: 'd', l: 'Date', t: 'date' }, { k: 'b', l: 'Salon' }].concat(o.ci == null ? [{ k: 'c', l: 'Course' }] : [], [{ k: 'no', l: 'Visit no.' }, { k: 'sv', l: 'Service used' }]),
      rows, foot: { d: 'Total: ' + cpPlural(list.length, 'session') } };
  } });
  return { title: t, tip: m === 'sess' ? 'See the sessions' : m === 'sold' ? 'See the sales' : 'See the course', cur: 'AED', views };
}
// A figure that opens its sales or sessions. Zero stays plain (nothing behind it), and so does a figure when drill.js is not on the page.
const cpN = (html, n, o) => (n && typeof TRSD !== 'undefined') ? TRSD.num(html, cpWin(o)) : html;
const cpPh = (html, ci) => typeof TRSD !== 'undefined' ? TRSD.num(html, cpPhWin(ci)) : html;

// One Google Sheets table (sheet-table.js): sort and filter on every heading, and it keeps its filters when the page redraws.
function cpMake(id, rows, cols, total, extra) {
  if (typeof TRSheet === 'undefined' || !document.getElementById(id)) return null;
  const old = cpTs[id];
  const T = TRSheet.table(Object.assign({ id, el: '#' + id, rows: () => rows, cols, total }, extra || {}));
  if (old) { T.f = old.f; T.sort = old.sort; T.page = old.page || 0; T.shown = old.shown || T.shown; T.more = old.more; }
  cpTs[id] = T; T.draw(); return T;
}
const cpPhoneBtn = id => `<button type="button" class="ad-btn ad-phone" data-sxcm="${id}" aria-label="Sort and filter">Sort or filter</button>`;
const cpCol = (k, l, t, raw, disp, cell, x) => ({ k, l, t, raw, disp, cell, x });
const cpBc = n => n ? n : '<span class="ad-zero">–</span>';
const cpTh = (a, b) => `<span class="ad-th ad-ph" aria-hidden="true"><span>${a}</span><em>${b}</em></span>`;

// ── LOAD ────────────────────────────────────────────────────────────────────
async function renderCoursesPerf(force) {
  const el = document.getElementById('coursesPerfContent');
  if (!el || !cpOk()) return;
  if (cpData && !force) { cpPaint(); return; }
  if (cpBusy) return;
  cpBusy = true; cpErr = '';
  el.innerHTML = '<div class="ad-state">Reading the till…</div>';
  try {
    const { data, error } = await sb.rpc('courses_performance');
    if (error || !data || !Array.isArray(data.sales)) throw error || new Error('no report');
    cpData = data; cpPrep();
  } catch (e) { console.error(e); cpErr = 'The report did not load. Press Refresh to try again.'; }
  cpBusy = false;
  cpPaint();
}

// Day, Monday-start week, calendar month or quarter buckets between two ISO dates.
function cpBuckets(a, b, unit) {
  const out = [];
  let d = new Date(a + 'T12:00:00'); const stop = new Date(b + 'T12:00:00');
  if (unit === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  if (unit === 'month') d = new Date(d.getFullYear(), d.getMonth(), 1, 12);
  if (unit === 'quarter') d = new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1, 12);
  const step = unit === 'day' ? [0, 0, 1] : unit === 'week' ? [0, 0, 7] : unit === 'quarter' ? [0, 3, 0] : [0, 1, 0];
  for (let g = 0; d <= stop && g < 400; g++) {
    const nx = new Date(d.getFullYear() + step[0], d.getMonth() + step[1], d.getDate() + step[2], 12);
    out.push({ a: cpIso(d), b: cpIso(new Date(nx.getFullYear(), nx.getMonth(), nx.getDate() - 1, 12)), n: 0, t: 0, e: 0 });
    d = nx;
  }
  return out;
}
function cpBucketLabel(b, unit) {
  if (!b) return '';
  const [y, m] = b.a.split('-').map(Number);
  if (unit === 'quarter') return 'Q' + (Math.floor((m - 1) / 3) + 1) + ' ' + y;
  if (unit === 'month') return CP_MON[m - 1] + ' ' + y;
  if (unit === 'week') return 'Week of ' + cpShort(b.a);
  return cpShort(b.a);
}
function cpAxis(b, unit) {
  const [y, m] = b.a.split('-').map(Number);
  if (unit === 'quarter') return 'Q' + (Math.floor((m - 1) / 3) + 1) + ' ’' + String(y).slice(2);
  if (unit === 'month') return CP_MON[m - 1].slice(0, 3) + ' ’' + String(y).slice(2);
  return cpShort(b.a);
}

// ── PAINT ───────────────────────────────────────────────────────────────────
function cpPaint() {
  const el = document.getElementById('coursesPerfContent');
  if (!el) return;
  const head = `<div class="ad-top"><div><h1 class="ad-t">Courses Performance</h1><p class="ad-sub">${cpData ? 'As of ' + cpEsc(cpWhen(cpData.at)) + '. Phorest sales, the prepaid courses on Phorest’s Courses list. Bought and used are kept apart.' : ''}</p></div>
    <div class="ad-toplinks"><button class="ad-btn" type="button" onclick="renderCoursesPerf(true)">Refresh</button>
    <a class="ad-btn" href="/?view=glowclub" onclick="if(trsPlain(event)){event.preventDefault();showView('glowclub', null)}">Glow Club Performance</a></div></div>`;
  if (cpErr || !cpData) { el.innerHTML = head + `<div class="ad-state">${cpEsc(cpErr || 'No report yet.')}</div>`; cpRail(false); return; }

  const w = cpRange(), packs = CP_CR.slice(0, CP_NC).map((c, i) => cpStat(i)), tm = cpMeas({}), n = tm.n, aed = tm.a, ev = tm.e;
  if (!n && !ev && !tm.rf) {
    const key = cpKey(), named = key && key !== 'Custom' && key !== 'Month' && key !== 'Year';
    el.innerHTML = head + `<section class="ad-card"><div class="ad-empty">No course was bought or used at ${cpEsc(cpBranchLabel())} in ${cpEsc(named ? cpPeriodLabel().toLowerCase() : cpPeriodLabel())}. Courses sold from ${cpEsc(cpDay(cpData.first))} to ${cpEsc(cpDay(cpData.lastSale))}.
      ${key !== 'All time' ? `<button type="button" class="ad-btn" style="margin-left:6px" onclick="document.querySelector('#periodChips .chip[data-v=&quot;All time&quot;]')?.click()">See all time instead</button>` : 'Widen the Branch in the header.'}</div></section>`;
    cpM = null; cpRail(false);
    if (!cpAllOnce && key !== 'All time') { cpAllOnce = true; document.querySelector('#periodChips .chip[data-v="All time"]')?.click(); }
    return;
  }
  cpAllOnce = true;
  const u = cpUsedTot(packs), uok = cpUsedOk();
  const start = w.from > cpData.first ? w.from : cpData.first, last = cpData.lastSess > cpData.lastSale ? cpData.lastSess : cpData.lastSale, end = w.to < last ? w.to : last;
  const span = Math.max(1, Math.round((new Date(end + 'T12:00:00') - new Date(start + 'T12:00:00')) / 864e5) + 1);
  const unit = span <= 31 ? 'day' : span <= 140 ? 'week' : span <= 900 ? 'month' : 'quarter';
  const bk = start <= end ? cpBuckets(start, end, unit) : [];
  bk.forEach(b => { const x = cpMeas({ rng: { a: b.a, b: b.b } }); b.n = x.n; b.t = x.a; b.e = x.e; });
  const bestS = bk.slice().sort((a, b) => b.n - a.n)[0] || { n: 0 }, bestE = bk.slice().sort((a, b) => b.e - a.e)[0] || { e: 0 };
  const top = packs.slice().sort((a, b) => b.a - a.a)[0], topSess = packs.slice().sort((a, b) => b.e - a.e)[0];
  const withSale = packs.filter(s => CP_CR[s.ci].g !== 'old' && s.n > 0).length;
  const brs = CP_BR.map(b => { const x = cpMeas({ br: b[0] }), by = {}; cpWS({ br: b[0] }).forEach(s => { by[s.ci] = (by[s.ci] || 0) + s.aed; });
    const tk = Object.keys(by).sort((p, q) => by[q] - by[p])[0]; return { code: b[0], name: b[1], on: cpCodes().includes(b[0]), n: x.n, a: x.a, e: x.e, top: tk == null ? '' : +tk }; });
  const mem = [24, 25, 26].map(ci => cpStat(ci));
  cpM = { bk, unit, brs, packs, mem, aed, n };
  const dAll = { t: 'Courses bought' }, dSess = { m: 'sess', t: 'Sessions used' };
  const gap = packs.filter(s => { const p = cpUsedPct(s); return p !== null && s.n >= 4; }).sort((a, b) => cpUsedPct(a) - cpUsedPct(b))[0];
  const topB = brs.slice().sort((a, b) => b.a - a.a)[0];
  const unitName = unit;

  let h = head + whyWall([
    ['Why this page', 'Courses are paid for up front and used over months, so a sale and a session are two different things. This page shows which courses sell and which get used.'],
    ['Why now', 'Phorest lists ' + CP_LIST + ' course names. ' + packs.filter(s => CP_CR[s.ci].g === 'list' && !cpStat(s.ci, { br: '*', rng: { a: '0000-01-01', b: '9999-12-31' } }).n).length + ' of the 11 in use have never sold at the till, and ' + CP_PH.use + ' client courses still have sessions left.'],
    ['If we do nothing', 'We keep courses nobody sells on the list, and we cannot see which paid-for sessions clients have not come back to use.']]);
  h += `<section class="ad-card" id="cp-headline"><div class="ad-hero"><div>
      <div class="ad-cap">Courses bought</div><div class="ad-big">${cpN(`${cpMoney(n)} <small>course${n === 1 ? '' : 's'}, ${cpAed(aed)}</small>`, n, dAll)}</div>
      <div class="ad-track"><div class="ad-fill" style="width:${Math.round(withSale / CP_LIST * 100)}%"></div></div>
      <div class="ad-cap">${withSale} of ${CP_LIST} course names on Phorest’s list have a sale in this window · ${cpN(`${cpMoney(ev)} sessions used`, ev, dSess)} in the same window · bought and used are never added together</div></div>
    <div class="ad-pace"><div class="ad-status ${uok ? 'ok' : 'warn'}"><span aria-hidden="true">${uok ? '✓' : '!'}</span>${uok ? 'Used of bought: ' + Math.round(u.pct) + '% of the sessions bought' : 'Used of bought: pick All time and UAE Branches'}</div>
      <div class="ad-row"><span>Best seller</span><b>${top && top.n ? cpEsc(cpName(top.ci)) : '–'}</b></div>
      <div class="ad-row"><span>Most sessions used</span><b>${topSess && topSess.e ? cpEsc(cpName(topSess.ci)) + ', ' + cpMoney(topSess.e) : '–'}</b></div>
      <div class="ad-row"><span>Latest sale</span><b>${tm.last ? cpEsc(cpDay(tm.last)) : '–'}</b></div>
      <div class="ad-row"><span>Latest session</span><b>${cpEsc(cpDay(cpWE({}).reduce((mx, x) => x.d > mx ? x.d : mx, '')) || '–')}</b></div>
      <div class="ad-row"><span>In Phorest, all time</span><b>${cpPh(`${cpMoney(CP_PH.held)} client courses`, null)}, ${cpPh(`${CP_PH.use} in use`, null)}</b></div></div></div></section>`;
  h += `<div class="ad-tiles">${[
    ['Courses bought', cpN(cpMoney(n), n, dAll), 'sales at the till, ' + cpPw(), ''],
    ['AED paid', cpN(cpAed(aed), n, dAll), 'VAT included, refunds taken off', ''],
    ['Sessions used', cpN(cpMoney(ev), ev, dSess), 'visits that took one session off', ''],
    ['Used of bought', uok ? cpN(Math.round(u.pct) + '%', 1, { m: 'both', t: 'Courses' }) : '<span class="ad-zero">n/a</span>', uok ? cpMoney(u.used) + ' of ' + cpMoney(u.sold) + ' sessions bought' : 'pick All time and UAE Branches', ''],
    ['Average course', n ? cpAed(aed / n) : '–', 'AED paid per course bought', '']
  ].map(t => `<div class="ad-tile"><div class="l">${t[0]}</div><div class="v ${t[3]}">${t[1]}</div><div class="h">${t[2]}</div></div>`).join('')}</div>`;
  h += `<p class="ad-sub"><b>What to watch.</b> ${top && top.n ? cpN(cpEsc(cpName(top.ci)), top.n, { ci: top.ci, m: 'both', t: cpName(top.ci) }) + ' brought in ' + cpPc(top.a, aed) + ' of the AED paid. ' : ''}${gap ? cpN(cpEsc(cpName(gap.ci)), gap.n, { ci: gap.ci, m: 'both', t: cpName(gap.ci) }) + ' has used the least of what was bought (' + Math.round(cpUsedPct(gap)) + '%). ' : ''}What is the diary doing for the course clients keep coming back to?</p>`;

  h += `<section class="ad-card" id="cp-time"><h2>Over time</h2><p class="ad-sub">Courses bought, and sessions used, each ${unitName}. Two charts, one scale each. <b>What to watch.</b> ${bestS.n ? `Most bought in ${cpEsc(cpBucketLabel(bestS, unit))} (${cpMoney(bestS.n)}); most used in ${cpEsc(cpBucketLabel(bestE, unit))} (${cpMoney(bestE.e)}). Do the sessions follow the sales a few weeks later?` : 'Nothing was bought in this window.'}</p>
    <h3 class="ad-subh">Courses bought</h3><div class="ad-chart" id="cpChS"></div>
    <h3 class="ad-subh">Sessions used</h3><div class="ad-chart" id="cpChU"></div>
    <details><summary>Show as table</summary><div id="cpTimeTable"></div></details></section>`;
  h += `<section class="ad-card" id="cp-salon"><h2>By salon</h2><p class="ad-sub">Courses bought at each salon. A client can use a course at another salon, so sessions are counted where they were used. Branches outside your header filter are shown faded. Marasy is closed and only has history. Bahrain is its own Phorest business with no course lines. <b>What to watch.</b> ${topB && topB.a ? cpEsc(topB.name) + ' took the most (' + cpAed(topB.a) + ', ' + cpPc(topB.a, aed) + ').' : 'Nothing was bought in this window.'}</p>
    <div class="ad-chart" id="cpBrChart"></div>
    <details><summary>Show as table</summary><div>${cpPhoneBtn('cpbr')}<table id="cpbr"></table></div></details></section>`;
  const rowsBar = packs.filter(s => s.a > 0 || s.n > 0).sort((a, b) => b.a - a.a), mx = Math.max(1, rowsBar.length ? rowsBar[0].a : 1), shown = cpShowAll ? rowsBar : rowsBar.slice(0, 6);
  h += `<section class="ad-card" id="cp-course"><h2>By course</h2><p class="ad-sub">One row per course name at the till. Bought is courses bought; sessions used is the later visits that took one session off. A course that sells but is never used, or one that never sells, tells you what to push or to drop from Phorest. Tap a heading to sort or filter.</p>
    <h3 class="ad-subh">Where the money came from</h3><div class="cp-bars">${shown.map(s => `<div class="cp-fr" tabindex="0" data-ci="${s.ci}"><span class="cp-fn">${cpN(cpEsc(cpName(s.ci)), s.n, { ci: s.ci, m: 'both', t: cpName(s.ci) })}</span>
      <span class="cp-bw"><i style="width:${Math.max(1.5, 100 * s.a / mx)}%"></i></span><span class="cp-fv">${cpN(cpAed(s.a), s.n || s.a, { ci: s.ci, m: 'sold', t: cpName(s.ci) })}<em>${cpN(cpMoney(s.n) + ' bought', s.n, { ci: s.ci, m: 'sold', t: cpName(s.ci) })}</em></span><span class="cp-fs">${cpN(cpMoney(s.e) + ' used', s.e, { ci: s.ci, m: 'sess', t: cpName(s.ci) })}</span></div>`).join('') || '<p class="ad-sub">No course was bought in this window.</p>'}</div>
    ${rowsBar.length > 6 ? `<button type="button" class="ad-btn" style="margin-top:8px" onclick="cpShowAll=!cpShowAll;cpPaint()">${cpShowAll ? 'Show the top 6 only' : 'Show all ' + rowsBar.length + ' courses'}</button>` : ''}
    <div class="cp-bar"><button class="ad-btn" type="button" id="cpMore" onclick="cpToggleMore()">All columns</button>${cpPhoneBtn('cpcr')}<button class="ad-btn" type="button" id="cpClear" hidden onclick="cpClearFilters()">Clear filters</button></div>
    <table id="cpcr"></table>
    <div class="cp-pager"><span id="cpPgTxt"></span><span class="cp-sp"></span><label>Rows <select id="cpPgSel" aria-label="Rows to show"><option>10</option><option>20</option><option>50</option><option>100</option></select></label>
      <button class="ad-btn" type="button" id="cpPrev">‹ Previous</button><span id="cpPgN"></span><button class="ad-btn" type="button" id="cpNext">Next ›</button></div>
    <p class="ad-sub" id="cpHint"></p></section>`;
  h += `<section class="ad-card" id="cp-glow"><h2>Glow Club, apart</h2><p class="ad-sub">Glow Club is a membership, not a pack of sessions. It already has its own page, Glow Club Performance, so it is kept out of every total above. ${cpGlowLine(mem)}</p>
    <div>${cpPhoneBtn('cpmem')}<table id="cpmem"></table></div></section>`;
  h += `<section class="ad-card" id="cp-notraced"><h2>Not traced</h2><p class="ad-sub">What the till cannot show, so a gap is not read as a fact.</p><ul class="ad-list">${cpNotTraced()}</ul>
    <h3 class="ad-subh">Waiting on a word</h3><ol class="ad-ask">
      <li><b>Reception or Kate:</b> the 5+1 Blow-dry for 780 AED course at Motor City (${cpN2(13)} bought since 24 Oct 2025, 3 still in use) is not on Phorest’s Courses list. Was it removed?</li>
      <li><b>Coach Emma:</b> is Blowdry package (Long) 5+1 with Junior stylist the earlier name of Blowdry Package (6+1)? The counts say yes.</li>
      <li><b>Coach Emma:</b> should Eyebrows shape and tint, SPOIL ME ROTTEN and Ultimate Relaxation stay on Phorest if nobody buys them?</li></ol></section>
    <details class="more"><summary>How these numbers are counted</summary>
      <p class="ad-sub">Bought is a sale of the course itself: a till line named exactly like the course, counted once per sale (salon, date and sale number). AED is what the client paid, VAT included; a refund comes off the day it was given and a refunded course still counts once.</p>
      <p class="ad-sub">Sessions used is a later visit with a line named after the course and the service, at AED 0, counted once per visit. Bought and used are different things and are never added together.</p>
      <p class="ad-sub">Used of bought = sessions used ÷ (courses bought × the sessions in one pack, read from the course name). It is an estimate, and only shown on All time with UAE Branches, because a course can be used at another salon or in a later month.</p>
      <p class="ad-sub">Phorest’s Client courses are counts only, read from its Client courses tab on 25 Nov 2026, never names. This page shows no client names and no client numbers. Sale lines are in the dashboard from 2021. Data comes from the daily Phorest Sales Transactions upload, so today’s sales appear after the night’s upload.</p></details>`;
  el.innerHTML = h;
  cpCharts(); cpTables(); cpRail(true);
}
// How many of a course were bought at the till, all time, all salons (for the notes, which do not follow the masthead).
function cpN2(ci) { const x = cpMeas({ ci, br: '*', rng: { a: '0000-01-01', b: '9999-12-31' } }); return cpN(String(x.n), x.n, { ci, m: 'sold', br: '*', rng: { a: '0000-01-01', b: '9999-12-31' }, t: cpName(ci) }); }
function cpGlowLine(mem) {
  const n = cpSum(mem, x => x.n), a = cpSum(mem, x => x.a);
  return n ? `${cpN(cpMoney(n), n, { mem: true, m: 'sold' })} memberships bought for AED ${cpN(cpMoney(a), n, { mem: true, m: 'sold' })} in this window. The page to quote for Glow Club is Glow Club Performance: it also counts renewals. These figures use the course rules and can differ a little.` : 'No Glow Club was bought in this window.';
}
function cpNotTraced() {
  const all = { br: '*', rng: { a: '0000-01-01', b: '9999-12-31' } }, fac = cpMeas(Object.assign({ ci: 0 }, all));
  return [
    [cpTh('Never', 'bought'), '<b>Courses never bought</b> Eyebrows shape and tint, SPOIL ME ROTTEN, Ultimate Relaxation and the two archived ones (AUGUST 15 - 30 PROMOTIONS, blowdry promo) have no sale at the till under their name. Phorest shows one old client course on blowdry promo, from May 2021, before this data starts.'],
    [cpTh('Sessions', 'left'), '<b>Sessions left per client</b> Phorest keeps the sessions left on each client course. We only have the counts of courses in use, so “Used of bought” is an estimate: sessions used divided by sessions bought, from the pack size in the name.'],
    [cpTh('Till', 'v Phorest'), `<b>Till against Phorest</b> Phorest holds ${CP_CR[0].h[0]} Facial of Choice client courses and the till shows ${cpN(String(fac.n), fac.n, Object.assign({ ci: 0, m: 'sold', t: cpName(0) }, all))} sales. Several courses differ by a few. We do not know why, so both are shown side by side.`],
    [cpTh('AED', 'per use'), '<b>Money per session</b> AED is the cash at purchase. A session used is AED 0 at the till, so no price is put on it.'],
    [cpTh('Slide', 'none'), '<b>Slides, none found</b> No course slide was found in the Meta posts held (Instagram, Facebook, TikTok), so the Slide column holds a blank tile until there is one.']
  ].map(x => `<li class="ad-of">${x[0]}<div>${x[1]}</div></li>`).join('');
}

// ── CHARTS (hand-drawn SVG, the Active Deals page's style) ──────────────────
function cpTipHost() {
  const c = document.getElementById('coursesPerfContent');
  let t = document.getElementById('cpTip');
  if (!t && c) { t = document.createElement('div'); t.id = 'cpTip'; t.className = 'ad-tip'; c.appendChild(t); }
  return t;
}
function cpHover(host, selector, fn) {
  const tip = cpTipHost(), box = document.getElementById('coursesPerfContent');
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
function cpBarChart(id, bk, key, color, what, unit) {
  const host = document.getElementById(id); if (!host) return;
  const W = Math.max(300, host.clientWidth), H = 190, L = 40, R = 8, T = 14, B = 28;
  const vmax = Math.max(1, ...bk.map(x => x[key])), nice = v => { const p = Math.pow(10, Math.floor(Math.log10(v))), q = v / p; return (q <= 2 ? 2 : q <= 5 ? 5 : 10) * p; };
  const ymax = nice(vmax), bw = (W - L - R) / Math.max(1, bk.length), Y = v => T + (1 - v / ymax) * (H - T - B);
  const every = Math.max(1, Math.ceil(bk.length / Math.max(1, Math.floor((W - L) / 58))));
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${cpEsc(what)} per ${unit}">`;
  for (let g = 0; g <= 4; g++) { const v = ymax * g / 4; s += `<line class="gl" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ax" x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${Math.round(v)}</text>`; }
  bk.forEach((x, i) => {
    const gap = Math.min(3, bw / 4), bx = L + i * bw + gap, bwi = Math.max(2, bw - gap * 2), hh = Y(0) - Y(x[key]), rr = Math.min(4, hh, bwi / 2);
    if (x[key]) {
      s += `<path d="M${bx} ${Y(0)} v${-(hh - rr)} q0 -${rr} ${rr} -${rr} h${bwi - 2 * rr} q${rr} 0 ${rr} ${rr} v${hh - rr}Z" fill="${color}"/>`;
      if (bw > 22) s += `<text class="ax" x="${bx + bwi / 2}" y="${Y(x[key]) - 5}" text-anchor="middle" style="fill:var(--ink);font-weight:600">${x[key]}</text>`;
    }
    if (i % every === 0) s += `<text class="ax" x="${bx + bwi / 2}" y="${H - 8}" text-anchor="middle">${cpAxis(x, unit)}</text>`;
    s += `<rect x="${L + i * bw}" y="${T}" width="${bw}" height="${H - T - B}" fill="transparent" data-i="${i}"/>`;
  });
  host.innerHTML = s + '</svg>';
  cpHover(host, 'rect[data-i]', i => { const x = bk[i]; return `<b>${cpEsc(cpBucketLabel(x, unit))}</b><br>${key === 'n' ? cpPlural(x.n, 'course') + ' bought · ' + cpAed(x.t) : cpPlural(x.e, 'session') + ' used'}`; });
}
function cpCharts() {
  if (!cpM || !document.getElementById('cpChS')) return;
  const { bk, unit, brs } = cpM;
  cpBarChart('cpChS', bk, 'n', 'var(--series)', 'Courses bought', unit);
  cpBarChart('cpChU', bk, 'e', 'var(--c2)', 'Sessions used', unit);
  cpTimeTbl();
  const host = document.getElementById('cpBrChart'); if (!host) return;
  const W = Math.max(300, host.clientWidth), narrow = W < 460, rowH = 34, rows = brs.filter(r => r.a || r.n || r.e || r.code !== 'MRY'), H2 = rows.length * rowH + 4, L2 = narrow ? 88 : 116, R2 = narrow ? 118 : 150, mx = Math.max(...rows.map(r => r.a)) || 1;
  let s = `<svg viewBox="0 0 ${W} ${H2}" role="img" aria-label="AED paid for courses by salon">`;
  rows.forEach((r, i) => {
    const y = i * rowH + 6, wd = r.a > 0 ? Math.max(4, r.a / mx * (W - L2 - R2)) : 0;
    s += `<g opacity="${r.on ? 1 : .35}"><text class="ax" x="0" y="${y + 15}" style="fill:var(--ink2);font-size:12px">${r.name}</text>`;
    if (wd) s += `<rect x="${L2}" y="${y}" width="${wd}" height="20" rx="4" fill="var(--series)"/>`;
    s += `<text class="ax" x="${L2 + wd + 8}" y="${y + 15}" style="fill:var(--ink);font-size:12px">${cpAed(r.a)} · ${r.n} bought</text></g><rect x="0" y="${y - 5}" width="${W}" height="${rowH}" fill="transparent" data-i="${i}"/>`;
  });
  host.innerHTML = s + '</svg>';
  cpHover(host, 'rect[data-i]', i => { const r = rows[i]; return `<b>${r.name}</b><br>${cpPlural(r.n, 'course')} bought · ${cpAed(r.a)} · ${cpPlural(r.e, 'session')} used<br>${r.top !== '' ? 'Top course: ' + cpEsc(cpName(r.top)) : 'No sales'}`; });
}
window.addEventListener('resize', () => {
  clearTimeout(cpResize);
  cpResize = setTimeout(() => { const v = document.getElementById('view-coursesperf'); if (v && v.offsetParent) cpCharts(); }, 120);
});

// ── THE TABLES, Google Sheets style (sheet-table.js): a menu on every heading ───────────────────────────────────────────────────
function cpTimeTbl() {
  const host = document.getElementById('cpTimeTable'); if (!host || !cpM) return;
  const { bk, unit } = cpM;
  host.innerHTML = cpPhoneBtn('cptm') + '<table id="cptm"></table>';
  const lab = x => cpBucketLabel(x, unit), rg = x => ({ a: x.a, b: x.b }), ttl = x => 'Courses · ' + cpBucketLabel(x, unit);
  cpMake('cptm', bk, [
    { k: 'p', l: unit === 'quarter' ? 'Quarter' : unit === 'month' ? 'Month' : unit === 'week' ? 'Week of' : 'Day', t: 'txt', raw: x => x.a, disp: lab, cell: x => cpEsc(lab(x)) },
    cpCol('n', 'Bought', 'num', x => x.n, x => String(x.n), x => cpN(String(x.n), x.n, { m: 'sold', t: ttl(x), rng: rg(x) })),
    cpCol('a', 'AED paid', 'num', x => x.t, x => cpAed(x.t), x => cpN(cpAed(x.t), x.n, { m: 'sold', t: ttl(x), rng: rg(x) })),
    cpCol('e', 'Sessions used', 'num', x => x.e, x => String(x.e), x => cpN(String(x.e), x.e, { m: 'sess', t: ttl(x), rng: rg(x) }))
  ], rows => ({ p: 'Total', n: cpN(String(cpSum(rows, x => x.n)), cpSum(rows, x => x.n), { m: 'sold', t: 'Courses bought' }), a: cpAed(cpSum(rows, x => x.t)), e: cpN(String(cpSum(rows, x => x.e)), cpSum(rows, x => x.e), { m: 'sess', t: 'Sessions used' }) }));
}
const cpStatTag = c => `<span class="ad-tag ${c.st === 'In use' ? 'ok' : (c.st === 'Not on the list' || c.st === 'Earlier name') ? 'warn' : 'na'}">${cpEsc(c.st)}</span>`;
let cpCrT = null;
function cpToggleMore() { if (!cpCrT) return; cpCrT.toggleMore(); const b = document.getElementById('cpMore'); if (b) b.setAttribute('aria-pressed', !!cpCrT.more); }
function cpClearFilters() { if (cpCrT) { cpCrT.clear(); cpCrT.page = 0; cpCrT.draw(); } }
function cpTables() {
  if (!cpM) return;
  const { brs, packs, mem } = cpM, aedAll = cpM.aed;
  cpMake('cpbr', brs.filter(b => b.a || b.n || b.e || b.code !== 'MRY'), [
    { k: 'name', l: 'Salon', t: 'txt', raw: b => b.name, disp: b => b.name, cell: b => cpEsc(b.name) },
    cpCol('n', 'Bought', 'num', b => b.n, b => String(b.n), b => cpN(String(b.n), b.n, { br: b.code, m: 'sold', t: b.name })),
    cpCol('a', 'AED paid', 'num', b => b.a, b => cpAed(b.a), b => cpN(cpAed(b.a), b.n, { br: b.code, m: 'sold', t: b.name })),
    cpCol('e', 'Sessions used', 'num', b => b.e, b => String(b.e), b => cpN(String(b.e), b.e, { br: b.code, m: 'sess', t: b.name })),
    cpCol('s', 'Share of AED', 'num', b => aedAll ? b.a / aedAll : 0, b => cpPc(b.a, aedAll), b => cpPc(b.a, aedAll)),
    { k: 'top', l: 'Top course here', t: 'txt', raw: b => b.top === '' ? '' : cpName(b.top), disp: b => b.top === '' ? '–' : cpName(b.top), cell: b => b.top === '' ? '–' : cpEsc(cpName(b.top)) }
  ], rows => { const n = cpSum(rows, b => b.n), e = cpSum(rows, b => b.e); return { name: 'Total', n: cpN(String(n), n, { m: 'sold', t: 'Courses bought' }), a: cpAed(cpSum(rows, b => b.a)), e: cpN(String(e), e, { m: 'sess', t: 'Sessions used' }) }; }, { rowCls: b => b.on ? '' : 'ad-off' });

  const all = { br: '*', rng: { a: '0000-01-01', b: '9999-12-31' } };
  cpCrT = cpMake('cpcr', packs, [
    { k: 'pic', l: 'Slide', t: 'txt', raw: () => 'No slide', disp: () => 'No slide', cell: () => cpTh('No', 'slide') },
    { k: 'nm', l: 'Course', t: 'txt', raw: s => cpName(s.ci), disp: s => cpName(s.ci), cell: s => { const c = CP_CR[s.ci]; return `${cpN(cpEsc(c.n), s.n || s.e, { ci: s.ci, m: 'both', t: c.n })}<small>${c.p ? 'AED ' + cpMoney(c.p) : 'price varied'}${c.pk ? ' · ' + c.pk + ' sessions' : ''}</small>`; } },
    { k: 'st', l: 'Phorest', t: 'txt', raw: s => CP_CR[s.ci].st, disp: s => CP_CR[s.ci].st, cell: s => cpStatTag(CP_CR[s.ci]) },
    cpCol('n', 'Bought', 'num', s => s.n, s => String(s.n), s => s.n ? cpN(String(s.n), s.n, { ci: s.ci, m: 'sold', t: cpName(s.ci) }) : cpBc(0)),
    cpCol('a', 'AED paid', 'num', s => s.a, s => cpAed(s.a), s => (s.n || s.a) ? cpN(cpAed(s.a), 1, { ci: s.ci, m: 'sold', t: cpName(s.ci) }) : cpBc(0)),
    cpCol('e', 'Sessions used', 'num', s => s.e, s => String(s.e), s => s.e ? cpN(String(s.e), s.e, { ci: s.ci, m: 'sess', t: cpName(s.ci) }) : cpBc(0)),
    { k: 'u', l: 'Used of bought', sub: 'all time', t: 'num', raw: s => { const p = cpUsedPct(s); return p === null ? -1 : p; }, disp: s => { const p = cpUsedPct(s); return p === null ? '–' : Math.round(p) + '%'; }, cell: s => { const p = cpUsedPct(s); return p === null ? '<span class="ad-zero">–</span>' : cpN(Math.round(p) + '%', 1, { ci: s.ci, m: 'both', t: cpName(s.ci) }); } },
    cpCol('pr', 'Phorest price (AED)', 'num', s => CP_CR[s.ci].p || 0, s => CP_CR[s.ci].p ? cpMoney(CP_CR[s.ci].p) : '–', s => CP_CR[s.ci].p ? cpMoney(CP_CR[s.ci].p) : '–', 1),
    cpCol('av', 'Average paid (AED)', 'num', s => s.n ? s.a / s.n : 0, s => s.n ? cpMoney(s.a / s.n) : '–', s => s.n ? cpN(cpMoney(s.a / s.n), 1, { ci: s.ci, m: 'sold', t: cpName(s.ci) }) : '–', 1),
    cpCol('pk', 'Sessions in pack', 'num', s => CP_CR[s.ci].pk || 0, s => CP_CR[s.ci].pk ? String(CP_CR[s.ci].pk) : '–', s => CP_CR[s.ci].pk ? String(CP_CR[s.ci].pk) : '–', 1),
    { k: 'fs', l: 'First sale', x: 1, t: 'txt', raw: s => s.first, disp: s => s.first ? cpDay(s.first) : '–', cell: s => s.first ? cpDay(s.first) : '–' },
    { k: 'ls', l: 'Last sale', x: 1, t: 'txt', raw: s => s.last, disp: s => s.last ? cpDay(s.last) : '–', cell: s => s.last ? cpDay(s.last) : '–' },
    cpCol('hd', 'In Phorest, all time', 'num', s => CP_CR[s.ci].h ? CP_CR[s.ci].h[0] : -1, s => CP_CR[s.ci].h ? String(CP_CR[s.ci].h[0]) : '–', s => CP_CR[s.ci].h && CP_CR[s.ci].h[0] ? cpPh(String(CP_CR[s.ci].h[0]), s.ci) : (CP_CR[s.ci].h ? '0' : '–'), 1),
    cpCol('iu', 'Still in use', 'num', s => CP_CR[s.ci].h ? CP_CR[s.ci].h[1] : -1, s => CP_CR[s.ci].h ? String(CP_CR[s.ci].h[1]) : '–', s => CP_CR[s.ci].h && CP_CR[s.ci].h[1] ? cpPh(String(CP_CR[s.ci].h[1]), s.ci) : (CP_CR[s.ci].h ? '0' : '–'), 1)
  ], rows => { const n = cpSum(rows, s => s.n), e = cpSum(rows, s => s.e); return { nm: 'Total of ' + rows.length + ' courses', n: cpN(String(n), n, { m: 'sold', t: 'Courses bought' }), a: cpAed(cpSum(rows, s => s.a)), e: cpN(String(e), e, { m: 'sess', t: 'Sessions used' }) }; },
  { limit: 10, after: (T, rows, allr) => {
    const pages = T.pages(rows.length), from = rows.length ? T.page * T.shown + 1 : 0, to = Math.min(rows.length, (T.page + 1) * T.shown), g = id => document.getElementById(id);
    if (g('cpPgTxt')) g('cpPgTxt').textContent = from + ' to ' + to + ' of ' + rows.length + ' courses';
    if (g('cpPrev')) g('cpPrev').disabled = T.page <= 0; if (g('cpNext')) g('cpNext').disabled = T.page >= pages - 1; if (g('cpPgN')) g('cpPgN').textContent = 'Page ' + (T.page + 1) + ' of ' + pages;
    if (g('cpClear')) g('cpClear').hidden = !T.active(); if (g('cpPgSel')) g('cpPgSel').value = String(T.shown);
  } });
  const g = id => document.getElementById(id);
  if (cpCrT) {
    if (g('cpPrev')) g('cpPrev').onclick = () => { cpCrT.page = Math.max(0, cpCrT.page - 1); cpCrT.draw(); };
    if (g('cpNext')) g('cpNext').onclick = () => { cpCrT.page++; cpCrT.draw(); };
    if (g('cpPgSel')) g('cpPgSel').onchange = e => { cpCrT.shown = +e.target.value; cpCrT.page = 0; cpCrT.draw(); };
    if (g('cpMore')) g('cpMore').setAttribute('aria-pressed', !!cpCrT.more);
  }
  const never = packs.filter(s => CP_CR[s.ci].g === 'list' && !cpMeas(Object.assign({ ci: s.ci }, all)).n).length, hint = g('cpHint');
  if (hint) hint.textContent = 'Phorest lists ' + CP_LIST + ' course names (11 in use, 2 archived). ' + never + ' of the 11 in use have never been bought at the till. 11 more names sold at the till are not on that list now, so they show as “Not on the list”. There is no slide for any course yet.';
  cpMake('cpmem', mem, [
    { k: 'nm', l: 'Tier', t: 'txt', raw: s => cpName(s.ci), disp: s => cpName(s.ci), cell: s => `${cpN(cpEsc(cpName(s.ci)), s.n || s.e, { ci: s.ci, m: 'both', t: cpName(s.ci) })}<small>AED ${cpMoney(CP_CR[s.ci].p)} in Phorest</small>` },
    cpCol('n', 'Bought', 'num', s => s.n, s => String(s.n), s => s.n ? cpN(String(s.n), s.n, { ci: s.ci, m: 'sold', t: cpName(s.ci) }) : cpBc(0)),
    cpCol('a', 'AED paid', 'num', s => s.a, s => cpAed(s.a), s => (s.n || s.a) ? cpN(cpAed(s.a), 1, { ci: s.ci, m: 'sold', t: cpName(s.ci) }) : cpBc(0)),
    cpCol('e', 'Perks used', 'num', s => s.e, s => String(s.e), s => s.e ? cpN(String(s.e), s.e, { ci: s.ci, m: 'sess', t: cpName(s.ci) }) : cpBc(0)),
    cpCol('hd', 'In Phorest, all time', 'num', s => CP_CR[s.ci].h[0], s => String(CP_CR[s.ci].h[0]), s => cpPh(String(CP_CR[s.ci].h[0]), s.ci), 1),
    cpCol('iu', 'Still in use', 'num', s => CP_CR[s.ci].h[1], s => String(CP_CR[s.ci].h[1]), s => CP_CR[s.ci].h[1] ? cpPh(String(CP_CR[s.ci].h[1]), s.ci) : '0', 1)
  ], rows => { const n = cpSum(rows, s => s.n), e = cpSum(rows, s => s.e); return { nm: 'Glow Club', n: cpN(String(n), n, { mem: true, m: 'sold', t: 'Glow Club' }), a: cpAed(cpSum(rows, s => s.a)), e: cpN(String(e), e, { mem: true, m: 'sess', t: 'Glow Club perks used' }) }; }, { limit: 9999 });
}

// ── ON THIS PAGE rail (the same shell as Active Deals Performance's) ────────
const CP_RAIL = [['cp-headline', 'Headline'], ['cp-time', 'Over time'], ['cp-salon', 'By salon'], ['cp-course', 'By course'], ['cp-glow', 'Glow Club, apart'], ['cp-notraced', 'Not traced']];
function cpRail(on) {
  const shell = document.getElementById('cpShell'), side = document.getElementById('cpSide');
  if (!shell || !side) return;
  shell.classList.toggle('rv-norail', !on);
  const nav = side.querySelector('.side-nav');
  if (nav && on && !nav.dataset.sig) {
    nav.dataset.sig = '1';
    nav.innerHTML = '<div class="side-k">On this page</div>' + CP_RAIL.map(r => `<a href="#${r[0]}" onclick="lgJump(event,'${r[0]}')">${r[1]}</a>`).join('');
  }
  if (typeof spy === 'function') spy();
}
