/* ══════════════════════════════════════════════════════════════
   DAILY PERFORMANCE: THE REPORTS BORROWED FROM BRANCH PERFORMANCE
   Kate, 15 Oct 2026. Branch Performance and Daily Performance showed the same numbers twice, so Branch Performance is being
   folded into this page. Daily keeps everything it has and takes only the reports it lacked: Revenue mix, Clients and Staff
   performance, and all three follow the Measure menu (Kate, 16 Oct 2026: that is what the menu is for; only the radar ignores it).
   A Growth card went in first (this period against the one before) and came out again on 16 Oct 2026 at Kate's
   word, so nothing here compares two periods and no earlier window is fetched.

   Loaded after daily-performance.js, which calls daMoreCards() from dpDraw. Nothing here runs on load.

   All three cards read one aggregate for the page's window (daLoadWindow): the rows the masthead's period covers, added up by
   aggDailyData, the same function Branch Performance uses, so the two pages agree to the dirham for the same dates. Clients
   are per staff, from the ledgers, like Daily's Clients measure: the through-the-door count is not on this page.
   ══════════════════════════════════════════════════════════════ */
let daData = null, daBusy = '';

function daCss() {
  if (document.getElementById('daCss')) return;
  const st = document.createElement('style'); st.id = 'daCss';
  st.textContent = `
  .dpf .da-stack{display:grid;grid-template-columns:120px 1fr auto;gap:10px;align-items:center;padding:6px 0;font-size:14px}
  .dpf .da-stack .trk{display:flex;height:24px;border-radius:6px;overflow:hidden}
  .dpf .da-stack .trk i{display:block;height:100%}
  .dpf .da-stack .v{text-align:right;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
  .dpf .da-leg{display:flex;gap:6px 16px;flex-wrap:wrap;font-size:13px;color:var(--muted);margin:10px 0 4px}
  .dpf .da-leg span{display:inline-flex;align-items:center;gap:6px}
  .dpf .da-leg i{width:12px;height:12px;border-radius:3px;display:inline-block}
  .dpf .da-det{margin-top:12px}
  .dpf .da-det>summary{cursor:pointer;font-weight:600;font-size:13.5px;padding:6px 0}
  .dpf .da-br{margin:0 0 10px}
  .dpf .da-br>summary{cursor:pointer;font-weight:600;padding:6px 0}
  .dpf .da-sub2{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted2);margin:10px 0 4px;font-weight:600}
  .dpf .da-fig{margin-top:8px}
  .dpf .da-hl{font-weight:700;color:var(--text);background:color-mix(in srgb,var(--accent) 16%,transparent);padding:2px 6px;border-radius:5px}
  .dpf .da-hlh{color:var(--text);border-bottom:2px solid var(--accent);padding-bottom:1px}
  .dpf .da-stack.da-c3{grid-template-columns:120px 1fr 170px}
  @media(max-width:760px){.dpf .da-stack,.dpf .da-stack.da-c3{grid-template-columns:1fr auto;gap:4px 10px}.dpf .da-stack>div:nth-child(1){grid-column:1;grid-row:1}.dpf .da-stack>div:nth-child(3){grid-column:2;grid-row:1}.dpf .da-stack>.trk{grid-column:1/-1;grid-row:2}}
  `;
  document.head.appendChild(st);
}

const daKey = win => dpYmd(win.from) + '|' + dpYmd(win.to);

// One fetch and one aggregate per branch for the page's window, cached against it: the branch pick changes which cards are
// drawn and not what was fetched. No trimming to the last synced day: Branch Performance reads the whole window too, and
// aggDailyData reads a day the ledger has not reached from Phorest alone.
async function daLoadWindow(win) {
  const key = daKey(win);
  if (daData && daData.key === key) return daData;
  const codes = DPD ? DPD.codes : dpCodes();
  const [rowsB, rowsP] = await Promise.all([loadBranchStaffDailyRange(win.from, win.to), loadPhorestStaffDailyRange(win.from, win.to)]);
  const byCode = {};
  let any = false;
  codes.forEach(code => {
    const bb = (rowsB || []).filter(r => r.branch === code), pp = (rowsP || []).filter(r => r.branch === code);
    const full = (bb.length || pp.length) ? aggDailyData([], bb, pp) : null;
    if (full) any = true;
    byCode[code] = { full };
  });
  return (daData = any ? { key, byCode } : { key, byCode, none: 'There are no ledger figures in this window yet.' });
}

