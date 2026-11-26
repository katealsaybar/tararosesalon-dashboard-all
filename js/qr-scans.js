// QR Scans (Kate, 26 Nov 2026): which saved short codes clients really scan, and a way to keep our own scans out of the client numbers. Built from the local mockup
// docs/mockups/qr-scans.html in the dashboard's own pieces. Numbers from qr_scans_list() (migrations/qr_scans_page.sql, Level 2 and above, UI Level 3): the short codes,
// every scan (time, phone, bot or not, mark), the test windows. No name and no IP is kept, so the page cannot tell a staff scan from a client's. Three tools keep ours out:
// Test mode (15 minutes, qr_go marks every scan inside it), That was me (whoever saved the code, or Level 5) and Count from (Level 5). A scan counts as a client when it is
// not a bot, is not marked, and is on or after Count from. Fetched once and filtered here, so a Branch or Period change in the masthead redraws at once.
// Self-contained: it needs sb, TRS_LEVEL, sel, dateFrom, dateTo, activePeriodKey(), dateToIso(), TRSD (drill.js), TRSheet (sheet-table.js), whyWall().
const QS_BR = [['KCA', 'Khalifa City A'], ['SAA', 'Saadiyat'], ['MC', 'Motor City'], ['AQ', 'Al Quoz']];
const QS_MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const QS_STW = { C: 'Counted', T: 'Test', B: 'Bot', X: 'Before counting', L: 'Left out' };
const QS_DEV = { ios: 'iPhone', android: 'Android', desktop: 'Computer', other: 'Other' };
const QS_DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
let qsData = null, qsErr = '', qsBusy = false, qsM = null, qsResize = null, qsTs = {}, qsVW = 'C', qsDM = 'dev', qsTmTimer = null, qsUndo = null;

const qsEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const qsN = n => Math.round(Number(n) || 0).toLocaleString('en-GB');
const qsPc = (a, b) => b ? (Math.round(a / b * 1000) / 10) + '%' : '0%';
const qsPlural = (n, a, b) => n + ' ' + (n === 1 ? a : (b || a + 's'));
const qsOk = () => typeof TRS_LEVEL !== 'undefined' && TRS_LEVEL >= 2;
// Dubai time (UTC+4, no daylight saving): the day, hour and weekday a scan belongs to.
const qsLoc = ms => new Date(ms + 4 * 36e5);
const qsIso = ms => qsLoc(ms).toISOString().slice(0, 10);
const qsHour = ms => qsLoc(ms).getUTCHours();
const qsDow = ms => qsLoc(ms).getUTCDay();
const qsHm = ms => { const d = qsLoc(ms); return ('0' + d.getUTCHours()).slice(-2) + ':' + ('0' + d.getUTCMinutes()).slice(-2); };
const qsDay = iso => { try { return new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return iso || ''; } };
const qsShort = iso => { try { return new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); } catch (e) { return iso || ''; } };
const qsWhen = ms => qsDay(qsIso(ms)) + ', ' + qsHm(ms);
const qsHrLab = h => { const x = ('0' + h).slice(-2); return x + ':00 to ' + x + ':59'; };
const qsBrName = c => c === 'all' ? 'All salons' : (QS_BR.find(b => b[0] === c) || [c, c])[1];
const qsDevName = d => QS_DEV[d] || 'Other';
const qsAddr = c => 'go.trk-salon-os.com/' + c.slug;

// ── THE MASTHEAD'S FILTERS ──────────────────────────────────────────────────
const qsAllSel = () => typeof sel === 'undefined' || !sel.branch || sel.branch.includes('all');
const qsCodeIn = c => qsAllSel() || sel.branch.includes(c.branch);
function qsBranchLabel() {
  if (qsAllSel()) return 'UAE Branches';
  const c = QS_BR.filter(b => sel.branch.includes(b[0]));
  return c.length ? c.map(b => b[1]).join(' + ') : sel.branch.join(' + ');
}
function qsRange() {
  const from = typeof dateFrom !== 'undefined' && dateFrom ? dateToIso(dateFrom) : '0000-01-01';
  const to = typeof dateTo !== 'undefined' && dateTo ? dateToIso(dateTo) : '9999-12-31';
  return { from, to };
}
function qsPeriodLabel() {
  const key = typeof activePeriodKey === 'function' ? activePeriodKey() : '';
  if (key && key !== 'Custom' && key !== 'Month' && key !== 'Year') return key;
  const r = qsRange();
  return r.from === r.to ? qsDay(r.from) : qsDay(r.from) + ' to ' + qsDay(r.to);
}

// ── THE SCANS ───────────────────────────────────────────────────────────────
function qsPrep() {
  qsData.cmap = {}; (qsData.codes || []).forEach(c => { qsData.cmap[c.id] = c; });
  qsData.sc = (qsData.scans || []).map(r => ({ id: r.id, c: r.code_id, t: Date.parse(r.t), dev: r.device, bot: !!r.bot, mark: r.mark || null, by: r.by || '', win: r.win == null ? null : r.win }))
    .filter(s => qsData.cmap[s.c]);
  qsData.sc.forEach(s => { s.ld = qsIso(s.t); });
  qsData.first = qsData.sc.reduce((m, s) => !m || s.ld < m ? s.ld : m, '');
}
// C counted (a client), T test (ours), B bot, X from before counting began
const qsSk = s => s.bot ? 'B' : s.mark ? 'T' : (qsData && qsData.count_from && s.ld < qsData.count_from) ? 'X' : 'C';
const qsWhy = s => { const k = qsSk(s); return k === 'B' ? 'Looked like a bot' : k === 'T' ? (s.mark === 'win' ? 'Test mode, ' + s.by : 'Marked as theirs by ' + s.by) : k === 'X' ? 'Before counting began' : ''; };
const qsPill = k => `<span class="qs-st ${k.toLowerCase()}">${QS_STW[k]}</span>`;
// o = { st: 'C'|'T'|'B'|'X'|'L'|null (default: the Show choice), rng: {a, b} (default: the masthead's period), anyb: ignore the masthead's Branch, code, codes, sal, dev, hr, dow, win }
function qsVl(o) {
  o = o || {}; const w = qsRange(), a = o.rng ? o.rng.a : w.from, b = o.rng ? o.rng.b : w.to, st = o.st !== undefined ? o.st : (qsVW === 'all' ? null : qsVW);
  return (qsData ? qsData.sc : []).filter(s => {
    if (s.ld < a || s.ld > b) return false;
    const c = qsData.cmap[s.c]; if (!o.anyb && !qsCodeIn(c)) return false;
    const k = qsSk(s);
    if (st === 'L') { if (k === 'C') return false; } else if (st && k !== st) return false;
    if (o.code != null && s.c !== o.code) return false;
    if (o.codes && !o.codes.includes(s.c)) return false;
    if (o.sal != null && c.branch !== o.sal) return false;
    if (o.dev && s.dev !== o.dev) return false;
    if (o.hr != null && qsHour(s.t) !== o.hr) return false;
    if (o.dow != null && qsDow(s.t) !== o.dow) return false;
    if (o.win != null && s.win !== o.win) return false;
    return true;
  });
}
const qsCodesIn = () => (qsData ? qsData.codes : []).filter(qsCodeIn);
const qsDistinct = rs => new Set(rs.map(s => s.c)).size;

