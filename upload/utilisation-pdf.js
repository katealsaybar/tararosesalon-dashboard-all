/* ============================================================
   TARA ROSE LADIES SALON — utilisation-pdf.js
   Two front doors for Phorest's "Staff Utilisation" report, both
   targeting the staff_utilisation table — mirrors phorest-staff.js's
   paste-plus-PDF-backfill pattern:
     1. Paste & Save — one textarea per branch (Ctrl+A/Ctrl+C off the
        Phorest report screen, no download needed). Primary workflow.
     2. Bulk Upload PDFs — for backfilling from PDFs already on disk.
   Replaces the old manual CSV upload (which required running
   parse_utilisation.py by hand first, then reshaping columns).
   Load this AFTER upload.js — reuses sb, BRANCHES, BRANCH_KEYS,
   detectBranch, showToast from that file.

   Parsing logic ported from utilisation reports/parse_utilisation.py —
   see that file's docstring for the report layout quirks this handles
   (long staff names wrapping onto their own line, "(A)" archived
   marker, NA columns, etc). Unlike the Staff Performance Overview
   report, this PDF's text stream is in normal top-to-bottom,
   left-to-right reading order — no axis swap needed. A clipboard
   paste of the same on-screen report should reproduce the same line
   structure, so the same line-parser (utilParseLines) serves both
   front doors.
   ============================================================ */

let utilPdfQueue = [];

const UTIL_TABLE = 'staff_utilisation';
const UTIL_SKIP_PREFIXES = ["Staff Utilisation", "Staff All", "Total", "Available", "Utilisation",
  "Services Rev", "Products Rev", "Total Rev", "3x Wages", "Page "];
