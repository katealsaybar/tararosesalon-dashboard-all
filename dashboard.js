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

const TOP3_METRICS = [
  { key: 'overall',     label: 'Overall'       },
  { key: 'hairSalesNet',label: 'Net Revenue'   },
  { key: 'avgBill',     label: 'Avg Bill'      },
  { key: 'total',       label: 'Total Clients' },
  { key: 'rebookPct',   label: 'Rebooking %'   },
  { key: 'ncrPct',      label: 'Hair NCR %'    },
];

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
const svcSel = { branch: ['all'] };
const cliSel = { branch: ['all'] };
let svcViewMode = 'branch';
let svcDropsReady = false;

// ── THEME ───────────────────────────────────────────────────

function toggleTheme() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', dark ? 'light' : 'dark');
  document.getElementById('themeLbl').textContent = dark ? 'Light' : 'Dark';
  applyLogoForTheme();
  if (Object.keys(charts).length) renderDashboard();
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
// Branch + date range moved into the header as one toolbar (#headerFilters) — this
// toggles both together, same as the old #controls bar did. Kate, 2026-08-04.
function toggleFiltersBar() {
  const bar = document.getElementById('headerFilters');
  const btn = document.getElementById('filtersToggleBtn');
  if (!bar || !btn) return;
  const hidden = bar.style.display === 'none';
  bar.style.display = hidden ? 'flex' : 'none';
  btn.textContent = hidden ? '▾ Hide Filters' : '▸ Show Filters';
}


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
  renderDashboard().then(() => {
    const teamView = document.getElementById('view-team');
    if (teamView && teamView.style.display !== 'none') renderTeam();
  });
}

function rebuildDependentDrops() {
  // Sync pendingSel to match committed sel before rebuilding
  pendingSel.branch = [...sel.branch];
  buildDrop('branch', ACTIVE_BRANCHES.map(k => ({ val: k, label: BRANCH_INFO[k].name })));
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

function updateHeroPeriod() {
  const em = document.getElementById('heroPeriodPhrase');
  if (em) em.textContent = computeHeroPeriodPhrase(dateFrom, dateTo);

  const verbEl = document.getElementById('heroPeriodVerb');
  if (verbEl) {
    const today = new Date(); today.setHours(0,0,0,0);
    const hasEnded = dateTo && dateTo < today;
    verbEl.textContent = hasEnded ? 'shaped up' : 'is shaping up';
  }

  const scopeEl = document.getElementById('heroBranchScope');
  const listEl  = document.getElementById('heroBranchList');
  const isAll   = sel.branch.includes('all');
  if (scopeEl) scopeEl.textContent = isAll ? ' across all branches' : ' across these branches';
  if (listEl) {
    const codes = isAll ? ACTIVE_BRANCHES : sel.branch;
    listEl.textContent = codes.map(c => (BRANCH_INFO[c]?.name || c).toUpperCase()).join('  •  ');
  }
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
  dashboard: 'Organisation Pulse', team: 'Team Performance',
  services: 'Service Rankings', clients: 'Top Clients', reviews: 'Salon Reviews',
};

function setHeaderSectionLabel(text) {
  const el = document.getElementById('headerSectionLabel');
  if (el && text) el.textContent = text;
}

function updateScrollProgress() {
  const scrollArea = document.getElementById('mainScrollArea');
  const fill = document.getElementById('scrollProgressFill');
  if (!scrollArea || !fill) return;
  const max = scrollArea.scrollHeight - scrollArea.clientHeight;
  fill.style.width = (max > 0 ? Math.min(100, (scrollArea.scrollTop / max) * 100) : 0) + '%';

  const dashView = document.getElementById('view-dashboard');
  if (!dashView || dashView.style.display === 'none') return;
  const spots = dashView.querySelectorAll('[data-scrollspy]');
  if (!spots.length) return;
  const areaTop = scrollArea.getBoundingClientRect().top;
  let active = spots[0];
  spots.forEach(spot => { if (spot.getBoundingClientRect().top - areaTop <= 24) active = spot; });
  setHeaderSectionLabel(active.dataset.scrollspy);
}

(function initHeaderScrollspy() {
  const scrollArea = document.getElementById('mainScrollArea');
  const mainContent = document.getElementById('mainContent');
  if (!scrollArea) return;
  scrollArea.addEventListener('scroll', updateScrollProgress, { passive: true });
  if (mainContent) new MutationObserver(updateScrollProgress).observe(mainContent, { childList: true, subtree: true });
})();

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
  renderDashboard().then(() => {
    const teamView = document.getElementById('view-team');
    if (teamView && teamView.style.display !== 'none') renderTeam();
  });
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
  renderDashboard().then(() => {
    const teamView = document.getElementById('view-team');
    if (teamView && teamView.style.display !== 'none') renderTeam();
  });
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
      };
    }
    const st = map[name];
    st.total        += r.total      || 0;
    st.newC         += r.new_client || 0;
    st.rebooked     += r.rebooked   || 0;
    st.req          += r.req        || 0;
    st.salon        += r.salon      || 0;
    st.newClientReq += r.ncr        || 0;
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

