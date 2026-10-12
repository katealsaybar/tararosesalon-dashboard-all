// Lost Clients review file (Kate, 12 Oct 2026): "they can download the xlsx, fill in who to exclude and a note on why, and
// upload it when they are done". For the salon coordinators (Level 2, who open Lost Clients); reception does the same on the
// Google Sheets (phorest data export/lost review sheets). Both end in the same table, lost_excluded.
//
// Download: a branch's clients from every group (groups 1 to 5, each client once), with a Take out? dropdown (the five reasons)
// and a Note column, the client key in a hidden last column. No phone numbers. Upload: the same file, or a CSV saved from it;
// a preview first (who goes out, who comes back in, what was not understood), then Apply (lost_exclude_bulk,
// migrations/lost_review_notes.sql). A row with a reason is taken out, a row that was out and is now blank is put back, a row
// that is not in the file is left alone. Nothing here reads a library: an .xlsx is a zip, read with DecompressionStream.
// Uses lost-lists.js (llFetch, llRows, llSetOut, llReloadSum, LL_LISTS, LL_REASONS, lcTeam, LC_BRANCH) and ledger-export.js
// (lgxBuild, lgxWorkbookParts, lgxZip, lgxXf, lgxXml, lgxSave).

const LRF_HEAD = ['Client', 'Branch', 'Area', 'Last visit', 'Last service', 'Usual stylist', 'Usual beautician', 'Next appointment', 'Take out?', 'Note', 'Client key (do not change)'];
const LRF_WIDTH = [28, 15, 11, 13, 13, 20, 20, 17, 20, 38, 24];
const LRF_REASON_COL = 8, LRF_NOTE_COL = 9, LRF_KEY_COL = 10;
let lrfBusy = false, lrfPlan = null;

// Every client in groups 1 to 5 once, for one branch (or all), by name.
async function lrfRows(branch) {
  await Promise.all(LL_LISTS.map(l => llFetch(l.id)));
  const seen = new Map();
  LL_LISTS.forEach(l => (llRows[l.id] || []).forEach(r => { if (!seen.has(r.client_key)) seen.set(r.client_key, r); }));
  return [...seen.values()].filter(r => branch === 'all' || r.branch === branch)
    .sort((a, b) => a.client_name.localeCompare(b.client_name));
}

function lrfLine(r) {
  const t = lcTeam(r);
  return [r.client_name, LC_BRANCH[r.branch] || r.branch, r.area, llDay(r.last_visit), llDay(llServiceDate(r)), t.hair[0] || '', t.beauty[0] || '',
    llDay(r.booked_on), r.excluded || '', r.excluded_note || '', r.client_key];
}

function lrfSheetXml(rows) {
  const n = rows.length + 1;
  const col = i => String.fromCharCode(65 + i);
  const head = lgxXf('head', 'text'), body = lgxXf('body', 'text');
  const cell = (i, r, v, s) => v === '' || v == null ? '' : `<c r="${col(i)}${r}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${lgxXml(v)}</t></is></c>`;
  const lines = [LRF_HEAD].concat(rows.map(lrfLine));
  const sheetData = lines.map((l, ri) => `<row r="${ri + 1}">${l.map((v, i) => cell(i, ri + 1, v, ri === 0 ? head : body)).join('')}</row>`).join('');
  const cols = LRF_WIDTH.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"${i === LRF_KEY_COL ? ' hidden="1"' : ''}/>`).join('');
  const last = col(LRF_HEAD.length - 1);
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<sheetViews><sheetView workbookViewId="0"><pane xSplit="1" ySplit="1" topLeftCell="B2" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>'
    + `<cols>${cols}</cols><sheetData>${sheetData}</sheetData><autoFilter ref="A1:${last}${n}"/>`
    + `<dataValidations count="1"><dataValidation type="list" allowBlank="1" showErrorMessage="1" errorTitle="Take out?" error="Pick a reason from the list, or leave it empty to keep her in." sqref="${col(LRF_REASON_COL)}2:${col(LRF_REASON_COL)}${n}"><formula1>"${lgxXml(LL_REASONS.join(','))}"</formula1></dataValidation></dataValidations>`
    + '</worksheet>';
}

