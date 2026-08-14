/* ============================================================
   BRANCH PERFORMANCE + LEDGERS: EMMA COACH'S VIEW
   Kate, 2026-08-14.

   Two things live here.

   1. BRANCH PERFORMANCE — the detail stack that used to sit at the bottom of
      Organisation Pulse. The Pulse is a read: a headline, a hair-vs-beauty
      paragraph, the wins, what is below target, one action. Every figure behind
      that read is now its own page, restructured into the ledger's own grouping
      (Revenue · Clients · Benchmarks · Staff) instead of a wall of tiles.

   2. LEDGERS: EMMA COACH'S VIEW — the Monday Target Sheet, on live numbers.
      Three tabs matching hers: Summary, Daily Target Sheet, Branches. Same
      grouping, same column order, same vocabulary, so she can read this instead
      of the spreadsheet without relearning where anything is.

   docs/LEDGER-REFERENCE.md is the spec: every block below maps to a named block
   of that sheet, and the mapping table at the end of it is why these field names
   look the way they do.

   THE ONE THING TO UNDERSTAND BEFORE EDITING: the ledger's targets are MONTHLY,
   and this dashboard's filters are an arbitrary date window. Comparing a
   fortnight's takings to a month's target reads as catastrophic failure. So the
   target columns appear only when the selected window is inside the month
   LEDGER_TARGETS holds, and otherwise the pages say why they are absent rather
   than printing a number that means nothing. See lgTargetContext().
   ============================================================ */

// ── FORMATTERS ───────────────────────────────────────────────
// Whole units. fmtAED's two decimals are right for a single headline figure and
// wrong for a column of forty: the decimals are noise you have to read past.
const lgAed = n => 'AED ' + Math.round(Number(n) || 0).toLocaleString('en-GB');
const lgNum = n => Math.round(Number(n) || 0).toLocaleString('en-GB');
const lgPct = (n, dp) => (n == null || !isFinite(n)) ? '—' : (+n).toFixed(dp == null ? 0 : dp) + '%';
const lgDash = v => (v == null || v === '' || (typeof v === 'number' && !isFinite(v))) ? '—' : v;

// A signed figure that colours itself. Behind target is bad, at or above is good.
// `invert` is for the metrics where less is better — none today, but NCR and
// no-show rates are the obvious future ones and the caller shouldn't have to
// re-derive the colour logic when they arrive.
function lgDelta(value, fmt, invert) {
  const v = Number(value) || 0;
  if (Math.round(v) === 0) return `<span class="lg-flat">0</span>`;
  const good = invert ? v < 0 : v > 0;
  const sign = v > 0 ? '+' : '−';
  return `<span class="${good ? 'lg-up' : 'lg-down'}">${sign}${(fmt || lgNum)(Math.abs(v))}</span>`;
}

// % done, as a bar with the number in it. A bare percentage in a column of
// percentages is hard to scan; the fill is what makes the laggards jump out.
function lgDoneBar(pct) {
  if (pct == null || !isFinite(pct)) return '—';
  const p = Math.max(0, pct);
  const cls = p >= 100 ? 'good' : p >= 75 ? 'warn' : 'bad';
  return `<span class="lg-done">
    <span class="lg-done-track"><span class="lg-done-fill ${cls}" style="width:${Math.min(100, p)}%"></span></span>
    <span class="lg-done-n tabular">${Math.round(p)}%</span>
  </span>`;
}

// ── STATE ────────────────────────────────────────────────────
// Everything on these pages reads the same shared filter state as the rest of
// the dashboard: sel.branch, dateFrom, dateTo. Nothing here holds its own.

// Which branch codes the current selection covers, expanded.
function lgBranches() {
  return (!sel.branch || sel.branch.includes('all')) ? ACTIVE_BRANCHES.slice() : sel.branch.slice();
}
function lgBranchLabel() {
  return (!sel.branch || sel.branch.includes('all'))
    ? 'All Branches'
    : sel.branch.map(b => (BRANCH_INFO[b] && BRANCH_INFO[b].name) || b).join(', ');
}
function lgRangeLabel() {
  return (dateFrom && dateTo) ? `${shortD(dateFrom)} – ${shortD(dateTo)}` : 'all data loaded';
}

// Do the ledger's monthly targets apply to the window on screen?
//
// They apply only if the window sits inside the month the targets were written
// for. Anything else — a fortnight, a quarter, last month, no window at all —
// and a monthly target is the wrong yardstick, so the pages drop the target
// columns and say so. Getting this wrong is the difference between a coaching
// tool and a page that tells Emma she is 70% behind on the 14th of the month.
function lgTargetContext() {
  const tgt = (typeof LEDGER_TARGETS !== 'undefined') ? LEDGER_TARGETS : null;
  if (!tgt) return { applies: false, note: 'Targets file is not loaded.', label: '' };

  const [ty, tm] = tgt.month.split('-').map(Number);
  const label = tgt.label;

  if (!dateFrom || !dateTo) {
    return { applies: false, label,
      note: `Showing every week loaded, so the ${label} targets are not applied — pick a period inside ${label} to see target, variance and what is left.` };
  }
  const inMonth = d => d.getFullYear() === ty && (d.getMonth() + 1) === tm;
  if (!inMonth(dateFrom) || !inMonth(dateTo)) {
    return { applies: false, label,
      note: `The targets loaded are ${label} monthly targets, and this window (${lgRangeLabel()}) falls outside it — so target, variance and % done are hidden rather than compared against the wrong month.` };
  }
  // Inside the month, but is it the whole month? Part-month is the normal case —
  // that is what MTD means — and % done is honest there. Say which it is.
  const partial = dateFrom.getDate() !== 1 || !lgIsMonthEnd(dateTo);
  return { applies: true, label, partial,
    note: partial
      ? `Month to date · ${lgRangeLabel()} against the full ${label} target. % done is raw progress through the target, not paced against days elapsed — the same way the ledger reads it.`
      : `The full month of ${label}.` };
}
function lgIsMonthEnd(d) {
  const t = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return d.getDate() === t.getDate();
}

// The summary for the current selection. renderDashboard() computes and caches
// it on window._lastDashState; these pages never re-aggregate, so the numbers
// cannot disagree with the Pulse's.
async function lgSummary() {
  if (!window._lastDashState && typeof renderDashboard === 'function') {
    await renderDashboard();
  }
  return window._lastDashState || null;
}

