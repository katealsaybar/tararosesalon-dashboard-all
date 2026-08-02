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
const UTIL_NAME_ONLY_RE = /^[A-Za-z][A-Za-z.'\- ]*$/;

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
  let pendingName = null, seenFirstRow = false;
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
    if (UTIL_SKIP_PREFIXES.some(p => line.startsWith(p)) || line === branch) continue;

    const m = UTIL_DATA_ROW_RE.exec(line);
    if (!m && !seenFirstRow) continue; // still inside the header block

    if (m){
      seenFirstRow = true;
      let name = m[1].trim();
      if (pendingName){ name = `${pendingName} ${name}`.trim(); pendingName = null; }
      name = name.replace(/\s+/g,' ');
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
      continue;
    }

    // A lone name fragment (long name wrapped onto its own line) — stash
    // it and prepend it to whichever row matches next.
    if (UTIL_NAME_ONLY_RE.test(line)){ pendingName = line; continue; }
    pendingName = null;
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
        <button class="btn-outline" onclick="document.getElementById('utilBox_${code}').value=''; document.getElementById('utilBoxMsg_${code}').textContent=''">Clear</button>
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
    const allLines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const results = utilSplitBlocks(allLines).map(blockLines => {
      try{
        const parsed = utilParseLines(blockLines);
        if (!parsed.dateFrom || !parsed.dateTo) throw new Error('Could not find the report date range (expected "DD/MM/YY - DD/MM/YY").');
        if (!parsed.rows.length) throw new Error('No staff rows recognised in this block.');
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
    if (!fails.length && textarea) textarea.value = '';
    return { code, ok: fails.length === 0, days: oks.length, rows: totalRows, message: msg };
  } catch(e){
    const msg = e.message || String(e);
    utilShowBoxMsg(code, msg, false);
    return { code, ok: false, message: msg };
  }
}

async function handleUtilParseOne(code){
  await utilParseAndSaveBox(code);
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
      const branchCode = detectBranch(file.name);
      if (!branchCode) throw new Error("Could not match filename to a branch — expected it to include the branch name (e.g. 'al-quoz-').");

      const lines = await utilExtractPdfLines(file);
      const { dateFrom, dateTo, rows } = utilParseLines(lines);
      if (!dateFrom || !dateTo) throw new Error('Could not find the report date range in this PDF.');
      if (!rows.length) throw new Error('No staff rows found in this PDF.');

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
  if (typeof initUtilPdfDrop === 'function') initUtilPdfDrop();
}
