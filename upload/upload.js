const PASS     = 'AbuDhabi2026@';
const SUPA_URL = 'https://gvijxenafoowajqktqvd.supabase.co';
const SUPA_KEY = 'sb_publishable_e5o0vPayb-6552oARTeu7Q_KoqfT7xO';
const sb = supabase.createClient(SUPA_URL, SUPA_KEY);

const BRANCHES = {
  KCA:{ name:'Khalifa City', sub:'KCA',         color:'#FFD4D9' },
  SAA:{ name:'Saadiyat',     sub:'SAA',         color:'#C4B5FD' },
  MC: { name:'Motor City',   sub:'MC',          color:'#99F6E4' },
  AQ: { name:'AQ Ladies',    sub:'Al Quoz',     color:'#FF9B9B' },
  FRT:{ name:'Fratelli',     sub:'Barber Shop', color:'#EEF3C7' },
};
const BRANCH_KEYS = Object.keys(BRANCHES);
const BRANCH_DETECT = {
  KCA:['kca','khalifa'], SAA:['saa','saadiyat'], MC:['mc','motor'], AQ:['aq','ladies','quoz'], FRT:['frt','fratelli','barber'],
};
const DAY_SHEETS = ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'];
const MONTH_ORDER = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

let allData = [];
const openState = {};
const fileSlots = {};
const fileSlotsDaily = {};
BRANCH_KEYS.forEach(k => { fileSlots[k] = []; fileSlotsDaily[k] = null; });

// existing records cache per branch
let existingWeekly = {}; // branch -> Set of week_labels
let existingDaily  = {}; // branch -> Set of dates

// ── THEME ──
function toggleTheme() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', dark ? 'light' : 'dark');
  document.getElementById('themeLbl').textContent = dark ? 'Light' : 'Dark';
}
function togglePwVis() {
  const inp = document.getElementById('pwInput'), eye = document.getElementById('pwEye');
  const h = inp.type === 'password';
  inp.type = h ? 'text' : 'password';
  eye.textContent = h ? '🙈' : '👁️';
}

// ── TAB ──
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach((b,i) => b.classList.toggle('active', (tab==='weekly'&&i===0)||(tab==='daily'&&i===1)));
  document.getElementById('tab-weekly').classList.toggle('active', tab==='weekly');
  document.getElementById('tab-daily').classList.toggle('active', tab==='daily');
  if (tab==='daily') loadDailyOverview();
}

// ── AUTH ──
window.addEventListener('DOMContentLoaded', () => {
  if (sessionStorage.getItem('tr_auth') === '1') showPortal();
  buildFileSlots();
  buildFileSlotsDaily();
});

function login() {
  if (document.getElementById('pwInput').value === PASS) {
    sessionStorage.setItem('tr_auth','1'); showPortal();
  } else { document.getElementById('loginErr').textContent = 'Incorrect password.'; }
}
function showPortal() {
  document.getElementById('loginSection').style.display = 'none';
  document.getElementById('portalSection').style.display = 'block';
  document.getElementById('logoutBtn').style.display = 'inline-block';
  loadData();
}
function logout() {
  sessionStorage.removeItem('tr_auth');
  document.getElementById('portalSection').style.display = 'none';
  document.getElementById('loginSection').style.display = 'block';
  document.getElementById('logoutBtn').style.display = 'none';
  document.getElementById('pwInput').value = '';
}

// ── FILE SLOTS ──
function slotHTML(code, mode) {
  const info = BRANCHES[code];
  const pre = mode === 'daily' ? 'd' : '';
  return `
    <div class="file-slot" id="${pre}slot_${code}" onclick="${mode==='daily'?'dSlotClick':'slotClick'}('${code}')">
      <div class="slot-accent" style="background:${info.color}"></div>
      <div class="slot-branch-name">${info.name}</div>
      <div class="slot-branch-sub">${info.sub}</div>
      <div class="slot-drop-area" id="${pre}slotDrop_${code}">
        <span class="slot-icon">📊</span>
        <div class="slot-hint">Click or drag & drop<br>.xlsx file here</div>
      </div>
      <button class="slot-clear" id="${pre}slotClear_${code}" style="display:none" onclick="event.stopPropagation();${mode==='daily'?'dClearSlot':'clearSlot'}('${code}')">✕</button>
      <input type="file" id="${pre}slotInput_${code}" accept=".xlsx" style="display:none" multiple
        onchange="${mode==='daily'?'dSlotFilesChosen':'slotFilesChosen'}('${code}',this.files)">
    </div>`;
}
function setupDnD(code, mode) {
  const pre = mode === 'daily' ? 'd' : '';
  const el = document.getElementById(`${pre}slot_${code}`);
  if (!el) return;
  el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('dragover'); });
  el.addEventListener('dragleave', () => el.classList.remove('dragover'));
  el.addEventListener('drop', e => {
    e.preventDefault(); el.classList.remove('dragover');
    const f = e.dataTransfer.files[0];
    if (f) mode==='daily' ? dSlotFileChosen(code,f) : slotFileChosen(code,f);
  });
}
function buildFileSlots() {
  document.getElementById('fileSlots').innerHTML = BRANCH_KEYS.map(c => slotHTML(c,'weekly')).join('');
  BRANCH_KEYS.forEach(c => setupDnD(c,'weekly'));
}
function buildFileSlotsDaily() {
  document.getElementById('fileSlotsDaily').innerHTML = BRANCH_KEYS.map(c => slotHTML(c,'daily')).join('');
  BRANCH_KEYS.forEach(c => setupDnD(c,'daily'));
}

function slotClick(code)  { document.getElementById('slotInput_'+code).click(); }
function dSlotClick(code) { document.getElementById('dslotInput_'+code).click(); }

function detectBranch(filename) {
  const lower = filename.toLowerCase();
  for (const [code, kws] of Object.entries(BRANCH_DETECT)) {
    if (kws.some(kw => lower.includes(kw))) return code;
  }
  return null;
}

