// Daily Performance (Kate, 13 Oct 2026), built from Downloads/mockup-daily-performance-per-branch.html.
//
// How each UAE branch did, day by day, against its daily target: one measure at a time (15 of them, in the
// ledger's own grouping), four branch tiles, every branch on one scale, one branch as bars with a 7-day
// average, a branch-by-day heatmap, a weekday pattern, and a strengths and weaknesses radar.
//
// WHERE THE NUMBERS COME FROM. Nothing new is fetched in a new shape: the daily figures are the Ledgers'
// own (loadBranchStaffDailyRange + loadPhorestStaffDailyRange, cut by day with aggDailyData, exactly as
// lgSeries() cuts the Daily split), and the Revenue and Clients lines read the same picks as the Daily
// Target Sheet's pacing blocks (lgTotalRevenue, lgServicesTotal, LG_SERVICES_TARGET ...), so a day here can
// be checked against the sheet. Utilisation is staff_utilisation, one row per person per day.
//
// THE DAILY TARGET. The ledger's targets are monthly, and branch-ledger.js says why pro-rating one down to a
// day "would need its own thinking". The thinking, kept deliberately plain so it can be defended: the
// monthly target divided by the branch's trading days in that month (days not shut by LG_CLOSED_DAYS or the
// closed_days table). Flat, so a Saturday and a Sunday carry the same target; the weekday chart is the one
// that shows the difference. Ratios (rebooking %, treatment %, retail %, average bills) read the same
// benchmark every day; utilisation reads hair 80 and beauty 70, weighted by the hours available.
// A client count nobody keyed a target for is shown with no target, never against zero.
//
// Own controls (Measure, Period with Custom From and To), so the masthead filters are hidden, like Over the
// Years. Colours follow the branch, as everywhere on the dashboard (BRANCH_INFO).

const DP_STORE = 'trs-daily-perf';
const DP = { measure: 'sales', period: 'mtd', from: '', to: '', pick: 'SAA', radar: null, branches: null };
let dpRadarOpen = false;
try {
  const s = JSON.parse(localStorage.getItem(DP_STORE) || '{}');
  for (const k of ['measure', 'period', 'from', 'to', 'pick']) if (typeof s[k] === 'string') DP[k] = s[k];
  if (Array.isArray(s.radar)) DP.radar = s.radar.filter(x => typeof x === 'string');
  if (Array.isArray(s.branches)) DP.branches = s.branches.filter(x => typeof x === 'string');
} catch (e) { /* private mode: the defaults are fine */ }
function dpSave() { try { localStorage.setItem(DP_STORE, JSON.stringify(DP)); } catch (e) { /* ignore */ } }

let DPD = null, dpBusy = false, dpErr = '', dpMemo = new Map();

// ── MEASURES ────────────────────────────────────────────────
// `monthly` is the key list ledgerBranchTarget() would read (negative keys are subtracted), `bm` a benchmark
// ratio. `kind` says whether weekday pace matters (vol) or not (ratio). `beauty` measures skip a hair-only branch.
const dpMoney = v => 'AED ' + Math.round(v).toLocaleString('en-GB');
const dpCount = u => v => { const r = (Math.abs(v) < 10 && Math.round(v) !== v) ? Math.round(v * 10) / 10 : Math.round(v); return r.toLocaleString('en-GB') + (u ? ' ' + u : ''); };
const dpPctF  = v => Math.round(v) + '%';
const dpPct1  = v => (Math.round(v * 10) / 10) + '%';
const DP_GROUPS = [
  ['Revenue',    ['sales', 'services', 'retail', 'hair', 'beauty', 'treat']],
  ['Clients',    ['clients', 'newc', 'ncr', 'ncrp']],
  ['Benchmarks', ['rebook', 'treatp', 'retailp', 'hairbill', 'beautybill']],
  ['Capacity',   ['util']],
];
const DP_M = {
  sales:    { label: 'Total sales',     noun: 'total sales',          kind: 'vol',   fmt: dpMoney, monthly: () => LG_TOTAL_TARGET,    pick: s => lgTotalRevenue(s) },
  services: { label: 'Services',        noun: 'services revenue',     kind: 'vol',   fmt: dpMoney, monthly: () => LG_SERVICES_TARGET, pick: s => lgServicesTotal(s) },
  retail:   { label: 'Retail',          noun: 'retail revenue',       kind: 'vol',   fmt: dpMoney, monthly: () => ['retailTotal'],   pick: s => s.retailTotal },
  hair:     { label: 'Hair revenue',    noun: 'hair revenue',         kind: 'vol',   fmt: dpMoney, monthly: () => ['hairRevenue'],   pick: s => s.hairServicesIncl },
  beauty:   { label: 'Beauty services', noun: 'beauty services',      kind: 'vol',   fmt: dpMoney, monthly: () => ['beautyServices'], pick: s => s.beautyServicesTotal, beauty: true },
  treat:    { label: 'Treatments',      noun: 'treatment revenue',    kind: 'vol',   fmt: dpMoney, monthly: () => ['hairTreatment'], pick: s => s.treatmentSales },
  clients:  { label: 'Total clients',   noun: 'clients served',       kind: 'vol',   fmt: dpCount('clients'), monthly: () => ['totalClients'], pick: s => s.totalClients },
  newc:     { label: 'New clients',     noun: 'new clients',          kind: 'vol',   fmt: dpCount('new'),     monthly: () => ['newClients'],   pick: s => s.newClientsTotal },
  // NCR is New Client Requests: a COUNT with its own monthly target (the Pulse's 18 / 18 / 17 / 17 unless the
  // Monthly Targets tab holds one, ncrMonthlyTarget() in dashboard.js), and its share of the day's clients, which
  // is how the Client Funnel on the Pulse prints it. The share has no target (20% was never reachable, 7 Oct), so
  // it is drawn as plain values, not graded.
  ncr:      { label: 'NCR',             noun: 'NCR (new client requests)', kind: 'vol', fmt: dpCount(''),       tgtFn: (code, month) => (typeof ncrMonthlyTarget === 'function' ? ncrMonthlyTarget(code, month) : dpMonthTarget(month, code, ['ncr'])), pick: s => s.ncrTotal },
  ncrp:     { label: 'NCR %',           noun: 'NCR as a share of clients', kind: 'ratio', fmt: dpPct1, notarget: true, pick: s => (s.totalClients ? (s.ncrTotal || 0) / s.totalClients * 100 : null) },
  rebook:   { label: 'Rebooking %',     noun: 'rebooking %',          kind: 'ratio', fmt: dpPctF, bm: 'rebookPct',    pick: s => (s.rebookPct != null ? s.rebookPct : s.hairRebookPct) },
  treatp:   { label: 'Treatment %',     noun: 'treatment %',          kind: 'ratio', fmt: dpPctF, bm: 'treatmentPct', pick: s => (s.treatmentSales == null || !(s.hairServicesIncl || 0)) ? null : s.treatmentSales / s.hairServicesIncl * 100 },
  retailp:  { label: 'Retail %',        noun: 'retail %',             kind: 'ratio', fmt: dpPctF, bm: 'retailPct',    pick: s => { const n = (s.hairServicesIncl || 0) + (s.hairRetailOnly || 0); return n ? (s.hairRetailOnly || 0) / n * 100 : null; } },
  hairbill: { label: 'Hair avg bill',   noun: 'hair average bill',    kind: 'ratio', fmt: dpMoney, bm: 'hairAvgBill',  pick: s => s.hairAvgBill },
  beautybill: { label: 'Beauty avg bill', noun: 'beauty average bill', kind: 'ratio', fmt: dpMoney, bm: 'beautyAvgBill', pick: s => s.beautyAvgBill, beauty: true },
  util:     { label: 'Utilisation',     noun: 'utilisation',          kind: 'ratio', fmt: dpPctF, util: true },
};
// The radar: every measure that has a target, the ten that say most about a branch's shape ticked by default.
// Kate, 13 Oct 2026: that ten is the default, and any of them can be taken off or the rest put on (Customise).
const DP_RADAR_ALL = [['sales', 'Total sales'], ['services', 'Services'], ['retail', 'Retail'], ['hair', 'Hair revenue'], ['beauty', 'Beauty'],
  ['treat', 'Treatments'], ['clients', 'Clients'], ['newc', 'New clients'], ['ncr', 'NCR'], ['rebook', 'Rebooking'], ['treatp', 'Treatment %'],
  ['retailp', 'Retail %'], ['hairbill', 'Hair avg bill'], ['beautybill', 'Beauty avg bill'], ['util', 'Utilisation']];
const DP_RADAR_DEFAULT = ['sales', 'retail', 'treat', 'clients', 'newc', 'ncr', 'rebook', 'retailp', 'hairbill', 'util'];
function dpRadarSel() {
  const ok = new Set(DP_RADAR_ALL.map(x => x[0]));
  const pick = (Array.isArray(DP.radar) ? DP.radar : DP_RADAR_DEFAULT).filter(k => ok.has(k));
  return DP_RADAR_ALL.filter(x => pick.includes(x[0]));
}

const DP_DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dpEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dpYmd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dpParse = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
const dpAdd = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const dpDayLabel = d => `${DP_DOW[d.getDay()]} ${d.getDate()} ${MON_SHORT[d.getMonth()]}`;
const dpCodes = () => ['SAA', 'KCA', 'MC', 'AQ'].filter(c => ACTIVE_BRANCHES.includes(c));
const dpName = c => (BRANCH_INFO[c] && BRANCH_INFO[c].name) || c;