// Fetch if this window is not cached or already on its way, then fill the three cards in place if the page still shows it.
function daEnsure(win) {
  const key = daKey(win);
  if ((daData && daData.key === key) || daBusy === key) return;
  daBusy = key;
  daLoadWindow(win).then(g => g, e => ({ key, byCode: {}, none: 'Could not load these figures: ' + ((e && e.message) || e) + '. Try Refresh.' })).then(g => {
    if (daBusy === key) daBusy = '';
    if (document.getElementById('daStaff') && daKey(dpWindow()) === key) daFillAll(g);
  });
}

/* ══════════════════════════════════════════════════════════════
   REVENUE MIX, CLIENTS, STAFF PERFORMANCE
   Kate, 16 Oct 2026, built from Downloads/mockup-daily-performance-remaining-addons.html. The three reports Branch
   Performance had and Daily did not. They follow the masthead's Branch and Period filters and ignore the Measure menu,
   and read one aggregate (daLoadWindow), so the page counts every figure once.

   The figures are Branch Performance's own lines, added up with the same aggDailyData. Where a line has a Daily measure,
   its target is Daily's: the daily target added up over the open days (dpCell), so it works for any window and not only
   a calendar month. Lines with no Daily measure say "no target" rather than invent one.
   ══════════════════════════════════════════════════════════════ */
const daSummary = (g, code) => (g.byCode[code] && g.byCode[code].full) ? g.byCode[code].full.summary : null;
const daSumFn = (g, codes, fn) => codes.reduce((a, c) => { const s = daSummary(g, c); return a + (s ? (Number(fn(s)) || 0) : 0); }, 0);

// Daily's own target for a measure, over the open days of the window and the branches picked: null when none is keyed.
function daTarget(mk, codes, idxs) {
  let t = 0, any = false;
  codes.forEach(code => idxs.forEach(i => { const c = dpCell(mk, code, i); if (c.state === 'ok' && c.t != null) { t += c.t; any = true; } }));
  return any ? t : null;
}

function daNone(g) { return `<p class="dp-sub">${dpEsc(g.none || 'No figures for the branches picked in this window.')}</p>`; }