// ── CLICKABLE FIGURES: every count opens the scans behind it, and a figure inside a window opens the next step down, to one scan ───────────
function qsScope(o) {
  const st = o.st !== undefined ? o.st : (qsVW === 'all' ? null : qsVW), w = qsRange(), p = [];
  if (st) p.push(QS_STW[st].toLowerCase());
  const a = o.rng ? o.rng.a : w.from, b = o.rng ? o.rng.b : w.to;
  p.push(o.rng ? (a === b ? qsDay(a) : qsDay(a) + ' to ' + qsDay(b)) : qsPeriodLabel());
  p.push(o.anyb ? 'UAE Branches' : qsBranchLabel());
  return p.join(' · ');
}
function qsWhat(o) {
  const x = [];
  if (o.code != null) x.push('on ' + qsData.cmap[o.code].name);
  if (o.sal != null) x.push('at ' + qsBrName(o.sal));
  if (o.dev) x.push('on ' + qsDevName(o.dev));
  if (o.hr != null) x.push('between ' + qsHrLab(o.hr).replace(' to ', ' and '));
  if (o.dow != null) x.push('on a ' + QS_DOW[o.dow]);
  return x.join(' ');
}
function qsScanSpec(s) {
  const c = qsData.cmap[s.c], k = qsSk(s);
  const steps = [['Code', c.name], ['Short address', qsAddr(c)], ['Salon', qsBrName(c.branch)], ['Phone', qsDevName(s.dev)], ['Status', QS_STW[k]], ['Why', qsWhy(s) || 'Counted as a client']];
  return { title: 'One scan, ' + qsWhen(s.t), tip: 'See the scan', views: [{ id: 'scan', label: 'The scan', load: async () => ({
    sub: c.name + ' · ' + qsBrName(c.branch) + ' · ' + qsDevName(s.dev) + ' · ' + QS_STW[k],
    note: 'This is the last step: one scan has nothing behind it.' + (k === 'C' ? ' To keep it out of the client numbers, tap That was me under Latest scans.' : ''),
    cols: [{ k: 's', l: 'What' }, { k: 'd', l: 'Detail' }], rows: steps.map(x => ({ s: x[0], d: x[1] })) }) }] };
}
function qsWin(o) {
  if (typeof TRSD === 'undefined' || !qsData) return null;
  const t = o.t || 'QR scans', rs0 = () => qsVl(o), w = p => Object.assign({}, o, p), CAP = 500;
  const sub = () => { const rs = rs0(); return qsScope(o) + ' · ' + qsPlural(rs.length, 'scan') + ' · ' + qsPlural(qsDistinct(rs), 'code'); };
  const views = [{ id: 'scans', label: 'Scans', load: async () => {
    const list = rs0().slice().sort((a, b) => b.t - a.t), cs = o.code == null;
    return { sub: sub(), note: 'Tap a time to see one scan' + (cs ? ', or a code to see its scans.' : '.') + (list.length > CAP ? ' Showing the latest ' + CAP + ' of ' + qsN(list.length) + '.' : ''),
      cols: [{ k: 't', l: 'When' }, { k: 'c', l: 'Code' }, { k: 'b', l: 'Salon' }, { k: 'd', l: 'Phone' }, { k: 's', l: 'Status' }],
      rows: list.slice(0, CAP).map(s => { const c = qsData.cmap[s.c]; return { t: qsWhen(s.t), c: c.name, b: qsBrName(c.branch), d: qsDevName(s.dev), s: QS_STW[qsSk(s)], _dn: { t: qsScanSpec(s), c: cs ? qsWin(w({ code: s.c, t: c.name })) : null } }; }),
      foot: { t: 'Total: ' + qsPlural(list.length, 'scan') } };
  } }];
  if (o.code == null) views.push({ id: 'codes', label: 'Codes', load: async () => {
    const m = {}; rs0().forEach(s => { const c = m[s.c] || (m[s.c] = { id: s.c, n: 0, last: 0 }); c.n++; c.last = Math.max(c.last, s.t); });
    const list = Object.values(m).sort((a, b) => b.n - a.n || b.last - a.last), sp = c => qsWin(w({ code: c.id, t: qsData.cmap[c.id].name }));
    return { sub: sub(), cols: [{ k: 'c', l: 'Code' }, { k: 'b', l: 'Salon' }, { k: 'n', l: 'Scans', t: 'num' }, { k: 'l', l: 'Last scan' }],
      rows: list.map(c => { const cc = qsData.cmap[c.id]; return { c: cc.name, b: qsBrName(cc.branch), n: c.n, l: qsWhen(c.last), _dn: { c: sp(c), n: sp(c) } }; }),
      foot: { c: 'Total: ' + qsPlural(list.length, 'code'), n: list.reduce((a, c) => a + c.n, 0) } };
  } });
  if (o.cf && views.length > 1) views.reverse();   // a figure that counts CODES opens on the Codes tab, so its list adds up to the figure
  return { title: (t + ' ' + qsWhat(o)).trim(), tip: o.cf ? 'See the codes' : 'See the scans', views };
}
// Codes with no counted scan in this window: one row each, nothing behind them.
function qsNoneWin() {
  if (typeof TRSD === 'undefined' || !qsData) return null;
  const list = () => { const seen = new Set(qsVl({ st: 'C' }).map(s => s.c)); return qsCodesIn().filter(c => !seen.has(c.id)); };
  return { title: 'Codes with no counted scan', tip: 'See the codes', views: [{ id: 'none', label: 'Codes', load: async () => ({
    sub: qsBranchLabel() + ' · ' + qsPeriodLabel() + ' · ' + qsPlural(list().length, 'code'), note: 'A code with no scans may simply not have been handed out yet.',
    cols: [{ k: 'c', l: 'Code' }, { k: 'b', l: 'Salon' }, { k: 'a', l: 'Short address' }], rows: list().map(c => ({ c: c.name, b: qsBrName(c.branch), a: qsAddr(c) })), foot: { c: 'Total: ' + qsPlural(list().length, 'code') } }) }] };
}
// A figure that opens its scans. Zero stays plain (nothing behind it), and so does a figure when drill.js is not on the page.
const qsF = (html, n, o) => (n && typeof TRSD !== 'undefined') ? TRSD.num(html, qsWin(o)) : html;

