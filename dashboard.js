/* ============================================================
   TARA ROSE LADIES SALON — Dashboard Scripts
   dashboard.js
   ============================================================ */

// ── CONSTANTS & CONFIG ──────────────────────────────────────

const SUPA_URL = 'https://gvijxenafoowajqktqvd.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2aWp4ZW5hZm9vd2FqcWt0cXZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MTA1OTksImV4cCI6MjA5MTI4NjU5OX0.GL3YXupXOBGfN4FCyelbQWraUw12VJNJu-wUB3zR7Zw';
const sb = supabase.createClient(SUPA_URL, SUPA_KEY);

const TARGETS = { hairAvgBill: 650, beautyAvgBill: 200, treatmentPct: 20, retailPct: 12, rebookPct: 45 };

const BRANCH_INFO = {
  KCA: { name: 'Khalifa City', color: '#FFD4D9' },
  SAA: { name: 'Saadiyat',     color: '#C4B5FD' },
  MC:  { name: 'Motor City',   color: '#99F6E4' },
  AQ:  { name: 'AQ Ladies',    color: '#FF9B9B' },
  FRT: { name: 'Fratelli',     color: '#EEF3C7' },
};

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
const sectionState = { revenueRun: false, retentionRun: false, opsRun: false };

// funnel visibility toggles
const funnelFilter = { hair: true, beauty: true, req: true, salon: true, new: true, rebooked: true };
let revenueTab = 'hb'; // 'hair' | 'beauty' | 'hb'

// daily rows cache — set during daily-mode render, used by aggByBranch
let currentDailyRows = [];

// Services + Clients state
const svcSel = { branch: ['all'] };
const cliSel = { branch: ['all'] };
let svcViewMode = 'branch';
let svcDropsReady = false;


// ── FRATELLI TOGGLE ─────────────────────────────────────────

window.showFratelli = true;

function toggleFratelli() {
  window.showFratelli = !window.showFratelli;
  const btn = document.getElementById('fratelliToggleBtn');
  const dot = document.getElementById('fratelliToggleDot');
  if (btn) {
    btn.style.opacity       = window.showFratelli ? '1' : '0.4';
    btn.style.textDecoration= window.showFratelli ? 'none' : 'line-through';
  }
  if (dot) dot.style.background = window.showFratelli ? '#EEF3C7' : 'var(--muted)';
  renderDashboard();
}

function toggleFunnelFilter(key) {
  funnelFilter[key] = !funnelFilter[key];
  renderDashboard();
}

// ── THEME ───────────────────────────────────────────────────

function toggleTheme() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', dark ? 'light' : 'dark');
  document.getElementById('themeLbl').textContent = dark ? 'Light' : 'Dark';
  if (Object.keys(charts).length) renderDashboard();
}
const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';


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

window.ncrView = window.ncrView || 'hair';

function toggleNcrView(mode) {
  window.ncrView = mode;
  const labels = { hair: 'Hair NCR %', beauty: 'Beauty NCR %', both: 'Hair & Beauty NCR %' };
  const descs  = {
    hair:   'New Client Requests ÷ Total Clients (excl. rebooked)',
    beauty: 'Beauty NCRs ÷ Beauty Clients (excl. rebooked)',
    both:   'Hair + Beauty NCRs ÷ Total Clients (excl. rebooked)',
  };
  const labelEl = document.getElementById('ncrCardLabel');
  const descEl  = document.getElementById('ncrCardDesc');
  const valEl   = document.getElementById('ncrCardValue');
  if (labelEl) labelEl.textContent = labels[mode];
  if (descEl)  descEl.innerHTML = `<em>${descs[mode]}</em>`;
  // update displayed value from data attributes on the card
  const card = valEl && valEl.closest('.metric');
  if (card) {
    const hair   = parseFloat(card.dataset.hairNcr   || 0);
    const beauty = card.dataset.beautyNcr === 'null' ? null : parseFloat(card.dataset.beautyNcr || 0);
    const both   = parseFloat(card.dataset.bothNcr   || 0);
    if (valEl) valEl.textContent =
      mode === 'beauty' ? (beauty != null ? beauty.toFixed(2) + '%' : '—') :
      mode === 'both'   ? both.toFixed(2) + '%' :
      hair.toFixed(2) + '%';
  }
  // update button active states
  const isDark = document.body.classList.contains('dark') || document.documentElement.getAttribute('data-theme') === 'dark';
  const DEPT_COLORS = { hair: '#99F6E4', beauty: '#FFD4D9', both: '#C4B5FD' };
  const DEPT_TEXT_LIGHT = { hair: '#0A5244', beauty: '#8B3A42', both: '#5B4A8A' };
  ['hair','beauty','both'].forEach(m => {
    const btn = document.getElementById('ncrBtn-' + m);
    if (!btn) return;
    const active = m === mode;
    const col = DEPT_COLORS[m];
    btn.style.fontWeight  = active ? '700' : '400';
    btn.style.background  = active ? (isDark ? col + '40' : col + '55') : 'transparent';
    btn.style.borderColor = active ? col : (isDark ? 'rgba(250,248,243,0.15)' : 'rgba(92,85,87,0.2)');
    btn.style.color       = active ? (isDark ? col : DEPT_TEXT_LIGHT[m]) : (isDark ? 'rgba(250,248,243,0.45)' : '#9a8a87');
  });
}

function toggleAvgBillView(mode) {
  window.avgBillView = mode;
  const labels = { hair: 'Hair Avg Bill', beauty: 'Beauty Avg Bill', both: 'Total Avg Bill' };
  const descs  = {
    hair:   'Hair Revenue ÷ Total Clients (excl. rebooked)',
    beauty: 'Beauty Revenue ÷ Total Clients (excl. rebooked)',
    both:   'Total Revenue ÷ Total Clients (excl. rebooked)',
  };
  const labelEl = document.getElementById('avgBillCardLabel');
  const descEl  = document.getElementById('avgBillCardDesc');
  const valEl   = document.getElementById('avgBillCardValue');
  if (labelEl) labelEl.textContent = labels[mode];
  if (descEl)  descEl.innerHTML = `<em>${descs[mode]}</em>`;
  const card = valEl && valEl.closest('.metric');
  if (card) {
    const hair   = parseFloat(card.dataset.hairAvgBill   || 0);
    const beauty = card.dataset.beautyAvgBill === 'null' ? null : parseFloat(card.dataset.beautyAvgBill || 0);
    const both   = parseFloat(card.dataset.bothAvgBill   || 0);
    const val = mode === 'hair' ? hair : mode === 'beauty' ? beauty : both;
    if (valEl) valEl.textContent = val != null ? 'AED ' + val.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}) : '—';
  }
  const isDark = document.body.classList.contains('dark') || document.documentElement.getAttribute('data-theme') === 'dark';
  const DEPT_COLORS = { hair: '#99F6E4', beauty: '#FFD4D9', both: '#C4B5FD' };
  const DEPT_TEXT_LIGHT = { hair: '#0A5244', beauty: '#8B3A42', both: '#5B4A8A' };
  ['hair','beauty','both'].forEach(m => {
    const btn = document.getElementById('avgBillBtn-' + m);
    if (!btn) return;
    const active = m === mode;
    const col = DEPT_COLORS[m];
    btn.style.fontWeight  = active ? '700' : '400';
    btn.style.background  = active ? (isDark ? col + '40' : col + '55') : 'transparent';
    btn.style.borderColor = active ? col : (isDark ? 'rgba(250,248,243,0.15)' : 'rgba(92,85,87,0.2)');
    btn.style.color       = active ? (isDark ? col : DEPT_TEXT_LIGHT[m]) : (isDark ? 'rgba(250,248,243,0.45)' : '#9a8a87');
  });
}

function toggleRebookView(mode) {
  window.rebookView = mode;
  const labels = { hair: 'Hair Rebooking %', beauty: 'Beauty Rebooking %', both: 'Rebooking %' };
  const descs  = {
    hair:   'Hair rebooked ÷ Total Clients (excl. rebooked)',
    beauty: 'Beauty rebooked ÷ Total Clients (excl. rebooked)',
    both:   'Hair & Beauty rebooked ÷ Total clients (excl. rebooked)',
  };
  const labelEl = document.getElementById('rebookCardLabel');
  const descEl  = document.getElementById('rebookCardDesc');
  const valEl   = document.getElementById('rebookCardValue');
  if (labelEl) labelEl.textContent = labels[mode];
  if (descEl)  descEl.innerHTML = `<em>${descs[mode]}</em>`;
  const card = valEl && valEl.closest('.metric');
  if (card) {
    const hair   = parseFloat(card.dataset.hairRebook   || 0);
    const beauty = card.dataset.beautyRebook === 'null' ? null : parseFloat(card.dataset.beautyRebook || 0);
    const both   = parseFloat(card.dataset.bothRebook   || 0);
    const val = mode === 'hair' ? hair : mode === 'beauty' ? beauty : both;
    if (valEl) valEl.textContent = val != null ? val.toFixed(2) + '%' : '—';
  }
  const isDark = document.body.classList.contains('dark') || document.documentElement.getAttribute('data-theme') === 'dark';
  const DEPT_COLORS = { hair: '#99F6E4', beauty: '#FFD4D9', both: '#C4B5FD' };
  const DEPT_TEXT_LIGHT = { hair: '#0A5244', beauty: '#8B3A42', both: '#5B4A8A' };
  ['hair','beauty','both'].forEach(m => {
    const btn = document.getElementById('rebookBtn-' + m);
    if (!btn) return;
    const active = m === mode;
    const col = DEPT_COLORS[m];
    btn.style.fontWeight  = active ? '700' : '400';
    btn.style.background  = active ? (isDark ? col + '40' : col + '55') : 'transparent';
    btn.style.borderColor = active ? col : (isDark ? 'rgba(250,248,243,0.15)' : 'rgba(92,85,87,0.2)');
    btn.style.color       = active ? (isDark ? col : DEPT_TEXT_LIGHT[m]) : (isDark ? 'rgba(250,248,243,0.45)' : '#9a8a87');
  });
}

let _cbDonutCharts = {};
function toggleClientBreakdown() {
  const panel = document.getElementById('clientBreakdownPanel');
  const btn   = document.getElementById('breakdownPillBtn');
  if (!panel) return;
  const open = panel.style.display === 'none' || panel.style.display === '';
  smoothSlide(panel, open);
  if (btn) btn.innerHTML = open ? 'Breakdown ▴' : 'Breakdown ▾';
  if (open) setTimeout(() => _initCbDonuts(), 80);
}

function _initCbDonuts() {
  const dark = document.body.classList.contains('dark');
  const s = window._lastDashState;
  if (!s) return;
  // TRS brand palette: teal=New, lavender=Rebooked, rose=NCR — same light & dark
  const CB_COLORS = ['#99F6E4', '#C4B5FD', '#FFD4D9'];
  const configs = [
    { id: 'cbHairDonut',   bd: s.hairBreakdown   || {}, colors: CB_COLORS },
    { id: 'cbBeautyDonut', bd: s.beautyBreakdown || {}, colors: CB_COLORS },
  ];
  configs.forEach(({ id, bd, colors }) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (_cbDonutCharts[id]) { _cbDonutCharts[id].destroy(); }
    const data = [bd.new||0, bd.rebooked||0, bd.ncr||0];
    _cbDonutCharts[id] = new Chart(el, {
      type: 'doughnut',
      data: {
        labels: ['New', 'Rebooked', 'NCR'],
        datasets: [{ data, backgroundColor: colors, borderColor: dark?'#1e2330':'#ffffff', borderWidth: 2, hoverOffset: 3 }],
      },
      options: {
        cutout: '60%', responsive: false, maintainAspectRatio: false,
        animation: { duration: 500, easing: 'easeInOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: c => ` ${c.label}: ${c.raw.toLocaleString()} (${data.reduce((a,b)=>a+b,0)?Math.round(c.raw/data.reduce((a,b)=>a+b,0)*100):0}%)`,
            },
          },
        },
      },
    });
  });
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
  if (!e.target.closest('#dateRangeWrap')) {
    const pop = document.getElementById('datePickerPop');
    const btn = document.getElementById('btn-daterange');
    if (pop) pop.classList.remove('open');
    if (btn) btn.classList.remove('active');
  }
});

