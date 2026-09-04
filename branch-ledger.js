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
   fortnight's takings to a month's target reads as catastrophic failure.

   The three Ledgers pages settle that by not reading the filter at all. They are
   the sheet, so they hold the sheet's window — last month's actuals against this
   month's target, month to date — and the Period chips are greyed out while you
   are on them. The Split chips (MTD · Weekly · Daily) choose how finely the actual
   is cut, and cut columns only: the target and the variance are the same figures
   in all three. See lgLedgerContext() and lgSplit().

   Branch Performance is the page that DOES follow the filter, and it still needs
   the old guard: target columns appear only when the window sits inside the month
   LEDGER_TARGETS holds, and otherwise it says why they are absent rather than
   printing a number that means nothing. That is lgTargetContext(), and it is the
   only caller left. Kate, 14 Aug 2026.
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

// ── COLUMN GRAIN: MTD · WEEKLY · DAILY ───────────────────────
// Kate, 14 Aug 2026. The three Ledgers pages all read one window — last month's
// actuals against this month's target, month to date — because that is what her
// sheet is and every column of it only means something against a fixed month.
// The one question left is how finely the actual is cut, and that is this.
//
// COLUMNS ONLY, and that is the whole contract. Last Month, the target and
// Variance are the same figures in all three modes; switching grain adds or
// removes the split columns in the middle and changes nothing that could make a
// branch read as behind. Pro-rating a monthly target down to a day is a different
// feature and would need its own thinking — this is not it.
//
// Replaces the old "Show week columns" button, which sat on one table, hid the
// columns rather than never rendering them, and could not offer days at all.
let lgGrain = 'mtd';
try {
  const g = localStorage.getItem('lgGrain');
  if (g === 'weekly' || g === 'daily') lgGrain = g;
} catch (e) { /* private mode — the default is fine */ }

const LG_GRAINS = [['mtd', 'MTD'], ['weekly', 'Weekly'], ['daily', 'Daily']];

function lgSetGrain(g) {
  if (g === lgGrain || !LG_GRAINS.some(x => x[0] === g)) return;
  lgGrain = g;
  try { localStorage.setItem('lgGrain', g); } catch (e) { /* ignore */ }
  // Repaint whichever ledger page is on screen. Not refreshActiveView(): the data
  // is already in window._lgSeries, so this is a re-render, not a re-fetch.
  const vis = id => { const n = document.getElementById('view-' + id); return n && n.style.display !== 'none'; };
  if (vis('ledgerTargets')) renderLedgerTargets();
  if (vis('ledgerActuals')) renderLedgerActuals();
  if (vis('ledgerStylist')) renderLedgerStylist();
}

// The chip row, in the masthead filters' own idiom so it reads as a filter and
// not as a widget: same .chip class, same middot separators, same pressed state.
// The delegated handler in dashboard.js only claims #branchChips and #periodChips,
// so these carry their own onclick.
function lgGrainRow() {
  return `<div class="lg-grain">
    <span class="lg-grain-k">Split</span>
    <div class="chipset" role="group" aria-label="Column grain">
      ${LG_GRAINS.map(([k, label], i) =>
        (i ? '<span class="sep">·</span>' : '') +
        `<button type="button" class="chip" aria-pressed="${k === lgGrain}"
           onclick="lgSetGrain('${k}')">${label}</button>`).join('')}
    </div>
  </div>`;
}

// Which columns the current grain puts between the target and the MTD total.
// `key` indexes the buckets lgSeries() builds, so the cells and the headers can
// never drift apart — both come from here.
function lgSplit(series) {
  const w = series.windows;
  if (lgGrain === 'weekly') {
    return { key: 'weeks', windows: w.weeks,
      head: (x, i) => `<span class="lg-wk-k">Week ${String(i).padStart(2, '0')}</span>${x.label}` };
  }
  if (lgGrain === 'daily') {
    return { key: 'days', windows: w.days,
      head: x => `<span class="lg-wk-k">${x.dow}</span>${x.label}` };
  }
  return { key: null, windows: [], head: () => '' };
}

// A grand total across a branch selection, built from the components the
// benchmark ratios divide rather than from the ratios themselves — an average of
// four branches' rebooking rates is not the group's rebooking rate. Comes out
// identical to series.group when every branch is selected.
// Services Total, Kate's definition (3 Sep 2026): hair services with treatments and
// courses taken OUT, plus beauty services, no retail anywhere. It is not the
// summary's servicesTotal (which keeps treatments and courses in, because net take
// does) — so every Ledgers row and block that says "services total" reads this.
// Null when the hair figure is unknown (a Phorest-only month has no treatment AED).
function lgServicesTotal(d) {
  if (!d || d.hairServicesExcl == null) return null;
  return d.hairServicesExcl + (d.beautyServicesTotal || 0);
}
const LG_SERVICES_LABEL = 'Services Total (hair excl. treatments and courses + beauty, no retail)';
const LG_RETAIL_LABEL   = 'Retail Total (Hair + Beauty)';

// Total revenue, Kate's ask (4 Sep 2026): the one line Phorest's Financial Totals
// report prints as its Sales "Total", so a branch block can be checked against that
// report without adding four rows up by hand. Everything the salon took, ex VAT:
//
//   hair revenue (services + treatments + courses)   Phorest "Services" + "Courses"
// + beauty services (beautySales already has courses in it)
// + retail total (Phorest's own branch products line, house account included)
// = total revenue                                    Phorest Sales "Total", Net (Ex VAT)
//
// Two things it is NOT. It is not net take plus vouchers: Phorest's Non-Revenue
// Sales block (vouchers sold, paid into account, account used) is money moving, not
// revenue, and stays out. And courses here are courses PERFORMED, where Phorest's
// Total counts courses SOLD — August group was 2,623 performed, so the two reports
// can differ by a low four figures on that line alone.
//
// Unlike lgServicesTotal this survives a Phorest-only month: nothing is subtracted,
// so an unknown treatment figure cannot make it null. Null only when the window has
// no revenue of any kind, which prints a dash rather than a zero.
function lgTotalRevenue(d) {
  if (!d) return null;
  const parts = [d.hairServicesIncl, d.beautyServicesTotal, d.retailTotal];
  if (parts.every(v => v == null)) return null;
  return parts.reduce((t, v) => t + (Number(v) || 0), 0);
}
const LG_TOTAL_LABEL  = 'Total revenue (services + treatments + courses + retail, ex VAT)';
// No total-revenue line in the target sheet, so it is built from the two targets
// that between them cover the same ground — see ledgerBranchTarget().
const LG_TOTAL_TARGET = ['servicesTotal', 'retailTotal'];
// Services Total is Kate's excl-treatments definition, so it is read against the
// sheet's services target with the treatment target taken back off. Kate, 4 Sep
// 2026: without this the row compared an actual with treatments stripped out
// against a target that had them in, and printed a −254k group variance that was
// mostly the treatment line. See ledgerBranchTarget() for what is still left in.
const LG_SERVICES_TARGET = ['servicesTotal', '-hairTreatment'];

function lgRollup(list) {
  const t = {
    servicesTotal:0, retailTotal:0, hairServicesIncl:0, hairRetailOnly:0, treatmentSales:0,
    beautyServicesTotal:0, hairTotalClients:0, beautyTotalClients:0,
    totalClients:0, newClientsTotal:0, ncrTotal:0, totalRebooked:0, beautyRebookedCount:0,
    // Carried through the rollup so a multi-branch selection can still say how much of
    // its retail nobody was credited with — see the RETAIL note in dashboard.js.
    retailAttributed:0, retailUnattributed:0,
    // Kate's revenue vocabulary (3 Sep 2026): courses and the unit counts ride along
    // so the eleven-line revenue block rolls up for any branch selection.
    beautyRetailOnly:0, hairCourses:0, beautyCourses:0,
    hairTreatmentUnits:0, hairRetailUnits:0, beautyRetailUnits:0,
  };
  const keys = Object.keys(t);
  (list || []).filter(Boolean).forEach(s => keys.forEach(k => { t[k] += Number(s[k]) || 0; }));
  t.hairRevenue      = t.hairServicesIncl;
  t.hairServicesExcl = t.hairServicesIncl - t.treatmentSales - t.hairCourses;
  t.servicesExclTotal = t.hairServicesExcl + t.beautyServicesTotal;
  t.rebookPct     = t.totalClients       ? t.totalRebooked / t.totalClients * 100        : null;
  t.hairAvgBill   = t.hairTotalClients   ? t.hairServicesIncl / t.hairTotalClients       : null;
  t.beautyAvgBill = t.beautyTotalClients ? t.beautyServicesTotal / t.beautyTotalClients  : null;
  return t;
}

