/* ══════════════════════════════════════════════════════════════
   COMPARISON: two windows, side by side
   Kate, 24 Sep 2026: "compare stats from a particular time line (eg last mo vs
   this month, or this branch vs this branch in a particular time duration)".

   Each side is its own branch + from/to, so the one page answers both kinds of
   question: the same branch across two periods, or two branches across the same
   period (or any mix of the two). It carries its own controls and does NOT read
   the shared filter bar: the bar holds one branch and one window, and this page
   is by definition two of each.

   Every figure is built by the same loader and aggregator the Pulse uses on its
   daily path (loadDailyRange + the ledger/Phorest staff join -> aggDailyData),
   through the same RANGE_CACHE keys, so a window already opened on the Pulse is
   not fetched twice and the two pages cannot disagree about it. The weekly_totals
   shortcut the Pulse takes on an exact Mon-Sun window is not used here: it
   carries a fraction of the fields, and a comparison with half its rows blank on
   one side is worse than one that is a few seconds slower.

   B is read against A: the delta is B minus A. The presets put the older or
   "reference" window on the left so the deltas read as change.
   ══════════════════════════════════════════════════════════════ */

const CMP_STORE_KEY = 'trsCompareState';
const cmpState = { preset: 'mom', per: false, mode: 'visual', trend: 'net', a: null, b: null };
let cmpSeq = 0; // a newer render supersedes a slower older one

const cmpIso = d => dateToIso(d);
const cmpDay = iso => isoToDate(iso);
const cmpToday = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; };

// Phorest is the revenue feed and runs a day ahead of the ledger, so it is the
// honest "data runs to" line. A preset that ends "today" is capped here, or the
// newer side counts an unsynced day as a day that took nothing while the older
// side got a full one.
function cmpDataEnd() {
  const info = window._freshness && window._freshness.phorestInfo;
  const t = cmpToday();
  if (info && info.date) {
    const d = cmpDay(info.date);
    if (d && d < t) return d;
  }
  return t;
}

const cmpBranchName = code => code === 'all' ? 'All Branches' : (BRANCH_INFO[code]?.name || code);

function cmpRangeText(from, to) {
  if (!from || !to) return '';
  const sameYear = from.getFullYear() === to.getFullYear();
  const thisYear = to.getFullYear() === new Date().getFullYear();
  const y = d => (thisYear && sameYear) ? '' : ' ' + d.getFullYear();
  if (sameDay(from, to)) return `${shortD(from)}${y(from)}`;
  return `${shortD(from)}${sameYear ? '' : ' ' + from.getFullYear()} – ${shortD(to)}${y(to)}`;
}

// ── PRESETS ─────────────────────────────────────────────────
// Each returns {a, b}: {branch, from, to}. Branch-keeping presets reuse whatever
// branch side B currently shows, so switching period does not reset the branch.
function cmpPresets() {
  const end = cmpDataEnd();
  const y = end.getFullYear(), m = end.getMonth(), dd = end.getDate();
  const lastOf = (yy, mm) => new Date(yy, mm + 1, 0).getDate();
  const keepBranch = (cmpState.b && cmpState.b.branch) || 'all';
  const pm = (m + 11) % 12, py = m === 0 ? y - 1 : y;
  const ppm = (m + 10) % 12, ppy = m <= 1 ? y - 1 : y;
  return {
    mom: {
      label: 'This month vs last month',
      hint: 'same days, like for like',
      make: () => ({
        a: { branch: keepBranch, from: new Date(py, pm, 1), to: new Date(py, pm, Math.min(dd, lastOf(py, pm))) },
        b: { branch: keepBranch, from: new Date(y, m, 1),   to: end },
      }),
    },
    mom_full: {
      label: 'Last month (full) vs this month',
      hint: 'use Per day to even it out',
      make: () => ({
        a: { branch: keepBranch, from: new Date(py, pm, 1), to: new Date(py, pm, lastOf(py, pm)) },
        b: { branch: keepBranch, from: new Date(y, m, 1),   to: end },
      }),
    },
    prev2: {
      label: 'Last month vs the month before',
      hint: 'two complete months',
      make: () => ({
        a: { branch: keepBranch, from: new Date(ppy, ppm, 1), to: new Date(ppy, ppm, lastOf(ppy, ppm)) },
        b: { branch: keepBranch, from: new Date(py, pm, 1),   to: new Date(py, pm, lastOf(py, pm)) },
      }),
    },
    yoy: {
      label: 'This year vs last year',
      hint: 'year to date, same days',
      make: () => ({
        a: { branch: keepBranch, from: new Date(y - 1, 0, 1), to: new Date(y - 1, m, Math.min(dd, lastOf(y - 1, m))) },
        b: { branch: keepBranch, from: new Date(y, 0, 1),     to: end },
      }),
    },
    bvb: {
      label: 'Branch vs branch',
      hint: 'same window, two branches',
      make: () => {
        // Keep the window side B already had, so "this branch vs that branch
        // over the period I was just looking at" is one click.
        const from = (cmpState.b && cmpState.b.from) || new Date(y, m, 1);
        const to   = (cmpState.b && cmpState.b.to)   || end;
        const bBr  = keepBranch === 'all' ? 'SAA' : keepBranch;
        const aBr  = ACTIVE_BRANCHES.find(c => c !== bBr) || 'KCA';
        return { a: { branch: aBr, from, to }, b: { branch: bBr, from, to } };
      },
    },
  };
}

function cmpApplyPreset(key) {
  const p = cmpPresets()[key];
  if (!p) return;
  const w = p.make();
  cmpState.preset = key;
  cmpState.a = w.a;
  cmpState.b = w.b;
  // Unequal windows are the only case Per day exists for; switch it on by
  // default there so "full August vs 23 days of September" is fair out of the box.
  cmpState.per = daysBetween(w.a.from, w.a.to) !== daysBetween(w.b.from, w.b.to);
  cmpSave();
  renderCompare();
}

function cmpSave() {
  try {
    localStorage.setItem(CMP_STORE_KEY, JSON.stringify({
      preset: cmpState.preset, per: cmpState.per, mode: cmpState.mode,
      a: cmpState.a && { branch: cmpState.a.branch, from: cmpIso(cmpState.a.from), to: cmpIso(cmpState.a.to) },
      b: cmpState.b && { branch: cmpState.b.branch, from: cmpIso(cmpState.b.from), to: cmpIso(cmpState.b.to) },
    }));
  } catch (e) {}
}

