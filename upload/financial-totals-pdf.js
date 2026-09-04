/* ============================================================
   TARA ROSE LADIES SALON — financial-totals-pdf.js
   Phorest "Financial Totals" report -> one row per branch-day
   in the financial_totals table.
   Load this AFTER phorest-staff.js — reuses SP_BRANCHES,
   spBranchLabel, spGuardBranchMismatch, spGuardReportKind,
   spToISODate, spBranchFromFilename, spDateFromFilename and
   spRecordClosedDay from that file rather than restating them.
   ============================================================ */

const FT_TABLE = 'financial_totals';

// Unlike the Staff Performance report (see the long note in phorest-pdf.js),
// this PDF's content stream is laid out the normal way round: a text item's
// transform X really is its horizontal position and its transform Y its
// vertical one. So rows group by Y and sort by X, with no axis swap.
//
// The layout quirk that DOES need handling is different: Cashbook and Payment
// Types are printed SIDE BY SIDE, two separate tables sharing the same visual
// rows. Read those rows as single lines and the two tables fuse into nonsense
// ("Sales 1234 10,000.00 Cash (Net of Sundries) 500.00"). Everything left
// of this X belongs to Cashbook, everything right of it to Payment Types.
// Measured across all four branches' August exports: Cashbook values stop at
// x~262, Payment Types labels start at x=335.
const FT_COL_SPLIT = 300;

// Two text items belong to the same visual row if their Y agree to within this.
// Phorest's rows sit 20 units apart, so the tolerance has plenty of room.
const FT_ROW_TOL = 2;

const FT_MONEY = /^-?[\d,]*\d\.\d{2}$/;
const FT_INT   = /^-?\d+$/;

