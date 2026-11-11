// Quarterly Business Report (Kate, 11 Nov 2026), built from docs/mockups/quarterly-business-report.html in the cowork repo.
//
// One quarter, the Organisation Pulse's seven numbers, branch by branch, set against target and against the same dates a year earlier. Under
// Organisation Pulse in the Business group; Tara, Coach Emma and Kate (old Levels 3 and 5) only, the same two as Landing Page Review.
//
// WHERE THE NUMBERS COME FROM. Nothing is fetched in a new shape. This page borrows Daily Performance's own loader and day cells (dpLoad, dpCell,
// dpPeriodFig, dpSpecFor in daily-performance.js), which are the ledgers' and Phorest's own rows cut by day, with the Target Calculator's monthly
// targets spread over each branch's trading days. So a figure here is the total of the days Daily Performance shows, and clicking it opens
// those days and the staff behind them, ending on the figure.
//   Money and counts (net take, services, treatments, retail, clients): the total of the open days; the target is the total of those days' targets
//     (the whole quarter once it has closed, the target to date while it is open).
//   Rates (rebooking, hair and beauty average bill): pooled, the way the Organisation Pulse pools them: the sum of what was rebooked over the sum of
//     the clients, the sum of hair services over the sum of hair clients. NOT the average of the daily rates Daily Performance uses.
//   Same quarter last year: the same dates a year earlier, read the same way.
// Not in this first version: Bahrain (BHD), whose rows are read through the Bahrain view and not this feed. It says so on the page.
//
// WHAT IS KEPT. Only what is typed on the page (the Think line and the commitment) and, when Kate locks a closed quarter, a copy of the headline
// figures; the page then says how many of today's figures differ from the lock. migrations/quarter_reports.sql, read and written only through
// quarter_report_get / _save / _lock / _unlock.
//
// Rule from Kate, 3 Nov 2026: a click shows WHY the number is that value, never the same figure again. Every list here goes one level down
// (branches, months, days, staff) and ends on the figure; a figure with nothing behind it stays plain.

const QR = { q: null, scope: 'all', rec: null, recErr: '', busy: false, err: '', C: null, saved: '' };
const QR_STORE = 'trs-quarter-report';
const QR_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
try { const s = JSON.parse(localStorage.getItem(QR_STORE) || '{}'); if (s.scope) QR.scope = s.scope; } catch (e) { /* private mode: the default is fine */ }

// The seven numbers. mk = the Daily Performance measure behind a sum; a rate says what to pool.
const QR_METRICS = [
  { id: 'net',  label: 'Total net take',    mk: 'sales',    kind: 'sum', t: 'aed', why: 'Everything sold, ex VAT: services (hair with treatments and courses inside, and beauty) and retail. Services and Retail are the two parts of it; Treatments is a part of Services, so nothing is counted twice.' },
  { id: 'svc',  label: 'Services',          mk: 'services', kind: 'sum', t: 'aed', why: 'Hair services with treatments and courses included, plus beauty services. No retail. The same Services the Target Calculator sets its target on.' },
  { id: 'tr',   label: 'Hair treatments',   mk: 'treat',    kind: 'sum', t: 'aed', why: 'Treatment sales, ex VAT. Treatments are part of Services, so they are already inside Total net take.' },
  { id: 'rt',   label: 'Retail',            mk: 'retail',   kind: 'sum', t: 'aed', why: 'Hair and beauty retail sales together, ex VAT, including retail with no stylist credited.' },
  { id: 'cli',  label: 'Total clients',     mk: 'clients',  kind: 'sum', t: 'num', why: 'Clients handled, per staff, from the ledgers: the count client targets are set on. Through-the-door is a different count and is not used here.' },
  { id: 'reb',  label: 'Rebooking',         kind: 'rate', t: 'pct', pct: true, win: s => ({ v: s.rebookPct, num: s.totalRebooked, den: s.rebookPct > 0 ? s.totalRebooked / (s.rebookPct / 100) : s.totalClients }), dayDen: s => (s.rebookPct > 0 && s.totalRebooked > 0) ? s.totalRebooked / (s.rebookPct / 100) : s.totalClients, bm: 'rebookPct', pd: ['bench', { name: 'Rebooking %' }], nL: 'Rebooked', dL: 'Clients',
    why: 'Clients who booked their next visit before leaving, over clients handled, pooled across the quarter. The target changed in September 2026 (45% to 70%); each day is read against the target of its own date.' },
  { id: 'hbill', label: 'Hair average bill', kind: 'rate', t: 'aed', win: s => ({ v: s.hairAvgBill, num: s.hairServicesIncl, den: s.hairTotalClients }), dayDen: s => s.hairTotalClients, bm: 'hairAvgBill', pd: ['avg', { dept: 'hair' }], nL: 'Hair services', dL: 'Hair clients',
    why: 'Hair services (treatments and courses included, no retail) over hair clients, pooled across the quarter.' },
  { id: 'bbill', label: 'Beauty average bill', kind: 'rate', t: 'aed', beauty: true, win: s => ({ v: s.beautyAvgBill, num: s.beautyServicesTotal, den: s.beautyTotalClients }), dayDen: s => s.beautyTotalClients, bm: 'beautyAvgBill', pd: ['avg', { dept: 'beauty' }], nL: 'Beauty services', dL: 'Beauty clients',
    why: 'Beauty services over beauty clients, pooled across the quarter. A hair-only branch has none.' },
];
const QR_BY = Object.fromEntries(QR_METRICS.map(m => [m.id, m]));

const qrEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const qrN = v => Math.round(+v || 0).toLocaleString('en-GB');
const qrFmt = (m, v) => v == null || !isFinite(v) ? 'n/a' : m.t === 'aed' ? 'AED ' + qrN(v) : m.t === 'pct' ? (Math.round(v * 10) / 10) + '%' : qrN(v);
const qrName = c => (typeof dpName === 'function' ? dpName(c) : c);
const qrCls = p => p == null ? '' : p >= 100 ? 'good' : p >= 80 ? 'warn' : 'bad';
const qrPart = f => !!f && f.t != null && f.cov < f.n;   // a target that covers only some of the days
const qrPctTxt = f => f.p == null ? 'no target keyed' : Math.round(f.p) + (qrPart(f) ? '% on keyed days' : '% of target');
const qrTgtTxt = (m, f) => f.t == null ? 'none keyed' : qrFmt(m, f.t) + (qrPart(f) ? ` on ${f.cov} of ${f.n} days` : '');

function qrCss() {
  if (document.getElementById('qrCss')) return;
  const st = document.createElement('style'); st.id = 'qrCss';
  st.textContent = `
  .qrp{max-width:1100px;margin:0 auto}
  .qrp *{box-sizing:border-box;min-width:0}
  .qrp h1{font-family:'Playfair Display',serif;font-weight:500;font-size:clamp(24px,4.4vw,32px);line-height:1.1;margin:8px 0 4px}
  .qrp h3{font-family:'Playfair Display',serif;font-weight:500;font-size:20px;margin:28px 0 8px}
  .qrp .qr-eb{font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--muted2)}
  .qrp .qr-sub{color:var(--muted);font-size:14.5px}
  .qrp .qr-top{display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;align-items:flex-start}
  .qrp .qr-tools{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
  .qrp .qr-filters{display:flex;gap:16px;flex-wrap:wrap;margin:16px 0 6px;align-items:center}
  .qrp .qr-fg{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
  .qrp .qr-fg>span{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted2);margin-right:4px}
  .qrp .qr-chip{border:1px solid var(--border);background:var(--surface);color:var(--text);border-radius:999px;padding:5px 14px;font:inherit;font-size:13.5px;cursor:pointer}
  .qrp .qr-chip.on{background:var(--mint,#99F6E4);color:#1A1A1A;font-weight:700;border-color:transparent}
  .qrp .qr-pill{display:inline-block;font-size:12.5px;color:var(--muted);border:1px solid var(--border);border-radius:999px;padding:3px 11px}
  .qrp .qr-pill.good{background:rgba(62,122,94,.14);color:var(--good,#3E7A5E);border-color:transparent}
  .qrp .qr-pill.warn{background:rgba(138,95,18,.14);color:var(--warn,#8A5F12);border-color:transparent}
  .qrp .qr-pill.bad{background:rgba(160,60,60,.14);color:var(--bad,#A03C3C);border-color:transparent}
  [data-theme="dark"] .qrp .qr-pill.good{color:#99F6E4;background:rgba(153,246,228,.12)}
  [data-theme="dark"] .qrp .qr-pill.warn{color:#EEF3C7;background:rgba(238,243,199,.12)}
  [data-theme="dark"] .qrp .qr-pill.bad{color:#FF9B9B;background:rgba(255,155,155,.12)}
  .qrp .qr-wall{margin:18px 0 0;padding:16px 18px;border-radius:12px;background:var(--surface2,var(--surface));border:1px solid var(--border);display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
  .qrp .qr-wall small{display:block;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted2);margin-bottom:3px}
  .qrp .qr-wall div{font-size:14.5px}
  .qrp .qr-start{margin:18px 0 0;font-size:15px;padding:12px 16px;border-left:4px solid var(--mint,#99F6E4);background:var(--surface2,var(--surface));border-radius:10px}
  .qrp .qr-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:14px}
  .qrp .qr-tile{border:1px solid var(--border);border-radius:12px;padding:14px 16px;background:var(--surface);display:flex;flex-direction:column;gap:6px}
  .qrp .qr-tile .k{font-size:13px;color:var(--muted);display:flex;justify-content:space-between;gap:8px;align-items:center}
  .qrp .qr-tile .big{font-family:'Playfair Display',serif;font-size:26px;font-weight:500;line-height:1.1}
  .qrp .qr-tile .r2{font-size:13px;color:var(--muted)}
  .qrp .qr-tile .ly{font-size:12.5px;color:var(--muted2)}
  .qrp .qr-tile .ln{display:flex;justify-content:space-between;gap:8px;align-items:baseline;border-top:1px solid var(--border);padding-top:6px;margin-top:2px}
  .qrp .qr-tile .ln:first-of-type{border-top:0;padding-top:0;margin-top:0}
  .qrp .qr-tile .ln b{font-family:'Playfair Display',serif;font-size:20px;font-weight:500}
  .qrp .qr-mini{display:flex;gap:6px;align-items:flex-end;height:46px;margin-top:2px}
  .qrp .qr-mini span{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:2px;height:100%;font-size:10.5px;color:var(--muted2)}
  .qrp .qr-mini i{display:block;width:100%;background:var(--accent,#3E7A5E);border-radius:3px 3px 0 0;min-height:3px;opacity:.85}
  .qrp .qr-tile.how{justify-content:center;color:var(--muted);font-size:14px;gap:4px}
  .qrp .qr-tw{overflow-x:auto;-webkit-overflow-scrolling:touch}
  .qrp table{border-collapse:collapse;width:100%;font-size:14.5px;min-width:760px}
  .qrp th,.qrp td{padding:10px 12px;text-align:right;border-bottom:1px solid var(--border);white-space:nowrap;vertical-align:top}
  .qrp th:first-child,.qrp td:first-child{text-align:left;position:sticky;left:0;background:var(--bg,var(--surface));z-index:1}
  .qrp th{font-size:11.5px;font-weight:700;color:var(--muted2);letter-spacing:.05em;text-transform:uppercase;white-space:normal;vertical-align:bottom}
  .qrp td .pc{display:block;font-size:12px;margin-top:1px}
  .qrp td.tot{font-weight:700}
  .qrp .good{color:var(--good,#3E7A5E)}.qrp .warn{color:var(--warn,#8A5F12)}.qrp .bad{color:var(--bad,#A03C3C)}
  [data-theme="dark"] .qrp .good{color:#99F6E4}[data-theme="dark"] .qrp .warn{color:#EEF3C7}[data-theme="dark"] .qrp .bad{color:#FF9B9B}
  .qrp .qr-note{font-size:13px;color:var(--muted2);margin:8px 2px 0}
  .qrp .qr-reflect{margin-top:28px;padding:20px 22px;border-radius:14px;border:1px solid var(--border);background:var(--surface2,var(--surface))}
  .qrp .qr-reflect h3{margin:0 0 4px}
  .qrp .qr-reflect ol{margin:8px 0 0;padding-left:20px;font-size:15px}
  .qrp .qr-reflect li{margin:5px 0}
  .qrp label.qr-l{display:block;font-size:11.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted2);margin:14px 0 4px}
  .qrp input.qr-in{width:100%;font:inherit;font-size:15px;padding:9px 12px;border-radius:10px;border:1px solid var(--border);background:var(--surface);color:var(--text)}
  .qrp .qr-commit{margin-top:20px;padding:18px 20px;border-left:5px solid var(--good,#3E7A5E);background:rgba(62,122,94,.1);border-radius:12px}
  .qrp .qr-commit .row{display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px}
  .qrp .qr-commit label.qr-l{margin-top:8px}
  .qrp .qr-saved{margin-top:10px;font-size:12.5px;color:var(--muted)}
  .qrp .qr-foot{margin-top:22px;padding-top:12px;border-top:1px solid var(--border);font-size:12.5px;color:var(--muted2);display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
  .qrp .qr-err{padding:14px 16px;border-radius:10px;background:rgba(160,60,60,.12);color:var(--bad,#A03C3C)}
  .qrp .qr-lock{margin-top:6px;font-size:13px;color:var(--muted)}
  @media (max-width:860px){.qrp .qr-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}.qrp .qr-wall,.qrp .qr-commit .row{grid-template-columns:1fr}}
  @media (max-width:480px){.qrp .qr-tiles{grid-template-columns:1fr}}
  @media print{
    body.qr-printing .sidebar,body.qr-printing #sidebar,body.qr-printing #topbar,body.qr-printing #topbarSpacer,body.qr-printing .qr-noprint,body.qr-printing #trs-ask,body.qr-printing .totop{display:none!important}
    body.qr-printing{background:#fff!important}
    body.qr-printing .qrp{max-width:none}
    body.qr-printing .qr-start{display:none}
  }`;
  document.head.appendChild(st);
}