function lrfHowTo(label) {
  return [
    'Lost Clients review: ' + label,
    '',
    'What this is: clients who have not been in for 6+ months and are about to get a WhatsApp or a text from Tara Rose. Before it goes out, take off anyone who should not get it.',
    '',
    '1. On the Review tab, find the clients you know: already coming in, known to a stylist, or someone who asked not to be contacted.',
    '2. In Take out?, pick the reason from the list. Add a short Note on why if it helps. Leave Take out? empty to keep her in the blast.',
    '3. Changed your mind? Clear Take out? and she goes back in.',
    '4. A date in Next appointment means she already has a booking, so she is not messaged either way.',
    '5. Do not change the other columns, do not delete rows, and keep the hidden last column (Client key).',
    '6. Save as .xlsx (or .csv) and upload it on the Lost Clients page: Upload review file. You see what will change before anything does.',
  ];
}

async function lrfDownload(branch) {
  if (lrfBusy) return;
  llClosePop();
  lrfBusy = true; llNote('Building the review file…');
  try {
    const rows = await lrfRows(branch);
    const label = branch === 'all' ? 'all branches' : (LC_BRANCH[branch] || branch);
    const built = lgxBuild({ sheets: [
      { name: 'Review', blocks: [{ cols: [{ label: 'x', fmt: 'text' }], rows: [] }] },
      { name: 'How to', blocks: [{ cols: [{ label: 'How to use this file', fmt: 'text' }], rows: lrfHowTo(label).map(t => ({ cells: [t] })) }] },
    ] });
    const parts = lgxWorkbookParts(built);
    const i = parts.findIndex(p => p[0] === 'xl/worksheets/sheet1.xml');
    parts[i] = [parts[i][0], lrfSheetXml(rows)];
    lgxSave(lgxZip(parts), 'lost-clients-review-' + (branch === 'all' ? 'all-branches' : branch) + '-' + new Date().toISOString().slice(0, 10) + '.xlsx');
    llNote(`Saved the review file: ${lcNum(rows.length)} clients, ${label}`);
  } catch (e) { console.error(e); llNote('The review file did not build. Try again.'); }
  lrfBusy = false;
}

function lrfMenu(ev) {
  ev.stopPropagation();
  if (llPopFor === 'lrf') { llClosePop(); return; }
  llClosePop();
  const r = ev.currentTarget.getBoundingClientRect();
  const pop = document.createElement('div');
  pop.id = 'llPop'; pop.className = 'll-pop'; pop.setAttribute('role', 'dialog');
  pop.style.top = (r.bottom + 4) + 'px';
  pop.style.left = Math.max(8, Math.min(r.left, innerWidth - 270)) + 'px';
  pop.innerHTML = '<div class="ll-pt">Download the review file for</div>'
    + Object.keys(LC_BRANCH).map(b => `<button type="button" class="ll-opt" onclick="lrfDownload('${b}')">${lcEsc(LC_BRANCH[b])}</button>`).join('')
    + '<button type="button" class="ll-opt" onclick="lrfDownload(\'all\')">All branches</button>'
    + '<div class="ll-pt ll-pn">Fill in Take out? and Note, then Upload review file. No phone numbers are in it.</div>';
  document.body.appendChild(pop);
  llPopFor = 'lrf';
}

