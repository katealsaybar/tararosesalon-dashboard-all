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
  { code: 'FRT', label: 'Fratelli', end: '2026-05-22' },
];
// Opened to 2025 so last year's Phorest PDFs land in the same backfill grid.
// Browse defaults to THIS MONTH, not 1 Jan: the year is ~7,900 rows to fetch and
// group before anything appears, and the month is about seventy. Wider windows
// are one chip away, and the chips can never reach 2025 by accident the way a
// From date typed by hand could (Kate, 2026-09-04, replacing the 1 Jan default
// set the day before).
const SP_BACKFILL_START = '2025-01-01';
function spMonthStartIso(){ const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; }

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

// Distinctive substrings of Phorest's salon header line per branch. Used only as
// a mismatch GUARD, not to auto-detect the branch: the header format is too
// inconsistent to parse positively (so branch stays a manual selection / filename
// match), but a DIFFERENT branch's marker showing up in the header is reliable
// evidence of a mixed-up paste box or misnamed PDF — that's what let three days
// of Saadiyat and Motor City reports swap places silently on 10 Aug 2026.
const SP_BRANCH_MARKERS = { SAA: 'branch 2', KCA: 'llc-spc', MC: 'motor city', AQ: 'al quoz', FRT: 'fratelli' };

function spDetectMarkerBranch(text){
  const t = (text || '').toLowerCase();
  for (const code of Object.keys(SP_BRANCH_MARKERS)){
    if (t.includes(SP_BRANCH_MARKERS[code])) return code;
  }
  return null;
}

// "Rovina Jordan (A)" becomes "Rovina Jordan". Only a trailing marker, so a name that
// genuinely contains a bracket is left alone.
function spStripArchived_(name){
  return str_(name).replace(/\s*\(A\)$/, '').trim();
}

function spBranchLabel(code){
  const b = SP_BRANCHES.find(x => x.code === code);
  return b ? b.label : code;
}

function spGuardBranchMismatch(headerText, branchCode){
  const markerBranch = spDetectMarkerBranch(headerText);
  if (markerBranch && branchCode && markerBranch !== branchCode){
    throw new Error(`This report's header says ${spBranchLabel(markerBranch)} but it is about to be saved as ${spBranchLabel(branchCode)} — wrong box or misnamed file. Skipped, nothing saved.`);
  }
}

// ── WRONG-REPORT GUARD ────────────────────────────────────────
// Staff Performance Overview, Staff Utilisation and Financial Totals export
// under filenames that differ by one word ("al-quoz-staff-performance-...pdf"
// vs "al-quoz-staff-utilisation-...pdf" vs "al-quoz-financial-totals-...pdf"),
// and ALL carry a
// "DD/MM/YY - DD/MM/YY" date line, a salon header and a "Total" row. So a
// utilisation report dropped into the Staff Performance uploader clears every
// existing check and parses far enough to write nonsense rows rather than
// failing. Gate on report type before anything is parsed or saved.
const SP_REPORT_KINDS = {
  performance: {
    label: 'Staff Performance Overview', section: 'Staff Performance',
    file: /-staff-performance-/i, title: /staff\s+performance\s+overview/i,
  },
  utilisation: {
    label: 'Staff Utilisation', section: 'Utilisation',
    file: /-staff-utilisation-/i, title: /staff\s+utilisation/i,
  },
  financial: {
    label: 'Financial Totals', section: 'Financial Totals',
    file: /-financial-totals-/i, title: /financial\s+totals/i,
  },
};

// `expected` is the uploader's own kind. Filename is the reliable signal (both
// conventions are machine-generated by bulk_download.py); the report title is a
// backstop for pasted text and hand-renamed files. Both tests demand the OTHER
// kind's marker AND the absence of this one's, so an ambiguous read stays quiet
// and lets the normal parser have its say.
function spGuardReportKind(expected, { filename, text } = {}){
  const want = SP_REPORT_KINDS[expected];
  for (const kind of Object.keys(SP_REPORT_KINDS)){
    if (kind === expected) continue;
    const other = SP_REPORT_KINDS[kind];
    const byName = filename && other.file.test(filename) && !want.file.test(filename);
    const byText = text && other.title.test(text) && !want.title.test(text);
    if (byName || byText){
      throw new Error(`This is a ${other.label} report, but this is the ${want.section} uploader — upload it in the ${other.section} section instead. Skipped, nothing saved.`);
    }
  }
}