// Presets are re-derived on load rather than restored, because "this month"
// saved last week is not this month any more. Only a custom pick is restored as
// saved dates.
function cmpRestore() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(CMP_STORE_KEY) || 'null'); } catch (e) {}
  if (saved && saved.mode === 'table') cmpState.mode = 'table';
  if (saved && saved.preset === 'custom' && saved.a && saved.b) {
    const side = s => ({ branch: s.branch || 'all', from: cmpDay(s.from), to: cmpDay(s.to) });
    cmpState.preset = 'custom';
    cmpState.a = side(saved.a);
    cmpState.b = side(saved.b);
    cmpState.per = !!saved.per;
    if (cmpState.a.from && cmpState.a.to && cmpState.b.from && cmpState.b.to) return;
  }
  const key = (saved && cmpPresets()[saved.preset]) ? saved.preset : 'mom';
  if (saved && saved.b && saved.b.branch) cmpState.b = { branch: saved.b.branch };
  const w = cmpPresets()[key].make();
  cmpState.preset = key;
  cmpState.a = w.a;
  cmpState.b = w.b;
  cmpState.per = saved && key === saved.preset ? !!saved.per
    : daysBetween(w.a.from, w.a.to) !== daysBetween(w.b.from, w.b.to);
}

// ── ONE SIDE'S SUMMARY ──────────────────────────────────────
async function cmpSummary(side) {
  const { from, to, branch } = side;
  const codes = branch === 'all' ? null : [branch];
  const keep = rows => codes ? rows.filter(r => codes.includes(r.branch)) : rows;
  const key = `daily|${cmpIso(from)}|${cmpIso(to)}`;
  let [dailyRows, branchStaffRows, phorestStaffRows] = await cachedRange(key, () => Promise.all([
    loadDailyRange(from, to),
    loadBranchStaffDailyRange(from, to),
    loadPhorestStaffDailyRange(from, to),
  ]));
  dailyRows = keep(dailyRows); branchStaffRows = keep(branchStaffRows); phorestStaffRows = keep(phorestStaffRows);
  if (!dailyRows.length && !branchStaffRows.length && !phorestStaffRows.length) return null;
  const d = aggDailyData(dailyRows, branchStaffRows, phorestStaffRows);
  if (!d) return null;
  const s = d.summary;

  // Utilisation, the same hours-weighted read as the Pulse. A nice-to-have: a
  // failed fetch leaves the rows blank rather than the page broken.
  try {
    const rows = await loadUtilisationForFilter(from, to, codes || ACTIVE_BRANCHES);
    const u = aggregateUtilisation(rows, buildStaffDeptMap());
    s.hairUtilPct   = u.hairAvail   ? u.hairHours   / u.hairAvail   * 100 : null;
    s.beautyUtilPct = u.beautyAvail ? u.beautyHours / u.beautyAvail * 100 : null;
    const h = u.hairHours + u.beautyHours, a = u.hairAvail + u.beautyAvail;
    s.utilPct = a ? h / a * 100 : null;
  } catch (e) { s.hairUtilPct = s.beautyUtilPct = s.utilPct = null; }

  s._days = daysBetween(from, to);
  // Kept for the pace chart and the by-branch chart, which re-cut the same rows
  // rather than fetching again.
  s._rows = { dailyRows, branchStaffRows, phorestStaffRows };
  return s;
}

// ── THE METRICS ─────────────────────────────────────────────
// kind: 'aed' money total · 'n' count · 'avg' AED average · 'pct' a rate.
// Totals and counts divide by days under Per day; averages and rates never do.
// up: true when a rise is good. target(side) returns that side's standing target
// (the rebooking and treatment bars moved on 1 Sep 2026, so each side is judged
// against the bar that applied to it, not today's).
const CMP_POST_CUTOVER = side => cmpIso(side.to) >= TARGET_CUTOVER_ISO;
function cmpMetrics() {
  const nz = v => (v == null || !Number.isFinite(+v)) ? null : +v;
  const hairTxPct = s => s._phorestOnly ? null : (s.hairServicesIncl ? (s.treatmentSales || 0) / s.hairServicesIncl * 100 : null);
  const retPct    = s => { const svc = (s.netTake || 0) - (s.retailTotal || 0); return svc ? (s.retailTotal || 0) / svc * 100 : null; };
  return [
    { group: 'Revenue' },
    { name: 'Net take',                 kind: 'aed', up: true, get: s => nz(s.netTake), lead: true },
    { name: 'Hair revenue',             sub: 'incl. treatments and courses', kind: 'aed', up: true, get: s => nz(s.hairServicesIncl) },
    { name: 'Hair treatments',          kind: 'aed', up: true, get: s => nz(s.treatmentSales) },
    { name: 'Beauty services',          kind: 'aed', up: true, get: s => nz(s.beautyServicesTotal) },
    { name: 'Retail',                   kind: 'aed', up: true, get: s => nz(s.retailTotal) },
    { group: 'Clients' },
    { name: 'Clients',                  kind: 'n', up: true, get: s => nz(s.totalClients) },
    { name: 'Hair clients',             kind: 'n', up: true, get: s => nz(s.hairTotalClients) },
    { name: 'Beauty clients',           kind: 'n', up: true, get: s => nz(s.beautyTotalClients) },
    { name: 'New clients',              kind: 'n', up: true, get: s => nz(s.newClientsTotal) },
    { name: 'Rebooked',                 kind: 'n', up: true, get: s => nz(s.totalRebooked) },
    { group: 'Averages' },
    { name: 'Avg bill',                 kind: 'avg', up: true, get: s => nz(s.avgBill) },
    { name: 'Hair avg bill',            kind: 'avg', up: true, get: s => nz(s.hairAvgBill), target: () => TARGETS.hairAvgBill },
    { name: 'Beauty avg bill',          kind: 'avg', up: true, get: s => (s.beautyTotalClients ? nz(s.beautyAvgBill) : null), target: () => TARGETS.beautyAvgBill },
    { group: 'Benchmarks' },
    { name: 'NCR %',                    sub: 'hair', kind: 'pct', up: true, get: s => nz(s.hairNcrPct), target: () => 20 },
    { name: 'Rebooking %',              kind: 'pct', up: true, get: s => nz(s.rebookPct), target: side => CMP_POST_CUTOVER(side) ? 70 : 45 },
    { name: 'Treatment %',              sub: 'of hair revenue', kind: 'pct', up: true, get: hairTxPct, target: side => CMP_POST_CUTOVER(side) ? 30 : 20 },
    { name: 'Retail %',                 sub: 'of services', kind: 'pct', up: true, get: retPct, target: () => TARGETS.retailPct },
    { name: 'Hair utilisation %',       kind: 'pct', up: true, get: s => nz(s.hairUtilPct),   target: () => TARGETS.hairUtilPct },
    { name: 'Beauty utilisation %',     kind: 'pct', up: true, get: s => nz(s.beautyUtilPct), target: () => TARGETS.beautyUtilPct },
  ];
}

const cmpFmt = (kind, v, per) => {
  if (v == null) return '—';
  if (kind === 'pct') return v.toFixed(2) + '%';
  if (kind === 'n')   return per ? v.toLocaleString('en-GB', { maximumFractionDigits: 1 }) : Math.round(v).toLocaleString('en-GB');
  return Math.round(v).toLocaleString('en-GB');
};