function ftIsNumberToken(s){ return FT_MONEY.test(s) || FT_INT.test(s); }
function ftNum(s){ const n = parseFloat(String(s).replace(/,/g, '')); return isNaN(n) ? 0 : n; }
function ftKey(label){ return String(label).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

// ── EXTRACTION ────────────────────────────────────────────────

async function ftExtractRows(file){
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const items = [];
  for (let p = 1; p <= pdf.numPages; p++){
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    content.items.forEach(it => {
      const text = (it.str || '').trim();
      // Page Y counts upward in PDF space, so offset by page so that sorting
      // descending walks page 1 before page 2. One page in practice, but the
      // report grows a second one when a branch collects enough payment types.
      if (text) items.push({ x: it.transform[4], y: it.transform[5] - p * 10000, text });
    });
  }
  return ftRowsFromItems(items);
}

// Split out from ftExtractRows so the parser can be exercised against captured
// item coordinates without a live pdf.js document.
function ftRowsFromItems(items){
  const sorted = items.slice().sort((a, b) => (b.y - a.y) || (a.x - b.x));
  const rows = [];
  let current = null;
  sorted.forEach(it => {
    if (!current || Math.abs(current.y - it.y) > FT_ROW_TOL){
      current = { y: it.y, tokens: [] };
      rows.push(current);
    }
    current.tokens.push(it);
  });
  rows.forEach(r => r.tokens.sort((a, b) => a.x - b.x));
  return rows.map(r => r.tokens);
}

function ftRowText(tokens){
  return tokens.map(t => t.text).join(' ').replace(/\s+/g, ' ').trim();
}

// Split a row's tokens into its label and its trailing numbers. Scanned from
// the RIGHT, because labels legitimately contain digits: "Service 5% @ 5%" and
// "Service 0 @ 5%" are both real VAT Breakdown labels, and a left-to-right scan
// would cut them at the first digit and throw the rest of the label away.
function ftSplitRow(tokens){
  let i = tokens.length;
  while (i > 0 && ftIsNumberToken(tokens[i - 1].text)) i--;
  return {
    label: tokens.slice(0, i).map(t => t.text).join(' ').replace(/\s+/g, ' ').trim(),
    nums:  tokens.slice(i).map(t => ftNum(t.text)),
  };
}

// ── PARSE ─────────────────────────────────────────────────────

function ftParseRows(rows, branchCode){
  const lines = rows.map(ftRowText);
  if (!/financial\s+totals/i.test(lines.join(' '))){
    throw new Error('This does not look like a Financial Totals report (title not found). Skipped, nothing saved.');
  }

  const salonLine = lines.find(l => /salon/i.test(l));
  spGuardBranchMismatch(salonLine, branchCode);

  const dateText = lines.find(l => /\d{2}\/\d{2}\/\d{2}\s*-\s*\d{2}\/\d{2}\/\d{2}/.test(l));
  if (!dateText) throw new Error('Could not find the date line (expected "DD/MM/YY - DD/MM/YY").');
  const dm = dateText.match(/(\d{2}\/\d{2}\/\d{2})\s*-\s*(\d{2}\/\d{2}\/\d{2})/);
  const from = spToISODate(dm[1]), to = spToISODate(dm[2]);
  // The table is keyed (branch, date), so a range cannot be stored. Refusing
  // here is the point: a month-long export parses perfectly well and would
  // otherwise be filed silently against its first day.
  if (from !== to){
    throw new Error(`This report covers ${from} to ${to}. Financial Totals is stored one day per row, so pull it a day at a time. Skipped, nothing saved.`);
  }

  const rec = {
    branch: branchCode, date: from, salonLine,
    sales: {}, nonrev: {}, payouts: {}, cashbook: {}, payments: {}, vat: [],
    totalBanked: 0,
  };

  let section = null;
  rows.forEach(tokens => {
    const text = ftRowText(tokens);

    // Section headers. Every money table's header carries "Net (Ex VAT)"; the
    // side-by-side band is the one that names both its tables at once.
    if (/Cashbook/i.test(text) && /Payment\s+Types/i.test(text)){ section = 'split'; return; }
    if (/Net \(Ex VAT\)/i.test(text)){
      if (/^Sales\b/i.test(text))                  section = 'sales';
      else if (/^Non-Revenue Sales\b/i.test(text)) section = 'nonrev';
      else if (/^Pay Outs\b/i.test(text))          section = 'payouts';
      else if (/^VAT Breakdown\b/i.test(text))     section = 'vat';
      else section = null;
      return;
    }
    if (/^Page \d+$/i.test(text)) return;
    if (!section) return;

    if (section === 'split'){
      const left  = tokens.filter(t => t.x <  FT_COL_SPLIT);
      const right = tokens.filter(t => t.x >= FT_COL_SPLIT);
      if (left.length){
        const { label, nums } = ftSplitRow(left);
        if (label && nums.length){
          if (ftKey(label) === 'total banked'){
            rec.totalBanked = nums[nums.length - 1];
          } else {
            // Cashbook prints "# then Total". Only Total Banked lacks a count.
            rec.cashbook[label] = nums.length >= 2
              ? { count: nums[0], total: nums[1] }
              : { count: null,    total: nums[0] };
          }
        }
      }
      if (right.length){
        const { label, nums } = ftSplitRow(right);
        // Payment Types repeats Total Banked as its own footer. Both columns
        // agree, so the second read is a free check rather than a conflict.
        if (label && nums.length && ftKey(label) !== 'total banked'){
          rec.payments[label] = nums[nums.length - 1];
        }
      }
      return;
    }

    const { label, nums } = ftSplitRow(tokens);
    if (!label || !nums.length) return;

    if (section === 'vat'){
      if (nums.length >= 3) rec.vat.push({ net: nums[0], vat: nums[1], total: nums[2] });
      return;
    }

    // "# Net VAT Total" on a line item; the section's own Total row drops the #.
    rec[section][label] = nums.length >= 4
      ? { count: nums[0], net: nums[1], vat: nums[2], total: nums[3] }
      : { count: null,    net: nums[0], vat: nums[1], total: nums[2] };
  });

  return rec;
}

// ── CROSS-CHECKS ──────────────────────────────────────────────
// The report carries four internal identities. All four held on every sample
// seen so far (the four August branch exports plus a per-staff run), so a
// failure here means the parse is wrong, not that the day was unusual.
// Nothing is written when one fails.

function ftNear(a, b){ return Math.abs((a || 0) - (b || 0)) < 0.01; }

function ftFind(map, key){
  const hit = Object.keys(map).find(k => ftKey(k) === key);
  return hit ? map[hit] : null;
}
function ftTotalOf(map, key){ const e = ftFind(map, key); return e ? (e.total || 0) : 0; }
function ftCountOf(map, key){ const e = ftFind(map, key); return e ? (e.count || 0) : 0; }

function ftChecks(rec){
  const fails = [];

  const paySum = Object.keys(rec.payments).reduce((s, k) => s + rec.payments[k], 0);
  if (!ftNear(paySum, rec.totalBanked)){
    fails.push(`payment types sum to ${paySum.toFixed(2)} but Total Banked is ${rec.totalBanked.toFixed(2)}`);
  }

  const cashSum = Object.keys(rec.cashbook).reduce((s, k) => s + (rec.cashbook[k].total || 0), 0);
  if (!ftNear(cashSum, rec.totalBanked)){
    fails.push(`cashbook sums to ${cashSum.toFixed(2)} but Total Banked is ${rec.totalBanked.toFixed(2)}`);
  }

  const salesTotal = ftTotalOf(rec.sales, 'total');
  const cbSales    = ftFind(rec.cashbook, 'sales');
  if (cbSales && !ftNear(salesTotal, cbSales.total)){
    fails.push(`Sales total ${salesTotal.toFixed(2)} does not match Cashbook Sales ${(cbSales.total || 0).toFixed(2)}`);
  }
  const salesCount = ftCountOf(rec.sales, 'services') + ftCountOf(rec.sales, 'courses sold') + ftCountOf(rec.sales, 'products');
  if (cbSales && cbSales.count !== null && salesCount !== cbSales.count){
    fails.push(`Sales counts total ${salesCount} but Cashbook Sales says ${cbSales.count}`);
  }

  const inflow = ftTotalOf(rec.nonrev, 'vouchers sold and topped up') + ftTotalOf(rec.nonrev, 'paid into account');
  const cbNon  = ftFind(rec.cashbook, 'non revenue sales');
  if (cbNon && !ftNear(inflow, cbNon.total)){
    fails.push(`vouchers sold + paid into account is ${inflow.toFixed(2)} but Cashbook Non-Revenue Sales is ${(cbNon.total || 0).toFixed(2)}`);
  }

  return fails;
}

// ── ROW BUILD ─────────────────────────────────────────────────

function ftBuildRow(rec, sourceFile, checksPassed){
  const num = v => (v === null || v === undefined ? 0 : v);
  const s = k => ftFind(rec.sales,   k) || {};
  const n = k => ftFind(rec.nonrev,  k) || {};
  const p = k => ftFind(rec.payouts, k) || {};
  const v = i => rec.vat[i] || {};
  const pay = key => {
    const hit = Object.keys(rec.payments).find(k => ftKey(k) === key);
    return hit ? rec.payments[hit] : 0;
  };

  return {
    branch: rec.branch, date: rec.date,

    services_count: num(s('services').count), services_net:   num(s('services').net),
    services_vat:   num(s('services').vat),   services_total: num(s('services').total),
    courses_count:  num(s('courses sold').count), courses_net:   num(s('courses sold').net),
    courses_vat:    num(s('courses sold').vat),   courses_total: num(s('courses sold').total),
    products_count: num(s('products').count), products_net:   num(s('products').net),
    products_vat:   num(s('products').vat),   products_total: num(s('products').total),
    sales_net: num(s('total').net), sales_vat: num(s('total').vat), sales_total: num(s('total').total),

    vouchers_sold_count:     num(n('vouchers sold and topped up').count),
    vouchers_sold_total:     num(n('vouchers sold and topped up').total),
    paid_into_account_count: num(n('paid into account').count),
    paid_into_account_total: num(n('paid into account').total),
    vouchers_used_count:     num(n('vouchers used').count),
    vouchers_used_total:     num(n('vouchers used').total),
    memberships_used_count:  num(n('memberships used').count),
    memberships_used_total:  num(n('memberships used').total),
    account_used_count:      num(n('account used').count),
    account_used_total:      num(n('account used').total),
    non_revenue_total:       num(n('total').total),

    sundries_count: num(p('sundries').count), sundries_total: num(p('sundries').total),

    pay_cash:       pay('cash net of sundries'),
    pay_card:       pay('card debit credit tabby'),
    pay_stripe:     pay('stripe'),
    pay_tabby_link: pay('tabby link'),
    payment_types:  rec.payments,
    total_banked:   rec.totalBanked,
    cashbook:       rec.cashbook,

    vat_service_net: num(v(0).net), vat_service_vat: num(v(0).vat), vat_service_total: num(v(0).total),
    vat_product_net: num(v(1).net), vat_product_vat: num(v(1).vat), vat_product_total: num(v(1).total),

    source_file: sourceFile || null,
    checks_passed: checksPassed,
  };
}

// A day the branch did not open: no sales, no counts, nothing banked. Account
// movement alone is not enough, since that is back-office activity on a shut
// door and the day still reads as closed to everyone looking at the strip.
function ftIsClosed(row){
  return row.sales_total === 0 && row.total_banked === 0 &&
         row.services_count === 0 && row.courses_count === 0 && row.products_count === 0;
}

// ── UPLOAD PORTAL TAB ─────────────────────────────────────────
// Reuses sb, BRANCHES, BRANCH_KEYS from upload.js and the shared progress and
// closed-day helpers from phorest-staff.js, so load order stays: upload.js,
// phorest-staff.js, then this.

let ftPdfQueue = [];

const FT_BACKFILL_START = '2025-01-01';        // mirrors SP_BACKFILL_START
const FT_BRANCH_END = { FRT: '2026-05-22' };   // Fratelli closed; same date the other feeds use
const FT_PAGE_SIZE = 1000;

// Phorest's own exported filenames don't match our branch labels 1:1, so the
// same overrides the Staff Performance uploader keeps apply here.
const FT_PDF_FILENAME_SLUGS = { SAA:'saadiyat', KCA:'khalifa-city', MC:'motor-city', AQ:'al-quoz' };

function ftBranchFromFilename(filename){
  const lower = String(filename).toLowerCase();
  return BRANCH_KEYS.find(code => {
    const slug = FT_PDF_FILENAME_SLUGS[code] || BRANCHES[code].name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return lower.startsWith(slug + '-');
  }) || null;
}

function ftDateFromFilename(filename){
  const m = String(filename).match(/(\d{4}-\d{2}-\d{2})\.pdf$/i);
  return m ? m[1] : null;
}

function ftQueuePdfFiles(fileList){
  ftPdfQueue = ftPdfQueue.concat(Array.from(fileList));
  const el = document.getElementById('finPdfQueueCount');
  if (el) el.textContent = ftPdfQueue.length ? `${ftPdfQueue.length} file(s) queued` : 'No files queued';
}

function ftPdfRowHtml(filename, ok, msg){
  return `<div class="sp-pdf-row"><span class="fn">${filename}</span><span class="status ${ok ? 'ok' : 'bad'}">${msg}</span></div>`;
}

async function handleFinPdfBatch(){
  const btn = document.getElementById('finPdfParseBtn');
  const resultsEl = document.getElementById('finPdfResults');
  if (!ftPdfQueue.length){ resultsEl.innerHTML = ftPdfRowHtml('—', false, 'No files queued.'); return; }

  btn.disabled = true;
  const files = ftPdfQueue.slice();
  ftPdfQueue = [];
  document.getElementById('finPdfQueueCount').textContent = 'No files queued';
  document.getElementById('finPdfInput').value = '';

  const statuses = files.map(f => ({ name: f.name, ok: true, msg: 'Parsing…' }));
  const render = () => { resultsEl.innerHTML = statuses.map(s => ftPdfRowHtml(s.name, s.ok, s.msg)).join(''); };
  render();

  for (let idx = 0; idx < files.length; idx++){
    const file = files[idx];
    try {
      spGuardReportKind('financial', { filename: file.name });
      const branch = ftBranchFromFilename(file.name);
      if (!branch) throw new Error("Could not match filename to a branch — expected it to start with the branch name (e.g. 'motor-city-').");
      const filenameDate = ftDateFromFilename(file.name);

      const rows = await ftExtractRows(file);
      spGuardReportKind('financial', { text: rows.map(ftRowText).join(' ') });
      const rec = ftParseRows(rows, branch);
      if (filenameDate && filenameDate !== rec.date){
        throw new Error(`Filename says ${filenameDate} but the report content says ${rec.date} — skipped, please check this file.`);
      }

      // The report's own four identities decide whether this is written at all.
      // A failure is a bad parse rather than an unusual day, so nothing is saved
      // and the file stays in the list to be looked at.
      const fails = ftChecks(rec);
      if (fails.length) throw new Error(`The report does not add up as parsed, so nothing was saved: ${fails.join('; ')}.`);

      const row = ftBuildRow(rec, file.name, true);
      // One row per branch-day, so upsert rather than the delete-then-insert the
      // per-employee feeds need. No window where the day is briefly missing.
      const { error } = await sb.from(FT_TABLE).upsert(row, { onConflict: 'branch,date' });
      if (error) throw error;

      const closed = ftIsClosed(row);
      if (closed) await spRecordClosedDay(branch, rec.date, 'financial totals');

      statuses[idx] = { name: file.name, ok: true, msg: closed
        ? `Saved — ${BRANCHES[branch].name}, ${rec.date}, closed (no trading)`
        : `Saved — ${BRANCHES[branch].name}, ${rec.date}, banked ${row.total_banked.toLocaleString('en-AE', { minimumFractionDigits: 2 })}` };
    } catch(e){
      statuses[idx] = { name: file.name, ok: false, msg: e.message || String(e) };
    }
    render();
  }

  btn.disabled = false;
  await refreshFinProgress();
}

function initFinPdfDrop(){
  const drop = document.getElementById('finPdfDrop');
  if (!drop || drop.dataset.wired) return;
  drop.dataset.wired = '1';
  ['dragover','dragenter'].forEach(evt => drop.addEventListener(evt, e => { e.preventDefault(); drop.classList.add('dragover'); }));
  ['dragleave','drop'].forEach(evt => drop.addEventListener(evt, e => { e.preventDefault(); drop.classList.remove('dragover'); }));
  drop.addEventListener('drop', e => {
    const files = Array.from(e.dataTransfer.files || []).filter(f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
    if (files.length) ftQueuePdfFiles(files);
  });
}

// ── PROGRESS ──────────────────────────────────────────────────

async function refreshFinProgress(){
  const host = document.getElementById('finProgressGrid');
  if (!host) return;
  host.innerHTML = '<div style="font-size:14px;color:var(--muted2);padding:8px 0">Loading…</div>';

  // Paged for the same reason the other feeds are: PostgREST caps an
  // unpaginated select at its own max-rows, and a five-branch backfill of
  // daily rows clears that on its own.
  const { count, error: countErr } = await sb.from(FT_TABLE).select('id', { count:'exact', head:true });
  if (countErr){ host.innerHTML = `<div style="font-size:14px;color:var(--bad)">Failed to load progress: ${countErr.message}</div>`; return; }
  const pages = [];
  for (let offset = 0; offset < (count || 0); offset += FT_PAGE_SIZE){
    pages.push(sb.from(FT_TABLE).select('branch,date,checks_passed').range(offset, offset + FT_PAGE_SIZE - 1));
  }
  const results = await Promise.all(pages);
  const failed = results.find(r => r.error);
  if (failed){ host.innerHTML = `<div style="font-size:14px;color:var(--bad)">Failed to load progress: ${failed.error.message}</div>`; return; }
  const all = results.flatMap(r => r.data || []);

  // One row per branch-day, so the rows themselves are the covered set. A row
  // whose checks did not pass is deliberately NOT counted: it needs re-uploading,
  // and a green square would hide that.
  const covered = new Set(all.filter(r => r.checks_passed !== false).map(r => `${r.branch}|${r.date}`));

  await spLoadClosedDays();

  spProgBeginBatch();
  let html = '';
  for (const code of BRANCH_KEYS){
    const days = spGetBackfillDays(FT_BACKFILL_START, FT_BRANCH_END[code]);
    html += spRenderBackfillStrips(BRANCHES[code].name, days, covered, d => `${code}|${spIsoDate(d)}`);
  }
  host.innerHTML = html;
  spProgEndBatch('finProgressGrid');

  const suspect = all.filter(r => r.checks_passed === false);
  const warn = document.getElementById('finChecksWarn');
  if (warn){
    warn.innerHTML = suspect.length
      ? `<strong>${suspect.length} day${suspect.length === 1 ? '' : 's'} stored with failing checks.</strong> ` +
        'These are parse problems rather than odd days, so re-upload them: ' +
        suspect.slice(0, 12).map(r => `${r.branch} ${r.date}`).join(', ') + (suspect.length > 12 ? ', …' : '')
      : '';
    warn.style.display = suspect.length ? 'block' : 'none';
  }

  spRenderTodayStrip('finTodayStrip', 'tabPipFin', 'fin', BRANCH_KEYS.map(code => ({
    label: BRANCHES[code].name,
    in: covered.has(`${code}|${spIsoDate(new Date())}`),
    ended: !!(FT_BRANCH_END[code] && spIsoDate(new Date()) > FT_BRANCH_END[code]),
  })));

  if (typeof updStamp === 'function') updStamp('fin');
}

function initFinTab(){
  initFinPdfDrop();
  refreshFinProgress();
}