function spParseOneBlock(lines, branchCode){
  if (!lines.length) throw new Error('Empty report block.');

  // Phorest's salon/company header line format differs per branch (dash-wrapped,
  // legal-entity suffix, plain prefix, etc.) — too inconsistent to parse a branch
  // name out of reliably, so branch is a manual selection. Located here only to
  // strip it out of the data block below, plus a wrong-branch marker check.
  const salonLine = lines.find(l => /salon/i.test(l));
  spGuardBranchMismatch(salonLine, branchCode);
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
    // Phorest marks an archived staff member by hanging "(A)" on the end of the name, and this
    // report leaves it there while the Staff Utilisation parser strips it. Same person, two
    // spellings across the two tables, and the dashboard joins them BY NAME: 3,383 rows and 38
    // people were parked out of reach of their own utilisation hours. Stripped here too, so the
    // two agree. The archived fact itself is not lost - staff_utilisation carries it in its own
    // is_archived column (Kate, 4 Sep 2026).
    const name = spStripArchived_(nameParts.join(' '));

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

  return { branch: branchCode, date: dateFrom, employees, totals, closed: spRecIsClosed(employees, totals) };
}

// The same shape the parser has always tolerated, now named: no employee rows at
// all and a Total line of nothing but zeros is a day the branch did not open.
// This report stores fine either way, so the day was never a gap here the way it
// was on Utilisation. Recording it is still worth doing twice over: the grid can
// show it as closed rather than as a captured day, and because a closure belongs
// to the branch and not to one feed, a performance PDF read for a shut day also
// stops Utilisation and Ledgers chasing that day. Every branch-day of 2025 has a
// performance PDF downloaded, and Utilisation is the feed with the holes
// (Kate, 2026-09-04).
const SP_TOTAL_MONEY_FIELDS = ['servicesExVat','servicesTotal','coursesExVat','coursesTotal',
  'productsExVat','productsTotal','totalExVat','totalTotal'];

function spRecIsClosed(employees, totals){
  if (employees.length || !totals) return false;
  return SP_TOTAL_MONEY_FIELDS.every(f => !totals[f]);
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
        <button class="btn-outline" onclick="document.getElementById('spBox_${b.code}').value=''; document.getElementById('spBoxMsg_${b.code}').textContent=''; trCountFilledBoxes()">Clear</button>
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
    spGuardReportKind('performance', { text: raw });
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

    const closedDays = oks.filter(o => o.rec.closed);
    for (const { rec } of closedDays){
      await spRecordClosedDay(code, spToISODate(rec.date), 'staff performance');
    }

    const daysList = oks.map(o => o.rec.date).join(', ');
    let msg = `Saved ${oks.length} day${oks.length===1?'':'s'} (${allRows.length} rows): ${daysList}.`;
    if (closedDays.length) msg += ` ${closedDays.length} of them closed (no trading).`;
    if (fails.length) msg += ` — ${fails.length} report(s) failed: ` + fails.map(f => `#${f.blockIndex+1} (${f.error})`).join('; ');

    spShowBoxMsg(code, msg, fails.length === 0);
    if (!fails.length && textarea){ textarea.value = ''; trCountFilledBoxes(); }
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

function spGetBackfillDays(startDate, endDate){
  const days = [];
  const start = new Date((startDate || SP_BACKFILL_START) + 'T00:00:00');
  const today = new Date();
  today.setHours(0,0,0,0);
  const end = endDate ? new Date(endDate + 'T00:00:00') : today;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate()+1)){
    days.push(new Date(d));
  }
  return days;
}

