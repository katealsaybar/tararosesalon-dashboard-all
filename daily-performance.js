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
// day "would need its own thinking". The thinking: the monthly target is spread over the branch's trading days in
// that month (days not shut by LG_CLOSED_DAYS or the closed_days table). It was spread flat until 18 Oct 2026, so a
// Friday was judged against the same figure as a Monday and every Friday read well ahead (Saadiyat's Fridays run
// about 1.6 times its flat day). Kate: weighted. A money or count measure now gets each weekday's share of the month
// in proportion to how strong that weekday was for that branch in the 8 weeks before the month began (the average of
// that measure on that weekday); the shares add back to the monthly target, so a month that hits its target still
// reads 100%. With less than three of any weekday behind it, the month is spread flat as before (dpDayShare). Ratios (rebooking %, treatment %, retail %, average bills) read the same
// benchmark every day; utilisation is a band around 85 (on target 85 to 100, red under 60 or over 100), hair and beauty teams only, weighted by the hours available.
// A client count nobody keyed a target for is shown with no target, never against zero.
//
// Branch and Period are the masthead's universal filters (Kate, 15 Oct 2026: follow them, like every other page);
// the only control on the page is the Measure menu. Colours follow the branch, as everywhere on the dashboard (BRANCH_INFO).

const DP_STORE = 'trs-daily-perf';
const DP = { measure: 'sales', dept: 'all', radar: null, lead: 'period' };   // lead: which figure a tile opens with, Whole period or Latest day (Kate, 18 Oct 2026)
let dpRadarOpen = false;
try {
  const s = JSON.parse(localStorage.getItem(DP_STORE) || '{}');
  if (typeof s.measure === 'string') DP.measure = s.measure;
  if (s.dept === 'hair' || s.dept === 'beauty') DP.dept = s.dept;
  if (s.lead === 'day') DP.lead = 'day';
  if (Array.isArray(s.radar)) DP.radar = s.radar.filter(x => typeof x === 'string');
} catch (e) { /* private mode: the defaults are fine */ }
function dpSave() {
  try { localStorage.setItem(DP_STORE, JSON.stringify(DP)); } catch (e) { /* ignore */ }
  if (typeof CURRENT_VIEW !== 'undefined' && CURRENT_VIEW === 'dailyperf' && typeof trSyncUrl === 'function') trSyncUrl(null);   // the address follows the choices
}

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
  ['Clients',    ['clients', 'newc', 'ncr', 'ncrp', 'rebookn']],
  ['Benchmarks', ['rebook', 'treatp', 'retailp', 'hairbill', 'beautybill']],
  ['Capacity',   ['util']],
];
// The Measure menu by department (Kate, 16 Oct 2026). All is the salon as a whole; Hair and Beauty show only that team's own measures.
// DP_GROUPS stays the full list the radar's Customise panel reads.
const DP_MENU = {
  all:    [['Revenue', ['sales', 'services', 'retail', 'treat']], ['Clients', ['clients', 'newc', 'ncr', 'ncrp', 'rebookn']], ['Benchmarks', ['rebook', 'treatp', 'retailp']], ['Capacity', ['util']]],
  hair:   [['Revenue', ['hair', 'hairretail', 'treat']], ['Clients', ['hairclients']], ['Benchmarks', ['treatp', 'retailp', 'hairbill']]],
  beauty: [['Revenue', ['beauty', 'beautyretail']], ['Clients', ['beautyclients']], ['Benchmarks', ['beautybill']]],
};
const DP_DEPT_DEFAULT = { all: 'sales', hair: 'hair', beauty: 'beauty' };
const dpMenuKeys = d => DP_MENU[d].flatMap(g => g[1]);
// A link or a remembered measure that is not in the chosen department's menu moves to the department that has it (measure=hair opens Hair).
function dpFitDept() {
  if (dpMenuKeys(DP.dept).includes(DP.measure)) return;
  const d = ['all', 'hair', 'beauty'].find(x => dpMenuKeys(x).includes(DP.measure));
  if (d) DP.dept = d; else { DP.dept = 'all'; DP.measure = 'sales'; }
}
const DP_M = {
  sales:    { def: 'Total sales is everything sold, ex VAT: hair services (treatments and courses are inside them), beauty services and retail. Services, Treatments and Retail on this menu are parts of it, so nothing here is counted twice.', label: 'Total sales',     noun: 'total sales',          kind: 'vol',   fmt: dpMoney, monthly: () => LG_TOTAL_TARGET,    pick: s => lgTotalRevenue(s) },
  services: { def: 'Services: hair services with treatments and courses taken out, plus beauty services. No retail. Ex VAT.', label: 'Services',        noun: 'services revenue',     kind: 'vol',   fmt: dpMoney, monthly: () => LG_SERVICES_TARGET, pick: s => lgServicesTotal(s) },
  retail:   { def: 'Retail: hair and beauty retail sales together. Ex VAT.', label: 'Retail',          noun: 'retail revenue',       kind: 'vol',   fmt: dpMoney, monthly: () => ['retailTotal'],   pick: s => s.retailTotal },
  hair:     { def: 'Hair services, ex VAT, with treatments and courses included. No retail.', label: 'Hair services',   noun: 'hair services',        kind: 'vol',   fmt: dpMoney, monthly: () => ['hairRevenue'],   pick: s => s.hairServicesIncl },
  beauty:   { def: 'Beauty services, ex VAT. No retail.', label: 'Beauty services', noun: 'beauty services',      kind: 'vol',   fmt: dpMoney, monthly: () => ['beautyServices'], pick: s => s.beautyServicesTotal, beauty: true },
  // Kate, 16 Oct 2026: Hair and Beauty get their own retail and client counts, and the Department toggle (DP_MENU) shows only that team's measures.
  // Beauty retail and the two client counts have no monthly target keyed, so they are plain values, not graded.
  hairretail:    { label: 'Hair retail',     noun: 'hair retail',     kind: 'vol', fmt: dpMoney, monthly: () => ['hairRetail'], pick: s => s.hairRetailOnly },
  beautyretail:  { label: 'Beauty retail',   noun: 'beauty retail',   kind: 'vol', fmt: dpMoney, notarget: true, pick: s => s.beautyRetailOnly, beauty: true },
  hairclients:   { label: 'Hair clients',    noun: 'hair clients',    kind: 'vol', fmt: dpCount('clients'), notarget: true, pick: s => s.hairTotalClients },
  beautyclients: { label: 'Beauty clients',  noun: 'beauty clients',  kind: 'vol', fmt: dpCount('clients'), notarget: true, pick: s => s.beautyTotalClients, beauty: true },
  treat:    { def: 'Treatment sales, ex VAT. Treatments are part of hair services, so they are already inside Total sales.', label: 'Treatments',      noun: 'treatment revenue',    kind: 'vol',   fmt: dpMoney, monthly: () => ['hairTreatment'], pick: s => s.treatmentSales },
  clients:  { label: 'Total clients',   noun: 'clients served',       kind: 'vol',   fmt: dpCount('clients'), monthly: () => ['totalClients'], pick: s => s.totalClients },
  newc:     { label: 'New clients',     noun: 'new clients',          kind: 'vol',   fmt: dpCount('new'),     monthly: () => ['newClients'],   pick: s => s.newClientsTotal },
  // NCR is New Client Requests: a COUNT with its own monthly target (the Pulse's 18 / 18 / 17 / 17 unless the
  // Monthly Targets tab holds one, ncrMonthlyTarget() in dashboard.js), and its share of the day's clients, which
  // is how the Client Funnel on the Pulse prints it. The share has no target (20% was never reachable, 7 Oct), so
  // it is drawn as plain values, not graded.
  ncr:      { help: 'NCR is New Client Requests: a count of clients who asked for a stylist by name, against the monthly NCR target.', label: 'NCR',             noun: 'NCR (new client requests)', kind: 'vol', fmt: dpCount(''),       tgtFn: (code, month) => (typeof ncrMonthlyTarget === 'function' ? ncrMonthlyTarget(code, month) : dpMonthTarget(month, code, ['ncr'])), pick: s => s.ncrTotal },
  ncrp:     { help: 'NCR as a share of the clients served that day. It has no target, so nothing is graded.', label: 'NCR %',           noun: 'NCR as a share of clients', kind: 'ratio', fmt: dpPct1, notarget: true, pick: s => (s.totalClients ? (s.ncrTotal || 0) / s.totalClients * 100 : null) },
  // The count behind Rebooking %: clients the stylists rebooked that day. The 70% benchmark is a share, not a number
  // of clients, so the count has no target of its own and is drawn as plain values, not graded.
  rebookn:  { help: 'The number of clients rebooked that day. The 70% target is for Rebooking %, not this count.', label: 'Rebooked clients', noun: 'clients rebooked',     kind: 'vol',   fmt: dpCount('rebooked'), notarget: true, pick: s => (s.rebookPct != null && s.totalClients ? s.totalRebooked : null) },
  rebook:   { help: 'The share of clients rebooked before they left, against the rebooking target.', label: 'Rebooking %',     noun: 'rebooking %',          kind: 'ratio', fmt: dpPctF, bm: 'rebookPct', milestone: 45,    pick: s => (s.totalClients ? (s.rebookPct != null ? s.rebookPct : s.hairRebookPct) : null) },
  treatp:   { label: 'Treatment %',     noun: 'treatment %',          kind: 'ratio', fmt: dpPctF, bm: 'treatmentPct', pick: s => (s.treatmentSales == null || !(s.hairServicesIncl || 0)) ? null : s.treatmentSales / s.hairServicesIncl * 100 },
  retailp:  { label: 'Retail %',        noun: 'retail %',             kind: 'ratio', fmt: dpPctF, bm: 'retailPct',    pick: s => { const n = (s.hairServicesIncl || 0) + (s.hairRetailOnly || 0); return n ? (s.hairRetailOnly || 0) / n * 100 : null; } },
  hairbill: { label: 'Hair avg bill',   noun: 'hair average bill',    kind: 'ratio', fmt: dpMoney, bm: 'hairAvgBill',  pick: s => s.hairAvgBill },
  beautybill: { label: 'Beauty avg bill', noun: 'beauty average bill', kind: 'ratio', fmt: dpMoney, bm: 'beautyAvgBill', pick: s => s.beautyAvgBill, beauty: true },
  util:     { help: 'Booked hours as a share of the hours available, hair and beauty teams only. Target 85%: 85 to 100 is on target, 60 to 84 amber, under 60 or over 100 red. Assistants on shift are listed but never scored.', label: 'Utilisation',     noun: 'utilisation',          kind: 'ratio', fmt: dpPctF, util: true },
};
// The radar: every measure that has a target, the ten that say most about a branch's shape ticked by default.
// Kate, 13 Oct 2026: that ten is the default, and any of them can be taken off or the rest put on (Customise).
// Kate, 16 Oct 2026: the AED figure and its percentage sit side by side round the shape (Retail AED then Retail %,
// Treat AED then Treat %), so the order here is the order round the circle.
const DP_RADAR_ALL = ['sales', 'services', 'hair', 'hairbill', 'beauty', 'beautybill', 'retail', 'retailp', 'treat', 'treatp',
  'clients', 'newc', 'ncr', 'rebook', 'util'].map(k => [k, DP_M[k].label]);
// 13 Oct 2026 (Comet audit): Total clients and New clients have no target keyed, so they cannot be drawn and the
// "ten" showed eight. Every default now has a target; they are still in Customise for when targets are keyed.
const DP_RADAR_DEFAULT = ['sales', 'retail', 'treat', 'hair', 'ncr', 'rebook', 'treatp', 'retailp', 'hairbill', 'util'];
// Short names for the radar's axes, so the shape gets the room (Kate, 15 Oct 2026: the words around it were too long).
// The full name is in the hover tip (a tap on a phone) and in the key under the chart.
// Each axis label is two lines, the short name and its unit, so Retail AED and Retail % read as a pair.
const DP_SHORT = { sales: 'Sales', services: 'Svcs', retail: 'Retail', hair: 'Hair', beauty: 'Beauty', treat: 'Treat', clients: 'Clients',
  newc: 'New', ncr: 'NCR', rebook: 'RBK', treatp: 'Treat', retailp: 'Retail', hairbill: 'HAB', beautybill: 'BAB', util: 'UTL' };
const DP_UNIT = { sales: 'AED', services: 'AED', retail: 'AED', hair: 'AED', beauty: 'AED', treat: 'AED', clients: 'count',
  newc: 'count', ncr: 'count', rebook: '%', treatp: '%', retailp: '%', hairbill: 'AED', beautybill: 'AED', util: '%' };
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
const dpDayLabel = d => d.bk || `${DP_DOW[d.getDay()]} ${d.getDate()} ${MON_SHORT[d.getMonth()]}`;
// The four open branches, plus any closed one (Marasy, Fratelli) whose open days the window touches (Kate, 16 Oct 2026: "we dont have
// marasy even with the correct year range"). A closed branch counts in All the way it does on every other page.
const dpCodes = win => ['SAA', 'KCA', 'MC', 'AQ'].filter(c => ACTIVE_BRANCHES.includes(c)).concat(
  (win && typeof CLOSED_BRANCHES !== 'undefined' && !isBahrainView())
    ? Object.keys(CLOSED_BRANCHES).filter(c => dpYmd(win.from) <= CLOSED_BRANCHES[c].last && dpYmd(win.to) >= CLOSED_BRANCHES[c].first) : []);
const dpName = c => (BRANCH_INFO[c] && BRANCH_INFO[c].name) || c;