const UTIL_DATA_ROW_RE = /^(.+?)\s+(\d{1,3}:\d{2})\s+(\d{1,3}:\d{2})\s+(NA|-?\d+(?:\.\d+)?%)\s+(NA|-?\d+(?:\.\d+)?)\s+(NA|-?\d+(?:\.\d+)?)\s+(NA|-?\d+(?:\.\d+)?)\s+(NA|-?\d+(?:\.\d+)?)$/;
const UTIL_DATE_RANGE_RE = /^(\d{2}\/\d{2}\/\d{2})\s*-\s*(\d{2}\/\d{2}\/\d{2})\s*\(Days:\s*\d+\)$/;
const UTIL_NAME_ONLY_RE = /^[A-Za-z][A-Za-z.'\- ]*(?:\s*\(A\))?$/;

function utilHmmToHours(hmm){
  const [h,m] = hmm.split(':').map(Number);
  return +(h + m/60).toFixed(4);
}

function utilNum(v){
  return v === 'NA' ? null : parseFloat(v.replace('%',''));
}

function utilDdmmyyToISO(ddmmyy){
  const [d,mo,y] = ddmmyy.split('/');
  return `20${y}-${mo}-${d}`;
}

// Parses ONE report's worth of lines (one "Staff Utilisation" title, one
// date range, its staff rows). Callers that may receive several days
// pasted/queued back-to-back split on the title line first (utilSplitBlocks).
function utilParseLines(lines){
  let branch = null, dateFrom = null, dateTo = null;
  let prevRow = null, seenFirstRow = false; // prevRow: last parsed staff row, eligible to receive a wrapped name fragment
  const rows = [];

  for (let i = 0; i < lines.length; i++){
    const line = lines[i];
    if (line === 'Staff Utilisation'){
      if (i + 1 < lines.length) branch = lines[i+1];
      continue;
    }
    if (branch !== null && dateFrom === null){
      const m = UTIL_DATE_RANGE_RE.exec(line);
      if (m){ dateFrom = m[1]; dateTo = m[2]; continue; }
    }
    if (UTIL_SKIP_PREFIXES.some(p => line.startsWith(p)) || line === branch){ prevRow = null; continue; }

    const m = UTIL_DATA_ROW_RE.exec(line);
    if (!m && !seenFirstRow) continue; // still inside the header block

    if (m){
      seenFirstRow = true;
      let name = m[1].trim().replace(/\s+/g,' ');
      const isArchived = name.endsWith('(A)');
      if (isArchived) name = name.replace(/\s*\(A\)$/,'').trim();

      rows.push({
        staff_name: name,
        is_archived: isArchived,
        available_hours: utilHmmToHours(m[2]),
        utilisation_hours: utilHmmToHours(m[3]),
        utilisation_percent: utilNum(m[4]),
        services_rev_per_hour: utilNum(m[5]),
        products_rev_per_hour: utilNum(m[6]),
        total_rev_per_hour: utilNum(m[7]),
        wages_3x_ratio: utilNum(m[8]),
      });
      prevRow = rows[rows.length - 1];
      continue;
    }

    // A lone name fragment — a long name wraps with the numbers on the FIRST
    // line and the overflow on the line AFTER it, so append it to the row
    // just parsed (verified against every 2026 PDF: 100/100 fragments follow
    // their data row, never precede it).
    if (prevRow !== null && UTIL_NAME_ONLY_RE.test(line)){
      let frag = line;
      if (frag.endsWith('(A)')){
        prevRow.is_archived = true;
        frag = frag.replace(/\s*\(A\)$/,'').trim();
      }
      prevRow.staff_name = `${prevRow.staff_name} ${frag}`.trim();
      prevRow = null; // a name wraps at most once
      continue;
    }
    prevRow = null;
  }

  return { branch, dateFrom, dateTo, rows };
}

// Splits a paste containing several days back-to-back into one line-array
// per report, each starting at its own "Staff Utilisation" title line.
function utilSplitBlocks(lines){
  const markerIdx = [];
  lines.forEach((l, i) => { if (l === 'Staff Utilisation') markerIdx.push(i); });
  if (!markerIdx.length) return [lines]; // no title found — treat as one block, let the parser raise its own error
  return markerIdx.map((idx, n) => lines.slice(idx, n + 1 < markerIdx.length ? markerIdx[n + 1] : lines.length));
}

function utilBuildDbRows(rows, branchCode, isoFrom, isoTo){
  return rows.map(r => ({
    staff_name: r.staff_name,
    role: null,
    is_archived: r.is_archived,
    available_hours: r.available_hours,
    utilisation_hours: r.utilisation_hours,
    utilisation_percent: r.utilisation_percent,
    services_rev_per_hour: r.services_rev_per_hour,
    products_rev_per_hour: r.products_rev_per_hour,
    total_rev_per_hour: r.total_rev_per_hour,
    wages_3x_ratio: r.wages_3x_ratio,
    branch: branchCode,
    date_from: isoFrom,
    date_to: isoTo,
  }));
}

async function utilSaveRows(branchCode, isoFrom, isoTo, dbRows){
  await sb.from(UTIL_TABLE).delete().eq('branch', branchCode).eq('date_from', isoFrom).eq('date_to', isoTo);
  const { error } = await sb.from(UTIL_TABLE).insert(dbRows);
  if (error) throw error;
}

// ── PASTE & SAVE — one box per branch ─────────────────────────

function utilRenderBranchBoxes(){
  const host = document.getElementById('utilBranchBoxes');
  if (!host) return;
  host.innerHTML = BRANCH_KEYS.map(code => `
    <div class="sp-branch-box">
      <div class="sp-branch-box-title">${BRANCHES[code].name}</div>
      <textarea id="utilBox_${code}" placeholder="Paste ${BRANCHES[code].name}'s Staff Utilisation report here (or several days back-to-back)..."></textarea>
      <div class="sp-branch-box-actions">
        <button class="btn" style="width:auto;padding:8px 14px" onclick="handleUtilParseOne('${code}')">Parse &amp; Save</button>
        <button class="btn-outline" onclick="document.getElementById('utilBox_${code}').value=''; document.getElementById('utilBoxMsg_${code}').textContent=''; trCountFilledBoxes()">Clear</button>
      </div>
      <div id="utilBoxMsg_${code}" class="sp-branch-box-msg"></div>
    </div>
  `).join('');
}

function utilShowBoxMsg(code, text, ok){
  const el = document.getElementById(`utilBoxMsg_${code}`);
  if (!el) return;
  el.textContent = text;
  el.style.color = ok ? 'var(--good)' : 'var(--bad)';
}

// Parses + saves whatever is in one branch's box. Errors are captured in
// the returned result (never thrown) so Save All can process every box
// without one failure stopping the others.
async function utilParseAndSaveBox(code){
  const textarea = document.getElementById(`utilBox_${code}`);
  const raw = textarea ? textarea.value : '';
  if (!raw.trim()) return { code, skipped: true };

  try{
    spGuardReportKind('utilisation', { text: raw });
    const allLines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const results = utilSplitBlocks(allLines).map(blockLines => {
      try{
        const parsed = utilParseLines(blockLines);
        if (!parsed.dateFrom || !parsed.dateTo) throw new Error('Could not find the report date range (expected "DD/MM/YY - DD/MM/YY").');
        if (!parsed.rows.length) throw new Error('No staff rows recognised in this block.');
        spGuardBranchMismatch(parsed.branch, code); // wrong-box guard (from phorest-staff.js)
        return { ok: true, parsed };
      } catch(e){
        return { ok: false, error: e.message || String(e) };
      }
    });

    const oks = results.filter(r => r.ok);
    const fails = results.filter(r => !r.ok);
    if (!oks.length) throw new Error(fails.map((f,i) => `Report ${i+1}: ${f.error}`).join(' | '));

    let totalRows = 0;
    const dates = [];
    for (const { parsed } of oks){
      const isoFrom = utilDdmmyyToISO(parsed.dateFrom);
      const isoTo = utilDdmmyyToISO(parsed.dateTo);
      const dbRows = utilBuildDbRows(parsed.rows, code, isoFrom, isoTo);
      await utilSaveRows(code, isoFrom, isoTo, dbRows);
      totalRows += dbRows.length;
      dates.push(isoFrom);
    }

    let msg = `Saved ${oks.length} day${oks.length===1?'':'s'} (${totalRows} rows): ${dates.join(', ')}.`;
    if (fails.length) msg += ` — ${fails.length} block(s) failed: ` + fails.map((f,i) => `#${i+1} (${f.error})`).join('; ');

    utilShowBoxMsg(code, msg, fails.length === 0);
    if (!fails.length && textarea){ textarea.value = ''; trCountFilledBoxes(); }
    return { code, ok: fails.length === 0, days: oks.length, rows: totalRows, message: msg };
  } catch(e){
    const msg = e.message || String(e);
    utilShowBoxMsg(code, msg, false);
    return { code, ok: false, message: msg };
  }
}

async function handleUtilParseOne(code){
  await utilParseAndSaveBox(code);
  await refreshUtilProgress();
}

async function handleUtilSaveAll(){
  const summaryEl = document.getElementById('utilSaveAllMsg');
  summaryEl.textContent = 'Saving…';
  summaryEl.style.color = 'var(--muted)';

  const results = await Promise.all(BRANCH_KEYS.map(code => utilParseAndSaveBox(code)));
  const attempted = results.filter(r => !r.skipped);

  if (!attempted.length){
    summaryEl.textContent = `All ${BRANCH_KEYS.length} boxes are empty — nothing to save.`;
    summaryEl.style.color = 'var(--bad)';
  } else {
    const failed = attempted.filter(r => !r.ok);
    const parts = attempted.map(r => `${BRANCHES[r.code].name}: ${r.ok ? r.days + ' day(s)' : 'FAILED'}`);
    summaryEl.textContent = parts.join(' · ');
    summaryEl.style.color = failed.length ? 'var(--bad)' : 'var(--good)';
  }
  await refreshUtilProgress();
}

// ── BULK PDF UPLOAD (BACKFILL) ────────────────────────────────

function utilQueuePdfFiles(fileList){
  utilPdfQueue = utilPdfQueue.concat(Array.from(fileList));
  document.getElementById('utilPdfQueueCount').textContent =
    utilPdfQueue.length ? `${utilPdfQueue.length} file(s) queued` : 'No files queued';
}

function utilPdfRowHtml(filename, ok, msg){
  return `<div class="sp-pdf-row"><span class="fn">${filename}</span><span class="status ${ok?'ok':'bad'}">${msg}</span></div>`;
}

async function utilExtractPdfLines(file){
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const lines = [];
  const Y_TOLERANCE = 3; // some cells on the same visual row (e.g. the "NA" wages
                         // column) land ~0.7pt off the row's baseline — a hard
                         // rounded-y bucket splits them onto a false extra line.
  for (let p = 1; p <= pdf.numPages; p++){
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items = content.items.slice().sort((a,b) => b.transform[5] - a.transform[5]); // PDF y grows upward -> top to bottom
    const clusters = [];
    items.forEach(item => {
      const y = item.transform[5];
      let cluster = clusters.find(c => Math.abs(c.y - y) <= Y_TOLERANCE);
      if (!cluster) { cluster = { y, items: [] }; clusters.push(cluster); }
      cluster.items.push(item);
    });
    clusters.forEach(cluster => {
      const rowItems = cluster.items.slice().sort((a,b) => a.transform[4] - b.transform[4]);
      const text = rowItems.map(i => i.str).join(' ').replace(/\s+/g,' ').trim();
      if (text) lines.push(text);
    });
  }
  return lines;
}

async function handleUtilPdfBatch(){
  const btn = document.getElementById('utilPdfParseBtn');
  const resultsEl = document.getElementById('utilPdfResults');
  if (!utilPdfQueue.length){ resultsEl.innerHTML = utilPdfRowHtml('—', false, 'No files queued.'); return; }

  btn.disabled = true;
  const files = utilPdfQueue.slice();
  utilPdfQueue = [];
  document.getElementById('utilPdfQueueCount').textContent = 'No files queued';
  document.getElementById('utilPdfInput').value = '';

  const statuses = files.map(f => ({ name: f.name, ok: true, msg: 'Parsing…' }));
  const render = () => { resultsEl.innerHTML = statuses.map(s => utilPdfRowHtml(s.name, s.ok, s.msg)).join(''); };
  render();

  let anyOk = false;
  for (let idx = 0; idx < files.length; idx++){
    const file = files[idx];
    try{
      spGuardReportKind('utilisation', { filename: file.name }); // wrong-report guard (from phorest-staff.js)
      const branchCode = detectBranch(file.name);
      if (!branchCode) throw new Error("Could not match filename to a branch — expected it to include the branch name (e.g. 'al-quoz-').");

      const lines = await utilExtractPdfLines(file);
      spGuardReportKind('utilisation', { text: lines.join(' ') });
      const { branch, dateFrom, dateTo, rows } = utilParseLines(lines);
      if (!dateFrom || !dateTo) throw new Error('Could not find the report date range in this PDF.');
      if (!rows.length) throw new Error('No staff rows found in this PDF.');
      spGuardBranchMismatch(branch, branchCode); // misnamed-file guard (from phorest-staff.js)

      const isoFrom = utilDdmmyyToISO(dateFrom);
      const isoTo = utilDdmmyyToISO(dateTo);
      const dbRows = utilBuildDbRows(rows, branchCode, isoFrom, isoTo);
      await utilSaveRows(branchCode, isoFrom, isoTo, dbRows);

      statuses[idx] = { name: file.name, ok: true, msg: `Saved — ${BRANCHES[branchCode].name}, ${isoFrom}, ${dbRows.length} row(s)` };
      anyOk = true;
    } catch(e){
      statuses[idx] = { name: file.name, ok: false, msg: e.message || String(e) };
    }
    render();
  }

  btn.disabled = false;
  if (anyOk && typeof showToast === 'function') showToast('✅ Utilisation PDFs saved!');
  await refreshUtilProgress();
}

function initUtilPdfDrop(){
  const drop = document.getElementById('utilPdfDrop');
  if (!drop || drop.dataset.wired) return;
  drop.dataset.wired = '1';
  ['dragover','dragenter'].forEach(evt => drop.addEventListener(evt, e => { e.preventDefault(); drop.classList.add('dragover'); }));
  ['dragleave','drop'].forEach(evt => drop.addEventListener(evt, e => { e.preventDefault(); drop.classList.remove('dragover'); }));
  drop.addEventListener('drop', e => {
    const files = Array.from(e.dataTransfer.files || []).filter(f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
    if (files.length) utilQueuePdfFiles(files);
  });
}

// ── BACKFILL PROGRESS (queried live from Supabase) ────────────
// Reuses spGetBackfillDays/spIsoDate from phorest-staff.js (loaded first) —
// same date-strip math, just fed from date_from/date_to ranges instead of
// a single date column.

const UTIL_BACKFILL_START = '2025-01-01'; // mirrors SP_BACKFILL_START, opened to 2025 (Kate, 2026-09-03)
const UTIL_BRANCH_END = { FRT: '2026-05-22' }; // mirrors SP_BRANCHES' Fratelli end date

function utilCoveredDaySet(rows){
  const covered = new Set();
  rows.forEach(r => {
    if (!r.date_from || !r.date_to) return;
    for (let d = new Date(r.date_from + 'T00:00:00'); d <= new Date(r.date_to + 'T00:00:00'); d.setDate(d.getDate()+1)){
      covered.add(`${r.branch}|${spIsoDate(d)}`);
    }
  });
  return covered;
}

async function refreshUtilProgress(){
  const host = document.getElementById('utilProgressGrid');
  if (!host) return;
  host.innerHTML = '<div style="font-size:12px;color:var(--muted2);padding:8px 0">Loading…</div>';

  // PostgREST silently caps an unpaginated select at its own server-side max-rows
  // setting (commonly 1000) — with 5 branches' worth of daily rows that's blown
  // past ages ago, so page through with .range() or later branches read as 0%
  // covered even though their data is really there (mirrors SP_PAGE_SIZE's note
  // in phorest-staff.js).
  // Counted first, then every page at once. This table carries a row per staff
  // member per report, so in series it was the slowest thing in the portal
  // (Kate, 2026-09-03).
  const { count, error: countErr } = await sb.from(UTIL_TABLE).select('id',{count:'exact',head:true});
  if (countErr){ host.innerHTML = `<div style="font-size:12px;color:var(--bad)">Failed to load progress: ${countErr.message}</div>`; return; }
  const pages = [];
  for (let offset = 0; offset < (count || 0); offset += UTIL_PAGE_SIZE){
    pages.push(sb.from(UTIL_TABLE).select('branch,date_from,date_to').range(offset, offset + UTIL_PAGE_SIZE - 1));
  }
  const results = await Promise.all(pages);
  const failed = results.find(r => r.error);
  if (failed){ host.innerHTML = `<div style="font-size:12px;color:var(--bad)">Failed to load progress: ${failed.error.message}</div>`; return; }
  const all = results.flatMap(r => r.data || []);

  const covered = utilCoveredDaySet(all);

  spProgBeginBatch();
  let html = '';
  for (const code of BRANCH_KEYS){
    const days = spGetBackfillDays(UTIL_BACKFILL_START, UTIL_BRANCH_END[code]);
    html += spRenderBackfillStrips(BRANCHES[code].name, days, covered, d => `${code}|${spIsoDate(d)}`);
  }
  host.innerHTML = html;
  spProgEndBatch('utilProgressGrid');
  spRenderTodayStrip('utilTodayStrip', 'tabPipOps', 'ops', BRANCH_KEYS.map(code => ({
    label: BRANCHES[code].name,
    in: covered.has(`${code}|${spIsoDate(new Date())}`),
    ended: !!(UTIL_BRANCH_END[code] && spIsoDate(new Date()) > UTIL_BRANCH_END[code]),
  })));
}

// ── BROWSE / FILTER ──────────────────────────────────────────

function utilSetDefaultFilterDates(force){
  const fromEl = document.getElementById('utilfFrom');
  const toEl   = document.getElementById('utilfTo');
  if (!fromEl || !toEl) return;
  if (force || !fromEl.value) fromEl.value = spYearStartIso(); // current year, not the 2025 backfill start
  if (force || !toEl.value)   toEl.value   = spIsoDate(new Date());
}

function utilPopulateFilterBranch(){
  const sel = document.getElementById('utilfBranch');
  if (!sel || sel.dataset.populated) return;
  BRANCH_KEYS.forEach(code => {
    const opt = document.createElement('option');
    opt.value = code; opt.textContent = BRANCHES[code].name;
    sel.appendChild(opt);
  });
  sel.dataset.populated = '1';
}

function resetUtilFilter(){
  trResetChips('ops','utilf');
  document.getElementById('utilfBranch').value = '';
  document.getElementById('utilfStaff').value = '';
  utilSetDefaultFilterDates(true);
  utilLastData = [];
  utilCapWarning = false;
  utilColFilters = {};
  utilCloseColFilter();
  document.getElementById('utilTableHost').innerHTML =
    '<div style="padding:16px;font-size:12px;color:var(--muted2)">Pick a filter and click Apply — showing everything by default can be slow once the backfill fills up.</div>';
  document.getElementById('utilResultCount').textContent = '';
}

const UTIL_COLS = [
  ['Branch','branch'],['Date From','date_from'],['Date To','date_to'],['Staff','staff_name'],
  ['Available Hrs','available_hours'],['Utilised Hrs','utilisation_hours'],['Utilisation %','utilisation_percent'],
  ['Services Rev/Hr','services_rev_per_hour'],['Products Rev/Hr','products_rev_per_hour'],
  ['Total Rev/Hr','total_rev_per_hour'],['3x Wages','wages_3x_ratio'],['Archived','is_archived']
];
const UTIL_ROW_LIMIT = 25000;
const UTIL_RENDER_CAP = 2000;
let utilShowAllRows = false;

function utilRenderAllRows(){
  utilShowAllRows = true;
  utilRenderTable();
}
const UTIL_PERCENT_FIELDS = new Set(['utilisation_percent']);

function utilFmt(v, key){
  if (key === 'is_archived') return v ? 'Yes' : '';
  if (typeof v !== 'number') return v ?? '';
  const suffix = UTIL_PERCENT_FIELDS.has(key) ? '%' : '';
  return TR_NUM_FMT[2].format(v) + suffix;
}

// ── SORT + COLUMN VISIBILITY + SUMMARY MODE (mirrors the Staff Performance tab) ──
let utilLastData    = [];
let utilSortCol      = 'date_from';
let utilSortDir       = 'desc';
let utilHiddenCols   = new Set(JSON.parse(localStorage.getItem('utilHiddenCols') || '[]'));
let utilCapWarning   = false;
let utilSummaryMode  = localStorage.getItem('utilSummaryMode') === '1';

// Only hours are additive across a date range — rev/hr and the 3x wages ratio
// are already-derived rates, so they're left blank on aggregated rows rather
// than summed into a meaningless number. Utilisation % is recomputed from the
// summed hours (a correct weighted average), not summed itself.
const UTIL_SUM_FIELDS = ['available_hours','utilisation_hours'];

function utilAggregateByStaff(rows){
  const groupByBranch = !utilHiddenCols.has('branch');
  const groups = new Map();
  for (const row of rows){
    const key = groupByBranch ? (row.branch + '|' + row.staff_name) : row.staff_name;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const out = [];
  for (const rs of groups.values()){
    const agg = { branch: groupByBranch ? rs[0].branch : 'ALL', staff_name: rs[0].staff_name, is_archived: rs[0].is_archived };
    for (const f of UTIL_SUM_FIELDS) agg[f] = 0;
    for (const r of rs) for (const f of UTIL_SUM_FIELDS) agg[f] += (typeof r[f] === 'number' ? r[f] : 0);
    agg.utilisation_percent = agg.available_hours ? (agg.utilisation_hours / agg.available_hours) * 100 : 0;
    agg.services_rev_per_hour = null; agg.products_rev_per_hour = null; agg.total_rev_per_hour = null; agg.wages_3x_ratio = null;
    const froms = rs.map(r => r.date_from).filter(Boolean).sort();
    const tos   = rs.map(r => r.date_to).filter(Boolean).sort();
    agg.date_from = froms[0] || '';
    agg.date_to   = tos[tos.length-1] || '';
    out.push(agg);
  }
  return out;
}

// Grand total across every row currently on screen (post filter/aggregate),
// pinned as the first table row.
function utilGrandTotal(rows){
  const t = { branch:'', date_from:'', date_to:'', staff_name:'TOTAL', is_archived:'' };
  for (const f of UTIL_SUM_FIELDS) t[f] = 0;
  for (const r of rows) for (const f of UTIL_SUM_FIELDS) t[f] += (typeof r[f] === 'number' ? r[f] : 0);
  t.utilisation_percent = t.available_hours ? (t.utilisation_hours / t.available_hours) * 100 : 0;
  t.services_rev_per_hour = null; t.products_rev_per_hour = null; t.total_rev_per_hour = null; t.wages_3x_ratio = null;
  return t;
}

function utilToggleSummaryMode(){
  utilSummaryMode = !utilSummaryMode;
  localStorage.setItem('utilSummaryMode', utilSummaryMode ? '1' : '0');
  utilSyncSummaryToggleUI();
  utilRenderTable();
}

function utilSyncSummaryToggleUI(){
  const track = document.getElementById('utilSummaryTrack');
  const lbl = document.getElementById('utilSummaryLbl');
  if (!track) return;
  track.classList.toggle('on', utilSummaryMode);
  lbl.textContent = utilSummaryMode ? 'Summary' : 'Daily';
}

function utilSortBy(key){
  if (utilSortCol === key) utilSortDir = utilSortDir === 'asc' ? 'desc' : 'asc';
  else { utilSortCol = key; utilSortDir = 'asc'; }
  utilRenderTable();
}

function utilToggleCol(key, checked){
  if (checked) utilHiddenCols.delete(key); else utilHiddenCols.add(key);
  localStorage.setItem('utilHiddenCols', JSON.stringify([...utilHiddenCols]));
  utilRenderTable();
}

function utilShowAllCols(){
  utilHiddenCols.clear();
  localStorage.setItem('utilHiddenCols', JSON.stringify([]));
  utilBuildColPicker();
  utilRenderTable();
}

function utilBuildColPicker(){
  const panel = document.getElementById('utilColPicker');
  if (!panel) return;
  panel.innerHTML = UTIL_COLS.map(c =>
    `<label><input type="checkbox" ${utilHiddenCols.has(c[1])?'':'checked'} onchange="utilToggleCol('${c[1]}', this.checked)">${c[0]}</label>`
  ).join('') + '<div class="sp-col-picker-actions"><button class="btn-outline" style="flex:1;padding:6px" onclick="utilShowAllCols()">Show all</button></div>';
}

function utilToggleColPicker(e){
  e.stopPropagation();
  const panel = document.getElementById('utilColPicker');
  if (!panel) return;
  const opening = panel.style.display !== 'block';
  if (opening){ utilBuildColPicker(); panel.style.display = 'block'; }
  else panel.style.display = 'none';
}

document.addEventListener('click', (e) => {
  const panel = document.getElementById('utilColPicker');
  const btn   = document.getElementById('utilColPickerBtn');
  if (panel && panel.style.display === 'block' && !panel.contains(e.target) && e.target !== btn) {
    panel.style.display = 'none';
  }
});

// ── PER-COLUMN VALUE FILTER (Excel/Sheets-style "pick which values show") ──
let utilColFilters = {};
let utilColFilterKey = null;
let utilColFilterPanel = null;
let utilColFilterPending = null;
let utilColFilterSearchTxt = '';

function utilColFilterActive(key){ return Object.prototype.hasOwnProperty.call(utilColFilters, key); }

function utilColFilterRows(rows, exceptKey){
  const keys = Object.keys(utilColFilters).filter(k => k !== exceptKey);
  if (!keys.length) return rows;
  return rows.filter(row => keys.every(k => utilColFilters[k].has(utilFmt(row[k], k))));
}

function utilColValueDomain(key){
  const vals = new Set(utilColFilterRows(utilLastData, key).map(r => utilFmt(r[key], key)));
  return [...vals].sort((a,b) => a.localeCompare(b, undefined, {numeric:true, sensitivity:'base'}));
}

function utilEsc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function utilOpenColFilter(e, key){
  e.stopPropagation();
  if (utilColFilterKey === key){ utilCloseColFilter(); return; }
  utilCloseColFilter();
  utilColFilterKey = key;
  const domain = utilColValueDomain(key);
  utilColFilterPending = new Set(utilColFilterActive(key) ? utilColFilters[key] : domain);
  utilColFilterSearchTxt = '';

  const panel = document.createElement('div');
  panel.className = 'sp-colval-panel';
  panel.id = 'utilColValPanel';
  panel.innerHTML =
    '<input type="text" class="sp-colval-search" placeholder="Search…" oninput="utilColFilterSearch(this.value)">' +
    '<div class="sp-colval-actions">' +
      '<button class="btn-outline" onclick="utilColFilterSelectAll(true)">Select all</button>' +
      '<button class="btn-outline" onclick="utilColFilterSelectAll(false)">Clear</button>' +
    '</div>' +
    '<div class="sp-colval-list" id="utilColValList"></div>' +
    '<div class="sp-colval-footer"><button class="btn" style="flex:1;padding:6px" onclick="utilColFilterApply()">Apply</button></div>';
  document.body.appendChild(panel);
  utilColFilterPanel = panel;
  utilRenderColFilterList();

  const rect = e.currentTarget.getBoundingClientRect();
  panel.style.top  = (rect.bottom + 4) + 'px';
  panel.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 236)) + 'px';
  panel.querySelector('.sp-colval-search').focus();
}

function utilCloseColFilter(){
  if (utilColFilterPanel){ utilColFilterPanel.remove(); utilColFilterPanel = null; }
  utilColFilterKey = null;
  utilColFilterPending = null;
}

function utilRenderColFilterList(){
  const key = utilColFilterKey;
  if (!key) return;
  const domain = utilColValueDomain(key);
  const q = utilColFilterSearchTxt.toLowerCase();
  const shown = q ? domain.filter(v => v.toLowerCase().includes(q)) : domain;
  const list = document.getElementById('utilColValList');
  list.innerHTML = shown.length ? shown.map((v,i) =>
    `<label><input type="checkbox" data-idx="${i}" ${utilColFilterPending.has(v)?'checked':''}>${v === '' ? '<em>(Blank)</em>' : utilEsc(v)}</label>`
  ).join('') : '<div class="sp-colval-empty">No values</div>';
  list.onchange = (e) => {
    if (!e.target.matches('input[type=checkbox]')) return;
    const v = shown[Number(e.target.dataset.idx)];
    if (e.target.checked) utilColFilterPending.add(v); else utilColFilterPending.delete(v);
  };
}

function utilColFilterSearch(v){
  utilColFilterSearchTxt = v;
  utilRenderColFilterList();
}

function utilColFilterSelectAll(checked){
  const q = utilColFilterSearchTxt.toLowerCase();
  const domain = utilColValueDomain(utilColFilterKey);
  const shown = q ? domain.filter(v => v.toLowerCase().includes(q)) : domain;
  shown.forEach(v => checked ? utilColFilterPending.add(v) : utilColFilterPending.delete(v));
  utilRenderColFilterList();
}

function utilColFilterApply(){
  const key = utilColFilterKey;
  const domain = utilColValueDomain(key);
  if (utilColFilterPending.size >= domain.length) delete utilColFilters[key];
  else utilColFilters[key] = new Set(utilColFilterPending);
  utilCloseColFilter();
  utilRenderTable();
}

document.addEventListener('click', (e) => {
  if (utilColFilterPanel && !utilColFilterPanel.contains(e.target) && !e.target.closest('.sp-th-filter-ic')) {
    utilCloseColFilter();
  }
});

function utilRenderTable(){
  const host = document.getElementById('utilTableHost');
  if (!utilLastData.length){
    host.innerHTML = '<div style="padding:16px;font-size:12px;color:var(--muted2)">No matching rows.</div>';
    document.getElementById('utilResultCount').textContent = '';
    return;
  }

  const filteredData = utilColFilterRows(utilLastData);
  const displayRows = utilSummaryMode ? utilAggregateByStaff(filteredData) : filteredData;
  // Same render cap as the Staff Daily table: this selection runs to ~17,500
  // rows, and every sort rebuilt all of them. The TOTAL row still sums the
  // whole filtered selection (Kate, 2026-09-03).
  const capped = !utilSummaryMode && !utilShowAllRows && displayRows.length > UTIL_RENDER_CAP;
  const renderRows = capped ? displayRows.slice(0, UTIL_RENDER_CAP) : displayRows;

  const countEl = document.getElementById('utilResultCount');
  if (utilCapWarning){
    countEl.textContent = `Showing first ${UTIL_ROW_LIMIT} rows — narrow your filters for more precision`;
  } else if (capped){
    countEl.innerHTML = `${displayRows.length} rows · showing the newest ${UTIL_RENDER_CAP} ` +
      `<button class="btn-outline" style="padding:3px 9px;font-size:10.5px;margin-left:4px" onclick="utilRenderAllRows()">Show all</button>`;
  } else {
    countEl.textContent = `${displayRows.length} row${displayRows.length === 1 ? '' : 's'}${utilSummaryMode ? ' (summarized per staff member)' : ''}`;
  }

  const visibleCols = UTIL_COLS.filter(c => !utilHiddenCols.has(c[1]));

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
    const active = c[1] === utilSortCol;
    const arrow = active ? (utilSortDir === 'asc' ? ' ▲' : ' ▼') : '';
    const filtered = utilColFilterActive(c[1]);
    return `<th class="sp-th-sort${active?' active':''}"><span class="sp-th-inner">` +
      `<span class="sp-th-label" onclick="utilSortBy('${c[1]}')">${c[0]}${arrow}</span>` +
      `<span class="sp-th-filter-ic${filtered?' active':''}" onclick="utilOpenColFilter(event,'${c[1]}')" title="Filter values">▾</span>` +
      `</span></th>`;
  }).join('') + '</tr></thead><tbody>';

  const grandTotal = utilGrandTotal(displayRows);
  html += '<tr class="is-total">' + visibleCols.map(c => `<td>${utilFmt(grandTotal[c[1]], c[1])}</td>`).join('') + '</tr>';

  orderedKeys.forEach((key, gi) => {
    const rows = groups.get(key).slice().sort((a,b) => spCompare(a[utilSortCol], b[utilSortCol], utilSortDir));
    for (const row of rows){
      html += '<tr>' + visibleCols.map(c => `<td>${utilFmt(row[c[1]], c[1])}</td>`).join('') + '</tr>';
    }
    if (gi < orderedKeys.length - 1){
      html += `<tr class="sp-group-spacer"><td colspan="${visibleCols.length}"></td></tr>`;
    }
  });
  html += '</tbody></table>';
  host.innerHTML = html;
}

