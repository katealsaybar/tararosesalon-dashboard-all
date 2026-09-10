/* ============================================================
   TARA ROSE LADIES SALON — sales-transactions-pdf.js
   Phorest "Sales Transactions" report -> one row per (branch,
   date, staff) in the staff_financial_totals table. The per-staff
   treasury view Financial Totals can't give (that report has a
   Staff *filter*, not a breakdown) — see
   "phorest data export/sales transactions/README.md" and its
   Python twin parse_staff_financial_totals.py, which this mirrors
   line for line except where noted.

   Load this AFTER financial-totals-pdf.js — reuses its ftRowText
   text-join helper (generic, no report-specific assumptions) but
   NOT ftExtractRows: that one assumes a normal-axis content stream,
   which Financial Totals has and this report does not (see
   STX_ROW_TOL's note below). Also reuses, from phorest-staff.js,
   spGuardBranchMismatch, spGuardReportKind, spToISODate,
   spRecordClosedDay, spLoadClosedDays, spGetBackfillDays,
   spRenderBackfillStrips, spIsoDate, spRenderTodayStrip,
   spProgBeginBatch/EndBatch. Also reuses sb, BRANCHES, BRANCH_KEYS
   from upload.js.

   COLUMN-BY-POSITION, NOT COLUMN-BY-COUNT: the Python parser skips
   the Id/Time/AM-PM block by slicing off a fixed number of tokens
   (tokens[4:]), which assumes pdfplumber's word-splitter always
   hands back exactly 3 tokens for that block. pdf.js's text items
   don't reliably line up with pdfplumber's whitespace-split words,
   so here every token is classified by its own x-position against
   the report's column boundaries instead — robust to a library
   merging "01/09/2025 08:15 AM" into one item or three, as long as
   it doesn't merge across a column boundary (which would fuse two
   different cells, and no report seen so far does that).
   ============================================================ */

const STX_TABLE = 'staff_financial_totals';

// Column left edges, in PDF points — read off the header row by pdfplumber,
// which always reports true visual x0 regardless of the page's own /Rotate.
const STX_COL_STAFF = 164;
const STX_COL_ITEM = 246;
const STX_COL_CLIENT = 388;

// Confirmed live 10 Sep 2026: unlike Financial Totals (see the note at the top
// of financial-totals-pdf.js), this report's pages carry the same swapped-axis
// /Rotate quirk phorest-pdf.js already works around for Staff Performance —
// pdf.js's raw item.transform is in the page's unrotated content-stream space,
// so a text item's visual ROW position increases along transform[4] and its
// visual COLUMN position (what STX_COL_* compares against) increases along
// transform[5]. Grouping by rounded transform[4] and sorting each group by
// transform[5] reconstructs the same left-to-right, top-to-bottom order
// pdfplumber's rotation-aware extract_words() gives the Python parser.
const STX_ROW_TOL = 2;

async function stxExtractRows(file){
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const items = [];
  for (let p = 1; p <= pdf.numPages; p++){
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    content.items.forEach(it => {
      const text = (it.str || '').trim();
      // Row key offset by page so a sort walks page 1 fully before page 2.
      if (text) items.push({ row: it.transform[4] + p * 10000, x: it.transform[5], text });
    });
  }
  const sorted = items.slice().sort((a, b) => (a.row - b.row) || (a.x - b.x));
  const rows = [];
  let current = null;
  sorted.forEach(it => {
    if (!current || Math.abs(current.row - it.row) > STX_ROW_TOL){
      current = { row: it.row, tokens: [] };
      rows.push(current);
    }
    current.tokens.push(it);
  });
  rows.forEach(r => r.tokens.sort((a, b) => a.x - b.x));
  return stxMergeWrappedRows(rows.map(r => r.tokens));
}

