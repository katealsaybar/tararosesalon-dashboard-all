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
const DP = { measure: 'sales', period: 'mtd', from: '', to: '', pick: 'SAA' };
try {
  const s = JSON.parse(localStorage.getItem(DP_STORE) || '{}');
  for (const k of ['measure', 'period', 'from', 'to', 'pick']) if (typeof s[k] === 'string') DP[k] = s[k];
} catch (e) { /* private mode: the defaults are fine */ }
function dpSave() { try { localStorage.setItem(DP_STORE, JSON.stringify(DP)); } catch (e) { /* ignore */ } }

let DPD = null, dpBusy = false, dpErr = '', dpMemo = new Map();

// ── MEASURES ────────────────────────────────────────────────
// `monthly` is the key list ledgerBranchTarget() would read (negative keys are subtracted), `bm` a benchmark
// ratio. `kind` says whether weekday pace matters (vol) or not (ratio). `beauty` measures skip a hair-only branch.
const dpMoney = v => 'AED ' + Math.round(v).toLocaleString('en-GB');
const dpCount = u => v => Math.round(v).toLocaleString('en-GB') + (u ? ' ' + u : '');
const dpPctF  = v => Math.round(v) + '%';
const DP_GROUPS = [
  ['Revenue',    ['sales', 'services', 'retail', 'hair', 'beauty', 'treat']],
  ['Clients',    ['clients', 'newc', 'ncr']],
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
  ncr:      { label: 'NCR',             noun: 'NCR',                  kind: 'vol',   fmt: dpCount(''),        monthly: () => ['ncr'],          pick: s => s.ncrTotal },
  rebook:   { label: 'Rebooking %',     noun: 'rebooking %',          kind: 'ratio', fmt: dpPctF, bm: 'rebookPct',    pick: s => (s.rebookPct != null ? s.rebookPct : s.hairRebookPct) },
  treatp:   { label: 'Treatment %',     noun: 'treatment %',          kind: 'ratio', fmt: dpPctF, bm: 'treatmentPct', pick: s => (s.treatmentSales == null || !(s.hairServicesIncl || 0)) ? null : s.treatmentSales / s.hairServicesIncl * 100 },
  retailp:  { label: 'Retail %',        noun: 'retail %',             kind: 'ratio', fmt: dpPctF, bm: 'retailPct',    pick: s => { const n = (s.hairServicesIncl || 0) + (s.hairRetailOnly || 0); return n ? (s.hairRetailOnly || 0) / n * 100 : null; } },
  hairbill: { label: 'Hair avg bill',   noun: 'hair average bill',    kind: 'ratio', fmt: dpMoney, bm: 'hairAvgBill',  pick: s => s.hairAvgBill },
  beautybill: { label: 'Beauty avg bill', noun: 'beauty average bill', kind: 'ratio', fmt: dpMoney, bm: 'beautyAvgBill', pick: s => s.beautyAvgBill, beauty: true },
  util:     { label: 'Utilisation',     noun: 'utilisation',          kind: 'ratio', fmt: dpPctF, util: true },
};
// The radar's ten: the ones that say the most about a branch's shape.
const DP_RADAR = [['sales', 'Total sales'], ['retail', 'Retail'], ['treat', 'Treatments'], ['clients', 'Clients'], ['newc', 'New clients'],
  ['rebook', 'Rebooking'], ['retailp', 'Retail %'], ['hairbill', 'Hair avg bill'], ['ncr', 'NCR'], ['util', 'Utilisation']];

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
  .dpf{${light};--dv-n2:#e34948;--dv-n1:#f2a3a2;--dv-0:#ECE8DF;--dv-p1:#9ec5f4;--dv-p2:#256abf;width:100%;max-width:1180px;margin:0 auto;color:var(--text)}
  [data-theme="dark"] .dpf{${dark};--dv-n2:#e66767;--dv-n1:#8f4a49;--dv-0:#383835;--dv-p1:#3a6aa8;--dv-p2:#6da7ec}
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
      if (M.bm) t = dpBenchmark(M.bm, date);
      else {
        const month = dpYmd(date).slice(0, 7), mt = dpMonthTarget(month, code, M.monthly()), td = dpTradingDays(month, code);
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
function dpSpark(code, idxs, mk) {
  const W = 220, H = 44, max = 140, min = 40;
  const x = k => 2 + k * (W - 4) / Math.max(1, idxs.length - 1);
  const y = p => H - 2 - (Math.min(Math.max(p, min), max) - min) / (max - min) * (H - 4);
  const segs = []; let cur = [];
  idxs.forEach((i, k) => {
    const c = dpCell(mk, code, i);
    if (c.state === 'ok' && c.p != null) cur.push([x(k), y(c.p)]); else { if (cur.length) segs.push(cur); cur = []; }
  });
  if (cur.length) segs.push(cur);
  if (!segs.length) return '';
  const last = segs[segs.length - 1], lp = last[last.length - 1], t = y(100);
  return `<svg class="dp-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${dpEsc(dpName(code))} trend against target">
    <line x1="0" x2="${W}" y1="${t}" y2="${t}" stroke="var(--border)" stroke-dasharray="3 3"/>
    ${segs.map(s => s.length > 1 ? `<polyline fill="none" stroke="${dpCol(code)}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${s.map(q => q.join(',')).join(' ')}"/>` : '').join('')}
    <circle cx="${lp[0]}" cy="${lp[1]}" r="4" fill="${dpCol(code)}" stroke="var(--surface)" stroke-width="2"/></svg>`;
}
function dpTiles(win, idxs) {
  const mk = DP.measure, M = DP_M[mk];
  return DPD.codes.map(code => {
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
      <div style="margin-top:8px">${dpSpark(code, idxs, mk)}</div></div>`;
  }).join('');
}

// ── CHART A: every branch on one scale, % of target ─────────
function dpChartA(host, idxs) {
  const mk = DP.measure, M = DP_M[mk], W = dpW(host), n = idxs.length;
  const H = Math.round(Math.min(340, Math.max(230, W * .34))), m = { l: 42, r: 46, t: 10, b: 26 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b, min = 40, max = 140;
  const x = k => m.l + (n === 1 ? iw / 2 : k * iw / (n - 1)), y = p => m.t + ih - (Math.min(Math.max(p, min), max) - min) / (max - min) * ih;
  const tracked = DPD.codes.filter(c => idxs.some(i => dpCell(mk, c, i).p != null));
  let g = '';
  [60, 80, 100, 120, 140].forEach(v => {
    g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--border)"${v === 100 ? ' stroke-dasharray="5 4" stroke-width="1.5"' : ''}/><text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${v}%</text>`;
  });
  const step = Math.max(1, Math.ceil(n / (W < 520 ? 7 : 14)));
  idxs.forEach((i, k) => { if (k % step === 0) g += `<text x="${x(k)}" y="${H - 6}" text-anchor="middle">${DPD.days[i].getDate()} ${DP_DOW[DPD.days[i].getDay()][0]}</text>`; });
  const ends = [];
  tracked.forEach(code => {
    const runs = []; let cur = [];
    idxs.forEach((i, k) => { const c = dpCell(mk, code, i); if (c.state === 'ok' && c.p != null) cur.push([x(k), y(c.p), c.p]); else { if (cur.length) runs.push(cur); cur = []; } });
    if (cur.length) runs.push(cur);
    runs.forEach(r => {
      if (r.length > 1) g += `<path d="${r.map((q, k) => (k ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' ')}" fill="none" stroke="${dpCol(code)}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
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
    const tip = `<b>${dpDayLabel(DPD.days[i])}</b>` + DPD.codes.map(code => {
      const c = dpCell(mk, code, i);
      const val = c.state !== 'ok' ? dpWhy(c.state) : M.fmt(c.v) + (c.p != null ? ' · ' + Math.round(c.p) + '%' : ' · no target');
      return `<div class="r"><span><span class="dot" style="background:${dpCol(code)}"></span> ${code}</span><span>${val}</span></div>`;
    }).join('');
    g += `<g class="dp-hit"><line class="xh" x1="${x(k)}" x2="${x(k)}" y1="${m.t}" y2="${m.t + ih}" stroke="var(--muted2)"/><rect x="${x(k) - cw / 2}" y="${m.t}" width="${cw}" height="${ih}" fill="transparent" data-tip="${dpEsc(tip)}"/></g>`;
  });
  const legend = tracked.map(c => `<span><i class="dot" style="background:${dpCol(c)}"></i>${dpEsc(dpName(c))}</span>`).join('')
    + '<span><svg viewBox="0 0 22 8"><line x1="0" x2="22" y1="4" y2="4" stroke="var(--muted2)" stroke-dasharray="5 4" stroke-width="1.5"/></svg>Daily target (100%)</span>'
    + (tracked.length < DPD.codes.length ? '<span>A branch with no line has no target set, or is not tracked, for this measure</span>' : '');
  const table = `<div class="dp-scroll"><table class="dp-tbl"><tr><th>Day</th>${DPD.codes.map(c => `<th>${c}</th>`).join('')}</tr>${idxs.map(i => `<tr><td>${dpDayLabel(DPD.days[i])}</td>${DPD.codes.map(code => { const c = dpCell(mk, code, i); return `<td>${c.state !== 'ok' ? dpWhy(c.state) : (c.p != null ? Math.round(c.p) + '%' : M.fmt(c.v))}</td>`; }).join('')}</tr>`).join('')}</table></div>`;
  if (!tracked.length) return `<p class="dp-why" style="margin:20px 0">No branch has a target set for ${dpEsc(M.noun)} in this window, so there is nothing to put on one scale. The branch tiles above still show the figures.</p>`;
  return `<div class="dp-legend">${legend}</div><svg class="dp-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Daily ${dpEsc(M.noun)} as a percentage of target, by branch">${g}</svg><details><summary>View as table</summary>${table}</details>`;
}

// ── CHART B: one branch, bars + 7-day average + target ──────
function dpNice(raw) {
  const e = Math.pow(10, Math.floor(Math.log10(raw / 4))), f = raw / 4 / e;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
}
function dpAxis(mk, v, mx) {
  if (mk === 'util' || DP_M[mk].fmt === dpPctF) return Math.round(v) + '%';
  if (DP_M[mk].fmt === dpMoney && mx >= 2500) return (v / 1000).toFixed(mx < 6000 ? 1 : 0).replace('.0', '') + 'k';
  return Math.round(v);
}
function dpChartB(host, idxs, code) {
  const mk = DP.measure, M = DP_M[mk], W = dpW(host), n = idxs.length;
  if (M.beauty && DPD.hairOnly[code]) return { html: `<p class="dp-why" style="margin:24px 0">${dpEsc(dpName(code))} has no Beauty team, so there is nothing to show for ${dpEsc(M.noun)}. Pick another branch.</p>`, why: 'Not tracked at this branch.', legend: '' };
  const cells = idxs.map(i => dpCell(mk, code, i));
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
      const tip = `<b>${dpDayLabel(date)}</b><div class="r"><span>${M.label}</span><span>${M.fmt(c.v)}</span></div>${ma[k] != null ? `<div class="r"><span>7-day average</span><span>${M.fmt(ma[k])}</span></div>` : ''}${c.t ? `<div class="r"><span>Target</span><span>${M.fmt(c.t)}</span></div><div class="r"><span>vs target</span><span>${Math.round(c.p)}%</span></div>` : '<div class="r"><span>Target</span><span>not set</span></div>'}`;
      g += `<path d="M${cx - bwid / 2} ${m.t + ih} V${yy + r} Q${cx - bwid / 2} ${yy} ${cx - bwid / 2 + r} ${yy} H${cx + bwid / 2 - r} Q${cx + bwid / 2} ${yy} ${cx + bwid / 2} ${yy + r} V${m.t + ih} Z" fill="${dpCol(code)}" opacity="${below ? .45 : 1}" data-tip="${dpEsc(tip)}"/>`;
    } else if (c.state === 'closed') g += `<text x="${cx}" y="${m.t + ih - 6}" text-anchor="middle" font-size="10">${bw > 38 ? 'Closed' : '×'}</text>`;
    if (k % step === 0) g += `<text x="${cx}" y="${H - 6}" text-anchor="middle">${date.getDate()} ${DP_DOW[date.getDay()][0]}</text>`;
  });
  // target: a step line, so a month change shows as a step and not a slope
  const tp = []; tg.forEach((t, k) => { if (t != null) { const xa = m.l + bw * k, xb = m.l + bw * (k + 1); tp.push((tp.length && tg[k - 1] != null ? 'L' : 'M') + xa + ' ' + y(t) + 'L' + xb + ' ' + y(t)); } });
  if (tp.length) g += `<path d="${tp.join('')}" fill="none" stroke="var(--muted2)" stroke-dasharray="5 4" stroke-width="1.5"/>`;
  const lastT = [...tg].reverse().find(t => t != null);
  if (lastT != null) g += `<text x="${W - m.r}" y="${y(lastT) - 6}" text-anchor="end" style="fill:var(--text);stroke:var(--surface);stroke-width:4px;paint-order:stroke">Target ${dpEsc(M.fmt(lastT))}</text>`;
  const pts = ma.map((v, k) => v == null ? null : [m.l + bw * k + bw / 2, y(v)]).filter(Boolean);
  if (pts.length > 1) {
    const d = pts.map((q, k) => (k ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' '), l = pts[pts.length - 1];
    g += `<path d="${d}" fill="none" stroke="var(--surface)" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/><path d="${d}" fill="none" stroke="var(--text)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${l[0]}" cy="${l[1]}" r="4.5" fill="var(--text)" stroke="var(--surface)" stroke-width="2"/>`;
  }
  const open = cells.filter(c => c.state === 'ok'), withT = open.filter(c => c.t != null), hit = withT.filter(c => c.v >= c.t).length;
  const why = `Bars are each day, the line smooths it so one big or small day does not fool you. Pale bars fell short. ${withT.length ? `${hit} of ${withT.length} open days on target.` : 'No target is set for this measure here, so the bars are not graded.'}`;
  const legend = `<span><i class="dot" style="background:${dpCol(code)};border-radius:3px"></i>Daily actual</span><span><svg viewBox="0 0 22 8"><line x1="0" x2="22" y1="4" y2="4" stroke="var(--text)" stroke-width="2.5"/></svg>7-day average</span><span><svg viewBox="0 0 22 8"><line x1="0" x2="22" y1="4" y2="4" stroke="var(--muted2)" stroke-dasharray="5 4" stroke-width="1.5"/></svg>Daily target</span>`;
  if (!open.length) return { html: '<p class="dp-why" style="margin:24px 0">No figures for this branch in the window yet.</p>', why: '', legend: '' };
  return { html: `<svg class="dp-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${dpEsc(dpName(code))} daily ${dpEsc(M.noun)} with 7-day average">${g}</svg>`, why, legend };
}

// ── HEATMAP: branch by day ──────────────────────────────────
const dpBin = p => p < 80 ? '--dv-n2' : p < 95 ? '--dv-n1' : p <= 105 ? '--dv-0' : p <= 120 ? '--dv-p1' : '--dv-p2';
function dpHeat(host, idxs) {
  const mk = DP.measure, M = DP_M[mk], codes = DPD.codes, n = idxs.length, W = dpW(host);
  const lm = 38, ch = 34, cw = Math.max(9, (W - lm) / n), H = 4 + ch * codes.length + 22, SW = lm + cw * n;
  let g = '';
  codes.forEach((code, r) => {
    g += `<text class="tv" x="0" y="${4 + r * ch + ch / 2 + 4}">${code}</text>`;
    idxs.forEach((i, k) => {
      const c = dpCell(mk, code, i), x = lm + k * cw, yy = 4 + r * ch;
      const tip = `<b>${dpEsc(dpName(code))}</b><div>${dpDayLabel(DPD.days[i])}</div>` + (c.state !== 'ok' ? `<div>${dpWhy(c.state)}</div>` : `<div class="r"><span>${M.fmt(c.v)}</span><span>${c.p != null ? Math.round(c.p) + '% of target' : 'no target'}</span></div>`);
      const fill = c.state !== 'ok' || c.p == null ? 'var(--surface2)' : `var(${dpBin(c.p)})`;
      g += `<rect x="${x + 1}" y="${yy + 1}" width="${cw - 2}" height="${ch - 2}" rx="4" fill="${fill}" data-tip="${dpEsc(tip)}"/>`;
      if (c.state === 'closed' || c.state === 'na') g += `<path d="M${x + 4} ${yy + ch - 5} L${x + cw - 4} ${yy + 5}" stroke="var(--muted2)" stroke-width="1" pointer-events="none"/>`;
    });
  });
  const step = Math.max(1, Math.ceil(n / Math.floor((W - lm) / 28)));
  idxs.forEach((i, k) => { if (k % step === 0) g += `<text x="${lm + k * cw + cw / 2}" y="${H - 6}" text-anchor="middle">${DPD.days[i].getDate()}</text>`; });
  const key = [['--dv-n2', 'Under 80%'], ['--dv-n1', '80–94%'], ['--dv-0', '95–105%'], ['--dv-p1', '106–120%'], ['--dv-p2', 'Over 120%']].map(([v, t]) => `<span><i style="background:var(${v})"></i>${t}</span>`).join('') + '<span><i style="background:var(--surface2);border:1px solid var(--border)"></i>Closed, no target or not tracked</span>';
  const table = `<div class="dp-scroll"><table class="dp-tbl"><tr><th>Day</th>${codes.map(c => `<th>${c}</th>`).join('')}</tr>${idxs.map(i => `<tr><td>${dpDayLabel(DPD.days[i])}</td>${codes.map(code => { const c = dpCell(mk, code, i); return `<td>${c.state !== 'ok' ? dpWhy(c.state) : (c.p != null ? Math.round(c.p) + '%' : '—')}</td>`; }).join('')}</tr>`).join('')}</table></div>`;
  return `<div class="dp-scroll"><svg class="dp-svg" style="min-width:${Math.round(SW)}px" viewBox="0 0 ${Math.round(SW)} ${H}" role="img" aria-label="Branch by day, percentage of target">${g}</svg></div><div class="dp-key">${key}</div><details><summary>View as table</summary>${table}</details>`;
}

// ── WEEKDAY PATTERN ─────────────────────────────────────────
function dpWeekday(host) {
  const mk = DP.measure, W = dpW(host), codes = DPD.codes;
  const days = DPD.days.length;
  const avg = codes.map(code => {
    const a = Array.from({ length: 7 }, () => []);
    for (let i = 0; i < days; i++) { const c = dpCell(mk, code, i); if (c.state === 'ok' && c.p != null) a[DPD.days[i].getDay()].push(c.p); }
    return a.map(x => x.length ? x.reduce((s, v) => s + v, 0) / x.length : null);
  });
  if (!avg.some(a => a.some(v => v != null))) return { html: '<p class="dp-why" style="margin:20px 0">No target to read the weekdays against for this measure.</p>', legend: '', days };
  const H = Math.round(Math.min(280, Math.max(210, W * .5))), m = { l: 38, r: 6, t: 8, b: 24 }, iw = W - m.l - m.r, ih = H - m.t - m.b, min = 40, max = 140;
  const y = p => m.t + ih - (Math.min(Math.max(p, min), max) - min) / (max - min) * ih, gw = iw / 7, bw = Math.min(14, gw / (codes.length + 1.2));
  let g = '';
  [60, 80, 100, 120, 140].forEach(v => { g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--border)"${v === 100 ? ' stroke-dasharray="5 4"' : ''}/><text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${v}%</text>`; });
  [1, 2, 3, 4, 5, 6, 0].forEach((d, oi) => {
    const gx = m.l + oi * gw + gw / 2;
    g += `<text x="${gx}" y="${H - 6}" text-anchor="middle">${DP_DOW[d]}</text>`;
    codes.forEach((code, bi) => {
      const p = avg[bi][d]; if (p == null) return;
      const x = gx + (bi - (codes.length - 1) / 2) * (bw + 2) - bw / 2, yy = y(p), r = Math.min(3, bw / 2);
      const tip = `<b>${dpEsc(dpName(code))} · ${DP_DOW[d]}</b><div>${Math.round(p)}% of target on average</div>`;
      g += `<path d="M${x} ${m.t + ih} V${yy + r} Q${x} ${yy} ${x + r} ${yy} H${x + bw - r} Q${x + bw} ${yy} ${x + bw} ${yy + r} V${m.t + ih} Z" fill="${dpCol(code)}" data-tip="${dpEsc(tip)}"/>`;
    });
  });
  return { html: `<svg class="dp-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Average percentage of target by weekday">${g}</svg>`, legend: codes.map(c => `<span><i class="dot" style="background:${dpCol(c)}"></i>${c}</span>`).join(''), days };
}

// ── RADAR: strengths and weaknesses ─────────────────────────
// Every radar measure as the mean of the window's daily % of target, per branch. A measure with no target
// at a branch is left off that branch's radar rather than drawn at zero.
function dpRadarVals(code, idxs) {
  return DP_RADAR.map(([mk, lab]) => {
    const cs = idxs.map(i => dpCell(mk, code, i)).filter(c => c.state === 'ok' && c.p != null);
    if (!cs.length) return null;
    const p = cs.reduce((s, c) => s + c.p, 0) / cs.length, avg = cs.reduce((s, c) => s + c.v, 0) / cs.length, t = cs.reduce((s, c) => s + c.t, 0) / cs.length;
    return { mk, lab, p, avg, t };
  });
}
function dpRadar(host, idxs, code) {
  const W = Math.max(300, Math.min(dpW(host), 520)), H = Math.round(W * .94), cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 64, max = 130;
  const mine = dpRadarVals(code, idxs), all = DPD.codes.map(c => dpRadarVals(c, idxs));
  const axes = DP_RADAR.map((_, k) => k).filter(k => mine[k]);
  const n = axes.length;
  if (n < 3) return { html: '<p class="dp-why" style="margin:20px 0">Not enough measures with a target at this branch to draw the shape. Set client targets in the Upload Portal and more axes appear.</p>', list: '', legend: '' };
  const ang = i => -Math.PI / 2 + i * 2 * Math.PI / n;
  const pt = (i, p) => [cx + Math.cos(ang(i)) * R * Math.min(p, max) / max, cy + Math.sin(ang(i)) * R * Math.min(p, max) / max];
  const poly = arr => arr.map((p, i) => pt(i, p).join(',')).join(' ');
  const grp = axes.map(k => { const v = all.map(a => a[k]).filter(Boolean); return v.length ? v.reduce((s, x) => s + x.p, 0) / v.length : 100; });
  let g = '';
  [50, 130].forEach(v => { g += `<polygon points="${poly(axes.map(() => v))}" fill="none" stroke="var(--border)"/>`; });
  axes.forEach((k, i) => { const q = pt(i, max); g += `<line x1="${cx}" y1="${cy}" x2="${q[0]}" y2="${q[1]}" stroke="var(--border)"/>`; });
  g += `<polygon points="${poly(axes.map(() => 100))}" fill="none" stroke="var(--muted2)" stroke-width="1.5" stroke-dasharray="5 4"/><text x="${cx + 4}" y="${pt(0, 100)[1] - 4}">100%</text>`;
  g += `<polygon points="${poly(grp)}" fill="none" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="2 3"/>`;
  g += `<polygon points="${poly(axes.map(k => mine[k].p))}" fill="${dpCol(code)}" fill-opacity=".2" stroke="${dpCol(code)}" stroke-width="2" stroke-linejoin="round"/>`;
  axes.forEach((k, i) => {
    const v = mine[k], q = pt(i, v.p), c = Math.cos(ang(i)), s = Math.sin(ang(i));
    const lx = cx + c * (R + 14), ly = cy + s * (R + 14) + (s < -.5 ? -2 : s > .5 ? 10 : 4);
    const tip = `<b>${dpEsc(v.lab)}</b><div class="r"><span>${dpEsc(code)}, window average</span><span>${DP_M[v.mk].fmt(v.avg)}</span></div><div class="r"><span>Target</span><span>${DP_M[v.mk].fmt(v.t)}</span></div><div class="r"><span>vs target</span><span>${Math.round(v.p)}%</span></div><div class="r"><span>All-branch average</span><span>${Math.round(grp[i])}%</span></div>`;
    g += `<circle cx="${q[0]}" cy="${q[1]}" r="4.5" fill="${dpCol(code)}" stroke="var(--surface)" stroke-width="2"/><text class="${v.p < 100 ? 'tv' : ''}" x="${lx}" y="${ly}" text-anchor="${c > .3 ? 'start' : c < -.3 ? 'end' : 'middle'}" style="${v.p < 100 ? '' : 'fill:var(--text)'}">${dpEsc(v.lab)}</text><circle cx="${q[0]}" cy="${q[1]}" r="14" fill="transparent" data-tip="${dpEsc(tip)}"/>`;
  });
  const legend = `<span><i class="dot" style="background:${dpCol(code)}"></i>${dpEsc(dpName(code))}</span><span><svg viewBox="0 0 22 8"><line x1="0" x2="22" y1="4" y2="4" stroke="var(--muted)" stroke-dasharray="2 3" stroke-width="1.5"/></svg>All-branch average</span><span><svg viewBox="0 0 22 8"><line x1="0" x2="22" y1="4" y2="4" stroke="var(--muted2)" stroke-dasharray="5 4" stroke-width="1.5"/></svg>Target (100%)</span>`;
  const sorted = axes.map(k => mine[k]).sort((a, b) => b.p - a.p);
  const strong = sorted.filter(v => Math.round(v.p) >= 100).slice(0, 3), weak = sorted.slice().reverse().filter(v => Math.round(v.p) < 100).slice(0, 3);
  const row = (v, cls, ic) => `<div class="dp-swr"><div><b>${dpEsc(v.lab)}</b><div class="dp-sub">${DP_M[v.mk].fmt(v.avg)} a day against ${DP_M[v.mk].fmt(v.t)}</div></div><span class="dp-chip ${cls}">${ic} ${Math.round(v.p)}%</span></div>`;
  const list = `<h3>Strengths</h3>${strong.length ? strong.map(v => row(v, 'good', '✓')).join('') : '<div class="dp-sub">Nothing above target yet</div>'}<h3>Weaknesses</h3>${weak.length ? weak.map(v => row(v, Math.round(v.p) >= 90 ? 'warn' : 'bad', Math.round(v.p) >= 90 ? '▲' : '▼')).join('') : '<div class="dp-sub">Every measure is on target</div>'}`;
  return { html: `<svg class="dp-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${dpEsc(dpName(code))} strengths and weaknesses">${g}</svg>`, list, legend };
}

// ── PAGE ────────────────────────────────────────────────────
const dpPeriods = [['mtd', 'Month to date'], ['last7', 'Last 7 days'], ['last30', 'Last 30 days'], ['lastmonth', 'Last month'], ['custom', 'Custom']];
function dpControls(win) {
  const mpanel = DP_GROUPS.map(([g, ks]) => `<div class="dp-row"><span class="dp-lab">${g}</span><span class="dp-pills">${ks.map(k => `<button type="button" class="dp-pill" data-m="${k}" aria-pressed="${k === DP.measure}">${DP_M[k].label}</button>`).join('')}</span></div>`).join('');
  const per = `<div class="dp-row"><span class="dp-lab">Period</span><span class="dp-pills">${dpPeriods.map(([k, l]) => `<button type="button" class="dp-pill" data-p="${k}" aria-pressed="${k === DP.period}">${l}</button>`).join('')}</span>
    ${DP.period === 'custom' ? `<span class="dp-row" style="gap:6px"><input type="date" class="dp-date" id="dpFrom" value="${dpEsc(DP.from || dpYmd(win.from))}" max="${dpYmd(win.yest)}"> to <input type="date" class="dp-date" id="dpTo" value="${dpEsc(DP.to || dpYmd(win.to))}" max="${dpYmd(win.yest)}"></span>` : ''}</div>`;
  return `<div class="dp-panel" role="group" aria-label="Measure">${mpanel}</div><div class="dp-panel" role="group" aria-label="Period">${per}</div>`;
}
function dpPickPills() {
  return DPD.codes.map(c => `<button type="button" class="dp-pill" data-b="${c}" aria-pressed="${c === DP.pick}"><span class="dot" style="background:${dpCol(c)}"></span>${c}</button>`).join('');
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

function dpDraw(host, win) {
  win = win || dpWindow();
  const idxs = dpIdx(win), mk = DP.measure, M = DP_M[mk];
  if (!DPD.codes.includes(DP.pick)) DP.pick = DPD.codes[0];
  if (!idxs.length) { host.innerHTML = `<div class="dpf"><h1>Daily Performance</h1>${dpControls(win)}<div class="dp-err">No days in this window yet.</div></div>`; dpWire(host); return; }
  const range = `${dpDayLabel(win.from)} to ${dpDayLabel(win.to)}`;
  host.innerHTML = `<div class="dpf">
    <h1>Daily Performance</h1>
    <p class="dp-deck">How each branch did, day by day, against its daily target. Read the tiles for the latest day, the lines for the trend, the heatmap for the weak days.</p>
    ${dpControls(win)}
    <p class="dp-note" style="margin:0 0 4px"><b>${dpEsc(range)}</b> · ${idxs.length} day${idxs.length === 1 ? '' : 's'}${win.note ? ' · ' + dpEsc(win.note) : ''}</p>
    <section class="dp-tiles" id="dpTiles" aria-label="Latest open day per branch">${dpTiles(win, idxs)}</section>
    <div class="dp-card"><h2>Daily ${dpEsc(M.noun)} against target, all branches</h2>
      <p class="dp-why">Every branch on one scale: 100% means the day's target was met. Gaps are closed days or days with no figures.</p><div id="dpA"></div></div>
    <div class="dp-card"><div class="dp-head"><div><h2 id="dpBT"></h2><p class="dp-why" id="dpBW"></p></div><span class="dp-pills" id="dpBP" role="group" aria-label="Branch">${dpPickPills()}</span></div>
      <div class="dp-legend" id="dpBL"></div><div id="dpB"></div></div>
    <div class="dp-card"><div class="dp-head"><div><h2 id="dpRT"></h2>
      <p class="dp-why">Every measure as % of its target, over this window. Outside the dashed ring is a strength, inside it is a weakness. This card ignores the Measure picker on purpose, it shows all ten at once, and leaves off any measure with no target set at the branch.</p></div>
      <span class="dp-pills" id="dpRP" role="group" aria-label="Branch">${dpPickPills()}</span></div>
      <div class="dp-legend" id="dpRL"></div><div class="dp-sw"><div id="dpR"></div><div class="dp-swl" id="dpRS"></div></div></div>
    <div class="dp-two">
      <div class="dp-card"><h2>Which days were weak?</h2><p class="dp-why">Each square is a branch on a day. Blue beat the target, red fell short, grey is on target.</p><div id="dpC"></div></div>
      <div class="dp-card"><h2>Best and slowest weekday</h2><p class="dp-why" id="dpDW"></p><div class="dp-legend" id="dpDL"></div><div id="dpD"></div></div>
    </div>
    <div class="dp-card"><h2>How to read this page</h2>
      <p class="dp-note"><b>The daily target</b> is the month's target divided by the branch's trading days in that month. It is flat, so a Saturday and a Sunday carry the same target; the weekday chart is where the difference shows. Ratios (rebooking, treatment, retail, average bills) read the same benchmark every day. Utilisation reads hair 80 and beauty 70, weighted by the hours available.</p>
      <p class="dp-note"><b>Closed days</b> come from the closed-days rules and table, so Al Quoz on a Sunday or Monday is shut, not a zero. A measure with no target set (the client counts, until somebody keys them in the Upload Portal) shows its figures with no grade.</p>
      <p class="dp-note"><b>The figures</b> are the Ledgers' own, by day, ex VAT, the same ones the Daily Target Sheet adds up. The window ends yesterday. Motor City is hair only, so the Beauty measures skip it. UAE branches only for now.</p></div>
  </div>`;
  const root = host.querySelector('.dpf');
  const fill = (id, html) => { const e = root.querySelector('#' + id); if (e) e.innerHTML = html; };
  const el = id => root.querySelector('#' + id);
  fill('dpA', dpChartA(el('dpA'), idxs));
  const b = dpChartB(el('dpB'), idxs, DP.pick);
  el('dpBT').textContent = `${dpName(DP.pick)}: daily ${M.noun} and 7-day average`; el('dpBW').textContent = b.why; fill('dpBL', b.legend); fill('dpB', b.html);
  const r = dpRadar(el('dpR'), idxs, DP.pick);
  el('dpRT').textContent = `${dpName(DP.pick)}: strengths and weaknesses`; fill('dpRL', r.legend); fill('dpR', r.html); fill('dpRS', r.list);
  fill('dpC', dpHeat(el('dpC'), idxs));
  const wk = dpWeekday(el('dpD'));
  el('dpDW').textContent = `Average % of daily target by weekday, over the ${wk.days} days loaded. This is the one that tells you where to put your team.`;
  fill('dpDL', wk.legend); fill('dpD', wk.html);
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
  root.querySelectorAll('[data-b]').forEach(b => b.onclick = () => { DP.pick = b.dataset.b; dpSave(); dpDraw(host); });
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
