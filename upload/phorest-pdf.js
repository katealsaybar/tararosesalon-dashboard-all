/* ============================================================
   TARA ROSE LADIES SALON — phorest-pdf.js
   Bulk PDF ingestion for Phorest's "Staff Performance Overview"
   report — same target table/shape as phorest-staff.js's paste
   flow, just a different front door (PDF instead of clipboard).
   Load this AFTER phorest-staff.js — reuses SP_TABLE, SP_BRANCHES,
   spBuildRows, spNormLine, spIsInt, spIsMoney, spToNum,
   refreshStaffPerfProgress from that file.
   ============================================================ */

let spPdfQueue = [];

// Phorest's own exported filenames don't always match our branch labels
// 1:1 (e.g. "Khalifa City A" exports as "khalifa-city-", not
// "khalifa-city-a-") — override per branch code where they differ instead
// of trusting a straight slugify.
const SP_PDF_FILENAME_SLUGS = {
  SAA: 'saadiyat',
  KCA: 'khalifa-city',
  MC:  'motor-city',
  AQ:  'al-quoz'
};

function spSlugify(label){
  return label.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}

function spBranchFromFilename(filename){
  const lower = filename.toLowerCase();
  return SP_BRANCHES.find(b => lower.startsWith((SP_PDF_FILENAME_SLUGS[b.code] || spSlugify(b.label)) + '-')) || null;
}

function spDateFromFilename(filename){
  const m = filename.match(/(\d{4}-\d{2}-\d{2})\.pdf$/i);
  return m ? m[1] : null;
}

function spQueuePdfFiles(fileList){
  spPdfQueue = spPdfQueue.concat(Array.from(fileList));
  document.getElementById('spPdfQueueCount').textContent =
    spPdfQueue.length ? `${spPdfQueue.length} file(s) queued` : 'No files queued';
}

// This report's PDF content stream is laid out with the row/column axes
// swapped relative to normal reading order — a text item's row position
// (top to bottom) increases along its transform X, and its column
// position (left to right) increases along transform Y. Grouping by
// rounded X (row) and sorting each group by Y (column) reconstructs the
// same left-to-right, top-to-bottom text a clipboard copy would give,
// letting the existing paste-based parser (spParseOneBlock) run unmodified.
async function spExtractPdfLines(file){
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const lines = [];
  for (let p = 1; p <= pdf.numPages; p++){
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const rows = new Map(); // rounded x -> items on that visual row
    content.items.forEach(item => {
      const x = Math.round(item.transform[4]);
      if (!rows.has(x)) rows.set(x, []);
      rows.get(x).push(item);
    });
    const sortedXs = Array.from(rows.keys()).sort((a,b) => a - b); // top to bottom
    sortedXs.forEach(x => {
      const rowItems = rows.get(x).sort((a,b) => a.transform[5] - b.transform[5]);
      const text = rowItems.map(i => i.str).join(' ').replace(/\s+/g,' ').trim();
      if (text) lines.push(text);
    });
  }
  return lines;
}

// The PDF export coalesces the two header rows differently than a browser
// clipboard copy does — "Avg. Spend Per Client" and "Rat" end up fused onto
// the same row as the other column headers instead of their own line, so
// spParseOneBlock's exact-match header set (tuned for the clipboard layout)
// misses them. Strip PDF-specific header rows here rather than loosening
// that shared, already-tested matcher.
function spStripPdfHeaderLines(lines){
  return lines.filter(l => {
    const n = spNormLine(l);
    if (n.startsWith('employee ')) return false;
    if (n.startsWith('# new rqs')) return false;
    return true;
  });
}

function spPdfRowHtml(filename, ok, msg){
  return `<div class="sp-pdf-row"><span class="fn">${filename}</span><span class="status ${ok?'ok':'bad'}">${msg}</span></div>`;
}

async function handleStaffPerfPdfBatch(){
  const btn = document.getElementById('spPdfParseBtn');
  const resultsEl = document.getElementById('spPdfResults');
  if (!spPdfQueue.length){ resultsEl.innerHTML = spPdfRowHtml('—', false, 'No files queued.'); return; }

  btn.disabled = true;
  const files = spPdfQueue.slice();
  spPdfQueue = [];
  document.getElementById('spPdfQueueCount').textContent = 'No files queued';
  document.getElementById('spPdfInput').value = '';

  const statuses = files.map(f => ({ name: f.name, ok: true, msg: 'Parsing…' }));
  const render = () => { resultsEl.innerHTML = statuses.map(s => spPdfRowHtml(s.name, s.ok, s.msg)).join(''); };
  render();

  for (let idx = 0; idx < files.length; idx++){
    const file = files[idx];
    try{
      spGuardReportKind('performance', { filename: file.name });
      const branch = spBranchFromFilename(file.name);
      const filenameDate = spDateFromFilename(file.name);
      if (!branch) throw new Error("Could not match filename to a branch — expected it to start with the branch name (e.g. 'al-quoz-').");

      const rawLines = await spExtractPdfLines(file);
      spGuardReportKind('performance', { text: rawLines.join(' ') });
      const lines = spStripPdfHeaderLines(rawLines);
      const rec = spParseOneBlock(lines, branch.code);
      const isoDate = spToISODate(rec.date);
      if (filenameDate && filenameDate !== isoDate){
        throw new Error(`Filename says ${filenameDate} but the report content says ${isoDate} — skipped, please check this file.`);
      }
      const rows = spBuildRows(rec);

      await sb.from(SP_TABLE).delete().eq('branch', branch.code).eq('date', isoDate);
      const { error } = await sb.from(SP_TABLE).insert(rows);
      if (error) throw error;

      statuses[idx] = { name: file.name, ok: true, msg: `Saved — ${branch.label}, ${isoDate}, ${rows.length} rows` };
    } catch(e){
      statuses[idx] = { name: file.name, ok: false, msg: e.message || String(e) };
    }
    render();
  }

  btn.disabled = false;
  await refreshStaffPerfProgress();
}

function initStaffPerfPdfDrop(){
  const drop = document.getElementById('spPdfDrop');
  if (!drop || drop.dataset.wired) return;
  drop.dataset.wired = '1';
  ['dragover','dragenter'].forEach(evt => drop.addEventListener(evt, e => { e.preventDefault(); drop.classList.add('dragover'); }));
  ['dragleave','drop'].forEach(evt => drop.addEventListener(evt, e => { e.preventDefault(); drop.classList.remove('dragover'); }));
  drop.addEventListener('drop', e => {
    const files = Array.from(e.dataTransfer.files || []).filter(f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
    if (files.length) spQueuePdfFiles(files);
  });
}