// ── TABLE ────────────────────────────────────────────────────
// cols: [{ label, align, w, wk }]  ·  rows: [[cell, cell, …]] or {group:'Label'}
//
// A column marked `wk` is one of the sheet's week columns. Those are folded away
// by default and opened by the toggle `opts.weeks` renders: six extra columns are
// the difference between a table you can read and one you have to scroll, and on
// most days the question is "where are we against the month", not "what happened
// in week two". The cells are always in the DOM, only hidden, so opening them
// costs nothing and the column stays aligned with its header.
function lgTable(cols, rows, opts) {
  const o = opts || {};
  const cls = i => [cols[i] && cols[i].align === 'r' ? 'r' : '', cols[i] && cols[i].wk ? 'lg-wk' : '']
    .filter(Boolean).join(' ');
  const head = cols.map((c, i) =>
    `<th class="${cls(i)}" ${c.w ? `style="width:${c.w}"` : ''}>${c.label}</th>`).join('');
  const body = rows.map(r => {
    if (r && r.group) {
      return `<tr class="lg-grp"><td colspan="${cols.length}">${r.group}</td></tr>`;
    }
    const cells = (r && r.total) ? r.total : r;
    const rowCls = (r && r.total) ? ' class="lg-tot"' : '';
    return `<tr${rowCls}>${cells.map((c, i) => `<td class="${cls(i)}">${c}</td>`).join('')}</tr>`;
  }).join('');
  // opts.groups: [{label, span}] — the banded header her Daily Stylist Target tab
  // runs above the columns (SERVICES · CLIENTS · TREATMENT · RETAIL). Without it
  // the row reads as seventeen unrelated numbers, which is exactly the thing the
  // banding on her sheet is there to prevent.
  const groupRow = o.groups ? `<tr class="lg-band">${o.groups.map(g =>
    `<th colspan="${g.span}" class="${g.label ? '' : 'lg-band-x'}">${g.label || ''}</th>`).join('')}</tr>` : '';
  const table = `<div class="lg-wrap"><table class="lg tabular${o.compact ? ' lg-compact' : ''}">
    <thead>${groupRow}<tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  if (!o.weeks) return table;
  return `<div class="lg-weeks">
    <button type="button" class="lg-wk-btn" aria-expanded="false" onclick="lgToggleWeeks(this)">Show week columns</button>
    ${table}
  </div>`;
}

// The collapsible shell, reusing Organisation Pulse's own section chrome so these
// pages feel like the same dashboard rather than a bolted-on report.
function lgSection(id, dotColor, title, subtitle, bodyHtml) {
  return `
    <div class="support-section" id="sec-${id}" style="margin-bottom:14px">
      <div class="support-section-hdr" onclick="toggleSection('${id}')">
        <div style="display:flex;align-items:center;gap:8px;min-width:0">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${dotColor};flex-shrink:0"></span>
          <span style="font-family:'Playfair Display',serif;font-style:italic;font-weight:600;font-size:16px;letter-spacing:0.02em;color:var(--text)">${title}</span>
          ${subtitle ? `<span style="font-size:10px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${subtitle}</span>` : ''}
        </div>
        <span id="arrow-${id}" class="support-toggle-arrow">▸</span>
      </div>
      <div id="body-${id}" class="support-section-body" style="padding:14px 6px 6px">${bodyHtml}</div>
    </div>`;
}

// Every page opens with the same standing line: what you are looking at, over
// what window, and whether targets are in play.
function lgHeader(title, standfirst, ctx) {
  return `
    <div class="lg-head">
      <div class="lg-head-k">${escapeHtml(lgBranchLabel())} · ${escapeHtml(lgRangeLabel())}</div>
      <h1>${title}</h1>
      <p class="lg-stand">${standfirst}</p>
      <p class="lg-note ${ctx.applies ? '' : 'off'}">${ctx.applies ? '✦ ' : '⚠ '}${ctx.note}</p>
    </div>`;
}

function lgEmpty(msg) {
  return `<div class="empty">${msg}</div>`;
}

// The "on this page" rail, the same device Organisation Pulse uses. These pages
// are long — five branch sections on Actuals vs Targets — and a page you can
// only navigate by scrolling is a page you stop reading halfway down.
// Pass [[sectionId, label], …]; the ids are the same ones lgSection() renders.
function lgRail(items) {
  if (!items || !items.length) return '';
  return `<nav class="lg-rail" aria-label="On this page">
    <span class="lg-rail-k">On this page</span>
    ${items.map(([id, label]) =>
      `<a href="#${id}" onclick="lgJump(event,'${id}')">${escapeHtml(label)}</a>`).join('')}
  </nav>`;
}

// Scroll to a section, opening it first if it is collapsed — a rail link that
// lands you on a closed heading looks like it did nothing. sectionState is the
// shared open/closed map the whole dashboard uses, so this asks it rather than
// reading the DOM. The masthead is fixed, hence the offset.
function lgJump(e, id) {
  if (e) e.preventDefault();
  const sec = document.getElementById('sec-' + id);
  if (!sec) return;
  if (typeof sectionState !== 'undefined' && !sectionState[id]
      && typeof toggleSection === 'function') toggleSection(id);
  const bar = parseInt(getComputedStyle(document.documentElement)
    .getPropertyValue('--topbar-cond-h'), 10) || 104;
  window.scrollTo({ top: sec.getBoundingClientRect().top + window.scrollY - bar - 8, behavior: 'smooth' });
}

/* ══════════════════════════════════════════════════════════════
   THE SHEET'S COLUMN MODEL
   Kate, 2026-08-14. Her tabs do not run one column of actuals — they run

     Category | Last Month | This Month | Week 00 … Week 04 | MTD | Variance

   and the whole month is readable across a row. This section rebuilds that
   spine from the upload rather than from the spreadsheet: the ledger's own
   numbers arrive here already, through the Staff Performance Overview upload
   into branch_staff_daily / phorest_staff_daily. Only the TARGET column has no
   equivalent in Supabase, which is what ledger-targets.js is for.

   WEEKS ARE MONDAY-START, clipped to the month. docs/LEDGER-REFERENCE.md said
   Sunday-start, but the August columns it lists (1–2, 3–9, 10–16, 17–23, 24–30,
   31) only work from Monday: 1 Aug 2026 is a Saturday, so Week 00 is the Sat–Sun
   fragment before the first full week and the 31st is a trailing Monday on its
   own. Derived rather than hard-coded, so September needs no edit.
   ══════════════════════════════════════════════════════════════ */

const lgDayNum = d => d.getDate();
const lgYmd = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

// Last month, every week column, and the month itself — the windows behind each
// column of her table. Reads LEDGER_TARGETS.month, so it follows the sheet.
function lgMonthWindows() {
  if (typeof LEDGER_TARGETS === 'undefined' || !LEDGER_TARGETS) return null;
  const [y, m] = LEDGER_TARGETS.month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const last  = new Date(y, m, 0);

  const weeks = [];
  let cur = new Date(first);
  while (cur <= last) {
    const mondayIdx = (cur.getDay() + 6) % 7;            // 0 = Monday
    const end = new Date(cur);
    end.setDate(cur.getDate() + (6 - mondayIdx));
    if (end > last) end.setTime(last.getTime());
    weeks.push({
      from: new Date(cur),
      to:   new Date(end),
      label: lgDayNum(cur) === lgDayNum(end) ? String(lgDayNum(cur)) : `${lgDayNum(cur)}–${lgDayNum(end)}`,
    });
    cur = new Date(end);
    cur.setDate(cur.getDate() + 1);
  }
  return {
    prev:  { from: new Date(y, m - 2, 1), to: new Date(y, m - 1, 0), label: LEDGER_TARGETS.prevLabel || 'Last month' },
    month: { from: first, to: last, label: LEDGER_TARGETS.label },
    weeks,
  };
}

// Every window aggregated, for the group and for each branch.
//
// One fetch covering last month and this month, then sliced in memory: the
// alternative is a dozen round trips for a table nobody has scrolled to yet.
// Cached against the target month, so switching pages does not refetch, and a
// new month's targets file invalidates it on its own.
async function lgSeries() {
  const w = lgMonthWindows();
  if (!w) return null;
  if (window._lgSeries && window._lgSeries.month === LEDGER_TARGETS.month) return window._lgSeries;

  const [branchRows, phorestRows] = await Promise.all([
    loadBranchStaffDailyRange(w.prev.from, w.month.to),
    loadPhorestStaffDailyRange(w.prev.from, w.month.to),
  ]);

  const cut = (rows, from, to, code) => {
    const f = lgYmd(from), t = lgYmd(to);
    return rows.filter(r => {
      const d = String(r.date || '').slice(0, 10);
      if (d < f || d > t) return false;
      return !code || r.branch === code;
    });
  };
  // aggDailyData takes daily_data rows first; [] because branch_staff_daily is
  // present for every window here and is the source of truth once it is.
  const agg = (from, to, code) => {
    const b = cut(branchRows, from, to, code);
    const p = cut(phorestRows, from, to, code);
    if (!b.length) return null;
    const r = aggDailyData([], b, p);
    return r ? r.summary : null;
  };

  const forCode = code => ({
    prev:  agg(w.prev.from,  w.prev.to,  code),
    mtd:   agg(w.month.from, w.month.to, code),
    weeks: w.weeks.map(x => agg(x.from, x.to, code)),
  });

  const series = { month: LEDGER_TARGETS.month, windows: w, group: forCode(null) };
  ACTIVE_BRANCHES.forEach(code => { series[code] = forCode(code); });
  window._lgSeries = series;
  return series;
}

// ── THE ROWS ─────────────────────────────────────────────────
// Her row order, her row names, and the target key each one is measured against.
// `fmt` decides money vs count; `ratio` marks the benchmark rows, which are
// percentages of their own window rather than something that can be summed.
const LG_SHEET_ROWS = [
  { group: 'Revenue' },
  { label: 'Services Total',                                key: 'servicesTotal',    pick: d => d.servicesTotal },
  { label: 'Retail Total',                                  key: 'retailTotal',      pick: d => d.retailTotal },
  { label: 'Hair services (incl. treatments and courses)',  key: null,               pick: d => d.hairServicesIncl },
  { label: 'Hair services (excl. treatments)',              key: 'hairServicesExcl', pick: d => d.hairServicesExcl },
  { label: 'Treatments revenue',                            key: 'hairTreatment',    pick: d => d.treatmentSales, ledger: true },
  { label: 'Beauty services',                               key: 'beautyServices',   pick: d => d.beautyServicesTotal, beauty: true },
  { label: 'Hair Retail',                                   key: 'hairRetail',       pick: d => d.hairRetailOnly },
  { label: 'Beauty Retail',                                 key: null,               pick: d => d.beautyRetailOnly, beauty: true },
  { group: 'Clients' },
  { label: 'Beauty Rebooked', key: 'beautyRebooked', pick: d => d.beautyRebookedCount, num: true, beauty: true },
  { label: 'Rebooked',        key: 'rebooked',       pick: d => d.totalRebooked,   num: true },
  { label: 'Total Clients',   key: 'totalClients',   pick: d => d.totalClients,    num: true },
  { label: 'New Clients',     key: 'newClients',     pick: d => d.newClientsTotal, num: true },
  { label: 'NCR',             key: 'ncr',            pick: d => d.ncrTotal,        num: true },
  { group: 'Benchmarks' },
  { label: 'Rebooking %',   bm: 'rebookPct',    pick: d => (d.rebookPct != null ? d.rebookPct : d.hairRebookPct), ratio: true },
  { label: 'Treatment %',   bm: 'treatmentPct', pick: d => (d.hairServicesIncl || 0) ? (d.treatmentSales || 0) / d.hairServicesIncl * 100 : null, ratio: true },
  { label: 'Retail %',      bm: 'retailPct',    pick: d => { const n = (d.hairServicesIncl||0) + (d.hairRetailOnly||0); return n ? (d.hairRetailOnly||0)/n*100 : null; }, ratio: true },
  { label: 'Hair Avg Bill', bm: 'hairAvgBill',  pick: d => d.hairAvgBill,   ratio: true, money: true },
  { label: 'Beauty Avg Bill', bm: 'beautyAvgBill', pick: d => d.beautyAvgBill, ratio: true, money: true, beauty: true },
];

// One branch section in her shape: metric down the side, the month across.
//
// `code` is null for the group total. Motor City runs hair only, so its beauty
// rows are dropped rather than printed as zeros — the sheet does the same.
function lgSheetSection(series, code, ctx) {
  const bucket = code ? series[code] : series.group;
  if (!bucket || !bucket.mtd) return lgEmpty('No figures for this branch in ' + series.windows.month.label + '.');

  const w = series.windows;
  const hairOnly = code ? !((bucket.mtd.beautyTotalClients || 0) || (bucket.mtd.beautyServicesTotal || 0)) : false;
  const bm = (typeof LEDGER_TARGETS !== 'undefined') ? LEDGER_TARGETS.benchmarks : TARGETS;

  const cols = [{ label: 'Category / Metric' }, { label: w.prev.label, align: 'r' }, { label: 'This Month', align: 'r' }]
    .concat(w.weeks.map((x, i) => ({ label: `<span class="lg-wk-k">Week ${String(i).padStart(2,'0')}</span>${x.label}`, align: 'r', wk: true })))
    .concat([{ label: 'MTD', align: 'r' }, { label: 'Variance', align: 'r' }]);

  const rows = [];
  LG_SHEET_ROWS.forEach(r => {
    if (r.group) { rows.push({ group: r.group }); return; }
    if (r.beauty && hairOnly) return;

    const fmt = (r.num ? lgNum : lgAed);

    // Benchmarks are ratios: they have a standing target at any window length,
    // and no variance against a monthly total. Same treatment as everywhere else
    // in these pages, so a percentage never reads as money left to find.
    if (r.ratio) {
      const f = r.money ? lgAed : lgPct;
      const act = bucket.mtd ? r.pick(bucket.mtd) : null;
      const tgt = bm[r.bm];
      rows.push([r.label,
        bucket.prev ? lgDash(r.pick(bucket.prev) != null ? f(r.pick(bucket.prev)) : null) : '—',
        f(tgt)]
        .concat(bucket.weeks.map(s => (s && r.pick(s) != null) ? f(r.pick(s)) : '—'))
        .concat([act != null ? f(act) : '—',
                 act == null ? '—' : (act >= tgt ? '<span class="lg-up">✓ on target</span>' : lgDelta(act - tgt, f))]));
      return;
    }

    const mtd = bucket.mtd ? (r.pick(bucket.mtd) || 0) : 0;
    // The target is NOT gated on ctx.applies here, unlike everywhere else on
    // these pages. Elsewhere that gate stops a fortnight's takings being read
    // against a month's target; this table is the ledger month by construction,
    // whatever the page filter says, so its own target always applies.
    const target = r.key ? ledgerBranchTarget(r.key, code ? [code] : null) : null;
    const p = target != null ? ledgerPace(mtd, target) : null;

    rows.push([r.label + (r.ledger ? ' <span class="lg-tag">LEDGER</span>' : ''),
      bucket.prev ? fmt(r.pick(bucket.prev) || 0) : '—',
      target != null ? fmt(target) : '<span class="lg-na">no target</span>']
      .concat(bucket.weeks.map(s => s ? fmt(r.pick(s) || 0) : '—'))
      .concat([fmt(mtd), p ? lgDelta(p.variance, fmt) : '—']));
  });

  return lgTable(cols, rows, { compact: true, weeks: true });
}

// Show/hide the week columns. The class rides on the wrapper so one toggle moves
// every cell in the table, header included, without re-rendering anything.
function lgToggleWeeks(btn) {
  const wrap = btn.closest('.lg-weeks')?.querySelector('.lg-wrap');
  if (!wrap) return;
  const open = wrap.classList.toggle('lg-show-wk');
  btn.textContent = open ? 'Hide week columns' : 'Show week columns';
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

/* ══════════════════════════════════════════════════════════════
   1 · BRANCH PERFORMANCE
   The old "The detail" stack, regrouped the way the ledger groups it. The tiles
   became rows because a target, a variance and a % done do not fit in a tile —
   that is a table, and pretending otherwise is what kept this page from ever
   showing a target.
   ══════════════════════════════════════════════════════════════ */
async function renderBranchPerformance() {
  const host = document.getElementById('branchPerfContent');
  if (!host) return;
  host.innerHTML = '<div class="loading">Loading data...</div>';

  const s = await lgSummary();
  if (!s) { host.innerHTML = lgEmpty('No data for this selection.'); return; }

  const ctx    = lgTargetContext();
  const codes  = lgBranches();
  const hasBeauty = (s.beautyTotalClients || 0) > 0 || (s.beautyServicesTotal || 0) > 0;

  // Department-scoped figures, defined here for the same reason the old block
  // defined them here: s.treatmentPct and s.hairRetail mean different things
  // depending on which aggregation path produced this render, so the ratios that
  // matter are recomputed from the parts rather than trusted.
  const hairNetTake   = (s.hairServicesIncl || 0) + (s.hairRetailOnly || 0);
  const beautyNetTake = (s.beautyServicesTotal || 0) + (s.beautyRetailOnly || 0);
  const hairTxPct     = (s.hairServicesIncl || 0) ? ((s.treatmentSales || 0) / s.hairServicesIncl * 100) : 0;
  const hairRetPct    = hairNetTake   ? ((s.hairRetailOnly || 0)   / hairNetTake   * 100) : 0;
  const beautyRetPct  = beautyNetTake ? ((s.beautyRetailOnly || 0) / beautyNetTake * 100) : 0;

  // ── REVENUE ────────────────────────────────────────────────
  // Ledger row order, and the ledger's own names for each line.
  const revenueRows = [
    ['Services Total',                              'servicesTotal',    s.servicesTotal],
    ['Retail Total',                                'retailTotal',      s.retailTotal],
    ['Hair services (incl. treatments and courses)', null,              s.hairServicesIncl],
    ['Hair services (excl. treatments)',            'hairServicesExcl', s.hairServicesExcl],
    ['Treatments revenue',                          'hairTreatment',    s.treatmentSales, true],
    ['Beauty services',                             'beautyServices',   s.beautyServicesTotal],
    ['Hair Retail',                                 'hairRetail',       s.hairRetailOnly],
    ['Beauty Retail',                                null,              s.beautyRetailOnly],
  ];

  const revCols = ctx.applies
    ? [{label:'Metric'},{label:'Actual',align:'r'},{label:'Target',align:'r'},
       {label:'Variance',align:'r'},{label:'% done',align:'r',w:'116px'},{label:'Remaining',align:'r'}]
    : [{label:'Metric'},{label:'Actual',align:'r'}];

  const revBody = revenueRows.map(([label, key, actual, isLedger]) => {
    const tag = isLedger ? ' <span class="lg-tag">LEDGER</span>' : '';
    if (!ctx.applies) return [label + tag, lgAed(actual)];
    if (!key)         return [label + tag, lgAed(actual), '<span class="lg-na">no target</span>', '—', '—', '—'];
    const t = ledgerBranchTarget(key, codes);
    const p = ledgerPace(actual, t);
    return [label + tag, lgAed(p.actual), lgAed(p.target),
            lgDelta(p.variance, lgAed), lgDoneBar(p.pctDone), lgAed(p.remaining)];
  });

  // ── CLIENTS ────────────────────────────────────────────────
  // The branch tabs split every client count by department before totalling, and
  // that split is the useful half — a rebooking problem is almost always one
  // department's. Targets exist for the combined lines only, which is why the
  // department rows carry a dash rather than a fabricated half-target.
  const clientRows = [
    { group: 'Hair' },
    ['Hair Total Clients', null, s.hairTotalClients],
    ['Hair New Clients',   null, s.hairNewClients],
    ['Hair NCR',           null, s.hairNCR],
    ['Hair Rebooked',      null, s.hairRebookedCount],
    { group: 'Beauty' },
    ['Beauty Total Clients', null, s.beautyTotalClients],
    ['Beauty New Clients',   null, s.beautyNewClients],
    ['Beauty NCR',           null, s.beautyNCR],
    ['Beauty Rebooked',      'beautyRebooked', s.beautyRebookedCount],
    { group: 'Combined' },
    ['Rebooked',      'rebooked',     s.totalRebooked],
    ['Total Clients', 'totalClients', s.totalClients],
    ['New Clients',   'newClients',   s.newClientsTotal],
    ['NCR',           'ncr',          s.ncrTotal],
  ];

  const cliBody = clientRows.map(r => {
    if (r.group) return r;
    const [label, key, actual] = r;
    if (!ctx.applies) return [label, lgNum(actual)];
    if (!key)         return [label, lgNum(actual), '<span class="lg-na">no target</span>', '—', '—', '—'];
    const p = ledgerPace(actual, ledgerBranchTarget(key, codes));
    return [label, lgNum(p.actual), lgNum(p.target),
            lgDelta(p.variance, lgNum), lgDoneBar(p.pctDone), lgNum(p.remaining)];
  });

  // ── BENCHMARKS ─────────────────────────────────────────────
  // Ratios, not totals, so unlike everything above these ARE comparable at any
  // window length and are shown whatever the date filter says.
  const bm = (typeof LEDGER_TARGETS !== 'undefined') ? LEDGER_TARGETS.benchmarks : TARGETS;
  const bmRows = [
    ['Rebooking %',        s.rebookPct != null ? s.rebookPct : s.hairRebookPct, bm.rebookPct,   lgPct],
    ['Treatment % (hair)', hairTxPct,          bm.treatmentPct,   lgPct],
    ['Retail % (hair)',    hairRetPct,         bm.retailPct,      lgPct],
    ['Retail % (beauty)',  hasBeauty ? beautyRetPct : null, bm.retailPct, lgPct],
    ['Hair Avg Bill',      s.hairAvgBill,      bm.hairAvgBill,    lgAed],
    ['Beauty Avg Bill',    hasBeauty ? s.beautyAvgBill : null, bm.beautyAvgBill, lgAed],
  ].map(([label, actual, target, fmt]) => {
    if (actual == null) return [label, '—', fmt(target), '<span class="lg-na">n/a</span>'];
    const hit = actual >= target;
    return [label, fmt(actual), fmt(target),
      `<span class="${hit ? 'lg-up' : 'lg-down'}">${hit ? '✓ on target' : lgDelta(actual - target, fmt)}</span>`];
  });

  // ── STAFF ──────────────────────────────────────────────────
  const staffHtml = lgStaffTables(codes, ctx);

  // The retail reconciliation warning followed the retail figures over from the
  // Pulse. It belongs next to the number it is casting doubt on, not on a page
  // that no longer prints retail at all.
  const warnHtml = (s._retailWarnings && s._retailWarnings.length) ? `
    <div class="lg-warn">
      <strong>⚠ Retail data mismatch</strong> across ${s._retailWarnings.length} week(s).
      The daily sheets are summed and used; the weekly summary row disagrees.
      ${s._retailWarnings.slice(0, 3).map(m =>
        `Daily ${lgAed(m.daily)} vs summary ${lgAed(m.summary)} (${m.pctDiff}% drift)`).join(' · ')}
    </div>` : '';

  // Kate, 2026-08-14: this page is charts now. The tables it used to lead with are
  // the Ledgers pages' job — that is what those three pages are for, and printing
  // the same rows twice was the reason this page had no character of its own.
  // Branch Performance is the picture: who is where, against what, and which way
  // the month is moving. The figures stay, one section down, for when a number
  // has to be read rather than compared.
  host.innerHTML =
    lgRail([['bpMix','Revenue mix'], ['bpPace','Against target'],
            ['bpBench','Benchmarks'], ['bpClients','Clients'], ['bpStaff','Staff']]) +
    lgHeader('Branch Performance',
      `The shape of the period: where the money came from, how far through the target each branch is, and which benchmarks are carrying it.`,
      ctx) +
    warnHtml +
    lgSection('bpMix', '#FFD4D9', 'Revenue mix', escapeHtml(lgBranchLabel()),
      `<div class="bp-chart"><canvas id="bpMixChart"></canvas></div>
       <div class="foot">Stacked, so the height is the branch's net take and the bands are where it came from. Hover a band for the figure.</div>` +
      lgTable(revCols, revBody)) +
    lgSection('bpPace', '#C4B5FD', 'Against target',
      ctx.applies ? escapeHtml(ctx.label) : 'unavailable for this window',
      ctx.applies
        ? `<div class="bp-chart bp-chart-tall"><canvas id="bpPaceChart"></canvas></div>
           <div class="foot">Bar = % of the month's target banked so far. The line at 100% is the target itself, not a pace marker — the ledger reads it the same way.</div>`
        : lgEmpty(ctx.note)) +
    lgSection('bpBench', '#99F6E4', 'Benchmarks', 'ratios · comparable at any window length',
      `<div class="bp-chart"><canvas id="bpBenchChart"></canvas></div>
       <div class="foot">Bars are branches, the dashed line is the standing target for that benchmark.</div>` +
      lgTable([{label:'Metric'},{label:'Actual',align:'r'},{label:'Target',align:'r'},{label:'',align:'r',w:'150px'}], bmRows)) +
    lgSection('bpClients', 'var(--hair)', 'Clients', escapeHtml(lgBranchLabel()),
      `<div class="bp-chart"><canvas id="bpClientsChart"></canvas></div>
       <div class="foot">New against returning, per branch, with the rebooked count on top of the bar it came from.</div>` +
      lgTable(revCols, cliBody)) +
    lgSection('bpStaff', 'var(--beauty)', 'Staff performance', escapeHtml(lgRangeLabel()), staffHtml) +
    `<div class="fine">
      <p><b>Where these come from</b>. Client counts, the department split and the treatment figure come from the branch ledger (<code>branch_staff_daily</code>); revenue comes from Phorest (<code>phorest_staff_daily</code>), matched to the ledger's staff and day. Rows tagged <span class="lg-tag">LEDGER</span> are hand-tallied and have no Phorest equivalent.</p>
      <p><b>Where the targets come from</b>. <code>ledger-targets.js</code>, read out of ${escapeHtml(LEDGER_TARGETS ? LEDGER_TARGETS.source : 'the target sheet')} and updated by hand each month. Revenue targets are taken from that sheet's MTD pacing panel rather than its group roll-up: the two disagree, and only the panel's figures sum to their own branches. If a number here does not match Emma's sheet, that file is stale.</p>
    </div>`;

  ['bpMix','bpPace','bpBench','bpClients','bpStaff'].forEach(id => { if (!(id in sectionState)) sectionState[id] = true; });
  restoreSections();
  bpDrawCharts(codes, ctx);
  if (typeof sizeTopbar === 'function') sizeTopbar();
  if (typeof spy === 'function') spy();
}