// A long Staff name, Item description AND/OR Payment Type can each be too
// wide for their own cell and wrap onto a second physical line at once —
// confirmed live 10 Sep 2026 on Motor City 9 Sep, sale 29916: "Clarissa" /
// "Extension Removal ONLY- Per" / "S(1631.00),CC" on the real row, then
// "Destacamento" / "HR" / "(1631.00)" on their own row ~half a row-height
// below (full staff name "Clarissa Destacamento", item "…Per HR", payment
// "S(1631.00),CC(1631.00)"). That wrapped row has no Id of its own, so it's
// indistinguishable from a genuinely new row only by the ABSENCE of one:
// fold any row that doesn't start with an Id (plain or bullet-marked), a
// "Total", or a "Page" marker into the row above it, then re-sort the
// combined tokens by x so each wrapped fragment lands back in its own
// column next to its first line, in original left-to-right order (Array.
// sort is stable) when two tokens tie on x. stxSplitTail and the x-band
// staff/item classification below then read the merged row exactly as if
// it had never wrapped.
function stxLooksLikeRowStart(tokens){
  if (!tokens.length) return false;
  const first = tokens[0].text;
  if (STX_ID_TOKEN.test(first)) return true;
  if (first.length <= 2 && tokens[1] && STX_ID_TOKEN.test(tokens[1].text)) return true; // bullet + id
  return /^(Total|Page)\b/i.test(first);
}

function stxMergeWrappedRows(rows){
  const out = [];
  rows.forEach(tokens => {
    if (out.length && !stxLooksLikeRowStart(tokens)){
      out[out.length - 1] = out[out.length - 1].concat(tokens).sort((a, b) => a.x - b.x);
      return;
    }
    out.push(tokens);
  });
  return out;
}

const STX_MONEY = /^-?[\d,]*\d\.\d{2}$/;
const STX_ID_TOKEN = /^\d{4,7}$/;
// Amount can be negative — a refund prints as e.g. "C(-98.00)". Confirmed
// live 10 Sep 2026 (al-quoz 8 Sep, sale 39657): missing the leading "-?"
// here silently zeroed every refund's fragment, failing structural check #2.
const STX_PAY_FRAGMENT = /^([A-Z]+)\((-?[\d,]*\d\.\d{2})\)$/;
const STX_DATE_RANGE = /(\d{2}\/\d{2}\/\d{2})\s*-\s*(\d{2}\/\d{2}\/\d{2})/;

const STX_UNASSIGNED = 'BUSINESS (unassigned)';
// Decoded by summing every fragment of a code across a whole day and matching
// it exactly against that same branch-day's Financial Totals payment split —
// see README's "How the payment-type codes were decoded" table. An
// unrecognised code stays under its own raw letters in payment_types (no
// dedicated pay_* column), since Financial Totals has already shown payment
// types vary by branch.
const STX_KNOWN_CODES = { C: 'cash', CC: 'card', A: 'account', V: 'voucher', S: 'stripe', T: 'tabby_link' };

function stxNum(s){ const n = parseFloat(String(s).replace(/,/g, '')); return isNaN(n) ? 0 : n; }
function stxRound2(n){ return Math.round((n + Number.EPSILON) * 100) / 100; }

// ── ROW SPLITTING ────────────────────────────────────────────
// Pops the trailing payment-type token(s) (and a lone "*" for change given
// back) off a row's tail, then the four money columns (discount, net, vat,
// total), left to right. Whatever's left in front is the Staff/Item/Client
// text block, classified by x-position in the caller.

function stxSplitTail(tokens){
  const rest = tokens.slice();
  const paymentTokens = [];
  while (rest.length && !STX_MONEY.test(rest[rest.length - 1].text)){
    paymentTokens.unshift(rest.pop());
  }
  if (rest.length < 4 || !rest.slice(-4).every(t => STX_MONEY.test(t.text))) return null;
  const money = rest.splice(-4, 4);
  const [discount, net, vat, total] = money.map(t => stxNum(t.text));
  // The trailing "*" (change given back) is its own word in the Python
  // parser's pdfplumber tokens, filtered out by an exact '*' match. pdf.js
  // instead fuses it onto the payment text as one item — "C(144.00) *" — so
  // an exact-match filter never catches it and the trailing "*" breaks the
  // fragment regex's closing ")$'". Strip every "*" from the joined text
  // instead of filtering whole tokens; a payment fragment never legitimately
  // contains one.
  const paymentRaw = paymentTokens.map(t => t.text).join(' ').replace(/\*/g, '').trim();
  return { textTokens: rest, discount, net, vat, total, paymentRaw };
}

