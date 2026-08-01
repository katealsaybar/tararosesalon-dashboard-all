/* ============================================================
   TARA ROSE LADIES SALON — staff-performance.js
   Paste-parser for Phorest's "Staff Performance Overview" report,
   saved straight to Supabase (phorest_staff_daily table).
   Uses the shared `sb` client and `BRANCHES` config from upload.js
   — load this script AFTER upload.js.
   ============================================================ */

const SP_TABLE = 'phorest_staff_daily';
const SP_BRANCHES = [
  { code: 'SAA', label: 'Saadiyat' },
  { code: 'KCA', label: 'Khalifa City A' },
  { code: 'MC',  label: 'Motor City' },
  { code: 'AQ',  label: 'Al Quoz' },
  { code: 'FRT', label: 'Fratelli' },
];
const SP_BACKFILL_START = '2026-01-01';

// ── PARSER ───────────────────────────────────────────────────
// Same token-walk approach proven against 4 real Phorest branch samples:
// name words → 3 int counts → rating ("NA") → 10 money fields, repeating.
// The "Total" row is a special case: name "Total" + 8 money fields, no counts.

function spNormLine(s){ return s.toLowerCase().replace(/\s+/g,' ').trim(); }
const spIsInt   = t => /^\d+$/.test(t);
const spIsMoney = t => /^-?[\d,]+\.\d{2}$/.test(t);
const spToNum   = t => parseFloat(t.replace(/,/g,''));

const SP_HEADER_LINES = new Set([
  'employee client staff visits services courses (perf) products total',
  '# new rqs ex vat total ex vat total ex vat total ex vat total ex vat total',
  'avg. spend per client',
  'rat'
]);

// Splits a paste containing several reports back-to-back (e.g. a whole week,
// pasted one after another into the same box) into one line-array per report.
// Each report is delimited by its "Staff Performance Overview" title line;
// the salon/branch line immediately before that title is pulled into the
// same block since spParseOneBlock looks for it within the block.
function spSplitBlocks(lines){
  const markerIdx = [];
  lines.forEach((l, i) => { if (spNormLine(l) === 'staff performance overview') markerIdx.push(i); });
  if (!markerIdx.length) return [lines]; // no title found — treat as one block, let the parser raise its own error
  return markerIdx.map((idx, n) => {
    const start = idx > 0 ? idx - 1 : 0;
    const end = (n + 1 < markerIdx.length) ? markerIdx[n + 1] - 1 : lines.length;
    return lines.slice(start, end);
  });
}