async function refreshStaffPerfProgress(){
  const host = document.getElementById('spProgressGrid');
  if (!host) return;
  host.innerHTML = '<div style="font-size:14px;color:var(--muted2);padding:8px 0">Loading…</div>';

  // PostgREST silently caps an unpaginated select at its server-side max-rows
  // setting (1000 here) — the is_total rows crossed that in Aug 2026 (one per
  // branch per day), so days beyond the cap read as missing even though their
  // data is really there. Page through with .range() like runStaffPerfFilter.
  // Counted first, then every page at once — in series this was four round
  // trips before the strips could draw, on the segment that now opens by
  // default (Kate, 2026-09-03).
  const { count, error: countErr } = await sb.from(SP_TABLE).select('id',{count:'exact',head:true}).eq('is_total', true);
  if (countErr){ host.innerHTML = `<div style="font-size:14px;color:var(--bad)">Failed to load progress: ${countErr.message}</div>`; return; }
  const pages = [];
  for (let offset = 0; offset < (count || 0); offset += SP_PAGE_SIZE){
    pages.push(sb.from(SP_TABLE).select('branch,date').eq('is_total', true).range(offset, offset + SP_PAGE_SIZE - 1));
  }
  const results = await Promise.all(pages);
  const failed = results.find(r => r.error);
  if (failed){ host.innerHTML = `<div style="font-size:14px;color:var(--bad)">Failed to load progress: ${failed.error.message}</div>`; return; }
  const all = results.flatMap(r => r.data || []);

  const covered = new Set(all.map(r => `${r.branch}|${r.date}`));

  await spLoadClosedDays();

  spProgBeginBatch();
  let html = '';
  for (const b of SP_BRANCHES){
    const days = spGetBackfillDays(b.start, b.end);
    html += spRenderBackfillStrips(b.label, days, covered, d => `${b.code}|${spIsoDate(d)}`);
  }
  host.innerHTML = html;
  spProgEndBatch('spProgressGrid');
  spRenderTodayStrip('spTodayStrip', 'tabPipStaffperf', 'staffperf', SP_BRANCHES.map(b => ({
    label: b.label,
    in: covered.has(`${b.code}|${spIsoDate(new Date())}`),
    ended: !!(b.end && spIsoDate(new Date()) > b.end),
  })));
  // The card is drawn, so this is the line the watch measures against from
  // here: your own upload never announces itself back to you.
  if (typeof updStamp === 'function') updStamp('staffperf');
}

// One row per calendar year, newest on top, and each year is 12 month blocks
// rather than 365 day cells: a year of the old 6px cells came to 2,190px, so
// every year row grew its own sideways scrollbar and a whole year was never
// visible at once. A block's fill is that month's share of captured days
// (green = complete, amber = partial, empty = nothing yet) and clicking it
// opens the actual days underneath, so the day-level truth is one click away
// instead of being the default. The branch line keeps the all-years count and
// the earliest gap, so backfilling still runs oldest first. Shared with the
// Utilisation tab, which loads after this file (Kate, 2026-09-03).
const SP_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Days the group does not trade. Nothing was captured because nothing happened,
// so they are not gaps: they come out of every denominator, they never become
// the oldest gap, and Copy missing dates leaves them off the list. Otherwise
// Khalifa's "oldest gap 01/01/2025" would have stood for ever and sent someone
// looking for a report that was never run. Group-wide and 1 January only
// (Kate, 2026-09-04) — add a date here and every strip picks it up.
const SP_CLOSED_DAYS = [{ month: 0, date: 1, why: "New Year's Day" }];

function spClosedDay(d){
  return SP_CLOSED_DAYS.find(c => c.month === d.getMonth() && c.date === d.getDate()) || null;
}

// The one-off closures, which are per branch and on no calendar: a Tuesday in
// June that Khalifa did not open. Phorest still produces a report for such a
// day, but it has no staff rows at all and its Total line reads 00:00 / 00:00 /
// 0.0%, so it could not be stored and the day stayed amber for ever. The
// uploader now recognises that shape and records the day here instead
// (migrations/create_closed_days.sql, Kate, 2026-09-04).
//
// Keyed exactly like the coverage sets the strips already carry, BRANCH|ISO, so
// a strip can ask about a day with the keyOf it was handed.
const SP_CLOSED_TABLE = 'closed_days';
let spClosedByKey = new Map();
let spClosedLoadFailed = false;

async function spLoadClosedDays(){
  const { data, error } = await sb.from(SP_CLOSED_TABLE).select('branch,date,why');
  if (error){
    // The table may not exist yet. Nothing breaks: every day just reads as open,
    // which is exactly how the strips behaved before this existed.
    if (!spClosedLoadFailed) console.warn('closed_days not readable, treating every day as open:', error.message);
    spClosedLoadFailed = true;
    return;
  }
  spClosedLoadFailed = false;
  spClosedByKey = new Map((data || []).map(r => [`${r.branch}|${r.date}`, r.why || 'no trading']));
}

