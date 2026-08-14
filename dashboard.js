/* ============================================================
   TARA ROSE LADIES SALON — Dashboard Scripts
   dashboard.js
   ============================================================ */

// ── CONSTANTS & CONFIG ──────────────────────────────────────

const SUPA_URL = 'https://gvijxenafoowajqktqvd.supabase.co';
const SUPA_KEY = 'sb_publishable_e5o0vPayb-6552oARTeu7Q_KoqfT7xO';
const sb = supabase.createClient(SUPA_URL, SUPA_KEY);

const TARGETS = { hairAvgBill: 650, beautyAvgBill: 200, treatmentPct: 20, retailPct: 12, rebookPct: 45, hairUtilPct: 80, beautyUtilPct: 70 };

// `color` is the dark-theme/decorative-dot pastel; `colorLight` is the same hue darkened
// for use as a light-mode graph fill (same pattern as hairColor/beautyColor elsewhere —
// a flat pastel bar reads as too matingkad against the light-theme cream background).
const BRANCH_INFO = {
  KCA: { name: 'Khalifa City', color: '#FFD4D9', colorLight: '#C2506D' },
  SAA: { name: 'Saadiyat',     color: '#C4B5FD', colorLight: '#7C5CD4' },
  MC:  { name: 'Motor City',   color: '#99F6E4', colorLight: '#0F8A72' },
  AQ:  { name: 'AQ Ladies',    color: '#FF9B9B', colorLight: '#A32D2D' },
  FRT: { name: 'Fratelli',     color: '#EEF3C7', colorLight: '#BA7517' },
};

// Fratelli closed ~May 2026 and will never sync new data again. It stays in
// BRANCH_INFO so old records (still tagged branch=FRT) resolve a name/color, but every
// "All Branches" expansion below uses ACTIVE_BRANCHES instead so it stops appearing in
// dropdowns, the hero branch list, branch charts, and freshness checks. Kate, 2026-08-04.
const ACTIVE_BRANCHES = Object.keys(BRANCH_INFO).filter(b => b !== 'FRT');

const SCOLS = ['#FFD4D9','#FF9B9B','#C4B5FD','#99F6E4','#EEF3C7','#FFB6C1','#B5EAD7','#FFDAC1'];
const MONTH_ORDER = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const rankColors  = ['gold','silver','bronze'];
const rankSymbols = ['🥇','🥈','🥉'];

// ── STATE ───────────────────────────────────────────────────

let allData = [];
let charts  = {};
const sel   = { branch: ['all'] };
let pendingSel = { branch: ['all'] }; // buffered branch selection — applied only on Save
let dateFrom = null; // JS Date object
let dateTo   = null; // JS Date object

// collapsible section open/close state (persists across re-renders)
const sectionState = {};

// daily rows cache — set during daily-mode render, used by aggByBranch
let currentDailyRows = [];

// Services + Clients state
// DEAD as of 2026-08-14 — Service Rankings and Top Clients read the masthead's
// shared sel.branch now, so these two private branch selections have no callers,
// and neither do _svcBranches / _buildBranchDrop / _toggleSvcBranch / toggleDrop
// further down. Left in place rather than deleted mid-flight; the point of this
// note is that re-wiring them would put the dashboard back to three disagreeing
// notions of "the current branch". Delete the lot, don't revive it.
const svcSel = { branch: ['all'] };
const cliSel = { branch: ['all'] };
let svcViewMode = 'branch';
let svcDropsReady = false;

// ── THEME ───────────────────────────────────────────────────

function toggleTheme() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', dark ? 'light' : 'dark');
  // The label names where the button TAKES you, not where you are — the page
  // starts light with the button reading "Dark". It was inverted, so one press
  // turned the page dark and left the button still saying "Dark".
  const lbl = document.getElementById('themeLbl');
  if (lbl) lbl.textContent = dark ? 'Dark' : 'Light';
  applyLogoForTheme();
  // The gate used to be `if (charts.length)`, which worked only because the KPI
  // page owned two canvases. It draws its branch columns in the page's own type
  // now, so it holds no charts at all and the gate silently stopped re-rendering
  // the one view whose colours are chosen in JS. Re-render whenever the KPI view
  // is the one on screen. Kate, 2026-08-14.
  const kpi = document.getElementById('view-dashboard');
  if ((kpi && kpi.style.display !== 'none') || Object.keys(charts).length) renderDashboard();
  // Branch Performance keeps its Chart.js instances in its own registry, and
  // their axis/tooltip colours are chosen in JS at draw time — so they have to be
  // redrawn too, or a theme switch leaves four charts in the old palette. Redraw
  // only, no data reload: nothing about the figures changed.
  if (typeof bpRedrawForTheme === 'function') bpRedrawForTheme();
}
// 5.png = light/white wordmark (for dark backgrounds), 6.png = dark/black wordmark (for light backgrounds)
function applyLogoForTheme() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  const src = dark ? 'assets/5.png' : 'assets/6.png';
  const header = document.getElementById('headerLogoImg');
  const login  = document.getElementById('loginLogoImg');
  if (header) header.src = src;
  if (login)  login.src  = src;
}
applyLogoForTheme();
const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';

// ── FILTER BAR COLLAPSE (ADHD-friendly decluttering) ─────────
// Branch + period are one line of text chips in the masthead now (#filtersWrap),
// not a toolbar of dropdowns. This opens and closes them on a real height
// transition — see the .filters-wrap rule in index.html for why it is a grid
// row rather than a display flip — then re-measures the bar, because the space
// the masthead reserves below itself just changed. Kate, 2026-08-14.
function toggleFiltersBar() {
  const wrap = document.getElementById('filtersWrap');
  const btn  = document.getElementById('filtersBtn');
  if (!wrap || !btn) return;
  const open = !wrap.classList.toggle('closed');
  btn.textContent = open ? 'Hide filters' : 'Show filters';
  btn.setAttribute('aria-expanded', String(open));
  setTimeout(() => { if (typeof sizeTopbar === 'function') sizeTopbar(); }, 320);
}

// ── BRANCH + PERIOD CHIPS ───────────────────────────────────
// The same two choices the dropdown pair offered, written as an index line.
// Branch stays MULTI-select — a chip toggles that branch, "All Branches"
// resets — so nothing the old .ms-drop could express has been lost. Period is
// a short list of presets plus Custom, and Custom reveals the two date inputs
// that applyDateRange()/clearDateRange() have always read.

const MON_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MON_LONG  = ['January','February','March','April','May','June','July','August',
                   'September','October','November','December'];
const shortD = d => d ? `${d.getDate()} ${MON_SHORT[d.getMonth()]}` : '—';
const longD  = d => d ? `${d.getDate()} ${MON_LONG[d.getMonth()]}` : '—';

// Recomputed on every paint rather than frozen at load, so a dashboard left open
// overnight does not still think "this month so far" ends yesterday.
function periodPresets() {
  const today = new Date(); today.setHours(0,0,0,0);
  const y = today.getFullYear(), m = today.getMonth();
  return [
    { k: 'Last month + this', from: new Date(y, m-1, 1), to: today },
    { k: 'This month',        from: new Date(y, m,   1), to: today },
    { k: 'Last month',        from: new Date(y, m-1, 1), to: new Date(y, m, 0) },
    { k: 'Year so far',       from: new Date(y, 0,   1), to: today },
    { k: 'Custom' },
  ];
}

const sameDay = (a, b) => !!a && !!b && dateToIso(a) === dateToIso(b);

function activePeriodKey() {
  const hit = periodPresets().find(p => p.from && sameDay(p.from, dateFrom) && sameDay(p.to, dateTo));
  return hit ? hit.k : 'Custom';
}

// Separators are their own spans so the active underline hugs the word and the
// middot never becomes a click target.
function chipRow(opts) {
  return opts.map((o, i) =>
    (i ? '<span class="sep">·</span>' : '') +
    `<button type="button" class="chip" aria-pressed="${o.on}" data-v="${escapeHtml(o.v)}"${o.disabled ? ' disabled' : ''}>${escapeHtml(o.label)}</button>`
  ).join('');
}

function paintFilterChips() {
  const bEl = document.getElementById('branchChips');
  const pEl = document.getElementById('periodChips');
  if (!bEl || !pEl) return;

  const isAll = sel.branch.includes('all');
  // No "no data" greying here. branchesWithNoData() reads allData, which comes from
  // weekly_data — a table that stopped filling at the end of May 2026 — so on any
  // range after that it reported every branch as empty and the old dropdown
  // disabled all four. The picker had been dead for months. The dashboard already
  // says "No data for this selection" when a branch really is empty, which is a
  // better answer than a chip you cannot press. Kate, 2026-08-14.
  bEl.innerHTML = chipRow([
    { v: 'all', label: 'All Branches', on: isAll },
    ...ACTIVE_BRANCHES.map(code => ({
      v: code, label: BRANCH_INFO[code].name,
      on: !isAll && sel.branch.includes(code),
    })),
  ]);

  const active = activePeriodKey();
  pEl.innerHTML = chipRow(periodPresets().map(p => ({ v: p.k, label: p.k, on: p.k === active })));

  const custom = document.getElementById('customDates');
  if (custom) custom.hidden = active !== 'Custom';
  const fromInp = document.getElementById('dateRangeFrom');
  const toInp   = document.getElementById('dateRangeTo');
  if (fromInp) fromInp.value = dateToIso(dateFrom);
  if (toInp)   toInp.value   = dateToIso(dateTo);

  // The masthead's meta rule says what you are reading, so it has to be repainted
  // with the chips and not only on a successful data load — otherwise a branch
  // with no rows leaves the rule describing the previous selection.
  const branchLabel = isAll ? 'All Branches'
    : sel.branch.map(b => BRANCH_INFO[b]?.name || b).join(' · ');
  const mb = document.getElementById('mastBranch');
  const mr = document.getElementById('mastRange');
  if (mb) mb.textContent = branchLabel;
  if (mr) mr.textContent = (dateFrom && dateTo)
    ? `${longD(dateFrom)} – ${longD(dateTo)} ${dateTo.getFullYear()}`
    : '';
}

// Delegated, because paintFilterChips() replaces the buttons on every render.
document.addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (!chip || chip.disabled) return;

  if (chip.closest('#branchChips')) {
    const v = chip.dataset.v;
    if (v === 'all') sel.branch = ['all'];
    else if (sel.branch.includes('all')) sel.branch = [v];
    else {
      sel.branch = sel.branch.includes(v) ? sel.branch.filter(x => x !== v) : [...sel.branch, v];
      if (!sel.branch.length) sel.branch = ['all'];
    }
    pendingSel.branch = [...sel.branch];
    paintFilterChips();
    refreshActiveView();
    return;
  }

  if (chip.closest('#periodChips')) {
    const p = periodPresets().find(x => x.k === chip.dataset.v);
    if (!p) return;
    if (!p.from) {                       // Custom — reveal the inputs, change nothing yet
      const custom = document.getElementById('customDates');
      if (custom) custom.hidden = false;
      document.querySelectorAll('#periodChips .chip').forEach(c =>
        c.setAttribute('aria-pressed', String(c === chip)));
      if (typeof sizeTopbar === 'function') sizeTopbar();
      return;
    }
    dateFrom = p.from; dateTo = p.to;
    paintFilterChips();
    refreshActiveView();
  }
});


// ── FORMATTERS / HELPERS ────────────────────────────────────

// Returns a coloured ↑↓ arrow string comparing curr vs prev value
const trendArrow = (curr, prev, higherIsBetter = true, periodLabel = '') => {
  if (prev == null || prev === 0 || curr == null) return '';
  const delta = curr - prev;
  const pct   = Math.abs(delta / prev * 100);
  if (pct < 1) return '';
  const up   = delta > 0;
  const good = higherIsBetter ? up : !up;
  const col  = good ? 'var(--good)' : 'var(--bad)';
  const tag  = periodLabel ? `<span style="font-size:9px;color:var(--muted);font-weight:400;margin-left:2px">vs ${periodLabel}</span>` : '';
  return `<span style="color:${col};font-size:13px;font-weight:700;margin-left:6px">${up?'↑':'↓'}${pct.toFixed(1)}%${tag}</span>`;
};

const sc = (v, t) => {
  if (!t) return '';
  const ratio = v / t;
  if (ratio >= 1)   return 'good';
  if (ratio >= 0.8) return 'warn';
  if (ratio < 0.2)  return 'critical';
  return 'bad';
};
const statusBanner = (status, isDark) => {
  if (status === 'critical') return `<div style="margin-top:6px;padding:3px 7px;background:rgba(255,68,68,0.15);border:1px solid rgba(255,68,68,0.4);border-radius:6px;font-size:9px;color:#FF4444;letter-spacing:0.06em;text-transform:uppercase;font-weight:700">⚠ Critical — Needs Attention</div>`;
  const bg  = isDark ? 'rgba(238,243,199,0.1)'  : 'rgba(186,117,23,0.08)';
  const br  = isDark ? 'rgba(238,243,199,0.35)' : 'rgba(186,117,23,0.4)';
  const col = isDark ? '#EEF3C7' : '#8A5F0A';
  if (status === 'bad')  return `<div style="margin-top:6px;padding:3px 7px;background:${bg};border:1px solid ${br};border-radius:6px;font-size:9px;color:${col};letter-spacing:0.06em;text-transform:uppercase;font-weight:700">⚠ Below Target — Needs Action</div>`;
  if (status === 'warn') return `<div style="margin-top:6px;padding:3px 7px;background:${bg};border:1px solid ${br};border-radius:6px;font-size:9px;color:${col};letter-spacing:0.06em;text-transform:uppercase;font-weight:700">↑ Near Target — Keep Pushing</div>`;
  return '';
};
const fmtAED = n  => 'AED ' + (n || 0).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2});
const fmtPct = n  => (+(n || 0)).toFixed(2) + '%';
const initials = name => name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
// Spreadsheet cells (staff/client names, service labels) land in innerHTML template strings
// unescaped elsewhere in this file — a stray < > " ' in a ledger/Phorest cell can inject
// markup. Apply at every interpolation point that renders free text from uploaded data.
const escapeHtml = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function smoothSlide(el, open) {
  el.style.overflow = 'hidden';
  el.style.transition = 'height 0.3s ease, opacity 0.25s ease';
  if (open) {
    el.style.display = 'block';
    el.style.height = '0px';
    el.style.opacity = '0';
    const h = el.scrollHeight;
    requestAnimationFrame(() => {
      el.style.height = h + 'px';
      el.style.opacity = '1';
      const doneOpen = e => {
        if (e.propertyName !== 'height') return;
        el.style.height = '';
        el.style.overflow = '';
        el.removeEventListener('transitionend', doneOpen);
      };
      el.addEventListener('transitionend', doneOpen);
    });
  } else {
    el.style.height = el.scrollHeight + 'px';
    el.style.opacity = '1';
    requestAnimationFrame(() => {
      el.style.height = '0px';
      el.style.opacity = '0';
      const doneClose = e => {
        if (e.propertyName !== 'height') return;
        el.style.display = 'none';
        el.style.height = '';
        el.style.overflow = '';
        el.removeEventListener('transitionend', doneClose);
      };
      el.addEventListener('transitionend', doneClose);
    });
  }
}

function getYear(label, uploaded_at) {
  const m = label && label.match(/20\d\d/);
  if (m) return m[0];
  return uploaded_at ? new Date(uploaded_at).getFullYear().toString() : '2026';
}
function getMonth(label, uploaded_at) {
  for (const mo of MONTH_ORDER) { if (label && label.includes(mo)) return mo; }
  if (uploaded_at) return new Date(uploaded_at).toLocaleDateString('en-GB', { month: 'short' });
  return '—';
}

function getWeeklyTarget(branches) {
  const map = { SAA:[450,550], KCA:[400,500], AQ:[800,900], MC:[650,750], FRT:[500,600] };
  if (branches.includes('all')) return 'Weekly target varies by branch';
  let min = 0, max = 0;
  branches.forEach(b => { if (map[b]) { min += map[b][0]; max += map[b][1]; } });
  return (min === 0 && max === 0) ? 'Weekly target varies by branch'
    : `≈ AED ${min}k–${max}k / week`;
}

function getClientTarget(branches) {
  const map = { SAA:[700,800], KCA:[500,650], AQ:[700,900], MC:[500,650], FRT:[500,600] };
  if (branches.includes('all')) return '2,800–3,200 / week (All Branches Combined)';
  let min = 0, max = 0;
  branches.forEach(b => { if (map[b]) { min += map[b][0]; max += map[b][1]; } });
  return (min === 0 && max === 0) ? 'Target varies by branch'
    : `${min.toLocaleString()}–${max.toLocaleString()} / week`;
}

// ── DROPDOWN HELPERS ────────────────────────────────────────

function toggleDrop(key) {
  const drop = document.getElementById('drop-' + key);
  const btn  = document.getElementById('btn-'  + key);
  const isOpen = drop.classList.contains('open');
  document.querySelectorAll('.ms-drop').forEach(d => d.classList.remove('open'));
  document.querySelectorAll('.ms-btn').forEach(b  => b.classList.remove('open'));
  if (!isOpen) { drop.classList.add('open'); btn.classList.add('open'); }
}

document.addEventListener('click', e => {
  if (!e.target.closest('.ms-wrap')) {
    document.querySelectorAll('.ms-drop').forEach(d => d.classList.remove('open'));
    document.querySelectorAll('.ms-btn').forEach(b  => b.classList.remove('open'));
  }
});

function buildDrop(key, options) {
  const drop   = document.getElementById('drop-' + key);
  // The KPI/Team branch picker is a chip row in the masthead now and has no
  // .ms-drop to build — only Service Rankings and Top Clients still use one.
  // Kate, 2026-08-14: this threw on every load until it was guarded.
  if (!drop) return;
  const isAll  = pendingSel[key].includes('all');
  const noData = key === 'branch' ? branchesWithNoData() : new Set();
  drop.innerHTML = `
    <div class="ms-apply-row">
      <button class="f-pill active" onclick="saveBranchSelection()">Apply</button>
    </div>
    <div class="ms-opt all-opt ${isAll ? 'selected' : ''}" data-val="all" onclick="toggleOpt('${key}','all')">
      <span class="ms-chk ${isAll ? 'on' : ''}"></span>All Branches
    </div>
    ${options.map(o => {
      const active   = !isAll && pendingSel[key].includes(o.val);
      const disabled = noData.has(o.val);
      const dot = BRANCH_INFO[o.val]
        ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${BRANCH_INFO[o.val].color};flex-shrink:0;"></span>` : '';
      return `<div class="ms-opt ${active ? 'selected' : ''} ${disabled ? 'no-data' : ''}" data-val="${o.val}" onclick="${disabled ? '' : `toggleOpt('${key}','${o.val}')`}">
        <span class="ms-chk ${active ? 'on' : ''}"></span>${dot}${o.label}${disabled ? ' <span class="ms-nodata-tag">no data</span>' : ''}
      </div>`;
    }).join('')}`;
  updateLabel(key, options);
}

function toggleOpt(key, val) {
  // Write to pendingSel only — dashboard re-renders on Save
  if (val === 'all') {
    pendingSel[key] = ['all'];
  } else if (pendingSel[key].includes('all')) {
    pendingSel[key] = ACTIVE_BRANCHES.filter(b => b !== val);
    if (!pendingSel[key].length) pendingSel[key] = ['all'];
  } else {
    if (pendingSel[key].includes(val)) pendingSel[key] = pendingSel[key].filter(x => x !== val);
    else pendingSel[key].push(val);
    if (!pendingSel[key].length) pendingSel[key] = ['all'];
  }

  const drop     = document.getElementById('drop-' + key);
  const isAllNow = pendingSel[key].includes('all');
  drop.querySelectorAll('.ms-opt').forEach(el => {
    const v = el.dataset.val;
    const isSelected = el.classList.contains('all-opt') ? isAllNow : (!isAllNow && pendingSel[key].includes(v));
    el.classList.toggle('selected', isSelected);
    const chk = el.querySelector('.ms-chk');
    if (chk) chk.classList.toggle('on', isSelected);
  });
  drop.classList.add('open');
  document.getElementById('btn-' + key).classList.add('open');
}

function saveBranchSelection() {
  sel.branch = [...pendingSel.branch];
  rebuildDependentDrops();
  document.querySelectorAll('.ms-drop').forEach(d => d.classList.remove('open'));
  document.querySelectorAll('.ms-btn').forEach(b  => b.classList.remove('open'));
  refreshActiveView();
}

function rebuildDependentDrops() {
  // Sync pendingSel to match committed sel before rebuilding
  pendingSel.branch = [...sel.branch];
  buildDrop('branch', ACTIVE_BRANCHES.map(k => ({ val: k, label: BRANCH_INFO[k].name })));
  paintFilterChips();
}

function updateLabel(key, options) {
  const lbl   = document.getElementById('lbl-' + key);
  if (!lbl) return;
  const isAll = sel[key].includes('all');
  if (isAll) lbl.textContent = key === 'branch' ? 'All Branches' : 'All ' + key + 's';
  else if (sel[key].length === 1) {
    const found = options.find(o => o.val === sel[key][0]);
    lbl.textContent = found ? found.label : sel[key][0];
  } else { lbl.textContent = sel[key].length + ' selected'; }
}

// ── DATE RANGE PICKER (plain date inputs, matches upload.html's Sheets Sync filter) ──

function dateToIso(d) {
  return d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` : '';
}
function isoToDate(s) {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setHours(0,0,0,0);
  return dt;
}

// ── EDITORIAL HERO PERIOD ── the <em> in "Here's how ___ is shaping up."
// reads out the selected date range in plain-English, magazine-headline style
// instead of a static "the week". Recomputed on every renderDashboard() call
// so it always tracks whatever's in the FROM/TO pickers.
const HERO_MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function heroIsSingleWeek(from, to) {
  const diffDays = Math.round((to - from) / 86400000) + 1;
  return diffDays === 7 && from.getDay() === 1 && to.getDay() === 0; // Mon → Sun, exactly 7 days
}

function heroIsSingleCalendarMonth(from, to) {
  if (from.getDate() !== 1) return false;
  if (from.getFullYear() !== to.getFullYear() || from.getMonth() !== to.getMonth()) return false;
  const lastDayOfMonth = new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate();
  return to.getDate() === lastDayOfMonth;
}

// Matches the dashboard's default range: 1st of last month → today.
function heroIsPastMonthToDate(from, to) {
  const today = new Date(); today.setHours(0,0,0,0);
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  return from.getFullYear() === lastMonth.getFullYear() && from.getMonth() === lastMonth.getMonth() && from.getDate() === 1 &&
    to.getFullYear() === today.getFullYear() && to.getMonth() === today.getMonth() && to.getDate() === today.getDate();
}