/* ══════════════════════════════════════════════════════════════
   BRANCH PERFORMANCE — THE CHARTS
   Kate, 2026-08-14. Four, and each answers one question:

     Revenue mix     where did this branch's money come from
     Against target  how far through the month is each one
     Benchmarks      which ratios are carrying it, against the standing target
     Clients         new against returning, and how many came back

   Colour rule, same as everywhere else on this dashboard: the accent quartet
   carries IDENTITY (which band, which branch), and only red/amber/green carry
   STATUS. So the mix bands are the quartet and never scored, while "against
   target" is the one chart allowed to colour by good/bad.
   ══════════════════════════════════════════════════════════════ */
let bpCharts = {};

function bpDestroy() {
  Object.values(bpCharts).forEach(c => { try { c.destroy(); } catch (e) {} });
  bpCharts = {};
}

// Called by toggleTheme(). Redraws in the new palette without touching the data
// or the DOM around it — the canvases are already on the page, only the colours
// baked into the chart configs are stale.
function bpRedrawForTheme() {
  const view = document.getElementById('view-branchperf');
  if (!view || view.style.display === 'none' || !Object.keys(bpCharts).length) return;
  bpDrawCharts(lgBranches(), lgTargetContext());
}

function bpDrawCharts(codes, ctx) {
  bpDestroy();
  if (typeof Chart === 'undefined') return;

  const dark = (typeof isDark === 'function') ? isDark() : false;
  const grid = dark ? 'rgba(250,248,243,0.07)' : 'rgba(26,26,26,0.07)';
  const tick = dark ? 'rgba(250,248,243,0.55)' : '#77706A';
  const font = { family: 'Inter', size: 11 };
  const tip  = {
    backgroundColor: dark ? '#383944' : '#fff',
    titleColor: dark ? '#FAF8F3' : '#1A1A1A',
    bodyColor:  dark ? 'rgba(250,248,243,0.75)' : '#565049',
    borderColor: dark ? 'rgba(250,248,243,0.12)' : '#E8E2D6',
    borderWidth: 1, padding: 10, cornerRadius: 8, displayColors: true,
  };
  // Legends sit at the bottom: at the top they push the plot down and, on a
  // phone, wrap to three lines over a 220px chart.
  const legend = { position: 'bottom', labels: { color: tick, font, boxWidth: 10, boxHeight: 10, padding: 14, usePointStyle: true, pointStyle: 'circle' } };
  const base = (extra) => Object.assign({
    responsive: true, maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: { legend, tooltip: tip },
  }, extra || {});

  const byBranch = (typeof aggByBranch === 'function') ? aggByBranch() : {};
  const names = codes.map(c => (BRANCH_INFO[c] || {}).name || c);
  const pull  = fn => codes.map(c => (byBranch[c] && byBranch[c].summary) ? (fn(byBranch[c].summary) || 0) : 0);
  const mk = (id, cfg) => {
    const el = document.getElementById(id);
    if (el) bpCharts[id] = new Chart(el, cfg);
  };

  // ── 1 · REVENUE MIX ────────────────────────────────────────
  // Stacked to net take, in the ledger's own four parts. Beauty is included even
  // when zero (Motor City) so the branches stay comparable bar to bar.
  mk('bpMixChart', {
    type: 'bar',
    data: { labels: names, datasets: [
      { label: 'Hair services',      data: pull(d => d.hairServicesExcl),    backgroundColor: '#C4B5FD' },
      { label: 'Treatments',         data: pull(d => d.treatmentSales),      backgroundColor: '#99F6E4' },
      { label: 'Beauty services',    data: pull(d => d.beautyServicesTotal), backgroundColor: '#FFD4D9' },
      { label: 'Retail',             data: pull(d => d.retailTotal),         backgroundColor: '#EEF3C7' },
    ].map(ds => Object.assign(ds, { borderWidth: 0, borderRadius: 3 })) },
    options: base({
      scales: {
        x: { stacked: true, ticks: { color: tick, font }, grid: { display: false } },
        y: { stacked: true, ticks: { color: tick, font, callback: v => 'AED ' + (v / 1000) + 'k' }, grid: { color: grid } },
      },
      plugins: { legend, tooltip: Object.assign({}, tip, { callbacks: {
        label: c => `${c.dataset.label}: ${lgAed(c.parsed.y)}`,
        footer: items => 'Net take: ' + lgAed(items.reduce((a, i) => a + i.parsed.y, 0)),
      } }) },
    }),
  });

  // ── 2 · AGAINST TARGET ─────────────────────────────────────
  // Horizontal, because six metric names down the side read at any width where
  // the same six across the bottom would be turned on their side. This is the
  // one chart that colours by status.
  if (ctx.applies) {
    const METRICS = [
      ['Salon total services', 'servicesTotal',    d => d.servicesTotal],
      ['Salon total retail',   'retailTotal',      d => d.retailTotal],
      ['Hair services',        'hairServicesExcl', d => d.hairServicesExcl],
      ['Hair treatment',       'hairTreatment',    d => d.treatmentSales],
      ['Hair retail',          'hairRetail',       d => d.hairRetailOnly],
      ['Beauty services',      'beautyServices',   d => d.beautyServicesTotal],
    ];
    const rows = METRICS.map(([label, key, fn]) => {
      const actual = codes.reduce((a, c) => a + ((byBranch[c] && byBranch[c].summary) ? (fn(byBranch[c].summary) || 0) : 0), 0);
      const target = ledgerBranchTarget(key, codes);
      return { label, pct: target ? actual / target * 100 : null, actual, target };
    }).filter(r => r.pct != null);

    const good = dark ? '#99F6E4' : '#0F6E56';
    const warn = dark ? '#EEF3C7' : '#BA7517';
    const bad  = dark ? '#FF9B9B' : '#A32D2D';
    mk('bpPaceChart', {
      type: 'bar',
      data: { labels: rows.map(r => r.label), datasets: [{
        label: '% of target banked',
        data: rows.map(r => Math.round(r.pct)),
        backgroundColor: rows.map(r => r.pct >= 100 ? good : r.pct >= 75 ? warn : bad),
        borderWidth: 0, borderRadius: 3, barThickness: 18,
      }] },
      options: base({
        indexAxis: 'y',
        scales: {
          x: { min: 0, suggestedMax: 100, ticks: { color: tick, font, callback: v => v + '%' }, grid: { color: grid } },
          y: { ticks: { color: tick, font }, grid: { display: false } },
        },
        plugins: { legend: { display: false }, tooltip: Object.assign({}, tip, { callbacks: {
          label: c => `${Math.round(c.parsed.x)}% · ${lgAed(rows[c.dataIndex].actual)} of ${lgAed(rows[c.dataIndex].target)}`,
          footer: items => 'Remaining: ' + lgAed(Math.max(0, rows[items[0].dataIndex].target - rows[items[0].dataIndex].actual)),
        } }) },
      }),
      plugins: [{
        // The 100% line. An annotation plugin would be a second dependency for
        // one straight line, so it is drawn by hand.
        id: 'bpTargetLine',
        afterDatasetsDraw(chart) {
          const x = chart.scales.x, a = chart.chartArea;
          if (!x || x.max < 100) return;
          const px = x.getPixelForValue(100);
          const c = chart.ctx;
          c.save();
          c.strokeStyle = dark ? 'rgba(250,248,243,0.5)' : 'rgba(26,26,26,0.45)';
          c.setLineDash([4, 4]); c.lineWidth = 1;
          c.beginPath(); c.moveTo(px, a.top); c.lineTo(px, a.bottom); c.stroke();
          c.restore();
        },
      }],
    });
  }

  // ── 3 · BENCHMARKS ─────────────────────────────────────────
  // One bar per branch per benchmark, with the standing target as a dashed rule
  // across each group. Avg bills are left out: they are AED and would flatten
  // three percentages into nothing on a shared axis.
  const bm = (typeof LEDGER_TARGETS !== 'undefined') ? LEDGER_TARGETS.benchmarks : TARGETS;
  const BENCH = [
    ['Rebooking %', bm.rebookPct,    d => (d.rebookPct != null ? d.rebookPct : d.hairRebookPct)],
    ['Treatment %', bm.treatmentPct, d => (d.hairServicesIncl || 0) ? (d.treatmentSales || 0) / d.hairServicesIncl * 100 : 0],
    ['Retail %',    bm.retailPct,    d => { const n = (d.hairServicesIncl || 0) + (d.hairRetailOnly || 0); return n ? (d.hairRetailOnly || 0) / n * 100 : 0; }],
  ];
  mk('bpBenchChart', {
    type: 'bar',
    data: {
      labels: BENCH.map(b => b[0]),
      datasets: codes.map(c => ({
        label: (BRANCH_INFO[c] || {}).name || c,
        data: BENCH.map(([, , fn]) => {
          const d = byBranch[c] && byBranch[c].summary;
          return d ? Math.round((fn(d) || 0) * 10) / 10 : 0;
        }),
        backgroundColor: (BRANCH_INFO[c] || {}).color || '#ccc',
        borderWidth: 0, borderRadius: 3,
      })),
    },
    options: base({
      scales: {
        x: { ticks: { color: tick, font }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: tick, font, callback: v => v + '%' }, grid: { color: grid } },
      },
      plugins: { legend, tooltip: Object.assign({}, tip, { callbacks: { label: c => `${c.dataset.label}: ${c.parsed.y}%` } }) },
    }),
    plugins: [{
      id: 'bpBenchTargets',
      afterDatasetsDraw(chart) {
        const x = chart.scales.x, y = chart.scales.y, c = chart.ctx;
        if (!x || !y) return;
        c.save();
        c.strokeStyle = dark ? 'rgba(250,248,243,0.55)' : 'rgba(26,26,26,0.5)';
        c.setLineDash([5, 4]); c.lineWidth = 1.5;
        BENCH.forEach(([, target], i) => {
          if (target == null || target > y.max) return;
          const py = y.getPixelForValue(target);
          const half = (x.width / BENCH.length) / 2 - 6;
          const cx = x.getPixelForValue(i);
          c.beginPath(); c.moveTo(cx - half, py); c.lineTo(cx + half, py); c.stroke();
        });
        c.restore();
      },
    }],
  });

  // ── 4 · CLIENTS ────────────────────────────────────────────
  // New against returning, stacked to Total Clients, with rebooked as its own
  // bar beside it — rebooked is a subset of the total, so stacking it inside
  // would double-count the same visit.
  mk('bpClientsChart', {
    type: 'bar',
    data: { labels: names, datasets: [
      { label: 'New',       data: pull(d => d.newClientsTotal), backgroundColor: '#FFD4D9', stack: 'clients' },
      { label: 'Returning', data: codes.map(c => {
          const d = byBranch[c] && byBranch[c].summary;
          return d ? Math.max(0, (d.totalClients || 0) - (d.newClientsTotal || 0)) : 0;
        }), backgroundColor: '#C4B5FD', stack: 'clients' },
      { label: 'Rebooked',  data: pull(d => d.totalRebooked), backgroundColor: '#99F6E4', stack: 'rebooked' },
    ].map(ds => Object.assign(ds, { borderWidth: 0, borderRadius: 3 })) },
    options: base({
      scales: {
        x: { ticks: { color: tick, font }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: tick, font, precision: 0 }, grid: { color: grid } },
      },
      plugins: { legend, tooltip: Object.assign({}, tip, { callbacks: { label: c => `${c.dataset.label}: ${lgNum(c.parsed.y)}` } }) },
    }),
  });
}

