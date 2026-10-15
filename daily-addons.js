/* ══════════════════════════════════════════════════════════════
   DAILY PERFORMANCE: THE REPORTS BORROWED FROM BRANCH PERFORMANCE
   Kate, 15 Oct 2026. Branch Performance and Daily Performance showed the same numbers twice, so Branch Performance is
   being folded into this page. Daily keeps everything it has; this file adds only the reports Daily lacked, one batch at
   a time: Growth (this file, batch 1), then Revenue mix and Clients, then Staff performance.

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
    byCode[code] = {
      cur: agg(curB, curP, win.from, effTo, code),
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
      const host = document.getElementById('daGrowth');
      if (host && daKey(dpWindow()) === key) host.innerHTML = daGrowthInner(g, dpSel());
    });
  }
  return `<div class="dp-card dp-jt" id="dpCardG"><div class="dp-head"><div><h2>Growth: this period against the one before</h2>
    <p class="dp-why">Is each branch moving? This period's net take against the same number of days just before it, with clients, hair average bill and rebooking beside it. The ledger's own figures, so it matches the Ledgers and the Daily Target Sheet.</p></div>
    <span class="dp-tag">Measure does not apply</span></div>
    <div id="daGrowth">${cached ? daGrowthInner(daGrowthData, dpSel()) : '<div class="loading">Loading growth...</div>'}</div></div>`;
}