async function loadBranchStaffDailyRange(from, to) {
  const pad = n => String(n).padStart(2, '0');
  const fromStr = `${from.getFullYear()}-${pad(from.getMonth()+1)}-${pad(from.getDate())}`;
  const toStr   = `${to.getFullYear()}-${pad(to.getMonth()+1)}-${pad(to.getDate())}`;
  return loadAllRows('branch_staff_daily', fromStr, toStr);
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
    const avatarHtml = p.photo
      ? `<img src="assets/staff/${encodeURIComponent(p.photo)}" alt="" loading="lazy"
             onerror="this.style.display='none'"
             style="width:40px;height:40px;border-radius:50%;object-fit:cover;flex-shrink:0;border:1.5px solid ${color}">`
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

  // ── Top performer: highest-revenue individual stylist, hair or beauty ──
  const staffPool = [
    ...(hairStaff||[]).filter(st => st.name !== 'ASSISTANTS').map(st => ({ name: st.name, dept: 'Hair', color: hairColor, revenue: st.hairSalesNet||0, total: st.total||0, rebookPct: st.rebookPct||0 })),
    ...(beautyStaff||[]).filter(st => st.name !== 'ASSISTANTS').map(st => ({ name: st.name, dept: 'Beauty', color: beautyColor, revenue: st.beautySales||0, total: st.total||0, rebookPct: st.rebookPct||0 })),
  ].filter(p => p.revenue > 0).sort((a,b) => b.revenue - a.revenue);
  const top = staffPool[0];
  const performerCard = top
    ? winCard('Top Performer', top.color, `${top.name} — ${top.dept}`,
        `${fmtAED(top.revenue)} · ${top.total.toLocaleString()} clients · ${fmtPct(top.rebookPct)} rebooked`,
        (typeof staffProfile === 'function') ? staffProfile(top.name) : null)
    : winCard('Top Performer', 'var(--muted)', 'No staff data for this period', 'Staff-level figures aren’t available for this date range.');

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

  return `<div style="display:flex;gap:14px;flex-wrap:wrap">${performerCard}${improvementCard}${branchCard}</div>`;
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
  updateHeroPeriod();
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

  const heroStatusEl = document.getElementById('heroStatusStatement');
  if (heroStatusEl) {
    const glance = computeAtAGlanceExplanation(s, rvHairSvc, rvHairTxPct);
    const glanceLabelStyle = "font-family:'Playfair Display',serif;font-weight:700;font-size:18px;color:#FF9B9B";
    heroStatusEl.innerHTML = `
      <div style="display:flex;align-items:stretch;max-width:900px;margin:0 auto">
        <div style="flex:1;text-align:left;padding-right:24px"><span style="${glanceLabelStyle}">Hair</span> — ${glance.hair}</div>
        <div style="width:1px;flex-shrink:0;background:rgba(180,140,100,0.55)"></div>
        <div style="flex:1;text-align:left;padding-left:24px"><span style="${glanceLabelStyle}">Beauty</span> — ${glance.beauty}</div>
      </div>`;
  }

  // Receipt strip — 7 headline metrics, styled as a printed receipt per Kate's
  // mockup reference, 2026-08-03. Deltas are vs the previous period (prevS),
  // same convention as trendArrow() elsewhere on this page. Each metric with a
  // defined TARGET gets a small progress-to-target meter bar (no line charts —
  // Kate asked for the sparklines to go, 2026-08-03 follow-up).
  const receiptEl = document.getElementById('heroReceipt');
  if (receiptEl) {
    const servicesRevenue = rvHBSvc;
    const prevServicesRevenue = prevS ? (prevS.netTake - (prevS.hairRetail||0)) : null;
    const retailRevenue = s.hairRetail||0;
    const prevRetailRevenue = prevS ? (prevS.hairRetail||0) : null;
    // Red/green on the value itself only applies where a real single target
    // exists (sc()/TARGETS) — Services Revenue and Retail Revenue have no
    // single target defined elsewhere in the app, so those stay neutral.
    const statusColor = { good:'#0F6E56', warn:'#BA7517', bad:'#A32D2D', critical:'#A32D2D', '':'#2A2A2A' };
    const meter = (value, target) => {
      if (!target) return '';
      const status = sc(value||0, target);
      const barColor = status==='good' ? '#0F6E56' : status==='warn' ? '#BA7517' : '#A32D2D';
      const pct = Math.max(4, Math.min(100, ((value||0)/target)*100));
      return `<div style="height:4px;background:#E7E0D2;border-radius:2px;margin-top:7px;overflow:hidden"><div style="height:100%;width:${pct.toFixed(0)}%;background:${barColor};border-radius:2px"></div></div>`;
    };
    const receiptRow = (label, valueHtml, deltaHtml, meterHtml, valueColor) => `
      <div class="r-row"><span class="r-label">${label}</span></div>
      <div class="r-row"><span class="r-val" style="color:${valueColor || '#2A2A2A'}">${valueHtml}</span></div>
      <div class="r-delta">${deltaHtml || '&nbsp;'}</div>
      ${meterHtml || ''}
      <div class="r-rule"></div>`;
    receiptEl.innerHTML = `
      <div class="r-logo-crop"><img class="r-logo" src="assets/6.png" alt="Tara Rose"></div>
      <div class="r-sub">ORGANISATION PULSE</div>
      <div class="r-rule"></div>
      ${receiptRow('SERVICES REVENUE', fmtAED(servicesRevenue), trendArrow(servicesRevenue, prevServicesRevenue, true, prevPeriodLabel))}
      ${receiptRow('RETAIL REVENUE', fmtAED(retailRevenue), trendArrow(retailRevenue, prevRetailRevenue, true, prevPeriodLabel))}
      ${receiptRow('HAIR AVG BILL', fmtAED(s.hairAvgBill), trendArrow(s.hairAvgBill, prevS?.hairAvgBill, true, prevPeriodLabel), meter(s.hairAvgBill, TARGETS.hairAvgBill), statusColor[sc(s.hairAvgBill, TARGETS.hairAvgBill)])}
      ${receiptRow('BEAUTY AVG BILL', s.beautyAvgBill!=null?fmtAED(s.beautyAvgBill):'—', s.beautyAvgBill!=null?trendArrow(s.beautyAvgBill, prevS?.beautyAvgBill, true, prevPeriodLabel):'&nbsp;', s.beautyAvgBill!=null?meter(s.beautyAvgBill, TARGETS.beautyAvgBill):'', s.beautyAvgBill!=null?statusColor[sc(s.beautyAvgBill, TARGETS.beautyAvgBill)]:null)}
      ${receiptRow('REBOOKING % (GROUP AVG)', fmtPct(s.rebookPct), trendArrow(s.rebookPct, prevS?.rebookPct, true, prevPeriodLabel), meter(s.rebookPct, TARGETS.rebookPct), statusColor[sc(s.rebookPct, TARGETS.rebookPct)])}
      ${receiptRow('TREATMENT % (GROUP AVG)', fmtPct(s.treatmentPct), trendArrow(s.treatmentPct, prevS?.treatmentPct, true, prevPeriodLabel), meter(s.treatmentPct, TARGETS.treatmentPct), statusColor[sc(s.treatmentPct, TARGETS.treatmentPct)])}
      ${receiptRow('RETAIL % (GROUP AVG)', fmtPct(s.hairRetailPct), trendArrow(s.hairRetailPct, prevS?.hairRetailPct, true, prevPeriodLabel), meter(s.hairRetailPct, TARGETS.retailPct), statusColor[sc(s.hairRetailPct, TARGETS.retailPct)])}
      <div class="r-foot">${escapeHtml(branchLabel).toUpperCase()}<br>${new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}).toUpperCase()}</div>
    `;
  }

  main.innerHTML = `
<!-- ROW 1: 4 COMPACT KPI CARDS -->
<div>
  <div class="section-label" data-scrollspy="Main Metrics" style="display:flex;align-items:center;gap:7px;margin-top:16px;margin-bottom:8px">
    <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#99F6E4;flex-shrink:0"></span>
    ${branchLabel} · Main Metrics
  </div>
  <div style="display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr;gap:10px;margin-bottom:12px">

    <div class="metric" style="border-color:rgba(153,246,228,0.45);padding:20px;background:${dark?'rgba(153,246,228,0.05)':'rgba(153,246,228,0.07)'}">
      <div style="position:absolute;top:0;left:0;right:0;height:3px;border-radius:13px 13px 0 0;background:#99F6E4"></div>
      <div class="metric-label" style="font-size:10px">Total Clients</div>
      <div style="font-size:10px;color:var(--muted);margin:4px 0 8px"><em>Excludes rebooked clients</em></div>
      <div class="metric-value" style="font-size:40px">${(s.totalClients||0).toLocaleString()}</div>
      <div class="metric-target" style="font-size:11px;margin-top:10px">Target: ${getClientTarget(sel.branch)}</div>
    </div>

    <div class="metric" style="border-color:rgba(153,246,228,0.35);padding:14px">
      <div style="position:absolute;top:0;left:0;right:0;height:3px;border-radius:13px 13px 0 0;background:#99F6E4"></div>
      <div class="metric-label" style="font-size:9px">Avg Bill (AED)</div>
      <div style="font-size:9px;color:var(--muted);margin:3px 0 6px"><em>Revenue ÷ Total Clients (excl. rebooked)</em></div>
      <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:6px">
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <span style="font-size:9px;font-weight:700;color:var(--hair);letter-spacing:.06em">HAIR</span>
          <span class="tabular ${sc(s.hairAvgBill||0,650)}" style="font-size:14px;font-weight:600">${fmtAED(s.hairAvgBill||0)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <span style="font-size:9px;font-weight:700;color:var(--beauty);letter-spacing:.06em">BEAUTY</span>
          <span class="tabular ${s.beautyAvgBill!=null?sc(s.beautyAvgBill,650):''}" style="font-size:14px;font-weight:600">${s.beautyAvgBill!=null?fmtAED(s.beautyAvgBill):'—'}</span>
        </div>
      </div>
      <div style="border-top:1px solid var(--border2);padding-top:6px">
        <div class="metric-value ${sc(s.avgBill||0,650)}" style="font-size:24px">${fmtAED(s.avgBill||0)}${trendArrow(s.avgBill, prevS?.avgBill, true, prevPeriodLabel)}</div>
        <div class="metric-target" style="font-size:10px">Combined · Benchmark: ~AED 650</div>
      </div>
      ${statusBanner(sc(s.avgBill||0,650), dark)}
    </div>

    <div class="metric" style="border-color:rgba(153,246,228,0.35);padding:14px">
      <div style="position:absolute;top:0;left:0;right:0;height:3px;border-radius:13px 13px 0 0;background:#99F6E4"></div>
      <div class="metric-label" style="font-size:9px">Rebooking %</div>
      <div style="font-size:9px;color:var(--muted);margin:3px 0 6px"><em>Rebooked ÷ Total Clients (excl. rebooked)</em></div>
      <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:6px">
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <span style="font-size:9px;font-weight:700;color:var(--hair);letter-spacing:.06em">HAIR</span>
          <span class="tabular ${sc(s.hairRebookPct||0,TARGETS.rebookPct)}" style="font-size:14px;font-weight:600">${fmtPct(s.hairRebookPct||0)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <span style="font-size:9px;font-weight:700;color:var(--beauty);letter-spacing:.06em">BEAUTY</span>
          <span class="tabular ${s.beautyRebookPct!=null?sc(s.beautyRebookPct,TARGETS.rebookPct):''}" style="font-size:14px;font-weight:600">${s.beautyRebookPct!=null?fmtPct(s.beautyRebookPct):'—'}</span>
        </div>
      </div>
      <div style="border-top:1px solid var(--border2);padding-top:6px">
        <div class="metric-value ${sc(s.rebookPct||0,TARGETS.rebookPct)}" style="font-size:24px">${fmtPct(s.rebookPct||0)}${trendArrow(s.rebookPct, prevS?.rebookPct, true, prevPeriodLabel)}</div>
        <div class="metric-target" style="font-size:10px">Combined · Target: ${TARGETS.rebookPct}%</div>
      </div>
      ${statusBanner(sc(s.rebookPct||0,TARGETS.rebookPct), dark)}
    </div>

    <div class="metric ${sc(s.combinedNcrPct||0,20)==='good'?'ncr-glow':''}" style="border-color:rgba(153,246,228,0.75);padding:14px">
      <div style="position:absolute;top:0;left:0;right:0;height:3px;border-radius:13px 13px 0 0;background:#99F6E4"></div>
      <div class="metric-label" style="font-size:9px">NCR %</div>
      <div style="font-size:9px;color:var(--muted);margin:3px 0 6px"><em>New Client Requests ÷ Clients (excl. rebooked)</em></div>
      <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:6px">
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <span style="font-size:9px;font-weight:700;color:var(--hair);letter-spacing:.06em">HAIR</span>
          <span class="tabular ${sc(s.ncrPct||0,20)}" style="font-size:14px;font-weight:600">${fmtPct(s.ncrPct||0)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <span style="font-size:9px;font-weight:700;color:var(--beauty);letter-spacing:.06em">BEAUTY</span>
          <span class="tabular ${s.beautyNcrPct!=null?sc(s.beautyNcrPct,20):''}" style="font-size:14px;font-weight:600">${s.beautyNcrPct!=null?fmtPct(s.beautyNcrPct):'—'}</span>
        </div>
      </div>
      <div style="border-top:1px solid var(--border2);padding-top:6px">
        <div class="metric-value ${sc(s.combinedNcrPct||0,20)}" style="font-size:24px">${fmtPct(s.combinedNcrPct||0)}${trendArrow(s.ncrPct, prevS?.ncrPct, true, prevPeriodLabel)}</div>
        <div class="metric-target" style="font-size:10px">Combined · Target: ≥ 20%</div>
      </div>
      ${statusBanner(sc(s.combinedNcrPct||0,20), dark)}
    </div>
  </div>

</div>

<!-- Target Achievement gauge — standalone, below the KPI row -->
<div style="margin-bottom:16px">
  <div class="card" style="margin-bottom:0;max-width:340px">
    <div class="card-title">Target Achievement</div>
    <div class="card-sub">Core KPIs currently at or above target</div>
    <div id="orgTargetGauge" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:230px;gap:8px">
      <div style="position:relative;width:200px;height:110px;overflow:hidden">
        <canvas id="orgTargetGaugeCanvas" width="200" height="200" style="position:absolute;top:0;left:0"></canvas>
      </div>
      <div id="orgTargetGaugeLabel" style="text-align:center"></div>
    </div>
  </div>
</div>

<!-- Data source note -->
<div style="font-size:10.5px;color:var(--muted);margin:2px 0 18px;line-height:1.5;max-width:900px">
  Sourced from Phorest extractions, except figures tagged <span style="font-size:8px;font-weight:700;letter-spacing:.06em;color:var(--muted);border:1px solid var(--border);border-radius:8px;padding:1px 5px;vertical-align:middle">LEDGER</span> — those come from the treatment ledger (Google Sheets).
</div>

${(s._retailWarnings && s._retailWarnings.length) ? `
  <div style="margin:0 0 14px;padding:10px 12px;background:rgba(251,191,36,.08);border-left:3px solid #fbbf24;border-radius:6px;font-size:11px;color:var(--text)">
    <strong style="color:#fbbf24">⚠️ Retail data mismatch detected</strong> across ${s._retailWarnings.length} week(s).
    Daily-sheet sum (used) differs from weekly summary row.
    ${s._retailWarnings.slice(0,3).map(m => `Daily AED ${(m.daily||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})} vs Summary AED ${(m.summary||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})} (${m.pctDiff}% drift)`).join(' · ')}
  </div>
` : ''}

${(() => {
  const ledgerTag = `<span style="font-size:8px;font-weight:700;letter-spacing:.06em;color:var(--muted);border:1px solid var(--border);border-radius:8px;padding:1px 5px;vertical-align:middle;margin-left:4px">LEDGER</span>`;
  const tile = (label, value, opts = {}) => `
    <div class="metric ${opts.cls||''}">
      <div class="metric-label">${label}${opts.ledger ? ledgerTag : ''}</div>
      <div class="metric-value" style="font-size:21px">${value}</div>
      ${opts.target ? `<div class="metric-target">${opts.target}</div>` : ''}
    </div>`;
  const cluster = (label, color, tilesHtml) => `
    <div style="margin-bottom:16px">
      <div style="font-size:10px;font-weight:700;letter-spacing:.12em;color:${color};text-transform:uppercase;margin-bottom:8px">${label}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px">${tilesHtml}</div>
    </div>`;
  const section = (id, dotColor, title, bodyHtml) => `
    <div class="support-section" style="margin-bottom:14px" data-scrollspy="${title}">
      <div class="support-section-hdr" onclick="toggleSection('${id}')">
        <div style="display:flex;align-items:center;gap:8px;min-width:0">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${dotColor};flex-shrink:0"></span>
          <span style="font-family:'Playfair Display',serif;font-style:italic;font-weight:600;font-size:16px;letter-spacing:0.02em;color:var(--text)">${title}</span>
          <span style="font-size:10px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${branchLabel}</span>
        </div>
        <span id="arrow-${id}" class="support-toggle-arrow">▸</span>
      </div>
      <div id="body-${id}" class="support-section-body" style="padding:14px 6px 6px">${bodyHtml}</div>
    </div>`;

  // Department-scoped figures not already available on `s` — kept locally so their
  // exact definition (÷ that department's own net take, not the combined total) is
  // unambiguous, since s.treatmentPct/s.hairRetail carry different meanings depending
  // on which aggregation path (weekly vs. daily/date-range) produced this render.
  const hairNetSalonTake     = (s.hairServicesIncl||0) + (s.hairRetailOnly||0);
  const beautyNetTakeDept    = (s.beautyServicesTotal||0) + (s.beautyRetailOnly||0);
  const hairTreatmentPctDept = (s.hairServicesIncl||0) ? ((s.treatmentSales||0)   / (s.hairServicesIncl||0) * 100) : 0;
  const hairRetailPctDept    = hairNetSalonTake         ? ((s.hairRetailOnly||0)  / hairNetSalonTake         * 100) : 0;
  const beautyRetailPctDept  = beautyNetTakeDept        ? ((s.beautyRetailOnly||0)/ beautyNetTakeDept        * 100) : 0;

  const revenueTargets = section('revTargets', '#FFD4D9', 'Revenue Targets', `
    ${cluster('Revenue', '#8A6800', [
      tile('Services Total',                            fmtAED(s.servicesTotal)),
      tile('Retail Total',                               fmtAED(s.retailTotal)),
      tile('Hair Services (incl. treatments/courses)',  fmtAED(s.hairServicesIncl)),
      tile('Hair Services (excl. treatments)',           fmtAED(s.hairServicesExcl)),
      tile('Treatments Revenue',                         fmtAED(s.treatmentSales), {ledger:true}),
      tile('Beauty Services',                            fmtAED(s.beautyServicesTotal)),
      tile('Hair Retail',                                fmtAED(s.hairRetailOnly)),
      tile('Beauty Retail',                              fmtAED(s.beautyRetailOnly)),
    ].join(''))}
    ${cluster('Hair Clients', 'var(--hair)', [
      tile('Hair Total Clients',    (s.hairTotalClients||0).toLocaleString()),
      tile('Hair New Clients',      (s.hairNewClients||0).toLocaleString()),
      tile('Hair NCR',              (s.hairNCR||0).toLocaleString()),
      tile('Hair Rebooked Clients', (s.hairRebookedCount||0).toLocaleString()),
    ].join(''))}
    ${cluster('Beauty Clients', 'var(--beauty)', [
      tile('Beauty Total Clients',    (s.beautyTotalClients||0).toLocaleString()),
      tile('Beauty New Clients',      (s.beautyNewClients||0).toLocaleString()),
      tile('Beauty NCR',              (s.beautyNCR||0).toLocaleString()),
      tile('Beauty Rebooked Clients', (s.beautyRebookedCount||0).toLocaleString()),
    ].join(''))}
    ${cluster('Combined', 'var(--muted)', [
      tile('Rebooked Clients (Hair + Beauty)', (s.totalRebooked||0).toLocaleString()),
      tile('Total Clients',                    (s.totalClients||0).toLocaleString()),
      tile('New Clients',                      (s.newClientsTotal||0).toLocaleString()),
      tile('NCR',                               (s.ncrTotal||0).toLocaleString()),
      tile('Salon Client',                      (s.salonClientTotal||0).toLocaleString()),
      tile('Request Client',                    (s.requestClientTotal||0).toLocaleString()),
    ].join(''))}
  `);

  const benchmarks = section('benchmarks', '#99F6E4', 'Benchmarks', `
    ${cluster('Combined Ratios', 'var(--muted)', [
      `<div class="metric">
        <div class="metric-label">Rebooking %</div>
        <div style="display:flex;flex-direction:column;gap:4px;margin:6px 0">
          <div style="display:flex;justify-content:space-between;align-items:baseline"><span style="font-size:9px;font-weight:700;color:var(--hair);letter-spacing:.06em">HAIR</span><span class="tabular ${sc(s.hairRebookPct||0,TARGETS.rebookPct)}" style="font-size:14px;font-weight:600">${fmtPct(s.hairRebookPct||0)}</span></div>
          <div style="display:flex;justify-content:space-between;align-items:baseline"><span style="font-size:9px;font-weight:700;color:var(--beauty);letter-spacing:.06em">BEAUTY</span><span class="tabular ${s.beautyRebookPct!=null?sc(s.beautyRebookPct,TARGETS.rebookPct):''}" style="font-size:14px;font-weight:600">${s.beautyRebookPct!=null?fmtPct(s.beautyRebookPct):'—'}</span></div>
        </div>
        <div class="metric-value ${sc(s.rebookPct, TARGETS.rebookPct)}" style="font-size:20px;border-top:1px solid var(--border2);padding-top:6px">${fmtPct(s.rebookPct)}</div>
        <div class="metric-target">Combined · Target: ${TARGETS.rebookPct}%</div>
      </div>`,
      `<div class="metric">
        <div class="metric-label">Treatment %</div>
        <div style="display:flex;flex-direction:column;gap:4px;margin:6px 0">
          <div style="display:flex;justify-content:space-between;align-items:baseline"><span style="font-size:9px;font-weight:700;color:var(--hair);letter-spacing:.06em">HAIR</span><span class="tabular ${sc(hairTreatmentPctDept,TARGETS.treatmentPct)}" style="font-size:14px;font-weight:600">${fmtPct(hairTreatmentPctDept)}</span></div>
          <div style="display:flex;justify-content:space-between;align-items:baseline"><span style="font-size:9px;font-weight:700;color:var(--beauty);letter-spacing:.06em">BEAUTY</span><span style="font-size:12px;font-weight:600;color:var(--muted)">— not tracked</span></div>
        </div>
        <div class="metric-value ${sc(rvHBTxPct, TARGETS.treatmentPct)}" style="font-size:20px;border-top:1px solid var(--border2);padding-top:6px">${fmtPct(rvHBTxPct)}</div>
        <div class="metric-target">Combined · Target: ≥ ${TARGETS.treatmentPct}%</div>
      </div>`,
      `<div class="metric">
        <div class="metric-label">Retail %</div>
        <div style="display:flex;flex-direction:column;gap:4px;margin:6px 0">
          <div style="display:flex;justify-content:space-between;align-items:baseline"><span style="font-size:9px;font-weight:700;color:var(--hair);letter-spacing:.06em">HAIR</span><span class="tabular ${sc(hairRetailPctDept,TARGETS.retailPct)}" style="font-size:14px;font-weight:600">${fmtPct(hairRetailPctDept)}</span></div>
          <div style="display:flex;justify-content:space-between;align-items:baseline"><span style="font-size:9px;font-weight:700;color:var(--beauty);letter-spacing:.06em">BEAUTY</span><span class="tabular ${sc(beautyRetailPctDept,TARGETS.retailPct)}" style="font-size:14px;font-weight:600">${fmtPct(beautyRetailPctDept)}</span></div>
        </div>
        <div class="metric-value ${sc(rvHBRetPct, TARGETS.retailPct)}" style="font-size:20px;border-top:1px solid var(--border2);padding-top:6px">${fmtPct(rvHBRetPct)}</div>
        <div class="metric-target">Combined · Target: ≥ ${TARGETS.retailPct}%</div>
      </div>`,
    ].join(''))}
    ${cluster('Avg Bill', 'var(--muted)', [
      tile('Hair Avg Bill (AED)',   fmtAED(s.hairAvgBill),                                {target:`Target: AED ${TARGETS.hairAvgBill}`}),
      tile('Beauty Avg Bill (AED)', s.beautyAvgBill!=null?fmtAED(s.beautyAvgBill):'—',    {target:`Target: AED ${TARGETS.beautyAvgBill}`}),
    ].join(''))}
    ${cluster('Utilisation', 'var(--muted)', [
      tile('Utilisation (Hours) — Hair',          s.hairUtilHours!=null?s.hairUtilHours.toLocaleString(undefined,{maximumFractionDigits:1}):'—', {cls:'m-turq', target: s.hairUtilHours!=null?'Target: ≥ 80%':'Not wired yet — no matching utilisation data for this period'}),
      tile('Utilisation % — Hair',                s.hairUtilPct!=null?fmtPct(s.hairUtilPct):'—', {cls:'m-turq', target:'Target: ≥ 80%'}),
      tile('Utilisation (Hours) — Beauty',        s.beautyUtilHours!=null?s.beautyUtilHours.toLocaleString(undefined,{maximumFractionDigits:1}):'—', {cls:'m-turq', target: s.beautyUtilHours!=null?'Target: ≥ 70%':'Not wired yet — no matching utilisation data for this period'}),
      tile('Utilisation % — Beauty',              s.beautyUtilPct!=null?fmtPct(s.beautyUtilPct):'—', {cls:'m-turq', target:'Target: ≥ 70%'}),
      tile('Utilisation (Hours) — Hair & Beauty', s.utilHours!=null?s.utilHours.toLocaleString(undefined,{maximumFractionDigits:1}):'—', {cls:'m-turq', target: s.utilHours!=null?'Target: ≥ 75–85%':'Not wired yet — no matching utilisation data for this period'}),
      tile('Utilisation % — Hair & Beauty',       s.utilPct!=null?fmtPct(s.utilPct):'—', {cls:'m-turq', target:'Target: ≥ 75–85%'}),
    ].join(''))}
  `);

  // Mirrored Hair | Beauty bars (bar = actual, tick = target) — replaces the old
  // duplicated "Performance Ratios" + "Utilisation" tile clusters that used to live
  // separately inside staffHair/staffBeauty below. One space-saving panel instead of
  // two, same mirroring technique as the Client Funnel. Kate, 2026-08-03.
  const mirrorRow = (label, hairVal, beautyVal, hairTarget, beautyTarget, fmtFn) => {
    const nums = [hairVal, beautyVal, hairTarget, beautyTarget].filter(v => v != null && !isNaN(v));
    const rowMax = nums.length ? Math.max(...nums) * 1.15 : 1;
    const barPct  = v => (v == null || !rowMax) ? 0 : Math.min(100, Math.max(v > 0 ? 3 : 0, v / rowMax * 100));
    const tickPct = v => (v == null || !rowMax) ? null : Math.min(97, Math.max(1, v / rowMax * 100));
    const hairTick = tickPct(hairTarget), beautyTick = tickPct(beautyTarget);
    const hairBar = hairVal == null ? `<span style="font-size:11px;color:var(--muted2)">—</span>` : `
      <div style="flex:1;position:relative;height:22px;background:var(--border2);border-radius:6px 2px 2px 6px">
        <div style="position:absolute;top:0;right:0;height:100%;width:${barPct(hairVal)}%;background:var(--hair);border-radius:6px 2px 2px 6px"></div>
        ${hairTick!=null?`<div style="position:absolute;top:-3px;bottom:-3px;right:${hairTick}%;width:2px;background:var(--text)"></div>`:''}
      </div>`;
    const beautyBar = beautyVal == null ? `<span style="font-size:11px;color:var(--muted2)">${beautyTarget==null?'not tracked':'—'}</span>` : `
      <div style="flex:1;position:relative;height:22px;background:var(--border2);border-radius:2px 6px 6px 2px">
        <div style="position:absolute;top:0;left:0;height:100%;width:${barPct(beautyVal)}%;background:var(--beauty);border-radius:2px 6px 6px 2px"></div>
        ${beautyTick!=null?`<div style="position:absolute;top:-3px;bottom:-3px;left:${beautyTick}%;width:2px;background:var(--text)"></div>`:''}
      </div>`;
    return `
      <div style="display:flex;align-items:center;margin-bottom:14px">
        <div style="flex:1;display:flex;align-items:center;justify-content:flex-end;gap:8px;min-width:0">
          <span class="tabular" style="font-size:11.5px;font-weight:600;color:var(--text);white-space:nowrap">${hairVal==null?'':fmtFn(hairVal)}</span>
          ${hairBar}
        </div>
        <div style="width:120px;flex-shrink:0;text-align:center;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)">${label}</div>
        <div style="flex:1;display:flex;align-items:center;gap:8px;min-width:0">
          ${beautyBar}
          <span class="tabular" style="font-size:11.5px;font-weight:600;color:var(--text);white-space:nowrap">${beautyVal==null?'':fmtFn(beautyVal)}</span>
        </div>
      </div>`;
  };

  const staffRatios = section('staffRatios', 'var(--hair)', 'Performance Ratios — Hair & Beauty', `
    <div style="display:flex;justify-content:space-between;margin-bottom:14px;max-width:700px">
      <span style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--hair)">◂ Hair</span>
      <span style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--beauty)">Beauty ▸</span>
    </div>
    <div style="max-width:700px">
      ${mirrorRow('Rebooking %',    s.hairRebookPct||0,   s.beautyRebookPct, TARGETS.rebookPct,    TARGETS.rebookPct,    fmtPct)}
      ${mirrorRow('Treatment %',    hairTreatmentPctDept, null,              TARGETS.treatmentPct, null,                 fmtPct)}
      ${mirrorRow('Retail %',       hairRetailPctDept,    beautyRetailPctDept, TARGETS.retailPct,  TARGETS.retailPct,    fmtPct)}
      ${mirrorRow('Avg Bill',       s.hairAvgBill||0,     s.beautyAvgBill,   TARGETS.hairAvgBill,  TARGETS.beautyAvgBill, fmtAED)}
      ${mirrorRow('Utilisation %',  s.hairUtilPct,        s.beautyUtilPct,   TARGETS.hairUtilPct,  TARGETS.beautyUtilPct, fmtPct)}
    </div>
    <div style="font-size:10px;color:var(--muted2);margin-top:2px">Bar = actual · tick = target</div>
  `);

  const staffHair = section('staffHair', 'var(--hair)', 'Staff Performance — Hair', `
    ${cluster('Revenue', 'var(--hair)', [
      tile('Hair Services (excl. treatments)', fmtAED(s.hairServicesExcl)),
      tile('Treatments Revenue',               fmtAED(s.treatmentSales), {ledger:true}),
      tile('Retail Revenue',                   fmtAED(s.hairRetailOnly)),
      tile('Net Salon Take',                   fmtAED(hairNetSalonTake)),
    ].join(''))}
    ${cluster('Clients', 'var(--hair)', [
      tile('Rebooked Clients', (s.hairRebookedCount||0).toLocaleString()),
      tile('Total Clients',    (s.hairTotalClients||0).toLocaleString()),
      tile('New Clients',      (s.hairNewClients||0).toLocaleString()),
      tile('NCR',              (s.hairNCR||0).toLocaleString()),
      tile('Salon Client',     (s.hairBreakdown?.salon||0).toLocaleString()),
      tile('Request Client',   (s.hairBreakdown?.req||0).toLocaleString()),
    ].join(''))}
  `);

  const staffBeauty = section('staffBeauty', 'var(--beauty)', 'Staff Performance — Beauty', `
    ${cluster('Revenue', 'var(--beauty)', [
      tile('Services Revenue', fmtAED(s.beautyServicesTotal)),
      tile('Retail Revenue',   fmtAED(s.beautyRetailOnly)),
      tile('Total Net Take',   fmtAED(beautyNetTakeDept)),
    ].join(''))}
    ${cluster('Clients', 'var(--beauty)', [
      tile('Rebooked Clients', (s.beautyBreakdown?.rebooked||0).toLocaleString()),
      tile('Total Clients',    (s.beautyTotalClients||0).toLocaleString()),
      tile('New Clients',      (s.beautyNewClients||0).toLocaleString()),
      tile('NCR',              (s.beautyNCR||0).toLocaleString()),
      tile('Salon Client',     (s.beautyBreakdown?.salon||0).toLocaleString()),
      tile('Request Client',   (s.beautyBreakdown?.req||0).toLocaleString()),
    ].join(''))}
  `);

  return revenueTargets + benchmarks + staffRatios + `
    <div class="g2-staff" style="display:grid;grid-template-columns:1fr 1fr;gap:14px">${staffHair}${staffBeauty}</div>`;
})()}
  `;

  // Default every new section to open on first render; leave alone once the user
  // has toggled one (sectionState persists across re-renders — see toggleSection()).
  ['revTargets','benchmarks','staffRatios','staffHair','staffBeauty'].forEach(id => { if (!(id in sectionState)) sectionState[id] = true; });
  restoreSections();

  // ── Performance Overview: lives in the hero block (the blank space beside
  // the receipt's lower half), not in the scrollable content — Kate wanted it
  // "katabi ng lower half ng resibo" (2026-08-03 follow-up).
  // byBranch is computed once here (rather than inside the chart try-block below)
  // so both the Branch Performance chart AND the Top Branch wins card can use it.
  let byBranch = {};
  try { byBranch = aggByBranch(); } catch(e) { /* wins/chart below both tolerate an empty object */ }

  const heroPerfEl = document.getElementById('heroPerfOverview');
  if (heroPerfEl) {
    heroPerfEl.innerHTML = `
      <div class="section-label" style="display:flex;align-items:center;gap:7px;margin-bottom:8px">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#C4B5FD;flex-shrink:0"></span>
        ${branchLabel} · Performance Overview
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="card" style="margin-bottom:0">
          <div class="card-title">Client Funnel — Hair vs Beauty</div>
          <div class="card-sub">Every client type, mirrored down the middle</div>
          <div id="orgClientFunnel"></div>
        </div>
        <div class="card" style="margin-bottom:0">
          <div class="card-title">Branch Performance</div>
          <div class="card-sub">Net revenue by branch &nbsp;·&nbsp; dashed line = group average</div>
          <div class="canvas-wrap"><canvas id="orgBranchBarChart"></canvas></div>
        </div>
      </div>
      <div class="section-label" style="display:flex;align-items:center;gap:7px;margin-top:16px;margin-bottom:8px">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#FF9B9B;flex-shrink:0"></span>
        This Week's Wins
      </div>
      ${buildWinsHTML(s, prevS, prevPeriodLabel, d.hairStaff, d.beautyStaff, branchLabel, byBranch, dark)}`;
  }

  try {
    buildCmpChart(byBranch, 'netTake', dark, ttStyle, gc, tc, 'hb', 'orgBranchBarChart');
  } catch(e) { /* chart is a nice-to-have — don't break the page if branch agg fails */ }

  try {
    const gaugeMetrics = [
      { value: s.hairAvgBill,   target: TARGETS.hairAvgBill },
      { value: s.beautyAvgBill, target: TARGETS.beautyAvgBill, skip: s.beautyAvgBill == null },
      { value: s.rebookPct,     target: TARGETS.rebookPct },
      { value: rvHBTxPct,       target: TARGETS.treatmentPct },
      { value: rvHBRetPct,      target: TARGETS.retailPct },
    ].filter(m => !m.skip);
    const achieved     = gaugeMetrics.filter(m => sc(m.value||0, m.target) === 'good').length;
    const totalTracked = gaugeMetrics.length || 1;
    const ratio        = achieved / totalTracked;
    const gaugeColor = dark
      ? (ratio >= 1 ? '#99F6E4' : ratio >= 0.5 ? '#EEF3C7' : '#FF9B9B')
      : (ratio >= 1 ? '#0F6E56' : ratio >= 0.5 ? '#BA7517' : '#A32D2D');
    const trackColor = dark ? 'rgba(250,248,243,0.08)' : 'rgba(26,26,26,0.06)';
    const gEl = document.getElementById('orgTargetGaugeCanvas');
    if (gEl) {
      charts.gauge = new Chart(gEl, {
        type: 'doughnut',
        data: { datasets: [{ data: [achieved, totalTracked - achieved], backgroundColor: [gaugeColor, trackColor], borderWidth: 0 }] },
        options: { rotation: -90, circumference: 180, cutout: '74%', plugins: { legend: { display: false }, tooltip: { enabled: false } }, animation: { duration: 600, easing: 'easeOutQuart' } }
      });
    }
    const gaugeLabelEl = document.getElementById('orgTargetGaugeLabel');
    if (gaugeLabelEl) {
      gaugeLabelEl.innerHTML = `
        <div style="font-family:'Playfair Display',serif;font-size:32px;font-weight:600;color:var(--text);line-height:1">${achieved}/${gaugeMetrics.length}</div>
        <div style="font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-top:4px">KPIs On Target</div>`;
    }
  } catch(e) { /* gauge is a nice-to-have — don't break the page */ }

  try {
    const funnelEl = document.getElementById('orgClientFunnel');
    if (funnelEl) funnelEl.innerHTML = buildClientFunnelHTML(s, dark);
  } catch(e) { /* funnel is a nice-to-have — don't break the page */ }

}


