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
const SS_RENDER_CAP = 2000;
let ssShowAllRows = false;

function ssRenderAllRows(){
  ssShowAllRows = true;
  ssRenderTable();
}
let ssCapWarning = false;

// ── BACKFILL PROGRESS + SYNC STATUS ──────────────────
// The same month-block grid the Staff Daily and Utilisation tabs draw, so all
// three daily feeds are read the same way. Fratelli's ledger range is its own:
// the barber shop's rows run 2 Jan → 22 May 2026 only, so opening it at 2025
// the way the Phorest tabs do would paint sixteen months of false gaps
// (Kate, 2026-09-04).
const SS_BACKFILL_START = '2025-01-01';
const SS_BRANCH_START = { FRT: '2026-01-01' };
const SS_BRANCH_END   = { FRT: '2026-05-22' };

async function refreshSheetSyncProgress(){
  const host = document.getElementById('ssProgressGrid');
  if (!host) return;
  host.innerHTML = '<div style="font-size:12px;color:var(--muted2);padding:8px 0">Loading…</div>';
  const boxes = document.getElementById('ssLastSynced');
  if (boxes) boxes.innerHTML = BRANCH_KEYS.map(k =>
    `<div class="sp-branch-box"><div class="sp-branch-box-title">${BRANCHES[k].name}</div>` +
    `<div style="font-size:12px;color:var(--muted)">Loading…</div></div>`).join('');

  // One paged read of branch+date now feeds the strips, the last-synced boxes
  // and the pip, in place of the ten per-branch queries the status card used to
  // fire. Counted first, then every page at once — same shape as
  // refreshStaffPerfProgress; PostgREST caps an unpaginated select at 1000.
  const { count, error: countErr } = await sb.from(SS_TABLE).select('id',{count:'exact',head:true});
  if (countErr){ host.innerHTML = `<div style="font-size:12px;color:var(--bad)">Failed to load progress: ${countErr.message}</div>`; return; }
  const pages = [];
  for (let offset = 0; offset < (count || 0); offset += SS_PAGE_SIZE){
    pages.push(sb.from(SS_TABLE).select('branch,date').range(offset, offset + SS_PAGE_SIZE - 1));
  }
  const results = await Promise.all(pages);
  const failed = results.find(r => r.error);
  if (failed){ host.innerHTML = `<div style="font-size:12px;color:var(--bad)">Failed to load progress: ${failed.error.message}</div>`; return; }
  const all = results.flatMap(r => r.data || []);

  const covered = new Set();
  const rowsByBranch = {}, lastByBranch = {};
  for (const r of all){
    covered.add(`${r.branch}|${r.date}`);
    rowsByBranch[r.branch] = (rowsByBranch[r.branch] || 0) + 1;
    if (r.date && (!lastByBranch[r.branch] || r.date > lastByBranch[r.branch])) lastByBranch[r.branch] = r.date;
  }

  spProgBeginBatch();
  let html = '';
  for (const code of BRANCH_KEYS){
    const days = spGetBackfillDays(SS_BRANCH_START[code] || SS_BACKFILL_START, SS_BRANCH_END[code]);
    html += spRenderBackfillStrips(BRANCHES[code].name, days, covered, d => `${code}|${spIsoDate(d)}`);
  }
  host.innerHTML = html;
  spProgEndBatch('ssProgressGrid');

  ssRenderLastSynced(rowsByBranch, lastByBranch);
  ssRenderSyncStrip(lastByBranch);
}

function ssRenderLastSynced(rowsByBranch, lastByBranch){
  const host = document.getElementById('ssLastSynced');
  if (!host) return;
  host.innerHTML = BRANCH_KEYS.map(k => {
    const last = lastByBranch[k];
    const rows = rowsByBranch[k] || 0;
    return `<div class="sp-branch-box">
      <div class="sp-branch-box-title">${BRANCHES[k].name}</div>
      <div style="font-size:12px;color:${last ? 'var(--good)' : 'var(--muted2)'};margin-top:2px">
        ${last ? '🟢 Last synced: ' + last : '⚪ No data yet'}
      </div>
      <div style="font-size:11px;color:var(--muted)">${rows} row${rows === 1 ? '' : 's'} total</div>
    </div>`;
  }).join('');
}

// The Ledgers strip and its tab pip. Unlike the Phorest tabs this feed arrives
// through Apps Script on its own schedule, so "today" is the wrong bar — green
// means every branch has landed something dated yesterday or later, i.e. the
// pipe is alive; amber names the branch that has gone quiet (Kate, 2026-09-03).
function ssSyncCutoffIso(){
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 1);
  return spIsoDate(cutoff);
}

function ssRenderSyncStrip(lastByBranch){
  const cutoffIso = ssSyncCutoffIso();
  const todayIso  = spIsoDate(new Date());
  const rows = BRANCH_KEYS.map(k => {
    const end  = SS_BRANCH_END[k];
    const last = lastByBranch[k];
    return {
      label: BRANCHES[k].name,
      in: !!last && last >= cutoffIso,
      ended: !!(end && todayIso > end),
      title: last ? `${BRANCHES[k].name} — last synced ${last}` : `${BRANCHES[k].name} — nothing synced yet`,
    };
  });
  // No paste tab: nothing here is uploaded by hand, the Sheet pushes it.
  spRenderTodayStrip('ssTodayStrip', 'tabPipSheetsync', null, rows, {
    badge: 'Synced',
    missingWord: 'behind',
    allInWord: 'all up to date',
    pipMissing: `with nothing since ${cutoffIso}`,
    pipClear: 'synced within the last day',
  });
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
  if (force || !fromEl.value) fromEl.value = spMonthStartIso(); // this month; wider windows are a chip away (Kate, 2026-09-04)
  if (force || !toEl.value)   toEl.value   = todayIso;
}