// ── REVENUE MIX ─────────────────────────────────────────────
// What a money measure is made of. Each of the six revenue measures in the Measure menu has its own breakdown; the others (clients,
// rates, utilisation) are not made of parts, so this card is only drawn for these six.
const DA_LINES = {
  total: [() => LG_TOTAL_LABEL, 'sales', s => lgTotalRevenue(s), 0, 1],
  services: [() => LG_SERVICES_LABEL, 'services', s => lgServicesTotal(s)],
  retail: [() => LG_RETAIL_LABEL, 'retail', s => s.retailTotal],
  hair: ['Hair revenue (incl. treatments and courses)', 'hair', s => s.hairServicesIncl],
  hairEx: ['Hair services (excl. treatments and courses)', null, s => s.hairServicesExcl],
  treat: ['Hair treatments revenue', 'treat', s => s.treatmentSales],
  treatUnits: ['# hair treatments sold', null, s => s.hairTreatmentUnits, 1],
  courses: ['Hair courses revenue (performed)', null, s => s.hairCourses],
  hairRetail: ['Hair retail revenue', null, s => s.hairRetailOnly],
  hairRetailUnits: ['# hair retail sold', null, s => s.hairRetailUnits, 1],
  beauty: ['Beauty services revenue', 'beauty', s => s.beautyServicesTotal],
  beautyRetail: ['Beauty retail revenue', null, s => s.beautyRetailOnly],
  beautyRetailUnits: ['# beauty retail sold', null, s => s.beautyRetailUnits, 1],
};
const DA_PART = {
  hairEx: ['Hair services', '#C4B5FD', s => s.hairServicesExcl], treat: ['Treatments', '#99F6E4', s => s.treatmentSales], courses: ['Hair courses', '#BFDBFE', s => s.hairCourses],
  beauty: ['Beauty services', '#FFD4D9', s => s.beautyServicesTotal], retail: ['Retail', '#EEF3C7', s => s.retailTotal],
  hairRetail: ['Hair retail', '#C4B5FD', s => s.hairRetailOnly], beautyRetail: ['Beauty retail', '#FFD4D9', s => s.beautyRetailOnly],
};
const DA_MIX = {
  sales: { title: 'Revenue mix: where the money came from', why: 'What each branch\u2019s net take was made of, so you can see whether a good period was hair, beauty or retail. Hover a band for the figure.',
    parts: ['hairEx', 'treat', 'courses', 'beauty', 'retail'], lines: ['total', 'services', 'retail', 'hair', 'hairEx', 'treat', 'treatUnits', 'courses', 'hairRetail', 'hairRetailUnits', 'beauty', 'beautyRetail', 'beautyRetailUnits'] },
  services: { title: 'Services: hair against beauty', why: 'How each branch\u2019s services revenue splits between hair (treatments and courses taken out) and beauty. No retail.',
    parts: ['hairEx', 'beauty'], lines: ['services', 'hairEx', 'beauty'] },
  retail: { title: 'Retail: hair against beauty', why: 'Where each branch\u2019s retail was sold, in the hair chair or in the beauty room.',
    parts: ['hairRetail', 'beautyRetail'], lines: ['retail', 'hairRetail', 'hairRetailUnits', 'beautyRetail', 'beautyRetailUnits'] },
  hair: { title: 'Hair revenue: services, treatments and courses', why: 'What each branch\u2019s hair revenue was made of.',
    parts: ['hairEx', 'treat', 'courses'], lines: ['hair', 'hairEx', 'treat', 'treatUnits', 'courses'] },
  beauty: { title: 'Beauty services by branch', why: 'Beauty services revenue for each branch with a Beauty team.', parts: ['beauty'], lines: ['beauty'] },
  treat: { title: 'Treatments by branch', why: 'Hair treatments revenue for each branch, with the number sold.', parts: ['treat'], lines: ['treat', 'treatUnits'] },
};
const daShowsMix = () => !!DA_MIX[DP.measure];
function daMixInner(g, codes, idxs) {
  const cfg = DA_MIX[DP.measure];
  if (!cfg) return '';
  const parts = cfg.parts.map(k => DA_PART[k]);
  const tot = c => parts.reduce((a, p) => a + (Number(p[2](daSummary(g, c))) || 0), 0);
  const have = codes.filter(c => daSummary(g, c) && tot(c) > 0);
  if (g.none || !have.length) return g.none ? daNone(g) : `<p class="dp-sub">No ${dpEsc(DP_M[DP.measure].label)} figures for the branches picked in this window.</p>`;
  const totals = have.map(tot), mx = Math.max(...totals, 1);
  const bars = have.map((c, k) => `<div class="da-stack"><div><span class="dot" style="background:${dpCol(c)}"></span> ${dpEsc(dpName(c))}</div>
    <div class="trk" style="width:${totals[k] / mx * 100}%">${parts.map(p => { const v = Number(p[2](daSummary(g, c))) || 0; return v > 0 ? `<i style="width:${v / (totals[k] || 1) * 100}%;background:${p[1]}" title="${dpEsc(p[0])}: ${dpMoney(v)}"></i>` : ''; }).join('')}</div>
    <div class="v">${dpMoney(totals[k])}</div></div>`).join('');
  const missing = codes.filter(c => daSummary(g, c) && !(tot(c) > 0));
  const leg = '<div class="da-leg">' + (parts.length > 1 ? parts.map(p => `<span><i style="background:${p[1]}"></i>${p[0]}</span>`).join('') : '')
    + (missing.length ? `<span>${missing.map(c => dpEsc(dpName(c))).join(', ')}: nothing in this measure.</span>` : '') + '</div>';
  const cols = [{ label: 'Metric' }, { label: 'Actual', align: 'r' }, { label: 'Target', align: 'r' }, { label: 'Variance', align: 'r' }, { label: '% done', align: 'r', w: '116px' }, { label: 'Remaining', align: 'r' }];
  const rows = cfg.lines.map(id => {
    const [label, key, fn, isCount, isTotal] = DA_LINES[id];
    const lab = typeof label === 'function' ? label() : label, f = isCount ? lgNum : lgAed, a = daSumFn(g, have, fn);
    const t = key ? daTarget(key, have, idxs) : null;
    const cells = (t == null || !(t > 0)) ? [lab, f(a), '<span class="lg-na">no target</span>', '\u2014', '\u2014', '\u2014']
      : [lab, f(a), f(t), lgDelta(a - t, f), lgDoneBar(a / t * 100), f(Math.max(t - a, 0))];
    return isTotal ? { total: cells } : cells;
  });
  return `${bars}${leg}<details class="da-det"><summary>Show the figures</summary><div class="da-fig">${lgTable(cols, rows)}</div></details>
    <div class="note dp-sub" style="margin-top:8px">The target is Daily's own: each day's target added up over the days the branch was open in this period.</div>`;
}