function spParseOneBlock(lines, branchCode){
  if (!lines.length) throw new Error('Empty report block.');

  // Phorest's salon/company header line format differs per branch (dash-wrapped,
  // legal-entity suffix, plain prefix, etc.) — too inconsistent to parse a branch
  // name out of reliably, so branch is a manual selection. Located here only to
  // strip it out of the data block below.
  const salonLine = lines.find(l => /salon/i.test(l));
  const dateLine  = lines.find(l => /\d{2}\/\d{2}\/\d{2}\s*-\s*\d{2}\/\d{2}\/\d{2}/.test(l));
  if (!dateLine) throw new Error('Could not find the date line (expected "DD/MM/YY - DD/MM/YY").');

  const m = dateLine.match(/(\d{2}\/\d{2}\/\d{2})\s*-\s*(\d{2}\/\d{2}\/\d{2})/);
  const dateFrom = m[1], dateTo = m[2];
  if (dateFrom !== dateTo){
    throw new Error(`This looks like a multi-day range (${dateFrom} – ${dateTo}) — Phorest doesn't break a range down by day, so paste a single-day report only.`);
  }

  const bodyLines = lines.filter(l => {
    const n = spNormLine(l);
    if (l === salonLine) return false;
    if (l === dateLine) return false;
    if (n === 'staff performance overview') return false;
    if (n.startsWith('visits are calculated')) return false;
    if (SP_HEADER_LINES.has(n)) return false;
    if (/^page\s*\d+$/i.test(n)) return false;
    return true;
  });

  const tokens = bodyLines.join(' ').split(/\s+/).filter(Boolean);

  const employees = [];
  let totals = null;
  let i = 0;
  while (i < tokens.length){
    const nameParts = [];
    while (i < tokens.length && !spIsInt(tokens[i]) && !spIsMoney(tokens[i])){
      nameParts.push(tokens[i]);
      i++;
    }
    if (!nameParts.length){ i++; continue; }
    const name = nameParts.join(' ');

    if (name.toLowerCase() === 'total'){
      const need = 8;
      if (i + need > tokens.length) break;
      const v = tokens.slice(i, i + need).map(spToNum);
      totals = {
        servicesExVat:v[0], servicesTotal:v[1],
        coursesExVat:v[2],  coursesTotal:v[3],
        productsExVat:v[4], productsTotal:v[5],
        totalExVat:v[6],    totalTotal:v[7]
      };
      i += need;
      break;
    }

    const need = 14;
    if (i + need > tokens.length) break;
    const f = tokens.slice(i, i + need);
    employees.push({
      name,
      visits:        parseInt(f[0],10),
      newClients:    parseInt(f[1],10),
      rqs:           parseInt(f[2],10),
      rating:        f[3],
      servicesExVat: spToNum(f[4]),  servicesTotal: spToNum(f[5]),
      coursesExVat:  spToNum(f[6]),  coursesTotal:  spToNum(f[7]),
      productsExVat: spToNum(f[8]),  productsTotal: spToNum(f[9]),
      totalExVat:    spToNum(f[10]), totalTotal:    spToNum(f[11]),
      avgSpendExVat: spToNum(f[12]), avgSpendTotal: spToNum(f[13])
    });
    i += need;
  }

  // A closed/zero-activity day's report has only the Total line (all zeros) and no
  // employee rows at all — that's a valid empty day, not a malformed report. Only
  // reject when neither employees nor a Total line were found.
  if (!employees.length && !totals) throw new Error('No employee rows recognised — the report format may have changed.');

  return { branch: branchCode, date: dateFrom, employees, totals };
}

// Parses one or more reports pasted back-to-back. Each block is parsed
// independently so one malformed paste doesn't sink the whole batch.
function parseStaffPerformanceBatch(rawText, branchCode){
  const allLines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!allLines.length) throw new Error('Paste box is empty.');
  if (!branchCode) throw new Error('Select a branch first.');

  return spSplitBlocks(allLines).map((blockLines, i) => {
    try{
      return { ok: true, rec: spParseOneBlock(blockLines, branchCode) };
    } catch(e){
      return { ok: false, blockIndex: i, error: e.message || String(e) };
    }
  });
}

function spToISODate(ddmmyy){
  const [d,mo,y] = ddmmyy.split('/');
  return `20${y}-${mo}-${d}`;
}

function spBuildRows(rec){
  const isoDate = spToISODate(rec.date);
  const rows = rec.employees.map(e => ({
    branch: rec.branch, date: isoDate, employee_name: e.name, is_total: false,
    visits: e.visits, new_clients: e.newClients, rqs: e.rqs, rating: e.rating,
    services_ex_vat: e.servicesExVat, services_total: e.servicesTotal,
    courses_ex_vat:  e.coursesExVat,  courses_total:  e.coursesTotal,
    products_ex_vat: e.productsExVat, products_total: e.productsTotal,
    total_ex_vat:    e.totalExVat,    total_total:    e.totalTotal,
    avg_spend_ex_vat: e.avgSpendExVat, avg_spend_total: e.avgSpendTotal
  }));
  if (rec.totals){
    const t = rec.totals;
    rows.push({
      branch: rec.branch, date: isoDate, employee_name: 'TOTAL', is_total: true,
      visits: null, new_clients: null, rqs: null, rating: null,
      services_ex_vat: t.servicesExVat, services_total: t.servicesTotal,
      courses_ex_vat:  t.coursesExVat,  courses_total:  t.coursesTotal,
      products_ex_vat: t.productsExVat, products_total: t.productsTotal,
      total_ex_vat:    t.totalExVat,    total_total:    t.totalTotal,
      avg_spend_ex_vat: null, avg_spend_total: null
    });
  }
  return rows;
}