function computeHeroPeriodPhrase(from, to) {
  if (!from || !to) return 'the week';
  const today = new Date(); today.setHours(0,0,0,0);
  const diffDays = Math.round((to - from) / 86400000) + 1;

  if (heroIsSingleWeek(from, to)) return 'this week';
  if (diffDays <= 7) return 'these days';

  // Default range gets its own phrase rather than falling into "past few months"
  if (heroIsPastMonthToDate(from, to)) return 'the past month and this month so far';

  if (heroIsSingleCalendarMonth(from, to)) {
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    if (from.getFullYear() === lastMonth.getFullYear() && from.getMonth() === lastMonth.getMonth()) return 'last month';
    const monthName = HERO_MONTH_NAMES[from.getMonth()];
    return from.getFullYear() === today.getFullYear() ? `${monthName} this year` : `${monthName} ${from.getFullYear()}`;
  }

  const isYearToDate = from.getFullYear() === today.getFullYear() && from.getMonth() === 0 && from.getDate() === 1 &&
    to.getFullYear() === today.getFullYear() && to.getMonth() === today.getMonth() && to.getDate() === today.getDate();
  if (isYearToDate) return 'the year so far';

  // A range that never leaves one calendar month must never be read out as months.
  // 1-12 Aug fell straight past every case above (not a full month, not last
  // month-to-date, not YTD) and landed on "the past few months" (Kate, 2026-08-12).
  if (from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth()) {
    const monthName = HERO_MONTH_NAMES[from.getMonth()];
    const isThisMonth = from.getFullYear() === today.getFullYear() && from.getMonth() === today.getMonth();
    if (isThisMonth && from.getDate() === 1) return 'this month so far';
    return `these days in ${monthName}`;
  }

  // Same trap one step wider: a five-week range straddling two months isn't
  // "months" either. Describe it by how long it actually is.
  if (diffDays < 45) return 'the past few weeks';
  return 'the past few months';
}

// The hero used to be four separate spans the page wrote into individually. It is
// one sentence now — the deck — so this returns the pieces and renderDashboard()
// assembles them. Kept as one place so the wording rules stay together.
function heroPeriodPhrasing() {
  const today = new Date(); today.setHours(0,0,0,0);
  const isAll = sel.branch.includes('all');
  const codes = isAll ? ACTIVE_BRANCHES : sel.branch;
  return {
    phrase: computeHeroPeriodPhrase(dateFrom, dateTo),
    verb:   (dateTo && dateTo < today) ? 'shaped up' : 'is shaping up',
    scope:  isAll ? 'across all branches'
          : codes.length === 1 ? `at ${BRANCH_INFO[codes[0]]?.name || codes[0]}`
          : `across ${codes.map(c => BRANCH_INFO[c]?.name || c).join(', ')}`,
  };
}

// ── HEADER SECTION LABEL + SCROLL PROGRESS ──────────────────────────────
// Kate's spec, 2026-08-03: the header pill names whichever section is
// currently in view (Organisation Pulse → Main Metrics → Revenue Targets →
// Benchmarks → Supporting Metrics) as you scroll the KPI Metrics dashboard,
// and a thin bar under the header fills left-to-right with scroll depth.
// A MutationObserver (not a renderDashboard() hook) drives the initial read
// so it stays correct no matter which of renderDashboard()'s early-return
// paths (loading/empty/error) last touched #mainContent.
const VIEW_SECTION_LABELS = {
  dashboard: 'Organisation Pulse', team: 'Team Performance', stylists: 'Stylist Cards',
  services: 'Service Rankings', clients: 'Top Clients', reviews: 'Salon Reviews',
  branchperf: 'Branch Performance',
  ledgerTargets: 'Ledgers · Daily Target Sheet',
  ledgerActuals: 'Ledgers · Actuals vs Targets',
  ledgerStylist: 'Ledgers · Daily Stylist Target',
};

// ── THE VIEW REGISTRY ────────────────────────────────────────
// One list, so adding a page means editing one line instead of three. showView()
// used to hide an inline array that had drifted out of date — it still carried
// 'khalifa' and 'saadiyat', which have not existed for months.
const ALL_VIEWS = [
  'dashboard','branchperf','ledgerTargets','ledgerActuals','ledgerStylist',
  'team','stylists','services','clients','reviews','calendar','giveaway','trk',
];

// Which pages read the shared branch + period filters. Everything that shows a
// number: the reference pages (stylist cards) and the embedded iframes do not.
const FILTERED_VIEWS = new Set([
  'dashboard','team','branchperf','ledgerTargets','ledgerActuals','ledgerStylist',
  'services','clients',
]);

let CURRENT_VIEW = 'dashboard';

// Re-render whatever is actually on screen after a filter change.
//
// This replaces five copies of "render the dashboard, then render team if team
// happens to be visible". That pattern was already a near-miss — it only ever
// checked the one other view that existed — and with four ledger pages added it
// would have gone quietly wrong: change the branch on Emma's Summary and you'd
// still be looking at the old branch's numbers.
//
// renderDashboard() runs regardless of which page you are on, because it is what
// repaints the filter chips and the masthead's branch/range line.
function refreshActiveView() {
  return renderDashboard().then(() => {
    const visible = v => {
      const n = document.getElementById('view-' + v);
      return n && n.style.display !== 'none';
    };
    if (visible('team'))          renderTeam();
    if (visible('branchperf'))    renderBranchPerformance();
    if (visible('ledgerTargets')) renderLedgerTargets();
    if (visible('ledgerActuals')) renderLedgerActuals();
    if (visible('ledgerStylist')) renderLedgerStylist();
    if (visible('services'))       onSvcFiltersChange();
    if (visible('clients'))        onCliFiltersChange();
  });
}

// ── STYLIST CARDS VIEW ───────────────────────────────────────
// The hair team straight from STAFF_PROFILES, grouped by branch and ordered by
// seniority. Reads no Supabase data and takes no date filter, so it renders
// instantly and can't go stale — it's a reference page, not a report.
// Kate, 2026-08-12: its own nav pill under Team Performance.
// The beauty team is deliberately absent: they have no cards or head icons yet,
// and a card with no face would look broken rather than pending.
const STYLIST_ROLE_ORDER = ['Style Director', 'Senior Stylist', 'Stylist', 'Junior Stylist'];

// ── ONE STYLIST CARD, AS THE DESIGNED PDF ────────────────────
// Kate, 2026-08-13: the hand-built HTML replica of the A3 card was ugly, and an
// exported image loses the one thing the PDF gives you for free — the words stay
// selectable, so you can highlight and lift copy straight off the card.
//
// So this shows the real PDF. Not _source/FINAL STYLIST CARD.pdf, which is one
// 110MB file for all 34 pages; scripts/split-stylist-cards.py cuts that into
// assets/stylist-cards/<name>.pdf, one page each, ~1.3MB.
//
// It is drawn by pdf.js rather than handed to the browser's own PDF viewer in an
// iframe. That viewer was the first attempt and it left grey dead space: it scales
// the page to about 89% of the frame and pads the rest, and its layout sits in a
// separate process where it can be neither measured nor styled. Drawing the page
// ourselves means it fills the box exactly, with no viewer chrome, no scroll to
// trap, the same result in every browser, and — because pdf.js lays real text over
// the canvas — Ctrl+F now finds words on the card too.
//
// Capped at 860px: any wider and one stylist is three screens tall. The box states
// the A3 aspect (842.25 x 1190.25pt) so the row reserves its height before the
// file arrives.
//
// Kate, 2026-08-14: it opens SMALL. A card at 860px was three screens of scroll
// before you could even confirm it was the stylist you meant, so the preview sits
// at the .sc-detail-in width (~330px) and "Full view" is what promotes it to the
// whole row. Both live in CSS off .sc-item.full — nothing here measures anything.
// Bump when any card is re-exported. Kate, 2026-08-14: the JS files have carried
// ?v= stamps for a while and the cards did not, so Katie's redrawn card would have
// arrived looking exactly like a card that was never updated — the browser holds
// these hard, and no number of refreshes tells you which one you are looking at.
const STYLIST_CARD_V = '20260814b';

function stylistCardEmbed(name) {
  const src = `assets/stylist-cards/${encodeURIComponent(String(name || '').toLowerCase())}.pdf?v=${STYLIST_CARD_V}`;
  return `
    <div class="sc-detail" data-detail>
      <div class="sc-detail-in">
        <div class="stylistCardBox" data-card="${src}"
             style="position:relative;width:100%;aspect-ratio:842.25/1190.25;border-radius:8px;
                    overflow:hidden;box-shadow:var(--shadow);background:#2D2E37"></div>
        <div class="sc-acts">
          <button class="sc-btn" onclick="toggleStylistCardSize(this)">Full view</button>
          <a href="${src}" target="_blank" rel="noopener noreferrer">Open in a new tab &#8599;</a>
        </div>
      </div>
    </div>`;
}

// pdf.js is ~1.7MB with its worker, so it is fetched on the first card anyone
// opens and never on page load. Vendored in vendor/pdfjs (v4.10.38, Apache-2.0)
// rather than pulled from a CDN, so the dashboard has no outside dependency.
let pdfjsLibPromise = null;
function loadPdfjs() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import('./vendor/pdfjs/pdf.min.mjs').then(lib => {
      lib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.mjs';
      return lib;
    });
  }
  return pdfjsLibPromise;
}

async function drawStylistCard(box) {
  const url = box.dataset.card;
  if (!url) return;                       // already drawn, or drawing
  delete box.dataset.card;
  try {
    const lib = await loadPdfjs();
    const page = await (await lib.getDocument(url).promise).getPage(1);
    // Drawn at the widest the card can ever be SHOWN at, not at the box's current
    // width: the preview opens small and "Full view" widens it to 860px, and a page
    // rasterised at 330px then stretched to 860px is a smear. The canvas is CSS-
    // scaled down for the preview, which costs nothing and stays crisp both ways.
    // Bounded by the viewport so a phone doesn't allocate a desktop-sized canvas.
    const width = Math.min(860, Math.max(300, (window.innerWidth || 860) - 80));
    const scale = width / page.getViewport({ scale: 1 }).width;
    const viewport = page.getViewport({ scale });

    // Draw at the device's pixel density, capped at 2: a 3x phone would allocate
    // ~38MB of canvas for a card that looks no better than 2x.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width * dpr);
    canvas.height = Math.round(viewport.height * dpr);
    canvas.style.cssText = 'display:block;width:100%;height:auto';
    box.appendChild(canvas);
    const drawing = page.render({
      canvasContext: canvas.getContext('2d'),
      viewport,
      transform: dpr === 1 ? null : [dpr, 0, 0, dpr, 0, 0]
    }).promise;

    // The invisible copy of the words, sitting exactly over the drawing. Built
    // without waiting on the drawing, which is the slower half and can be starved
    // outright in a background tab — the words should not hang on the picture.
    // Sized at the width we rendered at, then CSS-scaled if the column changes
    // width, which keeps the spans lined up without redrawing the page.
    const layer = document.createElement('div');
    layer.className = 'textLayer';
    layer.style.width = `${viewport.width}px`;
    layer.style.height = `${viewport.height}px`;
    layer.style.setProperty('--scale-factor', scale);
    box.appendChild(layer);
    await new lib.TextLayer({
      textContentSource: await page.getTextContent(),
      container: layer,
      viewport
    }).render();

    // Kept on the element so the things that change this box's width — "Full view",
    // switching density, a window resize — can re-fit the words over the drawing by
    // hand. A ResizeObserver was doing this alone and is still here, but it is not
    // to be trusted on its own: in the embedded preview browser it never fires at
    // all, and then the selectable text sits offset from the artwork underneath.
    const fit = () => layer.style.transform = `scale(${(box.clientWidth || width) / viewport.width})`;
    box._fitTextLayer = fit;
    fit();
    if (window.ResizeObserver) new ResizeObserver(fit).observe(box);
    await drawing;
  } catch (err) {
    // Nothing to salvage in place, so point at the file itself.
    console.error('Stylist card failed to draw', url, err);
    box.innerHTML = `<div style="padding:22px;color:#FAF8F3;font-size:13.5px;line-height:1.5">
      This card couldn&rsquo;t be drawn here. Use the link below to open the PDF.</div>`;
  }
}

function toggleStylistCard(headerEl) {
  const item = headerEl.closest('.sc-item');
  if (!item || !item.dataset.hasCard) return;
  const opening = !item.classList.contains('open');
  item.classList.toggle('open', opening);
  headerEl.setAttribute('aria-expanded', String(opening));
  // Closing forgets "Full view": reopening should give you the small preview again,
  // which is the whole point of opening small.
  if (!opening) {
    item.classList.remove('full');
    const btn = item.querySelector('.sc-acts .sc-btn');
    if (btn) btn.textContent = 'Full view';
  }
  // Drawn on first open only: 27 cards is 36MB, and a card nobody opens should cost
  // nothing. What is drawn stays drawn, so closing and reopening doesn't refetch —
  // but it may have been closed at one width and reopened at another, so the words
  // are re-fitted over the drawing either way.
  if (opening) {
    drawStylistCard(item.querySelector('.stylistCardBox'));
    refitStylistTextLayers(item);
  }
  updateStylistBar();
}

// "Full view" — the open card takes the whole row and the artwork goes to 860px.
// Only the CSS class changes: drawStylistCard() already rasterised the page at that
// width, so this is a scale of an existing canvas, not a redraw.
function toggleStylistCardSize(btn) {
  const item = btn.closest('.sc-item');
  if (!item) return;
  const full = item.classList.toggle('full');
  btn.textContent = full ? 'Smaller' : 'Full view';
  refitStylistTextLayers(item);
}

// Re-aligns the invisible selectable words over every card drawn inside `root`.
// Called wherever a card box changes width without being redrawn.
function refitStylistTextLayers(root) {
  (root || document).querySelectorAll('.stylistCardBox').forEach(box => {
    if (typeof box._fitTextLayer === 'function') box._fitTextLayer();
  });
}
addEventListener('resize', () => refitStylistTextLayers());

// ── THE STICKY BAR: DENSITY + A WAY OUT ──────────────────────
// Kate, 2026-08-14: switch density from the top right, and close everything you
// have opened without hunting back up the page for each chevron. It is sticky so
// both stay reachable however far down the team you are.
const STYLIST_VIEW_MODES = ['list', 'pills', 'cards'];
let stylistViewMode = 'cards';
try {
  const saved = localStorage.getItem('trsStylistView');
  if (STYLIST_VIEW_MODES.includes(saved)) stylistViewMode = saved;
} catch (e) { /* private mode: the default is fine */ }