function resetSheetSyncFilter(){
  trResetChips('sheetsync','ssf');
  document.getElementById('ssfBranch').value = '';
  document.getElementById('ssfStaff').value = '';
  ssSetDefaultFilterDates(true);
  ssLastData = [];
  ssColFilters = {};
  ssCloseColFilter();
  document.getElementById('ssTableHost').innerHTML =
    '<div style="padding:16px;font-size:14px;color:var(--muted2)">Pick a filter and click Apply.</div>';
  document.getElementById('ssResultCount').textContent = '';
}

// Client-count columns show whole numbers — Treatment AED is the only
// money column and keeps 2 decimals.
const SS_COUNT_FIELDS = new Set(['ncr','req','salon','new_client','rebooked','total','retail_unit_qty','treatments_unit_qty']);
function ssFmt(v, key){
  if (typeof v !== 'number') return v ?? '';
  const d = key && SS_COUNT_FIELDS.has(key) ? 0 : 2;
  return TR_NUM_FMT[d].format(v);
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
    host.innerHTML = '<div style="padding:16px;font-size:14px;color:var(--muted2)">No matching rows.</div>';
    document.getElementById('ssResultCount').textContent = '';
    return;
  }

  const filteredData = ssColFilterRows(ssLastData);
  const displayRows = ssSummaryMode ? ssAggregateByEmployee(filteredData) : filteredData;
  // Same render cap as the Staff Daily table: this selection runs to ~17,500
  // rows, and every sort rebuilt all of them. The TOTAL row still sums the
  // whole filtered selection (Kate, 2026-09-03).
  const capped = !ssSummaryMode && !ssShowAllRows && displayRows.length > SS_RENDER_CAP;
  const renderRows = capped ? displayRows.slice(0, SS_RENDER_CAP) : displayRows;

  const countEl = document.getElementById('ssResultCount');
  if (ssCapWarning){
    countEl.textContent = `Showing first ${SS_ROW_LIMIT} rows — narrow your filters for more precision`;
  } else if (capped){
    countEl.innerHTML = `${displayRows.length} rows · showing the newest ${SS_RENDER_CAP} ` +
      `<button class="btn-outline" style="padding:3px 9px;font-size:12.5px;margin-left:4px" onclick="ssRenderAllRows()">Show all</button>`;
  } else {
    countEl.textContent = `${displayRows.length} row${displayRows.length === 1 ? '' : 's'}${ssSummaryMode ? ' (summarized per staff member)' : ''}`;
  }

  const visibleCols = SS_COLS.filter(c => !ssHiddenCols.has(c[1]));

  // Group by branch (canonical BRANCH_KEYS order), sorted within each group,
  // mirroring the Staff Performance tab's branch-block layout.
  const groups = new Map();
  for (const row of renderRows){
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
  host.innerHTML = '<div style="padding:16px;font-size:14px;color:var(--muted2)">Loading…</div>';

  const buildQuery = () => {
    let q = sb.from(SS_TABLE).select('*').order('date',{ascending:false}).order('branch').order('staff_name');
    if (branch) q = q.eq('branch', branch);
    if (from)   q = q.gte('date', from);
    if (to)     q = q.lte('date', to);
    if (staff)  q = q.ilike('staff_name', `%${staff}%`);
    return q;
  };

  const buildCountQuery = () => {
    let q = sb.from(SS_TABLE).select('id', { count:'exact', head:true });
    if (branch) q = q.eq('branch', branch);
    if (from)   q = q.gte('date', from);
    if (to)     q = q.lte('date', to);
    if (staff)  q = q.ilike('staff_name', `%${staff}%`);
    return q;
  };

  // Count first, then every page at once — see runStaffPerfFilter's note.
  const { count, error: countErr } = await buildCountQuery();
  if (countErr){ host.innerHTML = `<div style="padding:16px;font-size:14px;color:var(--bad)">Query failed: ${countErr.message}</div>`; return; }

  const wanted = Math.min(count || 0, SS_ROW_LIMIT);
  const pages = [];
  for (let offset = 0; offset < wanted; offset += SS_PAGE_SIZE){
    pages.push(buildQuery().range(offset, Math.min(offset + SS_PAGE_SIZE, wanted) - 1));
  }
  const results = await Promise.all(pages);
  const failed = results.find(r => r.error);
  if (failed){ host.innerHTML = `<div style="padding:16px;font-size:14px;color:var(--bad)">Query failed: ${failed.error.message}</div>`; return; }
  const all = results.flatMap(r => r.data || []);

  ssCapWarning = all.length >= SS_ROW_LIMIT;
  ssLastData = all.slice(0, SS_ROW_LIMIT)
    .map(row => ({...row, staff_name: canonicalStaffName(row.staff_name)}));
  ssColFilters = {};
  ssShowAllRows = false;
  ssRenderTable();
}

// ── INIT ──────────────────────────────────────────────────────
function initSheetSyncTab(){
  ssPopulateFilterBranch();
  ssSetDefaultFilterDates(false);
  ssSyncSummaryToggleUI();
  refreshSheetSyncProgress();
  // Browse runs when Browse is opened, not on tab load — see trRunBrowseOnce.
}