// Returns null when this isn't a primary transaction line (a wrapped Client
// continuation, a header, the closing Total line).
function stxParseTransactionRow(tokens){
  if (!tokens.length) return null;
  let idx = 0;
  // A course/package redemption line prints a small bullet glyph just left
  // of the Id column, its own separate item (confirmed live 10 Sep 2026,
  // Saadiyat 8 Sep sale 65342 — a "Facial of Choice (buy 3 and get…" line).
  // Skip one such marker rather than failing the whole row: losing it would
  // silently drop that sale's Payment Type along with it, since only that
  // line carries it.
  if (!STX_ID_TOKEN.test(tokens[0].text) && tokens.length > 1 &&
      tokens[0].text.length <= 2 && STX_ID_TOKEN.test(tokens[1].text)){
    idx = 1;
  }
  if (!STX_ID_TOKEN.test(tokens[idx].text)) return null;
  const tail = stxSplitTail(tokens.slice(idx + 1));
  if (!tail) return null;

  const staffParts = [], itemParts = [];
  tail.textTokens.forEach(t => {
    if (t.x >= STX_COL_STAFF && t.x < STX_COL_ITEM) staffParts.push(t.text);
    else if (t.x >= STX_COL_ITEM && t.x < STX_COL_CLIENT) itemParts.push(t.text);
    // Id/Time/AM-PM block (x < STX_COL_STAFF) and Client (x >= STX_COL_CLIENT)
    // are read here but dropped — not needed for this table.
  });

  return {
    saleId: tokens[idx].text,
    staff: staffParts.join(' ').trim(),
    item: itemParts.join(' ').trim(),
    discount: tail.discount, net: tail.net, vat: tail.vat, total: tail.total,
    paymentRaw: tail.paymentRaw,
  };
}

// 'C(242.50),A(5.00)' -> [['C',242.50],['A',5.00]]. Unparseable text (there
// shouldn't be any) is dropped rather than guessed at.
function stxParsePaymentFragments(raw){
  if (!raw) return [];
  const out = [];
  raw.replace(/\s+/g, '').split(',').forEach(frag => {
    const m = frag.match(STX_PAY_FRAGMENT);
    if (m) out.push([m[1], stxNum(m[2])]);
  });
  return out;
}

// ── PARSE ─────────────────────────────────────────────────────
// Takes rows already extracted by ftExtractRows (see financial-totals-pdf.js
// — generic pdf.js text-item grouping, nothing report-specific in it).

