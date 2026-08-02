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
  ['Rebooked','rebooked'],['Total','total'],['Treatment AED','treatment_aed'],
  ['Retail Unit (QTY)','retail_unit_qty'],['Treatments Unit (QTY)','treatments_unit_qty']
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
  ssColFilters = {};
  ssCloseColFilter();
  document.getElementById('ssTableHost').innerHTML =
    '<div style="padding:16px;font-size:12px;color:var(--muted2)">Pick a filter and click Apply.</div>';
  document.getElementById('ssResultCount').textContent = '';
}

// Client-count columns show whole numbers — Treatment AED is the only
// money column and keeps 2 decimals.
const SS_COUNT_FIELDS = new Set(['ncr','req','salon','new_client','rebooked','total','retail_unit_qty','treatments_unit_qty']);
function ssFmt(v, key){
  if (typeof v !== 'number') return v ?? '';
  const d = key && SS_COUNT_FIELDS.has(key) ? 0 : 2;
  return v.toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d});
}

// ── SORT + COLUMN VISIBILITY + SUMMARY MODE (mirrors the Staff Performance tab) ──
let ssLastData   = [];
let ssSortCol    = 'date';
let ssSortDir    = 'desc';
let ssHiddenCols = new Set(JSON.parse(localStorage.getItem('ssHiddenCols') || '[]'));
let ssSummaryMode = localStorage.getItem('ssSummaryMode') === '1';

// Fields that get summed when Summary mode combines a staff member's daily
// rows into one row for the selected date range.
const SS_SUM_FIELDS = ['ncr','req','salon','new_client','rebooked','total','treatment_aed','retail_unit_qty','treatments_unit_qty'];

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

// ── PER-COLUMN VALUE FILTER (Excel/Sheets-style "pick which values show") ──
let ssColFilters = {};       // colKey -> Set of allowed values; missing key = no filter
let ssColFilterKey = null;   // column currently open in the popover
let ssColFilterPanel = null; // the floating DOM node, created on demand
let ssColFilterPending = null; // Set being edited while the popover is open
let ssColFilterSearchTxt = '';

function ssColFilterActive(key){ return Object.prototype.hasOwnProperty.call(ssColFilters, key); }

// Rows matching every active filter except `exceptKey` — lets a column's own
// dropdown show values still reachable given the *other* filters, the way
// Excel narrows its filter lists as you filter more columns.
function ssColFilterRows(rows, exceptKey){
  const keys = Object.keys(ssColFilters).filter(k => k !== exceptKey);
  if (!keys.length) return rows;
  return rows.filter(row => keys.every(k => ssColFilters[k].has(ssFmt(row[k], k))));
}

function ssColValueDomain(key){
  const vals = new Set(ssColFilterRows(ssLastData, key).map(r => ssFmt(r[key], key)));
  return [...vals].sort((a,b) => a.localeCompare(b, undefined, {numeric:true, sensitivity:'base'}));
}

function ssEsc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function ssOpenColFilter(e, key){
  e.stopPropagation();
  if (ssColFilterKey === key){ ssCloseColFilter(); return; }
  ssCloseColFilter();
  ssColFilterKey = key;
  const domain = ssColValueDomain(key);
  ssColFilterPending = new Set(ssColFilterActive(key) ? ssColFilters[key] : domain);
  ssColFilterSearchTxt = '';

  const panel = document.createElement('div');
  panel.className = 'sp-colval-panel';
  panel.id = 'ssColValPanel';
  panel.innerHTML =
    '<input type="text" class="sp-colval-search" placeholder="Search…" oninput="ssColFilterSearch(this.value)">' +
    '<div class="sp-colval-actions">' +
      '<button class="btn-outline" onclick="ssColFilterSelectAll(true)">Select all</button>' +
      '<button class="btn-outline" onclick="ssColFilterSelectAll(false)">Clear</button>' +
    '</div>' +
    '<div class="sp-colval-list" id="ssColValList"></div>' +
    '<div class="sp-colval-footer"><button class="btn" style="flex:1;padding:6px" onclick="ssColFilterApply()">Apply</button></div>';
  document.body.appendChild(panel);
  ssColFilterPanel = panel;
  ssRenderColFilterList();

  const rect = e.currentTarget.getBoundingClientRect();
  panel.style.top  = (rect.bottom + 4) + 'px';
  panel.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 236)) + 'px';
  panel.querySelector('.sp-colval-search').focus();
}