const UTIL_PAGE_SIZE = 1000;

async function runUtilFilter(){
  const branch = document.getElementById('utilfBranch').value;
  const staff  = document.getElementById('utilfStaff').value.trim();
  const from   = document.getElementById('utilfFrom').value;
  const to     = document.getElementById('utilfTo').value;

  const host = document.getElementById('utilTableHost');
  host.innerHTML = '<div style="padding:16px;font-size:12px;color:var(--muted2)">Loading…</div>';

  const buildQuery = () => {
    let q = sb.from(UTIL_TABLE).select('*').order('date_from',{ascending:false}).order('branch').order('staff_name');
    if (branch)  q = q.eq('branch', branch);
    if (from)    q = q.gte('date_from', from);
    if (to)      q = q.lte('date_to', to);
    if (staff)   q = q.ilike('staff_name', `%${staff}%`);
    return q;
  };

  const buildCountQuery = () => {
    let q = sb.from(UTIL_TABLE).select('id', { count:'exact', head:true });
    if (branch) q = q.eq('branch', branch);
    if (from)   q = q.gte('date_from', from);
    if (to)     q = q.lte('date_to', to);
    if (staff)  q = q.ilike('staff_name', `%${staff}%`);
    return q;
  };

  // Count first, then every page at once — see runStaffPerfFilter's note.
  const { count, error: countErr } = await buildCountQuery();
  if (countErr){ host.innerHTML = `<div style="padding:16px;font-size:12px;color:var(--bad)">Query failed: ${countErr.message}</div>`; return; }

  const wanted = Math.min(count || 0, UTIL_ROW_LIMIT);
  const pages = [];
  for (let offset = 0; offset < wanted; offset += UTIL_PAGE_SIZE){
    pages.push(buildQuery().range(offset, Math.min(offset + UTIL_PAGE_SIZE, wanted) - 1));
  }
  const results = await Promise.all(pages);
  const failed = results.find(r => r.error);
  if (failed){ host.innerHTML = `<div style="padding:16px;font-size:12px;color:var(--bad)">Query failed: ${failed.error.message}</div>`; return; }
  const all = results.flatMap(r => r.data || []);

  utilCapWarning = all.length >= UTIL_ROW_LIMIT;
  utilLastData = all.slice(0, UTIL_ROW_LIMIT)
    .map(row => ({...row, staff_name: canonicalStaffName(row.staff_name)}));
  utilColFilters = {};
  utilShowAllRows = false;
  utilRenderTable();
}