// ── CLIENTS ─────────────────────────────────────────────────
// Drawn for the client measures and Rebooking %, which are about who came in and who booked again.
const DA_CLIENT_MK = ['clients', 'newc', 'ncr', 'ncrp', 'rebookn', 'rebook'];
const daShowsClients = () => DA_CLIENT_MK.includes(DP.measure);
function daCliInner(g, codes, idxs) {
  const have = codes.filter(c => daSummary(g, c));
  if (g.none || !have.length) return daNone(g);
  const rows = have.map(c => { const s = daSummary(g, c); const tot = Number(s.totalClients) || 0, nw = Math.min(Number(s.newClientsTotal) || 0, tot); return { c, tot, nw, rt: tot - nw, rb: Number(s.totalRebooked) || 0 }; });
  const mx = Math.max(...rows.map(r => r.tot), 1);
  const bars = rows.map(r => `<div class="da-stack da-c3"><div><span class="dot" style="background:${dpCol(r.c)}"></span> ${dpEsc(dpName(r.c))}</div>
    <div class="trk" style="width:${r.tot / mx * 100}%"><i style="width:${r.tot ? r.nw / r.tot * 100 : 0}%;background:var(--mint,#99F6E4)" title="New: ${Math.round(r.nw)}"></i><i style="width:${r.tot ? r.rt / r.tot * 100 : 0}%;background:var(--lavender,#C4B5FD)" title="Returning: ${Math.round(r.rt)}"></i></div>
    <div class="v" style="font-size:13px">${lgNum(r.tot)} <span style="color:var(--muted);font-weight:400">\u00B7 ${lgNum(r.rb)} rebooked</span></div></div>`).join('');
  const leg = '<div class="da-leg"><span><i style="background:var(--mint,#99F6E4)"></i>New</span><span><i style="background:var(--lavender,#C4B5FD)"></i>Returning</span></div>';
  const S = fn => daSumFn(g, have, fn);
  const anyPh = have.some(c => daSummary(g, c).ph), anyPhB = have.some(c => daSummary(g, c).ph && daSummary(g, c).ph.beauty && daSummary(g, c).ph.beauty.t);
  const anyBeauty = have.some(c => (daSummary(g, c).beautyTotalClients || 0) > 0);
  const phv = (dept, k) => daSumFn(g, have, s => (s.ph && s.ph[dept]) ? s.ph[dept][k] : 0);
  const line = (label, v, key) => {
    const t = key ? daTarget(key, have, idxs) : null;
    return (t == null || !(t > 0)) ? [label, lgNum(v), '<span class="lg-na">no target</span>', '—', '—', '—']
      : [label, lgNum(v), lgNum(t), lgDelta(v - t, lgNum), lgDoneBar(v / t * 100), lgNum(Math.max(t - v, 0))];
  };
  const body = [{ group: 'Hair' },
    line('Hair Total Clients', S(s => s.hairTotalClients)), line('Hair New Clients', S(s => s.hairNewClients)), line('Hair NCR', S(s => s.hairNCR)), line('Hair Rebooked', S(s => s.hairRebookedCount)),
    ...(anyPh ? [line('Hair new clients (Phorest)', phv('hair', 'nw')), line('Hair requests, RQ (Phorest)', phv('hair', 'req'))] : []),
    ...(anyBeauty ? [{ group: 'Beauty' },
      line('Beauty Total Clients', S(s => s.beautyTotalClients)), line('Beauty New Clients', S(s => s.beautyNewClients)), line('Beauty NCR', S(s => s.beautyNCR)), line('Beauty Rebooked', S(s => s.beautyRebookedCount)),
      ...(anyPhB ? [line('Beauty new clients (Phorest)', phv('beauty', 'nw')), line('Beauty requests, RQ (Phorest)', phv('beauty', 'req'))] : [])] : []),
    { group: 'Combined' },
    line('Rebooked', S(s => s.totalRebooked)), line('Total Clients', S(s => s.totalClients), 'clients'), line('New Clients', S(s => s.newClientsTotal), 'newc'), line('NCR', S(s => s.ncrTotal), 'ncr'),
    ...(anyPh ? [line('New clients (Phorest)', phv('hair', 'nw') + phv('beauty', 'nw')), line('Requests, RQ (Phorest)', phv('hair', 'req') + phv('beauty', 'req'))] : []),
  ];
  const cols = [{ label: 'Metric' }, { label: 'Actual', align: 'r' }, { label: 'Target', align: 'r' }, { label: 'Variance', align: 'r' }, { label: '% done', align: 'r', w: '116px' }, { label: 'Remaining', align: 'r' }];
  return `${bars}${leg}<details class="da-det"><summary>Show the figures: hair, beauty and combined</summary><div class="da-fig">${lgTable(cols, body)}</div></details>`;
}

