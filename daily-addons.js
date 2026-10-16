/* ══════════════════════════════════════════════════════════════
   DAILY PERFORMANCE: THE REPORTS BORROWED FROM BRANCH PERFORMANCE
   Kate, 15 Oct 2026. Branch Performance and Daily Performance showed the same numbers twice, so Branch Performance is
   being folded into this page. Daily keeps everything it has; this file adds only the reports Daily lacked, one batch at
   a time: Growth (batch 1), then Revenue mix, Clients and Staff performance (batches 2 and 3, 16 Oct 2026).

   Loaded after daily-performance.js, which calls daGrowthCard() from dpDraw. Nothing here runs on load.

   GROWTH reads the same rows the same way Branch Performance does (bpGrowth in branch-ledger.js): the window is cut to the
   last day that has a ledger row, the window before is exactly as many days ending the day before this one starts, and both
   are added up by aggDailyData, so the two pages agree to the dirham for the same dates. Clients here are per staff, from
   the ledgers, like Daily's Clients measure: the through-the-door count is not on this page.
   ══════════════════════════════════════════════════════════════ */
const DA_BUCKETS = 8;
let daGrowthData = null, daGrowthBusy = '';

function daCss() {
  if (document.getElementById('daCss')) return;
  const st = document.createElement('style'); st.id = 'daCss';
  st.textContent = `
  .dpf .da-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px}
  .dpf .da-gc{border:1px solid var(--border);border-radius:var(--radius-card,10px);padding:12px 14px;background:var(--surface)}
  .dpf .da-hd{display:flex;gap:8px;align-items:center;font-weight:600}
  .dpf .da-rk{margin-left:auto;font-size:11px;font-weight:500;color:var(--muted2);white-space:nowrap}
  .dpf .da-v{font-size:25px;font-weight:700;line-height:1.1;margin-top:6px;font-variant-numeric:tabular-nums}
  .dpf .da-g{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;margin-top:2px}
  .dpf .da-pc{font-weight:700;font-size:15px;font-variant-numeric:tabular-nums}
  .dpf .da-up{color:var(--good)}.dpf .da-down{color:var(--bad)}.dpf .da-flat{color:var(--muted)}
  .dpf .da-spark{display:block;width:100%;height:34px;margin:6px 0 2px}
  .dpf .da-spark polyline{fill:none;stroke-width:2;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke}
  .dpf .da-chip{display:flex;justify-content:space-between;gap:8px;font-size:12.5px;padding:3px 0;border-top:1px solid var(--border2,var(--border))}
  .dpf .da-chip:first-of-type{margin-top:8px}
  .dpf .da-chip .da-k{color:var(--muted)}
  .dpf .da-chip b{font-variant-numeric:tabular-nums}
  .dpf .da-win{font-size:13px;color:var(--muted);margin:0 0 10px;line-height:1.45}
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
  .dpf .da-stack.da-c3{grid-template-columns:120px 1fr 170px}
  @media(max-width:760px){.dpf .da-stack,.dpf .da-stack.da-c3{grid-template-columns:1fr auto;gap:4px 10px}.dpf .da-stack>div:nth-child(1){grid-column:1;grid-row:1}.dpf .da-stack>div:nth-child(3){grid-column:2;grid-row:1}.dpf .da-stack>.trk{grid-column:1/-1;grid-row:2}}
  .dpf .da-trim{display:block;margin-top:4px;color:var(--warn)}
  @media(max-width:760px){.dpf .da-grid{grid-template-columns:1fr;gap:0}.dpf .da-gc{border:0;border-top:1px solid var(--border);border-radius:0;padding:12px 0;background:none}.dpf .da-gc:first-child{border-top:0}}
  `;
  document.head.appendChild(st);
}

const daKey = win => dpYmd(win.from) + '|' + dpYmd(win.to);