// One row per branch-day, so re-reading the same report is harmless. Shared with
// the utilisation uploader, which recognises its own report's closed shape.
async function spRecordClosedDay(branchCode, isoDate, source){
  const { error } = await sb.from(SP_CLOSED_TABLE)
    .upsert({ branch: branchCode, date: isoDate, why: 'no trading', detected_from: source },
            { onConflict: 'branch,date' });
  if (error) throw new Error(`Read as a closed day, but could not record it: ${error.message}`);
}

// Both rules in one answer: the group-wide calendar, then the recorded one-offs.
function spClosedReason(d, keyOf){
  const fixed = spClosedDay(d);
  if (fixed) return fixed;
  const why = keyOf ? spClosedByKey.get(keyOf(d)) : null;
  return why ? { why } : null;
}

// The day panel and "Copy missing dates" both need the covered set and the
// branch's own key function after render, so each strip parks them here under
// an id the markup carries. spProgBeginBatch/EndBatch scope one card's strips
// together and drop the previous render's entries.
const spProg = {};
const spProgByHost = {};
let spProgBatch = [];
let spProgSeq = 0;

function spProgBeginBatch(){ spProgBatch = []; }
function spProgEndBatch(hostId){
  (spProgByHost[hostId] || []).forEach(uid => { delete spProg[uid]; });
  spProgByHost[hostId] = spProgBatch.slice();
  spProgBatch = [];
  spRenderMissingList(hostId);
}

function spRenderBackfillStrips(label, days, covered, keyOf){
  const uid = 'pg' + (++spProgSeq);
  spProg[uid] = { label, days, covered, keyOf };
  spProgBatch.push(uid);

  const open = days.filter(d => !spClosedReason(d, keyOf));
  const doneDays = open.filter(d => covered.has(keyOf(d)));
  const firstMissing = open.find(d => !covered.has(keyOf(d)));
  const byYear = new Map();
  days.forEach(d => { const y = d.getFullYear(); if (!byYear.has(y)) byYear.set(y, []); byYear.get(y).push(d); });
  const years = [...byYear.keys()].sort((a,b) => b-a);

  return `<div class="sp-prog-branch">
      <div class="sp-prog-head">
        <span class="sp-prog-name">${label}</span>
        <span class="sp-prog-meta">${doneDays.length}/${open.length} days${firstMissing ? ' · oldest gap <b>'+firstMissing.toLocaleDateString('en-GB')+'</b>' : ' · <b class="ok">fully captured</b>'}</span>
      </div>` +
    years.map(y => {
      const yDays = byYear.get(y);
      const yOpen = yDays.filter(d => !spClosedReason(d, keyOf));
      const yDone = yOpen.filter(d => covered.has(keyOf(d))).length;
      // Counted per month rather than assumed 28-31, so a branch whose range
      // starts or ends mid-month (FRT) shows that month's real denominator, and
      // a closed day is counted as closed rather than as a day to chase.
      const months = Array.from({length:12}, () => ({ total:0, done:0, closed:0 }));
      yDays.forEach(d => {
        const m = months[d.getMonth()];
        if (spClosedReason(d, keyOf)){ m.closed++; return; }
        m.total++;
        if (covered.has(keyOf(d))) m.done++;
      });
      return `<div class="sp-yr">
        <span class="sp-yr-lbl"><b>${y}</b> ${yDone}/${yOpen.length}</span>
        <div class="sp-mo-grid">` +
        months.map((m, i) => {
          if (!m.total){
            const why = m.closed ? 'closed all month' : "outside this branch's range";
            return `<button class="sp-mo" disabled title="${SP_MONTHS[i]} ${y} — ${why}"><div class="sp-mo-bar"></div><span class="sp-mo-lbl">${SP_MONTHS[i][0]}</span></button>`;
          }
          const pct = Math.round(m.done / m.total * 100);
          const closedNote = m.closed ? ` · ${m.closed} closed` : '';
          return `<button class="sp-mo" onclick="spOpenProgMonth(this,'${uid}',${y},${i})" title="${SP_MONTHS[i]} ${y} — ${m.done}/${m.total} days${closedNote}${m.done === m.total ? '' : ' · click for the days'}">
            <div class="sp-mo-bar">${m.done ? `<div class="sp-mo-fill${pct === 100 ? '' : ' part'}" style="width:${pct}%"></div>` : ''}</div>
            <span class="sp-mo-lbl">${SP_MONTHS[i][0]}</span></button>`;
        }).join('') +
        `</div></div><div class="sp-mo-days" id="${uid}-days-${y}"></div>`;
    }).join('') +
    '</div>';
}