// ── STAFF PERFORMANCE ───────────────────────────────────────
// Ranked by the measure picked, with that measure's column marked and every other column kept for context. Hair columns are
// 0 name, 1 services excl. tx and courses, 2 treatments, 3 retail, 4 net take, 5 clients, 6 new, 7 NCR, 8 rebooked, 9 rebook %, 10 avg bill,
// 11 visits (Phorest), 12 avg bill (Phorest); beauty 0 name, 1 services, 2 retail, 3 net take, 4 clients, 5 new, 6 NCR, 7 rebooked, 8 rebook %,
// 9 avg bill, 10 visits, 11 avg bill (Phorest). Utilisation is not held per person here, so it falls back to net take and says so.
const daN = v => Number(v) || 0;
const daRatio = (a, b) => b ? a / b : null;
const DA_STAFF = {
  sales:   { dept: 'both', hair: st => daN(st.netSalonTake), hhl: [4], beauty: st => daN(st.netSalonTake), bhl: [3] },
  services: { dept: 'both', hair: st => daN(st.hairServicesExcl), hhl: [1], beauty: st => daN(st.beautySales), bhl: [1] },
  retail:  { dept: 'both', hair: st => daN(st.retail), hhl: [3], beauty: st => daN(st.retail), bhl: [2] },
  hair:    { dept: 'hair', hair: st => st.hairSalesNet != null ? daN(st.hairSalesNet) : daN(st.hairServicesExcl) + daN(st.treatments), hhl: [1, 2] },
  beauty:  { dept: 'beauty', beauty: st => daN(st.beautySales), bhl: [1] },
  treat:   { dept: 'hair', hair: st => daN(st.treatments), hhl: [2] },
  clients: { dept: 'both', hair: st => daN(st.total), hhl: [5], beauty: st => daN(st.total), bhl: [4] },
  newc:    { dept: 'both', hair: st => daN(st.newC != null ? st.newC : st.newClients), hhl: [6], beauty: st => daN(st.newC != null ? st.newC : st.newClients), bhl: [5] },
  ncr:     { dept: 'both', hair: st => daN(st.newClientReq), hhl: [7], beauty: st => daN(st.newClientReq), bhl: [6] },
  ncrp:    { dept: 'both', hair: st => daRatio(daN(st.newClientReq), daN(st.total)), hhl: [7, 5], beauty: st => daRatio(daN(st.newClientReq), daN(st.total)), bhl: [6, 4], note: 'NCR as a share of the person\u2019s clients.' },
  rebookn: { dept: 'both', hair: st => daN(st.rebooked), hhl: [8], beauty: st => daN(st.rebooked), bhl: [7] },
  rebook:  { dept: 'both', hair: st => daN(st.rebookPct), hhl: [9], beauty: st => daN(st.rebookPct), bhl: [8] },
  treatp:  { dept: 'hair', hair: st => daRatio(daN(st.treatments), st.hairSalesNet != null ? daN(st.hairSalesNet) : daN(st.hairServicesExcl) + daN(st.treatments)), hhl: [2], note: 'Treatments as a share of the stylist\u2019s hair revenue.' },
  retailp: { dept: 'both', hair: st => daRatio(daN(st.retail), daN(st.netSalonTake)), hhl: [3], beauty: st => daRatio(daN(st.retail), daN(st.netSalonTake)), bhl: [2], note: 'Retail as a share of the person\u2019s net take.' },
  hairbill: { dept: 'hair', hair: st => daN(st.avgBill), hhl: [10] },
  beautybill: { dept: 'beauty', beauty: st => daN(st.avgBill), bhl: [9] },
  util:    { dept: 'both', hair: st => daN(st.netSalonTake), hhl: [], beauty: st => daN(st.netSalonTake), bhl: [], note: 'Utilisation is not held per person on this page yet, so these are in net take order.' },
};
function daStaffInner(g, codes) {
  if (g.none) return daNone(g);
  const cfg = DA_STAFF[DP.measure] || DA_STAFF.sales;
  const ctx = { applies: false };   // the per-person monthly target belongs to the Ledgers, not to a daily window
  const keep = st => !(typeof isResignedStaff === 'function' && isResignedStaff(st.name) && !(st.total || 0) && !(st.netSalonTake || 0));
  const hl = (cells, set) => cells.map((c, i) => set.includes(i) ? `<span class="da-hl">${c}</span>` : c);
  const cols = (labels, set) => labels.map((label, i) => ({ label: set.includes(i) ? `<span class="da-hlh">${label}</span>` : label, align: i ? 'r' : undefined }));
  const hairLabels = ['Stylist', 'Services excl. tx & courses', 'Treatments', 'Retail', 'Net take', 'Clients (ledger)', 'New', 'NCR', 'Rebooked', 'Rebook %', 'Avg bill', 'Visits (Phorest)', 'Avg bill (Phorest)'];
  const beautyLabels = ['Therapist', 'Services', 'Retail', 'Net take', 'Clients (ledger)', 'New', 'NCR', 'Rebooked', 'Rebook %', 'Avg bill', 'Visits (Phorest)', 'Avg bill (Phorest)'];
  const rank = (arr, key) => arr.slice().sort((a, b) => (key(b) == null ? -Infinity : key(b)) - (key(a) == null ? -Infinity : key(a)));
  const blocks = codes.filter(c => g.byCode[c] && g.byCode[c].full).map((code, k) => {
    const f = g.byCode[code].full;
    const hair = cfg.dept === 'beauty' ? [] : rank((f.hairStaff || []).filter(keep), cfg.hair).map(st => hl([
      lgStaffName(code, 'HAIR', st, ctx), lgAed(st.hairServicesExcl), lgAed(st.treatments), lgAed(st.retail), lgAed(st.netSalonTake),
      lgNum(st.total), lgNum(st.newC != null ? st.newC : st.newClients), lgNum(st.newClientReq), lgNum(st.rebooked), lgPct(st.rebookPct), lgAed(st.avgBill),
      st.ph ? lgNum(st.ph.t) : '\u2014', st.ph && st.ph.t ? lgAed(st.ph.svc / st.ph.t) : '\u2014'], cfg.hhl || []));
    const beauty = cfg.dept === 'hair' ? [] : rank((f.beautyStaff || []).filter(keep), cfg.beauty).map(st => hl([
      lgStaffName(code, 'BEAUTY', st, ctx), lgAed(st.beautySales), lgAed(st.retail), lgAed(st.netSalonTake),
      lgNum(st.total), lgNum(st.newC != null ? st.newC : st.newClients), lgNum(st.newClientReq), lgNum(st.rebooked), lgPct(st.rebookPct), lgAed(st.avgBill),
      st.ph ? lgNum(st.ph.t) : '\u2014', st.ph && st.ph.t ? lgAed(st.ph.svc / st.ph.t) : '\u2014'], cfg.bhl || []));
    if (!hair.length && !beauty.length) return '';
    return `<details class="da-br"${k === 0 ? ' open' : ''}><summary><span class="dot" style="background:${dpCol(code)}"></span> ${dpEsc(dpName(code))}
      <span class="dp-sub" style="margin-left:8px;font-weight:400">${hair.length ? hair.length + ' hair' : ''}${hair.length && beauty.length ? ', ' : ''}${beauty.length ? beauty.length + ' beauty' : ''}</span></summary>
      ${hair.length ? `<div class="da-sub2">Hair</div>${lgTable(cols(hairLabels, cfg.hhl || []), hair, { compact: true })}` : ''}
      ${beauty.length ? `<div class="da-sub2">Beauty</div>${lgTable(cols(beautyLabels, cfg.bhl || []), beauty, { compact: true })}` : ''}</details>`;
  }).join('');
  return (cfg.note ? `<p class="dp-sub" style="margin:0 0 8px">${dpEsc(cfg.note)}</p>` : '') + (blocks || `<p class="dp-sub">No ${dpEsc(DP_M[DP.measure].label)} figures for the branches picked in this window.</p>`);
}