function stxParseRows(rows, branchCode){
  const lines = rows.map(ftRowText);
  if (!/Sales\s+Transactions/i.test(lines.slice(0, 3).join(' '))){
    throw new Error('This does not look like a Sales Transactions report (title not found). Skipped, nothing saved.');
  }

  const salonLine = lines.find(l => /salon/i.test(l));
  spGuardBranchMismatch(salonLine, branchCode);

  const dateText = lines.find(l => STX_DATE_RANGE.test(l));
  if (!dateText) throw new Error('Could not find the date line (expected "DD/MM/YY - DD/MM/YY").');
  const dm = dateText.match(STX_DATE_RANGE);
  const dateFrom = spToISODate(dm[1]), dateTo = spToISODate(dm[2]);
  if (dateFrom !== dateTo){
    throw new Error(`This report covers ${dateFrom} to ${dateTo} — expected a single day. Skipped, nothing saved.`);
  }

  const transactions = [];
  let grandTotal = null;
  rows.forEach(tokens => {
    const text = ftRowText(tokens);
    if (/^Page \d+$/i.test(text)) return;
    // The report closes with a Cashbook / Payment Types / Total Banked
    // summary footer (confirmed live 10 Sep 2026, Saadiyat 9 Sep) that
    // repeats the word "Total" several times over ("Total Banked …") — only
    // the FIRST "Total" row, immediately after the last transaction line, is
    // the one this table's own checks compare against.
    if (grandTotal === null && /^Total\b/i.test(text) && !(tokens[0] && STX_ID_TOKEN.test(tokens[0].text))){
      const tail = stxSplitTail(tokens.slice(1));
      if (tail) grandTotal = { discount: tail.discount, net: tail.net, vat: tail.vat, total: tail.total };
      return;
    }
    const row = stxParseTransactionRow(tokens);
    if (row) transactions.push(row);
  });

  if (grandTotal === null) throw new Error('Could not find the closing Total row.');

  // Every line of a multi-item sale repeats the Id but only the first line
  // carries the Payment Type — propagate it to the rest of that sale's lines.
  const paymentBySale = {};
  transactions.forEach(r => { if (r.paymentRaw) paymentBySale[r.saleId] = r.paymentRaw; });
  transactions.forEach(r => { r.paymentRaw = paymentBySale[r.saleId] || r.paymentRaw; });

  // Structural check #1: every line item, business rows included, sums to
  // the report's own closing Total row.
  const fails = [];
  const lineSum = { discount: 0, net: 0, vat: 0, total: 0 };
  transactions.forEach(r => {
    lineSum.discount += r.discount; lineSum.net += r.net; lineSum.vat += r.vat; lineSum.total += r.total;
  });
  const tol = 0.02 * Math.max(1, transactions.length);
  ['discount', 'net', 'vat', 'total'].forEach(key => {
    if (Math.abs(lineSum[key] - grandTotal[key]) > tol){
      fails.push(`line items sum to ${key}=${lineSum[key].toFixed(2)} but the report's own Total row says ${grandTotal[key].toFixed(2)}`);
    }
  });

  // Structural check #2: each sale's payment fragments should sum to that
  // sale's own line total(s) — confirms the split is trustworthy before it
  // gets apportioned across staff.
  const saleTotals = {};
  transactions.forEach(r => { saleTotals[r.saleId] = (saleTotals[r.saleId] || 0) + r.total; });
  Object.keys(paymentBySale).forEach(saleId => {
    const fragSum = stxParsePaymentFragments(paymentBySale[saleId]).reduce((s, [, amt]) => s + amt, 0);
    if (Math.abs(fragSum - (saleTotals[saleId] || 0)) > 0.02){
      fails.push(`sale ${saleId}: payment fragments sum to ${fragSum.toFixed(2)} but its items total ${(saleTotals[saleId] || 0).toFixed(2)}`);
    }
  });

  // Per-staff aggregation. Rows with no real stylist attached — till
  // deposits, voucher sales, account movements, but also the occasional
  // ordinary sale rung up without a staff assignment — all land under one
  // BUSINESS (unassigned) row rather than being dropped; see README.
  const perStaff = {};
  transactions.forEach(r => {
    const rawStaff = r.staff || '';
    const staff = (!rawStaff || /^BUSINESS\b/i.test(rawStaff)) ? STX_UNASSIGNED : rawStaff;
    if (!perStaff[staff]){
      perStaff[staff] = { saleIds: new Set(), lineCount: 0, net: 0, vat: 0, total: 0, paymentTypes: {} };
    }
    const s = perStaff[staff];
    s.saleIds.add(r.saleId);
    s.lineCount++;
    s.net += r.net; s.vat += r.vat; s.total += r.total;

    // Apportion this sale's payment fragments pro-rata by this line's share
    // of the sale's total (a sale can be worked by several staff and/or paid
    // across several tender types at once).
    const saleTotal = saleTotals[r.saleId] || 0;
    if (saleTotal > 0){
      const share = r.total / saleTotal;
      stxParsePaymentFragments(paymentBySale[r.saleId] || '').forEach(([code, amt]) => {
        s.paymentTypes[code] = (s.paymentTypes[code] || 0) + amt * share;
      });
    }
  });

  const checksPassed = fails.length === 0;
  const rowsOut = Object.keys(perStaff).map(staff => {
    const s = perStaff[staff];
    const paymentTypes = {};
    Object.keys(s.paymentTypes).forEach(code => { paymentTypes[code] = stxRound2(s.paymentTypes[code]); });
    const row = {
      branch: branchCode, date: dateFrom, employee_name: staff,
      sale_count: s.saleIds.size, line_count: s.lineCount,
      net: stxRound2(s.net), vat: stxRound2(s.vat), total: stxRound2(s.total),
      payment_types: paymentTypes,
      checks_passed: checksPassed,
    };
    Object.keys(STX_KNOWN_CODES).forEach(code => { row[`pay_${STX_KNOWN_CODES[code]}`] = paymentTypes[code] || 0; });
    return row;
  }).sort((a, b) => a.employee_name.localeCompare(b.employee_name));

  const namedStaffTotal = stxRound2(rowsOut.filter(r => r.employee_name !== STX_UNASSIGNED).reduce((s, r) => s + r.total, 0));
  const staffTotalSum = stxRound2(rowsOut.reduce((s, r) => s + r.total, 0));

  return { branch: branchCode, date: dateFrom, fails, rows: rowsOut, grandTotal, staffTotalSum, namedStaffTotal };
}

// ── UPLOAD PORTAL TAB ─────────────────────────────────────────