// ── UI: PASTE & SAVE — one box per branch ─────────────────────

function spRenderBranchBoxes(){
  const host = document.getElementById('spBranchBoxes');
  if (!host) return;
  host.innerHTML = SP_BRANCHES.map(b => `
    <div class="sp-branch-box">
      <div class="sp-branch-box-title">${b.label}</div>
      <textarea id="spBox_${b.code}" placeholder="Paste ${b.label}'s report here (or several days back-to-back)..."></textarea>
      <div class="sp-branch-box-actions">
        <button class="btn" style="width:auto;padding:8px 14px" onclick="handleStaffPerfParseOne('${b.code}')">Parse &amp; Save</button>
        <button class="btn-outline" onclick="document.getElementById('spBox_${b.code}').value=''; document.getElementById('spBoxMsg_${b.code}').textContent=''">Clear</button>
      </div>
      <div id="spBoxMsg_${b.code}" class="sp-branch-box-msg"></div>
    </div>
  `).join('');
}

function spShowBoxMsg(code, text, ok){
  const el = document.getElementById(`spBoxMsg_${code}`);
  if (!el) return;
  el.textContent = text;
  el.style.color = ok ? 'var(--good)' : 'var(--bad)';
}

// Parses + saves whatever is in one branch's box. Returns a summary object;
// throws nothing — errors are captured in the returned result so Save All
// can process all 4 boxes without one failure stopping the others.
async function spParseAndSaveBox(code){
  const textarea = document.getElementById(`spBox_${code}`);
  const raw = textarea ? textarea.value : '';
  const branchLabel = SP_BRANCHES.find(b => b.code === code)?.label || code;

  if (!raw.trim()) return { code, skipped: true };

  try{
    const results = parseStaffPerformanceBatch(raw, code);
    const oks   = results.filter(r => r.ok);
    const fails = results.filter(r => !r.ok);

    if (!oks.length){
      throw new Error(fails.map(f => `Report ${f.blockIndex + 1}: ${f.error}`).join(' | '));
    }

    let allRows = [];
    const dates = [];
    oks.forEach(({ rec }) => {
      const rows = spBuildRows(rec);
      allRows = allRows.concat(rows);
      dates.push(rows[0].date);
    });

    // One delete per distinct date (overwrite semantics), then a single bulk insert.
    for (const d of dates){
      await sb.from(SP_TABLE).delete().eq('branch', code).eq('date', d);
    }
    const { error } = await sb.from(SP_TABLE).insert(allRows);
    if (error) throw error;

    const daysList = oks.map(o => o.rec.date).join(', ');
    let msg = `Saved ${oks.length} day${oks.length===1?'':'s'} (${allRows.length} rows): ${daysList}.`;
    if (fails.length) msg += ` — ${fails.length} report(s) failed: ` + fails.map(f => `#${f.blockIndex+1} (${f.error})`).join('; ');

    spShowBoxMsg(code, msg, fails.length === 0);
    if (!fails.length && textarea) textarea.value = '';
    return { code, ok: fails.length === 0, days: oks.length, rows: allRows.length, message: msg };
  } catch(e){
    const msg = e.message || String(e);
    spShowBoxMsg(code, msg, false);
    return { code, ok: false, message: msg };
  }
}

async function handleStaffPerfParseOne(code){
  await spParseAndSaveBox(code);
  await refreshStaffPerfProgress();
}

async function handleStaffPerfSaveAll(){
  const summaryEl = document.getElementById('spSaveAllMsg');
  summaryEl.textContent = 'Saving…';
  summaryEl.style.color = 'var(--muted)';

  const results = await Promise.all(SP_BRANCHES.map(b => spParseAndSaveBox(b.code)));
  const attempted = results.filter(r => !r.skipped);

  if (!attempted.length){
    summaryEl.textContent = 'All 4 boxes are empty — nothing to save.';
    summaryEl.style.color = 'var(--bad)';
  } else {
    const failed = attempted.filter(r => !r.ok);
    const parts = attempted.map(r => {
      const label = SP_BRANCHES.find(b => b.code === r.code)?.label || r.code;
      return r.ok ? `${label}: ${r.days} day(s)` : `${label}: FAILED`;
    });
    summaryEl.textContent = parts.join(' · ');
    summaryEl.style.color = failed.length ? 'var(--bad)' : 'var(--good)';
  }
  await refreshStaffPerfProgress();
}