// ── INIT ───────────────────────────────────────────────────────

let utilBoxesRendered = false;

// Paste-and-save is the old workflow now that bulk PDF upload exists — collapsed by default.
let utilPasteCollapsed = localStorage.getItem('utilPasteCollapsed') === null
  ? true
  : localStorage.getItem('utilPasteCollapsed') === '1';

function utilSyncPasteToggleUI(){
  const body = document.getElementById('utilPasteBody');
  const btn  = document.getElementById('utilPasteToggleBtn');
  if (!body || !btn) return;
  body.style.display = utilPasteCollapsed ? 'none' : 'block';
  btn.textContent = utilPasteCollapsed ? 'Show ▾' : 'Hide ▴';
}

function utilTogglePasteCollapse(){
  utilPasteCollapsed = !utilPasteCollapsed;
  localStorage.setItem('utilPasteCollapsed', utilPasteCollapsed ? '1' : '0');
  utilSyncPasteToggleUI();
}

function initUtilTab(){
  if (!utilBoxesRendered){
    utilRenderBranchBoxes();
    utilBoxesRendered = true;
  }
  utilSyncPasteToggleUI();
  utilPopulateFilterBranch();
  utilSetDefaultFilterDates(false);
  utilSyncSummaryToggleUI();
  trCountFilledBoxes();
  refreshUtilProgress();
  if (typeof initUtilPdfDrop === 'function') initUtilPdfDrop();

  // Browse runs when Browse is opened, not on tab load — see trRunBrowseOnce.
}
