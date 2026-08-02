/* ============================================================
   TARA ROSE LADIES SALON — sheet-sync.js
   Read-only monitor for branch_staff_daily — the table each branch's
   Google Sheet (_temp_placeholder tab) pushes into directly via Apps
   Script (see /apps-script/push-temp-placeholder-to-supabase.gs).
   Nothing here writes anything; it just shows what's arrived so Kate
   can confirm the sheet → Supabase sync is actually running.
   Uses the shared `sb` client and `BRANCHES`/`BRANCH_KEYS` from upload.js
   — load this script AFTER upload.js.
   ============================================================ */

const SS_TABLE = 'branch_staff_daily';
const SS_COLS = [
  ['Branch','branch'],['Date','date'],['Dept','dept'],['Staff','staff_name'],
  ['NCR','ncr'],['REQ','req'],['Salon','salon'],['New','new_client'],
  ['Rebooked','rebooked'],['Total','total'],['Treatment AED','treatment_aed']
];
const SS_PAGE_SIZE = 1000;
const SS_ROW_LIMIT = 25000;
let ssCapWarning = false;

// ── LAST SYNCED STATUS (per branch) ─────────────────────────
async function refreshSheetSyncStatus(){
  const host = document.getElementById('ssLastSynced');
  if (!host) return;
  host.innerHTML = BRANCH_KEYS.map(k => `
    <div class="sp-branch-box" id="ssStat_${k}">
      <div class="sp-branch-box-title">${BRANCHES[k].name}</div>
      <div style="font-size:12px;color:var(--muted)">Loading…</div>
    </div>`).join('');

  await Promise.all(BRANCH_KEYS.map(async k => {
    const el = document.getElementById(`ssStat_${k}`);
    if (!el) return;
    const [{ data: latest, error: latestErr }, { count, error: countErr }] = await Promise.all([
      sb.from(SS_TABLE).select('date').eq('branch', k).order('date',{ascending:false}).limit(1),
      sb.from(SS_TABLE).select('id',{count:'exact',head:true}).eq('branch', k)
    ]);
    if (latestErr || countErr){
      el.innerHTML = `<div class="sp-branch-box-title">${BRANCHES[k].name}</div><div style="font-size:11px;color:var(--bad)">Failed to load</div>`;
      return;
    }
    const lastDate = latest && latest.length ? latest[0].date : null;
    el.innerHTML = `
      <div class="sp-branch-box-title">${BRANCHES[k].name}</div>
      <div style="font-size:12px;color:${lastDate ? 'var(--good)' : 'var(--muted2)'};margin-top:2px">
        ${lastDate ? '🟢 Last synced: ' + lastDate : '⚪ No data yet'}
      </div>
      <div style="font-size:11px;color:var(--muted)">${count || 0} row${count===1?'':'s'} total</div>`;
  }));
}

// ── BROWSE / FILTER ──────────────────────────────────────────
function ssPopulateFilterBranch(){
  const sel = document.getElementById('ssfBranch');
  if (!sel || sel.dataset.populated) return;
  BRANCH_KEYS.forEach(k => {
    const opt = document.createElement('option');
    opt.value = k; opt.textContent = BRANCHES[k].name;
    sel.appendChild(opt);
  });
  sel.dataset.populated = '1';
}

function ssSetDefaultFilterDates(force){
  const fromEl = document.getElementById('ssfFrom');
  const toEl   = document.getElementById('ssfTo');
  if (!fromEl || !toEl) return;
  const todayIso  = new Date().toISOString().split('T')[0];
  const yearStart = '2026-01-01';
  if (force || !fromEl.value) fromEl.value = yearStart;
  if (force || !toEl.value)   toEl.value   = todayIso;
}

function resetSheetSyncFilter(){
  document.getElementById('ssfBranch').value = '';
  document.getElementById('ssfStaff').value = '';
  ssSetDefaultFilterDates(true);
  ssLastData = [];
  document.getElementById('ssTableHost').innerHTML =
    '<div style="padding:16px;font-size:12px;color:var(--muted2)">Pick a filter and click Apply.</div>';
  document.getElementById('ssResultCount').textContent = '';
}

function ssFmt(v){ return typeof v === 'number' ? v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) : (v ?? ''); }