// ── TEAM PERFORMANCE ─────────────────────────────────────────

let teamCharts = {};

function overallScore(st, isBeauty) {
  return isBeauty
    ? (st.beautySales||0)/10000 + (st.avgBill||0)/200  + (st.rebookPct||0)
    : (st.hairSalesNet||0)/10000 + (st.avgBill||0)/650 + (st.rebookPct||0);
}
function getTop3(staff, metricKey, isBeauty, limit) {
  limit = limit || 3;
  return [...staff].sort((a,b) => {
    if (metricKey === 'overall') return overallScore(b,isBeauty) - overallScore(a,isBeauty);
    let ka = metricKey;
    if (isBeauty && metricKey === 'hairSalesNet') ka = 'beautySales';
    return (b[ka]||0) - (a[ka]||0);
  }).slice(0, limit);
}

function aggByBranchT() {
  const result = {};
  ACTIVE_BRANCHES.forEach(code => {
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
  });
  return result;
}

function renderTeam() {
  const filtered = getFilteredData();
  const teamContent = document.getElementById('teamContent');
  if (!filtered.length) {
    Object.values(teamCharts).forEach(c => { try { c.destroy(); } catch(e) {} });
    teamCharts = {};
    teamContent.innerHTML = '<div class="empty">No data for this selection.</div>';
    return;
  }
  const datasets = filtered.map(d => d.data);
  const d = aggData(datasets);
  if (!d) return; 

  Object.values(teamCharts).forEach(c => { try { c.destroy(); } catch(e) {} });
  teamCharts = {};

  const dark = isDark();
  const ttStyle = { backgroundColor:dark?'#2D2E37':'#fff', titleColor:dark?'#FAF8F3':'#5C5557', bodyColor:dark?'rgba(250,248,243,.7)':'#9a8a87', borderColor:dark?'rgba(250,248,243,.1)':'#e8d5cc', borderWidth:1 };
  const gc = dark ? 'rgba(250,248,243,0.06)' : 'rgba(92,85,87,0.07)';
  const tc = dark ? 'rgba(250,248,243,0.45)' : '#9a8a87';
  const byBranchT = aggByBranchT();
  const branchLabel = sel.branch.includes('all') ? 'All Branches' : sel.branch.map(b => BRANCH_INFO[b]?.name||b).join(', ');

  const activeBranchesT = sel.branch.includes('all') ? ACTIVE_BRANCHES : sel.branch;
  const allHairWithBranch   = [];
  const allBeautyWithBranch = [];
  activeBranchesT.forEach(code => {
    const bd = byBranchT[code]; if (!bd) return;
    bd.hairStaff.forEach(st   => allHairWithBranch.push({   ...st, branchCode:code, branchName:BRANCH_INFO[code].name, branchColor:BRANCH_INFO[code].color }));
    bd.beautyStaff.forEach(st => allBeautyWithBranch.push({ ...st, branchCode:code, branchName:BRANCH_INFO[code].name, branchColor:BRANCH_INFO[code].color, isBeauty:true }));
  });

  // build cross-branch all-time stylist map for comparator
  const cmpBranchMap = {};
  ACTIVE_BRANCHES.forEach(code => {
    const allRows = allData.filter(d => d.branch === code);
    const bdAll   = aggData(allRows.map(d => d.data));
    if (!bdAll) return;
    const all = [
      ...bdAll.hairStaff.map(s   => ({ ...s, isBeauty:false, branchCode:code, branchName:BRANCH_INFO[code].name, branchColor:BRANCH_INFO[code].color })),
      ...bdAll.beautyStaff.map(s => ({ ...s, isBeauty:true,  branchCode:code, branchName:BRANCH_INFO[code].name, branchColor:BRANCH_INFO[code].color })),
    ];
    if (all.length) cmpBranchMap[code] = all;
  });

  const teamRvHBSvc    = d.summary.netTake - (d.summary.hairRetail||0);
  const teamRvHBTxPct  = teamRvHBSvc ? ((d.summary.treatmentSales||0) / teamRvHBSvc * 100) : 0;
  const teamRvHBRetPct = teamRvHBSvc ? ((d.summary.hairRetail||0) / teamRvHBSvc * 100) : 0;
  const teamStatusText = computeStatusStatement(d.summary, branchLabel, computeHeroPeriodPhrase(dateFrom, dateTo), teamRvHBTxPct, teamRvHBRetPct);

  teamContent.innerHTML = `

<div class="dash-hero-status" style="margin:2px 0 18px;font-size:14px">${escapeHtml(teamStatusText)}</div>

<!-- SECTION 1 — GLOBAL LEADERBOARD -->
<div class="section-label" style="display:flex;align-items:center;gap:7px;margin-top:16px;margin-bottom:8px">
  <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#FFD4D9;flex-shrink:0"></span>
  ${branchLabel} · Top Stylists Overall (Cross-Branch)
</div>

<div class="card" style="padding:0;overflow:hidden;margin-bottom:12px">
  <div style="display:flex;gap:0;border-bottom:1px solid var(--border)">
    <button id="glbTabHair"   onclick="switchGlobalLeaderboard('hair')"   style="padding:10px 20px;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;cursor:pointer;background:var(--accent);color:var(--accent-fg);border:none;font-family:'DM Sans',sans-serif;font-weight:700;transition:.2s;white-space:nowrap">Hair Stylists</button>
    <button id="glbTabBeauty" onclick="switchGlobalLeaderboard('beauty')" style="padding:10px 20px;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;cursor:pointer;background:transparent;color:var(--muted);border:none;font-family:'DM Sans',sans-serif;font-weight:500;transition:.2s;white-space:nowrap">Beauty Team</button>
    <div style="flex:1;display:flex;align-items:center;gap:6px;padding:0 16px;flex-wrap:nowrap;overflow-x:auto" id="glbMetricPills">
      ${TOP3_METRICS.map((m,i) => `<button class="f-pill${i===0?' active':''}" data-m="${m.key}" onclick="switchGlobalMetric(this,'${m.key}')" style="white-space:nowrap;flex-shrink:0">${m.label}</button>`).join('')}
    </div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 380px;min-height:320px">
    <div id="globalLeaderboardBody" style="border-right:1px solid var(--border);overflow-y:auto;max-height:420px"></div>
    <div id="glbRadarPanel" style="padding:16px;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:8px;overflow-y:auto;max-height:420px">
      <div style="width:100%;flex-shrink:0;border-bottom:1px solid var(--border);padding-bottom:8px;margin-bottom:4px">
        <div style="font-size:9px;letter-spacing:0.16em;text-transform:uppercase;color:var(--muted);font-weight:700">Stylist / Beautician Performance</div>
        <div style="font-size:8px;color:var(--muted2);margin-top:2px;letter-spacing:0.06em">Radial Chart · Click a row to load</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;text-align:center;color:var(--muted2);font-size:11px;line-height:1.6">
        <div style="font-size:28px;margin-bottom:6px">◎</div>
        Click any stylist row<br>to view their<br>performance radar
        <div style="margin-top:10px;font-size:10px;letter-spacing:0.06em;text-transform:uppercase;color:var(--muted2);opacity:0.7">← Click any row</div>
      </div>
    </div>
  </div>
</div>

<!-- SECTION 2 — CUSTOM COMPARATOR -->
<div class="section-label" style="display:flex;align-items:center;gap:7px;margin-top:20px;margin-bottom:8px">
  <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#99F6E4;flex-shrink:0"></span>
  Custom Stylist / Beautician Comparison
  <span style="font-size:10px;color:var(--muted);font-weight:400;margin-left:4px">Compare up to 3 stylists across branches</span>
</div>

<div class="card" style="margin-bottom:12px">
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:14px" id="cmpSlots">
    ${[1,2,3].map(n => `
    <div style="border:1px dashed var(--border);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px;background:var(--surface2)" id="cmpSlot${n}">
      <div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted)">Stylist ${n}</div>
      <select id="cmpBranch${n}" onchange="onCmpBranchChange(${n})" style="width:100%;padding:6px 10px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:12px;font-family:'DM Sans',sans-serif">
        <option value="">— Branch —</option>
        ${ACTIVE_BRANCHES.map(k => `<option value="${k}">${BRANCH_INFO[k].name}</option>`).join('')}
      </select>
      <select id="cmpName${n}" onchange="onCmpNameChange()" style="width:100%;padding:6px 10px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:12px;font-family:'DM Sans',sans-serif" disabled>
        <option value="">— Select stylist —</option>
      </select>
      <div id="cmpSlotTag${n}" style="font-size:11px;color:var(--muted2);min-height:14px"></div>
    </div>`).join('')}
  </div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:4px" id="cmpRadarSlots">
    ${[1,2,3].map(n => `
    <div id="cmpRadarWrap${n}" style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:220px;border:1px dashed var(--border);border-radius:10px;background:var(--surface2)">
      <div style="text-align:center;color:var(--muted2);font-size:11px;line-height:1.8;padding:16px">
        <div style="font-size:24px;margin-bottom:6px;opacity:0.4">◎</div>
        Select a stylist above<br>to view radar
      </div>
    </div>`).join('')}
  </div>
</div>

<!-- SECTION 3 — STYLIST TABLE -->
<div class="section-label" style="display:flex;align-items:center;gap:7px;margin-top:20px;margin-bottom:8px">
  <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#EEF3C7;flex-shrink:0"></span>
  ${branchLabel} · Stylist / Beautician: Supporting Metrics
</div>
<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:8px 14px;border-radius:8px;background:var(--surface2);border:1px solid var(--border);font-size:11px;color:var(--muted)">
  <span style="font-size:16px;flex-shrink:0;opacity:0.7">→</span>
  <span>Scroll right to see all columns &mdash; <strong style="color:var(--text)">Revenue · Clients · Retention · Operations</strong> metrics are displayed across the full table width.</span>
</div>
<div class="card">
  <div class="tabs">
    <button class="tab active" onclick="switchTeamTab(this,'hair')">Hair Stylists</button>
    <button class="tab"        onclick="switchTeamTab(this,'beauty')">Beauty Team</button>
  </div>
  <div id="tTabHair"   style="overflow-x:auto"></div>
  <div id="tTabBeauty" style="display:none;overflow-x:auto"></div>
</div>
  `;

  // ── GLOBAL LEADERBOARD logic ──
  let glbTeam = 'hair', glbMetric = 'overall', glbSelectedRow = null;

  function renderGlobalLeaderboard() {
    const staff  = glbTeam === 'hair' ? allHairWithBranch : allBeautyWithBranch;
    const sorted = [...staff].sort((a,b) => {
      if (glbMetric === 'overall') return overallScore(b,b.isBeauty) - overallScore(a,a.isBeauty);
      let ka = glbMetric;
      if (a.isBeauty && ka === 'hairSalesNet') ka = 'beautySales';
      return (b[ka]||0) - (a[ka]||0);
    });
    const body = document.getElementById('globalLeaderboardBody');
    if (!sorted.length) { body.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted);font-size:12px">No data available.</div>'; return; }
    const maxVal = Math.max(...sorted.map(st => {
      if (glbMetric === 'overall') return overallScore(st, st.isBeauty);
      const k = (st.isBeauty && glbMetric === 'hairSalesNet') ? 'beautySales' : glbMetric;
      return st[k]||0;
    }), 0.001);

    body.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead style="position:sticky;top:0;z-index:2;background:var(--surface)"><tr>
        <th style="padding:7px 10px;text-align:left;color:var(--muted);font-size:10px;letter-spacing:0.1em;font-weight:500;border-bottom:1px solid var(--border);width:36px">#</th>
        <th style="padding:7px 10px;text-align:left;color:var(--muted);font-size:10px;letter-spacing:0.1em;font-weight:500;border-bottom:1px solid var(--border)">Branch</th>
        <th style="padding:7px 10px;text-align:left;color:var(--muted);font-size:10px;letter-spacing:0.1em;font-weight:500;border-bottom:1px solid var(--border)">Stylist</th>
        <th style="padding:7px 10px;text-align:right;color:var(--muted);font-size:10px;letter-spacing:0.1em;font-weight:500;border-bottom:1px solid var(--border)">Value</th>
        <th style="padding:7px 10px 7px 6px;border-bottom:1px solid var(--border);width:100px"></th>
        <th style="padding:7px 10px;border-bottom:1px solid var(--border);width:28px"></th>
      </tr></thead>
      <tbody>${sorted.map((st,i) => {
        let valRaw = glbMetric==='overall' ? overallScore(st,st.isBeauty) : ((st.isBeauty&&glbMetric==='hairSalesNet')?st.beautySales||0:st[glbMetric]||0);
        let valFmt = glbMetric==='rebookPct'||glbMetric==='ncrPct' ? fmtPct(valRaw)
          : glbMetric==='total'   ? Math.round(valRaw).toLocaleString()
          : glbMetric==='overall' ? valRaw.toFixed(2)
          : fmtAED(valRaw);
        const barPct  = maxVal ? Math.min(valRaw/maxVal*100, 100) : 0;
        const medal   = i < 3 ? ['🥇','🥈','🥉'][i] : '';
        const stData  = JSON.stringify({ name:st.name, color:st.color, branchName:st.branchName, branchColor:st.branchColor, hairSalesNet:st.hairSalesNet||0, beautySales:st.beautySales||0, avgBill:st.avgBill||0, total:st.total||0, rebookPct:st.rebookPct||0, ncrPct:st.ncrPct||0, isBeauty:!!st.isBeauty });
        return `<tr class="glb-row" data-idx="${i}" style="cursor:pointer;transition:background .12s,border-left .12s;border-left:3px solid transparent"
          onmouseover="this.style.background='var(--surface2)'" onmouseout="if(glbSelectedRow!==this){this.style.background='';}"
          onclick="selectGlbRow(this)" data-st='${stData}'>
          <td style="padding:7px 10px;color:var(--muted2);font-size:11px">${medal||i+1}</td>
          <td style="padding:7px 10px">
            <span style="display:inline-flex;align-items:center;gap:5px">
              <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${st.branchColor};flex-shrink:0"></span>
              <span style="font-size:11px;color:var(--muted)">${st.branchName}</span>
            </span>
          </td>
          <td style="padding:7px 10px">
            <span style="display:inline-flex;align-items:center;gap:7px">
              <span style="width:22px;height:22px;border-radius:50%;background:${st.color};display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#2D2E37;flex-shrink:0">${initials(st.name)}</span>
              <span style="font-size:12px;font-weight:600;color:var(--text)">${escapeHtml(st.name)}</span>
            </span>
          </td>
          <td style="padding:7px 10px;text-align:right;font-size:12px;font-weight:600;color:var(--text);white-space:nowrap">${valFmt}</td>
          <td style="padding:5px 10px 5px 6px">
            <div style="height:5px;border-radius:3px;background:var(--border);overflow:hidden">
              <div style="height:100%;width:${barPct}%;background:${st.color};border-radius:3px"></div>
            </div>
          </td>
          <td style="padding:7px 8px;text-align:center;font-size:13px;color:var(--muted2)" title="View radar">◎</td>
        </tr>`;
      }).join('')}</tbody></table>
      ${sorted.length>10?`<div style="padding:8px 12px;border-top:1px solid var(--border);font-size:10px;color:var(--muted2);text-align:center;letter-spacing:0.06em">Showing ${sorted.length} stylists · scroll to see all ↑↓</div>`:''}`;

    glbSelectedRow = null;
    document.getElementById('glbRadarPanel').innerHTML = `
      <div style="width:100%;flex-shrink:0;border-bottom:1px solid var(--border);padding-bottom:8px;margin-bottom:4px">
        <div style="font-size:9px;letter-spacing:0.16em;text-transform:uppercase;color:var(--muted);font-weight:700">Stylist / Beautician Performance</div>
        <div style="font-size:8px;color:var(--muted2);margin-top:2px;letter-spacing:0.06em">Radial Chart · Click a row to load</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;text-align:center;color:var(--muted2);font-size:11px;line-height:1.8">
        <div style="font-size:28px;margin-bottom:6px;opacity:0.5">◎</div>
        Click any stylist row<br>to view their<br>performance radar
        <div style="margin-top:10px;font-size:10px;letter-spacing:0.06em;text-transform:uppercase;color:var(--muted2);opacity:0.7">← Click any row</div>
      </div>`;
    if (teamCharts.radar) { try { teamCharts.radar.destroy(); } catch(e) {} teamCharts.radar = null; }
  }

  window.selectGlbRow = function(row) {
    if (glbSelectedRow) { glbSelectedRow.style.background=''; glbSelectedRow.style.borderLeft='3px solid transparent'; }
    glbSelectedRow = row;
    row.style.background = 'var(--surface2)';
    const st = JSON.parse(row.dataset.st);
    row.style.borderLeft = `3px solid ${st.color}`;
    showRadarInPanel(st);
  };
  window.openStylistRadar = function(el) { try { const st=JSON.parse(el.dataset.st); showRadarInPanel(st); } catch(e) {} };
  window.closeRadarModal   = function() {};

  function showRadarInPanel(st) {
    const panel   = document.getElementById('glbRadarPanel');
    const accent  = st.color || '#C4B5FD';
    const revenue = st.isBeauty ? (st.beautySales||0) : (st.hairSalesNet||0);
    const refPool = st.isBeauty ? allBeautyWithBranch : allHairWithBranch;
    const maxRev     = Math.max(...refPool.map(s => s.isBeauty?(s.beautySales||0):(s.hairSalesNet||0)), 1);
    const maxClients = Math.max(...refPool.map(s => s.total||0), 1);
    const maxBill    = Math.max(...refPool.map(s => s.avgBill||0), 1);
    const maxNcr     = Math.max(...refPool.map(s => s.ncrPct||0), 0.1);
    const scores = {
      Revenue:    Math.round(revenue/(maxRev)*100),
      'Avg Bill': Math.round((st.avgBill||0)/maxBill*100),
      Clients:    Math.round((st.total||0)/maxClients*100),
      'Rebook %': Math.min(Math.round((st.rebookPct||0)/100*100), 100),
      'NCR %':    Math.min(Math.round((st.ncrPct||0)/maxNcr*100), 100),
    };
    const labels = Object.keys(scores);
    const vals   = Object.values(scores);
    const goals  = [
      { label:'Net Revenue',   val:fmtAED(revenue),                goal: st.isBeauty?null:'AED 650/client', score:scores.Revenue       },
      { label:'Avg Bill',      val:fmtAED(st.avgBill),             goal: st.isBeauty?'AED 200':'AED 650',   score:scores['Avg Bill']   },
      { label:'Total Clients', val:(st.total||0).toLocaleString(), goal:'—',                                score:scores.Clients       },
      { label:'Rebooking %',   val:fmtPct(st.rebookPct),          goal: st.isBeauty?'≥ 40%':'≥ 50%',       score:scores['Rebook %']   },
      { label:'NCR %',         val:fmtPct(st.ncrPct||0),          goal:'≥ 20%',                            score:scores['NCR %']      },
    ];
    panel.innerHTML = `
      <div style="width:100%;flex-shrink:0;border-bottom:1px solid var(--border);padding-bottom:8px;margin-bottom:8px">
        <div style="font-size:9px;letter-spacing:0.16em;text-transform:uppercase;color:var(--muted);font-weight:700">Stylist / Beautician Performance</div>
      </div>
      <div style="width:100%;display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-shrink:0">
        <div style="width:28px;height:28px;border-radius:50%;background:${accent};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#2D2E37;flex-shrink:0">${initials(st.name)}</div>
        <div>
          <div style="font-family:'Cormorant Garamond',serif;font-size:16px;font-weight:600;color:var(--text);line-height:1">${escapeHtml(st.name)}</div>
          <div style="font-size:9px;color:var(--muted);letter-spacing:0.1em;text-transform:uppercase;margin-top:1px">${st.branchName||''}${st.isBeauty?' · Beauty':' · Hair'}</div>
        </div>
      </div>
      <div style="width:100%;display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-bottom:6px;flex-shrink:0">
        ${goals.slice(0,3).map(g=>`
        <div style="background:var(--surface2);border-radius:6px;padding:5px 6px;border:1px solid var(--border);text-align:center">
          <div style="font-size:8px;letter-spacing:0.08em;text-transform:uppercase;color:var(--muted);margin-bottom:2px">${g.label}</div>
          <div style="font-size:11px;font-weight:700;color:var(--text)">${g.val}</div>
          ${g.goal?`<div style="font-size:8px;color:var(--muted2);margin-top:1px">Goal: ${g.goal}</div>`:''}
          <div style="font-size:8px;color:${accent};margin-top:1px">${g.score}/100</div>
        </div>`).join('')}
      </div>
      <div style="width:100%;display:grid;grid-template-columns:repeat(2,1fr);gap:4px;margin-bottom:8px;flex-shrink:0">
        ${goals.slice(3).map(g=>`
        <div style="background:var(--surface2);border-radius:6px;padding:5px 6px;border:1px solid var(--border);text-align:center">
          <div style="font-size:8px;letter-spacing:0.08em;text-transform:uppercase;color:var(--muted);margin-bottom:2px">${g.label}</div>
          <div style="font-size:11px;font-weight:700;color:var(--text)">${g.val}</div>
          ${g.goal?`<div style="font-size:8px;color:var(--muted2);margin-top:1px">Goal: ${g.goal}</div>`:''}
          <div style="font-size:8px;color:${accent};margin-top:1px">${g.score}/100</div>
        </div>`).join('')}
      </div>
      <div style="position:relative;width:100%;height:200px;flex-shrink:0"><canvas id="glbRadarCanvas"></canvas></div>`;

    if (teamCharts.radar) { try { teamCharts.radar.destroy(); } catch(e) {} teamCharts.radar = null; }
    const ctx = document.getElementById('glbRadarCanvas').getContext('2d');
    teamCharts.radar = new Chart(ctx, {
      type: 'radar',
      data: { labels, datasets:[{ label:st.name, data:vals, backgroundColor:accent+'33', borderColor:accent, borderWidth:2, pointBackgroundColor:accent, pointRadius:4 }] },
      options: { responsive:true, maintainAspectRatio:false, animation:{duration:400},
        scales:{ r:{ min:0, max:100, ticks:{display:false}, grid:{color:dark?'rgba(250,248,243,0.1)':'rgba(92,85,87,0.1)'}, angleLines:{color:dark?'rgba(250,248,243,0.1)':'rgba(92,85,87,0.1)'}, pointLabels:{color:tc,font:{family:'DM Sans',size:10}} }},
        plugins:{ legend:{display:false}, tooltip:{...ttStyle,callbacks:{label:c=>` ${c.raw}/100`}} }
      }
    });
  }

  window.switchGlobalLeaderboard = function(team) {
    glbTeam = team;
    const activeStyle  = 'padding:10px 20px;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;cursor:pointer;background:var(--accent);color:var(--accent-fg);border:none;font-family:\'DM Sans\',sans-serif;font-weight:700;transition:.2s;white-space:nowrap';
    const inactiveStyle= 'padding:10px 20px;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;cursor:pointer;background:transparent;color:var(--muted);border:none;font-family:\'DM Sans\',sans-serif;font-weight:500;transition:.2s;white-space:nowrap';
    document.getElementById('glbTabHair').style.cssText   = team==='hair'  ? activeStyle : inactiveStyle;
    document.getElementById('glbTabBeauty').style.cssText = team==='beauty'? activeStyle : inactiveStyle;
    renderGlobalLeaderboard();
  };
  window.switchGlobalMetric = function(btn, metric) {
    glbMetric = metric;
    document.querySelectorAll('#glbMetricPills .f-pill').forEach(p => p.classList.toggle('active', p === btn));
    renderGlobalLeaderboard();
  };
  renderGlobalLeaderboard();

  // ── COMPARATOR ──
  const cmpRadarCharts = {};

  window.onCmpBranchChange = function(n) {
    const branchSel = document.getElementById('cmpBranch' + n);
    const nameSel   = document.getElementById('cmpName'   + n);
    const tag       = document.getElementById('cmpSlotTag'+ n);
    const code = branchSel.value;
    nameSel.innerHTML = '<option value="">— Select stylist —</option>';
    nameSel.disabled  = !code;
    tag.textContent   = '';
    if (!code) return;
    (cmpBranchMap[code]||[]).forEach(st => {
      const opt = document.createElement('option');
      opt.value = st.name;
      opt.textContent = st.name + (st.isBeauty?' (Beauty)':'');
      opt.dataset.st  = JSON.stringify(st);
      nameSel.appendChild(opt);
    });
    onCmpNameChange();
  };

  window.onCmpNameChange = function() {
    for (let n = 1; n <= 3; n++) {
      const tag     = document.getElementById('cmpSlotTag' + n);
      const nameSel = document.getElementById('cmpName'    + n);
      const selOpt  = nameSel.options[nameSel.selectedIndex];
      if (selOpt && selOpt.dataset.st) {
        try {
          const st      = JSON.parse(selOpt.dataset.st);
          const revenue = st.isBeauty ? (st.beautySales||0) : (st.hairSalesNet||0);
          tag.innerHTML = `<span style="display:inline-flex;align-items:center;gap:5px"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${st.color||'#ccc'}"></span><span style="font-size:10px;color:var(--muted)">${st.isBeauty?'Beauty':'Hair'} · ${fmtAED(revenue)}</span></span>`;
          buildSlotRadar(n, st);
        } catch(e) { tag.textContent=''; clearSlotRadar(n); }
      } else { tag.textContent=''; clearSlotRadar(n); }
    }
  };

  function clearSlotRadar(n) {
    if (cmpRadarCharts[n]) { try { cmpRadarCharts[n].destroy(); } catch(e) {} cmpRadarCharts[n]=null; }
    const wrap = document.getElementById('cmpRadarWrap' + n);
    if (wrap) wrap.innerHTML = `<div style="text-align:center;color:var(--muted2);font-size:11px;line-height:1.8;padding:16px"><div style="font-size:24px;margin-bottom:6px;opacity:0.4">◎</div>Select a stylist above<br>to view radar</div>`;
  }

  function buildSlotRadar(n, st) {
    const accent  = st.color || '#C4B5FD';
    const refPool = st.isBeauty ? allBeautyWithBranch : allHairWithBranch;
    const maxRev     = Math.max(...refPool.map(s=>s.isBeauty?(s.beautySales||0):(s.hairSalesNet||0)),1);
    const maxClients = Math.max(...refPool.map(s=>s.total||0),1);
    const maxBill    = Math.max(...refPool.map(s=>s.avgBill||0),1);
    const maxNcr     = Math.max(...refPool.map(s=>s.ncrPct||0),0.1);
    const revenue = st.isBeauty ? (st.beautySales||0) : (st.hairSalesNet||0);
    const scores  = {
      Revenue:    Math.round(revenue/maxRev*100),
      'Avg Bill': Math.round((st.avgBill||0)/maxBill*100),
      Clients:    Math.round((st.total||0)/maxClients*100),
      'Rebook %': Math.min(Math.round((st.rebookPct||0)/100*100),100),
      'NCR %':    Math.min(Math.round((st.ncrPct||0)/maxNcr*100),100),
    };
    const labels = Object.keys(scores), vals = Object.values(scores);
    const wrap = document.getElementById('cmpRadarWrap' + n);
    wrap.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;padding:12px 14px 0;width:100%">
        <div style="width:26px;height:26px;border-radius:50%;background:${accent};display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#2D2E37;flex-shrink:0">${initials(st.name)}</div>
        <div>
          <div style="font-family:'Cormorant Garamond',serif;font-size:14px;font-weight:600;color:var(--text);line-height:1">${escapeHtml(st.name)}</div>
          <div style="font-size:9px;color:var(--muted);letter-spacing:0.08em;text-transform:uppercase;margin-top:1px">${st.isBeauty?'Beauty':'Hair'}</div>
        </div>
      </div>
      <div style="position:relative;width:100%;height:200px;padding:0 8px;box-sizing:border-box"><canvas id="cmpRadarCanvas${n}"></canvas></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:0 12px 12px;width:100%;box-sizing:border-box">
        ${[{label:'Revenue',val:fmtAED(revenue)},{label:'Avg Bill',val:fmtAED(st.avgBill)},{label:'Clients',val:(st.total||0).toLocaleString()},{label:'Rebook %',val:fmtPct(st.rebookPct)},{label:'NCR %',val:fmtPct(st.ncrPct||0)}]
          .map(x=>`<div style="background:var(--surface);border-radius:6px;padding:5px 7px;border:1px solid var(--border)"><div style="font-size:8px;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted);margin-bottom:1px">${x.label}</div><div style="font-size:11px;font-weight:700;color:var(--text)">${x.val}</div></div>`).join('')}
      </div>`;
    if (cmpRadarCharts[n]) { try { cmpRadarCharts[n].destroy(); } catch(e) {} }
    const ctx = document.getElementById('cmpRadarCanvas' + n).getContext('2d');
    cmpRadarCharts[n] = new Chart(ctx, {
      type: 'radar',
      data: { labels, datasets:[{label:st.name,data:vals,backgroundColor:accent+'33',borderColor:accent,borderWidth:2,pointBackgroundColor:accent,pointRadius:3}] },
      options: { responsive:true, maintainAspectRatio:false, animation:{duration:400},
        scales:{r:{min:0,max:100,ticks:{display:false},grid:{color:dark?'rgba(250,248,243,0.1)':'rgba(92,85,87,0.1)'},angleLines:{color:dark?'rgba(250,248,243,0.1)':'rgba(92,85,87,0.1)'},pointLabels:{color:tc,font:{family:'DM Sans',size:9}}}},
        plugins:{legend:{display:false},tooltip:{...ttStyle,callbacks:{label:c=>` ${c.raw}/100`}}}
      }
    });
  }

  // ── TABLES ──
  let hairSortT   = { col:'hairSalesNet', dir:'desc' };
  let beautySortT = { col:'beautySales',  dir:'desc' };

  function getStBranch(stName, isBeauty) {
    const pool  = isBeauty ? allBeautyWithBranch : allHairWithBranch;
    const found = pool.find(s => s.name === stName);
    return found ? { name:found.branchName, color:found.branchColor } : { name:'—', color:'#ccc' };
  }

  function renderTeamHairTable() {
    const sorted = [...d.hairStaff].sort((a,b) => hairSortT.dir==='asc' ? (a[hairSortT.col]||0)-(b[hairSortT.col]||0) : (b[hairSortT.col]||0)-(a[hairSortT.col]||0));

    // Column order matches Kate's Staff Performance (Hair) spec, 2026-08-02.
    const headerHTML = `
      <colgroup><col style="width:30px"><col style="width:90px"><col style="width:130px"><col><col><col><col><col><col><col><col><col><col><col><col><col><col><col><col></colgroup>
      <thead>
        <tr style="background:var(--surface2)">
          <th colspan="3" style="padding:6px 10px 4px;border-bottom:1px solid var(--border)"></th>
          <th colspan="4" style="padding:6px 10px 4px;font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:#FFD4D9;font-weight:700;border-bottom:1px solid var(--border);border-left:2px solid #FFD4D944">BENCHMARKS</th>
          <th colspan="4" style="padding:6px 10px 4px;font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:#EEF3C7;font-weight:700;border-bottom:1px solid var(--border);border-left:2px solid #EEF3C744">REVENUE</th>
          <th colspan="4" style="padding:6px 10px 4px;font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:#C4B5FD;font-weight:700;border-bottom:1px solid var(--border);border-left:2px solid #C4B5FD44">CLIENTS</th>
          <th colspan="2" style="padding:6px 10px 4px;font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:#99F6E4;font-weight:700;border-bottom:1px solid var(--border);border-left:2px solid #99F6E444">BREAKDOWN</th>
          <th colspan="2" style="padding:6px 10px 4px;font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:var(--muted);font-weight:700;border-bottom:1px solid var(--border);border-left:2px solid var(--border)">OPERATIONS</th>
        </tr>
        <tr>
          <th style="width:30px">#</th>
          <th>Branch</th>
          <th class="sortable${hairSortT.col==='name'?' sort-'+hairSortT.dir:''}" onclick="sortTeamHair('name')">Stylist</th>
          <th class="sortable${hairSortT.col==='rebookPct'?' sort-'+hairSortT.dir:''}"      onclick="sortTeamHair('rebookPct')" style="border-left:2px solid #FFD4D944">Rebooking %</th>
          <th class="sortable${hairSortT.col==='treatmentPct'?' sort-'+hairSortT.dir:''}"   onclick="sortTeamHair('treatmentPct')">Treatment %</th>
          <th class="sortable${hairSortT.col==='retailPct'?' sort-'+hairSortT.dir:''}"      onclick="sortTeamHair('retailPct')">Retail %</th>
          <th class="sortable${hairSortT.col==='avgBill'?' sort-'+hairSortT.dir:''}"        onclick="sortTeamHair('avgBill')">Avg Bill (AED)</th>
          <th class="sortable${hairSortT.col==='hairServicesExcl'?' sort-'+hairSortT.dir:''}" onclick="sortTeamHair('hairServicesExcl')" style="border-left:2px solid #EEF3C744">Hair Services (excl. treatments)</th>
          <th class="sortable${hairSortT.col==='treatments'?' sort-'+hairSortT.dir:''}"     onclick="sortTeamHair('treatments')">Treatments Revenue <span style="font-size:8px;font-weight:700;color:var(--muted);border:1px solid var(--border);border-radius:8px;padding:0px 4px">LEDGER</span></th>
          <th class="sortable${hairSortT.col==='retail'?' sort-'+hairSortT.dir:''}"         onclick="sortTeamHair('retail')">Retail Revenue</th>
          <th class="sortable${hairSortT.col==='netSalonTake'?' sort-'+hairSortT.dir:''}"   onclick="sortTeamHair('netSalonTake')">Net Salon Take</th>
          <th class="sortable${hairSortT.col==='rebooked'?' sort-'+hairSortT.dir:''}"       onclick="sortTeamHair('rebooked')" style="border-left:2px solid #C4B5FD44">Rebooked Clients</th>
          <th class="sortable${hairSortT.col==='total'?' sort-'+hairSortT.dir:''}"          onclick="sortTeamHair('total')">Total Clients</th>
          <th class="sortable${hairSortT.col==='newC'?' sort-'+hairSortT.dir:''}"           onclick="sortTeamHair('newC')">New Clients</th>
          <th class="sortable${hairSortT.col==='newClientReq'?' sort-'+hairSortT.dir:''}"   onclick="sortTeamHair('newClientReq')">NCR</th>
          <th class="sortable${hairSortT.col==='salon'?' sort-'+hairSortT.dir:''}"          onclick="sortTeamHair('salon')" style="border-left:2px solid #99F6E444">Salon Client</th>
          <th class="sortable${hairSortT.col==='req'?' sort-'+hairSortT.dir:''}"            onclick="sortTeamHair('req')">Request Client</th>
          <th style="border-left:2px solid var(--border)">Utilisation (Hours)</th>
          <th>Utilisation %</th>
        </tr>
      </thead>`;

    const rows = sorted.map((st,i) => {
      const br = getStBranch(st.name, false);
      return `<tr>
        <td style="color:var(--muted2);font-size:11px">${i+1}</td>
        <td><span style="display:inline-flex;align-items:center;gap:5px"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${br.color};flex-shrink:0"></span><span style="font-size:11px;color:var(--muted);white-space:nowrap">${br.name}</span></span></td>
        <td><span style="display:flex;align-items:center;gap:7px"><span style="width:22px;height:22px;border-radius:50%;background:${st.color};display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#2D2E37;flex-shrink:0">${initials(st.name)}</span><span style="font-size:12px;font-weight:600;color:var(--text)">${escapeHtml(st.name)}</span></span></td>
        <td style="border-left:2px solid #FFD4D922"><span class="badge ${sc(st.rebookPct,TARGETS.rebookPct)}">${fmtPct(st.rebookPct)}</span></td>
        <td><span class="badge ${sc(st.treatmentPct,TARGETS.treatmentPct)}">${fmtPct(st.treatmentPct)}</span></td>
        <td><span class="badge ${sc(st.retailPct,TARGETS.retailPct)}">${fmtPct(st.retailPct)}</span></td>
        <td><span class="badge ${sc(st.avgBill,TARGETS.hairAvgBill)}">${fmtAED(st.avgBill)}</span></td>
        <td style="border-left:2px solid #EEF3C722">${fmtAED(st.hairServicesExcl)}</td>
        <td>${fmtAED(st.treatments)}</td>
        <td>${fmtAED(st.retail)}</td>
        <td>${fmtAED(st.netSalonTake)}</td>
        <td style="border-left:2px solid #C4B5FD22">${st.rebooked||0}</td>
        <td>${st.total||0}</td>
        <td>${st.newC||0}</td>
        <td><span class="badge ${sc(st.ncrPct||0,20)}">${fmtPct(st.ncrPct||0)}</span></td>
        <td style="border-left:2px solid #99F6E422">${st.salon||0}</td>
        <td>${st.req||0}</td>
        <td style="border-left:2px solid var(--border2);color:var(--muted)">—</td>
        <td style="color:var(--muted)">—</td>
      </tr>`;
    }).join('');
    document.getElementById('tTabHair').innerHTML = `<table style="min-width:1350px">${headerHTML}<tbody>${rows}</tbody></table>`;
  }

  function renderTeamBeautyTable() {
    const sorted = [...d.beautyStaff].sort((a,b) => beautySortT.dir==='asc' ? (a[beautySortT.col]||0)-(b[beautySortT.col]||0) : (b[beautySortT.col]||0)-(a[beautySortT.col]||0));
    // Column order matches Kate's Staff Performance (Beauty) spec, 2026-08-02.
    const headerHTML = `
      <colgroup><col style="width:30px"><col style="width:90px"><col style="width:130px"><col><col><col><col><col><col><col><col><col><col><col><col><col><col></colgroup>
      <thead>
        <tr style="background:var(--surface2)">
          <th colspan="3" style="padding:6px 10px 4px;border-bottom:1px solid var(--border)"></th>
          <th colspan="3" style="padding:6px 10px 4px;font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:#FFD4D9;font-weight:700;border-bottom:1px solid var(--border);border-left:2px solid #FFD4D944">BENCHMARKS</th>
          <th colspan="3" style="padding:6px 10px 4px;font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:#EEF3C7;font-weight:700;border-bottom:1px solid var(--border);border-left:2px solid #EEF3C744">REVENUE</th>
          <th colspan="4" style="padding:6px 10px 4px;font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:#C4B5FD;font-weight:700;border-bottom:1px solid var(--border);border-left:2px solid #C4B5FD44">CLIENTS</th>
          <th colspan="2" style="padding:6px 10px 4px;font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:#99F6E4;font-weight:700;border-bottom:1px solid var(--border);border-left:2px solid #99F6E444">BREAKDOWN</th>
          <th colspan="2" style="padding:6px 10px 4px;font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:var(--muted);font-weight:700;border-bottom:1px solid var(--border);border-left:2px solid var(--border)">OPERATIONS</th>
        </tr>
        <tr>
          <th style="width:30px">#</th><th>Branch</th>
          <th class="sortable${beautySortT.col==='name'?' sort-'+beautySortT.dir:''}" onclick="sortTeamBeauty('name')">Therapist</th>
          <th class="sortable${beautySortT.col==='rebookPct'?' sort-'+beautySortT.dir:''}" onclick="sortTeamBeauty('rebookPct')" style="border-left:2px solid #FFD4D944">Rebooking %</th>
          <th class="sortable${beautySortT.col==='retailPct'?' sort-'+beautySortT.dir:''}"  onclick="sortTeamBeauty('retailPct')">Retail %</th>
          <th class="sortable${beautySortT.col==='avgBill'?' sort-'+beautySortT.dir:''}"    onclick="sortTeamBeauty('avgBill')">Avg Bill (AED)</th>
          <th class="sortable${beautySortT.col==='beautySales'?' sort-'+beautySortT.dir:''}" onclick="sortTeamBeauty('beautySales')" style="border-left:2px solid #EEF3C744">Services Revenue</th>
          <th class="sortable${beautySortT.col==='retail'?' sort-'+beautySortT.dir:''}"      onclick="sortTeamBeauty('retail')">Retail Revenue</th>
          <th class="sortable${beautySortT.col==='netSalonTake'?' sort-'+beautySortT.dir:''}" onclick="sortTeamBeauty('netSalonTake')">Total Net Take</th>
          <th class="sortable${beautySortT.col==='rebooked'?' sort-'+beautySortT.dir:''}"    onclick="sortTeamBeauty('rebooked')" style="border-left:2px solid #C4B5FD44">Rebooked Clients</th>
          <th class="sortable${beautySortT.col==='total'?' sort-'+beautySortT.dir:''}"       onclick="sortTeamBeauty('total')">Total Clients</th>
          <th class="sortable${beautySortT.col==='newC'?' sort-'+beautySortT.dir:''}"        onclick="sortTeamBeauty('newC')">New Clients</th>
          <th class="sortable${beautySortT.col==='newClientReq'?' sort-'+beautySortT.dir:''}" onclick="sortTeamBeauty('newClientReq')">NCR</th>
          <th class="sortable${beautySortT.col==='salon'?' sort-'+beautySortT.dir:''}"       onclick="sortTeamBeauty('salon')" style="border-left:2px solid #99F6E444">Salon Client</th>
          <th class="sortable${beautySortT.col==='req'?' sort-'+beautySortT.dir:''}"         onclick="sortTeamBeauty('req')">Request Client</th>
          <th style="border-left:2px solid var(--border)">Utilisation (Hours)</th>
          <th>Utilisation %</th>
        </tr>
      </thead>`;
    const rows = sorted.map((st,i) => {
      const br = getStBranch(st.name, true);
      return `<tr>
        <td style="color:var(--muted2);font-size:11px">${i+1}</td>
        <td><span style="display:inline-flex;align-items:center;gap:5px"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${br.color};flex-shrink:0"></span><span style="font-size:11px;color:var(--muted);white-space:nowrap">${br.name}</span></span></td>
        <td><span style="display:flex;align-items:center;gap:7px"><span style="width:22px;height:22px;border-radius:50%;background:${st.color};display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#2D2E37;flex-shrink:0">${initials(st.name)}</span><span style="font-size:12px;font-weight:600;color:var(--text)">${escapeHtml(st.name)}</span></span></td>
        <td style="border-left:2px solid #FFD4D922"><span class="badge ${sc(st.rebookPct,TARGETS.rebookPct)}">${fmtPct(st.rebookPct)}</span></td>
        <td><span class="badge ${sc(st.retailPct,TARGETS.retailPct)}">${fmtPct(st.retailPct)}</span></td>
        <td><span class="badge ${sc(st.avgBill,TARGETS.beautyAvgBill)}">${fmtAED(st.avgBill)}</span></td>
        <td style="border-left:2px solid #EEF3C722">${fmtAED(st.beautySales)}</td>
        <td>${fmtAED(st.retail)}</td>
        <td>${fmtAED(st.netSalonTake)}</td>
        <td style="border-left:2px solid #C4B5FD22">${st.rebooked||0}</td>
        <td>${st.total||0}</td>
        <td>${st.newC||0}</td>
        <td><span class="badge ${sc(st.ncrPct||0,20)}">${fmtPct(st.ncrPct||0)}</span></td>
        <td style="border-left:2px solid #99F6E422">${st.salon||0}</td>
        <td>${st.req||0}</td>
        <td style="border-left:2px solid var(--border2);color:var(--muted)">—</td>
        <td style="color:var(--muted)">—</td>
      </tr>`;
    }).join('');
    document.getElementById('tTabBeauty').innerHTML = `<table style="min-width:1250px">${headerHTML}<tbody>${rows}</tbody></table>`;
  }

  window.sortTeamHair = function(col) {
    hairSortT.dir = hairSortT.col === col ? (hairSortT.dir==='asc'?'desc':'asc') : 'desc';
    hairSortT.col = col;
    renderTeamHairTable();
  };

  window.sortTeamBeauty = function(col) {
    beautySortT.dir = beautySortT.col === col ? (beautySortT.dir==='asc'?'desc':'asc') : 'desc';
    beautySortT.col = col;
    renderTeamBeautyTable();
  };

  window.switchTeamTab = function(el, tab) {
    document.querySelectorAll('#teamContent .tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('tTabHair').style.display   = tab==='hair'   ? '' : 'none';
    document.getElementById('tTabBeauty').style.display = tab==='beauty' ? '' : 'none';
  };

  renderTeamHairTable();
  renderTeamBeautyTable();
}

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

function freshnessLine(label, info) {
  if (!info || !info.date) return `${label}: no syncs yet`;
  const synced = new Date(info.date + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today - synced) / 86400000);
  const color = diffDays <= 0 ? '#99F6E4' : diffDays <= 2 ? '#FFD4D9' : '#FF6B6B';
  const staleLabel = diffDays <= 0 ? 'Live' : diffDays === 1 ? '1 day ago' : `${diffDays} days ago`;
  const dateStr = synced.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
  const flag = info.complete ? '' : ` <span style="opacity:0.75" title="Missing: ${info.missing.map(b=>BRANCH_INFO[b]?.name||b).join(', ')}">(partial branches)</span>`;
  return `${label}: ${dateStr} &nbsp;<span style="color:${color};font-weight:600">(${staleLabel})</span>${flag}`;
}

function renderFreshnessBadge(ledgerInfo, phorestInfo) {
  const el = document.getElementById('lastUpdated');
  if (!el) return;
  el.innerHTML =
    freshnessLine('Ledger', ledgerInfo)
    + '<br>' + freshnessLine('Phorest', phorestInfo)
    + '<br><span style="font-size:10px;letter-spacing:0.04em;opacity:0.85">Gulf Standard Time +04:00</span>';
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

function initSvcView() {
  if (!svcDropsReady) {
    _buildBranchDrop('svc-branch', svcSel, onSvcFiltersChange);
    _buildBranchDrop('cli-branch', cliSel, onCliFiltersChange);
    svcDropsReady = true;
    _loadSvcYears();
  }
  loadAndRenderServices();
}

function initCliView() {
  if (!svcDropsReady) {
    _buildBranchDrop('svc-branch', svcSel, onSvcFiltersChange);
    _buildBranchDrop('cli-branch', cliSel, onCliFiltersChange);
    svcDropsReady = true;
    _loadSvcYears();
  }
  loadAndRenderClients();
}

function setSvcViewMode(mode) {
  svcViewMode = mode;
  document.getElementById('svc-toggle-branch')?.classList.toggle('active', mode === 'branch');
  document.getElementById('svc-toggle-combined')?.classList.toggle('active', mode === 'combined');
  loadAndRenderServices();
}

function onSvcFiltersChange() { loadAndRenderServices(); }
function onCliFiltersChange() { loadAndRenderClients(); }

async function loadAndRenderServices() {
  const content = document.getElementById('svc-content');
  if (!content) return;
  content.innerHTML = '<div class="loading">Loading...</div>';

  const year  = parseInt(document.getElementById('svc-year')?.value || '2026');
  const pFrom = document.getElementById('svc-date-from')?.value || `${year}-01-01`;
  const pTo   = document.getElementById('svc-date-to')?.value   || `${year}-12-31`;
  const branches = svcSel.branch[0] === 'all' ? ['KCA','SAA','MC','AQ'] : [...svcSel.branch];

  try {
    if (svcViewMode === 'combined') {
      const { data, error } = await sb.rpc('get_top_services', {
        p_year: year, p_branches: branches, p_from: pFrom, p_to: pTo, p_limit: 10
      });
      if (error) throw error;
      _renderSvcCombined(data || [], branches, year, pFrom, pTo);
    } else {
      const targetBranches = svcSel.branch[0] === 'all' ? ['KCA','SAA','MC','AQ'] : [...svcSel.branch];
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
    content.innerHTML = '<div class="empty">No service data found. Upload a Service Performance file first.</div>';
  }
}

function _fmtAed(n) {
  return (parseFloat(n) || 0).toLocaleString('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function _rankCls(i) { return i===0?'gold':i===1?'silver':i===2?'bronze':''; }

function _renderSvcCombined(rows, branches, year, pFrom, pTo) {
  const content = document.getElementById('svc-content');
  if (!rows.length) { content.innerHTML = '<div class="empty">No data for selected filters.</div>'; return; }
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

  const year  = parseInt(document.getElementById('cli-year')?.value || '2026');
  const pFrom = document.getElementById('cli-date-from')?.value || `${year}-01-01`;
  const pTo   = document.getElementById('cli-date-to')?.value   || `${year}-12-31`;
  const branches = cliSel.branch[0] === 'all' ? ['KCA','SAA','MC','AQ'] : [...cliSel.branch];

  try {
    const { data, error } = await sb.rpc('get_top_clients', {
      p_year: year, p_branches: branches, p_from: pFrom, p_to: pTo, p_limit: 25
    });
    if (error) throw error;
    _renderClients(data || [], branches, year, pFrom, pTo);
  } catch(e) {
    console.error(e);
    content.innerHTML = '<div class="empty">No client data found. Upload a Service Performance file first.</div>';
  }
}

function _renderClients(rows, branches, year, pFrom, pTo) {
  const content = document.getElementById('cli-content');
  if (!rows.length) { content.innerHTML = '<div class="empty">No data for selected filters.</div>'; return; }

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