// Per-stylist tables, one per branch in the selection, hair then beauty. Uses
// aggByBranch() so a single-branch selection and an all-branch selection are the
// same code path.
function lgStaffTables(codes, ctx) {
  const byBranch = (typeof aggByBranch === 'function') ? aggByBranch() : {};
  const blocks = codes.map(code => {
    const bd = byBranch[code];
    if (!bd) return '';
    const info = BRANCH_INFO[code] || { name: code };

    const hairCols = [
      {label:'Stylist'},{label:'Services excl. tx',align:'r'},{label:'Treatments',align:'r'},
      {label:'Retail',align:'r'},{label:'Net take',align:'r'},{label:'Clients',align:'r'},
      {label:'New',align:'r'},{label:'NCR',align:'r'},{label:'Rebooked',align:'r'},
      {label:'Rebook %',align:'r'},{label:'Avg bill',align:'r'},
    ];
    const hairRows = (bd.hairStaff || [])
      .slice().sort((a, b) => (b.netSalonTake || 0) - (a.netSalonTake || 0))
      .map(st => [
        lgStaffName(code, 'HAIR', st, ctx),
        lgAed(st.hairServicesExcl), lgAed(st.treatments), lgAed(st.retail), lgAed(st.netSalonTake),
        lgNum(st.total), lgNum(st.newClients != null ? st.newClients : st.newClientReq),
        lgNum(st.newClientReq), lgNum(st.rebooked), lgPct(st.rebookPct), lgAed(st.avgBill),
      ]);

    const beautyCols = [
      {label:'Therapist'},{label:'Services',align:'r'},{label:'Retail',align:'r'},
      {label:'Net take',align:'r'},{label:'Clients',align:'r'},{label:'New',align:'r'},
      {label:'NCR',align:'r'},{label:'Rebooked',align:'r'},{label:'Rebook %',align:'r'},
      {label:'Avg bill',align:'r'},
    ];
    const beautyRows = (bd.beautyStaff || [])
      .slice().sort((a, b) => (b.netSalonTake || 0) - (a.netSalonTake || 0))
      .map(st => [
        lgStaffName(code, 'BEAUTY', st, ctx),
        lgAed(st.beautySales), lgAed(st.retail), lgAed(st.netSalonTake),
        lgNum(st.total), lgNum(st.newClients != null ? st.newClients : st.newClientReq),
        lgNum(st.newClientReq), lgNum(st.rebooked), lgPct(st.rebookPct), lgAed(st.avgBill),
      ]);

    return `
      <div class="lg-branch">
        <div class="lg-branch-k"><span class="dot" style="background:${info.color}"></span>${escapeHtml(info.name)}</div>
        <div class="lg-sub">Hair</div>
        ${hairRows.length ? lgTable(hairCols, hairRows, {compact:true}) : lgEmpty('No hair figures for this window.')}
        ${beautyRows.length ? `<div class="lg-sub">Beauty</div>${lgTable(beautyCols, beautyRows, {compact:true})}` : ''}
      </div>`;
  }).join('');

  return blocks || lgEmpty('No staff figures for this window.');
}