// ── SORT + COLUMN VISIBILITY + SUMMARY MODE (mirrors the Staff Performance tab) ──
let ssLastData   = [];
let ssSortCol    = 'date';
let ssSortDir    = 'desc';
let ssHiddenCols = new Set(JSON.parse(localStorage.getItem('ssHiddenCols') || '[]'));
let ssSummaryMode = localStorage.getItem('ssSummaryMode') === '1';

// Fields that get summed when Summary mode combines a staff member's daily
// rows into one row for the selected date range.
const SS_SUM_FIELDS = ['ncr','req','salon','new_client','rebooked','total','treatment_aed'];

function ssAggregateByEmployee(rows){
  // Branch column hidden → fold a staff member's rows together across
  // branches too, same reasoning as the Staff Performance tab.
  const groupByBranch = !ssHiddenCols.has('branch');
  const groups = new Map();
  for (const row of rows){
    const key = groupByBranch ? (row.branch + '|' + row.staff_name) : row.staff_name;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const out = [];
  for (const rs of groups.values()){
    const agg = { branch: groupByBranch ? rs[0].branch : 'ALL', dept: rs[0].dept, staff_name: rs[0].staff_name };
    for (const f of SS_SUM_FIELDS) agg[f] = 0;
    for (const r of rs) for (const f of SS_SUM_FIELDS) agg[f] += (typeof r[f] === 'number' ? r[f] : 0);
    const dates = rs.map(r => r.date).filter(Boolean).sort();
    agg.date = !dates.length ? '' : dates[0] === dates[dates.length-1] ? dates[0] : `${dates[0]} → ${dates[dates.length-1]}`;
    out.push(agg);
  }
  return out;
}

// Grand total across every row currently on screen (post filter/aggregate),
// pinned as the first table row.
function ssGrandTotal(rows){
  const t = { branch:'', date:'', dept:'', staff_name:'TOTAL' };
  for (const f of SS_SUM_FIELDS) t[f] = 0;
  for (const r of rows) for (const f of SS_SUM_FIELDS) t[f] += (typeof r[f] === 'number' ? r[f] : 0);
  return t;
}

function ssToggleSummaryMode(){
  ssSummaryMode = !ssSummaryMode;
  localStorage.setItem('ssSummaryMode', ssSummaryMode ? '1' : '0');
  ssSyncSummaryToggleUI();
  ssRenderTable();
}

function ssSyncSummaryToggleUI(){
  const track = document.getElementById('ssSummaryTrack');
  const lbl = document.getElementById('ssSummaryLbl');
  if (!track) return;
  track.classList.toggle('on', ssSummaryMode);
  lbl.textContent = ssSummaryMode ? 'Summary' : 'Daily';
}

function ssSortBy(key){
  if (ssSortCol === key) ssSortDir = ssSortDir === 'asc' ? 'desc' : 'asc';
  else { ssSortCol = key; ssSortDir = 'asc'; }
  ssRenderTable();
}

function ssToggleCol(key, checked){
  if (checked) ssHiddenCols.delete(key); else ssHiddenCols.add(key);
  localStorage.setItem('ssHiddenCols', JSON.stringify([...ssHiddenCols]));
  ssRenderTable();
}

function ssShowAllCols(){
  ssHiddenCols.clear();
  localStorage.setItem('ssHiddenCols', JSON.stringify([]));
  ssBuildColPicker();
  ssRenderTable();
}

function ssBuildColPicker(){
  const panel = document.getElementById('ssColPicker');
  if (!panel) return;
  panel.innerHTML = SS_COLS.map(c =>
    `<label><input type="checkbox" ${ssHiddenCols.has(c[1])?'':'checked'} onchange="ssToggleCol('${c[1]}', this.checked)">${c[0]}</label>`
  ).join('') + '<div class="sp-col-picker-actions"><button class="btn-outline" style="flex:1;padding:6px" onclick="ssShowAllCols()">Show all</button></div>';
}

function ssToggleColPicker(e){
  e.stopPropagation();
  const panel = document.getElementById('ssColPicker');
  if (!panel) return;
  const opening = panel.style.display !== 'block';
  if (opening){ ssBuildColPicker(); panel.style.display = 'block'; }
  else panel.style.display = 'none';
}

document.addEventListener('click', (e) => {
  const panel = document.getElementById('ssColPicker');
  const btn   = document.getElementById('ssColPickerBtn');
  if (panel && panel.style.display === 'block' && !panel.contains(e.target) && e.target !== btn) {
    panel.style.display = 'none';
  }
});

function ssRenderTable(){
  const host = document.getElementById('ssTableHost');
  if (!ssLastData.length){
    host.innerHTML = '<div style="padding:16px;font-size:12px;color:var(--muted2)">No matching rows.</div>';
    document.getElementById('ssResultCount').textContent = '';
    return;
  }

  const displayRows = ssSummaryMode ? ssAggregateByEmployee(ssLastData) : ssLastData;
  document.getElementById('ssResultCount').textContent = ssCapWarning
    ? `Showing first ${SS_ROW_LIMIT} rows — narrow your filters for more precision`
    : `${displayRows.length} row${displayRows.length === 1 ? '' : 's'}${ssSummaryMode ? ' (summarized per staff member)' : ''}`;

  const visibleCols = SS_COLS.filter(c => !ssHiddenCols.has(c[1]));

  // Group by branch (canonical BRANCH_KEYS order), sorted within each group,
  // mirroring the Staff Performance tab's branch-block layout.
  const groups = new Map();
  for (const row of displayRows){
    if (!groups.has(row.branch)) groups.set(row.branch, []);
    groups.get(row.branch).push(row);
  }
  const orderedKeys = [...groups.keys()].sort((a,b) => {
    const ia = BRANCH_KEYS.indexOf(a), ib = BRANCH_KEYS.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  let html = '<table class="sp-table"><thead><tr>' + visibleCols.map(c => {
    const active = c[1] === ssSortCol;
    const arrow = active ? (ssSortDir === 'asc' ? ' ▲' : ' ▼') : '';
    return `<th class="sp-th-sort${active?' active':''}" onclick="ssSortBy('${c[1]}')">${c[0]}${arrow}</th>`;
  }).join('') + '</tr></thead><tbody>';

  const grandTotal = ssGrandTotal(displayRows);
  html += '<tr class="is-total">' + visibleCols.map(c => `<td>${ssFmt(grandTotal[c[1]])}</td>`).join('') + '</tr>';

  orderedKeys.forEach((key, gi) => {
    const rows = groups.get(key).slice().sort((a,b) => spCompare(a[ssSortCol], b[ssSortCol], ssSortDir));
    for (const row of rows){
      html += '<tr>' + visibleCols.map(c => `<td>${ssFmt(row[c[1]])}</td>`).join('') + '</tr>';
    }
    if (gi < orderedKeys.length - 1){
      html += `<tr class="sp-group-spacer"><td colspan="${visibleCols.length}"></td></tr>`;
    }
  });
  html += '</tbody></table>';
  host.innerHTML = html;
}

async function runSheetSyncFilter(){
  const branch = document.getElementById('ssfBranch').value;
  const staff  = document.getElementById('ssfStaff').value.trim();
  const from   = document.getElementById('ssfFrom').value;
  const to     = document.getElementById('ssfTo').value;

  const host = document.getElementById('ssTableHost');
  host.innerHTML = '<div style="padding:16px;font-size:12px;color:var(--muted2)">Loading…</div>';

  const buildQuery = () => {
    let q = sb.from(SS_TABLE).select('*').order('date',{ascending:false}).order('branch').order('staff_name');
    if (branch) q = q.eq('branch', branch);
    if (from)   q = q.gte('date', from);
    if (to)     q = q.lte('date', to);
    if (staff)  q = q.ilike('staff_name', `%${staff}%`);
    return q;
  };

  let all = [];
  let offset = 0;
  while (true){
    const { data, error } = await buildQuery().range(offset, offset + SS_PAGE_SIZE - 1);
    if (error){ host.innerHTML = `<div style="padding:16px;font-size:12px;color:var(--bad)">Query failed: ${error.message}</div>`; return; }
    all = all.concat(data);
    if (data.length < SS_PAGE_SIZE || all.length >= SS_ROW_LIMIT) break;
    offset += SS_PAGE_SIZE;
  }

  ssCapWarning = all.length >= SS_ROW_LIMIT;
  ssLastData = all.slice(0, SS_ROW_LIMIT);
  ssRenderTable();
}

// ── INIT ──────────────────────────────────────────────────────
let ssFilterAutoRun = false;
function initSheetSyncTab(){
  ssPopulateFilterBranch();
  ssSetDefaultFilterDates(false);
  ssSyncSummaryToggleUI();
  refreshSheetSyncStatus();
  if (!ssFilterAutoRun){
    ssFilterAutoRun = true;
    runSheetSyncFilter();
  }
}