function slotFilesChosen(slotCode, files) {
  if (!files || !files.length) return;
  for (const file of Array.from(files)) {
    const detected = detectBranch(file.name);
    const target = detected || slotCode;
    if (detected && detected !== slotCode) {
      addSlotFile(detected, file, true, 'weekly');
      showToast(`Auto-assigned → ${BRANCHES[detected].name}`);
    } else {
      addSlotFile(target, file, !!detected, 'weekly');
    }
  }
  checkWeeklyBtn();
}
// Keep old name as alias so drag-drop still works
function slotFileChosen(slotCode, file) { slotFilesChosen(slotCode, [file]); }
function dSlotFileChosen(slotCode, file) {
  if (!file) return;
  const detected = detectBranch(file.name);
  const target = detected || slotCode;
  if (detected && detected !== slotCode) { setSlotFile(detected, file, true, 'daily'); showToast(`Auto-assigned → ${BRANCHES[detected].name}`); }
  else setSlotFile(slotCode, file, !!detected, 'daily');
  checkDailyBtn();
}

function addSlotFile(code, file, auto, mode) {
  const pre = mode==='daily' ? 'd' : '';
  if (mode==='daily') {
    fileSlotsDaily[code] = file;
  } else {
    if (!Array.isArray(fileSlots[code])) fileSlots[code] = [];
    // Avoid duplicates by name
    if (!fileSlots[code].find(f => f.name === file.name)) fileSlots[code].push(file);
  }
  const slot = document.getElementById(`${pre}slot_${code}`);
  const drop = document.getElementById(`${pre}slotDrop_${code}`);
  const clr  = document.getElementById(`${pre}slotClear_${code}`);
  slot.classList.add('has-file');
  clr.style.display = 'block';

  let existWarn = '';
  if (mode==='daily' && existingDaily[code] && existingDaily[code].size > 0) {
    existWarn = `<div class="slot-existing">⚠️ ${existingDaily[code].size} day(s) already in system</div>`;
    slot.classList.add('has-existing');
  }

  if (mode==='weekly') {
    const count = fileSlots[code].length;
    drop.innerHTML = `
      <span class="slot-icon" style="opacity:1">✅</span>
      <div class="slot-filename">${count} file${count>1?'s':''} queued</div>
      <div style="font-size:9px;color:var(--muted2);margin-top:3px;line-height:1.4">${fileSlots[code].map(f=>'• '+f.name).join('<br>')}</div>
      <div class="slot-auto-tag ${auto?'detected':''}"></div>`;
  } else {
    drop.innerHTML = `
      <span class="slot-icon" style="opacity:1">✅</span>
      <div class="slot-filename">${file.name}</div>
      <div class="slot-auto-tag ${auto?'detected':''}"></div>
      ${existWarn}`;
  }
}
// Keep old name as alias for daily drag-drop
function setSlotFile(code, file, auto, mode) { addSlotFile(code, file, auto, mode); }

function clearSlot(code) {
  fileSlots[code] = [];
  resetSlot(code, 'weekly');
  checkWeeklyBtn();
}
function dClearSlot(code) {
  fileSlotsDaily[code] = null;
  resetSlot(code, 'daily');
  checkDailyBtn();
}
function resetSlot(code, mode) {
  const pre = mode==='daily' ? 'd' : '';
  const slot = document.getElementById(`${pre}slot_${code}`);
  const drop = document.getElementById(`${pre}slotDrop_${code}`);
  const clr  = document.getElementById(`${pre}slotClear_${code}`);
  slot.classList.remove('has-file','has-existing','dragover');
  clr.style.display = 'none';
  drop.innerHTML = `<span class="slot-icon">📊</span><div class="slot-hint">Click or drag & drop<br>.xlsx file here</div>`;
  const inp = document.getElementById(`${pre}slotInput_${code}`);
  if (inp) inp.value = '';
}

function checkWeeklyBtn() {
  const hasFile = BRANCH_KEYS.some(k => Array.isArray(fileSlots[k]) ? fileSlots[k].length > 0 : !!fileSlots[k]);
  const hasLabel = document.getElementById('weekLabel').value.trim().length > 0;
  document.getElementById('uploadWeeklyBtn').disabled = !(hasFile && hasLabel);
}
function checkDailyBtn() {
  document.getElementById('uploadDailyBtn').disabled = !BRANCH_KEYS.some(k => fileSlotsDaily[k]);
}