// Growth as the page states it: a percentage when there is a base to divide by, "no base" when the window before is empty.
// A branch that took nothing last period and something this period has not grown by infinity.
function daDelta(cur, prev) {
  const c = Number(cur) || 0, p = Number(prev) || 0;
  if (!p) return { pct: null, dir: c > 0 ? 'up' : 'flat', cur: c, prev: p };
  const pct = (c - p) / p * 100;
  return { pct, dir: Math.abs(pct) < 0.5 ? 'flat' : (pct > 0 ? 'up' : 'down'), cur: c, prev: p };
}

async function daLoadGrowth(win) {
  const key = daKey(win);
  if (daGrowthData && daGrowthData.key === key) return daGrowthData;
  const codes = DPD ? DPD.codes : dpCodes();
  const curAll = await loadBranchStaffDailyRange(win.from, win.to);
  const curB = (curAll || []).filter(r => codes.includes(r.branch));
  if (!curB.length) return (daGrowthData = { key, none: 'There are no ledger figures in this window yet.' });
  // The last day with a ledger row inside the window: on a window that runs to yesterday, the ledger can be a day or two behind,
  // and those empty days must not be counted as days that took nothing.
  const lastStr = curB.reduce((m, r) => { const d = String(r.date || '').slice(0, 10); return d > m ? d : m; }, '');
  const effTo = new Date(lastStr + 'T00:00:00');
  if (isNaN(effTo)) return (daGrowthData = { key, none: 'There are no ledger figures in this window yet.' });
  const days = Math.round((effTo - win.from) / 86400000) + 1;
  if (days < 2) return (daGrowthData = { key, none: 'Growth needs at least two days to compare against the days before. Pick a longer period in the filters.' });
  const prevTo = dpAdd(win.from, -1), prevFrom = dpAdd(prevTo, -(days - 1));
  const [curP, prevB, prevP] = await Promise.all([
    loadPhorestStaffDailyRange(win.from, effTo),
    loadBranchStaffDailyRange(prevFrom, prevTo),
    loadPhorestStaffDailyRange(prevFrom, prevTo),
  ]);
  const cut = (rows, from, to, code) => {
    const f = dpYmd(from), t = dpYmd(to);
    return (rows || []).filter(r => { const d = String(r.date || '').slice(0, 10); return d >= f && d <= t && r.branch === code; });
  };
  const agg = (b, p, from, to, code) => {
    const bb = cut(b, from, to, code), pp = cut(p, from, to, code);
    if (!bb.length && !pp.length) return null;
    const r = aggDailyData([], bb, pp);
    return r ? r.summary : null;
  };
  // Equal slices of the window, so the line is the shape of this period and not of the calendar.
  const buckets = [], per = days / DA_BUCKETS;
  for (let i = 0; i < DA_BUCKETS; i++) {
    const f = dpAdd(win.from, Math.floor(i * per));
    let t = dpAdd(win.from, Math.ceil((i + 1) * per) - 1);
    if (t > effTo) t = new Date(effTo);
    buckets.push({ from: f, to: t });
  }
  const byCode = {};
  codes.forEach(code => {
    // The whole aggregate for this window, so Growth, Revenue mix, Clients and Staff performance all read the same sums.
    const bb = cut(curB, win.from, effTo, code), pp = cut(curP, win.from, effTo, code);
    const full = (bb.length || pp.length) ? aggDailyData([], bb, pp) : null;
    byCode[code] = {
      full,
      cur: full ? full.summary : null,
      prev: agg(prevB, prevP, prevFrom, prevTo, code),
      spark: buckets.map(x => { const s = agg(curB, curP, x.from, x.to, code); return s ? (s.netTake || 0) : 0; }),
    };
  });
  return (daGrowthData = {
    key, days, byCode,
    cur: { from: win.from, to: effTo }, prev: { from: prevFrom, to: prevTo },
    trimmed: dpYmd(effTo) !== dpYmd(win.to) ? win.to : null,
  });
}