// ── CSS (once). Branch colours follow the theme: the pastel on dark, the darker hue on a light card. ───────
function dpCss() {
  if (document.getElementById('dpCss')) return;
  const codes = ['SAA', 'KCA', 'MC', 'AQ', 'FRT', 'MRY'];
  const light = codes.map(c => `--c-${c}:${(BRANCH_INFO[c] && BRANCH_INFO[c].colorLight) || '#888'}`).join(';');
  const dark  = codes.map(c => `--c-${c}:${(BRANCH_INFO[c] && BRANCH_INFO[c].color) || '#aaa'}`).join(';');
  const st = document.createElement('style'); st.id = 'dpCss';
  st.textContent = `
  .dpf{${light};--dv-n2:#e34948;--dv-n2-t:#fff;--dv-n1:#f2a3a2;--dv-n1-t:#1A1A1A;--dv-0:#ECE8DF;--dv-0-t:#1A1A1A;--dv-p1:#9ec5f4;--dv-p1-t:#1A1A1A;--dv-p2:#256abf;--dv-p2-t:#fff;--dv-y:#e9bd4a;--dv-y-t:#1A1A1A;--dv-g:#79c79a;--dv-g-t:#1A1A1A;width:100%;max-width:1180px;margin:0 auto;color:var(--text)}
  [data-theme="dark"] .dpf{${dark};--dv-n2:#e66767;--dv-n2-t:#1A1A1A;--dv-n1:#8f4a49;--dv-n1-t:#fff;--dv-0:#4a4a46;--dv-0-t:#f4f1ea;--dv-p1:#3a6aa8;--dv-p1-t:#fff;--dv-p2:#6da7ec;--dv-p2-t:#1A1A1A;--dv-y:#d9ad3c;--dv-y-t:#1A1A1A;--dv-g:#58b787;--dv-g-t:#1A1A1A}
  .dpf *{box-sizing:border-box;min-width:0}
  .dpf h1{font-family:'Playfair Display',serif;font-weight:500;font-size:clamp(22px,4.2vw,30px);line-height:1.1;margin:10px 0 4px}
  .dpf .dp-deck{font-family:'Playfair Display',serif;font-style:italic;color:var(--muted);font-size:clamp(13px,3vw,14.5px);margin:0 0 10px;line-height:1.4;max-width:80ch}
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
  .dpf .dp-tile .dp-eyebrow{margin-top:10px;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--accent-text,var(--muted))}
  .dpf .dp-tile .dp-eyebrow + .big{margin-top:3px}
  .dpf .dp-tile .dp-per{margin-top:8px;padding-top:8px;border-top:1px solid var(--border2)}
  .dpf .dp-sub{font-size:13px;color:var(--muted);line-height:1.4}
  .dpf .dp-chip{display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:600;border-radius:10px;padding:1px 8px;margin-top:6px}
  .dpf .dp-chip.on{background:color-mix(in srgb,var(--dv-p2) 20%,transparent);color:var(--dv-p2)}
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
  .dpf .dp-swr{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:6px 10px;padding:7px 0;border-bottom:1px solid var(--border2)}
  .dpf .dp-swr > div:first-child{flex:1 1 130px}
  .dpf .dp-pl{flex:1 0 100%;display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px}
  .dpf .dp-pll{font-size:11.5px;color:var(--muted);margin-right:2px}
  .dpf .dp-pi{font-size:11.5px;font-weight:600;border-radius:10px;padding:1px 8px;white-space:nowrap}
  .dpf .dp-pi.good{background:var(--good-bg);color:var(--good)}.dpf .dp-pi.bad{background:var(--bad-bg);color:var(--bad)}
  .dpf .dp-swr .dp-chip{margin-top:0;white-space:nowrap;flex:none}
  .dpf .dp-swr-r{display:grid;grid-template-columns:68px 96px;align-items:center;gap:12px;flex:none}
  .dpf .dp-swr-r .dp-chip{justify-self:end}
  .dpf .dp-cal{display:inline-flex;flex-direction:column;align-items:stretch;width:68px;text-align:center;background:var(--surface);border:1px solid var(--border);border-radius:9px;overflow:hidden;box-shadow:var(--shadow-card,none);flex:none}
  .dpf .dp-cal-m{background:var(--accent);color:var(--accent-fg);font-size:10.5px;font-weight:700;letter-spacing:.08em;white-space:nowrap;text-transform:uppercase;line-height:1;padding:5px 0 4px}
  .dpf .dp-cal-d{font-size:25px;font-weight:700;line-height:1.05;padding-top:3px;color:var(--text);font-variant-numeric:tabular-nums}
  .dpf .dp-cal-w{font-size:11.5px;font-weight:500;color:var(--muted);line-height:1.2;padding:0 0 5px}
  .dpf .dp-swr > div{min-width:0}
  .dpf .dp-rkey{margin:6px 0 0;line-height:1.6}
  .dpf .dp-rkey b{color:var(--text)}
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
  .dpf .dp-info{display:inline-flex;align-items:center}
  .dpf .dp-lead{display:flex;align-items:center;gap:10px;margin:8px 0 10px;flex-wrap:wrap}
  .dpf .dp-scrub{display:flex;align-items:center;gap:10px;flex:1 1 260px;min-width:0}
  .dpf .dp-scrub input{flex:1;min-width:0;accent-color:var(--accent)}
  .dpf .dp-scrub output{font-size:13px;font-weight:600;min-width:120px;text-align:right}
  .dpf .dp-lead .dp-lab{min-width:0;flex:none}
  .dpf .dp-meter{position:relative;display:flex;height:10px;margin:16px 0 6px}
  .dpf .dp-meter .mz{display:block;height:10px}
  .dpf .dp-meter .mz:first-child{border-radius:5px 0 0 5px}.dpf .dp-meter .mz.good{flex:1;border-radius:0 5px 5px 0}
  .dpf .dp-meter .mz.bad{background:var(--bad-bg)}.dpf .dp-meter .mz.warn{background:var(--warn-bg)}.dpf .dp-meter .mz.good{background:var(--good-bg)}
  .dpf .dp-meter .mf{position:absolute;left:0;top:2px;height:6px;border-radius:3px}
  .dpf .dp-meter .mf.good{background:var(--good)}.dpf .dp-meter .mf.warn{background:var(--warn)}.dpf .dp-meter .mf.bad{background:var(--bad)}
  .dpf .dp-meter .mt{position:absolute;top:-4px;height:18px;border-left:1.5px dashed var(--muted)}
  .dpf .dp-meter .mn{position:absolute;top:-6px;width:3px;height:22px;margin-left:-1.5px;background:var(--text);border-radius:1px}
  .dpf .dp-meter-k{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted);line-height:1.5}
  .dpf .dp-meter-k .kb{flex:none;width:14px;height:6px;border-radius:3px;background:var(--muted)}
  .dpf .dp-meter-k .kn{flex:none;width:3px;height:12px;margin:0 5.5px;border-radius:1px;background:var(--text)}
  .dpf .dp-cust summary{font-weight:600;color:var(--text);list-style:none;display:flex;align-items:center;gap:10px}
  .dpf .dp-cust summary::-webkit-details-marker{display:none}
  /* Kate, 18 Oct 2026: "customise measures doesn't look obvious na it can be clicked". A chevron at the right edge, turned up when it is open. */
  .dpf .dp-cust summary::after{content:'';flex:none;margin-left:auto;margin-right:4px;width:9px;height:9px;border-right:2px solid var(--muted);border-bottom:2px solid var(--muted);transform:rotate(45deg) translate(-2px,-2px);transition:transform .2s}
  .dpf .dp-cust[open] summary::after{transform:rotate(-135deg) translate(-2px,-2px)}
  .dpf .dp-cg{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:10px}
  .dpf .dp-cg .dp-lab{flex:1 0 100%;min-width:0}
  .dpf .dp-chk{position:relative;display:inline-flex;align-items:center;font:500 13px Inter,sans-serif;color:var(--text);cursor:pointer;white-space:nowrap;border:1px solid var(--border);background:var(--surface);border-radius:18px;padding:5px 12px}
  .dpf .dp-chk input{position:absolute;opacity:0;width:100%;height:100%;inset:0;margin:0;cursor:pointer}
  .dpf .dp-chk:has(input:checked){background:var(--accent);color:var(--accent-fg);border-color:var(--accent)}
  .dpf .dp-chk:has(input:focus-visible){outline:2px solid var(--accent);outline-offset:2px}
  .dpf .dp-chk.dp-off{border-style:dashed;color:var(--muted)}
  .dpf .dp-chk.dp-off:has(input:checked){background:color-mix(in srgb,var(--accent) 45%,var(--surface));color:var(--text);border-color:var(--accent)}
  .dpf .dp-wk{display:grid;grid-template-columns:48px repeat(7,minmax(0,1fr));gap:5px;align-items:stretch}
  .dpf .dp-wh{font-size:12px;font-weight:600;color:var(--muted2);text-align:center;padding-bottom:2px}
  .dpf .dp-wl{display:flex;align-items:center;font-weight:600;font-size:13px}
  .dpf .dp-wc small{display:block;font-size:11px;font-weight:500;opacity:.9;margin-top:1px}
  .dpf .dp-wc{border-radius:8px;min-height:46px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-weight:600;font-size:14px;font-variant-numeric:tabular-nums}
  .dpf .dp-wc.best{outline:2px solid var(--text);outline-offset:-2px}
  .dpf .dp-wc.slow{outline:2px dashed var(--text);outline-offset:-2px}
  .dpf .dp-col{fill:transparent}.dpf .dp-col:hover{fill:rgba(128,128,128,.14)}
  .dpf .dp-hit .xh{opacity:0}.dpf .dp-hit:hover .xh{opacity:1}
  .dpf{--dp-bar-h:96px}
  .dpf .dp-bar{position:sticky;top:var(--topbar-cond-h,104px);z-index:40;background:var(--bg);margin:0 0 10px;padding:8px 0 6px;border-bottom:1px solid var(--border);display:grid;gap:6px}
  .dpf .dp-bar{font-size:13px}
  .dpf .dp-bar .dp-lab{font-size:10px;letter-spacing:.1em}
  .dpf .dp-bar .dp-pill{font-size:13px;padding:4px 11px}
  .dpf .dp-bar .ps-btn{font-size:13px;padding:5px 12px}
  .dpf .dp-bar .dp-date{font-size:13px;padding:4px 8px}
  .dpf .dp-bar-row{display:flex;flex-wrap:wrap;gap:6px 16px;align-items:center}
  .dpf .dp-bf{display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap}
  .dpf .dp-bar .dp-lab{min-width:0}
  .dpf .lg-shell .lg-side{top:calc(var(--topbar-cond-h,104px) + var(--dp-bar-h,56px) + 14px)}
  @media(max-width:1099.98px){.dpf .lg-shell .lg-side{position:static;margin:0 0 8px;padding:0;border:0;background:none}}
  @media(max-width:760px){.dpf .lg-side{display:none}}
  .dpf .dp-jt{scroll-margin-top:calc(var(--topbar-cond-h,104px) + var(--dp-bar-h) + 8px)}
  .dpf .dp-showing{white-space:nowrap}
  .dpf .dp-hm{display:flex;align-items:flex-start}
  .dpf .dp-hml{flex:none;padding-top:4px;font-size:12px;font-weight:600;color:var(--text)}
  .dpf .dp-hml div{display:flex;align-items:center}
  .dpf .dp-hm .dp-scroll{flex:1 1 auto;min-width:0}
  .dpf .dp-hg{font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;color:var(--muted2);margin:18px 0 8px}
  .dpf .dp-how{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:10px}
  .dpf .dp-hw{background:var(--surface2);border-radius:10px;padding:12px 14px}
  .dpf .dp-hw b{display:block;font-size:15.5px;color:var(--text);margin-bottom:3px}
  .dpf .dp-hw span{display:block;font-size:14.5px;line-height:1.55;color:var(--text)}
  .dpf .dp-hw .dp-sw3{display:flex;gap:6px 14px;flex-wrap:wrap;margin-top:6px;font-size:13.5px}
  .dpf .dp-hw .dp-sw3 i{display:inline-block;width:14px;height:14px;border-radius:3px;margin-right:5px;vertical-align:-3px}
  .dpf .dp-tag{display:inline-block;font-size:11.5px;font-weight:600;color:var(--muted);background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:1px 8px;margin:4px 0 2px}
  .dpf .dp-tag:empty{display:none}
  .dpf .dp-per{margin-top:6px;color:var(--text)}
  .dpf .dp-linkbtn{appearance:none;border:0;background:none;color:var(--text);text-decoration:underline;cursor:pointer;font:inherit;padding:0}
  .dpf .dp-err{background:var(--bad-bg);color:var(--bad);border-radius:8px;padding:10px 14px;margin:12px 0}
  .dp-tip{position:fixed;pointer-events:none;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:8px 10px;font-size:13px;box-shadow:0 6px 20px rgba(0,0,0,.18);z-index:9999;display:none;min-width:150px;font-family:Inter,sans-serif}
  .dp-tip b{display:block;margin-bottom:3px}.dp-tip .r{display:flex;justify-content:space-between;gap:14px}
  @media(max-width:900px){.dpf .dp-two{grid-template-columns:1fr}.dpf .dp-sw{grid-template-columns:1fr}}
  @media(max-width:560px){.dpf .dp-lab{min-width:100%}}
  @media(max-width:560px){.dpf .dp-wk{grid-template-columns:34px repeat(7,minmax(0,1fr));gap:3px}.dpf .dp-wc{font-size:11.5px;min-height:40px;line-height:1.1;text-align:center;letter-spacing:-.02em}.dpf .dp-wl{font-size:12px}.dpf .dp-wh{font-size:11px}}
  @media(max-width:760px){.dpf .dp-bar{padding:6px 0 4px;gap:4px}.dpf .dp-bar .dp-lab{display:none}.dpf .dp-bar-row{gap:4px 10px}.dpf .dp-bf{flex:1 1 auto}.dpf .dp-bf .ps,.dpf .dp-bf select{max-width:100%}.dpf .dp-showing{white-space:normal}}`;
  document.head.appendChild(st);
}

// ── THE WINDOW ──────────────────────────────────────────────
// Ends yesterday: today is half a day. On the 1st there is no month to date yet, so it shows last month.
// The window is the masthead's Period filter, cut to what this page can show: up to yesterday (today is half a day) and no
// earlier than the first year there is data for. It used to stop at 90 days back; Kate, 16 Oct 2026: past years and All time.
function dpWindow() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yest = dpAdd(today, -1);
  const first = new Date(PERIOD_FIRST_YEAR, 0, 1);
  const prevFirst = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const day = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  let from = typeof dateFrom !== 'undefined' && dateFrom ? day(dateFrom) : new Date(today.getFullYear(), today.getMonth(), 1);
  let to = typeof dateTo !== 'undefined' && dateTo ? day(dateTo) : yest;
  let note = '';
  if (to > yest) to = yest;
  if (to < from) {
    if (from.getDate() === 1) { from = prevFirst; to = new Date(today.getFullYear(), today.getMonth(), 0); note = 'It is the 1st, so this shows last month.'; }
    else from = to;
  }
  if (from < first) from = first;
  if (to < from) to = from;
  return { from, to, yest, note };
}