// A stylist's name, with her services target against it when one exists. The
// target is monthly, so it is only shown when the window makes it meaningful.
function lgStaffName(code, dept, st, ctx) {
  const name = escapeHtml(st.name || '—');
  if (!ctx.applies || typeof ledgerStaffTarget !== 'function') return name;
  const t = ledgerStaffTarget(code, dept, st.name);
  if (!t || !t.services) return name;
  const actual = dept === 'BEAUTY' ? (st.beautySales || 0) : (st.hairSalesNet || 0);
  const p = ledgerPace(actual, t.services);
  return `${name} <span class="lg-inline">${Math.round(p.pctDone)}% of ${lgAed(t.services)}</span>`;
}

/* ══════════════════════════════════════════════════════════════
   2 · LEDGERS — DAILY TARGET SHEET
   Kate, 2026-08-14: her SUMMARY tab is two separate things sitting side by side,
   and only a spreadsheet can get away with that. The right-hand block is headed
   "Daily target sheet" and it is the one she opens the file to read — the
   benchmark pivot, then the six pacing blocks. That is this page. The left-hand
   block, "JULY 2026 ACTUALS vs AUGUST 2026 TARGETS", is its own page below.

   Pivot first, then the blocks, in her order.
   ══════════════════════════════════════════════════════════════ */