// ── RENDER ──────────────────────────────────────────────────
async function renderCompare() {
  const host = document.getElementById('compareContent');
  if (!host) return;
  // Opened straight from a link, this can run before loadData() has read the
  // sync dates, and a preset built then would end today instead of on the last
  // synced day. Read Phorest's date ourselves in that case; loadData() replaces
  // it with the same answer moments later.
  if (!window._freshness && typeof getLatestCompleteDate === 'function') {
    try { window._freshness = { phorestInfo: await getLatestCompleteDate('phorest_staff_daily') }; } catch (e) {}
  }
  if (!cmpState.a || !cmpState.b) cmpRestore();
  const seq = ++cmpSeq;

  // Controls paint first and stay put; only the results area shows Loading.
  host.innerHTML = cmpControlsHtml() + `<div id="cmpResults"><div class="loading">Loading both windows…</div></div>`;
  if (typeof sizeTopbar === 'function') sizeTopbar();

  const A = cmpState.a, B = cmpState.b;
  if (!(A.from && A.to && B.from && B.to) || A.from > A.to || B.from > B.to) {
    document.getElementById('cmpResults').innerHTML = lgEmpty('Each side needs a start date on or before its end date.');
    return;
  }

  let sa, sb2;
  try {
    [sa, sb2] = await Promise.all([cmpSummary(A), cmpSummary(B)]);
  } catch (err) {
    if (seq !== cmpSeq) return;
    document.getElementById('cmpResults').innerHTML = lgEmpty(`Failed to load data. ${escapeHtml(err && err.message || '')}`);
    return;
  }
  if (seq !== cmpSeq) return;
  const res = document.getElementById('cmpResults');
  if (!res) return;
  if (!sa && !sb2) { res.innerHTML = lgEmpty('No data on either side for these windows.'); return; }
  const out = cmpResultsHtml(sa, sb2);
  res.innerHTML = cmpAnswerHtml(sa, sb2)
    + `<div id="cmpVisual"${cmpState.mode === 'visual' ? '' : ' hidden'}>${cmpVisualHtml(sa, sb2)}</div>`
    + `<div id="cmpTable"${cmpState.mode === 'table' ? '' : ' hidden'}>${out.table}</div>`;
  cmpDrawCharts(sa, sb2);
  if (typeof sizeTopbar === 'function') sizeTopbar();
}

function cmpSideLabel(side) {
  return `${cmpBranchName(side.branch)} · ${cmpRangeText(side.from, side.to)}`;
}

function cmpControlsHtml() {
  const P = cmpPresets();
  const chips = Object.entries(P).map(([k, p]) =>
    `<button type="button" class="cmp-chip${cmpState.preset === k ? ' on' : ''}" onclick="cmpApplyPreset('${k}')" title="${escapeHtml(p.hint)}">${escapeHtml(p.label)}</button>`
  ).join('') + `<span class="cmp-chip cmp-chip-note${cmpState.preset === 'custom' ? ' on' : ''}">Custom</span>`;

  const branchOpts = cur => ['all', ...ACTIVE_BRANCHES].map(c =>
    `<option value="${c}"${c === cur ? ' selected' : ''}>${escapeHtml(cmpBranchName(c))}</option>`).join('');
  const maxIso = cmpIso(cmpToday());
  const side = (key, label, s) => `
    <div class="cmp-side cmp-side-${key}">
      <div class="cmp-side-k"><span class="cmp-tag cmp-tag-${key}">${label}</span> ${daysBetween(s.from, s.to) || 0} days</div>
      <label class="cmp-f"><span>Branch</span>
        <select onchange="cmpSet('${key}','branch',this.value)">${branchOpts(s.branch)}</select></label>
      <div class="cmp-dates">
        <label class="cmp-f"><span>From</span>
          <input type="date" value="${s.from ? cmpIso(s.from) : ''}" min="${PERIOD_FIRST_YEAR}-01-01" max="${maxIso}" onchange="cmpSet('${key}','from',this.value)"></label>
        <label class="cmp-f"><span>To</span>
          <input type="date" value="${s.to ? cmpIso(s.to) : ''}" min="${PERIOD_FIRST_YEAR}-01-01" max="${maxIso}" onchange="cmpSet('${key}','to',this.value)"></label>
      </div>
    </div>`;

  const unequal = cmpState.a.from && cmpState.b.from &&
    daysBetween(cmpState.a.from, cmpState.a.to) !== daysBetween(cmpState.b.from, cmpState.b.to);

  return `
    <div class="lg-head">
      <div class="lg-head-k cmp-k">Comparison
        <span class="cmp-mode" role="group" aria-label="Show as">
          <button type="button" data-mode="visual" class="${cmpState.mode === 'visual' ? 'on' : ''}" onclick="cmpSetMode('visual')">Visual</button>
          <button type="button" data-mode="table" class="${cmpState.mode === 'table' ? 'on' : ''}" onclick="cmpSetMode('table')">Table</button>
        </span>
      </div>
      <h1>Two windows, side by side</h1>
      <p class="lg-stand">Pick a branch and dates for each side. Same branch across two periods, two branches over one period, or any mix. B is read against A, so the change column is B minus A.</p>
    </div>
    <div class="cmp-presets">${chips}</div>
    <div class="cmp-sides">
      ${side('a', 'A', cmpState.a)}
      <button type="button" class="cmp-swap" onclick="cmpSwap()" title="Swap A and B" aria-label="Swap A and B">⇄</button>
      ${side('b', 'B', cmpState.b)}
    </div>
    <div class="cmp-opts">
      <label class="cmp-check${unequal ? '' : ' dim'}">
        <input type="checkbox" ${cmpState.per ? 'checked' : ''} ${unequal ? '' : 'disabled'} onchange="cmpSetPer(this.checked)">
        Per day <small>${unequal ? 'the two windows are different lengths: totals and counts are divided by days' : 'both windows are the same length'}</small>
      </label>
    </div>`;
}

function cmpSet(key, field, value) {
  const s = cmpState[key];
  if (field === 'branch') s.branch = value;
  else { const d = cmpDay(value); if (!d) return; s[field] = d; }
  cmpState.preset = 'custom';
  cmpSave();
  renderCompare();
}
function cmpSetPer(on) { cmpState.per = !!on; cmpSave(); renderCompare(); }
function cmpSwap() {
  const t = cmpState.a; cmpState.a = cmpState.b; cmpState.b = t;
  cmpState.preset = 'custom';
  cmpSave();
  renderCompare();
}