// ── Quarters ────────────────────────────────────────────────
const qrKey = (y, n) => y + '-Q' + n;
const qrYN = q => { const m = /^(\d{4})-Q([1-4])$/.exec(q); return m ? [+m[1], +m[2]] : null; };
const qrLabel = q => { const [y, n] = qrYN(q); return 'Q' + n + ' ' + y; };
const qrBounds = q => { const [y, n] = qrYN(q); return { from: new Date(y, (n - 1) * 3, 1), to: new Date(y, n * 3, 0) }; };
function qrToday() { const t = new Date(); t.setHours(0, 0, 0, 0); return t; }
// The quarters on offer: from the first month the ledgers hold targets for, to the one we are in, newest first.
function qrQuarters() {
  const t = qrToday(), first = (typeof LG_FIRST_MONTH === 'string' && /^\d{4}-\d{2}$/.test(LG_FIRST_MONTH)) ? LG_FIRST_MONTH : '2025-01';
  const out = [];
  let y = t.getFullYear(), n = Math.floor(t.getMonth() / 3) + 1;
  for (let k = 0; k < 8; k++) {
    const b = qrBounds(qrKey(y, n)), lastMonth = b.to.getFullYear() + '-' + String(b.to.getMonth() + 1).padStart(2, '0');
    if (lastMonth < first) break;
    out.push(qrKey(y, n));
    n--; if (n < 1) { n = 4; y--; }
  }
  return out;
}