async function renderLedgerTargets() {
  const host = document.getElementById('ledgerTargetsContent');
  if (!host) return;
  host.innerHTML = '<div class="loading">Loading data...</div>';

  const s = await lgSummary();
  if (!s) { host.innerHTML = lgEmpty('No data for this selection.'); return; }

  const ctx      = lgTargetContext();
  const byBranch = (typeof aggByBranch === 'function') ? aggByBranch() : {};
  const codes    = lgBranches();

  // The six pacing blocks, in the sheet's own order and with its own titles.
  // `pick` pulls the actual for one branch's summary; `key` is the target field.
  const BLOCKS = [
    { title:'Salon total services', key:'servicesTotal',    pick: d => d.servicesTotal },
    { title:'Salon total retail',   key:'retailTotal',      pick: d => d.retailTotal },
    { title:'Hair treatment',       key:'hairTreatment',    pick: d => d.treatmentSales },
    { title:'Hair services (excluding treatments)', key:'hairServicesExcl', pick: d => d.hairServicesExcl },
    { title:'Hair retail',          key:'hairRetail',       pick: d => d.hairRetailOnly },
    { title:'Beauty services',      key:'beautyServices',   pick: d => d.beautyServicesTotal },
  ];

  const paceCols = [
    {label:'Branch'},{label:'Target',align:'r'},{label:'MTD actual',align:'r'},
    {label:'Variance',align:'r'},{label:'% done',align:'r',w:'116px'},{label:'Remaining',align:'r'},
  ];

  const paceHtml = ctx.applies ? BLOCKS.map(b => {
    let tA = 0, aA = 0;
    const rows = codes.map(code => {
      const bd = byBranch[code];
      const info = BRANCH_INFO[code] || { name: code };
      const actual = bd ? (b.pick(bd.summary) || 0) : 0;
      const target = ledgerBranchTarget(b.key, [code]);
      tA += target; aA += actual;
      const p = ledgerPace(actual, target);
      // Motor City has no beauty team, so a beauty row for it is a real zero and
      // not a gap to chase. Say so instead of showing −AED 0 at 0%.
      if (!target && !actual) return [escapeHtml(info.name), '—', '—', '<span class="lg-na">n/a</span>', '—', '—'];
      return [escapeHtml(info.name), lgAed(p.target), lgAed(p.actual),
              lgDelta(p.variance, lgAed), lgDoneBar(p.pctDone), lgAed(p.remaining)];
    });
    const g = ledgerPace(aA, tA);
    rows.push({ total: ['Grand total', lgAed(g.target), lgAed(g.actual),
                        lgDelta(g.variance, lgAed), lgDoneBar(g.pctDone), lgAed(g.remaining)] });
    return `<div class="lg-block"><div class="lg-block-k">${b.title}</div>${lgTable(paceCols, rows, {compact:true})}</div>`;
  }).join('') : lgEmpty('Pacing needs a monthly target. ' + ctx.note);

  // The per-branch benchmark pivot from the top of her panel.
  const pivCols = [
    {label:'Branch'},{label:'Rebooking %',align:'r'},{label:'Treatment %',align:'r'},
    {label:'Retail %',align:'r'},{label:'Hair avg bill',align:'r'},{label:'Beauty avg bill',align:'r'},
    {label:'Total clients',align:'r'},{label:'New',align:'r'},{label:'NCR',align:'r'},{label:'Rebooked',align:'r'},
  ];
  const acc = { tc:0, nc:0, ncr:0, rb:0 };
  const pivRows = codes.map(code => {
    const bd = byBranch[code];
    const info = BRANCH_INFO[code] || { name: code };
    if (!bd) return [escapeHtml(info.name), '—','—','—','—','—','—','—','—','—'];
    const d = bd.summary;
    const hairNet = (d.hairServicesIncl || 0) + (d.hairRetailOnly || 0);
    const txPct   = (d.hairServicesIncl || 0) ? (d.treatmentSales || 0) / d.hairServicesIncl * 100 : null;
    const retPct  = hairNet ? (d.hairRetailOnly || 0) / hairNet * 100 : null;
    acc.tc += d.totalClients || 0; acc.nc += d.newClientsTotal || 0;
    acc.ncr += d.ncrTotal || 0;    acc.rb += d.totalRebooked || 0;
    return [escapeHtml(info.name),
      lgPct(d.rebookPct != null ? d.rebookPct : d.hairRebookPct), lgPct(txPct), lgPct(retPct),
      lgDash(d.hairAvgBill ? lgAed(d.hairAvgBill) : null),
      lgDash(d.beautyAvgBill ? lgAed(d.beautyAvgBill) : null),
      lgNum(d.totalClients), lgNum(d.newClientsTotal), lgNum(d.ncrTotal), lgNum(d.totalRebooked)];
  });
  const hairNetAll = (s.hairServicesIncl || 0) + (s.hairRetailOnly || 0);
  pivRows.push({ total: ['Grand total',
    lgPct(s.rebookPct != null ? s.rebookPct : s.hairRebookPct),
    lgPct((s.hairServicesIncl || 0) ? (s.treatmentSales || 0) / s.hairServicesIncl * 100 : null),
    lgPct(hairNetAll ? (s.hairRetailOnly || 0) / hairNetAll * 100 : null),
    lgDash(s.hairAvgBill ? lgAed(s.hairAvgBill) : null),
    lgDash(s.beautyAvgBill ? lgAed(s.beautyAvgBill) : null),
    lgNum(acc.tc), lgNum(acc.nc), lgNum(acc.ncr), lgNum(acc.rb)] });

  host.innerHTML =
    lgRail([['ltPivot', 'Benchmarks by branch'], ['ltPace', 'Target vs actual']]) +
    lgHeader('Ledgers · Daily Target Sheet',
      `The block she opens the sheet to read: where every branch stands against the month, on live numbers.`,
      ctx) +
    lgSection('ltPivot', '#99F6E4', 'Benchmarks by branch', escapeHtml(lgRangeLabel()),
      lgTable(pivCols, pivRows, {compact:true})) +
    lgSection('ltPace', '#FFD4D9', 'Target vs actual',
      ctx.applies ? escapeHtml(ctx.label) : 'unavailable for this window', paceHtml) +
    `<div class="fine">
      <p><b>The order is hers</b>. The pivot first, then the six pacing blocks — the same reading order as the right-hand block of her SUMMARY tab, which is headed "Daily target sheet". Her sheet runs the blocks three abreast; this runs two, because six columns of a pacing table do not fit three-across on anything narrower than a desktop.</p>
      <p><b>Where the figures come from</b>. Clients, treatment AED and the unit counts are the ledger's own (<code>branch_staff_daily</code>, synced from the daily branch files); revenue is Phorest. Only the target column is hand-maintained, in <code>ledger-targets.js</code>.</p>
    </div>`;

  ['ltPivot','ltPace'].forEach(id => { if (!(id in sectionState)) sectionState[id] = true; });
  restoreSections();
  if (typeof sizeTopbar === 'function') sizeTopbar();
  if (typeof spy === 'function') spy();
}