function cmpResultsHtml(sa, sb2) {
  const A = cmpState.a, B = cmpState.b;
  const daysA = daysBetween(A.from, A.to), daysB = daysBetween(B.from, B.to);
  const per = cmpState.per && daysA !== daysB;
  const scale = (kind, v, days) => (v == null) ? null : (per && (kind === 'aed' || kind === 'n') ? v / days : v);

  const rows = [];
  const movers = [];
  cmpMetrics().forEach(m => {
    if (m.group) { rows.push(`<tr class="lg-grp"><td colspan="5"><span class="lg-grp-t">${m.group}${per && m.group !== 'Averages' && m.group !== 'Benchmarks' ? ' · per day' : ''}</span></td></tr>`); return; }
    const va = sa ? scale(m.kind, m.get(sa), daysA) : null;
    const vb = sb2 ? scale(m.kind, m.get(sb2), daysB) : null;
    // A row that is blank on both sides says nothing (beauty at Motor City vs
    // Motor City); one blank side stays, so the gap itself is visible.
    if (va == null && vb == null) return;

    const tA = m.target ? m.target(A) : null, tB = m.target ? m.target(B) : null;
    const hit = (v, t) => (v == null || t == null) ? '' : (v >= t ? ' cmp-hit' : ' cmp-miss');
    const tgtNote = (t, v) => (t == null || v == null) ? '' :
      `<small class="cmp-tgt">${m.kind === 'pct' ? t + '%' : 'AED ' + t}</small>`;

    let dAbs = '', dRel = '', cls = 'flat', bar = '';
    if (va != null && vb != null) {
      const diff = vb - va;
      const good = m.up ? diff > 0 : diff < 0;
      const eps = m.kind === 'pct' ? 0.005 : 0.5;
      cls = Math.abs(diff) < eps ? 'flat' : (good ? 'up' : 'down');
      const sign = diff > 0 ? '+' : diff < 0 ? '−' : '';
      if (m.kind === 'pct') {
        dAbs = `${sign}${Math.abs(diff).toFixed(2)} pts`;
        dRel = '';
      } else {
        dAbs = sign + cmpFmt(m.kind, Math.abs(diff), per);
        if (va) {
          const rel = diff / Math.abs(va) * 100;
          dRel = `${rel > 0 ? '+' : rel < 0 ? '−' : ''}${Math.abs(rel).toFixed(1)}%`;
          movers.push({ name: m.name, rel, good, lead: m.lead });
          const w = Math.min(50, Math.abs(rel) / 2);
          bar = `<span class="cmp-bar"><span class="cmp-bar-f ${cls}" style="${rel >= 0 ? 'left:50%' : `left:${50 - w}%`};width:${w}%"></span></span>`;
        }
      }
    }
    rows.push(`<tr class="${m.lead ? 'lg-tot' : ''}">
      <td>${escapeHtml(m.name)}${m.sub ? ` <small class="cmp-sub">${escapeHtml(m.sub)}</small>` : ''}</td>
      <td class="r${hit(va, tA)}">${cmpFmt(m.kind, va, per)}${tgtNote(tA, va)}</td>
      <td class="r${hit(vb, tB)}">${cmpFmt(m.kind, vb, per)}${tgtNote(tB, vb)}</td>
      <td class="r cmp-d ${cls}">${dAbs}</td>
      <td class="r cmp-d ${cls}"><span class="cmp-rel">${dRel}</span>${bar}</td>
    </tr>`);
  });

  // The read: net take first, then the biggest move each way among the totals.
  const lead = movers.find(x => x.lead);
  const rest = movers.filter(x => !x.lead && Number.isFinite(x.rel));
  const best  = rest.filter(x => x.rel > 0).sort((a, b) => b.rel - a.rel)[0];
  const worst = rest.filter(x => x.rel < 0).sort((a, b) => a.rel - b.rel)[0];
  const pctTxt = r => `${Math.abs(r).toFixed(1)}%`;
  let read = '';
  if (lead && sa && sb2) {
    const na = scale('aed', sa.netTake, daysA), nb = scale('aed', sb2.netTake, daysB);
    const unit = per ? ' a day' : '';
    read = Math.abs(lead.rel) < 0.05
      ? `Net take is level: AED ${cmpFmt('aed', nb)}${unit} on both sides.`
      : `B took AED ${cmpFmt('aed', nb)}${unit} against A's AED ${cmpFmt('aed', na)}, <b class="${lead.rel > 0 ? 'up' : 'down'}">${lead.rel > 0 ? 'up' : 'down'} ${pctTxt(lead.rel)}</b>.`;
    const bits = [];
    if (best)  bits.push(`biggest rise is ${escapeHtml(best.name.toLowerCase())} (+${pctTxt(best.rel)})`);
    if (worst) bits.push(`biggest drop is ${escapeHtml(worst.name.toLowerCase())} (−${pctTxt(worst.rel)})`);
    if (bits.length) read += ` The ${bits.join(', and the ')}.`;
  } else {
    read = `${!sa ? 'A' : 'B'} has no data for its window, so there is nothing to read it against.`;
  }

  const coverNote = s => (s && s._phorestOnly)
    ? ' <span class="cmp-warn" title="The ledger does not cover enough of this window, so NCR, rebooking and treatment figures are unknown rather than zero.">Phorest only</span>' : '';

  return { read: `<p class="cmp-read">${read}</p>`, table: `
    <div class="lg-sx"><div class="lg-wrap"><table class="lg tabular cmp-table">
      <thead><tr>
        <th>Metric</th>
        <th class="r"><span class="cmp-tag cmp-tag-a">A</span><span class="cmp-th">${escapeHtml(cmpSideLabel(A))}</span>${coverNote(sa)}</th>
        <th class="r"><span class="cmp-tag cmp-tag-b">B</span><span class="cmp-th">${escapeHtml(cmpSideLabel(B))}</span>${coverNote(sb2)}</th>
        <th class="r">Change</th>
        <th class="r" style="width:170px">%</th>
      </tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table></div></div>
    <div class="fine">
      <p><b>How to read it</b>. Money is AED, ex VAT, takings before staff cost. Rates move in <b>points</b>, not percent: 20% to 32% is +12 pts. Green and red mark whether the move is good, not just its direction. A figure in green or red type is against that side's own standing target, shown small beneath it; the rebooking and treatment bars rose on 1 Sep 2026, so a window before then is judged against the old bar.</p>
      <p><b>Where it comes from</b>. The same ledger and Phorest join the Organisation Pulse reads, one window per side. Presets that end today stop at the last day Phorest has synced, so the newer side is never counting an unsynced day as a day that took nothing.</p>
    </div>` };
}

/* ══════════════════════════════════════════════════════════════
   THE VISUAL
   Kate, 24 Sep 2026, third pass. Built to the adult-learning rules the rest of
   the TRS material follows: the answer first, one idea per card, a plain "what
   is this" line on every card, pass/fail in the same two colours everywhere,
   and the full detail one click away (the Table button) rather than on screen.

     1  The answer     one sentence, then three cards: win, drop, fix first
     2  Money, Clients mirrored like the Pulse's Client Funnel: A left, B right
     3  Targets        each rate against its own side's target
     4  Pace           is B ahead of A at the same point in its window
     5  By branch      only when both sides are All Branches

   A is the pale shade, B the strong one, on every card and chart. Only the
   change chips and target results use green and red.
   ══════════════════════════════════════════════════════════════ */