function daSpark(values, code) {
  const v = (values || []).map(x => Number(x) || 0);
  if (v.length < 2) return '';
  const max = Math.max(...v), min = Math.min(...v), span = max - min || 1;
  const pts = v.map((x, i) => `${(i / (v.length - 1) * 200).toFixed(1)},${(30 - ((x - min) / span) * 26).toFixed(1)}`).join(' ');
  return `<svg class="da-spark" viewBox="0 0 200 34" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" style="stroke:${dpCol(code)}"/></svg>`;
}

function daChip(label, valueText, d, pts) {
  const arrow = d.dir === 'up' ? '▲' : d.dir === 'down' ? '▼' : '–';
  const move = pts ? (d.pct == null ? '—' : `${d.cur - d.prev > 0 ? '+' : ''}${Math.round(d.cur - d.prev)} pts`)
    : (d.pct == null ? 'no base' : `${d.pct > 0 ? '+' : ''}${d.pct.toFixed(1)}%`);
  return `<div class="da-chip"><span class="da-k">${dpEsc(label)}</span><span><b>${valueText}</b> <span class="da-${d.dir}">${arrow} ${move}</span></span></div>`;
}

function daGrowthInner(g, codes) {
  if (g.none) return `<p class="dp-sub">${dpEsc(g.none)}</p>`;
  const rows = codes.filter(c => g.byCode[c] && g.byCode[c].cur).sort((a, b) => (g.byCode[b].cur.netTake || 0) - (g.byCode[a].cur.netTake || 0));
  if (!rows.length) return '<p class="dp-sub">No figures for the branches picked in this window.</p>';
  const ord = ['1st', '2nd', '3rd', '4th'];
  const win = `<p class="da-win"><b>${dpEsc(dpDayLabel(g.cur.from))} to ${dpEsc(dpDayLabel(g.cur.to))}</b> against <b>${dpEsc(dpDayLabel(g.prev.from))} to ${dpEsc(dpDayLabel(g.prev.to))}</b>, ${g.days} days each, like for like.`
    + (g.trimmed ? `<span class="da-trim">The ledger has synced to ${dpEsc(dpDayLabel(g.cur.to))}, so the window stops there rather than counting unsynced days as days that took nothing.</span>` : '') + '</p>';
  const cards = rows.map((code, i) => {
    const c = g.byCode[code].cur, p = g.byCode[code].prev;
    const take = daDelta(c.netTake, p && p.netTake);
    const hairOnly = !((c.beautyTotalClients || 0) || (c.beautyServicesTotal || 0));
    return `<div class="da-gc"><div class="da-hd"><span class="dot" style="background:${dpCol(code)}"></span>${dpEsc(dpName(code))}<span class="da-rk">${ord[i] || ''} by take</span></div>
      <div class="da-v">${dpMoney(c.netTake || 0)}</div>
      <div class="dp-sub">net take · ${(c.totalClients || 0).toLocaleString('en-GB')} clients (per staff)${hairOnly ? ' · hair only' : ''}</div>
      <div class="da-g"><span class="da-pc da-${take.dir}">${take.pct == null ? '—' : `${take.pct > 0 ? '+' : ''}${take.pct.toFixed(1)}%`}</span>
        <span class="dp-sub">${p ? dpMoney(p.netTake || 0) + ' last period' : 'nothing last period'}</span></div>
      ${daSpark(g.byCode[code].spark, code)}
      ${daChip('Clients (per staff)', (c.totalClients || 0).toLocaleString('en-GB'), daDelta(c.totalClients, p && p.totalClients))}
      ${daChip('Hair avg bill', dpMoney(c.hairAvgBill || 0), daDelta(c.hairAvgBill, p && p.hairAvgBill))}
      ${daChip('Rebooking', Math.round(c.rebookPct || 0) + '%', daDelta(c.rebookPct, p && p.rebookPct), true)}</div>`;
  }).join('');
  return win + `<div class="da-grid">${cards}</div>`;
}