let stxPdfQueue = [];

const STX_BACKFILL_START = '2025-01-01';       // mirrors FT_BACKFILL_START
const STX_BRANCH_END = { FRT: '2026-05-22' };  // Fratelli closed; same date the other feeds use
const STX_PAGE_SIZE = 1000;

// Phorest's own exported filenames don't match our branch labels 1:1, same
// overrides the other PDF uploaders keep.
const STX_PDF_FILENAME_SLUGS = { SAA: 'saadiyat', KCA: 'khalifa-city', MC: 'motor-city', AQ: 'al-quoz' };

function stxBranchFromFilename(filename){
  const lower = String(filename).toLowerCase();
  return BRANCH_KEYS.find(code => {
    const slug = STX_PDF_FILENAME_SLUGS[code] || BRANCHES[code].name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return lower.startsWith(slug + '-');
  }) || null;
}

function stxDateFromFilename(filename){
  const m = String(filename).match(/(\d{4}-\d{2}-\d{2})\.pdf$/i);
  return m ? m[1] : null;
}

function stxQueuePdfFiles(fileList){
  stxPdfQueue = stxPdfQueue.concat(Array.from(fileList));
  const el = document.getElementById('stxPdfQueueCount');
  if (el) el.textContent = stxPdfQueue.length ? `${stxPdfQueue.length} file(s) queued` : 'No files queued';
}

function stxPdfRowHtml(filename, ok, msg){
  return `<div class="sp-pdf-row"><span class="fn">${filename}</span><span class="status ${ok ? 'ok' : 'bad'}">${msg}</span></div>`;
}

async function handleStxPdfBatch(){
  const btn = document.getElementById('stxPdfParseBtn');
  const resultsEl = document.getElementById('stxPdfResults');
  if (!stxPdfQueue.length){ resultsEl.innerHTML = stxPdfRowHtml('—', false, 'No files queued.'); return; }

  btn.disabled = true;
  const files = stxPdfQueue.slice();
  stxPdfQueue = [];
  document.getElementById('stxPdfQueueCount').textContent = 'No files queued';
  document.getElementById('stxPdfInput').value = '';

  const statuses = files.map(f => ({ name: f.name, ok: true, msg: 'Parsing…' }));
  const render = () => { resultsEl.innerHTML = statuses.map(s => stxPdfRowHtml(s.name, s.ok, s.msg)).join(''); };
  render();

  for (let idx = 0; idx < files.length; idx++){
    const file = files[idx];
    try {
      spGuardReportKind('salestx', { filename: file.name });
      const branch = stxBranchFromFilename(file.name);
      if (!branch) throw new Error("Could not match filename to a branch — expected it to start with the branch name (e.g. 'motor-city-').");
      const filenameDate = stxDateFromFilename(file.name);

      const rows = await stxExtractRows(file);
      spGuardReportKind('salestx', { text: rows.map(ftRowText).join(' ') });
      const parsed = stxParseRows(rows, branch);
      if (filenameDate && filenameDate !== parsed.date){
        throw new Error(`Filename says ${filenameDate} but the report content says ${parsed.date} — skipped, please check this file.`);
      }

      // Both structural checks decide whether this is written at all. A
      // failure is a bad parse rather than an unusual day, so nothing is
      // saved and the file stays in the list to be looked at.
      if (parsed.fails.length) throw new Error(`The report does not add up as parsed, so nothing was saved: ${parsed.fails.join('; ')}.`);

      const rowsToSave = parsed.rows.map(r => ({ ...r, source_file: file.name }));

      // Delete-then-insert like Staff Daily, not upsert like Financial Totals:
      // this is one row PER STAFF MEMBER, so a re-parse can add or drop staff
      // between runs and an upsert would leave stale rows behind.
      await sb.from(STX_TABLE).delete().eq('branch', branch).eq('date', parsed.date);
      if (rowsToSave.length){
        const { error } = await sb.from(STX_TABLE).insert(rowsToSave);
        if (error) throw error;
      }

      // A day with no transactions at all writes zero rows (unlike Financial
      // Totals, which always writes one row even when everything on it is
      // zero) — so a closed day needs recording explicitly, or it reads as
      // "missing" rather than "closed" on the backfill grid.
      const closed = rowsToSave.length === 0;
      if (closed) await spRecordClosedDay(branch, parsed.date, 'sales transactions');

      statuses[idx] = { name: file.name, ok: true, msg: closed
        ? `Saved — ${BRANCHES[branch].name}, ${parsed.date}, closed (no trading)`
        : `Saved — ${BRANCHES[branch].name}, ${parsed.date}, ${rowsToSave.length} staff, named-staff total ${parsed.namedStaffTotal.toLocaleString('en-AE', { minimumFractionDigits: 2 })}` };
    } catch(e){
      statuses[idx] = { name: file.name, ok: false, msg: e.message || String(e) };
    }
    render();
  }

  btn.disabled = false;
  await refreshStxProgress();
}