let cmpCharts = {};
function cmpDestroy() {
  Object.values(cmpCharts).forEach(c => { try { c.destroy(); } catch (e) {} });
  cmpCharts = {};
}

// Totals and counts under Per day, the same rule the table uses.
function cmpScaler() {
  const A = cmpState.a, B = cmpState.b;
  const dA = daysBetween(A.from, A.to), dB = daysBetween(B.from, B.to);
  const per = cmpState.per && dA !== dB;
  return { per, dA, dB, sc: (kind, v, days) => (v == null) ? null : (per && (kind === 'aed' || kind === 'n') ? v / days : v) };
}

function cmpDeltaChip(va, vb, kind, up) {
  if (va == null || vb == null) return '<span class="cmp-chip-d flat">no comparison</span>';
  const diff = vb - va;
  const good = up ? diff > 0 : diff < 0;
  const flat = kind === 'pct' ? Math.abs(diff) < 0.05 : (va ? Math.abs(diff / va) < 0.0005 : diff === 0);
  const cls = flat ? 'flat' : (good ? 'up' : 'down');
  const arrow = flat ? '→' : diff > 0 ? '↑' : '↓';
  const txt = kind === 'pct'
    ? `${Math.abs(diff).toFixed(1)} pts`
    : (va ? `${Math.abs(diff / Math.abs(va) * 100).toFixed(1)}%` : 'new');
  return `<span class="cmp-chip-d ${cls}">${arrow} ${txt}</span>`;
}

const cmpMetricMap = () => {
  const M = {};
  cmpMetrics().forEach(m => { if (!m.group) M[m.name] = m; });
  return M;
};
const cmpShortSide = side => `${cmpBranchName(side.branch)}, ${cmpRangeText(side.from, side.to)}`;
const cmpAxisK = v => v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? Math.round(v / 1e3) + 'k' : v;
const cmpCardHead = (title, what) =>
  `<div class="cmp-h">${title}</div><p class="cmp-what">${what}</p>`;

// ── 1 · THE ANSWER ──────────────────────────────────────────
// Level 1 of the page: readable in ten seconds, and it ends on one thing to do.
function cmpAnswerHtml(sa, sb2) {
  const A = cmpState.a, B = cmpState.b;
  const { per, dA, dB, sc } = cmpScaler();
  if (!sa || !sb2) {
    return `<div class="cmp-answer"><div class="cmp-ans-h">${!sa ? 'A' : 'B'} has no data for its dates.</div>
      <p class="cmp-ans-sub">Pick a window the ledger or Phorest covers and the comparison fills in.</p></div>`;
  }
  const M = cmpMetricMap();
  const na = sc('aed', sa.netTake, dA), nb = sc('aed', sb2.netTake, dB);
  const rel = na ? (nb - na) / na * 100 : 0;
  const dir = Math.abs(rel) < 0.05 ? 'level' : rel > 0 ? 'up' : 'down';
  const unit = per ? ' a day' : '';
  const headline = dir === 'level'
    ? 'Net take is level.'
    : `Net take is <em class="${dir}">${dir} ${Math.abs(rel).toFixed(1)}%</em>.`;
  const sameLen = dA === dB;
  const sub = `AED ${cmpFmt('aed', nb)}${unit} in B against AED ${cmpFmt('aed', na)}${unit} in A`
    + (sameLen ? `, ${dA} days each.` : per ? `, per day because the windows are different lengths.` : `. The windows are different lengths: tick Per day to even them out.`);

  // Movers among totals and counts only: a rate's change is in points and
  // does not rank against a percentage change.
  const movers = cmpMetrics().filter(m => !m.group && (m.kind === 'aed' || m.kind === 'n' || m.kind === 'avg') && !m.lead)
    .map(m => {
      const va = sc(m.kind, m.get(sa), dA), vb = sc(m.kind, m.get(sb2), dB);
      return (va && vb != null) ? { m, va, vb, rel: (vb - va) / Math.abs(va) * 100 } : null;
    }).filter(Boolean);
  const win  = movers.filter(x => x.rel > 0).sort((a, b) => b.rel - a.rel)[0];
  const drop = movers.filter(x => x.rel < 0).sort((a, b) => a.rel - b.rel)[0];

  // Fix first: B's rates below their own target, Treatment and Retail first
  // (the standing priority, same rule as the Pulse headline), else the worst gap.
  const scored = ['Treatment %', 'Retail %', 'Rebooking %', 'NCR %', 'Hair avg bill', 'Beauty avg bill']
    .map(n => M[n]).map(m => {
      const v = m.get(sb2), t = m.target ? m.target(B) : null;
      return (v == null || t == null) ? null : { m, v, t, att: v / t };
    }).filter(Boolean);
  const below = scored.filter(x => x.att < 1);
  const fix = below.find(x => x.m.name === 'Treatment %' || x.m.name === 'Retail %')
    || below.sort((a, b) => a.att - b.att)[0] || null;

  const fmtV = (m, v) => (m.kind === 'aed' || m.kind === 'avg' ? 'AED ' : '') + cmpFmt(m.kind, v, per);
  const card = (cls, k, big, small) => `
    <div class="cmp-ans-card ${cls}">
      <div class="cmp-ans-k">${k}</div>
      <div class="cmp-ans-big">${big}</div>
      <div class="cmp-ans-small">${small}</div>
    </div>`;
  const nm = m => escapeHtml(m.name.replace(/ %$/, ''));
  const cards = [
    win  ? card('good', 'Biggest win', `${nm(win.m)} <span>+${win.rel.toFixed(1)}%</span>`,
             `${fmtV(win.m, win.vb)} in B, up from ${fmtV(win.m, win.va)}.`)
         : card('flat', 'Biggest win', 'Nothing rose', 'Every total is level or down on A.'),
    drop ? card('bad', 'Biggest drop', `${nm(drop.m)} <span>−${Math.abs(drop.rel).toFixed(1)}%</span>`,
             `${fmtV(drop.m, drop.vb)} in B, down from ${fmtV(drop.m, drop.va)}.`)
         : card('flat', 'Biggest drop', 'Nothing fell', 'Every total is level or up on A.'),
    fix  ? card('warn', 'Fix first', `${nm(fix.m)} <span>${fix.m.kind === 'pct' ? fix.v.toFixed(2) + '%' : 'AED ' + Math.round(fix.v)}</span>`,
             `Target ${fix.m.kind === 'pct' ? fix.t + '%' : 'AED ' + fix.t}. ${fix.m.name === 'Treatment %' || fix.m.name === 'Retail %' ? 'Standing priority, so it comes first.' : 'Furthest below its target in B.'}`)
         : card('good', 'Fix first', 'Nothing', 'B hits every target it is scored on.'),
  ].join('');

  return `
    <div class="cmp-answer">
      <div class="cmp-ans-k0">The answer</div>
      <div class="cmp-ans-h">${headline}</div>
      <p class="cmp-ans-sub">${sub}</p>
      <div class="cmp-ans-cards">${cards}</div>
    </div>`;
}