// One row's worth of split cells. `pick` reads a summary; nulls are days the
// branch was shut or has not reached yet, and print as a dash rather than 0.
function lgSplitCells(series, bucket, pick, fmt) {
  const sp = lgSplit(series);
  if (!sp.key) return [];
  const cells = bucket && bucket[sp.key] ? bucket[sp.key] : [];
  return sp.windows.map((x, i) => {
    const s = cells[i];
    if (!s) return '—';
    const v = pick(s);
    return v == null ? '—' : fmt(v);
  });
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

// The same thing for the three Ledgers pages, which do NOT read the page filter.
//
// lgTargetContext() above exists to protect the filter-driven pages from reading a
// fortnight against a month's target. The Ledgers pages have no such problem:
// their window IS the ledger month by construction — last month's actuals, this
// month's target, month to date — so the target always applies and there is
// nothing to warn about. They used to call lgTargetContext() anyway, which is why
// Actuals vs Targets printed "target, variance and % done are hidden" in a warning
// stripe directly above a table showing all three. Same shape as the other
// context so lgHeader() takes either.
// Since the Month picker landed there IS one thing to warn about: the month on
// screen may be outside the one target sheet that is keyed in. That is the only
// case — the window still cannot disagree with itself the way the filter's can.
function lgLedgerContext(series) {
  const w = series.windows;
  const through = w.days.length ? w.days[w.days.length - 1].to : null;
  if (!lgTargetsApply()) {
    const sheetMonth = (typeof LEDGER_TARGETS !== 'undefined' && LEDGER_TARGETS)
      ? lgMonthLabel(LEDGER_TARGETS.month) : null;
    return {
      applies: false,
      label: w.month.label,
      rangeLabel: `${shortD(w.prev.from)} – ${shortD(w.month.to)}`,
      note: `Actuals only for ${w.month.label}. `
        + (sheetMonth
            ? `The one target sheet keyed in is ${sheetMonth}, so Target, Variance, % done and Remaining are hidden rather than compared against the wrong month. `
            : `No target sheet is loaded, so the target columns are hidden. `)
        + `Benchmarks still stand — a ratio is a ratio in any month. Switch Month back to ${sheetMonth || 'the sheet\'s month'} for the pacing columns.`,
    };
  }
  return {
    applies: true,
    label: w.month.label,
    // The window these pages actually cover, for lgHeader's standing line. Without
    // it the line printed lgRangeLabel() — the filter's range — on three pages that
    // do not read the filter, which is the same lie the warning stripe used to tell.
    rangeLabel: `${shortD(w.prev.from)} – ${shortD(through || w.month.to)}`,
    note: `${w.prev.label} actuals against the full ${w.month.label} target`
      + (through ? `, month to date to ${shortD(through)}` : '')
      + `. % done is raw progress through the target, not paced against days elapsed — the same way the ledger reads it. `
      + `The Period chips do not apply on the Ledgers pages: Month above picks which month all three read, and Split chooses how finely the actual is cut.`,
  };
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
// cols: [{ label, align, w }]  ·  rows: [[cell, …]] or {group:'Label', id?} or {total:[…]}
//
// The sheet's week columns used to be built here, always in the DOM and hidden by
// a toggle. They are lgSplit()'s job now — the Split chips decide whether the
// middle of the table is nothing, five weeks or a column per day, and the columns
// are rendered only when they are asked for.
function lgTable(cols, rows, opts) {
  const o = opts || {};
  const cls = i => (cols[i] && cols[i].align === 'r') ? 'r' : '';
  const head = cols.map((c, i) =>
    `<th class="${cls(i)}" ${c.w ? `style="width:${c.w}"` : ''}>${c.label}</th>`).join('');
  const body = rows.map(r => {
    if (r && r.group) {
      // `id` makes a group row a rail destination. Daily Stylist Target is one
      // long table rather than a stack of sections, so its branch·department
      // headings are the only thing there is to jump to.
      return `<tr class="lg-grp"${r.id ? ` id="${r.id}"` : ''}><td colspan="${cols.length}"><span class="lg-grp-t">${r.group}</span></td></tr>`;
    }
    const cells = (r && r.total) ? r.total : r;
    const rowCls = (r && r.total) ? ' class="lg-tot"' : '';
    return `<tr${rowCls}>${cells.map((c, i) => `<td class="${cls(i)}">${c}</td>`).join('')}</tr>`;
  }).join('');
  // opts.groups: [{label, span}] — the banded header her Daily Stylist Target tab
  // runs above the columns (SERVICES · CLIENTS · TREATMENT · RETAIL). Without it
  // the row reads as seventeen unrelated numbers, which is exactly the thing the
  // banding on her sheet is there to prevent.
  // The label sits in its own span so stickLgHead() can slide it along the band
  // as you scroll sideways — a label centred over a span wider than the viewport
  // is off-screen for most of the scroll, which read as the bands vanishing.
  const groupRow = o.groups ? `<tr class="lg-band">${o.groups.map(g =>
    `<th colspan="${g.span}" class="${g.label ? '' : 'lg-band-x'}">${g.label ? `<span class="lg-band-t">${g.label}</span>` : ''}</th>`).join('')}</tr>` : '';
  // .lg-sx is the fixed frame the fade sits on; .lg-wrap inside it is what actually
  // scrolls. A pseudo-element on the scroller itself would scroll away with the
  // content, which is exactly when you need it.
  return `<div class="lg-sx"><div class="lg-wrap"><table class="lg tabular${o.compact ? ' lg-compact' : ''}">
    <thead>${groupRow}<tr>${head}</tr></thead><tbody>${body}</tbody></table></div></div>`;
}

// Say out loud that a table scrolls sideways.
//
// Kate, 14 Aug 2026: a seventeen-column table in a 1,200px box clips its Variance
// column, and a figure cut off mid-word reads as a broken page rather than as one
// you can scroll. Three marks, set from the scroll position:
//
//   sx    scrollable at all — shows the scrollbar rather than leaving it to the
//         browser's fade-away overlay, which is invisible until you already know
//   sx-l  scrolled off the first column, so the frozen column casts a shadow and
//         reads as pinned instead of as an odd gap in the numbers
//   sx-r  there is more to the right — the edge fades, and it stops fading at the end
//
// A ResizeObserver rather than a resize listener: a table inside a collapsed
// section measures zero, so it has to be re-marked when the section opens.
function lgWatchScroll(root) {
  (root || document).querySelectorAll('.lg-sx > .lg-wrap').forEach(w => {
    const mark = () => {
      const max = w.scrollWidth - w.clientWidth;
      w.classList.toggle('sx',   max > 1);
      w.classList.toggle('sx-l', w.scrollLeft > 1);
      w.classList.toggle('sx-r', max > 1 && w.scrollLeft < max - 1);
      // The floated thead pins its first cells and slides its band labels by
      // hand (see stickLgHead) — both depend on scrollLeft, so a sideways
      // scroll has to re-run it, not just the vertical one.
      if (typeof stickLgHead === 'function') stickLgHead();
    };
    if (!w._lgSx) {
      w._lgSx = true;
      w.addEventListener('scroll', mark, { passive: true });
      if (typeof ResizeObserver === 'function') new ResizeObserver(mark).observe(w);
    }
    mark();
  });
}

// The collapsible shell, reusing Organisation Pulse's own section chrome so these
// pages feel like the same dashboard rather than a bolted-on report.
function lgSection(id, dotColor, title, subtitle, bodyHtml) {
  return `
    <div class="support-section" id="sec-${id}" style="margin-bottom:14px">
      <div class="support-section-hdr" onclick="toggleSection('${id}')">
        <div style="display:flex;align-items:center;gap:8px;min-width:0">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${dotColor};flex-shrink:0"></span>
          <span style="font-family:'Playfair Display',serif;font-style:italic;font-weight:600;font-size:18px;letter-spacing:0.02em;color:var(--text)">${title}</span>
          ${subtitle ? `<span style="font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${subtitle}</span>` : ''}
        </div>
        <span id="arrow-${id}" class="support-toggle-arrow">▸</span>
      </div>
      <div id="body-${id}" class="support-section-body" style="padding:14px 6px 6px">${bodyHtml}</div>
    </div>`;
}

// Every page opens with the same standing line: what you are looking at, over
// what window, and whether targets are in play.
function lgHeader(title, standfirst, ctx) {
  // ctx.rangeLabel is the Ledgers pages saying "this is my window, not the filter's".
  // Everything else falls back to the filter, which is what it is reading.
  return `
    <div class="lg-head">
      <div class="lg-head-k">${escapeHtml(lgBranchLabel())} · ${escapeHtml(ctx.rangeLabel || lgRangeLabel())}</div>
      <h1>${title}</h1>
      <p class="lg-stand">${standfirst}</p>
      <p class="lg-note ${ctx.applies ? '' : 'off'}">${ctx.applies ? '✦ ' : '⚠ '}${ctx.note}</p>
    </div>`;
}

function lgEmpty(msg) {
  return `<div class="empty">${msg}</div>`;
}

// The "on this page" rail — Organisation Pulse's own side rail, not a lookalike.
// Same .side-nav markup and the same classes, so it inherits the Pulse's type,
// spacing and lit-state, and spy() in index.html lights the section you are in.
//
// Kate, 14 Aug 2026: it used to be a row of chips, on the reasoning that these
// pages have no side gutter. They have one now above 1400px — see .lg-shell — and
// below that the same links lie back down into the chip row. One markup, because
// two would drift.
//
// Pass [[id, label, jump?], …]. `id` is either a collapsible section's own id
// (lgSection renders it as sec-<id>) or an id already in the document, which is how
// the stylist table's branch rows are reached — lgAnchor() resolves both, and so
// does spy(). `jump` overrides the click handler for a page that already knows how
// to scroll itself: Stylist Cards has a sticky density bar to clear as well as the
// masthead, and jumpToStylistBranch() is where that arithmetic lives.
//
// Not ledger-only despite the lg- prefix: Stylist Cards uses this too. If a third
// page outside the ledger wants one, this pair is worth moving to dashboard.js.
function lgRail(items) {
  if (!items || !items.length) return '';
  return `<aside class="lg-side">
    <nav class="side-nav" aria-label="On this page">
      <div class="side-k">On this page</div>
      ${items.map(([id, label, jump]) =>
        `<a href="#${id}" onclick="${jump || `lgJump(event,'${id}')`}">${escapeHtml(label)}</a>`).join('')}
    </nav>
  </aside>`;
}

// Rail in the gutter, page beside it. The header, the note and the Split chips
// stay full width above this — they describe the whole page, so indenting them
// into the document column would leave the rail floating beside nothing.
function lgShell(railItems, bodyHtml) {
  return `<div class="lg-shell">${lgRail(railItems)}<div class="lg-doc">${bodyHtml}</div></div>`;
}

// What a rail entry points at: a collapsible section if there is one, otherwise an
// id that is already in the document. spy() resolves the same two ways.
function lgAnchor(id) {
  return document.getElementById('sec-' + id) || document.getElementById(id);
}

// Scroll to a section, opening it first if it is collapsed — a rail link that
// lands you on a closed heading looks like it did nothing. sectionState is the
// shared open/closed map the whole dashboard uses, so this asks it rather than
// reading the DOM. The masthead is fixed, hence the offset.
function lgJump(e, id) {
  if (e) e.preventDefault();
  const el = lgAnchor(id);
  if (!el) return;
  if (document.getElementById('sec-' + id) && typeof sectionState !== 'undefined'
      && !sectionState[id] && typeof toggleSection === 'function') toggleSection(id);
  const bar = parseInt(getComputedStyle(document.documentElement)
    .getPropertyValue('--topbar-cond-h'), 10) || 104;
  window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - bar - 8, behavior: 'smooth' });
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

/* ── WHICH MONTH THESE PAGES READ ──────────────────────────────
   Kate, 14 Aug 2026: "july and aug lang? pwede ba mamili".

   It used to be exactly two months, and not by choice: every window came off
   LEDGER_TARGETS.month, so the pages could only ever show the month the target
   sheet was written for and the one before it. The actuals go back to January —
   that is how far the Staff Performance Overview backfill reaches — and there was
   no way to look at them.

   So the month is a control now, and the TARGET is what does or does not follow it.
   One target sheet is hand-keyed at a time (see ledger-targets.js), so on any other
   month the pages drop Target · Variance · % done · Remaining and say why, rather
   than measure June's takings against the August sheet. Actuals, benchmarks and
   growth are unaffected — a ratio is a ratio in any month.

   When a past target sheet is keyed in, this is the only thing that has to change:
   LEDGER_TARGETS becomes a map by month and lgTargetsApply() asks it for the
   selected one. Nothing on the pages needs to know.
   ────────────────────────────────────────────────────────────── */
const LG_FIRST_MONTH = '2025-01';   // where the Phorest backfill starts (opened to 2025 on 3 Sep 2026)

let lgMonth = (typeof LEDGER_TARGETS !== 'undefined' && LEDGER_TARGETS) ? LEDGER_TARGETS.month : null;
try {
  const m = localStorage.getItem('lgMonth');
  if (m && /^\d{4}-\d{2}$/.test(m) && m >= LG_FIRST_MONTH && m <= lgThisMonth()) lgMonth = m;
} catch (e) { /* private mode — the target sheet's own month is a fine default */ }

function lgThisMonth() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
}

// "August 2026" from a Date or a 'YYYY-MM'.
function lgMonthLabel(x) {
  const d = (x instanceof Date) ? x : new Date(Number(x.slice(0, 4)), Number(x.slice(5, 7)) - 1, 1);
  return `${HERO_MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

// Does the hand-keyed target sheet cover the month on screen? Everything that
// prints a target asks this first.
function lgTargetsApply() {
  return typeof LEDGER_TARGETS !== 'undefined' && !!LEDGER_TARGETS && lgMonth === LEDGER_TARGETS.month;
}

// Every month with figures, newest first — the picker's options.
function lgMonthOptions() {
  const out = [];
  const [fy, fm] = LG_FIRST_MONTH.split('-').map(Number);
  const now = new Date();
  for (let d = new Date(now.getFullYear(), now.getMonth(), 1);
       d >= new Date(fy, fm - 1, 1);
       d.setMonth(d.getMonth() - 1)) {
    out.push([`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, lgMonthLabel(d)]);
  }
  return out;
}

function lgSetMonth(m) {
  if (!m || m === lgMonth) return;
  lgMonth = m;
  try { localStorage.setItem('lgMonth', m); } catch (e) { /* ignore */ }
  // A different month is a different fetch, unlike Split — drop the cache and let
  // the page reload its own series.
  window._lgSeries = null;
  const vis = id => { const n = document.getElementById('view-' + id); return n && n.style.display !== 'none'; };
  // Financial Totals ignores Split — a monthly report cut by day reconciles
  // against nothing — but the Month picker is the one control that does move it.
  if (vis('ledgerFinancials')) renderLedgerFinancials();
  if (vis('ledgerTargets')) renderLedgerTargets();
  if (vis('ledgerActuals')) renderLedgerActuals();
  if (vis('ledgerStylist')) renderLedgerStylist();
}

// The month picker, sitting in the same bar as Split so the two controls that
// actually move these pages are in one place. Two selects, month and year: one
// list was fine at eight months, but the backfill reaches January 2025 now and
// twenty-odd "Month Year" lines stopped reading as a picker (Kate, 3 Sep 2026).
// Months outside the data window (before the first month, after this one) are
// disabled rather than hidden, so the list keeps its shape from year to year.
function lgMonthRow() {
  const [cy, cm] = (lgMonth || lgThisMonth()).split('-').map(Number);
  const [fy, fm] = LG_FIRST_MONTH.split('-').map(Number);
  const [ty, tm] = lgThisMonth().split('-').map(Number);
  const monthOpts = HERO_MONTH_NAMES.map((name, i) => {
    const m = i + 1;
    const off = (cy === fy && m < fm) || (cy === ty && m > tm);
    return `<option value="${m}"${m === cm ? ' selected' : ''}${off ? ' disabled' : ''}>${name}</option>`;
  }).join('');
  let yearOpts = '';
  for (let y = ty; y >= fy; y--) yearOpts += `<option value="${y}"${y === cy ? ' selected' : ''}>${y}</option>`;
  return `<div class="lg-grain lg-month">
    <span class="lg-grain-k">Month</span>
    <select class="lg-month-sel" data-part="m" aria-label="Ledger month" onchange="lgPickMonth(this)">${monthOpts}</select>
    <select class="lg-month-sel" data-part="y" aria-label="Ledger year" onchange="lgPickMonth(this)">${yearOpts}</select>
    ${lgTargetsApply() ? '' : '<span class="lg-month-warn">actuals only — no target sheet for this month</span>'}
  </div>`;
}

// Reads both selects and clamps to the data window: picking 2025 while on
// September lands on December 2025, picking this year while on December lands on
// this month. The page re-renders through lgSetMonth, which redraws the row, so a
// clamped pick shows what it actually did.
//
// Reads the row the change came from, not an id: all three Ledgers pages carry
// this row and stay in the DOM when hidden, so getElementById found whichever page
// was rendered first and February on Actuals vs Targets read January off the
// hidden Daily Target Sheet and did nothing (Kate, 3 Sep 2026).
function lgPickMonth(el) {
  const row = el && el.closest ? el.closest('.lg-month') : null;
  const mEl = row && row.querySelector('.lg-month-sel[data-part="m"]');
  const yEl = row && row.querySelector('.lg-month-sel[data-part="y"]');
  if (!mEl || !yEl) return;
  let y = Number(yEl.value), m = Number(mEl.value);
  const [fy, fm] = LG_FIRST_MONTH.split('-').map(Number);
  const [ty, tm] = lgThisMonth().split('-').map(Number);
  if (y === fy && m < fm) m = fm;
  if (y === ty && m > tm) m = tm;
  const v = `${y}-${String(m).padStart(2, '0')}`;
  if (v === lgMonth) { document.querySelectorAll('.lg-month').forEach(n => n.outerHTML = lgMonthRow()); return; }
  lgSetMonth(v);
}

// Last month, every week column, and the month itself — the windows behind each
// column of her table. Follows the Month picker, not the targets file.
function lgMonthWindows() {
  if (!lgMonth) return null;
  const [y, m] = lgMonth.split('-').map(Number);
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
  // Every day of the month, for the Daily grain. lgSeries() trims the tail to the
  // last day that has data, so a table on the 14th carries 14 columns and not 31
  // with 17 dashes on the end.
  const days = [];
  for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
    days.push({
      from: new Date(d), to: new Date(d),
      label: `${lgDayNum(d)} ${MON_SHORT[d.getMonth()]}`,
      dow: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()],
    });
  }

  // Labels are derived from the month itself rather than read off LEDGER_TARGETS.label
  // / .prevLabel — those are only right for the one month the sheet was written for,
  // and the picker can be anywhere.
  const prevFrom = new Date(y, m - 2, 1);
  return {
    prev:  { from: prevFrom, to: new Date(y, m - 1, 0), label: lgMonthLabel(prevFrom) },
    month: { from: first, to: last, label: lgMonthLabel(first) },
    weeks,
    days,
  };
}

// Every window aggregated, for the group and for each branch.
//
// One fetch covering last month and this month, then sliced in memory: the
// alternative is a dozen round trips for a table nobody has scrolled to yet.
// Cached against the target month, so switching pages does not refetch, and a
// new month's targets file invalidates it on its own.
// Cached against the target month only, never against the grain: all three grains
// are slices of the same one fetch, so switching Split is instant.
async function lgSeries() {
  const w = lgMonthWindows();
  if (!w) return null;
  if (window._lgSeries && window._lgSeries.month === lgMonth) return window._lgSeries;

  const [branchRows, phorestRows] = await Promise.all([
    loadBranchStaffDailyRange(w.prev.from, w.month.to),
    loadPhorestStaffDailyRange(w.prev.from, w.month.to),
  ]);

  const cut = (rows, from, to, code) => {
    const f = lgYmd(from), t = lgYmd(to);
    return rows.filter(r => {
      const d = String(r.date || '').slice(0, 10);
      if (d < f || d > t) return false;
      // The group is the four live branches, the same four that get their own
      // section, so the total always equals the sum of what is on the page.
      // Fratelli's 2025 rows are in the table but it is not a branch here any more.
      return code ? r.branch === code : ACTIVE_BRANCHES.includes(r.branch);
    });
  };
  // aggDailyData takes daily_data rows first; [] because branch_staff_daily is
  // present for every window here and is the source of truth once it is.
  //
  // The full record is kept, not just the summary: Daily Stylist Target needs the
  // per-stylist arrays for the same windows, and aggregating them twice is how the
  // two pages would end up disagreeing about one stylist's week.
  const agg = (from, to, code) => {
    const b = cut(branchRows, from, to, code);
    const p = cut(phorestRows, from, to, code);
    // A window with Phorest rows and no ledger rows (2025) still aggregates:
    // aggDailyData builds the maps from Phorest alone and nulls the ledger-only
    // figures, and the tables print those as dashes (Kate, 3 Sep 2026).
    if (!b.length && !p.length) return null;
    return aggDailyData([], b, p) || null;
  };

  const forCode = code => {
    const prev  = agg(w.prev.from,  w.prev.to,  code);
    const mtd   = agg(w.month.from, w.month.to, code);
    const weeks = w.weeks.map(x => agg(x.from, x.to, code));
    const days  = w.days.map(x  => agg(x.from, x.to, code));
    return {
      // Summaries — what every table on these pages reads.
      prev:  prev && prev.summary,
      mtd:   mtd  && mtd.summary,
      weeks: weeks.map(r => r && r.summary),
      days:  days.map(r  => r && r.summary),
      // The same windows with their stylist arrays intact.
      staff: { mtd, weeks, days },
    };
  };

  const series = { month: lgMonth, windows: w, group: forCode(null) };
  ACTIVE_BRANCHES.forEach(code => { series[code] = forCode(code); });

  // Trim the day columns to the last day the group has figures for. Anything past
  // that is the future, and a run of empty columns reads as missing data.
  const lastDay = series.group.days.reduce((last, s, i) => (s ? i : last), -1);
  if (lastDay > -1 && lastDay < w.days.length - 1) {
    const keep = lastDay + 1;
    w.days.length = keep;
    [series.group].concat(ACTIVE_BRANCHES.map(c => series[c])).forEach(b => {
      b.days.length = keep;
      b.staff.days.length = keep;
    });
  }

  window._lgSeries = series;
  return series;
}

// ── THE ROWS ─────────────────────────────────────────────────
// Her row order, her row names, and the target key each one is measured against.
// `fmt` decides money vs count; `ratio` marks the benchmark rows, which are
// percentages of their own window rather than something that can be summed.
const LG_SHEET_ROWS = [
  // Kate's eleven revenue lines, her order, 3 Sep 2026, under a total-revenue line
  // added 4 Sep 2026 so the block opens on the figure Phorest's Financial Totals
  // report leads with. The target sits on HAIR
  // REVENUE (treatments and courses in, retail out): that is the figure the Monday
  // sheet's "hair services" number always was, which is how Khalifa's +14k read as
  // a 42k shortfall in the September leadership call. Hair services and courses are
  // its parts and carry no target of their own. The # rows are counts off the ledger.
  { group: 'Revenue' },
  // Everything the branch took, first, so the block opens on the figure the
  // Financial Totals report opens on. The lines below are its parts.
  { label: LG_TOTAL_LABEL,                                  key: LG_TOTAL_TARGET,  pick: lgTotalRevenue, tot: true },
  { label: LG_SERVICES_LABEL,                               key: LG_SERVICES_TARGET, pick: lgServicesTotal },
  { label: LG_RETAIL_LABEL,                                 key: 'retailTotal',    pick: d => d.retailTotal },
  { label: 'Hair revenue (incl. treatments and courses)',   key: 'hairRevenue',    pick: d => d.hairServicesIncl },
  { label: 'Hair services (excl. treatments and courses)',  key: null,             pick: d => d.hairServicesExcl },
  { label: 'Hair treatments revenue',                       key: 'hairTreatment',  pick: d => d.treatmentSales, ledger: true },
  { label: '# hair treatments sold',                        key: null,             pick: d => d.hairTreatmentUnits, num: true, ledger: true },
  { label: 'Hair courses revenue (performed)',              key: null,             pick: d => d.hairCourses },
  { label: 'Hair retail revenue',                           key: 'hairRetail',     pick: d => d.hairRetailOnly },
  { label: '# hair retail sold',                            key: null,             pick: d => d.hairRetailUnits, num: true, ledger: true },
  { label: 'Beauty services revenue',                       key: 'beautyServices', pick: d => d.beautyServicesTotal, beauty: true },
  { label: 'Beauty retail revenue',                         key: null,             pick: d => d.beautyRetailOnly, beauty: true },
  { label: '# beauty retail sold',                          key: null,             pick: d => d.beautyRetailUnits, num: true, beauty: true, ledger: true },
  { group: 'Clients' },
  { label: 'Beauty Rebooked', key: 'beautyRebooked', pick: d => d.beautyRebookedCount, num: true, beauty: true },
  { label: 'Rebooked',        key: 'rebooked',       pick: d => d.totalRebooked,   num: true },
  { label: 'Total Clients',   key: 'totalClients',   pick: d => d.totalClients,    num: true },
  { label: 'New Clients',     key: 'newClients',     pick: d => d.newClientsTotal, num: true },
  { label: 'NCR',             key: 'ncr',            pick: d => d.ncrTotal,        num: true },
  { group: 'Benchmarks' },
  { label: 'Rebooking %',   bm: 'rebookPct',    pick: d => (d.rebookPct != null ? d.rebookPct : d.hairRebookPct), ratio: true },
  { label: 'Treatment %',   bm: 'treatmentPct', pick: d => (d.treatmentSales == null || !(d.hairServicesIncl || 0)) ? null : d.treatmentSales / d.hairServicesIncl * 100, ratio: true },
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

  const sp = lgSplit(series);
  const cols = [{ label: 'Category / Metric' }, { label: w.prev.label, align: 'r' }, { label: 'This Month', align: 'r' }]
    .concat(sp.windows.map((x, i) => ({ label: sp.head(x, i), align: 'r' })))
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
        .concat(lgSplitCells(series, bucket, r.pick, f))
        .concat([act != null ? f(act) : '—',
                 act == null ? '—' : (act >= tgt ? '<span class="lg-up">✓ on target</span>' : lgDelta(act - tgt, f))]));
      return;
    }

    // null, not 0, when the window has the figure nowhere (a Phorest-only month has
    // no ledger client book): the cell prints a dash and no target is paced on it.
    const mtdRaw = bucket.mtd ? r.pick(bucket.mtd) : null;
    const mtd = mtdRaw == null ? 0 : mtdRaw;
    // The target is not gated on the page filter here, unlike Branch Performance:
    // this table's window IS a whole ledger month by construction, whatever the
    // Period chips say. It IS gated on the Month picker — a total can only be read
    // against the month the sheet was written for. The Target and Variance columns
    // stay in place either way, because the Benchmarks group below needs them and a
    // table cannot change its column count halfway down.
    const target = (r.key && ctx.applies) ? ledgerBranchTarget(r.key, code ? [code] : null) : null;
    const p = (target != null && mtdRaw != null) ? ledgerPace(mtd, target) : null;
    const noTarget = ctx.applies
      ? '<span class="lg-na">no target</span>'
      : `<span class="lg-na">no ${escapeHtml(w.month.label)} sheet</span>`;

    const cells = [r.label + (r.ledger ? ' <span class="lg-tag">LEDGER</span>' : ''),
      bucket.prev ? (r.pick(bucket.prev) == null ? '—' : fmt(r.pick(bucket.prev))) : '—',
      target != null ? fmt(target) : noTarget]
      .concat(lgSplitCells(series, bucket, s => r.pick(s), fmt))
      .concat([mtdRaw == null ? '—' : fmt(mtd), p ? lgDelta(p.variance, fmt) : '—']);
    // `tot` is the total-revenue line, set in bold on its own rule so it reads as
    // the sum of the block rather than as another line in it.
    rows.push(r.tot ? { total: cells } : cells);
  });

  return lgTable(cols, rows, { compact: true }) + lgIdentityNote(bucket.mtd);
}

// ── THE TWO IDENTITIES ───────────────────────────────────────
// Kate, 3 Sep 2026: printed under every revenue block so anyone can check the
// lines add up before quoting one in a meeting.
//   hair revenue + beauty services = services total
//   hair retail  + beauty retail   = retail total
// A tick is within a dirham; a cross means the figures came from different places
// and the block should not be trusted until someone finds out why.
function lgIdentityNote(s) {
  if (!s) return '';
  // `parts` is [label, amount] pairs, so a two-term identity and the three-term
  // total-revenue one print in the same shape and are checked the same way.
  const lineOf = (parts, tL, t) => {
    const sum = parts.reduce((n, p) => n + p[1], 0);
    const ok  = Math.abs(sum - t) < 1;
    return `<span class="${ok ? 'lg-up' : 'lg-down'}">${ok ? '✓' : '✗'}</span> `
      + parts.map(p => `${p[0]} ${lgAed(p[1])}`).join(' + ')
      + ` = ${tL} ${lgAed(t)}`;
  };
  const line = (aL, a, bL, b, tL, t) => lineOf([[aL, a], [bL, b]], tL, t);
  let split = '';
  if ((s.retailUnattributed || 0) >= 1) {
    const share = (s.retailHairShare == null) ? null : Math.round(s.retailHairShare * 100);
    split = ` &nbsp;·&nbsp; ${lgAed(s.retailUnattributed)} of retail was rung with no stylist against it and is shared between the two departments in proportion to the retail that was credited` +
      (share == null ? '.' : ` (${share}% hair, ${100 - share}% beauty here).`);
  }
  return `<div class="foot">` +
    line('Hair services (excl. treatments and courses)', s.hairServicesExcl || 0, 'beauty services', s.beautyServicesTotal || 0, 'services total', lgServicesTotal(s) || 0) + '<br>' +
    line('Hair retail', s.hairRetailOnly || 0, 'beauty retail', s.beautyRetailOnly || 0, 'retail total', s.retailTotal || 0) + '<br>' +
    lineOf([['Hair revenue (incl. treatments and courses)', s.hairServicesIncl || 0],
            ['beauty services', s.beautyServicesTotal || 0],
            ['retail total', s.retailTotal || 0]], 'total revenue', lgTotalRevenue(s) || 0) +
    split + `</div>`;
}

/* ══════════════════════════════════════════════════════════════
   GROWTH: THIS WINDOW AGAINST THE ONE BEFORE IT
   Kate, 14 Aug 2026. Branch Performance could say how big a branch is and how far
   through its target it is. It could not say whether it is growing, which is the
   first thing anybody asks of a branch.

   THE WHOLE DIFFICULTY IS THE COMPARISON WINDOW, and it is not "last month".

   1. The window is capped at the last day that actually has data. The filter's
      default runs to today, the ledger syncs a day or two behind, and those empty
      days would be counted as trading days worth nothing.
   2. The previous window is then exactly as many days, ending the day before this
      one starts. 44 days against 44 days, never 44 against a calendar month.

   Get either wrong and every branch reads as collapsing mid-month, which is the
   same failure the ledger pages avoid by refusing the filter altogether. This page
   keeps the filter — that is its job — so it has to do the arithmetic instead.

   One fetch pair per window, cached against the window, because the branch chips
   change which cards are drawn and not what was fetched.
   ══════════════════════════════════════════════════════════════ */
const BP_SPARK_BUCKETS = 8;

async function bpGrowth() {
  if (!dateFrom || !dateTo) return null;          // no window, no like-for-like
  const key = `${lgYmd(dateFrom)}|${lgYmd(dateTo)}`;
  if (window._bpGrowth && window._bpGrowth.key === key) return window._bpGrowth;

  const curB = await loadBranchStaffDailyRange(dateFrom, dateTo);
  if (!curB.length) return null;

  // The last day with a ledger row inside the window. Read off the rows in hand
  // rather than the freshness badge: this has to be the last day of THIS window,
  // which on a historic range is not the last day the branches synced.
  const lastStr = curB.reduce((m, r) => {
    const d = String(r.date || '').slice(0, 10);
    return d > m ? d : m;
  }, '');
  const effTo = new Date(lastStr + 'T00:00:00');
  if (isNaN(effTo)) return null;
  const days = Math.round((effTo - dateFrom) / 86400000) + 1;
  if (days < 2) return null;                      // a single day has nothing to trend

  const prevTo   = new Date(dateFrom); prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo);   prevFrom.setDate(prevFrom.getDate() - (days - 1));

  const [curP, prevB, prevP] = await Promise.all([
    loadPhorestStaffDailyRange(dateFrom, effTo),
    loadBranchStaffDailyRange(prevFrom, prevTo),
    loadPhorestStaffDailyRange(prevFrom, prevTo),
  ]);

  const cut = (rows, from, to, code) => {
    const f = lgYmd(from), t = lgYmd(to);
    return rows.filter(r => {
      const d = String(r.date || '').slice(0, 10);
      if (d < f || d > t) return false;
      // The group is the four live branches, the same four that get their own
      // section, so the total always equals the sum of what is on the page.
      // Fratelli's 2025 rows are in the table but it is not a branch here any more.
      return code ? r.branch === code : ACTIVE_BRANCHES.includes(r.branch);
    });
  };
  const agg = (b, p, from, to, code) => {
    const bb = cut(b, from, to, code), pp = cut(p, from, to, code);
    if (!bb.length && !pp.length) return null; // Phorest-only windows (2025) still aggregate
    const r = aggDailyData([], bb, pp);
    return r ? r.summary : null;
  };

  // The sparkline's buckets: equal slices of the window, so the line is the shape
  // of this period rather than of the calendar. Eight is enough to see a direction
  // and few enough that a fortnight still has something in each one.
  const buckets = [];
  const per = days / BP_SPARK_BUCKETS;
  for (let i = 0; i < BP_SPARK_BUCKETS; i++) {
    const f = new Date(dateFrom); f.setDate(f.getDate() + Math.floor(i * per));
    const t = new Date(dateFrom); t.setDate(t.getDate() + Math.ceil((i + 1) * per) - 1);
    if (t > effTo) t.setTime(effTo.getTime());
    buckets.push({ from: f, to: t });
  }

  const forCode = code => ({
    cur:  agg(curB,  curP,  dateFrom, effTo,   code),
    prev: agg(prevB, prevP, prevFrom, prevTo,  code),
    spark: buckets.map(x => {
      const s = agg(curB, curP, x.from, x.to, code);
      return s ? (s.netTake || 0) : 0;
    }),
  });

  const out = {
    key, days,
    windows: {
      cur:  { from: dateFrom, to: effTo },
      prev: { from: prevFrom, to: prevTo },
      // The filter asked for more than the data covers. Said out loud on the page:
      // it is the difference between "we dipped" and "it has not synced yet".
      trimmed: lgYmd(effTo) !== lgYmd(dateTo) ? lgYmd(dateTo) : null,
    },
    group: forCode(null),
  };
  ACTIVE_BRANCHES.forEach(code => { out[code] = forCode(code); });
  window._bpGrowth = out;
  return out;
}

// Growth as the page states it: a percentage when there is a base to divide by, and
// "no base" when the previous window is empty. A branch that took nothing last
// period and something this period has not grown by infinity.
function bpDelta(cur, prev) {
  const c = Number(cur) || 0, p = Number(prev) || 0;
  if (!p) return { pct: null, dir: c > 0 ? 'up' : 'flat', cur: c, prev: p };
  const pct = (c - p) / p * 100;
  return { pct, dir: Math.abs(pct) < 0.5 ? 'flat' : (pct > 0 ? 'up' : 'down'), cur: c, prev: p };
}

// The signed figure, in the page's own three colours. `pts` for the ratios, where a
// percentage-point move is the honest unit — "rebooking up 12%" of 20% is 22.4%, and
// nobody reads it that way.
function bpChip(label, value, fmt, d, pts) {
  const arrow = d.dir === 'up' ? '▲' : d.dir === 'down' ? '▼' : '–';
  const cls   = d.dir === 'up' ? 'lg-up' : d.dir === 'down' ? 'lg-down' : 'lg-flat';
  const move  = pts
    ? (d.pct == null ? '—' : `${d.cur - d.prev > 0 ? '+' : ''}${Math.round(d.cur - d.prev)} pts`)
    : (d.pct == null ? 'no base' : `${d.pct > 0 ? '+' : ''}${d.pct.toFixed(1)}%`);
  return `<div class="bp-chip">
    <span class="bp-chip-k">${label}</span>
    <span class="bp-chip-v tabular">${fmt(value)}</span>
    <span class="bp-chip-d ${cls} tabular">${arrow} ${move}</span>
  </div>`;
}

// Sparkline. Flat line when every bucket is equal — a zero-height polyline would
// vanish and read as missing rather than as steady.
function bpSpark(values) {
  const v = (values || []).map(x => Number(x) || 0);
  if (v.length < 2) return '';
  const max = Math.max(...v), min = Math.min(...v);
  const span = max - min || 1;
  const pts = v.map((x, i) => {
    const px = i / (v.length - 1) * 200;
    const py = 30 - ((x - min) / span) * 26;
    return `${px.toFixed(1)},${py.toFixed(1)}`;
  }).join(' ');
  return `<svg class="bp-spark" viewBox="0 0 200 34" preserveAspectRatio="none" aria-hidden="true">
    <polyline points="${pts}"/>
  </svg>`;
}

// One card per branch, plus the group. Ordered by take, so the card order is also
// the ranking and the eye does not have to hunt for the biggest branch.
function bpGrowthCards(g, codes) {
  const cards = codes.slice()
    .filter(code => g[code] && g[code].cur)
    .sort((a, b) => (g[b].cur.netTake || 0) - (g[a].cur.netTake || 0))
    .map((code, i) => {
      const info = BRANCH_INFO[code] || { name: code };
      const c = g[code].cur, p = g[code].prev;
      const take = bpDelta(c.netTake, p && p.netTake);
      const rank = ['1st by take', '2nd by take', '3rd by take', '4th by take'][i] || '';
      const hairOnly = !((c.beautyTotalClients || 0) || (c.beautyServicesTotal || 0));
      return `<div class="card bp-gc" style="--b:${info.color};--bl:${info.colorLight || info.color}">
        <div class="bp-gc-hd">
          <span class="bp-gc-dot"></span>
          <span class="bp-gc-nm">${escapeHtml(info.name)}</span>
          <span class="bp-gc-rk">${rank}</span>
        </div>
        <div class="bp-gc-v tabular">${lgAed(c.netTake)}</div>
        <div class="bp-gc-sub">net take · ${lgNum(c.totalClients)} clients${hairOnly ? ' · hair only' : ''}</div>
        <div class="bp-gc-g">
          <span class="bp-gc-pct tabular ${take.dir}">${take.pct == null ? '—'
            : `${take.pct > 0 ? '+' : ''}${take.pct.toFixed(1)}%`}</span>
          <span class="bp-gc-vs">${p ? `${lgAed(p.netTake)} last period` : 'nothing last period'}</span>
        </div>
        ${bpSpark(g[code].spark)}
        <div class="bp-chips">
          ${bpChip('Clients', c.totalClients, lgNum, bpDelta(c.totalClients, p && p.totalClients))}
          ${bpChip('Hair avg bill', c.hairAvgBill, lgAed, bpDelta(c.hairAvgBill, p && p.hairAvgBill))}
          ${bpChip('Rebooking', lgPct(c.rebookPct), x => x,
            bpDelta(c.rebookPct, p && p.rebookPct), true)}
        </div>
      </div>`;
    }).join('');
  return `<div class="bp-growth">${cards}</div>`;
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
  // Kate's eleven lines in her order (3 Sep 2026) under the total-revenue line
  // (4 Sep 2026) — see LG_SHEET_ROWS for why the
  // target sits on hair REVENUE. Fifth element marks a count, formatted as a number.
  const revenueRows = [
    [LG_TOTAL_LABEL,                                 LG_TOTAL_TARGET,  lgTotalRevenue(s), false, false, true],
    [LG_SERVICES_LABEL,                              LG_SERVICES_TARGET, lgServicesTotal(s)],
    [LG_RETAIL_LABEL,                                'retailTotal',    s.retailTotal],
    ['Hair revenue (incl. treatments and courses)',  'hairRevenue',    s.hairServicesIncl],
    ['Hair services (excl. treatments and courses)', null,             s.hairServicesExcl],
    ['Hair treatments revenue',                      'hairTreatment',  s.treatmentSales, true],
    ['# hair treatments sold',                       null,             s.hairTreatmentUnits, true, true],
    ['Hair courses revenue (performed)',             null,             s.hairCourses],
    ['Hair retail revenue',                          'hairRetail',     s.hairRetailOnly],
    ['# hair retail sold',                           null,             s.hairRetailUnits, true, true],
    ['Beauty services revenue',                      'beautyServices', s.beautyServicesTotal],
    ['Beauty retail revenue',                        null,             s.beautyRetailOnly],
    ['# beauty retail sold',                         null,             s.beautyRetailUnits, true, true],
  ];

  const revCols = ctx.applies
    ? [{label:'Metric'},{label:'Actual',align:'r'},{label:'Target',align:'r'},
       {label:'Variance',align:'r'},{label:'% done',align:'r',w:'116px'},{label:'Remaining',align:'r'}]
    : [{label:'Metric'},{label:'Actual',align:'r'}];

  // Sixth element is the total-revenue line — bold, on its own rule, the same way
  // the Ledgers block sets it.
  const revBody = revenueRows.map(([label, key, actual, isLedger, isCount, isTotal]) => {
    const tag = isLedger ? ' <span class="lg-tag">LEDGER</span>' : '';
    const f   = isCount ? lgNum : lgAed;
    const out = cells => (isTotal ? { total: cells } : cells);
    if (!ctx.applies) return out([label + tag, f(actual)]);
    if (!key)         return out([label + tag, f(actual), '<span class="lg-na">no target</span>', '—', '—', '—']);
    const t = ledgerBranchTarget(key, codes);
    const p = ledgerPace(actual, t);
    return out([label + tag, f(p.actual), f(p.target),
            lgDelta(p.variance, f), lgDoneBar(p.pctDone), f(p.remaining)]);
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
  // Growth first: "is this branch moving" comes before "how big is it". Null when
  // the filter has no window, or when the window is one day — see bpGrowth().
  const g = await bpGrowth();
  const growthHtml = g
    ? `<div class="bp-winbar">
         <span><b>${escapeHtml(shortD(g.windows.cur.from))} – ${escapeHtml(shortD(g.windows.cur.to))}</b>
           against <b>${escapeHtml(shortD(g.windows.prev.from))} – ${escapeHtml(shortD(g.windows.prev.to))}</b>
           · ${g.days} days each · like-for-like</span>
         ${g.windows.trimmed ? `<span class="bp-trim">Your filter runs to ${escapeHtml(shortD(dateTo))};
           the ledger has synced to ${escapeHtml(shortD(g.windows.cur.to))}, so the window stops there
           rather than counting unsynced days as days that took nothing.</span>` : ''}
       </div>
       ${bpGrowthCards(g, codes)}`
    : lgEmpty('Growth needs a date window to compare against the one before it. Pick a period above.');

  host.innerHTML =
    lgHeader('Branch Performance',
      `The shape of the period: which branch is growing, where the money came from, how far through the target each one is, and which benchmarks are carrying it.`,
      ctx) +
    lgShell([['bpGrowth','Growth']]
      .concat(g ? [['bpRead','The read']] : [])
      .concat([['bpMix','Revenue mix'], ['bpPace','Against target'],
               ['bpBench','Benchmarks'], ['bpClients','Clients'], ['bpStaff','Staff']]),
    warnHtml +
    lgSection('bpGrowth', 'var(--good)', 'Growth',
      g ? escapeHtml(`${g.days} days vs the ${g.days} before`) : 'needs a window', growthHtml) +
    // The read. Filled by bnRender() after this HTML is in the DOM — it paints the
    // rules copy synchronously and then upgrades it if the Edge Function answers.
    (g ? lgSection('bpRead', 'var(--beauty)', 'The read',
      'what each branch is good and bad at, and one action',
      '<div id="bpReadHost"><div class="loading">Reading the figures…</div></div>') : '') +
    lgSection('bpMix', '#FFD4D9', 'Revenue mix', escapeHtml(lgBranchLabel()),
      `<div class="bp-chart"><canvas id="bpMixChart"></canvas></div>
       <div class="foot">Stacked, so the height is the branch's net take and the bands are where it came from. Hover a band for the figure.</div>` +
      lgTable(revCols, revBody) + lgIdentityNote(s)) +
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
      <p><b>How growth is measured</b>. This window against the one immediately before it, at the same number of days, ending the day before this one starts — never against a calendar month, which would read a fortnight as a collapse. The window is capped at the last day the ledger has actually synced, so unsynced days are not counted as days that took nothing. Percentages are money and counts; rebooking moves in <b>points</b>, because a rise from 20% to 32% is 12 points and not 60%.</p>
    </div>`);

  ['bpGrowth','bpRead','bpMix','bpPace','bpBench','bpClients','bpStaff']
    .forEach(id => { if (!(id in sectionState)) sectionState[id] = true; });
  restoreSections();
  bpDrawCharts(codes, ctx);
  // Not awaited: the rules copy paints on the first tick and the model's copy, if it
  // arrives at all, replaces it in place. Nothing below this needs either.
  if (g && typeof bnRender === 'function') bnRender('bpReadHost', g, codes);
  if (typeof sizeTopbar === 'function') sizeTopbar();
  lgWatchScroll();
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
  const font = { family: 'Inter', size: 13 };
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
  // Stacked to net take, in Kate's five parts (3 Sep 2026: courses came out of hair
  // services, so they need their own band or the stack stops summing to net take).
  // Beauty is included even when zero (Motor City) so the branches stay comparable.
  mk('bpMixChart', {
    type: 'bar',
    data: { labels: names, datasets: [
      { label: 'Hair services',      data: pull(d => d.hairServicesExcl),    backgroundColor: '#C4B5FD' },
      { label: 'Treatments',         data: pull(d => d.treatmentSales),      backgroundColor: '#99F6E4' },
      { label: 'Hair courses',       data: pull(d => d.hairCourses),         backgroundColor: '#BFDBFE' },
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
      ['Salon total services', LG_SERVICES_TARGET, lgServicesTotal],
      ['Salon total retail (hair + beauty)', 'retailTotal', d => d.retailTotal],
      ['Hair revenue',         'hairRevenue',      d => d.hairServicesIncl],
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
      {label:'Stylist'},{label:'Services excl. tx & courses',align:'r'},{label:'Treatments',align:'r'},
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

// First name and surname, set the way the stylist cards set them — the first name
// in caps carrying the weight, the surname after it in a lighter face. Kate, 14 Aug
// 2026: the ledger writes first names only, and half of them in caps and half in
// title case ("KATE" beside "Lizanie"), so this normalises the case as well.
//
// The surname comes from staff-profiles.js, which covers the beauty bench and the
// leavers as well as the card roster. No surname on record = first name alone.
function lgPersonName(name) {
  if (!name) return '—';
  const first = escapeHtml(String(name).trim().toUpperCase());
  const last  = (typeof staffSurname === 'function') ? staffSurname(name) : null;
  return last ? `${first} <span class="lg-last">${escapeHtml(last)}</span>` : first;
}

// A stylist's name, with her services target against it when one exists. The
// target is monthly, so it is only shown when the window makes it meaningful.
function lgStaffName(code, dept, st, ctx) {
  const name = lgPersonName(st.name);
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

   Kate, 14 Aug 2026: this page read the page filter and therefore lost its target
   columns on any window that was not wholly inside August — including the default
   one. It reads the ledger month now, like the other two Ledgers pages, and the
   Split chips cut the actual into weeks or days.
   ══════════════════════════════════════════════════════════════ */
async function renderLedgerTargets() {
  const host = document.getElementById('ledgerTargetsContent');
  if (!host) return;
  host.innerHTML = '<div class="loading">Loading data...</div>';

  const series = await lgSeries();
  if (!series) { host.innerHTML = lgEmpty('This page needs a targets file to know which month to read.'); return; }

  const ctx   = lgLedgerContext(series);
  const codes = lgBranches();
  const sp    = lgSplit(series);
  // The branch filter still applies — only the period is fixed — so the grand
  // total is rolled up from the branches on screen rather than read off the group.
  const roll  = lgRollup(codes.map(c => series[c] && series[c].mtd));

  // The six pacing blocks, in the sheet's own order and with its own titles.
  // `pick` pulls the actual for one branch's summary; `key` is the target field.
  const BLOCKS = [
    { title:'Salon total services (hair excl. treatments and courses + beauty)', key:LG_SERVICES_TARGET, pick: lgServicesTotal },
    { title:'Salon total retail (hair + beauty)', key:'retailTotal', pick: d => d.retailTotal },
    { title:'Hair treatment',       key:'hairTreatment',    pick: d => d.treatmentSales },
    { title:'Hair revenue (incl. treatments and courses)', key:'hairRevenue', pick: d => d.hairServicesIncl },
    { title:'Hair retail',          key:'hairRetail',       pick: d => d.hairRetailOnly },
    { title:'Beauty services',      key:'beautyServices',   pick: d => d.beautyServicesTotal },
  ];

  // Target and the four pacing columns are fixed; the split columns sit between
  // them, so the eye still lands on Target → MTD → Variance in every mode.
  //
  // On a month the target sheet does not cover, the five target-side columns are not
  // shown at all — unlike Actuals vs Targets, this page has no benchmark rows that
  // need them, and five columns of dashes read as a broken page. What is left is
  // still worth having: each branch's actual for the month, cut by week or by day.
  const showTargets = ctx.applies;
  const paceCols = [{label:'Branch'}]
    .concat(showTargets ? [{label:'Target',align:'r'}] : [])
    .concat(sp.windows.map((x, i) => ({ label: sp.head(x, i), align:'r' })))
    .concat([{label:'MTD actual',align:'r'}])
    .concat(showTargets
      ? [{label:'Variance',align:'r'},{label:'% done',align:'r',w:'116px'},{label:'Remaining',align:'r'}]
      : []);

  const paceHtml = BLOCKS.map(b => {
    let tA = 0, aA = 0;
    const rows = codes.map(code => {
      const bucket = series[code];
      const info = BRANCH_INFO[code] || { name: code };
      const actual = (bucket && bucket.mtd) ? (b.pick(bucket.mtd) || 0) : 0;
      const target = showTargets ? ledgerBranchTarget(b.key, [code]) : 0;
      tA += target; aA += actual;
      const p = ledgerPace(actual, target);
      const split = lgSplitCells(series, bucket, s => b.pick(s) || 0, lgAed);
      if (!showTargets) {
        return [escapeHtml(info.name)].concat(split).concat([lgAed(actual)]);
      }
      // Motor City has no beauty team, so a beauty row for it is a real zero and
      // not a gap to chase. Say so instead of showing −AED 0 at 0%.
      if (!target && !actual) {
        return [escapeHtml(info.name), '—'].concat(split.map(() => '—'))
          .concat(['—', '<span class="lg-na">n/a</span>', '—', '—']);
      }
      return [escapeHtml(info.name), lgAed(p.target)].concat(split)
        .concat([lgAed(p.actual), lgDelta(p.variance, lgAed), lgDoneBar(p.pctDone), lgAed(p.remaining)]);
    });
    const g = ledgerPace(aA, tA);
    const gSplit = sp.key
      ? sp.windows.map((x, i) => lgAed(codes.reduce((sum, code) => {
          const s = series[code] && series[code][sp.key] && series[code][sp.key][i];
          return sum + (s ? (b.pick(s) || 0) : 0);
        }, 0)))
      : [];
    rows.push({ total: ['Grand total']
      .concat(showTargets ? [lgAed(g.target)] : [])
      .concat(gSplit)
      .concat([lgAed(g.actual)])
      .concat(showTargets
        ? [lgDelta(g.variance, lgAed), lgDoneBar(g.pctDone), lgAed(g.remaining)]
        : []) });
    return `<div class="lg-block"><div class="lg-block-k">${b.title}</div>${lgTable(paceCols, rows, {compact:true})}</div>`;
  }).join('');

  // Her sheet lays these six out three abreast, in two rows. So does this, once
  // there is room for it — the wrapper was missing, which is why they ran as one
  // column of six down a page you had to scroll to compare anything. On Weekly and
  // Daily the tables are far wider than a third of the page, so they go full width
  // and stack instead of being squeezed into a column you cannot read.
  const paceGridHtml = sp.key
    ? paceHtml
    : `<div class="lg-pace-grid">${paceHtml}</div>`;

  // The per-branch benchmark pivot from the top of her panel.
  const pivCols = [
    {label:'Branch'},{label:'Rebooking %',align:'r'},{label:'Treatment %',align:'r'},
    {label:'Retail %',align:'r'},{label:'Hair avg bill',align:'r'},{label:'Beauty avg bill',align:'r'},
    {label:'Total clients',align:'r'},{label:'New',align:'r'},{label:'NCR',align:'r'},{label:'Rebooked',align:'r'},
  ];
  const pivRows = codes.map(code => {
    const d = series[code] && series[code].mtd;
    const info = BRANCH_INFO[code] || { name: code };
    if (!d) return [escapeHtml(info.name), '—','—','—','—','—','—','—','—','—'];
    const hairNet = (d.hairServicesIncl || 0) + (d.hairRetailOnly || 0);
    // Ledger-only figures (treatment, NCR, rebooked) are null on a Phorest-only
    // month, and print as a dash, not a 0 nobody earned (Kate, 3 Sep 2026).
    const txPct   = (d.treatmentSales == null || !(d.hairServicesIncl || 0)) ? null : d.treatmentSales / d.hairServicesIncl * 100;
    const retPct  = hairNet ? (d.hairRetailOnly || 0) / hairNet * 100 : null;
    const count   = v => (v == null ? '—' : lgNum(v));
    return [escapeHtml(info.name),
      lgPct(d.rebookPct != null ? d.rebookPct : d.hairRebookPct), lgPct(txPct), lgPct(retPct),
      lgDash(d.hairAvgBill ? lgAed(d.hairAvgBill) : null),
      lgDash(d.beautyAvgBill ? lgAed(d.beautyAvgBill) : null),
      count(d.totalClients), count(d.newClientsTotal), count(d.ncrTotal), count(d.totalRebooked)];
  });
  const hairNetAll = roll.hairServicesIncl + roll.hairRetailOnly;
  // The rollup sums nulls as 0, so it has to be told: if no selected branch has a
  // ledger this month, the ledger-only totals are unknown too.
  const anyLedger = codes.some(c => series[c] && series[c].mtd && !series[c].mtd._phorestOnly);
  const rollCount = v => (anyLedger ? lgNum(v) : '—');
  pivRows.push({ total: ['Grand total',
    anyLedger ? lgPct(roll.rebookPct) : '—',
    anyLedger ? lgPct(roll.hairServicesIncl ? roll.treatmentSales / roll.hairServicesIncl * 100 : null) : '—',
    lgPct(hairNetAll ? roll.hairRetailOnly / hairNetAll * 100 : null),
    lgDash(roll.hairAvgBill ? lgAed(roll.hairAvgBill) : null),
    lgDash(roll.beautyAvgBill ? lgAed(roll.beautyAvgBill) : null),
    lgNum(roll.totalClients), lgNum(roll.newClientsTotal), rollCount(roll.ncrTotal), rollCount(roll.totalRebooked)] });

  const paceTitle = showTargets ? 'Target vs actual' : 'Actuals by branch';
  host.innerHTML =
    lgHeader('Ledgers · Daily Target Sheet',
      `The block she opens the sheet to read: where every branch stands against the month, on live numbers.`,
      ctx) +
    lgMonthRow() +
    lgGrainRow() +
    lgShell([['ltPivot', 'Benchmarks by branch'], ['ltPace', paceTitle]],
    lgSection('ltPivot', '#99F6E4', 'Benchmarks by branch',
      escapeHtml(series.windows.month.label + ' · month to date'),
      lgTable(pivCols, pivRows, {compact:true})) +
    lgSection('ltPace', '#FFD4D9', paceTitle, escapeHtml(ctx.label), paceGridHtml + lgIdentityNote(roll)) +
    `<div class="fine">
      <p><b>The order is hers</b>. The pivot first, then the six pacing blocks — the same reading order as the right-hand block of her SUMMARY tab, which is headed "Daily target sheet". On MTD the blocks run three abreast like hers on a wide screen, two on a laptop and one on a phone: a six-column pacing table stops being readable below about 460px, so the row count gives way rather than the figures.</p>
      <p><b>The pivot always reads month to date</b>, whatever Split is set to. A benchmark is a ratio of its own window — Rebooking %, Treatment %, an average bill — so cutting it by week would give four branches × ten metrics × five weeks, which is a worksheet and not a read. The pacing blocks below are where the weeks and days live.</p>
      <p><b>Where the figures come from</b>. Clients, treatment AED and the unit counts are the ledger's own (<code>branch_staff_daily</code>, synced from the daily branch files); revenue is Phorest, VAT exclusive throughout, to match the target sheet's own basis. Only the target column is hand-maintained, in <code>ledger-targets.js</code> — which is why <b>Month</b> above can reach any month back to January 2025 but the target columns only appear on ${escapeHtml(LEDGER_TARGETS ? lgMonthLabel(LEDGER_TARGETS.month) : 'the sheet\'s month')}.</p>
    </div>`);

  ['ltPivot','ltPace'].forEach(id => { if (!(id in sectionState)) sectionState[id] = true; });
  restoreSections();
  if (typeof sizeTopbar === 'function') sizeTopbar();
  lgWatchScroll();
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

  const series = await lgSeries();
  if (!series) { host.innerHTML = lgEmpty('This page needs a targets file to know which month to read.'); return; }
  const ctx = lgLedgerContext(series);

  // Sheet order, and the group first — the way her tab reads down the page.
  const SHEET_ORDER = ['SAA', 'KCA', 'AQ', 'MC'].filter(c => ACTIVE_BRANCHES.includes(c));
  const rail = [['laAll', 'Group total']].concat(
    SHEET_ORDER.map(c => ['la' + c, (BRANCH_INFO[c] || {}).name || c]));

  host.innerHTML =
    lgHeader('Ledgers · Actuals vs Targets',
      ctx.applies
        ? `${escapeHtml(series.windows.prev.label)} actuals against ${escapeHtml(series.windows.month.label)} targets, group first and then branch by branch.`
        : `${escapeHtml(series.windows.prev.label)} against ${escapeHtml(series.windows.month.label)}, group first and then branch by branch — actuals only, no target sheet for this month.`,
      ctx) +
    lgMonthRow() +
    lgGrainRow() +
    lgShell(rail,
    lgSection('laAll', 'var(--hair)', 'Group total — all salons',
      escapeHtml(series.windows.month.label), lgSheetSection(series, null, ctx)) +
    SHEET_ORDER.map(code => {
      const info = BRANCH_INFO[code] || { name: code };
      return lgSection('la' + code, info.color, escapeHtml(info.name),
        escapeHtml(series.windows.month.label), lgSheetSection(series, code, ctx));
    }).join('') +
    `<div class="fine">
      <p><b>The Ledgers pages ignore the Period chips, on purpose</b>. Last Month · the split columns · MTD only mean anything against one whole month, so these pages read ${escapeHtml(series.windows.prev.label)} against ${escapeHtml(series.windows.month.label)} — and it is <b>Month</b> above, not the Period chips, that moves them. <b>Split</b> then chooses how finely the actual is cut: MTD for the month in one column, Weekly for her Week 00–04, Daily for a column per day. Every page outside Ledgers follows your filter as before.</p>
      <p><b>Motor City runs hair only</b>, so its beauty rows are absent rather than printed as zeros — the same way her sheet carries it.</p>
    </div>`);

  ['laAll'].concat(SHEET_ORDER.map(c => 'la' + c))
    .forEach(id => { if (!(id in sectionState)) sectionState[id] = true; });
  restoreSections();
  if (typeof sizeTopbar === 'function') sizeTopbar();
  lgWatchScroll();
  if (typeof spy === 'function') spy();
}

/* ══════════════════════════════════════════════════════════════
   3b · LEDGERS — FINANCIAL TOTALS
   Kate, 4 Sep 2026, holding Phorest's Financial Totals PDF beside the Ledgers
   page: the report leads with one figure per branch and the dashboard made you
   add four rows up by hand to reach it. This page is that report's Sales block,
   every branch at once, so a month can be checked against Phorest without opening
   four PDFs.

   PHOREST'S SHAPE, NOT THE LEDGER'S. Every other Ledgers page is Emma's coaching
   vocabulary — hair excl. treatments, beauty services, retail. This one is
   Phorest's: Services, Courses, Products, Total, and the same 5% VAT split the
   report prints. The two describe the same money and cut it differently, and the
   whole use of this page is that it cuts it the way the report you are checking
   against does.

   WHAT IT DELIBERATELY DOES NOT SHOW. The report's other blocks — Non-Revenue
   Sales (vouchers sold, paid into account, account used), Pay Outs, Payment Types,
   Total Banked — are branch-level money movements, and nothing in Supabase holds
   them: every feed here is staff-level daily. They would need their own upload.
   Rather than scaffold four empty tables, the page says so once at the foot.

   MONTHLY ONLY. No Split chips: the report is a monthly document, and a Financial
   Totals figure cut by day is not a thing anyone reconciles against.

   WHAT IT IS FOR, in Kate's words (4 Sep 2026): "ang gagamitin kong benchmark for
   cross checking any discrepancies from SPO and ledgers". So it is a reference
   page and not a finance one. Phorest's own report is the outside figure; every
   other page here is derived from the Staff Performance Overview upload and the
   branch ledger, and when those two disagree with each other this is the third
   thing to hold them against. That is why the second section is a list of what
   will and will not tie out rather than more numbers: a gap of the size the
   courses line can open is expected, and anything bigger points at a stage of the
   upload pipeline rather than at arithmetic on this page.
   ══════════════════════════════════════════════════════════════ */

// UAE VAT, flat 5% on services, courses and products alike. Taken from the report
// rather than assumed: its VAT Breakdown block prints "@ 5%" on both lines, and
// 495,571.41 + 1,428.57 = 496,999.98 against 24,848.52 VAT is exactly 5% to the fils.
const LG_VAT = 0.05;

// The report's Sales block for one summary. Phorest's Services line has courses
// OUT of it — they are the line below — where the dashboard's hair and beauty
// service figures both have them in, so they come back off here.
function lgFinancials(s) {
  if (!s) return null;
  const courses  = (s.hairCourses || 0) + (s.beautyCourses || 0);
  const services = (s.hairServicesIncl || 0) + (s.beautyServicesTotal || 0) - courses;
  const products = s.retailTotal || 0;
  const net      = services + courses + products;
  return { services, courses, products, net, vat: net * LG_VAT, gross: net * (1 + LG_VAT) };
}

async function renderLedgerFinancials() {
  const host = document.getElementById('ledgerFinancialsContent');
  if (!host) return;
  host.innerHTML = '<div class="loading">Loading data...</div>';

  const series = await lgSeries();
  if (!series) { host.innerHTML = lgEmpty('This page needs a targets file to know which month to read.'); return; }

  const w = series.windows;
  const SHEET_ORDER = ['SAA', 'KCA', 'AQ', 'MC'].filter(c => ACTIVE_BRANCHES.includes(c));

  // Ex VAT down the side, because that is the figure everything else on the
  // dashboard is in and the one a target is set against. VAT and the gross follow
  // so the row can be read straight off against the report's own three columns.
  const cols = [{ label: 'Branch' },
    { label: 'Services',      align: 'r' },
    { label: 'Courses',       align: 'r' },
    { label: 'Products',      align: 'r' },
    { label: 'Total (Ex VAT)', align: 'r' },
    { label: 'VAT @ 5%',      align: 'r' },
    { label: 'Total (Inc VAT)', align: 'r' },
    { label: 'vs ' + escapeHtml(w.prev.label), align: 'r' }];

  const rowFor = (label, s, prev) => {
    const f = lgFinancials(s);
    if (!f) return [label, '—', '—', '—', '—', '—', '—', '—'];
    const p = lgFinancials(prev);
    return [label, lgAed(f.services), lgAed(f.courses), lgAed(f.products),
      lgAed(f.net), lgAed(f.vat), lgAed(f.gross),
      p ? lgDelta(f.net - p.net, lgAed) : '—'];
  };

  const rows = SHEET_ORDER
    .map(code => {
      const b = series[code];
      const info = BRANCH_INFO[code] || { name: code };
      return b && b.mtd ? rowFor(escapeHtml(info.name), b.mtd, b.prev) : null;
    })
    .filter(Boolean);
  rows.push({ total: rowFor('All salons', series.group && series.group.mtd, series.group && series.group.prev) });

  const g = lgFinancials(series.group && series.group.mtd);

  host.innerHTML =
    lgHeader('Ledgers · Financial Totals',
      `Phorest's Financial Totals Sales block, every branch at once, for ${escapeHtml(w.month.label)}. `
      + `The figure to check a branch's report against is <b>Total (Ex VAT)</b>.`,
      { applies: true, label: w.month.label, rangeLabel: `${shortD(w.month.from)} – ${shortD(w.month.to)}`,
        note: `${escapeHtml(w.month.label)}, month to date, against ${escapeHtml(w.prev.label)}. `
          + `Monthly only: the report is a monthly document, so the Split chips do not apply here. `
          + `Month above picks which month this reads.` }) +
    lgMonthRow() +
    lgShell([['fnSales', 'Sales'], ['fnCheck', 'Checking against Phorest']],
    lgSection('fnSales', 'var(--hair)', 'Sales', escapeHtml(w.month.label),
      lgTable(cols, rows) +
      `<div class="foot">Services has courses taken out of it, the way Phorest's report splits them —
        every other page on this dashboard carries courses inside the service figure.
        VAT is 5% on all three lines, which is what the report's own VAT Breakdown block applies.</div>`) +
    lgSection('fnCheck', '#C4B5FD', 'Checking against Phorest', 'what will and will not tie out',
      `<div class="fine" style="margin:0">
        <p><b>How to check one</b>. Open Phorest → Financial Totals for one branch and one month, and
        put the Sales block's <code>Total</code>, <code>Net (Ex VAT)</code> beside this page's
        Total (Ex VAT) for the same branch. Compare ex VAT, never the gross Total column: the rest of
        the dashboard is ex VAT throughout, and read against the gross the two will look wrong together
        for no reason other than the 5%.</p>
        <p><b>Expect a gap on courses</b>, and only on courses. Phorest counts courses <i>sold</i>;
        every figure here counts courses <i>performed</i>, because Phorest's staff export gives a
        "Courses (perf)" column and nothing anywhere gives courses sold. That whole line is worth
        ${g ? lgAed(g.courses) : 'a low four figures'} across the group this month, so the gap it can
        open is smaller still: Saadiyat reads AED 517,888 here against the August report's
        AED 518,674, which is AED 786 on half a million. A gap much larger than that is something
        else, and is worth chasing.</p>
        <p><b>The rest of the report</b> is not held anywhere yet. Non-Revenue Sales (vouchers sold and
        topped up, paid into account, vouchers used, account used), Pay Outs, Payment Types
        (cash · card · Stripe · Tabby) and Total Banked are branch-level money movements, and every
        feed behind this dashboard is staff-level daily takings, so none of them can be derived from
        what is loaded. They would need an upload of their own. Vouchers are the one worth having
        soonest: an unredeemed voucher is money owed, and there is nowhere to see the balance.</p>
      </div>`) +
    `<div class="fine">
      <p><b>Where these come from</b>. The same summaries every other Ledgers page reads — Phorest's
      staff daily export for revenue, with retail taken from Phorest's branch TOTAL products line so the
      house-account share is not lost. Recut into the report's four lines here and nowhere else.</p>
      <p><b>Motor City runs hair only</b>, so its figures are hair and retail throughout.</p>
    </div>`);

  ['fnSales', 'fnCheck'].forEach(id => { if (!(id in sectionState)) sectionState[id] = true; });
  restoreSections();
  if (typeof sizeTopbar === 'function') sizeTopbar();
  lgWatchScroll();
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

  const series = await lgSeries();
  if (!series) { host.innerHTML = lgEmpty('This page needs a targets file to know which month to read.'); return; }

  const ctx   = lgLedgerContext(series);
  const codes = lgBranches();
  const sp    = lgSplit(series);

  // Services per stylist for one aggregated window, keyed the way the targets file
  // is keyed — canonical name, so Lucia and Lucy are one person across the weeks.
  const canon = n => String((typeof canonicalStaffName === 'function'
    ? canonicalStaffName(n) : n) || '').trim().toUpperCase();
  const svcOf = (st, dept) => dept === 'BEAUTY' ? (st.beautySales || 0) : (st.hairSalesNet || 0);
  const svcMap = (rec, dept) => {
    const m = {};
    if (!rec) return m;
    ((dept === 'BEAUTY' ? rec.beautyStaff : rec.hairStaff) || []).forEach(st => {
      const k = canon(st.name);
      m[k] = (m[k] || 0) + svcOf(st, dept);
    });
    return m;
  };

  // Her column order exactly, under her own bands. Only the two Unit columns are
  // missing, and the note at the foot of the page says why. The split columns sit
  // inside the Services band: services is the figure her stylist conversations run
  // on, and nineteen columns already fill the width without cutting treatment and
  // retail by day as well.
  // On a month the sheet does not cover, the three Target columns and the services
  // Variance come out rather than printing nineteen columns with four of them dashed.
  // The bands have to be re-spanned with them — a colspan that no longer matches its
  // columns silently shifts every heading one to the left.
  const showTargets = ctx.applies;
  const tgtCol = showTargets ? [{label:'Target',align:'r'}] : [];
  const splitCols = sp.windows.map((x, i) => ({ label: sp.head(x, i), align:'r' }));
  const cols = [{label:'Stylist'},{label:'Dept'}]
    .concat(tgtCol)
    .concat(splitCols)
    .concat([{label:'MTD actual',align:'r'}])
    .concat(showTargets ? [{label:'Variance',align:'r'}] : [])
    .concat([
    {label:'Clients',align:'r'},{label:'New',align:'r'},{label:'NCR',align:'r'},
    {label:'Rebooked',align:'r'},{label:'Rebook %',align:'r'},{label:'Avg bill',align:'r'}])
    .concat(tgtCol)
    .concat([{label:'MTD actual',align:'r'},{label:'Unit',align:'r'},{label:'Treatment %',align:'r'}])
    .concat(tgtCol)
    .concat([{label:'MTD actual',align:'r'},{label:'Unit',align:'r'},{label:'Retail %',align:'r'}]);
  const colGroups = [
    { label:'', span:2 },
    { label:'Services',  span:(showTargets ? 3 : 1) + splitCols.length },
    { label:'Clients',   span:6 },
    { label:'Treatment', span:showTargets ? 4 : 3 },
    { label:'Retail',    span:showTargets ? 4 : 3 },
  ];

  // One rail entry per group row, collected as the table is built rather than
  // guessed in advance: a branch with no beauty team has no beauty heading, and a
  // rail offering a section the page does not have is worse than no rail.
  const rows = [], rail = [];
  codes.forEach(code => {
    const bd = series[code] && series[code].staff.mtd;
    if (!bd) return;
    const info = BRANCH_INFO[code] || { name: code };

    [['HAIR', bd.hairStaff || []], ['BEAUTY', bd.beautyStaff || []]].forEach(([dept, staff]) => {
      if (!staff.length) return;
      const anchor = `ls-${code}-${dept}`;
      const heading = `${escapeHtml(info.name)} · ${dept === 'HAIR' ? 'Hair' : 'Beauty'}`;
      rail.push([anchor, heading]);
      rows.push({ group: heading, id: anchor });

      // One services map per split window, built once per branch/department.
      const maps = sp.key
        ? (series[code].staff[sp.key] || []).map(rec => svcMap(rec, dept))
        : [];

      const tot = { st:0, sa:0, tt:0, ta:0, rt:0, ra:0, c:0, n:0, ncr:0, rb:0, tu:0, ru:0 };
      staff.slice()
        .sort((a, b) => (b[dept === 'BEAUTY' ? 'beautySales' : 'hairSalesNet'] || 0)
                      - (a[dept === 'BEAUTY' ? 'beautySales' : 'hairSalesNet'] || 0))
        .forEach(st => {
          const tg = (showTargets && typeof ledgerStaffTarget === 'function')
            ? ledgerStaffTarget(code, dept, st.name) : null;
          const svcA = dept === 'BEAUTY' ? (st.beautySales || 0) : (st.hairSalesNet || 0);
          const txA  = dept === 'BEAUTY' ? 0 : (st.treatments || 0);
          const retA = st.retail || 0;
          // A target of nothing is shown as a dash, never as zero: a stylist who
          // is simply not in the sheet must not read as one who missed by 100%.
          const svcT = tg ? tg.services  : null;
          const txT  = tg ? tg.treatment : null;
          const retT = tg ? tg.retail    : null;
          // No target here, but she has one at another branch — she is covering a
          // shift, or she has moved since the sheet was written. Say which branch
          // rather than leaving a dash that looks like a missing record.
          const away = (!tg && showTargets && typeof ledgerStaffTargetElsewhere === 'function')
            ? ledgerStaffTargetElsewhere(code, dept, st.name) : null;
          const noTgt = away
            ? `<span class="lg-na">target at ${escapeHtml((BRANCH_INFO[away] || {}).name || away)}</span>`
            : '<span class="lg-na">—</span>';

          tot.sa += svcA; tot.ta += txA; tot.ra += retA;
          tot.st += svcT || 0; tot.tt += txT || 0; tot.rt += retT || 0;
          tot.c += st.total || 0; tot.n += (st.newClients != null ? st.newClients : 0);
          tot.ncr += st.newClientReq || 0; tot.rb += st.rebooked || 0;
          tot.tu += st.treatmentUnits || 0; tot.ru += st.retailUnits || 0;

          // Her services, week by week or day by day. A blank is a window she did
          // not work, which is not the same as a zero — those read as a dash.
          const key = canon(st.name);
          const split = maps.map(m => (m[key] == null ? '—' : lgAed(m[key])));

          rows.push([lgPersonName(st.name), dept === 'HAIR' ? 'Hair' : 'Beauty']
            .concat(showTargets ? [svcT ? lgAed(svcT) : noTgt] : [])
            .concat(split)
            .concat([lgAed(svcA)])
            .concat(showTargets ? [svcT ? lgDelta(svcA - svcT, lgAed) : '—'] : [])
            .concat([
            lgNum(st.total), lgNum(st.newClients != null ? st.newClients : st.newClientReq),
            lgNum(st.newClientReq), lgNum(st.rebooked), lgPct(st.rebookPct), lgAed(st.avgBill)])
            .concat(showTargets ? [txT ? lgAed(txT) : '<span class="lg-na">—</span>'] : [])
            .concat([
            dept === 'BEAUTY' ? '—' : lgAed(txA),
            dept === 'BEAUTY' ? '—' : lgNum(st.treatmentUnits),
            dept === 'BEAUTY' ? '—' : lgPct(st.treatmentPct)])
            .concat(showTargets ? [retT ? lgAed(retT) : '<span class="lg-na">—</span>'] : [])
            .concat([lgAed(retA), lgNum(st.retailUnits), lgPct(st.retailPct)]));
        });

      const totSplit = maps.map(m => lgAed(Object.keys(m).reduce((a, k) => a + m[k], 0)));
      rows.push({ total: ['Totals', '']
        .concat(showTargets ? [tot.st ? lgAed(tot.st) : '—'] : [])
        .concat(totSplit)
        .concat([lgAed(tot.sa)])
        .concat(showTargets ? [tot.st ? lgDelta(tot.sa - tot.st, lgAed) : '—'] : [])
        .concat([
        lgNum(tot.c), lgNum(tot.n), lgNum(tot.ncr), lgNum(tot.rb),
        lgPct(tot.c ? tot.rb / tot.c * 100 : null), lgAed(tot.c ? tot.sa / tot.c : 0)])
        .concat(showTargets ? [tot.tt ? lgAed(tot.tt) : '—'] : [])
        .concat([
        dept === 'BEAUTY' ? '—' : lgAed(tot.ta),
        dept === 'BEAUTY' ? '—' : lgNum(tot.tu),
        dept === 'BEAUTY' ? '—' : lgPct(tot.sa ? tot.ta / tot.sa * 100 : null)])
        .concat(showTargets ? [tot.rt ? lgAed(tot.rt) : '—'] : [])
        .concat([lgAed(tot.ra), lgNum(tot.ru),
        lgPct((tot.sa + tot.ra) ? tot.ra / (tot.sa + tot.ra) * 100 : null)]) });
    });
  });

  host.innerHTML =
    lgHeader('Ledgers · Daily Stylist Target',
      showTargets
        ? `Every stylist against her own target — services, treatment and retail, grouped branch then department the way her tab runs.`
        : `Every stylist's services, treatment and retail for ${escapeHtml(series.windows.month.label)}, grouped branch then department the way her tab runs. No target sheet for this month, so the target columns are out.`,
      ctx) +
    lgMonthRow() +
    lgGrainRow() +
    lgShell(rail,
    (rows.length ? lgTable(cols, rows, {compact:true, groups:colGroups}) : lgEmpty('No staff figures for this window.')) +
    `<div class="fine">
      <p><b>Split cuts the services column only</b>. Weekly and Daily add her services week by week or day by day inside the Services band; the target, the MTD total and the variance beside them do not move. Treatment and retail stay as month-to-date totals — a nineteen-column table with three metrics cut by day is a data dump, not a coaching sheet.</p>
      <p><b>The Unit columns are her own</b>. <code>treatments_unit_qty</code> and <code>retail_unit_qty</code> come off the daily branch ledger, next to the revenue they belong to — how many treatments and how many retail lines, not how much money. Ledger columns, so they carry whatever the branch wrote down; Phorest has no per-stylist equivalent to check them against.</p>
      <p><b>Retail here is only what a stylist was credited with</b>, VAT exclusive. A lot of retail is rung with nobody against it — Phorest books it to a house account — so these retail columns will add up to less than the branch's Retail Total on the other two pages, which reads Phorest's own branch total. The gap is the unattributed retail, and it is deliberately not shared out: no stylist earned it, and inventing a credit would make every row here unmeasurable.</p>
      <p><b>A dash in a target column</b> means that stylist has no target in ${escapeHtml(LEDGER_TARGETS ? LEDGER_TARGETS.source : 'the sheet')} — a new starter, or a leaver still carrying history. It does not mean zero.</p>
      <p><b>"Target at &lt;branch&gt;"</b> means she is taking clients here but her monthly target is written against another branch, so there is nothing to measure this row against. Either she covered a shift, or she has moved and the sheet has not caught up. Worth a look when it is somebody's main branch: as of the August sheet, Irlyn, Grace and Shila are down as Khalifa but working Saadiyat, and Ibrahim and Olena are working Motor City against Al Quoz and Khalifa targets.</p>
    </div>`);

  if (typeof sizeTopbar === 'function') sizeTopbar();
  lgWatchScroll();
  if (typeof spy === 'function') spy();
}

/* ════════════════════════════════════════════════════════════
   Her four branch tabs used to be a fifth page of their own. They are sections of
   Actuals vs Targets now: the same block per branch, in the same column model as
   the group, which is what her SAA/KCA/MC/AQ tabs actually are. One page, not two.
   ════════════════════════════════════════════════════════════ */