// ── BACKFILL PROGRESS (queried live from Supabase) ──────────

function spPad2(n){ return String(n).padStart(2,'0'); }
function spIsoDate(d){ return `${d.getFullYear()}-${spPad2(d.getMonth()+1)}-${spPad2(d.getDate())}`; }

function spGetBackfillDays(){
  const days = [];
  const start = new Date(SP_BACKFILL_START + 'T00:00:00');
  const today = new Date();
  today.setHours(0,0,0,0);
  for (let d = new Date(start); d <= today; d.setDate(d.getDate()+1)){
    days.push(new Date(d));
  }
  return days;
}

async function refreshStaffPerfProgress(){
  const host = document.getElementById('spProgressGrid');
  if (!host) return;
  host.innerHTML = '<div style="font-size:12px;color:var(--muted2);padding:8px 0">Loading…</div>';

  const { data, error } = await sb.from(SP_TABLE).select('branch,date').eq('is_total', true);
  if (error){ host.innerHTML = `<div style="font-size:12px;color:var(--bad)">Failed to load progress: ${error.message}</div>`; return; }

  const covered = new Set((data || []).map(r => `${r.branch}|${r.date}`));
  const days = spGetBackfillDays();

  let html = '';
  for (const b of SP_BRANCHES){
    const doneDays = days.filter(d => covered.has(`${b.code}|${spIsoDate(d)}`));
    const firstMissing = days.find(d => !covered.has(`${b.code}|${spIsoDate(d)}`));
    html += `<div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px">
        <span style="font-weight:600">${b.label}</span>
        <span style="color:var(--muted)">${doneDays.length}/${days.length} days${firstMissing ? ' — next missing: <b style="color:var(--warn)">'+firstMissing.toLocaleDateString('en-GB')+'</b>' : ' — <b style="color:var(--good)">fully captured</b>'}</span>
      </div>
      <div class="sp-day-strip">` +
      days.map(d => {
        const done = covered.has(`${b.code}|${spIsoDate(d)}`);
        const label = d.toLocaleDateString('en-GB', { weekday:'long', day:'2-digit', month:'short', year:'numeric' });
        return `<div class="sp-day-cell${done?' done':''}" title="${label}"></div>`;
      }).join('') +
      '</div></div>';
  }
  host.innerHTML = html;
}

// ── BROWSE / FILTER ──────────────────────────────────────────

function spSetDefaultFilterDates(force){
  const fromEl = document.getElementById('spfFrom');
  const toEl   = document.getElementById('spfTo');
  if (!fromEl || !toEl) return;
  if (force || !fromEl.value) fromEl.value = SP_BACKFILL_START;
  if (force || !toEl.value)   toEl.value   = spIsoDate(new Date());
}

function spPopulateFilterBranch(){
  const sel = document.getElementById('spfBranch');
  if (!sel || sel.dataset.populated) return;
  SP_BRANCHES.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.code; opt.textContent = b.label;
    sel.appendChild(opt);
  });
  sel.dataset.populated = '1';
}

function resetStaffPerfFilter(){
  document.getElementById('spfBranch').value = '';
  document.getElementById('spfStylist').value = '';
  spSetDefaultFilterDates(true);
  spLastData = [];
  spCapWarning = false;
  document.getElementById('spTableHost').innerHTML =
    '<div style="padding:16px;font-size:12px;color:var(--muted2)">Pick a filter and click Apply — showing everything by default can be slow once the backfill fills up.</div>';
  document.getElementById('spResultCount').textContent = '';
}