// ── CSS (once). Branch colours follow the theme: the pastel on dark, the darker hue on a light card. ───────
function dpCss() {
  if (document.getElementById('dpCss')) return;
  const codes = ['SAA', 'KCA', 'MC', 'AQ'];
  const light = codes.map(c => `--c-${c}:${(BRANCH_INFO[c] && BRANCH_INFO[c].colorLight) || '#888'}`).join(';');
  const dark  = codes.map(c => `--c-${c}:${(BRANCH_INFO[c] && BRANCH_INFO[c].color) || '#aaa'}`).join(';');
  const st = document.createElement('style'); st.id = 'dpCss';
  st.textContent = `
  .dpf{${light};--dv-n2:#e34948;--dv-n2-t:#fff;--dv-n1:#f2a3a2;--dv-n1-t:#1A1A1A;--dv-0:#ECE8DF;--dv-0-t:#1A1A1A;--dv-p1:#9ec5f4;--dv-p1-t:#1A1A1A;--dv-p2:#256abf;--dv-p2-t:#fff;width:100%;max-width:1180px;margin:0 auto;color:var(--text)}
  [data-theme="dark"] .dpf{${dark};--dv-n2:#e66767;--dv-n2-t:#1A1A1A;--dv-n1:#8f4a49;--dv-n1-t:#fff;--dv-0:#4a4a46;--dv-0-t:#f4f1ea;--dv-p1:#3a6aa8;--dv-p1-t:#fff;--dv-p2:#6da7ec;--dv-p2-t:#1A1A1A}
  .dpf *{box-sizing:border-box;min-width:0}
  .dpf h1{font-family:'Playfair Display',serif;font-weight:500;font-size:clamp(28px,6vw,44px);line-height:1.08;margin:18px 0 8px}
  .dpf .dp-deck{font-family:'Playfair Display',serif;font-style:italic;color:var(--muted);font-size:clamp(15px,3.6vw,18px);margin:0 0 16px;line-height:1.4;max-width:70ch}
  .dpf .dp-lab{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--muted2);min-width:88px}
  .dpf .dp-panel{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-card,10px);padding:10px 14px;margin-bottom:10px;display:grid;gap:8px}
  .dpf .dp-row{display:flex;gap:8px 12px;flex-wrap:wrap;align-items:center}
  .dpf .dp-pills{display:flex;gap:6px;flex-wrap:wrap}
  .dpf .dp-pill{appearance:none;border:1px solid var(--border);background:var(--surface);color:var(--text);font:500 14px Inter,sans-serif;padding:6px 14px;border-radius:18px;cursor:pointer;white-space:nowrap}
  .dpf .dp-pill[aria-pressed=true]{background:var(--accent);color:var(--accent-fg);border-color:var(--accent)}
  .dpf .dp-pill .dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px}
  .dpf .dp-date{padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font:14px Inter,sans-serif}
  .dpf .dp-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin:12px 0 16px}
  .dpf .dp-tile{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-card,10px);box-shadow:var(--shadow-card,none);padding:14px 16px}
  .dpf .dp-tile .nm{display:flex;align-items:center;gap:8px;font-weight:600}
  .dpf .dot{display:inline-block;width:10px;height:10px;border-radius:50%;flex:none}
  .dpf .dp-tile .big{font-size:28px;font-weight:700;line-height:1.1;margin-top:6px;font-variant-numeric:tabular-nums}
  .dpf .dp-sub{font-size:13px;color:var(--muted);line-height:1.4}
  .dpf .dp-chip{display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:600;border-radius:10px;padding:1px 8px;margin-top:6px}
  .dpf .dp-chip.good{background:var(--good-bg);color:var(--good)}.dpf .dp-chip.warn{background:var(--warn-bg);color:var(--warn)}.dpf .dp-chip.bad{background:var(--bad-bg);color:var(--bad)}.dpf .dp-chip.na{background:var(--surface2);color:var(--muted)}
  .dpf .dp-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-card,10px);box-shadow:var(--shadow-card,none);padding:16px 18px;margin-bottom:16px}
  .dpf .dp-card h2{font-size:17px;margin:0;font-weight:700}
  .dpf .dp-why{font-size:13px;color:var(--muted);margin:2px 0 10px;line-height:1.45}
  .dpf .dp-head{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start}
  .dpf .dp-legend{display:flex;gap:6px 16px;flex-wrap:wrap;font-size:13px;color:var(--muted);margin:10px 0 6px}
  .dpf .dp-legend span{display:inline-flex;align-items:center;gap:6px}
  .dpf .dp-legend svg{width:22px;height:8px;display:inline}
  .dpf svg.dp-svg{display:block;width:100%;height:auto;overflow:visible;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
  .dpf svg text{fill:var(--muted2);font-family:Inter,sans-serif;font-size:12px}
  .dpf svg text.tv{fill:var(--text);font-weight:600}
  .dpf .dp-two{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
  .dpf .dp-two .dp-card{margin-bottom:0}
  .dpf .dp-sw{display:grid;grid-template-columns:minmax(280px,1.1fr) 1fr;gap:24px;align-items:center}
  .dpf .dp-swl h3{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted2);margin:0 0 4px;font-weight:600}
  .dpf .dp-swl h3:not(:first-child){margin-top:18px}
  .dpf .dp-swr{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border2)}
  .dpf .dp-swr .dp-chip{margin-top:0;white-space:nowrap}
  .dpf .dp-key{display:flex;gap:4px 14px;align-items:center;font-size:12px;color:var(--muted);flex-wrap:wrap;margin-top:8px}
  .dpf .dp-key i{display:inline-block;width:14px;height:14px;border-radius:3px;margin-right:5px;vertical-align:-3px}
  .dpf details{margin-top:8px;font-size:13px;color:var(--muted)}
  .dpf summary{cursor:pointer}
  .dpf table.dp-tbl{border-collapse:collapse;width:100%;font-size:12.5px;margin-top:6px}
  .dpf .dp-tbl th,.dpf .dp-tbl td{border-bottom:1px solid var(--border2);padding:3px 6px;text-align:right;white-space:nowrap}
  .dpf .dp-tbl th:first-child,.dpf .dp-tbl td:first-child{text-align:left}
  .dpf .dp-scroll{overflow-x:auto}
  .dpf .dp-note{font-size:12.5px;color:var(--muted2);line-height:1.55;margin:6px 0 0}
  .dpf .dp-note b{color:var(--text)}
  .dpf .dp-cust{margin:8px 0 2px;border:1px solid var(--border);border-radius:8px;padding:8px 12px;background:var(--surface2)}
  .dpf .dp-cust summary{font-weight:600;color:var(--text)}
  .dpf .dp-cg{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;margin-top:8px}
  .dpf .dp-chk{display:inline-flex;align-items:center;gap:6px;font-size:13.5px;color:var(--text);cursor:pointer;white-space:nowrap}
  .dpf .dp-wk{display:grid;grid-template-columns:48px repeat(7,minmax(0,1fr));gap:5px;align-items:stretch}
  .dpf .dp-wh{font-size:12px;font-weight:600;color:var(--muted2);text-align:center;padding-bottom:2px}
  .dpf .dp-wl{display:flex;align-items:center;font-weight:600;font-size:13px}
  .dpf .dp-wc{border-radius:8px;min-height:46px;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:14px;font-variant-numeric:tabular-nums}
  .dpf .dp-wc.best{outline:2px solid var(--text);outline-offset:-2px}
  .dpf .dp-wc.slow{outline:2px dashed var(--text);outline-offset:-2px}
  .dpf .dp-hit .xh{opacity:0}.dpf .dp-hit:hover .xh{opacity:1}
  .dpf .dp-err{background:var(--bad-bg);color:var(--bad);border-radius:8px;padding:10px 14px;margin:12px 0}
  .dp-tip{position:fixed;pointer-events:none;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:8px 10px;font-size:13px;box-shadow:0 6px 20px rgba(0,0,0,.18);z-index:9999;display:none;min-width:150px;font-family:Inter,sans-serif}
  .dp-tip b{display:block;margin-bottom:3px}.dp-tip .r{display:flex;justify-content:space-between;gap:14px}
  @media(max-width:900px){.dpf .dp-two{grid-template-columns:1fr}.dpf .dp-sw{grid-template-columns:1fr}}
  @media(max-width:560px){.dpf .dp-lab{min-width:100%}}`;
  document.head.appendChild(st);
}

// ── THE WINDOW ──────────────────────────────────────────────
// Ends yesterday: today is half a day. On the 1st there is no month to date yet, so it shows last month.
function dpWindow() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yest = dpAdd(today, -1);
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const prevFirst = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  let from, to, note = '';
  if (DP.period === 'last7') { to = yest; from = dpAdd(yest, -6); }
  else if (DP.period === 'last30') { to = yest; from = dpAdd(yest, -29); }
  else if (DP.period === 'lastmonth') { from = prevFirst; to = new Date(today.getFullYear(), today.getMonth(), 0); }
  else if (DP.period === 'custom' && DP.from && DP.to) {
    from = dpParse(DP.from); to = dpParse(DP.to);
    if (to > yest) to = yest;
    if (from > to) from = to;
    if ((to - from) / 864e5 > 61) { from = dpAdd(to, -61); note = 'Custom is capped at 62 days, so the chart stays readable.'; }
  } else {
    from = first; to = yest;
    if (to < from) { from = prevFirst; to = new Date(today.getFullYear(), today.getMonth(), 0); note = 'It is the 1st, so this shows last month.'; }
  }
  return { from, to, yest, note };
}