// One Google Sheets table (sheet-table.js): sort and filter on every heading, and it keeps its filters when the page redraws.
function qsMake(id, rows, cols, total, extra) {
  if (typeof TRSheet === 'undefined' || !document.getElementById(id)) return null;
  const old = qsTs[id];
  const T = TRSheet.table(Object.assign({ id, el: '#' + id, rows: () => rows, cols, total }, extra || {}));
  if (old) { T.f = old.f; T.sort = old.sort; T.shown = old.shown; }
  qsTs[id] = T; T.draw(); return T;
}
const qsPhoneBtn = id => `<button type="button" class="ad-btn ad-phone" data-sxcm="${id}" aria-label="Sort and filter">Sort or filter</button>`;
const qsCol = (k, l, t, raw, disp, cell, x) => ({ k, l, t, raw, disp, cell, x });
const qsZero = n => n ? n : '<span class="ad-zero">–</span>';
function qsPager(host, T, rows, what) {
  const el = document.getElementById(host); if (!el) return;
  const n = rows.length, pgs = T.pages(n), from = n ? T.page * T.shown + 1 : 0, to = Math.min(n, (T.page + 1) * T.shown);
  el.innerHTML = `<span>${from} to ${to} of ${n} ${what}</span><span class="qs-sp"></span><label>Rows <select data-qs-rows="${T.id}" aria-label="Rows to show">${[10, 20, 50, 100].map(v => `<option value="${v}"${T.shown === v ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
    <button type="button" class="ad-btn" data-qs-pg="${T.id}:-1"${T.page <= 0 ? ' disabled' : ''}>‹ Previous</button><span>Page ${T.page + 1} of ${pgs}</span><button type="button" class="ad-btn" data-qs-pg="${T.id}:1"${T.page >= pgs - 1 ? ' disabled' : ''}>Next ›</button>`;
}

// ── LOAD ────────────────────────────────────────────────────────────────────
async function renderQrScans(force) {
  const el = document.getElementById('qrScansContent');
  if (!el || !qsOk()) return;
  if (qsData && !force) { qsPaint(); return; }
  if (qsBusy) return;
  qsBusy = true; qsErr = '';
  if (!qsData) el.innerHTML = '<div class="ad-state">Reading the scans…</div>';
  try {
    const { data, error } = await sb.rpc('qr_scans_list', { p_from: null, p_to: null });
    if (error || !data || data.denied || !Array.isArray(data.scans)) throw error || new Error(data && data.denied ? 'Level 2 and above' : 'no report');
    qsData = data; qsPrep();
  } catch (e) { console.error(e); qsErr = 'The scans did not load. Press Refresh to try again.'; }
  qsBusy = false;
  qsPaint();
  clearTimeout(qsTmTimer);
  if (qsData && qsData.active) qsTmTimer = setTimeout(() => renderQrScans(true), Math.max(1000, Date.parse(qsData.active.to) - Date.now() + 1500));
}

// Day, Monday-start week or calendar month buckets between two ISO dates.
function qsBuckets(a, b, unit) {
  const out = [], iso = d => dateToIso(d);
  let d = new Date(a + 'T12:00:00'); const stop = new Date(b + 'T12:00:00');
  if (unit === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  if (unit === 'month') d = new Date(d.getFullYear(), d.getMonth(), 1, 12);
  const step = unit === 'day' ? [0, 0, 1] : unit === 'week' ? [0, 0, 7] : [0, 1, 0];
  for (let g = 0; d <= stop && g < 400; g++) {
    const nx = new Date(d.getFullYear() + step[0], d.getMonth() + step[1], d.getDate() + step[2], 12);
    out.push({ a: iso(d), b: iso(new Date(nx.getFullYear(), nx.getMonth(), nx.getDate() - 1, 12)), n: 0, l: 0 });
    d = nx;
  }
  return out;
}
function qsBucketLabel(b, unit) {
  if (!b) return '';
  const [y, m] = b.a.split('-').map(Number);
  if (unit === 'month') return QS_MON[m - 1] + ' ' + y;
  if (unit === 'week') return 'Week of ' + qsShort(b.a);
  return qsShort(b.a);
}
const qsAxis = (b, unit) => { const [y, m] = b.a.split('-').map(Number); return unit === 'month' ? QS_MON[m - 1].slice(0, 3) : qsShort(b.a); };

// ── PAINT ───────────────────────────────────────────────────────────────────
function qsPaint() {
  const el = document.getElementById('qrScansContent');
  if (!el) return;
  const head = `<div class="ad-top"><div><h1 class="ad-t">QR Scans</h1><p class="ad-sub">${qsData ? 'Which stylist cards clients really scan. A scan counts when a phone opens a short code, except bots and the scans we make ourselves.' : ''}</p></div>
    <div class="ad-toplinks"><button class="ad-btn" type="button" onclick="renderQrScans(true)">Refresh</button>
    <a class="ad-btn" href="/?view=qrmaker" onclick="if(trsPlain(event)){event.preventDefault();showView('qrmaker', null)}">QR Code Maker</a></div></div>`;
  if (qsErr || !qsData) { el.innerHTML = head + `<div class="ad-state">${qsEsc(qsErr || 'No report yet.')}</div>`; qsRail(false); return; }

  const codes = qsCodesIn(), w = qsRange();
  const cn = qsVl({ st: 'C' }), n = cn.length, nc = qsDistinct(cn), t = qsVl({ st: 'T' }).length, b = qsVl({ st: 'B' }).length, x = qsVl({ st: 'X' }).length, left = t + b + x;
  const cur = qsVl(), curN = cur.length, none = codes.filter(c => !cn.some(s => s.c === c.id)).length;
  const all = qsData.sc.length;
  const start = w.from > (qsData.first || '9999') ? w.from : qsData.first, end = w.to;
  if (!all) {
    el.innerHTML = head + `<section class="ad-card"><div class="ad-empty">No scan has been recorded yet. ${codes.length} short codes are saved and waiting for the first one. Scan one yourself with Test mode on and it will show here, left out of the client numbers.</div></section>`
      + qsOwnCard(); qsM = null; qsRail(false); return;
  }
  const lastIso = end < qsIso(Date.now()) ? end : qsIso(Date.now()), span = Math.max(1, Math.round((new Date(lastIso + 'T12:00:00') - new Date(start + 'T12:00:00')) / 864e5) + 1);
  const unit = span <= 31 ? 'day' : span <= 140 ? 'week' : 'month';
  const bk = qsBuckets(start, lastIso < start ? start : lastIso, unit);
  const showC = qsVW === 'C' || qsVW === 'all', showL = qsVW !== 'C', lst = qsVW === 'all' || qsVW === 'L' ? 'L' : qsVW;
  bk.forEach(k => { const r = { a: k.a, b: k.b }; k.n = showC ? qsVl({ st: 'C', rng: r }).length : 0; k.l = showL ? qsVl({ st: lst, rng: r }).length : 0; });
  const busy = bk.slice().sort((p, q) => (q.n + q.l) - (p.n + p.l))[0];
  qsM = { bk, unit, showC, showL };
  const dC = { st: 'C', t: 'Counted scans' }, dL = { st: 'L', t: 'Left out scans' };

  let h = head + whyWall([
    ['Why this page', 'A printed card cannot tell us whether anyone scans it. These counts show which stylist cards clients actually use, and which are still in a drawer.'],
    ['Why now', 'The saved codes are made and the cards are about to be printed. Every test scan we make before and after must stay out of the client numbers.'],
    ['If we do nothing', 'Our own check scans get counted as clients, so a card looks busy when nobody has used it, and we reprint the wrong ones.']]);
  h += `<section class="ad-card" id="qs-headline"><h2>The numbers</h2><p class="ad-sub"><b>What to watch.</b> ${none ? (typeof TRSD !== 'undefined' ? TRSD.num(qsPlural(none, 'code has', 'codes have'), qsNoneWin()) : qsPlural(none, 'code has', 'codes have')) + ' no counted scan yet. Is the card at the front desk, or still in a drawer?' : 'Every code in this pick has been scanned at least once.'}</p>
    <div class="qs-seg" role="group" aria-label="Show"><span class="qs-lbl">Show</span>${[['C', 'Counted'], ['L', 'Left out'], ['all', 'All scans']].map(v => `<button type="button" class="ad-btn" data-qs-vw="${v[0]}" aria-pressed="${qsVW === v[0]}">${v[1]}</button>`).join('')}</div>
    <div class="ad-tiles">${[
      [qsVW === 'C' ? 'Counted scans' : qsVW === 'all' ? 'All scans' : 'Scans shown', qsF(qsN(curN), curN, {}), 'a phone opening a code'],
      ['Codes scanned', qsF(qsN(qsDistinct(cur)), curN, { cf: 1 }) + ` <small style="font-family:var(--sans);font-size:13px;color:var(--muted);font-weight:500">of ${codes.length}</small>`, 'codes with at least one scan'],
      ['Scans a code', codes.length ? (curN / codes.length).toFixed(1) : '0.0', 'scans ÷ ' + codes.length + ' codes'],
      ['Left out', qsF(qsN(left), left, dL), 'tests, bots and early scans']
    ].map(k => `<div class="ad-tile"><div class="l">${k[0]}</div><div class="v">${k[1]}</div><div class="h">${k[2]}</div></div>`).join('')}</div>
    <div class="qs-arl">${[['C', 'Counted', 'clients', n], ['T', 'Test scans', 'ours', t], ['B', 'Bots', 'link previews and checkers', b], ['X', 'Before counting', 'from ' + qsDay(qsData.count_from), x]].map(r => {
      const tot = n + t + b + x, mx = Math.max(n, t, b, x, 1);
      return `<div class="qs-ar${qsVW === r[0] ? ' on' : ''}"><button type="button" class="qs-an" data-qs-vw="${r[0]}">${r[1]} <small>${qsEsc(r[2])}</small></button><span class="qs-bar"><i class="qs-b${r[0]}" style="width:${100 * r[3] / mx}%"></i></span><span class="qs-av">${qsF(qsN(r[3]), r[3], { st: r[0] })} scans <em>${tot ? Math.round(100 * r[3] / tot) : 0}% of all</em></span></div>`;
    }).join('')}</div></section>`;
  h += qsOwnCard();

  const qn = bk.filter(k => !k.n && !k.l).length;
  h += `<section class="ad-card" id="qs-day"><h2>Scans by day</h2><p class="ad-sub">One column for each ${unit} of the Period. <b>What to watch.</b> ${busy && (busy.n + busy.l) ? `${qsEsc(qsBucketLabel(busy, unit))} is the busiest ${unit}, with ${qsPlural(busy.n + busy.l, 'scan')}. Which card went out around then?` : 'No scans in this pick.'} ${qn && bk.length > 1 ? `${qn} of ${bk.length} ${unit}s have none.` : ''}</p>
    <div class="ad-chart" id="qsDayChart"></div>
    <div class="ad-legend">${showC ? '<span><i style="background:var(--series)"></i>Counted (clients)</span>' : ''}${showL ? '<span><i style="background:var(--c3)"></i>Left out (tests, bots, early)</span>' : ''}</div>
    <details><summary>Show as table</summary><div id="qsDayTable"></div></details></section>`;
  h += `<section class="ad-card" id="qs-code"><h2>Scans by code</h2><p class="ad-sub">One row for each saved code, the salon card and every stylist. A code with no scans stays in the list. Short addresses are the real ones.</p>
    <div>${qsPhoneBtn('qscode')}<table id="qscode"></table></div><div class="qs-pager" id="qscodePg"></div></section>`;
  h += `<section class="ad-card" id="qs-sal"><h2>By salon</h2><p class="ad-sub" id="qsSalWatch"></p><div>${qsPhoneBtn('qssal')}<table id="qssal"></table></div></section>`;
  h += `<section class="ad-card" id="qs-log"><h2>Latest scans</h2><p class="ad-sub">Every scan, newest first. This is where you mark your own scans as tests: tap <b>That was me</b>. Only whoever saved a code, or Level 5, can mark a scan.</p>
    <div>${qsPhoneBtn('qslog')}<table id="qslog"></table></div><div class="qs-pager" id="qslogPg"></div></section>`;
  h += `<section class="ad-card" id="qs-dev"><details id="qsDevDet"><summary><b>Device and time</b></summary><p class="ad-sub">What phone scanned, and when in the day or week.</p>
    <div class="qs-seg"><span class="qs-lbl">Show</span>${[['dev', 'Device'], ['hr', 'Hour of day'], ['dow', 'Day of week']].map(v => `<button type="button" class="ad-btn" data-qs-dm="${v[0]}" aria-pressed="${qsDM === v[0]}">${v[1]}</button>`).join('')}</div>
    <div>${qsPhoneBtn('qsdev')}<table id="qsdev"></table></div></details></section>`;
  h += `<details class="more"><summary>How these numbers are counted</summary>
    <p class="ad-sub"><b>Counted scans</b> are every scan in the Period that is not a bot, not marked as a test, and on or after Count from (${qsEsc(qsDay(qsData.count_from))}). Someone who scans twice counts twice: we keep no name and no IP, so we cannot tell.</p>
    <p class="ad-sub"><b>Test mode</b> leaves out every scan made while it is on, whoever makes it. <b>That was me</b> leaves out one scan. <b>Not me</b> brings it back. The rows are never deleted.</p>
    <p class="ad-sub">Times are Dubai time. Scans before the first one was recorded do not exist, so an earlier Period is empty.${qsData.truncated ? ' The page holds the latest 30,000 scans.' : ''}</p></details>`;
  el.innerHTML = h;
  qsCharts(); qsTables(); qsRail(true);
}

function qsOwnCard() {
  const a = qsData.active, nowOn = a && Date.parse(a.to) > Date.now();
  const l5 = qsData.level5, x = qsVl({ st: 'X', rng: { a: '0000-01-01', b: '9999-12-31' }, anyb: true }).length;
  const rows = (qsData.windows || []).slice(0, 8).map(wn => { const f = Date.parse(wn.from), to = Date.parse(wn.to), nn = wn.n;
    return `<div class="qs-twr"><span>${qsEsc(qsDay(qsIso(f)))}, ${qsHm(f)} to ${qsHm(to)}</span><span class="qs-mut">${qsEsc(wn.by)}</span><span class="qs-r">${qsF(qsPlural(nn, 'scan'), nn, { st: 'T', win: wn.id, rng: { a: '0000-01-01', b: '9999-12-31' }, anyb: true, t: 'Test window' })}</span></div>`; }).join('');
  const hand = qsData.sc.filter(s => s.mark === 'hand').length, win = qsData.sc.filter(s => s.mark === 'win').length;
  return `<section class="ad-card" id="qs-own"><h2>Your own scans</h2><p class="ad-sub">We keep no name and no IP, so the page cannot tell your scan from a client’s. These three tools do it for you. <b>What to watch.</b> ${hand} scans were marked by hand and ${win} were caught by test mode. A scan from your own phone that nobody marked still counts as a client, so tap That was me right after you scan.</p>
    <div class="qs-own">
      <div class="qs-orow"><div class="qs-ol"><div class="qs-k">1 · Test mode</div><div class="qs-s">${nowOn ? 'On until <b>' + qsHm(Date.parse(a.to)) + '</b>. Every scan in this window is left out as a test, whoever makes it.' : 'Off. Start it, scan the card, and your scans stay out. It stops by itself after 15 minutes.'}</div></div>
        <button type="button" class="ad-btn qs-go" data-qs-tm="${nowOn ? 'stop' : 'start'}">${nowOn ? 'Stop test mode' : 'Start test mode (15 min)'}</button></div>
      <div class="qs-orow"><div class="qs-ol"><div class="qs-k">2 · Count from</div><div class="qs-s">Scans before <b>${qsEsc(qsDay(qsData.count_from))}</b> are left out${x ? ': ' + qsF(qsN(x), x, { st: 'X', rng: { a: '0000-01-01', b: '9999-12-31' }, anyb: true, t: 'Scans before counting began' }) + ' so far.' : '.'}${l5 ? '' : ' Level 5 changes this date.'}</div></div>
        ${l5 ? `<input type="date" id="qsCf" value="${qsEsc(qsData.count_from)}" aria-label="Count scans from this day"><button type="button" class="ad-btn" data-qs-cf="1">Apply</button>` : ''}</div>
      <div class="qs-orow"><div class="qs-ol"><div class="qs-k">3 · That was me</div><div class="qs-s">Spot your own scan under Latest scans and tap <b>That was me</b>.</div></div><a class="ad-btn" href="#qs-log" onclick="lgJump(event,'qs-log')">Go to Latest scans</a></div>
    </div>
    ${rows ? `<h3 class="ad-subh">Test windows so far</h3><div class="qs-tw">${rows}</div>` : ''}</section>`;
}

// ── CHART (hand-drawn SVG, the Hair Colour page's style, two series) ─────────
function qsTipHost() {
  const c = document.getElementById('qrScansContent');
  let t = document.getElementById('qsTip');
  if (!t && c) { t = document.createElement('div'); t.id = 'qsTip'; t.className = 'ad-tip'; c.appendChild(t); }
  return t;
}
function qsCharts() {
  const host = document.getElementById('qsDayChart'); if (!qsM || !host) return;
  const { bk, unit, showC, showL } = qsM, tip = qsTipHost(), box = document.getElementById('qrScansContent');
  const W = Math.max(300, host.clientWidth), H = 210, L = 38, R = 8, T = 14, B = 26;
  const ymax = Math.max(4, Math.ceil(Math.max(...bk.map(x => x.n + x.l)) / 4) * 4), bw = (W - L - R) / bk.length, Y = v => T + (1 - v / ymax) * (H - T - B);
  const every = Math.max(1, Math.ceil(bk.length / Math.floor((W - L) / 54)));
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Scans per ${unit}">`;
  for (let g = 0; g <= ymax + 1e-9; g += ymax / 4) s += `<line class="gl" x1="${L}" x2="${W - R}" y1="${Y(g)}" y2="${Y(g)}"/><text class="ax" x="${L - 6}" y="${Y(g) + 4}" text-anchor="end">${Math.round(g)}</text>`;
  bk.forEach((x, i) => {
    const gap = Math.min(3, bw / 4), bx = L + i * bw + gap, bwi = Math.max(2, bw - gap * 2), hn = Y(0) - Y(x.n), hl = Y(0) - Y(x.l);
    if (x.n) s += `<rect x="${bx}" y="${Y(x.n)}" width="${bwi}" height="${hn}" rx="2" fill="var(--series)"/>`;
    if (x.l) s += `<rect x="${bx}" y="${Y(x.n + x.l)}" width="${bwi}" height="${hl}" rx="2" fill="var(--c3)"/>`;
    if (i % every === 0) s += `<text class="ax" x="${bx + bwi / 2}" y="${H - 6}" text-anchor="middle">${qsAxis(x, unit)}</text>`;
    s += `<rect x="${L + i * bw}" y="${T}" width="${bw}" height="${H - T - B}" fill="transparent" data-i="${i}"/>`;
  });
  host.innerHTML = s + '</svg>';
  host.querySelectorAll('rect[data-i]').forEach(r => {
    r.addEventListener('mousemove', e => {
      const x = bk[+r.dataset.i], br = box.getBoundingClientRect(), tw = tip.offsetWidth;
      tip.innerHTML = `<b>${qsEsc(qsBucketLabel(x, unit))}</b><br>${x.n + x.l ? qsPlural(x.n + x.l, 'scan') + (showC && showL ? `<br>${x.n} counted, ${x.l} left out` : '') : 'No scans'}`; tip.style.opacity = 1;
      let left = e.clientX - br.left + 12; if (left + tw > br.width - 4) left = e.clientX - br.left - tw - 12;
      tip.style.left = Math.max(4, left) + 'px'; tip.style.top = (e.clientY - br.top - 10) + 'px';
    });
    r.addEventListener('mouseleave', () => { tip.style.opacity = 0; });
  });
  const dh = document.getElementById('qsDayTable');
  if (dh) {
    dh.innerHTML = qsPhoneBtn('qsday') + '<table id="qsday"></table>';
    const lab = x => qsBucketLabel(x, unit), rg = x => ({ a: x.a, b: x.b });
    qsMake('qsday', bk, [
      { k: 'p', l: unit === 'month' ? 'Month' : unit === 'week' ? 'Week of' : 'Day', t: 'txt', raw: x => x.a, disp: lab, cell: x => qsEsc(lab(x)) },
      qsCol('n', 'Counted', 'num', x => x.n, x => String(x.n), x => qsF(String(x.n), x.n, { st: 'C', rng: rg(x), t: lab(x) })),
      qsCol('l', 'Left out', 'num', x => x.l, x => String(x.l), x => qsF(String(x.l), x.l, { st: 'L', rng: rg(x), t: lab(x) }))
    ], rows => ({ p: 'Total', n: qsF(String(rows.reduce((a, x) => a + x.n, 0)), rows.reduce((a, x) => a + x.n, 0), { st: 'C' }), l: qsF(String(rows.reduce((a, x) => a + x.l, 0)), rows.reduce((a, x) => a + x.l, 0), { st: 'L' }) }));
  }
}
window.addEventListener('resize', () => {
  clearTimeout(qsResize);
  qsResize = setTimeout(() => { const v = document.getElementById('view-qrscans'); if (v && v.offsetParent) qsCharts(); }, 120);
});

// ── THE TABLES, Google Sheets style (sheet-table.js): a menu on every heading ───────────────────────────────────────────────────
function qsCodeRows() {
  const w = qsRange(), list = qsVl(), by = {}, l7 = {}, end = w.to < qsIso(Date.now()) ? w.to : qsIso(Date.now());
  const from7 = qsIso(Date.parse(end + 'T12:00:00') - 6 * 864e5);
  list.forEach(s => { const m = by[s.c] || (by[s.c] = { n: 0, last: 0, ip: 0 }); m.n++; m.last = Math.max(m.last, s.t); if (s.dev === 'ios') m.ip++; });
  qsVl({ rng: { a: from7, b: end } }).forEach(s => { l7[s.c] = (l7[s.c] || 0) + 1; });
  const rows = qsCodesIn().map(c => { const m = by[c.id] || { n: 0, last: 0, ip: 0 }; return { c, n: m.n, l7: l7[c.id] || 0, last: m.last, sh: list.length ? m.n / list.length : 0, ip: m.n ? m.ip / m.n : 0, ipn: m.ip }; });
  rows.sort((x, y) => y.n - x.n || x.c.name.localeCompare(y.c.name)); rows.forEach((r, j) => { r.rk = j + 1; });
  return { rows, from7, end };
}
function qsTables() {
  if (!qsData || !qsData.sc.length) return;
  const cr = qsCodeRows(), l7r = { a: cr.from7, b: cr.end };
  qsMake('qscode', cr.rows, [
    { k: 'n', l: 'Code', t: 'txt', raw: r => r.c.name, disp: r => r.c.name, cell: r => `<span class="qs-rk">${r.rk}</span><span class="qs-nm"><b>${qsF(qsEsc(r.c.name), r.n, { code: r.c.id, t: r.c.name })}</b><small>${qsAddr(r.c)}</small></span>` },
    { k: 'b', l: 'Salon', t: 'txt', raw: r => qsBrName(r.c.branch), disp: r => qsBrName(r.c.branch), cell: r => qsEsc(qsBrName(r.c.branch)) },
    qsCol('n2', 'Scans', 'num', r => r.n, r => String(r.n), r => qsF(String(r.n), r.n, { code: r.c.id, t: r.c.name })),
    qsCol('l7', 'Last 7 days', 'num', r => r.l7, r => String(r.l7), r => qsF(String(r.l7), r.l7, { code: r.c.id, rng: l7r, t: r.c.name })),
    { k: 'last', l: 'Last scan', t: 'txt', sk: r => r.last, raw: r => r.last, disp: r => r.last ? qsDay(qsIso(r.last)) : 'none yet', cell: r => r.last ? qsF(qsDay(qsIso(r.last)), r.n, { code: r.c.id, t: r.c.name }) : '<span class="ad-zero">none yet</span>' },
    qsCol('sh', 'Share of scans', 'num', r => Math.round(r.sh * 1000) / 10, r => qsPc(r.n, qsVl().length), r => qsF(qsPc(r.n, qsVl().length), r.n, { code: r.c.id, t: r.c.name }), 1),
    qsCol('ip', 'On iPhone', 'num', r => Math.round(r.ip * 1000) / 10, r => r.n ? qsPc(r.ipn, r.n) : 'none', r => r.n ? qsF(qsPc(r.ipn, r.n), r.ipn, { code: r.c.id, dev: 'ios', t: r.c.name }) : '<span class="ad-zero">none</span>', 1)
  ], rows => { const ids = rows.map(r => r.c.id), v = rows.reduce((a, r) => a + r.n, 0), l = rows.reduce((a, r) => a + r.l7, 0);
    return { n: 'Total: ' + qsPlural(rows.length, 'code'), n2: qsF(String(v), v, { codes: ids, t: 'Scans on the codes shown' }), l7: qsF(String(l), l, { codes: ids, rng: l7r, t: 'Scans on the codes shown' }) }; },
    { limit: 10, after: (T, rows) => qsPager('qscodePg', T, rows, 'codes') });

  const list = qsVl(), sal = [].concat(QS_BR.map(b => b[0]).filter(c => qsAllSel() || sel.branch.includes(c)), qsAllSel() && qsData.codes.some(c => c.branch === 'all') ? ['all'] : []);
  const srows = sal.map(b => { const cs = qsData.codes.filter(c => c.branch === b), ls = list.filter(s => qsData.cmap[s.c].branch === b); return { b, codes: cs.length, scanned: qsDistinct(ls), n: ls.length, per: cs.length ? ls.length / cs.length : 0, sh: list.length ? ls.length / list.length : 0 }; })
    .filter(r => r.codes).sort((x, y) => y.n - x.n);
  qsMake('qssal', srows, [
    { k: 'b', l: 'Salon', t: 'txt', raw: r => qsBrName(r.b), disp: r => qsBrName(r.b), cell: r => qsF(qsEsc(qsBrName(r.b)), r.n, { sal: r.b, t: qsBrName(r.b) }) },
    qsCol('codes', 'Codes', 'num', r => r.codes, r => String(r.codes), r => String(r.codes)),
    qsCol('scanned', 'Codes scanned', 'num', r => r.scanned, r => String(r.scanned), r => qsF(String(r.scanned), r.n, { sal: r.b, t: qsBrName(r.b), cf: 1 })),
    qsCol('n', 'Scans', 'num', r => r.n, r => String(r.n), r => qsF(String(r.n), r.n, { sal: r.b, t: qsBrName(r.b) })),
    qsCol('per', 'Scans a code', 'num', r => Math.round(r.per * 10) / 10, r => r.per.toFixed(1), r => qsF(r.per.toFixed(1), r.n, { sal: r.b, t: qsBrName(r.b) })),
    qsCol('sh', 'Share of scans', 'num', r => Math.round(r.sh * 1000) / 10, r => qsPc(r.n, list.length), r => qsPc(r.n, list.length), 1)
  ], rows => { const c = rows.reduce((a, r) => a + r.codes, 0), n = rows.reduce((a, r) => a + r.n, 0); return { b: 'All shown', codes: String(c), scanned: String(rows.reduce((a, r) => a + r.scanned, 0)), n: qsF(String(n), n, {}), per: c ? (n / c).toFixed(1) : '0.0' }; });
  const wn = document.getElementById('qssalWatch') || document.getElementById('qsSalWatch');
  const ranked = srows.slice().sort((x, y) => y.per - x.per);
  if (wn) wn.innerHTML = ranked.length > 1 ? `One row for each salon. <b>What to watch.</b> Most scans a code: ${qsF(qsEsc(qsBrName(ranked[0].b)), ranked[0].n, { sal: ranked[0].b, t: qsBrName(ranked[0].b) })} (${ranked[0].per.toFixed(1)}). Least: ${qsEsc(qsBrName(ranked[ranked.length - 1].b))} (${ranked[ranked.length - 1].per.toFixed(1)}). What does the first front desk do with the card that the others could try?` : 'One row for each salon.';

  const lrows = list.slice().sort((a, b) => b.t - a.t).map(s => ({ s, c: qsData.cmap[s.c], k: qsSk(s) }));
  qsMake('qslog', lrows, [
    { k: 't', l: 'When', t: 'txt', sk: r => r.s.t, raw: r => r.s.t, disp: r => qsWhen(r.s.t), cell: r => typeof TRSD !== 'undefined' ? TRSD.num(qsWhen(r.s.t), qsScanSpec(r.s)) : qsWhen(r.s.t) },
    { k: 'c', l: 'Code', t: 'txt', raw: r => r.c.name, disp: r => r.c.name, cell: r => qsF(qsEsc(r.c.name), 1, { code: r.s.c, t: r.c.name }) },
    { k: 'b', l: 'Salon', t: 'txt', raw: r => qsBrName(r.c.branch), disp: r => qsBrName(r.c.branch), cell: r => qsEsc(qsBrName(r.c.branch)) },
    { k: 'd', l: 'Phone', t: 'txt', raw: r => qsDevName(r.s.dev), disp: r => qsDevName(r.s.dev), cell: r => qsEsc(qsDevName(r.s.dev)) },
    { k: 'k', l: 'Status', t: 'txt', raw: r => QS_STW[r.k], disp: r => QS_STW[r.k], cell: r => qsPill(r.k) },
    { k: 'mk', l: 'Mark', t: 'txt', raw: r => r.s.mark ? 'Marked' : r.k === 'C' ? 'Counted' : 'Not markable', disp: r => r.s.mark ? 'Marked' : r.k === 'C' ? 'Counted' : 'Not markable',
      cell: r => !r.c.can_mark || r.s.bot ? '' : r.s.mark ? `<button type="button" class="ad-btn qs-mk" data-qs-mark="${r.s.id}:0">Not me</button>` : r.k === 'C' ? `<button type="button" class="ad-btn qs-mk qs-go" data-qs-mark="${r.s.id}:1">That was me</button>` : '' },
    { k: 'why', l: 'Why', t: 'txt', x: 1, raw: r => qsWhy(r.s), disp: r => qsWhy(r.s) || 'Counted as a client', cell: r => qsEsc(qsWhy(r.s) || 'Counted as a client') }
  ], null, { limit: 10, after: (T, rows) => qsPager('qslogPg', T, rows, 'scans') });
  qsDevTable();
}
function qsDevTable() {
  const list = qsVl(), map = {}, order = [1, 2, 3, 4, 5, 6, 0];
  list.forEach(s => {
    const key = qsDM === 'dev' ? qsDevName(s.dev) : qsDM === 'hr' ? qsHrLab(qsHour(s.t)) : QS_DOW[qsDow(s.t)];
    const m = map[key] || (map[key] = { k: key, n: 0, u: {}, o: qsDM === 'hr' ? qsHour(s.t) : qsDM === 'dow' ? order.indexOf(qsDow(s.t)) : 0, spec: qsDM === 'dev' ? { dev: s.dev } : qsDM === 'hr' ? { hr: qsHour(s.t) } : { dow: qsDow(s.t) } });
    m.n++; m.u[s.c] = 1;
  });
  const rows = Object.values(map); rows.forEach(r => { r.codes = Object.keys(r.u).length; });
  rows.sort(qsDM === 'dev' ? (a, b) => b.n - a.n : (a, b) => a.o - b.o);
  qsMake('qsdev', rows, [
    { k: 'k', l: 'Name', t: 'txt', raw: r => r.k, disp: r => r.k, cell: r => qsF(qsEsc(r.k), r.n, Object.assign({ t: r.k }, r.spec)) },
    qsCol('n', 'Scans', 'num', r => r.n, r => String(r.n), r => qsF(String(r.n), r.n, Object.assign({ t: r.k }, r.spec))),
    qsCol('sh', 'Share of scans', 'num', r => Math.round(r.n / (list.length || 1) * 1000) / 10, r => qsPc(r.n, list.length), r => qsPc(r.n, list.length)),
    qsCol('codes', 'Codes scanned', 'num', r => r.codes, r => String(r.codes), r => String(r.codes))
  ], rows2 => { const n = rows2.reduce((a, r) => a + r.n, 0); return { k: 'All shown', n: qsF(String(n), n, {}) }; });
}

// ── THE BUTTONS: Show, Test mode, Count from, That was me, the pagers ───────────────────────────────────────────────────────────
function qsToast(msg, undo) {
  let t = document.getElementById('qsToast');
  if (!t) { t = document.createElement('div'); t.id = 'qsToast'; t.className = 'qs-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  qsUndo = undo || null;
  t.innerHTML = qsEsc(msg) + (undo ? ' <button type="button" class="qs-undo" data-qs-undo="1">Undo</button>' : ''); t.hidden = false;
  clearTimeout(qsToast.t); qsToast.t = setTimeout(() => { t.hidden = true; qsUndo = null; }, 6000);
}
async function qsMark(id, on) {
  const s = qsData && qsData.sc.find(x => x.id === id); if (!s) return;
  const was = { mark: s.mark, by: s.by, win: s.win };
  try {
    const { data, error } = await sb.rpc('qr_scan_mark', { p_id: id, p_on: on });
    if (error || !data || !data.updated) throw error || new Error('not allowed');
  } catch (e) { console.error(e); qsToast('Could not mark it. Only whoever saved the code, or Level 5, can.'); return; }
  s.mark = on ? 'hand' : null; s.by = on ? 'you' : ''; if (!on) s.win = null;
  qsPaint();
  qsToast(on ? 'Marked as yours. It is left out of every figure.' : 'Back to the counted scans.', async () => {
    try { const r = await sb.rpc('qr_scan_mark', { p_id: id, p_on: !on }); if (r.error) throw r.error; } catch (e) { console.error(e); return; }
    s.mark = was.mark; s.by = was.by; s.win = was.win; qsPaint();
  });
}
document.addEventListener('click', async e => {
  const t = e.target;
  if (!t.closest || !document.getElementById('qrScansContent') || !t.closest('#qrScansContent, #qsToast')) return;
  let b;
  if ((b = t.closest('[data-qs-vw]'))) { qsVW = b.dataset.qsVw; Object.values(qsTs).forEach(T => { T.f = {}; T.sort = null; T.page = 0; }); qsPaint(); return; }
  if ((b = t.closest('[data-qs-dm]'))) { qsDM = b.dataset.qsDm; const T = qsTs.qsdev; if (T) { T.f = {}; T.sort = null; } const op = document.getElementById('qsDevDet'); const was = op && op.open; qsPaint(); if (was) document.getElementById('qsDevDet').open = true; return; }
  if ((b = t.closest('[data-qs-mark]'))) { const [id, on] = b.dataset.qsMark.split(':'); qsMark(+id, on === '1'); return; }
  if ((b = t.closest('[data-qs-undo]'))) { const f = qsUndo; qsUndo = null; document.getElementById('qsToast').hidden = true; if (f) f(); return; }
  if ((b = t.closest('[data-qs-pg]'))) { const [id, d] = b.dataset.qsPg.split(':'), T = qsTs[id]; if (T) { T.page += +d; T.draw(); } return; }
  if ((b = t.closest('[data-qs-tm]'))) {
    const start = b.dataset.qsTm === 'start'; b.disabled = true;
    try { const { data, error } = await sb.rpc(start ? 'qr_test_start' : 'qr_test_stop'); if (error || !data || data.denied) throw error || new Error('denied'); qsToast(start ? 'Test mode is on for 15 minutes. Scan your card now.' : 'Test mode is off.'); }
    catch (er) { console.error(er); qsToast('Could not change test mode. Sign in to the dashboard and try again.'); }
    renderQrScans(true); return;
  }
  if ((b = t.closest('[data-qs-cf]'))) {
    const v = (document.getElementById('qsCf') || {}).value; if (!v) { qsToast('Pick a day.'); return; }
    try { const { data, error } = await sb.rpc('qr_count_from_set', { p_date: v }); if (error || !data || data.denied || data.error) throw error || new Error('denied'); qsData.count_from = data.count_from; qsToast('Counting from ' + qsDay(data.count_from) + '. Earlier scans are left out.'); qsPaint(); }
    catch (er) { console.error(er); qsToast('Could not change the date. Only Level 5 can.'); }
  }
});
document.addEventListener('change', e => {
  const s = e.target.closest && e.target.closest('[data-qs-rows]'); if (!s) return;
  const T = qsTs[s.dataset.qsRows]; if (T) { T.shown = +s.value; T.page = 0; T.draw(); }
});

// ── ON THIS PAGE rail (the same shell as the package pages') ────────────────
const QS_RAIL = [['qs-headline', 'The numbers'], ['qs-own', 'Your own scans'], ['qs-day', 'Scans by day'], ['qs-code', 'Scans by code'], ['qs-sal', 'By salon'], ['qs-log', 'Latest scans'], ['qs-dev', 'Device and time']];
function qsRail(on) {
  const shell = document.getElementById('qsShell'), side = document.getElementById('qsSide');
  if (!shell || !side) return;
  shell.classList.toggle('rv-norail', !on);
  const nav = side.querySelector('.side-nav');
  if (nav && on && !nav.dataset.sig) {
    nav.dataset.sig = '1';
    nav.innerHTML = '<div class="side-k">On this page</div>' + QS_RAIL.map(r => `<a href="#${r[0]}" onclick="lgJump(event,'${r[0]}')">${r[1]}</a>`).join('');
  }
  if (typeof spy === 'function') spy();
}