// Opens one month's days under its year row. One panel open at a time per card,
// and clicking the open month closes it again.
function spOpenProgMonth(btn, uid, year, monthIdx){
  const st = spProg[uid];
  const box = document.getElementById(`${uid}-days-${year}`);
  if (!st || !box) return;

  const wasOpen = btn.classList.contains('open');
  const card = btn.closest('.upload-card') || document;
  card.querySelectorAll('.sp-mo.open').forEach(b => b.classList.remove('open'));
  card.querySelectorAll('.sp-mo-days.show').forEach(d => { d.classList.remove('show'); d.innerHTML = ''; });
  if (wasOpen) return;

  btn.classList.add('open');
  const mDays  = st.days.filter(d => d.getFullYear() === year && d.getMonth() === monthIdx);
  const mOpen  = mDays.filter(d => !spClosedReason(d, st.keyOf));
  const done   = mOpen.filter(d => st.covered.has(st.keyOf(d))).length;
  const closed = mDays.length - mOpen.length;
  box.innerHTML = `<div class="sp-mo-days-title"><b>${SP_MONTHS[monthIdx]} ${year}</b> · ${st.label} · ${done} of ${mOpen.length} days captured${closed ? ` · ${closed} closed` : ''}</div>
    <div class="sp-day-strip">` +
    mDays.map(d => {
      const shut = spClosedReason(d, st.keyOf);
      const ok   = st.covered.has(st.keyOf(d));
      const lbl  = d.toLocaleDateString('en-GB', { weekday:'long', day:'2-digit', month:'short', year:'numeric' });
      if (shut) return `<div class="sp-day-cell closed" title="${lbl} — closed, ${shut.why}">${d.getDate()}</div>`;
      return `<div class="sp-day-cell${ok ? ' done' : ''}" title="${lbl}${ok ? '' : ' — missing'}">${ok ? '' : d.getDate()}</div>`;
    }).join('') +
    '</div>';
  box.classList.add('show');
}

// Every gap in one card, oldest first, straight to the clipboard — so a
// backfill session can work off a list instead of hunting amber blocks.
function spCopyMissingDates(hostId){
  const lines = [];
  let total = 0;
  (spProgByHost[hostId] || []).forEach(uid => {
    const st = spProg[uid];
    if (!st) return;
    const miss = st.days.filter(d => !spClosedReason(d, st.keyOf) && !st.covered.has(st.keyOf(d)));
    if (!miss.length) return;
    total += miss.length;
    lines.push(`${st.label} (${miss.length}): ${miss.map(spIsoDate).join(', ')}`);
  });
  if (!total){ showToast('No missing days — fully captured'); return; }
  navigator.clipboard.writeText(lines.join('\n'))
    .then(() => showToast(`Copied ${total} missing date${total === 1 ? '' : 's'}`))
    .catch(() => showToast('Could not reach the clipboard'));
}

// The same gaps on the page instead of only on the clipboard, because a month
// block says a month is amber without saying which days (Kate, 2026-09-04). One
// card's strips, oldest first, grouped branch → month so 300 backfill days read
// as a dozen lines. Folded by default and dropped from the DOM when folded, so
// the three cards that share this cost nothing until someone opens one.
function spMissingByHost(hostId){
  const out = [];
  (spProgByHost[hostId] || []).forEach(uid => {
    const st = spProg[uid];
    if (!st) return;
    const miss = st.days.filter(d => !spClosedReason(d, st.keyOf) && !st.covered.has(st.keyOf(d)));
    if (miss.length) out.push({ label: st.label, miss });
  });
  return out;
}