function ssCloseColFilter(){
  if (ssColFilterPanel){ ssColFilterPanel.remove(); ssColFilterPanel = null; }
  ssColFilterKey = null;
  ssColFilterPending = null;
}

function ssRenderColFilterList(){
  const key = ssColFilterKey;
  if (!key) return;
  const domain = ssColValueDomain(key);
  const q = ssColFilterSearchTxt.toLowerCase();
  const shown = q ? domain.filter(v => v.toLowerCase().includes(q)) : domain;
  const list = document.getElementById('ssColValList');
  list.innerHTML = shown.length ? shown.map((v,i) =>
    `<label><input type="checkbox" data-idx="${i}" ${ssColFilterPending.has(v)?'checked':''}>${v === '' ? '<em>(Blank)</em>' : ssEsc(v)}</label>`
  ).join('') : '<div class="sp-colval-empty">No values</div>';
  list.onchange = (e) => {
    if (!e.target.matches('input[type=checkbox]')) return;
    const v = shown[Number(e.target.dataset.idx)];
    if (e.target.checked) ssColFilterPending.add(v); else ssColFilterPending.delete(v);
  };
}

function ssColFilterSearch(v){
  ssColFilterSearchTxt = v;
  ssRenderColFilterList();
}

function ssColFilterSelectAll(checked){
  const q = ssColFilterSearchTxt.toLowerCase();
  const domain = ssColValueDomain(ssColFilterKey);
  const shown = q ? domain.filter(v => v.toLowerCase().includes(q)) : domain;
  shown.forEach(v => checked ? ssColFilterPending.add(v) : ssColFilterPending.delete(v));
  ssRenderColFilterList();
}

function ssColFilterApply(){
  const key = ssColFilterKey;
  const domain = ssColValueDomain(key);
  if (ssColFilterPending.size >= domain.length) delete ssColFilters[key];
  else ssColFilters[key] = new Set(ssColFilterPending);
  ssCloseColFilter();
  ssRenderTable();
}

document.addEventListener('click', (e) => {
  if (ssColFilterPanel && !ssColFilterPanel.contains(e.target) && !e.target.closest('.sp-th-filter-ic')) {
    ssCloseColFilter();
  }
});

function ssRenderTable(){
  const host = document.getElementById('ssTableHost');
  if (!ssLastData.length){
    host.innerHTML = '<div style="padding:16px;font-size:12px;color:var(--muted2)">No matching rows.</div>';
    document.getElementById('ssResultCount').textContent = '';
    return;
  }

  const filteredData = ssColFilterRows(ssLastData);
  const displayRows = ssSummaryMode ? ssAggregateByEmployee(filteredData) : filteredData;
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
    const filtered = ssColFilterActive(c[1]);
    return `<th class="sp-th-sort${active?' active':''}"><span class="sp-th-inner">` +
      `<span class="sp-th-label" onclick="ssSortBy('${c[1]}')">${c[0]}${arrow}</span>` +
      `<span class="sp-th-filter-ic${filtered?' active':''}" onclick="ssOpenColFilter(event,'${c[1]}')" title="Filter values">▾</span>` +
      `</span></th>`;
  }).join('') + '</tr></thead><tbody>';

  const grandTotal = ssGrandTotal(displayRows);
  html += '<tr class="is-total">' + visibleCols.map(c => `<td>${ssFmt(grandTotal[c[1]], c[1])}</td>`).join('') + '</tr>';

  orderedKeys.forEach((key, gi) => {
    const rows = groups.get(key).slice().sort((a,b) => spCompare(a[ssSortCol], b[ssSortCol], ssSortDir));
    for (const row of rows){
      html += '<tr>' + visibleCols.map(c => `<td>${ssFmt(row[c[1]], c[1])}</td>`).join('') + '</tr>';
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
  ssLastData = all.slice(0, SS_ROW_LIMIT)
    .map(row => ({...row, staff_name: canonicalStaffName(row.staff_name)}));
  ssColFilters = {};
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
