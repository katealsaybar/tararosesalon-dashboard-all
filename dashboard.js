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
  { key: 'ncrPct',      label: 'NCR %'         },
];

const rankColors  = ['gold','silver','bronze'];
const rankSymbols = ['🥇','🥈','🥉'];

// ── STATE ───────────────────────────────────────────────────

let allData = [];
let charts  = {};
const sel   = { branch: ['all'] };
let dateFrom = null; // JS Date object
let dateTo   = null; // JS Date object

// collapsible section open/close state (persists across re-renders)
const sectionState = { revenueRun: false, clientRun: false, retentionRun: false, opsRun: false };


// ── THEME ───────────────────────────────────────────────────

function toggleTheme() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', dark ? 'light' : 'dark');
  document.getElementById('themeLbl').textContent = dark ? 'Light' : 'Dark';
  if (Object.keys(charts).length) renderDashboard();
}
const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';


// ── FORMATTERS / HELPERS ────────────────────────────────────

const sc = (v, t) => {
  if (!t) return '';
  const ratio = v / t;
  if (ratio >= 1)   return 'good';
  if (ratio >= 0.8) return '';
  return 'bad';
};
const fmtAED = n  => 'AED ' + Math.round(n || 0).toLocaleString();
const fmtPct = n  => (+(n || 0)).toFixed(1) + '%';
const initials = name => name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

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
  const isAll = sel[key].includes('all');
  drop.innerHTML = `
    <div class="ms-opt all-opt ${isAll ? 'selected' : ''}" data-val="all" onclick="toggleOpt('${key}','all')">All Branches</div>
    ${options.map(o => {
      const active = !isAll && sel[key].includes(o.val);
      const dot = BRANCH_INFO[o.val]
        ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${BRANCH_INFO[o.val].color};flex-shrink:0;margin-right:2px"></span>` : '';
      return `<div class="ms-opt ${active ? 'selected' : ''}" data-val="${o.val}" onclick="toggleOpt('${key}','${o.val}')">${dot}${o.label}</div>`;
    }).join('')}`;
  updateLabel(key, options);
}

function toggleOpt(key, val) {
  if (val === 'all') { sel[key] = ['all']; }
  else {
    sel[key] = sel[key].filter(x => x !== 'all');
    if (sel[key].includes(val)) sel[key] = sel[key].filter(x => x !== val);
    else sel[key].push(val);
    if (!sel[key].length) sel[key] = ['all'];
  }
  rebuildDependentDrops();

  const drop    = document.getElementById('drop-' + key);
  const isAllNow = sel[key].includes('all');
  drop.querySelectorAll('.ms-opt').forEach(el => {
    const v = el.dataset.val;
    if (el.classList.contains('all-opt')) el.classList.toggle('selected', isAllNow);
    else el.classList.toggle('selected', !isAllNow && sel[key].includes(v));
  });
  drop.classList.add('open');
  document.getElementById('btn-' + key).classList.add('open');
  const allOptions = [...drop.querySelectorAll('.ms-opt:not(.all-opt)')].map(el => ({ val: el.dataset.val, label: el.textContent.trim() }));
  updateLabel(key, allOptions);
  renderDashboard().then(() => {
    const teamView = document.getElementById('view-team');
    if (teamView && teamView.style.display !== 'none') renderTeam();
  });
}

function rebuildDependentDrops() {
  // Branch dropdown only now — date range handles time filtering
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
    lbl.textContent = 'Select Date/s From and To';
  } else {
    const fmt = d => d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'2-digit' });
    lbl.textContent = dateTo && dateTo.getTime() !== dateFrom.getTime()
      ? `${fmt(dateFrom)} – ${fmt(dateTo)}`
      : fmt(dateFrom);
  }
  const pop = document.getElementById('datePickerPop');
  const btn = document.getElementById('btn-daterange');
  if (pop) { pop.style.display = 'none'; pop.classList.remove('open'); }
  if (btn) btn.classList.remove('active');
  renderDashboard().then(() => {
    const teamView = document.getElementById('view-team');
    if (teamView && teamView.style.display !== 'none') renderTeam();
  });
}

function clearDateRange() {
  dateFrom = null; dateTo = null;
  pickerFromDate = null; pickerToDate = null;
  pickingStep = 'from';
  document.getElementById('lbl-daterange').textContent = 'Select Date/s From and To';
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

function aggDailyData(dailyRows) {
  if (!dailyRows || !dailyRows.length) return null;
  const s = {
    totalClients:0, hairRetail:0, treatmentSales:0, beautySales:0,
    netTake:0, colTake:0, rebookPct:0, ncrPct:0, _fromDaily:true,
  };
  let totalRebooked=0, totalHairClients=0, totalNewC=0, totalReq=0;
  dailyRows.forEach(r => {
    const clients = (r.hair_clients_request||0) + (r.hair_clients_salon||0) + (r.hair_new||0);
    s.totalClients   += clients;
    s.hairRetail     += r.retail_total      || 0;
    s.treatmentSales += r.treatments_total  || 0;
    s.beautySales    += r.beauty_sales      || 0;
    s.netTake        += r.total             || 0;
    totalRebooked    += r.hair_rebooked     || 0;
    totalNewC        += r.hair_new          || 0;
    totalReq         += r.hair_ncr          || 0;
    totalHairClients += clients;
  });
  s.avgBill       = s.totalClients ? s.netTake / s.totalClients : 0;
  s.hairRetailPct = s.netTake ? (s.hairRetail / s.netTake * 100) : 0;
  s.treatmentPct  = s.netTake ? (s.treatmentSales / s.netTake * 100) : 0;
  s.rebookPct     = totalHairClients ? (totalRebooked / totalHairClients * 100) : 0;
  s.ncrPct        = s.totalClients ? (totalReq / s.totalClients * 100) : 0;
  s.beautyPct     = s.netTake ? (s.beautySales / s.netTake * 100) : 0;
  s.retentionPct  = s.rebookPct;
  s.conversionPct = s.rebookPct;
  s._retailWarnings = [];
  s.totals = { hairSales: s.netTake - s.beautySales - s.hairRetail, retail: s.hairRetail, treatments: s.treatmentSales, total: s.totalClients, rebooked: totalRebooked };
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
    if (sm.totals) { totalRebooked += sm.totals.rebooked||0; totalHairClients += sm.totals.total||0; }

    (d.hairStaff || []).forEach(st => {
      const retailVal = Number(
        st.retail ?? st.retailSales ?? st.productSales ?? st.product ?? 0
      ) || 0;
      if (!hairMap[st.name]) {
        hairMap[st.name] = { ...st, retail: retailVal };
      } else {
        const a = hairMap[st.name];
        a.total += st.total;
        a.newC += st.newC;
        a.rebooked += st.rebooked;
        a.hairSalesNet += st.hairSalesNet;
        a.retail += retailVal;
        a.treatments += st.treatments;
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

  s.rebookPct = totalHairClients ? (totalRebooked / totalHairClients * 100) : 0;
  s.beautyPct = s.netTake ? (s.beautySales / s.netTake * 100) : 0;

  const totalNewC = Object.values(hairMap).reduce((acc, st) => acc + (st.newC || 0), 0);
  s.ncrPct = s.totalClients ? (totalNewC / s.totalClients * 100) : 0;

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
      ncrPct:        st.total ? (st.newC / st.total * 100) : 0,
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
      ncrPct:        st.total ? ((st.newC||0)/st.total*100) : 0,
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

  return { summary: s, hairStaff, beautyStaff };
}

function aggByBranch() {
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


// ── CHART HELPERS ────────────────────────────────────────────

function destroyCharts() {
  Object.values(charts).forEach(c => { try { c.destroy(); } catch(e) {} });
  charts = {};
}

function buildCmpChart(byBranch, metric, dark, ttStyle, gc, tc) {
  const activeBranches = sel.branch.includes('all') ? Object.keys(BRANCH_INFO) : sel.branch;
  const entries = activeBranches.map(b => {
    const d = byBranch[b];
    return { branch: b, val: +(d ? d.summary[metric]||0 : 0).toFixed(1), color: BRANCH_INFO[b]?.color||'#ccc', name: BRANCH_INFO[b]?.name||b };
  }).sort((a,b) => b.val - a.val);

  const labels = entries.map(e => e.name);
  const vals   = entries.map(e => e.val);
  const colors = entries.map(e => e.color);
  const avg    = vals.reduce((a,b) => a+b, 0) / (vals.length||1);
  const metricLabels = { netTake:'Revenue (AED)', totalClients:'Total Clients', avgBill:'Avg Bill (AED)', rebookPct:'Rebooking %', ncrPct:'NCR %' };
  const lc = dark ? '#C4B5FD' : '#5C5557';

  charts.cmp = new Chart(document.getElementById('cmpChart'), {
    data: { labels, datasets: [
      { type:'bar', label: metricLabels[metric]||metric, data: vals, backgroundColor: colors.map(c=>c+'cc'), borderColor: colors, borderWidth: 1.5, borderRadius: 8, barThickness: 28, yAxisID:'y' },
      { type:'line', label:'Total Avg Bill', data: vals.map(()=>+avg.toFixed(1)), borderColor: lc, backgroundColor:'transparent', borderWidth:2, borderDash:[6,4], pointRadius:5, pointBackgroundColor:lc, pointBorderColor:lc, tension:0, yAxisID:'y' }
    ]},
    options: { animation:{duration:500,easing:'easeInOutQuart'}, responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false},
      plugins:{legend:{display:true,labels:{color:tc,font:{family:'DM Sans',size:11},boxWidth:12,filter:(item)=>item.datasetIndex===1}},tooltip:ttStyle},
      scales:{x:{ticks:{color:tc,font:{family:'DM Sans',size:11}},grid:{color:gc}},y:{ticks:{color:tc,font:{family:'DM Sans',size:11}},grid:{color:gc}}}
    }
  });
}


// ── COLLAPSIBLE SECTIONS ─────────────────────────────────────

function toggleSection(id) {
  sectionState[id] = !sectionState[id];
  applySection(id);
}
function applySection(id) {
  const body  = document.getElementById('body-'  + id);
  const arrow = document.getElementById('arrow-' + id);
  const hdr   = arrow ? arrow.closest('.support-section-hdr') : null;
  const open  = sectionState[id];
  if (body)  body.style.display = open ? 'block' : 'none';
  if (arrow) arrow.classList.toggle('open', open);
  if (hdr)   hdr.classList.toggle('open', open);
}
function restoreSections() {
  Object.keys(sectionState).forEach(id => applySection(id));
}


// ── DASHBOARD RENDER ─────────────────────────────────────────

// AFTER — hoist filtered:
async function renderDashboard() {
  const main = document.getElementById('mainContent');
  let d;
  let filtered = [];   // ← hoist here

  if (dateFrom && dateTo) {
    main.innerHTML = '<div class="loading">Loading daily data...</div>';
    let dailyRows = await loadDailyRange(dateFrom, dateTo);
    if (!sel.branch.includes('all')) {
      dailyRows = dailyRows.filter(r => sel.branch.includes(r.branch));
    }
    if (!dailyRows.length) {
      destroyCharts();
      main.innerHTML = '<div class="empty">No daily data found for this date range.</div>';
      return;
    }
    d = aggDailyData(dailyRows);
  } else {
    filtered = getFilteredData();   // ← assign to hoisted var
    if (!filtered.length) {
      destroyCharts();
      main.innerHTML = '<div class="empty">No data for this selection.</div>';
      return;
    }
    d = aggData(filtered.map(f => f.data));
  }

  if (!d) return;
  const s = d.summary;

  destroyCharts();

  const dark = isDark();
  const donutBorder = dark ? '#383944' : '#fff';
  const donutColors = dark ? ['#FFD4D9','#C4B5FD','#99F6E4'] : ['#5C5557','#c0b0ad','#e8d5cc'];
  const ttStyle = { backgroundColor: dark?'#2D2E37':'#fff', titleColor:dark?'#FAF8F3':'#5C5557', bodyColor:dark?'rgba(250,248,243,.7)':'#9a8a87', borderColor:dark?'rgba(250,248,243,.1)':'#e8d5cc', borderWidth:1 };
  const gc = dark ? 'rgba(250,248,243,0.06)' : 'rgba(92,85,87,0.07)';
  const tc = dark ? 'rgba(250,248,243,0.45)' : '#9a8a87';
  const branchLabel = sel.branch.includes('all') ? 'All Branches' : sel.branch.map(b => BRANCH_INFO[b]?.name||b).join(', ');

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
      <div style="font-size:9px;color:var(--muted);margin:3px 0 6px"><em>All clients served</em></div>
      <div class="metric-value" style="font-size:20px">${s.totalClients}</div>
      <div class="metric-target" style="font-size:10px">Target: ${getClientTarget(sel.branch)}</div>
    </div>

    <div class="metric" style="border-color:rgba(153,246,228,0.35);padding:14px">
      <div style="position:absolute;top:0;left:0;right:0;height:3px;border-radius:13px 13px 0 0;background:#99F6E4"></div>
      <div class="metric-label" style="font-size:9px">Total Avg Bill</div>
      <div style="font-size:9px;color:var(--muted);margin:3px 0 6px"><em>Revenue ÷ Clients</em></div>
      <div class="metric-value" style="font-size:20px">${fmtAED(s.avgBill)}</div>
      <div class="metric-target" style="font-size:10px">Benchmark: ~AED 650</div>
    </div>

    <div class="metric" style="border-color:rgba(153,246,228,0.35);padding:14px">
      <div style="position:absolute;top:0;left:0;right:0;height:3px;border-radius:13px 13px 0 0;background:#99F6E4"></div>
      <div class="metric-label" style="font-size:9px">Rebooking %</div>
      <div style="font-size:9px;color:var(--muted);margin:3px 0 6px"><em>Rebooked ÷ Total clients</em></div>
      <div class="metric-value ${sc(s.rebookPct, TARGETS.rebookPct)}" style="font-size:20px">${fmtPct(s.rebookPct)}</div>
      <div class="metric-target" style="font-size:10px">Target: ${TARGETS.rebookPct}%</div>
    </div>

    <div class="metric" style="border-color:rgba(153,246,228,0.35);padding:14px">
      <div style="position:absolute;top:0;left:0;right:0;height:3px;border-radius:13px 13px 0 0;background:#99F6E4"></div>
      <div class="metric-label" style="font-size:9px">NCR %</div>
      <div style="font-size:9px;color:var(--muted);margin:3px 0 6px"><em>New Client Requests ÷ Total</em></div>
      <div class="metric-value ${sc(s.ncrPct||0, 20)}" style="font-size:20px">${fmtPct(s.ncrPct||0)}</div>
      <div class="metric-target" style="font-size:10px">Target: ≥ 20%</div>
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
    </div>
    <div style="position:relative;width:100%;height:118px;flex-shrink:0;margin:4px auto 0">
      <canvas id="dialCanvas" style="width:100%;height:118px;display:block"></canvas>
      <div style="position:absolute;bottom:6px;left:50%;transform:translateX(-50%);text-align:center;pointer-events:none;white-space:nowrap">
        <div style="font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:600;color:var(--text);line-height:1">${fmtAED(s.netTake)}</div>
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
      ${[
        {code:'SAA',name:'Saadiyat',    color:'#C4B5FD',goal:'450–550k'},
        {code:'KCA',name:'Khalifa City',color:'#FFD4D9',goal:'320–420k'},
        {code:'AQ', name:'Al Quoz',     color:'#FF9B9B',goal:'500–650k'},
        {code:'MC', name:'Motor City',  color:'#99F6E4',goal:'350–450k'},
        {code:'FRT',name:'Fratelli',    color:'#EEF3C7',goal:'200–260k'},
      ].map(b => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--border2)">
          <div style="display:flex;align-items:center;gap:5px">
            <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${b.color};flex-shrink:0"></span>
            <span style="font-size:10px;color:var(--muted)">${b.name}</span>
          </div>
          <span style="font-size:10px;font-weight:600;color:var(--text)">AED ${b.goal}</span>
        </div>`).join('')}
    </div>
  </div>

  <!-- Branch Comparison Bar -->
  <div class="card" style="margin-bottom:0;border-top:3px solid #C4B5FD;padding:16px 14px;display:flex;flex-direction:column;overflow:hidden">
    <div class="metric-label" style="font-size:9px">Performance Across Branches</div>
    <div style="font-size:9px;color:var(--muted);margin:2px 0 6px"><em>Side-by-side · select metric below</em></div>
    <div class="f-pills" id="cmpFilters" style="margin-bottom:10px;flex-wrap:nowrap;overflow-x:auto;padding-bottom:2px">
      <button class="f-pill active" data-m="netTake"      style="white-space:nowrap">Net Revenue</button>
      <button class="f-pill"        data-m="avgBill"      style="white-space:nowrap">Avg Bill</button>
      <button class="f-pill"        data-m="totalClients" style="white-space:nowrap">Total Clients</button>
      <button class="f-pill"        data-m="rebookPct"    style="white-space:nowrap">Rebooking %</button>
      <button class="f-pill"        data-m="ncrPct"       style="white-space:nowrap">NCR %</button>
    </div>
    <div style="position:relative;flex:1;min-height:0"><canvas id="cmpChart"></canvas></div>
  </div>

  <!-- Revenue Mix Donut -->
  <div class="card" style="margin-bottom:0;border-top:3px solid #FFD4D9;display:flex;flex-direction:column;align-items:center;padding:16px 14px;overflow:hidden">
    <div style="width:100%;margin-bottom:8px;flex-shrink:0">
      <div class="metric-label" style="font-size:9px">Revenue Mix</div>
      <div style="font-size:9px;color:var(--muted);margin:2px 0 0"><em>Hair · Beauty · Retail</em></div>
    </div>
    <div style="position:relative;width:200px;height:200px;flex-shrink:0;margin:auto 0">
      <canvas id="donutChart"></canvas>
      <div class="donut-center">
        <div class="donut-center-val" style="font-size:20px">${Math.round(s.netTake/1000)}k</div>
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