// ── Load and compute ────────────────────────────────────────
function qrIdx(from, to) { const a = []; DPD.days.forEach((d, i) => { if (d >= from && d <= to) a.push(i); }); return a; }
// A pooled rate over some days of one or more branches, worked out the way the Organisation Pulse does it: the staff rows of those open days run through
// aggDailyData as one window, so the figure equals the Pulse's card and the By staff list behind it (adding up the days' own rates is close but not the same).
// Each day is read against the benchmark of its own date, weighted by that day's base. Memoised per set of days.
let qrMemo = new Map(), qrMemoKey = '';
function qrWindow(codes, idx) {
  if (qrMemoKey !== DPD.key) { qrMemo = new Map(); qrMemoKey = DPD.key; }
  const key = codes.join(',') + '|' + idx[0] + '|' + idx[idx.length - 1] + '|' + idx.length;
  if (qrMemo.has(key)) return qrMemo.get(key);
  const ok = {}; codes.forEach(c => { ok[c] = new Set(idx.filter(i => dpCell('sales', c, i).state === 'ok').map(i => dpYmd(DPD.days[i]))); });
  const inW = r => ok[r.branch] && ok[r.branch].has(String(r.date).slice(0, 10));
  const L = (DPD.rowsB || []).filter(inW), P = (DPD.rowsP || []).filter(inW);
  const out = (L.length || P.length) ? aggDailyData([], L, P).summary : null;
  qrMemo.set(key, out); return out;
}
function qrRateFor(m, codes, idx) {
  const cs = codes.filter(c => !(m.beauty && DPD.hairOnly[c]));
  if (!cs.length || !idx.length) return null;
  const s = qrWindow(cs, idx); if (!s) return null;
  const w = m.win(s); if (!(w.den > 0) || w.v == null || !isFinite(w.v)) return null;
  let bt = 0, bd = 0, days = 0;
  cs.forEach(c => idx.forEach(i => {
    if (dpCell('sales', c, i).state !== 'ok') return;
    const sd = DPD.byCode[c].sum[i]; if (!sd) return;
    const d = Number(m.dayDen(sd)) || 0; if (!(d > 0)) return;
    days++; const b = dpBenchmark(m.bm, DPD.days[i]); if (b != null) { bt += b * d; bd += d; }
  }));
  const t = bd > 0 ? bt / bd : null;
  return { num: w.num, den: w.den, v: w.v, t, p: t ? w.v / t * 100 : null, n: days, cov: t ? days : 0 };
}
function qrRate(m, code, idx) { return qrRateFor(m, [code], idx); }
// One branch, any set of days: the figure and its target.
function qrOne(m, code, idx) {
  if (!idx.length) return null;
  if (m.kind === 'sum') {
    if (m.beauty && DPD.hairOnly[code]) return null;
    // The total of the open days, and the target of those days that have one. A month nobody keyed a target for has none, so a target can cover only part of the days
    // (cov of n): the % of target is then read over the covered days only, and the page says so, never a whole-quarter figure beside a part-quarter target.
    const cs = idx.map(i => dpCell(m.mk, code, i)).filter(c => c.state === 'ok');
    if (!cs.length) return null;
    const both = cs.filter(c => c.t != null), v = cs.reduce((a, c) => a + c.v, 0), t = both.reduce((a, c) => a + c.t, 0), vT = both.reduce((a, c) => a + c.v, 0);
    return { v, t: both.length ? t : null, vT, p: t > 0 ? vT / t * 100 : null, n: cs.length, cov: both.length };
  }
  return qrRate(m, code, idx);
}
// Several branches added together (the UAE total, or one branch).
function qrMany(m, codes, idx) {
  const parts = codes.map(c => qrOne(m, c, idx)).filter(Boolean);
  if (!parts.length) return null;
  if (m.kind === 'sum') {
    const v = parts.reduce((a, f) => a + f.v, 0), withT = parts.filter(f => f.t != null), t = withT.reduce((a, f) => a + f.t, 0), vT = withT.reduce((a, f) => a + f.vT, 0);
    return { v, t: withT.length ? t : null, vT, p: t > 0 ? vT / t * 100 : null, n: parts.reduce((a, f) => a + f.n, 0), cov: parts.reduce((a, f) => a + f.cov, 0) };
  }
  return qrRateFor(m, codes, idx);
}

async function qrLoad() {
  const { from, to } = qrBounds(QR.q), yest = new Date(qrToday()); yest.setDate(yest.getDate() - 1);
  const toEff = to > yest ? yest : to;
  if (toEff < from) { QR.C = null; QR.err = 'This quarter has not started yet.'; return; }
  let lyFrom = dpYearsBack(from, 1); const first = new Date(PERIOD_FIRST_YEAR, 0, 1); if (lyFrom < first) lyFrom = first;
  await dpLoad({ from: lyFrom, to: toEff, yest });
  const cur = qrIdx(from, toEff), ly = qrIdx(dpYearsBack(from, 1), dpYearsBack(toEff, 1));
  const months = [];
  for (let d = new Date(from.getFullYear(), from.getMonth(), 1); d <= toEff; d.setMonth(d.getMonth() + 1)) {
    const a = new Date(Math.max(+d, +from)), b = new Date(Math.min(+new Date(d.getFullYear(), d.getMonth() + 1, 0), +toEff));
    months.push({ label: QR_MON[d.getMonth()] + ' ' + d.getFullYear(), short: QR_MON[d.getMonth()], idx: qrIdx(a, b) });
  }
  // Branches that traded in the quarter: the four open ones, and a closed branch (Fratelli, Marasy) whose open days it touches, as everywhere on the dashboard.
  const codes = DPD.codes.filter(c => dpPeriodFig('sales', c, cur));
  QR.C = { from, to, toEff, cur, ly, months, codes, open: to > yest, lyFrom: dpYearsBack(from, 1), lyTo: dpYearsBack(toEff, 1) };
  QR.err = '';
}

async function qrRecord() {
  QR.rec = null; QR.recErr = '';
  try { const { data, error } = await sb.rpc('quarter_report_get', { p_q: QR.q }); if (error) throw error; QR.rec = data || { quarter: QR.q }; }
  catch (e) { const m = (e && e.message) || String(e); QR.recErr = /quarter_report|schema cache|does not exist/i.test(m) ? 'setup' : m; }
}

// ── The lists behind a figure ───────────────────────────────
const qrRange = (a, b) => `${dpRangeLbl(a)} to ${dpRangeLbl(b)}`;
const qrFirstLast = idx => { const s = idx.slice().sort((x, y) => x - y); return [DPD.days[s[0]], DPD.days[s[s.length - 1]]]; };
const qrMonthsOf = idx => QR.C.months.map(mo => ({ mo, idx: mo.idx.filter(i => idx.includes(i)) })).filter(x => x.idx.length);
const qrCols = (m, first) => m.kind === 'sum'
  ? [{ k: 'w', l: first }, { k: 'v', l: m.label, t: m.t }, { k: 't', l: 'Target', t: m.t }, { k: 'p', l: '% of target', t: 'pct' }]
  : [{ k: 'w', l: first }, { k: 'num', l: m.nL, t: m.id === 'reb' ? 'num' : 'aed' }, { k: 'den', l: m.dL, t: 'num' }, { k: 'v', l: m.label, t: m.t }, { k: 't', l: 'Target', t: m.t }, { k: 'p', l: '% of target', t: 'pct' }];