/* ══════════════════════════════════════════════════════════════
   3 · LEDGERS — ACTUALS vs TARGETS
   "TARA ROSE LADIES SALON — JULY 2026 ACTUALS vs AUGUST 2026 TARGETS", the
   left-hand block of her SUMMARY tab, plus the four branch tabs that repeat it
   branch by branch. One column model throughout, hers:

     Category | Last Month | This Month | Week 00 … Week 04 | MTD | Variance

   The week columns are folded away until you ask for them.
   ══════════════════════════════════════════════════════════════ */
async function renderLedgerActuals() {
  const host = document.getElementById('ledgerActualsContent');
  if (!host) return;
  host.innerHTML = '<div class="loading">Loading data...</div>';

  const ctx = lgTargetContext();
  const series = await lgSeries();
  if (!series) { host.innerHTML = lgEmpty('This page needs a targets file to know which month to read.'); return; }

  // Sheet order, and the group first — the way her tab reads down the page.
  const SHEET_ORDER = ['SAA', 'KCA', 'AQ', 'MC'].filter(c => ACTIVE_BRANCHES.includes(c));
  const rail = [['laAll', 'Group total']].concat(
    SHEET_ORDER.map(c => ['la' + c, (BRANCH_INFO[c] || {}).name || c]));

  host.innerHTML =
    lgRail(rail) +
    lgHeader('Ledgers · Actuals vs Targets',
      `${escapeHtml(series.windows.prev.label)} actuals against ${escapeHtml(series.windows.month.label)} targets, group first and then branch by branch.`,
      ctx) +
    lgSection('laAll', 'var(--hair)', 'Group total — all salons',
      escapeHtml(series.windows.month.label), lgSheetSection(series, null, ctx)) +
    SHEET_ORDER.map(code => {
      const info = BRANCH_INFO[code] || { name: code };
      return lgSection('la' + code, info.color, escapeHtml(info.name),
        escapeHtml(series.windows.month.label), lgSheetSection(series, code, ctx));
    }).join('') +
    `<div class="fine">
      <p><b>This page ignores the date filter, on purpose</b>. Last Month · the weeks · MTD only mean anything against one fixed month, so these tables always read ${escapeHtml(series.windows.month.label)} however the period chips are set. Every other page follows your filter.</p>
      <p><b>Motor City runs hair only</b>, so its beauty rows are absent rather than printed as zeros — the same way her sheet carries it.</p>
    </div>`;

  ['laAll'].concat(SHEET_ORDER.map(c => 'la' + c))
    .forEach(id => { if (!(id in sectionState)) sectionState[id] = true; });
  restoreSections();
  if (typeof sizeTopbar === 'function') sizeTopbar();
  if (typeof spy === 'function') spy();
}