// Re-classes the existing grids rather than re-rendering: a re-render would drop
// every pdf.js canvas already drawn and refetch those PDFs on the next open.
function setStylistView(mode) {
  if (!STYLIST_VIEW_MODES.includes(mode)) return;
  stylistViewMode = mode;
  try { localStorage.setItem('trsStylistView', mode); } catch (e) { /* not fatal */ }
  const host = document.getElementById('stylistCardsContent');
  if (!host) return;
  host.querySelectorAll('.sc-grid').forEach(g => {
    STYLIST_VIEW_MODES.forEach(m => g.classList.toggle('mode-' + m, m === mode));
  });
  host.querySelectorAll('.sc-seg button').forEach(b => {
    const on = b.dataset.mode === mode;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
  // The three densities give an open card three different widths.
  refitStylistTextLayers(host);
}

function collapseAllStylistCards() {
  const host = document.getElementById('stylistCardsContent');
  if (!host) return;
  host.querySelectorAll('.sc-item.open').forEach(item => {
    item.classList.remove('open', 'full');
    const head = item.querySelector('.sc-head');
    if (head) head.setAttribute('aria-expanded', 'false');
    const btn = item.querySelector('.sc-acts .sc-btn');
    if (btn) btn.textContent = 'Full view';
  });
  updateStylistBar();
}

// The button only exists while there is something to close, and says how much.
function updateStylistBar() {
  const host = document.getElementById('stylistCardsContent');
  const btn = document.getElementById('stylistCloseAll');
  if (!host || !btn) return;
  const n = host.querySelectorAll('.sc-item.open').length;
  btn.hidden = n === 0;
  btn.textContent = `Hide ${n} open card${n === 1 ? '' : 's'}`;
}

// The hair team, de-duplicated, grouped by branch, each group ordered by seniority.
// Pulled out of renderStylistCards() so the sidebar's branch jumps are built from the
// same grouping the page is: one list, one order, one set of counts. Two readings of
// STAFF_PROFILES would eventually disagree, and a rail that offers a section the page
// doesn't have is worse than no rail.
function stylistBranchGroups() {
  if (typeof STAFF_PROFILES === 'undefined') return [];
  // Dedupe by photo: alias keys (e.g. a stylist listed under two spellings) point
  // at the same person and must not produce two cards.
  const seen = new Set();
  const people = Object.entries(STAFF_PROFILES).filter(([, p]) => {
    const k = p.photo || p.ig;
    if (!k || seen.has(k)) return false;
    seen.add(k); return true;
  });

  const byBranch = new Map();
  people.forEach(([name, p]) => {
    const b = p.branch || 'other';
    if (!byBranch.has(b)) byBranch.set(b, []);
    byBranch.get(b).push({ name, ...p });
  });

  return [...ACTIVE_BRANCHES, 'other'].filter(b => byBranch.has(b)).map(b => ({
    branch: b,
    colour: BRANCH_INFO[b]?.colorLight || BRANCH_INFO[b]?.color || 'var(--muted)',
    label: BRANCH_INFO[b]?.name || b,
    list: byBranch.get(b).sort((x, y) => {
      const d = STYLIST_ROLE_ORDER.indexOf(x.role) - STYLIST_ROLE_ORDER.indexOf(y.role);
      return d !== 0 ? d : x.name.localeCompare(y.name);
    }),
  }));
}

// ── SIDEBAR: THE BRANCH JUMPS UNDER STYLIST CARDS ────────────
// Kate, 2026-08-14: 27 cards across four branch sections is a long scroll, so the
// sidebar carries the branches as sub-items. They move you within the view rather
// than switching view, so they are .nav-kid, not .nav-sub — "Stylist Cards" stays
// the active nav item while you jump about inside it.
function renderStylistBranchNav() {
  const nav = document.getElementById('stylistBranchNav');
  if (!nav) return;
  nav.innerHTML = stylistBranchGroups().map(g => `
    <div class="nav-kid" onclick="jumpToStylistBranch('${g.branch}')"
         title="${escapeHtml(g.label)} — ${g.list.length} stylist${g.list.length === 1 ? '' : 's'}">
      <span class="dot" style="background:${g.colour}"></span>
      <span>${escapeHtml(g.label)}</span>
      <span class="n">${g.list.length}</span>
    </div>`).join('');
}
addEventListener('DOMContentLoaded', renderStylistBranchNav);

// Lands the branch heading just below the fixed masthead AND the sticky density bar,
// which between them own the top ~100px — scrollIntoView() alone would park it
// underneath both. Only switches view when it has to: showView() re-renders, which
// would close every card you had open just to move down the page.
function jumpToStylistBranch(branch) {
  const view = document.getElementById('view-stylists');
  if (!view) return;
  if (view.style.display === 'none') {
    showView('stylists', document.querySelector('.nav-sub[onclick*="stylists"]'));
  }
  const target = document.getElementById('scBranch-' + branch);
  if (!target) return;
  const masthead = parseFloat(getComputedStyle(document.documentElement)
    .getPropertyValue('--topbar-cond-h')) || 104;
  const bar = document.querySelector('.sc-bar');
  const top = target.getBoundingClientRect().top + window.scrollY
    - masthead - (bar ? bar.offsetHeight : 0) - 10;
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

function renderStylistCards() {
  const host = document.getElementById('stylistCardsContent');
  if (!host) return;
  if (typeof STAFF_PROFILES === 'undefined') {
    host.innerHTML = `<div class="loading">Stylist profiles didn’t load.</div>`;
    return;
  }
  renderStylistBranchNav();
  const sections = stylistBranchGroups().map(({ branch: b, colour, label, list }) => {
    const cards = list.map(s => {
      const nameHtml = s.ig
        ? `<a href="https://instagram.com/${encodeURIComponent(s.ig)}" target="_blank" rel="noopener noreferrer"
              style="color:inherit;text-decoration:none;border-bottom:1px solid ${colour}">${escapeHtml(s.name)}</a>`
        : escapeHtml(s.name);
      const handle = s.ig
        ? `<a href="https://instagram.com/${encodeURIComponent(s.ig)}" target="_blank" rel="noopener noreferrer"
              style="font-size:11.5px;color:var(--muted);text-decoration:none">@${escapeHtml(s.ig)}</a>`
        : '';
      // Outside the Instagram link on purpose: the link is the first name, and a
      // surname that opened Instagram would be a surprise. Sized in em off .sc-name,
      // so it shrinks with the name in list and pills without a rule of its own.
      const surname = s.last ? ` <span class="sc-last">${escapeHtml(s.last)}</span>` : '';
      // No border-radius or background on the image: the rounded accent block is
      // part of the PNG, and clipping it would remove the head overhang. Sizing
      // lives in .sc-photo, which each density mode overrides.
      const photo = s.photo
        ? `<img class="sc-photo" src="assets/staff/${encodeURIComponent(s.photo)}" alt="" loading="lazy"
               onerror="this.style.display='none'">`
        : '';
      // STYLIST_CARDS is the roster of who has artwork: its 27 keys match the 27
      // files in assets/stylist-cards/ exactly, so it answers "is there a card?"
      const card = (typeof STYLIST_CARDS !== 'undefined') ? STYLIST_CARDS[s.name] : null;
      // Collapsed by default: 27 A3 cards at once is 36MB and a wall of scroll.
      // The grid is what makes the team scannable.
      const detail = card ? stylistCardEmbed(s.name) : '';
      const chevron = card ? `<span class="sc-chev">&#9660;</span>` : '';
      // Pills mode hides the role line, so the title carries it there.
      return `
        <div class="sc-item"${card ? ' data-has-card="1"' : ''}
             title="${escapeHtml([s.name, s.last].filter(Boolean).join(' '))} · ${escapeHtml(s.role || '')}">
          <div class="sc-head"${card ? ' onclick="toggleStylistCard(this)" aria-expanded="false"' : ''}>
            ${photo}
            <div class="sc-meta">
              <div class="sc-name">${nameHtml}${surname}</div>
              <div class="sc-role" style="color:${colour}">${escapeHtml(s.role || '')}</div>
              <div class="sc-handle">${handle}</div>
            </div>
            ${chevron}
          </div>
          ${detail}
        </div>`;
    }).join('');
    // The id is what the sidebar's branch jumps aim at. Scoped with a prefix rather
    // than the bare branch key, which is short enough to collide with anything.
    return `
      <div class="section-label" id="scBranch-${b}" data-scrollspy="Stylist Cards"
           style="display:flex;align-items:center;gap:7px;margin-top:22px;margin-bottom:10px;
                  scroll-margin-top:170px">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;
                     background:${colour};flex-shrink:0"></span>
        ${escapeHtml(label)} · ${list.length} stylist${list.length === 1 ? '' : 's'}
      </div>
      <div class="sc-grid mode-${stylistViewMode}">${cards}</div>`;
  }).join('');

  // The bar is the first thing in the view and sticks under the masthead, so the
  // density switch and the way out of a pile of open cards are always to hand.
  const seg = [['list', 'List'], ['pills', 'Pills'], ['cards', 'Cards']].map(([m, label]) =>
    `<button type="button" data-mode="${m}" class="${m === stylistViewMode ? 'on' : ''}"
             aria-pressed="${m === stylistViewMode}"
             onclick="setStylistView('${m}')">${label}</button>`).join('');

  host.innerHTML = `
    <div class="sc-bar">
      <span class="sc-bar-t">Stylist Cards</span>
      <span class="sc-bar-sp"></span>
      <button type="button" class="sc-btn" id="stylistCloseAll"
              onclick="collapseAllStylistCards()" hidden>Hide open cards</button>
      <div class="sc-seg" role="group" aria-label="Card density">${seg}</div>
    </div>
    <div style="font-size:13.5px;color:var(--muted);margin:8px 0 4px;max-width:760px">
      The hair team across all four branches. Names link to Instagram.
    </div>
    ${sections}`;
}

function setHeaderSectionLabel(text) {
  const el = document.getElementById('headerSectionLabel');
  if (el && text) el.textContent = text;
}

// The header pill used to name whichever section had scrolled past the top of an
// inner scroll area, and a thin bar under it filled with scroll depth. Both were
// answers to a layout that no longer exists: the page scrolls in the window now,
// and the sticky index rail down the left margin says where you are, in words,
// against the sections it can also take you to. The masthead sub-line names the
// VIEW instead, set once by showView(). Kate, 2026-08-14.
// Kept as a no-op rather than deleted: it is still called from the view switcher
// paths that predate this change, and a missing function there is a thrown error.
function updateScrollProgress() { /* superseded by the side rail's spy() */ }

// Plain-English "so what" layer above the hero KPIs — reuses the same sc()/TARGETS
// bands as the per-card statusBanner()s, just rolled up into one sentence that reacts
// to whichever branch + date range is currently selected.
function computeStatusStatement(s, branchLabel, periodPhrase, treatmentPct, retailPct) {
  // "June this year" / "May 2026" name a specific past month and read as a noun
  // phrase in the hero headline ("...is shaping up"), but need "in" once they're
  // used adverbially here ("KPIs in June this year") — relative phrases like
  // "this week"/"last month"/"the year so far" already work without it.
  const adverbialPhrase = /^[A-Z][a-z]+ (this year|\d{4})$/.test(periodPhrase) ? `in ${periodPhrase}` : periodPhrase;
  const checks = [
    { label: 'Avg Bill',    status: sc(s.avgBill||0, TARGETS.hairAvgBill) },
    { label: 'Rebooking %', status: sc(s.rebookPct||0, TARGETS.rebookPct) },
    { label: 'NCR %',       status: sc(s.combinedNcrPct||0, 20) },
    { label: 'Treatment %', status: sc(treatmentPct||0, TARGETS.treatmentPct) },
    { label: 'Retail %',    status: sc(retailPct||0, TARGETS.retailPct) },
  ];
  const goodCount = checks.filter(c => c.status === 'good').length;
  const flagged   = checks.filter(c => c.status === 'bad' || c.status === 'critical').map(c => c.label);
  const warned    = checks.filter(c => c.status === 'warn').map(c => c.label);

  if (flagged.length) {
    return `${branchLabel} is on track on ${goodCount} of ${checks.length} KPIs ${adverbialPhrase} — ${flagged.join(' and ')} need${flagged.length===1?'s':''} attention.`;
  }
  if (warned.length) {
    return `${branchLabel} is close to target across the board ${adverbialPhrase} — keep pushing on ${warned.join(' and ')}.`;
  }
  return `${branchLabel} is hitting target on every KPI ${adverbialPhrase}. Strong stretch.`;
}

// "At a glance" narrative — Hair (revenue, rebooking, treatment, avg bill) then
// Beauty (revenue, rebooking, avg bill), read as two plain sentences instead of
// a KPI-count rollup. Reuses sc() so the good/warn/bad read matches the rest
// of the dashboard. Per Kate's spec, 2026-08-03.
function glanceClause(value, target, unit, goodPhrase, warnPhrase, badPhrase) {
  const status = sc(value||0, target);
  const valColor = status === 'good' ? 'var(--good)' : 'var(--bad)';
  const val = `<strong style="color:${valColor}">${unit === 'AED' ? fmtAED(value||0) : fmtPct(value||0)}</strong>`;
  const tgt = `<strong>${unit === 'AED' ? fmtAED(target) : `${target}%`}</strong>`;
  if (status === 'good') return `${goodPhrase} at ${val}`;
  if (status === 'warn') return `${warnPhrase} at ${val}, just off the ${tgt} mark`;
  return `${badPhrase} at ${val} against a ${tgt} goal`;
}

function computeAtAGlanceExplanation(s, hairRevenue, hairTreatmentPct) {
  const hair = `Hair brought in <strong>${fmtAED(hairRevenue)}</strong>. Rebooking is ${glanceClause(s.hairRebookPct, TARGETS.rebookPct, 'pct', 'holding steady', 'getting there', 'lagging')}, treatment uptake is ${glanceClause(hairTreatmentPct, TARGETS.treatmentPct, 'pct', 'right on target', 'trending the right way', 'falling short')}, and avg bill is ${glanceClause(s.hairAvgBill, TARGETS.hairAvgBill, 'AED', 'comfortably ahead', 'nearly there', 'below where it needs to be')}.`;
  const beauty = `Beauty brought in <strong>${fmtAED(s.beautySales||0)}</strong>. Rebooking is ${glanceClause(s.beautyRebookPct, TARGETS.rebookPct, 'pct', 'holding steady', 'getting there', 'lagging')}, and avg bill is ${glanceClause(s.beautyAvgBill, TARGETS.beautyAvgBill, 'AED', 'comfortably ahead', 'nearly there', 'below where it needs to be')}.`;
  return { hair, beauty };
}

function applyDateRange() {
  dateFrom = isoToDate(document.getElementById('dateRangeFrom').value);
  dateTo   = isoToDate(document.getElementById('dateRangeTo').value) || dateFrom;

  rebuildDependentDrops();
  refreshActiveView();
}

// Default range: 1st of last month → today — covers the prior full month plus
// whatever days have landed so far this month. Changed from Jan 1 (year-to-date)
// per Kate's request, 2026-08-03 — she was manually re-applying this same range
// every time. "Today" as the upper bound is still safe even if today's sync
// hasn't landed yet (branch_staff_daily/phorest_staff_daily sync daily).
// No longer matches ssSetDefaultFilterDates() in upload/sheet-sync.js — that's
// the Upload Portal's own filter (browsing everything uploaded this year), a
// different use case, and still defaults to Jan 1.
async function setDefaultRange() {
  const today = new Date(); today.setHours(0,0,0,0);
  const from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const to = today;
  dateFrom = from;
  dateTo   = to;
  const fromInput = document.getElementById('dateRangeFrom');
  const toInput   = document.getElementById('dateRangeTo');
  if (fromInput) fromInput.value = dateToIso(from);
  if (toInput)   toInput.value   = dateToIso(to);
}

async function clearDateRange() {
  await setDefaultRange();
  rebuildDependentDrops();
  refreshActiveView();
}

function getWeekDatesFromLabel(label) {
  if (!label) return null;
  const monthMap = { JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11 };
  const m = label.match(/\(([A-Z]{3})\s+(\d+)\s*[–\-]\s*([A-Z]{3})\s+(\d+)\)/i);
  if (!m) return null;
  const startMon = m[1].toUpperCase(), startDay = parseInt(m[2]);
  const endMon   = m[3].toUpperCase(), endDay   = parseInt(m[4]);
  const yearMatch = label.match(/20\d\d/);
  const endYear   = yearMatch ? parseInt(yearMatch[0]) : new Date().getFullYear();
  const endMonth   = monthMap[endMon];
  const startMonth = monthMap[startMon];
  const startYear = (startMonth === 11 && endMonth === 0) ? endYear - 1 : endYear;
  const start = new Date(startYear, startMonth, startDay); start.setHours(0,0,0,0);
  const end   = new Date(endYear,   endMonth,   endDay);   end.setHours(0,0,0,0);
  return { start, end };
}

function getFilteredData(ignoreBranch = false) {
  return allData.filter(d => {
    if (!ignoreBranch && !sel.branch.includes('all') && !sel.branch.includes(d.branch)) return false;
    if (dateFrom || dateTo) {
      const weekDates = getWeekDatesFromLabel(d.week_label);
      const checkDate = weekDates ? weekDates.start : (new Date(d.uploaded_at), (() => { const u = new Date(d.uploaded_at); u.setHours(0,0,0,0); return u; })());
      if (dateFrom && checkDate < dateFrom) return false;
      if (dateTo   && checkDate > dateTo)   return false;
    }
    return true;
  });
}

function branchesWithNoData() {
  const present = new Set(getFilteredData(true).map(d => d.branch));
  return new Set(Object.keys(BRANCH_INFO).filter(b => !present.has(b)));
}

function aggDailyData(dailyRows, branchStaffRows, phorestStaffRows) {
  const hasLedgerData = branchStaffRows && branchStaffRows.length;
  if (!hasLedgerData && (!dailyRows || !dailyRows.length)) return null;

  let hairMap = {}, beautyMap = {};
  if (hasLedgerData) {
    ({ hairMap, beautyMap } = buildLedgerPhorestStaffMaps(branchStaffRows, phorestStaffRows || []));
  }

  // branch_staff_daily/phorest_staff_daily sync daily and are the source of truth once
  // present; daily_data is the older manual-XLSX-upload table (Kate confirmed it lags —
  // last touched 31 May while the auto-synced tables run through today) and is now only
  // a fallback for date ranges that predate the auto sync.
  const s = hasLedgerData ? computeGroupSummaryFromMaps(hairMap, beautyMap) : computeGroupSummaryFromDailyData(dailyRows);

  const { hairStaff, beautyStaff } = buildStaffArraysFromMaps(hairMap, beautyMap);
  return { summary: s, hairStaff, beautyStaff };
}

// Fallback for date ranges with no branch_staff_daily/phorest_staff_daily coverage —
// the original daily_data-based summary math, unchanged.
function computeGroupSummaryFromDailyData(dailyRows) {
  const s = {
    totalClients:0, hairRetail:0, treatmentSales:0, beautySales:0,
    netTake:0, colTake:0, rebookPct:0, ncrPct:0, _fromDaily:true,
  };
  let dHairRebooked=0, dBeautyRebooked=0, totalHairClients=0;
  let dHairNCR=0, dHairREQ=0, dHairSALON=0, dHairNEW=0;
  let dBeautyREQ=0, dBeautySALON=0, dBeautyNEW=0, dBeautyNCR=0, totalBeautyClients=0;
  dailyRows.forEach(r => {
    const hairClients   = (r.hair_clients_request||0) + (r.hair_clients_salon||0) + (r.hair_new||0) + (r.hair_ncr||0);
    const beautyClients = (r.beauty_request||0) + (r.beauty_salon||0) + (r.beauty_new||0) + (r.beauty_ncr||0);
    s.totalClients   += hairClients + beautyClients;
    s.hairRetail     += r.retail_total      || 0;
    s.treatmentSales += r.treatments_total  || 0;
    s.beautySales    += r.beauty_sales      || 0;
    s.netTake        += r.total             || 0;
    dHairRebooked        += r.hair_rebooked    || 0;
    dBeautyRebooked      += r.beauty_rebooked  || 0;
    totalHairClients     += hairClients;
    totalBeautyClients   += beautyClients;
    dHairNCR    += r.hair_ncr             || 0;
    dHairREQ    += r.hair_clients_request || 0;
    dHairSALON  += r.hair_clients_salon   || 0;
    dHairNEW    += r.hair_new             || 0;
    dBeautyREQ  += r.beauty_request       || 0;
    dBeautySALON+= r.beauty_salon         || 0;
    dBeautyNEW  += r.beauty_new           || 0;
    dBeautyNCR  += r.beauty_ncr           || 0;
  });
  const totalRebooked = dHairRebooked + dBeautyRebooked;
  s.avgBill       = s.totalClients ? s.netTake / s.totalClients : 0;
  s.hairRetailPct = s.netTake ? (s.hairRetail / s.netTake * 100) : 0;
  s.treatmentPct  = s.netTake ? (s.treatmentSales / s.netTake * 100) : 0;
  s.rebookPct     = s.totalClients ? (totalRebooked / s.totalClients * 100) : 0;
  s.totalRebooked = totalRebooked;
  s.hairBreakdown   = { ncr: dHairNCR,    req: dHairREQ,    salon: dHairSALON,   new: dHairNEW,   rebooked: dHairRebooked };
  s.beautyBreakdown = { ncr: dBeautyNCR,  req: dBeautyREQ,  salon: dBeautySALON, new: dBeautyNEW, rebooked: dBeautyRebooked };
  s.ncrPct         = totalHairClients   ? (dHairNCR   / totalHairClients   * 100) : 0;
  s.hairNcrPct     = s.ncrPct;
  s.beautyNcrPct   = totalBeautyClients ? (dBeautyNCR / totalBeautyClients * 100) : null;
  s.combinedNcrPct = s.totalClients     ? ((dHairNCR + dBeautyNCR) / s.totalClients * 100) : 0;
  s.hairAvgBill    = totalHairClients   ? ((s.netTake - s.beautySales - s.hairRetail) / totalHairClients) : 0;
  s.beautyAvgBill  = totalBeautyClients ? (s.beautySales / totalBeautyClients) : null;
  s.hairRebookPct  = totalHairClients   ? (dHairRebooked   / totalHairClients   * 100) : 0;
  s.beautyRebookPct= totalBeautyClients ? (dBeautyRebooked / totalBeautyClients * 100) : null;
  s.beautyPct      = s.netTake ? (s.beautySales / s.netTake * 100) : 0;
  s.retentionPct  = s.rebookPct;
  s.conversionPct = s.rebookPct;
  s._retailWarnings = [];
  s.totals = { hairSales: s.netTake - s.beautySales - s.hairRetail, retail: s.hairRetail, treatments: s.treatmentSales, total: s.totalClients, rebooked: totalRebooked };
  return s;
}

// Group-level rollup of Kate's full Revenue Targets / Benchmarks field list, built on
// the same branch_staff_daily (dept + client counts + ledger treatment_aed) + Phorest
// (services/courses/retail) join used for the Staff Performance tables — see
// buildLedgerPhorestStaffMaps for the name-reconciliation and revenue-mapping rationale.
function computeGroupSummaryFromMaps(hairMap, beautyMap) {
  const sum = (map, field) => Object.values(map).reduce((a, st) => a + (Number(st[field]) || 0), 0);

  const hairTotalClients = sum(hairMap, 'total');
  const hairNewClients   = sum(hairMap, 'newC');
  const hairNCR          = sum(hairMap, 'newClientReq');
  const hairRebooked     = sum(hairMap, 'rebooked');
  const hairReq          = sum(hairMap, 'req');
  const hairSalon        = sum(hairMap, 'salon');
  const hairServicesIncl = sum(hairMap, 'hairSalesNet'); // services + courses, ex-retail
  const hairTreatments   = sum(hairMap, 'treatments');   // ledger treatment_aed
  const hairRetailOnly   = sum(hairMap, 'retail');

  const beautyTotalClients = sum(beautyMap, 'total');
  const beautyNewClients   = sum(beautyMap, 'newC');
  const beautyNCR          = sum(beautyMap, 'newClientReq');
  const beautyRebooked     = sum(beautyMap, 'rebooked');
  const beautyReq          = sum(beautyMap, 'req');
  const beautySalon        = sum(beautyMap, 'salon');
  const beautyServices     = sum(beautyMap, 'beautySales');
  const beautyRetailOnly   = sum(beautyMap, 'retail');

  const totalClients  = hairTotalClients + beautyTotalClients;
  const newClients    = hairNewClients + beautyNewClients;
  const ncrTotal       = hairNCR + beautyNCR;
  const totalRebooked = hairRebooked + beautyRebooked;
  const salonClient   = hairSalon + beautySalon;
  const requestClient = hairReq + beautyReq;
  const servicesTotal = hairServicesIncl + beautyServices;
  const retailTotal   = hairRetailOnly + beautyRetailOnly;
  const netTake       = servicesTotal + retailTotal;

  const s = { _fromDaily: false };
  // Existing card fields — same names the rest of the dashboard already reads, now fed
  // from the fresh ledger+Phorest join instead of the stale daily_data table.
  s.totalClients   = totalClients;
  s.hairRetail      = retailTotal; // combined retail — matches the existing "Total Retail" card's semantic
  s.treatmentSales = hairTreatments;
  s.beautySales    = beautyServices;
  s.netTake        = netTake;
  s.colTake        = 0;
  s.avgBill        = totalClients ? netTake / totalClients : 0;
  s.hairRetailPct  = netTake ? (retailTotal / netTake * 100) : 0;
  // Treatment % is a hair-only concept — ratio to hair services, not diluted by beauty/retail.
  s.treatmentPct   = hairServicesIncl ? (hairTreatments / hairServicesIncl * 100) : 0;
  s.rebookPct      = totalClients ? (totalRebooked / totalClients * 100) : 0;
  s.totalRebooked  = totalRebooked;
  s.hairBreakdown   = { ncr: hairNCR,   req: hairReq,   salon: hairSalon,   new: hairNewClients,   rebooked: hairRebooked };
  s.beautyBreakdown = { ncr: beautyNCR, req: beautyReq, salon: beautySalon, new: beautyNewClients, rebooked: beautyRebooked };
  s.ncrPct         = hairTotalClients ? (hairNCR / hairTotalClients * 100) : 0;
  s.hairNcrPct     = s.ncrPct;
  s.beautyNcrPct   = beautyTotalClients ? (beautyNCR / beautyTotalClients * 100) : null;
  s.combinedNcrPct = totalClients ? (ncrTotal / totalClients * 100) : 0;
  s.hairAvgBill    = hairTotalClients ? (hairServicesIncl / hairTotalClients) : 0;
  s.beautyAvgBill  = beautyTotalClients ? (beautyServices / beautyTotalClients) : null;
  s.hairRebookPct  = hairTotalClients ? (hairRebooked / hairTotalClients * 100) : 0;
  s.beautyRebookPct= beautyTotalClients ? (beautyRebooked / beautyTotalClients * 100) : null;
  s.beautyPct      = netTake ? (beautyServices / netTake * 100) : 0;
  s.retentionPct   = s.rebookPct;
  s.conversionPct  = s.rebookPct;
  s._retailWarnings = [];
  s.totals = { hairSales: hairServicesIncl, retail: retailTotal, treatments: hairTreatments, total: totalClients, rebooked: totalRebooked };

  // New fields for Kate's full Revenue Targets spec (2026-08-02).
  s.servicesTotal        = servicesTotal;
  s.retailTotal          = retailTotal;
  s.hairServicesIncl     = hairServicesIncl;
  s.hairServicesExcl     = hairServicesIncl - hairTreatments;
  s.beautyServicesTotal  = beautyServices;
  s.hairRetailOnly       = hairRetailOnly;
  s.beautyRetailOnly     = beautyRetailOnly;
  s.hairTotalClients     = hairTotalClients;
  s.hairNewClients       = hairNewClients;
  s.hairNCR              = hairNCR;
  s.beautyTotalClients   = beautyTotalClients;
  s.beautyNewClients     = beautyNewClients;
  s.beautyNCR            = beautyNCR;
  s.hairRebookedCount    = hairRebooked;
  s.beautyRebookedCount  = beautyRebooked;
  s.newClientsTotal      = newClients;
  s.ncrTotal             = ncrTotal;
  s.salonClientTotal     = salonClient;
  s.requestClientTotal   = requestClient;

  return s;
}

// ── STAFF PERFORMANCE FROM LEDGER + PHOREST (custom/daily date ranges) ──
// branch_staff_daily gives the Hair/Beauty dept + client-count split per staff/day
// (straight from the ledger sheets), PLUS treatment_aed — a manually-tallied ledger
// column (Hair only) that can't be derived from Phorest's own totals, since Phorest's
// Staff Performance Overview report has no per-service-type breakdown to split "which
// services were treatments" out of its Services total. phorest_staff_daily supplies
// the rest of the revenue (services/courses/retail) per employee/day, with no dept
// split of its own. Reconcile employee names between the two (ledger uses first-name-
// only, Phorest uses full legal name, sometimes with a trailing "(A)" marker) and use
// the ledger's dept for each (staff, day) to attribute that day's Phorest revenue to
// Hair or Beauty.
//
// Per CALCULATIONS OF KPIS.docx + Kate 2026-08-02: hairSalesNet ("Hair services, incl.
// treatments and courses") = Phorest services_total + courses_total; treatments (a
// subset of that figure, shown separately) = the ledger's treatment_aed; retail
// (products_total) is tracked as its own category, never folded into hairSalesNet.
const PHOREST_RECONCILE_ALIASES = { 'LUCY': 'LUCIA', 'MJ': 'MARY JOY' };

// Non-person rows found in branch_staff_daily (2026-08-02 audit, ~2.8k of ~15k rows) —
// ledger summary/label rows the sync script misreads as if they were staff rows.
const LEDGER_NON_PERSON_NAMES = new Set(['BUSINESS', 'AA', 'BB', 'CC', 'ASSISTANTS', 'ASISSTANTS', 'RETAIL', 'RETAIL SALES', ']']);

function cleanPhorestName(name) {
  return String(name || '').trim().toUpperCase().replace(/\s*\(A\)\s*$/, '').trim();
}

function ledgerNameKey(name) {
  const canon = (typeof canonicalStaffName === 'function') ? canonicalStaffName(name) : name;
  const up = String(canon || '').trim().toUpperCase();
  return PHOREST_RECONCILE_ALIASES[up] || up;
}

function buildLedgerPhorestStaffMaps(branchRows, phorestRows) {
  const phorestByBranchDate = {};
  (phorestRows || []).forEach(r => {
    if (r.is_total) return;
    const bdKey = r.branch + '|' + r.date;
    (phorestByBranchDate[bdKey] = phorestByBranchDate[bdKey] || []).push({
      key: cleanPhorestName(r.employee_name),
      services_total: Number(r.services_total) || 0,
      courses_total:  Number(r.courses_total)  || 0,
      products_total: Number(r.products_total) || 0,
    });
  });

  function matchRevenue(branch, date, staffName) {
    const list = phorestByBranchDate[branch + '|' + date];
    if (!list) return null;
    const key = ledgerNameKey(staffName);
    const matches = list.filter(p => p.key === key || p.key.indexOf(key + ' ') === 0);
    if (!matches.length) return null;
    return matches.reduce((acc, m) => ({
      services_total: acc.services_total + m.services_total,
      courses_total:  acc.courses_total  + m.courses_total,
      products_total: acc.products_total + m.products_total,
    }), { services_total: 0, courses_total: 0, products_total: 0 });
  }

  const hairMap = {}, beautyMap = {};
  (branchRows || []).forEach(r => {
    const name = (typeof canonicalStaffName === 'function') ? canonicalStaffName(r.staff_name) : r.staff_name;
    if (!name) return;
    // These are ledger summary/label rows the sync misreads as staff rows (not real
    // employees) — one, "RETAIL", carries a runaway NCR count (into the thousands,
    // growing day over day) that badly skews the group totals if left in. Flagged to
    // Kate as a sync-script bug to fix at the source; excluded here defensively.
    if (LEDGER_NON_PERSON_NAMES.has(String(r.staff_name||'').trim().toUpperCase())) return;
    const isBeauty = String(r.dept || '').trim().toLowerCase() === 'beauty';
    const rev = matchRevenue(r.branch, r.date, r.staff_name) || { services_total: 0, courses_total: 0, products_total: 0 };
    const map = isBeauty ? beautyMap : hairMap;
    if (!map[name]) {
      map[name] = {
        name, total: 0, newC: 0, rebooked: 0, req: 0, salon: 0, newClientReq: 0,
        hairSalesNet: 0, retail: 0, treatments: 0, beautySales: 0,
        // Item counts, not money — how many treatments and how many retail lines
        // she actually sold. Ledger columns, like treatment_aed: Phorest has no
        // per-stylist equivalent. Kate, 2026-08-14.
        treatmentUnits: 0, retailUnits: 0,
      };
    }
    const st = map[name];
    st.total        += r.total      || 0;
    st.newC         += r.new_client || 0;
    st.rebooked     += r.rebooked   || 0;
    st.req          += r.req        || 0;
    st.salon        += r.salon      || 0;
    st.newClientReq += r.ncr        || 0;
    st.treatmentUnits += Number(r.treatments_unit_qty) || 0;
    st.retailUnits    += Number(r.retail_unit_qty)     || 0;
    // Services + Courses = "incl. treatments and courses" per the KPI doctrine; Treatment
    // AED is NOT derivable from Phorest's own totals (it's a manually-tallied ledger column,
    // Hair only — Phorest's report has no per-service-type breakdown to split it out from
    // Services). Retail (products_total) stays outside the services figure entirely.
    if (isBeauty) {
      st.beautySales += rev.services_total + rev.courses_total;
      st.retail      += rev.products_total;
    } else {
      st.hairSalesNet += rev.services_total + rev.courses_total;
      st.retail       += rev.products_total;
      st.treatments   += Number(r.treatment_aed) || 0;
    }
  });

  return { hairMap, beautyMap };
}

// Shared by aggData (weekly_data staff blobs) and aggDailyData (ledger+Phorest join) —
// same derived per-staff metrics regardless of where hairMap/beautyMap came from.
function buildStaffArraysFromMaps(hairMap, beautyMap) {
  const hairStaff = Object.values(hairMap).map((st, i) => {
    const hReturning    = (st.req||0) + (st.salon||0);
    const hRebookPct    = st.total    ? (st.rebooked / st.total * 100) : 0;
    const hRetentionPct = st.total    ? (hReturning  / st.total * 100) : 0;
    const hConvPct      = hReturning  ? (st.rebooked / hReturning * 100) : 0;
    const retail        = Number(st.retail) || 0;
    const netSalonTake  = (st.hairSalesNet||0) + retail;
    return {
      ...st,
      retail,
      avgBill:          st.total ? st.hairSalesNet / st.total : 0,
      rebookPct:        hRebookPct,
      retentionPct:     hRetentionPct,
      conversionPct:    hConvPct,
      ncrPct:           st.total ? ((st.newClientReq||0) / st.total * 100) : 0,
      // Treatment % is hair-only: ratio to hair services, not diluted by retail.
      treatmentPct:     st.hairSalesNet ? ((st.treatments||0) / st.hairSalesNet * 100) : 0,
      retailPct:        netSalonTake ? (retail / netSalonTake * 100) : 0,
      hairServicesExcl: (st.hairSalesNet||0) - (st.treatments||0),
      netSalonTake,
      color: SCOLS[i % SCOLS.length]
    };
  });
  const beautyStaff = Object.values(beautyMap).map((st,i) => {
    const bReturning    = (st.req||0) + (st.salon||0);
    const bRebookPct    = st.total   ? ((st.rebooked||0) / st.total * 100) : 0;
    const bRetentionPct = st.total   ? (bReturning / st.total * 100) : 0;
    const bConvPct      = bReturning ? ((st.rebooked||0) / bReturning * 100) : 0;
    const retail        = Number(st.retail) || 0;
    const netTake       = (st.beautySales||0) + retail;
    return {
      ...st,
      retail,
      avgBill:       st.total ? st.beautySales/st.total : 0,
      rebookPct:     bRebookPct,
      retentionPct:  bRetentionPct,
      conversionPct: bConvPct,
      ncrPct:        st.total ? ((st.newClientReq||0)/st.total*100) : 0,
      retailPct:     netTake ? (retail / netTake * 100) : 0,
      netSalonTake:  netTake,
      color: SCOLS[(i+3) % SCOLS.length]
    };
  });
  return { hairStaff, beautyStaff };
}

// Supabase/PostgREST caps a single response at 1000 rows by default — both
// branch_staff_daily and phorest_staff_daily blow past that over a multi-month range
// (15k+ and 7k+ rows respectively), and the two truncated slices land in unrelated
// date windows (no shared ORDER BY), so a plain .select('*') silently produces near-zero
// revenue matches. Page through with .range() until a short page confirms we're done.
async function loadAllRows(table, fromStr, toStr) {
  const PAGE = 1000;

  // Get the total row count first so every page can fire at once instead of
  // waiting on each other in turn — over a multi-month range that's the
  // difference between ~1 round trip and 15-20 sequential ones.
  const { count, error: countErr } = await sb
    .from(table)
    .select('*', { count: 'exact', head: true })
    .gte('date', fromStr)
    .lte('date', toStr);
  if (countErr || !count) return [];

  const pageCount = Math.ceil(count / PAGE);
  const pages = await Promise.all(
    Array.from({ length: pageCount }, (_, i) =>
      sb.from(table)
        .select('*')
        .gte('date', fromStr)
        .lte('date', toStr)
        .order('date', { ascending: true })
        .range(i * PAGE, i * PAGE + PAGE - 1)
    )
  );
  return pages.flatMap(p => p.data || []);
}

// Reads the view, not the table. LEDGER_NON_PERSON_NAMES below already skips the
// sheet's label rows, but it is applied in exactly one place —
// buildLedgerPhorestStaffMaps — while s.ncrPct is computed in four. The three
// paths that do not go through those maps were summing 'RETAIL' and ']' rows,
// whose retail AED sits in the ncr column, straight into new client requests.
//
// Filtering at the source covers every path at once, and the view's rule is
// behavioural as well as by-name, so the next label nobody has thought of is
// caught without editing a list here. See migration
// create_branch_staff_daily_clean_view.sql.
async function loadBranchStaffDailyRange(from, to) {
  const pad = n => String(n).padStart(2, '0');
  const fromStr = `${from.getFullYear()}-${pad(from.getMonth()+1)}-${pad(from.getDate())}`;
  const toStr   = `${to.getFullYear()}-${pad(to.getMonth()+1)}-${pad(to.getDate())}`;
  return loadAllRows('branch_staff_daily_clean', fromStr, toStr);
}

async function loadPhorestStaffDailyRange(from, to) {
  const pad = n => String(n).padStart(2, '0');
  const fromStr = `${from.getFullYear()}-${pad(from.getMonth()+1)}-${pad(from.getDate())}`;
  const toStr   = `${to.getFullYear()}-${pad(to.getMonth()+1)}-${pad(to.getDate())}`;
  return loadAllRows('phorest_staff_daily', fromStr, toStr);
}

// ── UTILISATION (staff_utilisation, from upload/utilisation-pdf.js) ──
// The Staff Utilisation report has no Hair/Beauty column of its own — names are
// attributed to a department by cross-referencing every name we've ever seen in
// the weekly ledger's hairStaff/beautyStaff blobs (allData, loaded once at
// startup). Kate, 2026-08-03: "ibase sa names na makikita sa ledgers".
function buildStaffDeptMap() {
  const map = {};
  const canon = (typeof canonicalStaffName === 'function') ? canonicalStaffName : (n => n);
  (allData || []).forEach(row => {
    const data = row.data || {};
    (data.hairStaff   || []).forEach(st => { if (st.name && st.name !== 'ASSISTANTS') map[canon(st.name).trim().toUpperCase()] = 'hair'; });
    (data.beautyStaff || []).forEach(st => { if (st.name && st.name !== 'ASSISTANTS') map[canon(st.name).trim().toUpperCase()] = 'beauty'; });
  });
  return map;
}

async function loadUtilisationForFilter(from, to, branches) {
  const pad = n => String(n).padStart(2, '0');
  const fromStr = `${from.getFullYear()}-${pad(from.getMonth()+1)}-${pad(from.getDate())}`;
  const toStr   = `${to.getFullYear()}-${pad(to.getMonth()+1)}-${pad(to.getDate())}`;
  const PAGE = 1000;
  let all = [];
  let offset = 0;
  while (true) {
    let q = sb.from('staff_utilisation')
      .select('staff_name,branch,available_hours,utilisation_hours,date_from,date_to')
      .lte('date_from', toStr)
      .gte('date_to', fromStr)
      .range(offset, offset + PAGE - 1);
    if (branches && branches.length) q = q.in('branch', branches);
    const { data, error } = await q;
    if (error || !data) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

// Hours-weighted, not a naive average of per-row percentages — mirrors
// utilAggregateByStaff's own math in upload/utilisation-pdf.js.
function aggregateUtilisation(rows, deptMap) {
  const canon = (typeof canonicalStaffName === 'function') ? canonicalStaffName : (n => n);
  let hairHours = 0, hairAvail = 0, beautyHours = 0, beautyAvail = 0;
  const unmatched = new Set();
  (rows || []).forEach(r => {
    const key  = canon(r.staff_name || '').trim().toUpperCase();
    const dept = deptMap[key];
    const avail = Number(r.available_hours) || 0;
    const used  = Number(r.utilisation_hours) || 0;
    if (dept === 'hair')        { hairHours += used; hairAvail += avail; }
    else if (dept === 'beauty') { beautyHours += used; beautyAvail += avail; }
    else unmatched.add(r.staff_name);
  });
  return { hairHours, hairAvail, beautyHours, beautyAvail, unmatched };
}

// ── WEEK RANGE HELPERS ───────────────────────────────────────

function isFullWeekRange(from, to) {
  if (!from || !to) return false;
  const diffDays = Math.round((to - from) / (1000 * 60 * 60 * 24)) + 1;
  if (diffDays % 7 !== 0) return false;
  const fromDay = from.getDay(); // 0=Sun, 1=Mon
  const toDay   = to.getDay();   // 0=Sun, 6=Sat
  return fromDay === 1 && toDay === 0;
}

async function loadWeeklyTotalsRange(from, to) {
  const pad = n => String(n).padStart(2, '0');
  const fromStr = `${from.getFullYear()}-${pad(from.getMonth()+1)}-${pad(from.getDate())}`;
  const toStr   = `${to.getFullYear()}-${pad(to.getMonth()+1)}-${pad(to.getDate())}`;
  const { data, error } = await sb
    .from('weekly_totals')
    .select('*')
    .gte('week_start', fromStr)
    .lte('week_end',   toStr)
    .order('week_start', { ascending: true });
  return (error || !data) ? [] : data;
}

function aggWeeklyTotals(rows) {
  if (!rows || !rows.length) return null;
  const s = {
    totalClients: 0, hairRetail: 0, treatmentSales: 0,
    colTake: 0, beautySales: 0, netTake: 0,
    _fromWeeklyTotals: true,
  };
  let totalRebooked = 0, hairClients = 0, beautyClients = 0, beautyRebooked = 0, totalNcr = 0;
  let wHairRebooked = 0;
  rows.forEach(r => {
    s.totalClients   += (r.hair_clients    || 0) + (r.beauty_clients  || 0);
    s.hairRetail     += r.hair_retail      || 0;
    s.treatmentSales += r.treatments       || 0;
    s.colTake        += r.col_take         || 0;
    s.beautySales    += r.beauty_sales     || 0;
    s.netTake        += r.net_take         || 0;
    totalRebooked    += (r.hair_rebooked   || 0) + (r.beauty_rebooked || 0);
    hairClients      += r.hair_clients     || 0;
    beautyClients    += r.beauty_clients   || 0;
    beautyRebooked   += r.beauty_rebooked  || 0;
    totalNcr         += r.hair_ncr         || 0;
    wHairRebooked    += r.hair_rebooked    || 0;
  });
  s.avgBill          = s.totalClients ? s.netTake / s.totalClients : 0;
  s.hairRetailPct    = s.netTake ? (s.hairRetail / s.netTake * 100) : 0;
  s.treatmentPct     = s.netTake ? (s.treatmentSales / s.netTake * 100) : 0;
  s.rebookPct        = s.totalClients ? (totalRebooked / s.totalClients * 100) : 0;
  s.totalRebooked    = totalRebooked;
  // Per-category breakdown — new columns populated on re-upload; null = not yet uploaded
  const _wColSum = (key) => rows.some(r => r[key] != null) ? rows.reduce((a,r) => a + (r[key] || 0), 0) : null;
  s.hairBreakdown = {
    ncr:     rows.reduce((a,r) => a + (r.hair_ncr_weekend ?? r.hair_ncr ?? 0), 0),
    req:     _wColSum('hair_req'),
    salon:   _wColSum('hair_salon'),
    new:     _wColSum('hair_new'),
    rebooked: wHairRebooked,
  };
  s.beautyBreakdown = {
    ncr:     _wColSum('beauty_ncr'),
    req:     _wColSum('beauty_req'),
    salon:   _wColSum('beauty_salon'),
    new:     _wColSum('beauty_new'),
    rebooked: beautyRebooked,
  };
  s.beautyRebookPct  = beautyClients  ? (beautyRebooked / beautyClients * 100)  : 0;
  s.hairAvgBill      = hairClients ? ((s.netTake - s.beautySales - s.hairRetail) / hairClients) : 0;
  s.beautyAvgBill    = beautyClients ? (s.beautySales / beautyClients) : 0;
  s.hairRebookPct    = hairClients ? (wHairRebooked / hairClients * 100) : 0;
  s.beautyPct        = s.netTake ? (s.beautySales / s.netTake * 100) : 0;
  s.ncrPct           = hairClients ? (totalNcr / hairClients * 100) : 0;
  s.hairNcrPct       = s.ncrPct;
  const wBeautyNcr   = _wColSum('beauty_ncr');
  s.beautyNcrPct     = (wBeautyNcr != null && beautyClients) ? (wBeautyNcr / beautyClients * 100) : null;
  s.combinedNcrPct   = s.totalClients ? ((totalNcr + (wBeautyNcr||0)) / s.totalClients * 100) : 0;
  s.retentionPct     = 0;
  s.conversionPct    = 0;
  s._retailWarnings  = [];
  s.totals = {
    total:    hairClients,
    rebooked: rows.reduce((a, r) => a + (r.hair_rebooked || 0) + (r.beauty_rebooked || 0), 0),
  };
  return { summary: s, hairStaff: [], beautyStaff: [] };
}

// ── DATA AGGREGATION ────────────────────────────────────────

function aggData(datasets) {
  if (!datasets.length) return null;
  const hairMap = {}, beautyMap = {};
  const s = { totalClients:0, hairRetail:0, treatmentSales:0, colTake:0, beautySales:0, netTake:0, colPct:0, rebookPct:0 };
  let totalRebooked = 0, totalHairClients = 0;
  // Track retail mismatch warnings across all weeks aggregated
  const retailWarnings = [];

  datasets.forEach(d => {
    if (!d) return;
    const sm = d.summary || {};

    s.totalClients  += sm.totalClients  || 0;

    // Retail: parser already prioritises daily-sheet sum. Fall back to staff sum if 0.
    let weekRetail = Number(
      sm.hairRetail ??
      sm.retail ??
      sm.retailSales ??
      sm.productSales ??
      sm.product ??
      0
    ) || 0;
    if (!weekRetail && Array.isArray(d.hairStaff)) {
      weekRetail = d.hairStaff.reduce((a, st) => a + (Number(st.retail) || 0), 0);
    }
    s.hairRetail += weekRetail;
    if (sm._retailDebug && sm._retailDebug.mismatch) retailWarnings.push(sm._retailDebug.mismatch);

    s.treatmentSales+= sm.treatmentSales|| 0;
    s.colTake       += sm.colTake       || 0;
    s.beautySales   += sm.beautySales   || 0;
    s.netTake       += sm.netTake       || 0;
    totalRebooked += sm.totalRebooked != null ? sm.totalRebooked : (sm.totals?.rebooked || 0);
    if (sm.totals) totalHairClients += sm.totals.total||0;

    (d.hairStaff || []).forEach(st => {
      const retailVal = Number(
        st.retail ?? st.retailSales ?? st.productSales ?? st.product ?? 0
      ) || 0;
      if (!hairMap[st.name]) {
        hairMap[st.name] = { ...st, retail: retailVal };
      } else {
        const a = hairMap[st.name];
        a.total        += st.total;
        a.newC         += st.newC;
        a.rebooked     += st.rebooked;
        a.hairSalesNet += st.hairSalesNet;
        a.retail       += retailVal;
        a.treatments   += st.treatments;
        a.req          += (st.req          || 0);
        a.salon        += (st.salon        || 0);
        a.newClientReq += (st.newClientReq || 0);
      }
    });
    (d.beautyStaff || []).forEach(st => {
      if (!beautyMap[st.name]) beautyMap[st.name] = { ...st };
      else {
        beautyMap[st.name].total       += st.total;
        beautyMap[st.name].beautySales += st.beautySales;
        beautyMap[st.name].rebooked    += (st.rebooked || 0);
        beautyMap[st.name].newC        += (st.newC || 0);
        beautyMap[st.name].req         += (st.req || 0);
        beautyMap[st.name].salon       += (st.salon || 0);
      }
    });
  });

  s.avgBill = s.totalClients ? (s.netTake / s.totalClients) : 0;
  s.treatmentPct = s.netTake ? (s.treatmentSales / s.netTake * 100) : 0;

  // Retail % per locked decision: Retail ÷ Total Revenue (Net Salon Take)
  s.hairRetailPct = s.netTake ? (s.hairRetail / s.netTake * 100) : 0;
  s._retailWarnings = retailWarnings;

  s.rebookPct     = s.totalClients ? (totalRebooked / s.totalClients * 100) : 0;
  s.totalRebooked = totalRebooked;
  s.beautyPct = s.netTake ? (s.beautySales / s.netTake * 100) : 0;

  // NCR = New Client Requests (hair_ncr / newClientReq) — NOT new clients (newC)
  // Denominator excludes rebooked: req + salon + new + ncr (matches card description)
  const hairNcrSum     = Object.values(hairMap).reduce((a,st) => a+(st.newClientReq||0), 0);
  const hairClientSum  = Object.values(hairMap).reduce((a,st) => a+(st.req||0)+(st.salon||0)+(st.newC||0)+(st.newClientReq||0), 0);
  const beautyNcrSum   = Object.values(beautyMap).reduce((a,st) => a+(st.newClientReq||0), 0);
  const beautyClientSum= Object.values(beautyMap).reduce((a,st) => a+(st.req||0)+(st.salon||0)+(st.newC||0)+(st.newClientReq||0), 0);
  s.ncrPct        = hairClientSum  ? (hairNcrSum  / hairClientSum  * 100) : 0;
  s.hairNcrPct    = s.ncrPct;
  s.beautyNcrPct  = beautyClientSum ? (beautyNcrSum / beautyClientSum * 100) : null;
  const combinedNcrBase = hairClientSum + beautyClientSum;
  s.combinedNcrPct= combinedNcrBase ? ((hairNcrSum + beautyNcrSum) / combinedNcrBase * 100) : 0;

  // Per-category breakdowns for the Total Clients card dropdown
  s.hairBreakdown = {
    ncr:     Object.values(hairMap).reduce((a,st) => a+(st.newClientReq||0), 0),
    req:     Object.values(hairMap).reduce((a,st) => a+(st.req||0), 0),
    salon:   Object.values(hairMap).reduce((a,st) => a+(st.salon||0), 0),
    new:     Object.values(hairMap).reduce((a,st) => a+(st.newC||0), 0),
    rebooked:Object.values(hairMap).reduce((a,st) => a+(st.rebooked||0), 0),
  };
  s.beautyBreakdown = {
    ncr:     Object.values(beautyMap).reduce((a,st) => a+(st.newClientReq||0), 0),
    req:     Object.values(beautyMap).reduce((a,st) => a+(st.req||0), 0),
    salon:   Object.values(beautyMap).reduce((a,st) => a+(st.salon||0), 0),
    new:     Object.values(beautyMap).reduce((a,st) => a+(st.newC||0), 0),
    rebooked:Object.values(beautyMap).reduce((a,st) => a+(st.rebooked||0), 0),
  };
  s.totalRebooked = (s.hairBreakdown.rebooked || 0) + (s.beautyBreakdown.rebooked || 0);
  s.rebookPct     = s.totalClients ? (s.totalRebooked / s.totalClients * 100) : 0;

  const { hairStaff, beautyStaff } = buildStaffArraysFromMaps(hairMap, beautyMap);

  // Summary-level: Retention = (req+salon) / total hair clients
  const totalReturningH = Object.values(hairMap).reduce((a,st) => a+(st.req||0)+(st.salon||0), 0);
  s.retentionPct  = totalHairClients ? (totalReturningH / totalHairClients * 100) : 0;
  // Summary-level: Conversion = rebooked / returning (of returning, how many rebooked)
  s.conversionPct = totalReturningH  ? (totalRebooked   / totalReturningH * 100)  : 0;
  // Summary-level: Beauty Rebooking = total beauty rebooked / total beauty clients
  const totalBeautyClients  = Object.values(beautyMap).reduce((a,st) => a+(st.total||0), 0);
  const totalBeautyRebooked = Object.values(beautyMap).reduce((a,st) => a+(st.rebooked||0), 0);
  s.beautyRebookPct = totalBeautyClients ? (totalBeautyRebooked / totalBeautyClients * 100) : 0;
  const totalHairClientsAgg = Object.values(hairMap).reduce((a,st) => a+(st.total||0), 0);
  const hairSalesNetAgg     = Object.values(hairMap).reduce((a,st) => a+(st.hairSalesNet||0), 0);
  const totalHairRebookedAgg= Object.values(hairMap).reduce((a,st) => a+(st.rebooked||0), 0);
  s.hairAvgBill   = totalHairClientsAgg ? hairSalesNetAgg / totalHairClientsAgg : 0;
  s.beautyAvgBill = totalBeautyClients  ? s.beautySales / totalBeautyClients : 0;
  s.hairRebookPct = totalHairClientsAgg ? (totalHairRebookedAgg / totalHairClientsAgg * 100) : 0;

  return { summary: s, hairStaff, beautyStaff };
}

function aggByBranch() {
  const result = {};
  ACTIVE_BRANCHES.forEach(code => {
    if (dateFrom && dateTo && isFullWeekRange(dateFrom, dateTo)) {
      // Full week(s): use weekly_totals cached from render (filter by branch)
      const branchRows = (window._cachedWeeklyTotals || []).filter(r => r.branch === code);
      result[code] = branchRows.length ? aggWeeklyTotals(branchRows) : null;
    } else if (dateFrom && dateTo && window._cachedDailyJoin) {
      // Partial week: same branch_staff_daily/phorest_staff_daily join as the main summary,
      // sliced per branch — aggDailyData(dailyRows) alone (old code) silently fell back to
      // the stale daily_data table since branchStaffRows/phorestStaffRows were never passed.
      const { dailyRows, branchStaffRows, phorestStaffRows } = window._cachedDailyJoin;
      const dR = dailyRows.filter(r => r.branch === code);
      const bR = branchStaffRows.filter(r => r.branch === code);
      const pR = phorestStaffRows.filter(r => r.branch === code);
      result[code] = (bR.length || dR.length) ? aggDailyData(dR, bR, pR) : null;
    } else {
      // Weekly mode: filter allData by branch + date range
      const rows = allData.filter(d => {
        if (d.branch !== code) return false;
        if (dateFrom || dateTo) {
          const weekDates = getWeekDatesFromLabel(d.week_label);
          const checkDate = weekDates
            ? weekDates.start
            : (() => { const u = new Date(d.uploaded_at); u.setHours(0,0,0,0); return u; })();
          if (dateFrom && checkDate < dateFrom) return false;
          if (dateTo   && checkDate > dateTo)   return false;
        }
        return true;
      });
      result[code] = aggData(rows.map(d => d.data));
    }
  });
  return result;
}


// ── CHART HELPERS ────────────────────────────────────────────

function destroyCharts() {
  Object.values(charts).forEach(c => { try { c.destroy(); } catch(e) {} });
  charts = {};
}

// Renders an inverted-pyramid client funnel split down the middle: hair on the
// left, beauty on the right, each stage narrowing relative to that side's own
// Total Clients so the two halves stay visually comparable even though hair
// volume dwarfs beauty volume in raw counts.
function buildClientFunnelHTML(s, dark) {
  const hairTotal      = s.hairTotalClients || 0;
  const beautyTotal    = s.beautyTotalClients || 0;
  const hairNew        = s.hairNewClients || 0;
  const beautyNew      = s.beautyNewClients || 0;
  const hairRebooked   = s.hairRebookedCount || 0;
  const beautyRebooked = s.beautyBreakdown?.rebooked || 0;
  const hairSalon      = s.hairBreakdown?.salon || 0;
  const beautySalon    = s.beautyBreakdown?.salon || 0;
  const hairReq        = s.hairBreakdown?.req || 0;
  const beautyReq      = s.beautyBreakdown?.req || 0;
  const hairNCR         = s.hairNCR || 0;
  const beautyNCR       = s.beautyNCR || 0;

  const hairColor   = dark ? '#C4B5FD' : '#7C5CD4';
  const beautyColor = dark ? '#99F6E4' : '#0F8A72';

  // Ordered by hair-side magnitude (largest dataset) for a clean taper — these
  // are independent booking-type breakdowns, not strict sequential funnel
  // stages, so beauty isn't guaranteed to taper in the same order.
  const stages = [
    { label: 'Total Clients',  hair: hairTotal,    beauty: beautyTotal },
    { label: 'Request Client', hair: hairReq,      beauty: beautyReq },
    { label: 'Rebooked',       hair: hairRebooked, beauty: beautyRebooked },
    { label: 'Salon Client',   hair: hairSalon,    beauty: beautySalon },
    { label: 'New Clients',    hair: hairNew,      beauty: beautyNew },
    { label: 'NCR (New Client Req)', hair: hairNCR, beauty: beautyNCR },
  ];

  // Bar fills keep the same brand --hair/--beauty tokens used everywhere else on the
  // dashboard — swapping colors would break that consistency. Kate flagged the flat
  // fills as too matingkad against the light-mode white card, so instead of recoloring
  // we just soften them with a shadow (heavier in light mode, where there's no dark
  // surface behind them to give depth for free).
  const barShadow = dark ? '0 1px 4px rgba(0,0,0,0.35)' : '0 2px 6px rgba(26,26,26,0.18)';
  const rows = stages.map(st => {
    const hairPct   = hairTotal   ? Math.min(100, Math.max(st.hair   ? 8 : 0, (st.hair   / hairTotal)   * 100)) : 0;
    const beautyPct = beautyTotal ? Math.min(100, Math.max(st.beauty ? 8 : 0, (st.beauty / beautyTotal) * 100)) : 0;
    return `
      <div style="display:flex;align-items:center;margin-bottom:12px">
        <div style="flex:1;display:flex;justify-content:flex-end;align-items:center;gap:8px;min-width:0">
          <span class="tabular" style="font-size:11.5px;font-weight:600;color:var(--text);white-space:nowrap">${st.hair.toLocaleString()}</span>
          <div style="height:26px;width:${hairPct}%;background:${hairColor};border-radius:6px 2px 2px 6px;box-shadow:${barShadow};transition:width .6s ease"></div>
        </div>
        <div style="width:104px;flex-shrink:0;text-align:center;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);border-left:1px dashed var(--border);border-right:1px dashed var(--border);padding:0 6px">${st.label}</div>
        <div style="flex:1;display:flex;justify-content:flex-start;align-items:center;gap:8px;min-width:0">
          <div style="height:26px;width:${beautyPct}%;background:${beautyColor};border-radius:2px 6px 6px 2px;box-shadow:${barShadow};transition:width .6s ease"></div>
          <span class="tabular" style="font-size:11.5px;font-weight:600;color:var(--text);white-space:nowrap">${st.beauty.toLocaleString()}</span>
        </div>
      </div>`;
  }).join('');

  return `
    <div style="max-width:520px">
      <div style="display:flex;justify-content:space-between;margin-bottom:10px">
        <span style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${hairColor}">◂ Hair</span>
        <span style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${beautyColor}">Beauty ▸</span>
      </div>
      ${rows}
    </div>`;
}

// "This Week's Wins" — 3 auto-generated highlight callouts filling the blank space
// below the Client Funnel + Branch Performance row (hero column runs shorter than
// the receipt beside it). Top performer, biggest KPI move vs previous period, and
// top branch (or top department when a single branch is selected). Kate, 2026-08-03.
function buildWinsHTML(s, prevS, prevPeriodLabel, hairStaff, beautyStaff, branchLabel, byBranch, dark) {
  const hairColor   = dark ? '#C4B5FD' : '#7C5CD4';
  const beautyColor = dark ? '#99F6E4' : '#0F8A72';

  // Some accent colors passed in here (branch pastels like Khalifa City's #FFD4D9) are
  // meant for dots/backgrounds, not body text — coloring the eyebrow text directly made
  // it unreadable on the light card. Keep the eyebrow in --muted (always readable) and
  // use `color` only as a dot + left border accent, same convention as everywhere else
  // brand colors show up on this dashboard.
  // `profile` is an optional STAFF_PROFILES entry (staff-profiles.js): {photo, ig}.
  // Both keys are optional and independent, so a stylist with no photo, no handle,
  // or no profile at all renders exactly as this card always did. A photo that
  // 404s hides itself via onerror rather than showing a broken-image icon.
  const winCard = (eyebrow, color, title, sub, profile) => {
    const p = profile || {};
    const titleHtml = p.ig
      ? `<a href="https://instagram.com/${encodeURIComponent(p.ig)}" target="_blank" rel="noopener noreferrer"
            title="@${escapeHtml(p.ig)} on Instagram"
            style="color:inherit;text-decoration:none;border-bottom:1px solid ${color}">${escapeHtml(title)}</a>`
      : escapeHtml(title);
    // The stylist-card look — head breaking out above a rounded colour block — is
    // baked into the PNG itself: the block is the card's own accent panel, and the
    // area above it is transparent. So no border-radius, background or border here;
    // adding any would clip the very overhang that makes it read as the card.
    const avatarHtml = p.photo
      ? `<img src="assets/staff/${encodeURIComponent(p.photo)}" alt="" loading="lazy"
             onerror="this.style.display='none'"
             style="height:62px;width:auto;flex-shrink:0">`
      : '';
    return `
    <div style="flex:1;min-width:200px;padding:14px 16px;border-radius:10px;background:var(--surface2);border:1px solid var(--border);border-left:3px solid ${color}">
      <div style="display:flex;align-items:center;gap:6px;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">
        <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${color};flex-shrink:0"></span>${eyebrow}
      </div>
      <div style="display:flex;align-items:center;gap:11px;margin-top:6px">
        ${avatarHtml}
        <div style="min-width:0">
          <div style="font-family:'Playfair Display',serif;font-weight:600;font-size:16px;color:var(--text);line-height:1.3">${titleHtml}</div>
          <div style="font-size:11.5px;color:var(--muted);margin-top:4px">${sub}</div>
        </div>
      </div>
    </div>`;
  };

  // ── Top performer, one per department ──
  // Hair and beauty used to share a single card, which meant beauty could never
  // win it: hair turns over roughly ten times beauty's revenue, so the "top
  // performer" was structurally always a hair stylist. Kate, 2026-08-12: beauty
  // gets its own card, judged against its own team.
  const poolFor = (staff, dept, color, revKey) =>
    (staff||[])
      .filter(st => st.name !== 'ASSISTANTS')
      .map(st => ({ name: st.name, dept, color, revenue: st[revKey]||0, total: st.total||0, rebookPct: st.rebookPct||0 }))
      .filter(p => p.revenue > 0)
      .sort((a,b) => b.revenue - a.revenue);
  const topOf = (pool, label) => {
    const t = pool[0];
    return t
      ? winCard(label, t.color, `${t.name} — ${t.dept}`,
          `${fmtAED(t.revenue)} · ${t.total.toLocaleString()} clients · ${fmtPct(t.rebookPct)} rebooked`,
          (typeof staffProfile === 'function') ? staffProfile(t.name) : null)
      : winCard(label, 'var(--muted)', 'No staff data for this period', 'Staff-level figures aren’t available for this date range.');
  };
  const performerCard = topOf(poolFor(hairStaff,   'Hair',   hairColor,   'hairSalesNet'), 'Top Performer · Hair');
  const beautyCard    = topOf(poolFor(beautyStaff, 'Beauty', beautyColor, 'beautySales'),  'Top Performer · Beauty');

  // ── Biggest KPI move vs previous period (percentage-point deltas, same units) ──
  const moves = [
    { label: 'Rebooking %', curr: s.rebookPct,    prev: prevS?.rebookPct,    color: '#0F6E56' },
    { label: 'Treatment %', curr: s.treatmentPct,  prev: prevS?.treatmentPct,  color: '#BA7517' },
    { label: 'Retail %',    curr: s.hairRetailPct, prev: prevS?.hairRetailPct, color: hairColor },
  ].filter(m => m.prev != null).map(m => ({ ...m, delta: (m.curr||0) - m.prev }))
   .sort((a,b) => b.delta - a.delta);
  const bestMove = moves[0];
  const improvementCard = (bestMove && bestMove.delta > 0)
    ? winCard('Biggest Improvement', bestMove.color, `${bestMove.label} up ${bestMove.delta.toFixed(1)}pp`,
        `${bestMove.prev.toFixed(1)}% → ${bestMove.curr.toFixed(1)}% vs ${prevPeriodLabel}`)
    : winCard('Biggest Improvement', 'var(--muted)', 'Holding steady', `No tracked KPI moved up vs ${prevPeriodLabel}.`);

  // ── Top branch (All Branches view) or top department (single-branch view) ──
  let branchCard;
  const branchEntries = branchLabel === 'All Branches' && byBranch
    ? Object.keys(byBranch).map(code => ({ code, s: byBranch[code]?.summary })).filter(e => e.s && e.s.netTake > 0).sort((a,b) => b.s.netTake - a.s.netTake)
    : [];
  if (branchEntries.length) {
    const b = branchEntries[0];
    branchCard = winCard('Top Branch', BRANCH_INFO[b.code]?.color || '#FF9B9B', BRANCH_INFO[b.code]?.name || b.code,
      `${fmtAED(b.s.netTake)} net revenue · ${fmtPct(b.s.rebookPct||0)} rebooking`);
  } else {
    const hairAhead = (s.hairRebookPct||0) >= (s.beautyRebookPct||0);
    branchCard = winCard('Top Department', hairAhead ? hairColor : beautyColor, hairAhead ? 'Hair — Rebooking' : 'Beauty — Rebooking',
      `${fmtPct(hairAhead ? (s.hairRebookPct||0) : (s.beautyRebookPct||0))} rebooking, ahead of ${hairAhead ? 'Beauty' : 'Hair'} this period`);
  }

  return `<div style="display:flex;gap:14px;flex-wrap:wrap">${performerCard}${beautyCard}${improvementCard}${branchCard}</div>`;
}

function buildCmpChart(byBranch, metric, dark, ttStyle, gc, tc, catFilter, canvasId) {
  catFilter = catFilter || 'hb';
  canvasId = canvasId || 'cmpChart';
  // Resolve the actual summary key based on category filter where metrics split by Hair/Beauty/Hair & Beauty
  const resolveKey = (m, cat) => {
    if (m === 'avgBill')       return cat === 'hair' ? 'hairAvgBill'   : cat === 'beauty' ? 'beautyAvgBill'   : 'avgBill';
    if (m === 'rebookPct')     return cat === 'hair' ? 'hairRebookPct' : cat === 'beauty' ? 'beautyRebookPct' : 'rebookPct';
    if (m === 'ncrPct')        return cat === 'hair' ? 'hairNcrPct'    : cat === 'beauty' ? 'beautyNcrPct'    : 'ncrPct';
    if (m === 'retailPct')     return 'hairRetailPct'; // combined-only field (legacy name), no hair/beauty split per-branch
    return m; // netTake, totalClients, totalRebooked, treatmentPct — no split
  };
  const resolvedMetric = resolveKey(metric, catFilter);

  const activeBranches = sel.branch.includes('all') ? ACTIVE_BRANCHES : sel.branch;
  const entries = activeBranches.map(b => {
    const d = byBranch[b];
    const info = BRANCH_INFO[b];
    // Light mode needs the darker `colorLight` variant — the flat dark-mode pastel
    // reads as too matingkad/washed-out against the light cream card otherwise.
    const barColor = dark ? (info?.color||'#ccc') : (info?.colorLight || info?.color || '#ccc');
    return { branch: b, val: +(d ? d.summary[resolvedMetric]||0 : 0).toFixed(2), color: barColor, name: info?.name||b };
  }).sort((a,b) => b.val - a.val);

  const labels = entries.map(e => e.name);
  const vals   = entries.map(e => e.val);
  const colors = entries.map(e => e.color);
  const nonZeroVals = vals.filter(v => v > 0);
  const avg    = nonZeroVals.length ? nonZeroVals.reduce((a,b) => a+b, 0) / nonZeroVals.length : 0;
  const catLabel = catFilter === 'hair' ? 'Hair' : catFilter === 'beauty' ? 'Beauty' : 'Hair & Beauty';
  const metricLabels = {
    netTake:       'Revenue (AED)',
    totalClients:  'Total Clients',
    totalRebooked: 'Rebooked Clients',
    avgBill:       `${catLabel} Avg Bill (AED)`,
    rebookPct:     `${catLabel} Rebooking %`,
    ncrPct:        `${catLabel} NCR %`,
    treatmentPct:  'Treatment %',
    retailPct:     'Retail %',
  };
  const lc = dark ? '#C4B5FD' : '#5C5557';

  const canvasEl = document.getElementById(canvasId);
  if (!canvasEl) return;
  // Canvas fills don't support CSS box-shadow, so a soft drop shadow behind each bar
  // (to take the edge off the light-mode color, same ask as the Client Funnel bars)
  // needs its own tiny local plugin — only wraps dataset drawing, not axes/grid.
  const barShadowPlugin = {
    id: 'barShadow',
    beforeDatasetsDraw(chart) {
      chart.ctx.save();
      chart.ctx.shadowColor = dark ? 'rgba(0,0,0,0.35)' : 'rgba(26,26,26,0.22)';
      chart.ctx.shadowBlur = 6;
      chart.ctx.shadowOffsetY = 3;
    },
    afterDatasetsDraw(chart) { chart.ctx.restore(); },
  };
  charts.cmp = new Chart(canvasEl, {
    data: { labels, datasets: [
      { type:'bar', label: metricLabels[metric]||metric, data: vals, backgroundColor: colors.map(c=>c+'cc'), borderColor: colors, borderWidth: 1.5, borderRadius: 8, barThickness: 28, yAxisID:'y' },
      { type:'line', label:'── Average ' + (metricLabels[metric]||metric), data: vals.map(()=>+avg.toFixed(2)), borderColor: lc, backgroundColor:'transparent', borderWidth:2, borderDash:[6,4], pointRadius:5, pointBackgroundColor:lc, pointBorderColor:lc, tension:0, yAxisID:'y' }
    ]},
    options: { animation:{duration:500,easing:'easeInOutQuart'}, responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false},
      plugins:{legend:{display:true,labels:{color:tc,font:{family:'Inter',size:11},boxWidth:12,filter:(item)=>item.datasetIndex===1}},tooltip:ttStyle},
      scales:{x:{ticks:{color:tc,font:{family:'Inter',size:11}},grid:{color:gc}},y:{ticks:{color:tc,font:{family:'Inter',size:11}},grid:{color:gc}}}
    },
    plugins: [barShadowPlugin],
  });
}


// Per-day ledger+Phorest join, cached once per daily-range load so the trend chart
// can show a real day-by-day series instead of one lump total for the whole range.
function buildDailyTrendCache(dailyRows, branchStaffRows, phorestStaffRows) {
  const dates = new Set();
  (branchStaffRows||[]).forEach(r => dates.add(r.date));
  (dailyRows||[]).forEach(r => dates.add(r.date));
  return Array.from(dates).sort().map(date => {
    const dayBranchRows  = (branchStaffRows||[]).filter(r => r.date === date);
    const dayPhorestRows = (phorestStaffRows||[]).filter(r => r.date === date);
    const dayDailyRows   = (dailyRows||[]).filter(r => r.date === date);
    const agg = aggDailyData(dayDailyRows, dayBranchRows, dayPhorestRows);
    return { date, netTake: agg ? agg.summary.netTake||0 : 0, totalClients: agg ? agg.summary.totalClients||0 : 0 };
  });
}

// Picks whichever cached source matches the active view (daily-range join, weekly_totals,
// or the default weekly summary table) and returns one consistent {labels, revenue, clients} shape.
function buildTrendSeries() {
  if (window._cachedDailyTrend && window._cachedDailyTrend.length) {
    const rows = window._cachedDailyTrend;
    return {
      labels:  rows.map(r => new Date(r.date).toLocaleDateString('en-GB',{day:'numeric',month:'short'})),
      revenue: rows.map(r => r.netTake),
      clients: rows.map(r => r.totalClients),
    };
  }
  if (window._cachedWeeklyTotals && window._cachedWeeklyTotals.length) {
    const rows = sel.branch.includes('all') ? window._cachedWeeklyTotals : window._cachedWeeklyTotals.filter(r => sel.branch.includes(r.branch));
    const byWeek = {};
    rows.forEach(r => {
      const key = r.week_start;
      if (!byWeek[key]) byWeek[key] = { revenue: 0, clients: 0 };
      byWeek[key].revenue += r.net_take || 0;
      byWeek[key].clients += (r.hair_clients||0) + (r.beauty_clients||0);
    });
    const keys = Object.keys(byWeek).sort();
    return {
      labels:  keys.map(k => new Date(k).toLocaleDateString('en-GB',{day:'numeric',month:'short'})),
      revenue: keys.map(k => byWeek[k].revenue),
      clients: keys.map(k => byWeek[k].clients),
    };
  }
  const rows = getFilteredData();
  const byWeek = {};
  rows.forEach(f => { (byWeek[f.week_label || 'Unknown'] = byWeek[f.week_label || 'Unknown'] || []).push(f.data); });
  const sortedKeys = Object.keys(byWeek).sort((a,b) => {
    const da = getWeekDatesFromLabel(a)?.start || 0;
    const db = getWeekDatesFromLabel(b)?.start || 0;
    return da - db;
  });
  return {
    labels:  sortedKeys,
    revenue: sortedKeys.map(k => { const agg = aggData(byWeek[k]); return agg ? agg.summary.netTake||0 : 0; }),
    clients: sortedKeys.map(k => { const agg = aggData(byWeek[k]); return agg ? agg.summary.totalClients||0 : 0; }),
  };
}

function buildTrendChart(dark, ttStyle, gc, tc) {
  const { labels, revenue, clients } = buildTrendSeries();
  charts.trend = new Chart(document.getElementById('trendChart'), {
    data: {
      labels,
      datasets: [
        { type:'line', label:'Net Revenue (AED)', data: revenue, borderColor:'#99F6E4', backgroundColor:'rgba(153,246,228,0.12)', borderWidth:2, pointRadius:3, pointBackgroundColor:'#99F6E4', tension:0.3, fill:true, yAxisID:'yRev' },
        { type:'line', label:'Total Clients', data: clients, borderColor:'#C4B5FD', backgroundColor:'transparent', borderWidth:2, pointRadius:3, pointBackgroundColor:'#C4B5FD', tension:0.3, borderDash:[5,3], yAxisID:'yClients' },
      ],
    },
    options: {
      animation:{duration:500,easing:'easeInOutQuart'}, responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false},
      plugins:{ legend:{display:true,labels:{color:tc,font:{family:'DM Sans',size:11},boxWidth:12}}, tooltip:ttStyle },
      scales:{
        x:{ ticks:{color:tc,font:{family:'DM Sans',size:10}}, grid:{color:gc} },
        yRev:{ position:'left', ticks:{color:tc,font:{family:'DM Sans',size:10}}, grid:{color:gc} },
        yClients:{ position:'right', ticks:{color:tc,font:{family:'DM Sans',size:10}}, grid:{drawOnChartArea:false} },
      }
    }
  });
}

// ── COLLAPSIBLE SECTIONS ─────────────────────────────────────

function toggleSection(id) {
  sectionState[id] = !sectionState[id];
  const body  = document.getElementById('body-'  + id);
  const arrow = document.getElementById('arrow-' + id);
  const hdr   = arrow ? arrow.closest('.support-section-hdr') : null;
  if (body) { smoothSlide(body, sectionState[id]); body.classList.toggle('open', sectionState[id]); }
  if (arrow) arrow.classList.toggle('open', sectionState[id]);
  if (hdr)   hdr.classList.toggle('open', sectionState[id]);
}
function applySection(id) {
  const body  = document.getElementById('body-'  + id);
  const arrow = document.getElementById('arrow-' + id);
  const hdr   = arrow ? arrow.closest('.support-section-hdr') : null;
  const open  = sectionState[id];
  if (body) {
    // instant (no animation) on initial render; animate only on user toggle.
    // .support-section-body{max-height:0} only lifts via the .open class
    // (see .support-section-body.open{max-height:2000px} in the stylesheet) —
    // display alone doesn't uncap it, so both must be set together.
    body.style.display = open ? 'block' : 'none';
    body.classList.toggle('open', open);
  }
  if (arrow) arrow.classList.toggle('open', open);
  if (hdr)   hdr.classList.toggle('open', open);
}
function restoreSections() {
  Object.keys(sectionState).forEach(id => applySection(id));
}


// ── DASHBOARD RENDER ─────────────────────────────────────────

// AFTER — hoist filtered:
async function renderDashboard() {
  paintFilterChips();
  const main = document.getElementById('mainContent');
  let d;
  let filtered = [];   // ← hoist here

  try {

    if (dateFrom && dateTo) {
    if (isFullWeekRange(dateFrom, dateTo)) {
      main.innerHTML = '<div class="loading">Loading weekly data...</div>';
      let weekRows = await loadWeeklyTotalsRange(dateFrom, dateTo);
      window._cachedWeeklyTotals = weekRows;
      currentDailyRows = [];
      window._cachedDailyTrend = null; // trend chart uses window._cachedWeeklyTotals for this path
      window._cachedDailyJoin = null;
      if (!sel.branch.includes('all')) {
        weekRows = weekRows.filter(r => sel.branch.includes(r.branch));
      }
      if (!weekRows.length) {
        destroyCharts();
        main.innerHTML = '<div class="empty">No weekly data found for this date range. Upload the XLSX first.</div>';
        return;
      }
      d = aggWeeklyTotals(weekRows);
    } else {
      main.innerHTML = '<div class="loading">Loading daily data...</div>';
      let [dailyRows, branchStaffRows, phorestStaffRows] = await Promise.all([
        loadDailyRange(dateFrom, dateTo),
        loadBranchStaffDailyRange(dateFrom, dateTo),
        loadPhorestStaffDailyRange(dateFrom, dateTo),
      ]);
      currentDailyRows = dailyRows;
      window._cachedDailyJoin = { dailyRows, branchStaffRows, phorestStaffRows }; // pre-branch-filter, so aggByBranch() can slice per code

      if (!sel.branch.includes('all')) {
        dailyRows        = dailyRows.filter(r => sel.branch.includes(r.branch));
        branchStaffRows  = branchStaffRows.filter(r => sel.branch.includes(r.branch));
        phorestStaffRows = phorestStaffRows.filter(r => sel.branch.includes(r.branch));
      }
      if (!dailyRows.length && !branchStaffRows.length) {
        destroyCharts();
        main.innerHTML = '<div class="empty">No data found for this date range.</div>';
        return;
      }
      d = aggDailyData(dailyRows, branchStaffRows, phorestStaffRows);
            window._cachedDailyTrend = buildDailyTrendCache(dailyRows, branchStaffRows, phorestStaffRows);
    }
  } else {
    currentDailyRows = [];
    window._cachedDailyTrend = null; // trend chart falls back to the weekly summary table for this path
    window._cachedWeeklyTotals = [];
    filtered = getFilteredData();   // ← assign to hoisted var
    if (!filtered.length) {
      destroyCharts();
      main.innerHTML = '<div class="empty">No data for this selection.</div>';
      return;
    }
    d = aggData(filtered.map(f => f.data));
  }

  } catch(err) {
    destroyCharts();
    main.innerHTML = `<div class="empty" style="border:1px solid rgba(255,68,68,0.3);color:var(--bad)">
      <div style="font-size:14px;font-weight:600;margin-bottom:6px">⚠ Failed to load data</div>
      <div style="font-size:12px;opacity:0.8">Check your connection and try refreshing the page.</div>
      ${err && err.message ? `<div style="font-size:10px;opacity:0.5;margin-top:6px;font-family:monospace">${err.message}</div>` : ''}
    </div>`;
    return;
  }

  if (!d) return;
  const s = d.summary;
  window._lastDashState = s;

  // Utilisation — nice-to-have, don't break the render if the fetch/match fails.
  // No explicit dateFrom/dateTo (weekly-view default) falls back to the whole
  // backfill window, branch-filtered only, rather than an exact period match.
  try {
    const branchesForUtil = sel.branch.includes('all') ? ACTIVE_BRANCHES : sel.branch;
    const utilFrom = dateFrom || new Date('2026-01-01T00:00:00');
    const utilTo   = dateTo   || new Date();
    const utilRows = await loadUtilisationForFilter(utilFrom, utilTo, branchesForUtil);
    const utilAgg  = aggregateUtilisation(utilRows, buildStaffDeptMap());
    s.hairUtilHours      = utilAgg.hairHours;
    s.hairUtilAvailHours = utilAgg.hairAvail;
    s.hairUtilPct        = utilAgg.hairAvail   ? (utilAgg.hairHours   / utilAgg.hairAvail   * 100) : null;
    s.beautyUtilHours      = utilAgg.beautyHours;
    s.beautyUtilAvailHours = utilAgg.beautyAvail;
    s.beautyUtilPct        = utilAgg.beautyAvail ? (utilAgg.beautyHours / utilAgg.beautyAvail * 100) : null;
    const combinedHours = utilAgg.hairHours + utilAgg.beautyHours;
    const combinedAvail = utilAgg.hairAvail + utilAgg.beautyAvail;
    s.utilHours = combinedHours;
    s.utilAvailHours = combinedAvail;
    s.utilPct = combinedAvail ? (combinedHours / combinedAvail * 100) : null;
    if (utilAgg.unmatched.size) console.warn('Utilisation: staff name(s) not found in any ledger hair/beauty roster —', [...utilAgg.unmatched]);
  } catch(e) { /* utilisation is a nice-to-have — don't break the page */ }

  // Compute previous-period summary for trend arrows
  let prevS = null;
  try {
    const branchRows = allData.filter(dd =>

      (sel.branch.includes('all') || sel.branch.includes(dd.branch))
    );
    const byUpload = {};
    branchRows.forEach(dd => {
      const key = new Date(dd.uploaded_at).toISOString().slice(0, 10);
      if (!byUpload[key]) byUpload[key] = [];
      byUpload[key].push(dd);
    });
    const uploadKeys = Object.keys(byUpload).sort();
    if (uploadKeys.length >= 2) {
      const prevRows = byUpload[uploadKeys[uploadKeys.length - 2]];
      const prevD    = aggData(prevRows.map(r => r.data));
      if (prevD) prevS = prevD.summary;
    }
  } catch(e) { prevS = null; }

  // Compute how far back the previous period is so trend arrows say "vs prev wk" etc.
  let prevPeriodLabel = 'prev period';
  try {
    const _branchRows2 = allData.filter(dd =>

      (sel.branch.includes('all') || sel.branch.includes(dd.branch))
    );
    const _byUpload2 = {};
    _branchRows2.forEach(dd => {
      const k = new Date(dd.uploaded_at).toISOString().slice(0,10);
      if (!_byUpload2[k]) _byUpload2[k] = true;
    });
    const _keys2 = Object.keys(_byUpload2).sort();
    if (_keys2.length >= 2) {
      const diffDays = Math.round((new Date(_keys2[_keys2.length-1]) - new Date(_keys2[_keys2.length-2])) / 86400000);
      prevPeriodLabel = diffDays <= 8 ? 'prev wk' : diffDays <= 15 ? 'prev 2 wks' : diffDays <= 22 ? 'prev 3 wks' : diffDays <= 35 ? 'prev month' : `prev ${Math.round(diffDays/7)} wks`;
    }
  } catch(e) { /* keep default */ }

  destroyCharts();

  const dark = isDark();
  const donutBorder = dark ? '#383944' : '#fff';
  const donutColors = dark ? ['#FFD4D9','#C4B5FD','#99F6E4'] : ['#5C5557','#c0b0ad','#e8d5cc'];
  const ttStyle = { backgroundColor: dark?'#2D2E37':'#fff', titleColor:dark?'#FAF8F3':'#5C5557', bodyColor:dark?'rgba(250,248,243,.7)':'#9a8a87', borderColor:dark?'rgba(250,248,243,.1)':'#e8d5cc', borderWidth:1 };
  const gc = dark ? 'rgba(250,248,243,0.06)' : 'rgba(92,85,87,0.07)';
  const tc = dark ? 'rgba(250,248,243,0.45)' : '#9a8a87';
  const branchLabel = sel.branch.includes('all') ? 'All Branches' : sel.branch.map(b => BRANCH_INFO[b]?.name||b).join(', ');

  // Period label for section headers
  const _hasDateRangeSect = !!(dateFrom && dateTo);
  let _weekCountSect = 1;
  try {
    if (!_hasDateRangeSect) {
      const _wSet = new Set((allData||[]).filter(dd =>
  
        (sel.branch.includes('all') || sel.branch.includes(dd.branch))
      ).map(r => r.week_label));
      const _bCount = (sel.branch.includes('all') ? ACTIVE_BRANCHES : sel.branch).length || 1;
      _weekCountSect = Math.max(1, Math.round(_wSet.size / _bCount));
    } else {
      _weekCountSect = Math.max(1, Math.round((dateTo - dateFrom) / 86400000 / 7));
    }
  } catch(e) {}
  const sectionPeriodLabel = _weekCountSect === 1 ? '1 wk' : _weekCountSect === 4 ? '~4 wks' : `${_weekCountSect} wks`;

  // Revenue Run tab pre-computed values
  const rvHairSvc    = s.netTake - (s.beautySales||0) - (s.hairRetail||0);
  const rvHairTxPct  = rvHairSvc ? ((s.treatmentSales||0) / rvHairSvc * 100) : 0;
  const rvHairRetPct = rvHairSvc ? ((s.hairRetail||0) / rvHairSvc * 100) : 0;
  const rvBSvc       = s.beautySales||0;
  // Beauty: no per-dept treatment or retail split in uploaded data — rendered as static "—"
  // H+B tab: denominator is total service revenue (net take minus retail)
  const rvHBSvc      = s.netTake - (s.hairRetail||0);
  const rvHBTxPct    = rvHBSvc ? ((s.treatmentSales||0) / rvHBSvc * 100) : 0;
  const rvHBRetPct   = rvHBSvc ? ((s.hairRetail||0) / rvHBSvc * 100) : 0;

  /* ══ THE PULSE DOCUMENT ═══════════════════════════════════════════
     Everything from here down writes the Organisation Pulse the way the approved
     v3 draft lays it out (`add ons/organisation-pulse-v3-sample.html`), on live
     figures instead of the draft's one fixed pull. The draft's own comments have
     been kept wherever they explain a decision — each of them was a bug first.
     Kate, 2026-08-14. */

  const aed0 = n => 'AED ' + Math.round(n || 0).toLocaleString('en-GB');
  const num0 = n => Math.round(n || 0).toLocaleString('en-GB');
  const pct2 = n => (+(n || 0)).toFixed(2) + '%';
  const shareOf = (a, b) => b ? Math.round((a || 0) / b * 100) : 0;
  // Targets are round numbers. Printing the actual at two decimals is the point —
  // 1.62% and 1.94% are different facts — but "a 20.00% target" is just noise.
  const tidyTarget = txt => String(txt).replace(/\.00(?=%|$)/, '');
  // sc() has a fourth band, 'critical', that only the old KPI cards ever painted.
  // Nothing in this document distinguishes it from 'bad', so fold it here rather
  // than carry a colour class that resolves to nothing.
  const band = (v, t) => { const x = sc(v, t); return x === 'critical' ? 'bad' : (x || 'bad'); };

  // Department-scoped ratios: each divided by its OWN department's take, not the
  // combined total. s.treatmentPct / s.hairRetailPct carry different meanings
  // depending on which aggregation path produced this render, so they are
  // recomputed here, where the definition is unambiguous.
  const hairNetSalonTake     = (s.hairServicesIncl || 0) + (s.hairRetailOnly || 0);
  const beautyNetTakeDept    = (s.beautyServicesTotal || 0) + (s.beautyRetailOnly || 0);
  const hairTreatmentPctDept = (s.hairServicesIncl || 0) ? ((s.treatmentSales || 0)   / s.hairServicesIncl  * 100) : 0;
  const hairRetailPctDept    = hairNetSalonTake  ? ((s.hairRetailOnly   || 0) / hairNetSalonTake  * 100) : 0;
  const beautyRetailPctDept  = beautyNetTakeDept ? ((s.beautyRetailOnly || 0) / beautyNetTakeDept * 100) : null;

  // Motor City has no beauty department, and neither did Fratelli. Their only
  // "beauty" rows in the ledger are the AA/BB/CC placeholder labels, which
  // LEDGER_NON_PERSON_NAMES already strips — so the department comes through with
  // zero clients and zero money. Printing that as "Beauty AED 0.00 against a AED
  // 200 goal" reads as a department failing badly rather than one that does not
  // exist, so every beauty figure is suppressed instead. Derived from the data,
  // not from a list of branch codes: the day Motor City opens a beauty room the
  // page follows it without an edit. Kate, 2026-08-14.
  const hasBeauty = (s.beautyTotalClients || 0) > 0;
  const noBeautyNote = 'no beauty team in this selection';

  // byBranch feeds the standing column chart AND the branch read in the
  // standfirst, so it is computed once, before anything renders.
  let byBranch = {};
  try { byBranch = aggByBranch(); } catch(e) { /* the column chart tolerates an empty object */ }

  // ── BENCHMARKS ───────────────────────────────────────────────────
  // The draft scored eight rows; this scores seven. Total Clients is deliberately
  // NOT one of them: getClientTarget() is stated PER WEEK, so multiplying it out
  // across an arbitrary filter window produces an attainment figure that says
  // more about the length of the window than about the salon. It keeps its place
  // in the headline three, with its target printed as a note rather than raced
  // against a bar. Kate, 2026-08-14.
  const NCR_TARGET = 20;   // the same figure the old NCR card scored against
  const benchRows = [
    { name:'NCR %',           sub:`target ${NCR_TARGET}%`,
      hair:s.hairNcrPct, beauty:s.beautyNcrPct, combined:s.combinedNcrPct, target:NCR_TARGET, fmt:pct2 },
    { name:'Rebooking %',     sub:`target ${TARGETS.rebookPct}%`,
      hair:s.hairRebookPct, beauty:s.beautyRebookPct, combined:s.rebookPct, target:TARGETS.rebookPct, fmt:pct2 },
    { name:'Retail %',        sub:`target ≥ ${TARGETS.retailPct}%`,
      hair:hairRetailPctDept, beauty:beautyRetailPctDept, combined:rvHBRetPct, target:TARGETS.retailPct, fmt:pct2 },
    { name:'Treatment %',     sub:`target ≥ ${TARGETS.treatmentPct}%`,
      hair:hairTreatmentPctDept, beauty:null, combined:rvHBTxPct, target:TARGETS.treatmentPct, fmt:pct2,
      beautyNote:'not tracked' },
    { name:'Beauty Avg Bill', sub:`target AED ${TARGETS.beautyAvgBill}`,
      hair:null, beauty:s.beautyAvgBill, combined:s.beautyAvgBill, target:TARGETS.beautyAvgBill, fmt:aed0,
      hairNote:'counted under Hair Avg Bill' },
    { name:'Utilisation %',   sub:`hair ≥ ${TARGETS.hairUtilPct} · beauty ≥ ${TARGETS.beautyUtilPct}`,
      hair:s.hairUtilPct, beauty:s.beautyUtilPct, combined:s.utilPct,
      target:TARGETS.hairUtilPct, beautyTarget:TARGETS.beautyUtilPct, fmt:pct2 },
    { name:'Hair Avg Bill',   sub:`target AED ${TARGETS.hairAvgBill}`,
      hair:s.hairAvgBill, beauty:null, combined:s.hairAvgBill, target:TARGETS.hairAvgBill, fmt:aed0,
      beautyNote:'counted under Beauty Avg Bill' },
  ]
  // No data, no card. Utilisation is null whenever the period has no matching
  // roster hours, and a null scored against 80% would print as a catastrophic
  // miss rather than as the absence it actually is. The same rule takes Beauty Avg
  // Bill off the list entirely at a branch with no beauty team.
  .map(r => hasBeauty ? r : ({
    ...r, beauty: null, beautyTarget: undefined,
    // Hair Avg Bill's note points at a Beauty Avg Bill row that is not on the
    // page in this case, so it is replaced rather than left dangling.
    beautyNote: r.name === 'Treatment %' ? r.beautyNote : noBeautyNote,
    combined: r.name === 'Beauty Avg Bill' ? null : r.combined,
  }))
  .filter(r => Number.isFinite(r.combined))
  .map(r => ({ ...r, att: r.target ? r.combined / r.target : 0 }));

  const hitRows = benchRows.filter(r => r.att >= 1).sort((a, b) => b.att - a.att);
  const lowRows = benchRows.filter(r => r.att <  1).sort((a, b) => a.att - b.att);
  const worst   = lowRows[0] || null;

  const attRow = (r, rank) => {
    const vals = [r.hair, r.beauty, r.combined, r.target, r.beautyTarget].filter(Number.isFinite);
    const max  = (Math.max(...vals) * 1.15) || 1;
    const st   = band(r.combined, r.target);
    const line = (lbl, val, color, tgt, tickLbl) => !Number.isFinite(val) ? '' : `
      <div class="bar-line">
        <span class="bar-lbl">${lbl}</span>
        <span class="bar-track">
          <span class="bar-fill" style="width:${Math.min(100, Math.max(1.5, val / max * 100)).toFixed(1)}%;background:${color}"></span>
          ${Number.isFinite(tgt) ? `<span class="bar-tick" style="left:${Math.min(98, tgt / max * 100).toFixed(1)}%"><b>${tickLbl}</b></span>` : ''}
        </span>
        <span class="bar-val tabular">${r.fmt(val)}</span>
      </div>`;
    const note = txt => `<div class="bar-line"><span class="bar-lbl"></span><span class="bar-note">${txt}</span></div>`;
    const both = Number.isFinite(r.beautyTarget);
    return `
      <div class="att-row">
        <div class="att-top">
          <div class="att-id">
            <span class="att-rank ${st === 'good' ? 'st-good' : ''}">${rank}</span>
            <span class="att-name">${r.name}<small>${r.sub}</small></span>
          </div>
          <div class="att-side">
            <div class="att-big tabular ${st}">${r.fmt(r.combined)}</div>
            <div class="att-chip chip-${st}">${Math.round(r.att * 100)}% of target</div>
          </div>
        </div>
        <div class="att-bars">
          ${Number.isFinite(r.hair)   ? line('Hair',   r.hair,   'var(--hair)',   r.target, both ? 'H' : 'Target')
                                      : note('Hair · '   + (r.hairNote   || 'no data for this period'))}
          ${Number.isFinite(r.beauty) ? line('Beauty', r.beauty, 'var(--beauty)', both ? r.beautyTarget : r.target, both ? 'B' : 'Target')
                                      : note('Beauty · ' + (r.beautyNote || 'no data for this period'))}
        </div>
      </div>`;
  };

  // ── HERO: the cover ──────────────────────────────────────────────
  const phr = heroPeriodPhrasing();
  const rangeLabel = (dateFrom && dateTo) ? `${shortD(dateFrom)} – ${shortD(dateTo)}` : 'this period';

  const headlineEl   = document.getElementById('pulseHeadline');
  const deckEl       = document.getElementById('pulseDeck');
  const standfirstEl = document.getElementById('pulseStandfirst');

  if (headlineEl) {
    // The draft's headline is a count plus the one name that matters. Both are
    // read off the same scored rows the Below-target list is built from, so the
    // sentence can never disagree with the card underneath it.
    headlineEl.innerHTML = benchRows.length
      ? (worst
          ? `${hitRows.length} of ${benchRows.length} targets hit. <em>${escapeHtml(worst.name.replace(/\s*%$/, ''))}</em> is the one that matters.`
          : `All ${benchRows.length} targets hit. <em>Hold it</em> — that is the whole job now.`)
      : 'No scored targets for this selection.';
  }
  if (deckEl) deckEl.textContent = `Here's how ${phr.phrase} ${phr.verb} ${phr.scope}.`;

  if (standfirstEl) {
    const hairShare   = shareOf(hairNetSalonTake, s.netTake);
    const beautyShare = shareOf(beautyNetTakeDept, s.netTake);
    const beautyClientShare = shareOf(s.beautyTotalClients, s.totalClients);
    const parts = [];
    // "the group" is only true at All Branches; with one branch picked it reads as
    // a claim about the whole company off one branch's numbers.
    const whole = sel.branch.includes('all') ? 'the group' : branchLabel;
    parts.push(!hasBeauty
      // "Hair is carrying X: AED 297,130 of the AED 297,130, 100%" is the same
      // number twice and a share of itself. Nothing is being carried — it is the
      // only department there is.
      ? `${branchLabel} is hair only: ${aed0(s.netTake)} across ${num0(s.totalClients)} clients.`
      : hairShare >= 60
        ? `Hair is carrying ${whole}: ${aed0(hairNetSalonTake)} of the ${aed0(s.netTake)}, ${hairShare}% of everything that came in.`
        : `Hair brought in ${aed0(hairNetSalonTake)} of the ${aed0(s.netTake)}, ${hairShare}% of the take.`);
    if (s.beautyTotalClients) {
      parts.push(`Beauty is ${beautyClientShare}% of the clients and ${beautyShare}% of the money.`);
    }
    if (worst) {
      parts.push(`${worst.name.replace(/\s*%$/, '')} at ${worst.fmt(worst.combined)} against a ${tidyTarget(worst.fmt(worst.target))} target is the number that isn't in the same conversation as the rest.`);
    }
    standfirstEl.textContent = parts.join(' ');
  }

  // ── THE RECEIPT ──────────────────────────────────────────────────
  // Itemises the targets the headline counts. Only the ones that HIT are listed:
  // the ones below already appear in full, with their bars and their targets, in
  // the Below target card, so printing them twice made the receipt 500px tall and
  // left a dead 150px beside it in the hero. The summary row carries the worst of
  // them and links to the full list.
  const receiptEl = document.getElementById('heroReceipt');
  if (receiptEl) {
    const rTRow = r =>
      `<div class="r-t ${r.att >= 1 ? 'hit' : 'low'}"><span class="n">${r.name}</span>` +
      `<span class="v tabular">${Math.round(r.att * 100)}%</span></div>`;
    const targetsBlock = benchRows.length ? `
      <div class="r-rule"></div>
      <div class="r-sec"><span>Targets</span><span>${hitRows.length} of ${benchRows.length} hit</span></div>
      ${hitRows.length ? hitRows.map(rTRow).join('') : '<div class="r-t low"><span class="n">None hit yet</span><span class="v">—</span></div>'}
      ${lowRows.length ? `
        <div class="r-gap"></div>
        <a class="r-more" href="#s-below" onclick="reveal()">
          <span>${lowRows.length} below target</span>
          <span>worst ${escapeHtml(lowRows[0].name.replace(/\s*%$/, ''))} ${Math.round(lowRows[0].att * 100)}% ↓</span>
        </a>` : ''}` : '';

    receiptEl.innerHTML = `
      <div class="mark"><img src="assets/6.png" alt="Tara Rose Ladies Salon"></div>
      <div class="r-sub">${escapeHtml(branchLabel)} · ${rangeLabel}</div>
      <div class="r-rule"></div>
      ${hasBeauty ? `
      <div class="r-row"><span class="r-label">Hair net take</span><span class="r-val tabular">${num0(hairNetSalonTake)}</span></div>
      <div class="r-row"><span class="r-label">Beauty net take</span><span class="r-val tabular">${num0(beautyNetTakeDept)}</span></div>
      <div class="r-rule"></div>` : ''}
      <div class="r-row"><span class="r-label">Net take</span><span class="r-val tabular">${num0(s.netTake)}</span></div>
      <div class="r-row"><span class="r-label">Clients</span><span class="r-val tabular">${num0(s.totalClients)}</span></div>
      <div class="r-row"><span class="r-label">Avg bill</span><span class="r-val tabular">${num0(s.avgBill)}</span></div>
      ${targetsBlock}
      <div class="r-rule"></div>
      <div class="r-foot">All money in AED · takings before staff cost</div>`;
  }

  // ── HEADLINE THREE ───────────────────────────────────────────────
  // Net take and Clients have no single target in this app — getWeeklyTarget()
  // and getClientTarget() are both stated per week and per branch — so they are
  // scored against the previous period instead of against a number that would
  // have to be invented. Avg bill has a real target on both sides, so it gets
  // the blended one and is scored properly.
  const noCompare = { status:'warn', txt:'No comparable previous period', verdict:'No comparison' };
  const trendOf = (curr, prev) => {
    if (prev == null || !prev || !curr) return noCompare;
    const d = (curr - prev) / prev * 100;
    // prevS is built from the retired weekly_data table by taking the second-newest
    // upload snapshot, which is not the same window as the filter and is often a
    // fraction of it — that is where "up 1319% on prev month" came from. A swing
    // that large is a mismatch, not a result, so it is reported as one rather than
    // printed on the biggest number on the page. Kate, 2026-08-14.
    if (!Number.isFinite(d) || Math.abs(d) > 100) return noCompare;
    if (d >=  2) return { status:'good', txt:`Up ${d.toFixed(1)}% on ${prevPeriodLabel}`, verdict:'Growing' };
    if (d <= -2) return { status:'bad',  txt:`Down ${Math.abs(d).toFixed(1)}% on ${prevPeriodLabel}`, verdict:'Falling' };
    return { status:'warn', txt:`Level with ${prevPeriodLabel}`, verdict:'Holding' };
  };
  const blendedAvgTarget = s.totalClients
    ? ((TARGETS.hairAvgBill * (s.hairTotalClients || 0)) + (TARGETS.beautyAvgBill * (s.beautyTotalClients || 0))) / s.totalClients
    : TARGETS.hairAvgBill;
  const avgBillStatus = band(s.avgBill, blendedAvgTarget);
  const hairAvgOk   = (s.hairAvgBill || 0) >= TARGETS.hairAvgBill;
  const beautyAvgOk = s.beautyAvgBill != null && s.beautyAvgBill >= TARGETS.beautyAvgBill;
  const avgBillVerdict = avgBillStatus === 'good' ? 'On target'
    : (hairAvgOk && s.beautyAvgBill != null && !beautyAvgOk) ? 'Beauty is dragging it'
    : avgBillStatus === 'warn' ? 'Nearly' : 'Below target';

  const netTrend    = trendOf(s.netTake,      prevS ? prevS.netTake      : null);
  const clientTrend = trendOf(s.totalClients, prevS ? prevS.totalClients : null);

  const splitBar = sp => `
    <div class="sp">
      <span class="sp-k">${sp.k}</span>
      <span class="sp-track"><i class="sp-fill" style="width:${Math.min(100, Math.max(3, sp.of ? sp.val / sp.of * 100 : 0)).toFixed(1)}%;background:${sp.color}"></i></span>
      <span class="sp-v tabular">${sp.txt}</span>
      <span class="sp-x tabular ${sp.cls || ''}">${sp.extra}</span>
    </div>`;

  // With no beauty team the splits are "Hair 100% / Beauty 0%" on every card,
  // which is three rows of nothing. The card keeps its figure and its verdict and
  // drops the split block entirely.
  const splitsOf = arr => hasBeauty ? arr : [];

  const THREE = [
    { k:'Net take', def:'Services + treatments + retail, hair and beauty, before staff cost.',
      v: aed0(s.netTake), status: netTrend.status, t: netTrend.txt, verdict: netTrend.verdict,
      splits: splitsOf([
        { k:'Hair',   val:hairNetSalonTake,  of:s.netTake, txt:aed0(hairNetSalonTake),  extra:`${shareOf(hairNetSalonTake, s.netTake)}%`,  color:'var(--hair)' },
        { k:'Beauty', val:beautyNetTakeDept, of:s.netTake, txt:aed0(beautyNetTakeDept), extra:`${shareOf(beautyNetTakeDept, s.netTake)}%`, color:'var(--beauty)' },
      ]) },
    { k:'Clients', def:'Every client who paid a bill in the period, hair and beauty.',
      v: num0(s.totalClients), status: clientTrend.status,
      t: `Target ${getClientTarget(sel.branch)}`, verdict: clientTrend.verdict,
      splits: splitsOf([
        { k:'Hair',   val:s.hairTotalClients,   of:s.totalClients, txt:`${num0(s.hairTotalClients)} clients`,   extra:`${shareOf(s.hairTotalClients, s.totalClients)}%`,   color:'var(--hair)' },
        { k:'Beauty', val:s.beautyTotalClients, of:s.totalClients, txt:`${num0(s.beautyTotalClients)} clients`, extra:`${shareOf(s.beautyTotalClients, s.totalClients)}%`, color:'var(--beauty)' },
      ]) },
    { k:'Avg bill', def:'Net take divided by clients: what one visit is worth.',
      v: aed0(s.avgBill), status: avgBillStatus,
      t: `Hair target ${TARGETS.hairAvgBill} · Beauty target ${TARGETS.beautyAvgBill}`, verdict: avgBillVerdict,
      splits: splitsOf([
        { k:'Hair', val:s.hairAvgBill, of:Math.max(s.hairAvgBill || 0, s.beautyAvgBill || 0, TARGETS.hairAvgBill),
          txt:aed0(s.hairAvgBill),
          extra:`${(s.hairAvgBill || 0) >= TARGETS.hairAvgBill ? '+' : '−'}${Math.abs(Math.round(((s.hairAvgBill || 0) / TARGETS.hairAvgBill - 1) * 100))}%`,
          cls: hairAvgOk ? 'good' : 'bad', color:'var(--hair)' },
        s.beautyAvgBill == null
          ? { k:'Beauty', val:0, of:1, txt:'—', extra:'no data', color:'var(--beauty)' }
          : { k:'Beauty', val:s.beautyAvgBill, of:Math.max(s.hairAvgBill || 0, s.beautyAvgBill || 0, TARGETS.hairAvgBill),
              txt:aed0(s.beautyAvgBill),
              extra:`${beautyAvgOk ? '+' : '−'}${Math.abs(Math.round((s.beautyAvgBill / TARGETS.beautyAvgBill - 1) * 100))}%`,
              cls: beautyAvgOk ? 'good' : 'bad', color:'var(--beauty)' },
      ]) },
  ];

  // ── THE READ: hair vs beauty, in words ───────────────────────────
  // The prose is the templated glance copy, which pulse-narrative.js overwrites
  // in place once the model's version comes back AND every figure in it checks
  // out. The headings are derived here so they can never contradict the figures
  // in the stat chips beside them.
  const glance = computeAtAGlanceExplanation(s, rvHairSvc, rvHairTxPct);
  const hairShareOfTake = shareOf(hairNetSalonTake, s.netTake);
  const hairHeading = hairShareOfTake >= 60
    ? (hairAvgOk ? 'Doing the lifting, and doing it above target.' : 'Doing the lifting, but not at the bill it should be.')
    : 'Carrying its share of the take.';
  const beautyHeading = hasBeauty
    ? `${shareOf(s.beautyTotalClients, s.totalClients)}% of the clients, ${shareOf(beautyNetTakeDept, s.netTake)}% of the money.`
    : 'No beauty team here.';
  // The templated glance copy reads every beauty figure as a miss against target,
  // so at a hair-only branch it says beauty is "lagging at 0.00%" — which is a
  // sentence about a department that does not exist. Say that instead.
  const beautyBody = hasBeauty ? glance.beauty
    : `${escapeHtml(branchLabel)} runs hair only, so there are no beauty figures to read. Pick a branch with a beauty room, or All Branches, to see them.`;
  const statChip = (v, label) => `<span class="stat"><b>${v}</b> ${label}</span>`;

  // ── WINS ─────────────────────────────────────────────────────────
  const winnersFor = (staff, revKey) => {
    const pool = (staff || []).filter(st => st.name && st.name !== 'ASSISTANTS' && (st.total || 0) > 0);
    if (!pool.length) return [];
    // A one-visit stylist can post a huge average bill and take the card off a
    // single client, so avg bill has a floor. If nobody clears it the whole pool
    // is used rather than dropping the card, and the visit count prints either
    // way, which is what makes the thin ones obvious.
    const best = (key, minVisits) => {
      const eligible = minVisits ? pool.filter(p => (p.total || 0) >= minVisits) : [];
      return (eligible.length ? eligible : pool).reduce((a, b) => ((b[key] || 0) > (a[key] || 0) ? b : a));
    };
    const tBill = best(revKey), tAvg = best('avgBill', 10), tReq = best('req'), tNew = best('newC');
    return [
      { k:'Top biller',       p:tBill, n:tBill[revKey] || 0,  v:`<b>${aed0(tBill[revKey] || 0)}</b> · ${num0(tBill.total)} visits` },
      { k:'Highest avg bill', p:tAvg,  n:tAvg.avgBill  || 0,  v:`<b>${aed0(tAvg.avgBill || 0)}</b> avg · ${num0(tAvg.total)} visits` },
      { k:'Most requested',   p:tReq,  n:tReq.req      || 0,  v:`<b>${num0(tReq.req || 0)} requests</b> of ${num0(tReq.total)} visits` },
      { k:'Most new clients', p:tNew,  n:tNew.newC     || 0,  v:`<b>${num0(tNew.newC || 0)} new</b> of ${num0(tNew.total)} visits` },
    ].filter(w => w.n > 0);   // no data, no card
  };

  const winCard = w => {
    const prof = (typeof staffProfile === 'function') ? staffProfile(w.p.name) : null;
    const nm = escapeHtml(w.p.name);
    // The soft-square block with the head breaking out over its top edge is baked
    // into the PNG, so no border-radius, background or border here — any of the
    // three clips the overhang and the card falls back to a plain circle.
    const av = (prof && prof.photo)
      ? `<img class="av" src="assets/staff/${encodeURIComponent(prof.photo)}" alt="" loading="lazy" onerror="this.style.display='none'">`
      : `<div class="av-ph" title="Portrait to come"><b>${escapeHtml(initials(w.p.name))}</b></div>`;
    const name = (prof && prof.ig)
      ? `<a href="https://instagram.com/${encodeURIComponent(prof.ig)}" target="_blank" rel="noopener noreferrer" title="@${escapeHtml(prof.ig)} on Instagram">${nm}</a>`
      : nm;
    // The branch comes from the profile or not at all. Falling back to the current
    // filter label printed "All Branches" under every beauty therapist, which reads
    // as a claim that they work at all four. No profile, no tag.
    const tag = (prof && prof.branch)
      ? (BRANCH_INFO[prof.branch] ? BRANCH_INFO[prof.branch].name : prof.branch) : null;
    return `
      <div class="win">
        ${av}
        <div style="min-width:0">
          <div class="win-k">${w.k}</div>
          <div class="win-name">${name}</div>
          <div class="win-v tabular">${w.v}</div>
          ${tag ? `<span class="tagb">${escapeHtml(tag)}</span>` : ''}
        </div>
      </div>`;
  };
  const winsHair   = winnersFor(d.hairStaff,   'hairSalesNet').map(winCard).join('');
  const winsBeauty = winnersFor(d.beautyStaff, 'beautySales').map(winCard).join('');

  // ── CLIENT FUNNEL ────────────────────────────────────────────────
  // These are independent booking-type breakdowns, not strict sequential stages,
  // so each side is scaled against its OWN total: hair turns over roughly ten
  // times beauty's volume and a shared scale would flatten beauty to a hairline.
  const fnHair = s.hairTotalClients || 0, fnBeauty = s.beautyTotalClients || 0;
  const FUNNEL = [
    { k:'Total',    hair:fnHair,                                   beauty:fnBeauty },
    { k:'Salon',    hair:(s.hairBreakdown && s.hairBreakdown.salon) || 0,     beauty:(s.beautyBreakdown && s.beautyBreakdown.salon) || 0 },
    { k:'Request',  hair:(s.hairBreakdown && s.hairBreakdown.req) || 0,       beauty:(s.beautyBreakdown && s.beautyBreakdown.req) || 0 },
    { k:'Rebooked', hair:s.hairRebookedCount || 0,                 beauty:(s.beautyBreakdown && s.beautyBreakdown.rebooked) || 0 },
    { k:'New',      hair:s.hairNewClients || 0,                    beauty:s.beautyNewClients || 0 },
    { k:'NCR',      hair:s.hairNCR || 0,                           beauty:s.beautyNCR || 0 },
  ];
  const funnelHtml = FUNNEL.map(r => `
    <div class="fn-row">
      <div class="fn-side l">
        <span class="fn-n tabular">${num0(r.hair)}</span>
        <span class="fn-bar" style="width:${fnHair ? Math.max(1.5, r.hair / fnHair * 100).toFixed(1) : 0}%;background:var(--hair);opacity:${r.k === 'Total' ? .45 : 1}"></span>
      </div>
      <div class="fn-c">${r.k}</div>
      <div class="fn-side r">
        <span class="fn-bar" style="width:${fnBeauty ? Math.max(1.5, r.beauty / fnBeauty * 100).toFixed(1) : 0}%;background:var(--beauty);opacity:${r.k === 'Total' ? .45 : 1}"></span>
        <span class="fn-n tabular">${num0(r.beauty)}</span>
      </div>
    </div>`).join('');

  // ── BRANCH PERFORMANCE, standing columns ─────────────────────────
  // Replaces the Chart.js bar chart that used to live here: the same four
  // figures, drawn in the page's own type, with no canvas to destroy and rebuild
  // on every theme flip. The chosen branch keeps its colour and the rest step
  // back, so the branch chips genuinely drive this card.
  const brCols = ACTIVE_BRANCHES.map(code => {
    const bs = byBranch[code] && byBranch[code].summary;
    if (!bs || !(bs.netTake > 0)) return null;
    return { code, name: BRANCH_INFO[code].name, rev: bs.netTake, visits: bs.totalClients || 0,
             color: dark ? BRANCH_INFO[code].color : BRANCH_INFO[code].colorLight };
  }).filter(Boolean).sort((a, b) => b.rev - a.rev);
  const brTotal = brCols.reduce((a, b) => a + b.rev, 0);
  const brAvg   = brCols.length ? brTotal / brCols.length : 0;
  const brMax   = brCols.length ? Math.max(...brCols.map(b => b.rev)) * 1.16 : 1;
  const brDim   = b => !sel.branch.includes('all') && !sel.branch.includes(b.code);
  const colsPlot = brCols.length ? `
    <div class="avgline" style="bottom:${(brAvg / brMax * 100).toFixed(1)}%"><b>Group avg ${aed0(brAvg)}</b></div>
    ${brCols.map(b => `
      <div class="col${brDim(b) ? ' dim' : ''}">
        <span class="cv tabular">${num0(b.rev / 1000)}k</span>
        <span class="cbar" style="height:${(b.rev / brMax * 100).toFixed(1)}%;background:${b.color}"></span>
      </div>`).join('')}` : '';
  const colsX = brCols.map(b => `
    <div class="${brDim(b) ? 'dim' : ''}">
      <div class="cx-k">${escapeHtml(b.code)}</div>
      <div class="cx-s">${num0(b.visits)} visits<br>${b.visits ? aed0(b.rev / b.visits) : '—'} avg</div>
    </div>`).join('');
  // This card deliberately keeps ALL four branches even when one is picked — the
  // point of it is where that branch sits against the others. So the footnote is
  // chosen by the SELECTION, not by how many columns are drawn: pick one branch
  // and it reads that branch against the group, instead of repeating the group
  // read you were already looking at.
  const onlyPicked = (!sel.branch.includes('all') && sel.branch.length === 1)
    ? brCols.find(b => b.code === sel.branch[0]) : null;
  const branchFoot = !brCols.length
    ? 'No per-branch figures for this selection.'
    : onlyPicked
      ? `${onlyPicked.name}: ${aed0(onlyPicked.rev)} across ${num0(onlyPicked.visits)} visits, ${onlyPicked.visits ? aed0(onlyPicked.rev / onlyPicked.visits) : '—'} a visit. That is ${shareOf(onlyPicked.rev, brTotal)}% of the ${brCols.length}-branch total and ${onlyPicked.rev >= brAvg ? 'above' : 'below'} the group average of ${aed0(brAvg)}.`
      : `Total ${aed0(brTotal)} across ${brCols.length} branches. ${brCols[0].name} is the biggest at ${shareOf(brCols[0].rev, brTotal)}% of it; ${brCols.filter(b => b.rev < brAvg).length} sit below the group average of ${aed0(brAvg)}.`;

  // ── DO THIS ──────────────────────────────────────────────────────
  // The single worst-attaining benchmark, named, with the deadline set to the
  // next Monday. One action, one owner, one deadline — no buffet.
  const nextMonday = (() => {
    const dte = new Date(); dte.setHours(0, 0, 0, 0);
    dte.setDate(dte.getDate() + ((8 - dte.getDay()) % 7 || 7));
    return `${MON_LONG[dte.getMonth()].slice(0, 3)} ${dte.getDate()}`;
  })();
  const actionHtml = worst ? `
    <div class="action">
      <div class="tag">✦ Fix first</div>
      <h2>${escapeHtml(worst.name.replace(/\s*%$/, ''))} at ${worst.fmt(worst.combined)}. ${lowRows.length > 1 ? 'Every other gap is small next to this one.' : 'It is the only gap left.'}</h2>
      <p class="why">${Math.round(worst.att * 100)}% of a ${tidyTarget(worst.fmt(worst.target))} target${Number.isFinite(worst.hair) && Number.isFinite(worst.beauty) ? ` — hair ${worst.fmt(worst.hair)}, beauty ${worst.fmt(worst.beauty)}` : ''}.</p>
      <div class="meta">
        <div>Action<b>Audit how ${escapeHtml(worst.name.replace(/\s*%$/, ''))} is captured and coached at reception</b></div>
        <div>Owner<b>Kate</b></div>
        <div>Deadline<b>Monday ${nextMonday}</b></div>
      </div>
    </div>` : `
    <div class="action">
      <div class="tag">✦ Hold the line</div>
      <h2>Every scored target is being hit. The job is keeping it there.</h2>
      <div class="meta">
        <div>Action<b>Write down what changed, before it is forgotten</b></div>
        <div>Owner<b>Kate</b></div>
        <div>Deadline<b>Monday ${nextMonday}</b></div>
      </div>
    </div>`;

  main.innerHTML = `
<!-- ══ HEADLINE THREE ══ -->
<div class="eyebrow" id="s-three"><span class="bar"></span>The headline three</div>
<div class="three">
  ${THREE.map(m => `
    <div class="metric st-${m.status}">
      <div class="m-k">${m.k}</div>
      <div class="m-def">${m.def}</div>
      <div class="m-v tabular ${m.status === 'good' ? 'good' : m.status === 'warn' ? 'warn' : 'bad'}">${m.v}</div>
      <div class="m-t">${m.t}</div>
      ${m.splits.length ? `<div class="m-split">${m.splits.map(splitBar).join('')}</div>` : ''}
      <span class="verdict st-${m.status}">${m.verdict}</span>
    </div>`).join('')}
</div>

<!-- ══ THE READ ══ -->
<div class="eyebrow" id="s-read"><span class="bar"></span>What's going on · Hair vs Beauty</div>
<div class="read">
  <div class="read-col">
    <div class="read-k">Hair</div>
    <div class="read-h">${hairHeading}</div>
    <div class="read-p">${glance.hair}</div>
    <div class="read-stats">
      ${statChip(hairShareOfTake + '%', 'of net take')}
      ${statChip(num0(s.hairTotalClients), 'clients')}
      ${statChip(aed0(s.hairAvgBill), 'avg bill')}
      ${statChip(shareOf((s.hairBreakdown && s.hairBreakdown.req) || 0, s.hairTotalClients) + '%', 'requested')}
    </div>
  </div>
  <div class="read-col b">
    <div class="read-k">Beauty</div>
    <div class="read-h">${beautyHeading}</div>
    <div class="read-p">${beautyBody}</div>
    ${hasBeauty ? `
    <div class="read-stats">
      ${statChip(shareOf(beautyNetTakeDept, s.netTake) + '%', 'of net take')}
      ${statChip(num0(s.beautyTotalClients), 'clients')}
      ${statChip(s.beautyAvgBill != null ? aed0(s.beautyAvgBill) : '—', 'avg bill')}
      ${statChip(shareOf((s.beautyBreakdown && s.beautyBreakdown.req) || 0, s.beautyTotalClients) + '%', 'requested')}
    </div>` : ''}
  </div>
</div>

<!-- ══ WINS ══ -->
<div class="eyebrow" id="s-wins"><span class="dot" style="background:var(--hair)"></span>Wins · Hair · ${rangeLabel}</div>
<div class="wins">${winsHair || '<div class="foot">No staff-level hair figures for this date range.</div>'}</div>

${hasBeauty ? `
<div class="eyebrow eyebrow-sm"><span class="dot" style="background:var(--beauty)"></span>Wins · Beauty · ${rangeLabel}</div>
<div class="wins">${winsBeauty || '<div class="foot">No staff-level beauty figures for this date range.</div>'}</div>
<p class="foot" style="margin-top:10px">Beauty portraits aren't shot yet, so initials stand in until they are. Same card, same slot: drop the file into <code>assets/staff/</code> and add the name to <code>staff-profiles.js</code>, and it appears.</p>` : ''}

<!-- ══ PERFORMANCE OVERVIEW ══ -->
<div class="eyebrow" id="s-perf"><span class="dot" style="background:var(--accent-lavender)"></span>${escapeHtml(branchLabel)} · Performance Overview</div>
<div class="perf2">
  <div class="card${hasBeauty ? '' : ' hair-only'}">
    <div class="card-title">Client Funnel${hasBeauty ? ' · Hair vs Beauty' : ' · Hair'}</div>
    <div class="card-sub">${hasBeauty ? 'Every client type, mirrored down the middle' : 'Every client type. This branch runs hair only, so there is nothing to mirror.'}</div>
    <div class="fn-head"><span class="l">Hair</span><span class="c">Type</span><span class="r">Beauty</span></div>
    ${funnelHtml}
    <div class="foot">Bars scaled against ${hasBeauty ? `each side's own total: ${num0(fnHair)} hair, ${num0(fnBeauty)} beauty` : `the ${num0(fnHair)} hair total`}. Request means the client asked for that stylist by name.</div>
  </div>
  <div class="card">
    <div class="card-title">Branch Performance</div>
    <div class="card-sub">Net revenue by branch · dashed line = group average</div>
    <div class="cols-plot">${colsPlot}</div>
    <div class="cols-x">${colsX}</div>
    <div class="foot">${branchFoot}</div>
  </div>
</div>

<!-- ══ TARGET BARS ══ -->
<div class="eyebrow" id="s-below"><span class="bar bad"></span>Below target · worst first</div>
<div class="card">
  <div class="card-title">Benchmarks</div>
  <div class="card-sub">Bar = actual · vertical tick = target · <span style="color:var(--hair)">■</span> hair · <span style="color:var(--beauty)">■</span> beauty</div>
  <div id="attBelow">${lowRows.length ? lowRows.map((r, i) => attRow(r, i + 1)).join('') : '<div class="foot">Nothing below target this period.</div>'}</div>
</div>

<div class="eyebrow" id="s-working"><span class="bar good"></span>Working</div>
<div class="card">
  <div class="card-title">On target</div>
  <div class="card-sub">Listed, deliberately without commentary. If it is working it does not need explaining.</div>
  <div id="attGood">${hitRows.length ? hitRows.map(r => attRow(r, '✓')).join('') : '<div class="foot">Nothing is at target yet this period.</div>'}</div>
</div>

<!-- ══ ONE ACTION ══ -->
<div class="eyebrow" id="s-action"><span class="bar"></span>Do this</div>
${actionHtml}

<!-- ══ WHERE THE FIGURES LIVE NOW ══
     Kate, 2026-08-14: the detail stack moved to its own page. This read ends on
     the one action, which is the point of it; the ~120 tiles that used to sit
     under here are Branch Performance, restructured into the ledger's grouping
     so they carry a target and a variance instead of a bare number. -->
<div class="eyebrow" id="s-detail"><span class="bar"></span>The detail</div>
<div class="card">
  <div class="card-title">Every figure behind this read</div>
  <div class="card-sub">Revenue, clients and benchmarks, each against its ledger target — plus the full staff tables.</div>
  <a class="r-more" href="#" onclick="showView('branchperf', document.querySelector('[onclick*=&quot;branchperf&quot;]'));return false">Open Branch Performance <span aria-hidden="true">→</span></a>
</div>

<div class="fine">
  <p><b>What net take means</b>. Everything the salon billed in the period: hair and beauty services, treatments and courses, plus retail, added together, before staff cost. Hair net take and beauty net take are each that department's own services plus its own retail, so the two add up to the total.</p>
  <p><b>Sources</b>. Client counts, the department split and the treatment figure come from the branch ledger (<code>branch_staff_daily</code>); revenue comes from Phorest (<code>phorest_staff_daily</code>), matched to the ledger's staff and day. Figures tagged <span style="font-size:8px;font-weight:700;letter-spacing:.06em;color:var(--muted);border:1px solid var(--border);border-radius:8px;padding:1px 5px;vertical-align:middle">LEDGER</span> on Branch Performance are hand-tallied and have no Phorest equivalent. Utilisation is matched separately and drops out entirely when the period has no roster hours to match, rather than scoring as zero.</p>
  <p><b>What is scored and what is not</b>. Seven benchmarks carry a single unambiguous target and are raced against it, worst first. Total Clients is not one of them: its target is stated per week and per branch, so multiplying it across whatever window the filter happens to hold would measure the window, not the salon. It sits in the headline three with its target printed as a note. Net take and Clients are read against the previous period for the same reason.</p>
  <p><b>Layout rules</b>. One token set, 10px radius, 8pt spacing spine, Playfair for figures and Inter for labels. Colour carries status only; the accent quartet carries identity. Three headline cards, never twenty-one. Anything below target sorts by the size of its gap. No data, no card.</p>
</div>
  `;

  // Nothing on this page collapses any more — the five support sections that did
  // are Branch Performance's now, and it opens them itself. restoreSections() is
  // deliberately still called: the shared sectionState is what keeps a section
  // you collapsed over there collapsed when you come back to it.
  restoreSections();

  // The funnel and the branch columns are drawn in the template above, in the
  // page's own type, so there is no canvas left on this view to build or destroy.
  // The document just changed height under a fixed masthead and a sticky index
  // rail, so both have to be told: sizeTopbar() re-reserves the space the bar
  // occupies, spy() re-reads the sections it now has to track.
  if (typeof sizeTopbar === 'function') sizeTopbar();
  if (typeof spy === 'function') spy();
}


// ── TEAM PERFORMANCE ─────────────────────────────
// Lives in team-performance.js now — podium, floor, compare tray. It is a page of
// its own with its own state, the same way Branch Performance and the Ledgers
// moved out into branch-ledger.js. renderTeam() is still the entry point, so
// every caller in this file and showView() are unchanged.

let allDailyData = [];

async function loadDailyRange(from, to) {
  const pad = n => String(n).padStart(2, '0');
  const fromStr = `${from.getFullYear()}-${pad(from.getMonth()+1)}-${pad(from.getDate())}`;
  const toStr   = `${to.getFullYear()}-${pad(to.getMonth()+1)}-${pad(to.getDate())}`;
  const { data, error } = await sb
    .from('daily_data')
    .select('*')
    .gte('date', fromStr)
    .lte('date', toStr)
    .order('date', { ascending: true });
  return (error || !data) ? [] : data;
}

// ── DATA LOAD + INIT ─────────────────────────────────────────

async function loadData() {
  const { data, error } = await sb.from('weekly_data').select('*').order('uploaded_at', { ascending:true });
  if (error || !data) {
    document.getElementById('mainContent').innerHTML = '<div class="empty">No data available yet.</div>';
    return;
  }
  allData = data;
  const branches = ACTIVE_BRANCHES.map(k => ({ val:k, label:BRANCH_INFO[k].name }));
  buildDrop('branch', branches);
  rebuildDependentDrops();
  // Only seed the default (Jan 1 → today) range on first load — loadData() also
  // runs every 60s via setInterval, and re-applying the default there was wiping
  // out any custom range the user had picked (Kate, 2026-08-03).
  if (!dateFrom || !dateTo) await setDefaultRange();
  renderDashboard();
  // Freshness badge — auto-detects the most recent date where EVERY branch has
  // actually synced, instead of trusting created_at of whatever row landed last.
  // A sync can touch the table today for one branch while others are still days
  // behind — that mismatch is exactly why the badge was showing "2 Aug" when the
  // real last complete data was 31 Jul (ledger) / 1 Aug (Phorest) (Kate, 2026-08-03).
  const [ledgerInfo, phorestInfo] = await Promise.all([
    getLatestCompleteDate('branch_staff_daily'),
    getLatestCompleteDate('phorest_staff_daily'),
  ]);
  renderFreshnessBadge(ledgerInfo, phorestInfo);
}

// Pulls every branch+date pair from `since` onwards, in 1000-row pages, so the
// freshness badge sees the whole window instead of PostgREST's first 1000 rows.
async function loadDatesSince(table, sinceStr) {
  const PAGE = 1000;
  const { count, error: countErr } = await sb
    .from(table)
    .select('*', { count: 'exact', head: true })
    .gte('date', sinceStr);
  if (countErr || !count) return [];
  const pages = await Promise.all(
    Array.from({ length: Math.ceil(count / PAGE) }, (_, i) =>
      sb.from(table)
        .select('branch,date')
        .gte('date', sinceStr)
        .order('id', { ascending: true })
        .range(i * PAGE, i * PAGE + PAGE - 1)
    )
  );
  return pages.flatMap(p => p.data || []);
}

// Finds the most recent date (within the last 21 days) where every branch in
// ACTIVE_BRANCHES has at least one synced row — a genuinely "complete" data day,
// not just whichever row happened to sync most recently. Falls back to the
// newest date with any data (flagged incomplete, with the missing branches
// listed) if no fully-complete day exists in the window.
// Uses ACTIVE_BRANCHES (not BRANCH_INFO) — Fratelli closed ~May 2026 and will never
// sync again, so counting it here meant `complete` could never be true and the header
// permanently showed "(partial branches)" (Kate, 2026-08-04).
async function getLatestCompleteDate(table) {
  const expectedBranches = ACTIVE_BRANCHES.length;
  const since = new Date();
  since.setDate(since.getDate() - 21);
  const sinceStr = since.toISOString().slice(0, 10);
  // PostgREST caps one response at 1000 rows, and 21 days across four branches is
  // ~3-4k in branch_staff_daily. The un-paged select therefore only ever saw the
  // OLDEST slice of the window, so the header froze on "Ledger: 24 Jul" for weeks
  // while every branch had in fact synced through to 11 Aug (Kate, 2026-08-12).
  // Page through like loadAllRows does, ordered by id so pages can't overlap or skip.
  const data = await loadDatesSince(table, sinceStr);
  if (!data.length) return { date: null, complete: false, missing: [] };
  const byDate = new Map();
  data.forEach(r => {
    if (!byDate.has(r.date)) byDate.set(r.date, new Set());
    byDate.get(r.date).add(r.branch);
  });
  const datesDesc = [...byDate.keys()].sort((a, b) => b.localeCompare(a));
  for (const d of datesDesc) {
    if (byDate.get(d).size >= expectedBranches) return { date: d, complete: true, missing: [] };
  }
  const newest = datesDesc[0];
  const missing = ACTIVE_BRANCHES.filter(b => !byDate.get(newest).has(b));
  return { date: newest, complete: false, missing };
}

// How old each feed is, on the masthead's meta rule. Only the date is stated; the
// age is derived from it, so "1 day ago" does not become a lie overnight. Two days
// or older goes amber — that is the whole point of putting it up there.
function freshnessLine(label, info) {
  if (!info || !info.date) return `<span class="stale">${label} <b>no syncs yet</b></span>`;
  const synced = new Date(info.date + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today - synced) / 86400000);
  const age = diffDays <= 0 ? 'today' : diffDays === 1 ? '1 day ago' : `${diffDays} days ago`;
  const dateStr = `${synced.getDate()} ${MON_SHORT[synced.getMonth()]}`;
  const flag = info.complete ? ''
    : ` <span title="Missing: ${escapeHtml(info.missing.map(b=>BRANCH_INFO[b]?.name||b).join(', '))}">(partial)</span>`;
  return `<span class="${diffDays >= 2 || !info.complete ? 'stale' : ''}">${label} <b>${dateStr}</b>, ${age}${flag}</span>`;
}

function renderFreshnessBadge(ledgerInfo, phorestInfo) {
  const el = document.getElementById('mastFresh');
  if (!el) return;
  el.innerHTML = freshnessLine('Ledger', ledgerInfo)
    + freshnessLine('Phorest', phorestInfo)
    + '<span>GST +04:00</span>';
  if (typeof sizeTopbar === 'function') sizeTopbar();
}

// ── STARTUP ──────────────────────────────────────────────────

// Init is triggered by doLogin() and checkSession() in index.html


// ══════════════════════════════════════════════════════════════
//  SERVICES + CLIENTS
// ══════════════════════════════════════════════════════════════

function _svcBranches() {
  return ACTIVE_BRANCHES.map(k => [k, BRANCH_INFO[k]]);
}

function _buildBranchDrop(dropId, selObj, onChangeFn) {
  const drop = document.getElementById('drop-' + dropId);
  if (!drop) return;
  const branches = _svcBranches();
  const render = () => {
    drop.innerHTML =
      `<div class="ms-opt all-opt ${selObj.branch[0]==='all'?'selected':''}" onclick="_toggleSvcBranch('${dropId}')">All Branches</div>` +
      branches.map(([k,v]) =>
        `<div class="ms-opt ${selObj.branch.includes(k)?'selected':''}" onclick="_toggleSvcBranch('${dropId}','${k}')">${v.name}</div>`
      ).join('');
  };
  drop._render = render;
  drop._selObj = selObj;
  drop._onChange = onChangeFn;
  render();
}

function _toggleSvcBranch(dropId, code) {
  const drop = document.getElementById('drop-' + dropId);
  if (!drop) return;
  const selObj = drop._selObj;
  if (!code || code === 'all') {
    selObj.branch = ['all'];
  } else {
    selObj.branch = selObj.branch.filter(b => b !== 'all');
    if (selObj.branch.includes(code)) {
      selObj.branch = selObj.branch.filter(b => b !== code);
      if (!selObj.branch.length) selObj.branch = ['all'];
    } else {
      selObj.branch.push(code);
    }
  }
  const lbl = document.getElementById('lbl-' + dropId);
  if (lbl) {
    if (selObj.branch[0] === 'all') lbl.textContent = 'All Branches';
    else if (selObj.branch.length === 1) lbl.textContent = BRANCH_INFO[selObj.branch[0]]?.name || selObj.branch[0];
    else lbl.textContent = selObj.branch.length + ' Branches';
  }
  drop._render();
  if (drop._onChange) drop._onChange();
}

async function _loadSvcYears() {
  try {
    const { data } = await sb.rpc('get_service_years');
    if (!data || !data.length) return;
    const years = data.map(r => r.year).sort((a,b) => b-a);
    ['svc-year','cli-year'].forEach(id => {
      const sel = document.getElementById(id);
      if (!sel) return;
      const cur = sel.value;
      sel.innerHTML = years.map(y => `<option value="${y}"${y==cur?' selected':''}>${y}</option>`).join('');
    });
  } catch(e) { /* table may not exist yet */ }
}

// ── SERVICES VIEW ────────────────────────────────────────────

// ── THE SHARED WINDOW ────────────────────────────────────────
// Kate, 2026-08-14: Service Rankings and Top Clients used to carry their own
// branch dropdown and their own From/To inputs, so the dashboard had three
// independent notions of "the current period" and nothing kept them in step —
// you could read August on the Pulse and January here without a single hint that
// the window had changed under you. Both pages now read the masthead's filters,
// the same as every other page, and their private controls are gone from the DOM.
//
// The Year dropdown stays, because it is not a duplicate: the service RPCs take
// p_year as well as a range, and with no date range set it is the only thing
// saying which year to load. When a range IS set, the year is derived from it and
// the dropdown steps aside.
const _iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

function _svcWindow() {
  const branches = (!sel.branch || sel.branch.includes('all')) ? ACTIVE_BRANCHES.slice() : sel.branch.slice();
  if (dateFrom && dateTo) {
    return { year: dateFrom.getFullYear(), from: _iso(dateFrom), to: _iso(dateTo), branches, ranged: true };
  }
  const el = document.getElementById('svc-year');
  const year = parseInt((el && el.value) || String(new Date().getFullYear()), 10);
  return { year, from: `${year}-01-01`, to: `${year}-12-31`, branches, ranged: false };
}

// The Year row only earns its place when no date range is driving the page.
function _syncSvcYearRow() {
  const ranged = !!(dateFrom && dateTo);
  ['svc-controls','cli-controls'].forEach(id => {
    const row = document.getElementById(id);
    if (row) row.classList.toggle('yr-idle', ranged);
  });
}

function initSvcView() {
  if (!svcDropsReady) { svcDropsReady = true; _loadSvcYears(); }
  _syncSvcYearRow();
  loadAndRenderServices();
}

function initCliView() {
  if (!svcDropsReady) { svcDropsReady = true; _loadSvcYears(); }
  _syncSvcYearRow();
  loadAndRenderClients();
}

function setSvcViewMode(mode) {
  svcViewMode = mode;
  document.getElementById('svc-toggle-branch')?.classList.toggle('active', mode === 'branch');
  document.getElementById('svc-toggle-combined')?.classList.toggle('active', mode === 'combined');
  loadAndRenderServices();
}

function onSvcFiltersChange() { _syncSvcYearRow(); loadAndRenderServices(); }
function onCliFiltersChange() { _syncSvcYearRow(); loadAndRenderClients(); }

// These two pages used to default to their own Jan–May window, which happened to
// be where the service uploads are. They follow the masthead now, so landing on a
// month with no Service Performance upload is the common case rather than the odd
// one — and "No data for selected filters" reads as a broken page. Say which
// window came up empty, and that this feed is uploaded separately from the ledger.
function _svcEmpty(what) {
  const w = _svcWindow();
  return `<div class="empty">
    <div style="font-weight:600;margin-bottom:6px">No ${what} for ${w.from} – ${w.to}</div>
    <div style="font-size:12px;opacity:.75;max-width:52ch;margin:0 auto;line-height:1.55">
      This page reads the Service Performance upload, which is a separate feed from the
      daily ledger and does not always run to the current month. Widen the period in the
      header, or upload a newer Service Performance file.
    </div>
  </div>`;
}

async function loadAndRenderServices() {
  const content = document.getElementById('svc-content');
  if (!content) return;
  content.innerHTML = '<div class="loading">Loading...</div>';

  const { year, from: pFrom, to: pTo, branches } = _svcWindow();

  try {
    if (svcViewMode === 'combined') {
      const { data, error } = await sb.rpc('get_top_services', {
        p_year: year, p_branches: branches, p_from: pFrom, p_to: pTo, p_limit: 10
      });
      if (error) throw error;
      _renderSvcCombined(data || [], branches, year, pFrom, pTo);
    } else {
      const targetBranches = branches;
      const results = await Promise.all(targetBranches.map(async b => {
        const { data } = await sb.rpc('get_top_services', {
          p_year: year, p_branches: [b], p_from: pFrom, p_to: pTo, p_limit: 10
        });
        return { branch: b, rows: data || [] };
      }));
      _renderSvcPerBranch(results, year, pFrom, pTo);
    }
  } catch(e) {
    console.error(e);
    content.innerHTML = _svcEmpty('service data');
  }
}

function _fmtAed(n) {
  return (parseFloat(n) || 0).toLocaleString('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function _rankCls(i) { return i===0?'gold':i===1?'silver':i===2?'bronze':''; }

function _renderSvcCombined(rows, branches, year, pFrom, pTo) {
  const content = document.getElementById('svc-content');
  if (!rows.length) { content.innerHTML = _svcEmpty('data'); return; }
  const totalRev = rows.reduce((s,r) => s + parseFloat(r.total_revenue||0), 0);
  const branchLabel = branches.length === 4 ? 'All Branches' : branches.map(b => BRANCH_INFO[b]?.name||b).join(' · ');

  content.innerHTML = `
    <div class="section-label" style="margin-top:16px">${branchLabel} — Combined Top 10 Services · ${year}</div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:8px">
        <div>
          <div class="card-title">Top Services by Revenue</div>
          <div class="card-sub">${pFrom} to ${pTo}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:0.1em">Top 10 Combined Revenue</div>
          <div style="font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:600">AED ${_fmtAed(totalRev)}</div>
        </div>
      </div>
      <table>
        <thead><tr>
          <th style="width:30px">#</th>
          <th class="sortable">Service</th>
          <th>Category</th>
          <th style="text-align:right">Revenue (AED)</th>
          <th style="text-align:right">Visits</th>
          <th style="text-align:right">% of Top 10</th>
        </tr></thead>
        <tbody>
          ${rows.map((r,i) => {
            const rev = parseFloat(r.total_revenue||0);
            const pct = totalRev > 0 ? (rev/totalRev*100) : 0;
            return `<tr>
              <td><span class="top3-rank ${_rankCls(i)}">${i+1}</span></td>
              <td style="font-weight:500;font-size:12px">${escapeHtml(r.service_name)||'—'}</td>
              <td><span class="badge" style="background:var(--surface2);color:var(--muted);font-size:10px">${escapeHtml(r.category)||'—'}</span></td>
              <td style="text-align:right;font-family:'Cormorant Garamond',serif;font-size:15px;font-weight:600">${_fmtAed(rev)}</td>
              <td style="text-align:right;color:var(--muted)">${(r.visit_count||0).toLocaleString()}</td>
              <td style="text-align:right">
                <div style="display:flex;align-items:center;gap:6px;justify-content:flex-end">
                  <div class="bar-track" style="width:56px"><div class="bar-fill" style="width:${pct.toFixed(1)}%;background:var(--accent)"></div></div>
                  <span style="min-width:36px;color:var(--muted);font-size:11px">${pct.toFixed(1)}%</span>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

function _renderSvcPerBranch(results, year, pFrom, pTo) {
  const content = document.getElementById('svc-content');
  content.innerHTML = `
    <div class="section-label" style="margin-top:16px">Top 10 Services Per Branch · ${year} · ${pFrom} – ${pTo}</div>
    <div class="${results.length > 2 ? 'svc-scroll-wrap' : ''}"><div class="svc-grid-${results.length <= 2 ? '2' : '4'}">
      ${results.map(({ branch, rows }) => {
        const info = BRANCH_INFO[branch] || { name: branch, color: '#FFD4D9' };
        const totalRev = rows.reduce((s,r) => s + parseFloat(r.total_revenue||0), 0);
        return `
          <div class="card" style="margin-bottom:0">
            <div style="height:3px;border-radius:3px;background:${info.color};margin-bottom:14px"></div>
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
              <div>
                <div class="card-title" style="font-size:14px">${info.name}</div>
                <div class="card-sub" style="margin-bottom:0;font-size:10px">${rows.length} services shown</div>
              </div>
              <div style="text-align:right">
                <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:0.1em">Top 10 Rev</div>
                <div style="font-family:'Cormorant Garamond',serif;font-size:16px;font-weight:600">AED ${_fmtAed(totalRev)}</div>
              </div>
            </div>
            ${!rows.length ? '<div class="top3-empty">No data for period</div>' : `
            <table>
              <thead><tr>
                <th style="width:20px">#</th>
                <th>Service</th>
                <th style="text-align:right">AED</th>
                <th style="text-align:right">Visits</th>
              </tr></thead>
              <tbody>
                ${rows.map((r,i) => {
                  const rev = parseFloat(r.total_revenue||0);
                  const pct = totalRev > 0 ? (rev/totalRev*100) : 0;
                  return `<tr>
                    <td><span class="top3-rank ${_rankCls(i)}" style="font-size:12px">${i+1}</span></td>
                    <td style="font-size:11px;font-weight:500;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(r.service_name)}">${escapeHtml(r.service_name)||'—'}</td>
                    <td style="text-align:right;font-family:'Cormorant Garamond',serif;font-size:13px;font-weight:600">${_fmtAed(rev)}</td>
                    <td style="text-align:right;color:var(--muted);font-size:11px">${r.visit_count||0}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>`}
          </div>`;
      }).join('')}
    </div></div>`;
}

// ── CLIENTS VIEW ─────────────────────────────────────────────

async function loadAndRenderClients() {
  const content = document.getElementById('cli-content');
  if (!content) return;
  content.innerHTML = '<div class="loading">Loading...</div>';

  const { year, from: pFrom, to: pTo, branches } = _svcWindow();

  try {
    const { data, error } = await sb.rpc('get_top_clients', {
      p_year: year, p_branches: branches, p_from: pFrom, p_to: pTo, p_limit: 25
    });
    if (error) throw error;
    _renderClients(data || [], branches, year, pFrom, pTo);
  } catch(e) {
    console.error(e);
    content.innerHTML = _svcEmpty('client data');
  }
}

function _renderClients(rows, branches, year, pFrom, pTo) {
  const content = document.getElementById('cli-content');
  if (!rows.length) { content.innerHTML = _svcEmpty('data'); return; }

  const totalRev = rows.reduce((s,r) => s + parseFloat(r.total_revenue||0), 0);
  const branchLabel = branches.length === 4 ? 'All Branches' : branches.map(b => BRANCH_INFO[b]?.name||b).join(' · ');
  const avColors = ['#FFD4D9','#C4B5FD','#99F6E4','#FF9B9B','#EEF3C7','#FFB6C1','#B5EAD7','#FFDAC1'];

  content.innerHTML = `
    <div class="section-label" style="margin-top:16px">${branchLabel} — Top ${rows.length} Clients · ${year}</div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:8px">
        <div>
          <div class="card-title">Top Clients by Revenue</div>
          <div class="card-sub">${pFrom} to ${pTo}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:0.1em">Combined Revenue (Top ${rows.length})</div>
          <div style="font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:600">AED ${_fmtAed(totalRev)}</div>
        </div>
      </div>
      <table>
        <thead><tr>
          <th style="width:30px">#</th>
          <th>Client</th>
          <th style="text-align:right">Revenue (AED)</th>
          <th style="text-align:right">Visits</th>
          <th>Favourite Service</th>
        </tr></thead>
        <tbody>
          ${rows.map((r,i) => {
            const rev = parseFloat(r.total_revenue||0);
            const initials = (r.client_name||'?').split(' ').map(w=>w[0]||'').join('').slice(0,2).toUpperCase();
            const avColor = avColors[i % avColors.length];
            return `<tr>
              <td><span class="top3-rank ${_rankCls(i)}">${i+1}</span></td>
              <td>
                <div style="display:flex;align-items:center;gap:8px">
                  <div style="width:26px;height:26px;border-radius:50%;background:${avColor};display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#2D2E37;flex-shrink:0">${escapeHtml(initials)}</div>
                  <span style="font-weight:500;font-size:12px">${escapeHtml(r.client_name)||'—'}</span>
                </div>
              </td>
              <td style="text-align:right;font-family:'Cormorant Garamond',serif;font-size:15px;font-weight:600">${_fmtAed(rev)}</td>
              <td style="text-align:right;color:var(--muted)">${(r.visit_count||0).toLocaleString()}</td>
              <td style="color:var(--muted);font-size:11px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(r.top_service)}">${escapeHtml(r.top_service)||'—'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}