// ── READING A FILE ───────────────────────────────────────────────────────────────────────────
async function lrfInflate(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const w = ds.writable.getWriter(); w.write(bytes); w.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}
async function lrfUnzip(buf) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf);
  let e = u8.length - 22;
  while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('not a zip');
  const n = dv.getUint16(e + 10, true), files = {};
  let p = dv.getUint32(e + 16, true);
  for (let i = 0; i < n && dv.getUint32(p, true) === 0x02014b50; i++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true);
    files[new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nlen))] = { method, csize, lho };
    p += 46 + nlen + elen + clen;
  }
  return async name => {
    const f = files[name];
    if (!f) return null;
    const s = f.lho + 30 + dv.getUint16(f.lho + 26, true) + dv.getUint16(f.lho + 28, true), data = u8.subarray(s, s + f.csize);
    return new TextDecoder().decode(f.method === 0 ? data : await lrfInflate(data));
  };
}
const lrfXml = s => new DOMParser().parseFromString(s, 'application/xml');
const lrfColIdx = ref => { let n = 0; const m = /^[A-Z]+/.exec(ref); (m ? m[0] : '').split('').forEach(ch => { n = n * 26 + ch.charCodeAt(0) - 64; }); return n - 1; };
// The first sheet of an .xlsx as rows of strings.
async function lrfReadXlsx(buf) {
  const read = await lrfUnzip(buf);
  let target = 'xl/worksheets/sheet1.xml';
  try {
    const wb = lrfXml(await read('xl/workbook.xml')), rels = lrfXml(await read('xl/_rels/workbook.xml.rels'));
    const rid = wb.querySelector('sheet').getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const rel = [...rels.querySelectorAll('Relationship')].find(x => x.getAttribute('Id') === rid);
    if (rel) target = 'xl/' + rel.getAttribute('Target').replace(/^\/?(xl\/)?/, '');
  } catch (e) { /* the usual place */ }
  const ssXml = await read('xl/sharedStrings.xml');
  const shared = ssXml ? [...lrfXml(ssXml).querySelectorAll('si')].map(si => [...si.querySelectorAll('t')].filter(t => !t.closest('rPh')).map(t => t.textContent).join('')) : [];
  const sheetXml = await read(target);
  if (!sheetXml) throw new Error('no sheet');
  const out = [];
  lrfXml(sheetXml).querySelectorAll('sheetData > row').forEach(row => {
    const cells = [];
    row.querySelectorAll('c').forEach(c => {
      const t = c.getAttribute('t'), v = c.querySelector('v');
      let val = '';
      if (t === 's') val = shared[+(v ? v.textContent : -1)] || '';
      else if (t === 'inlineStr') val = [...c.querySelectorAll('t')].map(x => x.textContent).join('');
      else val = v ? v.textContent : '';
      cells[lrfColIdx(c.getAttribute('r') || 'A1')] = val;
    });
    out.push(cells);
  });
  return out;
}
function lrfReadCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

// A file's first sheet as rows of strings, whichever of .xlsx or .csv it is (lost-queue.js reads its upload with this too).
async function lrfGrid(file) {
  const buf = await file.arrayBuffer();
  return /\.csv$/i.test(file.name) ? lrfReadCsv(new TextDecoder().decode(buf)) : await lrfReadXlsx(buf);
}

function lrfPick() { const f = document.getElementById('lrfFile'); if (f) { f.value = ''; f.click(); } }

async function lrfOnFile(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const box = document.getElementById('lrfPanel');
  if (box) box.innerHTML = '<p class="slv-muted">Reading the file…</p>';
  try {
    const buf = await file.arrayBuffer();
    const grid = /\.csv$/i.test(file.name) ? lrfReadCsv(new TextDecoder().decode(buf)) : await lrfReadXlsx(buf);
    const hi = grid.findIndex(r => (r || []).some(c => /^client key/i.test(String(c || '').trim())));
    if (hi < 0) throw new Error('no key column');
    const H = (grid[hi] || []).map(c => String(c || '').trim().toLowerCase());
    const ci = { key: H.findIndex(h => h.startsWith('client key')), reason: H.findIndex(h => h.startsWith('take out')), note: H.findIndex(h => h === 'note'), name: H.indexOf('client') };
    if (ci.reason < 0) throw new Error('no Take out? column');
    await Promise.all(LL_LISTS.map(l => llFetch(l.id)));
    const cur = new Map();
    LL_LISTS.forEach(l => (llRows[l.id] || []).forEach(r => { if (!cur.has(r.client_key)) cur.set(r.client_key, r); }));
    const canon = new Map(LL_REASONS.map(r => [r.toLowerCase(), r]));
    const set = [], clear = [], unknown = [], notClients = [];
    let seenRows = 0, noteOnly = 0;
    grid.slice(hi + 1).forEach(r => {
      if (!r || !r[ci.key]) return;
      const key = String(r[ci.key]).trim();
      if (!key) return;
      seenRows++;
      const c = cur.get(key);
      const name = String(r[ci.name] || (c && c.client_name) || key).trim();
      if (!c) { notClients.push(name); return; }
      const raw = String(r[ci.reason] || '').trim(), note = ci.note >= 0 ? String(r[ci.note] || '').trim().slice(0, 200) : '';
      if (!raw) { if (c.excluded) clear.push({ k: key, name }); else if (note) noteOnly++; return; }
      const reason = canon.get(raw.toLowerCase());
      if (!reason) { unknown.push({ name, raw }); return; }
      if (c.excluded !== reason || (c.excluded_note || '') !== note) set.push({ k: key, r: reason, n: note || null, name, was: c.excluded || '' });
    });
    lrfPlan = { set, clear };
    lrfPreview(file.name, { seenRows, set, clear, unknown, notClients, noteOnly });
  } catch (e) {
    console.error(e);
    lrfPlan = null;
    if (box) box.innerHTML = '<p class="slv-note">That file could not be read. Use the review file downloaded from this page, saved as .xlsx or .csv, with its Take out? and Client key columns.</p>';
  }
}