// ── 2 · MIRRORED (Client Funnel style) ──────────────────────
// One scale per card, the largest figure on either side, so the rows taper
// like the Pulse's funnel and a bar can be read against the bar opposite it.
function cmpMirrorHtml(title, what, names, sa, sb2) {
  const A = cmpState.a, B = cmpState.b;
  const { per, dA, dB, sc } = cmpScaler();
  const M = cmpMetricMap();
  const rows = names.map(n => M[n]).map(m => ({
    m, va: sa ? sc(m.kind, m.get(sa), dA) : null, vb: sb2 ? sc(m.kind, m.get(sb2), dB) : null,
  })).filter(r => r.va != null || r.vb != null);
  if (!rows.length) return '';
  const max = Math.max(...rows.map(r => Math.max(r.va || 0, r.vb || 0))) || 1;
  const w = v => (v == null || v <= 0) ? 0 : Math.min(100, Math.max(4, v / max * 100));
  const txt = (m, v) => v == null ? '—' : cmpFmt(m.kind, v, per);
  return `
    <div class="cmp-card">
      ${cmpCardHead(title, what)}
      <div class="cmp-f-head">
        <span class="a">◂ A <small>${escapeHtml(cmpRangeText(A.from, A.to))}</small></span>
        <span class="b"><small>${escapeHtml(cmpRangeText(B.from, B.to))}</small> B ▸</span>
      </div>
      ${rows.map(r => `
        <div class="cmp-f-row">
          <div class="cmp-f-side l">
            <span class="cmp-f-v tabular">${txt(r.m, r.va)}</span>
            <span class="cmp-f-bar a" style="width:${w(r.va).toFixed(1)}%"></span>
          </div>
          <div class="cmp-f-mid">
            <span class="cmp-f-n">${escapeHtml(r.m.name)}</span>
            ${cmpDeltaChip(r.va, r.vb, r.m.kind, r.m.up)}
          </div>
          <div class="cmp-f-side r">
            <span class="cmp-f-bar b" style="width:${w(r.vb).toFixed(1)}%"></span>
            <span class="cmp-f-v tabular">${txt(r.m, r.vb)}</span>
          </div>
        </div>`).join('')}
    </div>`;
}

// ── 3 · PERFORMANCE OVER TIME ───────────────────────────────
// Kate, 24 Sep 2026: the Against target card folded into Pace. One chart,
// one metric at a time, picked from the chips above it: Net take runs as a
// running total, the rates and average bills as their running value so far
// (Treatment % on day 9 is treatment AED over hair revenue for days 1 to 9).
// A dashed amber line is the target, one per side when the two sides were
// judged against different bars. The strip under the chips carries the
// window's own figures, which are the ones every other card on the page uses.
//
// num/den name the per-day parts summed into the running value. A day whose
// numerator is unknown (a Phorest-only day has no ledger treatment or rebook
// figure) is left out of both, so it cannot drag the rate towards zero.
const CMP_TRENDS = [
  { key: 'net',    label: 'Net take',        metric: 'Net take' },
  { key: 'tx',     label: 'Treatment',       metric: 'Treatment %',     num: 'tx',       den: 'hairRev',       pct: true },
  { key: 'ret',    label: 'Retail',          metric: 'Retail %',        num: 'retail',   den: 'svc',           pct: true },
  { key: 'rebook', label: 'Rebooking',       metric: 'Rebooking %',     num: 'rebooked', den: 'rebookDen',       pct: true },
  { key: 'ncr',    label: 'NCR',             metric: 'NCR %',           num: 'hairNcr',  den: 'ncrDen',   pct: true },
  { key: 'hab',    label: 'Hair avg bill',   metric: 'Hair avg bill',   num: 'hairRev',  den: 'hairClients' },
  { key: 'bab',    label: 'Beauty avg bill', metric: 'Beauty avg bill', num: 'beautyRev', den: 'beautyClients' },
];
let cmpLast = null; // { sa, sb2, serA, serB } for redrawing one chart on a chip click

function cmpTrendDef() {
  return CMP_TRENDS.find(t => t.key === cmpState.trend) || CMP_TRENDS[0];
}

function cmpTrendChipsHtml(sa, sb2) {
  const B = cmpState.b;
  const M = cmpMetricMap();
  return CMP_TRENDS.map(t => {
    const m = M[t.metric];
    const vb = sb2 ? m.get(sb2) : null, va = sa ? m.get(sa) : null;
    if (va == null && vb == null) return '';
    // The dot is B against its own target, so the row of chips doubles as a
    // scorecard: you can see which ones are red before clicking any of them.
    const tB = m.target ? m.target(B) : null;
    const dot = (tB == null || vb == null) ? '' : `<i class="${vb >= tB ? 'hit' : 'miss'}"></i>`;
    return `<button type="button" class="cmp-tchip${cmpState.trend === t.key ? ' on' : ''}" data-trend="${t.key}" onclick="cmpSetTrend('${t.key}')">${dot}${escapeHtml(t.label)}</button>`;
  }).join('');
}

function cmpTrendStripHtml(sa, sb2) {
  const A = cmpState.a, B = cmpState.b;
  const t = cmpTrendDef();
  const m = cmpMetricMap()[t.metric];
  const va = sa ? m.get(sa) : null, vb = sb2 ? m.get(sb2) : null;
  const fmt = v => v == null ? '—' : (m.kind === 'pct' ? v.toFixed(2) + '%' : 'AED ' + cmpFmt(m.kind === 'avg' ? 'avg' : 'aed', v));
  const tA = m.target ? m.target(A) : null, tB = m.target ? m.target(B) : null;
  const tf = x => m.kind === 'pct' ? x + '%' : 'AED ' + x;
  const res = (v, tt) => (tt == null || v == null) ? '' : `<span class="cmp-res ${v >= tt ? 'hit' : 'miss'}">${v >= tt ? 'Hit' : 'Below'} ${tf(tt)}</span>`;
  const stat = (lbl, cls, v, tt) => `
    <div class="cmp-stat">
      <span class="cmp-stat-k"><i class="${cls}"></i>${lbl}</span>
      <span class="cmp-stat-v tabular">${fmt(v)}</span>
      ${res(v, tt)}
    </div>`;
  return `${stat('A', 'a', va, tA)}${stat('B', 'b', vb, tB)}
    <div class="cmp-stat"><span class="cmp-stat-k">Change</span>${cmpDeltaChip(va, vb, m.kind, m.up)}</div>`;
}

function cmpTrendWhat() {
  const t = cmpTrendDef();
  if (t.key === 'net') return 'Net take added up day by day. If B\'s line is above A\'s, B is ahead at that point in its window.';
  return `${t.label}${t.pct ? ' %' : ''} so far, day by day. The dashed amber line is the target: above it is a hit.`;
}

