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
];
const SP_BACKFILL_START = '2026-01-01';

let spSelectedBranch = '';
let spInitDone = false;

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

  if (!employees.length) throw new Error('No employee rows recognised — the report format may have changed.');

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

// ── UI: PASTE & SAVE ─────────────────────────────────────────

function spRenderBranchPills(){
  const host = document.getElementById('spBranchPills');
  if (!host) return;
  host.innerHTML = SP_BRANCHES.map(b =>
    `<button type="button" class="branch-pill${spSelectedBranch===b.code?' active':''}" onclick="spSelectBranch('${b.code}')">${b.label}</button>`
  ).join('');
}

function spSelectBranch(code){
  spSelectedBranch = code;
  spRenderBranchPills();
}

function spShowMsg(text, ok){
  const el = document.getElementById('spMsg');
  if (!el) return;
  el.textContent = text;
  el.style.color = ok ? 'var(--good)' : 'var(--bad)';
}

async function handleStaffPerfParse(){
  const raw = document.getElementById('spRaw').value;
  try{
    if (!spSelectedBranch) throw new Error('Select a branch first.');
    const results = parseStaffPerformanceBatch(raw, spSelectedBranch);
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
      await sb.from(SP_TABLE).delete().eq('branch', spSelectedBranch).eq('date', d);
    }
    const { error } = await sb.from(SP_TABLE).insert(allRows);
    if (error) throw error;

    const branchLabel = SP_BRANCHES.find(b => b.code === spSelectedBranch)?.label || spSelectedBranch;
    const daysList = oks.map(o => o.rec.date).join(', ');
    let msg = `Saved ${oks.length} day${oks.length===1?'':'s'} (${allRows.length} rows) for ${branchLabel}: ${daysList}.`;
    if (fails.length) msg += ` — ${fails.length} report(s) failed: ` + fails.map(f => `#${f.blockIndex+1} (${f.error})`).join('; ');
    spShowMsg(msg, fails.length === 0);
    if (!fails.length) document.getElementById('spRaw').value = '';
    await refreshStaffPerfProgress();
  } catch(e){
    spShowMsg(e.message || String(e), false);
  }
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
        return `<div class="sp-day-cell${done?' done':''}" title="${d.toLocaleDateString('en-GB')}"></div>`;
      }).join('') +
      '</div></div>';
  }
  host.innerHTML = html;
}

// ── BROWSE / FILTER ──────────────────────────────────────────

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
  document.getElementById('spfFrom').value = '';
  document.getElementById('spfTo').value = '';
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
const SP_ROW_LIMIT = 2000;

function spFmt(v){ return typeof v === 'number' ? v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) : (v ?? ''); }

async function runStaffPerfFilter(){
  const branch  = document.getElementById('spfBranch').value;
  const stylist = document.getElementById('spfStylist').value.trim();
  const from    = document.getElementById('spfFrom').value;
  const to      = document.getElementById('spfTo').value;

  const host = document.getElementById('spTableHost');
  host.innerHTML = '<div style="padding:16px;font-size:12px;color:var(--muted2)">Loading…</div>';

  let q = sb.from(SP_TABLE).select('*').order('date',{ascending:false}).order('branch').order('employee_name').limit(SP_ROW_LIMIT);
  if (branch)  q = q.eq('branch', branch);
  if (from)    q = q.gte('date', from);
  if (to)      q = q.lte('date', to);
  if (stylist) q = q.ilike('employee_name', `%${stylist}%`);

  const { data, error } = await q;
  if (error){ host.innerHTML = `<div style="padding:16px;font-size:12px;color:var(--bad)">Query failed: ${error.message}</div>`; return; }

  document.getElementById('spResultCount').textContent =
    data.length === SP_ROW_LIMIT ? `Showing first ${SP_ROW_LIMIT} rows — narrow your filters for more precision` : `${data.length} rows`;

  if (!data.length){ host.innerHTML = '<div style="padding:16px;font-size:12px;color:var(--muted2)">No matching rows.</div>'; return; }

  let html = '<table class="sp-table"><thead><tr>' + SP_COLS.map(c=>`<th>${c[0]}</th>`).join('') + '</tr></thead><tbody>';
  for (const row of data){
    html += `<tr class="${row.is_total?'is-total':''}">` + SP_COLS.map(c => {
      const val = row[c[1]];
      return `<td>${spFmt(val)}</td>`;
    }).join('') + '</tr>';
  }
  html += '</tbody></table>';
  host.innerHTML = html;
}

// ── INIT ──────────────────────────────────────────────────────

function initStaffPerfTab(){
  spRenderBranchPills();
  spPopulateFilterBranch();
  refreshStaffPerfProgress();
  if (!spInitDone){
    spInitDone = true;
  }
}