function spRenderMissingList(hostId){
  const box = document.getElementById(`${hostId}Missing`);
  const btn = document.getElementById(`${hostId}MissingBtn`);
  if (!box) return;
  const groups = spMissingByHost(hostId);
  const total  = groups.reduce((n, g) => n + g.miss.length, 0);
  const shown  = box.classList.contains('show');
  if (btn) btn.textContent = `${shown ? 'Hide' : 'Show'} missing dates${total ? ` (${total})` : ''}`;
  if (!shown){ box.innerHTML = ''; return; }
  if (!total){ box.innerHTML = '<div class="sp-miss-empty">Nothing missing — fully captured.</div>'; return; }
  box.innerHTML = groups.map(g => {
    const byMonth = new Map();
    g.miss.forEach(d => {
      const k = `${d.getFullYear()}-${d.getMonth()}`;
      if (!byMonth.has(k)) byMonth.set(k, []);
      byMonth.get(k).push(d);
    });
    return `<div class="sp-miss-grp">
        <div class="sp-miss-hd">${g.label}<span>${g.miss.length} missing</span></div>` +
      [...byMonth.values()].map(ds => `<div class="sp-miss-row">
          <span class="sp-miss-mo">${SP_MONTHS[ds[0].getMonth()]} ${ds[0].getFullYear()}</span>
          <span class="sp-miss-days">${ds.map(d => String(d.getDate()).padStart(2, '0')).join(', ')}</span>
        </div>`).join('') +
      `</div>`;
  }).join('');
}

function spToggleMissingList(hostId){
  const box = document.getElementById(`${hostId}Missing`);
  if (!box) return;
  box.classList.toggle('show');
  spRenderMissingList(hostId);
}

// ── BROWSE / FILTER ──────────────────────────────────────────

function spSetDefaultFilterDates(force){
  const fromEl = document.getElementById('spfFrom');
  const toEl   = document.getElementById('spfTo');
  if (!fromEl || !toEl) return;
  if (force || !fromEl.value) fromEl.value = spMonthStartIso();
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
  trResetChips('staffperf','spf');
  document.getElementById('spfBranch').value = '';
  document.getElementById('spfStylist').value = '';
  spSetDefaultFilterDates(true);
  spLastData = [];
  spCapWarning = false;
  spColFilters = {};
  spCloseColFilter();
  document.getElementById('spTableHost').innerHTML =
    '<div style="padding:16px;font-size:14px;color:var(--muted2)">Pick a filter and click Apply — showing everything by default can be slow once the backfill fills up.</div>';
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
const SP_RENDER_CAP = 2000;
let spShowAllRows = false;

function spRenderAllRows(){
  spShowAllRows = true;
  spRenderTable();
}

// Client-count columns show whole numbers — every other numeric column is
// money (AED) and keeps 2 decimals.
const SP_COUNT_FIELDS = new Set(['visits','new_clients','rqs']);
function spFmt(v, key){
  if (typeof v !== 'number') return v ?? '';
  const d = key && SP_COUNT_FIELDS.has(key) ? 0 : 2;
  return TR_NUM_FMT[d].format(v);
}

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

// ── PER-COLUMN VALUE FILTER (Excel/Sheets-style "pick which values show") ──
let spColFilters = {};       // colKey -> Set of allowed values; missing key = no filter
let spColFilterKey = null;   // column currently open in the popover
let spColFilterPanel = null; // the floating DOM node, created on demand
let spColFilterPending = null; // Set being edited while the popover is open
let spColFilterSearchTxt = '';

function spColFilterActive(key){ return Object.prototype.hasOwnProperty.call(spColFilters, key); }

// Rows matching every active filter except `exceptKey` — lets a column's own
// dropdown show values still reachable given the *other* filters, the way
// Excel narrows its filter lists as you filter more columns.
function spColFilterRows(rows, exceptKey){
  const keys = Object.keys(spColFilters).filter(k => k !== exceptKey);
  if (!keys.length) return rows;
  return rows.filter(row => keys.every(k => spColFilters[k].has(spFmt(row[k], k))));
}

function spColValueDomain(key){
  const vals = new Set(spColFilterRows(spLastData, key).map(r => spFmt(r[key], key)));
  return [...vals].sort((a,b) => a.localeCompare(b, undefined, {numeric:true, sensitivity:'base'}));
}

function spEsc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function spOpenColFilter(e, key){
  e.stopPropagation();
  if (spColFilterKey === key){ spCloseColFilter(); return; }
  spCloseColFilter();
  spColFilterKey = key;
  const domain = spColValueDomain(key);
  spColFilterPending = new Set(spColFilterActive(key) ? spColFilters[key] : domain);
  spColFilterSearchTxt = '';

  const panel = document.createElement('div');
  panel.className = 'sp-colval-panel';
  panel.id = 'spColValPanel';
  panel.innerHTML =
    '<input type="text" class="sp-colval-search" placeholder="Search…" oninput="spColFilterSearch(this.value)">' +
    '<div class="sp-colval-actions">' +
      '<button class="btn-outline" onclick="spColFilterSelectAll(true)">Select all</button>' +
      '<button class="btn-outline" onclick="spColFilterSelectAll(false)">Clear</button>' +
    '</div>' +
    '<div class="sp-colval-list" id="spColValList"></div>' +
    '<div class="sp-colval-footer"><button class="btn" style="flex:1;padding:6px" onclick="spColFilterApply()">Apply</button></div>';
  document.body.appendChild(panel);
  spColFilterPanel = panel;
  spRenderColFilterList();

  const rect = e.currentTarget.getBoundingClientRect();
  panel.style.top  = (rect.bottom + 4) + 'px';
  panel.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 236)) + 'px';
  panel.querySelector('.sp-colval-search').focus();
}