<!-- REVENUE RUN (collapsible) -->
<div class="support-section" style="margin-bottom:8px">
  <div class="support-section-hdr" onclick="toggleSection('revenueRun')">
    <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0">
      <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#EEF3C7;flex-shrink:0"></span>
      <span class="section-label" style="margin:0;letter-spacing:0.16em;flex-shrink:0;white-space:nowrap">Revenue Run</span>
      <span style="font-size:10px;color:var(--muted);font-weight:400;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0">Service Sales · Treatment % · Retail Sales · Retail % · Hair Avg Bill · Beauty Avg Bill</span>
    </div>
    <span class="support-toggle-arrow" id="arrow-revenueRun">▼</span>
  </div>
  <div class="support-section-body" id="body-revenueRun" style="display:none">
    ${(s._retailWarnings && s._retailWarnings.length) ? `
      <div style="margin:8px 0;padding:10px 12px;background:rgba(251,191,36,.08);border-left:3px solid #fbbf24;border-radius:6px;font-size:11px;color:var(--text)">
        <strong style="color:#fbbf24">⚠️ Retail data mismatch detected</strong> across ${s._retailWarnings.length} week(s).
        Daily-sheet sum (used) differs from weekly summary row.
        ${s._retailWarnings.slice(0,3).map(m => `Daily AED ${Math.round(m.daily).toLocaleString()} vs Summary AED ${Math.round(m.summary).toLocaleString()} (${m.pctDiff}% drift)`).join(' · ')}
      </div>
    ` : ''}
    <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:10px;padding:12px 0 4px">
      <div class="metric m-lime">
        <div class="metric-label">Service Sales</div>
        <div style="font-size:10px;color:var(--muted);margin:3px 0 7px"><em>(Total service revenue: hair + beauty)</em></div>
        <div class="metric-value" style="font-size:20px">${fmtAED(s.netTake - (s.hairRetail||0))}</div>
        <div class="metric-target">Branch-based target</div>
      </div>
      <div class="metric m-lime">
        <div class="metric-label">Treatment %</div>
        <div style="font-size:10px;color:var(--muted);margin:3px 0 7px"><em>(Treatment sales ÷ Total revenue)</em></div>
        <div class="metric-value ${sc(s.treatmentPct, TARGETS.treatmentPct)}" style="font-size:20px">${fmtPct(s.treatmentPct)}</div>
        <div class="metric-target">Target: ≥ ${TARGETS.treatmentPct}%</div>
      </div>
      <div class="metric m-lime">
        <div class="metric-label">Retail Sales</div>
        <div style="font-size:10px;color:var(--muted);margin:3px 0 7px"><em>(Total retail / product sales)</em></div>
        <div class="metric-value" style="font-size:20px">${fmtAED(s.hairRetail||0)}</div>
        <div class="metric-target">Branch-based target</div>
      </div>
      <div class="metric m-lime">
        <div class="metric-label">Retail %</div>
        <div style="font-size:10px;color:var(--muted);margin:3px 0 7px"><em>(Retail sales ÷ Total revenue)</em></div>
        <div class="metric-value ${sc(s.hairRetailPct, TARGETS.retailPct)}" style="font-size:20px">${fmtPct(s.hairRetailPct)}</div>
        <div class="metric-target">Target: ≥ ${TARGETS.retailPct}%</div>
      </div>
      <div class="metric m-lime">
        <div class="metric-label">Hair Avg Bill</div>
        <div style="font-size:10px;color:var(--muted);margin:3px 0 7px"><em>(Hair services ÷ Hair clients)</em></div>
        <div class="metric-value ${sc(s.avgBill, TARGETS.hairAvgBill)}" style="font-size:20px">${fmtAED(s.avgBill)}</div>
        <div class="metric-target">Target: AED ${TARGETS.hairAvgBill}</div>
      </div>
      <div class="metric m-lime">
        <div class="metric-label">Beauty Avg Bill</div>
        <div style="font-size:10px;color:var(--muted);margin:3px 0 7px"><em>(Beauty services ÷ Beauty clients)</em></div>
        <div class="metric-value ${sc(s.beautySales / Math.max(1, d.beautyStaff.reduce((a,st)=>a+st.total,0)), TARGETS.beautyAvgBill)}" style="font-size:20px">${fmtAED(s.beautySales / Math.max(1, d.beautyStaff.reduce((a,st)=>a+st.total,0)))}</div>
        <div class="metric-target">Target: AED ${TARGETS.beautyAvgBill||200}</div>
      </div>
    </div>
  </div>