const qrRow = (m, w, f, extra) => f ? Object.assign({ w, v: f.v, t: f.t, p: f.p, num: f.num, den: f.den }, extra || {}) : { w, _cls: 'dr-muted' };
const qrFoot = (m, w, f) => f ? { w, v: f.v, t: f.t, p: f.p, num: f.num, den: f.den } : null;
function qrSpecTitle(m, codes, idx) {
  const [a, b] = qrFirstLast(idx), who = codes.length === 1 ? qrName(codes[0]) : (codes.length === QR.C.codes.length ? 'All branches' : codes.map(qrName).join(', '));
  return { title: `${m.label} · ${who}`, range: qrRange(a, b), who };
}
function qrStaffView(m, code, idx, pd) {
  return { id: 'staff', label: 'By staff', load: async () => {
    const okIdx = idx.filter(i => dpCell('sales', code, i).state === 'ok'), dates = new Set(okIdx.map(i => dpYmd(DPD.days[i])));
    const inWin = r => r.branch === code && dates.has(String(r.date).slice(0, 10));
    const L = (DPD.rowsB || []).filter(inWin), P = (DPD.rowsP || []).filter(inWin), d = okIdx.length ? aggDailyData([], L, P) : null;
    if (!d || typeof PD === 'undefined') return { cols: [], rows: [], empty: 'No staff rows for this selection.' };
    const [a, b] = qrFirstLast(idx), label = `${qrName(code)}, ${qrRange(a, b)}`;
    const sp = PD.spec(pd[0], PD.snapSide(d.summary, { rows: { ledger: L, phorest: P }, from: dpYmd(a), to: dpYmd(b), days: idx.length, label, codes: [code], cur: 'AED' }), pd[1]);
    return sp ? sp.views[0].load() : { cols: [], rows: [], empty: 'No staff rows for this selection.' };
  } };
}
// The list a figure opens. One branch: By month (when the days span months), then By day and By staff. Several: By branch, then By month.
function qrSpec(m, codes, idx) {
  if (!idx || !idx.length || typeof TRSD === 'undefined') return null;
  const T = qrSpecTitle(m, codes, idx), months = qrMonthsOf(idx), views = [];
  if (codes.length === 1) {
    const code = codes[0];
    if (months.length > 1) views.push({ id: 'month', label: 'By month', load: async () => ({
      cols: qrCols(m, 'Month'), rows: months.map(x => Object.assign(qrRow(m, x.mo.label, qrOne(m, code, x.idx)), { _dn: { v: qrSpec(m, codes, x.idx) } })),
      foot: qrFoot(m, 'Quarter', qrOne(m, code, idx)), sub: `${TRSD.esc(T.title)}, ${TRSD.esc(T.range)}. ${TRSD.esc(m.why)}`, note: qrPartNote(m, codes, idx) }) });
    if (m.kind === 'sum') {
      const sp = dpSpecFor(m.mk, code, idx);
      if (sp) sp.views.forEach(v => views.push(v));
    } else {
      views.push({ id: 'days', label: 'By day', load: async () => {
        const rows = idx.map(i => {
          const f = qrOne(m, code, [i]);
          return f ? { w: dpDayLabel(DPD.days[i]), num: f.num, den: f.den, v: f.v, t: f.t, p: f.p } : { w: dpDayLabel(DPD.days[i]), why: 'Closed, or no figures', _cls: 'dr-muted' };
        });
        return { cols: qrCols(m, 'Day').concat([{ k: 'why', l: '' }]), rows, foot: qrFoot(m, 'Pooled over the open days', qrOne(m, code, idx)),
          sub: `${TRSD.esc(T.title)}, ${TRSD.esc(T.range)}. A rate is worked out on the whole period (the sum over the sum), not as an average of the days, so the days are shown with what they are made of.` };
      } });
      if (m.pd) views.push(qrStaffView(m, code, idx, m.pd));
    }
    return views.length ? { title: T.title, cur: 'AED', views } : null;
  }
  views.push({ id: 'branch', label: 'By branch', load: async () => ({
    cols: qrCols(m, 'Branch'), rows: codes.map(c => Object.assign(qrRow(m, qrName(c), qrOne(m, c, idx)), { _dn: { v: qrSpec(m, [c], idx) } })),
    foot: qrFoot(m, 'All branches', qrMany(m, codes, idx)), sub: `${TRSD.esc(T.title)}, ${TRSD.esc(T.range)}. ${TRSD.esc(m.why)}`, note: qrPartNote(m, codes, idx) }) });
  if (months.length > 1) views.push({ id: 'month', label: 'By month', load: async () => ({
    cols: qrCols(m, 'Month'), rows: months.map(x => Object.assign(qrRow(m, x.mo.label, qrMany(m, codes, x.idx)), { _dn: { v: qrSpec(m, codes, x.idx) } })),
    foot: qrFoot(m, 'Quarter', qrMany(m, codes, idx)), sub: `${TRSD.esc(T.title)}, ${TRSD.esc(T.range)}.`, note: qrPartNote(m, codes, idx) }) });
  return { title: T.title, cur: 'AED', views };
}
function qrPartNote(m, codes, idx) { const f = qrMany(m, codes, idx); return qrPart(f) ? `A target is keyed for only ${f.cov} of these ${f.n} open days (a month with no target keyed has none), so the target and the % of target here cover those days only.` : ''; }
const qrDn = (html, m, codes, idx) => { const sp = qrSpec(m, codes, idx); return sp ? TRSD.num(html, sp) : html; };