/* ══════════════════════════════════════════════════════════════
   4 · LEDGERS — DAILY STYLIST TARGET
   Her own tab of that name. One row per stylist: services, treatment and retail,
   each as target → actual → variance, then the client counts. Grouped
   branch → department with a totals row, exactly as her tab is.
   ══════════════════════════════════════════════════════════════ */
async function renderLedgerStylist() {
  const host = document.getElementById('ledgerStylistContent');
  if (!host) return;
  host.innerHTML = '<div class="loading">Loading data...</div>';

  const s = await lgSummary();
  if (!s) { host.innerHTML = lgEmpty('No data for this selection.'); return; }

  const ctx      = lgTargetContext();
  const byBranch = (typeof aggByBranch === 'function') ? aggByBranch() : {};
  const codes    = lgBranches();

  // Her column order exactly, under her own bands. Only the two Unit columns are
  // missing, and the note at the foot of the page says why.
  const cols = [
    {label:'Stylist'},{label:'Dept'},
    {label:'Target',align:'r'},{label:'MTD actual',align:'r'},{label:'Variance',align:'r'},
    {label:'Clients',align:'r'},{label:'New',align:'r'},{label:'NCR',align:'r'},
    {label:'Rebooked',align:'r'},{label:'Rebook %',align:'r'},{label:'Avg bill',align:'r'},
    {label:'Target',align:'r'},{label:'MTD actual',align:'r'},{label:'Unit',align:'r'},{label:'Treatment %',align:'r'},
    {label:'Target',align:'r'},{label:'MTD actual',align:'r'},{label:'Unit',align:'r'},{label:'Retail %',align:'r'},
  ];
  const colGroups = [
    { label:'', span:2 },
    { label:'Services',  span:3 },
    { label:'Clients',   span:6 },
    { label:'Treatment', span:4 },
    { label:'Retail',    span:4 },
  ];

  const rows = [];
  codes.forEach(code => {
    const bd = byBranch[code];
    if (!bd) return;
    const info = BRANCH_INFO[code] || { name: code };

    [['HAIR', bd.hairStaff || []], ['BEAUTY', bd.beautyStaff || []]].forEach(([dept, staff]) => {
      if (!staff.length) return;
      rows.push({ group: `${escapeHtml(info.name)} · ${dept === 'HAIR' ? 'Hair' : 'Beauty'}` });

      const tot = { st:0, sa:0, tt:0, ta:0, rt:0, ra:0, c:0, n:0, ncr:0, rb:0, tu:0, ru:0 };
      staff.slice()
        .sort((a, b) => (b[dept === 'BEAUTY' ? 'beautySales' : 'hairSalesNet'] || 0)
                      - (a[dept === 'BEAUTY' ? 'beautySales' : 'hairSalesNet'] || 0))
        .forEach(st => {
          const tg = (typeof ledgerStaffTarget === 'function') ? ledgerStaffTarget(code, dept, st.name) : null;
          const svcA = dept === 'BEAUTY' ? (st.beautySales || 0) : (st.hairSalesNet || 0);
          const txA  = dept === 'BEAUTY' ? 0 : (st.treatments || 0);
          const retA = st.retail || 0;
          // A target of nothing is shown as a dash, never as zero: a stylist who
          // is simply not in the sheet must not read as one who missed by 100%.
          const svcT = ctx.applies && tg ? tg.services  : null;
          const txT  = ctx.applies && tg ? tg.treatment : null;
          const retT = ctx.applies && tg ? tg.retail    : null;
          // No target here, but she has one at another branch — she is covering a
          // shift, or she has moved since the sheet was written. Say which branch
          // rather than leaving a dash that looks like a missing record.
          const away = (!tg && typeof ledgerStaffTargetElsewhere === 'function')
            ? ledgerStaffTargetElsewhere(code, dept, st.name) : null;
          const noTgt = away
            ? `<span class="lg-na">target at ${escapeHtml((BRANCH_INFO[away] || {}).name || away)}</span>`
            : '<span class="lg-na">—</span>';

          tot.sa += svcA; tot.ta += txA; tot.ra += retA;
          tot.st += svcT || 0; tot.tt += txT || 0; tot.rt += retT || 0;
          tot.c += st.total || 0; tot.n += (st.newClients != null ? st.newClients : 0);
          tot.ncr += st.newClientReq || 0; tot.rb += st.rebooked || 0;
          tot.tu += st.treatmentUnits || 0; tot.ru += st.retailUnits || 0;

          rows.push([
            escapeHtml(st.name || '—'), dept === 'HAIR' ? 'Hair' : 'Beauty',
            svcT ? lgAed(svcT) : noTgt, lgAed(svcA),
            svcT ? lgDelta(svcA - svcT, lgAed) : '—',
            lgNum(st.total), lgNum(st.newClients != null ? st.newClients : st.newClientReq),
            lgNum(st.newClientReq), lgNum(st.rebooked), lgPct(st.rebookPct), lgAed(st.avgBill),
            txT ? lgAed(txT) : '<span class="lg-na">—</span>',
            dept === 'BEAUTY' ? '—' : lgAed(txA),
            dept === 'BEAUTY' ? '—' : lgNum(st.treatmentUnits),
            dept === 'BEAUTY' ? '—' : lgPct(st.treatmentPct),
            retT ? lgAed(retT) : '<span class="lg-na">—</span>', lgAed(retA),
            lgNum(st.retailUnits), lgPct(st.retailPct),
          ]);
        });

      rows.push({ total: ['Totals', '',
        tot.st ? lgAed(tot.st) : '—', lgAed(tot.sa), tot.st ? lgDelta(tot.sa - tot.st, lgAed) : '—',
        lgNum(tot.c), lgNum(tot.n), lgNum(tot.ncr), lgNum(tot.rb),
        lgPct(tot.c ? tot.rb / tot.c * 100 : null), lgAed(tot.c ? tot.sa / tot.c : 0),
        tot.tt ? lgAed(tot.tt) : '—', dept === 'BEAUTY' ? '—' : lgAed(tot.ta),
        dept === 'BEAUTY' ? '—' : lgNum(tot.tu),
        dept === 'BEAUTY' ? '—' : lgPct(tot.sa ? tot.ta / tot.sa * 100 : null),
        tot.rt ? lgAed(tot.rt) : '—', lgAed(tot.ra), lgNum(tot.ru),
        lgPct((tot.sa + tot.ra) ? tot.ra / (tot.sa + tot.ra) * 100 : null)] });
    });
  });

  host.innerHTML =
    lgHeader('Ledgers · Daily Target Sheet',
      `Every stylist against her own target — services, treatment and retail.`,
      ctx) +
    (rows.length ? lgTable(cols, rows, {compact:true, groups:colGroups}) : lgEmpty('No staff figures for this window.')) +
    `<div class="fine">
      <p><b>The Unit columns are her own</b>. <code>treatments_unit_qty</code> and <code>retail_unit_qty</code> come off the daily branch ledger, next to the revenue they belong to — how many treatments and how many retail lines, not how much money. Ledger columns, so they carry whatever the branch wrote down; Phorest has no per-stylist equivalent to check them against.</p>
      <p><b>A dash in a target column</b> means that stylist has no target in ${escapeHtml(LEDGER_TARGETS ? LEDGER_TARGETS.source : 'the sheet')} — a new starter, or a leaver still carrying history. It does not mean zero.</p>
      <p><b>"Target at &lt;branch&gt;"</b> means she is taking clients here but her monthly target is written against another branch, so there is nothing to measure this row against. Either she covered a shift, or she has moved and the sheet has not caught up. Worth a look when it is somebody's main branch: as of the August sheet, Irlyn, Grace and Shila are down as Khalifa but working Saadiyat, and Ibrahim and Olena are working Motor City against Al Quoz and Khalifa targets.</p>
    </div>`;

  if (typeof sizeTopbar === 'function') sizeTopbar();
  if (typeof spy === 'function') spy();
}

/* ════════════════════════════════════════════════════════════
   Her four branch tabs used to be a fifth page of their own. They are sections of
   Actuals vs Targets now: the same block per branch, in the same column model as
   the group, which is what her SAA/KCA/MC/AQ tabs actually are. One page, not two.
   ════════════════════════════════════════════════════════════ */