function lrfPreview(fname, p) {
  const box = document.getElementById('lrfPanel');
  if (!box) return;
  const names = (list, n = 12) => list.slice(0, n).map(x => lcEsc(x.name)).join(', ') + (list.length > n ? `, and ${lcNum(list.length - n)} more` : '');
  const total = p.set.length + p.clear.length;
  box.innerHTML = `<div class="lrf-box">
    <div><b>${lcEsc(fname)}</b>: ${lcNum(p.seenRows)} rows read.</div>
    <ul class="lrf-list">
      <li><b>${lcNum(p.set.length)}</b> taken out or changed${p.set.length ? `: ${names(p.set)}` : ''}</li>
      <li><b>${lcNum(p.clear.length)}</b> put back in${p.clear.length ? `: ${names(p.clear)}` : ''}</li>
      ${p.unknown.length ? `<li class="lrf-warn"><b>${lcNum(p.unknown.length)}</b> have a reason that is not on the list, so they are left as they are: ${p.unknown.slice(0, 8).map(x => lcEsc(x.name) + ' ("' + lcEsc(x.raw) + '")').join(', ')}${p.unknown.length > 8 ? '…' : ''}</li>` : ''}
      ${p.notClients.length ? `<li class="lrf-warn"><b>${lcNum(p.notClients.length)}</b> are no longer on these lists (or the key was changed), so they are skipped</li>` : ''}
      ${p.noteOnly ? `<li class="lrf-warn"><b>${lcNum(p.noteOnly)}</b> have a note but no reason, so nothing is taken out</li>` : ''}
    </ul>
    <div class="lrf-act">
      <button type="button" class="tglr lc-btn" onclick="lrfApply()"${total ? '' : ' disabled'}>${total ? 'Apply ' + lcNum(total) + ' change' + (total === 1 ? '' : 's') : 'Nothing to change'}</button>
      <button type="button" class="tglr lc-btn" onclick="lrfCancel()">Cancel</button>
      ${total > 300 ? '<span class="slv-note">That is a lot of changes at once. Check the list above before you apply.</span>' : ''}
    </div></div>`;
}
function lrfCancel() { lrfPlan = null; const b = document.getElementById('lrfPanel'); if (b) b.innerHTML = ''; }

async function lrfApply() {
  if (!lrfPlan || lrfBusy) return;
  const { set, clear } = lrfPlan;
  if (set.length + clear.length > 300 && !confirm(`Apply ${set.length + clear.length} changes at once?`)) return;
  lrfBusy = true;
  const box = document.getElementById('lrfPanel');
  if (box) box.innerHTML = '<p class="slv-muted">Saving…</p>';
  const { error } = await sb.rpc('lost_exclude_bulk', { p_items: set.map(x => ({ k: x.k, r: x.r, n: x.n })), p_clear: clear.map(x => x.k) });
  lrfBusy = false;
  if (error) { console.error(error); if (box) box.innerHTML = '<p class="slv-note">That did not save. Nothing was changed. Try again.</p>'; return; }
  set.forEach(x => llSetOut(x.k, x.r, x.n));
  clear.forEach(x => llSetOut(x.k, null));
  lrfPlan = null;
  if (box) box.innerHTML = `<p class="slv-note">Saved: ${lcNum(set.length)} taken out or changed, ${lcNum(clear.length)} put back in.</p>`;
  llPaintTable();
  llReloadSum();
}