function spCloseColFilter(){
  if (spColFilterPanel){ spColFilterPanel.remove(); spColFilterPanel = null; }
  spColFilterKey = null;
  spColFilterPending = null;
}

function spRenderColFilterList(){
  const key = spColFilterKey;
  if (!key) return;
  const domain = spColValueDomain(key);
  const q = spColFilterSearchTxt.toLowerCase();
  const shown = q ? domain.filter(v => v.toLowerCase().includes(q)) : domain;
  const list = document.getElementById('spColValList');
  list.innerHTML = shown.length ? shown.map((v,i) =>
    `<label><input type="checkbox" data-idx="${i}" ${spColFilterPending.has(v)?'checked':''}>${v === '' ? '<em>(Blank)</em>' : spEsc(v)}</label>`
  ).join('') : '<div class="sp-colval-empty">No values</div>';
  list.onchange = (e) => {
    if (!e.target.matches('input[type=checkbox]')) return;
    const v = shown[Number(e.target.dataset.idx)];
    if (e.target.checked) spColFilterPending.add(v); else spColFilterPending.delete(v);
  };
}

function spColFilterSearch(v){
  spColFilterSearchTxt = v;
  spRenderColFilterList();
}

function spColFilterSelectAll(checked){
  const q = spColFilterSearchTxt.toLowerCase();
  const domain = spColValueDomain(spColFilterKey);
  const shown = q ? domain.filter(v => v.toLowerCase().includes(q)) : domain;
  shown.forEach(v => checked ? spColFilterPending.add(v) : spColFilterPending.delete(v));
  spRenderColFilterList();
}

function spColFilterApply(){
  const key = spColFilterKey;
  const domain = spColValueDomain(key);
  if (spColFilterPending.size >= domain.length) delete spColFilters[key];
  else spColFilters[key] = new Set(spColFilterPending);
  spCloseColFilter();
  spRenderTable();
}

document.addEventListener('click', (e) => {
  if (spColFilterPanel && !spColFilterPanel.contains(e.target) && !e.target.closest('.sp-th-filter-ic')) {
    spCloseColFilter();
  }
});

