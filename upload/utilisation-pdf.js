/* ============================================================
   TARA ROSE LADIES SALON — utilisation-pdf.js
   Bulk PDF ingestion for Phorest's "Staff Utilisation" report,
   replacing the old manual CSV upload (which required running
   parse_utilisation.py by hand first). Mirrors phorest-pdf.js's
   queue/parse/save flow, targeting the staff_utilisation table.
   Load this AFTER upload.js — reuses sb, BRANCHES, detectBranch,
   showToast from that file.

   Parsing logic ported from utilisation reports/parse_utilisation.py —
   see that file's docstring for the report layout quirks this handles
   (long staff names wrapping onto their own line, "(A)" archived
   marker, NA columns, etc). Unlike the Staff Performance Overview
   report, this PDF's text stream is in normal top-to-bottom,
   left-to-right reading order — no axis swap needed.
   ============================================================ */

let utilPdfQueue = [];

const UTIL_SKIP_PREFIXES = ["Staff Utilisation", "Staff All", "Total", "Available", "Utilisation",
  "Services Rev", "Products Rev", "Total Rev", "3x Wages", "Page "];
const UTIL_DATA_ROW_RE = /^(.+?)\s+(\d{1,3}:\d{2})\s+(\d{1,3}:\d{2})\s+(NA|-?\d+(?:\.\d+)?%)\s+(NA|-?\d+(?:\.\d+)?)\s+(NA|-?\d+(?:\.\d+)?)\s+(NA|-?\d+(?:\.\d+)?)\s+(NA|-?\d+(?:\.\d+)?)$/;
const UTIL_DATE_RANGE_RE = /^(\d{2}\/\d{2}\/\d{2})\s*-\s*(\d{2}\/\d{2}\/\d{2})\s*\(Days:\s*\d+\)$/;
const UTIL_NAME_ONLY_RE = /^[A-Za-z][A-Za-z.'\- ]*$/;

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

      const dbRows = rows.map(r => ({
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

      await sb.from('staff_utilisation').delete().eq('branch', branchCode).eq('date_from', isoFrom).eq('date_to', isoTo);
      const { error } = await sb.from('staff_utilisation').insert(dbRows);
      if (error) throw error;

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