</div>

<!-- CLIENT RUN (collapsible) -->
<div class="support-section" style="margin-bottom:8px">
  <div class="support-section-hdr" onclick="toggleSection('clientRun')">
    <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0">
      <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#C4B5FD;flex-shrink:0"></span>
      <span class="section-label" style="margin:0;letter-spacing:0.16em;flex-shrink:0;white-space:nowrap">Client Run</span>
      <span style="font-size:10px;color:var(--muted);font-weight:400;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0">New Clients · NCR · Request Clients % · Salon Clients % · New Clients %</span>
    </div>
    <span class="support-toggle-arrow" id="arrow-clientRun">▼</span>
  </div>
  <div class="support-section-body" id="body-clientRun" style="display:none">
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;padding:12px 0 4px">
      <div class="metric m-lav">
        <div class="metric-label">New Clients</div>
        <div style="font-size:10px;color:var(--muted);margin:3px 0 7px"><em>(First-time clients)</em></div>
        <div class="metric-value" style="font-size:20px">${Math.round(d.hairStaff.reduce((a,st)=>a+(st.newC||0),0))}</div>
        <div class="metric-target">Track growth</div>
      </div>
      <div class="metric m-lav">
        <div class="metric-label">NCR (New Client Requests)</div>
        <div style="font-size:10px;color:var(--muted);margin:3px 0 7px"><em>(New clients requesting specific staff)</em></div>
        <div class="metric-value" style="font-size:20px">${Math.round(s.ncrPct * s.totalClients / 100)}</div>
        <div class="metric-target">Increase weekly</div>
      </div>
      <div class="metric m-lav">
        <div class="metric-label">Request Clients %</div>
        <div style="font-size:10px;color:var(--muted);margin:3px 0 7px"><em>(Request clients ÷ Total clients)</em></div>
        <div class="metric-value ${sc(s.ncrPct, 40)}" style="font-size:20px">${fmtPct(s.ncrPct)}</div>
        <div class="metric-target">Target: ≥ 40%</div>
      </div>
      <div class="metric m-lav">
        <div class="metric-label">Salon Clients %</div>
        <div style="font-size:10px;color:var(--muted);margin:3px 0 7px"><em>(Walk-in / no preference clients)</em></div>
        <div class="metric-value" style="font-size:20px">${fmtPct(100 - (s.ncrPct||0))}</div>
        <div class="metric-target">Balanced</div>
      </div>
      <div class="metric m-lav">
        <div class="metric-label">New Clients %</div>
        <div style="font-size:10px;color:var(--muted);margin:3px 0 7px"><em>(New clients ÷ Total clients)</em></div>
        <div class="metric-value ${sc(d.hairStaff.reduce((a,st)=>a+(st.newC||0),0)/Math.max(1,s.totalClients)*100, 20)}" style="font-size:20px">${fmtPct(d.hairStaff.reduce((a,st)=>a+(st.newC||0),0)/Math.max(1,s.totalClients)*100)}</div>
        <div class="metric-target">Target: ≥ 20%</div>
      </div>
    </div>
  </div>