function buildDrop(key, options) {
  const drop  = document.getElementById('drop-' + key);
  const isAll = pendingSel[key].includes('all');
  drop.innerHTML = `
    <div class="ms-apply-row">
      <button class="f-pill active" onclick="saveBranchSelection()">Apply</button>
    </div>
    <div class="ms-opt all-opt ${isAll ? 'selected' : ''}" data-val="all" onclick="toggleOpt('${key}','all')">
      <span class="ms-chk ${isAll ? 'on' : ''}"></span>All Branches
    </div>
    ${options.map(o => {
      const active = !isAll && pendingSel[key].includes(o.val);
      const dot = BRANCH_INFO[o.val]
        ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${BRANCH_INFO[o.val].color};flex-shrink:0;"></span>` : '';
      return `<div class="ms-opt ${active ? 'selected' : ''}" data-val="${o.val}" onclick="toggleOpt('${key}','${o.val}')">
        <span class="ms-chk ${active ? 'on' : ''}"></span>${dot}${o.label}
      </div>`;
    }).join('')}`;
  updateLabel(key, options);
}

function toggleOpt(key, val) {
  // Write to pendingSel only — dashboard re-renders on Save
  if (val === 'all') {
    pendingSel[key] = ['all'];
  } else if (pendingSel[key].includes('all')) {
    pendingSel[key] = Object.keys(BRANCH_INFO).filter(b => b !== val);
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
  buildDrop('branch', Object.entries(BRANCH_INFO).map(([k,v]) => ({ val: k, label: v.name })));
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

// ── DATE RANGE PICKER ────────────────────────────────────────

const calState = { year: new Date().getFullYear(), month: new Date().getMonth() };
let pickerFromDate = null;
let pickerToDate   = null;
let pickingStep    = 'from'; // 'from' | 'to'

function toggleDatePicker() {
  const pop = document.getElementById('datePickerPop');
  const btn = document.getElementById('btn-daterange');
  const isOpen = pop.classList.contains('open');
  document.querySelectorAll('.ms-drop').forEach(d => d.classList.remove('open'));
  document.querySelectorAll('.ms-btn').forEach(b => b.classList.remove('open'));
  if (isOpen) { pop.style.display = 'none'; pop.classList.remove('open'); btn.classList.remove('active'); return; }

  // Init to current selections or today
  const now = new Date();
  if (dateFrom) { calState.year = dateFrom.getFullYear(); calState.month = dateFrom.getMonth(); }
  else { calState.year = now.getFullYear(); calState.month = now.getMonth(); }
  pickerFromDate = dateFrom ? new Date(dateFrom) : null;
  pickerToDate   = dateTo   ? new Date(dateTo)   : null;
  pickingStep    = pickerFromDate ? (pickerToDate ? 'from' : 'to') : 'from';

  pop.style.display = 'block';
  pop.classList.add('open');
  btn.classList.add('active');
  buildYearOptions();
  renderCalendar();
  updateStepUI();
}

function buildYearOptions() {
  const sel = document.getElementById('calYearSel');
  if (!sel) return;
  const cur = calState.year;
  sel.innerHTML = '';
  for (let y = cur - 3; y <= cur + 2; y++) {
    const o = document.createElement('option');
    o.value = y; o.textContent = y;
    if (y === cur) o.selected = true;
    sel.appendChild(o);
  }
}

function calMonthChange() {
  const sel = document.getElementById('calMonthSel');
  if (sel) calState.month = parseInt(sel.value);
  renderCalendar();
}
function calYearChange() {
  const sel = document.getElementById('calYearSel');
  if (sel) calState.year = parseInt(sel.value);
  buildYearOptions();
  renderCalendar();
}

function shiftCal(dir) {
  calState.month += dir;
  if (calState.month > 11) { calState.month = 0; calState.year++; }
  if (calState.month < 0)  { calState.month = 11; calState.year--; }
  // Sync selects
  const ms = document.getElementById('calMonthSel');
  const ys = document.getElementById('calYearSel');
  if (ms) ms.value = calState.month;
  buildYearOptions();
  renderCalendar();
}

function renderCalendar() {
  const { year, month } = calState;
  const ms = document.getElementById('calMonthSel');
  const ys = document.getElementById('calYearSel');
  if (ms) ms.value = month;

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date(); today.setHours(0,0,0,0);
  const DAYS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

  let html = DAYS.map(d => `<div class="cal-day-hdr">${d}</div>`).join('');
  for (let i = 0; i < firstDay; i++) html += `<div class="cal-day cal-day-empty"></div>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d); date.setHours(0,0,0,0);
    const isToday = date.getTime() === today.getTime();
    const isFrom  = pickerFromDate && date.getTime() === pickerFromDate.getTime();
    const isTo    = pickerToDate   && date.getTime() === pickerToDate.getTime();
    const inRange = pickerFromDate && pickerToDate && date > pickerFromDate && date < pickerToDate;

    let cls = 'cal-day';
    if (isFrom && isTo)  cls += ' cal-day-selected';
    else if (isFrom)     cls += ' cal-day-range-start';
    else if (isTo)       cls += ' cal-day-range-end';
    else if (inRange)    cls += ' cal-day-in-range';
    if (isToday)         cls += ' cal-day-today';

    html += `<div class="${cls}" onclick="pickDay(${year},${month},${d})">${d}</div>`;
  }
  document.getElementById('calGrid').innerHTML = html;
}

function pickDay(year, month, day) {
  const date = new Date(year, month, day); date.setHours(0,0,0,0);

  if (pickingStep === 'from') {
    pickerFromDate = date;
    pickerToDate   = null;
    pickingStep    = 'to';
  } else {
    if (date < pickerFromDate) {
      pickerToDate   = pickerFromDate;
      pickerFromDate = date;
    } else {
      pickerToDate = date;
    }
    pickingStep = 'from';
  }
  renderCalendar();
  updateStepUI();
}

function updateStepUI() {
  const fmt = d => d ? d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : null;
  const fromEl   = document.getElementById('calStepFrom');
  const toEl     = document.getElementById('calStepTo');
  const fromVal  = document.getElementById('calStepFromVal');
  const toVal    = document.getElementById('calStepToVal');
  const selEl    = document.getElementById('date-picker-selection');

  if (fromEl) fromEl.classList.toggle('active-step', pickingStep === 'from');
  if (toEl)   toEl.classList.toggle('active-step',   pickingStep === 'to');

  if (fromVal) {
    fromVal.textContent = pickerFromDate ? fmt(pickerFromDate) : 'Select start';
    fromVal.className   = 'cal-step-val' + (pickerFromDate ? ' set' : '');
  }
  if (toVal) {
    toVal.textContent = pickerToDate ? fmt(pickerToDate) : 'Select end';
    toVal.className   = 'cal-step-val' + (pickerToDate ? ' set' : '');
  }
  if (selEl) {
    if (!pickerFromDate) { selEl.textContent = 'Click a date to set FROM'; selEl.className = 'date-picker-selection'; }
    else if (!pickerToDate) { selEl.textContent = 'Now click a date to set TO'; selEl.className = 'date-picker-selection'; }
    else { selEl.textContent = `${fmt(pickerFromDate)} → ${fmt(pickerToDate)}`; selEl.className = 'date-picker-selection has-range'; }
  }
}

function applyDateRange() {
  dateFrom = pickerFromDate;
  dateTo   = pickerToDate || pickerFromDate;
  const lbl = document.getElementById('lbl-daterange');
  if (!dateFrom) {
    updateDateRangePlaceholder();
  } else {
    const fmt = d => d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'2-digit' });
    lbl.textContent = dateTo && dateTo.getTime() !== dateFrom.getTime()
      ? `${fmt(dateFrom)} – ${fmt(dateTo)}`
      : fmt(dateFrom);
  }
  const pop = document.getElementById('datePickerPop');
  const btn = document.getElementById('btn-daterange');
  if (pop) { pop.classList.remove('open'); }
  if (btn) btn.classList.remove('active');
  renderDashboard().then(() => {
    const teamView = document.getElementById('view-team');
    if (teamView && teamView.style.display !== 'none') renderTeam();
  });
}

function setMTDRange() {
  const today = new Date(); today.setHours(0,0,0,0);
  // Use yesterday as the end — avoids "no data" on the 1st of a new month
  const to = new Date(today); to.setDate(to.getDate() - 1);
  const from = new Date(to.getFullYear(), to.getMonth(), 1);
  dateFrom = from;
  dateTo   = to;
  pickerFromDate = new Date(from);
  pickerToDate   = new Date(to);
  const fmt = d => d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'2-digit' });
  const lbl = document.getElementById('lbl-daterange');
  if (lbl) lbl.textContent = `${fmt(from)} – ${fmt(to)}`;
}

