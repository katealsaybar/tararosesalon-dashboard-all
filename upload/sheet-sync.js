/* ============================================================
   TARA ROSE LADIES SALON — sheet-sync.js
   Read-only monitor for branch_staff_daily — the table each branch's
   Google Sheet (_temp_placeholder tab) pushes into directly via Apps
   Script (see /apps-script/push-temp-placeholder-to-supabase.gs).
   Nothing here writes anything; it just shows what's arrived so Kate
   can confirm the sheet → Supabase sync is actually running.
   Uses the shared `sb` client and `BRANCHES`/`BRANCH_KEYS` from upload.js
   — load this script AFTER upload.js.
   ============================================================ */

const SS_TABLE = 'branch_staff_daily';
const SS_COLS = [
  ['Branch','branch'],['Date','date'],['Dept','dept'],['Staff','staff_name'],
  ['NCR','ncr'],['REQ','req'],['Salon','salon'],['New','new_client'],
  ['Rebooked','rebooked'],['Total','total'],['Treatment AED','treatment_aed']
];
const SS_PAGE_SIZE = 1000;
const SS_ROW_LIMIT = 25000;
let ssCapWarning = false;

// ── LAST SYNCED STATUS (per branch) ─────────────────────────
async function refreshSheetSyncStatus(){
  const host = document.getElementById('ssLastSynced');
  if (!host) return;
  host.innerHTML = BRANCH_KEYS.map(k => `
    <div class="sp-branch-box" id="ssStat_${k}">
      <div class="sp-branch-box-title">${BRANCHES[k].name}</div>
      <div style="font-size:12px;color:var(--muted)">Loading…</div>
    </div>`).join('');

  await Promise.all(BRANCH_KEYS.map(async k => {
    const el = document.getElementById(`ssStat_${k}`);
    if (!el) return;
    const [{ data: latest, error: latestErr }, { count, error: countErr }] = await Promise.all([
      sb.from(SS_TABLE).select('date').eq('branch', k).order('date',{ascending:false}).limit(1),
      sb.from(SS_TABLE).select('id',{count:'exact',head:true}).eq('branch', k)
    ]);
    if (latestErr || countErr){
      el.innerHTML = `<div class="sp-branch-box-title">${BRANCHES[k].name}</div><div style="font-size:11px;color:var(--bad)">Failed to load</div>`;
      return;
    }
    const lastDate = latest && latest.length ? latest[0].date : null;
    el.innerHTML = `
      <div class="sp-branch-box-title">${BRANCHES[k].name}</div>
      <div style="font-size:12px;color:${lastDate ? 'var(--good)' : 'var(--muted2)'};margin-top:2px">
        ${lastDate ? '🟢 Last synced: ' + lastDate : '⚪ No data yet'}
      </div>
      <div style="font-size:11px;color:var(--muted)">${count || 0} row${count===1?'':'s'} total</div>`;
  }));
}

// ── BROWSE / FILTER ──────────────────────────────────────────
function ssPopulateFilterBranch(){
  const sel = document.getElementById('ssfBranch');
  if (!sel || sel.dataset.populated) return;
  BRANCH_KEYS.forEach(k => {
    const opt = document.createElement('option');
    opt.value = k; opt.textContent = BRANCHES[k].name;
    sel.appendChild(opt);
  });
  sel.dataset.populated = '1';
}

function ssSetDefaultFilterDates(force){
  const fromEl = document.getElementById('ssfFrom');
  const toEl   = document.getElementById('ssfTo');
  if (!fromEl || !toEl) return;
  const todayIso  = new Date().toISOString().split('T')[0];
  const monthAgo  = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  if (force || !fromEl.value) fromEl.value = monthAgo;
  if (force || !toEl.value)   toEl.value   = todayIso;
}

function resetSheetSyncFilter(){
  document.getElementById('ssfBranch').value = '';
  document.getElementById('ssfStaff').value = '';
  ssSetDefaultFilterDates(true);
  document.getElementById('ssTableHost').innerHTML =
    '<div style="padding:16px;font-size:12px;color:var(--muted2)">Pick a filter and click Apply.</div>';
  document.getElementById('ssResultCount').textContent = '';
}

function ssFmt(v){ return typeof v === 'number' ? v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) : (v ?? ''); }

function ssRenderTable(rows){
  const host = document.getElementById('ssTableHost');
  if (!rows.length){
    host.innerHTML = '<div style="padding:16px;font-size:12px;color:var(--muted2)">No matching rows.</div>';
    document.getElementById('ssResultCount').textContent = '';
    return;
  }
  document.getElementById('ssResultCount').textContent = ssCapWarning
    ? `Showing first ${SS_ROW_LIMIT} rows — narrow your filters for more precision`
    : `${rows.length} row${rows.length === 1 ? '' : 's'}`;

  let html = '<table class="sp-table"><thead><tr>' + SS_COLS.map(c => `<th>${c[0]}</th>`).join('') + '</tr></thead><tbody>';
  html += rows.map(r => '<tr>' + SS_COLS.map(c => `<td>${ssFmt(r[c[1]])}</td>`).join('') + '</tr>').join('');
  html += '</tbody></table>';
  host.innerHTML = html;
}

async function runSheetSyncFilter(){
  const branch = document.getElementById('ssfBranch').value;
  const staff  = document.getElementById('ssfStaff').value.trim();
  const from   = document.getElementById('ssfFrom').value;
  const to     = document.getElementById('ssfTo').value;

  const host = document.getElementById('ssTableHost');
  host.innerHTML = '<div style="padding:16px;font-size:12px;color:var(--muted2)">Loading…</div>';

  const buildQuery = () => {
    let q = sb.from(SS_TABLE).select('*').order('date',{ascending:false}).order('branch').order('staff_name');
    if (branch) q = q.eq('branch', branch);
    if (from)   q = q.gte('date', from);
    if (to)     q = q.lte('date', to);
    if (staff)  q = q.ilike('staff_name', `%${staff}%`);
    return q;
  };

  let all = [];
  let offset = 0;
  while (true){
    const { data, error } = await buildQuery().range(offset, offset + SS_PAGE_SIZE - 1);
    if (error){ host.innerHTML = `<div style="padding:16px;font-size:12px;color:var(--bad)">Query failed: ${error.message}</div>`; return; }
    all = all.concat(data);
    if (data.length < SS_PAGE_SIZE || all.length >= SS_ROW_LIMIT) break;
    offset += SS_PAGE_SIZE;
  }

  ssCapWarning = all.length >= SS_ROW_LIMIT;
  ssRenderTable(all.slice(0, SS_ROW_LIMIT));
}

// ── INIT ──────────────────────────────────────────────────────
let ssFilterAutoRun = false;
function initSheetSyncTab(){
  ssPopulateFilterBranch();
  ssSetDefaultFilterDates(false);
  refreshSheetSyncStatus();
  if (!ssFilterAutoRun){
    ssFilterAutoRun = true;
    runSheetSyncFilter();
  }
}