function cmpSetTrend(key) {
  cmpState.trend = key;
  document.querySelectorAll('.cmp-tchip').forEach(b => b.classList.toggle('on', b.dataset.trend === key));
  if (!cmpLast) return;
  const strip = document.getElementById('cmpTrendStrip');
  if (strip) strip.innerHTML = cmpTrendStripHtml(cmpLast.sa, cmpLast.sb2);
  const what = document.getElementById('cmpTrendWhat');
  if (what) what.textContent = cmpTrendWhat();
  cmpDrawTrend();
}

// The per-day parts CMP_TRENDS sums, built one branch-day at a time. Money and
// client counts come from every branch-day. The ledger-only parts (treatment,
// rebooked, NCR and the denominators they are read against) come only from
// branch-days the ledger actually covers, the same rule aggDailyData applies
// to a whole window, so the line ends on the figure the strip shows. null
// where no branch that day is ledger-covered.
function cmpDayParts(branchDays) {
  const known = v => (v == null || !Number.isFinite(+v)) ? 0 : +v;
  const p = { net: 0, hairRev: 0, retail: 0, svc: 0, clients: 0, hairClients: 0, beautyRev: 0, beautyClients: 0,
              tx: null, rebooked: null, rebookDen: 0, hairNcr: null, ncrDen: 0 };
  branchDays.forEach(({ s, covered }) => {
    p.net += known(s.netTake); p.hairRev += known(s.hairServicesIncl);
    p.retail += known(s.retailTotal); p.svc += known(s.netTake) - known(s.retailTotal);
    p.clients += known(s.totalClients); p.hairClients += known(s.hairTotalClients);
    p.beautyRev += known(s.beautyServicesTotal); p.beautyClients += known(s.beautyTotalClients);
    if (!covered || s._phorestOnly) return;
    // Treatment is read over ALL hair revenue, covered or not, because that is
    // how the Pulse and the window figure read it (hairTreatmentPctDept): a day
    // whose ledger has not synced adds hair revenue and no treatments.
    p.tx = (p.tx || 0) + known(s.treatmentSales);
    p.rebooked = (p.rebooked || 0) + known(s.totalRebooked); p.rebookDen += known(s.totalClients);
    p.hairNcr = (p.hairNcr || 0) + known(s.hairNCR); p.ncrDen += known(s.hairTotalClients);
  });
  return p;
}

// The running value of the chosen metric for one side, one point per day.
function cmpTrendValues(ser, t) {
  let num = 0, den = 0;
  return ser.map(r => {
    const p = r.parts;
    if (t.key === 'net') { num += p ? p.net : 0; return num; }
    if (p && (p[t.num] != null || t.key === 'tx')) { num += p[t.num] || 0; den += p[t.den] || 0; }
    return den ? num / den * (t.pct ? 100 : 1) : null;
  });
}

function cmpDrawTrend() {
  if (!cmpLast || typeof Chart === 'undefined') return;
  if (cmpCharts.cmpPace) { try { cmpCharts.cmpPace.destroy(); } catch (e) {} delete cmpCharts.cmpPace; }
  const el = document.getElementById('cmpPace');
  if (!el) return;
  const P = cmpChartStyle();
  const A = cmpState.a, B = cmpState.b;
  const t = cmpTrendDef();
  const m = cmpMetricMap()[t.metric];
  const { serA, serB } = cmpLast;
  const n = Math.max(serA.length, serB.length);
  const labels = Array.from({ length: n }, (_, i) => 'Day ' + (i + 1));
  const valFmt = v => v == null ? '—' : t.key === 'net' ? 'AED ' + Math.round(v).toLocaleString('en-GB')
    : t.pct ? v.toFixed(2) + '%' : 'AED ' + Math.round(v);
  const line = (label, data, color, extra) => Object.assign({
    label, data, borderColor: color, backgroundColor: color, borderWidth: 3,
    pointRadius: 0, pointHoverRadius: 4, tension: 0.25, spanGaps: true,
  }, extra || {});
  const datasets = [
    line('A', cmpTrendValues(serA, t), P.colA),
    line('B', cmpTrendValues(serB, t), P.colB),
  ];
  if (m.target) {
    const tA = m.target(A), tB = m.target(B);
    const flat = v => Array.from({ length: n }, () => v);
    const dash = { borderDash: [6, 5], borderWidth: 2, pointHoverRadius: 0, tension: 0 };
    if (tA === tB) datasets.push(line('Target', flat(tB), P.warn, dash));
    else {
      datasets.push(line('Target A', flat(tA), P.warnSoft, dash));
      datasets.push(line('Target B', flat(tB), P.warn, dash));
    }
  }
  cmpCharts.cmpPace = new Chart(el, {
    type: 'line',
    data: { labels, datasets },
    options: Object.assign(P.base(), {
      plugins: { legend: { display: false }, tooltip: Object.assign({}, P.tip, { callbacks: {
        label: c => {
          if (c.dataset.label.startsWith('Target')) return ` ${c.dataset.label}: ${valFmt(c.parsed.y)}`;
          const r = (c.datasetIndex === 0 ? serA : serB)[c.dataIndex];
          return r ? ` ${c.dataset.label} ${shortD(r.date)}: ${valFmt(c.parsed.y)}${t.key === 'net' ? ' so far' : ''}` : '';
        },
      } }) },
      scales: {
        x: P.axis({ grid: { display: false }, ticks: { color: P.tick, font: P.font, maxTicksLimit: 8, autoSkip: true } }),
        y: P.axis({
          beginAtZero: t.key === 'net',
          ticks: { color: P.tick, font: P.font,
            callback: v => t.key === 'net' ? cmpAxisK(v) : t.pct ? v + '%' : 'AED ' + v },
        }),
      },
    }),
  });
}

function cmpVisualHtml(sa, sb2) {
  const A = cmpState.a, B = cmpState.b;
  const { per } = cmpScaler();
  const both = A.branch === 'all' && B.branch === 'all';
  const perTxt = per ? ' Per day, because the windows are different lengths.' : '';
  return `
    <div class="cmp-key"><span><i class="a"></i><b>A</b> ${escapeHtml(cmpShortSide(A))}</span><span><i class="b"></i><b>B</b> ${escapeHtml(cmpShortSide(B))}</span></div>
    <div class="cmp-two">
      ${cmpMirrorHtml('Money', 'Where the takings came from, in AED ex VAT.' + perTxt,
        ['Net take', 'Hair revenue', 'Hair treatments', 'Beauty services', 'Retail'], sa, sb2)}
      ${cmpMirrorHtml('Clients', 'Who came through the door.' + perTxt,
        ['Clients', 'Hair clients', 'Beauty clients', 'Rebooked', 'New clients'], sa, sb2)}
    </div>
    <div class="cmp-card cmp-trend">
      <div class="cmp-h">Performance over time</div>
      <p class="cmp-what" id="cmpTrendWhat">${cmpTrendWhat()}</p>
      <div class="cmp-tchips" role="group" aria-label="Show">${cmpTrendChipsHtml(sa, sb2)}</div>
      <div class="cmp-strip" id="cmpTrendStrip">${cmpTrendStripHtml(sa, sb2)}</div>
      <div class="cmp-chart"><canvas id="cmpPace"></canvas></div>
      <p class="cmp-foot">The dot on each chip is B against its target: green hit, red below.</p>
    </div>
    ${both ? `
    <div class="cmp-card">
      ${cmpCardHead('By branch', `Net take per branch${per ? ' per day' : ''}. The change is under each name.`)}
      <div class="cmp-chart"><canvas id="cmpBranch"></canvas></div>
    </div>` : ''}`;
}