</div>

<!-- RETENTION (collapsible) -->
<div class="support-section" style="margin-bottom:8px">
  <div class="support-section-hdr" onclick="toggleSection('retentionRun')">
    <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0">
      <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#FFD4D9;flex-shrink:0"></span>
      <span class="section-label" style="margin:0;letter-spacing:0.16em;flex-shrink:0;white-space:nowrap">Retention</span>
      <span style="font-size:10px;color:var(--muted);font-weight:400;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0">Hair Rebooking % · Beauty Rebooking % · Retention % · Conversion %</span>
    </div>
    <span class="support-toggle-arrow" id="arrow-retentionRun">▼</span>
  </div>
  <div class="support-section-body" id="body-retentionRun" style="display:none">
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:12px 0 4px">
      <div class="metric m-rose">
        <div class="metric-label">Hair Rebooking %</div>
        <div style="font-size:10px;color:var(--muted);margin:3px 0 7px"><em>(Hair rebooks ÷ Hair clients)</em></div>
        <div class="metric-value ${sc(s.rebookPct||0, 50)}" style="font-size:20px">${fmtPct(s.rebookPct||0)}</div>
        <div class="metric-target">Target: ≥ 50%</div>
      </div>
      <div class="metric m-rose">
        <div class="metric-label">Beauty Rebooking %</div>
        <div style="font-size:10px;color:var(--muted);margin:3px 0 7px"><em>(Beauty rebooks ÷ Beauty clients)</em></div>
        <div class="metric-value ${sc(s.beautyRebookPct||0, 40)}" style="font-size:20px">${fmtPct(s.beautyRebookPct||0)}</div>
        <div class="metric-target">Target: ≥ 40%</div>
      </div>
      <div class="metric m-rose">
        <div class="metric-label">Retention %</div>
        <div style="font-size:10px;color:var(--muted);margin:3px 0 7px"><em>(Returning clients over time)</em></div>
        <div class="metric-value ${sc(s.retentionPct||0, 60)}" style="font-size:20px">${fmtPct(s.retentionPct||0)}</div>
        <div class="metric-target">Target: ≥ 60–70%</div>
      </div>
      <div class="metric m-rose">
        <div class="metric-label">Conversion %</div>
        <div style="font-size:10px;color:var(--muted);margin:3px 0 7px"><em>(New → returning clients)</em></div>
        <div class="metric-value ${sc(s.conversionPct||0, 50)}" style="font-size:20px">${fmtPct(s.conversionPct||0)}</div>
        <div class="metric-target">Target: ≥ 50%</div>
      </div>
    </div>
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
    <span class="support-toggle-arrow" id="arrow-opsRun">▼</span>
  </div>
  <div class="support-section-body" id="body-opsRun" style="display:none">
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
  buildCmpChart(byBranch, cmpMetric, dark, ttStyle, gc, tc);
  document.getElementById('cmpFilters').addEventListener('click', e => {
    const btn = e.target.closest('.f-pill'); if (!btn) return;
    cmpMetric = btn.dataset.m;
    document.querySelectorAll('#cmpFilters .f-pill').forEach(p => p.classList.toggle('active', p === btn));
    if (charts.cmp) charts.cmp.destroy();
    buildCmpChart(byBranch, cmpMetric, dark, ttStyle, gc, tc);
  });

  restoreSections();

  // ── Dial (gauge) chart ──
  (function () {
    const WEEKLY_GOALS_MAP = { SAA:[450000,550000], KCA:[320000,420000], AQ:[500000,650000], MC:[350000,450000], FRT:[200000,260000] };
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

    const canvas = document.getElementById('dialCanvas');
if (canvas) {
  const drawDial = () => {
    const w = canvas.parentElement?.offsetWidth || canvas.offsetWidth || 220;
    canvas.width = w;
    canvas.height = 118;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const cx = W/2, cy = H-8;
    const r = Math.min(W/2-10, H-16);
    const SA = Math.PI, EA = 2*Math.PI;
    ctx.beginPath(); ctx.arc(cx, cy, r, SA, EA);
    ctx.strokeStyle = dark ? 'rgba(250,248,243,0.1)' : 'rgba(92,85,87,0.12)';
    ctx.lineWidth = 13; ctx.lineCap = 'round'; ctx.stroke();
    const fillEnd = SA + (EA-SA) * Math.min(pct, 1);
    const grad = ctx.createLinearGradient(cx-r, cy, cx+r, cy);
    grad.addColorStop(0, '#C4B5FD'); grad.addColorStop(0.5, '#99F6E4'); grad.addColorStop(1, '#EEF3C7');
    ctx.beginPath(); ctx.arc(cx, cy, r, SA, fillEnd);
    ctx.strokeStyle = grad; ctx.lineWidth = 13; ctx.lineCap = 'round'; ctx.stroke();
    const kx = cx + r*Math.cos(fillEnd), ky = cy + r*Math.sin(fillEnd);
    ctx.beginPath(); ctx.arc(kx, ky, 7, 0, 2*Math.PI); ctx.fillStyle = '#FAF8F3'; ctx.fill();
    ctx.beginPath(); ctx.arc(kx, ky, 4, 0, 2*Math.PI); ctx.fillStyle = '#99F6E4';  ctx.fill();
  };
  requestAnimationFrame(drawDial);
}
    const pctNum = Math.round(pct * 100);
    const fillEl = document.getElementById('dialPctFill');
    const txtEl  = document.getElementById('dialPctTxt');
    const tagEl  = document.getElementById('dialGoalTag');
    if (fillEl) { fillEl.style.width = Math.min(pct*100, 100) + '%'; fillEl.style.background = pct>=1 ? '#99F6E4' : pct>=0.8 ? '#EEF3C7' : '#FF9B9B'; }
    if (txtEl)  txtEl.textContent  = pctNum + '% of ' + periodLabel + ' goal';
    if (tagEl)  tagEl.textContent  = 'Weekly target: AED ' + (wMin/1000).toFixed(0) + 'k–' + (wMax/1000).toFixed(0) + 'k / week';
  })();

  // ── Donut chart ──
  const hairTx      = Math.max(0, s.netTake - s.beautySales - s.hairRetail);
  const donutData   = [hairTx, s.beautySales, s.hairRetail];
  const donutLabels = ['Hair + Tx','Beauty','Retail'];
  const donutTotal  = donutData.reduce((a,b) => a+b, 0) || 1;

  charts.donut = new Chart(document.getElementById('donutChart'), {
    type: 'doughnut',
    data: { labels: donutLabels, datasets: [{ data: donutData, backgroundColor: donutColors, borderColor: donutBorder, borderWidth: 2, hoverOffset: 4 }] },
    options: { cutout:'62%', responsive:true, maintainAspectRatio:false, animation:{animateRotate:true,duration:600,easing:'easeInOutQuart'},
      plugins: { legend:{display:false}, tooltip:{...ttStyle, callbacks:{label:c=>` ${c.label}: ${fmtAED(c.raw)} (${Math.round(c.raw/donutTotal*100)}%)`}} }
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
          : glbMetric==='overall' ? valRaw.toFixed(1)
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
  const fromStr = from.toISOString().split('T')[0];
  const toStr   = to.toISOString().split('T')[0];
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
  renderDashboard();
  if (data.length) {
    const latest = new Date(data[data.length-1].uploaded_at);
    document.getElementById('lastUpdated').innerHTML = 'Updated ' + latest.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})
      + '<br><span style="font-size:10px;letter-spacing:0.04em;opacity:0.7">Gulf Standard Time +04:00</span>';
  }
}

// ── STARTUP ──────────────────────────────────────────────────

// Init is triggered by doLogin() and checkSession() in index.html