// ── THE CARDS THAT FOLLOW THE MEASURE, AND FILLING THEM ──────
function daCard(id, title, why, innerId, cached, fill) {
  return `<div class="dp-card dp-jt" id="${id}"><div class="dp-head"><div><h2>${title}</h2><p class="dp-why">${why}</p></div></div>
    <div id="${innerId}">${cached ? fill() : '<div class="loading">Loading...</div>'}</div></div>`;
}
function daMoreCards(win, idxs) {
  daCss(); daEnsure(win);
  const cached = !!(daData && daData.key === daKey(win)), g = daData, codes = dpSel(), mk = DP.measure, M = DP_M[mk];
  let out = '';
  if (daShowsMix()) out += daCard('dpCardM', DA_MIX[mk].title, DA_MIX[mk].why, 'daMix', cached, () => daMixInner(g, codes, idxs));
  if (daShowsClients()) out += daCard('dpCardCl', 'Clients: new against returning, hair against beauty', 'A rebooking problem is almost always one department\u2019s, so the split is under the figures. Per staff, from the ledgers: a client seen by two staff counts twice. The through-the-door count is on the Organisation Pulse.', 'daCli', cached, () => daCliInner(g, codes, idxs));
  out += daCard('dpCardS', `Staff performance: ${dpEsc(M.label)}`, `Per stylist and therapist for this period, ranked by ${dpEsc(M.noun)} with that column marked and the rest kept beside it. Hover or tap a name for the card, stats and more.`, 'daStaff', cached, () => daStaffInner(g, codes));
  return out;
}
function daFillAll(g) {
  const codes = dpSel(), idxs = dpIdx(dpWindow());
  [['daMix', () => daMixInner(g, codes, idxs)], ['daCli', () => daCliInner(g, codes, idxs)], ['daStaff', () => daStaffInner(g, codes)]].forEach(([id, fn]) => {
    const host = document.getElementById(id);
    if (host) { host.innerHTML = fn(); if (typeof lgWatchScroll === 'function') lgWatchScroll(host); }
  });
}