const SP_COLS = [
  ['Branch','branch'],['Date','date'],['Employee','employee_name'],
  ['#','visits'],['New','new_clients'],['RQs','rqs'],['Rat','rating'],
  ['Svc ExVAT','services_ex_vat'],['Svc Total','services_total'],
  ['Crs ExVAT','courses_ex_vat'],['Crs Total','courses_total'],
  ['Prod ExVAT','products_ex_vat'],['Prod Total','products_total'],
  ['Tot ExVAT','total_ex_vat'],['Tot Total','total_total'],
  ['Avg ExVAT','avg_spend_ex_vat'],['Avg Total','avg_spend_total']
];
const SP_ROW_LIMIT = 25000;

function spFmt(v){ return typeof v === 'number' ? v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) : (v ?? ''); }

// ── SORT + COLUMN VISIBILITY STATE (persisted like a spreadsheet view) ──
let spLastData  = [];
let spSortCol   = 'date';
let spSortDir   = 'desc';
let spHiddenCols = new Set(JSON.parse(localStorage.getItem('spHiddenCols') || '[]'));
let spCapWarning = false;
let spSummaryMode = localStorage.getItem('spSummaryMode') === '1';

// Fields that get summed when Summary mode combines an employee's daily rows
// into one row for the selected date range (mirrors the Target Sheet's weekly totals).
const SP_SUM_FIELDS = [
  'visits','new_clients','rqs',
  'services_ex_vat','services_total','courses_ex_vat','courses_total',
  'products_ex_vat','products_total','total_ex_vat','total_total'
];