function spRenderTable(){
  const host = document.getElementById('spTableHost');
  if (!spLastData.length){
    host.innerHTML = '<div style="padding:16px;font-size:14px;color:var(--muted2)">No matching rows.</div>';
    document.getElementById('spResultCount').textContent = '';
    return;
  }

  const filteredData = spColFilterRows(spLastData);
  const displayRows = spSummaryMode ? spAggregateByEmployee(filteredData) : filteredData;

  // A year of daily rows is ~6,800 rows × 20 columns, and every sort or column
  // filter rebuilt all of it — that is what made the tab feel laggy rather than
  // the query. Render the most recent SP_RENDER_CAP and offer the rest on
  // request; the TOTAL row is still summed over every filtered row, so the
  // arithmetic on screen is the arithmetic of the whole selection
  // (Kate, 2026-09-03).
  const capped = !spSummaryMode && !spShowAllRows && displayRows.length > SP_RENDER_CAP;
  const renderRows = capped ? displayRows.slice(0, SP_RENDER_CAP) : displayRows;

  const countEl = document.getElementById('spResultCount');
  if (spCapWarning){
    countEl.textContent = `Showing first ${SP_ROW_LIMIT} rows — narrow your filters for more precision`;
  } else if (capped){
    countEl.innerHTML = `${displayRows.length} rows · showing the newest ${SP_RENDER_CAP} ` +
      `<button class="btn-outline" style="padding:3px 9px;font-size:12.5px;margin-left:4px" onclick="spRenderAllRows()">Show all</button>`;
  } else {
    countEl.textContent = `${displayRows.length} row${displayRows.length === 1 ? '' : 's'}${spSummaryMode ? ' (summarized per employee)' : ''}`;
  }

  const visibleCols = SP_COLS.filter(c => !spHiddenCols.has(c[1]));

  // Group by branch (canonical SP_BRANCHES order), sorted within each group —
  // mirrors the branch-block layout with a blank row between branches used in the Target Sheet.
  const branchOrder = SP_BRANCHES.map(b => b.code);
  const groups = new Map();
  for (const row of renderRows){
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
    const filtered = spColFilterActive(c[1]);
    return `<th class="sp-th-sort${active?' active':''}"><span class="sp-th-inner">` +
      `<span class="sp-th-label" onclick="spSortBy('${c[1]}')">${c[0]}${arrow}</span>` +
      `<span class="sp-th-filter-ic${filtered?' active':''}" onclick="spOpenColFilter(event,'${c[1]}')" title="Filter values">▾</span>` +
      `</span></th>`;
  }).join('') + '</tr></thead><tbody>';

  const grandTotal = spGrandTotal(displayRows);
  html += '<tr class="is-total">' + visibleCols.map(c => `<td>${spFmt(grandTotal[c[1]], c[1])}</td>`).join('') + '</tr>';

  orderedKeys.forEach((key, gi) => {
    const rows = groups.get(key).slice().sort((a,b) => spCompare(a[spSortCol], b[spSortCol], spSortDir));
    for (const row of rows){
      html += '<tr>' + visibleCols.map(c => `<td>${spFmt(row[c[1]], c[1])}</td>`).join('') + '</tr>';
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
  host.innerHTML = '<div style="padding:16px;font-size:14px;color:var(--muted2)">Loading…</div>';

  const buildQuery = () => {
    let q = sb.from(SP_TABLE).select('*').order('date',{ascending:false}).order('branch').order('employee_name');
    if (branch)  q = q.eq('branch', branch);
    if (from)    q = q.gte('date', from);
    if (to)      q = q.lte('date', to);
    if (stylist) q = q.ilike('employee_name', `%${stylist}%`);
    return q;
  };

  const buildCountQuery = () => {
    let q = sb.from(SP_TABLE).select('id', { count:'exact', head:true });
    if (branch)  q = q.eq('branch', branch);
    if (from)    q = q.gte('date', from);
    if (to)      q = q.lte('date', to);
    if (stylist) q = q.ilike('employee_name', `%${stylist}%`);
    return q;
  };

  // Count first, then fetch every page at once. Walking the pages one awaited
  // request at a time meant a year of Staff Daily (~7,900 rows) cost eight
  // round trips in series before a single row appeared (Kate, 2026-09-03).
  const { count, error: countErr } = await buildCountQuery();
  if (countErr){ host.innerHTML = `<div style="padding:16px;font-size:14px;color:var(--bad)">Query failed: ${countErr.message}</div>`; return; }

  const wanted = Math.min(count || 0, SP_ROW_LIMIT);
  const pages = [];
  for (let offset = 0; offset < wanted; offset += SP_PAGE_SIZE){
    pages.push(buildQuery().range(offset, Math.min(offset + SP_PAGE_SIZE, wanted) - 1));
  }
  const results = await Promise.all(pages);
  const failed = results.find(r => r.error);
  if (failed){ host.innerHTML = `<div style="padding:16px;font-size:14px;color:var(--bad)">Query failed: ${failed.error.message}</div>`; return; }
  const all = results.flatMap(r => r.data || []);

  spCapWarning = all.length >= SP_ROW_LIMIT;
  spLastData = all.slice(0, SP_ROW_LIMIT).filter(row => !row.is_total)
    .map(row => ({...row, employee_name: canonicalStaffName(row.employee_name)}));
  spColFilters = {};
  spShowAllRows = false;
  spRenderTable();
}

// ── INIT ──────────────────────────────────────────────────────

let spBoxesRendered = false;

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
  trCountFilledBoxes();
  refreshStaffPerfProgress();
  if (typeof initStaffPerfPdfDrop === 'function') initStaffPerfPdfDrop();

  // Browse runs when Browse is opened, not on tab load — see trRunBrowseOnce.
}