function initStxPdfDrop(){
  const drop = document.getElementById('stxPdfDrop');
  if (!drop || drop.dataset.wired) return;
  drop.dataset.wired = '1';
  ['dragover', 'dragenter'].forEach(evt => drop.addEventListener(evt, e => { e.preventDefault(); drop.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach(evt => drop.addEventListener(evt, e => { e.preventDefault(); drop.classList.remove('dragover'); }));
  drop.addEventListener('drop', e => {
    const files = Array.from(e.dataTransfer.files || []).filter(f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
    if (files.length) stxQueuePdfFiles(files);
  });
}

// ── PROGRESS ──────────────────────────────────────────────────
// No is_total-style shortcut here (staff_financial_totals has no aggregate
// row, unlike phorest_staff_daily) — every employee row for the window gets
// paged through to build the (branch, date) coverage set. Same scale Staff
// Daily already handles fine, just without that one filter.

async function refreshStxProgress(){
  const host = document.getElementById('stxProgressGrid');
  if (!host) return;
  host.innerHTML = '<div style="font-size:14px;color:var(--muted2);padding:8px 0">Loading…</div>';

  const { count, error: countErr } = await sb.from(STX_TABLE).select('id', { count: 'exact', head: true });
  if (countErr){ host.innerHTML = `<div style="font-size:14px;color:var(--bad)">Failed to load progress: ${countErr.message}</div>`; return; }
  const pages = [];
  for (let offset = 0; offset < (count || 0); offset += STX_PAGE_SIZE){
    pages.push(sb.from(STX_TABLE).select('branch,date,checks_passed')
      .order('id', { ascending: true }).range(offset, offset + STX_PAGE_SIZE - 1));
  }
  const results = await Promise.all(pages);
  const failed = results.find(r => r.error);
  if (failed){ host.innerHTML = `<div style="font-size:14px;color:var(--bad)">Failed to load progress: ${failed.error.message}</div>`; return; }
  const all = results.flatMap(r => r.data || []);

  const covered = new Set(all.filter(r => r.checks_passed !== false).map(r => `${r.branch}|${r.date}`));

  await spLoadClosedDays();

  spProgBeginBatch();
  let html = '';
  for (const code of BRANCH_KEYS){
    const days = spGetBackfillDays(STX_BACKFILL_START, STX_BRANCH_END[code]);
    html += spRenderBackfillStrips(BRANCHES[code].name, days, covered, d => `${code}|${spIsoDate(d)}`);
  }
  host.innerHTML = html;
  spProgEndBatch('stxProgressGrid');

  const suspectDays = new Set(all.filter(r => r.checks_passed === false).map(r => `${r.branch}|${r.date}`));
  const warn = document.getElementById('stxChecksWarn');
  if (warn){
    const list = Array.from(suspectDays);
    warn.innerHTML = list.length
      ? `<strong>${list.length} day${list.length === 1 ? '' : 's'} stored with failing checks.</strong> ` +
        'These are parse problems rather than odd days, so re-upload them: ' +
        list.slice(0, 12).join(', ') + (list.length > 12 ? ', …' : '')
      : '';
    warn.style.display = list.length ? 'block' : 'none';
  }

  spRenderTodayStrip('stxTodayStrip', 'tabPipSalestx', 'salestx', BRANCH_KEYS.map(code => ({
    label: BRANCHES[code].name,
    in: covered.has(`${code}|${spIsoDate(new Date())}`),
    ended: !!(STX_BRANCH_END[code] && spIsoDate(new Date()) > STX_BRANCH_END[code]),
  })));

  if (typeof updStamp === 'function') updStamp('salestx');
}

function initSalesTxTab(){
  initStxPdfDrop();
  refreshStxProgress();
}