function spAggregateByEmployee(rows){
  // Branch column hidden → nothing on screen distinguishes branches, so fold
  // an employee's rows together across branches too instead of leaving
  // confusing duplicate-looking rows for the same name.
  const groupByBranch = !spHiddenCols.has('branch');
  const groups = new Map();
  for (const row of rows){
    const key = groupByBranch ? (row.branch + '|' + row.employee_name) : row.employee_name;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const out = [];
  for (const rs of groups.values()){
    const agg = { branch: groupByBranch ? rs[0].branch : 'ALL', employee_name: rs[0].employee_name, rating: 'NA' };
    for (const f of SP_SUM_FIELDS) agg[f] = 0;
    for (const r of rs) for (const f of SP_SUM_FIELDS) agg[f] += (typeof r[f] === 'number' ? r[f] : 0);
    agg.avg_spend_ex_vat = agg.visits ? agg.total_ex_vat / agg.visits : 0;
    agg.avg_spend_total  = agg.visits ? agg.total_total  / agg.visits : 0;
    const dates = rs.map(r => r.date).filter(Boolean).sort();
    agg.date = !dates.length ? '' : dates[0] === dates[dates.length-1] ? dates[0] : `${dates[0]} → ${dates[dates.length-1]}`;
    out.push(agg);
  }
  return out;
}

// Grand total across every row currently on screen (post filter/aggregate),
// always pinned as the first table row so it's visible no matter how many
// stylists show up below it.
function spGrandTotal(rows){
  // Pure sums only — no averaged figure belongs on a TOTAL row, so
  // avg_spend_ex_vat/avg_spend_total are left unset and render blank.
  const t = { branch: '', date: '', employee_name: 'TOTAL', rating: '' };
  for (const f of SP_SUM_FIELDS) t[f] = 0;
  for (const r of rows) for (const f of SP_SUM_FIELDS) t[f] += (typeof r[f] === 'number' ? r[f] : 0);
  return t;
}

function spToggleSummaryMode(){
  spSummaryMode = !spSummaryMode;
  localStorage.setItem('spSummaryMode', spSummaryMode ? '1' : '0');
  spSyncSummaryToggleUI();
  spRenderTable();
}

function spSyncSummaryToggleUI(){
  const track = document.getElementById('spSummaryTrack');
  const lbl = document.getElementById('spSummaryLbl');
  if (!track) return;
  track.classList.toggle('on', spSummaryMode);
  lbl.textContent = spSummaryMode ? 'Summary' : 'Daily';
}

function spCompare(av, bv, dir){
  const aEmpty = av === null || av === undefined || av === '' || av === 'NA';
  const bEmpty = bv === null || bv === undefined || bv === '' || bv === 'NA';
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;   // blanks/NA always sort to the bottom, like Sheets
  if (bEmpty) return -1;
  const cmp = (typeof av === 'number' && typeof bv === 'number')
    ? av - bv
    : String(av).localeCompare(String(bv), undefined, {numeric:true, sensitivity:'base'});
  return dir === 'asc' ? cmp : -cmp;
}

function spSortBy(key){
  if (spSortCol === key) spSortDir = spSortDir === 'asc' ? 'desc' : 'asc';
  else { spSortCol = key; spSortDir = 'asc'; }
  spRenderTable();
}

function spToggleCol(key, checked){
  if (checked) spHiddenCols.delete(key); else spHiddenCols.add(key);
  localStorage.setItem('spHiddenCols', JSON.stringify([...spHiddenCols]));
  spRenderTable();
}

function spShowAllCols(){
  spHiddenCols.clear();
  localStorage.setItem('spHiddenCols', JSON.stringify([]));
  spBuildColPicker();
  spRenderTable();
}

function spBuildColPicker(){
  const panel = document.getElementById('spColPicker');
  if (!panel) return;
  panel.innerHTML = SP_COLS.map(c =>
    `<label><input type="checkbox" ${spHiddenCols.has(c[1])?'':'checked'} onchange="spToggleCol('${c[1]}', this.checked)">${c[0]}</label>`
  ).join('') + '<div class="sp-col-picker-actions"><button class="btn-outline" style="flex:1;padding:6px" onclick="spShowAllCols()">Show all</button></div>';
}

function spToggleColPicker(e){
  e.stopPropagation();
  const panel = document.getElementById('spColPicker');
  if (!panel) return;
  const opening = panel.style.display !== 'block';
  if (opening){ spBuildColPicker(); panel.style.display = 'block'; }
  else panel.style.display = 'none';
}

document.addEventListener('click', (e) => {
  const panel = document.getElementById('spColPicker');
  const btn   = document.getElementById('spColPickerBtn');
  if (panel && panel.style.display === 'block' && !panel.contains(e.target) && e.target !== btn) {
    panel.style.display = 'none';
  }
});

function spRenderTable(){
  const host = document.getElementById('spTableHost');
  if (!spLastData.length){
    host.innerHTML = '<div style="padding:16px;font-size:12px;color:var(--muted2)">No matching rows.</div>';
    document.getElementById('spResultCount').textContent = '';
    return;
  }

  const displayRows = spSummaryMode ? spAggregateByEmployee(spLastData) : spLastData;
  document.getElementById('spResultCount').textContent = spCapWarning
    ? `Showing first ${SP_ROW_LIMIT} rows — narrow your filters for more precision`
    : `${displayRows.length} row${displayRows.length === 1 ? '' : 's'}${spSummaryMode ? ' (summarized per employee)' : ''}`;

  const visibleCols = SP_COLS.filter(c => !spHiddenCols.has(c[1]));

  // Group by branch (canonical SP_BRANCHES order), sorted within each group —
  // mirrors the branch-block layout with a blank row between branches used in the Target Sheet.
  const branchOrder = SP_BRANCHES.map(b => b.code);
  const groups = new Map();
  for (const row of displayRows){
    if (!groups.has(row.branch)) groups.set(row.branch, []);
    groups.get(row.branch).push(row);
  }
  const orderedKeys = [...groups.keys()].sort((a,b) => {
    const ia = branchOrder.indexOf(a), ib = branchOrder.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  let html = '<table class="sp-table"><thead><tr>' + visibleCols.map(c => {
    const active = c[1] === spSortCol;
    const arrow = active ? (spSortDir === 'asc' ? ' ▲' : ' ▼') : '';
    return `<th class="sp-th-sort${active?' active':''}" onclick="spSortBy('${c[1]}')">${c[0]}${arrow}</th>`;
  }).join('') + '</tr></thead><tbody>';

  const grandTotal = spGrandTotal(displayRows);
  html += '<tr class="is-total">' + visibleCols.map(c => `<td>${spFmt(grandTotal[c[1]])}</td>`).join('') + '</tr>';

  orderedKeys.forEach((key, gi) => {
    const rows = groups.get(key).slice().sort((a,b) => spCompare(a[spSortCol], b[spSortCol], spSortDir));
    for (const row of rows){
      html += '<tr>' + visibleCols.map(c => `<td>${spFmt(row[c[1]])}</td>`).join('') + '</tr>';
    }
    if (gi < orderedKeys.length - 1){
      html += `<tr class="sp-group-spacer"><td colspan="${visibleCols.length}"></td></tr>`;
    }
  });
  html += '</tbody></table>';
  host.innerHTML = html;
}

// Supabase/PostgREST silently caps each response at its own server-side
// max-rows setting (commonly 1000) regardless of the .limit() we ask for —
// "All branches" needs ~4x the raw rows per day that a single branch does,
// so it was quietly getting truncated to a sliver of the selected date
// range while a single-branch query stayed under the cap and looked fine.
// Page through with .range() so every filter combination gets the full set.
const SP_PAGE_SIZE = 1000;

async function runStaffPerfFilter(){
  const branch  = document.getElementById('spfBranch').value;
  const stylist = document.getElementById('spfStylist').value.trim();
  const from    = document.getElementById('spfFrom').value;
  const to      = document.getElementById('spfTo').value;

  const host = document.getElementById('spTableHost');
  host.innerHTML = '<div style="padding:16px;font-size:12px;color:var(--muted2)">Loading…</div>';

  const buildQuery = () => {
    let q = sb.from(SP_TABLE).select('*').order('date',{ascending:false}).order('branch').order('employee_name');
    if (branch)  q = q.eq('branch', branch);
    if (from)    q = q.gte('date', from);
    if (to)      q = q.lte('date', to);
    if (stylist) q = q.ilike('employee_name', `%${stylist}%`);
    return q;
  };

  let all = [];
  let offset = 0;
  while (true){
    const { data, error } = await buildQuery().range(offset, offset + SP_PAGE_SIZE - 1);
    if (error){ host.innerHTML = `<div style="padding:16px;font-size:12px;color:var(--bad)">Query failed: ${error.message}</div>`; return; }
    all = all.concat(data);
    if (data.length < SP_PAGE_SIZE || all.length >= SP_ROW_LIMIT) break;
    offset += SP_PAGE_SIZE;
  }

  spCapWarning = all.length >= SP_ROW_LIMIT;
  spLastData = all.slice(0, SP_ROW_LIMIT).filter(row => !row.is_total);
  spRenderTable();
}

// ── INIT ──────────────────────────────────────────────────────

let spBoxesRendered = false;
let spFilterAutoRun = false;

// Paste-and-save is the old workflow now that bulk PDF upload exists — collapsed by default.
let spPasteCollapsed = localStorage.getItem('spPasteCollapsed') === null
  ? true
  : localStorage.getItem('spPasteCollapsed') === '1';

function spSyncPasteToggleUI(){
  const body = document.getElementById('spPasteBody');
  const btn  = document.getElementById('spPasteToggleBtn');
  if (!body || !btn) return;
  body.style.display = spPasteCollapsed ? 'none' : 'block';
  btn.textContent = spPasteCollapsed ? 'Show ▾' : 'Hide ▴';
}

function spTogglePasteCollapse(){
  spPasteCollapsed = !spPasteCollapsed;
  localStorage.setItem('spPasteCollapsed', spPasteCollapsed ? '1' : '0');
  spSyncPasteToggleUI();
}

function initStaffPerfTab(){
  if (!spBoxesRendered){
    spRenderBranchBoxes();
    spBoxesRendered = true;
  }
  spPopulateFilterBranch();
  spSetDefaultFilterDates(false);
  spSyncSummaryToggleUI();
  spSyncPasteToggleUI();
  refreshStaffPerfProgress();
  if (typeof initStaffPerfPdfDrop === 'function') initStaffPerfPdfDrop();

  if (!spFilterAutoRun){
    spFilterAutoRun = true;
    runStaffPerfFilter();
  }
}