// ── Draw ────────────────────────────────────────────────────
function qrShown() { const C = QR.C; return QR.scope !== 'all' && C.codes.includes(QR.scope) ? [QR.scope] : C.codes; }
function qrTile(m, codes) {
  const C = QR.C, f = qrMany(m, codes, C.cur), g = qrMany(m, codes, C.ly);
  const dn = (h, idx) => qrDn(h, m, codes, idx || C.cur);
  if (!f) return `<div class="qr-tile"><div class="k"><span>${qrEsc(m.label)}</span></div><div class="big" style="color:var(--muted2)">n/a</div><div class="r2">No figures in this quarter</div></div>`;
  const pill = f.p == null ? '<span class="qr-pill">no target keyed</span>' : `<span class="qr-pill ${qrPart(f) ? 'warn' : qrCls(f.p)}">${dn(qrPctTxt(f))}</span>`;
  const bars = C.months.map(mo => ({ mo, f: qrMany(m, codes, mo.idx) })), mx = Math.max(1, ...bars.map(b => b.f ? b.f.v : 0));
  const mini = `<div class="qr-mini">${bars.map(b => `<span title="${qrEsc(b.mo.label)}"><i style="height:${b.f ? Math.max(4, Math.round(b.f.v / mx * 30)) : 3}px"></i>${b.f ? dn(qrEsc(b.mo.short), b.mo.idx) : qrEsc(b.mo.short)}</span>`).join('')}</div>`;
  let lyLine = '<div class="ly">No figure for the same dates last year</div>';
  if (g) {
    const pts = m.t === 'pct', d = f.v - g.v, ch = pts ? d : (g.v ? d / g.v * 100 : null);
    if (ch != null) lyLine = `<div class="ly">Same dates last year ${dn(qrFmt(m, g.v), C.ly)} · <span class="${ch >= 0 ? 'good' : 'bad'}">${ch >= 0 ? '+' : '-'}${Math.abs(Math.round(ch * 10) / 10)}${pts ? ' pts' : '%'}</span></div>`;
  }
  return `<div class="qr-tile"><div class="k"><span>${qrEsc(m.label)}</span>${pill}</div>
    <div class="big">${dn(qrFmt(m, f.v))}</div>
    <div class="r2">Target ${f.t == null ? 'none keyed' : dn(qrTgtTxt(m, f))}</div>${lyLine}${mini}</div>`;
}
function qrBillTile(codes) {
  const C = QR.C, h = QR_BY.hbill, b = QR_BY.bbill;
  const line = m => {
    const f = qrMany(m, codes, C.cur); if (!f) return `<div class="ln"><span class="r2">${qrEsc(m.label)}</span><b style="color:var(--muted2)">n/a</b></div>`;
    const dn = h2 => qrDn(h2, m, codes, C.cur);
    return `<div class="ln"><span class="r2">${qrEsc(m.label.replace(' average bill', ''))}</span><b>${dn(qrFmt(m, f.v))}</b>
      ${f.p == null ? '' : `<span class="qr-pill ${qrCls(f.p)}">${dn(qrPctTxt(f))}</span>`}</div>
      <div class="ly" style="text-align:right">Target ${f.t == null ? 'none keyed' : dn(qrTgtTxt(m, f))}</div>`;
  };
  return `<div class="qr-tile"><div class="k"><span>Average bill</span></div>${line(h)}${line(b)}</div>`;
}
function qrMatrix() {
  const C = QR.C, codes = C.codes;
  const cell = (m, cs, strong) => {
    const f = qrMany(m, cs, C.cur);
    if (!f) return `<td class="${strong ? 'tot' : ''}" style="color:var(--muted2)">n/a</td>`;
    return `<td class="${strong ? 'tot' : ''}">${qrDn(qrFmt(m, f.v), m, cs, C.cur)}${f.p == null ? '<span class="pc" style="color:var(--muted2)">no target keyed</span>' : `<span class="pc ${qrPart(f) ? 'warn' : qrCls(f.p)}">${qrDn(qrPctTxt(f), m, cs, C.cur)}</span>`}</td>`;
  };
  const head = `<thead><tr><th>Number</th>${codes.map(c => `<th>${qrEsc(qrName(c))}</th>`).join('')}<th>${codes.length > 1 ? 'All branches' : 'Total'}</th></tr></thead>`;
  const rows = QR_METRICS.map(m => `<tr><td>${qrEsc(m.label)}</td>${codes.map(c => cell(m, [c], false)).join('')}${cell(m, codes, true)}</tr>`).join('');
  return `<div class="qr-tw"><table>${head}<tbody>${rows}</tbody></table></div>`;
}
function qrLockLine() {
  const r = QR.rec, C = QR.C; if (!r || QR.recErr) return '';
  if (!r.snapshot || !r.locked_at) return C.open ? '<div class="qr-lock">Open quarter: the figures are live and move every day. Kate can lock it once the quarter has closed.</div>'
    : (TRS_LEVEL === 5 ? '<div class="qr-lock qr-noprint">Not locked yet. <button type="button" class="qr-chip" data-qr="lock">Lock these figures</button></div>' : '<div class="qr-lock">Not locked yet. Until Kate locks it, a late fix to a ledger can still move these figures.</div>');
  const snap = r.snapshot.figs || {}, diffs = [];
  C.codes.concat(['ALL']).forEach(code => QR_METRICS.forEach(m => {
    const live = qrMany(m, code === 'ALL' ? C.codes : [code], C.cur), s = snap[code + '|' + m.id];
    if (live && s && Math.abs(live.v - s.v) >= (m.t === 'pct' ? .05 : .5)) diffs.push((code === 'ALL' ? 'All branches' : qrName(code)) + ' ' + m.label.toLowerCase());
  }));
  const when = new Date(r.locked_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Dubai' });
  return `<div class="qr-lock"><span class="qr-pill ${diffs.length ? 'warn' : 'good'}">Locked ${qrEsc(when)} by ${qrEsc(r.locked_by || 'Kate')}</span> ${diffs.length
    ? `${diffs.length} figure${diffs.length === 1 ? '' : 's'} differ from the lock today (${qrEsc(diffs.slice(0, 4).join(', '))}${diffs.length > 4 ? ' and more' : ''}). The page shows today's figures; the lock is what was read.`
    : 'Every figure equals the lock.'} ${TRS_LEVEL === 5 ? '<span class="qr-noprint"><button type="button" class="qr-chip" data-qr="lock">Lock again</button> <button type="button" class="qr-chip" data-qr="unlock">Unlock</button></span>' : ''}</div>`;
}
function qrDraw(host) {
  const C = QR.C, shown = qrShown(), r = QR.rec || {}, firstL = new Date(C.from), qs = qrQuarters();
  const rangeTxt = qrRange(C.from, C.toEff), days = Math.round((C.toEff - C.from) / 864e5) + 1, total = Math.round((C.to - C.from) / 864e5) + 1;
  const scopeName = shown.length === 1 ? qrName(shown[0]) : 'All branches';
  host.innerHTML = `<div class="qrp">
    <div class="qr-top"><div>
      <div class="qr-eb">Tara Rose Salons · Quarterly Business Report</div>
      <h1>${qrEsc(qrLabel(QR.q))}${C.open ? ' <span class="qr-pill warn">open</span>' : ''}</h1>
      <div class="qr-sub">${qrEsc(rangeTxt)}${C.open ? ` (${days} of ${total} days)` : ''} · UAE branches in AED · ${qrEsc(scopeName)}. Same dates last year: ${qrEsc(qrRange(C.lyFrom, C.lyTo))}.</div>
    </div><div class="qr-tools qr-noprint">${typeof rexButtons === 'function' ? rexButtons('qrExport') : ''}<button type="button" class="qr-chip" data-qr="print">Save as PDF</button></div></div>
    <div class="qr-filters qr-noprint">
      <div class="qr-fg"><span>Quarter</span>${qs.map(q => `<button type="button" class="qr-chip${q === QR.q ? ' on' : ''}" data-q="${q}">${qrEsc(qrLabel(q))}</button>`).join('')}</div>
      <div class="qr-fg"><span>Branch</span><button type="button" class="qr-chip${QR.scope === 'all' ? ' on' : ''}" data-s="all">All branches</button>${C.codes.map(c => `<button type="button" class="qr-chip${QR.scope === c ? ' on' : ''}" data-s="${c}">${qrEsc(qrName(c))}</button>`).join('')}</div>
    </div>
    ${qrLockLine()}
    <div class="qr-wall">
      <div><small>Why this report</small>A month is noisy. A quarter shows who is carrying us and where we keep slipping.</div>
      <div><small>Why now</small>The next quarter's targets are set straight after it closes, so this is the page we read first.</div>
      <div><small>If we do nothing</small>We keep fixing the month that just ended and miss the pattern across three.</div>
    </div>
    <div class="qr-start"><b>Start here:</b> click the figure that looks wrong to you. It opens the branches, months and days behind it.</div>
    <div class="qr-tiles">${['net', 'svc', 'tr', 'rt', 'cli', 'reb'].map(id => qrTile(QR_BY[id], shown)).join('')}${qrBillTile(shown)}
      <div class="qr-tile how"><b style="color:var(--text)">How to read a tile</b><span>Big figure: what we did.</span><span>Target: what we planned.</span><span>Same dates last year: the comparison.</span><span>Bars: the months of the quarter.</span></div></div>
    <p class="qr-note">${C.open ? 'The quarter is still open, so the target is the target to date for the days that have figures, not the whole quarter. ' : ''}A rate is pooled over the quarter, the way the Organisation Pulse reads it.</p>
    <h3>The seven numbers, branch by branch</h3>
    ${qrMatrix()}
    <p class="qr-note">The small figure under each number is its share of target. Every figure opens the list behind it. Bahrain (in BHD) is not in this first version: its rows are read through the Bahrain view, not this feed, so it is left out here rather than guessed.</p>
    <div class="qr-reflect"><div class="qr-eb">Reflect</div><h3>What did you notice?</h3>
      <ol><li>Which branch moved most against last year, and what changed there?</li>
      <li>Which of the seven is furthest from target, and is it about the team, the bookings or the target itself?</li>
      <li>What did one branch do well that another could try this week?</li></ol>
      <label class="qr-l" for="qrThink">Think: in one sentence, what do we know now that we did not know last quarter?</label>
      <input type="text" class="qr-in" id="qrThink" maxlength="400" value="${qrEsc(r.think || '')}" placeholder="Type it here, together">
    </div>
    <div class="qr-commit"><div class="qr-eb" style="color:var(--good,#3E7A5E)">Try · one action, one owner, one deadline</div>
      <div class="row"><div><label class="qr-l" for="qrAct">My commitment this quarter is</label><input type="text" class="qr-in" id="qrAct" maxlength="200" value="${qrEsc(r.c_action || '')}"></div>
      <div><label class="qr-l" for="qrOwn">I will teach it to</label><input type="text" class="qr-in" id="qrOwn" maxlength="120" value="${qrEsc(r.c_owner || '')}"></div>
      <div><label class="qr-l" for="qrBy">By</label><input type="text" class="qr-in" id="qrBy" maxlength="60" value="${qrEsc(r.c_by || '')}"></div></div>
      <div class="qr-saved" id="qrSaved">${QR.recErr === 'setup' ? 'Not saved yet: the quarter_reports table has not been set up in Supabase (migrations/quarter_reports.sql).' : QR.recErr ? 'Could not read what was typed: ' + qrEsc(QR.recErr) : r.updated_by ? 'Last saved by ' + qrEsc(r.updated_by) + '. It is shown first next quarter, so we check it before we set a new one.' : 'Typed here, saved with this quarter, and shown first next quarter.'}</div>
    </div>
    <div class="qr-foot"><span>Figures are the total of the days Daily Performance shows, from the ledgers and Phorest, ex VAT. Targets are the Target Calculator's, spread over each branch's trading days. Clients are the handled (ledger) count.</span><span>Tara, Coach Emma and Kate only</span></div>
  </div>`;
  qrWire(host);
}

function qrWire(host) {
  host.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { QR.q = b.dataset.q; QR.saved = ''; renderQuarterReport(); });
  host.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { QR.scope = b.dataset.s; try { localStorage.setItem(QR_STORE, JSON.stringify({ scope: QR.scope })); } catch (e) { /* fine */ } qrDraw(host); });
  host.querySelectorAll('[data-qr]').forEach(b => b.onclick = () => qrAct(b.dataset.qr, host));
  ['qrThink', 'qrAct', 'qrOwn', 'qrBy'].forEach(id => { const el = host.querySelector('#' + id); if (el) el.onchange = () => qrSave(host); });
}
async function qrSave(host) {
  const g = id => (host.querySelector('#' + id) || {}).value || '', note = host.querySelector('#qrSaved');
  const rec = Object.assign({}, QR.rec || { quarter: QR.q }, { think: g('qrThink'), c_action: g('qrAct'), c_owner: g('qrOwn'), c_by: g('qrBy') });
  if (QR.recErr) { if (note) note.textContent = QR.recErr === 'setup' ? 'Not saved: the quarter_reports table has not been set up in Supabase yet.' : 'Not saved: ' + QR.recErr; return; }
  try {
    const { error } = await sb.rpc('quarter_report_save', { p_q: QR.q, p_think: rec.think, p_action: rec.c_action, p_owner: rec.c_owner, p_by: rec.c_by });
    if (error) throw error;
    QR.rec = rec; if (note) note.textContent = 'Saved just now.';
  } catch (e) { if (note) note.textContent = 'Not saved: ' + ((e && e.message) || e); }
}
async function qrAct(what, host) {
  if (what === 'print') {
    document.body.classList.add('qr-printing');
    const done = () => { document.body.classList.remove('qr-printing'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done); window.print(); return;
  }
  if (what === 'lock') {
    if (!confirm('Lock the ' + qrLabel(QR.q) + ' figures as they are now? You can lock again or unlock later.')) return;
    const C = QR.C, figs = {};
    C.codes.concat(['ALL']).forEach(code => QR_METRICS.forEach(m => { const f = qrMany(m, code === 'ALL' ? C.codes : [code], C.cur); if (f) figs[code + '|' + m.id] = { v: f.v, t: f.t }; }));
    try { const { data, error } = await sb.rpc('quarter_report_lock', { p_q: QR.q, p_snapshot: { v: 1, to: dpYmd(C.toEff), figs } }); if (error) throw error; QR.rec = data; qrDraw(host); }
    catch (e) { alert('Could not lock: ' + ((e && e.message) || e)); }
  }
  if (what === 'unlock') {
    if (!confirm('Unlock ' + qrLabel(QR.q) + '? The locked copy is removed.')) return;
    try { const { error } = await sb.rpc('quarter_report_unlock', { p_q: QR.q }); if (error) throw error; await qrRecord(); qrDraw(host); }
    catch (e) { alert('Could not unlock: ' + ((e && e.message) || e)); }
  }
}

// ── Download ────────────────────────────────────────────────
function qrExport() {
  const C = QR.C; if (!C) return null;
  const cols = [{ key: 'branch', label: 'Branch', fmt: 'text' }, { key: 'metric', label: 'Number', fmt: 'text' }, { key: 'v', label: 'Actual', fmt: 'num2' },
    { key: 't', label: 'Target', fmt: 'num2' }, { key: 'p', label: '% of target', fmt: 'pct' }, { key: 'ly', label: 'Same dates last year', fmt: 'num2' }];
  const r2 = x => x == null || !isFinite(x) ? null : Math.round(x * 100) / 100, rows = [];
  C.codes.concat(['ALL']).forEach(code => QR_METRICS.forEach(m => {
    const cs = code === 'ALL' ? C.codes : [code], f = qrMany(m, cs, C.cur), g = qrMany(m, cs, C.ly);
    if (f) rows.push({ cells: [code === 'ALL' ? 'All branches' : qrName(code), m.label, r2(f.v), r2(f.t), r2(f.p), g ? r2(g.v) : null] });
  }));
  const legend = QR_METRICS.map(m => [m.label, m.why]).concat([['Same dates last year', 'The same calendar dates a year earlier, read the same way.'], ['Bahrain', 'Not in this version (BHD, read through the Bahrain view).']]);
  return { name: 'quarterly-report-' + QR.q.toLowerCase(), sheets: [{ name: qrLabel(QR.q), title: 'Quarterly Business Report, ' + qrLabel(QR.q),
    subtitle: `${qrRange(C.from, C.toEff)}${C.open ? ' (quarter still open)' : ''} · UAE branches, AED, ex VAT.`, blocks: [{ cols, rows }], legend }] };
}

// ── Page entry ──────────────────────────────────────────────
async function renderQuarterReport() {
  const host = document.getElementById('quarterReportContent');
  if (!host || QR.busy) return;
  qrCss();
  if (!QR.q) { const t = qrToday(); QR.q = qrKey(t.getFullYear(), Math.floor(t.getMonth() / 3) + 1); }
  if (!host.querySelector('.qrp')) host.innerHTML = '<div class="qrp"><div class="loading">Loading the quarter. A year of days is read, so the first time takes a moment.</div></div>';
  QR.busy = true; QR.err = '';
  try { await Promise.all([qrLoad(), qrRecord()]); } catch (e) { QR.err = (e && e.message) || String(e); }
  QR.busy = false;
  if (QR.err || !QR.C) { host.innerHTML = `<div class="qrp"><h1>Quarterly Business Report</h1><div class="qr-err">${qrEsc(QR.err || 'No figures yet.')} Try Refresh, and tell Kate if it stays.</div>
    <div class="qr-filters">${qrQuarters().map(q => `<button type="button" class="qr-chip${q === QR.q ? ' on' : ''}" data-q="${q}">${qrEsc(qrLabel(q))}</button>`).join('')}</div></div>`;
    host.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { QR.q = b.dataset.q; renderQuarterReport(); }); return; }
  qrDraw(host);
}