// The card dpDraw drops in after the tiles. It paints from the cache when it has this window, and otherwise says Loading and
// fetches, then fills itself in if the page is still showing the same window.
function daGrowthCard(win) {
  daCss();
  const key = daKey(win), cached = daGrowthData && daGrowthData.key === key;
  if (!cached && daGrowthBusy !== key) {
    daGrowthBusy = key;
    daLoadGrowth(win).then(g => g, e => ({ key, none: 'Could not load growth: ' + ((e && e.message) || e) + '. Try Refresh.' })).then(g => {
      if (daGrowthBusy === key) daGrowthBusy = '';
      if (document.getElementById('daGrowth') && daKey(dpWindow()) === key) daFillAll(g);
    });
  }
  return `<div class="dp-card dp-jt" id="dpCardG"><div class="dp-head"><div><h2>Growth: this period against the one before</h2>
    <p class="dp-why">Is each branch moving? This period's net take against the same number of days just before it, with clients, hair average bill and rebooking beside it. The ledger's own figures, so it matches the Ledgers and the Daily Target Sheet.</p></div>
    <span class="dp-tag">Measure does not apply</span></div>
    <div id="daGrowth">${cached ? daGrowthInner(daGrowthData, dpSel()) : '<div class="loading">Loading growth...</div>'}</div></div>`;
}