// ── LOAD ────────────────────────────────────────────────────
async function dpLoad(win) {
  const codes = dpCodes();
  // A recent window also loads the 13 weeks behind it, so the weekday chart has more than one or two of each day.
  const recent = win.to >= dpAdd(win.yest, -14);
  const loadFrom = recent ? new Date(Math.min(win.from, dpAdd(win.yest, -90))) : win.from;
  const loadTo = recent ? new Date(Math.max(win.to, win.yest)) : win.to;
  const key = dpYmd(loadFrom) + '|' + dpYmd(loadTo);
  if (DPD && DPD.key === key) return DPD;

  await lgLoadClosedDays();
  const months = [];
  for (let d = new Date(loadFrom.getFullYear(), loadFrom.getMonth(), 1); d <= loadTo; d.setMonth(d.getMonth() + 1)) {
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const [branchRows, phorestRows, utilRows] = await Promise.all([
    loadBranchStaffDailyRange(loadFrom, loadTo),
    loadPhorestStaffDailyRange(loadFrom, loadTo),
    loadUtilisationForFilter(loadFrom, loadTo, codes).catch(() => []),
    ...months.map(m => lgLoadDbTargets(m).catch(() => null)),
  ]);
  const deptMap = await loadUtilDeptMap(branchRows, loadTo).catch(() => ({}));

  const days = [];
  for (let d = new Date(loadFrom); d <= loadTo; d = dpAdd(d, 1)) days.push(new Date(d));
  const idx = (rows, dateOf) => {
    const m = new Map();
    (rows || []).forEach(r => { const k = r.branch + '|' + String(dateOf(r)).slice(0, 10); (m.get(k) || m.set(k, []).get(k)).push(r); });
    return m;
  };
  const bI = idx(branchRows, r => r.date), pI = idx(phorestRows, r => r.date);
  // One utilisation row per person per day; the weekly-report rows (date_from != date_to) are not a day.
  const uI = idx((utilRows || []).filter(r => String(r.date_from).slice(0, 10) === String(r.date_to).slice(0, 10)), r => r.date_from);

  const byCode = {};
  codes.forEach(code => {
    const sum = [], util = [], closed = [];
    days.forEach(d => {
      const k = code + '|' + dpYmd(d);
      const agg = aggDailyData([], bI.get(k) || [], pI.get(k) || []);
      sum.push((agg && agg.summary) || null);
      const ur = uI.get(k);
      util.push(ur && ur.length ? aggregateUtilisation(ur, deptMap) : null);
      closed.push(lgIsClosedDay(code, d));
    });
    byCode[code] = { sum, util, closed };
  });
  // Hair only: no beauty money or clients anywhere in what was loaded (Motor City).
  const hairOnly = {};
  codes.forEach(code => {
    hairOnly[code] = !byCode[code].sum.some(s => s && ((s.beautyServicesTotal || 0) > 0 || (s.beautyTotalClients || 0) > 0));
  });
  DPD = { key, days, byCode, hairOnly, codes };
  dpMemo = new Map();
  return DPD;
}

// ── TARGETS ─────────────────────────────────────────────────
function dpMonthTarget(month, code, keys) {
  const src = lgTargetSource(month);
  if (!src || src.kind === 'none') return null;
  const b = src.data.branch && src.data.branch[code];
  if (!b) return null;
  let sum = 0, any = false;
  for (const k of keys) {
    const neg = k.charAt(0) === '-', kk = neg ? k.slice(1) : k, v = b[kk];
    if (v == null) { if (!neg) return null; continue; }
    any = true; sum += neg ? -Number(v) : Number(v);
  }
  return any && sum > 0 ? sum : null;
}
function dpTradingDays(month, code) {
  const [y, m] = month.split('-').map(Number);
  const n = new Date(y, m, 0).getDate();
  let open = 0;
  for (let i = 1; i <= n; i++) if (!lgIsClosedDay(code, new Date(y, m - 1, i))) open++;
  return open;
}
function dpBenchmark(bm, date) {
  if (bm === 'rebookPct') return dpYmd(date) >= '2026-09-01' ? 70 : 45;
  const b = (typeof bpBenchmarks === 'function') ? bpBenchmarks() : {};
  const v = b[bm];
  return v == null ? null : Number(v);
}

// One cell: { v, t, p, state }. state: ok | closed | nodata | na (a beauty measure at a hair-only branch).
function dpCell(mk, code, i) {
  const key = mk + '|' + code + '|' + i;
  if (dpMemo.has(key)) return dpMemo.get(key);
  const M = DP_M[mk], D = DPD, c = D.byCode[code], date = D.days[i];
  let out;
  if (M.beauty && D.hairOnly[code]) out = { state: 'na' };
  else if (c.closed[i]) out = { state: 'closed' };
  else {
    let v = null, t = null;
    if (M.util) {
      const u = c.util[i];
      if (u) {
        const avail = u.hairAvail + u.beautyAvail;
        if (avail > 0) {
          v = (u.hairHours + u.beautyHours) / avail * 100;
          t = (u.hairAvail * TARGETS.hairUtilPct + u.beautyAvail * TARGETS.beautyUtilPct) / avail;
        }
      }
    } else if (c.sum[i]) {
      const s = c.sum[i];
      const trading = (lgTotalRevenue(s) || 0) > 0;
      if (trading) { const x = M.pick(s); v = x == null || !isFinite(x) ? null : Number(x); }
    }
    if (!M.util) {
      if (M.notarget) t = null;
      else if (M.bm) t = dpBenchmark(M.bm, date);
      else {
        const month = dpYmd(date).slice(0, 7), mt = M.tgtFn ? M.tgtFn(code, month) : dpMonthTarget(month, code, M.monthly()), td = dpTradingDays(month, code);
        t = mt && td ? mt / td : null;
      }
    }
    if (v == null) out = { state: c.closed[i] ? 'closed' : 'nodata' };
    else out = { state: 'ok', v, t: t || null, p: t ? v / t * 100 : null };
  }
  dpMemo.set(key, out);
  return out;
}
const dpWhy = st => st === 'closed' ? 'Closed' : st === 'na' ? 'Not tracked' : 'No figures';

// Indexes of the loaded days that sit inside the window.
function dpIdx(win) {
  const out = [];
  DPD.days.forEach((d, i) => { if (d >= win.from && d <= win.to) out.push(i); });
  return out;
}

// ── TOOLTIP (delegated: any element with data-tip) ──────────
let dpTipEl = null;
function dpTipShow(e, html) {
  if (!dpTipEl) { dpTipEl = document.createElement('div'); dpTipEl.className = 'dp-tip'; document.body.appendChild(dpTipEl); }
  dpTipEl.innerHTML = html; dpTipEl.style.display = 'block';
  const w = dpTipEl.offsetWidth; let x = e.clientX + 14;
  if (x + w > window.innerWidth - 8) x = e.clientX - w - 14;
  dpTipEl.style.left = Math.max(8, x) + 'px'; dpTipEl.style.top = Math.max(8, e.clientY - 10) + 'px';
}
function dpTipHide() { if (dpTipEl) dpTipEl.style.display = 'none'; }
function dpBindTips(host) {
  const move = e => {
    const t = e.target.closest && e.target.closest('[data-tip]');
    if (t && host.contains(t)) dpTipShow(e, t.getAttribute('data-tip')); else dpTipHide();
  };
  host.addEventListener('pointermove', move);
  host.addEventListener('pointerdown', move);
  host.addEventListener('pointerleave', dpTipHide);
}

// ── STATUS ──────────────────────────────────────────────────
function dpStatus(p) {
  if (p == null) return ['na', 'No target set', '–'];
  if (p >= 100) return ['good', 'On target', '✓'];
  if (p >= 90) return ['warn', 'Close', '▲'];
  return ['bad', 'Below target', '▼'];
}
const dpCol = c => `var(--c-${c})`;
const dpW = host => Math.max(300, Math.round((host && host.clientWidth) || 700));

// ── TILES ───────────────────────────────────────────────────
function dpCurve(pts) {
  const n = pts.length, f = v => v.toFixed(1);
  if (!n) return '';
  if (n === 1) return `M${f(pts[0][0])} ${f(pts[0][1])}`;
  const dx = [], m = [];
  for (let k = 0; k < n - 1; k++) { dx[k] = pts[k + 1][0] - pts[k][0]; m[k] = (pts[k + 1][1] - pts[k][1]) / (dx[k] || 1); }
  const tg = [m[0]];
  for (let k = 1; k < n - 1; k++) tg[k] = m[k - 1] * m[k] <= 0 ? 0 : (m[k - 1] + m[k]) / 2;
  tg[n - 1] = m[n - 2];
  for (let k = 0; k < n - 1; k++) {
    if (m[k] === 0) { tg[k] = 0; tg[k + 1] = 0; continue; }
    const a = tg[k] / m[k], b = tg[k + 1] / m[k], q = a * a + b * b;
    if (q > 9) { const u = 3 / Math.sqrt(q); tg[k] = u * a * m[k]; tg[k + 1] = u * b * m[k]; }
  }
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let k = 0; k < n - 1; k++) {
    const h = dx[k] / 3;
    d += ` C${f(pts[k][0] + h)} ${f(pts[k][1] + tg[k] * h)} ${f(pts[k + 1][0] - h)} ${f(pts[k + 1][1] - tg[k + 1] * h)} ${f(pts[k + 1][0])} ${f(pts[k + 1][1])}`;
  }
  return d;
}
function dpPctScale(vals) {
  const v = vals.filter(x => x != null && isFinite(x));
  const mx = Math.max(140, ...v), mn = Math.min(40, ...v);
  const hi = Math.min(400, Math.ceil(mx / 20) * 20), lo = Math.max(0, Math.floor(mn / 20) * 20);
  const step = (hi - lo) <= 140 ? 20 : (hi - lo) <= 260 ? 50 : 100;   // all divide 100, so the target line always has a tick
  const ticks = [];
  for (let t = Math.floor(lo / step) * step + step; t <= hi; t += step) ticks.push(t);
  return { lo, hi, ticks };
}
function dpSpark(code, idxs, mk) {
  const W = 220, H = 44, raw = !!DP_M[mk].notarget;
  const vals = idxs.map(i => { const c = dpCell(mk, code, i); return c.state === 'ok' ? (raw ? c.v : c.p) : null; });
  const ok = vals.filter(v => v != null);
  if (!ok.length) return '';
  const sc = raw ? null : dpPctScale(ok);
  const lo = raw ? 0 : sc.lo, hi = raw ? (Math.max(...ok) * 1.15 || 1) : sc.hi;
  const x = k => 2 + k * (W - 4) / Math.max(1, idxs.length - 1);
  const y = p => H - 2 - (Math.min(Math.max(p, lo), hi) - lo) / (hi - lo) * (H - 4);
  const segs = []; let cur = [];
  vals.forEach((v, k) => { if (v != null) cur.push([x(k), y(v)]); else { if (cur.length) segs.push(cur); cur = []; } });
  if (cur.length) segs.push(cur);
  const last = segs[segs.length - 1], lp = last[last.length - 1], t = y(100);
  return `<svg class="dp-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${dpEsc(dpName(code))} trend">
    ${raw ? '' : `<line x1="0" x2="${W}" y1="${t}" y2="${t}" stroke="var(--border)" stroke-dasharray="3 3"/>`}
    ${segs.map(sg => sg.length > 1 ? `<path d="${dpCurve(sg)}" fill="none" stroke="${dpCol(code)}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` : '').join('')}
    <circle cx="${lp[0]}" cy="${lp[1]}" r="4" fill="${dpCol(code)}" stroke="var(--surface)" stroke-width="2"/></svg>`;
}
// Which branches are showing. null means All. Clicking a branch while All is on isolates it; after that each click
// adds or takes one off (never the last), and All puts them all back. Kate, 13 Oct 2026: "toggle however many
// branches we'd like, ALL toggle included".
function dpSel() {
  const all = DPD.codes, pick = all.filter(c => !DP.branches || DP.branches.includes(c));
  return pick.length ? pick : all;
}
function dpToggleBranch(code) {
  const all = DPD.codes, cur = dpSel();
  if (code === 'ALL') DP.branches = null;
  else if (cur.length === all.length) DP.branches = [code];
  else if (cur.includes(code)) { const next = cur.filter(c => c !== code); DP.branches = next.length ? next : cur; }
  else DP.branches = all.filter(c => cur.includes(c) || c === code);
  if (DP.branches && DP.branches.length === all.length) DP.branches = null;
}
function dpTiles(win, idxs) {
  const mk = DP.measure, M = DP_M[mk];
  return dpSel().map(code => {
    const head = `<div class="nm"><span class="dot" style="background:${dpCol(code)}"></span>${dpEsc(dpName(code))}</div>`;
    if (M.beauty && DPD.hairOnly[code]) return `<div class="dp-tile">${head}<div class="big" style="color:var(--muted2)">n/a</div><div class="dp-sub">No Beauty team at this branch</div><span class="dp-chip na">– Not tracked</span></div>`;
    let li = -1;
    for (let k = idxs.length - 1; k >= 0; k--) if (dpCell(mk, code, idxs[k]).state === 'ok') { li = idxs[k]; break; }
    if (li < 0) return `<div class="dp-tile">${head}<div class="big" style="color:var(--muted2)">—</div><div class="dp-sub">No figures in this window yet</div></div>`;
    const c = dpCell(mk, code, li), [cls, txt, ic] = dpStatus(c.p);
    const lastIdx = idxs[idxs.length - 1];
    const shut = dpCell(mk, code, lastIdx).state !== 'ok';
    return `<div class="dp-tile">${head}<div class="big">${M.fmt(c.v)}</div>
      <div class="dp-sub">${shut ? (dpCell(mk, code, lastIdx).state === 'closed' ? 'Closed ' + dpDayLabel(DPD.days[lastIdx]) + ' · last open ' : 'Latest figures ') : ''}${dpDayLabel(DPD.days[li])}${c.t ? ' · target ' + M.fmt(c.t) : ''}</div>
      <span class="dp-chip ${cls}">${ic} ${c.p != null ? Math.round(c.p) + '% · ' : ''}${txt}</span>
      <div style="margin-top:8px;max-width:260px">${dpSpark(code, idxs, mk)}</div></div>`;
  }).join('');
}

// ── CHART A: every branch on one scale ─────────────────────
// % of target, or the plain values when the measure has no target at all (NCR %), where the axis starts at 0.
function dpChartA(host, idxs) {
  const mk = DP.measure, M = DP_M[mk], W = dpW(host), n = idxs.length, raw = !!M.notarget;
  const H = Math.round(Math.min(340, Math.max(230, W * .34))), m = { l: 42, r: 46, t: 10, b: 26 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const val = c => (raw ? c.v : c.p);
  const okc = (code, i) => { const c = dpCell(mk, code, i); return c.state === 'ok' && val(c) != null ? c : null; };
  const tracked = dpSel().filter(c => idxs.some(i => okc(c, i)));
  let lo = 40, hi = 140, ticks = [60, 80, 100, 120, 140], tfmt = v => v + '%';
  if (raw && tracked.length) {
    const mx = Math.max(1e-9, ...tracked.flatMap(c => idxs.map(i => okc(c, i)).filter(Boolean).map(z => z.v)));
    const nice = dpNice(mx * 1.1);
    lo = 0; hi = Math.ceil(mx * 1.1 / nice) * nice; ticks = [];
    for (let v = 0; v <= hi + 1e-9; v += nice) ticks.push(v);
    tfmt = v => dpAxis(mk, v, hi);
  } else if (!raw) {
    const sc = dpPctScale(tracked.flatMap(c => idxs.map(i => okc(c, i)).filter(Boolean).map(z => z.p)));
    lo = sc.lo; hi = sc.hi; ticks = sc.ticks;
  }
  const x = k => m.l + (n === 1 ? iw / 2 : k * iw / (n - 1)), y = p => m.t + ih - (Math.min(Math.max(p, lo), hi) - lo) / (hi - lo) * ih;
  let g = '';
  ticks.forEach(v => {
    const ref = !raw && v === 100;
    g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--border)"${ref ? ' stroke-dasharray="5 4" stroke-width="1.5"' : ''}/><text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${tfmt(v)}</text>`;
  });
  const step = Math.max(1, Math.ceil(n / (W < 520 ? 7 : 14)));
  idxs.forEach((i, k) => { if (k % step === 0) g += `<text x="${x(k)}" y="${H - 6}" text-anchor="middle">${DPD.days[i].getDate()} ${DP_DOW[DPD.days[i].getDay()][0]}</text>`; });
  const ends = [];
  tracked.forEach(code => {
    const runs = []; let cur = [];
    idxs.forEach((i, k) => { const c = okc(code, i); if (c) cur.push([x(k), y(val(c))]); else { if (cur.length) runs.push(cur); cur = []; } });
    if (cur.length) runs.push(cur);
    runs.forEach(r => {
      if (r.length > 1) g += `<path d="${dpCurve(r)}" fill="none" stroke="${dpCol(code)}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      r.forEach(q => { g += `<circle cx="${q[0]}" cy="${q[1]}" r="3" fill="${dpCol(code)}" stroke="var(--surface)" stroke-width="1.5"/>`; });
    });
    if (runs.length) { const l = runs[runs.length - 1]; ends.push({ code, y: l[l.length - 1][1] }); }
  });
  ends.sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 14) ends[k].y = ends[k - 1].y + 14;
  ends.forEach(e => { g += `<text class="tv" x="${W - m.r + 4}" y="${e.y + 4}">${e.code}</text>`; });
  // hover columns: one per day, tooltip lists every branch
  const cw = n === 1 ? iw : iw / (n - 1);
  idxs.forEach((i, k) => {
    const tip = `<b>${dpDayLabel(DPD.days[i])}</b>` + dpSel().map(code => {
      const c = dpCell(mk, code, i);
      const v = c.state !== 'ok' ? dpWhy(c.state) : M.fmt(c.v) + (raw ? '' : (c.p != null ? ' \u00B7 ' + Math.round(c.p) + '%' : ' \u00B7 no target'));
      return `<div class="r"><span><span class="dot" style="background:${dpCol(code)}"></span> ${code}</span><span>${v}</span></div>`;
    }).join('');
    g += `<g class="dp-hit"><line class="xh" x1="${x(k)}" x2="${x(k)}" y1="${m.t}" y2="${m.t + ih}" stroke="var(--muted2)"/><rect x="${x(k) - cw / 2}" y="${m.t}" width="${cw}" height="${ih}" fill="transparent" data-tip="${dpEsc(tip)}"/></g>`;
  });
  const legend = tracked.map(c => `<span><i class="dot" style="background:${dpCol(c)}"></i>${dpEsc(dpName(c))}</span>`).join('')
    + (raw ? '' : '<span><svg viewBox="0 0 22 8"><line x1="0" x2="22" y1="4" y2="4" stroke="var(--muted2)" stroke-dasharray="5 4" stroke-width="1.5"/></svg>Daily target (100%)</span>')
    + (tracked.length < dpSel().length ? '<span>A branch with no line has no target set, or is not tracked, for this measure</span>' : '');
  const cellTxt = c => (c.state !== 'ok' ? dpWhy(c.state) : (raw ? M.fmt(c.v) : (c.p != null ? Math.round(c.p) + '%' : M.fmt(c.v))));
  const table = `<div class="dp-scroll"><table class="dp-tbl"><tr><th>Day</th>${dpSel().map(c => `<th>${c}</th>`).join('')}</tr>${idxs.map(i => `<tr><td>${dpDayLabel(DPD.days[i])}</td>${dpSel().map(code => `<td>${cellTxt(dpCell(mk, code, i))}</td>`).join('')}</tr>`).join('')}</table></div>`;
  if (!tracked.length) return `<p class="dp-why" style="margin:20px 0">No branch has a target set for ${dpEsc(M.noun)} in this window, so there is nothing to put on one scale. The branch tiles above still show the figures.</p>`;
  return `<div class="dp-legend">${legend}</div><svg class="dp-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Daily ${dpEsc(M.noun)}${raw ? '' : ' as a percentage of target'}, by branch">${g}</svg><details><summary>View as table</summary>${table}</details>`;
}

// ── CHART B: one branch, bars + 7-day average + target ──────
function dpNice(raw) {
  const e = Math.pow(10, Math.floor(Math.log10(raw / 4))), f = raw / 4 / e;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
}
function dpAxis(mk, v, mx) {
  if (DP_M[mk].fmt === dpPctF || DP_M[mk].fmt === dpPct1) return (Math.round(v * 10) / 10) + '%';
  if (DP_M[mk].fmt === dpMoney && mx >= 2500) return (v / 1000).toFixed(mx < 6000 ? 1 : 0).replace('.0', '') + 'k';
  return Math.round(v);
}
// The chosen branches as one: a count or money adds up (value against target, only for the branches that have both
// that day, so the two sides always cover the same branches); a ratio is the plain average of the branches.
function dpCombine(mk, codes, i) {
  const M = DP_M[mk], cs = codes.map(c => dpCell(mk, c, i));
  const oks = cs.filter(c => c.state === 'ok');
  if (!oks.length) return { state: cs.every(c => c.state === 'closed' || c.state === 'na') ? 'closed' : 'nodata' };
  const vol = M.kind === 'vol', both = oks.filter(c => c.t != null);
  if (!both.length) return { state: 'ok', v: vol ? oks.reduce((s, c) => s + c.v, 0) : oks.reduce((s, c) => s + c.v, 0) / oks.length, t: null, p: null };
  const sv = both.reduce((s, c) => s + c.v, 0), st = both.reduce((s, c) => s + c.t, 0);
  const v = vol ? sv : sv / both.length, t = vol ? st : st / both.length;
  return { state: 'ok', v, t, p: v / t * 100 };
}
function dpChartB(host, idxs, codes) {
  const mk = DP.measure, M = DP_M[mk], W = dpW(host), n = idxs.length, multi = codes.length > 1, code = codes[0];
  const name = multi ? (codes.length === DPD.codes.length ? 'All branches' : codes.join(' + ')) : dpName(code);
  const title = multi ? `${name}, combined: daily ${M.noun} and 7-day average` : `${name}: daily ${M.noun} and 7-day average`;
  const color = multi ? 'var(--muted2)' : dpCol(code);
  if (!multi && M.beauty && DPD.hairOnly[code]) return { title, html: `<p class="dp-why" style="margin:24px 0">${dpEsc(dpName(code))} has no Beauty team, so there is nothing to show for ${dpEsc(M.noun)}. Pick another branch.</p>`, why: 'Not tracked at this branch.', legend: '' };
  const cells = idxs.map(i => multi ? dpCombine(mk, codes, i) : dpCell(mk, code, i));
  const vals = cells.map(c => c.state === 'ok' ? c.v : null);
  const ma = vals.map((v, k) => { if (v == null) return null; const w = vals.slice(Math.max(0, k - 6), k + 1).filter(z => z != null); return w.length >= 3 ? w.reduce((a, b) => a + b, 0) / w.length : null; });
  const tg = cells.map(c => c.t || null);
  const H = Math.round(Math.min(330, Math.max(220, W * .32))), m = { l: 52, r: 12, t: 12, b: 26 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const raw = Math.max(...vals.filter(v => v != null), ...tg.filter(v => v != null), 1) * 1.08;
  const nice = dpNice(raw), mx = Math.ceil(raw / nice) * nice, y = v => m.t + ih - v / mx * ih, bw = iw / n, bwid = Math.max(3, Math.min(34, bw * .62));
  let g = '';
  for (let v = 0; v <= mx + 1e-9; v += nice) g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--border)"/><text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${dpAxis(mk, v, mx)}</text>`;
  const step = Math.max(1, Math.ceil(n / (W < 520 ? 7 : 16)));
  cells.forEach((c, k) => {
    const cx = m.l + bw * k + bw / 2, date = DPD.days[idxs[k]];
    if (c.state === 'ok') {
      const below = c.t != null && c.v < c.t, yy = y(c.v), r = Math.min(4, bwid / 2);
      const parts = multi ? codes.map(b => { const z = dpCell(mk, b, idxs[k]); return `<div class="r"><span><span class="dot" style="background:${dpCol(b)}"></span> ${b}</span><span>${z.state === 'ok' ? M.fmt(z.v) : dpWhy(z.state)}</span></div>`; }).join('') : '';
      const tip = `<b>${dpDayLabel(date)}</b><div class="r"><span>${multi ? 'Combined' : M.label}</span><span>${M.fmt(c.v)}</span></div>${ma[k] != null ? `<div class="r"><span>7-day average</span><span>${M.fmt(ma[k])}</span></div>` : ''}${c.t ? `<div class="r"><span>Target</span><span>${M.fmt(c.t)}</span></div><div class="r"><span>vs target</span><span>${Math.round(c.p)}%</span></div>` : '<div class="r"><span>Target</span><span>not set</span></div>'}${parts}`;
      g += `<path d="M${cx - bwid / 2} ${m.t + ih} V${yy + r} Q${cx - bwid / 2} ${yy} ${cx - bwid / 2 + r} ${yy} H${cx + bwid / 2 - r} Q${cx + bwid / 2} ${yy} ${cx + bwid / 2} ${yy + r} V${m.t + ih} Z" style="fill:${color}" opacity="${below ? .45 : 1}" data-tip="${dpEsc(tip)}"/>`;
    } else if (c.state === 'closed') g += `<text x="${cx}" y="${m.t + ih - 6}" text-anchor="middle" font-size="10">${bw > 38 ? 'Closed' : '\u00D7'}</text>`;
    if (k % step === 0) g += `<text x="${cx}" y="${H - 6}" text-anchor="middle">${date.getDate()} ${DP_DOW[date.getDay()][0]}</text>`;
  });
  const tp = []; tg.forEach((t, k) => { if (t != null) { const xa = m.l + bw * k, xb = m.l + bw * (k + 1); tp.push((tp.length && tg[k - 1] != null ? 'L' : 'M') + xa + ' ' + y(t) + 'L' + xb + ' ' + y(t)); } });
  if (tp.length) g += `<path d="${tp.join('')}" fill="none" stroke="var(--muted2)" stroke-dasharray="5 4" stroke-width="1.5"/>`;
  // The target's number lives in the legend, not on the plot: a label on the line ran into the 7-day average and the bars.
  const tv = tg.filter(t => t != null), lastT = tv.length ? tv[tv.length - 1] : null;
  const steady = tv.length && (Math.max(...tv) - Math.min(...tv)) <= Math.max(...tv) * .01;
  const tLabel = lastT == null ? '' : (steady ? `Daily target ${M.fmt(lastT)}` : `Daily target (${M.fmt(lastT)} now)`);
  const pts = ma.map((v, k) => v == null ? null : [m.l + bw * k + bw / 2, y(v)]).filter(Boolean);
  if (pts.length > 1) {
    const d = dpCurve(pts), l = pts[pts.length - 1];
    g += `<path d="${d}" fill="none" stroke="var(--surface)" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/><path d="${d}" fill="none" stroke="var(--text)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${l[0]}" cy="${l[1]}" r="4.5" fill="var(--text)" stroke="var(--surface)" stroke-width="2"/>`;
  }
  const open = cells.filter(c => c.state === 'ok'), withT = open.filter(c => c.t != null), hit = withT.filter(c => c.v >= c.t).length;
  // who the combined bars leave out, and why, so a total is never quietly short
  const left = !multi ? [] : codes.map(b => (M.beauty && DPD.hairOnly[b]) ? `${b} (no Beauty team)` : (!M.notarget && !idxs.some(i => { const z = dpCell(mk, b, i); return z.state === 'ok' && z.t != null; })) ? `${b} (no target set)` : null).filter(Boolean);
  const why = `Bars are each day, the line smooths it so one big or small day does not fool you. ${withT.length ? `Pale bars fell short. ${hit} of ${withT.length} open days on target.` : 'No target is set for this measure here, so the bars are not graded.'}`
    + (multi ? ` ${M.kind === 'vol' ? 'The branches are added together' : 'A ratio is shown as the plain average of the branches, not weighted by clients'}, and a closed branch drops out of that day, target and all.` : '')
    + (left.length ? ` Left out: ${left.join(', ')}.` : '');
  const legend = `<span><i class="dot" style="background:${color};border-radius:3px"></i>${multi ? 'Daily combined' : 'Daily actual'}</span><span><svg viewBox="0 0 22 8"><line x1="0" x2="22" y1="4" y2="4" stroke="var(--text)" stroke-width="2.5"/></svg>7-day average</span>${withT.length ? '<span><svg viewBox="0 0 22 8"><line x1="0" x2="22" y1="4" y2="4" stroke="var(--muted2)" stroke-dasharray="5 4" stroke-width="1.5"/></svg>' + dpEsc(tLabel) + '</span>' : ''}`;
  if (!open.length) return { title, html: '<p class="dp-why" style="margin:24px 0">No figures for this selection in the window yet.</p>', why: '', legend: '' };
  return { title, html: `<svg class="dp-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${dpEsc(name)} daily ${dpEsc(M.noun)} with 7-day average">${g}</svg>`, why, legend };
}

// ── HEATMAP: branch by day ──────────────────────────────────
// Kate, 13 Oct 2026: "too crowded to interpret". So: full width, a square big enough to carry its own number,
// a small gap between weeks, the date and weekday under every column, and an ink colour chosen per square.
const DP_BIN_KEYS = ['n2', 'n1', '0', 'p1', 'p2'];
const DP_BIN_NAMES = ['Under 80%', '80\u201394%', '95\u2013105%', '106\u2013120%', 'Over 120%'];
const dpBin = p => p < 80 ? 0 : p < 95 ? 1 : p <= 105 ? 2 : p <= 120 ? 3 : 4;
const dpBinBg = i => `var(--dv-${DP_BIN_KEYS[i]})`;
const dpBinInk = i => `var(--dv-${DP_BIN_KEYS[i]}-t)`;
const dpShade = r => `color-mix(in srgb, var(--dv-p2) ${Math.round(14 + 46 * r)}%, transparent)`;   // size, for a measure with no target
function dpBinKey(raw) {
  return (raw ? '<span><i style="background:' + dpShade(.1) + '"></i>Lower</span><span><i style="background:' + dpShade(.5) + '"></i>Middle</span><span><i style="background:' + dpShade(1) + '"></i>Higher</span>'
    : DP_BIN_NAMES.map((t, i) => `<span><i style="background:${dpBinBg(i)}"></i>${t}</span>`).join(''))
    + '<span><i style="background:var(--surface2);border:1px solid var(--border)"></i>Closed, no figures or not tracked</span>';
}
function dpHeat(host, idxs) {
  const mk = DP.measure, M = DP_M[mk], codes = dpSel(), n = idxs.length, W = dpW(host), raw = !!M.notarget;
  const lm = 40, ch = 40, gap = 6, minCw = 24;
  const mondays = idxs.filter((i, k) => k > 0 && DPD.days[i].getDay() === 1).length;
  const cw = Math.max(minCw, (W - lm - mondays * gap) / n);
  const xs = []; let off = 0;
  idxs.forEach((i, k) => { if (k > 0 && DPD.days[i].getDay() === 1) off += gap; xs.push(lm + k * cw + off); });
  const SW = Math.round(lm + n * cw + off), H = 4 + ch * codes.length + 40, nums = cw >= 24;
  let mx = 0;
  if (raw) codes.forEach(code => idxs.forEach(i => { const c = dpCell(mk, code, i); if (c.state === 'ok' && c.v > mx) mx = c.v; }));
  let g = '';
  codes.forEach((code, r) => {
    g += `<text class="tv" x="0" y="${4 + r * ch + ch / 2 + 4}">${code}</text>`;
    idxs.forEach((i, k) => {
      const c = dpCell(mk, code, i), x = xs[k], yy = 4 + r * ch;
      const tip = `<b>${dpEsc(dpName(code))}</b><div>${dpDayLabel(DPD.days[i])}</div>` + (c.state !== 'ok' ? `<div>${dpWhy(c.state)}</div>` : `<div class="r"><span>${M.fmt(c.v)}</span><span>${raw ? '' : (c.p != null ? Math.round(c.p) + '% of target' : 'no target')}</span></div>`);
      let fill = 'var(--surface2)', ink = 'var(--muted2)', label = '';
      if (c.state === 'ok') {
        if (raw) { fill = dpShade(mx ? c.v / mx : 0); ink = 'var(--text)'; label = M.fmt(c.v).replace('%', ''); }
        else if (c.p != null) { const b = dpBin(c.p); fill = dpBinBg(b); ink = dpBinInk(b); label = String(Math.round(c.p)); }
      }
      g += `<rect x="${x + 1}" y="${yy + 1}" width="${cw - 2}" height="${ch - 2}" rx="6" style="fill:${fill}" data-tip="${dpEsc(tip)}"/>`;
      if (nums && label) g += `<text x="${x + cw / 2}" y="${yy + ch / 2 + 4}" text-anchor="middle" style="fill:${ink};font-size:11.5px;font-weight:600;pointer-events:none">${label}</text>`;
      if (c.state === 'closed' || c.state === 'na') g += `<path d="M${x + 5} ${yy + ch - 6} L${x + cw - 5} ${yy + 6}" stroke="var(--muted2)" stroke-width="1" pointer-events="none"/>`;
    });
  });
  const yb = 4 + ch * codes.length + 15, step = Math.max(1, Math.ceil(n / Math.floor((W - lm) / 28)));
  idxs.forEach((i, k) => {
    if (!nums && k % step !== 0) return;
    const d = DPD.days[i], cx = xs[k] + cw / 2;
    g += `<text class="tv" x="${cx}" y="${yb}" text-anchor="middle">${d.getDate()}</text><text x="${cx}" y="${yb + 14}" text-anchor="middle" style="font-size:10.5px">${DP_DOW[d.getDay()][0]}</text>`;
  });
  const cellTxt = c => (c.state !== 'ok' ? dpWhy(c.state) : (raw ? M.fmt(c.v) : (c.p != null ? Math.round(c.p) + '%' : '\u2014')));
  const table = `<div class="dp-scroll"><table class="dp-tbl"><tr><th>Day</th>${codes.map(c => `<th>${c}</th>`).join('')}</tr>${idxs.map(i => `<tr><td>${dpDayLabel(DPD.days[i])}</td>${codes.map(code => `<td>${cellTxt(dpCell(mk, code, i))}</td>`).join('')}</tr>`).join('')}</table></div>`;
  return `<div class="dp-scroll"><svg class="dp-svg" style="min-width:${SW}px" viewBox="0 0 ${SW} ${H}" role="img" aria-label="Branch by day">${g}</svg></div><div class="dp-key">${dpBinKey(raw)}</div><details><summary>View as table</summary>${table}</details>`;
}

// ── WEEKDAY PATTERN ─────────────────────────────────────────
// A grid, not 28 bars: one row per branch, one square per weekday, the average in it, the best day outlined and
// the slowest dashed. Same colours as the heatmap, so one key reads both.
function dpWeekday(host) {
  const mk = DP.measure, M = DP_M[mk], codes = dpSel(), raw = !!M.notarget, days = DPD.days.length;
  const avg = codes.map(code => {
    const a = Array.from({ length: 7 }, () => []);
    for (let i = 0; i < days; i++) { const c = dpCell(mk, code, i); const v = c.state === 'ok' ? (raw ? c.v : c.p) : null; if (v != null) a[DPD.days[i].getDay()].push(v); }
    return a.map(x => x.length ? x.reduce((s, v) => s + v, 0) / x.length : null);
  });
  if (!avg.some(a => a.some(v => v != null))) return { html: '<p class="dp-why" style="margin:20px 0">No target to read the weekdays against for this measure.</p>', legend: '', days };
  const order = [1, 2, 3, 4, 5, 6, 0], mx = raw ? Math.max(...avg.flat().filter(v => v != null)) : 0;
  const fmtv = v => (raw ? M.fmt(v) : Math.round(v) + '%');
  const head = '<span></span>' + order.map(d => `<div class="dp-wh">${DP_DOW[d]}</div>`).join('');
  const lines = [];
  const rows = codes.map((code, bi) => {
    const vals = order.map(d => avg[bi][d]), okv = vals.filter(v => v != null);
    const hi = okv.length > 1 ? Math.max(...okv) : null, lo = okv.length > 1 ? Math.min(...okv) : null, spread = hi !== lo;
    if (okv.length > 1 && spread) lines.push(`<div class="dp-sub"><span class="dot" style="background:${dpCol(code)};margin-right:6px"></span><b style="color:var(--text)">${code}</b> best ${DP_DOW[order[vals.indexOf(hi)]]} (${fmtv(hi)}), slowest ${DP_DOW[order[vals.indexOf(lo)]]} (${fmtv(lo)})</div>`);
    const cells = vals.map((v, k) => {
      const tip = `<b>${dpEsc(dpName(code))} \u00B7 ${DP_DOW[order[k]]}</b><div>${v == null ? 'No figures' : fmtv(v) + (raw ? ' on average' : ' of target on average')}</div>`;
      if (v == null) return `<div class="dp-wc" style="background:var(--surface2);color:var(--muted2)" data-tip="${dpEsc(tip)}">\u2013</div>`;
      let bg, ink;
      if (raw) { bg = dpShade(mx ? v / mx : 0); ink = 'var(--text)'; } else { const b = dpBin(v); bg = dpBinBg(b); ink = dpBinInk(b); }
      const cls = spread ? (v === hi ? ' best' : v === lo ? ' slow' : '') : '';
      return `<div class="dp-wc${cls}" style="background:${bg};color:${ink}" data-tip="${dpEsc(tip)}">${fmtv(v)}</div>`;
    }).join('');
    return `<div class="dp-wl"><span class="dot" style="background:${dpCol(code)};margin-right:6px"></span>${code}</div>${cells}`;
  }).join('');
  const legend = `<div class="dp-key">${dpBinKey(raw)}<span><i style="background:transparent;border:2px solid var(--text)"></i>Best day</span><span><i style="background:transparent;border:2px dashed var(--text)"></i>Slowest day</span></div>`;
  return { html: `<div class="dp-wk">${head}${rows}</div>${legend}<div style="margin-top:10px">${lines.join('')}</div>`, legend: '', days };
}

// ── RADAR: strengths and weaknesses ─────────────────────────
// Every radar measure as the mean of the window's daily % of target, per branch. A measure with no target
// at a branch is left off that branch's radar rather than drawn at zero.
function dpRadarVals(code, idxs) {
  return dpRadarSel().map(([mk, lab]) => {
    const cs = idxs.map(i => dpCell(mk, code, i)).filter(c => c.state === 'ok' && c.p != null);
    if (!cs.length) return null;
    const p = cs.reduce((s, c) => s + c.p, 0) / cs.length, avg = cs.reduce((s, c) => s + c.v, 0) / cs.length, t = cs.reduce((s, c) => s + c.t, 0) / cs.length;
    return { mk, lab, p, avg, t };
  });
}
function dpRadar(host, idxs, codes) {
  const W = Math.max(300, Math.min(dpW(host), 520)), H = Math.round(W * .94), cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 64, max = 130;
  const multi = codes.length > 1, sel = dpRadarSel();
  const mineAll = codes.map(code => dpRadarVals(code, idxs));
  const axes = sel.map((_, k) => k).filter(k => mineAll.every(a => a[k]));
  const dropped = sel.map((x, k) => (axes.includes(k) ? null : x[1])).filter(Boolean);
  const title = multi ? `${codes.length === DPD.codes.length ? 'All branches' : codes.join(' + ')}: strengths and weaknesses side by side` : `${dpName(codes[0])}: strengths and weaknesses`;
  const n = axes.length;
  if (n < 3) return { title, html: '<p class="dp-why" style="margin:20px 0">Fewer than three of the ticked measures have a target at every selected branch, so there is no shape to draw. Tick more under Customise, take a branch off, or set client targets in the Upload Portal.</p>', list: '', legend: '' };
  const ang = i => -Math.PI / 2 + i * 2 * Math.PI / n;
  const pt = (i, p) => [cx + Math.cos(ang(i)) * R * Math.min(p, max) / max, cy + Math.sin(ang(i)) * R * Math.min(p, max) / max];
  const poly = arr => arr.map((p, i) => pt(i, p).join(',')).join(' ');
  const all = DPD.codes.map(c => dpRadarVals(c, idxs));
  const grp = axes.map(k => { const v = all.map(a => a[k]).filter(Boolean); return v.length ? v.reduce((t, x) => t + x.p, 0) / v.length : 100; });
  let g = '';
  [50, 130].forEach(v => { g += `<polygon points="${poly(axes.map(() => v))}" fill="none" stroke="var(--border)"/>`; });
  axes.forEach((k, i) => { const q = pt(i, max); g += `<line x1="${cx}" y1="${cy}" x2="${q[0]}" y2="${q[1]}" stroke="var(--border)"/>`; });
  g += `<polygon points="${poly(axes.map(() => 100))}" fill="none" stroke="var(--muted2)" stroke-width="1.5" stroke-dasharray="5 4"/><text x="${cx + 4}" y="${pt(0, 100)[1] - 4}">100%</text>`;
  g += `<polygon points="${poly(grp)}" fill="none" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="2 3"/>`;
  codes.forEach((code, bi) => {
    g += `<polygon points="${poly(axes.map(k => mineAll[bi][k].p))}" fill="${dpCol(code)}" fill-opacity="${multi ? .1 : .2}" stroke="${dpCol(code)}" stroke-width="2" stroke-linejoin="round"/>`;
  });
  axes.forEach((k, i) => {
    const c = Math.cos(ang(i)), sn = Math.sin(ang(i)), lab = sel[k][1];
    const lx = cx + c * (R + 14), ly = cy + sn * (R + 14) + (sn < -.5 ? -2 : sn > .5 ? 10 : 4);
    const weak = mineAll.some(a => a[k].p < 100);
    g += `<text class="${weak ? 'tv' : ''}" x="${lx}" y="${ly}" text-anchor="${c > .3 ? 'start' : c < -.3 ? 'end' : 'middle'}" style="${weak ? '' : 'fill:var(--text)'}">${dpEsc(lab)}</text>`;
    codes.forEach((code, bi) => {
      const v = mineAll[bi][k], q = pt(i, v.p);
      const tip = `<b>${dpEsc(lab)}</b><div class="r"><span>${dpEsc(code)}, window average</span><span>${DP_M[v.mk].fmt(v.avg)}</span></div><div class="r"><span>Target</span><span>${DP_M[v.mk].fmt(v.t)}</span></div><div class="r"><span>vs target</span><span>${Math.round(v.p)}%</span></div><div class="r"><span>All-branch average</span><span>${Math.round(grp[i])}%</span></div>`;
      g += `<circle cx="${q[0]}" cy="${q[1]}" r="${multi ? 3.5 : 4.5}" fill="${dpCol(code)}" stroke="var(--surface)" stroke-width="2"/><circle cx="${q[0]}" cy="${q[1]}" r="${multi ? 10 : 14}" fill="transparent" data-tip="${dpEsc(tip)}"/>`;
    });
  });
  const legend = codes.map(c => `<span><i class="dot" style="background:${dpCol(c)}"></i>${dpEsc(dpName(c))}</span>`).join('')
    + '<span><svg viewBox="0 0 22 8"><line x1="0" x2="22" y1="4" y2="4" stroke="var(--muted)" stroke-dasharray="2 3" stroke-width="1.5"/></svg>All-branch average</span><span><svg viewBox="0 0 22 8"><line x1="0" x2="22" y1="4" y2="4" stroke="var(--muted2)" stroke-dasharray="5 4" stroke-width="1.5"/></svg>Target (100%)</span>';
  const row = (v, cls, ic) => `<div class="dp-swr"><div><b>${dpEsc(v.lab)}</b><div class="dp-sub">${DP_M[v.mk].fmt(v.avg)} a day against ${DP_M[v.mk].fmt(v.t)}</div></div><span class="dp-chip ${cls}">${ic} ${Math.round(v.p)}%</span></div>`;
  let list;
  if (!multi) {
    const sorted = axes.map(k => ({ ...mineAll[0][k], lab: sel[k][1] })).sort((a, b) => b.p - a.p);
    const strong = sorted.filter(v => Math.round(v.p) >= 100).slice(0, 3), weak = sorted.slice().reverse().filter(v => Math.round(v.p) < 100).slice(0, 3);
    list = `<h3>Strengths</h3>${strong.length ? strong.map(v => row(v, 'good', '\u2713')).join('') : '<div class="dp-sub">Nothing above target yet</div>'}<h3>Weaknesses</h3>${weak.length ? weak.map(v => row(v, Math.round(v.p) >= 90 ? 'warn' : 'bad', Math.round(v.p) >= 90 ? '\u25B2' : '\u25BC')).join('') : '<div class="dp-sub">Every measure is on target</div>'}`;
  } else {
    list = '<h3>Each branch at a glance</h3>' + codes.map((code, bi) => {
      const arr = axes.map(k => ({ ...mineAll[bi][k], lab: sel[k][1] })).sort((a, b) => b.p - a.p), top = arr[0], low = arr[arr.length - 1];
      return `<div class="dp-swr"><div><b><span class="dot" style="background:${dpCol(code)};margin-right:6px"></span>${dpEsc(dpName(code))}</b><div class="dp-sub">Strongest: ${dpEsc(top.lab)} ${Math.round(top.p)}% \u00B7 Weakest: ${dpEsc(low.lab)} ${Math.round(low.p)}%</div></div></div>`;
    }).join('');
  }
  if (dropped.length) list += `<div class="dp-sub" style="margin-top:12px">Left off the shape: ${dpEsc(dropped.join(', '))} (no target set at ${multi ? 'one of these branches' : 'this branch'}).</div>`;
  return { title, html: `<svg class="dp-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${dpEsc(title)}">${g}</svg>`, list, legend };
}

// ── PAGE ────────────────────────────────────────────────────
const dpPeriods = [['mtd', 'Month to date'], ['last7', 'Last 7 days'], ['last30', 'Last 30 days'], ['lastmonth', 'Last month'], ['custom', 'Custom']];
function dpControls(win) {
  const mpanel = DP_GROUPS.map(([g, ks]) => `<div class="dp-row"><span class="dp-lab">${g}</span><span class="dp-pills">${ks.map(k => `<button type="button" class="dp-pill" data-m="${k}" aria-pressed="${k === DP.measure}">${DP_M[k].label}</button>`).join('')}</span></div>`).join('');
  const per = `<div class="dp-row"><span class="dp-lab">Period</span><span class="dp-pills">${dpPeriods.map(([k, l]) => `<button type="button" class="dp-pill" data-p="${k}" aria-pressed="${k === DP.period}">${l}</button>`).join('')}</span>
    ${DP.period === 'custom' ? `<span class="dp-row" style="gap:6px"><input type="date" class="dp-date" id="dpFrom" value="${dpEsc(DP.from || dpYmd(win.from))}" max="${dpYmd(win.yest)}"> to <input type="date" class="dp-date" id="dpTo" value="${dpEsc(DP.to || dpYmd(win.to))}" max="${dpYmd(win.yest)}"></span>` : ''}</div>`;
  return `<div class="dp-panel" role="group" aria-label="Measure">${mpanel}</div><div class="dp-panel" role="group" aria-label="Branch and period"><div class="dp-row"><span class="dp-lab">Branch</span><span class="dp-pills">${dpPickPills()}</span></div>${per}</div>`;
}
// All, then each branch. While All is on only All shows pressed: it says "everything", and the first branch you
// press narrows to it.
function dpPickPills() {
  const sel = dpSel(), allOn = sel.length === DPD.codes.length;
  return `<button type="button" class="dp-pill" data-b="ALL" aria-pressed="${allOn}">All</button>` + DPD.codes.map(c => `<button type="button" class="dp-pill" data-b="${c}" aria-pressed="${!allOn && sel.includes(c)}"><span class="dot" style="background:${dpCol(c)}"></span>${c}</button>`).join('');
}

async function renderDailyPerf() {
  const host = document.getElementById('dailyPerfContent');
  if (!host || dpBusy) return;
  dpCss();
  const win = dpWindow();
  if (!host.querySelector('.dpf')) host.innerHTML = '<div class="dpf"><div class="loading">Loading data...</div></div>';
  dpBusy = true; dpErr = '';
  try { await dpLoad(win); } catch (e) { dpErr = (e && e.message) || String(e); }
  dpBusy = false;
  if (dpErr || !DPD) { host.innerHTML = `<div class="dpf"><h1>Daily Performance</h1><div class="dp-err">Could not load the daily figures: ${dpEsc(dpErr || 'no data')}. Try Refresh, and tell Kate if it stays.</div></div>`; return; }
  dpDraw(host, win);
}

// The radar's Customise panel: tick the measures to draw, ten by default, never fewer than three.
function dpRadarCustom() {
  const on = new Set(dpRadarSel().map(x => x[0]));
  const label = Object.fromEntries(DP_RADAR_ALL);
  const groups = DP_GROUPS.map(([g, ks]) => {
    const items = ks.filter(k => label[k]);
    return items.length ? `<div class="dp-cg"><span class="dp-lab">${g}</span>${items.map(k => `<label class="dp-chk"><input type="checkbox" data-r="${k}"${on.has(k) ? ' checked' : ''}> ${dpEsc(label[k])}</label>`).join('')}</div>` : '';
  }).join('');
  return `<details class="dp-cust" id="dpCust"${dpRadarOpen ? ' open' : ''}><summary>Customise measures (${on.size} ticked)</summary>${groups}
    <div class="dp-row" style="margin-top:8px"><button type="button" class="dp-pill" id="dpRadarReset">Back to the default ten</button><span class="dp-sub" id="dpRadarMsg"></span></div></details>`;
}

function dpDraw(host, win) {
  // The redraw empties the page for a moment, which clamps the scroll position; remember it and put it back.
  const sy = window.scrollY, had = !!host.querySelector('.dpf');
  win = win || dpWindow();
  const idxs = dpIdx(win), mk = DP.measure, M = DP_M[mk];
  if (DP.branches) { DP.branches = DP.branches.filter(c => DPD.codes.includes(c)); if (!DP.branches.length || DP.branches.length === DPD.codes.length) DP.branches = null; }
  if (!idxs.length) { host.innerHTML = `<div class="dpf"><h1>Daily Performance</h1>${dpControls(win)}<div class="dp-err">No days in this window yet.</div></div>`; dpWire(host); return; }
  const range = `${dpDayLabel(win.from)} to ${dpDayLabel(win.to)}`;
  host.innerHTML = `<div class="dpf">
    <h1>Daily Performance</h1>
    <p class="dp-deck">How each branch did, day by day, against its daily target. Read the tiles for the latest day, the lines for the trend, the heatmap for the weak days.</p>
    ${dpControls(win)}
    <p class="dp-note" style="margin:0 0 4px"><b>${dpEsc(range)}</b> · ${idxs.length} day${idxs.length === 1 ? '' : 's'}${win.note ? ' · ' + dpEsc(win.note) : ''}</p>
    <section class="dp-tiles" id="dpTiles" aria-label="Latest open day per branch">${dpTiles(win, idxs)}</section>
    <div class="dp-card"><h2>${M.notarget ? `Daily ${dpEsc(M.noun)}, ${dpSel().length === DPD.codes.length ? 'all branches' : dpSel().join(' + ')}` : `Daily ${dpEsc(M.noun)} against target, ${dpSel().length === DPD.codes.length ? 'all branches' : dpSel().join(' + ')}`}</h2>
      <p class="dp-why">${M.notarget ? 'Every branch on one scale, in plain values. This measure has no target, so nothing is graded. Gaps are closed days or days with no figures.' : "Every branch on one scale: 100% means the day's target was met. Gaps are closed days or days with no figures."}</p><div id="dpA"></div></div>
    <div class="dp-card"><div class="dp-head"><div><h2 id="dpBT"></h2><p class="dp-why" id="dpBW"></p></div><span class="dp-pills" id="dpBP" role="group" aria-label="Branches">${dpPickPills()}</span></div>
      <div class="dp-legend" id="dpBL"></div><div id="dpB"></div></div>
    <div class="dp-card"><div class="dp-head"><div><h2 id="dpRT"></h2>
      <p class="dp-why">Every ticked measure as % of its target, over this window. Outside the dashed ring is a strength, inside it is a weakness. This card ignores the Measure picker on purpose, it shows the ticked measures all at once, and leaves off any with no target set at the branch.</p></div>
      <span class="dp-pills" id="dpRP" role="group" aria-label="Branches">${dpPickPills()}</span></div>
      ${dpRadarCustom()}
      <div class="dp-legend" id="dpRL"></div><div class="dp-sw"><div id="dpR"></div><div class="dp-swl" id="dpRS"></div></div></div>
    <div class="dp-card"><h2>${M.notarget ? 'Which days were big or small?' : 'Which days were weak?'}</h2><p class="dp-why">${M.notarget ? 'Each square is a branch on a day, darker for a higher figure. This measure has no target, so nothing is graded.' : 'Each square is a branch on a day, with its % of target in it. Blue beat the target, red fell short, grey is on target. A small gap marks each new week.'}</p><div id="dpC"></div></div>
    <div class="dp-card"><h2>Best and slowest weekday</h2><p class="dp-why" id="dpDW"></p><div id="dpD"></div></div>
    <div class="dp-card"><h2>How to read this page</h2>
      <p class="dp-note"><b>The daily target</b> is the month's target divided by the branch's trading days in that month. It is flat, so a Saturday and a Sunday carry the same target; the weekday chart is where the difference shows. Ratios (rebooking, treatment, retail, average bills) read the same benchmark every day. Utilisation reads hair 80 and beauty 70, weighted by the hours available.</p>
      <p class="dp-note"><b>Closed days</b> come from the closed-days rules and table, so Al Quoz on a Sunday or Monday is shut, not a zero. A measure with no target set (total and new clients, until somebody keys them in the Upload Portal) shows its figures with no grade. <b>NCR</b> is New Client Requests, a count against the Pulse's monthly NCR target; NCR % is the same count as a share of the day's clients, the way the Pulse's Client Funnel prints it, and has no target.</p>
      <p class="dp-note"><b>The figures</b> are the Ledgers' own, by day, ex VAT, the same ones the Daily Target Sheet adds up. The window ends yesterday. Motor City is hair only, so the Beauty measures skip it. UAE branches only for now.</p></div>
  </div>`;
  const root = host.querySelector('.dpf');
  const fill = (id, html) => { const e = root.querySelector('#' + id); if (e) e.innerHTML = html; };
  const el = id => root.querySelector('#' + id);
  fill('dpA', dpChartA(el('dpA'), idxs));
  const sel = dpSel();
  const b = dpChartB(el('dpB'), idxs, sel);
  el('dpBT').textContent = b.title; el('dpBW').textContent = b.why; fill('dpBL', b.legend); fill('dpB', b.html);
  const r = dpRadar(el('dpR'), idxs, sel);
  el('dpRT').textContent = r.title; fill('dpRL', r.legend); fill('dpR', r.html); fill('dpRS', r.list);
  fill('dpC', dpHeat(el('dpC'), idxs));
  const wk = dpWeekday(el('dpD'));
  el('dpDW').textContent = `Average ${M.notarget ? 'figure' : '% of daily target'} by weekday, over the ${wk.days} days loaded. This is the one that tells you where to put your team.`;
  fill('dpD', wk.html);
  if (had) window.scrollTo({ top: sy, left: 0, behavior: 'instant' });
  dpWire(host);
}

function dpWire(host) {
  const root = host.querySelector('.dpf'); if (!root) return;
  dpBindTips(root);
  root.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { DP.measure = b.dataset.m; dpSave(); dpDraw(host); });
  root.querySelectorAll('[data-p]').forEach(b => b.onclick = async () => {
    DP.period = b.dataset.p;
    if (DP.period === 'custom' && (!DP.from || !DP.to)) { const w = dpWindow(); DP.from = dpYmd(w.from); DP.to = dpYmd(w.to); }
    dpSave(); await renderDailyPerf();
  });
  root.querySelectorAll('[data-b]').forEach(b => b.onclick = () => { dpToggleBranch(b.dataset.b); dpSave(); dpDraw(host); });
  const cust = root.querySelector('#dpCust');
  if (cust) cust.addEventListener('toggle', () => { dpRadarOpen = cust.open; });
  root.querySelectorAll('[data-r]').forEach(cb => cb.onchange = () => {
    const next = DP_RADAR_ALL.map(x => x[0]).filter(k => { const b = root.querySelector(`[data-r="${k}"]`); return b && b.checked; });
    if (next.length < 3) { cb.checked = true; const m = root.querySelector('#dpRadarMsg'); if (m) m.textContent = 'Keep at least three ticked, or there is no shape to draw.'; return; }
    DP.radar = next; dpRadarOpen = true; dpSave(); dpDraw(host);
  });
  const rr = root.querySelector('#dpRadarReset');
  if (rr) rr.onclick = () => { DP.radar = null; dpRadarOpen = true; dpSave(); dpDraw(host); };
  const f = root.querySelector('#dpFrom'), t = root.querySelector('#dpTo');
  if (f && t) {
    const go = async () => { if (f.value && t.value) { DP.from = f.value; DP.to = t.value; dpSave(); await renderDailyPerf(); } };
    f.onchange = go; t.onchange = go;
  }
}

// A resize redraws the charts to the new width; no refetch.
let dpResizeT = null;
window.addEventListener('resize', () => {
  clearTimeout(dpResizeT);
  dpResizeT = setTimeout(() => {
    const host = document.getElementById('dailyPerfContent'), v = document.getElementById('view-dailyperf');
    if (host && v && v.style.display !== 'none' && DPD) dpDraw(host);
  }, 150);
});