function clearDateRange() {
  pickingStep = 'from';
  setMTDRange();
  renderCalendar();
  updateStepUI();
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

function getDataSpan() {
  let minDate = null, maxDate = null;
  allData.forEach(d => {
    const dates = getWeekDatesFromLabel(d.week_label);
    const toD = s => { const u = new Date(s); u.setHours(0,0,0,0); return u; };
    const start = dates ? dates.start : (d.uploaded_at ? toD(d.uploaded_at) : null);
    const end   = dates ? dates.end   : start;
    // also check uploaded_at directly so recent rows without matching labels aren't missed
    const uploaded = d.uploaded_at ? toD(d.uploaded_at) : null;
    if (start    && (!minDate || start    < minDate)) minDate = start;
    if (end      && (!maxDate || end      > maxDate)) maxDate = end;
    if (uploaded && (!maxDate || uploaded > maxDate)) maxDate = uploaded;
  });
  return { minDate, maxDate };
}

function updateDateRangePlaceholder() {
  const lbl = document.getElementById('lbl-daterange');
  if (!lbl || dateFrom) return; // don't overwrite an active selection
  const { minDate, maxDate } = getDataSpan();
  if (!minDate || !maxDate) { lbl.textContent = 'Select Date/s From and To'; return; }
  const fmt = d => d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
  lbl.textContent = `${fmt(minDate)} – ${fmt(maxDate)}`;
}

function getFilteredData(ignoreBranch = false) {
  return allData.filter(d => {
    if (!window.showFratelli && d.branch === 'FRT') return false;
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

function aggDailyData(dailyRows) {
  if (!dailyRows || !dailyRows.length) return null;
  const s = {
    totalClients:0, hairRetail:0, treatmentSales:0, beautySales:0,
    netTake:0, colTake:0, rebookPct:0, ncrPct:0, _fromDaily:true,
  };
  let dHairRebooked=0, dBeautyRebooked=0, totalHairClients=0, totalNewC=0, totalReq=0;
  let dHairNCR=0, dHairREQ=0, dHairSALON=0, dHairNEW=0;
  let dBeautyREQ=0, dBeautySALON=0, dBeautyNEW=0, dBeautyNCR=0, totalBeautyClients=0;
  dailyRows.forEach(r => {
    const hairClients   = (r.hair_clients_request||0) + (r.hair_clients_salon||0) + (r.hair_new||0);
    const beautyClients = (r.beauty_request||0) + (r.beauty_salon||0) + (r.beauty_new||0);
    s.totalClients   += hairClients + beautyClients;
    s.hairRetail     += r.retail_total      || 0;
    s.treatmentSales += r.treatments_total  || 0;
    s.beautySales    += r.beauty_sales      || 0;
    s.netTake        += r.total             || 0;
    dHairRebooked        += r.hair_rebooked    || 0;
    dBeautyRebooked      += r.beauty_rebooked  || 0;
    totalNewC            += r.hair_new         || 0;
    totalReq             += r.hair_ncr         || 0;
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
  return { summary: s, hairStaff: [], beautyStaff: [] };
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

  const hairStaff = Object.values(hairMap).map((st, i) => {
    const hReturning    = (st.req||0) + (st.salon||0);
    const hRebookPct    = st.total    ? (st.rebooked / st.total * 100) : 0;
    const hRetentionPct = st.total    ? (hReturning  / st.total * 100) : 0;
    const hConvPct      = hReturning  ? (st.rebooked / hReturning * 100) : 0;
    return {
      ...st,
      retail:        Number(st.retail) || 0,
      avgBill:       st.total ? st.hairSalesNet / st.total : 0,
      rebookPct:     hRebookPct,
      retentionPct:  hRetentionPct,
      conversionPct: hConvPct,
      ncrPct:        st.total ? ((st.newClientReq||0) / st.total * 100) : 0,
      color: SCOLS[i % SCOLS.length]
    };
  });
  const beautyStaff = Object.values(beautyMap).map((st,i) => {
    const bReturning    = (st.req||0) + (st.salon||0);
    const bRebookPct    = st.total   ? ((st.rebooked||0) / st.total * 100) : 0;
    const bRetentionPct = st.total   ? (bReturning / st.total * 100) : 0;
    const bConvPct      = bReturning ? ((st.rebooked||0) / bReturning * 100) : 0;
    return {
      ...st,
      avgBill:       st.total ? st.beautySales/st.total : 0,
      rebookPct:     bRebookPct,
      retentionPct:  bRetentionPct,
      conversionPct: bConvPct,
      ncrPct:        st.total ? ((st.newClientReq||0)/st.total*100) : 0,
      color: SCOLS[(i+3) % SCOLS.length]
    };
  });

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
  Object.keys(BRANCH_INFO).forEach(code => {
    if (dateFrom && dateTo && isFullWeekRange(dateFrom, dateTo)) {
      // Full week(s): use weekly_totals cached from render (filter by branch)
      const branchRows = (window._cachedWeeklyTotals || []).filter(r => r.branch === code);
      result[code] = branchRows.length ? aggWeeklyTotals(branchRows) : null;
    } else if (dateFrom && dateTo && currentDailyRows.length) {
      // Partial week: split the cached daily rows by branch
      const branchRows = currentDailyRows.filter(r => r.branch === code);
      result[code] = branchRows.length ? aggDailyData(branchRows) : null;
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

function buildCmpChart(byBranch, metric, dark, ttStyle, gc, tc, catFilter) {
  catFilter = catFilter || 'hb';
  // Resolve the actual summary key based on category filter where metrics split by Hair/Beauty/Hair & Beauty
  const resolveKey = (m, cat) => {
    if (m === 'avgBill')       return cat === 'hair' ? 'hairAvgBill'   : cat === 'beauty' ? 'beautyAvgBill'   : 'avgBill';
    if (m === 'rebookPct')     return cat === 'hair' ? 'hairRebookPct' : cat === 'beauty' ? 'beautyRebookPct' : 'rebookPct';
    if (m === 'ncrPct')        return cat === 'hair' ? 'hairNcrPct'    : cat === 'beauty' ? 'beautyNcrPct'    : 'ncrPct';
    return m; // netTake, totalClients, totalRebooked — no split
  };
  const resolvedMetric = resolveKey(metric, catFilter);

  const activeBranches = (sel.branch.includes('all') ? Object.keys(BRANCH_INFO) : sel.branch)
    .filter(b => window.showFratelli || b !== 'FRT');
  const entries = activeBranches.map(b => {
    const d = byBranch[b];
    return { branch: b, val: +(d ? d.summary[resolvedMetric]||0 : 0).toFixed(2), color: BRANCH_INFO[b]?.color||'#ccc', name: BRANCH_INFO[b]?.name||b };
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
  };
  const lc = dark ? '#C4B5FD' : '#5C5557';

  charts.cmp = new Chart(document.getElementById('cmpChart'), {
    data: { labels, datasets: [
      { type:'bar', label: metricLabels[metric]||metric, data: vals, backgroundColor: colors.map(c=>c+'cc'), borderColor: colors, borderWidth: 1.5, borderRadius: 8, barThickness: 28, yAxisID:'y' },
      { type:'line', label:'── Average ' + (metricLabels[metric]||metric), data: vals.map(()=>+avg.toFixed(2)), borderColor: lc, backgroundColor:'transparent', borderWidth:2, borderDash:[6,4], pointRadius:5, pointBackgroundColor:lc, pointBorderColor:lc, tension:0, yAxisID:'y' }
    ]},
    options: { animation:{duration:500,easing:'easeInOutQuart'}, responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false},
      plugins:{legend:{display:true,labels:{color:tc,font:{family:'DM Sans',size:11},boxWidth:12,filter:(item)=>item.datasetIndex===1}},tooltip:ttStyle},
      scales:{x:{ticks:{color:tc,font:{family:'DM Sans',size:11}},grid:{color:gc}},y:{ticks:{color:tc,font:{family:'DM Sans',size:11}},grid:{color:gc}}}
    }
  });
}


// ── COLLAPSIBLE SECTIONS ─────────────────────────────────────

function setRevenueTab(tab) {
  revenueTab = tab;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const RV_COLORS = { hair: '#99F6E4', beauty: '#FFD4D9', hb: '#C4B5FD' };
  const RV_TEXT_LIGHT = { hair: '#0A5244', beauty: '#8B3A42', hb: '#5B4A8A' };
  ['hair','beauty','hb'].forEach(t => {
    const panel = document.getElementById('rpanel-' + t);
    const btn   = document.getElementById('rtab-' + t);
    if (panel) panel.style.display = (t === tab) ? 'grid' : 'none';
    if (btn) {
      const active = t === tab;
      const col = RV_COLORS[t];
      btn.style.background  = active ? (isDark ? col + '40' : col + '55') : 'var(--surface2)';
      btn.style.color       = active ? (isDark ? col : RV_TEXT_LIGHT[t]) : 'var(--muted)';
      btn.style.borderColor = active ? col : 'var(--border)';
    }
  });
}

function toggleSection(id) {
  sectionState[id] = !sectionState[id];
  const body  = document.getElementById('body-'  + id);
  const arrow = document.getElementById('arrow-' + id);
  const hdr   = arrow ? arrow.closest('.support-section-hdr') : null;
  if (body) smoothSlide(body, sectionState[id]);
  if (arrow) arrow.classList.toggle('open', sectionState[id]);
  if (hdr)   hdr.classList.toggle('open', sectionState[id]);
}
function applySection(id) {
  const body  = document.getElementById('body-'  + id);
  const arrow = document.getElementById('arrow-' + id);
  const hdr   = arrow ? arrow.closest('.support-section-hdr') : null;
  const open  = sectionState[id];
  if (body) {
    // instant (no animation) on initial render; animate only on user toggle
    body.style.display = open ? 'block' : 'none';
  }
  if (arrow) arrow.classList.toggle('open', open);
  if (hdr)   hdr.classList.toggle('open', open);
}
function restoreSections() {
  Object.keys(sectionState).forEach(id => applySection(id));
  setRevenueTab(revenueTab);
}


// ── DASHBOARD RENDER ─────────────────────────────────────────

// AFTER — hoist filtered:
async function renderDashboard() {
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
      if (!window.showFratelli) weekRows = weekRows.filter(r => r.branch !== 'FRT');
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
      let dailyRows = await loadDailyRange(dateFrom, dateTo);
      currentDailyRows = dailyRows;
      if (!sel.branch.includes('all')) {
        dailyRows = dailyRows.filter(r => sel.branch.includes(r.branch));
      }
      if (!dailyRows.length) {
        destroyCharts();
        main.innerHTML = '<div class="empty">No daily data found for this date range.</div>';
        return;
      }
      d = aggDailyData(dailyRows);
    }
  } else {
    currentDailyRows = [];
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

  // Compute previous-period summary for trend arrows
  let prevS = null;
  try {
    const branchRows = allData.filter(dd =>
      (!window.showFratelli ? dd.branch !== 'FRT' : true) &&
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
      (!window.showFratelli ? dd.branch !== 'FRT' : true) &&
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
        (!window.showFratelli ? dd.branch !== 'FRT' : true) &&
        (sel.branch.includes('all') || sel.branch.includes(dd.branch))
      ).map(r => r.week_label));
      const _bCount = (sel.branch.includes('all') ? ['SAA','KCA','AQ','MC','FRT'] : sel.branch).length || 1;
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
  // Beauty tab: no per-dept treatment or retail split in uploaded data — null renders as "—"
  const rvBTxPct     = null;
  const rvBRetPct    = null;
  // H+B tab: denominator is total service revenue (net take minus retail)
  const rvHBSvc      = s.netTake - (s.hairRetail||0);
  const rvHBTxPct    = rvHBSvc ? ((s.treatmentSales||0) / rvHBSvc * 100) : 0;
  const rvHBRetPct   = rvHBSvc ? ((s.hairRetail||0) / rvHBSvc * 100) : 0;

  main.innerHTML = `
<!-- ROW 1: 4 COMPACT KPI CARDS -->
<div>
  <div class="section-label" style="display:flex;align-items:center;gap:7px;margin-top:16px;margin-bottom:8px">
    <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#99F6E4;flex-shrink:0"></span>
    ${branchLabel} · Main Metrics
  </div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px">

    <div class="metric" style="border-color:rgba(153,246,228,0.35);padding:14px">
      <div style="position:absolute;top:0;left:0;right:0;height:3px;border-radius:13px 13px 0 0;background:#99F6E4"></div>
      <div class="metric-label" style="font-size:9px">Total Clients</div>
      <div style="font-size:9px;color:var(--muted);margin:3px 0 4px"><em>Excludes rebooked clients</em></div>
      <div class="metric-value" style="font-size:20px">${(s.totalClients||0).toLocaleString()}</div>
      <div class="metric-target" style="font-size:10px;margin-top:8px">Target: ${getClientTarget(sel.branch)}</div>
      <button id="breakdownPillBtn" onclick="toggleClientBreakdown()" style="margin-top:6px;background:${dark?'rgba(153,246,228,0.15)':'rgba(15,110,86,0.08)'};border:1px solid ${dark?'rgba(153,246,228,0.4)':'rgba(15,110,86,0.3)'};color:${dark?'#99F6E4':'#0F6E56'};border-radius:20px;padding:4px 11px;font-size:10px;font-family:inherit;cursor:pointer;white-space:nowrap;letter-spacing:.04em">Breakdown ▴</button>
    </div>

    <div class="metric" style="border-color:rgba(153,246,228,0.35);padding:14px" data-hair-avg-bill="${(s.hairAvgBill||0).toFixed(4)}" data-beauty-avg-bill="${s.beautyAvgBill != null ? s.beautyAvgBill.toFixed(4) : 'null'}" data-both-avg-bill="${(s.avgBill||0).toFixed(4)}">
      <div style="position:absolute;top:0;left:0;right:0;height:3px;border-radius:13px 13px 0 0;background:#99F6E4"></div>
      <div style="margin-bottom:3px">
        <div class="metric-label" id="avgBillCardLabel" style="font-size:9px;margin-bottom:4px">${(window.avgBillView||'both') === 'hair' ? 'Hair Avg Bill' : (window.avgBillView||'both') === 'beauty' ? 'Beauty Avg Bill' : 'Total Avg Bill'}</div>
        <div style="display:flex;gap:2px">
          ${['hair','beauty','both'].map(m => {
            const active = (window.avgBillView||'both') === m;
            const lbl = m === 'both' ? 'Hair & Beauty' : m.charAt(0).toUpperCase() + m.slice(1);
            const DCOL = {hair:'#99F6E4',beauty:'#FFD4D9',both:'#C4B5FD'};
            const DLTXT = {hair:'#0A5244',beauty:'#8B3A42',both:'#5B4A8A'};
            const col = DCOL[m];
            return `<button id="avgBillBtn-${m}" onclick="toggleAvgBillView('${m}')" style="font-size:8px;padding:2px 6px;border-radius:10px;border:1px solid ${active?col:(dark?'rgba(250,248,243,0.15)':'rgba(92,85,87,0.2)')};background:${active?(dark?col+'40':col+'55'):'transparent'};color:${active?(dark?col:DLTXT[m]):(dark?'rgba(250,248,243,0.45)':'#9a8a87')};cursor:pointer;font-family:inherit;font-weight:${active?'700':'400'}">${lbl}</button>`;
          }).join('')}
        </div>
      </div>
      <div style="font-size:9px;color:var(--muted);margin:2px 0 6px" id="avgBillCardDesc"><em>${
        (window.avgBillView||'both') === 'hair'   ? 'Hair Revenue ÷ Total Clients (excl. rebooked)' :
        (window.avgBillView||'both') === 'beauty' ? 'Beauty Revenue ÷ Total Clients (excl. rebooked)' :
        'Total Revenue ÷ Total Clients (excl. rebooked)'
      }</em></div>
      ${(() => { const _av = (window.avgBillView||'both') === 'hair' ? (s.hairAvgBill||0) : (window.avgBillView||'both') === 'beauty' ? (s.beautyAvgBill||0) : (s.avgBill||0); const _as = sc(_av, 650); return `<div class="metric-value ${_as}" id="avgBillCardValue" style="font-size:20px">${(window.avgBillView||'both') === 'hair' ? fmtAED(s.hairAvgBill||0) : (window.avgBillView||'both') === 'beauty' ? (s.beautyAvgBill != null ? fmtAED(s.beautyAvgBill) : '—') : fmtAED(s.avgBill)}${trendArrow(s.avgBill, prevS?.avgBill, true, prevPeriodLabel)}</div><div class="metric-target" style="font-size:10px">Benchmark: ~AED 650</div>${statusBanner(_as, dark)}`; })()}
    </div>

    <div class="metric" style="border-color:rgba(153,246,228,0.35);padding:14px" data-hair-rebook="${(s.hairRebookPct||0).toFixed(4)}" data-beauty-rebook="${s.beautyRebookPct != null ? s.beautyRebookPct.toFixed(4) : 'null'}" data-both-rebook="${(s.rebookPct||0).toFixed(4)}">
      <div style="position:absolute;top:0;left:0;right:0;height:3px;border-radius:13px 13px 0 0;background:#99F6E4"></div>
      <div style="margin-bottom:3px">
        <div class="metric-label" id="rebookCardLabel" style="font-size:9px;margin-bottom:4px">${(window.rebookView||'both') === 'hair' ? 'Hair Rebooking %' : (window.rebookView||'both') === 'beauty' ? 'Beauty Rebooking %' : 'Rebooking %'}</div>
        <div style="display:flex;gap:2px">
          ${['hair','beauty','both'].map(m => {
            const active = (window.rebookView||'both') === m;
            const lbl = m === 'both' ? 'Hair & Beauty' : m.charAt(0).toUpperCase() + m.slice(1);
            const DCOL = {hair:'#99F6E4',beauty:'#FFD4D9',both:'#C4B5FD'};
            const DLTXT = {hair:'#0A5244',beauty:'#8B3A42',both:'#5B4A8A'};
            const col = DCOL[m];
            return `<button id="rebookBtn-${m}" onclick="toggleRebookView('${m}')" style="font-size:8px;padding:2px 6px;border-radius:10px;border:1px solid ${active?col:(dark?'rgba(250,248,243,0.15)':'rgba(92,85,87,0.2)')};background:${active?(dark?col+'40':col+'55'):'transparent'};color:${active?(dark?col:DLTXT[m]):(dark?'rgba(250,248,243,0.45)':'#9a8a87')};cursor:pointer;font-family:inherit;font-weight:${active?'700':'400'}">${lbl}</button>`;
          }).join('')}
        </div>
      </div>
      <div style="font-size:9px;color:var(--muted);margin:2px 0 6px" id="rebookCardDesc"><em>${
        (window.rebookView||'both') === 'hair'   ? 'Hair rebooked ÷ Total Clients (excl. rebooked)' :
        (window.rebookView||'both') === 'beauty' ? 'Beauty rebooked ÷ Total Clients (excl. rebooked)' :
        'Hair &amp; Beauty rebooked ÷ Total clients (excl. rebooked)'
      }</em></div>
      <div class="metric-value ${sc(
        (window.rebookView||'both') === 'hair'   ? (s.hairRebookPct||0) :
        (window.rebookView||'both') === 'beauty' ? (s.beautyRebookPct||0) :
        (s.rebookPct||0), TARGETS.rebookPct)}" id="rebookCardValue" style="font-size:20px">${
        (window.rebookView||'both') === 'hair'   ? fmtPct(s.hairRebookPct||0) :
        (window.rebookView||'both') === 'beauty' ? (s.beautyRebookPct != null ? fmtPct(s.beautyRebookPct) : '—') :
        fmtPct(s.rebookPct)
      }${trendArrow(s.rebookPct, prevS?.rebookPct, true, prevPeriodLabel)}</div>
      <div class="metric-target" style="font-size:10px">Target: ${TARGETS.rebookPct}%</div>
      ${statusBanner(sc((window.rebookView||'both') === 'hair' ? (s.hairRebookPct||0) : (window.rebookView||'both') === 'beauty' ? (s.beautyRebookPct||0) : (s.rebookPct||0), TARGETS.rebookPct), dark)}
    </div>

    <div class="metric ncr-glow" style="border-color:rgba(153,246,228,0.75);padding:14px" data-hair-ncr="${(s.ncrPct||0).toFixed(4)}" data-beauty-ncr="${s.beautyNcrPct != null ? s.beautyNcrPct.toFixed(4) : 'null'}" data-both-ncr="${(s.combinedNcrPct||0).toFixed(4)}">
      <div style="position:absolute;top:0;left:0;right:0;height:3px;border-radius:13px 13px 0 0;background:#99F6E4"></div>
      <div style="margin-bottom:3px">
        <div class="metric-label" id="ncrCardLabel" style="font-size:9px;margin-bottom:4px">Hair NCR %</div>
        <div style="display:flex;gap:2px">
          ${['hair','beauty','both'].map(m => {
            const active = (window.ncrView||'hair') === m;
            const lbl = m === 'both' ? 'Hair & Beauty' : m.charAt(0).toUpperCase() + m.slice(1);
            const DCOL = {hair:'#99F6E4',beauty:'#FFD4D9',both:'#C4B5FD'};
            const DLTXT = {hair:'#0A5244',beauty:'#8B3A42',both:'#5B4A8A'};
            const col = DCOL[m];
            return `<button id="ncrBtn-${m}" onclick="toggleNcrView('${m}')" style="font-size:8px;padding:2px 6px;border-radius:10px;border:1px solid ${active?col:(dark?'rgba(250,248,243,0.15)':'rgba(92,85,87,0.2)')};background:${active?(dark?col+'40':col+'55'):'transparent'};color:${active?(dark?col:DLTXT[m]):(dark?'rgba(250,248,243,0.45)':'#9a8a87')};cursor:pointer;font-family:inherit;font-weight:${active?'700':'400'}">${lbl}</button>`;
          }).join('')}
        </div>
      </div>
      <div style="font-size:9px;color:var(--muted);margin:2px 0 6px" id="ncrCardDesc"><em>${
        (window.ncrView||'hair') === 'beauty' ? 'Beauty NCRs ÷ Beauty Clients (excl. rebooked)' :
        (window.ncrView||'hair') === 'both'   ? 'Hair + Beauty NCRs ÷ Total Clients (excl. rebooked)' :
        'New Client Requests ÷ Total Clients (excl. rebooked)'
      }</em></div>
      <div class="metric-value ${sc(
        (window.ncrView||'hair') === 'beauty' ? (s.beautyNcrPct||0) :
        (window.ncrView||'hair') === 'both'   ? (s.combinedNcrPct||0) :
        (s.ncrPct||0), 20)}" id="ncrCardValue" style="font-size:20px">${
        (window.ncrView||'hair') === 'beauty' ? (s.beautyNcrPct != null ? fmtPct(s.beautyNcrPct) : '—') :
        (window.ncrView||'hair') === 'both'   ? fmtPct(s.combinedNcrPct||0) :
        fmtPct(s.ncrPct||0)
      }${trendArrow(s.ncrPct, prevS?.ncrPct, true, prevPeriodLabel)}</div>
      <div class="metric-target" style="font-size:10px">Target: ≥ 20%</div>
      ${statusBanner(sc((window.ncrView||'hair') === 'beauty' ? (s.beautyNcrPct||0) : (window.ncrView||'hair') === 'both' ? (s.combinedNcrPct||0) : (s.ncrPct||0), 20), dark)}
    </div>
  </div>

  <!-- CLIENT BREAKDOWN PANEL (toggled by Breakdown pill) -->
  <div id="clientBreakdownPanel" style="display:block;position:sticky;top:52px;z-index:39;background:var(--bg);padding-bottom:4px">
    <div style="border:1px solid var(--border);border-radius:12px;padding:14px 16px;background:var(--surface)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:${dark?'#99F6E4':'#0F6E56'};font-weight:600">Client Breakdown</div>
        ${(()=>{
          const hairNet   = (s.netTake||0) - (s.beautySales||0);
          const beautyNet = s.beautySales || 0;
          const totalNet  = s.netTake || 0;
          const hairCol   = '#C4B5FD';
          const beautyCol = '#99F6E4';
          const pill = (label, val, col) => `
            <div style="display:flex;flex-direction:column;align-items:center;padding:5px 12px;background:${dark?col+'18':col+'22'};border:1px solid ${dark?col+'44':col+'66'};border-radius:8px;min-width:90px">
              <div style="font-size:8px;font-weight:700;color:${col};letter-spacing:.08em;text-transform:uppercase;margin-bottom:2px">${label}</div>
              <div style="font-size:13px;font-weight:800;color:var(--text);letter-spacing:.01em">${fmtAED(val)}</div>
            </div>`;
          return `<div style="display:flex;gap:8px;align-items:center">
            ${pill('Hair', hairNet, hairCol)}
            ${pill('Beauty', beautyNet, beautyCol)}
            ${pill('Total', totalNet, dark?'rgba(250,248,243,0.6)':'#5C5557')}
          </div>`;
        })()}
      </div>
      ${(()=>{
        const bdSum = (s.hairBreakdown?.ncr||0)+(s.hairBreakdown?.req||0)+(s.hairBreakdown?.salon||0)+(s.hairBreakdown?.new||0)
                    + (s.beautyBreakdown?.ncr||0)+(s.beautyBreakdown?.req||0)+(s.beautyBreakdown?.salon||0)+(s.beautyBreakdown?.new||0);
        const gap = s.totalClients - bdSum;
        if (gap > 5) return `<div style="margin-bottom:10px;padding:7px 10px;background:${dark?'rgba(255,200,0,0.08)':'#FFFBEA'};border:1px solid ${dark?'rgba(255,200,0,0.3)':'#F0C040'};border-radius:8px;font-size:9px;color:${dark?'#FFD060':'#8A6800'}">
          ⚠ Breakdown shows <strong>${bdSum.toLocaleString()}</strong> of <strong>${s.totalClients.toLocaleString()}</strong> total clients (<strong>${gap.toLocaleString()}</strong> unclassified). Re-upload older weeks with full per-category columns to see the complete breakdown.
        </div>`;
        return '';
      })()}

      <!-- LAYOUT: funnel left, donuts right -->
      <div style="display:grid;grid-template-columns:1.5fr 1fr;gap:20px;align-items:start">

        <!-- FUNNEL: client journey for Hair & Beauty -->
        <div>
          <div style="font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:8px">Client Journey Funnel</div>

          <!-- FUNNEL FILTER CHECKBOXES -->
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;padding:8px 10px;background:${dark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.03)'};border-radius:8px;border:1px solid var(--border2)">
            <div style="font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);align-self:center;margin-right:4px;flex-shrink:0">Show:</div>
            ${[
              { key:'hair',     label:'Hair',         color:'#C4B5FD' },
              { key:'beauty',   label:'Beauty',       color:'#99F6E4' },
              { key:'req',      label:'Requests',     color:'var(--muted)' },
              { key:'salon',    label:'Salon Visits', color:'var(--muted)' },
              { key:'new',      label:'New Clients',  color:'var(--muted)' },
              { key:'rebooked', label:'Rebooked',     color:'var(--muted)' },
            ].map(f => {
              const on = funnelFilter[f.key];
              return `<button onclick="toggleFunnelFilter('${f.key}')" style="display:flex;align-items:center;gap:5px;padding:3px 9px;border-radius:20px;border:1px solid ${on ? f.color : 'var(--border2)'};background:${on ? (dark?'rgba(255,255,255,0.07)':'rgba(0,0,0,0.04)') : 'transparent'};color:${on ? f.color : 'var(--muted)'};font-size:10px;font-family:inherit;cursor:pointer;transition:all .15s;letter-spacing:.03em;white-space:nowrap">
                <span style="width:7px;height:7px;border-radius:2px;border:1.5px solid ${on ? f.color : 'var(--muted)'};background:${on ? f.color : 'transparent'};flex-shrink:0;display:inline-flex;align-items:center;justify-content:center">
                  ${on ? `<svg width="5" height="5" viewBox="0 0 5 5"><path d="M1 2.5L2.2 3.8L4 1.5" stroke="#1a1a1a" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>` : ''}
                </span>
                ${f.label}
              </button>`;
            }).join('')}
          </div>

          ${(()=>{
            const allDept = [
              { key:'hair',   label:'Hair',   color: '#C4B5FD', data: s.hairBreakdown   || {} },
              { key:'beauty', label:'Beauty', color: '#99F6E4', data: s.beautyBreakdown || {} },
            ];
            const allStages = [
              { key:'req',      label:'Requests'     },
              { key:'salon',    label:'Salon Visits' },
              { key:'new',      label:'New Clients'  },
              { key:'rebooked', label:'Rebooked'     },
            ];
            const dept   = allDept.filter(d => funnelFilter[d.key]);
            const stages = allStages.filter(st => funnelFilter[st.key]);
            if (!dept.length || !stages.length) {
              return `<div style="font-size:11px;color:var(--muted);padding:10px 0">Tick at least one department and one stage to see the funnel.</div>`;
            }
            return dept.map(d => {
              const maxVal = d.data[stages[0].key] || d.data.req || 1;
              return `
              <div style="margin-bottom:14px">
                <div style="font-size:11px;font-weight:700;color:${d.color};margin-bottom:8px;letter-spacing:.06em">${d.label}</div>
                ${stages.map(st => {
                  const val = d.data[st.key] || 0;
                  const pct = Math.max(4, Math.round((val / maxVal) * 100));
                  const convPct = st.key !== 'req' && d.data.req ? ` · ${(val/d.data.req*100).toFixed(2)}% of REQ` : '';
                  return `
                  <div style="display:grid;grid-template-columns:90px 1fr 50px;gap:6px;align-items:center;margin-bottom:5px">
                    <div style="font-size:10px;color:var(--muted);text-align:right;letter-spacing:.04em">${st.label}</div>
                    <div style="background:${dark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.05)'};border-radius:4px;height:22px;overflow:hidden">
                      <div style="width:${pct}%;height:100%;background:${d.color};opacity:0.85;border-radius:4px;display:flex;align-items:center;padding-left:8px;box-sizing:border-box;transition:width 0.5s ease">
                        <span style="font-size:9px;font-weight:700;color:#1a1a1a;white-space:nowrap;overflow:hidden">${val.toLocaleString()}${convPct}</span>
                      </div>
                    </div>
                    <div style="font-size:11px;font-weight:700;color:var(--text);text-align:right">${val.toLocaleString()}</div>
                  </div>`;
                }).join('')}
              </div>`;
            }).join('');
          })()}
        </div>

        <!-- DONUTS: client mix per department -->
        <div>
          <div style="font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:10px">Client Mix</div>
          <!-- Side-by-side donuts to fill the full width -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            ${(()=>{
              // TRS brand palette — same light & dark
              const DOT_NEW  = '#99F6E4';
              const DOT_REB  = '#C4B5FD';
              const DOT_NCR  = '#FFD4D9';
              const depts = [
                { label:'Hair',   bd: s.hairBreakdown   || {}, id:'cbHairDonut',   col: '#C4B5FD' },
                { label:'Beauty', bd: s.beautyBreakdown || {}, id:'cbBeautyDonut', col: '#99F6E4' },
              ];
              return depts.map(d => {
                const total = (d.bd.new||0) + (d.bd.rebooked||0) + (d.bd.ncr||0);
                const newPct = total ? ((d.bd.new||0)/total*100).toFixed(2)      : '0.00';
                const rebPct = total ? ((d.bd.rebooked||0)/total*100).toFixed(2) : '0.00';
                const ncrPct = total ? ((d.bd.ncr||0)/total*100).toFixed(2)      : '0.00';
                return `
                <div style="display:flex;flex-direction:column;align-items:center;gap:10px;padding:10px 6px;background:${dark?'rgba(255,255,255,0.03)':'rgba(0,0,0,0.02)'};border-radius:10px;border:1px solid var(--border2)">
                  <div style="font-size:11px;font-weight:700;color:${d.col};letter-spacing:.04em">${d.label}</div>
                  <canvas id="${d.id}" width="110" height="110"></canvas>
                  <div style="font-size:11px;line-height:2;width:100%;padding:0 4px;box-sizing:border-box">
                    <div><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${DOT_NEW};margin-right:5px;vertical-align:middle"></span>New <strong>${newPct}%</strong> <span style="color:var(--muted)">(${(d.bd.new||0).toLocaleString()})</span></div>
                    <div><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${DOT_REB};margin-right:5px;vertical-align:middle"></span>Rebooked <strong>${rebPct}%</strong> <span style="color:var(--muted)">(${(d.bd.rebooked||0).toLocaleString()})</span></div>
                    <div><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${DOT_NCR};margin-right:5px;vertical-align:middle"></span>NCR <strong>${ncrPct}%</strong> <span style="color:var(--muted)">(${(d.bd.ncr||0).toLocaleString()})</span></div>
                  </div>
                </div>`;
              }).join('');
            })()}
          </div>
        </div>


      </div>

      <!-- FOOTER SUMMARY -->
      <div style="margin-top:12px;padding-top:8px;border-top:1px solid var(--border2);font-size:11px;color:var(--muted)">
        Total rebooked: <strong style="color:${dark?'#FF9B9B':'#A32D2D'}">${s.totalRebooked||0}</strong>
        &nbsp;·&nbsp; Hair: <strong style="color:${dark?'#FF9B9B':'#A32D2D'}">${s.hairBreakdown?.rebooked ?? '—'}</strong>
        &nbsp;·&nbsp; Beauty: <strong style="color:${dark?'#FF9B9B':'#A32D2D'}">${s.beautyBreakdown?.rebooked ?? '—'}</strong>
        &nbsp;·&nbsp; Rebooking rate (excl. rebooked): <strong style="color:var(--text)">${fmtPct(s.rebookPct)}</strong>
      </div>
    </div>
  </div>

</div>

<!-- ROW 2: DIAL + BRANCH BAR + DONUT -->
<div style="display:grid;grid-template-columns:0.85fr 1.1fr 0.85fr;gap:12px;margin-bottom:12px;align-items:stretch;min-height:460px">

  <!-- Net Revenue Dial -->
  <div class="card" style="margin-bottom:0;border-top:3px solid #99F6E4;display:flex;flex-direction:column;align-items:center;padding:16px 14px;overflow:hidden">
    <div style="width:100%;margin-bottom:4px">
      <div class="metric-label" style="font-size:9px">Net Revenue</div>
      <div style="font-size:9px;color:var(--muted);margin:2px 0 6px"><em>Total sales: services + retail</em></div>
      <div id="revFilterPills" style="display:flex;gap:4px;margin-bottom:4px">
        <button data-rv="both"   style="flex:1;font-size:8px;padding:3px 0;border-radius:10px;border:1px solid var(--border);background:#99F6E4;color:#1a1a1a;cursor:pointer;font-weight:600;transition:all 0.2s">Hair &amp; Beauty</button>
        <button data-rv="hair"   style="flex:1;font-size:8px;padding:3px 0;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--muted);cursor:pointer;transition:all 0.2s">Hair</button>
        <button data-rv="beauty" style="flex:1;font-size:8px;padding:3px 0;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--muted);cursor:pointer;transition:all 0.2s">Beauty</button>
      </div>
    </div>
    <div style="position:relative;width:100%;height:118px;flex-shrink:0;margin:4px auto 0">
      <canvas id="dialCanvas" style="width:100%;height:118px;display:block"></canvas>
      <div style="position:absolute;bottom:6px;left:50%;transform:translateX(-50%);text-align:center;pointer-events:none;white-space:nowrap">
        <div id="dialValueLabel" style="font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:600;color:var(--text);line-height:1">${fmtAED(s.netTake)}</div>
        <div style="font-size:8px;color:var(--muted);letter-spacing:0.1em;text-transform:uppercase;margin-top:2px">actual</div>
      </div>
    </div>
    <div style="width:100%;height:4px;border-radius:2px;background:var(--border);margin-top:10px;overflow:hidden">
      <div id="dialPctFill" style="height:100%;border-radius:2px;background:#99F6E4;width:0%;transition:width 0.5s ease"></div>
    </div>
    <div id="dialPctTxt" style="font-size:10px;color:var(--muted);margin-top:4px;width:100%">— of goal</div>
    <div style="width:100%;margin-top:8px;border-top:1px solid var(--border);padding-top:8px">
      <div class="metric-target" style="font-size:10px">Monthly target: AED 2,000,000</div>
      <div id="dialGoalTag" style="font-size:10px;color:var(--accent);margin-top:4px;font-weight:600"></div>
    </div>
    <div style="width:100%;margin-top:10px;border-top:1px solid var(--border);padding-top:8px">
      <div style="font-size:9px;letter-spacing:0.12em;text-transform:uppercase;color:var(--muted);margin-bottom:6px">Weekly Goals by Branch</div>
      <div id="weeklyGoalsList"></div>
    </div>
  </div>

  <!-- Branch Comparison Bar -->
  <div class="card" style="margin-bottom:0;border-top:3px solid #C4B5FD;padding:16px 14px;display:flex;flex-direction:column;overflow:hidden">
    <div class="metric-label" style="font-size:9px">Performance Across Branches</div>
    <div style="font-size:9px;color:var(--muted);margin:2px 0 6px"><em>Side-by-side · select metric below</em></div>
    <div id="cmpCatPills" style="display:flex;justify-content:center;gap:4px;margin-bottom:6px">
      <button data-cat="hb"     style="font-size:8px;padding:3px 10px;border-radius:10px;border:1px solid var(--border);background:#99F6E4;color:#1a1a1a;cursor:pointer;font-weight:600;transition:all 0.2s">Hair & Beauty</button>
      <button data-cat="hair"   style="font-size:8px;padding:3px 10px;border-radius:10px;border:1px solid var(--border);background:var(--surface2);color:var(--muted);cursor:pointer;font-weight:600;transition:all 0.2s">Hair</button>
      <button data-cat="beauty" style="font-size:8px;padding:3px 10px;border-radius:10px;border:1px solid var(--border);background:var(--surface2);color:var(--muted);cursor:pointer;font-weight:600;transition:all 0.2s">Beauty</button>
    </div>
    <div class="f-pills" id="cmpFilters" style="margin-bottom:10px;flex-wrap:nowrap;overflow-x:auto;padding-bottom:2px">
      <button class="f-pill active" data-m="netTake"        style="white-space:nowrap">Net Revenue</button>
      <button class="f-pill"        data-m="avgBill"         style="white-space:nowrap">Avg Bill</button>
      <button class="f-pill"        data-m="totalClients"    style="white-space:nowrap">Total Clients</button>
      <button class="f-pill"        data-m="totalRebooked"   style="white-space:nowrap">Rebooked Clients</button>
      <button class="f-pill"        data-m="rebookPct"       style="white-space:nowrap">Rebooking %</button>
      <button class="f-pill"        data-m="ncrPct"          style="white-space:nowrap">NCR %</button>
    </div>
    <div style="position:relative;flex:1;min-height:0"><canvas id="cmpChart"></canvas></div>
  </div>

  <!-- Revenue Mix Donut -->
  <div class="card" style="margin-bottom:0;border-top:3px solid #FFD4D9;display:flex;flex-direction:column;align-items:center;padding:16px 14px;overflow:visible">
    <div style="width:100%;margin-bottom:8px;flex-shrink:0">
      <div class="metric-label" style="font-size:9px">Revenue Mix</div>
      <div style="font-size:9px;color:var(--muted);margin:2px 0 0"><em>Hair · Beauty · Retail</em></div>
    </div>
    <div style="position:relative;width:200px;height:200px;flex-shrink:0;margin:auto 0">
      <canvas id="donutChart"></canvas>
      <div class="donut-center">
        <div class="donut-center-val" style="font-size:20px">${(s.netTake/1000000).toFixed(2)}M</div>
        <div class="donut-center-lbl">Net AED</div>
      </div>
    </div>
    <div class="legend" id="donutLegend" style="width:100%;margin-top:12px;flex-shrink:0"></div>
  </div>
</div>

<!-- SUPPORTING METRICS LABEL -->
<div class="section-label" style="display:flex;align-items:center;gap:7px;margin-top:16px;margin-bottom:8px">
  <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#EEF3C7;flex-shrink:0"></span>
  ${branchLabel} · Supporting Metrics
</div>

<!-- REVENUE RUN (always visible) -->
<div class="support-section" style="margin-bottom:8px">
  <div style="display:flex;align-items:center;gap:8px;padding:10px 14px 6px">
    <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#EEF3C7;flex-shrink:0"></span>
    <span class="section-label" style="margin:0;letter-spacing:0.16em">Revenue Run</span>
  </div>
  <div style="padding:0 14px 14px">
    ${(s._retailWarnings && s._retailWarnings.length) ? `
      <div style="margin:8px 0;padding:10px 12px;background:rgba(251,191,36,.08);border-left:3px solid #fbbf24;border-radius:6px;font-size:11px;color:var(--text)">
        <strong style="color:#fbbf24">⚠️ Retail data mismatch detected</strong> across ${s._retailWarnings.length} week(s).
        Daily-sheet sum (used) differs from weekly summary row.
        ${s._retailWarnings.slice(0,3).map(m => `Daily AED ${(m.daily||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})} vs Summary AED ${(m.summary||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})} (${m.pctDiff}% drift)`).join(' · ')}
      </div>
    ` : ''}
    <!-- Revenue Run tab buttons -->
    <div style="display:flex;justify-content:center;gap:6px;padding:10px 0 2px">
      <button onclick="setRevenueTab('hair')" id="rtab-hair" style="font-size:10px;letter-spacing:0.1em;padding:4px 14px;border-radius:20px;border:1px solid var(--border);cursor:pointer;font-weight:600;background:var(--surface2);color:var(--muted);transition:all .15s">Hair</button>
      <button onclick="setRevenueTab('beauty')" id="rtab-beauty" style="font-size:10px;letter-spacing:0.1em;padding:4px 14px;border-radius:20px;border:1px solid var(--border);cursor:pointer;font-weight:600;background:var(--surface2);color:var(--muted);transition:all .15s">Beauty</button>
      <button onclick="setRevenueTab('hb')" id="rtab-hb" style="font-size:10px;letter-spacing:0.1em;padding:4px 14px;border-radius:20px;border:1px solid var(--border);cursor:pointer;font-weight:600;background:var(--surface2);color:var(--muted);transition:all .15s">Hair & Beauty</button>
    </div>
    <!-- HAIR panel -->
    <div id="rpanel-hair" style="display:none;grid-template-columns:repeat(5,1fr);gap:10px;padding:10px 0 4px">
      <div class="metric m-lime">
        <div class="metric-label">Total Service Sales</div>
        <div style="font-size:10px;color:var(--muted);margin:3px 0 7px"><em>(Hair service revenue)</em></div>
        <div class="metric-value" style="font-size:20px">${fmtAED(rvHairSvc)}</div>
        <div class="metric-target">Branch-based target</div>
      </div>
      <div class="metric m-lime">
        <div class="metric-label">Treatment Sales</div>
        <div style="font-size:10px;color:var(--muted);margin:3px 0 7px"><em>(Treatment component of hair services)</em></div>
        <div class="metric-value" style="font-size:20px">${fmtAED(s.treatmentSales||0)}</div>
        <div class="metric-target">—</div>
      </div>
      <div class="metric m-lime">
        <div class="metric-label">Total Retail / Product Sales</div>
        <div style="font-size:10px;color:var(--muted);margin:3px 0 7px"><em>(Total retail / product sales)</em></div>
        <div class="metric-value" style="font-size:20px">${fmtAED(s.hairRetail||0)}</div>
        <div class="metric-target">Branch-based target</div>
      </div>
      <div class="metric m-lime">
        <div class="metric-label">Treatment %</div>
        <div style="font-size:10px;color:var(--muted);margin:3px 0 7px"><em>(Treatment sales ÷ Hair service sales)</em></div>
        <div class="metric-value ${sc(rvHairTxPct, TARGETS.treatmentPct)}" style="font-size:20px">${fmtPct(rvHairTxPct)}</div>
        <div class="metric-target">Target: ≥ ${TARGETS.treatmentPct}%</div>
      </div>
      <div class="metric m-lime">
        <div class="metric-label">Retail %</div>
        <div style="font-size:10px;color:var(--muted);margin:3px 0 7px"><em>(Retail sales ÷ Hair service sales)</em></div>
        <div class="metric-value ${sc(rvHairRetPct, TARGETS.retailPct)}" style="font-size:20px">${fmtPct(rvHairRetPct)}</div>
        <div class="metric-target">Target: ≥ ${TARGETS.retailPct}%</div>
      </div>
    </div>
    <!-- BEAUTY panel -->
    <div id="rpanel-beauty" style="display:none;grid-template-columns:repeat(5,1fr);gap:10px;padding:10px 0 4px">
      <div class="metric m-lime">
        <div class="metric-label">Total Service Sales</div>
        <div style="font-size:10px;color:var(--muted);margin:3px 0 7px"><em>(Beauty service revenue)</em></div>
        <div class="metric-value" style="font-size:20px">${fmtAED(rvBSvc)}</div>
        <div class="metric-target">Branch-based target</div>
      </div>
      <div class="metric m-lime">
        <div class="metric-label">Treatment Sales</div>
        <div style="font-size:10px;color:var(--muted);margin:3px 0 7px"><em>(Beauty treatment split not in data)</em></div>
        <div class="metric-value" style="font-size:20px;color:var(--muted)">—</div>
        <div class="metric-target">—</div>
      </div>
      <div class="metric m-lime">
        <div class="metric-label">Total Retail / Product Sales</div>
        <div style="font-size:10px;color:var(--muted);margin:3px 0 7px"><em>(Total salon retail — not split by dept)</em></div>
        <div class="metric-value" style="font-size:20px">${fmtAED(s.hairRetail||0)}</div>
        <div class="metric-target">Branch-based target</div>
      </div>
      <div class="metric m-lime">
        <div class="metric-label">Treatment %</div>
        <div style="font-size:10px;color:var(--muted);margin:3px 0 7px"><em>(Beauty treatment split not in data)</em></div>
        <div class="metric-value" style="font-size:20px;color:var(--muted)">—</div>
        <div class="metric-target">Target: ≥ ${TARGETS.treatmentPct}%</div>
      </div>
      <div class="metric m-lime">
        <div class="metric-label">Retail %</div>
        <div style="font-size:10px;color:var(--muted);margin:3px 0 7px"><em>(Beauty retail split not in data)</em></div>
        <div class="metric-value" style="font-size:20px;color:var(--muted)">—</div>
        <div class="metric-target">Target: ≥ ${TARGETS.retailPct}%</div>
      </div>
    </div>
    <!-- Hair & Beauty panel -->
    <div id="rpanel-hb" style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;padding:10px 0 4px">
      <div class="metric m-lime">
        <div class="metric-label">Total Service Sales</div>
        <div style="font-size:10px;color:var(--muted);margin:3px 0 7px"><em>(Total service revenue: hair + beauty)</em></div>
        <div class="metric-value" style="font-size:20px">${fmtAED(rvHBSvc)}</div>
        <div class="metric-target">Branch-based target</div>
      </div>
      <div class="metric m-lime">
        <div class="metric-label">Treatment Sales</div>
        <div style="font-size:10px;color:var(--muted);margin:3px 0 7px"><em>(Treatment component of total service sales)</em></div>
        <div class="metric-value" style="font-size:20px">${fmtAED(s.treatmentSales||0)}</div>
        <div class="metric-target">—</div>
      </div>
      <div class="metric m-lime">
        <div class="metric-label">Total Retail / Product Sales</div>
        <div style="font-size:10px;color:var(--muted);margin:3px 0 7px"><em>(Total retail / product sales)</em></div>
        <div class="metric-value" style="font-size:20px">${fmtAED(s.hairRetail||0)}</div>
        <div class="metric-target">Branch-based target</div>
      </div>
      <div class="metric m-lime">
        <div class="metric-label">Treatment %</div>
        <div style="font-size:10px;color:var(--muted);margin:3px 0 7px"><em>(Treatment sales ÷ Total service sales)</em></div>
        <div class="metric-value ${sc(rvHBTxPct, TARGETS.treatmentPct)}" style="font-size:20px">${fmtPct(rvHBTxPct)}</div>
        <div class="metric-target">Target: ≥ ${TARGETS.treatmentPct}%</div>
      </div>
      <div class="metric m-lime">
        <div class="metric-label">Retail %</div>
        <div style="font-size:10px;color:var(--muted);margin:3px 0 7px"><em>(Retail sales ÷ Total service sales)</em></div>
        <div class="metric-value ${sc(rvHBRetPct, TARGETS.retailPct)}" style="font-size:20px">${fmtPct(rvHBRetPct)}</div>
        <div class="metric-target">Target: ≥ ${TARGETS.retailPct}%</div>
      </div>
    </div>
  </div>
</div>


<!-- RETENTION + CONVERSION — flat row before Operations -->
<div style="display:flex;gap:12px;margin-bottom:8px">
  <div class="metric m-rose" style="flex:1">
    <div class="metric-label">Retention %</div>
    <div style="font-size:10px;color:var(--muted);margin:3px 0 7px"><em>(Returning clients over time)</em></div>
    <div class="metric-value ${sc(s.retentionPct||0, 60)}" style="font-size:20px">${fmtPct(s.retentionPct||0)}</div>
    <div class="metric-target">Target: ≥ 60–70%</div>
  </div>
  <div class="metric m-rose" style="flex:1">
    <div class="metric-label">Conversion %</div>
    <div style="font-size:10px;color:var(--muted);margin:3px 0 7px"><em>(New → returning clients)</em></div>
    <div class="metric-value" style="font-size:16px;color:var(--muted);font-style:italic">Jul 2026</div>
    <div class="metric-target" style="color:var(--muted)">Cohort data maturing</div>
  </div>
</div>

<!-- OPERATIONS (collapsible) -->
<div class="support-section" style="margin-bottom:8px">
  <div class="support-section-hdr" onclick="toggleSection('opsRun')">
    <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0">
      <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#99F6E4;flex-shrink:0"></span>
      <span class="section-label" style="margin:0;letter-spacing:0.16em;flex-shrink:0;white-space:nowrap">Operations</span>
      <span style="font-size:10px;color:var(--muted);font-weight:400;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0">Utilisation % · Hair Utilisation % · Beauty Utilisation %</span>
    </div>
    <span class="sect-period-badge">${sectionPeriodLabel}</span>
    <span class="support-toggle-arrow" id="arrow-opsRun">›</span>
  </div>
  <div class="support-section-body" id="body-opsRun">
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:12px 0 4px">
      <div class="metric m-turq">
        <div class="metric-label">Utilisation %</div>
        <div class="metric-value" style="font-size:20px">—</div>
        <div class="metric-target">Target: ≥ 75–85%</div>
      </div>
      <div class="metric m-turq">
        <div class="metric-label">Hair Utilisation %</div>
        <div class="metric-value" style="font-size:20px">—</div>
        <div class="metric-target">Target: ≥ 80%</div>
      </div>
      <div class="metric m-turq">
        <div class="metric-label">Beauty Utilisation %</div>
        <div class="metric-value" style="font-size:20px">—</div>
        <div class="metric-target">Target: ≥ 70%</div>
      </div>
    </div>
  </div>
</div>
  `;

  // ── Branch Comparison chart ──
  const byBranch = aggByBranch();
  let cmpMetric  = 'netTake';
  let cmpCat     = 'hb';

  const rebuildCmp = () => {
    if (charts.cmp) charts.cmp.destroy();
    buildCmpChart(byBranch, cmpMetric, dark, ttStyle, gc, tc, cmpCat);
  };

  rebuildCmp();

  document.getElementById('cmpFilters').addEventListener('click', e => {
    const btn = e.target.closest('.f-pill'); if (!btn) return;
    cmpMetric = btn.dataset.m;
    document.querySelectorAll('#cmpFilters .f-pill').forEach(p => p.classList.toggle('active', p === btn));
    rebuildCmp();
  });

  document.getElementById('cmpCatPills').addEventListener('click', e => {
    const btn = e.target.closest('[data-cat]'); if (!btn) return;
    cmpCat = btn.dataset.cat;
    const active = { hb: '#99F6E4', hair: '#99F6E4', beauty: '#99F6E4' };
    document.querySelectorAll('#cmpCatPills [data-cat]').forEach(p => {
      const isActive = p === btn;
      p.style.background = isActive ? '#99F6E4' : 'var(--surface2)';
      p.style.color       = isActive ? '#1a1a1a' : 'var(--muted)';
    });
    rebuildCmp();
  });

  restoreSections();

  // ── Header Net Revenue widget ──
  (function() {
    const w = document.getElementById('headerRevWidget');
    if (!w) return;
    const hairNet   = (s.netTake||0) - (s.beautySales||0);
    const beautyNet = s.beautySales || 0;
    const total     = s.netTake || 0;
    const fmtShort = v => {
      if (v >= 1000000) return 'AED ' + (v/1000000).toFixed(2) + 'M';
      if (v >= 1000)    return 'AED ' + (v/1000).toFixed(2) + 'k';
      return 'AED ' + v.toFixed(2);
    };
    const divider = `border-right:1px solid ${dark?'rgba(255,255,255,0.1)':'rgba(92,85,87,0.15)'}`;
    const hairCol   = dark ? '#C4B5FD' : '#5B4A8A';
    const beautyCol = dark ? '#99F6E4' : '#0A5244';
    const bothCol   = dark ? 'rgba(250,248,243,0.45)' : 'rgba(92,85,87,0.6)';
    const pill = (label, val, col, extra='') => `
      <div style="display:flex;flex-direction:column;align-items:center;gap:2px;padding:4px 12px;${extra}">
        <span style="font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:${col};white-space:nowrap;font-weight:600">${label}</span>
        <span style="font-size:11px;font-weight:800;color:var(--text);white-space:nowrap">${fmtShort(val)}</span>
      </div>`;
    w.style.display = 'flex';
    w.style.padding = '0';
    w.style.overflow = 'hidden';
    w.style.background = dark ? 'rgba(153,246,228,0.08)' : 'rgba(92,85,87,0.06)';
    w.style.borderColor = dark ? 'rgba(153,246,228,0.25)' : 'rgba(92,85,87,0.2)';
    w.innerHTML =
      pill('Hair', hairNet, hairCol, divider) +
      pill('Beauty', beautyNet, beautyCol, divider) +
      pill('Hair &amp; Beauty', total, bothCol);
  })();

  // ── Dial (gauge) chart ──
  (function () {
    const WEEKLY_GOALS_MAP = { SAA:[450000,550000], KCA:[320000,420000], AQ:[500000,650000], MC:[350000,450000], FRT:[200000,260000] };
    const BRANCH_LIST = [
      {code:'SAA',name:'Saadiyat',    color:'#C4B5FD', both:[450,550], hair:[315,385], beauty:[135,165]},
      {code:'KCA',name:'Khalifa City',color:'#FFD4D9', both:[320,420], hair:[225,295], beauty:[ 95,125]},
      {code:'AQ', name:'Al Quoz',     color:'#FF9B9B', both:[500,650], hair:[350,455], beauty:[150,195]},
      {code:'MC', name:'Motor City',  color:'#99F6E4', both:[350,450], hair:[245,315], beauty:[105,135]},
      {code:'FRT',name:'Fratelli',    color:'#EEF3C7', both:[200,260], hair:[140,182], beauty:[ 60, 78]},
    ];
    const activeBranches = sel.branch.includes('all') ? Object.keys(WEEKLY_GOALS_MAP) : sel.branch;
    const hasDateRange = !!(dateFrom && dateTo);
    let weekCount = 1;
    if (!hasDateRange) {
    const weekSet = new Set((filtered||[]).map(d => d.week_label));
      const branchCount = activeBranches.length || 1;
      weekCount = Math.max(1, Math.round(weekSet.size / branchCount));
    } else {
      const diffDays = Math.round((dateTo - dateFrom) / (1000*60*60*24)) + 1;
      weekCount = Math.max(1, Math.round(diffDays / 7));
    }
    let wMin = 0, wMax = 0;
    activeBranches.forEach(b => { if (WEEKLY_GOALS_MAP[b]) { wMin += WEEKLY_GOALS_MAP[b][0]; wMax += WEEKLY_GOALS_MAP[b][1]; } });
    wMin = wMin||1820000; wMax = wMax||2330000;
    const gMin = wMin * weekCount, gMax = wMax * weekCount;
    const goalMid = (gMin + gMax) / 2;
    const pct = Math.min(s.netTake / goalMid, 1.05);
    const periodLabel = hasDateRange ? `${weekCount} week${weekCount>1?'s':''}` : weekCount === 4 ? 'month (~4 wks)' : weekCount + ' week' + (weekCount>1?'s':'');

    const hairTxVal = Math.max(0, s.netTake - s.beautySales - s.hairRetail);
    const revenueByView = { both: s.netTake, hair: hairTxVal + (s.hairRetail||0), beauty: s.beautySales };
    const goalMidByView = { both: goalMid, hair: goalMid * 0.7, beauty: goalMid * 0.3 };

    let dialView = window._dialView || 'both';

    function drawDial(view) {
      window._dialView = view;
      const revenue = revenueByView[view] || 0;
      const gMid    = goalMidByView[view] || 1;
      const p       = Math.min(revenue / gMid, 1.05);
      const canvas  = document.getElementById('dialCanvas');
      if (canvas) {
        const w = canvas.parentElement?.offsetWidth || canvas.offsetWidth || 220;
        canvas.width = w; canvas.height = 118;
        const ctx = canvas.getContext('2d');
        const W = canvas.width, H = canvas.height;
        ctx.clearRect(0, 0, W, H);
        const cx = W/2, cy = H-8;
        const r = Math.min(W/2-10, H-16);
        const SA = Math.PI, EA = 2*Math.PI;
        ctx.beginPath(); ctx.arc(cx, cy, r, SA, EA);
        ctx.strokeStyle = dark ? 'rgba(250,248,243,0.1)' : 'rgba(92,85,87,0.12)';
        ctx.lineWidth = 13; ctx.lineCap = 'round'; ctx.stroke();
        const fillEnd = SA + (EA-SA) * Math.min(p, 1);
        const grad = ctx.createLinearGradient(cx-r, cy, cx+r, cy);
        grad.addColorStop(0, '#C4B5FD'); grad.addColorStop(0.5, '#99F6E4'); grad.addColorStop(1, '#EEF3C7');
        ctx.beginPath(); ctx.arc(cx, cy, r, SA, fillEnd);
        ctx.strokeStyle = grad; ctx.lineWidth = 13; ctx.lineCap = 'round'; ctx.stroke();
        const kx = cx + r*Math.cos(fillEnd), ky = cy + r*Math.sin(fillEnd);
        ctx.beginPath(); ctx.arc(kx, ky, 7, 0, 2*Math.PI); ctx.fillStyle = '#FAF8F3'; ctx.fill();
        ctx.beginPath(); ctx.arc(kx, ky, 4, 0, 2*Math.PI); ctx.fillStyle = '#99F6E4';  ctx.fill();
      }
      const pctNum = Math.round(p * 100);
      const fillEl = document.getElementById('dialPctFill');
      const txtEl  = document.getElementById('dialPctTxt');
      const tagEl  = document.getElementById('dialGoalTag');
      const valEl  = document.getElementById('dialValueLabel');
      if (fillEl) { fillEl.style.width = Math.min(p*100,100)+'%'; fillEl.style.background = p>=1?'#99F6E4':p>=0.8?'#EEF3C7':'#FF9B9B'; }
      if (txtEl)  txtEl.textContent = pctNum + '% of ' + periodLabel + ' goal';
      if (tagEl)  tagEl.textContent = 'Weekly target: AED ' + (wMin/1000).toFixed(0) + 'k–' + (wMax/1000).toFixed(0) + 'k / week';
      if (valEl)  valEl.textContent = fmtAED(revenue);

      const listEl = document.getElementById('weeklyGoalsList');
      if (listEl) {
        const viewKey = view === 'both' ? 'both' : view === 'hair' ? 'hair' : 'beauty';
        listEl.innerHTML = BRANCH_LIST.filter(b => b.code !== 'FRT' || window.showFratelli).map(b => {
          const [lo, hi] = b[viewKey];
          return `<div style="display:flex;align-items:center;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--border2)">
            <div style="display:flex;align-items:center;gap:5px">
              <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${b.color};flex-shrink:0"></span>
              <span style="font-size:10px;color:var(--muted)">${b.name}</span>
            </div>
            <span style="font-size:10px;font-weight:600;color:var(--text)">AED ${lo}–${hi}k</span>
          </div>`;
        }).join('');
      }
    }

    requestAnimationFrame(() => drawDial(dialView));

    // Filter pills
    const pills = document.querySelectorAll('#revFilterPills button');
    pills.forEach(btn => {
      const active = btn.dataset.rv === dialView;
      btn.style.background  = active ? '#99F6E4' : 'var(--card)';
      btn.style.color       = active ? '#1a1a1a' : 'var(--muted)';
      btn.style.fontWeight  = active ? '600' : '400';
      btn.addEventListener('click', () => {
        dialView = btn.dataset.rv;
        pills.forEach(p => { p.style.background='var(--card)'; p.style.color='var(--muted)'; p.style.fontWeight='400'; });
        btn.style.background='#99F6E4'; btn.style.color='#1a1a1a'; btn.style.fontWeight='600';
        drawDial(dialView);
      });
    });

    // Redraw on resize
    if (window.ResizeObserver) {
      const canvas = document.getElementById('dialCanvas');
      if (canvas) {
        if (window._dialResizeObs) window._dialResizeObs.disconnect();
        window._dialResizeObs = new ResizeObserver(() => requestAnimationFrame(() => drawDial(window._dialView || 'both')));
        window._dialResizeObs.observe(canvas.parentElement);
      }
    }
  })();

  // ── Donut chart ──
  const hairTx      = Math.max(0, s.netTake - s.beautySales - s.hairRetail);
  const donutData   = [hairTx, s.beautySales, s.hairRetail];
  const donutLabels = ['Hair + Tx','Beauty','Retail'];
  const donutTotal  = donutData.reduce((a,b) => a+b, 0) || 1;

  charts.donut = new Chart(document.getElementById('donutChart'), {
    type: 'doughnut',
    data: { labels: donutLabels, datasets: [{ data: donutData, backgroundColor: donutColors, borderColor: donutBorder, borderWidth: 2, hoverOffset: 4 }] },
    options: { cutout:'62%', responsive:true, maintainAspectRatio:false, animation:{animateRotate:true,duration:600,easing:'easeInOutQuart'}, clip:false,
      plugins: { legend:{display:false}, tooltip:{...ttStyle, padding:10, boxPadding:4, callbacks:{label:c=>` ${c.label}: ${fmtAED(c.raw)} (${(c.raw/donutTotal*100).toFixed(2)}%)`}} }
    }
  });
  document.getElementById('donutLegend').innerHTML = donutLabels.map((lbl,i) => `
    <div style="display:flex;align-items:center;justify-content:space-between;font-size:10px;gap:6px;margin-bottom:5px">
      <div style="display:flex;align-items:center;gap:5px">
        <div style="width:7px;height:7px;border-radius:50%;background:${donutColors[i]};flex-shrink:0"></div>
        <span style="color:var(--muted)">${lbl}</span>
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        <span style="color:var(--text);font-weight:500">${fmtAED(donutData[i])}</span>
        <span style="color:var(--muted2);min-width:28px;text-align:right">${Math.round(donutData[i]/donutTotal*100)}%</span>
      </div>
    </div>`).join('');

  // Init client breakdown donuts (panel is open by default)
  _initCbDonuts();
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
  Object.keys(BRANCH_INFO).forEach(code => {
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

  const activeBranchesT = sel.branch.includes('all') ? Object.keys(BRANCH_INFO) : sel.branch;
  const allHairWithBranch   = [];
  const allBeautyWithBranch = [];
  activeBranchesT.forEach(code => {
    const bd = byBranchT[code]; if (!bd) return;
    bd.hairStaff.forEach(st   => allHairWithBranch.push({   ...st, branchCode:code, branchName:BRANCH_INFO[code].name, branchColor:BRANCH_INFO[code].color }));
    bd.beautyStaff.forEach(st => allBeautyWithBranch.push({ ...st, branchCode:code, branchName:BRANCH_INFO[code].name, branchColor:BRANCH_INFO[code].color, isBeauty:true }));
  });

  // build cross-branch all-time stylist map for comparator
  const cmpBranchMap = {};
  Object.keys(BRANCH_INFO).forEach(code => {
    const allRows = allData.filter(d => d.branch === code);
    const bdAll   = aggData(allRows.map(d => d.data));
    if (!bdAll) return;
    const all = [
      ...bdAll.hairStaff.map(s   => ({ ...s, isBeauty:false, branchCode:code, branchName:BRANCH_INFO[code].name, branchColor:BRANCH_INFO[code].color })),
      ...bdAll.beautyStaff.map(s => ({ ...s, isBeauty:true,  branchCode:code, branchName:BRANCH_INFO[code].name, branchColor:BRANCH_INFO[code].color })),
    ];
    if (all.length) cmpBranchMap[code] = all;
  });

  teamContent.innerHTML = `

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
        ${Object.entries(BRANCH_INFO).map(([k,v]) => `<option value="${k}">${v.name}</option>`).join('')}
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
              <span style="font-size:12px;font-weight:600;color:var(--text)">${st.name}</span>
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
          <div style="font-family:'Cormorant Garamond',serif;font-size:16px;font-weight:600;color:var(--text);line-height:1">${st.name}</div>
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
          <div style="font-family:'Cormorant Garamond',serif;font-size:14px;font-weight:600;color:var(--text);line-height:1">${st.name}</div>
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

    const headerHTML = `
      <colgroup><col style="width:30px"><col style="width:90px"><col style="width:130px"><col><col><col><col><col><col><col><col><col><col><col><col><col></colgroup>
      <thead>
        <tr style="background:var(--surface2)">
          <th colspan="3" style="padding:6px 10px 4px;border-bottom:1px solid var(--border)"></th>
          <th colspan="4" style="padding:6px 10px 4px;font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:#EEF3C7;font-weight:700;border-bottom:1px solid var(--border);border-left:2px solid #EEF3C744">REVENUE</th>
          <th colspan="5" style="padding:6px 10px 4px;font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:#C4B5FD;font-weight:700;border-bottom:1px solid var(--border);border-left:2px solid #C4B5FD44">CLIENTS</th>
          <th colspan="3" style="padding:6px 10px 4px;font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:#FFD4D9;font-weight:700;border-bottom:1px solid var(--border);border-left:2px solid #FFD4D944">RETENTION</th>
          <th colspan="1" style="padding:6px 10px 4px;font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:#99F6E4;font-weight:700;border-bottom:1px solid var(--border);border-left:2px solid #99F6E444">OPS</th>
        </tr>
        <tr>
          <th style="width:30px">#</th>
          <th>Branch</th>
          <th class="sortable${hairSortT.col==='name'?' sort-'+hairSortT.dir:''}" onclick="sortTeamHair('name')">Stylist</th>
          <th class="sortable${hairSortT.col==='serviceSales'?' sort-'+hairSortT.dir:''}" onclick="sortTeamHair('serviceSales')" style="border-left:2px solid #EEF3C744">Service Sales</th>
          <th class="sortable${hairSortT.col==='treatmentPct'?' sort-'+hairSortT.dir:''}"   onclick="sortTeamHair('treatmentPct')">Treatment %</th>
          <th class="sortable${hairSortT.col==='retailPct'?' sort-'+hairSortT.dir:''}"      onclick="sortTeamHair('retailPct')">Retail %</th>
          <th class="sortable${hairSortT.col==='avgBill'?' sort-'+hairSortT.dir:''}"        onclick="sortTeamHair('avgBill')">Hair Avg Bill</th>
          <th class="sortable${hairSortT.col==='newC'?' sort-'+hairSortT.dir:''}"           onclick="sortTeamHair('newC')" style="border-left:2px solid #C4B5FD44">New Clients</th>
          <th class="sortable${hairSortT.col==='ncrCount'?' sort-'+hairSortT.dir:''}"       onclick="sortTeamHair('ncrCount')">NCR</th>
          <th class="sortable${hairSortT.col==='ncrPct'?' sort-'+hairSortT.dir:''}"         onclick="sortTeamHair('ncrPct')">Request %</th>
          <th class="sortable${hairSortT.col==='salonPct'?' sort-'+hairSortT.dir:''}"       onclick="sortTeamHair('salonPct')">Salon %</th>
          <th class="sortable${hairSortT.col==='newClientPct'?' sort-'+hairSortT.dir:''}"   onclick="sortTeamHair('newClientPct')">New %</th>
          <th class="sortable${hairSortT.col==='rebookPct'?' sort-'+hairSortT.dir:''}"      onclick="sortTeamHair('rebookPct')" style="border-left:2px solid #FFD4D944">Hair Rebook %</th>
          <th class="sortable${hairSortT.col==='retentionPct'?' sort-'+hairSortT.dir:''}"   onclick="sortTeamHair('retentionPct')">Retention %</th>
          <th class="sortable${hairSortT.col==='conversionPct'?' sort-'+hairSortT.dir:''}"  onclick="sortTeamHair('conversionPct')">Conversion %</th>
          <th style="border-left:2px solid #99F6E444">Utilisation %</th>
        </tr>
      </thead>`;

    const rows = sorted.map((st,i) => {
      const br             = getStBranch(st.name, false);
      const totalRev       = st.hairSalesNet||0;
      const serviceSales   = totalRev - (st.retail||0);
      const treatmentPct   = totalRev ? ((st.treatments||0)/totalRev*100) : 0;
      const retailPct      = totalRev ? ((st.retail||0)/totalRev*100) : 0;
      const ncrCount       = Math.round((st.ncrPct||0)/100*(st.total||0));
      const salonPct       = 100 - (st.ncrPct||0);
      const newClientPct   = st.total ? ((st.newC||0)/st.total*100) : 0;
      const retentionPct   = st.retentionPct||0;
      const conversionPct  = st.conversionPct||0;
      return `<tr>
        <td style="color:var(--muted2);font-size:11px">${i+1}</td>
        <td><span style="display:inline-flex;align-items:center;gap:5px"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${br.color};flex-shrink:0"></span><span style="font-size:11px;color:var(--muted);white-space:nowrap">${br.name}</span></span></td>
        <td><span style="display:flex;align-items:center;gap:7px"><span style="width:22px;height:22px;border-radius:50%;background:${st.color};display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#2D2E37;flex-shrink:0">${initials(st.name)}</span><span style="font-size:12px;font-weight:600;color:var(--text)">${st.name}</span></span></td>
        <td style="border-left:2px solid #EEF3C722">${fmtAED(serviceSales)}</td>
        <td><span class="badge ${sc(treatmentPct,TARGETS.treatmentPct)}">${fmtPct(treatmentPct)}</span></td>
        <td><span class="badge ${sc(retailPct,TARGETS.retailPct)}">${fmtPct(retailPct)}</span></td>
        <td><span class="badge ${sc(st.avgBill,TARGETS.hairAvgBill)}">${fmtAED(st.avgBill)}</span></td>
        <td style="border-left:2px solid #C4B5FD22">${st.newC||0}</td>
        <td>${ncrCount}</td>
        <td><span class="badge ${sc(st.ncrPct||0,40)}">${fmtPct(st.ncrPct||0)}</span></td>
        <td>${fmtPct(salonPct)}</td>
        <td><span class="badge ${sc(newClientPct,20)}">${fmtPct(newClientPct)}</span></td>
        <td style="border-left:2px solid #FFD4D922"><span class="badge ${sc(st.rebookPct,50)}">${fmtPct(st.rebookPct)}</span></td>
        <td><span class="badge ${sc(retentionPct,60)}">${fmtPct(retentionPct)}</span></td>
        <td><span class="badge ${sc(conversionPct,50)}">${fmtPct(conversionPct)}</span></td>
        <td style="border-left:2px solid #99F6E422;color:var(--muted2)">—</td>
      </tr>`;
    }).join('');
    document.getElementById('tTabHair').innerHTML = `<table style="min-width:1100px">${headerHTML}<tbody>${rows}</tbody></table>`;
  }

  function renderTeamBeautyTable() {
    const sorted = [...d.beautyStaff].sort((a,b) => beautySortT.dir==='asc' ? (a[beautySortT.col]||0)-(b[beautySortT.col]||0) : (b[beautySortT.col]||0)-(a[beautySortT.col]||0));
    const headerHTML = `
      <colgroup><col style="width:30px"><col style="width:90px"><col style="width:130px"><col><col><col><col><col><col><col></colgroup>
      <thead>
        <tr style="background:var(--surface2)">
          <th colspan="3" style="padding:6px 10px 4px;border-bottom:1px solid var(--border)"></th>
          <th colspan="2" style="padding:6px 10px 4px;font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:#EEF3C7;font-weight:700;border-bottom:1px solid var(--border);border-left:2px solid #EEF3C744">REVENUE</th>
          <th colspan="3" style="padding:6px 10px 4px;font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:#C4B5FD;font-weight:700;border-bottom:1px solid var(--border);border-left:2px solid #C4B5FD44">CLIENTS</th>
          <th colspan="2" style="padding:6px 10px 4px;font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:#FFD4D9;font-weight:700;border-bottom:1px solid var(--border);border-left:2px solid #FFD4D944">RETENTION</th>
        </tr>
        <tr>
          <th style="width:30px">#</th><th>Branch</th>
          <th class="sortable${beautySortT.col==='name'?' sort-'+beautySortT.dir:''}" onclick="sortTeamBeauty('name')">Therapist</th>
          <th class="sortable${beautySortT.col==='beautySales'?' sort-'+beautySortT.dir:''}" onclick="sortTeamBeauty('beautySales')" style="border-left:2px solid #EEF3C744">Beauty Sales</th>
          <th class="sortable${beautySortT.col==='avgBill'?' sort-'+beautySortT.dir:''}"     onclick="sortTeamBeauty('avgBill')">Beauty Avg Bill</th>
          <th class="sortable${beautySortT.col==='total'?' sort-'+beautySortT.dir:''}"       onclick="sortTeamBeauty('total')" style="border-left:2px solid #C4B5FD44">Total Clients</th>
          <th class="sortable${beautySortT.col==='newC'?' sort-'+beautySortT.dir:''}"        onclick="sortTeamBeauty('newC')">New Clients</th>
          <th class="sortable${beautySortT.col==='ncrPct'?' sort-'+beautySortT.dir:''}"      onclick="sortTeamBeauty('ncrPct')">NCR %</th>
          <th class="sortable${beautySortT.col==='rebookPct'?' sort-'+beautySortT.dir:''}"   onclick="sortTeamBeauty('rebookPct')" style="border-left:2px solid #FFD4D944">Beauty Rebook %</th>
          <th class="sortable${beautySortT.col==='conversionPct'?' sort-'+beautySortT.dir:''}" onclick="sortTeamBeauty('conversionPct')">Conversion %</th>
        </tr>
      </thead>`;
    const rows = sorted.map((st,i) => {
      const br = getStBranch(st.name, true);
      const conversionPct = st.conversionPct||0;
      return `<tr>
        <td style="color:var(--muted2);font-size:11px">${i+1}</td>
        <td><span style="display:inline-flex;align-items:center;gap:5px"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${br.color};flex-shrink:0"></span><span style="font-size:11px;color:var(--muted);white-space:nowrap">${br.name}</span></span></td>
        <td><span style="display:flex;align-items:center;gap:7px"><span style="width:22px;height:22px;border-radius:50%;background:${st.color};display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#2D2E37;flex-shrink:0">${initials(st.name)}</span><span style="font-size:12px;font-weight:600;color:var(--text)">${st.name}</span></span></td>
        <td style="border-left:2px solid #EEF3C722">${fmtAED(st.beautySales)}</td>
        <td><span class="badge ${sc(st.avgBill,TARGETS.beautyAvgBill)}">${fmtAED(st.avgBill)}</span></td>
        <td style="border-left:2px solid #C4B5FD22">${st.total||0}</td>
        <td>${st.newC||0}</td>
        <td><span class="badge ${sc(st.ncrPct||0,20)}">${fmtPct(st.ncrPct||0)}</span></td>
        <td style="border-left:2px solid #FFD4D922"><span class="badge ${sc(st.rebookPct,40)}">${fmtPct(st.rebookPct)}</span></td>
        <td><span class="badge ${sc(conversionPct,40)}">${fmtPct(conversionPct)}</span></td>
      </tr>`;
    }).join('');
    document.getElementById('tTabBeauty').innerHTML = `<table style="min-width:800px">${headerHTML}<tbody>${rows}</tbody></table>`;
  }

  window.sortTeamHair = function(col) {
    hairSortT.dir = hairSortT.col === col ? (hairSortT.dir==='asc'?'desc':'asc') : 'desc';
    hairSortT.col = col;
    d.hairStaff.forEach(st => {

      console.log('RETAIL DEBUG:', {
        name: st.name,
        retail: st.retail,
        hair: st.hairSalesNet,
        beauty: st.beautySales
      });

      const totalRev = (st.hairSalesNet || 0) + (st.beautySales || 0);

      const retailVal = Number(st.retail) || 0;
      
      st.retailPct = totalRev && retailVal
        ? (retailVal / totalRev * 100)
        : 0;
      
      // optional debug
      if (!st.retail || st.retail === 0) {
        console.warn('⚠️ Retail missing for:', st.name);
      }
      
      st.serviceSales  = totalRev - (st.retail || 0);
      st.treatmentPct  = totalRev ? ((st.treatments || 0) / totalRev * 100) : 0;
      st.ncrCount      = Math.round((st.ncrPct||0)/100*(st.total||0));
      st.salonPct      = 100-(st.ncrPct||0);
      st.newClientPct  = st.total?((st.newC||0)/st.total*100):0;
      const _ret = (st.req||0) + (st.salon||0);
      st.retentionPct  = st.total ? (_ret / st.total * 100) : 0;
      st.conversionPct = _ret    ? ((st.rebooked||0) / _ret * 100) : 0;
      st.branchName    = getStBranch(st.name,false).name;
    });
    renderTeamHairTable();
  };

  window.sortTeamBeauty = function(col) {
    beautySortT.dir = beautySortT.col === col ? (beautySortT.dir==='asc'?'desc':'asc') : 'desc';
    beautySortT.col = col;
    d.beautyStaff.forEach(st => { /* retentionPct + conversionPct already computed in aggData */ });
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
  const branches = Object.entries(BRANCH_INFO).map(([k,v]) => ({ val:k, label:v.name }));
  buildDrop('branch', branches);
  rebuildDependentDrops();
  setMTDRange();
  renderDashboard();
  // Use latest daily_data upload for the freshness badge
  const { data: dailyMeta } = await sb.from('daily_data').select('uploaded_at').order('uploaded_at', { ascending: false }).limit(1);
  const badgeSource = (dailyMeta && dailyMeta.length) ? dailyMeta : data;
  if (badgeSource.length) {
    const latest = new Date(badgeSource[badgeSource.length-1].uploaded_at);
    const now = new Date();
    const diffDays = Math.floor((now - latest) / (1000 * 60 * 60 * 24));
    const staleColor = diffDays === 0 ? '#99F6E4' : diffDays <= 2 ? '#FFD4D9' : '#FF6B6B';
    const staleLabel = diffDays === 0 ? 'Live' : diffDays === 1 ? '1 day ago' : `${diffDays} days ago`;
    document.getElementById('lastUpdated').innerHTML =
      'Data: ' + latest.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})
      + ' &nbsp;<span style="color:' + staleColor + ';font-weight:600">(' + staleLabel + ')</span>'
      + '<br><span style="font-size:10px;letter-spacing:0.04em;opacity:0.7">Gulf Standard Time +04:00</span>';

    fetch('https://api.github.com/repos/katealsaybar/tararosesalon-dashboard-all/commits?per_page=1')
      .then(r => r.json())
      .then(commits => {
        const commitDate = new Date(commits[0].commit.author.date);
        const localDate = new Date(commitDate);
const dateStr = localDate.toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric'});
const timeStr = localDate.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit', hour12:true});
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const el = document.getElementById('lastUpdated');
el.innerHTML += '<br><span style="font-size:9px;letter-spacing:0.06em;opacity:0.5">Last edit: ' + dateStr + ', ' + timeStr + ' (' + tz + ')</span>';
      })
      .catch(() => {});
  }
}

// ── STARTUP ──────────────────────────────────────────────────

// Init is triggered by doLogin() and checkSession() in index.html


// ══════════════════════════════════════════════════════════════
//  SERVICES + CLIENTS
// ══════════════════════════════════════════════════════════════

function _svcBranches() {
  return Object.entries(BRANCH_INFO).filter(([k]) => k !== 'FRT');
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
              <td style="font-weight:500;font-size:12px">${r.service_name||'—'}</td>
              <td><span class="badge" style="background:var(--surface2);color:var(--muted);font-size:10px">${r.category||'—'}</span></td>
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
                    <td style="font-size:11px;font-weight:500;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.service_name||''}">${r.service_name||'—'}</td>
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
                  <div style="width:26px;height:26px;border-radius:50%;background:${avColor};display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#2D2E37;flex-shrink:0">${initials}</div>
                  <span style="font-weight:500;font-size:12px">${r.client_name||'—'}</span>
                </div>
              </td>
              <td style="text-align:right;font-family:'Cormorant Garamond',serif;font-size:15px;font-weight:600">${_fmtAed(rev)}</td>
              <td style="text-align:right;color:var(--muted)">${(r.visit_count||0).toLocaleString()}</td>
              <td style="color:var(--muted);font-size:11px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.top_service||''}">${r.top_service||'—'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}