/* ══════════════════════════════════════════════════════════════
   REVENUE MIX, CLIENTS, STAFF PERFORMANCE
   Kate, 16 Oct 2026, built from Downloads/mockup-daily-performance-remaining-addons.html. The three reports Branch
   Performance had and Daily did not. They follow the masthead's Branch and Period filters and ignore the Measure menu,
   and read the same aggregate as Growth (daLoadGrowth), so the page counts every figure once.

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
const DA_PARTS = [['Hair services', '#C4B5FD', s => s.hairServicesExcl], ['Treatments', '#99F6E4', s => s.treatmentSales],
  ['Hair courses', '#BFDBFE', s => s.hairCourses], ['Beauty services', '#FFD4D9', s => s.beautyServicesTotal], ['Retail', '#EEF3C7', s => s.retailTotal]];
const DA_REV = [
  [() => LG_TOTAL_LABEL, 'sales', s => lgTotalRevenue(s), 0, 1],
  [() => LG_SERVICES_LABEL, 'services', s => lgServicesTotal(s)],
  [() => LG_RETAIL_LABEL, 'retail', s => s.retailTotal],
  ['Hair revenue (incl. treatments and courses)', 'hair', s => s.hairServicesIncl],
  ['Hair services (excl. treatments and courses)', null, s => s.hairServicesExcl],
  ['Hair treatments revenue', 'treat', s => s.treatmentSales],
  ['# hair treatments sold', null, s => s.hairTreatmentUnits, 1],
  ['Hair courses revenue (performed)', null, s => s.hairCourses],
  ['Hair retail revenue', null, s => s.hairRetailOnly],
  ['# hair retail sold', null, s => s.hairRetailUnits, 1],
  ['Beauty services revenue', 'beauty', s => s.beautyServicesTotal],
  ['Beauty retail revenue', null, s => s.beautyRetailOnly],
  ['# beauty retail sold', null, s => s.beautyRetailUnits, 1],
];
function daMixInner(g, codes, idxs) {
  const have = codes.filter(c => daSummary(g, c));
  if (g.none || !have.length) return daNone(g);
  const tot = have.map(c => DA_PARTS.reduce((a, p) => a + (Number(p[2](daSummary(g, c))) || 0), 0));
  const mx = Math.max(...tot, 1);
  const bars = have.map((c, k) => `<div class="da-stack"><div><span class="dot" style="background:${dpCol(c)}"></span> ${dpEsc(dpName(c))}</div>
    <div class="trk" style="width:${tot[k] / mx * 100}%">${DA_PARTS.map(p => { const v = Number(p[2](daSummary(g, c))) || 0; return v > 0 ? `<i style="width:${v / (tot[k] || 1) * 100}%;background:${p[1]}" title="${dpEsc(p[0])}: ${dpMoney(v)}"></i>` : ''; }).join('')}</div>
    <div class="v">${dpMoney(tot[k])}</div></div>`).join('');
  const leg = '<div class="da-leg">' + DA_PARTS.map(p => `<span><i style="background:${p[1]}"></i>${p[0]}</span>`).join('')
    + (have.some(c => !((daSummary(g, c).beautyTotalClients || 0) || (daSummary(g, c).beautyServicesTotal || 0))) ? '<span>Motor City has no Beauty team.</span>' : '') + '</div>';
  const cols = [{ label: 'Metric' }, { label: 'Actual', align: 'r' }, { label: 'Target', align: 'r' }, { label: 'Variance', align: 'r' }, { label: '% done', align: 'r', w: '116px' }, { label: 'Remaining', align: 'r' }];
  const rows = DA_REV.map(([label, key, fn, isCount, isTotal]) => {
    const lab = typeof label === 'function' ? label() : label, f = isCount ? lgNum : lgAed, a = daSumFn(g, have, fn);
    const t = key ? daTarget(key, have, idxs) : null;
    const cells = (t == null || !(t > 0)) ? [lab, f(a), '<span class="lg-na">no target</span>', '—', '—', '—']
      : [lab, f(a), f(t), lgDelta(a - t, f), lgDoneBar(a / t * 100), f(Math.max(t - a, 0))];
    return isTotal ? { total: cells } : cells;
  });
  return `${bars}${leg}<details class="da-det"><summary>Show the figures: revenue by line, against target</summary><div class="da-fig">${lgTable(cols, rows)}</div></details>
    <div class="note dp-sub" style="margin-top:8px">The target is Daily's own: each day's target added up over the days the branch was open in this period.</div>`;
}

// ── CLIENTS ─────────────────────────────────────────────────
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
function daStaffInner(g, codes) {
  if (g.none) return daNone(g);
  const ctx = { applies: false };   // the per-person monthly target belongs to the Ledgers, not to a daily window
  const keep = st => !(typeof isResignedStaff === 'function' && isResignedStaff(st.name) && !(st.total || 0) && !(st.netSalonTake || 0));
  const hairCols = [{ label: 'Stylist' }, { label: 'Services excl. tx & courses', align: 'r' }, { label: 'Treatments', align: 'r' }, { label: 'Retail', align: 'r' }, { label: 'Net take', align: 'r' },
    { label: 'Clients (ledger)', align: 'r' }, { label: 'New', align: 'r' }, { label: 'NCR', align: 'r' }, { label: 'Rebooked', align: 'r' }, { label: 'Rebook %', align: 'r' }, { label: 'Avg bill', align: 'r' },
    { label: 'Visits (Phorest)', align: 'r' }, { label: 'Avg bill (Phorest)', align: 'r' }];
  const beautyCols = [{ label: 'Therapist' }, { label: 'Services', align: 'r' }, { label: 'Retail', align: 'r' }, { label: 'Net take', align: 'r' }, { label: 'Clients (ledger)', align: 'r' },
    { label: 'New', align: 'r' }, { label: 'NCR', align: 'r' }, { label: 'Rebooked', align: 'r' }, { label: 'Rebook %', align: 'r' }, { label: 'Avg bill', align: 'r' },
    { label: 'Visits (Phorest)', align: 'r' }, { label: 'Avg bill (Phorest)', align: 'r' }];
  const blocks = codes.filter(c => g.byCode[c] && g.byCode[c].full).map((code, k) => {
    const f = g.byCode[code].full;
    const hair = (f.hairStaff || []).filter(keep).slice().sort((a, b) => (b.netSalonTake || 0) - (a.netSalonTake || 0)).map(st => [
      lgStaffName(code, 'HAIR', st, ctx), lgAed(st.hairServicesExcl), lgAed(st.treatments), lgAed(st.retail), lgAed(st.netSalonTake),
      lgNum(st.total), lgNum(st.newC != null ? st.newC : st.newClients), lgNum(st.newClientReq), lgNum(st.rebooked), lgPct(st.rebookPct), lgAed(st.avgBill),
      st.ph ? lgNum(st.ph.t) : '—', st.ph && st.ph.t ? lgAed(st.ph.svc / st.ph.t) : '—']);
    const beauty = (f.beautyStaff || []).filter(keep).slice().sort((a, b) => (b.netSalonTake || 0) - (a.netSalonTake || 0)).map(st => [
      lgStaffName(code, 'BEAUTY', st, ctx), lgAed(st.beautySales), lgAed(st.retail), lgAed(st.netSalonTake),
      lgNum(st.total), lgNum(st.newC != null ? st.newC : st.newClients), lgNum(st.newClientReq), lgNum(st.rebooked), lgPct(st.rebookPct), lgAed(st.avgBill),
      st.ph ? lgNum(st.ph.t) : '—', st.ph && st.ph.t ? lgAed(st.ph.svc / st.ph.t) : '—']);
    return `<details class="da-br"${k === 0 ? ' open' : ''}><summary><span class="dot" style="background:${dpCol(code)}"></span> ${dpEsc(dpName(code))}
      <span class="dp-sub" style="margin-left:8px;font-weight:400">${hair.length} hair${beauty.length ? ', ' + beauty.length + ' beauty' : ', hair only'}</span></summary>
      <div class="da-sub2">Hair</div>${hair.length ? lgTable(hairCols, hair, { compact: true }) : '<p class="dp-sub">No hair figures for this period.</p>'}
      ${beauty.length ? `<div class="da-sub2">Beauty</div>${lgTable(beautyCols, beauty, { compact: true })}` : ''}</details>`;
  }).join('');
  return blocks || daNone(g);
}

// ── THE THREE CARDS, AND FILLING EVERY CARD ─────────────────
function daCard(id, title, why, innerId, cached, fill) {
  return `<div class="dp-card dp-jt" id="${id}"><div class="dp-head"><div><h2>${title}</h2><p class="dp-why">${why}</p></div><span class="dp-tag">Measure does not apply</span></div>
    <div id="${innerId}">${cached ? fill() : '<div class="loading">Loading...</div>'}</div></div>`;
}
function daMoreCards(win, idxs) {
  daCss();
  const cached = !!(daGrowthData && daGrowthData.key === daKey(win)), g = daGrowthData, codes = dpSel();
  return daCard('dpCardM', 'Revenue mix: where the money came from', 'What each branch\u2019s net take was made of, so you can see whether a good month was hair, beauty or retail. Hover a band for the figure.', 'daMix', cached, () => daMixInner(g, codes, idxs))
    + daCard('dpCardCl', 'Clients: new against returning, hair against beauty', 'A rebooking problem is almost always one department\u2019s, so the split is under the figures. Per staff, from the ledgers: a client seen by two staff counts twice. The through-the-door count is on the Organisation Pulse.', 'daCli', cached, () => daCliInner(g, codes, idxs))
    + daCard('dpCardS', 'Staff performance', 'Per stylist and therapist for this period, biggest net take first, with Phorest\u2019s visit count beside the ledger\u2019s. Hover or tap a name for the card, stats and more.', 'daStaff', cached, () => daStaffInner(g, codes));
}
function daFillAll(g) {
  const codes = dpSel(), idxs = dpIdx(dpWindow());
  [['daGrowth', () => daGrowthInner(g, codes)], ['daMix', () => daMixInner(g, codes, idxs)], ['daCli', () => daCliInner(g, codes, idxs)], ['daStaff', () => daStaffInner(g, codes)]].forEach(([id, fn]) => {
    const host = document.getElementById(id);
    if (host) { host.innerHTML = fn(); if (typeof lgWatchScroll === 'function') lgWatchScroll(host); }
  });
}