// ── XLSX PARSER: DAILY ──
async function parseXLSXDaily(file, branchCode) {
  const ab = await file.arrayBuffer();
  // Read WITHOUT cellDates — get raw serial numbers, handle dates ourselves
  const wb = XLSX.read(ab, { type:'array', cellDates:false });
  const results = [];

  // Convert Excel serial to YYYY-MM-DD (accounts for Excel 1900 leap year bug)
  function serialToDate(serial) {
    if (!serial || typeof serial !== 'number') return null;
    // Excel serial: days since Jan 1, 1900 (with +1 correction for leap year bug)
    const ms = (serial - 25569) * 86400 * 1000; // correct Excel serial to Unix
    const d = new Date(ms);
    const yr = d.getUTCFullYear();
    const mo = String(d.getUTCMonth()+1).padStart(2,'0');
    const dy = String(d.getUTCDate()).padStart(2,'0');
    return `${yr}-${mo}-${dy}`;
  }

  for (const sheetName of wb.SheetNames) {
    const upper = sheetName.toUpperCase();
    if (!DAY_SHEETS.includes(upper)) continue;
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:null });

    // Get date from A1
    let date = null;
    const cell0 = rows[0] && rows[0][0];
    if (typeof cell0 === 'number') {
      date = serialToDate(cell0);
    } else if (typeof cell0 === 'string' && cell0.includes('/')) {
      const p = cell0.split('/');
      if (p.length === 3) date = `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
    } else if (typeof cell0 === 'string' && cell0.match(/\d{4}-\d{2}-\d{2}/)) {
      date = cell0.slice(0,10);
    }
    if (!date) continue;

    // Find summary w/o Tax
    let summaryRow=-1;
    for (let i=0;i<rows.length;i++){
      if(rows[i]&&rows[i][0]&&String(rows[i][0]).includes('w/o Tax')){summaryRow=i;break;}
    }
    if (summaryRow===-1) continue;

    const g=(r,c)=>{const row=rows[summaryRow+r];return row?(parseFloat(row[c])||0):0;};
    results.push({
      branch:branchCode, date, day_of_week:upper,
      hair_sales:g(2,3), retail_total:g(3,3), treatments_total:g(4,3),
      beauty_sales:g(5,3), beauty_retail:g(6,3), total:g(8,3),
      hair_clients_request:g(11,1), hair_clients_salon:g(12,1),
      hair_new:g(13,1), hair_ncr:g(14,1), hair_rebooked:g(15,1),
      beauty_request:g(11,3), beauty_salon:g(12,3),
      beauty_new:g(13,3), beauty_rebooked:g(15,3),
      new_clients:g(12,6), col_units:g(2,7), ker_units:g(3,7), ext_units:0,
    });
  }
  return results;
}

// ── UPLOAD WEEKLY ──
async function uploadAllWeekly() {
  const weekLabel = document.getElementById('weekLabel').value.trim();
  if (!weekLabel) { alert('Please enter a week label.'); return; }
  const toUpload = BRANCH_KEYS.filter(k => Array.isArray(fileSlots[k]) ? fileSlots[k].length > 0 : !!fileSlots[k]);
  if (!toUpload.length) { alert('Please add at least one XLSX file.'); return; }
  document.getElementById('uploadWeeklyBtn').disabled = true;
  document.getElementById('uploadWeeklyBtn').textContent = 'Uploading...';
  const prog = document.getElementById('uploadProgress');
  prog.style.display = 'block';
  prog.innerHTML = toUpload.map(code=>`
    <div class="prog-row">
      <span class="prog-branch">${BRANCHES[code].name}</span>
      <div class="prog-bar-track"><div class="prog-bar-fill" id="pb_${code}" style="background:${BRANCHES[code].color}"></div></div>
      <span class="prog-status pending" id="ps_${code}">Waiting…</span>
    </div>`).join('');
  let allOk=true;
  for (const code of toUpload) {
    document.getElementById('ps_'+code).textContent='Parsing…';
    document.getElementById('ps_'+code).className='prog-status loading';
    document.getElementById('pb_'+code).style.width='30%';
    try {
      const files = Array.isArray(fileSlots[code]) ? fileSlots[code] : [fileSlots[code]];
      // Upload each file in this slot as a separate weekly entry
      for (const singleFile of files) {
      const data = await parseXLSXWeekly(singleFile);
      document.getElementById('pb_'+code).style.width='60%';

      // ── RETAIL AUDIT BADGE ─────────────────────────────────
      // Surface where retail came from + flag mismatches before insert.
      const rd = data.summary && data.summary._retailDebug;
      if (rd) {
        const retailVal = data.summary.hairRetail || 0;
        let badge = '';
        if (retailVal === 0) {
          badge = `<div style="margin-top:4px;padding:6px 8px;background:rgba(239,68,68,.15);border-left:3px solid #ef4444;border-radius:4px;font-size:11px;color:#fca5a5">⚠️ <strong>${BRANCHES[code].name}:</strong> No retail detected (source: ${rd.source}). Check spreadsheet labels.</div>`;
        } else if (rd.mismatch) {
          const m = rd.mismatch;
          badge = `<div style="margin-top:4px;padding:6px 8px;background:rgba(251,191,36,.12);border-left:3px solid #fbbf24;border-radius:4px;font-size:11px;color:#fcd34d">⚠️ <strong>${BRANCHES[code].name}:</strong> Retail mismatch — daily AED ${m.daily.toLocaleString()} vs summary AED ${m.summary.toLocaleString()} (${m.pctDiff}% drift). Using daily total.</div>`;
        } else {
          badge = `<div style="margin-top:4px;padding:4px 8px;font-size:10px;color:var(--muted)">Retail: AED ${retailVal.toLocaleString()} (source: ${rd.source}, ${rd.daysWithRetail}/${rd.daysScanned} days)</div>`;
        }
        const psEl = document.getElementById('ps_'+code);
        if (psEl && psEl.parentElement) {
          // Append after the prog-row
          const audit = document.createElement('div');
          audit.id = 'audit_'+code;
          audit.innerHTML = badge;
          // Remove prior audit if re-uploading
          const prior = document.getElementById('audit_'+code);
          if (prior) prior.remove();
          psEl.parentElement.insertAdjacentElement('afterend', audit);
        }
      }

      await sb.from('weekly_data').delete().eq('branch',code).eq('week_label',weekLabel);
const {error} = await sb.from('weekly_data').insert({branch:code,week_label:weekLabel,data});
      if (error) throw error;
      document.getElementById('pb_'+code).style.width='100%';
      } // end files loop
      document.getElementById('ps_'+code).textContent=`✅ Done (${files.length} file${files.length>1?'s':''})`;
      document.getElementById('ps_'+code).className='prog-status ok';
    } catch(e) {
      document.getElementById('pb_'+code).style.width='100%';
      document.getElementById('pb_'+code).style.background='var(--bad)';
      document.getElementById('ps_'+code).textContent='❌ Failed';
      document.getElementById('ps_'+code).className='prog-status err';
      console.error(code,e); allOk=false;
    }
  }
  if (allOk) {
    showToast('✅ All weekly files uploaded!');
    document.getElementById('weekLabel').value='';
    BRANCH_KEYS.forEach(k=>{if(Array.isArray(fileSlots[k])?fileSlots[k].length:fileSlots[k])clearSlot(k);});
    // Hide faster if no audit warnings, slower if there are warnings to read
    const hasWarnings = document.querySelectorAll('[id^="audit_"]').length > 0;
    const hideDelay = hasWarnings ? 12000 : 2000;
    setTimeout(()=>{prog.style.display='none';prog.innerHTML='';},hideDelay);
  }
  document.getElementById('uploadWeeklyBtn').disabled=false;
  document.getElementById('uploadWeeklyBtn').textContent='Upload All';
  await loadData();
}

// ── UPLOAD DAILY ──
async function uploadAllDaily() {
  const toUpload = BRANCH_KEYS.filter(k => fileSlotsDaily[k]);
  if (!toUpload.length) { alert('Please add at least one XLSX file.'); return; }
  const btn = document.getElementById('uploadDailyBtn');
  btn.disabled=true; btn.textContent='Uploading...';
  const prog = document.getElementById('uploadProgressDaily');
  prog.style.display='block';
  prog.innerHTML = toUpload.map(code=>`
    <div class="prog-row">
      <span class="prog-branch">${BRANCHES[code].name}</span>
      <div class="prog-bar-track"><div class="prog-bar-fill" id="dpb_${code}" style="background:${BRANCHES[code].color}"></div></div>
      <span class="prog-status pending" id="dps_${code}">Waiting…</span>
    </div>`).join('');
  let allOk=true;
  for (const code of toUpload) {
    document.getElementById('dps_'+code).textContent='Parsing…';
    document.getElementById('dps_'+code).className='prog-status loading';
    document.getElementById('dpb_'+code).style.width='20%';
    try {
      const dailyRows = await parseXLSXDaily(fileSlotsDaily[code], code);
      if (!dailyRows.length) throw new Error('No daily sheets found');
      document.getElementById('dpb_'+code).style.width='50%';
      document.getElementById('dps_'+code).textContent=`Uploading ${dailyRows.length} days…`;
      // Delete existing for same branch + dates (overwrite)
      const dates = dailyRows.map(r=>r.date);
      await sb.from('daily_data').delete().eq('branch',code).in('date',dates);
      const {error} = await sb.from('daily_data').insert(dailyRows);
      if (error) throw error;
      document.getElementById('dpb_'+code).style.width='100%';
      document.getElementById('dps_'+code).textContent=`✅ ${dailyRows.length} days`;
      document.getElementById('dps_'+code).className='prog-status ok';
    } catch(e) {
      document.getElementById('dpb_'+code).style.width='100%';
      document.getElementById('dpb_'+code).style.background='var(--bad)';
      document.getElementById('dps_'+code).textContent='❌ Failed';
      document.getElementById('dps_'+code).className='prog-status err';
      console.error(code,e); allOk=false;
    }
  }
  if (allOk) {
    showToast('✅ All daily data uploaded!');
    BRANCH_KEYS.forEach(k=>{if(fileSlotsDaily[k])dClearSlot(k);});
    setTimeout(()=>{prog.style.display='none';prog.innerHTML='';},2000);
  }
  btn.disabled=false; btn.textContent='Upload All Daily Data';
  await loadDailyOverview();
}

// ── LOAD DATA ──
async function loadData() {
  const {data,error} = await sb.from('weekly_data').select('id,branch,week_label,uploaded_at').order('uploaded_at',{ascending:false});
  allData = (error||!data) ? [] : data;
  existingWeekly = {};
  BRANCH_KEYS.forEach(k => existingWeekly[k] = new Set());
  allData.forEach(d => existingWeekly[d.branch]?.add(d.week_label));
  renderBulkRename();
  renderColumns(); // openState is preserved — only undefined keys default to false
}

async function loadDailyOverview() {
  const {data,error} = await sb.from('daily_data')
    .select('id,branch,date,day_of_week,total,hair_sales,beauty_sales')
    .order('date',{ascending:false});

  existingDaily = {};
  BRANCH_KEYS.forEach(k => existingDaily[k] = new Set());
  if (data) data.forEach(d => existingDaily[d.branch]?.add(d.date));

  const container = document.getElementById('dailyOverview');
  if (error||!data||!data.length) {
    container.innerHTML='<div style="font-size:12px;color:var(--muted2);padding:8px 0">No daily data uploaded yet.</div>';
    return;
  }

  // Group by branch → year → month → week
  const byBranch={};
  data.forEach(d=>{
    if(!byBranch[d.branch])byBranch[d.branch]=[];
    byBranch[d.branch].push(d);
  });

  // Get Monday of week for a date string
  function getMondayOf(dateStr) {
    const d = new Date(dateStr+'T00:00:00Z');
    const day = d.getUTCDay(); // 0=Sun,1=Mon...6=Sat
    const diff = day === 0 ? -6 : 1 - day; // adjust to Monday
    const mon = new Date(d);
    mon.setUTCDate(d.getUTCDate() + diff);
    return mon.toISOString().split('T')[0];
  }
  function getSundayOf(mondayStr) {
    const d = new Date(mondayStr+'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 6);
    return d.toISOString().split('T')[0];
  }
  function fmtShort(dateStr) {
    const d = new Date(dateStr+'T00:00:00Z');
    return d.toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'});
  }

  const MONTHS_FULL=['January','February','March','April','May','June','July','August','September','October','November','December'];

  container.innerHTML=`<div class="daily-grid">${
    BRANCH_KEYS.filter(k=>byBranch[k]).map(k=>{
      const rows=byBranch[k];
      const grandTotal=rows.reduce((s,r)=>s+(r.total||0),0);

      // Build year→month→week structure
      const byYear={};
      rows.forEach(r=>{
        const d=new Date(r.date+'T00:00:00Z');
        const yr=d.getUTCFullYear();
        const mo=d.getUTCMonth(); // 0-11
        const wk=getMondayOf(r.date);
        if(!byYear[yr])byYear[yr]={};
        if(!byYear[yr][mo])byYear[yr][mo]={};
        if(!byYear[yr][mo][wk])byYear[yr][mo][wk]=[];
        byYear[yr][mo][wk].push(r);
      });

      const years=Object.keys(byYear).sort((a,b)=>b-a);
      const DAY_ORDER=['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'];

      return `
        <div class="daily-branch-card" id="card_${k}">
          <div class="daily-branch-name">${BRANCHES[k].name}</div>
          <div class="daily-accent" style="background:${BRANCHES[k].color}"></div>
          <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:8px;align-items:center">
            <span style="color:var(--muted)">${rows.length} days total</span>
            <span style="color:var(--good);font-weight:700">AED ${Math.round(grandTotal).toLocaleString()}</span>
          </div>
          <!-- BULK DELETE BAR -->
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
            <input type="checkbox" id="selAll_${k}" onchange="toggleSelectAll('${k}',this.checked)" title="Select all">
            <span style="font-size:10px;color:var(--muted);letter-spacing:0.06em;text-transform:uppercase">Select All</span>
            <button class="bulk-delete-btn" id="bulkDel_${k}" style="display:none;margin-left:auto" onclick="bulkDeleteBranch('${k}')">🗑 Delete Selected</button>
          </div>
          <!-- YEAR → MONTH → WEEK TREE -->
          <div style="max-height:380px;overflow-y:auto">
            ${years.map(yr=>{
              const yrRows=Object.values(byYear[yr]).flatMap(m=>Object.values(m).flat());
              const yrTotal=yrRows.reduce((s,r)=>s+(r.total||0),0);
              const yrIds=yrRows.map(r=>r.id);
              const yrKey=`dy_${k}_${yr}`;
              return `
                <div style="margin-bottom:6px">
                  <div style="display:flex;align-items:center;gap:4px">
                    <div onclick="toggleDailySection('${yrKey}')" style="flex:1;display:flex;justify-content:space-between;align-items:center;padding:5px 8px;background:var(--surface);border-radius:7px;cursor:pointer;font-size:11px;font-weight:700;color:var(--text);border:1px solid var(--border2)">
                      <span>${yr}</span>
                      <span style="color:var(--good);font-size:10px">AED ${Math.round(yrTotal).toLocaleString()}</span>
                    </div>
                    <button class="btn-danger" style="padding:3px 7px;font-size:10px;flex-shrink:0" title="Delete entire year" onclick="deleteGroup(${JSON.stringify(yrIds)},'${yr} (${yrRows.length} days)')">🗑</button>
                  </div>
                  <div id="${yrKey}" style="display:none;margin-left:8px;margin-top:4px">
                    ${Object.keys(byYear[yr]).sort((a,b)=>b-a).map(mo=>{
                      const moRows=Object.values(byYear[yr][mo]).flat();
                      const moTotal=moRows.reduce((s,r)=>s+(r.total||0),0);
                      const moIds=moRows.map(r=>r.id);
                      const moKey=`dy_${k}_${yr}_${mo}`;
                      return `
                        <div style="margin-bottom:4px">
                          <div style="display:flex;align-items:center;gap:4px">
                            <div onclick="toggleDailySection('${moKey}')" style="flex:1;display:flex;justify-content:space-between;align-items:center;padding:4px 8px;background:var(--surface2);border-radius:6px;cursor:pointer;font-size:11px;color:var(--muted);border:1px solid var(--border2)">
                              <span style="font-weight:600">${MONTHS_FULL[parseInt(mo)]}</span>
                              <span style="color:var(--good);font-size:10px">AED ${Math.round(moTotal).toLocaleString()} · ${moRows.length}d</span>
                            </div>
                            <button class="btn-danger" style="padding:3px 7px;font-size:10px;flex-shrink:0" title="Delete entire month" onclick="deleteGroup(${JSON.stringify(moIds)},'${MONTHS_FULL[parseInt(mo)]} ${yr} (${moRows.length} days)')">🗑</button>
                          </div>
                          <div id="${moKey}" style="display:none;margin-left:8px;margin-top:2px">
                            ${Object.keys(byYear[yr][mo]).sort((a,b)=>b.localeCompare(a)).map(wk=>{
                              const wkRows=byYear[yr][mo][wk];
                              const wkTotal=wkRows.reduce((s,r)=>s+(r.total||0),0);
                              const wkIds=wkRows.map(r=>r.id);
                              const sun=getSundayOf(wk);
                              const wkKey=`dy_${k}_${yr}_${mo}_${wk}`;
                              const sorted=[...wkRows].sort((a,b)=>DAY_ORDER.indexOf(a.day_of_week)-DAY_ORDER.indexOf(b.day_of_week));
                              return `
                                <div style="margin-bottom:3px">
                                  <div style="display:flex;align-items:center;gap:4px">
                                    <div onclick="toggleDailySection('${wkKey}')" style="flex:1;display:flex;justify-content:space-between;align-items:center;padding:3px 8px;border-radius:5px;cursor:pointer;font-size:10px;color:var(--muted2);border-bottom:1px solid var(--border2)">
                                      <span>Week: ${fmtShort(wk)} – ${fmtShort(sun)}</span>
                                      <span style="color:var(--good)">AED ${Math.round(wkTotal).toLocaleString()} · ${wkRows.length}d</span>
                                    </div>
                                    <button class="btn-danger" style="padding:3px 7px;font-size:10px;flex-shrink:0" title="Delete entire week" onclick="deleteGroup(${JSON.stringify(wkIds)},'week ${fmtShort(wk)}–${fmtShort(sun)} (${wkRows.length} days)')">🗑</button>
                                  </div>
                                  <div id="${wkKey}" style="display:none">
                                    ${sorted.map(r=>`
                                      <div class="daily-record" id="rec_${r.id}">
                                        <input type="checkbox" class="rec-cb cb_${k}" data-id="${r.id}" onchange="onRecordCheck('${k}')">
                                        <div style="flex:1;min-width:0">
                                          <div class="daily-record-date">${r.date}</div>
                                          <div class="daily-record-day">${r.day_of_week}</div>
                                        </div>
                                        <div class="daily-record-total" style="font-size:10px">AED ${Math.round(r.total||0).toLocaleString()}</div>
                                        <div class="daily-record-actions">
                                          <button class="btn-dl" onclick="downloadDailyRecord('${r.id}','${r.branch}','${r.date}')" title="Download">↓</button>
                                          <button class="btn-danger" onclick="deleteDailyRecord('${r.id}','${r.date}')" title="Delete">✕</button>
                                        </div>
                                      </div>`).join('')}
                                  </div>
                                </div>`;
                            }).join('')}
                          </div>
                        </div>`;
                    }).join('')}
                  </div>
                </div>`;
            }).join('')}
          </div>
        </div>`;
    }).join('')
  }</div>`;
}

function toggleDailySection(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function toggleSelectAll(branchCode, checked) {
  document.querySelectorAll(`.cb_${branchCode}`).forEach(cb => cb.checked = checked);
  onRecordCheck(branchCode);
}

function onRecordCheck(branchCode) {
  const checked = [...document.querySelectorAll(`.cb_${branchCode}`)].filter(cb => cb.checked);
  const btn = document.getElementById(`bulkDel_${branchCode}`);
  const selAll = document.getElementById(`selAll_${branchCode}`);
  const all = document.querySelectorAll(`.cb_${branchCode}`).length;
  if (btn) {
    btn.style.display = checked.length > 0 ? 'inline-block' : 'none';
    btn.textContent = `🗑 Delete ${checked.length}`;
  }
  if (selAll) selAll.indeterminate = checked.length > 0 && checked.length < all;
}

async function bulkDeleteBranch(branchCode) {
  const checked = [...document.querySelectorAll(`.cb_${branchCode}:checked`)];
  if (!checked.length) return;
  const ids = checked.map(cb => cb.dataset.id);
  openModal({
    title: `Delete ${ids.length} Records?`,
    sub: `This will permanently delete ${ids.length} daily record(s) for ${BRANCHES[branchCode].name}. Cannot be undone.`,
    confirmText: `🗑 Delete ${ids.length} Records`,
    danger: true,
    onConfirm: async () => {
      closeModal();
      // Delete in batches of 50
      for (let i=0; i<ids.length; i+=50) {
        await sb.from('daily_data').delete().in('id', ids.slice(i,i+50));
      }
      showToast(`🗑 ${ids.length} records deleted`);
      await loadDailyOverview();
    }
  });
}

// ── DELETE / DOWNLOAD ──
async function deleteGroup(ids, label) {
  openModal({
    title: `Delete ${label}?`,
    sub: `This will permanently delete all ${ids.length} records. Cannot be undone.`,
    confirmText: `🗑 Delete All`,
    danger: true,
    onConfirm: async () => {
      closeModal();
      for (let i=0; i<ids.length; i+=50) {
        await sb.from('daily_data').delete().in('id', ids.slice(i,i+50));
      }
      showToast(`🗑 ${ids.length} records deleted`);
      await loadDailyOverview();
    }
  });
}

async function deleteDailyRecord(id, date) {
  openModal({
    title: 'Delete Daily Record?',
    sub: `This will permanently delete the record for ${date}. This cannot be undone.`,
    confirmText: '🗑 Delete',
    danger: true,
    onConfirm: async () => {
      closeModal();
      await sb.from('daily_data').delete().eq('id',id);
      showToast('🗑 Record deleted');
      await loadDailyOverview();
    }
  });
}

async function downloadDailyRecord(id, branch, date) {
  const {data,error} = await sb.from('daily_data').select('*').eq('id',id).single();
  if (error||!data) { showToast('❌ Download failed'); return; }
  const rows=[
    ['Branch','Date','Day','Hair Sales','Retail','Treatments','Beauty Sales','Beauty Retail','Total','Hair Req','Hair Salon','Hair New','Hair NCR','Hair Rebooked','Beauty Req','Beauty Salon','Beauty New','Beauty Rebooked','New Clients','COL Units','KER Units'],
    [data.branch,data.date,data.day_of_week,data.hair_sales,data.retail_total,data.treatments_total,data.beauty_sales,data.beauty_retail,data.total,data.hair_clients_request,data.hair_clients_salon,data.hair_new,data.hair_ncr,data.hair_rebooked,data.beauty_request,data.beauty_salon,data.beauty_new,data.beauty_rebooked,data.new_clients,data.col_units,data.ker_units]
  ];
  const csv=rows.map(r=>r.join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=`${branch}_${date}.csv`; a.click();
  URL.revokeObjectURL(url);
  showToast('✅ Downloaded!');
}

async function deleteWeek(id) {
  openModal({
    title: 'Delete Weekly Entry?',
    sub: 'This will permanently delete this weekly upload. Cannot be undone.',
    confirmText: '🗑 Delete',
    danger: true,
    onConfirm: async () => {
      closeModal();
      await sb.from('weekly_data').delete().eq('id',id);
      showToast('🗑 Entry deleted');
      await loadData();
    }
  });
}

async function downloadWeekly(id, branch, label) {
  const {data,error} = await sb.from('weekly_data').select('*').eq('id',id).single();
  if (error||!data) { showToast('❌ Download failed'); return; }
  const json = JSON.stringify(data.data, null, 2);
  const blob = new Blob([json], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download=`${branch}_${label.replace(/[^a-z0-9]/gi,'_')}.json`; a.click();
  URL.revokeObjectURL(url);
  showToast('✅ Downloaded!');
}

// ── BULK RENAME ──
function renderBulkRename() {
  const labelMap={};
  allData.forEach(d=>{if(!labelMap[d.week_label])labelMap[d.week_label]=[];labelMap[d.week_label].push({id:d.id,branch:d.branch});});
  const sorted=Object.keys(labelMap).sort((a,b)=>{
    const aL=Math.max(...labelMap[a].map(r=>new Date(allData.find(d=>d.id===r.id)?.uploaded_at||0)));
    const bL=Math.max(...labelMap[b].map(r=>new Date(allData.find(d=>d.id===r.id)?.uploaded_at||0)));
    return bL-aL;
  });
  const container=document.getElementById('bulkWeekList');
  if(!sorted.length){container.innerHTML='<div style="font-size:12px;color:var(--muted2);padding:12px 0">No data uploaded yet.</div>';return;}
  container.innerHTML=sorted.map(lbl=>{
    const rows=labelMap[lbl];
    const names=rows.map(r=>BRANCHES[r.branch]?.name||r.branch).join(', ');
    const safeId='bwr_'+btoa(encodeURIComponent(lbl)).replace(/[^a-zA-Z0-9]/g,'').slice(0,16);
    const safeVal=lbl.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
    return `
      <div class="bulk-week-row" id="${safeId}">
        <div style="flex:1;min-width:0">
          <div class="bulk-week-label" id="blbl_${safeId}">${lbl}</div>
          <div class="bulk-week-count">${rows.length} branch${rows.length>1?'es':''}: ${names}</div>
          <div class="bulk-inline-edit" id="bedit_${safeId}">
            <input type="text" value="${safeVal}" id="binp_${safeId}" onkeydown="if(event.key==='Escape')cancelBulkEdit('${safeId}')">
            <button class="bulk-save-btn" onclick="requestBulkSave('${safeId}')">💾 Save All</button>
            <button class="bulk-cancel-btn" onclick="cancelBulkEdit('${safeId}')">Cancel</button>
          </div>
        </div>
        <button class="bulk-edit-btn" id="bebtn_${safeId}" onclick="startBulkEdit('${safeId}')">✏️ Rename</button>
      </div>`;
  }).join('');
  window._bulkLabelMap=labelMap;
}
function startBulkEdit(id){document.getElementById('bedit_'+id).style.display='flex';document.getElementById('bebtn_'+id).style.display='none';document.getElementById('binp_'+id).focus();document.getElementById('binp_'+id).select();}
function cancelBulkEdit(id){document.getElementById('bedit_'+id).style.display='none';document.getElementById('bebtn_'+id).style.display='inline-block';}
function requestBulkSave(safeId){
  const newVal=document.getElementById('binp_'+safeId).value.trim();
  const oldVal=document.getElementById('blbl_'+safeId).textContent.trim();
  if(!newVal||newVal===oldVal){cancelBulkEdit(safeId);return;}
  const rows=window._bulkLabelMap[oldVal]||[];
  const names=rows.map(r=>BRANCHES[r.branch]?.name||r.branch).join(', ');
  openModal({
    title:'Rename Across All Branches?',
    sub:'This will update the week label for all branches listed below.',
    showChange:true, from:oldVal, to:newVal, branches:'📍 Affects: '+names,
    confirmText:'💾 Save All',
    onConfirm:async()=>{
      closeModal();
      const {error}=await sb.from('weekly_data').update({week_label:newVal}).in('id',rows.map(r=>r.id));
      if(error){alert('Save failed: '+error.message);return;}
      showToast(`✅ Renamed across ${rows.length} branch${rows.length>1?'es':''}!`);
      await loadData();
    }
  });
}

// ── COLUMNS ──
function renderColumns() {
  const grid=document.getElementById('branchesGrid');
  grid.innerHTML=Object.entries(BRANCHES).map(([code,info])=>{
    const rows=allData.filter(d=>d.branch===code);
    const byYear={};
    rows.forEach(d=>{
      const yr=extractYear(d.week_label,d.uploaded_at);
      const mo=extractMonth(d.week_label,d.uploaded_at);
      if(!byYear[yr])byYear[yr]={};
      if(!byYear[yr][mo])byYear[yr][mo]=[];
      byYear[yr][mo].push(d);
    });
    // Sort each month's entries newest first by uploaded_at
    Object.keys(byYear).forEach(yr=>{
      Object.keys(byYear[yr]).forEach(mo=>{
        byYear[yr][mo].sort((a,b)=>new Date(b.uploaded_at)-new Date(a.uploaded_at));
      });
    });
    const years=Object.keys(byYear).sort((a,b)=>b-a);
    return `
      <div class="branch-col">
        <div class="branch-col-header">
          <div class="branch-col-name">${info.name}</div>
          <div class="branch-col-sub">${info.sub}</div>
          <div class="branch-col-accent" style="background:${info.color}"></div>
          <div style="display:flex;align-items:center;gap:8px;margin-top:8px">
            <input type="checkbox" id="wSelAll_${code}" onchange="toggleWeekSelectAll('${code}',this.checked)" title="Select all" style="width:13px;height:13px;accent-color:var(--accent);cursor:pointer">
            <label for="wSelAll_${code}" style="font-size:10px;color:var(--muted);cursor:pointer;letter-spacing:0.08em;text-transform:uppercase">Select All</label>
            <button class="bulk-delete-btn" id="wBulkDel_${code}" style="display:none;margin-left:auto" onclick="bulkDeleteWeekly('${code}')">🗑 Delete Selected</button>
          </div>
        </div>
        <div class="branch-col-body">
          ${rows.length===0?'<div class="empty-col">No uploads yet</div>':
            years.map(yr=>{
              const yrKey=code+'_'+yr;
              if(openState[yrKey]===undefined)openState[yrKey]=false;
              const yrOpen=openState[yrKey];
              const moKeys=Object.keys(byYear[yr]).sort((a,b)=>MONTH_ORDER.indexOf(b)-MONTH_ORDER.indexOf(a));
              return `<div class="year-section">
                <div class="year-toggle" onclick="toggleSection('${yrKey}')"><span>${yr}</span><span class="year-arrow ${yrOpen?'open':''}">▼</span></div>
                <div id="ys_${yrKey}" style="display:${yrOpen?'block':'none'}">
                  ${moKeys.map(mo=>{
                    const moKey=yrKey+'_'+mo;
                    if(openState[moKey]===undefined)openState[moKey]=false;
                    const moOpen=openState[moKey];
                    const moRows=byYear[yr][mo];
                    return `<div class="month-section">
                      <div class="month-toggle" onclick="toggleSection('${moKey}')">
                        <span>${mo}<span class="month-count">(${moRows.length})</span></span>
                        <span class="month-arrow ${moOpen?'open':''}">▼</span>
                      </div>
                      <div id="ms_${moKey}" style="display:${moOpen?'block':'none'}">
                        <div class="weeks-list">${renderWeekGroupsHTML(code, moRows, moKey)}</div>
                      </div>
                    </div>`;
                  }).join('')}
                </div>
              </div>`;
            }).join('')}
        </div>
      </div>`;
  }).join('');
}

function extractWeekRange(label) {
  // Try to extract start date from label like "Apr 2026 Week 4 (20–26)" or "Apr 2026 Week 3 (13-19)"
  if (!label) return null;
  const rangeMatch = label.match(/\((\d{1,2})[–\-—](\d{1,2})\)/);
  const monthMatch = label.match(/(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)/i);
  const yearMatch = label.match(/20\d\d/);
  if (rangeMatch && monthMatch && yearMatch) {
    const MONTH_MAP = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
    const mo = MONTH_MAP[monthMatch[1].toLowerCase()];
    const yr = parseInt(yearMatch[0]);
    const startDay = parseInt(rangeMatch[1]);
    return new Date(Date.UTC(yr, mo, startDay));
  }
  return null;
}

function renderWeekGroupsHTML(branchCode, moRows, moKey) {
  // Group by week range derived from label
  const weekMap = {};
  moRows.forEach(w => {
    const d = extractWeekRange(w.week_label);
    // Use the label itself as the week group key if we can't parse a date
    const wkKey = d ? d.toISOString().split('T')[0] : ('label:' + w.week_label);
    if (!weekMap[wkKey]) weekMap[wkKey] = { label: w.week_label, date: d, rows: [] };
    weekMap[wkKey].rows.push(w);
  });

  const wkKeys = Object.keys(weekMap).sort((a, b) => {
    const dA = weekMap[a].date, dB = weekMap[b].date;
    if (dA && dB) return dB - dA;
    return b.localeCompare(a);
  });

  // If only 1 week group OR all are unparseable, just render flat
  if (wkKeys.length <= 1) return moRows.map(w => weekItemHTML(w)).join('');

  return wkKeys.map(wkKey => {
    const grp = weekMap[wkKey];
    const subKey = moKey + '_wk_' + wkKey.replace(/[^a-zA-Z0-9]/g,'_');
    if (openState[subKey] === undefined) openState[subKey] = false;
    const isOpen = openState[subKey];
    return `<div style="margin-bottom:3px">
      <div onclick="toggleSection('${subKey}')" style="display:flex;justify-content:space-between;align-items:center;padding:4px 8px;border-radius:6px;cursor:pointer;font-size:10px;color:var(--muted2);border-bottom:1px solid var(--border2)">
        <span style="font-weight:600">${grp.label}</span>
        <span style="display:flex;align-items:center;gap:6px">
          <span style="color:var(--muted2)">${grp.rows.length} file${grp.rows.length>1?'s':''}</span>
          <span class="month-arrow ${isOpen?'open':''}">▼</span>
        </span>
      </div>
      <div id="ys_${subKey}" style="display:${isOpen?'block':'none'};margin-left:4px">
        ${grp.rows.map(w => weekItemHTML(w)).join('')}
      </div>
    </div>`;
  }).join('');
}

function weekItemHTML(w) {
  const date=new Date(w.uploaded_at).toLocaleDateString('en-GB',{day:'numeric',month:'short'});
  return `
    <div class="week-item" id="item_${w.id}">
      <div class="week-row">
        <input type="checkbox" class="week-cb wcb_${w.branch}" data-id="${w.id}" onchange="onWeekCheck('${w.branch}')" style="width:13px;height:13px;accent-color:var(--accent);cursor:pointer;flex-shrink:0;margin-right:6px">
        <div style="flex:1"><div class="week-label-text">${w.week_label}</div><div class="week-date">${date}</div></div>
        <div class="week-actions">
          <button class="icon-btn dl" title="Download" onclick="downloadWeekly('${w.id}','${w.branch}','${w.week_label}')">↓</button>
          <button class="icon-btn del" title="Delete" onclick="deleteWeek('${w.id}')">✕</button>
        </div>
      </div>
    </div>`;
}
function toggleWeekSelectAll(branchCode, checked) {
  document.querySelectorAll(`.wcb_${branchCode}`).forEach(cb => cb.checked = checked);
  onWeekCheck(branchCode);
}
function onWeekCheck(branchCode) {
  const checked = [...document.querySelectorAll(`.wcb_${branchCode}`)].filter(cb => cb.checked);
  const btn = document.getElementById(`wBulkDel_${branchCode}`);
  const selAll = document.getElementById(`wSelAll_${branchCode}`);
  const all = document.querySelectorAll(`.wcb_${branchCode}`).length;
  if (btn) { btn.style.display = checked.length > 0 ? 'inline-block' : 'none'; btn.textContent = `🗑 Delete ${checked.length}`; }
  if (selAll) selAll.indeterminate = checked.length > 0 && checked.length < all;
}
async function bulkDeleteWeekly(branchCode) {
  const checked = [...document.querySelectorAll(`.wcb_${branchCode}:checked`)];
  if (!checked.length) return;
  const ids = checked.map(cb => cb.dataset.id);
  openModal({
    title: `Delete ${ids.length} Weekly Entries?`,
    sub: `This will permanently delete ${ids.length} weekly upload(s) for ${BRANCHES[branchCode].name}. Cannot be undone.`,
    confirmText: `🗑 Delete ${ids.length}`,
    danger: true,
    onConfirm: async () => {
      closeModal();
      for (let i=0; i<ids.length; i+=50) {
        await sb.from('weekly_data').delete().in('id', ids.slice(i,i+50));
      }
      showToast(`🗑 ${ids.length} weekly entries deleted`);
      await loadData();
    }
  });
}

function collapseAll(){
  // Set all known open states to false
  Object.keys(openState).forEach(k => openState[k] = false);
  // Directly hide ALL ys_ and ms_ elements in the DOM regardless of openState
  document.querySelectorAll('[id^="ys_"],[id^="ms_"]').forEach(el => {
    el.style.display = 'none';
  });
  // Remove all open classes from arrows
  document.querySelectorAll('.year-arrow,.month-arrow').forEach(a => a.classList.remove('open'));
}

function toggleBulkRename() {
  const body  = document.getElementById('bulkRenameBody');
  const btn   = document.getElementById('bulkRenameArrow');
  const isOpen = body.style.maxHeight !== '0px' && body.style.maxHeight !== '';
  if (isOpen) {
    body.style.maxHeight = '0';
    btn.textContent = 'Expand All ▼';
  } else {
    body.style.maxHeight = body.scrollHeight + 'px';
    btn.textContent = 'Collapse All ▲';
  }
}

function toggleSection(key){
  openState[key]=!openState[key];
  const el=document.getElementById('ys_'+key)||document.getElementById('ms_'+key);
  if(!el)return;
  el.style.display=openState[key]?'block':'none';
  const arrow=el.previousElementSibling&&el.previousElementSibling.querySelector('.year-arrow,.month-arrow');
  if(arrow)arrow.classList.toggle('open',openState[key]);
}

// ── HELPERS ──
function extractYear(label,uploaded_at){const m=label&&label.match(/20\d\d/);if(m)return m[0];return uploaded_at?new Date(uploaded_at).getFullYear().toString():'2026';}
function extractMonth(label,uploaded_at){
  if(!label)return uploaded_at?new Date(uploaded_at).toLocaleDateString('en-GB',{month:'short'}):'—';
  const u=label.toUpperCase().replace(/\s+/g,' ');
  const months={JAN:'Jan',FEB:'Feb',MAR:'Mar',APR:'Apr',MAY:'May',JUN:'Jun',JUL:'Jul',AUG:'Aug',SEP:'Sep',OCT:'Oct',NOV:'Nov',DEC:'Dec'};
  const found=u.match(/(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)/g);
  if(found)return months[found[found.length-1]];
  return uploaded_at?new Date(uploaded_at).toLocaleDateString('en-GB',{month:'short'}):'—';
} 
// ── MODAL ──
let _modalCb=null;
function openModal({title,sub,showChange,from,to,branches,confirmText,danger,onConfirm}){
  document.getElementById('modalTitle').textContent=title;
  document.getElementById('modalSub').textContent=sub;
  const chg=document.getElementById('modalChange');
  if(showChange){chg.style.display='block';document.getElementById('modalFrom').textContent=from;document.getElementById('modalTo').textContent=to;document.getElementById('modalBranches').textContent=branches||'';}
  else chg.style.display='none';
  const btn=document.getElementById('modalConfirmBtn');
  btn.textContent=confirmText||'Confirm';
  btn.className='modal-confirm'+(danger?' danger':'');
  _modalCb=onConfirm;
  btn.onclick=()=>{if(_modalCb)_modalCb();};
  document.getElementById('confirmModal').classList.add('open');
}
function closeModal(){document.getElementById('confirmModal').classList.remove('open');_modalCb=null;}
window.addEventListener('DOMContentLoaded',function(){
  document.getElementById('confirmModal').addEventListener('click',function(e){if(e.target===this)closeModal();});
});

// ── TOAST ──
function showToast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg;t.style.opacity='1';
  clearTimeout(t._h);
  t._h=setTimeout(()=>t.style.opacity='0',2500);
}