// One day's figures per date across the window, closed or unsynced days empty
// so a running total flattens there instead of the line skipping a day.
function cmpDailySeries(s, side) {
  const out = [];
  if (!s || !s._rows) return out;
  const group = (rows, key) => {
    const g = {};
    (rows || []).forEach(r => { const k = key(r); (g[k] = g[k] || []).push(r); });
    return g;
  };
  const key = r => r.date + '|' + r.branch;
  const gd = group(s._rows.dailyRows, key), gb = group(s._rows.branchStaffRows, key), gp = group(s._rows.phorestStaffRows, key);
  const codes = [...new Set([].concat(s._rows.dailyRows, s._rows.branchStaffRows, s._rows.phorestStaffRows).map(r => r.branch))];
  for (let d = new Date(side.from); d <= side.to; d.setDate(d.getDate() + 1)) {
    const iso = cmpIso(d);
    const branchDays = codes.map(c => {
      const k = iso + '|' + c;
      if (!gd[k] && !gb[k] && !gp[k]) return null;
      const agg = aggDailyData(gd[k] || [], gb[k] || [], gp[k] || []);
      if (!agg) return null;
      const covered = (gb[k] || []).reduce((a, r) => a + (Number(r.total) || 0), 0) > 0;
      return { s: agg.summary, covered };
    }).filter(Boolean);
    out.push({ date: new Date(d), parts: branchDays.length ? cmpDayParts(branchDays) : null });
  }
  return out;
}

// Shared chart styling. Colours are read from the same CSS tokens the mirrored
// bars use, so a chart and a bar can never show A in two different shades.
function cmpChartStyle() {
  const dark = (typeof isDark === 'function') ? isDark() : false;
  const css = getComputedStyle(document.documentElement);
  const tick = dark ? 'rgba(250,248,243,0.55)' : '#77706A';
  const grid = dark ? 'rgba(250,248,243,0.07)' : 'rgba(26,26,26,0.07)';
  const font = { family: 'Inter', size: 13 };
  return {
    colA: css.getPropertyValue('--cmp-a').trim() || '#CDBFF0',
    colB: css.getPropertyValue('--cmp-b').trim() || '#7C5CD4',
    warn: css.getPropertyValue('--warn').trim() || '#BA7517',
    warnSoft: 'rgba(186,117,23,0.4)',
    tick, grid, font,
    tip: {
      backgroundColor: dark ? '#383944' : '#fff', titleColor: dark ? '#FAF8F3' : '#1A1A1A',
      bodyColor: dark ? 'rgba(250,248,243,0.75)' : '#565049', borderColor: dark ? 'rgba(250,248,243,0.12)' : '#E8E2D6',
      borderWidth: 1, padding: 10, cornerRadius: 8, displayColors: true,
    },
    axis: extra => Object.assign({ ticks: { color: tick, font }, grid: { color: grid }, border: { display: false } }, extra || {}),
    base: () => ({ responsive: true, maintainAspectRatio: false, interaction: { intersect: false, mode: 'index' } }),
  };
}

function cmpDrawCharts(sa, sb2) {
  cmpDestroy();
  if (typeof Chart === 'undefined') return;
  const A = cmpState.a, B = cmpState.b;
  cmpLast = { sa, sb2, serA: cmpDailySeries(sa, A), serB: cmpDailySeries(sb2, B) };
  cmpDrawTrend();

  // ── BY BRANCH ── re-cuts the rows each side already holds, no refetch.
  const el = document.getElementById('cmpBranch');
  if (!el) return;
  const P = cmpChartStyle();
  const { dA, dB, sc } = cmpScaler();
  const aed = v => 'AED ' + Math.round(v || 0).toLocaleString('en-GB');
  const cut = (s, code) => {
    if (!s || !s._rows) return null;
    const f = rows => (rows || []).filter(r => r.branch === code);
    const d = aggDailyData(f(s._rows.dailyRows), f(s._rows.branchStaffRows), f(s._rows.phorestStaffRows));
    return d ? (d.summary.netTake || 0) : null;
  };
  const va = ACTIVE_BRANCHES.map(c => sc('aed', cut(sa, c), dA));
  const vb = ACTIVE_BRANCHES.map(c => sc('aed', cut(sb2, c), dB));
  const labels = ACTIVE_BRANCHES.map((c, i) => {
    const r = va[i] ? (vb[i] - va[i]) / va[i] * 100 : null;
    return [cmpBranchName(c), r == null ? '' : `${r >= 0 ? '↑' : '↓'} ${Math.abs(r).toFixed(1)}%`];
  });
  cmpCharts.cmpBranch = new Chart(el, {
    type: 'bar',
    data: { labels, datasets: [
      { label: 'A', data: va, backgroundColor: P.colA, borderRadius: 6, maxBarThickness: 44 },
      { label: 'B', data: vb, backgroundColor: P.colB, borderRadius: 6, maxBarThickness: 44 },
    ] },
    options: Object.assign(P.base(), {
      plugins: { legend: { display: false }, tooltip: Object.assign({}, P.tip, { callbacks: {
        title: items => items.length ? [].concat(items[0].label).join(' ') : '',
        label: c => ` ${c.datasetIndex === 0 ? 'A' : 'B'}: ${aed(c.parsed.y)}`,
      } }) },
      scales: { x: P.axis({ grid: { display: false } }), y: P.axis({ ticks: { color: P.tick, font: P.font, callback: cmpAxisK } }) },
    }),
  });
}

// Called by toggleTheme(): the chart colours are read at draw time.
function cmpRedrawForTheme() {
  const view = document.getElementById('view-compare');
  if (!view || view.style.display === 'none' || !Object.keys(cmpCharts).length) return;
  renderCompare();
}

function cmpSetMode(mode) {
  cmpState.mode = mode === 'table' ? 'table' : 'visual';
  cmpSave();
  // A display switch only: both views are already built from the same figures.
  document.querySelectorAll('.cmp-mode button').forEach(b =>
    b.classList.toggle('on', b.dataset.mode === cmpState.mode));
  const v = document.getElementById('cmpVisual'), t = document.getElementById('cmpTable');
  if (v) v.hidden = cmpState.mode !== 'visual';
  if (t) t.hidden = cmpState.mode !== 'table';
  // Chart.js measures a canvas when drawn; one drawn while hidden has no size.
  if (cmpState.mode === 'visual') Object.values(cmpCharts).forEach(c => { try { c.resize(); } catch (e) {} });
}