// ── LOAD ────────────────────────────────────────────────────
async function dpLoad(win) {
  const codes = dpCodes(win);
  // A recent window also loads the 13 weeks behind it, so the weekday chart has more than one or two of each day.
  const recent = win.to >= dpAdd(win.yest, -14);
  let loadFrom = recent ? new Date(Math.min(win.from, dpAdd(win.yest, -90))) : win.from;
  // A window of 100 to 600 days is read against the same dates a year earlier (dpGrowth), so that year comes in too.
  const wn = Math.round((win.to - win.from) / 864e5) + 1, py = dpYearsBack(win.from, 1);
  if (wn > 100 && wn < 600 && py >= new Date(PERIOD_FIRST_YEAR, 0, 1)) loadFrom = new Date(Math.min(loadFrom, py));
  // The weekday weights of a month come from the 56 days before it, so every window loads those days too.
  loadFrom = new Date(Math.min(loadFrom, dpAdd(new Date(win.from.getFullYear(), win.from.getMonth(), 1), -56)));
  const loadTo = recent ? new Date(Math.max(win.to, win.yest)) : win.to;
  const key = dpYmd(loadFrom) + '|' + dpYmd(loadTo) + '|' + codes.join(',');
  if (DPD && DPD.key === key) return DPD;

  await lgLoadClosedDays();
  const months = [];
  for (let d = new Date(loadFrom.getFullYear(), loadFrom.getMonth(), 1); d <= loadTo; d.setMonth(d.getMonth() + 1)) {
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (typeof LG_FIRST_MONTH !== 'string' || m >= LG_FIRST_MONTH) months.push(m);   // no target was ever keyed before the ledger sheets began
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
  DPD = { key, days, byCode, hairOnly, codes, rowsB: branchRows, rowsP: phorestRows, from: dpYmd(loadFrom), to: dpYmd(loadTo), bk: [] };
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
// The value of a measure on one day, before any target: null on a closed day, a day with no trading or no figure.
function dpValueAt(M, c, i) {
  if (c.closed[i]) return null;
  const s = c.sum[i];
  if (!s || !((lgTotalRevenue(s) || 0) > 0)) return null;
  const x = M.pick(s);
  return x == null || !isFinite(x) ? null : Number(x);
}
// This date's share of its month's target (0 to 1), or null where the month has to be spread flat. Weekday weights are the
// average of the measure on that weekday over the 56 days before the month began (at least 3 of each weekday that is open,
// and a positive average), shared over the month's open days; memoised per measure, branch and month.
function dpDayShare(mk, code, date) {
  const M = DP_M[mk], month = dpYmd(date).slice(0, 7), key = mk + '|' + code + '|' + month;
  if (!DPD.w) DPD.w = new Map();
  let sh = DPD.w.get(key);
  if (sh === undefined) {
    sh = null;
    const [y, m] = month.split('-').map(Number), first = new Date(y, m - 1, 1), from = dpAdd(first, -56), c = DPD.byCode[code];
    const sums = [0, 0, 0, 0, 0, 0, 0], cnt = [0, 0, 0, 0, 0, 0, 0];
    DPD.days.forEach((d, i) => {
      if (d < from || d >= first) return;
      const v = dpValueAt(M, c, i);
      if (v != null && v > 0) { sums[d.getDay()] += v; cnt[d.getDay()]++; }
    });
    const n = new Date(y, m, 0).getDate(), open = [];
    for (let k = 1; k <= n; k++) { const d = new Date(y, m - 1, k); if (!lgIsClosedDay(code, d)) open.push(d.getDay()); }
    const w = sums.map((s, k) => cnt[k] >= 3 ? s / cnt[k] : null);
    if (open.length && open.every(k => w[k] != null && w[k] > 0)) {
      const total = open.reduce((a, k) => a + w[k], 0);
      sh = w.map(x => x == null ? null : x / total);
    }
    DPD.w.set(key, sh);
  }
  return sh ? sh[date.getDay()] : null;
}
function dpBenchmark(bm, date) {
  if (bm === 'rebookPct') return dpYmd(date) >= '2026-09-01' ? 70 : 45;
  const b = (typeof bpBenchmarks === 'function') ? bpBenchmarks() : {};
  const v = b[bm];
  return v == null ? null : Number(v);
}

// One cell: { v, t, p, state }. state: ok | closed | nodata | na (a beauty measure at a hair-only branch).
function dpCell(mk, code, i) {
  if (i >= DP_BK) return dpBucketCell(mk, code, i);
  const key = mk + '|' + code + '|' + i;
  if (dpMemo.has(key)) return dpMemo.get(key);
  const M = DP_M[mk], D = DPD, c = D.byCode[code], date = D.days[i];
  let out;
  if (M.beauty && D.hairOnly[code]) out = { state: 'na' };
  else if (c.closed[i]) out = { state: 'closed' };
  else {
    let v = null, t = null, asst = null;
    if (M.util) {
      const u = c.util[i];
      if (u) {
        const avail = u.hairAvail + u.beautyAvail;
        if (avail > 0) {
          v = (u.hairHours + u.beautyHours) / avail * 100;
          t = (u.hairAvail * TARGETS.hairUtilPct + u.beautyAvail * TARGETS.beautyUtilPct) / avail;
          asst = { shifts: u.assistantShifts || 0, hours: u.assistantHours || 0 };   // on the rota, never in the percentage
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
        // Weighted by weekday (Kate, 18 Oct 2026): a money or count measure takes this weekday's share of the month, where there is history to weigh it by.
        if (t && M.kind === 'vol') { const sh = dpDayShare(mk, code, date); if (sh) t = mt * sh; }
      }
    }
    if (v == null) out = { state: c.closed[i] ? 'closed' : 'nodata' };
    // Utilisation is a band (85 to 100 is on target, over 100 is as bad as under 60), so its score is utilScore, not v / t.
    else out = { state: 'ok', v, t: t || null, p: t ? (M.util ? utilScore(v) * 100 : v / t * 100) : null, asst };
  }
  dpMemo.set(key, out);
  return out;
}
// ── LONG WINDOWS: THE CHARTS DRAW WEEKS OR MONTHS ──────────
// A year of days, let alone All time (about 1,750), cannot be read as one bar or one square each. Over 100 days the Trend, bars and
// heatmap draw one point per week (up to 240 days) or per month, each the sum of its open days against the sum of their targets (a
// rate or a bill: the average). The tiles, the weakest and strongest day, the radar and the three cards underneath still read the days.
// A bucket is a pseudo day index from DP_BK up, so the charts take it the way they take a day.
const DP_BK = 100000;
const DP_UNITS = { day: ['Daily', 'day', '7-day average'], week: ['Weekly', 'week', '4-week average'], month: ['Monthly', 'month', '3-month average'] };
const dpUnitOf = n => n <= 100 ? 'day' : n <= 240 ? 'week' : 'month';
let dpUnit = 'day';
function dpChartIdx(idxs) {
  dpUnit = dpUnitOf(idxs.length);
  DPD.bk = [];
  const bkMemo = []; dpMemo.forEach((v, k) => { const j = Number(k.split('|')[2]); if (j >= DP_BK) bkMemo.push(k); }); bkMemo.forEach(k => dpMemo.delete(k));
  if (dpUnit === 'day') return idxs;
  const out = [], byKey = new Map();
  idxs.forEach(i => {
    const d = DPD.days[i];
    let k, start;
    if (dpUnit === 'week') { start = dpAdd(d, -((d.getDay() + 6) % 7)); k = dpYmd(start); }
    else { start = new Date(d.getFullYear(), d.getMonth(), 1); k = dpYmd(start).slice(0, 7); }
    let b = byKey.get(k);
    if (!b) {
      const date = new Date(start);
      if (dpUnit === 'week') { date.bk = 'Week of ' + dpDayLabel(start) + ' ' + start.getFullYear(); date.bkH = [String(start.getDate()), MON_SHORT[start.getMonth()]]; }
      else { date.bk = MON_LONG[start.getMonth()] + ' ' + start.getFullYear(); date.bkH = [MON_SHORT[start.getMonth()], String(start.getFullYear()).slice(2)]; }
      b = { date, members: [] }; byKey.set(k, b); DPD.bk.push(b); out.push(DP_BK + DPD.bk.length - 1);
    }
    b.members.push(i);
  });
  return out;
}
const dpDate = i => i >= DP_BK ? DPD.bk[i - DP_BK].date : DPD.days[i];
const dpAxisLbl = d => d.bkH ? d.bkH.join(' ') : `${d.getDate()} ${DP_DOW[d.getDay()][0]}`;
function dpBucketCell(mk, code, i) {
  const key = mk + '|' + code + '|' + i;
  if (dpMemo.has(key)) return dpMemo.get(key);
  const M = DP_M[mk], cs = DPD.bk[i - DP_BK].members.map(j => dpCell(mk, code, j)), oks = cs.filter(c => c.state === 'ok');
  let out;
  if (cs.every(c => c.state === 'na')) out = { state: 'na' };
  else if (!oks.length) out = { state: cs.every(c => c.state === 'closed' || c.state === 'na') ? 'closed' : 'nodata' };
  else {
    const both = oks.filter(c => c.t != null), graded = both.length === oks.length;
    const sum = (a, f) => a.reduce((x, c) => x + f(c), 0);
    const v = M.kind === 'vol' ? sum(oks, c => c.v) : sum(oks, c => c.v) / oks.length;
    const t = graded ? (M.kind === 'vol' ? sum(both, c => c.t) : sum(both, c => c.t) / both.length) : null;
    out = { state: 'ok', v, t, p: t ? (M.util ? utilScore(v) * 100 : v / t * 100) : null, asst: null, n: oks.length };
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
// A measure that normally has a target but has none keyed at any branch picked (Total clients and New clients, until someone keys
// one in the Upload Portal) cannot be graded, so it is drawn the way a measure with no target at all is: plain figures, shaded by
// size, nothing coloured red or green. Kate, 16 Oct 2026, from "No target to read the weekdays against" on Total clients.
function dpRawFor(mk, codes) {
  const M = DP_M[mk];
  if (M.notarget) return true;
  return !codes.some(code => DPD.days.some((_, i) => { const c = dpCell(mk, code, i); return c.state === 'ok' && c.p != null; }));
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
// Where yellow starts, in % of target: the dashboard's own 80 (sc() in dashboard.js), or for a measure with a first goal
// below its target (rebooking: 45 of 70) the first goal.
const dpLoP = (mk, t) => { const m = DP_M[mk].milestone; return m && t != null && t > m ? m / t * 100 : 80; };
function dpStatus(p, lo = 80) {
  if (p == null) return ['na', 'No target set', '\u2013'];
  const ms = lo !== 80;
  if (p >= 110) return ['good', 'Ahead of target', '\u2713'];
  if (p >= 100) return ['on', 'On target', '\u2713'];
  if (p >= lo) return ['warn', ms ? 'Past the first goal' : 'Close', '\u25B2'];
  return ['bad', ms ? 'Below the first goal' : 'Below target', '\u25BC'];
}
// Utilisation reads against a band, not a floor (Kate, 16 Oct 2026): 85 to 100 on target, 60 to 84 amber, under 60 or over 100 red.
function dpUtilStatus(v) {
  const b = utilBand(v);
  return b === 'on' ? ['on', 'On target', '✓'] : b === 'warn' ? ['warn', utilBandNote(v), '▲'] : ['bad', utilBandNote(v), '▼'];
}
const dpUtilBin = v => { const b = utilBand(v); return b === 'on' ? 2 : b === 'warn' ? 1 : 0; };
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
// How far a ratio is from its target, in its own units: points for a rate, AED for a bill.
function dpDiff(M, c) {
  const d = Math.abs(c.v - c.t);
  return (M.fmt === dpPctF || M.fmt === dpPct1) ? Math.round(d) + ' points' : M.fmt(d);
}
function dpSpark(code, idxs, mk) {
  const W = 220, H = 44, M = DP_M[mk];
  let units = dpRawFor(mk, [code]) || M.kind === 'ratio';
  const cells = idxs.map(i => dpCell(mk, code, i));
  // Kate, 18 Oct 2026: "what's up with the line progress sa baba ng each branch?" On All time the line is drawn as % of target, and
  // targets were only ever keyed from 2025, so it was a short squiggle at the right-hand end of a line that should span 2021
  // to now. Where fewer than 60% of the points have a target, the line is the figures themselves, the whole way across.
  if (!units && M.kind === 'vol') {
    const nOk = cells.filter(c => c.state === 'ok').length, nP = cells.filter(c => c.state === 'ok' && c.p != null).length;
    if (nOk && nP < nOk * 0.6) units = true;
  }
  const vals = cells.map(c => c.state === 'ok' ? (units ? c.v : c.p) : null);
  const ok = vals.filter(v => v != null);
  if (!ok.length) return '';
  const tgt = M.notarget ? null : (cells.filter(c => c.state === 'ok' && c.t != null).map(c => c.t).slice(-1)[0] ?? null);
  const sc = units ? null : dpPctScale(ok);
  const lo = units ? 0 : sc.lo, hi = units ? (Math.max(...ok, tgt || 0) * 1.15 || 1) : sc.hi;
  const x = k => 2 + k * (W - 4) / Math.max(1, idxs.length - 1);
  const y = p => H - 2 - (Math.min(Math.max(p, lo), hi) - lo) / (hi - lo) * (H - 4);
  const segs = []; let cur = [];
  vals.forEach((v, k) => { if (v != null) cur.push([x(k), y(v)]); else { if (cur.length) segs.push(cur); cur = []; } });
  if (cur.length) segs.push(cur);
  const last = segs[segs.length - 1], lp = last[last.length - 1];
  const refY = units ? (tgt != null ? y(tgt) : null) : y(100);
  return `<svg class="dp-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${dpEsc(dpName(code))} trend">
    ${refY != null ? `<line x1="0" x2="${W}" y1="${refY}" y2="${refY}" stroke="var(--border)" stroke-dasharray="3 3"/>` : ''}
    ${segs.map(sg => sg.length > 1 ? `<path d="${dpCurve(sg)}" fill="none" stroke="${dpCol(code)}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` : '').join('')}
    <circle cx="${lp[0]}" cy="${lp[1]}" r="4" fill="${dpCol(code)}" stroke="var(--surface)" stroke-width="2"/></svg>`;
}

// Which branches are showing. null means All. Clicking a branch while All is on isolates it; after that each click
// adds or takes one off (never the last), and All puts them all back. Kate, 13 Oct 2026: "toggle however many
// branches we'd like, ALL toggle included".
// The branches are the masthead's Branch filter (the global `sel`); a branch this page does not carry (Bahrain) is left out,
// and if nothing is left it shows all four.
function dpSel() {
  const all = DPD.codes, g = (typeof sel !== 'undefined' && sel && sel.branch) ? sel.branch : ['all'];
  const pick = g.includes('all') ? all : all.filter(c => g.includes(c));
  return pick.length ? pick : all;
}
function dpOffPage() {
  const g = (typeof sel !== 'undefined' && sel && sel.branch) ? sel.branch : ['all'];
  return g.some(c => BH_BRANCHES.includes(c));
}
// What the whole window came to for one branch: a count or money is added up (against the target of the same days),
// a rate or a bill is averaged, the same convention the combined bars use. Added 13 Oct 2026 after the Comet audit:
// a tile showed one day only, so "Saadiyat against Al Quoz over 7 days" could not be answered.
// The weakest day per branch for the measure picked in the Measure menu (Kate, 16 Oct 2026: it has to follow the menu): the day
// that fell furthest below its target, as a % of the day's target; a measure or branch with no target shows the lowest figure
// instead and says so. It first scored every day across all the measures at once, which left the Measure menu unable to answer
// "which was my worst Retail day". The other measures that were low the same day ride underneath.
// A date as a small calendar leaf: month on an ink band, the day number big, the weekday under it (Kate, 16 Oct 2026, for the
// Weakest day rows). Ink and cream come from the dashboard's own tokens, so the band is ink on light and the theme's accent on
// dark. The full date is the label for a screen reader.
const dpCalendar = d => `<span class="dp-cal" role="img" aria-label="${dpEsc(dpDayLabel(d))}"><span class="dp-cal-m">${MON_SHORT[d.getMonth()]} ${d.getFullYear()}</span><span class="dp-cal-d">${d.getDate()}</span><span class="dp-cal-w">${DP_DOW[d.getDay()]}</span></span>`;
// Kate, 16 Oct 2026: the same card, read the other way round for the Strongest day (best = true): the highest figure, or the one furthest above its target.
function dpWeakest(idxs, codes, best) {
  const mk = DP.measure, M = DP_M[mk], others = Object.keys(DP_M).filter(k => k !== mk && !DP_M[k].notarget);
  return codes.map(code => {
    const head = `<b><span class="dot" style="background:${dpCol(code)};margin-right:6px"></span>${dpEsc(dpName(code))}</b>`;
    if (M.beauty && DPD.hairOnly[code]) return `<div class="dp-swr"><div>${head}<div class="dp-sub">No Beauty team at this branch.</div></div></div>`;
    let worst = null;
    idxs.forEach(i => {
      const c = dpCell(mk, code, i);
      if (c.state !== 'ok' || c.v == null) return;
      const key = (!M.notarget && c.p != null) ? c.p : c.v;
      if (!worst || (best ? key > worst.key : key < worst.key)) worst = { i, key, c };
    });
    if (!worst) return `<div class="dp-swr"><div>${head}<div class="dp-sub">No ${dpEsc(M.label)} figures in this window.</div></div></div>`;
    const c = worst.c, hasT = !M.notarget && c.p != null && c.t != null;
    // The other measures that were low that same day, worst first.
    const ps = others.map(k => ({ k, c: dpCell(k, code, worst.i) })).filter(x => x.c.state === 'ok' && x.c.p != null && (best ? x.c.p >= 100 : x.c.p < 100)).sort((a, b) => best ? b.c.p - a.c.p : a.c.p - b.c.p).slice(0, 3);
    // Kate, 16 Oct 2026: on a phone the "also low that day" sentence ran to five lines, so each is a small pill (a rate or a bill: figure and target, money or count: % of target).
    const also = ps.map(x => `<span class="dp-pi ${best ? 'good' : 'bad'}">${dpEsc(DP_M[x.k].label)} ${DP_M[x.k].kind === 'ratio' ? dpEsc(DP_M[x.k].fmt(x.c.v)) + (x.c.t != null ? ' vs ' + dpEsc(DP_M[x.k].fmt(x.c.t)) : '') : Math.round(x.c.p) + '%'}</span>`).join('');
    let line, chip;
    if (hasT) {
      const [cls, , ic] = M.util ? dpUtilStatus(c.v) : dpStatus(c.p, dpLoP(mk, c.t));
      line = M.util ? `${dpEsc(M.label)}: ${M.fmt(c.v)}, ${dpEsc(utilBandNote(c.v).toLowerCase())}` : `${dpEsc(M.label)}: ${M.fmt(c.v)} against ${M.kind === 'ratio' ? '' : 'a daily target of '}${M.fmt(c.t)}`;
      chip = `<span class="dp-chip ${cls}" title="${dpEsc(M.label)} against its target that day">${ic} ${M.kind === 'ratio' ? dpEsc(M.fmt(c.v)) : Math.round(c.p) + '%'}</span>`;
    } else {
      line = `${dpEsc(M.label)}: ${M.fmt(c.v)}`;   // the card's own line already says no target is set
      chip = `<span class="dp-chip na">– No target</span>`;
    }
    return `<div class="dp-swr"><div>${head}<div class="dp-sub">${line}</div></div><div class="dp-swr-r">${dpCalendar(DPD.days[worst.i])}${chip}</div>${also ? `<div class="dp-pl"><span class="dp-pll">Also ${best ? 'strong' : 'low'} that day</span>${also}</div>` : ''}</div>`;
  }).join('');
}
function dpPeriodName(idxs) {
  const k = typeof activePeriodKey === 'function' ? activePeriodKey() : '';
  const first = idxs.length ? DPD.days[idxs[0]] : null, last = idxs.length ? DPD.days[idxs[idxs.length - 1]] : null;
  if (first && idxs.length > 1) {
    const wholeMonth = first.getDate() === 1 && last.getFullYear() === first.getFullYear() && last.getMonth() === first.getMonth() && (last.getDate() === new Date(last.getFullYear(), last.getMonth() + 1, 0).getDate());
    // The whole period, said as such (Kate, 18 Oct 2026): the big number above is one day.
    if (k === 'This month') return `Whole period so far, ${dpDayLabel(first)} to ${dpDayLabel(last)}`;
    if (wholeMonth) return `Whole of ${MON_LONG[first.getMonth()]} ${first.getFullYear()}`;
    if (k && !['Custom', 'Year', 'Month'].includes(k)) return `Whole period, ${k.toLowerCase()}`;
    return `Whole period, ${dpDayLabel(first)} to ${dpDayLabel(last)}`;
  }
  if (k === 'This month') return 'Month to date';
  if (k && !['Custom', 'Year', 'Month'].includes(k)) return k;
  return idxs.length ? dpDayLabel(DPD.days[idxs[0]]) + ' to ' + dpDayLabel(DPD.days[idxs[idxs.length - 1]]) : 'This window';
}
function dpPeriodLine(mk, code, idxs) {
  const M = DP_M[mk], cs = idxs.map(i => dpCell(mk, code, i)).filter(c => c.state === 'ok');
  if (!cs.length) return '';
  const n = cs.length, both = cs.filter(c => c.t != null), name = dpPeriodName(idxs);
  let body;
  if (M.kind === 'vol') {
    const pct = both.length ? both.reduce((a, c) => a + c.v, 0) / both.reduce((a, c) => a + c.t, 0) * 100 : null;
    body = M.fmt(cs.reduce((a, c) => a + c.v, 0)) + (pct != null ? ' \u00B7 ' + Math.round(pct) + '% of target' : '');
  } else {
    const avg = cs.reduce((a, c) => a + c.v, 0) / n, t = both.length ? both.reduce((a, c) => a + c.t, 0) / both.length : null;
    body = 'average ' + M.fmt(avg) + (M.util ? ' \u00B7 ' + utilBandNote(avg).toLowerCase()
      : t != null ? ' \u00B7 ' + (Math.abs(avg - t) < 1e-9 ? 'on target' : dpDiff(M, { v: avg, t }) + ' ' + (avg >= t ? 'above' : 'below') + ' target') : '');
  }
  return `<div class="dp-sub dp-per"><b>${dpEsc(name)}</b>: ${body} (${n} open day${n === 1 ? '' : 's'})</div>`;
}
// ── TILES FOR A LONG WINDOW (a Year, All time, over 100 days) ──
// Kate, 16 Oct 2026: the latest day as the big number, with a daily squiggle under it, says nothing about a year. So the tile gives the
// window's total (a rate or a bill: its average), the daily average, the target if one is keyed, whether it grew or fell, and the
// weekly or monthly line. Growth is against the same dates a year earlier (100 to 600 days), or the latest 12 months against the 12 before
// (600 days and more, up to the branch's last open day), and only when that earlier stretch has at least 60% as many open days.
const dpRangeLbl = d => `${d.getDate()} ${MON_SHORT[d.getMonth()]} ${d.getFullYear()}`;
const dpYearsBack = (d, n) => new Date(d.getFullYear() - n, d.getMonth(), d.getDate());
function dpTotals(mk, code, ids) {
  const M = DP_M[mk], cs = ids.map(i => dpCell(mk, code, i)).filter(c => c.state === 'ok');
  if (!cs.length) return null;
  const n = cs.length, sum = cs.reduce((a, c) => a + c.v, 0), both = cs.filter(c => c.t != null);
  const vt = both.reduce((a, c) => a + c.v, 0), tt = both.reduce((a, c) => a + c.t, 0);
  return { n, v: M.kind === 'vol' ? sum : sum / n, pct: M.kind === 'vol' && both.length && tt > 0 ? vt / tt * 100 : null, t: M.kind === 'ratio' && both.length ? tt / both.length : null };
}
function dpGrowth(mk, code, win, idxs) {
  const M = DP_M[mk];
  let cur, prev, label;
  if (idxs.length >= 600) {
    let end = -1;
    for (let k = idxs.length - 1; k >= 0; k--) if (dpCell(mk, code, idxs[k]).state === 'ok') { end = k; break; }
    if (end < 729) return { none: 'Less than two years of figures, so no like-for-like growth.' };
    cur = idxs.slice(end - 364, end + 1); prev = idxs.slice(end - 729, end - 364);
    label = `Latest 12 months (to ${dpRangeLbl(DPD.days[idxs[end]])}) against the 12 months before.`;
  } else {
    const pf = dpYearsBack(win.from, 1), pt = dpYearsBack(win.to, 1);
    if (pf < new Date(PERIOD_FIRST_YEAR, 0, 1)) return { none: 'No earlier year to compare with.' };
    cur = idxs; prev = [];
    DPD.days.forEach((d, i) => { if (d >= pf && d <= pt) prev.push(i); });
    label = `Against ${dpRangeLbl(pf)} to ${dpRangeLbl(pt)}.`;
  }
  const a = dpTotals(mk, code, cur), b = dpTotals(mk, code, prev);
  if (!a) return null;
  if (!b || b.n < a.n * .6 || !(b.v > 0)) return { none: 'Not enough open days a year earlier to compare.' };
  const pts = M.fmt === dpPctF || M.fmt === dpPct1, d = a.v - b.v, rel = d / b.v * 100, ch = pts ? d : rel;
  const flat = Math.abs(ch) < (pts ? .5 : 1);
  const text = flat ? 'Flat' : pts ? `${Math.abs(Math.round(d * 10) / 10)} points ${d > 0 ? 'up' : 'down'}` : `${Math.abs(Math.round(rel))}% ${rel > 0 ? 'up' : 'down'}`;
  return { cls: flat ? 'na' : ch > 0 ? 'good' : 'bad', ic: flat ? '–' : ch > 0 ? '▲' : '▼', text, label };
}
function dpLongTile(code, win, idxs, cidx, head) {
  const mk = DP.measure, M = DP_M[mk], t = dpTotals(mk, code, idxs), vol = M.kind === 'vol';
  if (!t) return `<div class="dp-tile">${head}<div class="big" style="color:var(--muted2)">—</div><div class="dp-sub">No figures in this window</div></div>`;
  let tchip = '';
  if (M.util) { const [cls, txt, ic] = dpUtilStatus(t.v); tchip = `<span class="dp-chip ${cls}">${ic} ${dpEsc(txt)}</span>`; }
  else if (vol && t.pct != null) { const [cls, txt, ic] = dpStatus(t.pct, dpLoP(mk, null)); tchip = `<span class="dp-chip ${cls}">${ic} ${Math.round(t.pct)}% of target · ${txt}</span>`; }
  else if (!vol && t.t != null) { const [cls, , ic] = dpStatus(t.v / t.t * 100, dpLoP(mk, t.t)); tchip = Math.abs(t.v - t.t) < 1e-9 ? `<span class="dp-chip on">On target</span>` : `<span class="dp-chip ${cls}">${ic} ${dpDiff(M, { v: t.v, t: t.t })} ${t.v >= t.t ? 'above' : 'below'} target</span>`; }
  else tchip = '<span class="dp-chip na">– No target set</span>';
  const g = dpGrowth(mk, code, win, idxs);
  const gnote = !g ? '' : g.none ? `<div class="dp-sub" style="margin-top:6px">${dpEsc(g.none)}</div>` : `<div class="dp-sub">${dpEsc(g.label)}</div>`;
  const gchip = g && !g.none ? `<span class="dp-chip ${g.cls}" style="margin-left:6px">${g.ic} ${dpEsc(g.text)}</span>` : '';
  return `<div class="dp-tile">${head}<div class="big">${M.fmt(t.v)}</div>
    <div class="dp-sub"><b style="color:var(--text)">${M.def && typeof ihTip === 'function' ? ihTip(dpEsc(M.label), M.def) : dpEsc(M.label)}</b> · ${vol ? 'total' : 'average'}, ${dpRangeLbl(win.from)} to ${dpRangeLbl(win.to)}</div>
    <div class="dp-sub">${t.n} open day${t.n === 1 ? '' : 's'}${vol ? ' · ' + M.fmt(t.v / t.n) + ' a day on average' : ''}</div>
    <div>${tchip}${gchip}</div>${gnote}
    <div style="margin-top:8px;max-width:260px">${dpSpark(code, cidx, mk)}</div></div>`;
}
// The whole window as one figure (a total for money and counts, an average for rates), read the same way dpPeriodLine reads it.
function dpPeriodFig(mk, code, idxs) {
  const M = DP_M[mk], cs = idxs.map(i => dpCell(mk, code, i)).filter(c => c.state === 'ok');
  if (!cs.length) return null;
  const n = cs.length, both = cs.filter(c => c.t != null);
  let v, t = null, p = null;
  if (M.kind === 'vol') {
    v = cs.reduce((a, c) => a + c.v, 0);
    if (both.length) { t = both.reduce((a, c) => a + c.t, 0); p = both.reduce((a, c) => a + c.v, 0) / t * 100; }
  } else {
    v = cs.reduce((a, c) => a + c.v, 0) / n;
    if (both.length) { t = both.reduce((a, c) => a + c.t, 0) / both.length; p = M.util ? utilScore(v) * 100 : v / t * 100; }
  }
  return { v, t, p, n };
}
// The meter under a tile (Kate, 18 Oct 2026: "a bar meter with a moveable needle to show daily performance"): 0 to 150% of target,
// red under 80, amber to 100, green beyond. The bar is the whole period against its target, the needle is the latest day against its
// own daily target, the dashed line is 100%. Money and counts that have a target; a rate keeps its chip.
function dpMeter(pf, c, dayName, M) {
  if (!pf || pf.p == null) return '';
  const X = p => Math.min(Math.max(p, 0), 150) / 150 * 100;
  const dayP = c && c.p != null ? c.p : null, col = pf.p >= 100 ? 'good' : pf.p >= 80 ? 'warn' : 'bad';
  // Kate, 18 Oct 2026: "it says 149% above target, but doesn't actually show what the target value is": each line under the meter now
  // names the target it is a percentage of.
  const tgt = x => x != null && M && M.fmt ? ' of ' + M.fmt(x) : '';
  return `<div class="dp-meter" role="img" aria-label="Whole period ${Math.round(pf.p)}% of target${dayP != null ? ', day ' + Math.round(dayP) + '%' : ''}"><span class="mz bad" style="width:${80 / 150 * 100}%"></span><span class="mz warn" style="width:${20 / 150 * 100}%"></span><span class="mz good"></span><i class="mf ${col}" style="width:${X(pf.p)}%"></i><b class="mt" style="left:${X(100)}%"></b>${dayP != null ? `<b class="mn" style="left:${X(dayP)}%"></b>` : ''}</div>
    <div class="dp-meter-k"><i class="kb"></i><span>Whole period ${Math.round(pf.p)}%${tgt(pf.t)} target</span></div>${dayP != null ? `
    <div class="dp-meter-k"><i class="kn"></i><span>${dayName ? dayName + ' ' : 'Day '}${Math.round(dayP)}%${tgt(c.t)} target${dayP > 150 ? ' (off the end of the meter)' : ''}</span></div>` : ''}`;
}
// The day the needle has been moved to (an index into the window's days), or null for the latest open day. Reset when the window changes.
let dpPick = null, dpPickKey = '', dpCtx = null;
// The last day (an index into idxs) on which any branch showing has figures: where the needle starts, and what the slider rests on.
function dpLatestIdx(idxs) {
  const mk = DP.measure, codes = dpSel();
  for (let k = idxs.length - 1; k >= 0; k--) if (codes.some(code => dpCell(mk, code, idxs[k]).state === 'ok')) return k;
  return idxs.length - 1;
}
const dpPickLabel = idxs => dpPick != null && dpPick < idxs.length ? dpDayLabel(DPD.days[idxs[dpPick]]) : 'Latest open day, ' + dpDayLabel(DPD.days[idxs[dpLatestIdx(idxs)]]);
function dpTiles(win, idxs, cidx) {
  const mk = DP.measure, M = DP_M[mk];
  const pickI = idxs.length > 1 && dpUnit === 'day' && dpPick != null && dpPick >= 0 && dpPick < idxs.length ? dpPick : null;
  return dpSel().map(code => {
    const head = `<div class="nm"><span class="dot" style="background:${dpCol(code)}"></span>${dpEsc(dpName(code))}</div>`;
    if (M.beauty && DPD.hairOnly[code]) return `<div class="dp-tile">${head}<div class="big" style="color:var(--muted2)">n/a</div><div class="dp-sub">No Beauty team at this branch</div><span class="dp-chip na">– Not tracked</span></div>`;
    if (dpUnit !== 'day') return dpLongTile(code, win, idxs, cidx, head);
    let li = -1;
    if (pickI != null) li = idxs[pickI];
    else for (let k = idxs.length - 1; k >= 0; k--) if (dpCell(mk, code, idxs[k]).state === 'ok') { li = idxs[k]; break; }
    if (li < 0) return `<div class="dp-tile">${head}<div class="big" style="color:var(--muted2)">—</div><div class="dp-sub">No figures in this window yet</div></div>`;
    const raw = dpCell(mk, code, li), c = raw.state === 'ok' ? raw : null;
    const lastIdx = idxs[idxs.length - 1];
    const shut = pickI == null && dpCell(mk, code, lastIdx).state !== 'ok';
    // Kate, 18 Oct 2026, over a month window: "ganito kababa per branch? parang may mali" (it was one day, the month's last, not the month),
    // then "YOU SHOULD ABSOLUTELY SPECIFY THAT IT'S THE DATE TODAY". Every figure now says which it is: the period, or the day.
    const dayWord = pickI != null ? 'Day' : li === lastIdx ? 'Latest day' : 'Latest open day';
    const dayName = dpEsc(dpDayLabel(DPD.days[li]));
    const why = raw.state === 'closed' ? 'Closed' : 'No figures';
    const pf = idxs.length > 1 ? dpPeriodFig(mk, code, idxs) : null;
    const label = `<b style="color:var(--text)">${M.def && typeof ihTip === 'function' ? ihTip(dpEsc(M.label), M.def) : dpEsc(M.label)}</b>`;
    const meter = M.kind === 'vol' && !M.notarget ? dpMeter(pf, c, dayName, M) : '';
    const spark = `<div style="margin-top:8px;max-width:260px">${dpSpark(code, idxs, mk)}</div>`;
    const asst = c && M.util && c.asst && c.asst.shifts ? `<div class="dp-sub">Assistants on shift: ${c.asst.shifts} (${Math.round(c.asst.hours)} h on the rota), not in the percentage</div>` : '';
    if (DP.lead !== 'day' && pf) {
      // The Show toggle on Whole period (the default): the period leads, the day is the line under it and the needle on the meter.
      const [pcls, ptxt, pic] = M.util ? dpUtilStatus(pf.v) : dpStatus(pf.p, dpLoP(mk, pf.t));
      const pchip = M.util ? ptxt : (M.kind === 'ratio' && pf.t != null) ? (Math.abs(pf.v - pf.t) < 1e-9 ? 'On target' : `${dpDiff(M, pf)} ${pf.v >= pf.t ? 'above' : 'below'} target`)
        : `${pf.p != null ? Math.round(pf.p) + '% · ' : ''}${ptxt}`;
      const dayLine = c
        ? `<div class="dp-sub dp-per"><b>${dayWord} · ${dayName}</b>: ${M.fmt(c.v)}${c.p != null && !M.util ? ' · ' + Math.round(c.p) + '% of target' : ''}${c.t && M.kind !== 'ratio' ? ' (daily target ' + M.fmt(c.t) + ')' : ''}</div>`
        : `<div class="dp-sub dp-per"><b>${dayWord} · ${dayName}</b>: ${why}</div>`;
      return `<div class="dp-tile">${head}<div class="dp-eyebrow">${dpEsc(dpPeriodName(idxs))}</div><div class="big">${M.fmt(pf.v)}</div>
      <div class="dp-sub">${label} · ${pf.n} open day${pf.n === 1 ? '' : 's'}${M.kind === 'vol' ? ' · ' + M.fmt(pf.v / pf.n) + ' a day on average' : ' · average'}</div>
      <span class="dp-chip ${pcls}">${pic} ${pchip}</span>
      ${meter}
      ${asst}
      ${dayLine}
      ${spark}</div>`;
    }
    const eyebrow = idxs.length > 1 ? `<div class="dp-eyebrow">${dayWord} · ${dayName}</div>` : '';
    if (!c) {
      // A day picked on which this branch was shut or has nothing: say so, keep the period under it.
      return `<div class="dp-tile">${head}${eyebrow}<div class="big" style="color:var(--muted2)">—</div>
      <div class="dp-sub">${label} · ${why} ${dayName}</div>
      ${meter}
      ${dpPeriodLine(mk, code, idxs)}
      ${spark}</div>`;
    }
    const [cls, txt, ic] = M.util ? dpUtilStatus(c.v) : dpStatus(c.p, dpLoP(mk, c.t));
    const ratio = M.kind === 'ratio' && !M.notarget && c.t != null;
    const chip = M.util ? txt : ratio ? (Math.abs(c.v - c.t) < 1e-9 ? 'On target' : `${dpDiff(M, c)} ${c.v >= c.t ? 'above' : 'below'} target${cls === 'warn' && c.t > (M.milestone || Infinity) ? ' · past the ' + M.fmt(M.milestone) + ' first goal' : ''}`)
      : `${c.p != null ? Math.round(c.p) + '% · ' : ''}${txt}`;
    return `<div class="dp-tile">${head}${eyebrow}<div class="big">${M.fmt(c.v)}</div>
      <div class="dp-sub">${label} · ${shut ? (dpCell(mk, code, lastIdx).state === 'closed' ? 'Closed ' + dpDayLabel(DPD.days[lastIdx]) + ' · last open ' : 'Latest figures ') : ''}${dayName}${c.t ? (M.kind === 'ratio' ? ' · target ' : ' · daily target ') + M.fmt(c.t) : ''}</div>
      <span class="dp-chip ${cls}">${ic} ${chip}</span>
      ${meter}
      ${asst}
      ${dpPeriodLine(mk, code, idxs)}
      ${spark}</div>`;
  }).join('');
}

// ── CHART A: every branch on one scale ─────────────────────
// Money and counts: % of target, so 100% is the day's target. A ratio, or a measure with no target at all (NCR %):
// the figure itself, the axis from 0, and for a ratio the target as a dashed line at its real value.
function dpChartA(host, idxs) {
  const mk = DP.measure, M = DP_M[mk], W = dpW(host), n = idxs.length, raw = dpRawFor(mk, dpSel()), units = raw || M.kind === 'ratio';
  const H = Math.round(Math.min(340, Math.max(230, W * .34))), m = { l: 42, r: 46, t: 10, b: 26 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const val = c => (units ? c.v : c.p);
  const okc = (code, i) => { const c = dpCell(mk, code, i); return c.state === 'ok' && val(c) != null ? c : null; };
  const tracked = dpSel().filter(c => idxs.some(i => okc(c, i)));
  // the branches share one benchmark, so a ratio's target is the mean of the shown branches that day
  const tgt = idxs.map(i => {
    if (!units || raw) return null;
    const ts = tracked.map(c => dpCell(mk, c, i)).filter(z => z.state === 'ok' && z.t != null).map(z => z.t);
    return ts.length ? ts.reduce((a, b) => a + b, 0) / ts.length : null;
  });
  const tv = tgt.filter(v => v != null);
  let lo = 40, hi = 140, ticks = [60, 80, 100, 120, 140], tfmt = v => v + '%';
  if (units && tracked.length) {
    const all = tracked.flatMap(c => idxs.map(i => okc(c, i)).filter(Boolean).map(z => z.v)).concat(tv);
    const mx = Math.max(1e-9, ...all), nice = dpNice(mx * 1.1), pctFmt = M.fmt === dpPctF || M.fmt === dpPct1;
    lo = 0; hi = Math.ceil(mx * 1.1 / nice) * nice; ticks = [];
    for (let v = 0; v <= hi + 1e-9; v += nice) ticks.push(v);
    if (pctFmt && mx <= 95) { hi = 100; ticks = [20, 40, 60, 80, 100]; }
    tfmt = v => dpAxis(mk, v, hi);
  } else if (!units) {
    const sc = dpPctScale(tracked.flatMap(c => idxs.map(i => okc(c, i)).filter(Boolean).map(z => z.p)));
    lo = sc.lo; hi = sc.hi; ticks = sc.ticks;
  }
  const x = k => m.l + (n === 1 ? iw / 2 : k * iw / (n - 1)), y = p => m.t + ih - (Math.min(Math.max(p, lo), hi) - lo) / (hi - lo) * ih;
  let g = '';
  ticks.forEach(v => {
    const ref = !units && v === 100;
    g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--border)"${ref ? ' stroke-dasharray="5 4" stroke-width="1.5"' : ''}/><text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${tfmt(v)}</text>`;
  });
  // a ratio's target, as the dashed line it is
  if (tv.length) {
    const d = tgt.map((t, k) => t == null ? null : [x(k), y(t)]).filter(Boolean).map((q, k) => (k ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' ');
    g += `<path d="${d}" fill="none" stroke="var(--muted2)" stroke-dasharray="5 4" stroke-width="1.5"/>`;
  }
  const step = Math.max(1, Math.ceil(n / (W < 520 ? 7 : 14)));
  idxs.forEach((i, k) => { if (k % step === 0) g += `<text x="${x(k)}" y="${H - 6}" text-anchor="middle">${dpAxisLbl(dpDate(i))}</text>`; });
  const ends = [];
  // Kate, 16 Oct 2026: each branch's line also has a soft area under it (like a layered area chart), so the days a branch covers show as a block
  // and a closed day is a gap in it. The areas go down first so every line stays on top.
  let ga = '', gl = '';
  const base = m.t + ih;
  tracked.forEach(code => {
    const runs = []; let cur = [];
    idxs.forEach((i, k) => { const c = okc(code, i); if (c) cur.push([x(k), y(val(c))]); else { if (cur.length) runs.push(cur); cur = []; } });
    if (cur.length) runs.push(cur);
    runs.forEach(r => {
      if (r.length > 1) {
        ga += `<path d="${dpCurve(r)} L${r[r.length - 1][0].toFixed(1)} ${base} L${r[0][0].toFixed(1)} ${base} Z" fill="${dpCol(code)}" fill-opacity=".16" stroke="none"/>`;
        gl += `<path d="${dpCurve(r)}" fill="none" stroke="${dpCol(code)}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      }
      r.forEach(q => { gl += `<circle cx="${q[0]}" cy="${q[1]}" r="3" fill="${dpCol(code)}" stroke="var(--surface)" stroke-width="1.5"/>`; });
    });
    if (runs.length) { const l = runs[runs.length - 1]; ends.push({ code, y: l[l.length - 1][1] }); }
  });
  g += ga + gl;
  ends.sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 14) ends[k].y = ends[k - 1].y + 14;
  ends.forEach(e => { g += `<text class="tv" x="${W - m.r + 4}" y="${e.y + 4}">${e.code}</text>`; });
  // hover columns: one per day, tooltip lists every branch
  const cw = n === 1 ? iw : iw / (n - 1);
  idxs.forEach((i, k) => {
    const tip = `<b>${dpDayLabel(dpDate(i))}</b>` + dpSel().map(code => {
      const c = dpCell(mk, code, i);
      const v = c.state !== 'ok' ? dpWhy(c.state) : M.fmt(c.v) + (units ? '' : (c.p != null ? ' \u00B7 ' + Math.round(c.p) + '%' : ' \u00B7 no target'));
      return `<div class="r"><span><span class="dot" style="background:${dpCol(code)}"></span> ${code}</span><span>${v}</span></div>`;
    }).join('') + (tgt[k] != null ? `<div class="r"><span>Target</span><span>${M.fmt(tgt[k])}</span></div>` : '');
    g += `<g class="dp-hit"><line class="xh" x1="${x(k)}" x2="${x(k)}" y1="${m.t}" y2="${m.t + ih}" stroke="var(--muted2)"/><rect x="${x(k) - cw / 2}" y="${m.t}" width="${cw}" height="${ih}" fill="transparent" data-tip="${dpEsc(tip)}"/></g>`;
  });
  const steady = tv.length && (Math.max(...tv) - Math.min(...tv)) <= Math.max(...tv) * .01;
  const tLegend = units
    ? (tv.length ? `<span><svg viewBox="0 0 22 8"><line x1="0" x2="22" y1="4" y2="4" stroke="var(--muted2)" stroke-dasharray="5 4" stroke-width="1.5"/></svg>${dpEsc(steady ? 'Target ' + M.fmt(tv[tv.length - 1]) : DP_UNITS[dpUnit][0] + ' target (' + M.fmt(tv[tv.length - 1]) + ' now)')}</span>` : '')
    : `<span><svg viewBox="0 0 22 8"><line x1="0" x2="22" y1="4" y2="4" stroke="var(--muted2)" stroke-dasharray="5 4" stroke-width="1.5"/></svg>${DP_UNITS[dpUnit][0]} target (100%)</span>`;
  const legend = tracked.map(c => `<span><i class="dot" style="background:${dpCol(c)}"></i>${dpEsc(dpName(c))}</span>`).join('') + tLegend
    + (tracked.length < dpSel().length ? '<span>A branch with no line has no target set, or is not tracked, for this measure</span>' : '');
  const cellTxt = c => (c.state !== 'ok' ? dpWhy(c.state) : (units ? M.fmt(c.v) : (c.p != null ? Math.round(c.p) + '%' : M.fmt(c.v))));
  const table = `<div class="dp-scroll"><table class="dp-tbl"><tr><th>${dpUnit === 'day' ? 'Day' : dpUnit === 'week' ? 'Week' : 'Month'}</th>${dpSel().map(c => `<th>${c}</th>`).join('')}</tr>${idxs.map(i => `<tr><td>${dpDayLabel(dpDate(i))}</td>${dpSel().map(code => `<td>${cellTxt(dpCell(mk, code, i))}</td>`).join('')}</tr>`).join('')}</table></div>`;
  if (!tracked.length) return `<p class="dp-why" style="margin:20px 0">No branch has a target set for ${dpEsc(M.noun)} in this window, so there is nothing to put on one scale. The branch tiles above still show the figures.</p>`;
  return `<div class="dp-legend">${legend}</div><svg class="dp-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${DP_UNITS[dpUnit][0]} ${dpEsc(M.noun)}${units ? '' : ' as a percentage of target'}, by branch">${g}</svg><details><summary>View as table</summary>${table}</details>`;
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
  const U = DP_UNITS[dpUnit], title = multi ? `${name}, combined: ${U[0].toLowerCase()} ${M.noun} and ${U[2]}` : `${name}: ${U[0].toLowerCase()} ${M.noun} and ${U[2]}`;
  // Several branches added together are not one branch, so they take the brand accent (ink on light, blush on dark) rather than a
  // grey; one branch keeps its own colour (Kate, 16 Oct 2026: the grey was not brand aligned).
  const color = multi ? 'var(--accent)' : dpCol(code);
  if (!multi && M.beauty && DPD.hairOnly[code]) return { title, html: `<p class="dp-why" style="margin:24px 0">${dpEsc(dpName(code))} has no Beauty team, so there is nothing to show for ${dpEsc(M.noun)}. Pick another branch.</p>`, why: 'Not tracked at this branch.', legend: '' };
  const cells = idxs.map(i => multi ? dpCombine(mk, codes, i) : dpCell(mk, code, i));
  const vals = cells.map(c => c.state === 'ok' ? c.v : null);
  const ma = vals.map((v, k) => { if (v == null) return null; const w = vals.slice(Math.max(0, k - (dpUnit === 'day' ? 6 : dpUnit === 'week' ? 3 : 2)), k + 1).filter(z => z != null); return w.length >= 3 ? w.reduce((a, b) => a + b, 0) / w.length : null; });
  const tg = cells.map(c => c.t || null);
  const H = Math.round(Math.min(330, Math.max(220, W * .32))), m = { l: 52, r: 12, t: 12, b: 26 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const raw = Math.max(...vals.filter(v => v != null), ...tg.filter(v => v != null), 1) * 1.08;
  const nice = dpNice(raw), mx = Math.ceil(raw / nice) * nice, y = v => m.t + ih - v / mx * ih, bw = iw / n, bwid = Math.max(3, Math.min(34, bw * .62));
  let g = '';
  for (let v = 0; v <= mx + 1e-9; v += nice) g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--border)"/><text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${dpAxis(mk, v, mx)}</text>`;
  const step = Math.max(1, Math.ceil(n / (W < 520 ? 7 : 16)));
  const tips = [];
  cells.forEach((c, k) => {
    const cx = m.l + bw * k + bw / 2, date = dpDate(idxs[k]);
    if (c.state !== 'ok') tips[k] = `<b>${dpDayLabel(date)}</b><div>${dpWhy(c.state)}</div>`;
    if (c.state === 'ok') {
      const below = c.t != null && c.v < c.t, yy = y(c.v), r = Math.min(4, bwid / 2);
      const parts = multi ? codes.map(b => { const z = dpCell(mk, b, idxs[k]); return `<div class="r"><span><span class="dot" style="background:${dpCol(b)}"></span> ${b}</span><span>${z.state === 'ok' ? M.fmt(z.v) : dpWhy(z.state)}</span></div>`; }).join('') : '';
      const tip = `<b>${dpDayLabel(date)}</b><div class="r"><span>${multi ? 'Combined' : M.label}</span><span>${M.fmt(c.v)}</span></div>${ma[k] != null ? `<div class="r"><span>${U[2]}</span><span>${M.fmt(ma[k])}</span></div>` : ''}${c.t ? `<div class="r"><span>Target</span><span>${M.fmt(c.t)}</span></div><div class="r"><span>vs target</span><span>${M.kind === 'ratio' ? dpDiff(M, c) + (c.v >= c.t ? ' above' : ' below') : Math.round(c.p) + '%'}</span></div>` : '<div class="r"><span>Target</span><span>not set</span></div>'}${parts}`;
      tips[k] = tip;
      g += `<path d="M${cx - bwid / 2} ${m.t + ih} V${yy + r} Q${cx - bwid / 2} ${yy} ${cx - bwid / 2 + r} ${yy} H${cx + bwid / 2 - r} Q${cx + bwid / 2} ${yy} ${cx + bwid / 2} ${yy + r} V${m.t + ih} Z" style="fill:${color}" opacity="${below ? .45 : 1}"/>`;
    } else if (c.state === 'closed') g += `<text x="${cx}" y="${m.t + ih - 6}" text-anchor="middle" font-size="10">${bw > 38 ? 'Closed' : '\u00D7'}</text>`;
    if (k % step === 0) g += `<text x="${cx}" y="${H - 6}" text-anchor="middle">${dpAxisLbl(date)}</text>`;
  });
  const tp = []; tg.forEach((t, k) => { if (t != null) { const xa = m.l + bw * k, xb = m.l + bw * (k + 1); tp.push((tp.length && tg[k - 1] != null ? 'L' : 'M') + xa + ' ' + y(t) + 'L' + xb + ' ' + y(t)); } });
  if (tp.length) g += `<path d="${tp.join('')}" fill="none" stroke="var(--muted2)" stroke-dasharray="5 4" stroke-width="1.5"/>`;
  // The target's number lives in the legend, not on the plot: a label on the line ran into the 7-day average and the bars.
  const tv = tg.filter(t => t != null), lastT = tv.length ? tv[tv.length - 1] : null;
  const steady = tv.length && (Math.max(...tv) - Math.min(...tv)) <= Math.max(...tv) * .01;
  const tLabel = lastT == null ? '' : (multi && M.kind === 'vol' ? `Combined ${U[0].toLowerCase()} target of the branches open ${dpUnit === 'day' ? 'that day' : 'in it'} (${M.fmt(lastT)}${steady ? '' : ' now'})` : (steady ? `${U[0]} target ${M.fmt(lastT)}` : `${U[0]} target (${M.fmt(lastT)} now)`));
  const pts = ma.map((v, k) => v == null ? null : [m.l + bw * k + bw / 2, y(v)]).filter(Boolean);
  if (pts.length > 1) {
    const d = dpCurve(pts), l = pts[pts.length - 1];
    g += `<path d="${d}" fill="none" stroke="var(--surface)" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/><path d="${d}" fill="none" stroke="var(--text)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${l[0]}" cy="${l[1]}" r="4.5" fill="var(--text)" stroke="var(--surface)" stroke-width="2"/>`;
  }
  g += cells.map((c, k) => tips[k] ? `<rect class="dp-col" x="${m.l + bw * k}" y="${m.t}" width="${bw}" height="${ih}" data-tip="${dpEsc(tips[k])}"/>` : '').join('');
  const open = cells.filter(c => c.state === 'ok'), withT = open.filter(c => c.t != null), hit = withT.filter(c => c.v >= c.t).length;
  // who the combined bars leave out, and why, so a total is never quietly short
  // With no target at any branch picked (a past year) nothing is left out: the bars simply add everyone up, ungraded.
  const anyT = codes.some(b => idxs.some(i => { const z = dpCell(mk, b, i); return z.state === 'ok' && z.t != null; }));
  const left = !multi ? [] : codes.map(b => (M.beauty && DPD.hairOnly[b]) ? `${b} (no Beauty team)` : (!M.notarget && anyT && !idxs.some(i => { const z = dpCell(mk, b, i); return z.state === 'ok' && z.t != null; })) ? `${b} (no target set)` : null).filter(Boolean);
  const why = `Bars are each ${U[1]}, the line smooths it so one big or small ${U[1]} does not fool you. ${withT.length ? `Pale bars fell short. ${hit} of ${withT.length} open ${U[1]}s on target.` : 'No target is set for this measure here, so the bars are not graded.'}`
    + (multi ? ` ${M.kind === 'vol' ? 'The branches are added together' : 'A ratio is shown as the plain average of the branches, not weighted by clients'}, and a closed branch drops out of that day, target and all.` : '')
    + (left.length ? ` Left out: ${left.join(', ')}.` : '');
  const legend = `<span><i class="dot" style="background:${color};border-radius:3px"></i>${multi ? U[0] + ' combined' : U[0] + ' actual'}</span><span><svg viewBox="0 0 22 8"><line x1="0" x2="22" y1="4" y2="4" stroke="var(--text)" stroke-width="2.5"/></svg>${U[2]}</span>${withT.length ? '<span><svg viewBox="0 0 22 8"><line x1="0" x2="22" y1="4" y2="4" stroke="var(--muted2)" stroke-dasharray="5 4" stroke-width="1.5"/></svg>' + dpEsc(tLabel) + '</span>' : ''}`;
  if (!open.length) return { title, html: '<p class="dp-why" style="margin:24px 0">No figures for this selection in the window yet.</p>', why: '', legend: '' };
  return { title, html: `<svg class="dp-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${dpEsc(name)} ${U[0].toLowerCase()} ${dpEsc(M.noun)} with ${U[2]}">${g}</svg>`, why, legend };
}

// ── HEATMAP: branch by day ──────────────────────────────────
// Kate, 13 Oct 2026: "too crowded to interpret". So: full width, a square big enough to carry its own number,
// a small gap between weeks, the date and weekday under every column, and an ink colour chosen per square.
const DP_BIN_KEYS = ['n2', 'y', 'p2', 'g'];
const DP_BIN_NAMES = ['Under 80% of target (below)', '80\u201399% (close)', '100\u2013109% (on target)', '110% and over (ahead)'];
const dpBin = (p, lo = 80) => p < lo ? 0 : p < 100 ? 1 : p < 110 ? 2 : 3;
const dpBinBg = i => `var(--dv-${DP_BIN_KEYS[i]})`;
const dpBinInk = i => `var(--dv-${DP_BIN_KEYS[i]}-t)`;
const dpShade = r => `color-mix(in srgb, var(--dv-p2) ${Math.round(14 + 46 * r)}%, transparent)`;   // size, for a measure with no target
const dpPlain = (M, v) => M.fmt(v).replace(/^AED\s*/, '').replace('%', '');
// The target a rate was read against on the latest day any chosen branch has one, so a key can say it in real figures.
function dpRepT(mk, codes, idxs) {
  for (let k = idxs.length - 1; k >= 0; k--) {
    const ts = codes.map(code => dpCell(mk, code, idxs[k])).filter(c => c.state === 'ok' && c.t != null).map(c => c.t);
    if (ts.length) return ts.reduce((a, b) => a + b, 0) / ts.length;
  }
  return null;
}
function dpRatioCaption(M, t) {
  const ms = M.milestone && t != null && t > M.milestone;
  return `Each square is a branch on a day, with that day's ${M.noun} in it. The colour compares it with the target, and the key under the squares gives each colour in real figures.` + (ms ? ` The goal is ${M.fmt(t)}, and ${M.fmt(M.milestone)} is the first goal: a day past it shows yellow, not red.` : '') + ' A small gap marks each new week.';
}
function dpBinKey(raw, mk, tRep) {
  const M = DP_M[mk];
  let names = DP_BIN_NAMES;
  if (M.util) {
    names = ['Under 60% (revenue left on the table) or over 100% (clients turned away)', '60–84% (room to book more)', '85–100% (on target)'];
  } else if (!raw && M.kind === 'ratio' && tRep) {
    const ms = !!(M.milestone && tRep > M.milestone), lo = ms ? M.milestone : tRep * .8, hi = tRep * 1.1, f = M.fmt;
    names = [`Under ${f(lo)} (${ms ? 'below the first goal' : 'below target'})`, `${f(lo)} to under ${f(tRep)} (${ms ? 'past the first goal, heading to ' + f(tRep) : 'close'})`, `${f(tRep)} to under ${f(hi)} (on target)`, `${f(hi)} and over (ahead)`];
  }
  return (raw ? '<span><i style="background:' + dpShade(.1) + '"></i>Lower</span><span><i style="background:' + dpShade(.5) + '"></i>Middle</span><span><i style="background:' + dpShade(1) + '"></i>Higher</span>'
    : names.map((t, i) => `<span><i style="background:${dpBinBg(i)}"></i>${t}</span>`).join(''))
    + '<span><i style="background:var(--surface2);border:1px solid var(--border)"></i>Closed, no figures or not tracked</span>';
}
function dpHeat(host, idxs) {
  const mk = DP.measure, M = DP_M[mk], codes = dpSel(), n = idxs.length, W = dpW(host), raw = dpRawFor(mk, codes);
  const lm = 0, LBL = 44, ch = 40, gap = 6, byDay = dpUnit === 'day', minCw = byDay ? 24 : 46;
  const mondays = byDay ? idxs.filter((i, k) => k > 0 && DPD.days[i].getDay() === 1).length : 0;
  const cw = Math.max(minCw, (W - LBL - mondays * gap) / n);
  const xs = []; let off = 0;
  idxs.forEach((i, k) => { if (byDay && k > 0 && DPD.days[i].getDay() === 1) off += gap; xs.push(lm + k * cw + off); });
  const SW = Math.round(lm + n * cw + off), H = 4 + ch * codes.length + 40, nums = cw >= (raw && !byDay ? 74 : 24);
  let mx = 0;
  if (raw) codes.forEach(code => idxs.forEach(i => { const c = dpCell(mk, code, i); if (c.state === 'ok' && c.v > mx) mx = c.v; }));
  let g = '';
  codes.forEach((code, r) => {
    idxs.forEach((i, k) => {
      const c = dpCell(mk, code, i), x = xs[k], yy = 4 + r * ch;
      const tip = `<b>${dpEsc(dpName(code))}</b><div>${dpDayLabel(dpDate(i))}</div>` + (c.state !== 'ok' ? `<div>${dpWhy(c.state)}</div>` : `<div class="r"><span>${M.fmt(c.v)}</span><span>${raw ? '' : M.util ? utilBandNote(c.v) : (c.p != null ? Math.round(c.p) + '% of target' + (M.kind === 'ratio' ? ' (target ' + M.fmt(c.t) + ')' : '') : 'no target')}</span></div>`);
      let fill = 'var(--surface2)', ink = 'var(--muted2)', label = '';
      if (c.state === 'ok') {
        if (raw) { fill = dpShade(mx ? c.v / mx : 0); ink = 'var(--text)'; label = M.fmt(c.v).replace('%', ''); }
        else if (c.p != null) { const b = M.util ? dpUtilBin(c.v) : dpBin(c.p, dpLoP(mk, c.t)); fill = dpBinBg(b); ink = dpBinInk(b); label = M.kind === 'ratio' ? dpPlain(M, c.v) : String(Math.round(c.p)); }
        else { ink = 'var(--text)'; label = M.fmt(c.v).replace('%', ''); }
      }
      g += `<rect x="${x + 1}" y="${yy + 1}" width="${cw - 2}" height="${ch - 2}" rx="6" style="fill:${fill}" data-tip="${dpEsc(tip)}"/>`;
      if (nums && label) g += `<text x="${x + cw / 2}" y="${yy + ch / 2 + 4}" text-anchor="middle" style="fill:${ink};font-size:11.5px;font-weight:600;pointer-events:none">${label}</text>`;
      if (c.state === 'closed' || c.state === 'na') g += `<path d="M${x + 5} ${yy + ch - 6} L${x + cw - 5} ${yy + 6}" stroke="var(--muted2)" stroke-width="1" pointer-events="none"/>`;
    });
  });
  const yb = 4 + ch * codes.length + 15, step = Math.max(1, Math.ceil(n / Math.floor((W - LBL) / 28)));
  idxs.forEach((i, k) => {
    if (!nums && k % step !== 0) return;
    const d = dpDate(i), cx = xs[k] + cw / 2, h1 = d.bkH ? d.bkH[0] : d.getDate(), h2 = d.bkH ? d.bkH[1] : DP_DOW[d.getDay()][0];
    g += `<text class="tv" x="${cx}" y="${yb}" text-anchor="middle">${h1}</text><text x="${cx}" y="${yb + 14}" text-anchor="middle" style="font-size:10.5px">${h2}</text>`;
  });
  const cellTxt = c => (c.state !== 'ok' ? dpWhy(c.state) : (raw ? M.fmt(c.v) : (c.p != null ? Math.round(c.p) + '%' : '\u2014')));
  const table = `<div class="dp-scroll"><table class="dp-tbl"><tr><th>${dpUnit === 'day' ? 'Day' : dpUnit === 'week' ? 'Week' : 'Month'}</th>${codes.map(c => `<th>${c}</th>`).join('')}</tr>${idxs.map(i => `<tr><td>${dpDayLabel(dpDate(i))}</td>${codes.map(code => `<td>${cellTxt(dpCell(mk, code, i))}</td>`).join('')}</tr>`).join('')}</table></div>`;
  return `<div class="dp-hm"><div class="dp-hml" style="width:${LBL}px">${codes.map(c => `<div style="height:${ch}px">${c}</div>`).join('')}</div><div class="dp-scroll"><svg class="dp-svg" style="min-width:${SW}px" viewBox="0 0 ${SW} ${H}" role="img" aria-label="Branch by day">${g}</svg></div></div><div class="dp-key">${dpBinKey(raw, mk, dpRepT(mk, codes, idxs))}</div><details><summary>View as table</summary>${table}</details>`;
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
// With no target keyed (a past year, Marasy, Fratelli) there is no % of target, but the shape should still draw once three measures are ticked
// (Kate, 16 Oct 2026). Then each measure is read against the average of the branches in the window (100 = that average), and the ring says so.
// A branch with fewer than three measures graded (Fratelli among the four in 2026) is left off a shape that is graded for the others instead of emptying it.
function dpRadarPeerVals(idxs) {
  const sel = dpRadarSel(), out = {}, avg = {};
  DPD.codes.forEach(code => {
    avg[code] = sel.map(([mk]) => {
      const cs = idxs.map(i => dpCell(mk, code, i)).filter(c => c.state === 'ok');
      return cs.length ? cs.reduce((a, c) => a + c.v, 0) / cs.length : null;
    });
  });
  const mean = sel.map((_, k) => { const v = DPD.codes.map(c => avg[c][k]).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; });
  DPD.codes.forEach(code => { out[code] = sel.map(([mk, lab], k) => (avg[code][k] == null || !(mean[k] > 0)) ? null : { mk, lab, p: avg[code][k] / mean[k] * 100, avg: avg[code][k], t: mean[k] }); });
  return out;
}
function dpRadarPlan(idxs, codesIn) {
  const sel = dpRadarSel();
  let codes = codesIn, left = [], mineAll = codesIn.map(c => dpRadarVals(c, idxs));
  const graded = codesIn.filter((c, bi) => mineAll[bi].filter(Boolean).length >= 3);   // a branch with fewer than three graded measures cannot make a shape
  if (graded.length && graded.length < codesIn.length) { left = codesIn.filter(c => !graded.includes(c)); codes = graded; mineAll = graded.map(c => dpRadarVals(c, idxs)); }
  let axes = sel.map((_, k) => k).filter(k => mineAll.every(a => a[k])), peer = false, pv = null;
  if (axes.length < 3 && sel.length >= 3) {
    pv = dpRadarPeerVals(idxs);
    const m2 = codesIn.map(c => pv[c]), a2 = sel.map((_, k) => k).filter(k => m2.every(a => a[k]));
    if (a2.length >= 3) { peer = true; codes = codesIn; left = []; mineAll = m2; axes = a2; }
  }
  return { sel, codes, mineAll, axes, left, peer, pv };
}
function dpRadar(host, idxs, codesIn) {
  const W = Math.max(300, Math.min(dpW(host), 520)), H = Math.round(W * .98), cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 54, max = 130;
  const { sel, codes, mineAll, axes, left, peer, pv } = dpRadarPlan(idxs, codesIn), multi = codes.length > 1;
  const dropped = sel.map((x, k) => (axes.includes(k) ? null : x[1])).filter(Boolean);
  const title = multi ? `${codes.length === DPD.codes.length ? 'All branches' : codes.join(' + ')}: strengths and weaknesses side by side` : `${dpName(codes[0])}: strengths and weaknesses`;
  const n = axes.length;
  if (n < 3) return { title, html: `<p class="dp-why" style="margin:20px 0">${sel.length < 3 ? 'Tick at least three measures under Customise to draw a shape.' : 'Fewer than three of the ticked measures have figures at every selected branch, so there is no shape to draw. Tick more under Customise or take a branch off.'}</p>`, list: '', legend: '' };
  const ang = i => -Math.PI / 2 + i * 2 * Math.PI / n;
  const pt = (i, p) => [cx + Math.cos(ang(i)) * R * Math.min(p, max) / max, cy + Math.sin(ang(i)) * R * Math.min(p, max) / max];
  const poly = arr => arr.map((p, i) => pt(i, p).join(',')).join(' ');
  const all = peer ? DPD.codes.map(c => pv[c]) : DPD.codes.map(c => dpRadarVals(c, idxs));
  const grp = axes.map(k => { const v = all.map(a => a[k]).filter(Boolean); return v.length ? v.reduce((t, x) => t + x.p, 0) / v.length : 100; });
  let g = '';
  [50, 130].forEach(v => { g += `<polygon points="${poly(axes.map(() => v))}" fill="none" stroke="var(--border)"/>`; });
  axes.forEach((k, i) => { const q = pt(i, max); g += `<line x1="${cx}" y1="${cy}" x2="${q[0]}" y2="${q[1]}" stroke="var(--border)"/>`; });
  g += `<polygon points="${poly(axes.map(() => 100))}" fill="none" stroke="var(--muted2)" stroke-width="1.5" stroke-dasharray="5 4"/><text x="${cx + 4}" y="${pt(0, 100)[1] - 4}">${peer ? 'avg' : '100%'}</text>`;
  if (!peer) g += `<polygon points="${poly(grp)}" fill="none" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="2 3"/>`;
  codes.forEach((code, bi) => {
    g += `<polygon points="${poly(axes.map(k => mineAll[bi][k].p))}" fill="${dpCol(code)}" fill-opacity="${multi ? .1 : .2}" stroke="${dpCol(code)}" stroke-width="2" stroke-linejoin="round"/>`;
  });
  axes.forEach((k, i) => {
    const c = Math.cos(ang(i)), sn = Math.sin(ang(i)), lab = sel[k][1];
    const lx = cx + c * (R + 10), ly = cy + sn * (R + 10) + (sn < -.5 ? -17 : sn > .5 ? 10 : -2);
    const weak = mineAll.some(a => a[k].p < 100), mk0 = sel[k][0], help = DP_M[mk0].help;
    const ltip = `<b>${dpEsc(lab)}</b>` + (help ? `<div class="r"><span>${dpEsc(help)}</span></div>` : '');
    const unit = DP_UNIT[mk0] ? `<tspan x="${lx}" dy="12">${dpEsc(DP_UNIT[mk0])}</tspan>` : '';
    g += `<text class="${weak ? 'tv' : ''}" x="${lx}" y="${ly}" text-anchor="${c > .3 ? 'start' : c < -.3 ? 'end' : 'middle'}" style="cursor:help;${weak ? '' : 'fill:var(--text)'}" data-tip="${dpEsc(ltip)}">${dpEsc(DP_SHORT[mk0] || lab)}${unit}<title>${dpEsc(lab)}</title></text>`;
    codes.forEach((code, bi) => {
      const v = mineAll[bi][k], q = pt(i, v.p);
      const tip = `<b>${dpEsc(lab)}</b><div class="r"><span>${dpEsc(code)}, window average</span><span>${DP_M[v.mk].fmt(v.avg)}</span></div>${peer ? `<div class="r"><span>All-branch average</span><span>${DP_M[v.mk].fmt(v.t)}</span></div><div class="r"><span>vs the average</span><span>${Math.round(v.p)}%</span></div>` : `<div class="r"><span>Target</span><span>${DP_M[v.mk].fmt(v.t)}</span></div><div class="r"><span>vs target</span><span>${Math.round(v.p)}%</span></div><div class="r"><span>All-branch average</span><span>${Math.round(grp[i])}%</span></div>`}`;
      g += `<circle cx="${q[0]}" cy="${q[1]}" r="${multi ? 3.5 : 4.5}" fill="${dpCol(code)}" stroke="var(--surface)" stroke-width="2"/><circle cx="${q[0]}" cy="${q[1]}" r="${multi ? 10 : 14}" fill="transparent" data-tip="${dpEsc(tip)}"/>`;
    });
  });
  const legend = codes.map(c => `<span><i class="dot" style="background:${dpCol(c)}"></i>${dpEsc(dpName(c))}</span>`).join('')
    + (peer ? '<span><svg viewBox="0 0 22 8"><line x1="0" x2="22" y1="4" y2="4" stroke="var(--muted2)" stroke-dasharray="5 4" stroke-width="1.5"/></svg>Average of the branches (100)</span>'
      : '<span><svg viewBox="0 0 22 8"><line x1="0" x2="22" y1="4" y2="4" stroke="var(--muted)" stroke-dasharray="2 3" stroke-width="1.5"/></svg>All-branch average</span><span><svg viewBox="0 0 22 8"><line x1="0" x2="22" y1="4" y2="4" stroke="var(--muted2)" stroke-dasharray="5 4" stroke-width="1.5"/></svg>Target (100%)</span>');
  const row = (v, cls, ic) => `<div class="dp-swr"><div><b>${dpEsc(v.lab)}</b><div class="dp-sub">${DP_M[v.mk].fmt(v.avg)} a day against ${DP_M[v.mk].fmt(v.t)}${peer ? ' for the branches on average' : ''}</div></div><span class="dp-chip ${cls}">${ic} ${Math.round(v.p)}%</span></div>`;
  let list;
  if (!multi) {
    const sorted = axes.map(k => ({ ...mineAll[0][k], lab: sel[k][1] })).sort((a, b) => b.p - a.p);
    const strong = sorted.filter(v => Math.round(v.p) >= 100).slice(0, 3), weak = sorted.slice().reverse().filter(v => Math.round(v.p) < 100).slice(0, 3);
    list = `<h3>Strengths</h3>${strong.length ? strong.map(v => row(v, Math.round(v.p) >= 110 ? 'good' : 'on', '\u2713')).join('') : '<div class="dp-sub">Nothing above target yet</div>'}<h3>Weaknesses</h3>${weak.length ? weak.map(v => { const lo = peer ? 80 : v.mk === 'util' ? UTIL_BAND.low / UTIL_BAND.target * 100 : dpLoP(v.mk, v.t); return row(v, Math.round(v.p) >= lo ? 'warn' : 'bad', Math.round(v.p) >= lo ? '\u25B2' : '\u25BC'); }).join('') : '<div class="dp-sub">Every measure is on target</div>'}`;
  } else {
    list = '<h3>Each branch at a glance</h3>' + codes.map((code, bi) => {
      const arr = axes.map(k => ({ ...mineAll[bi][k], lab: sel[k][1] })).sort((a, b) => b.p - a.p), top = arr[0], low = arr[arr.length - 1];
      return `<div class="dp-swr"><div><b><span class="dot" style="background:${dpCol(code)};margin-right:6px"></span>${dpEsc(dpName(code))}</b><div class="dp-sub">Strongest: ${dpEsc(top.lab)} ${Math.round(top.p)}% \u00B7 Weakest: ${dpEsc(low.lab)} ${Math.round(low.p)}%</div></div></div>`;
    }).join('');
  }
  if (dropped.length) list += `<div class="dp-sub" style="margin-top:12px">Left off the shape: ${dpEsc(dropped.join(', '))} (${peer ? 'no figures' : 'no target set'} at ${multi ? 'one of these branches' : 'this branch'}).</div>`;
  if (left.length) list += `<div class="dp-sub" style="margin-top:12px">Left off the shape: ${dpEsc(left.map(dpName).join(', '))} (no targets were ever set there).</div>`;
  const keyBits = axes.map(k => sel[k]).filter(([mk0, full]) => DP_SHORT[mk0] && DP_SHORT[mk0] !== full && `${DP_SHORT[mk0]} ${DP_UNIT[mk0] || ''}`.trim() !== full).map(([mk0, full]) => `<b>${dpEsc(DP_SHORT[mk0])}${DP_UNIT[mk0] ? ' ' + dpEsc(DP_UNIT[mk0]) : ''}</b> ${dpEsc(full)}`);
  const key = keyBits.length ? `<p class="dp-sub dp-rkey">Hover or tap a label for its full name. ${keyBits.join(' \u00B7 ')}</p>` : '';
  const peerNote = peer ? '<p class="dp-sub" style="margin:0 0 6px">No targets are set in this window, so each measure is read against the average of the branches instead: the dashed ring is that average (100), outside it is above average, inside it is below.</p>' : '';
  return { title, html: `${peerNote}<svg class="dp-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${dpEsc(title)}">${g}</svg>${key}`, list, legend };
}

// ── PAGE ────────────────────────────────────────────────────
// The bar holds the Measure and nothing else (15 Oct 2026): Branch and Period are the masthead's own filters, so there is one
// of each on the dashboard. On a phone they are the Filters button in the header.
const DP_JUMPS = [['dpTiles', 'Tiles'], ['dpCardW', 'Weakest day'], ['dpCardBest', 'Strongest day'], ['dpCardA', 'Trend'], ['dpCardB', 'Bars'], ['dpCardR', 'Strengths'], ['dpCardC', 'Day by day'], ['dpCardM', 'Mix'], ['dpCardCl', 'Clients'], ['dpCardS', 'Staff'], ['dpHow', 'How to read']];
// The mini side nav (Kate, 16 Oct 2026, instead of the Jump to chips in the sticky bar): the same rail as Organisation Pulse and
// Branch Performance (lgRail in branch-ledger.js, lit by spy() in index.html). In the gutter from 1100px, a plain row of chips
// below that, none on a phone. The tiles stay full width above it, so the rail starts at the first card. Each entry scrolls with
// scrollIntoView so the card lands under the masthead and the Measure bar (dp-jt carries the scroll margin).
const dpRail = () => typeof lgRail === 'function'
  ? lgRail(DP_JUMPS.filter(j => j[0] !== 'dpTiles' && (j[0] !== 'dpCardM' || typeof daShowsMix !== 'function' || daShowsMix()) && (j[0] !== 'dpCardCl' || typeof daShowsClients !== 'function' || daShowsClients())).map(([id, l]) => [id, l, `event.preventDefault();document.getElementById('${id}').scrollIntoView({behavior:'smooth',block:'start'})`]))
  : '';
const dpShowing = () => { const sel = dpSel(); return 'Branches: ' + (sel.length === DPD.codes.length ? 'all' : sel.join(' + ')) + ', set in the filters at the top'; };
function dpControls(win) {
  const mopts = DP_MENU[DP.dept].map(([g, ks]) => `<optgroup label="${g}">${ks.map(k => `<option value="${k}"${k === DP.measure ? ' selected' : ''}>${dpEsc(DP_M[k].label)}</option>`).join('')}</optgroup>`).join('');
  return `<div class="dp-bar" id="dpBar" role="group" aria-label="Measure"><div class="dp-bar-row">
    <div class="dp-bf"><span class="dp-lab">Team</span><span class="dp-pills" id="dpDept" role="group" aria-label="Department">${[['all', 'All'], ['hair', 'Hair'], ['beauty', 'Beauty']].map(([k, l]) => `<button type="button" class="dp-pill" data-dept="${k}" aria-pressed="${DP.dept === k}">${l}</button>`).join('')}</span></div>
    <label class="dp-bf"><span class="dp-lab">Measure</span><select id="dpSelM" aria-label="Measure">${mopts}</select></label>${DP_M[DP.measure] && DP_M[DP.measure].def && typeof ihTip === 'function' ? '<span class="dp-bf dp-info">' + ihTip('', DP_M[DP.measure].def) + '</span>' : ''}</div></div>${dpDefault() ? '' : '<p class="dp-note" style="margin:0 0 8px">Your choices are saved on this device for next time. <button type="button" class="dp-linkbtn" id="dpReset">Reset to the defaults</button></p>'}`;
}
const dpDefault = () => DP.measure === 'sales' && DP.dept === 'all' && !DP.radar;

async function renderDailyPerf() {
  const host = document.getElementById('dailyPerfContent');
  if (!host || dpBusy) return;
  dpCss();
  dpFitDept();
  const win = dpWindow();
  if (!host.querySelector('.dpf')) host.innerHTML = '<div class="dpf"><div class="loading">Loading data...</div></div>';
  dpBusy = true; dpErr = '';
  try { await dpLoad(win); } catch (e) { dpErr = (e && e.message) || String(e); }
  dpBusy = false;
  if (dpErr || !DPD) { host.innerHTML = `<div class="dpf"><h1>Daily Performance</h1><div class="dp-err">Could not load the daily figures: ${dpEsc(dpErr || 'no data')}. Try Refresh, and tell Kate if it stays.</div></div>`; return; }
  dpDraw(host, win);
}

// The radar's Customise panel: tick the measures to draw, ten by default, Tick all, Untick all or Back to the default ten; under three ticked there is no shape and it says so.
// A measure with no target at a chosen branch draws nothing there, so it is greyed with the branch named.
function dpNoTarget(mk, idxs, codes) {
  return codes.filter(code => !idxs.some(i => { const c = dpCell(mk, code, i); return c.state === 'ok' && c.p != null; }));
}
function dpRadarCustom(idxs, codes) {
  const peerMode = dpRadarPlan(idxs, codes).peer;
  const on = new Set(dpRadarSel().map(x => x[0]));
  const label = Object.fromEntries(DP_RADAR_ALL);
  const groups = DP_GROUPS.map(([g, ks]) => {
    const items = ks.filter(k => label[k]);
    return items.length ? `<div class="dp-cg"><span class="dp-lab">${g}</span>${items.map(k => { const no = peerMode ? [] : dpNoTarget(k, idxs, codes); return `<label class="dp-chk${no.length ? ' dp-off' : ''}"${no.length ? ` title="No target set at ${dpEsc(no.join(', '))}, so this draws nothing there."` : ''}><input type="checkbox" data-r="${k}"${on.has(k) ? ' checked' : ''} aria-label="${dpEsc(label[k])}${no.length ? ', no target at ' + dpEsc(no.join(', ')) : ''}">${dpEsc(label[k])}</label>`; }).join('')}</div>` : '';
  }).join('');
  return `<details class="dp-cust" id="dpCust"${dpRadarOpen ? ' open' : ''}><summary>Customise measures (${on.size} ticked)</summary>${groups}
    <p class="dp-sub" style="margin:10px 0 0">${peerMode ? 'No targets are set in this window, so any measure can sit on the shape: each is read against the average of the branches.' : '<b>Dashed pill</b>: no target is set for it at one or more of the branches picked, so it draws nothing for them. Only measures with a target can sit on the shape.'} Rebooking % is the share of clients rebooked, against its 70% target; the number of clients rebooked (Rebooked clients, no target) is under Measure, Clients, at the top.</p>
    <div class="dp-row" style="margin-top:8px"><button type="button" class="dp-pill" id="dpRadarAll">Tick all</button><button type="button" class="dp-pill" id="dpRadarNone">Untick all</button><button type="button" class="dp-pill" id="dpRadarReset">Back to the default ten</button><span class="dp-sub" id="dpRadarMsg">${on.size < 3 ? 'Tick at least three to draw a shape.' : ''}</span></div></details>`;
}

function dpDraw(host, win) {
  // The redraw empties the page for a moment, which clamps the scroll position; remember it and put it back.
  const sy = window.scrollY, had = !!host.querySelector('.dpf');
  win = win || dpWindow();
  const idxs = dpIdx(win), mk = DP.measure, M = DP_M[mk];
  const cidx = idxs.length ? dpChartIdx(idxs) : idxs, U = DP_UNITS[dpUnit];
  if (!idxs.length) { host.innerHTML = `<div class="dpf"><h1>Daily Performance</h1>${dpControls(win)}<div class="dp-err">No days in this window yet.</div></div>`; dpWire(host); return; }
  { const pk = DPD.key + '|' + dpYmd(win.from) + '|' + dpYmd(win.to); if (pk !== dpPickKey) { dpPickKey = pk; dpPick = null; } }
  dpCtx = { win, idxs, cidx };
  const range = `${dpDayLabel(win.from)} to ${dpDayLabel(win.to)}`;
  const rawAll = dpRawFor(mk, dpSel()), noT = M.notarget ? 'This measure has no target' : 'No target is set for this measure at the branches picked';
  host.innerHTML = `<div class="dpf">
    <h1>Daily Performance</h1>
    <p class="dp-deck">How each branch did, day by day, against its daily target. Unsure of a term? <button type="button" class="dp-linkbtn" data-jump="dpHow">How to read this page</button>.</p>
    ${dpControls(win)}
    <p class="dp-note" style="margin:0 0 4px"><b>${dpEsc(range)}</b> · ${idxs.length} day${idxs.length === 1 ? '' : 's'}${win.note ? ' · ' + dpEsc(win.note) : ''}${dpUnit === 'day' ? '' : ' · ' + dpEsc('the Trend, Bars and Day by day cards draw one point per ' + U[1] + ', each the total of its open days against the total of their targets (a rate or a bill: the average)')}${dpOffPage() ? ' · Bahrain is not on this page yet, so the UAE branches show' : ''}${M.help ? ' · <b>' + dpEsc(M.label) + '</b>: ' + dpEsc(M.help) : ''}</p>
    ${idxs.length > 1 && dpUnit === 'day' ? `<div class="dp-lead" id="dpLead" role="group" aria-label="Which figure each tile opens with"><span class="dp-lab">Show</span><span class="dp-pills">${[['period', 'Whole period'], ['day', 'One day']].map(([k, l]) => `<button type="button" class="dp-pill" data-lead="${k}" aria-pressed="${DP.lead === k}">${l}</button>`).join('')}</span><span class="dp-scrub"><input type="range" id="dpDayR" min="0" max="${idxs.length - 1}" step="1" value="${dpPick != null ? dpPick : dpLatestIdx(idxs)}" aria-label="Day the needle shows"><output id="dpDayOut" for="dpDayR">${dpPickLabel(idxs)}</output></span></div>` : ''}
    <section class="dp-tiles dp-jt" id="dpTiles" aria-label="${dpEsc(M.label)}: latest open day per branch, with the period total">${dpTiles(win, idxs, cidx)}</section>
    <div class="lg-shell lg-shell-wide">${dpRail()}<div class="lg-doc">
    <div class="dp-card dp-jt" id="dpCardW"><h2>Weakest day per branch: ${dpEsc(M.label)}</h2><p class="dp-why">${rawAll ? `The day in this period with the lowest ${dpEsc(M.noun)}. ${noT}, so nothing is graded.` : `The day in this period when ${dpEsc(M.noun)} fell furthest below its target, for each branch. Closed days and days with no figures are skipped.`}</p><div id="dpW"></div></div>
    <div class="dp-card dp-jt" id="dpCardBest"><h2>Strongest day per branch: ${dpEsc(M.label)}</h2><p class="dp-why">${rawAll ? `The day in this period with the highest ${dpEsc(M.noun)}. ${noT}, so nothing is graded.` : `The day in this period when ${dpEsc(M.noun)} went furthest above its target, for each branch. Closed days and days with no figures are skipped.`}</p><div id="dpBest"></div></div>
    <div class="dp-card dp-jt" id="dpCardA"><h2>${rawAll ? `${U[0]} ${dpEsc(M.noun)}, ${dpSel().length === DPD.codes.length ? 'all branches' : dpSel().join(' + ')}` : `${U[0]} ${dpEsc(M.noun)} against target, ${dpSel().length === DPD.codes.length ? 'all branches' : dpSel().join(' + ')}`}</h2>
      <p class="dp-why">${rawAll ? `Every branch on one scale, in plain values. ${noT}, so nothing is graded. Gaps are closed days or days with no figures.` : (M.kind === 'ratio' ? "Every branch on one scale, in the measure's own units, with the target as the dashed line. Gaps are closed days or days with no figures." : "Every branch on one scale: 100% means the day's target was met. Gaps are closed days or days with no figures.")}</p><div id="dpA"></div></div>
    <div class="dp-card dp-jt" id="dpCardB"><div class="dp-head"><div><h2 id="dpBT"></h2><p class="dp-why" id="dpBW"></p></div><span class="dp-sub dp-showing">${dpShowing()}</span></div>
      <div class="dp-legend" id="dpBL"></div><div id="dpB"></div></div>
    <div class="dp-card dp-jt" id="dpCardR"><div class="dp-head"><div><h2 id="dpRT"></h2><span class="dp-tag">Measure does not apply</span>
      <p class="dp-why">Every ticked measure as % of its target, over this window. Outside the dashed ring is a strength, inside it is a weakness. This card ignores the Measure menu on purpose, it shows the ticked measures all at once, and leaves off any with no target set at the branch.</p></div>
      <span class="dp-sub dp-showing">${dpShowing()}</span></div>
      ${dpRadarCustom(idxs, dpSel())}
      <div class="dp-legend" id="dpRL"></div><div class="dp-sw"><div id="dpR"></div><div class="dp-swl" id="dpRS"></div></div></div>
    <div class="dp-card dp-jt" id="dpCardC"><h2>${dpUnit === 'day' ? 'Day by day' : dpUnit === 'week' ? 'Week by week' : 'Month by month'}: ${dpEsc(M.label)}</h2><p class="dp-why">${rawAll ? `Each square is a branch on a day, with that day's ${dpEsc(M.noun)} in it${M.fmt === dpPct1 ? ', as a %' : ''}, darker for a higher figure. ${noT}, so nothing is graded.` : (M.kind === 'ratio' ? dpEsc(dpRatioCaption(M, dpRepT(DP.measure, dpSel(), idxs))) : `Each square is a branch on a day, with ${dpEsc(M.noun)} as a % of its target in it (100 means the target was met). Hover a square for the figure itself. Red is under 80% (below target), yellow 80 to 99% (close), blue 100 to 109% (on target), green 110% or more. The same lines as the tile chips and the Pulse. A small gap marks each new week.`)}</p><div id="dpC"></div></div>
    ${typeof daMoreCards === 'function' ? daMoreCards(win, idxs) : ''}
    <div class="dp-card dp-jt" id="dpHow"><h2>How to read this page</h2>
      <p class="dp-why">Short answers. Skim the bold words.</p>
      <h3 class="dp-hg">The numbers</h3>
      <div class="dp-how">
        <div class="dp-hw"><b>% of target</b><span>The figure divided by its target. 100% means the target was met. 80% means a fifth short.</span></div>
        <div class="dp-hw"><b>Points</b><span>The gap between two percentages. Rebooking at 61% against 70% is 9 points below.</span></div>
        <div class="dp-hw"><b>Tiles: Whole period or One day</b><span>The Show toggle picks which figure each tile opens with. The meter under it always shows both: the bar is the whole period against its target, the needle is one day against that day's own target, and the dashed line is 100%. Slide the day bar to move the needle to any day of the period (it rests on the latest open day). The meter ends at 150%, and a needle past the end has an arrow.</span></div>
        <div class="dp-hw"><b>Daily target</b><span>The month's target shared over the branch's trading days by weekday: a day carries a bigger share when that weekday has been stronger at that branch (the average of the 8 weeks before the month), so a Friday is not judged against a Monday's figure. The shares add up to the month's target. Where there is not yet enough history, it is shared evenly.</span></div>
        <div class="dp-hw"><b>Rebooking, treatment %, retail %, average bills</b><span>Each day is read against the same benchmark. Utilisation is read as a band: 85 to 100% is on target, 60 to 84% amber, under 60% or over 100% red (hair and beauty teams only).</span></div>
        <div class="dp-hw"><b>NCR</b><span>New Client Requests. A count, against the Pulse's monthly NCR target.</span></div>
        <div class="dp-hw"><b>NCR %</b><span>NCR as a share of the day's clients. It has no target, so nothing is graded.</span></div>
      </div>
      <h3 class="dp-hg">What you will see</h3>
      <div class="dp-how">
        <div class="dp-hw"><b>Colours</b><span>Each colour is a band against the target. Money and counts: under 80% of target, 80 to 99%, 100 to 109%, 110% and over. Rates and bills: the key under the chart gives the real figures.</span><span class="dp-sw3"><span><i style="background:var(--dv-n2)"></i>Under 80%</span><span><i style="background:var(--dv-y)"></i>80 to 99%</span><span><i style="background:var(--dv-p2)"></i>100 to 109%</span><span><i style="background:var(--dv-g)"></i>110% +</span></span></div>
        ${dpBenchmark('rebookPct', win.to) > DP_M.rebook.milestone ? `<div class="dp-hw"><b>Rebooking: goal and first goal</b><span>The goal is ${DP_M.rebook.fmt(dpBenchmark('rebookPct', win.to))}. ${DP_M.rebook.fmt(DP_M.rebook.milestone)} is the first goal, so a branch past it shows yellow, not red.</span></div>` : ''}
        <div class="dp-hw"><b>Revenue mix, Clients, Staff performance</b><span>Three cards under the Day by day card that follow the Measure menu. Revenue mix shows what a money measure is made of (Total sales, Services, Retail, Hair services, Beauty services, Treatments) and is only there for those. Clients is there for the client measures and Rebooking %. Staff performance is always there, ranked by the measure with its column marked. Only the Strengths and weaknesses shape ignores the menu.</span></div>
        <div class="dp-hw"><b>Closed day</b><span>Shown as closed, not as zero. Al Quoz is shut on Sunday and Monday.</span></div>
        <div class="dp-hw"><b>No grade</b><span>Total clients and New clients show their figures with no colour until someone keys a target in the Upload Portal.</span></div>
        <div class="dp-hw"><b>Past years, Marasy and Fratelli</b><span>Pick a Year, a Month or All time at the top. Marasy (to 24 Dec 2022) and Fratelli (to 22 May 2026) appear as branches when the window touches the days they traded. No target was ever keyed for them, so their figures show plain and ungraded. Over about 100 days the charts draw weeks, and over 240 days months.</span></div>
        <div class="dp-hw"><b>Motor City</b><span>Hair only, so the Beauty measures skip it.</span></div>
        <div class="dp-hw"><b>Hover a square</b><span>See that day's figure, its target and its % of target.</span></div>
      </div>
      <h3 class="dp-hg">Where the figures come from</h3>
      <div class="dp-how">
        <div class="dp-hw"><b>The Ledgers</b><span>By day, ex VAT. The same figures the Daily Target Sheet adds up.</span></div>
        <div class="dp-hw"><b>Up to yesterday</b><span>Today is only half a day, so the window ends yesterday. UAE branches only for now.</span></div>
      </div>
    </div>
    </div></div>
  </div>`;
  const root = host.querySelector('.dpf');
  const fill = (id, html) => { const e = root.querySelector('#' + id); if (e) e.innerHTML = html; };
  const el = id => root.querySelector('#' + id);
  fill('dpA', dpChartA(el('dpA'), cidx));
  const sel = dpSel();
  fill('dpW', dpWeakest(idxs, sel));
  fill('dpBest', dpWeakest(idxs, sel, true));
  const b = dpChartB(el('dpB'), cidx, sel);
  el('dpBT').textContent = b.title; el('dpBW').textContent = b.why; fill('dpBL', b.legend); fill('dpB', b.html);
  const r = dpRadar(el('dpR'), idxs, sel);
  el('dpRT').textContent = r.title; fill('dpRL', r.legend); fill('dpR', r.html); fill('dpRS', r.list);
  fill('dpC', dpHeat(el('dpC'), cidx));
  const hs = el('dpC').querySelector('.dp-scroll');
  if (hs && hs.scrollWidth > hs.clientWidth) hs.scrollLeft = hs.scrollWidth;   // a long window opens on the latest day
  if (had) window.scrollTo({ top: sy, left: 0, behavior: 'instant' });
  const bar = root.querySelector('.dp-bar');
  if (bar) root.style.setProperty('--dp-bar-h', bar.offsetHeight + 'px');
  dpWire(host);
}

// Redraw without moving what you are looking at. The tiles, lines and bars above the radar change height with the
// branch and measure choice (one branch is one tile, not four), so putting the old scrollY back is not enough: the
// control you pressed lands somewhere else and the page seems to run down. Note where the control sat on screen,
// redraw, find the same control in the new page and scroll by however far it moved.
function dpRedraw(host, el, sel, change) {
  const root = host.querySelector('.dpf');
  const inCard = !!el.closest('.dp-card');
  const blocks = r => [...r.querySelectorAll('.dp-tiles, .dp-card')];
  let i = -1, top = 0;
  if (root && inCard) { i = blocks(root).indexOf(el.closest('.dp-card')); top = el.getBoundingClientRect().top; }
  else if (root) {
    // from the bar: hold the first card that is on screen under it
    const bar = root.querySelector('.dp-bar'), floor = bar ? bar.getBoundingClientRect().bottom : 0;
    const bl = blocks(root); i = bl.findIndex(b => b.getBoundingClientRect().bottom > floor + 4);
    if (i >= 0) top = bl[i].getBoundingClientRect().top;
  }
  change();
  dpDraw(host);
  const nroot = host.querySelector('.dpf');
  if (!nroot || i < 0) return;
  const blk = blocks(nroot)[i], nel = inCard ? (blk && blk.querySelector(sel)) : blk;
  if (!nel) return;
  const d = nel.getBoundingClientRect().top - top;
  if (Math.abs(d) > 0.5) window.scrollBy({ top: d, left: 0, behavior: 'instant' });
  if (inCard || el.tagName === 'BUTTON') { const f = nroot.querySelector(inCard ? sel : '[data-b="' + (el.dataset ? el.dataset.b : '') + '"]'); if (f) f.focus({ preventScroll: true }); }
}

function dpWire(host) {
  const root = host.querySelector('.dpf'); if (!root) return;
  dpBindTips(root);
  root.querySelectorAll('#dpDept [data-dept]').forEach(b => b.onclick = () => {
    if (DP.dept === b.dataset.dept) return;
    dpRedraw(host, b, '#dpDept [data-dept="' + b.dataset.dept + '"]', () => { DP.dept = b.dataset.dept; if (!dpMenuKeys(DP.dept).includes(DP.measure)) DP.measure = DP_DEPT_DEFAULT[DP.dept]; dpSave(); });
  });
  root.querySelectorAll('#dpLead [data-lead]').forEach(b => b.onclick = () => {
    if (DP.lead === b.dataset.lead) return;
    dpRedraw(host, b, '#dpLead [data-lead="' + b.dataset.lead + '"]', () => { DP.lead = b.dataset.lead; dpSave(); });
  });
  const dr = root.querySelector('#dpDayR'), dout = root.querySelector('#dpDayOut');
  if (dr) dr.oninput = () => {
    if (!dpCtx) return;
    const i = +dr.value;
    dpPick = i === dpLatestIdx(dpCtx.idxs) ? null : i;
    const tiles = root.querySelector('#dpTiles');
    if (tiles) tiles.innerHTML = dpTiles(dpCtx.win, dpCtx.idxs, dpCtx.cidx);
    if (dout) dout.textContent = dpPickLabel(dpCtx.idxs);
    dpBindTips(root);
  };
  const sm = root.querySelector('#dpSelM');
  if (sm) sm.onchange = () => dpRedraw(host, sm, '#dpSelM', () => { DP.measure = sm.value; dpSave(); });
  root.querySelectorAll('[data-jump]').forEach(b => b.onclick = () => { const t = root.querySelector('#' + b.dataset.jump); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  const rs = root.querySelector('#dpReset');
  if (rs) rs.onclick = async () => { Object.assign(DP, { measure: 'sales', dept: 'all', radar: null }); dpRadarOpen = false; dpSave(); await renderDailyPerf(); };
  const cust = root.querySelector('#dpCust');
  if (cust) cust.addEventListener('toggle', () => { dpRadarOpen = cust.open; });
  root.querySelectorAll('[data-r]').forEach(cb => cb.onchange = () => {
    const next = DP_RADAR_ALL.map(x => x[0]).filter(k => { const b = root.querySelector(`[data-r="${k}"]`); return b && b.checked; });
    dpRedraw(host, cb, `[data-r="${cb.dataset.r}"]`, () => { DP.radar = next; dpRadarOpen = true; dpSave(); });
  });
  const rr = root.querySelector('#dpRadarReset');
  if (rr) rr.onclick = () => dpRedraw(host, rr, '#dpRadarReset', () => { DP.radar = null; dpRadarOpen = true; dpSave(); });
  const ra = root.querySelector('#dpRadarAll'), rn = root.querySelector('#dpRadarNone');
  if (ra) ra.onclick = () => dpRedraw(host, ra, '#dpRadarAll', () => { DP.radar = DP_RADAR_ALL.map(x => x[0]); dpRadarOpen = true; dpSave(); });
  if (rn) rn.onclick = () => dpRedraw(host, rn, '#dpRadarNone', () => { DP.radar = []; dpRadarOpen = true; dpSave(); });
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

// The address carries the choices (Kate, 13 Oct 2026): ?view=dailyperf&measure=rebook&branches=MC&window=last7. Only
// what differs from the defaults is written, so a bare ?view=dailyperf still means the default page. A link beats
// whatever this browser remembered. trSyncUrl() in index.html calls dpUrlParts().
function dpUrlParts() {
  const parts = [];
  if (DP.measure !== 'sales') parts.push('measure=' + DP.measure);
  if (DP.dept !== 'all') parts.push('dept=' + DP.dept);
  return parts;   // the branches and the period ride in the address as every filtered page's do (trSyncUrl)
}
(function dpReadUrl() {
  try {
    const q = new URLSearchParams(location.search);
    if (q.get('view') !== 'dailyperf') return;
    const m = q.get('measure'); if (m && DP_M[m]) DP.measure = m;
    const dd = q.get('dept'); if (dd === 'hair' || dd === 'beauty' || dd === 'all') DP.dept = dd;
    dpFitDept();
  } catch (e) { /* no address to read */ }
})();
